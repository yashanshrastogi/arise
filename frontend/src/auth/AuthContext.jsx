import React, { createContext, useContext, useCallback } from 'react';
import {
  AuthProvider as OidcAuthProvider,
  useAuth as useOidcAuth,
} from 'react-oidc-context';

const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || 'guest';
const isCognito = AUTH_MODE === 'cognito-google';

const AuthContext = createContext(null);

const GUEST_AUTH_VALUE = {
  user: null,
  isAuthenticated: false,
  isGuest: true,
  accessToken: null,
  authMode: AUTH_MODE,
  loading: false,
  error: null,
  authModalOpen: false,
  setAuthModalOpen: () => {},
  loginWithGoogle: () => {},
  logout: () => {},
};

function CognitoBridge({ children }) {
  const oidc = useOidcAuth();

  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN;
  const logoutUri =
    import.meta.env.VITE_COGNITO_LOGOUT_URI ||
    (typeof window !== 'undefined' ? window.location.origin + '/' : '/');

  const loginWithGoogle = useCallback(
    () =>
      oidc.signinRedirect({
        extraQueryParams: { identity_provider: 'Google' },
      }),
    [oidc],
  );

  const logout = useCallback(async () => {
    // Clear the local OIDC session, then use Cognito's logout endpoint.
    await oidc.removeUser();

    if (cognitoDomain && clientId && typeof window !== 'undefined') {
      const url = new URL(`${cognitoDomain}/logout`);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('logout_uri', logoutUri);
      window.location.assign(url.toString());
    }
  }, [oidc, cognitoDomain, clientId, logoutUri]);

  const profile = oidc.user?.profile;
  const name =
    typeof profile?.name === 'string'
      ? profile.name
      : typeof profile?.email === 'string'
        ? profile.email
        : 'Arise User';

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'U';

  const user =
    oidc.isAuthenticated && profile
      ? {
          id: profile.sub,
          name,
          email: typeof profile.email === 'string' ? profile.email : '',
          initials,
          provider: 'Google',
          mode: 'Cognito Google OAuth',
        }
      : null;

  const value = {
    user,
    isAuthenticated: Boolean(oidc.isAuthenticated && user),
    isGuest: false,
    accessToken: oidc.user?.access_token || null,
    authMode: 'cognito-google',
    loading: oidc.isLoading,
    error: oidc.error?.message || null,
    authModalOpen: false,
    setAuthModalOpen: () => {},
    loginWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }) {
  if (!isCognito) {
    return (
      <AuthContext.Provider value={GUEST_AUTH_VALUE}>
        {children}
      </AuthContext.Provider>
    );
  }

  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const logoutUri =
    import.meta.env.VITE_COGNITO_LOGOUT_URI ||
    (typeof window !== 'undefined' ? window.location.origin + '/' : '/');

  const oidcConfig = {
    authority: import.meta.env.VITE_COGNITO_AUTHORITY,
    client_id: clientId,
    redirect_uri:
      import.meta.env.VITE_COGNITO_REDIRECT_URI ||
      (typeof window !== 'undefined' ? window.location.origin + '/' : '/'),
    post_logout_redirect_uri: logoutUri,
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: false,
  };

  return (
    <OidcAuthProvider
      {...oidcConfig}
      onSigninCallback={() => {
        // Remove OAuth code/state from the visible URL after processing.
        if (typeof window !== 'undefined') {
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname + window.location.hash,
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
  return GUEST_AUTH_VALUE;
}
