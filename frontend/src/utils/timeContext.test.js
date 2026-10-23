import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatKolkataTime,
  formatKolkataDate,
  formatKolkataShortDate,
  getKolkataHour,
  parseHourLabel,
  computeDynamicRecheckTime,
  synchronizeForecastTimeline,
  computeOutdoorWindowImprovement,
  DEFAULT_TIMEZONE,
  isWakingOutdoorHour,
  MIN_OUTDOOR_WAKING_HOUR,
  MAX_OUTDOOR_WAKING_HOUR,
} from './timeContext.js';

test('formats time in Asia/Kolkata regardless of input timezone', () => {
  // 2026-10-11T06:40:00Z is 12:10 PM IST (+05:30)
  const utcDate = new Date('2026-10-11T06:40:00Z');
  const timeStr = formatKolkataTime(utcDate);
  assert.match(timeStr, /12:10\s*PM/i);
});

test('formats date in Asia/Kolkata with correct weekday and day', () => {
  const utcDate = new Date('2026-10-11T06:40:00Z');
  const dateStr = formatKolkataDate(utcDate);
  assert.ok(dateStr.includes('Sunday'));
  assert.ok(dateStr.includes('11'));
  assert.ok(dateStr.includes('2026'));
});

test('correctly handles midnight rollover across UTC and IST', () => {
  // 2026-10-11T19:00:00Z is 2026-10-12 00:30 AM IST (next day!)
  const rolloverDate = new Date('2026-10-11T19:00:00Z');
  const hour = getKolkataHour(rolloverDate);
  assert.strictEqual(hour, 0); // midnight in Kolkata

  const dateStr = formatKolkataDate(rolloverDate);
  assert.ok(dateStr.includes('Monday'));
  assert.ok(dateStr.includes('12'));
});

test('parses hour labels accurately into 24h integers', () => {
  assert.strictEqual(parseHourLabel('6 AM'), 6);
  assert.strictEqual(parseHourLabel('12 PM'), 12);
  assert.strictEqual(parseHourLabel('1 PM'), 13);
  assert.strictEqual(parseHourLabel('8 PM'), 20);
  assert.strictEqual(parseHourLabel('12 AM'), 0);
});

test('computes dynamic future recheck time', () => {
  // At 12:10 PM IST, +3 hours should be 3:00 PM
  const midday = new Date('2026-10-11T06:40:00Z');
  const recheck = computeDynamicRecheckTime(midday, 3);
  assert.strictEqual(recheck, '3:00 PM');
});

test('synchronizes forecast timeline and labels current hour accurately at 12:10 PM IST', () => {
  // Current time: 12:10 PM IST (UTC 06:40)
  const fixedNow = new Date('2026-10-11T06:40:00Z');

  const sampleForecast = [
    { time: '6 AM', aqi: 240, past: false },
    { time: '7 AM', aqi: 260, past: false },
    { time: '8 AM', aqi: 280, past: false },
    { time: '9 AM', aqi: 295, past: false },
    { time: '10 AM', aqi: 312, past: false },
    { time: '11 AM', aqi: 318, past: false },
    { time: '12 PM', aqi: 310, past: false },
    { time: '1 PM', aqi: 295, past: false },
    { time: '2 PM', aqi: 275, past: false },
    { time: '3 PM', aqi: 230, past: false },
    { time: '4 PM', aqi: 220, past: false },
    { time: '5 PM', aqi: 235, past: false },
    { time: '6 PM', aqi: 280, past: false },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 310, fixedNow);

  // 12 PM should be identified as nowIdx
  assert.strictEqual(result.nowIdx, 6);
  assert.strictEqual(result.nowTime, '12 PM');

  // Past points (6 AM - 11 AM) must be flagged past: true
  assert.strictEqual(result.synchronizedForecast[0].past, true); // 6 AM
  assert.strictEqual(result.synchronizedForecast[5].past, true); // 11 AM

  // 12 PM point must NOT be past
  assert.strictEqual(result.synchronizedForecast[6].past, false);
  assert.strictEqual(result.synchronizedForecast[6].isCurrent, true);

  // Expired morning hours (e.g. 6 AM) must NEVER be recommended as best window!
  assert.strictEqual(result.synchronizedForecast[0].bestWindow, false);
  assert.strictEqual(result.synchronizedForecast[1].bestWindow, false);

  // If future has an improved window (3 PM - 5 PM), it should be selected
  assert.ok(result.bestWindowStr.includes('3 PM'));
});

