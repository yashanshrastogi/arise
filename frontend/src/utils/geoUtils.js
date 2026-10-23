import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { MAJOR_INDIAN_CITIES, isInDelhiNcr, REGIONAL_DISTRICTS } from './locationState.js';

/**
 * Arise Geocoding & Reverse Geocoding Utility
 * High-precision geospatial resolver:
 * - Automatically extracts house/building number, street, district, city, state, and country.
 * - Multi-tier resilient fallback: Google Maps Geocoder -> OpenStreetMap Nominatim -> Photon -> BigDataCloud.
 * - Global coverage with zero mandatory paid API keys.
 */

let geocoderInstance = null;

export const KNOWN_COORDS = {
  'greater noida': { lat: 28.47, lon: 77.50 },
  noida: { lat: 28.57, lon: 77.35 },
  'new delhi': { lat: 28.6139, lon: 77.2090 },
  delhi: { lat: 28.6139, lon: 77.2090 },
  'mandir marg': { lat: 28.6258, lon: 77.1996 },
  'punjabi bagh': { lat: 28.6682, lon: 77.1264 },
  'rk puram': { lat: 28.5665, lon: 77.1767 },
  gurugram: { lat: 28.4595, lon: 77.0266 },
  gurgaon: { lat: 28.4595, lon: 77.0266 },
  faridabad: { lat: 28.4089, lon: 77.3178 },
  ghaziabad: { lat: 28.6692, lon: 77.4538 },
  anand: { lat: 28.6508, lon: 77.3153 },
  dwarka: { lat: 28.5921, lon: 77.0460 },
  saket: { lat: 28.5244, lon: 77.2167 },
  rohini: { lat: 28.7166, lon: 77.1147 },
  'punjabi bagh': { lat: 28.6682, lon: 77.1264 },
  'rk puram': { lat: 28.5665, lon: 77.1767 },
};

/**
 * Lazily loads and returns the Google Maps Geocoder instance.
 */
export async function getGoogleGeocoder() {
  if (typeof window !== 'undefined' && window.google?.maps?.Geocoder) {
    if (!geocoderInstance) {
      geocoderInstance = new window.google.maps.Geocoder();
    }
    return geocoderInstance;
  }

  const apiKey = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey.trim() === '') return null;

  try {
    setOptions({
      key: apiKey.trim(),
      v: 'weekly',
    });
    const geocodingLib = await importLibrary('geocoding');
    if (geocodingLib?.Geocoder) {
      geocoderInstance = new geocodingLib.Geocoder();
      return geocoderInstance;
    }
  } catch (err) {
    console.warn('Google Maps Geocoding library unavailable:', err?.message || err);
  }
  return null;
}

/**
 * Reverse-geocode using Google Maps Geocoder API.
 * Extracts: houseNumber, street, district, city, sublocality, state, country, postalCode.
 */
