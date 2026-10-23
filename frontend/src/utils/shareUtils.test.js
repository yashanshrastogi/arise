import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateAdvisoryCardBlob,
  captureConversationTurnBlob,
  shareAdvisoryCard,
} from './shareUtils.js';

test('ShareUtils: Exports required capture and fallback methods', () => {
  assert.equal(typeof generateAdvisoryCardBlob, 'function');
  assert.equal(typeof captureConversationTurnBlob, 'function');
  assert.equal(typeof shareAdvisoryCard, 'function');
});

test('ShareUtils: captureConversationTurnBlob returns null gracefully when element is null or in non-DOM environment', async () => {
  const result = await captureConversationTurnBlob(null);
  assert.equal(result, null, 'Must return null gracefully when element is missing');
});

test('ShareUtils: generateAdvisoryCardBlob respects dark and light theme options', async () => {
  // Mock canvas in Node environment
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            scale: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            fillText: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            roundRect: () => {},
            measureText: (txt) => ({ width: txt.length * 8 }),
          }),
          toBlob: (cb) => {
            cb(new Blob(['mock-png-data'], { type: 'image/png' }));
          },
        };
      }
      return {};
    },
  };

  const darkBlob = await generateAdvisoryCardBlob({
    question: 'How is the air today?',
    verdict: 'STAY IN',
    headline: 'Air is Very Poor.',
    why: ['PM2.5 elevated'],
    doActions: ['Stay indoors'],
    isDark: true,
  });

  assert.ok(darkBlob, 'Dark blob must be created');
  assert.equal(darkBlob.type, 'image/png');

  const lightBlob = await generateAdvisoryCardBlob({
    question: 'How is the air today?',
    verdict: 'GO',
    headline: 'Air is Good.',
    why: ['Low PM2.5'],
    doActions: ['Outdoor running safe'],
    isDark: false,
  });

  assert.ok(lightBlob, 'Light blob must be created');
  assert.equal(lightBlob.type, 'image/png');
});

test('ShareUtils: shareAdvisoryCard gracefully falls back to card generator when element is absent', async () => {
  let createdUrl = null;
  let clicked = false;

  global.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  };

  global.document = {
    documentElement: {
      classList: { contains: () => false },
    },
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            scale: () => {},
            fillRect: () => {},
            strokeRect: () => {},
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            fillText: () => {},
            moveTo: () => {},
            lineTo: () => {},
            stroke: () => {},
            roundRect: () => {},
            measureText: (txt) => ({ width: txt.length * 8 }),
          }),
          toBlob: (cb) => cb(new Blob(['mock-bytes'], { type: 'image/png' })),
        };
      }
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: () => { clicked = true; },
        };
      }
      return {};
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  const res = await shareAdvisoryCard({
    element: null, // triggers fallback
    question: 'Can I exercise outdoors?',
    verdict: 'CUT BACK',
    headline: 'Air quality is Poor.',
    why: ['PM2.5 is high'],
    doActions: ['Wear a mask'],
    locationName: 'Delhi',
    timestamp: 'Today',
  });

  assert.equal(res.success, true);
  assert.equal(res.method, 'download');
  assert.equal(clicked, true, 'Fallback must trigger file download');
});