test('rejects expired morning windows even if morning AQI was lower', () => {
  const afternoonNow = new Date('2026-10-11T06:45:00Z'); // 12:15 PM IST

  const sampleForecast = [
    { time: '6 AM', aqi: 120, past: false }, // lowest AQI, but in the PAST
    { time: '7 AM', aqi: 130, past: false },
    { time: '12 PM', aqi: 320, past: false },
    { time: '1 PM', aqi: 315, past: false },
    { time: '2 PM', aqi: 310, past: false },
    { time: '3 PM', aqi: 305, past: false },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 320, afternoonNow);

  // 6 AM and 7 AM must be past
  assert.strictEqual(result.synchronizedForecast[0].past, true);
  assert.strictEqual(result.synchronizedForecast[1].past, true);

  // 6 AM must NOT be recommended!
  assert.strictEqual(result.synchronizedForecast[0].bestWindow, false);
  assert.strictEqual(result.bestWindowStr.includes('6 AM'), false);
});

test('formats local time in worldwide timezones (London, New York, Tokyo)', () => {
  // 2026-10-11T12:00:00Z
  const utcDate = new Date('2026-10-11T12:00:00Z');

  // London in BST (+01:00) -> 01:00 PM
  const londonTime = formatKolkataTime(utcDate, { timeZone: 'Europe/London' });
  assert.match(londonTime, /01:00\s*PM/i);

  // New York in EDT (-04:00) -> 08:00 AM
  const nyTime = formatKolkataTime(utcDate, { timeZone: 'America/New_York' });
  assert.match(nyTime, /08:00\s*AM/i);

  // Tokyo in JST (+09:00) -> 09:00 PM
  const tokyoTime = formatKolkataTime(utcDate, { timeZone: 'Asia/Tokyo' });
  assert.match(tokyoTime, /09:00\s*PM/i);
});

test('handles local hour calculation across different timezones', () => {
  // 2026-10-11T23:30:00Z: 7:30 PM EDT in NY, 8:30 AM next day (Oct 12) in Tokyo
  const sampleDate = new Date('2026-10-11T23:30:00Z');

  const nyHour = getKolkataHour(sampleDate, { timeZone: 'America/New_York' });
  assert.strictEqual(nyHour, 19); // 7 PM

  const tokyoHour = getKolkataHour(sampleDate, { timeZone: 'Asia/Tokyo' });
  assert.strictEqual(tokyoHour, 8); // 8 AM next day
});

test('synchronizes forecast timeline with specific local timezone', () => {
  // 12:00 UTC = 8:00 AM New York (EDT)
  const utcNoon = new Date('2026-10-11T12:00:00Z');

  const sampleForecast = [
    { time: '7 AM', aqi: 50, past: false },
    { time: '8 AM', aqi: 65, past: false },
    { time: '9 AM', aqi: 80, past: false },
    { time: '10 AM', aqi: 90, past: false },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 65, utcNoon, 'America/New_York');

  // In NY time, 8 AM is current point (nowIdx = 1)
  assert.strictEqual(result.nowIdx, 1);
  assert.strictEqual(result.synchronizedForecast[0].past, true); // 7 AM is past
  assert.strictEqual(result.synchronizedForecast[1].past, false); // 8 AM is current
  assert.strictEqual(result.synchronizedForecast[1].isCurrent, true);
});