export async function reverseGeocodeWithGoogle(lat, lng) {
  try {
    const geocoder = await getGoogleGeocoder();
    if (!geocoder) return null;

    const response = await geocoder.geocode({
      location: { lat: Number(lat), lng: Number(lng) },
    });

    const results = response?.results || [];
    if (!results.length) return null;

    let houseNumber = '';
    let street = '';
    let city = '';
    let district = '';
    let sublocality = '';
    let state = '';
    let country = '';
    let postalCode = '';

    for (const res of results) {
      for (const comp of res.address_components || []) {
        if (!houseNumber && (comp.types.includes('street_number') || comp.types.includes('premise') || comp.types.includes('subpremise'))) {
          houseNumber = comp.long_name;
        }
        if (!street && (comp.types.includes('route') || comp.types.includes('street_address'))) {
          street = comp.long_name;
        }
        if (!city && (comp.types.includes('locality') || comp.types.includes('postal_town'))) {
          city = comp.long_name;
        }
        if (!district && (comp.types.includes('administrative_area_level_2') || comp.types.includes('administrative_area_level_3'))) {
          district = comp.long_name;
        }
        if (!sublocality && (comp.types.includes('sublocality_level_1') || comp.types.includes('sublocality') || comp.types.includes('neighborhood'))) {
          sublocality = comp.long_name;
        }
        if (!state && comp.types.includes('administrative_area_level_1')) {
          state = comp.long_name;
        }
        if (!country && comp.types.includes('country')) {
          country = comp.long_name;
        }
        if (!postalCode && comp.types.includes('postal_code')) {
          postalCode = comp.long_name;
        }
      }
      if (city && district && street) break;
    }

    if (!city && sublocality) city = sublocality;
    if (!city && district) city = district;

    const cleanDistrict = district ? district.replace(/\s+district$/i, '').trim() : '';
    const cleanCity = city || '';

    let formatted = '';
    if (cleanDistrict && cleanCity && cleanDistrict.toLowerCase() !== cleanCity.toLowerCase()) {
      formatted = `${cleanDistrict}, ${cleanCity}`;
    } else if (sublocality && cleanCity && sublocality.toLowerCase() !== cleanCity.toLowerCase()) {
      formatted = `${sublocality}, ${cleanCity}`;
    } else {
      formatted = cleanCity || cleanDistrict || 'Local Area';
    }

    const isDelhiCoords = isInDelhiNcr(Number(lat), Number(lng));
    const region = (cleanDistrict && cleanCity && cleanDistrict.toLowerCase() !== cleanCity.toLowerCase())
      ? `${cleanDistrict}, ${cleanCity}`
      : (cleanCity || cleanDistrict || (isDelhiCoords ? 'Delhi-NCR' : 'Local Area'));

    const streetPart = houseNumber && street ? `${houseNumber}, ${street}` : (street || sublocality || '');
    const cleanAddress = results[0]?.formatted_address || [
      streetPart,
      cleanDistrict && cleanDistrict.toLowerCase() !== cleanCity.toLowerCase() ? cleanDistrict : null,
      cleanCity,
      state,
      country,
    ].filter(Boolean).join(', ');

    return {
      houseNumber,
      street: street || sublocality,
      city: cleanCity,
      district: cleanDistrict,
      sublocality,
      state,
      country,
      postalCode,
      formattedAddress: cleanAddress,
      formattedLocation: formatted,
      region,
      source: 'google',
    };
  } catch (err) {
    console.warn('Google reverse geocode failed, attempting fallback:', err?.message || err);
    return null;
  }
}

/**
 * High-precision OpenStreetMap Nominatim reverse geocode client.
 * Global, free, and returns granular house number, road, district, city, state, country.
 */
