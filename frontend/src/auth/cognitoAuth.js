import { UserManager, WebStorageStateStore, User } from 'oidc-client-ts';

export const DEFAULT_CLIENT_ID = '32g687pdc6dulejhh4tcvd69m7';
export const DEFAULT_AUTHORITY = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_qm2818Iul';
export const DEFAULT_COGNITO_DOMAIN = 'https://us-east-1qm2818iul.auth.us-east-1.amazoncognito.com';
export const COGNITO_IDP_ENDPOINT = 'https://cognito-idp.us-east-1.amazonaws.com/';

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

  const userStore = typeof window !== 'undefined' && window.localStorage
    ? new WebStorageStateStore({ store: window.localStorage })
    : undefined;

  return {
    authority,
    client_id: clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: logoutUri,
    response_type: 'code',
    scope: 'openid email profile',
    automaticSilentRenew: true,
    userStore,
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

/**
 * Direct In-App Cognito API Operations
 * Eliminates external Cognito hosted redirects for registration & confirmation
 */
async function callCognitoIdp(target, payload) {
  const res = await fetch(COGNITO_IDP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorType = data.__type || data.code || 'CognitoError';
    const message = data.message || 'Authentication request failed.';
    const err = new Error(message);
    err.code = errorType;
    throw err;
  }
  return data;
}

export async function directCognitoSignUp({ name, email, password, clientId = DEFAULT_CLIENT_ID }) {
  const userAttributes = [
    { Name: 'email', Value: email.trim() },
  ];
  if (name && typeof name === 'string' && name.trim()) {
    userAttributes.push({ Name: 'name', Value: name.trim() });
  }
  return callCognitoIdp('SignUp', {
    ClientId: clientId,
    Username: email.trim(),
    Password: password,
    UserAttributes: userAttributes,
  });
}

export async function directCognitoConfirmSignUp({ email, code, clientId = DEFAULT_CLIENT_ID }) {
  return callCognitoIdp('ConfirmSignUp', {
    ClientId: clientId,
    Username: email.trim(),
    ConfirmationCode: code.trim(),
  });
}

export async function directCognitoResendCode({ email, clientId = DEFAULT_CLIENT_ID }) {
  return callCognitoIdp('ResendConfirmationCode', {
    ClientId: clientId,
    Username: email.trim(),
  });
}

export async function directCognitoSignIn({ email, password, clientId = DEFAULT_CLIENT_ID }) {
  const data = await callCognitoIdp('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: {
      USERNAME: email.trim(),
      PASSWORD: password,
    },
  });

  const authResult = data.AuthenticationResult;
  if (!authResult) {
    if (data.ChallengeName) {
      const err = new Error(`Challenge required: ${data.ChallengeName}`);
      err.code = data.ChallengeName;
      throw err;
    }
    throw new Error('Authentication response did not contain tokens.');
  }

  return {
    accessToken: authResult.AccessToken,
    idToken: authResult.IdToken,
    refreshToken: authResult.RefreshToken,
    expiresIn: authResult.ExpiresIn,
    tokenType: authResult.TokenType,
  };
}

export function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

import { broadcastAuthChanged } from '../utils/crossTabSync.js';

export async function storeCognitoTokensInUserManager(authTokens, manager) {
  const activeManager = manager || getSharedUserManager();
  const profile = parseJwtPayload(authTokens.idToken);

  const user = new User({
    id_token: authTokens.idToken,
    access_token: authTokens.accessToken,
    refresh_token: authTokens.refreshToken,
    token_type: authTokens.tokenType || 'Bearer',
    scope: 'openid email profile',
    profile,
    expires_at: Math.floor(Date.now() / 1000) + (authTokens.expiresIn || 3600),
  });

  await activeManager.storeUser(user);
  if (activeManager.events && typeof activeManager.events.load === 'function') {
    await activeManager.events.load(user);
  }

  // Notify other tabs that user has signed in
  broadcastAuthChanged({
    action: 'LOGIN',
    userId: profile.sub,
    email: profile.email,
  });

  return user;
}

