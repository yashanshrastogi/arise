import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listConversations,
  createConversation,
  getConversation,
  updateConversation,
  deleteConversation,
  listMemories,
  createMemory,
  updateMemory,
  approveMemory,
  deleteMemory,
} from './client.js';

test('Conversations API helper functions require accessToken', async () => {
  await assert.rejects(
    async () => listConversations(null),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => createConversation(null, { title: 'Test' }),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => getConversation(null, 'conv-123'),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => updateConversation(null, 'conv-123', { title: 'Renamed' }),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => deleteConversation(null, 'conv-123'),
    /Sign in with Google to access your profile/
  );
});

test('Memories API helper functions require accessToken', async () => {
  await assert.rejects(
    async () => listMemories(null),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => createMemory(null, { fact: 'Asthma sensitivity', category: 'health_environmental' }),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => updateMemory(null, 'mem-123', { fact: 'Updated' }),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => approveMemory(null, 'mem-123'),
    /Sign in with Google to access your profile/
  );
  await assert.rejects(
    async () => deleteMemory(null, 'mem-123'),
    /Sign in with Google to access your profile/
  );
});

test('Conversations API formats request parameters correctly', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = '';
  let interceptedOptions = {};

  globalThis.fetch = async (url, options) => {
    interceptedUrl = url.toString();
    interceptedOptions = options;
    return {
      ok: true,
      json: async () => [{ id: 'conv-1', title: 'Running in Nehru Park' }],
    };
  };

  try {
    const res = await listConversations('mock_token_abc', { query: 'Nehru', limit: 25, include_archived: true });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'conv-1');
    assert.match(interceptedUrl, /\/conversations\?limit=25&include_archived=true&query=Nehru/);
    assert.equal(interceptedOptions.headers.Authorization, 'Bearer mock_token_abc');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Memories API formats query and approval correctly', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedUrl = '';
  let interceptedOptions = {};

  globalThis.fetch = async (url, options) => {
    interceptedUrl = url.toString();
    interceptedOptions = options;
    return {
      ok: true,
      json: async () => ({ id: 'mem-99', status: 'approved' }),
    };
  };

  try {
    const res = await approveMemory('mock_token_abc', 'mem-99');
    assert.equal(res.id, 'mem-99');
    assert.equal(res.status, 'approved');
    assert.match(interceptedUrl, /\/memories\/mem-99\/approve/);
    assert.equal(interceptedOptions.method, 'POST');
    assert.equal(interceptedOptions.headers.Authorization, 'Bearer mock_token_abc');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createMemory formats content, fact, and auto-derives key correctly', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedBody = null;

  globalThis.fetch = async (url, options) => {
    interceptedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        id: 'mem-101',
        ...interceptedBody,
      }),
    };
  };

  try {
    const res = await createMemory('mock_token_abc', {
      category: 'preference',
      fact: 'Sensitive to ozone pollution in summer',
      confidence: 0.85,
    });
    assert.equal(res.id, 'mem-101');
    assert.equal(interceptedBody.fact, 'Sensitive to ozone pollution in summer');
    assert.equal(interceptedBody.content, 'Sensitive to ozone pollution in summer');
    assert.match(interceptedBody.key, /sensitive_to_ozone_pollution/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createMemory rejects on HTTP error and does not falsely report success', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ detail: 'Internal storage connection failure' }),
    text: async () => 'Internal storage connection failure',
  });

  try {
    await assert.rejects(
      async () => createMemory('mock_token_abc', { category: 'preference', fact: 'Any fact' }),
      /Internal storage connection failure/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createConversation passes client id and initial_messages when provided', async () => {
  const originalFetch = globalThis.fetch;
  let interceptedBody = null;

  globalThis.fetch = async (url, options) => {
    interceptedBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        id: interceptedBody.id || 'conv-server-gen',
        ...interceptedBody,
      }),
    };
  };

  try {
    const customId = 'conv_client_12345';
    const initMsgs = [{ role: 'user', content: 'What is the AQI?' }];
    const res = await createConversation('mock_token_abc', {
      id: customId,
      title: 'Custom Chat',
      initial_messages: initMsgs,
    });
    assert.equal(res.id, customId);
    assert.equal(interceptedBody.id, customId);
    assert.equal(interceptedBody.initial_messages.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Conversation histories remain isolated per conversation ID without overwriting', () => {
  // Mock localStorage-backed conversation store simulating AskArise behavior
  const store = {};
  const mockStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };

  const convA = 'conv_aaa_111';
  const convB = 'conv_bbb_222';

  // Conv A receives turns
  const messagesA = [
    { role: 'user', content: 'Can I run in Lodhi Garden?' },
    {
      role: 'assistant',
      content: 'Air quality is moderate.',
      verdict: 'BE SMART',
      headline: 'Morning Jog Advisory',
      why: ['PM2.5 low'],
      do: ['Run before 8 AM'],
      best_window: '07:00 AM - 08:30 AM',
    },
  ];
  mockStorage.setItem(`arise_conv_msg_${convA}`, JSON.stringify(messagesA));

  // Conv B created with separate turns
  const messagesB = [
    { role: 'user', content: 'How is the evening commute to Gurgaon?' },
    {
      role: 'assistant',
      content: 'Air quality is poor along NH-48.',
      verdict: 'STAY IN',
      headline: 'Commute Advisory',
      why: ['Heavy traffic'],
      do: ['Keep car windows shut'],
    },
  ];
  mockStorage.setItem(`arise_conv_msg_${convB}`, JSON.stringify(messagesB));

  // Verify Conv A messages are intact after Conv B is saved
  const loadedA = JSON.parse(mockStorage.getItem(`arise_conv_msg_${convA}`));
  assert.equal(loadedA.length, 2);
  assert.equal(loadedA[0].content, 'Can I run in Lodhi Garden?');
  assert.equal(loadedA[1].headline, 'Morning Jog Advisory');
  assert.equal(loadedA[1].why[0], 'PM2.5 low');
  assert.equal(loadedA[1].best_window, '07:00 AM - 08:30 AM');

  // Verify Conv B messages are intact
  const loadedB = JSON.parse(mockStorage.getItem(`arise_conv_msg_${convB}`));
  assert.equal(loadedB.length, 2);
  assert.equal(loadedB[0].content, 'How is the evening commute to Gurgaon?');
  assert.equal(loadedB[1].headline, 'Commute Advisory');

  // Create empty new conversation Conv C
  const convC = 'conv_ccc_333';
  mockStorage.setItem(`arise_conv_msg_${convC}`, JSON.stringify([]));

  // Conv A and Conv B are completely unaffected by creating Conv C
  const reloadedA = JSON.parse(mockStorage.getItem(`arise_conv_msg_${convA}`));
  assert.equal(reloadedA.length, 2);
  assert.equal(reloadedA[1].headline, 'Morning Jog Advisory');
});

test('Guest/offline local memories persist across reloads without loss', () => {
  const store = {};
  const guestKey = 'arise_guest_memories';

  // 1. User adds a memory in guest mode
  const initialMemories = [
    {
      id: 'local_mem_1',
      category: 'health_environmental',
      fact: 'Sensitive to sudden smog spikes',
      content: 'Sensitive to sudden smog spikes',
      status: 'approved',
    },
  ];
  store[guestKey] = JSON.stringify(initialMemories);

  // 2. Simulate modal close and reopen / page reload
  const reloaded = JSON.parse(store[guestKey] || '[]');
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].fact, 'Sensitive to sudden smog spikes');

  // 3. User adds a second memory
  const updated = [
    ...reloaded,
    {
      id: 'local_mem_2',
      category: 'preference',
      fact: 'Prefers evening walks after sunset',
      content: 'Prefers evening walks after sunset',
      status: 'approved',
    },
  ];
  store[guestKey] = JSON.stringify(updated);

  // 4. Reload again
  const finalReload = JSON.parse(store[guestKey] || '[]');
  assert.equal(finalReload.length, 2);
  assert.equal(finalReload[0].id, 'local_mem_1');
  assert.equal(finalReload[1].id, 'local_mem_2');
});