export async function reverseGeocodeNominatim(lat, lng) {
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const res = await fetch(nomUrl, {
      headers: { 'User-Agent': 'AriseApp/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};

    const houseNumber = a.house_number || a.house_name || a.building || '';
    const street = a.road || a.street || a.pedestrian || a.suburb || a.neighbourhood || '';
    const district = (a.state_district || a.county || a.district || a.city_district || '').replace(/\s+district$/i, '').trim();
    const city = a.city || a.town || a.village || a.municipality || a.hamlet || district || '';
    const state = a.state || a.province || '';
    const country = a.country || 'India';
    const postalCode = a.postcode || '';

    const streetPart = houseNumber && street ? `${houseNumber}, ${street}` : (street || houseNumber || '');
    const parts = [
      streetPart,
      district && district.toLowerCase() !== city.toLowerCase() ? district : null,
      city,
      state,
      country,
    ].filter(Boolean);

    let formattedLocation = '';
    if (district && city && district.toLowerCase() !== city.toLowerCase()) {
      formattedLocation = `${district}, ${city}`;
    } else {
      formattedLocation = city || district || 'Local Area';
    }

    return {
      houseNumber,
      street,
      district,
      city,
      sublocality: a.suburb || a.neighbourhood || '',
      state,
      country,
      postalCode,
      formattedAddress: parts.join(', ') || data.display_name || formattedLocation,
      formattedLocation,
      region: district && city && district.toLowerCase() !== city.toLowerCase()
        ? `${district}, ${city}`
        : (city || (isInDelhiNcr(Number(lat), Number(lng)) ? 'Delhi-NCR' : 'Local Area')),
      source: 'nominatim',
    };
  } catch (err) {
    console.warn('Nominatim reverse geocode fallback error:', err?.message || err);
    return null;
  }
}

/**
 * Resilient reverse geocoding fallback via BigDataCloud client.
 * Returns city, district, and regional hierarchy without requiring external API keys.
 */
export async function reverseGeocodeFallback(lat, lng) {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    let city = data.city || data.locality || '';
    let locality = data.locality || '';
    let district = '';
    const state = data.principalSubdivision || '';
    const country = data.countryName || 'India';

    const admin = data.localityInfo?.administrative || [];
    for (const item of admin) {
      const desc = (item.description || '').toLowerCase();
      if (desc.includes('district') || item.adminLevel === 5) {
        district = (item.name || '').replace(/\s+district$/i, '').trim();
        break;
      }
    }

    if (locality && locality.toLowerCase() === 'noida') {
      city = 'Noida';
    }

    if (!city && locality) city = locality;
    if (!city && district) city = district;

    let formatted = '';
    if (district && city && district.toLowerCase() !== city.toLowerCase()) {
      formatted = `${district}, ${city}`;
    } else if (locality && city && locality.toLowerCase() !== city.toLowerCase()) {
      formatted = `${locality}, ${city}`;
    } else {
      formatted = city || district || 'Local Area';
    }

    const isDelhiCoords = isInDelhiNcr(Number(lat), Number(lng));
    const region = (district && city && district.toLowerCase() !== city.toLowerCase())
      ? `${district}, ${city}`
      : (city || district || (isDelhiCoords ? 'Delhi-NCR' : 'Local Area'));

    const parts = [locality, district, city, state, country].filter(Boolean);

    return {
      houseNumber: '',
      street: locality,
      city,
      district,
      sublocality: locality,
      state,
      country,
      postalCode: '',
      formattedAddress: parts.join(', ') || formatted,
      formattedLocation: formatted,
      region,
      source: 'reverse-geocode-client',
    };
  } catch (err) {
    console.warn('Fallback reverse geocode error:', err?.message || err);
    return null;
  }
}

/**
 * Comprehensive reverse geocode function with granular address components.
 * Tries Google -> Nominatim -> BigDataCloud.
 */
export async function reverseGeocodeDetailed(lat, lng) {
  if (lat == null || lng == null) return null;

  // 1. Google Maps Metadata
  const googleRes = await reverseGeocodeWithGoogle(lat, lng);
  if (googleRes && (googleRes.city || googleRes.district || googleRes.street)) {
    return googleRes;
  }

  // 2. OpenStreetMap Nominatim (High detail, house/street breakdown)
  const nomRes = await reverseGeocodeNominatim(lat, lng);
  if (nomRes && (nomRes.city || nomRes.district || nomRes.street)) {
    return nomRes;
  }

  // 3. BigDataCloud Fallback
  const fallbackRes = await reverseGeocodeFallback(lat, lng);
  if (fallbackRes && (fallbackRes.city || fallbackRes.district)) {
    return fallbackRes;
  }

  return {
    houseNumber: '',
    street: '',
    city: '',
    district: '',
    sublocality: '',
    state: '',
    country: '',
    postalCode: '',
    formattedAddress: `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°`,
    formattedLocation: `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°`,
    region: isInDelhiNcr(Number(lat), Number(lng)) ? 'Delhi-NCR' : 'Local Area',
    source: 'coords',
  };
}

/**
 * Unified reverse geocode function maintaining backward compatibility with existing callers.
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) {
    return {
      houseNumber: '',
      street: '',
      city: 'National Capital Region',
      district: 'Central District',
      sublocality: 'Central Hub',
      state: 'NCR',
      country: 'India',
      postalCode: '110001',
      formattedAddress: 'Central Hub, National Capital Region, India',
      formattedLocation: 'Central Hub, NCR',
      region: 'National Capital Region',
      source: 'default',
    };
  }

  const detailed = await reverseGeocodeDetailed(lat, lng);
  if (detailed) return detailed;

  return {
    houseNumber: '',
    street: '',
    city: '',
    district: '',
    sublocality: '',
    state: '',
    country: '',
    postalCode: '',
    formattedAddress: `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°`,
    formattedLocation: `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°`,
    region: isInDelhiNcr(Number(lat), Number(lng)) ? 'Delhi-NCR' : 'Local Area',
    source: 'coords',
  };
}

/**
 * Forward Geocoding: resolves an address or place name into coordinates and structured address components.
 * Tries Google Maps Geocoder -> Photon -> Nominatim -> Known Coords.
 */
export async function forwardGeocode(query) {
  const q = (query || '').trim();
  if (!q) return null;

  // 1. Google Maps Geocoder (if available)
  try {
    const geocoder = await getGoogleGeocoder();
    if (geocoder) {
      const resp = await geocoder.geocode({ address: q });
      const results = resp?.results || [];
      if (results.length > 0) {
        const top = results[0];
        const lat = top.geometry.location.lat();
        const lon = top.geometry.location.lng();
        let houseNumber = '';
        let street = '';
        let district = '';
        let city = '';
        let state = '';
        let country = '';

        for (const comp of top.address_components || []) {
          if (!houseNumber && (comp.types.includes('street_number') || comp.types.includes('premise'))) {
            houseNumber = comp.long_name;
          }
          if (!street && (comp.types.includes('route') || comp.types.includes('street_address'))) {
            street = comp.long_name;
          }
          if (!district && (comp.types.includes('administrative_area_level_2') || comp.types.includes('administrative_area_level_3'))) {
            district = comp.long_name;
          }
          if (!city && (comp.types.includes('locality') || comp.types.includes('postal_town'))) {
            city = comp.long_name;
          }
          if (!state && comp.types.includes('administrative_area_level_1')) {
            state = comp.long_name;
          }
          if (!country && comp.types.includes('country')) {
            country = comp.long_name;
          }
        }

        return {
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
          houseNumber,
          street,
          district: district.replace(/\s+district$/i, '').trim(),
          city: city || district,
          state,
          country,
          formattedAddress: top.formatted_address || q,
          source: 'google',
        };
      }
    }
  } catch (err) {
    console.warn('Google forward geocode error:', err?.message || err);
  }

  // 2. Photon Geocoder (Fast OSM index worldwide)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1`;
    const res = await fetch(photonUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      const feat = data.features?.[0];
      if (feat && feat.geometry?.coordinates?.length >= 2) {
        const [lon, lat] = feat.geometry.coordinates;
        const p = feat.properties || {};
        const houseNumber = p.housenumber || '';
        const street = p.street || '';
        const district = (p.county || p.district || '').replace(/\s+district$/i, '').trim();
        const city = p.city || p.town || p.name || '';
        const state = p.state || '';
        const country = p.country || '';

        const streetLine = houseNumber && street ? `${houseNumber}, ${street}` : (street || houseNumber || p.name || '');
        const parts = [
          streetLine !== city ? streetLine : null,
          district && district !== city ? district : null,
          city,
          state,
          country,
        ].filter(Boolean);

        return {
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
          houseNumber,
          street: street || p.name,
          district,
          city: city || district,
          state,
          country,
          formattedAddress: parts.join(', ') || q,
          source: 'photon',
        };
      }
    }
  } catch (err) {
    console.warn('Photon forward geocode error:', err?.message || err);
  }

  // 3. Nominatim forward geocoding (Global fallback)
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=1`;
    const res = await fetch(nomUrl, {
      headers: { 'User-Agent': 'AriseApp/1.0' },
      signal: AbortSignal.timeout(3500),
    });
    if (res.ok) {
      const list = await res.json();
      if (list && list.length > 0) {
        const item = list[0];
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);
        const a = item.address || {};
        const houseNumber = a.house_number || a.house_name || '';
        const street = a.road || a.street || '';
        const district = (a.state_district || a.county || a.district || '').replace(/\s+district$/i, '').trim();
        const city = a.city || a.town || a.village || a.municipality || '';
        const state = a.state || '';
        const country = a.country || '';

        return {
          lat: Number(lat.toFixed(5)),
          lon: Number(lon.toFixed(5)),
          houseNumber,
          street,
          district,
          city: city || district,
          state,
          country,
          formattedAddress: item.display_name || q,
          source: 'nominatim',
        };
      }
    }
  } catch (err) {}

  // 4. Fallback matching against known coordinates
  // Sort known coordinates by length descending so longer/more specific names
  // (e.g. 'greater noida', 'new delhi') match before shorter substrings (e.g. 'noida', 'delhi').
  const lower = q.toLowerCase();
  const sortedKnownCoords = Object.entries(KNOWN_COORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of sortedKnownCoords) {
    if (lower.includes(k)) {
      const formattedCity = k.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return {
        lat: v.lat,
        lon: v.lon,
        houseNumber: '',
        street: '',
        district: '',
        city: formattedCity,
        state: 'Delhi-NCR',
        country: 'India',
        formattedAddress: `${formattedCity}, Delhi-NCR, India`,
        source: 'preset',
      };
    }
  }

  const sortedMajorCities = [...MAJOR_INDIAN_CITIES].sort((a, b) => {
    const lenA = Math.max(a.city.length, a.name.length);
    const lenB = Math.max(b.city.length, b.name.length);
    return lenB - lenA;
  });
  for (const c of sortedMajorCities) {
    if (lower.includes(c.city.toLowerCase()) || lower.includes(c.name.toLowerCase())) {
      return {
        lat: c.lat,
        lon: c.lon,
        houseNumber: '',
        street: '',
        district: c.name,
        city: c.city,
        state: c.state,
        country: 'India',
        formattedAddress: `${c.name}, ${c.state}, India`,
        source: 'preset',
      };
    }
  }

  return null;
}

/**
 * Forward location search for streets, sectors, districts, towns, and cities worldwide.
 * Uses Photon OSM search index supplemented by Nominatim and Google Maps Geocoder.
 */
export async function searchLocations(query, { stations = [], hubs = [], districts = REGIONAL_DISTRICTS } = {}) {
  const q = (query || '').trim();
  if (q.length < 2) return [];

  const lowerQ = q.toLowerCase();
  const results = [];
  const seenCoords = new Set();

  const addResult = (item) => {
    const lat = Number(item.lat);
    const lon = Number(item.lon ?? item.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const coordKey = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (seenCoords.has(coordKey)) return;
    seenCoords.add(coordKey);
    results.push({
      ...item,
      lat,
      lon,
    });
  };

  // 1. Instant local match against stations, national hubs, and regional districts
  for (const st of stations) {
    if (st.name && st.name.toLowerCase().includes(lowerQ)) {
      addResult({
        id: `st-${st.id || st.name}`,
        name: st.name,
        subtitle: `${st.city || 'Regional Airshed'} · Monitoring Station (AQI ${st.aqi || '—'})`,
        city: st.city || 'National Capital Region',
        district: st.district || '',
        state: st.state || 'NCR',
        country: 'India',
        lat: st.lat,
        lon: st.lng,
        type: 'station',
        zoom: 14,
      });
    }
  }

  for (const hub of hubs) {
    if (hub.name && hub.name.toLowerCase().includes(lowerQ)) {
      addResult({
        id: `hub-${hub.name}`,
        name: hub.name,
        subtitle: `${hub.state || 'India'} · Air Monitoring Area (AQI ${hub.aqi || '—'})`,
        city: hub.name,
        district: hub.name,
        state: hub.state || '',
        country: 'India',
        lat: hub.lat,
        lon: hub.lng,
        type: 'city',
        zoom: 11,
      });
    }
  }

  for (const dist of districts) {
    if ((dist.name && dist.name.toLowerCase().includes(lowerQ)) || (dist.city && dist.city.toLowerCase().includes(lowerQ))) {
      addResult({
        id: `dist-${dist.name}`,
        name: dist.name,
        subtitle: `${dist.state || 'India'} · Regional District (AQI ${dist.aqi || '—'})`,
        city: dist.city || dist.name,
        district: dist.name,
        state: dist.state || '',
        country: 'India',
        lat: dist.lat,
        lon: dist.lon,
        type: 'district',
        zoom: 12,
      });
    }
  }

  // 2. Query Photon Geocoder (Fast OSM index worldwide)
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`;
    const res = await fetch(photonUrl, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = await res.json();
      for (const feat of data.features || []) {
        const props = feat.properties || {};
        const coords = feat.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const [lon, lat] = coords;
        const country = props.country || '';
        const state = props.state || '';
        const houseNumber = props.housenumber || '';
        const street = props.street || '';
        const district = (props.county || props.district || '').replace(/\s+district$/i, '').trim();
        const city = props.city || props.town || props.village || '';
        const name = props.name || street || district || city || q;

        const streetLine = houseNumber && street ? `${houseNumber}, ${street}` : (street || houseNumber || name);
        const parts = [
          streetLine !== name ? streetLine : null,
          district && district !== name ? district : null,
          city && city !== name ? city : null,
          state,
          country,
        ].filter(Boolean);

        const type = props.type === 'house' || street ? 'street' :
                     props.type === 'district' || district ? 'district' :
                     city ? 'city' : 'locality';

        const zoom = type === 'street' ? 15 : type === 'district' ? 13 : 11;

        addResult({
          id: `osm-${props.osm_id || Math.random()}`,
          name,
          subtitle: parts.join(', ') || [city, state, country].filter(Boolean).join(', ') || 'Global Location',
          houseNumber,
          street,
          district,
          city: city || district || name,
          state,
          country,
          lat,
          lon,
          type,
          zoom,
          formattedAddress: [name, district, city, state, country].filter(Boolean).join(', '),
        });
      }
    }
  } catch {
    // Photon timed out or failed, try Nominatim fallback
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6`;
      const res = await fetch(nomUrl, {
        headers: { 'User-Agent': 'AriseApp/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const list = await res.json();
        for (const item of list || []) {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          const name = item.name || item.display_name.split(',')[0];
          const addr = item.address || {};
          const houseNumber = addr.house_number || addr.house_name || '';
          const street = addr.road || addr.street || '';
          const city = addr.city || addr.town || addr.village || addr.county || '';
          const district = (addr.state_district || addr.county || '').replace(/\s+district$/i, '').trim();
          const state = addr.state || '';
          const country = addr.country || '';
          const type = item.type === 'residential' || item.class === 'highway' ? 'street' :
                       item.addresstype === 'city_district' || item.type === 'administrative' ? 'district' : 'locality';
          const zoom = type === 'street' ? 15 : 12;
          addResult({
            id: `nom-${item.place_id}`,
            name,
            subtitle: item.display_name,
            houseNumber,
            street,
            city: city || district || name,
            district,
            state,
            country,
            lat,
            lon,
            type,
            zoom,
            formattedAddress: item.display_name,
          });
        }
      }
    } catch {}
  }

  // 3. Google Maps Geocoder (if available in window)
  try {
    const geocoder = await getGoogleGeocoder();
    if (geocoder && results.length < 5) {
      const resp = await geocoder.geocode({ address: q });
      for (const r of resp?.results || []) {
        const lat = r.geometry.location.lat();
        const lon = r.geometry.location.lng();
        const name = r.formatted_address.split(',')[0];
        addResult({
          id: `g-${r.place_id || Math.random()}`,
          name,
          subtitle: r.formatted_address,
          city: name,
          district: '',
          state: '',
          lat,
          lon,
          type: 'location',
          zoom: 14,
          formattedAddress: r.formatted_address,
        });
      }
    }
  } catch {}

  return results.slice(0, 8);
}
