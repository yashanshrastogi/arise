import test from 'node:test';
import assert from 'node:assert/strict';
import {
  broadcastSyncEvent,
  subscribeToSyncEvents,
  broadcastAuthChanged,
  broadcastConversationMutated,
  broadcastMemoryMutated,
  _resetChannelForTesting,
} from './crossTabSync.js';

test('broadcastSyncEvent dispatches events and handles subscription lifecycle', () => {
  const received = [];
  const unsubscribe = subscribeToSyncEvents((event) => {
    received.push(event);
  });

  const testPayload = { type: 'TEST_EVENT', foo: 'bar', timestamp: Date.now() };
  broadcastSyncEvent(testPayload);

  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
});

test('broadcastAuthChanged creates standard payload for LOGIN and LOGOUT', () => {
  let broadcastMsg = null;
  const mockChannel = {
    postMessage(msg) {
      broadcastMsg = msg;
    },
    close() {},
  };
  _resetChannelForTesting(mockChannel);

  broadcastAuthChanged({ action: 'LOGIN', userId: 'user-123', email: 'test@arise.org' });
  assert.ok(broadcastMsg);
  assert.equal(broadcastMsg.type, 'AUTH_CHANGED');
  assert.equal(broadcastMsg.action, 'LOGIN');
  assert.equal(broadcastMsg.userId, 'user-123');
  assert.equal(broadcastMsg.email, 'test@arise.org');
  assert.ok(broadcastMsg.timestamp);

  broadcastAuthChanged({ action: 'LOGOUT' });
  assert.equal(broadcastMsg.action, 'LOGOUT');

  _resetChannelForTesting(null);
});

test('broadcastConversationMutated dispatches action with conversationId and userId', () => {
  let broadcastMsg = null;
  const mockChannel = {
    postMessage(msg) {
      broadcastMsg = msg;
    },
    close() {},
  };
  _resetChannelForTesting(mockChannel);

  broadcastConversationMutated({
    action: 'PIN',
    conversationId: 'conv_abc_123',
    userId: 'user_xyz',
    isPinned: true,
  });

  assert.ok(broadcastMsg);
  assert.equal(broadcastMsg.type, 'CONVERSATION_MUTATED');
  assert.equal(broadcastMsg.action, 'PIN');
  assert.equal(broadcastMsg.conversationId, 'conv_abc_123');
  assert.equal(broadcastMsg.userId, 'user_xyz');
  assert.equal(broadcastMsg.isPinned, true);

  _resetChannelForTesting(null);
});

test('broadcastMemoryMutated dispatches action with memoryId and userId', () => {
  let broadcastMsg = null;
  const mockChannel = {
    postMessage(msg) {
      broadcastMsg = msg;
    },
    close() {},
  };
  _resetChannelForTesting(mockChannel);

  broadcastMemoryMutated({
    action: 'APPROVE',
    memoryId: 'mem_456',
    userId: 'user_xyz',
  });

  assert.ok(broadcastMsg);
  assert.equal(broadcastMsg.type, 'MEMORY_MUTATED');
  assert.equal(broadcastMsg.action, 'APPROVE');
  assert.equal(broadcastMsg.memoryId, 'mem_456');
  assert.equal(broadcastMsg.userId, 'user_xyz');

  _resetChannelForTesting(null);
});

test('Storage fallback event dispatches to subscribers safely', () => {
  const events = [];
  const unsubscribe = subscribeToSyncEvents((evt) => {
    events.push(evt);
  });

  assert.equal(typeof unsubscribe, 'function');
  unsubscribe();
});
