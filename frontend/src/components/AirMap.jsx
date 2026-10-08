import React, { useState, useEffect, useRef } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

/**
 * Google Maps dark mode styling definition
 */
const DARK_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#161d2e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#161d2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#cbd5e1' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#64748b' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1c283f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#4ade80' }],
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
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2a40' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f1f5f9' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#25334d' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#94a3b8' }],
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
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0f172a' }],
  },
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
  const size = isDominant ? 48 : 42;
  const strokeWidth = isDominant ? 3.5 : 2.5;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="#ffffff" stroke="${col}" stroke-width="${strokeWidth}" />
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 8}" fill="${col}" fill-opacity="0.14" />
      <text x="${size / 2}" y="${size / 2 + 4.5}" font-family="system-ui, -apple-system, sans-serif" font-size="${isDominant ? 12 : 11}" font-weight="900" fill="${col}" text-anchor="middle">
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
  const size = f.intensity === 'high' ? 36 : 30;
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

// 3. Current Monitored Location Pin (Delhi-NCR Central)
function getUserLocationMarkerIcon(google) {
  const width = 36;
  const height = 48;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <path d="M18 0 C8 0 0 8 0 18 C0 31 18 48 18 48 C18 48 36 31 36 18 C36 8 28 0 18 0 Z" fill="#5B4BDB" stroke="#ffffff" stroke-width="2.5" />
      <circle cx="18" cy="18" r="7" fill="#ffffff" />
      <circle cx="18" cy="18" r="3.5" fill="#5B4BDB" />
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(18, 48),
  };
}

