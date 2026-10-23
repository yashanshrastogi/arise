/**
 * Arise Cross-Tab Synchronization Engine
 * Ensures consistent authenticated state, conversation history, and remarks
 * across multiple browser tabs using BroadcastChannel with localStorage/event fallback.
 */

const SYNC_CHANNEL_NAME = 'arise_cross_tab_sync';
const STORAGE_SYNC_KEY = 'arise_tab_sync_pulse';

// Unique ID for the current browser tab instance
export const CURRENT_TAB_ID = 'tab_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now();

let channelInstance = null;
const subscribers = new Set();
let isStorageListenerActive = false;
let lastProcessedTimestamp = 0;

export function _resetChannelForTesting(instance = null) {
  if (channelInstance && typeof channelInstance.close === 'function') {
    try {
      channelInstance.close();
    } catch {}
  }
  channelInstance = instance;
}

function getBroadcastChannel() {
  if (channelInstance) return channelInstance;
  const BC = (typeof window !== 'undefined' && typeof window.BroadcastChannel === 'function')
    ? window.BroadcastChannel
    : (typeof globalThis !== 'undefined' && typeof globalThis.BroadcastChannel === 'function' ? globalThis.BroadcastChannel : null);
  if (BC) {
    try {
      channelInstance = new BC(SYNC_CHANNEL_NAME);
      if (typeof channelInstance.unref === 'function') {
        channelInstance.unref();
      }
      channelInstance.onmessage = (event) => {
        if (!event || !event.data) return;
        notifySubscribers(event.data);
      };
    } catch (e) {
      console.warn('BroadcastChannel unavailable, falling back to storage events:', e.message);
      channelInstance = null;
    }
  }
  return channelInstance;
}

function notifySubscribers(payload) {
  if (!payload || typeof payload !== 'object') return;
  // Ignore self-broadcasts from the same tab
  if (payload.tabId === CURRENT_TAB_ID) return;

  // Prevent duplicate event processing within 50ms window
  if (payload.timestamp && payload.timestamp === lastProcessedTimestamp) return;
  lastProcessedTimestamp = payload.timestamp || Date.now();

  subscribers.forEach((callback) => {
    try {
      callback(payload);
    } catch (err) {
      console.warn('Error in cross-tab sync callback:', err);
    }
  });
}

function handleStorageEvent(e) {
  if (e.key !== STORAGE_SYNC_KEY || !e.newValue) return;
  try {
    const payload = JSON.parse(e.newValue);
    notifySubscribers(payload);
  } catch {
    // ignore
  }
}

function ensureStorageListener() {
  if (isStorageListenerActive || typeof window === 'undefined') return;
  window.addEventListener('storage', handleStorageEvent);
  isStorageListenerActive = true;
}

/**
 * Broadcasts an event to all other open tabs under the same origin.
 * @param {Object} event
 * @param {string} event.type - 'AUTH_CHANGED' | 'CONVERSATION_MUTATED' | 'MEMORY_MUTATED'
 * @param {string} [event.action] - 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'PIN' | 'ARCHIVE' | 'DELETE' | 'MESSAGE' | 'APPROVE'
 * @param {string} [event.userId] - Authenticated user ID (e.g. sub or email)
 * @param {string} [event.conversationId] - Affected conversation ID
 * @param {any} [event.payload] - Additional payload data (never credentials or full private chat)
 */
export function broadcastSyncEvent(event) {
  if (!event || !event.type) return;

  const payload = {
    ...event,
    tabId: CURRENT_TAB_ID,
    timestamp: Date.now(),
  };

  // 1. Try BroadcastChannel
  const ch = getBroadcastChannel();
  if (ch) {
    try {
      ch.postMessage(payload);
    } catch (e) {
      console.warn('BroadcastChannel postMessage failed:', e.message);
    }
  }

  // 2. Storage event fallback for cross-frame or environments where BroadcastChannel is blocked
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_SYNC_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota errors
    }
  }
}

/**
 * Subscribes to cross-tab synchronization events.
 * @param {Function} callback - Callback invoked when an event arrives from another tab.
 * @returns {Function} Unsubscribe cleanup function.
 */
export function subscribeToSyncEvents(callback) {
  if (typeof callback !== 'function') return () => {};

  subscribers.add(callback);
  getBroadcastChannel();
  ensureStorageListener();

  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Helper to dispatch auth changes (login, logout, profile update).
 */
export function broadcastAuthChanged({ action = 'LOGIN', userId = null, email = null } = {}) {
  broadcastSyncEvent({
    type: 'AUTH_CHANGED',
    action,
    userId,
    email,
  });
}

/**
 * Helper to dispatch conversation mutations (create, rename, pin, archive, delete, message).
 */
export function broadcastConversationMutated({
  action = 'UPDATE',
  conversationId = null,
  userId = null,
  title = null,
  isPinned = null,
  isArchived = null,
} = {}) {
  broadcastSyncEvent({
    type: 'CONVERSATION_MUTATED',
    action,
    conversationId,
    userId,
    title,
    isPinned,
    isArchived,
  });
}

/**
 * Helper to dispatch memory/remarks mutations (create, update, approve, delete).
 */
export function broadcastMemoryMutated({
  action = 'UPDATE',
  memoryId = null,
  userId = null,
} = {}) {
  broadcastSyncEvent({
    type: 'MEMORY_MUTATED',
    action,
    memoryId,
    userId,
  });
}
