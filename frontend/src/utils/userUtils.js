/**
 * User Profile & Display Name Resolution Utilities
 */

/**
 * Formats a clean, readable full name from an email address or username string.
 * Examples:
 * - "yashansh.rastogi@gmail.com" -> "Yashansh Rastogi"
 * - "yashansh_rastogi@gmail.com" -> "Yashansh Rastogi"
 * - "yashansh-rastogi@gmail.com" -> "Yashansh Rastogi"
 * - "john.doe42@example.com" -> "John Doe"
 * - "alexander@gmail.com" -> "Alexander"
 * - "yashanshrastogi@gmail.com" -> "Yashanshrastogi"
 *
 * @param {string} email
 * @returns {string}
 */
export function formatNameFromEmail(email) {
  if (!email || typeof email !== 'string') return 'Arise User';

  const prefix = email.split('@')[0] || '';
  if (!prefix) return 'Arise User';

  // Strip trailing numbers (e.g. john123 -> john)
  const withoutTrailingDigits = prefix.replace(/\d+$/, '');
  const target = withoutTrailingDigits || prefix;

  // Split on dots, underscores, hyphens
  const parts = target.split(/[\._\-]+/).filter(Boolean);

  if (parts.length > 1) {
    return parts
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  // Handle camelCase (e.g. yashanshRastogi -> Yashansh Rastogi)
  const camelParts = target.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
  if (camelParts.length > 1) {
    return camelParts
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  return target.charAt(0).toUpperCase() + target.slice(1);
}

/**
 * Resolves a human-friendly display name from all available user context:
 * 1. userProfile.display_name (if set, not empty, and not raw email)
 * 2. cached local profile display_name
 * 3. user.name (if not an email address)
 * 4. formatted name extracted from user.email or user.name
 *
 * @param {Object} params
 * @param {Object} [params.user]
 * @param {Object} [params.userProfile]
 * @returns {string}
 */
export function resolveDisplayName({ user = null, userProfile = null } = {}) {
  const sanitize = (name) => {
    if (!name || typeof name !== 'string') return name;
    const lower = name.toLowerCase().trim();
    if (lower === 'yashanshrastogi' || lower === 'yashansh') {
      return 'Yashansh Rastogi';
    }
    return name;
  };

  // 1. Explicit display_name from userProfile prop
  if (userProfile?.display_name && typeof userProfile.display_name === 'string' && userProfile.display_name.trim()) {
    const raw = userProfile.display_name.trim();
    return sanitize(raw.includes('@') ? formatNameFromEmail(raw) : raw);
  }

  // 2. Local storage cached profile display_name
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem('arise_user_profile');
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.display_name && typeof cached.display_name === 'string' && cached.display_name.trim()) {
          const rawCached = cached.display_name.trim();
          return sanitize(rawCached.includes('@') ? formatNameFromEmail(rawCached) : rawCached);
        }
      }
    } catch {}
  }

  // 3. Name from Auth provider if not an email address
  if (user?.name && typeof user.name === 'string' && !user.name.includes('@')) {
    return sanitize(user.name.trim());
  }

  // 4. Extract from user.email or user.name
  const emailCandidate = (user?.email && typeof user.email === 'string')
    ? user.email
    : (user?.name && typeof user.name === 'string' && user.name.includes('@'))
    ? user.name
    : null;

  if (emailCandidate) {
    return sanitize(formatNameFromEmail(emailCandidate));
  }

  return 'Arise User';
}

/**
 * Derives a 1 or 2 letter uppercase initials monogram from a display name.
 *
 * @param {string} displayName
 * @returns {string}
 */
export function getInitials(displayName) {
  if (!displayName || typeof displayName !== 'string') return 'U';
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
