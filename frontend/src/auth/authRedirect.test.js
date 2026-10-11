import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
if (!globalThis.crypto) {
  globalThis.crypto = nodeCrypto.webcrypto;
}
import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import {
  DEFAULT_CLIENT_ID,
  DEFAULT_AUTHORITY,
  DEFAULT_COGNITO_DOMAIN,
  createOidcConfig,
  createCognitoAuthRedirectUrl,
} from './cognitoAuth.js';

class MockStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, val) { this.store[key] = String(val); }
  removeItem(key) { delete this.store[key]; }
  get length() { return Object.keys(this.store).length; }
  key(i) { return Object.keys(this.store)[i]; }
}

const mockStore = new MockStorage();
const customManager = new UserManager(
  createOidcConfig({
    stateStore: new WebStorageStateStore({ store: mockStore }),
    redirect_uri: 'http://localhost:5173/',
  }),
);

test('OIDC config factory generates expected Cognito metadata endpoints', () => {
  const config = createOidcConfig();
  assert.equal(config.client_id, DEFAULT_CLIENT_ID);
  assert.equal(config.authority, DEFAULT_AUTHORITY);
  assert.equal(config.response_type, 'code');
  assert.equal(config.scope, 'openid email profile');
  assert.equal(
    config.metadata.authorization_endpoint,
    `${DEFAULT_COGNITO_DOMAIN}/oauth2/authorize`,
  );
  assert.equal(
    config.metadata.token_endpoint,
    `${DEFAULT_COGNITO_DOMAIN}/oauth2/token`,
  );
  assert.equal(
    config.metadata.userinfo_endpoint,
    `${DEFAULT_COGNITO_DOMAIN}/oauth2/userInfo`,
  );
  assert.equal(
    config.metadata.end_session_endpoint,
    `${DEFAULT_COGNITO_DOMAIN}/logout`,
  );
});

test('Sign Up redirect URL points to /signup and preserves PKCE code challenge and state', async () => {
  const result = await createCognitoAuthRedirectUrl({
    screen: 'signup',
    options: { email: 'newuser@example.com' },
    redirectUri: 'https://frontend.dqmsa8e2klyso.amplifyapp.com/',
    manager: customManager,
  });

  const parsed = new URL(result.url);

  // Endpoint path must be /signup, not /login or /oauth2/authorize
  assert.equal(parsed.pathname, '/signup');
  assert.equal(parsed.hostname, 'us-east-1qm2818iul.auth.us-east-1.amazoncognito.com');

  // Must preserve standard OAuth & PKCE params
  assert.equal(parsed.searchParams.get('client_id'), DEFAULT_CLIENT_ID);
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://frontend.dqmsa8e2klyso.amplifyapp.com/');
  assert.equal(parsed.searchParams.get('scope'), 'openid email profile');
  assert.equal(parsed.searchParams.get('login_hint'), 'newuser@example.com');

  // PKCE params
  assert.ok(parsed.searchParams.has('code_challenge'), 'Must include code_challenge');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');

  // OAuth state
  const state = parsed.searchParams.get('state');
  assert.ok(state, 'Must include OAuth state parameter');

  // Stored state validation
  const storedJson = await customManager.settings.stateStore.get(state);
  assert.ok(storedJson, 'State must be persisted in stateStore for callback validation');
  const stored = JSON.parse(storedJson);
  assert.ok(stored.code_verifier, 'Stored state must contain code_verifier');
  assert.equal(stored.redirect_uri, 'https://frontend.dqmsa8e2klyso.amplifyapp.com/');
});

test('Sign In redirect URL points to /oauth2/authorize with PKCE and state', async () => {
  const result = await createCognitoAuthRedirectUrl({
    screen: 'login',
    options: { email: 'existing@example.com' },
    redirectUri: 'http://localhost:5173/',
    manager: customManager,
  });

  const parsed = new URL(result.url);
  assert.equal(parsed.pathname, '/oauth2/authorize');
  assert.equal(parsed.searchParams.get('login_hint'), 'existing@example.com');
  assert.ok(parsed.searchParams.has('code_challenge'));
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');

  const state = parsed.searchParams.get('state');
  const storedJson = await customManager.settings.stateStore.get(state);
  assert.ok(storedJson);
});

test('Google login URL includes identity_provider=Google', async () => {
  const result = await createCognitoAuthRedirectUrl({
    screen: 'login',
    options: { identity_provider: 'Google' },
    redirectUri: 'http://localhost:5173/',
    manager: customManager,
  });

  const parsed = new URL(result.url);
  assert.equal(parsed.pathname, '/oauth2/authorize');
  assert.equal(parsed.searchParams.get('identity_provider'), 'Google');
  assert.ok(parsed.searchParams.has('code_challenge'));
});
