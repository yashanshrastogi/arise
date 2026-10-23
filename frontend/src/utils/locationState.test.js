import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCoordinates,
  isInDelhiNcr,
  resolveInitialLocation,
  INDIA_OVERVIEW,
  MAJOR_INDIAN_CITIES,
  resolvePersonaLocation,
  resolveRegionalLocation,
  resolveCountryFromCoords,
} from './locationState.js';

test('validates latitude and longitude within legal geographical bounds', () => {
  // Valid coordinates
  const delhi = validateCoordinates(28.6139, 77.2090);
  assert.strictEqual(delhi.valid, true);
  assert.strictEqual(delhi.lat, 28.6139);
  assert.strictEqual(delhi.lon, 77.2090);

  const mumbai = validateCoordinates('19.0760', '72.8777');
  assert.strictEqual(mumbai.valid, true);
  assert.strictEqual(mumbai.lat, 19.076);
  assert.strictEqual(mumbai.lon, 72.8777);

  // Out of bounds latitude
  const badLat = validateCoordinates(95.0, 77.0);
  assert.strictEqual(badLat.valid, false);
  assert.match(badLat.error, /latitude/i);

  // Out of bounds longitude
  const badLon = validateCoordinates(28.0, 195.0);
  assert.strictEqual(badLon.valid, false);
  assert.match(badLon.error, /longitude/i);

  // Non-finite coordinates
  const nanCoord = validateCoordinates('not_a_number', 77.0);
  assert.strictEqual(nanCoord.valid, false);
});

test('identifies Delhi-NCR airshed boundaries accurately', () => {
  // Points inside Delhi-NCR airshed
  assert.strictEqual(isInDelhiNcr(28.6139, 77.2090), true); // Connaught Place
  assert.strictEqual(isInDelhiNcr(28.5355, 77.3910), true); // Noida
  assert.strictEqual(isInDelhiNcr(28.4595, 77.0266), true); // Gurugram
  assert.strictEqual(isInDelhiNcr(28.6692, 77.4538), true); // Ghaziabad
  assert.strictEqual(isInDelhiNcr(28.4089, 77.3178), true); // Faridabad

  // Points outside Delhi-NCR across India and the globe
  assert.strictEqual(isInDelhiNcr(19.0760, 72.8777), false); // Mumbai
  assert.strictEqual(isInDelhiNcr(12.9716, 77.5946), false); // Bengaluru
  assert.strictEqual(isInDelhiNcr(22.5726, 88.3639), false); // Kolkata
  assert.strictEqual(isInDelhiNcr(13.0827, 80.2707), false); // Chennai
  assert.strictEqual(isInDelhiNcr(34.0837, 74.7973), false); // Srinagar
  assert.strictEqual(isInDelhiNcr(26.1445, 91.7362), false); // Guwahati
  assert.strictEqual(isInDelhiNcr(51.5074, -0.1278), false); // London
});

test('national overview provides sensible center and nationwide zoom', () => {
  assert.strictEqual(INDIA_OVERVIEW.lat, 22.5937);
  assert.strictEqual(INDIA_OVERVIEW.lon, 78.9629);
  assert.strictEqual(INDIA_OVERVIEW.zoom, 5);
  assert.strictEqual(INDIA_OVERVIEW.isOverview, true);
});

test('major Indian cities preset contains representative national metros and regions', () => {
  const cityNames = MAJOR_INDIAN_CITIES.map(c => c.name);
  assert.ok(cityNames.includes('National Capital Region (NCR)'));
  assert.ok(cityNames.includes('Mumbai'));
  assert.ok(cityNames.includes('Bengaluru'));
  assert.ok(cityNames.includes('Kolkata'));
  assert.ok(cityNames.includes('Chennai'));
  assert.ok(cityNames.includes('Hyderabad'));
  assert.ok(cityNames.includes('Srinagar'));
  assert.ok(cityNames.includes('Guwahati'));
  assert.ok(cityNames.includes('Kochi'));

  // Ensure all cities have valid coordinates
  MAJOR_INDIAN_CITIES.forEach(c => {
    const check = validateCoordinates(c.lat, c.lon);
    assert.strictEqual(check.valid, true, `City ${c.name} has invalid coordinates`);
  });
});

