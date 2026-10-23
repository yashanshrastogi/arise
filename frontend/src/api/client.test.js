import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveApiBaseUrl,
  PRODUCTION_API_URL,
  fetchEnvironment,
  fetchAirNow,
  fetchWeatherNow,
  fetchVerdict,
  fetchRoute,
} from './client.js';

test('resolveApiBaseUrl preserves localhost routing to local backend', () => {
  assert.equal(
    resolveApiBaseUrl({ hostname: 'localhost', envUrl: '' }),
    'http://localhost:8000'
  );
  assert.equal(
    resolveApiBaseUrl({ hostname: '127.0.0.1', envUrl: 'https://execute-api.us-east-1.amazonaws.com/prod' }),
    'http://localhost:8000'
  );
});

test('resolveApiBaseUrl preserves production default for production environment', () => {
  assert.equal(
    resolveApiBaseUrl({ mode: 'production', hostname: 'frontend.dqmsa8e2klyso.amplifyapp.com' }),
    PRODUCTION_API_URL
  );
});

test('resolveApiBaseUrl accepts custom non-production explicit API URL in production', () => {
  assert.equal(
    resolveApiBaseUrl({
      mode: 'production',
      hostname: 'example.com',
      envUrl: 'https://custom-api.example.com/api/'
    }),
    'https://custom-api.example.com/api'
  );
});

test('resolveApiBaseUrl throws error when staging API URL is missing', () => {
  assert.throws(
    () => resolveApiBaseUrl({ mode: 'staging' }),
    /Configuration Error: Missing or invalid VITE_API_URL for staging environment/
  );

  assert.throws(
    () => resolveApiBaseUrl({ hostname: 'staging.dqmsa8e2klyso.amplifyapp.com', envUrl: '' }),
    /Configuration Error: Missing or invalid VITE_API_URL for staging environment/
  );

  assert.throws(
    () => resolveApiBaseUrl({ stage: 'staging', envUrl: '   ' }),
    /Configuration Error: Missing or invalid VITE_API_URL for staging environment/
  );
});

test('resolveApiBaseUrl throws error when staging uses localhost URL', () => {
  assert.throws(
    () => resolveApiBaseUrl({ mode: 'staging', envUrl: 'http://localhost:8000' }),
    /Configuration Error: Missing or invalid VITE_API_URL for staging environment/
  );
});

test('resolveApiBaseUrl throws error when staging is pointed to production endpoint', () => {
  assert.throws(
    () => resolveApiBaseUrl({ mode: 'staging', envUrl: PRODUCTION_API_URL }),
    /Configuration Error: Staging environment configured with production API URL/
  );

  assert.throws(
    () => resolveApiBaseUrl({
      hostname: 'staging.dqmsa8e2klyso.amplifyapp.com',
      envUrl: 'https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod'
    }),
    /Configuration Error: Staging environment configured with production API URL/
  );
});

test('resolveApiBaseUrl returns sanitized staging endpoint when valid', () => {
  const stagingUrl = 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/staging/';
  assert.equal(
    resolveApiBaseUrl({ mode: 'staging', envUrl: stagingUrl }),
    'https://abc123xyz.execute-api.us-east-1.amazonaws.com/staging'
  );

  assert.equal(
    resolveApiBaseUrl({
      hostname: 'staging.dqmsa8e2klyso.amplifyapp.com',
      envUrl: 'https://abc123xyz.execute-api.us-east-1.amazonaws.com/staging'
    }),
    'https://abc123xyz.execute-api.us-east-1.amazonaws.com/staging'
  );
});