test('synchronizeForecastTimeline handles null, undefined, zero, and positive AQI truthfully', () => {
  const fixedNow = new Date('2026-10-11T06:40:00Z'); // 12:10 PM IST
  const sampleForecast = [
    { time: '11 AM', aqi: 310, past: false },
    { time: '12 PM', aqi: 300, past: false },
    { time: '1 PM', aqi: 280, past: false },
    { time: '2 PM', aqi: 220, past: false },
    { time: '3 PM', aqi: 210, past: false },
  ];

  // 1. AQI null: baseline is unavailable; no fabricated improvement percentage or invented best window
  const nullResult = synchronizeForecastTimeline(sampleForecast, null, fixedNow);
  assert.strictEqual(nullResult.hasRealBestWindow, false);
  assert.strictEqual(nullResult.bestWindowStr, 'No recommended outdoor window');
  assert.strictEqual(nullResult.minFutureAqi, 210);
  assert.ok(nullResult.synchronizedForecast.every(pt => pt.bestWindow === false));

  // 2. AQI undefined: same truthful handling as null without defaulting to 312
  const undefResult = synchronizeForecastTimeline(sampleForecast, undefined, fixedNow);
  assert.strictEqual(undefResult.hasRealBestWindow, false);
  assert.strictEqual(undefResult.bestWindowStr, 'No recommended outdoor window');

  // 3. AQI 0: valid clean air baseline; no division-by-zero or NaN
  const zeroResult = synchronizeForecastTimeline(sampleForecast, 0, fixedNow);
  assert.strictEqual(zeroResult.hasRealBestWindow, false);
  assert.strictEqual(zeroResult.bestWindowStr, 'No recommended outdoor window');
  assert.strictEqual(Number.isNaN(zeroResult.minFutureAqi), false);

  // 4. Normal positive AQI: valid improvement calculation
  const posResult = synchronizeForecastTimeline(sampleForecast, 300, fixedNow);
  assert.strictEqual(posResult.hasRealBestWindow, true);
  assert.ok(posResult.bestWindowStr.includes('PM'));
});

test('computeOutdoorWindowImprovement enforces baseline truthfulness and prevents division-by-zero', () => {
  // 1. AQI null: no baseline -> percentImprovement is 0, hasRealSafeWindow is false
  const nullEval = computeOutdoorWindowImprovement({
    currentAqi: null,
    nowVal: null,
    minFutureAqi: 150,
    bwStart: '3 PM',
    bwEnd: '5 PM',
  });
  assert.strictEqual(nullEval.hasEffectiveBaseline, false);
  assert.strictEqual(nullEval.currentVal, null);
  assert.strictEqual(nullEval.percentImprovement, 0);
  assert.strictEqual(nullEval.hasRealSafeWindow, false);

  // 2. AQI undefined: no baseline -> percentImprovement is 0, hasRealSafeWindow is false
  const undefEval = computeOutdoorWindowImprovement({
    currentAqi: undefined,
    nowVal: null,
    minFutureAqi: 150,
    bwStart: '3 PM',
    bwEnd: '5 PM',
  });
  assert.strictEqual(undefEval.hasEffectiveBaseline, false);
  assert.strictEqual(undefEval.currentVal, null);
  assert.strictEqual(undefEval.percentImprovement, 0);
  assert.strictEqual(undefEval.hasRealSafeWindow, false);

  // 3. AQI 0: valid clean baseline -> no division-by-zero, no NaN or Infinity
  const zeroEval = computeOutdoorWindowImprovement({
    currentAqi: 0,
    nowVal: 0,
    minFutureAqi: 0,
    bwStart: '3 PM',
    bwEnd: '5 PM',
  });
  assert.strictEqual(zeroEval.hasEffectiveBaseline, true);
  assert.strictEqual(zeroEval.currentVal, 0);
  assert.strictEqual(zeroEval.percentImprovement, 0);
  assert.strictEqual(Number.isFinite(zeroEval.percentImprovement), true);
  assert.strictEqual(Number.isNaN(zeroEval.percentImprovement), false);
  assert.strictEqual(zeroEval.hasRealSafeWindow, false);

  // 4. Normal positive AQI with >= 15% improvement
  const posEval = computeOutdoorWindowImprovement({
    currentAqi: 312,
    nowVal: 312,
    minFutureAqi: 220,
    bwStart: '3 PM',
    bwEnd: '5 PM',
  });
  assert.strictEqual(posEval.hasEffectiveBaseline, true);
  assert.strictEqual(posEval.currentVal, 312);
  assert.ok(posEval.percentImprovement >= 0.15);
  assert.strictEqual(posEval.isBetterBand, true);
  assert.strictEqual(posEval.hasRealSafeWindow, true);
});