test('resolves user profile home location when configured', () => {
  const profileWithHome = {
    home_location: {
      latitude: 19.0760,
      longitude: 72.8777,
      label: 'Bandra Home',
      city: 'Mumbai',
    },
  };

  const resolved = resolveInitialLocation(profileWithHome);
  assert.strictEqual(resolved.lat, 19.0760);
  assert.strictEqual(resolved.lon, 72.8777);
  assert.strictEqual(resolved.city, 'Mumbai');
  assert.strictEqual(resolved.source, 'profile_home');
  assert.strictEqual(resolved.region, 'India');
});

test('resolvePersonaLocation dynamically retrieves Home, Work, School, and Parent locations', () => {
  const profile = {
    home_location: {
      latitude: 28.548,
      longitude: 77.234,
      label: 'Home (Greater Kailash)',
      address: 'M-Block, GK II, New Delhi',
      city: 'New Delhi',
    },
    work_location: {
      latitude: 28.4744,
      longitude: 77.5040,
      label: 'Work (Greater Noida)',
      address: 'Knowledge Park III, Greater Noida, UP',
      city: 'Greater Noida',
    },
    school_location: {
      latitude: 28.529,
      longitude: 77.1540,
      label: 'School (Vasant Kunj)',
      address: 'Sector B, Vasant Kunj, New Delhi',
      city: 'New Delhi',
    },
    parent_location: {
      latitude: 28.4595,
      longitude: 77.0266,
      label: 'Parents (Gurugram)',
      address: 'DLF Phase 4, Gurugram, Haryana',
      city: 'Gurugram',
    },
  };

  // 1. General Public -> Home
  const homeLoc = resolvePersonaLocation('General Public', profile);
  assert.strictEqual(homeLoc.latitude, 28.548);
  assert.strictEqual(homeLoc.longitude, 77.234);
  assert.strictEqual(isInDelhiNcr(homeLoc.latitude, homeLoc.longitude), true);

  // 2. Work & Outdoor Labor -> Work
  const workLoc = resolvePersonaLocation('Work & Outdoor Labor', profile);
  assert.strictEqual(workLoc.latitude, 28.4744);
  assert.strictEqual(workLoc.longitude, 77.5040);
  assert.strictEqual(isInDelhiNcr(workLoc.latitude, workLoc.longitude), true);

  // 3. Children & Schools / School Administration -> School
  const schoolLoc = resolvePersonaLocation('Children & Schools', profile);
  assert.strictEqual(schoolLoc.latitude, 28.529);
  assert.strictEqual(schoolLoc.longitude, 77.1540);
  assert.strictEqual(isInDelhiNcr(schoolLoc.latitude, schoolLoc.longitude), true);

  const schoolAdminLoc = resolvePersonaLocation('School Administration', profile);
  assert.strictEqual(schoolAdminLoc.latitude, 28.529);

  // 4. Elderly & Respiratory -> Parent
  const parentLoc = resolvePersonaLocation('Elderly & Respiratory', profile);
  assert.strictEqual(parentLoc.latitude, 28.4595);
  assert.strictEqual(parentLoc.longitude, 77.0266);
  assert.strictEqual(isInDelhiNcr(parentLoc.latitude, parentLoc.longitude), true);

  // 5. Unconfigured profile returns null gracefully
  assert.strictEqual(resolvePersonaLocation('Work & Outdoor Labor', {}), null);
  assert.strictEqual(resolvePersonaLocation('Work & Outdoor Labor', null), null);
  assert.strictEqual(resolvePersonaLocation('Unknown Persona', profile), null);
});

