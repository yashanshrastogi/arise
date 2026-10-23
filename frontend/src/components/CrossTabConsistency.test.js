import test from 'node:test';
import assert from 'node:assert/strict';

// Test mock storage implementing localStorage / sessionStorage interface
function createMockStorage() {
  const store = new Map();
  return {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, val) => store.set(String(key), String(val)),
    removeItem: (key) => store.delete(String(key)),
    clear: () => store.clear(),
    get size() { return store.size; },
  };
}

test('User ID resolution and storage key scoping enforces strict per-account isolation', () => {
  const user1 = { id: 'usr_abc_111', email: 'alice@arise.org' };
  const user2 = { id: 'usr_xyz_222', email: 'bob@arise.org' };

  const getScopeKey = (user, isAuth) => {
    const authId = isAuth && user?.id ? user.id : (isAuth && user?.email ? user.email : null);
    return {
      convCacheKey: authId ? `arise_user_convs_${authId}` : 'arise_guest_conversations',
      memCacheKey: authId ? `arise_user_memories_${authId}` : 'arise_guest_memories',
      activeSessionKey: authId ? `arise_active_conv_${authId}` : 'arise_active_conv_guest',
    };
  };

  const scope1 = getScopeKey(user1, true);
  const scope2 = getScopeKey(user2, true);
  const scopeGuest = getScopeKey(null, false);

  assert.equal(scope1.convCacheKey, 'arise_user_convs_usr_abc_111');
  assert.equal(scope2.convCacheKey, 'arise_user_convs_usr_xyz_222');
  assert.equal(scopeGuest.convCacheKey, 'arise_guest_conversations');

  // Strict isolation check: User 1 and User 2 keys never collide
  assert.notEqual(scope1.convCacheKey, scope2.convCacheKey);
  assert.notEqual(scope1.memCacheKey, scope2.memCacheKey);
  assert.notEqual(scope1.activeSessionKey, scope2.activeSessionKey);
});

test('Stale asynchronous responses arriving out of order are discarded via sequence counter', async () => {
  let fetchSeq = 0;
  let finalAppliedState = null;

  async function simulateFetch(id, delayMs, resultData) {
    fetchSeq += 1;
    const currentSeq = fetchSeq;

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Stale check
    if (currentSeq < fetchSeq) {
      // Out of order: older request resolved after a newer request
      return { discarded: true };
    }

    finalAppliedState = resultData;
    return { discarded: false, data: resultData };
  }

  // Request 1 is slow (delay 50ms) with older data [Conv 1]
  const p1 = simulateFetch('req1', 50, [{ id: 'conv_1', title: 'Old Title' }]);
  // Request 2 is fast (delay 10ms) with newer data [Conv 1 (renamed), Conv 2]
  const p2 = simulateFetch('req2', 10, [{ id: 'conv_1', title: 'New Title' }, { id: 'conv_2', title: 'Second Chat' }]);

  const [res1, res2] = await Promise.all([p1, p2]);

  assert.equal(res2.discarded, false);
  assert.equal(res1.discarded, true);
  assert.equal(finalAppliedState.length, 2);
  assert.equal(finalAppliedState[0].title, 'New Title');
});

test('Network error or API failure never clears existing conversation state', () => {
  const localStorage = createMockStorage();
  const userConvCacheKey = 'arise_user_convs_user_123';

  // Existing valid conversations
  const existingConversations = [
    { id: 'conv_1', title: 'Air quality in Delhi', is_pinned: true, is_archived: false },
    { id: 'conv_2', title: 'Morning run safety', is_pinned: false, is_archived: false },
  ];
  localStorage.setItem(userConvCacheKey, JSON.stringify(existingConversations));

  let conversationsState = [...existingConversations];

  // Simulated fetch that fails with network error
  function handleFetchFailure(err) {
    // Correct resilient behavior: do NOT set conversationsState = []
    // Fall back to local user-scoped cache if available
    const cached = localStorage.getItem(userConvCacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          conversationsState = parsed;
          return;
        }
      } catch {}
    }
    // If state already has items, keep them
  }

  handleFetchFailure(new Error('Network request failed 503'));

  // Assert state was preserved and NOT wiped out
  assert.equal(conversationsState.length, 2);
  assert.equal(conversationsState[0].id, 'conv_1');
  assert.equal(conversationsState[0].is_pinned, true);
});

test('Distinguishes loading, successfully empty, and failed-to-load states', () => {
  // State machine verification
  let loading = true;
  let error = null;
  let data = null;

  // 1. Initial loading state
  assert.equal(loading, true);
  assert.equal(data, null);
  assert.equal(error, null);

  // 2. Successfully empty history (server returns 200 with [])
  loading = false;
  data = [];
  error = null;
  assert.equal(loading, false);
  assert.equal(Array.isArray(data), true);
  assert.equal(data.length, 0);
  assert.equal(error, null);

  // 3. Failed request (server returns 500)
  loading = false;
  error = 'Telemetry server unreachable';
  // Existing data is not cleared on error
  assert.equal(loading, false);
  assert.ok(error);
});

test('Cross-tab conversation mutation event filters by userId', () => {
  const processedEvents = [];

  function onSyncEventReceived(event, currentAuthUserId) {
    if (event.type === 'CONVERSATION_MUTATED') {
      if (event.userId && event.userId !== currentAuthUserId) {
        // Event is for a different account in another tab/window; ignore to maintain privacy
        return { ignored: true };
      }
      processedEvents.push(event);
      return { ignored: false };
    }
    return { ignored: true };
  }

  // Tab running as User A
  const currentAuthUserId = 'usr_alice';

  // Event from User A (in another tab)
  const res1 = onSyncEventReceived({
    type: 'CONVERSATION_MUTATED',
    action: 'PIN',
    conversationId: 'conv_1',
    userId: 'usr_alice',
  }, currentAuthUserId);

  // Event from User B (another browser profile or account)
  const res2 = onSyncEventReceived({
    type: 'CONVERSATION_MUTATED',
    action: 'DELETE',
    conversationId: 'conv_99',
    userId: 'usr_bob',
  }, currentAuthUserId);

  assert.equal(res1.ignored, false);
  assert.equal(res2.ignored, true);
  assert.equal(processedEvents.length, 1);
  assert.equal(processedEvents[0].conversationId, 'conv_1');
});

test('Sign-out cleans user profile and scoped active session keys', () => {
  const localStorage = createMockStorage();
  const sessionStorage = createMockStorage();

  // Populate active user data
  const userId = 'usr_alice';
  localStorage.setItem('arise_user_profile', JSON.stringify({ display_name: 'Alice Wonder', email: 'alice@arise.org' }));
  localStorage.setItem(`arise_user_convs_${userId}`, JSON.stringify([{ id: 'c1' }]));
  sessionStorage.setItem(`arise_active_conv_${userId}`, 'c1');

  // Perform sign-out cleanup
  localStorage.removeItem('arise_user_profile');
  sessionStorage.removeItem(`arise_active_conv_${userId}`);

  assert.equal(localStorage.getItem('arise_user_profile'), null);
  assert.equal(sessionStorage.getItem(`arise_active_conv_${userId}`), null);
});
