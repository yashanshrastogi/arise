import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REGIONAL_DISTRICTS,
  getDistrictsInBounds,
  clusterGeoPoints,
  GLOBAL_COUNTRIES,
} from '../utils/locationState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../..');
const airMapPath = path.join(frontendDir, 'src/components/AirMap.jsx');
const airMapContent = fs.readFileSync(airMapPath, 'utf-8');

test('AirMap completely eliminates the floating AQI Concentration (0–500) legend', () => {
  assert.ok(
    !airMapContent.includes('AQI Concentration (0–500)'),
    'AirMap must not contain the floating AQI Concentration (0–500) title'
  );
  assert.ok(
    !airMapContent.includes("left: 'Good (0)'") && !airMapContent.includes("right: 'Severe (500)'"),
    'AirMap must eliminate Good (0) and Severe (500) scale labels'
  );
  assert.ok(
    !airMapContent.includes('getLegendInfo'),
    'AirMap must eliminate the unused getLegendInfo helper function and dead state'
  );
  assert.ok(
    !airMapContent.includes('const legend = getLegendInfo()'),
    'AirMap must eliminate legend invocation'
  );
});

test('AirMap implements smooth navigation with idle event listener and reduced motion support', () => {
  // 1. Idle event listener instead of rapid zoom_changed
  assert.ok(
    airMapContent.includes("map.addListener('idle'"),
    "AirMap must attach an 'idle' listener to map to throttle marker updates until panning/zooming finishes"
  );
  assert.ok(
    !airMapContent.includes("map.addListener('zoom_changed'"),
    "AirMap must eliminate rapid zoom_changed listener that triggers 30+ React re-renders per gesture"
  );

  // 2. renderMarkersRef wiring
  assert.ok(
    airMapContent.includes('renderMarkersRef.current = renderMarkers'),
    'AirMap must wire renderMarkersRef to latest renderMarkers function'
  );
  assert.ok(
    airMapContent.includes('renderMarkersRef.current()'),
    'AirMap must invoke renderMarkersRef.current on idle events'
  );

  // 3. Smooth pan helper respecting prefers-reduced-motion
  assert.ok(
    airMapContent.includes('const smoothPanTo ='),
    'AirMap must define a smoothPanTo helper'
  );
  assert.ok(
    airMapContent.includes("window.matchMedia('(prefers-reduced-motion: reduce)')"),
    'smoothPanTo must check user accessibility preferences for reduced motion'
  );
  assert.ok(
    airMapContent.includes('setCenter({ lat: Number(lat), lng: Number(lng) })'),
    'smoothPanTo must use instantaneous setCenter when reduced motion is preferred'
  );
  assert.ok(
    airMapContent.includes('panTo({ lat: Number(lat), lng: Number(lng) })'),
    'smoothPanTo must use smooth panTo when reduced motion is not requested'
  );
});

test('AirMap supports 5-tier geographic drill-down with clear zoom boundaries', () => {
  // Tier 1: Global (zoom <= 3)
  assert.ok(airMapContent.includes('currentZoom <= 3'), 'Must support Tier 1 Global at zoom <= 3');
  assert.ok(airMapContent.includes('GLOBAL_COUNTRIES'), 'Tier 1 must render representative global countries');

  // Tier 2: National (zoom <= 8)
  assert.ok(airMapContent.includes('currentZoom <= 8'), 'Must support Tier 2 National Metros at zoom <= 8');
  assert.ok(airMapContent.includes('DEFAULT_NATIONAL_HUBS'), 'Tier 2 must render national hubs and metro cities');

  // Tier 3: Regional (zoom <= 10)
  assert.ok(airMapContent.includes('currentZoom <= 10'), 'Must support Tier 3 Regional Districts at zoom <= 10');
  assert.ok(airMapContent.includes('getDistrictsInBounds'), 'Tier 3 must filter regional districts by viewport bounds');
  assert.ok(airMapContent.includes('REGIONAL_DISTRICTS'), 'Tier 3 must render regional districts data');

  // Tier 4 & 5: Local Area Clustered & Individual Monitoring Stations
  assert.ok(airMapContent.includes('clusterGeoPoints'), 'Must cluster monitoring stations at Tier 4');
  assert.ok(airMapContent.includes('currentZ <= 13 ? 55 : 0'), 'Must use 55px cluster radius for Tier 4 (11-13) and 0px (individual) for Tier 5 (14+)');
  assert.ok(airMapContent.includes('getClusterMarkerIcon'), 'Must generate cluster count badge icon');
  assert.ok(airMapContent.includes('getStationMarkerIcon'), 'Must generate station marker icon with highlighted AQI and name pill');
});

