import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Air Map — exact recreation of s1 and s2 full-width map experience.
 * Features:
 * - Floating "View Options" layers panel on top-left
 * - Floating search pill on top-right
 * - Floating metric bubbles directly on stations (PM2.5, PM10, etc.)
 * - Concentric organic pollution dispersion zones (plume rings)
 * - Central location pin marker
 * - Floating AQI concentration gradient legend on bottom-left
 * - Floating zoom controls on bottom-right
 * - Satellite thermal fire signal markers upwind
 */

// Custom Zoom Controller component so our floating + / - controls work smoothly
function ZoomController({ zoomIn, zoomOut }) {
  const map = useMap();
  React.useEffect(() => {
    if (zoomIn) map.zoomIn();
  }, [zoomIn]);
  React.useEffect(() => {
    if (zoomOut) map.zoomOut();
  }, [zoomOut]);
  return null;
}

const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

// Create floating metric bubble icon for stations (matching s1 large frosted bubble cards)
function createBubbleIcon(station, isDominant) {
  const col = AQI_COLOR(station.aqi);
  return L.divIcon({
    className: 'custom-bubble-wrapper',
    html: `
      <div class="arise-map-bubble ${isDominant ? 'dominant-bubble' : ''}" style="
        width: 108px;
        height: 108px;
        border-radius: 50%;
        box-shadow: 0 12px 28px -6px rgba(0,0,0,0.14), 0 8px 12px -6px rgba(0,0,0,0.08);
        border: ${isDominant ? `3px solid ${col}` : '2px solid rgba(255,255,255,0.95)'};
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 6px;
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
        cursor: pointer;
        position: relative;
      ">
        <div style="display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 800; color: #64748b;">
          <span style="font-size: 11px; color: ${col};">⚛</span>
          <span class="bubble-label">${station.name}</span>
          <span style="background: ${col}22; color: ${col}; font-size: 8px; font-weight: 900; padding: 1px 4px; border-radius: 999px;">
            ${station.aqi}
          </span>
        </div>
        <div class="bubble-val" style="font-size: 22px; font-weight: 900; line-height: 1.1; margin-top: 2px;">
          ${station.pm25}
        </div>
        <div class="bubble-unit" style="font-size: 9px; font-weight: 700; color: #94a3b8;">
          µg/m³ · PM2.5
        </div>
      </div>
    `,
    iconSize: [108, 108],
    iconAnchor: [54, 54],
  });
}