test('synchronizeForecastTimeline identifies model window when currentAqi is null', () => {
  const fixedNow = new Date('2026-10-11T06:40:00Z'); // 12:10 PM IST
  const sampleForecast = [
    { time: '12 PM', aqi: 120, past: false, precip: 0, rainProb: 10, windKmh: 10 },
    { time: '1 PM', aqi: 80, past: false, precip: 0, rainProb: 10, windKmh: 10 },
    { time: '2 PM', aqi: 70, past: false, precip: 0, rainProb: 10, windKmh: 10 },
    { time: '3 PM', aqi: 75, past: false, precip: 0, rainProb: 10, windKmh: 10 },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, null, fixedNow);

  // hasRealBestWindow remains false (ground truth not established)
  assert.strictEqual(result.hasRealBestWindow, false);
  // Model window is detected and cleanly exposed
  assert.strictEqual(result.hasModelWindow, true);
  assert.strictEqual(result.windowStatus, 'model_projected');
  assert.ok(result.modelWindowStr.includes('PM'));
  // Point flags
  const modelPoints = result.synchronizedForecast.filter(p => p.modelWindow);
  assert.ok(modelPoints.length > 0);
});

test('synchronizeForecastTimeline rejects hours with severe precipitation (>= 1.0mm)', () => {
  const fixedNow = new Date('2026-10-11T06:40:00Z');
  const sampleForecast = [
    { time: '12 PM', aqi: 100, precip: 0, rainProb: 10, windKmh: 10 },
    // 1-3 PM has great AQI (40) but heavy rain (3.5mm)
    { time: '1 PM', aqi: 40, precip: 3.5, rainProb: 95, windKmh: 12 },
    { time: '2 PM', aqi: 40, precip: 3.5, rainProb: 95, windKmh: 12 },
    { time: '3 PM', aqi: 40, precip: 3.5, rainProb: 95, windKmh: 12 },
    // 4-6 PM has moderate AQI (70) and dry weather (0mm)
    { time: '4 PM', aqi: 70, precip: 0, rainProb: 10, windKmh: 10 },
    { time: '5 PM', aqi: 75, precip: 0, rainProb: 10, windKmh: 10 },
    { time: '6 PM', aqi: 70, precip: 0, rainProb: 10, windKmh: 10 },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 100, fixedNow);

  // Rainy hours (1-3 PM) must not be chosen despite lower AQI
  assert.strictEqual(result.synchronizedForecast[1].bestWindow, false);
  assert.strictEqual(result.synchronizedForecast[2].bestWindow, false);
  // Dry hours (4-6 PM) should be chosen
  assert.ok(result.bestWindowStr.includes('4 PM'));
});

test('synchronizeForecastTimeline rejects hours with high wind (> 30 km/h) or gusts (> 45 km/h)', () => {
  const fixedNow = new Date('2026-10-11T06:40:00Z');
  const sampleForecast = [
    { time: '12 PM', aqi: 120, precip: 0, rainProb: 10, windKmh: 10 },
    // 1-3 PM has low AQI but dangerously high wind gusts
    { time: '1 PM', aqi: 50, precip: 0, rainProb: 10, windKmh: 35, windGustsKmh: 55 },
    { time: '2 PM', aqi: 50, precip: 0, rainProb: 10, windKmh: 35, windGustsKmh: 55 },
    { time: '3 PM', aqi: 50, precip: 0, rainProb: 10, windKmh: 35, windGustsKmh: 55 },
    // 4-6 PM has calm wind and acceptable AQI
    { time: '4 PM', aqi: 80, precip: 0, rainProb: 10, windKmh: 10, windGustsKmh: 18 },
    { time: '5 PM', aqi: 85, precip: 0, rainProb: 10, windKmh: 10, windGustsKmh: 18 },
    { time: '6 PM', aqi: 80, precip: 0, rainProb: 10, windKmh: 10, windGustsKmh: 18 },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 120, fixedNow);

  // Gale hours must not be chosen
  assert.strictEqual(result.synchronizedForecast[1].bestWindow, false);
  assert.strictEqual(result.synchronizedForecast[2].bestWindow, false);
  // Calm hours chosen
  assert.ok(result.bestWindowStr.includes('4 PM'));
});

test('synchronizeForecastTimeline allows high rain probability if precipitation is negligible', () => {
  const fixedNow = new Date('2026-10-11T06:40:00Z');
  const sampleForecast = [
    { time: '12 PM', aqi: 150, precip: 0, rainProb: 10, windKmh: 10 },
    // 1-3 PM has 65% rain prob but 0.0mm precip and excellent AQI
    { time: '1 PM', aqi: 60, precip: 0.0, rainProb: 65, windKmh: 12 },
    { time: '2 PM', aqi: 65, precip: 0.1, rainProb: 65, windKmh: 12 },
    { time: '3 PM', aqi: 60, precip: 0.0, rainProb: 65, windKmh: 12 },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 150, fixedNow);

  // 1-3 PM should be accepted as best window
  assert.strictEqual(result.hasRealBestWindow, true);
  assert.ok(result.bestWindowStr.includes('1 PM'));
});

