import React, { createContext, useContext, useCallback, useEffect } from 'react';
import {
  AuthProvider as OidcAuthProvider,
  useAuth as useOidcAuth,
} from 'react-oidc-context';
import {
  DEFAULT_CLIENT_ID,
  DEFAULT_AUTHORITY,
  DEFAULT_COGNITO_DOMAIN,
  getSharedUserManager,
  createCognitoAuthRedirectUrl,
  directCognitoSignIn,
  storeCognitoTokensInUserManager,
} from './cognitoAuth';
import { formatNameFromEmail, getInitials } from '../utils/userUtils';
import { subscribeToSyncEvents, broadcastAuthChanged } from '../utils/crossTabSync.js';

const AuthContext = createContext(null);

const GUEST_FALLBACK = {
  user: null,
  isAuthenticated: false,
  isGuest: true,
  accessToken: null,
  idToken: null,
  authMode: 'guest',
  loading: false,
  error: null,
  loginWithGoogle: () => {},
  loginWithEmailPassword: () => {},
  loginWithDirectCredentials: () => {},
  logout: () => {},
};

function CognitoBridge({ children }) {
  const oidc = useOidcAuth();

  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || DEFAULT_CLIENT_ID;
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN || DEFAULT_COGNITO_DOMAIN;
  const logoutUri =
    import.meta.env.VITE_COGNITO_LOGOUT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/');

  // Cross-tab auth synchronization: keep all tabs in sync with login/logout
  useEffect(() => {
    const manager = getSharedUserManager();

    const unsubscribe = subscribeToSyncEvents(async (event) => {
      if (event.type !== 'AUTH_CHANGED') return;

      if (event.action === 'LOGIN') {
        try {
          const user = await manager.getUser();
          if (user && manager.events && typeof manager.events.load === 'function') {
            await manager.events.load(user);
          }
        } catch {}
      } else if (event.action === 'LOGOUT') {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('arise_user_profile');
          }
          if (manager.events && typeof manager.events.unload === 'function') {
            await manager.events.unload();
          }
        } catch {}
      }
    });

    const handleVisibilityChange = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          const user = await manager.getUser();
          if (user && !oidc.isAuthenticated && manager.events?.load) {
            await manager.events.load(user);
          } else if (!user && oidc.isAuthenticated && manager.events?.unload) {
            await manager.events.unload();
          }
        } catch {}
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      unsubscribe();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [oidc.isAuthenticated]);

  const loginWithGoogle = useCallback(
    () =>
      oidc.signinRedirect({
        extraQueryParams: { identity_provider: 'Google' },
      }),
    [oidc],
  );

  const loginWithDirectCredentials = useCallback(
    async (email, password) => {
      const tokens = await directCognitoSignIn({ email, password, clientId });
      const manager = getSharedUserManager();
      const user = await storeCognitoTokensInUserManager(tokens, manager);
      return user;
    },
    [clientId],
  );

  const loginWithEmailPassword = useCallback(
    async (screen = 'login', options = {}) => {
      if (options.password) {
        return loginWithDirectCredentials(options.email, options.password);
      }

      if (screen === 'signup') {
        const manager = getSharedUserManager();
        const { url } = await createCognitoAuthRedirectUrl({
          screen: 'signup',
          options,
          manager,
        });
        if (typeof window !== 'undefined') {
          window.location.assign(url);
        }
        return;
      }

      const extraQueryParams = {};
      if (options.email) {
        extraQueryParams.login_hint = options.email;
      }
      return oidc.signinRedirect({ extraQueryParams });
    },
    [oidc, loginWithDirectCredentials],
  );

  const logout = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('arise_user_profile');
      }
      broadcastAuthChanged({ action: 'LOGOUT' });
      await oidc.removeUser();
    } catch {
      // ignore
    }

    if (cognitoDomain && clientId && typeof window !== 'undefined') {
      const url = new URL(`${cognitoDomain}/logout`);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('logout_uri', logoutUri);
      window.location.assign(url.toString());
    }
  }, [oidc, cognitoDomain, clientId, logoutUri]);


  const profile = oidc.user?.profile;
  const name =
    typeof profile?.name === 'string' && profile.name.trim() && !profile.name.includes('@')
      ? profile.name.trim()
      : typeof profile?.email === 'string'
        ? formatNameFromEmail(profile.email)
        : 'Arise User';

  const initials = getInitials(name);

  const user =
    oidc.isAuthenticated && profile
      ? {
          id: profile.sub,
          name,
          email: typeof profile.email === 'string' ? profile.email : '',
          initials,
          provider:
            profile?.identities?.[0]?.providerName ||
            (profile?.['cognito:username']?.startsWith('Google') ? 'Google' : 'Cognito'),
          mode: 'Cognito Authentication',
        }
      : null;

  const value = {
    user,
    isAuthenticated: Boolean(oidc.isAuthenticated && user),
    isGuest: !oidc.isAuthenticated,
    accessToken: oidc.user?.id_token || oidc.user?.access_token || null,
    idToken: oidc.user?.id_token || null,
    authMode: oidc.isAuthenticated ? 'cognito' : 'guest',
    loading: oidc.isLoading,
    error: oidc.error?.message || null,
    loginWithGoogle,
    loginWithEmailPassword,
    loginWithDirectCredentials,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  const manager = getSharedUserManager();

  return (
    <OidcAuthProvider
      userManager={manager}
      onSigninCallback={() => {
        if (typeof window !== 'undefined') {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + (window.location.hash.startsWith('#code=') ? '' : window.location.hash),
          );
        }
      }}
    >
      <CognitoBridge>{children}</CognitoBridge>
    </OidcAuthProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context) {
    return context;
  }
  return GUEST_FALLBACK;
}

export {
  DEFAULT_CLIENT_ID,
  DEFAULT_AUTHORITY,
  DEFAULT_COGNITO_DOMAIN,
  getSharedUserManager,
  createCognitoAuthRedirectUrl,
};
