import test from 'node:test';
import assert from 'node:assert/strict';
import { stripLeadingIcon } from './advisoryUtils.js';

test('stripLeadingIcon removes leading warning signs to avoid duplicate icons', () => {
  const severeAdvisory = '⚠️ Severe pollution corridor (Peak AQI 323 at Home). Keep vehicle windows sealed.';
  assert.equal(
    stripLeadingIcon(severeAdvisory),
    'Severe pollution corridor (Peak AQI 323 at Home). Keep vehicle windows sealed.'
  );

  const poorAdvisory = '⚠️ Poor air quality along route (Peak AQI 240 at Work).';
  assert.equal(
    stripLeadingIcon(poorAdvisory),
    'Poor air quality along route (Peak AQI 240 at Work).'
  );
});

test('stripLeadingIcon removes other leading weather and status emojis', () => {
  assert.equal(
    stripLeadingIcon('🌧️ Wet road conditions expected along commute corridor.'),
    'Wet road conditions expected along commute corridor.'
  );
  assert.equal(
    stripLeadingIcon('✅ Clear meteorological conditions along commute route.'),
    'Clear meteorological conditions along commute route.'
  );
  assert.equal(
    stripLeadingIcon('ℹ️ Moderate particulate exposure along corridor (Average AQI 120).'),
    'Moderate particulate exposure along corridor (Average AQI 120).'
  );
  assert.equal(
    stripLeadingIcon('😷 Sensitive commuters should wear a mask.'),
    'Sensitive commuters should wear a mask.'
  );
  assert.equal(
    stripLeadingIcon('● Moderate particulate advisory.'),
    'Moderate particulate advisory.'
  );
});

test('stripLeadingIcon preserves text that has no leading emojis', () => {
  const plainText = 'Favorable air quality along commute corridor. Normal outdoor activity permitted.';
  assert.equal(stripLeadingIcon(plainText), plainText);
});

test('stripLeadingIcon handles null, undefined, empty, or non-string inputs safely', () => {
  assert.equal(stripLeadingIcon(null), '');
  assert.equal(stripLeadingIcon(undefined), '');
  assert.equal(stripLeadingIcon(''), '');
  assert.equal(stripLeadingIcon(123), '');
});
