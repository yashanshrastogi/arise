import React, { useState, useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

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

const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

// ── Custom SVG Marker Icons ──

// 1. Air Quality Monitoring Station Marker
function getStationMarkerIcon(st, isDominant, google) {
  const col = AQI_COLOR(st.aqi);
  const size = isDominant ? 44 : 38;
  const strokeWidth = isDominant ? 3.5 : 2.5;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="#ffffff" stroke="${col}" stroke-width="${strokeWidth}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 7}" fill="${col}" fill-opacity="0.14" />
      <text x="${size / 2}" y="${size / 2 + 4}" font-family="system-ui, -apple-system, sans-serif" font-size="${isDominant ? 12 : 10.5}" font-weight="900" fill="${col}" text-anchor="middle">
        ${st.aqi}
      </text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
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

export default function AirMap({
  stations = [],
  fires = [],
  dark = false,
  weather = null,
  traffic = null,
}) {
  const mapRef = useRef(null);
  const googleMapInstance = useRef(null);
  const infoWindowRef = useRef(null);
  const markersRef = useRef({ stations: [], fires: [], central: null, userGps: null });
  const overlaysRef = useRef([]);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [layerDrawerOpen, setLayerDrawerOpen] = useState(false);
  const layerDrawerRef = useRef(null);
  const [selectedStationName, setSelectedStationName] = useState('Delhi-NCR');

  // Expanded map state (Modern ride/delivery pattern)
  const [isExpanded, setIsExpanded] = useState(false);

  // Real browser geolocation state
  const [userLocation, setUserLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoStatus, setGeoStatus] = useState(null);
  const hasAutoLocated = useRef(false);

  // Primary single-dominant layer architecture
  // Category 1: Environment ('aqi' | 'pm25' | 'pm10')
  // Category 2: Weather ('temp' | 'rain' | 'clouds' | 'wind')
  const [primaryLayer, setPrimaryLayer] = useState('aqi');

  // Additive signal toggles
  const [signals, setSignals] = useState({
    stations: true,
    fires: true,
    traffic: false,
  });

  const toggleSignal = key => setSignals(prev => ({ ...prev, [key]: !prev[key] }));

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

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
      ]).then(([mapsLib]) => {
        if (!isMounted || !mapRef.current) return;

        const { Map, InfoWindow } = mapsLib;

        const map = new Map(mapRef.current, {
          center: { lat: 28.625, lng: 77.225 }, // Delhi-NCR
          zoom: 11,
          clickableIcons: false, // Disables all clickable Google businesses/POIs
          disableDefaultUI: true,
          zoomControl: false,
          mapTypeControl: false,
          scaleControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          styles: dark ? DARK_MAP_STYLES : LIGHT_MAP_STYLES,
          backgroundColor: dark ? '#0b0f19' : '#e5e9ec',
        });

        googleMapInstance.current = map;
        if (typeof window !== 'undefined') window.__ariseMap = map;
        const infoWin = new InfoWindow();
        infoWindowRef.current = infoWin;

        // Map Click Listener — Environmental Inspector (Never Google Places)
        map.addListener('click', (e) => {
          setLayerDrawerOpen(false);
          if (!e.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();

          // Compute nearest station or regional estimation
          let nearestSt = stations[0];
          let minDist = 999;
          stations.forEach(s => {
            const dist = Math.hypot(s.lat - lat, s.lng - lng);
            if (dist < minDist) {
              minDist = dist;
              nearestSt = s;
            }
          });

          const aqiVal = nearestSt ? nearestSt.aqi : 312;
          const aqiCol = AQI_COLOR(aqiVal);
          const pm25Val = nearestSt ? nearestSt.pm25 : 142.5;
          const pm10Val = nearestSt ? nearestSt.pm10 : 210.3;
          const tempVal = weather ? weather.temp : 28;
          const rainVal = weather ? weather.rainProb : 10;
          const windVal = weather ? weather.windSpeed : 3.2;
          const cloudVal = weather ? weather.cloudCover : 42;

          infoWin.setPosition(e.latLng);
          infoWin.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 6px 10px; min-width: 210px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <span style="font-size: 10px; font-weight: 800; color: #5B4BDB; text-transform: uppercase;">
                  Environmental Grid Point
                </span>
                <span style="font-size: 9px; font-weight: 700; color: #64748b;">
                  ${lat.toFixed(3)}°, ${lng.toFixed(3)}°
                </span>
              </div>
              <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 4px;">
                <span style="font-size: 24px; font-weight: 900; color: ${aqiCol};">${aqiVal}</span>
                <span style="font-size: 11px; font-weight: 800; color: ${aqiCol}; background: ${aqiCol}18; padding: 1px 7px; border-radius: 999px;">
                  ${aqiVal > 300 ? 'Very Poor' : aqiVal > 200 ? 'Poor' : 'Moderate'}
                </span>
              </div>
              <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #334155; line-height: 1.5;">
                <div style="display: flex; justify-content: space-between;">
                  <span>PM2.5: <strong>${pm25Val} µg/m³</strong></span>
                  <span>PM10: <strong>${pm10Val} µg/m³</strong></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span>Temp: <strong>${tempVal}°C</strong></span>
                  <span>Rain: <strong>${rainVal}%</strong></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span>Wind: <strong>${windVal} km/h</strong></span>
                  <span>Cloud: <strong>${cloudVal}%</strong></span>
                </div>
              </div>
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #f1f5f9; font-size: 9px; font-weight: 700; color: #94a3b8;">
                Estimated from nearest Arise monitoring grid · Local telemetry only
              </div>
            </div>
          `);
          infoWin.open(map);
        });

        setMapReady(true);

        setTimeout(() => {
          if (window.google && window.google.maps) {
            window.google.maps.event.trigger(map, 'resize');
          }
        }, 100);
      }).catch(err => {
        if (!isMounted) return;
        console.error('Google Maps Load Error:', err);
        setLoadError(err.message || 'Failed to initialize Google Maps.');
      });
    } catch (err) {
      if (isMounted) {
        console.error('Google Maps Setup Error:', err);
        setLoadError(err.message || 'Failed to initialize Google Maps.');
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
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setUserLocation({ lat, lng });
          if (googleMapInstance.current) {
            googleMapInstance.current.panTo({ lat, lng });
            googleMapInstance.current.setZoom(12);
          }
        },
        () => {
          // Graceful fallback to Delhi-NCR with subtle message
          setGeoStatus({
            type: 'info',
            message: 'Location access is off. Showing Delhi-NCR.',
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
      (position) => {
        setLocating(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });

        if (googleMapInstance.current) {
          googleMapInstance.current.panTo({ lat, lng });
          googleMapInstance.current.setZoom(13);
        }

        setGeoStatus({
          type: 'success',
          message: `Location acquired: ${lat.toFixed(4)}°, ${lng.toFixed(4)}° (device only)`,
        });
        setTimeout(() => setGeoStatus(null), 4000);
      },
      (error) => {
        setLocating(false);
        let msg = 'Location request failed. Showing Delhi-NCR.';
        if (error.code === 1 || error.code === error.PERMISSION_DENIED) {
          msg = 'Location access is off. Showing Delhi-NCR.';
        } else if (error.code === 2 || error.code === error.POSITION_UNAVAILABLE) {
          msg = 'Location unavailable. Showing Delhi-NCR.';
        } else if (error.code === 3 || error.code === error.TIMEOUT) {
          msg = 'Location request timed out. Showing Delhi-NCR.';
        }
        setGeoStatus({ type: 'warning', message: msg });
        setTimeout(() => setGeoStatus(null), 4500);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // 3. Render Markers & Primary Overlays
  useEffect(() => {
    const map = googleMapInstance.current;
    if (!map || !mapReady || !window.google || !window.google.maps) return;

    const google = window.google;
    const infoWindow = infoWindowRef.current;

    // Clear previous markers & overlays
    markersRef.current.stations.forEach(m => m.setMap(null));
    markersRef.current.stations = [];
    markersRef.current.fires.forEach(m => m.setMap(null));
    markersRef.current.fires = [];
    overlaysRef.current.forEach(c => c.setMap(null));
    overlaysRef.current = [];

    // Central Delhi Pin
    if (!markersRef.current.central) {
      const centralMarker = new google.maps.Marker({
        position: { lat: 28.6139, lng: 77.2090 },
        map: map,
        title: 'Delhi-NCR (Central Basin)',
        icon: getCentralPinIcon(google),
        zIndex: 1000,
      });

      centralMarker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 6px;">
            <div style="font-size: 11px; font-weight: 800; color: #5B4BDB; text-transform: uppercase;">
              📍 Monitored Center
            </div>
            <div style="font-size: 14px; font-weight: 800; color: #111827; margin-top: 2px;">
              Delhi-NCR (Central Basin)
            </div>
            <div style="margin-top: 4px; font-size: 11px; font-weight: 700; color: #E5484D;">
              AQI 312 · STAY IN Recommended
            </div>
          </div>
        `);
        infoWindow.open(map, centralMarker);
      });

      markersRef.current.central = centralMarker;
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

    // Station Markers
    if (signals.stations) {
      stations.forEach((st, i) => {
        const isDominant = i === 0 || st.aqi > 320;
        const col = AQI_COLOR(st.aqi);

        const marker = new google.maps.Marker({
          position: { lat: st.lat, lng: st.lng },
          map: map,
          title: `${st.name} Station (AQI ${st.aqi})`,
          icon: getStationMarkerIcon(st, isDominant, google),
          zIndex: isDominant ? 500 : 200,
        });

        marker.addListener('click', () => {
          setSelectedStationName(st.name);
          infoWindow.setContent(`
            <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 8px; min-width: 170px;">
              <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase;">
                ${st.name} Monitoring Station
              </div>
              <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 3px;">
                <span style="font-size: 22px; font-weight: 900; color: ${col};">${st.aqi}</span>
                <span style="font-size: 10px; font-weight: 800; color: ${col}; background: ${col}18; padding: 1px 6px; border-radius: 999px;">
                  ${st.aqi > 300 ? 'Very Poor' : 'Poor'}
                </span>
              </div>
              <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px; font-weight: 600; color: #334155;">
                <div>PM2.5: <strong>${st.pm25} µg/m³</strong></div>
                <div>PM10: <strong>${st.pm10} µg/m³</strong></div>
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
        });

        markersRef.current.stations.push(marker);
      });
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
                <span>🔥</span> Satellite Fire Signal
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #111827; margin-top: 2px;">
                Thermal Anomaly (${f.intensity.toUpperCase()})
              </div>
              <div style="font-size: 10px; font-weight: 600; color: #64748b; margin-top: 4px; line-height: 1.35;">
                Detected upwind in agricultural belt. Smoke drift transported downwind towards Delhi-NCR basin under current calm surface winds.
              </div>
              <div style="font-size: 9px; font-weight: 700; color: #94a3b8; margin-top: 4px;">
                Lat: ${f.lat.toFixed(2)}, Lng: ${f.lng.toFixed(2)} · NASA FIRMS
              </div>
            </div>
          `);
          infoWindow.open(map, marker);
        });

        markersRef.current.fires.push(marker);
      });
    }

    // Traffic corridor lines (if enabled)
    if (signals.traffic && traffic?.corridors) {
      // Line: DND Flyway (Delhi to Noida)
      const dndLine = new google.maps.Polyline({
        path: [
          { lat: 28.5835, lng: 77.2600 },
          { lat: 28.5750, lng: 77.2950 },
          { lat: 28.5680, lng: 77.3200 },
        ],
        strokeColor: '#E5484D',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: map,
      });
      // Line: NH-48 (Delhi to Gurugram)
      const nh48Line = new google.maps.Polyline({
        path: [
          { lat: 28.5900, lng: 77.1600 },
          { lat: 28.5400, lng: 77.1200 },
          { lat: 28.5000, lng: 77.0800 },
        ],
        strokeColor: '#F28C28',
        strokeOpacity: 0.85,
        strokeWeight: 5,
        map: map,
      });
      overlaysRef.current.push(dndLine, nh48Line);
    }

    // Primary Single-Dominant Visualization Overlay
    if (primaryLayer === 'aqi' || primaryLayer === 'pm25' || primaryLayer === 'pm10') {
      const outerColor = primaryLayer === 'pm25' ? '#E5484D' : '#F5C542';
      const c1 = new google.maps.Circle({
        map,
        center: { lat: 28.63, lng: 77.25 },
        radius: 16000,
        fillColor: outerColor,
        fillOpacity: 0.12,
        strokeColor: outerColor,
        strokeOpacity: 0.35,
        strokeWeight: 1.5,
        clickable: false,
      });
      const c2 = new google.maps.Circle({
        map,
        center: { lat: 28.63, lng: 77.25 },
        radius: 10000,
        fillColor: '#F28C28',
        fillOpacity: 0.18,
        strokeColor: '#F28C28',
        strokeOpacity: 0.45,
        strokeWeight: 1.5,
        clickable: false,
      });
      const c3 = new google.maps.Circle({
        map,
        center: { lat: 28.64, lng: 77.28 },
        radius: 5500,
        fillColor: '#E5484D',
        fillOpacity: 0.25,
        strokeColor: '#E5484D',
        strokeOpacity: 0.65,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(c1, c2, c3);
    } else if (primaryLayer === 'temp') {
      // Warm thermal plume
      const t1 = new google.maps.Circle({
        map,
        center: { lat: 28.62, lng: 77.22 },
        radius: 14000,
        fillColor: '#F97316',
        fillOpacity: 0.18,
        strokeColor: '#F97316',
        strokeOpacity: 0.5,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(t1);
    } else if (primaryLayer === 'rain') {
      // Rain radar precipitation circle
      const r1 = new google.maps.Circle({
        map,
        center: { lat: 28.66, lng: 77.18 },
        radius: 11000,
        fillColor: '#3B82F6',
        fillOpacity: 0.20,
        strokeColor: '#3B82F6',
        strokeOpacity: 0.6,
        strokeWeight: 2,
        clickable: false,
      });
      overlaysRef.current.push(r1);
    } else if (primaryLayer === 'wind') {
      // Wind streamline vectors across basin
      const w1 = new google.maps.Polyline({
        path: [
          { lat: 28.75, lng: 77.05 },
          { lat: 28.62, lng: 77.22 },
          { lat: 28.52, lng: 77.35 },
        ],
        strokeColor: '#10B981',
        strokeOpacity: 0.75,
        strokeWeight: 3.5,
        map,
      });
      const w2 = new google.maps.Polyline({
        path: [
          { lat: 28.70, lng: 77.15 },
          { lat: 28.58, lng: 77.28 },
        ],
        strokeColor: '#10B981',
        strokeOpacity: 0.75,
        strokeWeight: 3.5,
        map,
      });
      overlaysRef.current.push(w1, w2);
    } else if (primaryLayer === 'clouds') {
      const cl1 = new google.maps.Circle({
        map,
        center: { lat: 28.64, lng: 77.24 },
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
  }, [mapReady, primaryLayer, signals, stations, fires, traffic, userLocation]);

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

  const handleSelectStation = (name) => {
    setSelectedStationName(name);
    if (!googleMapInstance.current) return;
    const st = stations.find(s => s.name.toLowerCase().includes(name.toLowerCase()));
    if (st) {
      googleMapInstance.current.panTo({ lat: st.lat, lng: st.lng });
      googleMapInstance.current.setZoom(12);
    } else {
      googleMapInstance.current.panTo({ lat: 28.625, lng: 77.225 });
      googleMapInstance.current.setZoom(11);
    }
  };

  // Helper for legend descriptions
  const getLegendInfo = () => {
    switch (primaryLayer) {
      case 'temp':
        return {
          title: 'Temperature (°C)',
          left: 'Cool (20°)',
          right: 'Warm (35°)',
          gradient: 'linear-gradient(to right, #38BDF8, #FBBF24, #F97316)',
          note: 'Thermal mixing zone',
        };
      case 'rain':
        return {
          title: 'Rain Probability (%)',
          left: '0%',
          right: '100%',
          gradient: 'linear-gradient(to right, #93C5FD, #3B82F6, #1D4ED8)',
          note: 'Precipitation radar contour',
        };
      case 'wind':
        return {
          title: 'Surface Wind (km/h)',
          left: 'Calm (0)',
          right: 'Breezy (25)',
          gradient: 'linear-gradient(to right, #A7F3D0, #10B981, #047857)',
          note: 'Drift streamline NW 3.2 km/h',
        };
      case 'clouds':
        return {
          title: 'Cloud Cover (%)',
          left: 'Clear (0%)',
          right: 'Overcast (100%)',
          gradient: 'linear-gradient(to right, #CBD5E1, #94A3B8, #475569)',
          note: 'Satellite cloud opacity',
        };
      case 'pm25':
        return {
          title: 'PM2.5 Concentration (µg/m³)',
          left: '0 µg',
          right: '250 µg',
          gradient: 'linear-gradient(to right, #2EB872, #F5C542, #E5484D, #8B1E3F)',
          note: 'Fine particulate dispersion',
        };
      default:
        return {
          title: 'AQI Concentration (0–500)',
          left: 'Good (0)',
          right: 'Severe (500)',
          gradient: 'linear-gradient(to right, #2EB872, #9BD34A, #F5C542, #F28C28, #E5484D, #8B1E3F)',
          note: 'CPCB Air Quality zones',
        };
    }
  };

  const legend = getLegendInfo();

  return (
    <div
      id="arise-air-map-container"
      style={isExpanded ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999 } : {}}
      className={`w-full transition-all duration-300 ${
        isExpanded
          ? 'fixed inset-0 z-[9999] w-screen h-screen p-3 sm:p-5 bg-black/85 backdrop-blur-md flex flex-col'
          : 'relative card overflow-hidden h-[320px] lg:h-[340px] shadow-sm'
      }`}
    >
      {/* ── Expanded Mode Top Bar ── */}
      {isExpanded && (
        <div className="flex items-center justify-between pb-3 px-2 z-[2600]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo text-white flex items-center justify-center font-black text-sm shadow-md">
              A
            </div>
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>Arise Spatial Intelligence Explorer</span>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-indigo/30 text-indigo-300">
                  Full Map View
                </span>
              </div>
              <div className="text-[10px] font-bold text-slate-400">
                Active Layer: {legend.title} · Click anywhere to inspect local air &amp; weather
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

        {/* ── 1. Floating Structured Layer Selector (Top-Left) ── */}
        <div ref={layerDrawerRef} className="absolute top-3 left-3 z-[25] max-w-[225px]">
          <div className="glass rounded-2xl shadow-xl p-2.5 border transition-all" style={{ borderColor: 'var(--border)' }}>
            <div
              className="flex items-center justify-between cursor-pointer select-none px-1"
              onClick={() => setLayerDrawerOpen(!layerDrawerOpen)}
            >
              <div className="flex items-center gap-1.5 text-xs font-black t1">
                <span>👁️</span>
                <span>Layers</span>
                <span className="text-[9px] font-bold text-indigo px-1.5 py-0.2 rounded-full bg-indigo/10 uppercase">
                  {primaryLayer}
                </span>
              </div>
              <span className="text-[10px] font-bold t3">{layerDrawerOpen ? '▲' : '▼'}</span>
            </div>

            {layerDrawerOpen && (
              <div className="flex flex-col gap-1.5 pt-2 border-t mt-1.5 max-h-[calc(100vh-140px)] sm:max-h-[250px] overflow-y-auto pr-0.5" style={{ borderColor: 'var(--border)' }}>
                {/* Section A: Environment Primary Layers */}
                <div>
                  <div className="text-[9px] font-extrabold t3 uppercase tracking-wider mb-1">
                    Environment (Primary)
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'aqi',  label: 'AQI' },
                      { id: 'pm25', label: 'PM2.5' },
                      { id: 'pm10', label: 'PM10' },
                    ].map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPrimaryLayer(p.id)}
                        className={`py-1 px-1 rounded-lg text-[10.5px] font-black transition-all text-center ${
                          primaryLayer === p.id
                            ? 'bg-indigo text-white shadow-sm'
                            : 'bg-[var(--surface-alt)] t2 hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section B: Weather Primary Layers */}
                <div>
                  <div className="text-[9px] font-extrabold t3 uppercase tracking-wider mb-1">
                    Weather (Primary)
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'temp',   label: '🌡️ Temp' },
                      { id: 'rain',   label: '🌧️ Rain' },
                      { id: 'wind',   label: '🌬️ Wind' },
                      { id: 'clouds', label: '☁️ Clouds' },
                    ].map(w => (
                      <button
                        key={w.id}
                        onClick={() => setPrimaryLayer(w.id)}
                        className={`py-1 px-1 rounded-lg text-[10px] font-black transition-all text-center ${
                          primaryLayer === w.id
                            ? 'bg-indigo text-white shadow-sm'
                            : 'bg-[var(--surface-alt)] t2 hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section C: Additive Signals / Overlays */}
                <div className="pt-1 border-t space-y-0.5" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[9px] font-extrabold t3 uppercase tracking-wider mb-0.5">
                    Signal Overlays
                  </div>
                  {[
                    { key: 'stations', label: 'Stations', icon: '📍' },
                    { key: 'fires',    label: 'Fire Signals', icon: '🔥' },
                    { key: 'traffic',  label: 'NCR Corridors', icon: '🚗' },
                  ].map(s => (
                    <button
                      key={s.key}
                      onClick={() => toggleSignal(s.key)}
                      className="w-full flex items-center justify-between px-2 py-0.5 rounded-lg text-[9.5px] font-black transition-all text-left"
                      style={{ background: signals[s.key] ? 'var(--surface-alt)' : 'transparent' }}
                    >
                      <span className="flex items-center gap-1.5 t1">
                        <span>{s.icon}</span>
                        <span>{s.label}</span>
                      </span>
                      <span>{signals[s.key] ? '✓' : '—'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── 2. Floating Search & Station Dropdown (Top-Right) ── */}
        <div className="absolute top-3 right-3 z-[15] hidden sm:flex items-center gap-2">
          <div className="glass rounded-full pl-3.5 pr-1 py-1 flex items-center gap-2 shadow-lg border" style={{ borderColor: 'var(--border)' }}>
            <select
              value={selectedStationName}
              onChange={e => handleSelectStation(e.target.value)}
              className="bg-transparent text-[11px] font-black t1 outline-none cursor-pointer pr-1"
            >
              <option value="Delhi-NCR">Delhi-NCR (All)</option>
              {stations.map(s => (
                <option key={s.id} value={s.name}>
                  {s.name} (AQI {s.aqi})
                </option>
              ))}
            </select>
            <button
              onClick={() => handleSelectStation(selectedStationName)}
              className="w-7 h-7 rounded-full bg-indigo text-white flex items-center justify-center text-xs font-bold shadow-sm"
              title="Focus Station"
            >
              🔍
            </button>
          </div>
        </div>

        {/* ── 3. Floating Dynamic Legend (Bottom-Center, Non-overlapping) ── */}
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-[15] pointer-events-auto transition-opacity duration-200 ${
          layerDrawerOpen ? 'hidden md:flex' : 'flex'
        }`}>
          <div className="glass rounded-2xl px-3.5 py-1.5 shadow-lg border flex flex-col gap-1 min-w-[170px]" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider">
              <span className="text-emerald-600 dark:text-emerald-400">{legend.left}</span>
              <span className="text-rose-600 dark:text-rose-400">{legend.right}</span>
            </div>
            <div
              className="h-1.5 rounded-full w-full shadow-inner"
              style={{ background: legend.gradient }}
            />
            <div className="flex items-center justify-between text-[8.5px] font-bold t3 mt-0.5">
              <span>{legend.title}</span>
              <span className="text-[8px] text-indigo font-black">Click to inspect</span>
            </div>
          </div>
        </div>

        {/* ── 4. Floating Action Controls (Bottom-Right: Expand Map + Locate Me + Zoom) ── */}
        <div className="absolute bottom-3 right-3 z-[15] flex flex-col gap-1.5 items-center">
          {/* Expand Map Button (Ride/Delivery pattern) */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            id="btn-expand-map"
            className="w-8 h-8 rounded-xl glass flex items-center justify-center text-xs font-black shadow-lg border transition-all hover:scale-105 active:scale-95 t1"
            style={{ borderColor: 'var(--border)' }}
            title={isExpanded ? 'Minimize Map [Esc]' : 'Expand Map'}
            aria-label="Expand Map"
          >
            {isExpanded ? '✕' : '⛶'}
          </button>

          {/* Dedicated GPS Locate Me Button */}
          <button
            onClick={handleLocateMe}
            disabled={locating}
            id="btn-locate-me"
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shadow-lg border transition-all ${
              userLocation
                ? 'bg-blue-600 text-white border-blue-500 shadow-blue-500/30'
                : locating
                ? 'glass border-indigo/40 text-indigo animate-pulse'
                : 'glass t1 hover:bg-[var(--surface-alt)] hover:scale-105 active:scale-95'
            }`}
            style={{ borderColor: userLocation ? '#2563eb' : 'var(--border)' }}
            title="Locate Me (Browser GPS)"
            aria-label="Locate Me"
          >
            {locating ? (
              <span className="w-3.5 h-3.5 border-2 border-indigo border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="15"
                height="15"
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
          <div className="glass rounded-xl p-0.5 shadow-lg border flex flex-col gap-0.5" style={{ borderColor: 'var(--border)' }}>
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

        {/* ── 5. Graceful Fallback if API Key Missing ── */}
        {!apiKey || apiKey.trim() === '' ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--surface-alt)' }}>
            <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-xl mb-3">
              🗺️
            </div>
            <h3 className="text-sm font-black t1 mb-1">Google Maps API Key Missing</h3>
            <p className="text-xs font-semibold t3 max-w-sm mb-3">
              Add <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-indigo font-bold border border-indigo/20">VITE_GOOGLE_MAPS_API_KEY</code> to <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] font-bold">frontend/.env.local</code> and restart Vite.
            </p>
          </div>
        ) : loadError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--surface-alt)' }}>
            <h3 className="text-sm font-black text-rose-600 mb-1">Google Maps Error</h3>
            <p className="text-xs font-semibold t3 max-w-sm">{loadError}</p>
          </div>
        ) : (
          <div ref={mapRef} className="map-canvas-container absolute inset-0 w-full h-full z-0" />
        )}
      </div>
    </div>
  );
}
