import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KNOWN_COORDS,
  forwardGeocode,
  reverseGeocode,
} from './geoUtils.js';

test('KNOWN_COORDS contains valid coordinates for Delhi-NCR locations', () => {
  for (const [key, coords] of Object.entries(KNOWN_COORDS)) {
    assert.ok(typeof coords.lat === 'number', `${key} latitude is number`);
    assert.ok(typeof coords.lon === 'number', `${key} longitude is number`);
    assert.ok(coords.lat >= -90 && coords.lat <= 90, `${key} latitude within bounds`);
    assert.ok(coords.lon >= -180 && coords.lon <= 180, `${key} longitude within bounds`);
  }
});

test('forwardGeocode resolves known address strings with mock network responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('Greater%20Noida')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              geometry: { coordinates: [77.51376, 28.46707] },
              properties: { name: 'Greater Noida', city: 'Greater Noida', state: 'Uttar Pradesh', country: 'India' },
            }],
          }),
        };
      }
      if (urlStr.includes('Sector%2018%20Noida')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              geometry: { coordinates: [77.3245, 28.5708] },
              properties: { name: 'Sector 18', city: 'Noida', state: 'Uttar Pradesh', country: 'India' },
            }],
          }),
        };
      }
      if (urlStr.includes('Mumbai')) {
        return {
          ok: true,
          json: async () => ({
            features: [{
              geometry: { coordinates: [72.8777, 19.0760] },
              properties: { name: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', country: 'India' },
            }],
          }),
        };
      }
      return { ok: false };
    };

    const gn = await forwardGeocode('Greater Noida');
    assert.ok(gn, 'Greater Noida resolved');
    assert.ok(Math.abs(gn.lat - 28.47) < 0.1, `Greater Noida lat close to 28.47 (got ${gn.lat})`);
    assert.ok(Math.abs(gn.lon - 77.50) < 0.1, `Greater Noida lon close to 77.50 (got ${gn.lon})`);
    assert.strictEqual(gn.source, 'photon');

    const noida = await forwardGeocode('Sector 18 Noida');
    assert.ok(noida, 'Noida resolved');
    assert.ok(Math.abs(noida.lat - 28.57) < 0.1, `Noida lat close to 28.57 (got ${noida.lat})`);
    assert.ok(Math.abs(noida.lon - 77.35) < 0.1, `Noida lon close to 77.35 (got ${noida.lon})`);
    assert.strictEqual(noida.source, 'photon');

    const mumbai = await forwardGeocode('Mumbai, Maharashtra');
    assert.ok(mumbai, 'Mumbai resolved');
    assert.ok(mumbai.city.toLowerCase().includes('mumbai') || mumbai.formattedAddress.toLowerCase().includes('mumbai'));
    assert.strictEqual(mumbai.source, 'photon');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('forwardGeocode prioritizes Greater Noida over Noida in offline preset fallback', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // Simulate complete network failure / offline / timeout
    globalThis.fetch = async () => {
      throw new Error('Network timeout (simulated offline)');
    };

    // Greater Noida should resolve to Greater Noida preset and NOT be shadowed by Noida
    const gn = await forwardGeocode('Greater Noida');
    assert.ok(gn, 'Greater Noida resolved from presets');
    assert.strictEqual(gn.lat, 28.47, `Greater Noida lat must be 28.47 (got ${gn.lat})`);
    assert.strictEqual(gn.lon, 77.50, `Greater Noida lon must be 77.50 (got ${gn.lon})`);
    assert.strictEqual(gn.city, 'Greater Noida');
    assert.strictEqual(gn.source, 'preset');

    // Sector 18 Noida should resolve to Noida preset
    const noidaSec18 = await forwardGeocode('Sector 18 Noida');
    assert.ok(noidaSec18, 'Sector 18 Noida resolved from presets');
    assert.strictEqual(noidaSec18.lat, 28.57, `Noida lat must be 28.57 (got ${noidaSec18.lat})`);
    assert.strictEqual(noidaSec18.lon, 77.35, `Noida lon must be 77.35 (got ${noidaSec18.lon})`);
    assert.strictEqual(noidaSec18.city, 'Noida');
    assert.strictEqual(noidaSec18.source, 'preset');

    // Standalone Noida query
    const noida = await forwardGeocode('Noida');
    assert.ok(noida, 'Noida resolved from presets');
    assert.strictEqual(noida.lat, 28.57);
    assert.strictEqual(noida.lon, 77.35);
    assert.strictEqual(noida.city, 'Noida');

    // New Delhi should resolve to New Delhi and not generic Delhi
    const newDelhi = await forwardGeocode('New Delhi');
    assert.ok(newDelhi, 'New Delhi resolved from presets');
    assert.strictEqual(newDelhi.city, 'New Delhi');
    assert.strictEqual(newDelhi.lat, 28.6139);
    assert.strictEqual(newDelhi.lon, 77.2090);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reverseGeocode returns default structured details for null coordinates', async () => {
  const def = await reverseGeocode(null, null);
  assert.strictEqual(def.city, 'National Capital Region');
  assert.strictEqual(def.country, 'India');
  assert.ok(def.formattedAddress.includes('National Capital Region'));
});

test('forwardGeocode returns null for empty or whitespace query', async () => {
  const empty = await forwardGeocode('');
  assert.strictEqual(empty, null);

  const ws = await forwardGeocode('   ');
  assert.strictEqual(ws, null);
});
