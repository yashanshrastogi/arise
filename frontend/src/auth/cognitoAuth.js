import { UserManager } from 'oidc-client-ts';

export const DEFAULT_CLIENT_ID = '32g687pdc6dulejhh4tcvd69m7';
export const DEFAULT_AUTHORITY = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_qm2818Iul';
export const DEFAULT_COGNITO_DOMAIN = 'https://us-east-1qm2818iul.auth.us-east-1.amazoncognito.com';

function getEnvValue(key, fallback) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch {
    // ignore
  }
  return fallback;
}

export function createOidcConfig(overrides = {}) {
  const clientId = overrides.client_id || getEnvValue('VITE_COGNITO_CLIENT_ID', DEFAULT_CLIENT_ID);
  const authority = overrides.authority || getEnvValue('VITE_COGNITO_AUTHORITY', DEFAULT_AUTHORITY);
  const cognitoDomain = overrides.cognitoDomain || getEnvValue('VITE_COGNITO_DOMAIN', DEFAULT_COGNITO_DOMAIN);
  const redirectUri =
    overrides.redirect_uri ||
    getEnvValue('VITE_COGNITO_REDIRECT_URI', '') ||
    (typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/');
  const logoutUri =
    overrides.post_logout_redirect_uri ||
    getEnvValue('VITE_COGNITO_LOGOUT_URI', '') ||
    redirectUri;

  return {
    authority,
    client_id: clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: logoutUri,
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: false,
    metadata: {
      issuer: authority,
      authorization_endpoint: `${cognitoDomain}/oauth2/authorize`,
      token_endpoint: `${cognitoDomain}/oauth2/token`,
      userinfo_endpoint: `${cognitoDomain}/oauth2/userInfo`,
      end_session_endpoint: `${cognitoDomain}/logout`,
      jwks_uri: `${authority}/.well-known/jwks.json`,
    },
    ...overrides,
  };
}

let sharedUserManager = null;

export function getSharedUserManager(settingsOverrides = {}) {
  if (!sharedUserManager || Object.keys(settingsOverrides).length > 0) {
    sharedUserManager = new UserManager(createOidcConfig(settingsOverrides));
  }
  return sharedUserManager;
}

export async function createCognitoAuthRedirectUrl({
  screen = 'login',
  options = {},
  redirectUri,
  manager,
} = {}) {
  const activeManager = manager || getSharedUserManager();
  const uri =
    redirectUri ||
    activeManager.settings.redirect_uri ||
    (typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/');

  const extraQueryParams = {};
  if (options.email) {
    extraQueryParams.login_hint = options.email;
  }
  if (options.identity_provider) {
    extraQueryParams.identity_provider = options.identity_provider;
  }

  const client = typeof activeManager.createSigninRequest === 'function' ? activeManager : activeManager._client;
  const signinRequest = await client.createSigninRequest({
    redirect_uri: uri,
    extraQueryParams,
  });

  const targetUrl = new URL(signinRequest.url);

  if (screen === 'signup') {
    targetUrl.pathname = '/signup';
  } else {
    targetUrl.pathname = '/oauth2/authorize';
  }

  if (options.email) {
    targetUrl.searchParams.set('login_hint', options.email);
  }

  return {
    url: targetUrl.toString(),
    state: signinRequest.state,
  };
}
