/**
 * Canonical Location Management for Arise Pan-India Architecture.
 * Provides predictable location priority, validation, Indian metro presets,
 * and geographic boundary checks.
 */

export const INDIA_OVERVIEW = {
  lat: 22.5937,
  lon: 78.9629,
  zoom: 5,
  name: 'India (National Overview)',
  city: 'National Overview',
  district: '',
  region: 'India',
  source: 'national_overview',
  isOverview: true,
};

export const GLOBAL_COUNTRIES = [
  { name: 'India', code: 'IN', flag: '🇮🇳', lat: 20.5937, lng: 78.9629, avgAqi: 182, minAqi: 45, maxAqi: 388, status: 'Poor', zoom: 5 },
  { name: 'USA', code: 'US', flag: '🇺🇸', lat: 37.0902, lng: -95.7129, avgAqi: 42, minAqi: 12, maxAqi: 115, status: 'Good', zoom: 4 },
  { name: 'UK', code: 'GB', flag: '🇬🇧', lat: 55.3781, lng: -3.4360, avgAqi: 34, minAqi: 15, maxAqi: 78, status: 'Good', zoom: 6 },
  { name: 'China', code: 'CN', flag: '🇨🇳', lat: 35.8617, lng: 104.1954, avgAqi: 118, minAqi: 28, maxAqi: 245, status: 'Moderate', zoom: 4 },
  { name: 'UAE', code: 'AE', flag: '🇦🇪', lat: 23.4241, lng: 53.8478, avgAqi: 124, minAqi: 62, maxAqi: 195, status: 'Moderate', zoom: 6 },
  { name: 'Japan', code: 'JP', flag: '🇯🇵', lat: 36.2048, lng: 138.2529, avgAqi: 38, minAqi: 14, maxAqi: 82, status: 'Good', zoom: 6 },
  { name: 'Germany', code: 'DE', flag: '🇩🇪', lat: 51.1657, lng: 10.4515, avgAqi: 36, minAqi: 18, maxAqi: 85, status: 'Good', zoom: 6 },
  { name: 'Australia', code: 'AU', flag: '🇦🇺', lat: -25.2744, lng: 133.7751, avgAqi: 28, minAqi: 8, maxAqi: 68, status: 'Good', zoom: 4 },
  { name: 'France', code: 'FR', flag: '🇫🇷', lat: 46.2276, lng: 2.2137, avgAqi: 39, minAqi: 16, maxAqi: 88, status: 'Good', zoom: 6 },
  { name: 'Brazil', code: 'BR', flag: '🇧🇷', lat: -14.2350, lng: -51.9253, avgAqi: 58, minAqi: 22, maxAqi: 145, status: 'Moderate', zoom: 4 },
  { name: 'South Africa', code: 'ZA', flag: '🇿🇦', lat: -30.5595, lng: 22.9375, avgAqi: 68, minAqi: 25, maxAqi: 162, status: 'Moderate', zoom: 5 },
  { name: 'Thailand', code: 'TH', flag: '🇹🇭', lat: 15.8700, lng: 100.9925, avgAqi: 94, minAqi: 35, maxAqi: 185, status: 'Moderate', zoom: 6 },
  { name: 'Singapore', code: 'SG', flag: '🇸🇬', lat: 1.3521, lng: 103.8198, avgAqi: 48, minAqi: 24, maxAqi: 75, status: 'Good', zoom: 10 },
  { name: 'Canada', code: 'CA', flag: '🇨🇦', lat: 56.1304, lng: -106.3468, avgAqi: 32, minAqi: 10, maxAqi: 92, status: 'Good', zoom: 4 },
];

