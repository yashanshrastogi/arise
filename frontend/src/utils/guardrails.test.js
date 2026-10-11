import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEnvironmentalQuery, getOutOfScopeGuardrailResponse } from './guardrails.js';

test('isEnvironmentalQuery rejects off-topic queries', () => {
  const offTopic = [
    'what is car',
    'write python code for me',
    'who is elon musk',
    'solve 2 + 2',
    'recipe for pizza',
    'write an essay on cars',
    'tell me a joke',
  ];
  for (const q of offTopic) {
    assert.strictEqual(
      isEnvironmentalQuery(q),
      false,
      `Query "${q}" should be rejected by guardrail`
    );
  }
});

test('isEnvironmentalQuery accepts relevant environmental queries', () => {
  const inScope = [
    'Can I go out now?',
    'What is the temperature right now?',
    'Can my kid play outside?',
    'Why is the AQI bad today?',
    'Write a python script to fetch air data',
    'What mask should I wear?',
    'Is it safe to exercise?',
    'Should my school cancel outdoor sports?',
    'How do car emissions affect PM2.5 in Delhi?',
    'What are the current wind speeds?',
  ];
  for (const q of inScope) {
    assert.strictEqual(
      isEnvironmentalQuery(q),
      true,
      `Query "${q}" should be accepted by guardrail`
    );
  }
});

test('getOutOfScopeGuardrailResponse returns friendly user training with highlighted keywords', () => {
  const resp = getOutOfScopeGuardrailResponse('what is car');
  assert.strictEqual(resp.verdict, 'BE SMART');
  assert.ok(resp.headline.includes('**air quality**'));
  assert.ok(resp.headline.includes('**environmental intelligence assistant**'));
  assert.ok(resp.why.length > 0);
  assert.ok(resp.do.length >= 3);
  assert.strictEqual(resp.is_rule_based, true);
});
