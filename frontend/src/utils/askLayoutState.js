/**
 * Ask Arise Layout and Scroll State Utilities
 * Provides deterministic logic for guest/signed-in layout features and
 * scroll-aware floating "Newest" button positioning.
 */

export const SCROLL_TOLERANCE = 32;

/**
 * Determines whether the user is positioned at the bottom of the scroll container.
 * Uses container's actual scrollTop, scrollHeight, and clientHeight with a tolerance window.
 *
 * @param {Object} el - Element or mock containing scrollTop, scrollHeight, clientHeight
 * @param {number} [tolerance=SCROLL_TOLERANCE] - Tolerance margin in pixels
 * @returns {boolean} True if user is within tolerance of bottom
 */
export function checkIsAtBottom(el, tolerance = SCROLL_TOLERANCE) {
  if (!el) return true;
  const { scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = el;
  if (scrollHeight <= clientHeight + tolerance) return true;
  return scrollHeight - scrollTop - clientHeight <= tolerance;
}

/**
 * Determines whether the floating "Newest" button should be displayed.
 * Only shown when:
 * 1. There are actual messages (never on empty welcome screen)
 * 2. The container has scrollable content exceeding tolerance
 * 3. The user has scrolled up and is not currently at the bottom
 *
 * @param {Object} params
 * @param {number} params.messagesLength - Total number of messages in the active thread
 * @param {number} params.scrollTop - Container scrollTop
 * @param {number} params.scrollHeight - Container scrollHeight
 * @param {number} params.clientHeight - Container clientHeight
 * @param {number} [params.tolerance=SCROLL_TOLERANCE] - Tolerance margin in pixels
 * @returns {boolean} True if "Newest" button should be rendered
 */
export function shouldShowNewestButton({
  messagesLength,
  scrollTop = 0,
  scrollHeight = 0,
  clientHeight = 0,
  tolerance = SCROLL_TOLERANCE,
}) {
  if (!messagesLength || messagesLength === 0) return false;
  if (scrollHeight <= clientHeight + tolerance) return false;
  return scrollHeight - scrollTop - clientHeight > tolerance;
}

/**
 * Resolves Ask Arise layout permissions and feature flags based on authentication state.
 *
 * Guest mode (not authenticated):
 * - Hide the conversation sidebar
 * - Hide AI Memory button and controls
 * - Expand chat panel to 100% available width without gaps
 *
 * Signed-in mode:
 * - Show sidebar and toggle controls
 * - Show AI Memory options
 *
 * @param {Object} params
 * @param {boolean} params.isAuthenticated - Auth source of truth
 * @returns {Object} Layout configuration
 */
export function resolveAskAriseLayoutFeatures({ isAuthenticated }) {
  const authed = Boolean(isAuthenticated);
  return {
    showSidebar: authed,
    showAiMemory: authed,
    sidebarToggleVisible: authed,
    chatPanelWidthClass: 'flex-1 w-full',
  };
}