test('frontend API client functions strictly reject invalid/out-of-bound coordinates', async () => {
  // fetchEnvironment rejects invalid coords without making network calls
  assert.equal(await fetchEnvironment({ lat: 95.0, lon: 77.2 }), null);
  assert.equal(await fetchEnvironment({ lat: 28.6, lon: 200.0 }), null);
  assert.equal(await fetchEnvironment({ lat: NaN, lon: 77.2 }), null);

  // fetchAirNow rejects out-of-bounds coords
  assert.equal(await fetchAirNow({ lat: -95.0, lon: 0.0 }), null);
  assert.equal(await fetchAirNow({ lat: 0.0, lon: -190.0 }), null);

  // fetchWeatherNow rejects non-numeric coords
  assert.equal(await fetchWeatherNow({ lat: 'invalid', lon: 77.2 }), null);

  // fetchVerdict rejects invalid coords
  assert.equal(await fetchVerdict({ lat: 100.0, lon: 0.0 }), null);

  // fetchRoute rejects non-finite, out-of-range, and NaN coords without making network calls
  assert.equal(await fetchRoute({ originLat: NaN, originLon: 77.2, destLat: 28.5, destLon: 77.1 }), null);
  assert.equal(await fetchRoute({ originLat: 95.0, originLon: 77.2, destLat: 28.5, destLon: 77.1 }), null);
  assert.equal(await fetchRoute({ originLat: 28.5, originLon: 200.0, destLat: 28.5, destLon: 77.1 }), null);
  assert.equal(await fetchRoute({ originLat: 28.5, originLon: 77.2, destLat: -95.0, destLon: 77.1 }), null);
  assert.equal(await fetchRoute({ originLat: 28.5, originLon: 77.2, destLat: 28.5, destLon: -200.0 }), null);
});