test('resolveRegionalLocation formats regional district and city for Pune and non-Delhi addresses', () => {
  // Case 1: Pune with distinct district (e.g. Kothrud, Pune)
  assert.strictEqual(
    resolveRegionalLocation({ district: 'Kothrud', city: 'Pune', lat: 18.5074, lon: 73.8077 }),
    'Kothrud, Pune'
  );

  // Case 2: Pune with Shivajinagar
  assert.strictEqual(
    resolveRegionalLocation({ district: 'Shivajinagar', city: 'Pune', lat: 18.5308, lon: 73.8475 }),
    'Shivajinagar, Pune'
  );

  // Case 3: Pune with redundant 'Pune District'
  assert.strictEqual(
    resolveRegionalLocation({ district: 'Pune District', city: 'Pune', lat: 18.5204, lon: 73.8567 }),
    'Pune'
  );

  // Case 4: Location name contains district, e.g. 'Home · Kothrud' with city 'Pune'
  assert.strictEqual(
    resolveRegionalLocation({ locationName: 'Home · Kothrud', city: 'Pune', lat: 18.5074, lon: 73.8077 }),
    'Kothrud, Pune'
  );

  // Case 5: Brahmpuri with Home prefix and no explicit city (e.g. Brahmpuri locality)
  assert.strictEqual(
    resolveRegionalLocation({ locationName: 'Home · Brahmpuri', lat: 18.5204, lon: 73.8567 }),
    'Brahmpuri'
  );

  // Case 6: Brahmpuri, Jaipur
  assert.strictEqual(
    resolveRegionalLocation({ district: 'Brahmpuri', city: 'Jaipur', lat: 26.9400, lon: 75.8300 }),
    'Brahmpuri, Jaipur'
  );

  // Case 7: Non-Delhi coordinates with zero metadata must NEVER return 'Delhi-NCR'
  const nonDelhiResolved = resolveRegionalLocation({ lat: 18.5204, lon: 73.8567 });
  assert.notStrictEqual(nonDelhiResolved, 'Delhi-NCR');
  assert.strictEqual(nonDelhiResolved, 'your local area');

  // Case 8: Coordinates in NCR fall back to National Capital Region
  assert.strictEqual(
    resolveRegionalLocation({ lat: 28.6139, lon: 77.2090 }),
    'National Capital Region'
  );

  // Case 9: Delhi coordinates with district and city
  assert.strictEqual(
    resolveRegionalLocation({ district: 'Central Delhi', city: 'New Delhi', lat: 28.6139, lon: 77.2090 }),
    'Central Delhi, New Delhi'
  );
});

test('resolveCountryFromCoords accurately detects national scope from coords or metadata', () => {
  // India (via coords)
  const indiaCoords = resolveCountryFromCoords(28.6692, 77.4538); // Ghaziabad
  assert.strictEqual(indiaCoords.code, 'IN');
  assert.strictEqual(indiaCoords.name, 'India');
  assert.strictEqual(indiaCoords.flag, '🇮🇳');

  // USA (via coords)
  const usaCoords = resolveCountryFromCoords(37.7749, -122.4194); // San Francisco
  assert.strictEqual(usaCoords.code, 'US');
  assert.strictEqual(usaCoords.name, 'USA');
  assert.strictEqual(usaCoords.flag, '🇺🇸');

  // UK (via coords)
  const ukCoords = resolveCountryFromCoords(51.5074, -0.1278); // London
  assert.strictEqual(ukCoords.code, 'GB');
  assert.strictEqual(ukCoords.name, 'UK');

  // UAE (via coords)
  const uaeCoords = resolveCountryFromCoords(25.2048, 55.2708); // Dubai
  assert.strictEqual(uaeCoords.code, 'AE');

  // Metadata override
  const metaUsa = resolveCountryFromCoords(0, 0, { countryCode: 'US' });
  assert.strictEqual(metaUsa.code, 'US');

  const metaAmerica = resolveCountryFromCoords(0, 0, { country: 'America' });
  assert.strictEqual(metaAmerica.code, 'US');
});
