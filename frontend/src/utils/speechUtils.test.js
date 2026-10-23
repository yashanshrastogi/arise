import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanSpeechText,
  buildSpeechText,
  isSpeechSynthesisSupported,
  stopSpeech,
} from './speechUtils.js';

test('cleanSpeechText strips markdown formatting, links, and redundant symbols', () => {
  const md = '**Severe air quality** with [CPCB telemetry](https://cpcb.nic.in). *Keep windows shut* and use `N95` mask.';
  const cleaned = cleanSpeechText(md);
  assert.strictEqual(
    cleaned,
    'Severe air quality with CPCB telemetry. Keep windows shut and use N95 mask.'
  );
});

test('buildSpeechText correctly formats full AI message with verdict, headline, observations, and actions', () => {
  const msg = {
    verdict: 'BE_SMART',
    headline: '**Moderate air quality** allows regular outdoor routines today across Central Delhi.',
    why: [
      'Indo-Gangetic basin calm winds limit **dispersion**',
      'Boundary layer mixing height is ~600m',
    ],
    do: [
      'Wear a snug N95 mask if outdoors for prolonged periods',
      'Move high-intensity cardio indoors',
    ],
    best_window: '3 PM – 5 PM',
  };

  const speech = buildSpeechText(msg);

  assert.ok(speech.includes('Verdict: BE SMART.'));
  assert.ok(speech.includes('Moderate air quality allows regular outdoor routines today across Central Delhi.'));
  assert.ok(speech.includes('Key observations: Indo-Gangetic basin calm winds limit dispersion. Boundary layer mixing height is ~600m.'));
  assert.ok(speech.includes('Recommended actions: Wear a snug N95 mask if outdoors for prolonged periods. Move high-intensity cardio indoors.'));
  assert.ok(speech.includes('Best time to go out: 3 PM – 5 PM.'));
});

test('buildSpeechText handles minimal and missing fields gracefully', () => {
  const minimalMsg = {
    verdict: 'GO',
    headline: 'Air quality is clear and safe for outdoor recess.',
  };

  const speech = buildSpeechText(minimalMsg);
  assert.strictEqual(
    speech,
    'Verdict: GO. Air quality is clear and safe for outdoor recess.'
  );

  // Null / empty check
  assert.strictEqual(buildSpeechText(null), '');
  assert.strictEqual(buildSpeechText({}), '');
});

test('buildSpeechText ignores Unavailable or No recommended window', () => {
  const msg = {
    verdict: 'STAY_IN',
    headline: 'Hazardous particulate levels.',
    best_window: 'Unavailable',
  };

  const speech = buildSpeechText(msg);
  assert.ok(!speech.includes('Best time to go out'));
});

test('buildSpeechText supports plain string message', () => {
  const speech = buildSpeechText('Stay indoors due to **high smog**.');
  assert.strictEqual(speech, 'Stay indoors due to high smog.');
});

test('isSpeechSynthesisSupported returns boolean and stopSpeech does not throw', () => {
  assert.strictEqual(typeof isSpeechSynthesisSupported(), 'boolean');
  assert.doesNotThrow(() => stopSpeech());
});