test('fetchRoute returns null and never fabricates route data when backend returns an error', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: 'Route service misconfigured: ORS_API_KEY is not configured.' }),
  });
  try {
    const result = await fetchRoute({
      originLat: 28.6139,
      originLon: 77.2090,
      destLat: 28.5244,
      destLon: 77.2066,
    });
    // Strict contract: must return null on 503 / 500 / 404 / 400 — never fabricated mock geometry
    assert.equal(result, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchRoute correctly passes reverse commute coordinates and labels', async () => {
  let capturedUrl = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({
        origin_label: 'Work',
        destination_label: 'Home',
        distance_km: 10.2,
        duration_min: 22.5,
        geometry: [[28.5244, 77.2066], [28.6139, 77.2090]],
        source: 'OpenRouteService',
      }),
    };
  };
  try {
    const result = await fetchRoute({
      originLat: 28.5244,
      originLon: 77.2066,
      destLat: 28.6139,
      destLon: 77.2090,
      originLabel: 'Work',
      destinationLabel: 'Home',
      profile: 'driving-car',
    });
    assert.ok(result);
    assert.equal(result.origin_label, 'Work');
    assert.equal(result.destination_label, 'Home');

    const parsedUrl = new URL(capturedUrl);
    assert.equal(parsedUrl.searchParams.get('origin_lat'), '28.5244');
    assert.equal(parsedUrl.searchParams.get('origin_lon'), '77.2066');
    assert.equal(parsedUrl.searchParams.get('dest_lat'), '28.6139');
    assert.equal(parsedUrl.searchParams.get('dest_lon'), '77.209');
    assert.equal(parsedUrl.searchParams.get('origin_label'), 'Work');
    assert.equal(parsedUrl.searchParams.get('destination_label'), 'Home');
    assert.equal(parsedUrl.searchParams.get('include_weather'), 'true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchRoute receives and preserves weather_points and weather_summary along corridor', async () => {
  let capturedUrl = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({
        origin_label: 'Home',
        destination_label: 'Work',
        distance_km: 13.7,
        duration_min: 16.8,
        geometry: [[28.5244, 77.2167], [28.5700, 77.2167], [28.6315, 77.2167]],
        weather_points: [
          {
            label: 'Home',
            lat: 28.5244,
            lon: 77.2167,
            eta_min: 0.0,
            temp_c: 28.0,
            condition: 'Clear Sky',
            icon: '☀️',
            rain_probability: 5.0,
            precipitation_mm: 0.0,
            wind_speed_kmh: 8.5,
            visibility_km: 7.0,
            fog_risk: 'None',
            is_stale: false,
            data_source: 'Open-Meteo',
          },
          {
            label: 'Midpoint',
            lat: 28.5700,
            lon: 77.2167,
            eta_min: 8.4,
            temp_c: 28.5,
            condition: 'Partly Cloudy',
            icon: '🌤️',
            rain_probability: 10.0,
            precipitation_mm: 0.0,
            wind_speed_kmh: 9.0,
            visibility_km: 6.5,
            fog_risk: 'None',
            is_stale: false,
            data_source: 'Open-Meteo',
          },
          {
            label: 'Work',
            lat: 28.6315,
            lon: 77.2167,
            eta_min: 16.8,
            temp_c: 29.0,
            condition: 'Partly Cloudy',
            icon: '🌤️',
            rain_probability: 15.0,
            precipitation_mm: 0.0,
            wind_speed_kmh: 10.0,
            visibility_km: 5.0,
            fog_risk: 'None',
            is_stale: false,
            data_source: 'Open-Meteo',
          },
        ],
        weather_summary: {
          has_rain_risk: false,
          has_fog_risk: false,
          min_temp_c: 28.0,
          max_temp_c: 29.0,
          max_wind_kmh: 10.0,
          lowest_visibility_km: 5.0,
          advisory: '✅ Clear meteorological conditions along commute route.',
          spatial_resolution: 'Open-Meteo NWP (~2 km grid resolution)',
          data_provenance: 'numerical_weather_prediction',
        },
      }),
    };
  };

  try {
    const result = await fetchRoute({
      originLat: 28.5244,
      originLon: 77.2167,
      destLat: 28.6315,
      destLon: 77.2167,
      includeWeather: true,
    });
    assert.ok(result);
    assert.equal(result.weather_points.length, 3);
    assert.equal(result.weather_points[0].temp_c, 28.0);
    assert.equal(result.weather_points[1].label, 'Midpoint');
    assert.equal(result.weather_summary.has_fog_risk, false);
    assert.equal(result.weather_summary.spatial_resolution, 'Open-Meteo NWP (~2 km grid resolution)');

    const parsedUrl = new URL(capturedUrl);
    assert.equal(parsedUrl.searchParams.get('include_weather'), 'true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchRoute receives and preserves pollution_points and pollution_summary along corridor', async () => {
  let capturedUrl = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    capturedUrl = url;
    return {
      ok: true,
      json: async () => ({
        origin_label: 'Home',
        destination_label: 'Work',
        distance_km: 13.7,
        duration_min: 22.0,
        geometry: [[28.5244, 77.2167], [28.6315, 77.2167]],
        pollution_points: [
          {
            label: 'Home',
            lat: 28.5244,
            lon: 77.2167,
            eta_min: 0.0,
            aqi: 145,
            aqi_category: 'Moderate',
            dominant_pollutant: 'PM2.5',
            pm25: 58.0,
            pm10: 105.0,
            data_type: 'observed',
            source: 'CPCB',
            nearest_station: 'Saket CPCB',
            nearest_station_distance_km: 0.8,
            confidence: 'high',
            is_stale: false,
            uncertainty_note: 'IDW interpolated from ground monitors',
          },
          {
            label: 'Work',
            lat: 28.6315,
            lon: 77.2167,
            eta_min: 22.0,
            aqi: 180,
            aqi_category: 'Moderate',
            dominant_pollutant: 'PM2.5',
            pm25: 75.0,
            pm10: 140.0,
            data_type: 'modelled',
            source: 'Open-Meteo',
            nearest_station: null,
            nearest_station_distance_km: null,
            confidence: 'moderate',
            is_stale: false,
            uncertainty_note: 'Regional atmospheric model (~10 km)',
          },
        ],
        pollution_summary: {
          avg_aqi: 163,
          max_aqi: 180,
          min_aqi: 145,
          dominant_pollutant: 'PM2.5',
          exposure_category: 'Moderate',
          hotspot_label: 'Work',
          cleanest_label: 'Home',
          advisory: 'Moderate air quality along corridor. Sensitive individuals should consider wearing a mask.',
          coverage_ratio: 1.0,
          data_sources: ['CPCB', 'Open-Meteo'],
          spatial_resolution: 'Ambient monitoring stations (IDW) & Open-Meteo regional models',
          roadside_disclaimer: 'Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings.',
        },
      }),
    };
  };

  try {
    const result = await fetchRoute({
      originLat: 28.5244,
      originLon: 77.2167,
      destLat: 28.6315,
      destLon: 77.2167,
      includeWeather: true,
      includePollution: true,
    });
    assert.ok(result);
    assert.equal(result.pollution_points.length, 2);
    assert.equal(result.pollution_points[0].data_type, 'observed');
    assert.equal(result.pollution_points[0].nearest_station, 'Saket CPCB');
    assert.equal(result.pollution_points[1].data_type, 'modelled');
    assert.equal(result.pollution_summary.avg_aqi, 163);
    assert.equal(result.pollution_summary.hotspot_label, 'Work');
    assert.ok(result.pollution_summary.roadside_disclaimer.includes('Roadside tailpipe microclimates'));

    const parsedUrl = new URL(capturedUrl);
    assert.equal(parsedUrl.searchParams.get('include_pollution'), 'true');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