test('getDistrictsInBounds filters districts accurately by Google Maps LatLngBounds', () => {
  // Simulated Google Maps LatLngBounds
  const ncrBounds = {
    contains: (latLng) => {
      const lat = latLng.lat();
      const lng = latLng.lng();
      return lat >= 28.0 && lat <= 29.0 && lng >= 76.5 && lng <= 78.0;
    },
  };

  // Mock global window.google
  global.window = {
    google: {
      maps: {
        LatLng: class {
          constructor(lat, lng) {
            this._lat = lat;
            this._lng = lng;
          }
          lat() { return this._lat; }
          lng() { return this._lng; }
        },
      },
    },
  };

  const results = getDistrictsInBounds(ncrBounds, REGIONAL_DISTRICTS);
  assert.ok(Array.isArray(results), 'Must return an array');
  assert.ok(results.length > 0, 'Must find NCR districts within NCR bounds');

  // Should include Gurugram and Noida
  const hasGurugram = results.some(d => d.name === 'Gurugram' || d.city === 'Gurugram');
  const hasNoida = results.some(d => d.name === 'Noida' || d.city === 'Noida');
  assert.ok(hasGurugram, 'Results must contain Gurugram');
  assert.ok(hasNoida, 'Results must contain Noida');

  // Should NOT include distant cities like Mumbai, Pune, or Bengaluru
  const hasMumbai = results.some(d => d.name === 'Mumbai Suburban');
  const hasPune = results.some(d => d.name === 'Pune');
  const hasBengaluru = results.some(d => d.name === 'Bengaluru Urban');
  assert.ok(!hasMumbai, 'NCR bounds must not contain Mumbai');
  assert.ok(!hasPune, 'NCR bounds must not contain Pune');
  assert.ok(!hasBengaluru, 'NCR bounds must not contain Bengaluru');

  // Safe fallback when bounds is null
  const fallbackAll = getDistrictsInBounds(null, REGIONAL_DISTRICTS);
  assert.equal(fallbackAll.length, REGIONAL_DISTRICTS.length, 'Null bounds must return all districts safely');
});

test('clusterGeoPoints clusters dense stations and computes accurate average AQI', () => {
  const stations = [
    { id: 's1', name: 'Anand Vihar', lat: 28.6468, lng: 77.3160, aqi: 410 },
    { id: 's2', name: 'Vivek Vihar', lat: 28.6720, lng: 77.3150, aqi: 350 },
    { id: 's3', name: 'Connaught Place', lat: 28.6304, lng: 77.2177, aqi: 280 },
    { id: 's4', name: 'Mandir Marg', lat: 28.6364, lng: 77.2010, aqi: 260 },
    { id: 's5', name: 'Faraway Station', lat: 18.5204, lng: 73.8567, aqi: 110 },
  ];

  // At zoom 11 with 60px cluster radius, nearby stations cluster together
  const clustered = clusterGeoPoints(stations, 11, 60);
  assert.ok(clustered.length < stations.length, 'Clustering must reduce total marker count to prevent overlapping');

  const clusterNodes = clustered.filter(n => n.isCluster);
  assert.ok(clusterNodes.length >= 1, 'Must form at least one cluster node for dense nearby stations');

  clusterNodes.forEach(cluster => {
    assert.ok(cluster.count >= 2, 'Cluster must contain at least 2 members');
    assert.ok(typeof cluster.avgAqi === 'number', 'Cluster must have numeric average AQI');
    assert.ok(cluster.avgAqi > 0, 'Cluster avgAqi must be positive');
  });

  // At zoom 15 with radius 0, all stations remain individual items
  const discrete = clusterGeoPoints(stations, 15, 0);
  assert.equal(discrete.length, stations.length, '0px radius must return all stations individually');
  discrete.forEach(node => {
    assert.equal(node.isCluster, false, 'Node must not be a cluster');
    assert.ok(node.item, 'Node must carry original item');
  });
});

