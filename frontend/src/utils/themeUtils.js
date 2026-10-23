/**
 * Arise Theme Engine — Deterministic System Theme Adaptation & User Overrides
 *
 * Implements 3-tier theme state:
 * - 'system': Defaults to operating system color-scheme preference (prefers-color-scheme).
 *             Listens for real-time OS theme changes and adapts automatically.
 * - 'light':  Explicit user override, persisted across sessions.
 * - 'dark':   Explicit user override, persisted across sessions.
 */

export const THEME_STORAGE_KEY = 'arise_theme';

/**
 * Retrieves the persisted user theme mode from localStorage.
 * Defaults to 'system' if not explicitly configured.
 */
export function getSavedTheme() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    }
  } catch {}
  return 'system';
}

/**
 * Checks whether the operating system currently prefers dark mode.
 */
export function getSystemPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Resolves the effective dark mode boolean based on theme mode.
 * @param {'system' | 'light' | 'dark'} mode
 * @returns {boolean} true if dark theme should be applied
 */
export function resolveEffectiveTheme(mode = 'system') {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemPreference();
}

/**
 * Persists an explicit theme choice to localStorage.
 * @param {'system' | 'light' | 'dark'} mode
 */
export function saveTheme(mode) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (mode === 'system') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      }
    }
  } catch {}
}

/**
 * Synchronizes the root document element classes and data attributes.
 * @param {boolean} isDark
 */
export function applyThemeToDocument(isDark) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/**
 * Cycles through the 3 theme modes in an intuitive sequence:
 * If currently in 'system':
 *   - If currently displaying dark (system is dark) -> switches to explicit 'light'
 *   - If currently displaying light (system is light) -> switches to explicit 'dark'
 * If currently in 'light' -> switches to 'dark'
 * If currently in 'dark' -> returns to 'system'
 *
 * @param {'system' | 'light' | 'dark'} currentMode
 * @param {boolean} isCurrentlyDark
 * @returns {'system' | 'light' | 'dark'}
 */
export function cycleTheme(currentMode, isCurrentlyDark) {
  if (currentMode === 'system') {
    return isCurrentlyDark ? 'light' : 'dark';
  }
  if (currentMode === 'light') {
    return 'dark';
  }
  return 'system';
}

/**
 * Attaches a listener for operating system theme changes.
 * Returns a cleanup function.
 * @param {(isDark: boolean) => void} callback
 * @returns {() => void}
 */
export function listenToSystemTheme(callback) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    if (typeof callback === 'function') {
      callback(e.matches);
    }
  };

  if (mql.addEventListener) {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  } else if (mql.addListener) {
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }
  return () => {};
}
