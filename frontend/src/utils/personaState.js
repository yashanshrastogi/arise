export const ALL_PERSONAS = [
  { id: 'General Public', key: 'me', label: 'Me', icon: '👤', description: 'General adult daily recommendation' },
  { id: 'Children & Schools', key: 'child', label: 'Child', icon: '🎒', description: 'Vulnerable respiratory tract & sports guidance' },
  { id: 'Elderly & Respiratory', key: 'parent', label: 'Parent', icon: '🫁', description: 'Senior & asthma health precautions' },
  { id: 'Work & Outdoor Labor', key: 'work', label: 'Work', icon: '💼', description: 'Commuter & outdoor worker respiratory protection' },
  { id: 'School Administration', key: 'school', label: 'School', icon: '🏫', description: 'Campus outdoor sports & morning assembly protocol' },
];

export const DEFAULT_PINNED_PERSONAS = ['General Public'];

/**
 * Resolves pinned personas from user profile or local storage fallback.
 *
 * @param {Object} params
 * @param {Object} [params.userProfile] - User profile object
 * @returns {string[]} Array of pinned persona IDs
 */
export function resolvePinnedPersonas({ userProfile = null } = {}) {
  const pinnedList = userProfile?.pinned_personas;
  if (Array.isArray(pinnedList)) {
    return pinnedList;
  }
  return DEFAULT_PINNED_PERSONAS;
}

/**
 * Checks if a specific persona is pinned.
 *
 * @param {string} personaId
 * @param {Object} [userProfile]
 * @returns {boolean}
 */
export function isPersonaPinned(personaId, userProfile = null) {
  if (!personaId) return false;
  const pinned = resolvePinnedPersonas({ userProfile });
  return pinned.includes(personaId);
}

/**
 * Deterministically toggles a persona's pinned state in an array of pinned IDs.
 * Preserves multi-pin distinction without destructive overwriting.
 *
 * @param {string} personaId
 * @param {string[]} [currentPinned=[]]
 * @returns {string[]}
 */
export function togglePinnedPersona(personaId, currentPinned = []) {
  if (!personaId) return currentPinned;
  const set = new Set(Array.isArray(currentPinned) ? currentPinned : []);
  if (set.has(personaId)) {
    set.delete(personaId);
  } else {
    set.add(personaId);
  }
  return Array.from(set);
}

/**
 * Resolve visible personas based on authentication status and user preferences.
 * - In Guest mode: ONLY return 'Me' (General Public). Do not show Child, Parent, Work, School by default.
 * - When Authenticated: Return 'Me' + only the additional personas the user has configured/saved in their profile.
 * - Attaches .isPinned property to each returned persona.
 *
 * @param {Object} params
 * @param {boolean} [params.isAuthenticated=false]
 * @param {Object} [params.userProfile=null]
 * @param {boolean} [params.prioritizePinned=false]
 * @returns {Object[]}
 */
export function resolveVisiblePersonas({
  isAuthenticated = false,
  userProfile = null,
  prioritizePinned = false,
} = {}) {
  const pinnedIds = new Set(resolvePinnedPersonas({ userProfile }));
  const mePersona = {
    ...ALL_PERSONAS[0],
    isPinned: pinnedIds.has(ALL_PERSONAS[0].id),
  };

  if (!isAuthenticated) {
    return [mePersona];
  }

  const configuredList = userProfile?.configured_personas;
  if (!configuredList || !Array.isArray(configuredList) || configuredList.length === 0) {
    return [mePersona];
  }

  const configuredSet = new Set(configuredList.map(p => String(p).toLowerCase().trim()));
  const additional = ALL_PERSONAS.slice(1)
    .filter(p =>
      configuredSet.has(p.id.toLowerCase()) ||
      configuredSet.has(p.key.toLowerCase()) ||
      configuredSet.has(p.label.toLowerCase())
    )
    .map(p => ({
      ...p,
      isPinned: pinnedIds.has(p.id),
    }));

  const list = [mePersona, ...additional];

  if (prioritizePinned) {
    return list.slice().sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  }

  return list;
}

/**
 * Determines whether the user is authorized to configure saved profile locations.
 * Guests cannot configure locations; authenticated members can.
 *
 * @param {Object} params
 * @param {boolean} params.isAuthenticated
 * @returns {boolean}
 */
export function canConfigureLocations({ isAuthenticated }) {
  return Boolean(isAuthenticated);
}

/**
 * Enforces location configuration action access control.
 * If guest, triggers sign-in flow.
 * If authenticated, opens configuration dialog.
 *
 * @param {Object} params
 * @param {boolean} params.isAuthenticated
 * @param {Function} [params.onOpenSettings]
 * @param {Function} [params.onOpenLogin]
 * @returns {boolean} True if opened settings, false if redirected to login
 */
export function handleLocationConfigAttempt({
  isAuthenticated,
  onOpenSettings,
  onOpenLogin,
}) {
  if (!isAuthenticated) {
    if (typeof onOpenLogin === 'function') {
      onOpenLogin();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/login';
    }
    return false;
  }

  if (typeof onOpenSettings === 'function') {
    onOpenSettings();
  }
  return true;
}
