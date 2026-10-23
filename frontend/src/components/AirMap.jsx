import React, { useState, useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { reverseGeocode, searchLocations } from '../utils/geoUtils';
import { fetchEnvironment } from '../api/client';
import DelhiNcrVectorMap from './DelhiNcrVectorMap';
import {
  isInDelhiNcr,
  INDIA_OVERVIEW,
  GLOBAL_COUNTRIES,
  REGIONAL_DISTRICTS,
  getDistrictsInBounds,
  clusterGeoPoints,
  resolveCountryFromCoords,
} from '../utils/locationState';

/**
 * Google Maps styling with POI / business suppression.
 * Keeps only geographic borders, water, roads, and environmental canvas.
 */
const BASE_POI_SUPPRESSION = [
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.attraction', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
];

const DARK_MAP_STYLES = [
  ...BASE_POI_SUPPRESSION,
  { elementType: 'geometry', stylers: [{ color: '#161d2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#161d2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1c283f' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#25334d' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1a243a' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3b4d70' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f1f5f9' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0f172a' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
];

const LIGHT_MAP_STYLES = [
  ...BASE_POI_SUPPRESSION,
];

const AQI_COLOR = aqi => {
  if (aqi == null || isNaN(Number(aqi))) return '#94A3B8';
  const val = Number(aqi);
  return val > 400 ? '#8B1E3F' :
         val > 300 ? '#E5484D' :
         val > 200 ? '#F28C28' :
         val > 100 ? '#F5C542' :
         val > 50  ? '#9BD34A' : '#2EB872';
};

// ── Custom SVG Marker Icons ──

// 1. Air Quality Monitoring Station Marker with Highlighted AQI Badge & District Name
function getStationMarkerIcon(st, isDominant, google) {
  const isMissing = st.aqi == null || isNaN(Number(st.aqi));
  const col = AQI_COLOR(st.aqi);
  const circleD = isDominant ? 42 : 36;
  const strokeWidth = isDominant ? 3.5 : 2.5;
  const isDemo = st.isDemo || st.source === 'DEMO';
  const name = st.name || 'Station';
  const displayName = name.length > 15 ? name.slice(0, 14) + '…' : name;
  const width = Math.max(76, Math.min(115, displayName.length * 7 + 16));
  const height = circleD + 20;
  const cx = width / 2;
  const cy = circleD / 2 + 2;
  const dashAttr = isDemo ? 'stroke-dasharray="3,2"' : '';
  const aqiText = isMissing ? '—' : String(st.aqi);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="badge-shadow-${st.id || Math.round(st.lat * 100)}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.25" />
        </filter>
      </defs>
      <!-- AQI Numeric Circle Badge (Dashed for demo/curated, Slate for missing) -->
      <circle cx="${cx}" cy="${cy}" r="${circleD / 2 - 2}" fill="#ffffff" stroke="${col}" stroke-width="${strokeWidth}" ${dashAttr} filter="url(#badge-shadow-${st.id || Math.round(st.lat * 100)})" />
      <circle cx="${cx}" cy="${cy}" r="${circleD / 2 - 5}" fill="${col}" fill-opacity="${isMissing ? 0.08 : 0.16}" />
      <text x="${cx}" y="${cy + 4.5}" font-family="system-ui, -apple-system, sans-serif" font-size="${isDominant ? 12.5 : 11}" font-weight="900" fill="${col}" text-anchor="middle">
        ${aqiText}
      </text>
      <!-- District / Station Name Pill -->
      <rect x="2" y="${circleD + 2}" width="${width - 4}" height="15" rx="7.5" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" filter="url(#badge-shadow-${st.id || Math.round(st.lat * 100)})" />
      <text x="${cx}" y="${circleD + 13}" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="800" fill="#0f172a" text-anchor="middle">
        ${isDemo ? `[D] ${displayName}` : displayName}
      </text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(cx, cy),
  };
}

// 2. Fire Signal Marker (Upwind Thermal Detection)
function getFireMarkerIcon(f, google) {
  const size = f.intensity === 'high' ? 34 : 28;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="#E5484D" stroke="#ffffff" stroke-width="2.5" />
      <text x="${size / 2}" y="${size / 2 + 5}" font-size="${size * 0.5}" text-anchor="middle">🔥</text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

// 3. User Location Marker (Pulsing indigo/blue GPS beacon with pure white center)
function getUserGpsMarkerIcon(google) {
  const size = 48;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="#2563EB" fill-opacity="0.22" stroke="#3B82F6" stroke-width="1.5" stroke-dasharray="3,3" />
      <circle cx="${size / 2}" cy="${size / 2}" r="11" fill="#2563EB" stroke="#ffffff" stroke-width="3.5" />
      <circle cx="${size / 2}" cy="${size / 2}" r="4" fill="#ffffff" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

// 4. Central Reference Pin (Delhi-NCR Central)
function getCentralPinIcon(google) {
  const width = 32;
  const height = 44;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="M16 0 C7 0 0 7 0 16 C0 28 16 44 16 44 C16 44 32 28 32 16 C32 7 25 0 16 0 Z" fill="#5B4BDB" stroke="#ffffff" stroke-width="2" />
      <circle cx="16" cy="16" r="6" fill="#ffffff" />
      <circle cx="16" cy="16" r="3" fill="#5B4BDB" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(16, 44),
  };
}

// 4b. Dynamic Environmental Inspector Pin (Custom Pin with Live AQI Color for Any Searched / Clicked Street or District)
function getInspectorPinIcon(google, aqi) {
  const col = aqi ? AQI_COLOR(aqi) : '#6366F1';
  const width = 34;
  const height = 46;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="M17 1 C8.5 1 2 7.5 2 16 C2 27 17 44 17 44 C17 44 32 27 32 16 C32 7.5 25.5 1 17 1 Z" fill="${col}" stroke="#ffffff" stroke-width="2.5" />
      <circle cx="17" cy="16" r="6" fill="#ffffff" />
      <circle cx="17" cy="16" r="3" fill="${col}" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(17, 44),
  };
}

// 5. National City Hub Marker (Pan-India Overview when zoomed out)
export const DEFAULT_NATIONAL_HUBS = [
  { name: 'NCR', state: 'National Capital Region', lat: 28.6139, lng: 77.2090, aqi: 312, status: 'Very Poor', temp: 28, pm25: 142, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.0760, lng: 72.8777, aqi: 164, status: 'Moderate', temp: 31, pm25: 42, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, aqi: 74, status: 'Satisfactory', temp: 26, pm25: 27, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.5726, lng: 88.3639, aqi: 187, status: 'Moderate', temp: 29, pm25: 94, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.0827, lng: 80.2707, aqi: 66, status: 'Satisfactory', temp: 30, pm25: 21, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Hyderabad', state: 'Telangana', lat: 17.3850, lng: 78.4867, aqi: 92, status: 'Satisfactory', temp: 28, pm25: 26, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Ahmedabad', state: 'Gujarat', lat: 23.0225, lng: 72.5714, aqi: 158, status: 'Moderate', temp: 33, pm25: 58, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Pune', state: 'Maharashtra', lat: 18.5204, lng: 73.8567, aqi: 112, status: 'Moderate', temp: 27, pm25: 38, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.8467, lng: 80.9462, aqi: 215, status: 'Poor', temp: 28, pm25: 86, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Jaipur', state: 'Rajasthan', lat: 26.9124, lng: 75.7873, aqi: 142, status: 'Moderate', temp: 30, pm25: 52, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Patna', state: 'Bihar', lat: 25.6127, lng: 85.1589, aqi: 240, status: 'Poor', temp: 27, pm25: 112, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Guwahati', state: 'Assam', lat: 26.1445, lng: 91.7362, aqi: 85, status: 'Satisfactory', temp: 25, pm25: 29, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Chandigarh', state: 'Punjab', lat: 30.7333, lng: 76.7794, aqi: 175, status: 'Moderate', temp: 27, pm25: 64, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Bhopal', state: 'Madhya Pradesh', lat: 23.2599, lng: 77.4126, aqi: 118, status: 'Moderate', temp: 29, pm25: 41, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Kochi', state: 'Kerala', lat: 9.9312, lng: 76.2673, aqi: 52, status: 'Satisfactory', temp: 29, pm25: 18, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
  { name: 'Srinagar', state: 'Jammu & Kashmir', lat: 34.0837, lng: 74.7973, aqi: 45, status: 'Good', temp: 18, pm25: 14, dataType: 'aggregated', source: 'CPCB National Air Quality Bulletin', timestamp: '2026-10-22T18:00:00Z' },
];

function getNationalHubMarkerIcon(hub, google) {
  const isMissing = hub.aqi == null || isNaN(Number(hub.aqi));
  const col = AQI_COLOR(hub.aqi);
  const width = 88;
  const height = 46;
  const aqiDisplay = isMissing ? 'AQI —' : `AQI ${hub.aqi}`;
  const tempDisplay = hub.temp ? ` · ${hub.temp}°C` : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="2" y="2" width="${width - 4}" height="30" rx="8" fill="#ffffff" stroke="${col}" stroke-width="2.5" />
      <text x="${width / 2}" y="14" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="900" fill="#0f172a" text-anchor="middle">
        ${hub.name}
      </text>
      <text x="${width / 2}" y="25" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="900" fill="${col}" text-anchor="middle">
        ${aqiDisplay}${tempDisplay}
      </text>
      <polygon points="${width / 2 - 4},32 ${width / 2 + 4},32 ${width / 2},38" fill="${col}" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, 38),
  };
}

function getCountryMarkerIcon(country, google) {
  const avg = country.avgAqi;
  const col = avg > 300 ? '#8B1E3F' : avg > 200 ? '#E5484D' : avg > 100 ? '#F28C28' : avg > 50 ? '#EAB308' : '#16A34A';
  const width = 118;
  const height = 48;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="2" y="2" width="${width - 4}" height="${height - 12}" rx="8" fill="#1e293b" stroke="${col}" stroke-width="2" />
      <text x="8" y="15" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="800" fill="#f8fafc">
        ${country.flag} ${country.name}
      </text>
      <rect x="${width - 40}" y="5" width="34" height="15" rx="5" fill="${col}" />
      <text x="${width - 23}" y="16" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="900" fill="#ffffff" text-anchor="middle">
        ${avg}
      </text>
      <text x="8" y="29" font-family="system-ui, -apple-system, sans-serif" font-size="8" font-weight="700" fill="#94a3b8">
        Min ${country.minAqi} · Max ${country.maxAqi}
      </text>
      <polygon points="${width / 2 - 4},${height - 10} ${width / 2 + 4},${height - 10} ${width / 2},${height - 4}" fill="${col}" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, height - 4),
  };
}

// 6. Cluster Marker for Dense Station Groups (Local Tier 4: zoom 11–13)
function getClusterMarkerIcon(cluster, google) {
  const col = AQI_COLOR(cluster.avgAqi);
  const size = Math.min(46, 32 + Math.min(cluster.count, 8) * 1.5);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" fill="${col}" fill-opacity="0.25" stroke="${col}" stroke-width="1.5" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 6}" fill="${col}" stroke="#ffffff" stroke-width="2" />
      <text x="${size / 2}" y="${size / 2 + 4}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="900" fill="#ffffff" text-anchor="middle">
        ${cluster.count}
      </text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

// 7. Regional District / City Marker (Tier 3 Regional Drill-Down: zoom 8–10)
function getRegionalDistrictMarkerIcon(district, google) {
  const isMissing = district.aqi == null || isNaN(Number(district.aqi));
  const col = AQI_COLOR(district.aqi);
  const displayName = district.name || 'District';
  const width = Math.max(90, Math.min(136, displayName.length * 6.8 + 24));
  const height = 44;
  const aqiLabel = isMissing ? 'AQI —' : `AQI ${district.aqi}`;
  const statusLabel = isMissing ? 'Data Pending' : (district.status || 'Regional');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect x="2" y="2" width="${width - 4}" height="28" rx="7" fill="#ffffff" stroke="${col}" stroke-width="2" />
      <text x="${width / 2}" y="13" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="900" fill="#0f172a" text-anchor="middle">
        ${displayName}
      </text>
      <text x="${width / 2}" y="24" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" font-weight="800" fill="${col}" text-anchor="middle">
        ${aqiLabel} · ${statusLabel}
      </text>
      <polygon points="${width / 2 - 4},30 ${width / 2 + 4},30 ${width / 2},36" fill="${col}" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, 36),
  };
}