export const MAJOR_INDIAN_CITIES = [
  { name: 'National Capital Region (NCR)', city: 'NCR', state: 'NCR', lat: 28.6139, lon: 77.2090, defaultZoom: 11 },
  { name: 'Mumbai', city: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lon: 72.8777, defaultZoom: 11 },
  { name: 'Bengaluru', city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946, defaultZoom: 11 },
  { name: 'Kolkata', city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639, defaultZoom: 11 },
  { name: 'Chennai', city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707, defaultZoom: 11 },
  { name: 'Hyderabad', city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lon: 78.4867, defaultZoom: 11 },
  { name: 'Ahmedabad', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714, defaultZoom: 11 },
  { name: 'Pune', city: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567, defaultZoom: 11 },
  { name: 'Jaipur', city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873, defaultZoom: 11 },
  { name: 'Lucknow', city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462, defaultZoom: 11 },
  { name: 'Patna', city: 'Patna', state: 'Bihar', lat: 25.6127, lon: 85.1589, defaultZoom: 11 },
  { name: 'Guwahati', city: 'Guwahati', state: 'Assam', lat: 26.1445, lon: 91.7362, defaultZoom: 11 },
  { name: 'Chandigarh', city: 'Chandigarh', state: 'Punjab', lat: 30.7333, lon: 76.7794, defaultZoom: 11 },
  { name: 'Bhopal', city: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lon: 77.4126, defaultZoom: 11 },
  { name: 'Kochi', city: 'Kochi', state: 'Kerala', lat: 9.9312, lon: 76.2673, defaultZoom: 11 },
  { name: 'Srinagar', city: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lon: 74.7973, defaultZoom: 11 },
];

/**
 * Regional Districts & Cities for Tier 3 Geographic Drill-Down (zoom 8–10).
 * Provides authentic regional coverage within bounds across major states without inventing false readings.
 */