test('Geographic data honesty: REGIONAL_DISTRICTS contains authentic metadata without Delhi substitution', () => {
  assert.ok(Array.isArray(REGIONAL_DISTRICTS) && REGIONAL_DISTRICTS.length >= 25, 'Must contain at least 25 regional districts across India');

  REGIONAL_DISTRICTS.forEach(d => {
    assert.ok(d.name, 'District must have a name');
    assert.ok(d.state, 'District must have a state');
    assert.ok(typeof d.lat === 'number' && d.lat >= 8 && d.lat <= 36, `Latitude ${d.lat} must be within India`);
    assert.ok(typeof d.lon === 'number' && d.lon >= 68 && d.lon <= 98, `Longitude ${d.lon} must be within India`);
    assert.equal(d.dataType, 'aggregated', 'Regional districts must be explicitly flagged as aggregated data type');
    assert.equal(d.source, 'CPCB CAAQMS Regional Bulletin', 'Regional districts must be sourced from CPCB CAAQMS bulletin');
    assert.ok(d.timestamp, 'Regional districts must have an authoritative timestamp');
    assert.ok(typeof d.aqi === 'number' && d.aqi >= 0 && d.aqi <= 500, 'AQI must be within 0-500');
  });

  // Non-Delhi districts must have their authentic coordinates and not Delhi (28.61, 77.20)
  const pune = REGIONAL_DISTRICTS.find(d => d.name === 'Pune');
  assert.ok(pune, 'Must include Pune');
  assert.equal(pune.state, 'Maharashtra');
  assert.ok(Math.abs(pune.lat - 18.52) < 0.2, 'Pune lat must be ~18.52, not Delhi');

  const jaipur = REGIONAL_DISTRICTS.find(d => d.city === 'Jaipur' || d.name.includes('Jaipur'));
  assert.ok(jaipur, 'Must include Jaipur');
  assert.equal(jaipur.state, 'Rajasthan');
  assert.ok(Math.abs(jaipur.lat - 26.91) < 0.2, 'Jaipur lat must be ~26.91, not Delhi');

  const hyderabad = REGIONAL_DISTRICTS.find(d => d.city === 'Hyderabad' || d.name.includes('Hyderabad'));
  assert.ok(hyderabad, 'Must include Hyderabad');
  assert.equal(hyderabad.state, 'Telangana');
  assert.ok(Math.abs(hyderabad.lat - 17.38) < 0.2, 'Hyderabad lat must be ~17.38, not Delhi');

  const patna = REGIONAL_DISTRICTS.find(d => d.city === 'Patna' || d.name.includes('Patna'));
  assert.ok(patna, 'Must include Patna');
  assert.equal(patna.state, 'Bihar');
  assert.ok(Math.abs(patna.lat - 25.60) < 0.2, 'Patna lat must be ~25.60, not Delhi');
});