export default function AirMap({
  stations = [],
  fires = [],
  nationalHubs = [],
  dark = false,
  weather = null,
  traffic = null,
  center = null,
  selectedCoords = null,
  onLocationSelect = null,
  onSwitchToToday = null,
  routeGeometry = null,
  routeWeatherPoints = null,
  routePollutionPoints = null,
  onClearRoute = null,
  fullHeight = true,
  className = '',
}) {
  const mapRef = useRef(null);
  const googleMapInstance = useRef(null);
  const infoWindowRef = useRef(null);
  const markersRef = useRef({
    stations: [],
    clusters: [],
    regionalDistricts: [],
    nationalHubs: [],
    countries: [],
    fires: [],
    central: null,
    userGps: null,
    inspector: null,
  });
  const overlaysRef = useRef([]);
  const renderMarkersRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(11);

  // Smooth pan helper respecting reduced-motion accessibility preference
  const smoothPanTo = (lat, lng) => {
    if (!googleMapInstance.current) return;
    const prefersReducedMotion = typeof window !== 'undefined' &&
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      googleMapInstance.current.setCenter({ lat: Number(lat), lng: Number(lng) });
    } else {
      googleMapInstance.current.panTo({ lat: Number(lat), lng: Number(lng) });
    }
  };

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [mapMode, setMapMode] = useState(apiKey ? 'google' : 'vector');
  const [inspectedStation, setInspectedStation] = useState(null);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [layerDrawerOpen, setLayerDrawerOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const layerDrawerRef = useRef(null);

  // Hyper-Local Pan-India Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);

  const activeAreaLabel = React.useMemo(() => {
    if (selectedCoords?.city) return selectedCoords.city;
    if (selectedCoords?.district) return selectedCoords.district;
    if (selectedCoords?.name && !selectedCoords.name.includes('°') && selectedCoords.name !== 'Device Location' && selectedCoords.name !== 'Selected Area') {
      return selectedCoords.name;
    }
    if (selectedCoords?.region && selectedCoords.region !== 'India') return selectedCoords.region;
    return 'Local Area';
  }, [selectedCoords]);

  const activeCenterLat = Number(center?.lat ?? selectedCoords?.lat ?? 28.6139);
  const activeCenterLng = Number(center?.lon ?? center?.lng ?? selectedCoords?.lon ?? selectedCoords?.lng ?? 77.2090);
  const isNcr = isInDelhiNcr(activeCenterLat, activeCenterLng);

  const detectedCountry = React.useMemo(() => {
    return resolveCountryFromCoords(activeCenterLat, activeCenterLng, selectedCoords);
  }, [activeCenterLat, activeCenterLng, selectedCoords]);

  const countryButtonLabel = React.useMemo(() => {
    if (detectedCountry.code === 'IN') return '🇮🇳 India';
    if (detectedCountry.code === 'US') return '🇺🇸 America';
    return `${detectedCountry.flag} ${detectedCountry.name}`;
  }, [detectedCountry]);

  const shortLocalLabel = React.useMemo(() => {
    const raw = activeAreaLabel || 'Local';
    const firstPart = raw.split(',')[0].trim();
    return firstPart.length > 12 ? firstPart.slice(0, 11) + '…' : firstPart;
  }, [activeAreaLabel]);

  const [selectedStationName, setSelectedStationName] = useState('current_area');

  // Dismiss search suggestions on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Live search debouncing for streets, districts, towns across India
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults(prev => prev.length === 0 ? prev : []);
      setIsSearching(prev => prev ? false : false);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchLocations(searchQuery, {
          stations,
          hubs: nationalHubs && nationalHubs.length > 0 ? nationalHubs : DEFAULT_NATIONAL_HUBS,
          districts: REGIONAL_DISTRICTS,
        });
        setSearchResults(res);
        setSearchOpen(true);
      } catch (err) {
        console.warn('Location search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery, stations, nationalHubs]);

  // Synchronize window helper for jumping to Today tab from map info popup
  useEffect(() => {
    window.__ariseSwitchToToday = onSwitchToToday;
    return () => {
      window.__ariseSwitchToToday = null;
    };
  }, [onSwitchToToday]);

  // Expanded map state (Modern ride/delivery pattern)
  const [isExpanded, setIsExpanded] = useState(false);

  // Real browser geolocation state
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState(null);
  const hasAutoLocated = useRef(false);

  const effectiveVectorLocation = React.useMemo(() => {
    const lat = selectedCoords?.lat ?? center?.lat;
    const lng = selectedCoords?.lon ?? selectedCoords?.lng ?? center?.lon ?? center?.lng;
    if (lat != null && lng != null && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      return { lat: Number(lat), lng: Number(lng) };
    }
    return userLocation;
  }, [selectedCoords?.lat, selectedCoords?.lon, selectedCoords?.lng, center?.lat, center?.lon, center?.lng, userLocation]);

  // Dual-Layer Architecture:
  // Primary: Environment ('aqi' | 'pm25' | 'pm10' | null)
  // Secondary: Weather ('temp' | 'rain' | 'clouds' | 'wind' | null)
  // Both can be selected and active concurrently. Tapping an active layer deselects (vanishes) it.
  const [envLayer, setEnvLayer] = useState('aqi');
  const [weatherLayer, setWeatherLayer] = useState(null);

  const handleToggleEnvLayer = (id) => {
    setEnvLayer(prev => prev === id ? null : id);
  };

  const handleToggleWeatherLayer = (id) => {
    setWeatherLayer(prev => prev === id ? null : id);
  };

  const handleResetFilters = () => {
    setEnvLayer('aqi');
    setWeatherLayer(null);
    setSignals({
      stations: true,
      fires: true,
      traffic: false,
    });
  };

  const activeLayersSummary = [
    envLayer ? envLayer.toUpperCase() : null,
    weatherLayer ? weatherLayer.toUpperCase() : null,
  ].filter(Boolean).join(' + ') || 'OFF';

  // Additive signal toggles
  const [signals, setSignals] = useState({
    stations: true,
    fires: true,
    traffic: false,
  });

  const toggleSignal = key => setSignals(prev => ({ ...prev, [key]: !prev[key] }));

  // Listen for Escape key to exit expanded mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded]);

  // Lock body scroll and trigger resize when expand toggles
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    if (googleMapInstance.current && window.google) {
      setTimeout(() => {
        window.google.maps.event.trigger(googleMapInstance.current, 'resize');
      }, 150);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isExpanded]);

  // Close layer drawer on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (layerDrawerRef.current && !layerDrawerRef.current.contains(e.target)) {
        setLayerDrawerOpen(false);
      }
    };
    if (layerDrawerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [layerDrawerOpen]);

  // Hook global Google Maps auth failure for graceful resilience
  useEffect(() => {
    window.gm_authFailure = () => {
      console.warn('Google Maps authentication or quota failure. Switching to Vector Map.');
      setLoadError('Google Maps key quota limit reached. Vector Map active.');
      setMapMode('vector');
    };
    return () => {
      delete window.gm_authFailure;
    };
  }, []);

  // Pan to updated center or selectedCoords if coordinates change
  useEffect(() => {
    if (!googleMapInstance.current) return;
    const targetLat = center?.lat ?? selectedCoords?.lat;
    const targetLng = center?.lon ?? center?.lng ?? selectedCoords?.lon ?? selectedCoords?.lng;
    if (targetLat != null && targetLng != null && !isNaN(Number(targetLat)) && !isNaN(Number(targetLng))) {
      smoothPanTo(Number(targetLat), Number(targetLng));
    }
  }, [center?.lat, center?.lon, center?.lng, selectedCoords?.lat, selectedCoords?.lon, selectedCoords?.lng]);

  // 1. Initialize Google Maps with POI suppression & clickableIcons: false
  useEffect(() => {
    if (!apiKey || apiKey.trim() === '') return;

    let isMounted = true;

    try {
      setOptions({
        key: apiKey.trim(),
        v: 'weekly',
      });

      Promise.all([
        importLibrary('maps'),
        importLibrary('marker'),
        importLibrary('geocoding'),
      ]).then(([mapsLib]) => {
        if (!isMounted || !mapRef.current) return;

        const { Map, InfoWindow } = mapsLib;

        const initialLat = Number((center?.lat ?? selectedCoords?.lat) ?? INDIA_OVERVIEW.lat);
        const initialLng = Number((center?.lon ?? center?.lng ?? selectedCoords?.lon ?? selectedCoords?.lng) ?? INDIA_OVERVIEW.lon);
        const initialZoom = (center?.lat != null || selectedCoords?.lat != null) ? 12 : INDIA_OVERVIEW.zoom;

        const map = new Map(mapRef.current, {
          center: { lat: initialLat, lng: initialLng },
          zoom: initialZoom,
          clickableIcons: false, // Disables all clickable Google businesses/POIs
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          scaleControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy', // Ensures immediate touchpad and mouse-wheel responsiveness without requiring ctrl key
          styles: dark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
          backgroundColor: dark ? '#0b0f19' : '#e5e9ec',
        });

        googleMapInstance.current = map;
        if (typeof window !== 'undefined') window.__ariseMap = map;
        const infoWin = new InfoWindow();
        infoWindowRef.current = infoWin;

        // Smooth Map Navigation: Update markers on 'idle' (after pan/zoom completes)
        map.addListener('idle', () => {
          const z = map.getZoom();
          if (z != null) {
            setCurrentZoom(prev => {
              // Only trigger React state change when crossing tier boundaries
              const prevTier = prev <= 3 ? 1 : prev <= 8 ? 2 : prev <= 10 ? 3 : 4;
              const nextTier = z <= 3 ? 1 : z <= 8 ? 2 : z <= 10 ? 3 : 4;
              return prevTier !== nextTier ? z : prev;
            });
          }
          if (typeof renderMarkersRef.current === 'function') {
            renderMarkersRef.current();
          }
        });

        // Map Click Listener — Environmental Inspector (Every street, district, or town in India)
        map.addListener('click', async (e) => {
          setLayerDrawerOpen(false);
          setSearchOpen(false);
          if (!e.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();

          let locName = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`;
          let locMeta = null;
          try {
            locMeta = await reverseGeocode(lat, lng);
            if (locMeta?.formattedLocation) {
              locName = locMeta.formattedLocation;
            }
          } catch {}

          setSelectedStationName(locName);
          placeInspectorPin(lat, lng, locName, locMeta || {});

          if (onLocationSelect) {
            onLocationSelect(lat, lng, locName, locMeta);
          }
        });

        setMapReady(true);

        setTimeout(() => {
          if (window.google && window.google.maps) {
            window.google.maps.event.trigger(map, 'resize');
          }
        }, 100);
      }).catch(err => {
        if (!isMounted) return;
        console.warn('Google Maps Load Error, falling back to Vector Map:', err);
        setLoadError(err.message || 'Failed to initialize Google Maps.');
        setMapMode('vector');
      });
    } catch (err) {
      if (isMounted) {
        console.warn('Google Maps Setup Error, falling back to Vector Map:', err);
        setLoadError(err.message || 'Failed to initialize Google Maps.');
        setMapMode('vector');
      }
    }

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  // Handle dark mode toggle
  useEffect(() => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setOptions({
        styles: dark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
        backgroundColor: dark ? '#0b0f19' : '#e5e9ec',
      });
    }
  }, [dark]);

  // 2. Automatic GPS Location on First Load
  useEffect(() => {
    if (!mapReady || hasAutoLocated.current) return;
    hasAutoLocated.current = true;

    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });

          let locName = 'Device Location';
          let locMeta = null;
          try {
            locMeta = await reverseGeocode(lat, lng);
            if (locMeta?.formattedLocation) {
              locName = locMeta.formattedLocation;
            }
          } catch {}

          if (onLocationSelect) {
            onLocationSelect(lat, lng, locName, locMeta);
          }
          if (googleMapInstance.current) {
            smoothPanTo(lat, lng);
            googleMapInstance.current.setZoom(12);
          }
        },
        () => {
          // Graceful fallback with subtle message
          setGeoStatus({
            type: 'info',
            message: 'Location access is off. Showing regional overview.',
          });
          setTimeout(() => setGeoStatus(null), 4500);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 120000 }
      );
    }
  }, [mapReady]);

  // Manual Locate Me handler
  const handleLocateMe = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoStatus({
        type: 'warning',
        message: 'Browser Geolocation is not supported by your browser.',
      });
      setTimeout(() => setGeoStatus(null), 4000);
      return;
    }

    setLocating(true);
    setGeoStatus(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setLocating(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });

        let locName = 'Device Location';
        let locMeta = null;
        try {
          locMeta = await reverseGeocode(lat, lng);
          if (locMeta?.formattedLocation) {
            locName = locMeta.formattedLocation;
          }
        } catch {}

        if (onLocationSelect) {
          onLocationSelect(lat, lng, locName, locMeta);
        }

        if (googleMapInstance.current) {
          smoothPanTo(lat, lng);
          googleMapInstance.current.setZoom(13);
        }

        setGeoStatus({
          type: 'success',
          message: `Location acquired: ${locName}`,
        });
        setTimeout(() => setGeoStatus(null), 4000);
      },
      (error) => {
        setLocating(false);
        let msg = 'Location request failed. Please select a city or use the map.';
        if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
          msg = 'Location access is off. Please choose a location from the search bar.';
        } else if (error.code === 2 || error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location unavailable. Please select a location on the map.';
        } else if (error.code === 3 || error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Please select a location on the map.';
        }
        setGeoStatus({ type: 'warning', message: msg });
        setTimeout(() => setGeoStatus(null), 4500);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // 3. Render Markers & Primary Overlays
  const renderMarkers = () => {
    const map = googleMapInstance.current;
    if (!map || !mapReady || !window.google || !window.google.maps) return;

    const google = window.google;
    const infoWindow = infoWindowRef.current;

    // Clear previous markers & overlays
    markersRef.current.stations.forEach(m => m.setMap(null));
    markersRef.current.stations = [];
    if (markersRef.current.clusters) {
      markersRef.current.clusters.forEach(m => m.setMap(null));
      markersRef.current.clusters = [];
    }
    if (markersRef.current.regionalDistricts) {
      markersRef.current.regionalDistricts.forEach(m => m.setMap(null));
      markersRef.current.regionalDistricts = [];
    }
    if (markersRef.current.nationalHubs) {
      markersRef.current.nationalHubs.forEach(m => m.setMap(null));
      markersRef.current.nationalHubs = [];
    }
    if (markersRef.current.countries) {
      markersRef.current.countries.forEach(m => m.setMap(null));
      markersRef.current.countries = [];
    }
    markersRef.current.fires.forEach(m => m.setMap(null));
    markersRef.current.fires = [];
    overlaysRef.current.forEach(c => c.setMap(null));
    overlaysRef.current = [];

    const activeCenterLat = Number(center?.lat ?? selectedCoords?.lat ?? 28.6139);
    const activeCenterLng = Number(center?.lon ?? center?.lng ?? selectedCoords?.lon ?? selectedCoords?.lng ?? 77.2090);
    const isNcr = isInDelhiNcr(activeCenterLat, activeCenterLng);

    // Central Reference Pin — Scoped to active locality
    if (isNcr) {
      if (!markersRef.current.central) {
        const centralMarker = new google.maps.Marker({
          position: { lat: activeCenterLat, lng: activeCenterLng },
          map: map,
          title: `${activeAreaLabel} (Monitored Area)`,
          icon: getCentralPinIcon(google),
          zIndex: 1000,
        });

        centralMarker.addListener('click', () => {
          const currentLabel = centralMarker.getTitle() || activeAreaLabel;
          const avgAqi = stations && stations.length > 0
            ? Math.round(stations.reduce((acc, s) => acc + (s.aqi || 0), 0) / stations.length)
            : 312;
          const aqiColor = avgAqi > 400 ? '#8B1E3F' : avgAqi > 300 ? '#E5484D' : avgAqi > 200 ? '#F28C28' : '#F5C542';
          const verdictText = avgAqi > 300 ? 'STAY IN Recommended' : avgAqi > 200 ? 'AVOID PEAK HOURS' : 'OUTDOOR FRIENDLY';

          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 6px;">
              <div style="font-size: 11px; font-weight: 800; color: #5B4BDB; text-transform: uppercase;">
                📍 Monitored Center
              </div>
              <div style="font-size: 14px; font-weight: 800; color: #111827; margin-top: 2px;">
                ${currentLabel}
              </div>
              <div style="margin-top: 4px; font-size: 11px; font-weight: 700; color: ${aqiColor};">
                AQI ${avgAqi} · ${verdictText}
              </div>
            </div>
          `);
          infoWindow.open(map, centralMarker);
        });

        markersRef.current.central = centralMarker;
      } else {
        markersRef.current.central.setPosition({ lat: activeCenterLat, lng: activeCenterLng });
        markersRef.current.central.setTitle(`${activeAreaLabel} (Monitored Area)`);
        markersRef.current.central.setMap(map);
      }
    } else {
      if (markersRef.current.central) {
        markersRef.current.central.setMap(null);
        markersRef.current.central = null;
      }
    }

    // User Location GPS Marker
    if (userLocation) {
      if (markersRef.current.userGps) {
        markersRef.current.userGps.setPosition({ lat: userLocation.lat, lng: userLocation.lng });
        markersRef.current.userGps.setMap(map);
      } else {
        const gpsMarker = new google.maps.Marker({
          position: { lat: userLocation.lat, lng: userLocation.lng },
          map: map,
          title: 'Your Location (GPS)',
          icon: getUserGpsMarkerIcon(google),
          zIndex: 2000,
        });

        gpsMarker.addListener('click', () => {
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 6px 10px; min-width: 190px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 14px;">🎯</span>
                <span style="font-size: 11px; font-weight: 800; color: #2563EB; text-transform: uppercase;">Your Device Location</span>
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #111827; margin-top: 3px;">
                Local Browser GPS
              </div>
              <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 4px;">
                Lat: ${userLocation.lat.toFixed(4)}°, Lng: ${userLocation.lng.toFixed(4)}°
              </div>
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; font-size: 10px; font-weight: 700; color: #16a34a;">
                ✓ Zero cloud transmission · Processed on-device
              </div>
            </div>
          `);
          infoWindow.open(map, gpsMarker);
        });

        markersRef.current.userGps = gpsMarker;
      }
    }

    // 5-Tier Zoom-dependent Hierarchical Rendering:
    // Tier 1 (currentZoom <= 3): Global World Overview — Countries with average pollution & min/max
    // Tier 2 (3 < currentZoom <= 8): National Country View — Major Metro Cities & State Hubs
    // Tier 3 (8 < currentZoom <= 10): Regional View — Cities, Districts, and Towns within viewport bounds
    // Tier 4 (10 < currentZoom <= 13): Local View — Localities & Clustered Monitoring Stations
    // Tier 5 (currentZoom > 13): Monitoring Stations — High-density Individual Ground Monitors
    const activeHubs = (nationalHubs && nationalHubs.length > 0) ? nationalHubs : DEFAULT_NATIONAL_HUBS;
    const currentZ = map.getZoom() || currentZoom || 11;
    const bounds = map.getBounds();

    if (currentZoom <= 3) {
      if (!markersRef.current.countries) markersRef.current.countries = [];
      GLOBAL_COUNTRIES.forEach(country => {
        const marker = new google.maps.Marker({
          position: { lat: country.lat, lng: country.lng },
          map: map,
          title: `${country.flag} ${country.name} · Avg AQI ${country.avgAqi} (Min ${country.minAqi} - Max ${country.maxAqi})`,
          icon: getCountryMarkerIcon(country, google),
          zIndex: 900,
        });

        marker.addListener('click', () => {
          smoothPanTo(country.lat, country.lng);
          map.setZoom(country.zoom || 5);
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 6px 10px; min-width: 210px;">
              <div style="font-size: 11px; font-weight: 800; color: #4F46E5; text-transform: uppercase;">
                ${country.flag} ${country.name} · National Atmospheric Profile
              </div>
              <div style="font-size: 15px; font-weight: 900; color: #0F172A; margin-top: 2px;">
                Average AQI: ${country.avgAqi}
              </div>
              <div style="font-size: 11px; font-weight: 700; color: #475569; margin-top: 4px;">
                Representative Range: Min ${country.minAqi} — Max ${country.maxAqi}
              </div>
              <div style="margin-top: 6px; padding-top: 5px; border-top: 1px solid #E2E8F0; font-size: 10px; font-weight: 800; color: #2563EB;">
                🔍 Zoomed into national metros. Click a metro city to inspect local districts.
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
        });

        markersRef.current.countries.push(marker);
      });
    } else if (currentZoom <= 8) {
      // Tier 2: National Country View (Major Metros across India)
      activeHubs.forEach(hub => {
        const marker = new google.maps.Marker({
          position: { lat: hub.lat, lng: hub.lng },
          map: map,
          title: `${hub.name} (${hub.state || 'India'}) · AQI ${hub.aqi != null ? hub.aqi : '—'} · Metro Aggregate`,
          icon: getNationalHubMarkerIcon(hub, google),
          zIndex: 800,
        });

        marker.addListener('click', () => {
          setSelectedStationName(hub.name);
          const col = AQI_COLOR(hub.aqi);
          const isMissing = hub.aqi == null || isNaN(Number(hub.aqi));
          const statusText = isMissing ? 'Unavailable' : (hub.status || (hub.aqi > 300 ? 'Very Poor' : hub.aqi > 200 ? 'Poor' : hub.aqi > 100 ? 'Moderate' : 'Good'));
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 6px 10px; min-width: 200px;">
              <div style="display: inline-block; font-size: 9px; font-weight: 800; color: #4338ca; background: #e0e7ff; padding: 2px 7px; border-radius: 4px; margin-bottom: 4px; letter-spacing: 0.05em;">
                📊 AGGREGATED METRO COMPOSITE
              </div>
              <div style="font-size: 14px; font-weight: 900; color: #0f172a;">
                ${hub.name}, ${hub.state || 'India'}
              </div>
              <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                <span style="font-size: 22px; font-weight: 900; color: ${col};">${!isMissing ? hub.aqi : '—'}</span>
                <span style="font-size: 10px; font-weight: 800; color: ${col}; background: ${col}18; padding: 1px 6px; border-radius: 999px;">
                  ${statusText}
                </span>
              </div>
              <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
                <div>Source: <strong>${hub.source || 'CPCB National Air Quality Bulletin'}</strong></div>
                <div>Data Type: <strong>Aggregated Citywide</strong></div>
                <div>Reported: <strong>${hub.timestamp ? new Date(hub.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) + ' IST' : 'Calibrated Bulletin'}</strong></div>
              </div>
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 10px; font-weight: 600; color: #64748b;">
                Composite index across metropolitan stations. Click to drill into regional districts.
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
          smoothPanTo(hub.lat, hub.lng);
          if (onLocationSelect) {
            onLocationSelect(hub.lat, hub.lng, hub.name);
          }
        });

        markersRef.current.nationalHubs.push(marker);
      });
    } else if (currentZoom <= 10) {
      // Tier 3: Regional View — Cities, Districts, and Towns within map bounds
      if (!markersRef.current.regionalDistricts) markersRef.current.regionalDistricts = [];
      const visibleDistricts = getDistrictsInBounds(bounds, REGIONAL_DISTRICTS);

      visibleDistricts.forEach(dist => {
        const marker = new google.maps.Marker({
          position: { lat: dist.lat, lng: dist.lon },
          map: map,
          title: `${dist.name} (${dist.state}) · AQI ${dist.aqi != null ? dist.aqi : '—'} · Regional Aggregate`,
          icon: getRegionalDistrictMarkerIcon(dist, google),
          zIndex: 750,
        });

        marker.addListener('click', () => {
          setSelectedStationName(dist.name);
          const col = AQI_COLOR(dist.aqi);
          const isMissing = dist.aqi == null || isNaN(Number(dist.aqi));
          const statusText = isMissing ? 'Unavailable' : (dist.status || (dist.aqi > 300 ? 'Very Poor' : dist.aqi > 200 ? 'Poor' : dist.aqi > 100 ? 'Moderate' : 'Good'));
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 6px 10px; min-width: 200px;">
              <div style="display: inline-block; font-size: 9px; font-weight: 800; color: #4338ca; background: #e0e7ff; padding: 2px 7px; border-radius: 4px; margin-bottom: 4px; letter-spacing: 0.05em;">
                📊 AGGREGATED REGIONAL BULLETIN
              </div>
              <div style="font-size: 14px; font-weight: 900; color: #0f172a;">
                ${dist.name}, ${dist.state}
              </div>
              <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                <span style="font-size: 22px; font-weight: 900; color: ${col};">${!isMissing ? dist.aqi : '—'}</span>
                <span style="font-size: 10px; font-weight: 800; color: ${col}; background: ${col}18; padding: 1px 6px; border-radius: 999px;">
                  ${statusText}
                </span>
              </div>
              <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
                <div>Source: <strong>${dist.source || 'CPCB CAAQMS Regional Bulletin'}</strong></div>
                <div>Data Type: <strong>Aggregated Regional</strong></div>
                <div>Reported: <strong>${dist.timestamp ? new Date(dist.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) + ' IST' : 'Calibrated Bulletin'}</strong></div>
              </div>
              <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 10px; font-weight: 600; color: #64748b;">
                District-level composite telemetry. Zoom in further to view individual ground monitors.
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
          smoothPanTo(dist.lat, dist.lon);
          if (onLocationSelect) {
            onLocationSelect(dist.lat, dist.lon, dist.name, dist);
          }
        });

        markersRef.current.regionalDistricts.push(marker);
      });
    } else {
      // Tier 4 (zoom 11-13) & Tier 5 (zoom 14+): Local View & Individual Monitoring Stations
      if (signals.stations) {
        if (!markersRef.current.clusters) markersRef.current.clusters = [];
        const stationsInBounds = bounds && typeof bounds.contains === 'function' && window.google?.maps?.LatLng
          ? stations.filter(st => bounds.contains(new window.google.maps.LatLng(st.lat, st.lng)))
          : stations;

        const clusterRadius = currentZ <= 13 ? 55 : 0;
        const clustered = clusterGeoPoints(stationsInBounds, currentZ, clusterRadius);

        clustered.forEach((node, i) => {
          if (node.isCluster) {
            const clusterMarker = new google.maps.Marker({
              position: { lat: node.lat, lng: node.lng },
              map: map,
              title: `Cluster: ${node.count} monitoring stations · Avg AQI ${node.avgAqi != null ? node.avgAqi : '—'} · Click to zoom in`,
              icon: getClusterMarkerIcon(node, google),
              zIndex: 600,
            });

            clusterMarker.addListener('click', () => {
              smoothPanTo(node.lat, node.lng);
              map.setZoom(Math.min(16, (map.getZoom() || currentZoom) + 2));
            });

            markersRef.current.clusters.push(clusterMarker);
          } else {
            const st = node.item;
            const isDominant = i === 0 || (st.aqi != null && st.aqi > 320);
            const col = AQI_COLOR(st.aqi);
            const isDemo = st.isDemo || st.source === 'DEMO';
            const isMissing = st.aqi == null || isNaN(Number(st.aqi));
            const badgeBg = isDemo ? '#fef3c7' : '#dcfce7';
            const badgeCol = isDemo ? '#92400e' : '#166534';
            const badgeText = isDemo ? '⚠️ DEMO / SIMULATION' : '📡 OBSERVED TELEMETRY';
            const statusText = isMissing ? 'Unavailable' : (st.aqi > 300 ? 'Very Poor' : (st.aqi > 200 ? 'Poor' : (st.aqi > 100 ? 'Moderate' : 'Good')));

            const marker = new google.maps.Marker({
              position: { lat: st.lat, lng: st.lng },
              map: map,
              title: `${st.name} Station (AQI ${!isMissing ? st.aqi : '—'}) · ${isDemo ? 'Demo Simulated Sensor' : 'CPCB Ground Monitor'}`,
              icon: getStationMarkerIcon(st, isDominant, google),
              zIndex: isDominant ? 500 : 200,
            });

            marker.addListener('click', () => {
              setSelectedStationName(st.name);
              setInspectedStation(st);
              if (onLocationSelect) {
                onLocationSelect(st.lat, st.lng, st.name);
              }
              infoWindow.setContent(`
                <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 8px; min-width: 180px;">
                  <div style="display: inline-block; font-size: 9px; font-weight: 800; color: ${badgeCol}; background: ${badgeBg}; padding: 2px 7px; border-radius: 4px; margin-bottom: 4px; letter-spacing: 0.04em;">
                    ${badgeText}
                  </div>
                  <div style="font-size: 12px; font-weight: 800; color: #0f172a;">
                    ${st.name} Monitoring Station
                  </div>
                  <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 3px;">
                    <span style="font-size: 22px; font-weight: 900; color: ${col};">${!isMissing ? st.aqi : '—'}</span>
                    <span style="font-size: 10px; font-weight: 800; color: ${col}; background: ${col}18; padding: 1px 6px; border-radius: 999px;">
                      ${statusText}
                    </span>
                  </div>
                  <div style="margin-top: 6px; font-size: 10px; color: #475569; line-height: 1.4;">
                    <div>Source: <strong>${isDemo ? 'Demo Calibration Fixture' : (st.source || 'CPCB Ground Station')}</strong></div>
                    <div>Data Type: <strong>${isDemo ? 'Simulated Demo' : 'Live Observed Ground Sensor'}</strong></div>
                    <div>Reported: <strong>${st.timestamp ? new Date(st.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }) + ' IST' : (isDemo ? 'Fixture Data' : 'Timestamp Pending')}</strong></div>
                  </div>
                  <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #334155;">
                    <div>PM2.5: <strong>${st.pm25 != null ? `${st.pm25} µg/m³` : '—'}</strong></div>
                    <div>PM10: <strong>${st.pm10 != null ? `${st.pm10} µg/m³` : '—'}</strong></div>
                  </div>
                </div>
              `);
              infoWindow.open(map, marker);
            });

            markersRef.current.stations.push(marker);
          }
        });
      }
    }

    // Fire Signals
    if (signals.fires) {
      fires.forEach(f => {
        const marker = new google.maps.Marker({
          position: { lat: f.lat, lng: f.lng },
          map: map,
          title: `Fire signal · ${f.intensity}`,
          icon: getFireMarkerIcon(f, google),
          zIndex: 300,
        });

        marker.addListener('click', () => {
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 8px; max-width: 220px;">
              <div style="font-size: 11px; font-weight: 800; color: #E5484D; text-transform: uppercase; display: flex; align-items: center; gap: 4px;">
                <span>🔥</span> ${f.isDemo ? 'Simulated Fire Signal (DEMO)' : 'Satellite Fire Signal (VIIRS NRT)'}
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #111827; margin-top: 2px;">
                Thermal Anomaly (${f.intensity.toUpperCase()}) ${f.isDemo ? '· DEMO' : ''}
              </div>
              <div style="font-size: 10px; font-weight: 600; color: #64748b; margin-top: 4px; line-height: 1.35;">
                ${f.isDemo ? 'Calibrated simulated fire hotspot for demonstration mode.' : 'Detected in monitored upwind region. Fire signal, not proof of cause.'}
              </div>
              <div style="font-size: 9px; font-weight: 700; color: #94a3b8; margin-top: 4px;">
                Lat: ${f.lat.toFixed(2)}, Lng: ${f.lng.toFixed(2)} · ${f.isDemo ? 'DEMO DATA' : 'NASA FIRMS (fire signal, not proof of cause)'}
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
        });

        markersRef.current.fires.push(marker);
      });
    }

    // Dynamic Environment Overlay — Anchored to active location center (Single inner boundary circle)
    if (envLayer === 'aqi' || envLayer === 'pm25' || envLayer === 'pm10') {
      const c3 = new google.maps.Circle({
        map,
        center: { lat: activeCenterLat, lng: activeCenterLng },
        radius: 5500,
        fillColor: '#E5484D',
        fillOpacity: 0.22,
        strokeColor: '#E5484D',
        strokeOpacity: 0.65,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(c3);
    }

    // Dynamic Weather Overlay — Anchored to active location center
    if (weatherLayer === 'temp') {
      // Warm thermal plume
      const t1 = new google.maps.Circle({
        map,
        center: { lat: activeCenterLat, lng: activeCenterLng },
        radius: 14000,
        fillColor: '#F97316',
        fillOpacity: 0.18,
        strokeColor: '#F97316',
        strokeOpacity: 0.5,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(t1);
    } else if (weatherLayer === 'rain') {
      // Rain radar precipitation circle
      const r1 = new google.maps.Circle({
        map,
        center: { lat: activeCenterLat + 0.02, lng: activeCenterLng - 0.02 },
        radius: 11000,
        fillColor: '#3B82F6',
        fillOpacity: 0.20,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(r1);
    } else if (weatherLayer === 'wind') {
      // Wind streamline vectors oriented dynamically
      const w1 = new google.maps.Polyline({
        path: [
          { lat: activeCenterLat + 0.10, lng: activeCenterLng - 0.15 },
          { lat: activeCenterLat, lng: activeCenterLng },
          { lat: activeCenterLat - 0.10, lng: activeCenterLng + 0.15 },
        ],
        strokeColor: '#10B981',
        strokeOpacity: 0.75,
        strokeWeight: 3.5,
        map,
      });
      const w2 = new google.maps.Polyline({
        path: [
          { lat: activeCenterLat + 0.07, lng: activeCenterLng - 0.08 },
          { lat: activeCenterLat - 0.05, lng: activeCenterLng + 0.08 },
        ],
        strokeColor: '#10B981',
        strokeOpacity: 0.75,
        strokeWeight: 3.5,
        map,
      });
      overlaysRef.current.push(w1, w2);
    } else if (weatherLayer === 'clouds') {
      const cl1 = new google.maps.Circle({
        map,
        center: { lat: activeCenterLat, lng: activeCenterLng },
        radius: 18000,
        fillColor: '#94A3B8',
        fillOpacity: 0.22,
        strokeColor: '#64748B',
        strokeOpacity: 0.4,
        strokeWeight: 1.5,
        clickable: false,
      });
      overlaysRef.current.push(cl1);
    }

    // Commute Route Polyline (if provided)
    if (routeGeometry && Array.isArray(routeGeometry) && routeGeometry.length > 1) {
      const path = routeGeometry.map(([lat, lon]) => ({ lat: Number(lat), lng: Number(lon) }));
      const routePolyline = new google.maps.Polyline({
        path,
        geodesic: true,
        strokeColor: '#4F46E5',
        strokeOpacity: 0.9,
        strokeWeight: 5,
        map,
        zIndex: 950,
      });
      overlaysRef.current.push(routePolyline);

      // Add Origin Marker & Destination Marker
      const originPt = path[0];
      const destPt = path[path.length - 1];

      const originMarker = new google.maps.Marker({
        position: originPt,
        map,
        title: 'Route Origin',
        label: { text: 'A', color: '#ffffff', fontWeight: 'bold', fontSize: '11px' },
        zIndex: 960,
      });

      const destMarker = new google.maps.Marker({
        position: destPt,
        map,
        title: 'Route Destination',
        label: { text: 'B', color: '#ffffff', fontWeight: 'bold', fontSize: '11px' },
        zIndex: 960,
      });

      overlaysRef.current.push(originMarker, destMarker);

      // Milestone 2: Weather Waypoint Markers along Route
      if (routeWeatherPoints && Array.isArray(routeWeatherPoints) && routeWeatherPoints.length > 0) {
        routeWeatherPoints.forEach((wp, idx) => {
          let marker = null;
          if (idx === 0) {
            marker = originMarker;
            if (wp.temp_c != null) {
              originMarker.setTitle(`${wp.label || 'Origin'} (+0m): ${Math.round(wp.temp_c)}°C ${wp.condition}`);
            }
          } else if (idx === routeWeatherPoints.length - 1) {
            marker = destMarker;
            if (wp.temp_c != null) {
              destMarker.setTitle(`${wp.label || 'Destination'} (+${Math.round(wp.eta_min)}m): ${Math.round(wp.temp_c)}°C ${wp.condition}`);
            }
          } else {
            // Intermediate sampled waypoint (e.g. Midpoint)
            marker = new google.maps.Marker({
              position: { lat: wp.lat, lng: wp.lon },
              map,
              title: `${wp.label} (+${Math.round(wp.eta_min)}m): ${wp.temp_c != null ? `${Math.round(wp.temp_c)}°C` : '—'} ${wp.condition}`,
              label: { text: wp.icon || '•', color: '#4F46E5', fontWeight: 'bold', fontSize: '13px' },
              zIndex: 955,
            });
            overlaysRef.current.push(marker);
          }

          if (marker && infoWindow) {
            marker.addListener('click', () => {
              const polWp = routePollutionPoints && (routePollutionPoints[idx] || routePollutionPoints.find(p => p.label === wp.label));
              const tempStr = wp.temp_c != null ? `${Math.round(wp.temp_c)}°C` : '—';
              const rainStr = wp.precipitation_mm != null && wp.precipitation_mm > 0
                ? `${wp.precipitation_mm} mm`
                : wp.rain_probability != null
                ? `${Math.round(wp.rain_probability)}% rain`
                : 'Dry';
              const windStr = wp.wind_speed_kmh != null
                ? `${Math.round(wp.wind_speed_kmh)} km/h ${wp.wind_direction || ''}`
                : 'Calm';
              const fogAlert = wp.fog_risk && wp.fog_risk !== 'None'
                ? `<div style="margin-top:4px;color:#d97706;font-weight:bold;font-size:11px;">⚠️ ${wp.fog_risk}${wp.visibility_km != null ? ` (${wp.visibility_km} km vis)` : ''}</div>`
                : '';

              const pollutionHtml = polWp
                ? (polWp.aqi != null
                    ? `<div style="margin-top:5px;padding:3px 6px;border-radius:4px;background:#f8fafc;border:1px solid #e2e8f0;font-size:11px;">
                         <div style="display:flex;align-items:center;justify-content:space-between;">
                           <span style="font-weight:bold;color:#0f172a;">💨 AQI ${polWp.aqi} · ${polWp.aqi_category}</span>
                           <span style="font-size:9px;font-weight:bold;text-transform:uppercase;color:${polWp.data_type === 'observed' ? '#059669' : '#2563eb'};">${polWp.data_type}</span>
                         </div>
                         ${polWp.pm25 != null ? `<div style="font-size:10px;color:#475569;margin-top:2px;">PM2.5: ${polWp.pm25} µg/m³ ${polWp.pm10 != null ? `· PM10: ${polWp.pm10}` : ''}</div>` : ''}
                         <div style="font-size:9px;color:#64748b;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                           ${polWp.nearest_station ? `📍 ${polWp.nearest_station} (${polWp.nearest_station_distance_km} km)` : `🌐 Open-Meteo regional model`}
                         </div>
                       </div>`
                    : `<div style="margin-top:4px;font-size:10px;color:#94a3b8;">💨 Air quality: Telemetry unavailable</div>`
                  )
                : '';

              const content = `
                <div style="font-family:sans-serif;padding:6px;font-size:12px;color:#1e293b;max-width:230px;line-height:1.4;">
                  <div style="font-weight:bold;font-size:13px;display:flex;align-items:center;gap:4px;">
                    <span>${wp.icon || '📍'}</span>
                    <span>${wp.label}</span>
                    <span style="font-size:10px;background:#e0e7ff;color:#4338ca;padding:1px 5px;border-radius:4px;font-weight:bold;">+${Math.round(wp.eta_min)}m</span>
                  </div>
                  <div style="margin-top:4px;font-size:12px;"><strong>${tempStr}</strong> · ${wp.condition}</div>
                  <div style="margin-top:2px;font-size:11px;color:#475569;">💧 ${rainStr} · 💨 ${windStr}</div>
                  ${fogAlert}
                  ${pollutionHtml}
                  <div style="margin-top:6px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:3px;">
                    Corridor sample point
                  </div>
                </div>
              `;
              infoWindow.setContent(content);
              infoWindow.open(map, marker);
            });
          }
        });
      }

      // Fit bounds to show entire route
      const bounds = new google.maps.LatLngBounds();
      path.forEach(pt => bounds.extend(pt));
      map.fitBounds(bounds, { top: 60, bottom: 60, left: 60, right: 60 });
    }
  };

  useEffect(() => {
    renderMarkersRef.current = renderMarkers;
    renderMarkers();

    return () => {
      renderMarkersRef.current = null;
      if (markersRef.current.countries) {
        markersRef.current.countries.forEach(m => {
          try { m.setMap(null); } catch {}
        });
        markersRef.current.countries = [];
      }
      overlaysRef.current.forEach((c) => {
        try {
          c.setMap(null);
        } catch {}
      });
      overlaysRef.current = [];
    };
  }, [mapReady, envLayer, weatherLayer, signals, stations, fires, traffic, userLocation, currentZoom, nationalHubs, routeGeometry, routeWeatherPoints, routePollutionPoints, center?.lat, center?.lon, center?.lng, selectedCoords?.lat, selectedCoords?.lon, selectedCoords?.lng, activeAreaLabel]);

  // Zoom control helpers
  const handleZoomIn = () => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setZoom(googleMapInstance.current.getZoom() + 1);
    }
  };

  const handleZoomOut = () => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setZoom(googleMapInstance.current.getZoom() - 1);
    }
  };

  // Hyper-local Environmental Inspector for Any Street, District, or Town across India
  const placeInspectorPin = async (lat, lng, label, meta = {}) => {
    if (!googleMapInstance.current || typeof window === 'undefined' || !window.google?.maps) return;
    const map = googleMapInstance.current;
    const google = window.google;

    if (markersRef.current.inspector) {
      try {
        markersRef.current.inspector.setMap(null);
      } catch {}
    }

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      title: label || 'Inspected Area',
      icon: getInspectorPinIcon(google),
      zIndex: 1200,
    });
    markersRef.current.inspector = marker;

    const infoWin = infoWindowRef.current || new google.maps.InfoWindow();
    infoWindowRef.current = infoWin;

    infoWin.setPosition({ lat, lng });
    infoWin.setContent(`
      <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; padding: 6px 10px; min-width: 220px; max-width: 280px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="font-size: 10px; font-weight: 800; color: #4F46E5; text-transform: uppercase;">
            📍 Environmental Inspector
          </span>
          <span style="font-size: 9px; font-weight: 700; color: #64748b;">
            ${lat.toFixed(3)}°, ${lng.toFixed(3)}°
          </span>
        </div>
        <div style="font-size: 13.5px; font-weight: 800; color: #0f172a; margin-top: 3px; line-height: 1.2;">
          ${label || 'Selected Location'}
        </div>
        ${meta.subtitle ? `<div style="font-size: 10.5px; font-weight: 600; color: #64748b; margin-top: 2px;">${meta.subtitle}</div>` : ''}
        <div style="margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 8px; font-size: 11px; font-weight: 600; color: #475569; display: flex; align-items: center; gap: 6px;">
          <span style="display: inline-block; width: 10px; height: 10px; border: 2px solid #6366f1; border-top-color: transparent; border-radius: 50%;"></span>
          <span>Updating local weather &amp; AQI...</span>
        </div>
      </div>
    `);
    infoWin.open(map, marker);

    marker.addListener('click', () => {
      infoWin.open(map, marker);
    });

    try {
      const snap = await fetchEnvironment({
        lat,
        lon: lng,
        location_name: label,
      });

      if (snap) {
        const aqiVal = snap.aqi != null ? snap.aqi : (stations[0]?.aqi || '—');
        const aqiCol = typeof aqiVal === 'number' ? AQI_COLOR(aqiVal) : '#64748b';
        const aqiCat = snap.status || snap.aqi_category || (typeof aqiVal === 'number' ? (aqiVal > 300 ? 'Very Poor' : aqiVal > 200 ? 'Poor' : aqiVal > 100 ? 'Moderate' : 'Good') : 'Monitored');
        const w = snap.weather || {};
        const tempStr = w.temp != null ? `${Math.round(w.temp)}°C` : (weather?.temp != null ? `${Math.round(weather.temp)}°C` : '—');
        const windStr = w.windSpeed != null ? `${w.windSpeed} km/h` : (weather?.windSpeed != null ? `${weather.windSpeed} km/h` : '—');
        const rainStr = w.rainProb != null ? `${w.rainProb}%` : (weather?.rainProb != null ? `${weather.rainProb}%` : '—');
        const humStr = w.humidity != null ? `${w.humidity}%` : (weather?.humidity != null ? `${weather.humidity}%` : '—');
        const condStr = w.condition || weather?.condition || 'Live Telemetry';

        const p25 = snap.pollutants?.find(p => p.name === 'PM2.5')?.value;
        const p10 = snap.pollutants?.find(p => p.name === 'PM10')?.value;

        if (typeof aqiVal === 'number') {
          marker.setIcon(getInspectorPinIcon(google, aqiVal));
        }

        infoWin.setContent(`
          <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; padding: 6px 10px; min-width: 240px; max-width: 280px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-size: 10px; font-weight: 800; color: #4F46E5; text-transform: uppercase;">
                📍 ${meta.type ? meta.type.toUpperCase() : 'LOCALITY'}
              </span>
              <span style="font-size: 9px; font-weight: 700; color: #64748b;">
                ${lat.toFixed(3)}°, ${lng.toFixed(3)}°
              </span>
            </div>
            <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 3px; line-height: 1.25;">
              ${label || 'Selected Location'}
            </div>
            ${meta.subtitle ? `<div style="font-size: 10.5px; font-weight: 600; color: #64748b; margin-top: 2px;">${meta.subtitle}</div>` : ''}

            <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 6px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
              <span style="font-size: 26px; font-weight: 900; color: ${aqiCol}; line-height: 1;">${aqiVal}</span>
              <span style="font-size: 11px; font-weight: 800; color: ${aqiCol}; background: ${aqiCol}18; padding: 2px 7px; border-radius: 999px;">
                ${aqiCat}
              </span>
              <span style="font-size: 11px; font-weight: 700; color: #64748b; margin-left: auto;">AQI</span>
            </div>

            <div style="margin-top: 6px; font-size: 11px; font-weight: 600; color: #334155; line-height: 1.6;">
              <div style="display: flex; justify-content: space-between;">
                <span>🌡️ Temp: <strong>${tempStr}</strong></span>
                <span>🌧️ Rain: <strong>${rainStr}</strong></span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span>🌬️ Wind: <strong>${windStr}</strong></span>
                <span>💧 Humidity: <strong>${humStr}</strong></span>
              </div>
              ${p25 != null ? `
              <div style="display: flex; justify-content: space-between; border-top: 1px dashed #e2e8f0; margin-top: 4px; padding-top: 2px;">
                <span>PM2.5: <strong>${p25} µg/m³</strong></span>
                ${p10 != null ? `<span>PM10: <strong>${p10} µg/m³</strong></span>` : ''}
              </div>` : ''}
              <div style="margin-top: 2px; color: #64748b; font-size: 10px;">
                Weather: <strong>${condStr}</strong>
              </div>
            </div>

            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 9.5px; font-weight: 700; color: #10b981;">✓ Live CPCB &amp; Meteo</span>
              <button
                type="button"
                id="btn-switch-to-today"
                onclick="window.__ariseSwitchToToday ? window.__ariseSwitchToToday() : null"
                style="background: #4F46E5; color: #ffffff; border: none; padding: 4px 9px; border-radius: 6px; font-size: 10.5px; font-weight: 800; cursor: pointer;"
              >
                Today's Advice →
              </button>
            </div>
          </div>
        `);
      }
    } catch (err) {
      console.warn('Inspector telemetry error:', err);
    }
  };

  const handleSelectLocation = async (item) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSelectedStationName(item.name);

    const map = googleMapInstance.current;
    const lat = Number(item.lat);
    const lng = Number(item.lon ?? item.lng);

    smoothPanTo(lat, lng);
    map.setZoom(item.zoom || (item.type === 'street' ? 15 : item.type === 'district' ? 13 : 11));

    placeInspectorPin(lat, lng, item.name, item);

    if (onLocationSelect) {
      onLocationSelect(lat, lng, item.name, {
        city: item.city,
        district: item.district,
        region: item.subtitle || item.name,
      });
    }
  };

  const handleSelectStation = (name) => {
    setSelectedStationName(name);
    if (!googleMapInstance.current) return;
    if (name === 'current_area') {
      const targetLat = Number(selectedCoords?.lat ?? center?.lat ?? 28.6139);
      const targetLng = Number(selectedCoords?.lon ?? selectedCoords?.lng ?? center?.lon ?? center?.lng ?? 77.2090);
      smoothPanTo(targetLat, targetLng);
      googleMapInstance.current.setZoom(12);
      return;
    }
    const st = stations.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
    if (st) {
      smoothPanTo(st.lat, st.lng);
      googleMapInstance.current.setZoom(12);
    } else {
      const targetLat = Number(selectedCoords?.lat ?? center?.lat ?? 28.6139);
      const targetLng = Number(selectedCoords?.lon ?? selectedCoords?.lng ?? center?.lon ?? center?.lng ?? 77.2090);
      smoothPanTo(targetLat, targetLng);
      googleMapInstance.current.setZoom(12);
    }
  };

  return (
    <div
      id="arise-air-map-container"
      style={isExpanded ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 } : {}}
      className={`w-full transition-all duration-300 ${
        isExpanded
          ? 'fixed inset-0 z-[9999] w-screen h-screen p-3 sm:p-5 bg-black/85 backdrop-blur-md flex flex-col'
          : `relative card overflow-hidden ${fullHeight ? 'h-full min-h-0' : 'h-[320px] lg:h-[340px]'} shadow-sm`
      } ${className}`}
    >
      {/* ── Expanded Mode Top Bar ── */}
      {isExpanded && (
        <div className="flex items-center justify-between pb-3 px-2 z-[2600]">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.png"
              alt="Arise Icon"
              className="w-8 h-8 rounded-xl object-contain shadow-md"
            />
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>Arise Spatial Intelligence Explorer</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300">
                  Full Map View
                </span>
              </div>
              <div className="text-[11px] font-bold text-slate-300">
                Active: {activeLayersSummary} · Click anywhere to inspect local air &amp; weather
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsExpanded(false)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20 shadow-md"
            title="Exit Expanded Map (Press Escape)"
          >
            <span>✕</span>
            <span>Close [Esc]</span>
          </button>
        </div>
      )}

      {/* Map Inner Wrapper */}
      <div className={`relative w-full h-full ${isExpanded ? 'rounded-2xl overflow-hidden' : ''}`}>

        {/* ── Geolocation Status Toast Notification ── */}
        {geoStatus && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[30] animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`px-3.5 py-1.5 rounded-2xl shadow-xl text-xs font-bold border backdrop-blur-md flex items-center gap-2 ${
                geoStatus.type === 'success'
                  ? 'bg-emerald-600 text-white border-emerald-400'
                  : 'bg-slate-900/90 text-white border-slate-700'
              }`}
            >
              <span>{geoStatus.type === 'success' ? '✓' : 'ℹ️'}</span>
              <span>{geoStatus.message}</span>
              <button
                onClick={() => setGeoStatus(null)}
                className="ml-1 opacity-70 hover:opacity-100 font-extrabold text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Collapsible Map Overlays ── */}
        {!controlsVisible && (
          <button
            type="button"
            onClick={() => setControlsVisible(true)}
            id="btn-restore-map-controls"
            className="absolute top-3 left-3 z-[25] map-solid-control px-3.5 py-1.5 rounded-xl text-xs font-black shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"
            title="Restore Map Controls & Layer Selector"
          >
            <span>🗺️</span>
            <span>Show Map Controls</span>
          </button>
        )}

        {/* ── 1. Floating Structured Layer Selector (Top-Left) ── */}
        {controlsVisible && (
        <div ref={layerDrawerRef} className="absolute top-3 left-3 z-[25] w-[calc(100%-1.5rem)] sm:w-[275px] max-w-[285px]">
          <div className="map-solid-panel rounded-2xl shadow-xl p-2.5 sm:p-3 transition-all">
            {/* Regional Scope Switcher: Local Area vs Dynamic Country vs Globe */}
            <div className="flex items-center gap-1 p-0.5 rounded-xl border mb-2" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
              <button
                type="button"
                id="btn-scope-local"
                onClick={() => {
                  if (googleMapInstance.current) {
                    smoothPanTo(activeCenterLat, activeCenterLng);
                    googleMapInstance.current.setZoom(11);
                  }
                }}
                className={`flex-1 py-1 px-0.5 rounded-lg text-[10px] sm:text-[10.5px] font-bold transition-all truncate text-center cursor-pointer ${
                  currentZoom > 8
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 't2 hover:bg-[var(--surface)]'
                }`}
                title={`Focus on local area (${activeAreaLabel})`}
              >
                📍 {shortLocalLabel}
              </button>
              <button
                type="button"
                id="btn-scope-all-india"
                onClick={() => {
                  if (googleMapInstance.current) {
                    smoothPanTo(detectedCountry.lat, detectedCountry.lng);
                    googleMapInstance.current.setZoom(detectedCountry.zoom || 5);
                  }
                }}
                className={`flex-1 py-1 px-0.5 rounded-lg text-[10px] sm:text-[10.5px] font-bold transition-all truncate text-center cursor-pointer ${
                  currentZoom > 3 && currentZoom <= 8
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 't2 hover:bg-[var(--surface)]'
                }`}
                title={`Focus on national view (${detectedCountry.name})`}
              >
                {countryButtonLabel}
              </button>
              <button
                type="button"
                id="btn-scope-globe"
                onClick={() => {
                  if (googleMapInstance.current) {
                    smoothPanTo(20.0, 20.0);
                    googleMapInstance.current.setZoom(2);
                  }
                }}
                className={`flex-1 py-1 px-0.5 rounded-lg text-[10px] sm:text-[10.5px] font-bold transition-all truncate text-center cursor-pointer ${
                  currentZoom <= 3
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 't2 hover:bg-[var(--surface)]'
                }`}
                title="Global world overview with country pollution ranges"
              >
                🌍 Globe
              </button>
            </div>

            <div
              className="flex items-center justify-between cursor-pointer select-none px-1 py-0.5"
              onClick={() => setLayerDrawerOpen(!layerDrawerOpen)}
            >
              <div className="flex items-center gap-1.5 text-xs font-black t1">
                <span>👁️</span>
                <span>Layers</span>
                <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full bg-indigo-500/10 uppercase">
                  {activeLayersSummary}
                </span>
              </div>
              <span className="text-[11px] font-bold t3">{layerDrawerOpen ? '▲' : '▼'}</span>
            </div>

            {layerDrawerOpen && (
              <div className="flex flex-col gap-2 pt-2 border-t mt-1.5 max-h-[calc(100vh-140px)] sm:max-h-[360px] overflow-y-auto pr-0.5" style={{ borderColor: 'var(--border)' }}>
                {/* Reset Filters Option */}
                <div className="flex items-center justify-between px-0.5 pb-0.5">
                  <span className="text-[10px] font-extrabold t3 uppercase tracking-wider">Dual Active Layers</span>
                  <button
                    type="button"
                    id="btn-reset-filters"
                    onClick={handleResetFilters}
                    className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors hover:underline cursor-pointer"
                    title="Reset environment and weather layers to defaults"
                  >
                    <span>↺</span>
                    <span>Reset</span>
                  </button>
                </div>

                {/* Section A: Environment Primary Layers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black t3 uppercase tracking-wider">
                      Environment (Primary)
                    </span>
                    <span className="text-[10px] font-bold t3">Tap to toggle</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'aqi',  label: 'AQI' },
                      { id: 'pm25', label: 'PM2.5' },
                      { id: 'pm10', label: 'PM10' },
                    ].map(p => {
                      const isActive = envLayer === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          id={`btn-layer-env-${p.id}`}
                          onClick={() => handleToggleEnvLayer(p.id)}
                          className={`py-1 px-1 rounded-lg text-[11px] font-black transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400/40'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100'
                          }`}
                          title={isActive ? `Active: ${p.label}. Tap to deselect and hide overlay.` : `Select ${p.label} layer`}
                        >
                          <span>{p.label}</span>
                          {isActive && <span className="text-[10px] opacity-80 font-black">✕</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section B: Weather Secondary Layers */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-black t3 uppercase tracking-wider">
                      Weather (Secondary)
                    </span>
                    <span className="text-[10px] font-bold t3">Tap to toggle</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'temp',   label: '🌡️ Temp' },
                      { id: 'rain',   label: '🌧️ Rain' },
                      { id: 'wind',   label: '🌬️ Wind' },
                      { id: 'clouds', label: '☁️ Clouds' },
                    ].map(w => {
                      const isActive = weatherLayer === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          id={`btn-layer-weather-${w.id}`}
                          onClick={() => handleToggleWeatherLayer(w.id)}
                          className={`py-1 px-1.5 rounded-lg text-[10.5px] font-black transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                            isActive
                              ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-400/40'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100'
                          }`}
                          title={isActive ? `Active: ${w.label}. Tap to deselect and hide overlay.` : `Select ${w.label} layer`}
                        >
                          <span>{w.label}</span>
                          {isActive && <span className="text-[10px] opacity-80 font-black">✕</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section C: Additive Signals / Overlays (Stations & Fire Signals only) */}
                <div className="pt-1.5 border-t space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[10px] font-black t3 uppercase tracking-wider mb-0.5">
                    Signal Overlays
                  </div>
                  {[
                    { key: 'stations', label: 'Stations', icon: '📍' },
                    { key: 'fires',    label: fires.some(f => f.isDemo) ? 'Fire Signals (DEMO)' : 'Fire Signals', icon: '🔥' },
                  ].map(s => (
                    <button
                      key={s.key}
                      onClick={() => toggleSignal(s.key)}
                      className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-[11px] font-bold transition-all text-left cursor-pointer"
                      style={{ background: signals[s.key] ? 'var(--surface-alt)' : 'transparent' }}
                    >
                      <span className="flex items-center gap-1.5 t1">
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                      </span>
                      <span className="font-black text-indigo-600 dark:text-indigo-400">{signals[s.key] ? '✓' : '—'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        )}

        {/* ── 2. Floating Live Search & Station Autocomplete (Top-Right) ── */}
        {controlsVisible && (
        <div className="absolute top-3 right-3 z-[25] flex items-center gap-2" ref={searchContainerRef}>
          <div className="relative">
            <div
              className="rounded-2xl px-3 py-1.5 flex items-center gap-2 shadow-xl border-2 border-indigo-400/80 dark:border-indigo-500/80 transition-all backdrop-blur-md"
              style={{
                backgroundColor: 'var(--card)',
                color: 'var(--text-primary)',
              }}
            >
              <button
                type="button"
                id="btn-search-locate"
                onClick={handleLocateMe}
                disabled={locating}
                className="w-5 h-5 rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-90 text-white text-[11px] flex items-center justify-center font-black shadow-xs shrink-0 cursor-pointer transition-transform"
                title="Locate my position (GPS)"
                aria-label="Locate my position (GPS)"
              >
                📍
              </button>
              <input
                id="input-map-search"
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => {
                  if (searchResults.length > 0 || searchQuery.length >= 2) setSearchOpen(true);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchResults.length > 0) {
                    handleSelectLocation(searchResults[0]);
                  }
                  if (e.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="Search street, district, city..."
                className="bg-transparent text-xs sm:text-[13px] font-bold t1 outline-none w-48 sm:w-64 md:w-80 placeholder:text-slate-400 placeholder:font-normal"
                aria-label="Search street, district, or city"
              />
              {isSearching && (
                <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                    setSearchOpen(false);
                  }}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] t3 hover:bg-[var(--surface-alt)] cursor-pointer"
                  title="Clear search"
                  aria-label="Clear map search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Live Autocomplete Results Popup */}
            {searchOpen && searchResults.length > 0 && (
              <div
                className="absolute top-full mt-2 right-0 w-80 sm:w-96 max-w-[calc(100vw-2rem)] rounded-2xl border shadow-2xl p-2 z-[5000] space-y-1 animate-in fade-in zoom-in-95 duration-150 max-h-80 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--card)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider t3 flex justify-between items-center">
                  <span>Pan-India Live Locations</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Streets · Districts · Towns</span>
                </div>
                {searchResults.map((item, idx) => (
                  <button
                    key={item.id || idx}
                    type="button"
                    id={`search-result-${idx}`}
                    onClick={() => handleSelectLocation(item)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--surface-alt)] transition-colors text-left gap-2 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs shrink-0 font-bold">
                        {item.type === 'street' ? '🛣️' : item.type === 'district' ? '🏛️' : item.type === 'station' ? '📡' : '🏙️'}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-[13px] font-black t1 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[11px] font-medium tm truncate">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface)] border uppercase tracking-wider text-indigo-600 dark:text-indigo-400 shrink-0" style={{ borderColor: 'var(--border)' }}>
                      {item.type || 'place'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        )}



        {/* ── 4. Floating Action Controls (Bottom-Right: Expand Map + Locate Me + Zoom + Overlay Toggle) ── */}
        <div className="absolute bottom-3 right-3 z-[30] flex flex-col gap-1.5 items-center">
          {/* Toggle Map Controls / Clear Canvas Button */}
          <button
            onClick={() => setControlsVisible(!controlsVisible)}
            id="btn-toggle-map-controls"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              controlsVisible
                ? 'map-solid-control'
                : 'bg-indigo-600 text-white shadow-indigo-500/20'
            }`}
            title={controlsVisible ? 'Collapse Overlays to Explore Map Canvas' : 'Show Map Controls & Layers'}
            aria-label={controlsVisible ? 'Collapse map overlays' : 'Show map overlays'}
            aria-pressed={!controlsVisible}
          >
            {controlsVisible ? '👁️' : '🗺️'}
          </button>

          {/* Expand Map Button (Ride/Delivery pattern) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            id="btn-expand-map"
            className="w-8 h-8 rounded-xl map-solid-control flex items-center justify-center text-xs font-black shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title={isExpanded ? 'Minimize Map [Esc]' : 'Expand Map'}
            aria-label="Expand Map"
          >
            {isExpanded ? '✕' : '⛶'}
          </button>

          {/* Dedicated GPS Locate Me Button (Prominent Floating GPS Locator) */}
          <button
            onClick={handleLocateMe}
            disabled={locating}
            id="btn-locate-me"
            className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shadow-lg transition-all hover:scale-105 active:scale-95 cursor-pointer ${
              userLocation
                ? 'bg-blue-600 text-white shadow-blue-500/35 ring-2 ring-blue-400/40'
                : locating
                ? 'map-solid-control border-indigo-500 text-indigo-600 animate-pulse'
                : 'map-solid-control hover:text-indigo-600 border border-slate-300 dark:border-slate-700'
            }`}
            title="Locate Me (Browser GPS Location)"
            aria-label="Locate Me with GPS"
          >
            {locating ? (
              <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="7" />
                <line x1="12" y1="1" x2="12" y2="5" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="1" y1="12" x2="5" y2="12" />
                <line x1="19" y1="12" x2="23" y2="12" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
            )}
          </button>

          {/* Zoom Controls */}
          <div className="map-solid-panel rounded-xl p-0.5 shadow-md flex flex-col gap-0.5">
            <button
              onClick={handleZoomIn}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
              title="Zoom In"
            >
              +
            </button>
            <div className="h-[1px] bg-[var(--border)] w-full" />
            <button
              onClick={handleZoomOut}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
              title="Zoom Out"
            >
              −
            </button>
          </div>
        </div>

        {/* Floating Route Banner with Clear action */}
        {routeGeometry && Array.isArray(routeGeometry) && routeGeometry.length > 0 && (
          <div
            className="absolute top-3 left-3 z-[28] map-solid-panel px-3 py-1.5 rounded-xl shadow-md flex items-center gap-2 border animate-in fade-in duration-200"
            style={{ borderColor: 'var(--border)' }}
          >
            <span className="text-xs" aria-hidden="true">🛣️</span>
            <span className="text-[11px] font-black t1">Commute Route Active</span>
            {onClearRoute && (
              <button
                type="button"
                id="btn-clear-map-route"
                onClick={onClearRoute}
                className="ml-1 px-1.5 py-0.5 rounded text-[11px] font-black text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Clear route from map"
              >
                ✕ Clear
              </button>
            )}
          </div>
        )}

        {/* ── 5. Canvas Area: Google Maps Canvas or Offline Vector Map ── */}
        {mapMode === 'vector' || !apiKey ? (
          <div className="absolute inset-0 w-full h-full z-0 overflow-hidden">
            {!isNcr && (
              <div
                className="absolute top-16 right-3 z-[24] max-w-[280px] p-2.5 rounded-xl border map-solid-panel text-[11px] font-semibold t2 shadow-md flex items-center gap-2"
                role="note"
                aria-label="Offline vector map notice"
              >
                <span className="text-base shrink-0" aria-hidden="true">ℹ️</span>
                <span>Showing illustrative reference airshed (vector offline mode). Full interactive map active via Google Maps.</span>
              </div>
            )}
            <DelhiNcrVectorMap
              stations={stations}
              fires={fires}
              weather={weather}
              traffic={traffic}
              dark={dark}
              primaryLayer={envLayer}
              weatherLayer={weatherLayer}
              signals={signals}
              selectedStationName={inspectedStation?.name || selectedStationName}
              userLocation={effectiveVectorLocation}
              onSelectStation={(st) => {
                setSelectedStationName(st.name);
                setInspectedStation(st);
                if (onLocationSelect) onLocationSelect(st.lat, st.lng, st.name);
              }}
            />
          </div>
        ) : (
          <div ref={mapRef} className="map-canvas-container absolute inset-0 w-full h-full z-0" />
        )}

        {/* ── 6. Floating Inspected Station Telemetry Card ── */}
        {inspectedStation && (
          <div
            className="absolute bottom-16 sm:bottom-4 left-3 z-[28] w-[calc(100%-1.5rem)] sm:max-w-[320px] map-solid-panel p-4 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs">📍</span>
                  <h4 className="text-xs font-black t1">{inspectedStation.name}</h4>
                </div>
                <p className="text-[11px] font-semibold t3 mt-0.5 tabular-nums">
                  {inspectedStation.lat ? `${Number(inspectedStation.lat).toFixed(3)}°N, ${Number(inspectedStation.lng).toFixed(3)}°E` : 'Regional Grid'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedStation(null)}
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold t3 hover:t1 hover:bg-[var(--surface-alt)]"
                title="Close Inspector"
              >
                ✕
              </button>
            </div>

            <div className="flex items-baseline justify-between mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span
                  className="text-2xl font-black tabular-nums"
                  style={{ color: inspectedStation.aqi != null ? AQI_COLOR(inspectedStation.aqi) : '#94a3b8' }}
                >
                  {inspectedStation.aqi != null ? inspectedStation.aqi : '—'}
                </span>
                <span className="text-[11px] font-extrabold uppercase t3">AQI</span>
              </div>
              <span
                className="text-[11px] font-black px-2 py-0.5 rounded-full uppercase"
                style={{
                  background: inspectedStation.aqi != null ? `${AQI_COLOR(inspectedStation.aqi)}18` : 'rgba(148, 163, 184, 0.15)',
                  color: inspectedStation.aqi != null ? AQI_COLOR(inspectedStation.aqi) : '#94a3b8',
                }}
              >
                {inspectedStation.aqi != null ? (inspectedStation.aqi > 300 ? 'Very Poor' : inspectedStation.aqi > 200 ? 'Poor' : inspectedStation.aqi > 100 ? 'Moderate' : 'Good') : 'Unavailable'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t text-[11px] font-semibold t2" style={{ borderColor: 'var(--border)' }}>
              <div>PM2.5: <strong className="t1">{inspectedStation.pm25 != null ? `${inspectedStation.pm25} µg/m³` : '—'}</strong></div>
              <div>PM10: <strong className="t1">{inspectedStation.pm10 != null ? `${inspectedStation.pm10} µg/m³` : '—'}</strong></div>
              <div>Temp: <strong className="t1">{inspectedStation.temp != null ? `${inspectedStation.temp}°C` : (weather?.temp != null ? `${weather.temp}°C` : '—')}</strong></div>
              <div>Wind: <strong className="t1">{inspectedStation.wind != null ? `${inspectedStation.wind} km/h` : (weather?.windSpeed != null ? `${weather.windSpeed} km/h` : '—')}</strong></div>
            </div>

            <div className="mt-3 pt-2 border-t flex flex-col gap-1.5" style={{ borderColor: 'var(--border)' }}>
              <button
                type="button"
                onClick={() => {
                  if (onLocationSelect) {
                    onLocationSelect(inspectedStation.lat, inspectedStation.lng, inspectedStation.name);
                  }
                  setGeoStatus({ type: 'success', message: `Active location set to ${inspectedStation.name}` });
                  setTimeout(() => setGeoStatus(null), 3000);
                }}
                className="w-full py-1.5 rounded-xl text-[11px] font-black bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-xs text-center"
              >
                📍 Set as Active Location
              </button>

              {onSwitchToToday && (
                <button
                  type="button"
                  onClick={() => {
                    if (onLocationSelect) {
                      onLocationSelect(inspectedStation.lat, inspectedStation.lng, inspectedStation.name);
                    }
                    onSwitchToToday();
                  }}
                  className="w-full py-1.5 rounded-xl text-[11px] font-black border hover:bg-[var(--surface-alt)] transition-colors text-center t1"
                  style={{ borderColor: 'var(--border)' }}
                >
                  View on Today Dashboard →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
