import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLOBAL_COUNTRIES } from '../utils/locationState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../..');

test('ProfileSettingsModal eliminates Primary Default Profile select dropdown', () => {
  const modalPath = path.join(frontendDir, 'src/components/ProfileSettingsModal.jsx');
  const content = fs.readFileSync(modalPath, 'utf-8');
  assert.ok(!content.includes('Primary Default Profile'), 'Must not contain Primary Default Profile select dropdown');
  assert.ok(content.includes('handleTogglePin'), 'Must define handleTogglePin callback');
  assert.ok(content.includes('btn-pin-toggle-'), 'Must pass pinToggle with id btn-pin-toggle to AddressInput');
});

test('AddressInput renders interactive pinToggle button with switch semantics', () => {
  const addressInputPath = path.join(frontendDir, 'src/components/AddressInput.jsx');
  const content = fs.readFileSync(addressInputPath, 'utf-8');
  assert.ok(content.includes('pinToggle'), 'Must support pinToggle prop');
  assert.ok(content.includes('role="switch"'), 'Must render button with role="switch"');
  assert.ok(content.includes('aria-checked='), 'Must reflect pinned state with aria-checked');
  assert.ok(content.includes("'Pinned'"), 'Must indicate pinned priority state in button text');
  assert.ok(content.includes("'Pin'"), 'Must indicate pin in unpinned state');
});

test('AirMap search bar eliminates preset dropdown list', () => {
  const airMapPath = path.join(frontendDir, 'src/components/AirMap.jsx');
  const content = fs.readFileSync(airMapPath, 'utf-8');
  assert.ok(!content.includes('Quick Presets: Select Monitored Station or Metro'), 'Must eliminate preset station/metro dropdown');
  assert.ok(!content.includes('{activeAreaLabel} (Area)'), 'Must eliminate area preset dropdown option');
  assert.ok(content.includes('placeholder="Search street, district, city..."'), 'Must retain clean wide search input');
});

test('AirMap provides 3-tier scope switcher (Local, All India, Globe)', () => {
  const airMapPath = path.join(frontendDir, 'src/components/AirMap.jsx');
  const content = fs.readFileSync(airMapPath, 'utf-8');
  assert.ok(content.includes('id="btn-scope-local"'), 'Must provide local area scope button');
  assert.ok(content.includes('id="btn-scope-all-india"'), 'Must provide All India scope button');
  assert.ok(content.includes('id="btn-scope-globe"'), 'Must provide Globe scope button');
  assert.ok(content.includes('currentZoom <= 3'), 'Must support tier 1 zoom <= 3 for Globe');
  assert.ok(content.includes('currentZoom <= 8'), 'Must support tier 2 zoom for National Metros');
});

test('GLOBAL_COUNTRIES provides representative nations with avg, min, and max pollution telemetry', () => {
  assert.ok(Array.isArray(GLOBAL_COUNTRIES) && GLOBAL_COUNTRIES.length >= 10, 'Must have at least 10 representative countries');
  
  const india = GLOBAL_COUNTRIES.find(c => c.name === 'India');
  assert.ok(india, 'Must include India');
  assert.equal(india.flag, '🇮🇳');
  assert.ok(india.avgAqi > 0, 'Must include positive avg AQI');
  assert.ok(india.minAqi <= india.avgAqi, 'Min AQI must be <= Avg AQI');
  assert.ok(india.maxAqi >= india.avgAqi, 'Max AQI must be >= Avg AQI');

  const usa = GLOBAL_COUNTRIES.find(c => c.name === 'USA');
  assert.ok(usa, 'Must include USA');
  assert.equal(usa.flag, '🇺🇸');

  const uk = GLOBAL_COUNTRIES.find(c => c.name === 'UK');
  assert.ok(uk, 'Must include UK');
  assert.equal(uk.flag, '🇬🇧');

  // Verify all countries have required fields
  GLOBAL_COUNTRIES.forEach(country => {
    assert.ok(country.name, 'Country must have name');
    assert.ok(country.flag, 'Country must have flag');
    assert.ok(typeof country.lat === 'number', 'Country must have numeric latitude');
    assert.ok(typeof country.lng === 'number', 'Country must have numeric longitude');
    assert.ok(typeof country.avgAqi === 'number', 'Country must have numeric avgAqi');
    assert.ok(typeof country.minAqi === 'number', 'Country must have numeric minAqi');
    assert.ok(typeof country.maxAqi === 'number', 'Country must have numeric maxAqi');
    assert.ok(country.minAqi <= country.maxAqi, 'minAqi must be <= maxAqi');
  });
});

test('AirMap implements focused usability and cartography improvements', () => {
  const airMapPath = path.join(frontendDir, 'src/components/AirMap.jsx');
  const content = fs.readFileSync(airMapPath, 'utf-8');

  // 1. Search pin logo converted to interactive button
  assert.ok(content.includes('id="btn-search-locate"'), 'Search bar must provide interactive GPS locator button');
  assert.ok(content.includes('onClick={handleLocateMe}'), 'Search pin button must invoke handleLocateMe');

  // 2. Single inner red circle only (c1, c2 eliminated)
  assert.ok(!content.includes('radius: 16000'), 'Must eliminate 16km outer boundary circle');
  assert.ok(!content.includes('radius: 10000'), 'Must eliminate 10km outer boundary circle');
  assert.ok(content.includes('radius: 5500'), 'Must preserve single inner 5.5km red circle');

  // 3. Elimination of NCR Corridors
  assert.ok(!content.includes("'NCR Corridors'"), 'Must eliminate NCR Corridors from signal overlays');
  assert.ok(!content.includes('dndLine'), 'Must eliminate DND Flyway corridor line');
  assert.ok(!content.includes('nh48Line'), 'Must eliminate NH-48 corridor line');

  // 4. Prominent bottom-right GPS button with high z-index
  assert.ok(content.includes('id="btn-locate-me"'), 'Must provide dedicated GPS locate me button');
  assert.ok(content.includes('z-[30]'), 'Floating action controls must have high z-index');

  // 5. Dynamic country scope resolution
  assert.ok(content.includes('resolveCountryFromCoords'), 'Must dynamically resolve country from coordinates');
  assert.ok(content.includes('{countryButtonLabel}'), 'Scope switcher must display dynamic country label');

  // 6. Highlighted station AQI badge & district name chip
  assert.ok(content.includes('AQI Numeric Circle Badge'), 'Station marker must render highlighted AQI circle badge');
  assert.ok(content.includes('District / Station Name Pill'), 'Station marker must render district name pill');
});
