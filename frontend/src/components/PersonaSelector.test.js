import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVisiblePersonas,
  resolvePinnedPersonas,
  isPersonaPinned,
  togglePinnedPersona,
  canConfigureLocations,
  handleLocationConfigAttempt,
} from '../utils/personaState.js';

test('resolveVisiblePersonas returns ONLY Me (General Public) in guest mode', () => {
  const result = resolveVisiblePersonas({
    isAuthenticated: false,
    userProfile: { configured_personas: ['Children & Schools', 'Work & Outdoor Labor'] },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'General Public');
  assert.equal(result[0].label, 'Me');
});

test('resolveVisiblePersonas returns ONLY Me when authenticated user has no configured personas', () => {
  const resultEmpty = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: { configured_personas: [] },
  });
  assert.equal(resultEmpty.length, 1);
  assert.equal(resultEmpty[0].id, 'General Public');

  const resultNull = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: null,
  });
  assert.equal(resultNull.length, 1);
  assert.equal(resultNull[0].id, 'General Public');
});

test('resolveVisiblePersonas returns Me plus saved/enabled personas when authenticated', () => {
  const resultChild = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: { configured_personas: ['Children & Schools'] },
  });
  assert.equal(resultChild.length, 2);
  assert.equal(resultChild[0].id, 'General Public');
  assert.equal(resultChild[1].id, 'Children & Schools');
  assert.equal(resultChild[1].label, 'Child');

  const resultMultiple = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: { configured_personas: ['Children & Schools', 'Elderly & Respiratory', 'Work & Outdoor Labor'] },
  });
  assert.equal(resultMultiple.length, 4);
  assert.equal(resultMultiple.map(p => p.label).join(','), 'Me,Child,Parent,Work');
});

test('resolvePinnedPersonas falls back safely to default when none configured', () => {
  const def = resolvePinnedPersonas();
  assert.deepEqual(def, ['General Public']);

  const empty = resolvePinnedPersonas({ userProfile: { pinned_personas: [] } });
  assert.deepEqual(empty, []);
});

test('togglePinnedPersona pins and unpins profiles without destructive overwriting', () => {
  let pinned = ['General Public'];
  pinned = togglePinnedPersona('Children & Schools', pinned);
  assert.ok(pinned.includes('Children & Schools'));
  assert.ok(pinned.includes('General Public'));

  // Unpin Children & Schools
  pinned = togglePinnedPersona('Children & Schools', pinned);
  assert.equal(pinned.includes('Children & Schools'), false);
  assert.ok(pinned.includes('General Public'));
});

test('resolveVisiblePersonas attaches isPinned flags correctly', () => {
  const result = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: {
      configured_personas: ['Children & Schools', 'Work & Outdoor Labor'],
      pinned_personas: ['Children & Schools'],
    },
  });
  const child = result.find(p => p.id === 'Children & Schools');
  assert.equal(child?.isPinned, true);

  const work = result.find(p => p.id === 'Work & Outdoor Labor');
  assert.equal(work?.isPinned, false);
});

test('canConfigureLocations and handleLocationConfigAttempt lock guest actions', () => {
  assert.equal(canConfigureLocations({ isAuthenticated: false }), false);
  assert.equal(canConfigureLocations({ isAuthenticated: true }), true);

  let openedSettings = false;
  let openedLogin = false;

  const guestOutcome = handleLocationConfigAttempt({
    isAuthenticated: false,
    onOpenSettings: () => { openedSettings = true; },
    onOpenLogin: () => { openedLogin = true; },
  });
  assert.equal(guestOutcome, false);
  assert.equal(openedSettings, false);
  assert.equal(openedLogin, true);

  openedLogin = false;
  const authOutcome = handleLocationConfigAttempt({
    isAuthenticated: true,
    onOpenSettings: () => { openedSettings = true; },
    onOpenLogin: () => { openedLogin = true; },
  });
  assert.equal(authOutcome, true);
  assert.equal(openedSettings, true);
  assert.equal(openedLogin, false);
});

// ═══════════════ PROFILE PINNING REGRESSION TESTS ═══════════════

test('Pin and unpin multiple personas in sequence without data loss', () => {
  // Start with General Public pinned
  let pinned = ['General Public'];

  // Pin Child
  pinned = togglePinnedPersona('Children & Schools', pinned);
  assert.deepEqual(pinned.sort(), ['Children & Schools', 'General Public']);

  // Pin Work
  pinned = togglePinnedPersona('Work & Outdoor Labor', pinned);
  assert.equal(pinned.length, 3);
  assert.ok(pinned.includes('Work & Outdoor Labor'));

  // Unpin General Public — should not affect Child or Work
  pinned = togglePinnedPersona('General Public', pinned);
  assert.equal(pinned.length, 2);
  assert.equal(pinned.includes('General Public'), false);
  assert.ok(pinned.includes('Children & Schools'));
  assert.ok(pinned.includes('Work & Outdoor Labor'));

  // Re-pin General Public
  pinned = togglePinnedPersona('General Public', pinned);
  assert.equal(pinned.length, 3);
  assert.ok(pinned.includes('General Public'));
});

