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
  DEFAULT_TIMEZONE,
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
