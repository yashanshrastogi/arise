import test from 'node:test';
import assert from 'node:assert/strict';
import { getAqiBandInfo, getWatchlistAqiColor, getWatchlistSeverityIcon } from './aqiBands.js';

test('getAqiBandInfo returns Unavailable band when AQI is null or undefined', () => {
  const nullBand = getAqiBandInfo(null);
  assert.equal(nullBand.band, 'Unavailable');
  assert.equal(nullBand.symbol, '—');
  assert.equal(nullBand.label, 'Air quality unavailable');
  assert.equal(nullBand.plainAction, 'No ground monitoring in range');

  const undefBand = getAqiBandInfo(undefined);
  assert.equal(undefBand.band, 'Unavailable');

  const emptyBand = getAqiBandInfo('');
  assert.equal(emptyBand.band, 'Unavailable');
});

test('getAqiBandInfo preserves authoritative CPCB classifications for valid numeric scores', () => {
  assert.equal(getAqiBandInfo(0).band, 'Good');
  assert.equal(getAqiBandInfo(45).band, 'Good');
  assert.equal(getAqiBandInfo(85).band, 'Satisfactory');
  assert.equal(getAqiBandInfo(150).band, 'Moderate');
  assert.equal(getAqiBandInfo(250).band, 'Poor');
  assert.equal(getAqiBandInfo(350).band, 'Very Bad');
  assert.equal(getAqiBandInfo(450).band, 'Severe');
});

test('Watchlist helpers handle null, missing, zero, and valid AQI values truthfully', () => {
  // 1. Null, undefined, empty string -> explicit neutral gray and em-dash (never green or checkmark)
  assert.equal(getWatchlistAqiColor(null), '#94a3b8');
  assert.equal(getWatchlistSeverityIcon(null), '—');
  assert.notEqual(getWatchlistAqiColor(null), '#067647', 'Null AQI must never receive green color');
  assert.notEqual(getWatchlistSeverityIcon(null), '✓', 'Null AQI must never receive checkmark icon');

  assert.equal(getWatchlistAqiColor(undefined), '#94a3b8');
  assert.equal(getWatchlistSeverityIcon(undefined), '—');

  assert.equal(getWatchlistAqiColor(''), '#94a3b8');
  assert.equal(getWatchlistSeverityIcon(''), '—');

  // 2. Zero AQI -> valid clean air score
  assert.equal(getWatchlistAqiColor(0), '#067647');
  assert.equal(getWatchlistSeverityIcon(0), '✓');

  // 3. Valid AQI values -> correct band colors and symbols
  assert.equal(getWatchlistAqiColor(45), '#067647');
  assert.equal(getWatchlistSeverityIcon(45), '✓');

  assert.equal(getWatchlistAqiColor(85), '#4D7C0F');
  assert.equal(getWatchlistSeverityIcon(85), '●');

  assert.equal(getWatchlistAqiColor(150), '#FDB022');
  assert.equal(getWatchlistSeverityIcon(150), '●');

  assert.equal(getWatchlistAqiColor(250), '#B54708');
  assert.equal(getWatchlistSeverityIcon(250), '▲');

  assert.equal(getWatchlistAqiColor(350), '#B42318');
  assert.equal(getWatchlistSeverityIcon(350), '■');

  assert.equal(getWatchlistAqiColor(450), '#7A1B3D');
  assert.equal(getWatchlistSeverityIcon(450), '⚠️');

  // 4. Watchlist score render simulation
  const renderItem = (w) => ({
    displayScore: w.aqi != null ? String(w.aqi) : '—',
    displayStatus: w.status || (w.aqi != null ? 'Good' : 'Unavailable'),
    col: getWatchlistAqiColor(w.aqi),
    icon: getWatchlistSeverityIcon(w.aqi),
  });

  const nullItem = renderItem({ name: 'London', aqi: null });
  assert.equal(nullItem.displayScore, '—');
  assert.equal(nullItem.displayStatus, 'Unavailable');
  assert.equal(nullItem.col, '#94a3b8');

  const zeroItem = renderItem({ name: 'Pristine Mountain', aqi: 0 });
  assert.equal(zeroItem.displayScore, '0');
  assert.equal(zeroItem.displayStatus, 'Good');
  assert.equal(zeroItem.col, '#067647');

  const validItem = renderItem({ name: 'Anand Vihar', aqi: 345 });
  assert.equal(validItem.displayScore, '345');
  assert.equal(validItem.col, '#B42318');
});

test('Degraded weather snapshot fields are truthy em-dashes and not 0°C', () => {
  // Simulates frontend render logic for degraded weather payload
  const degradedWeather = {
    temp: null,
    feelsLike: null,
    windSpeed: null,
    windDirection: '—',
    condition: 'Unavailable',
    source: 'Unavailable',
    data_provenance: 'degraded',
  };

  const displayTemp = degradedWeather.temp != null ? `${degradedWeather.temp}°C` : '—';
  const displayFeelsLike = degradedWeather.feelsLike != null ? `Feels like ${degradedWeather.feelsLike}°C` : 'Feels like —';
  const displayWind = degradedWeather.windSpeed != null ? `${degradedWeather.windSpeed} km/h` : '—';

  assert.equal(displayTemp, '—', 'Temperature should render as em-dash when unavailable');
  assert.notEqual(displayTemp, '0°C', 'Temperature must never render as deceptive 0°C');
  assert.equal(displayFeelsLike, 'Feels like —');
  assert.equal(displayWind, '—');
});
