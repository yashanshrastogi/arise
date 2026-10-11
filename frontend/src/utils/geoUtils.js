import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

/**
 * Arise Geocoding & Reverse Geocoding Utility
 * Extracts City, District, Sublocality, and State using Google Maps Geocoder API metadata.
 * Provides resilient, automatic fallback to lightweight reverse geocode client if Google Maps API
 * is unavailable or restricted.
 */

let geocoderInstance = null;

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

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
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
 * Extracts:
 * - locality -> city
 * - administrative_area_level_2 -> district
 * - sublocality / sublocality_level_1 -> neighborhood/sublocality
 * - administrative_area_level_1 -> state
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

    let city = '';
    let district = '';
    let sublocality = '';
    let state = '';
    let country = '';

    for (const res of results) {
      for (const comp of res.address_components || []) {
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
      }
      if (city && district) break;
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

    const region = (cleanDistrict && cleanCity && cleanDistrict.toLowerCase() !== cleanCity.toLowerCase())
      ? `${cleanDistrict}, ${cleanCity}`
      : (cleanCity || cleanDistrict || 'Delhi-NCR');

    return {
      city: cleanCity,
      district: cleanDistrict,
      sublocality,
      state,
      country,
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

    // Special check for well-known areas in Delhi-NCR
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

    const region = (district && city && district.toLowerCase() !== city.toLowerCase())
      ? `${district}, ${city}`
      : (city || district || 'Delhi-NCR');

    return {
      city,
      district,
      sublocality: locality,
      state,
      country,
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
 * Unified reverse geocode function.
 * Tries Google Maps Geocoder first; if restricted/failing, falls back to BigDataCloud.
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) {
    return {
      city: 'New Delhi',
      district: 'Central Delhi',
      sublocality: 'Mandir Marg',
      state: 'Delhi',
      country: 'India',
      formattedLocation: 'Central Delhi, New Delhi',
      region: 'Central Delhi, New Delhi',
      source: 'default',
    };
  }

  // 1. Google Maps Metadata
  const googleRes = await reverseGeocodeWithGoogle(lat, lng);
  if (googleRes && (googleRes.city || googleRes.district)) {
    return googleRes;
  }

  // 2. Resilient API fallback
  const fallbackRes = await reverseGeocodeFallback(lat, lng);
  if (fallbackRes && (fallbackRes.city || fallbackRes.district)) {
    return fallbackRes;
  }

  // 3. Fallback coordinates
  return {
    city: '',
    district: '',
    sublocality: '',
    state: '',
    country: '',
    formattedLocation: `${Number(lat).toFixed(3)}°, ${Number(lng).toFixed(3)}°`,
    region: 'Delhi-NCR',
    source: 'coords',
  };
}