// Center location pin icon
function createCenterPin() {
  return L.divIcon({
    className: 'custom-pin-wrapper',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #5B4BDB;
          border: 3px solid #ffffff;
          box-shadow: 0 6px 16px rgba(91, 75, 219, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          color: white;
        ">
          📍
        </div>
        <div style="
          margin-top: 4px;
          background: rgba(17, 24, 39, 0.9);
          backdrop-filter: blur(4px);
          color: white;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
          white-space: nowrap;
        ">
          Delhi-NCR
        </div>
      </div>
    `,
    iconSize: [34, 58],
    iconAnchor: [17, 17],
  });
}

// Fire signal marker icon
function createFireIcon(f) {
  return L.divIcon({
    className: 'custom-fire-wrapper',
    html: `
      <div style="
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #E5484D;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 14px rgba(229, 72, 77, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        cursor: pointer;
      ">
        🔥
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export default function AirMap({ stations = [], fires = [] }) {
  // Layer toggles
  const [layers, setLayers] = useState({
    pm25: true,
    pm10: true,
    o3: false,
    no2: false,
    aqiArea: true,
    fires: true,
  });

  const [viewOptionsOpen, setViewOptionsOpen] = useState(true);
  const [zoomTrigger, setZoomTrigger] = useState(0);

  const toggleLayer = key => setLayers(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="card overflow-hidden relative w-full h-[500px] lg:h-[540px] shadow-sm">
      {/* ── 1. Floating "View Options" Panel (Top-Left, matching s1) ── */}
      <div className="absolute top-4 left-4 z-[1000] max-w-[240px]">
        <div className="glass rounded-2xl shadow-xl p-3.5 border transition-all" style={{ borderColor: 'var(--border)' }}>
          {/* Header */}
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
              {/* Pollutants accordion */}
              <div className="text-[10px] font-extrabold t3 uppercase tracking-wider mt-1">
                Pollutants
              </div>

              <div className="space-y-1">
                {[
                  { key: 'pm25', label: 'PM2.5', icon: '⚛', color: '#E5484D' },
                  { key: 'pm10', label: 'PM10', icon: '⚛', color: '#F28C28' },
                  { key: 'no2', label: 'NO₂', icon: '⚛', color: '#2EB872' },
                  { key: 'o3', label: 'O₃', icon: '⚛', color: '#2EB872' },
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
                    <span className="text-xs">
                      {layers[p.key] ? '👁' : '🚫'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Area toggles */}
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

              {/* Footer buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t mt-1" style={{ borderColor: 'var(--border)' }}>
                <button
                  onClick={() => setLayers({ pm25: true, pm10: true, o3: false, no2: false, aqiArea: true, fires: true })}
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

      {/* ── 2. Floating Search Pill (Top-Right, matching s1) ── */}
      <div className="absolute top-4 right-4 z-[1000] hidden sm:block">
        <div className="glass rounded-full pl-5 pr-2 py-1.5 flex items-center gap-3 shadow-lg border" style={{ borderColor: 'var(--border)' }}>
          <input
            type="text"
            defaultValue="Delhi-NCR, India"
            readOnly
            className="bg-transparent text-xs font-extrabold t1 outline-none w-44 cursor-default"
          />
          <button className="w-8 h-8 rounded-full bg-indigo text-white flex items-center justify-center text-xs font-bold shadow-md hover:scale-105 transition-transform">
            🔍
          </button>
        </div>
      </div>

      {/* ── 3. Floating AQI Concentration Legend (Bottom-Left, matching s2/s1) ── */}
      <div className="absolute bottom-5 left-5 z-[1000]">
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
            <span>AQI Concentration & Dispersion Area</span>
          </div>
        </div>
      </div>

      {/* ── 4. Floating Zoom Controls (Bottom-Right, matching s1/s2) ── */}
      <div className="absolute bottom-5 right-5 z-[1000] flex flex-col gap-1.5">
        <div className="glass rounded-2xl p-1 shadow-lg border flex flex-col gap-1" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => setZoomTrigger(prev => prev + 1)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
          >
            +
          </button>
          <div className="h-[1px] bg-[var(--border)] w-full"></div>
          <button
            onClick={() => setZoomTrigger(prev => prev - 1)}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold t1 hover:bg-[var(--surface-alt)] transition-colors"
          >
            −
          </button>
        </div>
      </div>

      {/* ── 5. Actual Interactive Leaflet Map ── */}
      <MapContainer
        center={[28.625, 77.225]}
        zoom={11}
        scrollWheelZoom={true}
        zoomControl={false}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoomController
          zoomIn={zoomTrigger > 0}
          zoomOut={zoomTrigger < 0}
        />

        {/* ── Concentric Organic Dispersion Zones (matching s1 & s2) ── */}
        {layers.aqiArea && (
          <>
            {/* Outer yellow dispersion halo */}
            <Circle
              center={[28.63, 77.25]}
              radius={16000}
              pathOptions={{
                fillColor: '#F5C542',
                fillOpacity: 0.14,
                color: '#F5C542',
                weight: 1.5,
                opacity: 0.35,
              }}
            />
            {/* Mid orange dispersion zone */}
            <Circle
              center={[28.63, 77.25]}
              radius={10000}
              pathOptions={{
                fillColor: '#F28C28',
                fillOpacity: 0.20,
                color: '#F28C28',
                weight: 1.5,
                opacity: 0.45,
              }}
            />
            {/* Core intense coral hotspot (Anand Vihar & East ring) */}
            <Circle
              center={[28.64, 77.28]}
              radius={5500}
              pathOptions={{
                fillColor: '#E5484D',
                fillOpacity: 0.28,
                color: '#E5484D',
                weight: 2,
                opacity: 0.65,
              }}
            />
          </>
        )}

        {/* ── Central Delhi Location Pin ── */}
        <Marker position={[28.6139, 77.2090]} icon={createCenterPin()}>
          <Popup>
            <div className="p-1 font-bold text-xs text-gray-900">
              Delhi-NCR Central Monitoring Center
            </div>
          </Popup>
        </Marker>

        {/* ── Floating Station Metric Bubbles (exact s1 replicate) ── */}
        {(layers.pm25 || layers.pm10) && stations.map((st, i) => (
          <Marker
            key={st.id}
            position={[st.lat, st.lng]}
            icon={createBubbleIcon(st, i === 0 || st.aqi > 320)}
          >
            <Popup>
              <div className="p-2 font-sans">
                <div className="text-xs font-bold text-gray-500 uppercase">{st.name} Station</div>
                <div className="text-xl font-extrabold text-gray-900 mt-1">AQI {st.aqi}</div>
                <div className="text-xs font-semibold text-gray-600 mt-1">
                  PM2.5: {st.pm25} µg/m³ · PM10: {st.pm10} µg/m³
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── Fire Signal Markers (Upwind stubble burning) ── */}
        {layers.fires && fires.map(f => (
          <Marker
            key={f.id}
            position={[f.lat, f.lng]}
            icon={createFireIcon(f)}
          >
            <Popup>
              <div className="p-2 font-sans">
                <div className="text-xs font-bold text-red-600 uppercase flex items-center gap-1">
                  <span>🔥</span> Satellite Fire Signal
                </div>
                <div className="text-sm font-extrabold text-gray-900 mt-1">
                  Upwind Agriculture Fire
                </div>
                <div className="text-xs font-semibold text-gray-600 mt-0.5">
                  Intensity: {f.intensity.toUpperCase()} · Smoke drift towards Delhi basin
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
