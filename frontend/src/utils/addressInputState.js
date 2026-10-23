/**
 * Address Input State Management & Clear Action Utilities
 */

/**
 * Determines whether the clear (×) button should be visible.
 * Shown only when the input contains text and the control is not disabled.
 *
 * @param {string} query
 * @param {boolean} [disabled=false]
 * @returns {boolean}
 */
export function shouldShowClearButton(query, disabled = false) {
  if (disabled) return false;
  return typeof query === 'string' && query.length > 0;
}

/**
 * Executes the address clear action immediately.
 * Clears controlled query, dismisses suggestions dropdown, calls onChange(''),
 * and triggers optional onClear callback without form submission or persistent storage mutation.
 *
 * @param {Object} params
 * @param {Function} [params.setQuery]
 * @param {Function} [params.setSuggestions]
 * @param {Function} [params.setIsOpen]
 * @param {Function} [params.onChange]
 * @param {Function} [params.onClear]
 * @returns {Object} Cleared state snapshot
 */
export function handleAddressClear({
  setQuery,
  setSuggestions,
  setIsOpen,
  onChange,
  onClear,
} = {}) {
  if (typeof setQuery === 'function') setQuery('');
  if (typeof setSuggestions === 'function') setSuggestions([]);
  if (typeof setIsOpen === 'function') setIsOpen(false);
  if (typeof onChange === 'function') onChange('');
  if (typeof onClear === 'function') onClear();

  return {
    query: '',
    isOpen: false,
    suggestions: [],
  };
}

/**
 * Determines whether the "Location pinned" indicator should be displayed.
 * To prevent misleading indicators, returns false if coordinates exist but the text field has been cleared.
 *
 * @param {boolean} hasCoords
 * @param {number|string|null} lat
 * @param {number|string|null} lon
 * @param {string} query
 * @returns {boolean}
 */
export function shouldShowLocationPinnedBadge(hasCoords, lat, lon, query) {
  if (!hasCoords) return false;
  if (lat == null || lon == null || lat === '' || lon === '') return false;
  if (typeof query !== 'string' || !query.trim()) return false;
  return true;
}
