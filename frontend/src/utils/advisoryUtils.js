/**
 * advisoryUtils.js
 * Pure deterministic utility functions for cleaning and formatting commute/environmental advisories.
 */

/**
 * Strips leading emoji/icon from advisory text to prevent double icons when rendered alongside UI icon badges.
 * Handles Unicode emojis (⚠️, 🌧️, ✅, ℹ️, 😷, etc.), symbols (●), and following whitespace.
 *
 * @param {string} text - Raw advisory text
 * @returns {string} Sanitized advisory text without redundant leading icon
 */
export function stripLeadingIcon(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s●⚠️🌧️✅ℹ️😷]+/u, '').trim();
}