test('isWakingOutdoorHour enforces 6:00 AM to 10:00 PM boundary and rejects overnight hours', () => {
  // Overnight hours (10:01 PM - 5:59 AM) must be rejected
  assert.strictEqual(isWakingOutdoorHour(0), false);  // 12 AM / Midnight
  assert.strictEqual(isWakingOutdoorHour(1), false);  // 1 AM
  assert.strictEqual(isWakingOutdoorHour(2), false);  // 2 AM
  assert.strictEqual(isWakingOutdoorHour(3), false);  // 3 AM
  assert.strictEqual(isWakingOutdoorHour(4), false);  // 4 AM
  assert.strictEqual(isWakingOutdoorHour(5), false);  // 5 AM
  assert.strictEqual(isWakingOutdoorHour(23), false); // 11 PM

  // Waking hours (6:00 AM - 10:00 PM) must be accepted
  assert.strictEqual(isWakingOutdoorHour(6), true);   // 6 AM
  assert.strictEqual(isWakingOutdoorHour(7), true);   // 7 AM
  assert.strictEqual(isWakingOutdoorHour(12), true);  // 12 PM
  assert.strictEqual(isWakingOutdoorHour(17), true);  // 5 PM
  assert.strictEqual(isWakingOutdoorHour(21), true);  // 9 PM
  assert.strictEqual(isWakingOutdoorHour(22), true);  // 10 PM
});

test('synchronizeForecastTimeline never recommends overnight hours (12 AM - 5 AM) even if AQI is lowest', () => {
  // Current time: 12:43 AM IST (midnight)
  // Date: 2026-10-21T19:13:00Z -> 2026-10-22 00:43:00 IST
  const midnightNow = new Date('2026-10-21T19:13:00Z');

  const sampleForecast = [
    { time: '12 AM', aqi: 161, past: false },
    { time: '1 AM', aqi: 140, past: false },
    { time: '2 AM', aqi: 135, past: false },
    { time: '3 AM', aqi: 130, past: false },
    { time: '4 AM', aqi: 135, past: false },
    { time: '5 AM', aqi: 140, past: false },
    { time: '6 AM', aqi: 120, past: false },
    { time: '7 AM', aqi: 110, past: false },
    { time: '8 AM', aqi: 115, past: false },
    { time: '9 AM', aqi: 180, past: false },
    { time: '10 AM', aqi: 200, past: false },
  ];

  const result = synchronizeForecastTimeline(sampleForecast, 161, midnightNow);

  // 12 AM is the current hour
  assert.strictEqual(result.nowTime, '12 AM');

  // Midnight hours (12 AM, 1 AM, 2 AM, 3 AM, 4 AM, 5 AM) must NEVER be flagged bestWindow
  assert.strictEqual(result.synchronizedForecast[0].bestWindow, false, '12 AM must not be best window');
  assert.strictEqual(result.synchronizedForecast[1].bestWindow, false, '1 AM must not be best window');
  assert.strictEqual(result.synchronizedForecast[2].bestWindow, false, '2 AM must not be best window');
  assert.strictEqual(result.synchronizedForecast[3].bestWindow, false, '3 AM must not be best window');
  assert.strictEqual(result.synchronizedForecast[4].bestWindow, false, '4 AM must not be best window');
  assert.strictEqual(result.synchronizedForecast[5].bestWindow, false, '5 AM must not be best window');

  // The recommended best window must be the morning waking window (6 AM – 8 AM)
  assert.ok(result.bestWindowStr.includes('6 AM'), `Expected 6 AM in bestWindowStr, got: ${result.bestWindowStr}`);
  assert.strictEqual(result.synchronizedForecast[6].bestWindow, true); // 6 AM
  assert.strictEqual(result.synchronizedForecast[7].bestWindow, true); // 7 AM
  assert.strictEqual(result.synchronizedForecast[8].bestWindow, true); // 8 AM
});