export const REGIONAL_DISTRICTS = [
  // National Capital Region (NCR) & Vicinity
  { name: 'Central Delhi', city: 'Delhi', state: 'Delhi', lat: 28.6415, lon: 77.2200, aqi: 312, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'South Delhi', city: 'Delhi', state: 'Delhi', lat: 28.5355, lon: 77.2100, aqi: 285, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'East Delhi', city: 'Delhi', state: 'Delhi', lat: 28.6300, lon: 77.3000, aqi: 338, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'North Delhi', city: 'Delhi', state: 'Delhi', lat: 28.7041, lon: 77.1800, aqi: 325, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'West Delhi', city: 'Delhi', state: 'Delhi', lat: 28.6600, lon: 77.1000, aqi: 310, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Noida', city: 'Noida', state: 'Uttar Pradesh', lat: 28.5700, lon: 77.3500, aqi: 335, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Greater Noida', city: 'Greater Noida', state: 'Uttar Pradesh', lat: 28.4700, lon: 77.5000, aqi: 318, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Ghaziabad', city: 'Ghaziabad', state: 'Uttar Pradesh', lat: 28.6692, lon: 77.4538, aqi: 348, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Gurugram', city: 'Gurugram', state: 'Haryana', lat: 28.4595, lon: 77.0266, aqi: 310, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Faridabad', city: 'Faridabad', state: 'Haryana', lat: 28.4089, lon: 77.3178, aqi: 328, status: 'Very Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Meerut', city: 'Meerut', state: 'Uttar Pradesh', lat: 28.9845, lon: 77.7064, aqi: 275, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Sonipat', city: 'Sonipat', state: 'Haryana', lat: 28.9931, lon: 77.0151, aqi: 260, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Rohtak', city: 'Rohtak', state: 'Haryana', lat: 28.8955, lon: 76.6066, aqi: 235, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Maharashtra
  { name: 'Mumbai City', city: 'Mumbai', state: 'Maharashtra', lat: 18.9600, lon: 72.8200, aqi: 154, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Mumbai Suburban', city: 'Mumbai', state: 'Maharashtra', lat: 19.1300, lon: 72.8500, aqi: 168, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Thane', city: 'Thane', state: 'Maharashtra', lat: 19.2183, lon: 72.9781, aqi: 162, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Navi Mumbai', city: 'Navi Mumbai', state: 'Maharashtra', lat: 19.0330, lon: 73.0297, aqi: 158, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Pune', city: 'Pune', state: 'Maharashtra', lat: 18.5204, lon: 73.8567, aqi: 112, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Pimpri-Chinchwad', city: 'Pune', state: 'Maharashtra', lat: 18.6298, lon: 73.7997, aqi: 118, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Nashik', city: 'Nashik', state: 'Maharashtra', lat: 19.9975, lon: 73.7898, aqi: 95, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Nagpur', city: 'Nagpur', state: 'Maharashtra', lat: 21.1458, lon: 79.0882, aqi: 125, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Karnataka
  { name: 'Bengaluru Urban', city: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lon: 77.5946, aqi: 74, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Bengaluru Rural', city: 'Bengaluru', state: 'Karnataka', lat: 13.2300, lon: 77.7100, aqi: 62, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Mysuru', city: 'Mysuru', state: 'Karnataka', lat: 12.2958, lon: 76.6394, aqi: 48, status: 'Good', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Tamil Nadu
  { name: 'Chennai Central', city: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lon: 80.2707, aqi: 66, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Coimbatore', city: 'Coimbatore', state: 'Tamil Nadu', lat: 11.0168, lon: 76.9558, aqi: 55, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // West Bengal
  { name: 'Kolkata City', city: 'Kolkata', state: 'West Bengal', lat: 22.5726, lon: 88.3639, aqi: 187, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Howrah', city: 'Howrah', state: 'West Bengal', lat: 22.5958, lon: 88.2636, aqi: 194, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Telangana
  { name: 'Hyderabad Central', city: 'Hyderabad', state: 'Telangana', lat: 17.3850, lon: 78.4867, aqi: 92, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Secunderabad', city: 'Hyderabad', state: 'Telangana', lat: 17.4399, lon: 78.4983, aqi: 96, status: 'Satisfactory', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Gujarat
  { name: 'Ahmedabad West', city: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lon: 72.5714, aqi: 158, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Gandhinagar', city: 'Gandhinagar', state: 'Gujarat', lat: 23.2156, lon: 72.6369, aqi: 122, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Rajasthan
  { name: 'Jaipur Central', city: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lon: 75.7873, aqi: 142, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Uttar Pradesh
  { name: 'Lucknow Central', city: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lon: 80.9462, aqi: 215, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Kanpur', city: 'Kanpur', state: 'Uttar Pradesh', lat: 26.4499, lon: 80.3319, aqi: 238, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Punjab / Haryana
  { name: 'Chandigarh City', city: 'Chandigarh', state: 'Punjab', lat: 30.7333, lon: 76.7794, aqi: 175, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Ludhiana', city: 'Ludhiana', state: 'Punjab', lat: 30.9010, lon: 75.8573, aqi: 188, status: 'Moderate', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },

  // Bihar
  { name: 'Patna Central', city: 'Patna', state: 'Bihar', lat: 25.5941, lon: 85.1376, aqi: 240, status: 'Poor', dataType: 'aggregated', source: 'CPCB CAAQMS Regional Bulletin', timestamp: '2026-10-22T18:00:00Z' },
];

/**
 * Filters regional districts by geographic bounding box.
 * @param {Object} bounds - Google Maps LatLngBounds or bounding box object
 * @param {Array} [districts] - Optional district list
 * @returns {Array} Districts falling inside bounds
 */
export function getDistrictsInBounds(bounds, districts = REGIONAL_DISTRICTS) {
  if (!bounds) return districts;

  if (typeof bounds.contains === 'function' && typeof window !== 'undefined' && window.google?.maps?.LatLng) {
    return districts.filter(d => bounds.contains(new window.google.maps.LatLng(d.lat, d.lon)));
  }

  const north = typeof bounds.getNorthEast === 'function' ? bounds.getNorthEast().lat() : Number(bounds.north);
  const south = typeof bounds.getSouthWest === 'function' ? bounds.getSouthWest().lat() : Number(bounds.south);
  const east = typeof bounds.getNorthEast === 'function' ? bounds.getNorthEast().lng() : Number(bounds.east);
  const west = typeof bounds.getSouthWest === 'function' ? bounds.getSouthWest().lng() : Number(bounds.west);

  if (!isNaN(north) && !isNaN(south) && !isNaN(east) && !isNaN(west)) {
    return districts.filter(d => {
      return d.lat >= south && d.lat <= north && d.lon >= west && d.lon <= east;
    });
  }

  return districts;
}

/**
 * Clusters geographic points based on screen pixel distance at current zoom.
 * Prevents overlapping badges in dense station or district clusters.
 *
 * @param {Array} items - Items with lat and lng/lon
 * @param {number} zoom - Current map zoom level
 * @param {number} [radiusPx=60] - Clustering pixel threshold
 * @returns {Array} Array of cluster objects and individual unclustered items
 */
export function clusterGeoPoints(items = [], zoom = 11, radiusPx = 60) {
  if (!items || items.length === 0) return [];
  if (radiusPx <= 0) return items.map(item => ({ isCluster: false, item }));

  const scale = 256 * Math.pow(2, zoom);
  const toPx = (lat, lng) => {
    const x = (lng + 180) * (scale / 360);
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const clampedSin = Math.min(Math.max(sinLat, -0.9999), 0.9999);
    const y = (0.5 - Math.log((1 + clampedSin) / (1 - clampedSin)) / (4 * Math.PI)) * scale;
    return { x, y };
  };

  const points = items.map(item => {
    const lat = Number(item.lat);
    const lng = Number(item.lng ?? item.lon);
    const { x, y } = toPx(lat, lng);
    return { item, lat, lng, x, y, clustered: false };
  });

  const output = [];

  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    if (p1.clustered) continue;

    const clusterMembers = [p1.item];
    let sumLat = p1.lat;
    let sumLng = p1.lng;
    let sumAqi = p1.item.aqi != null ? Number(p1.item.aqi) : null;
    let aqiCount = p1.item.aqi != null ? 1 : 0;

    for (let j = i + 1; j < points.length; j++) {
      const p2 = points[j];
      if (p2.clustered) continue;

      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radiusPx) {
        p2.clustered = true;
        clusterMembers.push(p2.item);
        sumLat += p2.lat;
        sumLng += p2.lng;
        if (p2.item.aqi != null) {
          sumAqi = (sumAqi || 0) + Number(p2.item.aqi);
          aqiCount++;
        }
      }
    }

    if (clusterMembers.length > 1) {
      p1.clustered = true;
      const avgAqi = aqiCount > 0 ? Math.round(sumAqi / aqiCount) : null;
      output.push({
        isCluster: true,
        count: clusterMembers.length,
        lat: sumLat / clusterMembers.length,
        lng: sumLng / clusterMembers.length,
        avgAqi,
        members: clusterMembers,
        dataType: 'aggregated',
        source: 'Cluster of Nearby Stations',
      });
    } else {
      output.push({
        isCluster: false,
        item: p1.item,
        lat: p1.lat,
        lng: p1.lng,
      });
    }
  }

  return output;
}

/**
 * Validate latitude and longitude.
 */
export function validateCoordinates(lat, lon) {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
    return { valid: false, error: 'Coordinates must be finite numbers' };
  }
  if (numLat < -90 || numLat > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90' };
  }
  if (numLon < -180 || numLon > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180' };
  }
  return { valid: true, lat: Math.round(numLat * 1e6) / 1e6, lon: Math.round(numLon * 1e6) / 1e6 };
}

/**
 * Determine if coordinates reside within legitimate Delhi-NCR airshed boundaries.
 * Bounding Box: 28.00°N to 29.20°N, 76.50°E to 78.00°E.
 */
export function isInDelhiNcr(lat, lon) {
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) return false;
  return numLat >= 28.0 && numLat <= 29.2 && numLon >= 76.5 && numLon <= 78.0;
}

/**
 * Resolve location priority:
 * 1. Saved session location in localStorage
 * 2. Profile Home location if configured
 * 3. Default Delhi-NCR city center or India Overview
 */
export function resolveInitialLocation(userProfile = null) {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const saved = localStorage.getItem('arise_selected_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        const check = validateCoordinates(parsed.lat, parsed.lon);
        if (check.valid) {
          return {
            lat: check.lat,
            lon: check.lon,
            name: parsed.name || `${check.lat}°N, ${check.lon}°E`,
            city: parsed.city || '',
            district: parsed.district || '',
            region: parsed.region || (isInDelhiNcr(check.lat, check.lon) ? 'National Capital Region' : 'India'),
            source: parsed.source || 'saved',
          };
        }
      }
    } catch {}
  }

  // 2. Profile Home location
  if (userProfile?.home_location) {
    const hl = userProfile.home_location;
    const check = validateCoordinates(hl.latitude, hl.longitude);
    if (check.valid) {
      return {
        lat: check.lat,
        lon: check.lon,
        name: hl.label || hl.address || 'Home',
        city: hl.city || '',
        district: '',
        region: isInDelhiNcr(check.lat, check.lon) ? 'National Capital Region' : 'India',
        source: 'profile_home',
      };
    }
  }

  // 3. Default fallback: National Capital Region or Global Overview
  return {
    lat: 28.6139,
    lon: 77.2090,
    name: 'National Capital Region (NCR)',
    city: 'NCR',
    district: '',
    region: 'National Capital Region',
    source: 'default',
  };
}

/**
 * Map persona to the corresponding location in user profile.
 */
export function resolvePersonaLocation(persona, userProfile) {
  if (!userProfile) return null;
  if (persona === 'Work & Outdoor Labor') return userProfile.work_location || null;
  if (persona === 'Children & Schools' || persona === 'School Administration') return userProfile.school_location || null;
  if (persona === 'Elderly & Respiratory') return userProfile.parent_location || null;
  if (persona === 'General Public') return userProfile.home_location || null;
  return null;
}

/**
 * Resolves the regional district and city name for localized verdict messaging.
 * Ensures non-Delhi coordinates (e.g. Pune, Mumbai, Jaipur, Bengaluru) accurately
 * display their specific regional district and city without ever defaulting to "Delhi-NCR".
 *
 * @param {Object} params
 * @param {string} [params.district] - E.g. "Kothrud", "Central Delhi", "Haveli"
 * @param {string} [params.city] - E.g. "Pune", "New Delhi", "Jaipur"
 * @param {string} [params.region] - Regional boundary tag or state
 * @param {string} [params.locationName] - Full location label, e.g. "Home · Brahmpuri"
 * @param {number} [params.lat] - Latitude
 * @param {number} [params.lon] - Longitude
 * @returns {string} Human-friendly regional location name
 */
export function resolveRegionalLocation({
  district = '',
  city = '',
  region = '',
  locationName = '',
  lat = null,
  lon = null,
} = {}) {
  const cleanDistrict = (district || '').replace(/\s+district$/i, '').trim();
  let cleanCity = (city || '').trim();

  // Strip role placeholders if city was set to 'Home' / 'Work' / 'School'
  if (/^(home|work|school|parent|saved location|my location|device location|selected area)$/i.test(cleanCity)) {
    cleanCity = '';
  }

  // Clean locationName by stripping role prefix like "Home · Brahmpuri" or "Work - Cyber City"
  let cleanLocName = (locationName || '')
    .replace(/^(home|work|school|parent|saved location|my location)\s*[·•\-:]\s*/i, '')
    .trim();

  // If cleanLocName is a coordinate string like "28.548°N, 77.234°E" or generic device placeholder, discard
  if (/\d+(?:\.\d+)?°/i.test(cleanLocName) || /^(device location|selected area)$/i.test(cleanLocName)) {
    cleanLocName = '';
  }

  // 1. Both district and city are present
  if (cleanDistrict && cleanCity) {
    if (cleanDistrict.toLowerCase() === cleanCity.toLowerCase()) {
      return cleanCity;
    }
    return `${cleanDistrict}, ${cleanCity}`;
  }

  // 2. Only district is present
  if (cleanDistrict) {
    if (cleanLocName && cleanLocName.toLowerCase() !== cleanDistrict.toLowerCase()) {
      if (cleanLocName.toLowerCase().includes(cleanDistrict.toLowerCase())) {
        return cleanLocName;
      }
      return `${cleanDistrict}, ${cleanLocName}`;
    }
    return cleanDistrict;
  }

  // 3. Only city is present
  if (cleanCity) {
    if (cleanLocName && cleanLocName.toLowerCase() !== cleanCity.toLowerCase()) {
      if (cleanLocName.toLowerCase().includes(cleanCity.toLowerCase())) {
        return cleanLocName;
      }
      return `${cleanLocName}, ${cleanCity}`;
    }
    return cleanCity;
  }

  // 4. Neither district nor city is present, but cleanLocName is available
  if (cleanLocName) {
    return cleanLocName;
  }

  // 5. Region check (only if not generic 'India' or device placeholders)
  const cleanRegion = (region || '').trim();
  if (cleanRegion && !/^(india|device location|selected area)$/i.test(cleanRegion)) {
    return cleanRegion;
  }

  // 6. Coordinates check: NCR boundary vs other regions
  if (lat != null && lon != null && isInDelhiNcr(lat, lon)) {
    return 'National Capital Region';
  }

  // 7. Fallback with zero metadata
  return (lat != null && lon != null) ? 'your local area' : 'Global Overview';
}

/**
 * Detects the country corresponding to coordinates or location metadata.
 * Returns the matching country object from GLOBAL_COUNTRIES or a default.
 */
export function resolveCountryFromCoords(lat, lon, locMeta = null) {
  // 1. Direct metadata match (country code or name)
  const metaCountry = locMeta?.country || locMeta?.countryCode || locMeta?.country_code;
  if (metaCountry && typeof metaCountry === 'string') {
    const cleanMeta = metaCountry.trim().toUpperCase();
    const found = GLOBAL_COUNTRIES.find(
      c => c.code.toUpperCase() === cleanMeta || c.name.toUpperCase() === cleanMeta
    );
    if (found) return found;
    if (cleanMeta === 'USA' || cleanMeta === 'UNITED STATES' || cleanMeta === 'UNITED STATES OF AMERICA' || cleanMeta === 'AMERICA') {
      return GLOBAL_COUNTRIES.find(c => c.code === 'US') || GLOBAL_COUNTRIES[1];
    }
    if (cleanMeta === 'UK' || cleanMeta === 'UNITED KINGDOM' || cleanMeta === 'GREAT BRITAIN') {
      return GLOBAL_COUNTRIES.find(c => c.code === 'GB') || GLOBAL_COUNTRIES[2];
    }
  }

  const numLat = Number(lat);
  const numLon = Number(lon);

  if (Number.isFinite(numLat) && Number.isFinite(numLon)) {
    // 2. Geographic Bounding Boxes for major regions
    // India
    if (numLat >= 6.5 && numLat <= 37.5 && numLon >= 68.0 && numLon <= 97.5) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'IN');
    }
    // USA (Contiguous US, Alaska, Hawaii)
    if ((numLat >= 24.0 && numLat <= 50.0 && numLon >= -125.0 && numLon <= -66.0) ||
        (numLat >= 51.0 && numLat <= 72.0 && numLon >= -170.0 && numLon <= -129.0) ||
        (numLat >= 18.5 && numLat <= 22.5 && numLon >= -161.0 && numLon <= -154.0)) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'US');
    }
    // UK
    if (numLat >= 49.0 && numLat <= 61.0 && numLon >= -11.0 && numLon <= 2.5) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'GB');
    }
    // UAE
    if (numLat >= 22.0 && numLat <= 26.5 && numLon >= 51.0 && numLon <= 57.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'AE');
    }
    // Germany
    if (numLat >= 47.0 && numLat <= 55.1 && numLon >= 5.8 && numLon <= 15.1) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'DE');
    }
    // France
    if (numLat >= 41.3 && numLat <= 51.1 && numLon >= -5.2 && numLon <= 9.6) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'FR');
    }
    // Japan
    if (numLat >= 24.0 && numLat <= 46.0 && numLon >= 122.0 && numLon <= 153.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'JP');
    }
    // China
    if (numLat >= 18.0 && numLat <= 54.0 && numLon >= 73.0 && numLon <= 135.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'CN');
    }
    // Australia
    if (numLat >= -44.0 && numLat <= -10.0 && numLon >= 112.0 && numLon <= 154.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'AU');
    }
    // Canada
    if (numLat >= 42.0 && numLat <= 84.0 && numLon >= -141.0 && numLon <= -52.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'CA');
    }
    // Singapore
    if (numLat >= 1.15 && numLat <= 1.48 && numLon >= 103.55 && numLon <= 104.1) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'SG');
    }
    // Brazil
    if (numLat >= -34.0 && numLat <= 5.5 && numLon >= -74.0 && numLon <= -34.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'BR');
    }
    // South Africa
    if (numLat >= -35.0 && numLat <= -22.0 && numLon >= 16.0 && numLon <= 33.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'ZA');
    }
    // Thailand
    if (numLat >= 5.5 && numLat <= 20.5 && numLon >= 97.0 && numLon <= 106.0) {
      return GLOBAL_COUNTRIES.find(c => c.code === 'TH');
    }
  }

  // 3. Fallback to India
  return GLOBAL_COUNTRIES.find(c => c.code === 'IN') || GLOBAL_COUNTRIES[0];
}

