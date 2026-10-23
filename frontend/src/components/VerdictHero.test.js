import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVerdictWindowStatus } from '../utils/verdictStatus.js';

test('resolveVerdictWindowStatus honors backend ground_calibrated status', () => {
  const status = resolveVerdictWindowStatus({
    bestWindowDetails: {
      status: 'ground_calibrated',
      window_str: '2 PM – 4 PM',
    },
    bwTaggedItems: [{ time: '2 PM' }, { time: '3 PM' }],
    currentAqi: 280,
    forecastAqiValues: [280, 200, 190],
  });
  assert.equal(status, 'ground_calibrated');
});

test('resolveVerdictWindowStatus honors backend model_projected status for uncalibrated forecast', () => {
  const status = resolveVerdictWindowStatus({
    bestWindowDetails: {
      status: 'model_projected',
      window_str: '4 PM – 6 PM',
    },
    modelTaggedItems: [{ time: '4 PM' }, { time: '5 PM' }],
    currentAqi: null,
    forecastAqiValues: [35, 30, 28],
  });
  assert.equal(status, 'model_projected');
});

test('resolveVerdictWindowStatus honors backend unsuitable status and rejects false positives', () => {
  // Even when a mathematical AQI improvement exists (350 -> 250),
  // if severe weather or risk ceiling made it unsuitable, it MUST remain 'unsuitable'
  const status = resolveVerdictWindowStatus({
    bestWindowDetails: {
      status: 'unsuitable',
      window_str: 'No recommended outdoor window',
    },
    bwTaggedItems: [],
    modelTaggedItems: [],
    currentAqi: 350,
    forecastAqiValues: [350, 250, 240],
    candidatePoints: [{ aqi: 350 }, { aqi: 250 }, { aqi: 240 }],
  });
  assert.equal(status, 'unsuitable');
});

test('resolveVerdictWindowStatus returns unsuitable when currentAqi is valid but no window items are tagged', () => {
  const status = resolveVerdictWindowStatus({
    bestWindowDetails: null,
    bwTaggedItems: [],
    modelTaggedItems: [],
    currentAqi: 320,
    forecastAqiValues: [320, 315, 310],
    candidatePoints: [{ aqi: 320 }, { aqi: 315 }, { aqi: 310 }],
  });
  assert.equal(status, 'unsuitable');
});

test('resolveVerdictWindowStatus returns forecast_unavailable when forecast data is empty', () => {
  const statusNull = resolveVerdictWindowStatus({
    bestWindowDetails: null,
    bwTaggedItems: [],
    modelTaggedItems: [],
    currentAqi: null,
    forecastAqiValues: [],
    candidatePoints: [],
  });
  assert.equal(statusNull, 'forecast_unavailable');

  const statusWithCurrent = resolveVerdictWindowStatus({
    bestWindowDetails: null,
    bwTaggedItems: [],
    modelTaggedItems: [],
    currentAqi: 120,
    forecastAqiValues: [],
    candidatePoints: [],
  });
  assert.equal(statusWithCurrent, 'forecast_unavailable');
});

test('resolveVerdictWindowStatus returns current_unavailable_no_window when currentAqi is null and no model window formed', () => {
  const status = resolveVerdictWindowStatus({
    bestWindowDetails: null,
    bwTaggedItems: [],
    modelTaggedItems: [],
    currentAqi: null,
    forecastAqiValues: [350, 340, 330],
    candidatePoints: [{ aqi: 350 }, { aqi: 340 }, { aqi: 330 }],
  });
  assert.equal(status, 'current_unavailable_no_window');
});