export default function AirMap({ stations = [], fires = [], dark = false }) {
  const mapRef = useRef(null);
  const googleMapInstance = useRef(null);
  const infoWindowRef = useRef(null);
  const markersRef = useRef({ stations: [], fires: [], user: null });
  const circlesRef = useRef([]);

  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [viewOptionsOpen, setViewOptionsOpen] = useState(true);
  const [selectedStationName, setSelectedStationName] = useState('Delhi-NCR');

  // Layer state
  const [layers, setLayers] = useState({
    stations: true,
    pm25: true,
    pm10: true,
    no2: false,
    o3: false,
    aqiArea: true,
    fires: true,
  });

  const toggleLayer = key => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  // Read key through import.meta.env exclusively per security requirements
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // Initialize Google Maps via official functional API
  useEffect(() => {
    if (!apiKey || apiKey.trim() === '') {
      return;
    }

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
          center: { lat: 28.625, lng: 77.225 }, // Center on Delhi-NCR
          zoom: 11,
          disableDefaultUI: true, // Clean custom Arise UI controls
          zoomControl: false,
          mapTypeControl: false,
          scaleControl: false,
          streetViewControl: false,
          rotateControl: false,
          fullscreenControl: false,
          styles: dark ? DARK_MAP_STYLES : [],
          backgroundColor: dark ? '#0b0f19' : '#e5e9ec',
        });

        googleMapInstance.current = map;
        infoWindowRef.current = new InfoWindow();

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

  // Handle Dark Mode Style Changes
  useEffect(() => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setOptions({
        styles: dark ? DARK_MAP_STYLES : [],
        backgroundColor: dark ? '#0b0f19' : '#e5e9ec',
      });
    }
  }, [dark]);

  // Update Markers and Overlays when layers, stations, fires, or mapReady change
  useEffect(() => {
    const map = googleMapInstance.current;
    if (!map || !mapReady || !window.google || !window.google.maps) return;

    const google = window.google;
    const infoWindow = infoWindowRef.current;

    // Clear existing station markers
    markersRef.current.stations.forEach(m => m.setMap(null));
    markersRef.current.stations = [];

    // Clear existing fire markers
    markersRef.current.fires.forEach(m => m.setMap(null));
    markersRef.current.fires = [];

    // Clear existing circles
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    // 1. Current Monitored Location Pin (Delhi-NCR Central)
    if (!markersRef.current.user) {
      const userMarker = new google.maps.Marker({
        position: { lat: 28.6139, lng: 77.2090 },
        map: map,
        title: 'Delhi-NCR (Central Monitor)',
        icon: getUserLocationMarkerIcon(google),
        zIndex: 1000,
      });

      userMarker.addListener('click', () => {
        infoWindow.setContent(`
          <div style="font-family: 'Plus Jakarta Sans', sans-serif; padding: 4px 6px;">
            <div style="font-size: 11px; font-weight: 800; color: #5B4BDB; text-transform: uppercase;">
              📍 Monitored Center
            </div>
            <div style="font-size: 15px; font-weight: 800; color: #111827; margin-top: 2px;">
              Delhi-NCR (Central)
            </div>
            <div style="margin-top: 6px; font-size: 11px; font-weight: 700; color: #E5484D;">
              AQI 312 · STAY IN Recommended
            </div>
          </div>
        `);
        infoWindow.open(map, userMarker);
      });

      markersRef.current.user = userMarker;
    }

    // 2. Monitoring Station Markers
    if (layers.stations) {
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
                <span style="font-size: 22px; font-weight: 900; color: ${col};">
                  ${st.aqi}
                </span>
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

    // 3. Fire Signal Markers (Upwind Thermal Detection)
    if (layers.fires) {
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

    // 4. Concentric Organic Dispersion Zones (AQI Plume Contour)
    if (layers.aqiArea) {
      // Outer yellow dispersion ring
      const outerCircle = new google.maps.Circle({
        map: map,
        center: { lat: 28.63, lng: 77.25 },
        radius: 16000,
        fillColor: '#F5C542',
        fillOpacity: 0.12,
        strokeColor: '#F5C542',
        strokeOpacity: 0.35,
        strokeWeight: 1.5,
        clickable: false,
      });

      // Mid orange dispersion ring
      const midCircle = new google.maps.Circle({
        map: map,
        center: { lat: 28.63, lng: 77.25 },
        radius: 10000,
        fillColor: '#F28C28',
        fillOpacity: 0.18,
        strokeColor: '#F28C28',
        strokeOpacity: 0.45,
        strokeWeight: 1.5,
        clickable: false,
      });

      // Core coral plume hotspot
      const coreCircle = new google.maps.Circle({
        map: map,
        center: { lat: 28.64, lng: 77.28 },
        radius: 5500,
        fillColor: '#E5484D',
        fillOpacity: 0.25,
        strokeColor: '#E5484D',
        strokeOpacity: 0.65,
        strokeWeight: 2,
        clickable: false,
      });

      circlesRef.current = [outerCircle, midCircle, coreCircle];
    }
  }, [mapReady, layers, stations, fires]);

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

  return (
    <div className="card overflow-hidden relative w-full h-[500px] lg:h-[540px] shadow-sm">
      {/* ── 1. Floating "View Options" Panel (Top-Left) ── */}
      <div className="absolute top-4 left-4 z-[10] max-w-[240px]">
        <div className="glass rounded-2xl shadow-xl p-3.5 border transition-all" style={{ borderColor: 'var(--border)' }}>
          <div
            className="flex items-center justify-between cursor-pointer select-none mb-2"
            onClick={() => setViewOptionsOpen(!viewOptionsOpen)}
          >
            <div className="flex items-center gap-1.5 text-xs font-extrabold t1">
              <span>👁️</span>
              <span>View Options</span>
            </div>
            <span className="text-[10px] font-bold t3">{viewOptionsOpen ? '▲' : '▼'}</span>
          </div>

          {viewOptionsOpen && (
            <div className="flex flex-col gap-2 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
              <div className="text-[10px] font-extrabold t3 uppercase tracking-wider mt-1">
                Layers
              </div>

              <div className="space-y-1">
                {[
                  { key: 'stations', label: 'Stations', icon: '📍', color: '#5B4BDB' },
                  { key: 'pm25', label: 'PM2.5', icon: '⚛', color: '#E5484D' },
                  { key: 'pm10', label: 'PM10', icon: '⚛', color: '#F28C28' },
                  { key: 'no2', label: 'NO₂', icon: '⚛', color: '#2EB872' },
                ].map(p => (
                  <button
                    key={p.key}
                    onClick={() => toggleLayer(p.key)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all text-left"
                    style={{
                      background: layers[p.key] ? 'var(--surface-alt)' : 'transparent',
                    }}
                  >
                    <span className="flex items-center gap-1.5 t1">
                      <span style={{ color: p.color }}>{p.icon}</span>
                      <span>{p.label}</span>
                    </span>
                    <span className="text-xs">{layers[p.key] ? '👁' : '🚫'}</span>
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => toggleLayer('aqiArea')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{ background: layers.aqiArea ? 'var(--surface-alt)' : 'transparent' }}
                >
                  <span className="t1">AQI Color Area</span>
                  <span className="text-xs">{layers.aqiArea ? '👁' : '🚫'}</span>
                </button>

                <button
                  onClick={() => toggleLayer('fires')}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all"
                  style={{ background: layers.fires ? 'var(--surface-alt)' : 'transparent' }}
                >
                  <span className="flex items-center gap-1 t1">
                    <span>🔥</span>
                    <span>Fire Signals</span>
                  </span>
                  <span className="text-xs">{layers.fires ? '👁' : '🚫'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t mt-1" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setLayers({ stations: true, pm25: true, pm10: true, no2: false, o3: false, aqiArea: true, fires: true })}
                  className="text-[11px] font-bold t3 hover:text-[var(--text-primary)] px-2 py-1"
                >
                  Reset
                </button>
                <button
                  onClick={() => setViewOptionsOpen(false)}
                  className="bg-indigo text-white text-[11px] font-extrabold px-3 py-1.5 rounded-xl shadow-sm hover:shadow"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Floating Search Pill (Top-Right, Mock / Local Interaction) ── */}
      <div className="absolute top-4 right-4 z-[10] hidden sm:block">
        <div className="glass rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2 shadow-lg border" style={{ borderColor: 'var(--border)' }}>
          <select
            value={selectedStationName}
            onChange={e => handleSelectStation(e.target.value)}
            className="bg-transparent text-xs font-extrabold t1 outline-none cursor-pointer pr-2"
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
            className="w-8 h-8 rounded-full bg-indigo text-white flex items-center justify-center text-xs font-bold shadow-md hover:scale-105 transition-transform"
            title="Focus Location"
          >
            🔍
          </button>
        </div>
      </div>

      {/* ── 3. Floating AQI Concentration Legend (Bottom-Left) ── */}
      <div className="absolute bottom-5 left-5 z-[10]">
        <div className="glass rounded-2xl px-4 py-2.5 shadow-lg border flex flex-col gap-1 min-w-[190px]" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider">
            <span className="text-emerald-600 dark:text-emerald-400">Low (0)</span>
            <span className="text-rose-600 dark:text-rose-400">High (500)</span>
          </div>
          <div
            className="h-2 rounded-full w-full shadow-inner"
            style={{
              background: 'linear-gradient(to right, #2EB872, #9BD34A, #F5C542, #F28C28, #E5484D, #8B1E3F)',
            }}
          />
          <div className="flex items-center gap-1 text-[9px] font-bold t3 mt-0.5">
            <span>ⓘ</span>
            <span>AQI Concentration &amp; Dispersion Area</span>
          </div>
        </div>
      </div>

      {/* ── 4. Floating Zoom Controls (Bottom-Right) ── */}
      <div className="absolute bottom-5 right-5 z-[10] flex flex-col gap-1.5">
        <div className="glass rounded-2xl p-1 shadow-lg border flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={handleZoomIn}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
            title="Zoom In"
          >
            +
          </button>
          <div className="h-[1px] bg-[var(--border)] w-full" />
          <button
            onClick={handleZoomOut}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
            title="Zoom Out"
          >
            −
          </button>
        </div>
      </div>

      {/* ── 5. Graceful Fallback if API Key Missing ── */}
      {!apiKey || apiKey.trim() === '' ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center" style={{ background: 'var(--surface-alt)' }}>
          <div className="w-14 h-14 rounded-3xl bg-indigo/10 flex items-center justify-center text-2xl mb-4">
            🗺️
          </div>
          <h3 className="text-base font-extrabold t1 mb-1">
            Google Maps API Key Missing
          </h3>
          <p className="text-xs font-semibold t3 max-w-md leading-relaxed mb-4">
            Add <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] text-indigo font-bold border border-indigo/20">VITE_GOOGLE_MAPS_API_KEY</code> to <code className="px-1.5 py-0.5 rounded bg-[var(--surface)] font-bold">frontend/.env.local</code> and restart Vite to activate live Google Maps.
          </p>
          <div className="flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <span>⚠️</span>
            <span>Mock Mode: Telemetry ready for {stations.length} stations &amp; {fires.length} fire signals</span>
          </div>
        </div>
      ) : loadError ? (
        /* Graceful error state */
        <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center" style={{ background: 'var(--surface-alt)' }}>
          <div className="w-14 h-14 rounded-3xl bg-rose-500/10 flex items-center justify-center text-2xl mb-4">
            ⚠️
          </div>
          <h3 className="text-base font-extrabold text-rose-600 mb-1">
            Google Maps Initialization Error
          </h3>
          <p className="text-xs font-semibold t3 max-w-md leading-relaxed">
            {loadError}
          </p>
        </div>
      ) : (
        /* The Google Map Container */
        <div ref={mapRef} className="map-canvas-container absolute inset-0 w-full h-full z-0" />
      )}
    </div>
  );
}