test('Pinned status is independent from the primary default profile selection', () => {
  // User's default persona is General Public, but Child is pinned
  const profile = {
    persona: 'General Public',
    configured_personas: ['Children & Schools', 'Work & Outdoor Labor'],
    pinned_personas: ['Children & Schools'],
  };

  const visible = resolveVisiblePersonas({ isAuthenticated: true, userProfile: profile });
  const me = visible.find(p => p.id === 'General Public');
  const child = visible.find(p => p.id === 'Children & Schools');
  const work = visible.find(p => p.id === 'Work & Outdoor Labor');

  // Default profile is 'General Public' but isPinned is based solely on pinned_personas
  assert.equal(me.isPinned, false); // Not in pinned_personas
  assert.equal(child.isPinned, true); // In pinned_personas
  assert.equal(work.isPinned, false); // Not in pinned_personas

  // Changing default profile does NOT change pin status
  const profileWorkDefault = { ...profile, persona: 'Work & Outdoor Labor' };
  const visible2 = resolveVisiblePersonas({ isAuthenticated: true, userProfile: profileWorkDefault });
  assert.equal(visible2.find(p => p.id === 'Work & Outdoor Labor').isPinned, false);
  assert.equal(visible2.find(p => p.id === 'Children & Schools').isPinned, true);
});

test('Pinned status is independent from configured_personas (enabled profiles)', () => {
  // Pinned includes Work, but configured doesn't — Work won't appear in visible list
  const profile = {
    configured_personas: ['Children & Schools'],
    pinned_personas: ['Work & Outdoor Labor', 'Children & Schools'],
  };

  const visible = resolveVisiblePersonas({ isAuthenticated: true, userProfile: profile });
  // Only Me + Child visible (Work not configured)
  assert.equal(visible.length, 2);
  assert.equal(visible.find(p => p.id === 'Work & Outdoor Labor'), undefined);
  // Child is visible AND pinned
  assert.equal(visible.find(p => p.id === 'Children & Schools').isPinned, true);
});

test('Pinned personas persist through simulated localStorage round-trip', () => {
  const profile = {
    display_name: 'Test User',
    persona: 'General Public',
    configured_personas: ['Children & Schools', 'Work & Outdoor Labor'],
    pinned_personas: ['Children & Schools', 'Work & Outdoor Labor'],
  };

  // Simulate localStorage write + read
  const serialized = JSON.stringify(profile);
  const restored = JSON.parse(serialized);

  assert.deepEqual(restored.pinned_personas, ['Children & Schools', 'Work & Outdoor Labor']);

  // Verify pin state survives round-trip
  const visible = resolveVisiblePersonas({ isAuthenticated: true, userProfile: restored });
  assert.equal(visible.find(p => p.id === 'Children & Schools').isPinned, true);
  assert.equal(visible.find(p => p.id === 'Work & Outdoor Labor').isPinned, true);
  assert.equal(visible.find(p => p.id === 'General Public').isPinned, false);
});

test('Guest users cannot modify pinned personas via PersonaSelector guard', () => {
  // resolveVisiblePersonas in guest mode only returns Me regardless of pinned_personas
  const guestResult = resolveVisiblePersonas({
    isAuthenticated: false,
    userProfile: {
      configured_personas: ['Children & Schools'],
      pinned_personas: ['Children & Schools'],
    },
  });
  assert.equal(guestResult.length, 1);
  assert.equal(guestResult[0].id, 'General Public');
});

test('prioritizePinned sort places pinned personas before unpinned', () => {
  const profile = {
    configured_personas: ['Children & Schools', 'Work & Outdoor Labor', 'Elderly & Respiratory'],
    pinned_personas: ['Work & Outdoor Labor'],
  };

  const sorted = resolveVisiblePersonas({
    isAuthenticated: true,
    userProfile: profile,
    prioritizePinned: true,
  });

  // Work is pinned, should appear before unpinned Child and Parent
  const workIdx = sorted.findIndex(p => p.id === 'Work & Outdoor Labor');
  const childIdx = sorted.findIndex(p => p.id === 'Children & Schools');
  const parentIdx = sorted.findIndex(p => p.id === 'Elderly & Respiratory');
  assert.ok(workIdx < childIdx, 'Pinned Work should come before unpinned Child');
  assert.ok(workIdx < parentIdx, 'Pinned Work should come before unpinned Parent');
});

test('Empty pinned_personas array means no persona has isPinned=true', () => {
  const profile = {
    configured_personas: ['Children & Schools', 'Work & Outdoor Labor'],
    pinned_personas: [],
  };

  const visible = resolveVisiblePersonas({ isAuthenticated: true, userProfile: profile });
  assert.ok(visible.every(p => p.isPinned === false), 'All personas should be unpinned');
});

test('isPersonaPinned returns correct result from profile', () => {
  const profile = {
    pinned_personas: ['Children & Schools', 'General Public'],
  };

  assert.equal(isPersonaPinned('Children & Schools', profile), true);
  assert.equal(isPersonaPinned('General Public', profile), true);
  assert.equal(isPersonaPinned('Work & Outdoor Labor', profile), false);
  assert.equal(isPersonaPinned('', profile), false);
  assert.equal(isPersonaPinned(null, profile), false);
});