test('AirMap provenance & aggregation: DEFAULT_NATIONAL_HUBS are sourced, timestamped, and labelled as aggregates', () => {
  assert.ok(
    airMapContent.includes("dataType: 'aggregated'"),
    'DEFAULT_NATIONAL_HUBS must label each metro hub as aggregated data'
  );
  assert.ok(
    airMapContent.includes("source: 'CPCB National Air Quality Bulletin'"),
    'DEFAULT_NATIONAL_HUBS must cite CPCB National Air Quality Bulletin as the data source'
  );
  assert.ok(
    airMapContent.includes("timestamp: '2026-10-22T18:00:00Z'"),
    'DEFAULT_NATIONAL_HUBS must provide an authoritative timestamp'
  );
  assert.ok(
    airMapContent.includes('AGGREGATED METRO COMPOSITE'),
    'Tier 2 info window must visibly display AGGREGATED METRO COMPOSITE badge'
  );
  assert.ok(
    airMapContent.includes('AGGREGATED REGIONAL BULLETIN'),
    'Tier 3 info window must visibly display AGGREGATED REGIONAL BULLETIN badge'
  );
});

test('AirMap telemetry integrity: Live station readings are visually distinct from demo or curated values', () => {
  // 1. Distinction in marker badge
  assert.ok(
    airMapContent.includes("const isDemo = st.isDemo || st.source === 'DEMO'"),
    'Station marker must identify demo vs observed status'
  );
  assert.ok(
    airMapContent.includes('dashAttr'),
    'Demo station markers must use dashed stroke style to distinguish from live ground stations'
  );
  assert.ok(
    airMapContent.includes("`[D] ${displayName}`"),
    'Demo station marker names must be prefixed with [D]'
  );

  // 2. Distinction in InfoWindow badges
  assert.ok(
    airMapContent.includes('⚠️ DEMO / SIMULATION'),
    'Demo stations must display an explicit amber DEMO / SIMULATION badge'
  );
  assert.ok(
    airMapContent.includes('📡 OBSERVED TELEMETRY'),
    'Live regulatory ground monitors must display a distinct OBSERVED TELEMETRY badge'
  );
  assert.ok(
    airMapContent.includes("isDemo ? 'Demo Calibration Fixture' : (st.source || 'CPCB Ground Station')"),
    'Source row must differentiate demo calibration fixture from live CPCB ground station'
  );
});

test('AirMap missing observation handling: Missing AQI remains unavailable instead of defaulting to Good (0) or green', () => {
  // AQI_COLOR must check for null, undefined, and NaN
  assert.ok(
    airMapContent.includes("if (aqi == null || isNaN(Number(aqi))) return '#94A3B8';"),
    'AQI_COLOR must return #94A3B8 for null, undefined, or NaN, never green (#2EB872)'
  );

  // Station marker icons must render em-dash for missing AQI
  assert.ok(
    airMapContent.includes("const isMissing = st.aqi == null || isNaN(Number(st.aqi));"),
    'Station marker icon must detect missing observation'
  );
  assert.ok(
    airMapContent.includes("const aqiText = isMissing ? '—' : String(st.aqi);"),
    'Station marker icon must display em-dash when observation is missing'
  );

  // Regional district markers must render em-dash for missing AQI
  assert.ok(
    airMapContent.includes("const aqiLabel = isMissing ? 'AQI —' : `AQI ${district.aqi}`;"),
    'District marker must display AQI — when observation is missing'
  );
  assert.ok(
    airMapContent.includes("const statusLabel = isMissing ? 'Data Pending' : (district.status || 'Regional');"),
    'District marker must display Data Pending status when observation is missing'
  );
});

test('AirMap gesture performance: gestureHandling greedy configured for smooth wheel and touchpad navigation', () => {
  assert.ok(
    airMapContent.includes("gestureHandling: 'greedy'"),
    'Map must configure gestureHandling: greedy to prevent ctrl+scroll overlays and allow fluid touchpad and wheel gestures'
  );
  assert.ok(
    airMapContent.includes("map.addListener('idle'"),
    'Idle event listener ensures React does not re-render markers during active touchpad/wheel bursts'
  );
});
