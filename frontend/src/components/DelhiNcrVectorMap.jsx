import React, { useState } from 'react';

/**
 * Delhi-NCR Air Basin Vector Cartography
 * High-fidelity, self-contained SVG map representing the Delhi-NCR airshed.
 * Bounding Box: 28.30°N to 28.92°N, 76.85°E to 77.55°E.
 * Works 100% offline with zero external API key requirements.
 */

const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

export default function DelhiNcrVectorMap({
  stations = [],
  fires = [],
  weather = null,
  traffic: _traffic = null,
  dark = false,
  primaryLayer = 'aqi',
  weatherLayer = null,
  signals = { stations: true, fires: true, traffic: false },
  selectedStationName = 'Delhi-NCR',
  userLocation = null,
  onSelectStation = null,
}) {
  const [_hoveredPoint, setHoveredPoint] = useState(null);

  // Geographic projection helper to SVG viewBox (1000 x 700)
  const project = (lat, lng) => {
    const minLat = 28.30;
    const maxLat = 28.92;
    const minLng = 76.85;
    const maxLng = 77.55;
    const numLat = Number(lat) || 28.6139;
    const numLng = Number(lng) || 77.2090;

    const x = Math.max(45, Math.min(955, ((numLng - minLng) / (maxLng - minLng)) * 1000));
    const y = Math.max(45, Math.min(655, (1 - (numLat - minLat) / (maxLat - minLat)) * 700));
    return { x, y };
  };

  // Color tokens affiliated with light (#F6F7FB / #FFFFFF) and dark (#0B1020 / #131A2E)
  const bgCol = dark ? '#0B1020' : '#F6F7FB';
  const borderCol = dark ? '#1E293B' : '#E2E8F0';
  const gridCol = dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)';
  const nctFill = dark ? '#131A2E' : '#FFFFFF';
  const nctStroke = dark ? '#334155' : '#CBD5E1';
  const riverCol = dark ? '#0284C7' : '#0284C7';
  const textColor = dark ? '#94A3B8' : '#334155';

  return (
    <div className="relative w-full h-full select-none overflow-hidden" style={{ background: bgCol }}>
      <svg
        viewBox="0 0 1000 700"
        className="w-full h-full object-contain pointer-events-auto"
        style={{ width: '100%', height: '100%' }}
      >
        <defs>
          <linearGradient id="yamunaFlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id="delhiBasinAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={dark ? '#1e293b' : '#e2e8f0'} stopOpacity="0.5" />
            <stop offset="100%" stopColor={bgCol} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Ambient Geographic Grid Lines */}
        <line x1="200" y1="0" x2="200" y2="700" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="400" y1="0" x2="400" y2="700" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="600" y1="0" x2="600" y2="700" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="800" y1="0" x2="800" y2="700" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1="175" x2="1000" y2="175" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1="350" x2="1000" y2="350" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />
        <line x1="0" y1="525" x2="1000" y2="525" stroke={gridCol} strokeWidth="1" strokeDasharray="4 4" />

        {/* Coordinate References */}
        <text x="210" y="24" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">77.0°E · Gurugram / Narela</text>
        <text x="510" y="24" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">77.2°E · Central Delhi</text>
        <text x="760" y="24" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">77.4°E · Noida / Ghaziabad</text>

        <text x="15" y="180" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">28.75°N</text>
        <text x="15" y="355" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">28.60°N</text>
        <text x="15" y="530" fill={textColor} fontSize="10" fontWeight="700" opacity="0.6">28.45°N</text>

        {/* Delhi NCT Basin Silhouette Polygon */}
        <path
          d="M 330 180 Q 430 110 550 130 T 670 200 Q 720 310 680 430 T 570 540 Q 450 560 350 480 T 290 320 Z"
          fill={nctFill}
          stroke={nctStroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Satellite Regional Hubs */}
        {/* Gurugram Hub */}
        <ellipse cx="270" cy="530" rx="130" ry="85" fill="none" stroke={borderCol} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
        <text x="270" y="535" fill={textColor} fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.5" opacity="0.7">
          GURUGRAM (NCR)
        </text>

        {/* Noida Hub */}
        <ellipse cx="760" cy="400" rx="110" ry="90" fill="none" stroke={borderCol} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
        <text x="760" y="405" fill={textColor} fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.5" opacity="0.7">
          NOIDA (NCR)
        </text>

        {/* Ghaziabad Hub */}
        <ellipse cx="830" cy="240" rx="100" ry="75" fill="none" stroke={borderCol} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
        <text x="830" y="245" fill={textColor} fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.5" opacity="0.7">
          GHAZIABAD (NCR)
        </text>

        {/* Faridabad Hub */}
        <ellipse cx="620" cy="610" rx="110" ry="65" fill="none" stroke={borderCol} strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
        <text x="620" y="615" fill={textColor} fontSize="12" fontWeight="800" textAnchor="middle" letterSpacing="1.5" opacity="0.7">
          FARIDABAD (NCR)
        </text>

        {/* Central Delhi Region Label */}
        <text x="490" y="318" fill={dark ? '#cbd5e1' : '#334155'} fontSize="15" fontWeight="900" textAnchor="middle" letterSpacing="2">
          DELHI NCT AIR BASIN
        </text>
        <text x="490" y="336" fill={textColor} fontSize="10" fontWeight="700" textAnchor="middle" opacity="0.8">
          CPCB Continuous Ambient Air Quality Network
        </text>

        {/* River Yamuna Vector */}
        <path
          d="M 580 40 Q 565 140 575 220 T 600 320 Q 615 410 635 490 T 690 670"
          fill="none"
          stroke="url(#yamunaFlowGrad)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.85"
        />
        <text x="625" y="440" fill={riverCol} fontSize="9" fontWeight="800" fontStyle="italic" opacity="0.85">
          Yamuna River 〰
        </text>

        {/* Arterial Corridors (Traffic Overlay) */}
        {(signals.traffic || primaryLayer === 'traffic') && (
          <g opacity="0.85">
            {/* DND Flyway */}
            <line x1="590" y1="370" x2="720" y2="390" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
            <text x="655" y="365" fill="#f43f5e" fontSize="9" fontWeight="800">DND Flyway (+18m)</text>
            {/* NH-48 Expressway */}
            <line x1="440" y1="430" x2="270" y2="530" stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
            <text x="350" y="470" fill="#f59e0b" fontSize="9" fontWeight="800">NH-48 (+12m)</text>
            {/* Ring Road Loop */}
            <circle cx="490" cy="340" r="70" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeDasharray="5 3" />
            <text x="490" y="260" fill="#6366f1" fontSize="8" fontWeight="800" textAnchor="middle">Ring Road</text>
          </g>
        )}

        {/* Secondary Weather Overlays */}
        {weatherLayer === 'temp' && (
          <circle cx="490" cy="350" r="160" fill="#f97316" fillOpacity="0.12" stroke="#f97316" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />
        )}
        {weatherLayer === 'rain' && (
          <circle cx="450" cy="300" r="140" fill="#3b82f6" fillOpacity="0.12" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" pointerEvents="none" />
        )}
        {weatherLayer === 'clouds' && (
          <circle cx="500" cy="330" r="200" fill="#94a3b8" fillOpacity="0.15" stroke="#64748b" strokeWidth="1.5" pointerEvents="none" />
        )}

        {/* Live Wind Vector Arrows */}
        {(weatherLayer === 'wind' || primaryLayer === 'wind') && (
          <g opacity="0.4" stroke={textColor} strokeWidth="1.5" strokeLinecap="round">
            {[
              { x: 300, y: 150 },
              { x: 500, y: 180 },
              { x: 700, y: 200 },
              { x: 350, y: 350 },
              { x: 550, y: 370 },
              { x: 750, y: 450 },
              { x: 400, y: 550 },
            ].map((p, idx) => (
              <g key={idx} transform={`translate(${p.x}, ${p.y}) rotate(${weather?.windDegrees || 315})`}>
                <line x1="-15" y1="0" x2="15" y2="0" />
                <polyline points="8,-5 15,0 8,5" fill="none" />
              </g>
            ))}
          </g>
        )}

        {/* Satellite Fire Signals (NASA FIRMS) */}
        {signals.fires && (fires || []).map((f, idx) => {
          const pt = project(f.lat, f.lng);
          return (
            <g
              key={f.id || `fire-${idx}`}
              transform={`translate(${pt.x}, ${pt.y})`}
              className="cursor-pointer transition-transform hover:scale-125"
              onClick={() => onSelectStation && onSelectStation({
                name: `Satellite Fire Anomaly (${f.source || 'NASA FIRMS'})`,
                lat: f.lat,
                lng: f.lng,
                aqi: 380,
                pm25: 220,
                pm10: 340,
                type: 'fire',
                source: f.source || 'NASA FIRMS',
              })}
            >
              <circle r="14" fill="#ef4444" fillOpacity="0.25" className="animate-ping" />
              <circle r="9" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
              <text x="0" y="4" textAnchor="middle" fontSize="10">🔥</text>
            </g>
          );
        })}

        {/* Monitoring Stations */}
        {signals.stations && (stations || []).map((st, idx) => {
          const pt = project(st.lat, st.lng);
          const col = AQI_COLOR(st.aqi || 312);
          const isSelected = selectedStationName === st.name;
          return (
            <g
              key={st.id || `st-${idx}`}
              transform={`translate(${pt.x}, ${pt.y})`}
              className="cursor-pointer transition-transform hover:scale-125"
              onClick={() => onSelectStation && onSelectStation(st)}
              onMouseEnter={() => setHoveredPoint(st)}
              onMouseLeave={() => setHoveredPoint(null)}
            >
              {/* Pulsing Halo */}
              {(isSelected || (st.aqi && st.aqi > 320)) && (
                <circle r={isSelected ? '26' : '20'} fill={col} fillOpacity="0.25" className="animate-pulse" />
              )}
              {/* Outer circle */}
              <circle
                r="16"
                fill={dark ? '#0f172a' : '#ffffff'}
                stroke={col}
                strokeWidth={isSelected ? '3.5' : '2.5'}
                filter="drop-shadow(0px 2px 4px rgba(0,0,0,0.25))"
              />
              {/* AQI text */}
              <text
                x="0"
                y="4.5"
                textAnchor="middle"
                fontSize="10"
                fontWeight="900"
                fill={col}
                fontFamily="system-ui, -apple-system, sans-serif"
              >
                {st.aqi || 312}
              </text>
              {/* Label Pill */}
              <g transform="translate(0, 24)">
                <rect
                  x="-35"
                  y="-8"
                  width="70"
                  height="16"
                  rx="8"
                  fill={dark ? '#0F172A' : '#FFFFFF'}
                  stroke={isSelected ? col : borderCol}
                  strokeWidth="1.5"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="800"
                  fill={dark ? '#F1F5F9' : '#0F172A'}
                >
                  {st.name && st.name.length > 10 ? st.name.slice(0, 9) + '…' : st.name}
                </text>
              </g>
            </g>
          );
        })}

        {/* User GPS Pin (if active) */}
        {userLocation && (
          <g transform={`translate(${project(userLocation.lat, userLocation.lng).x}, ${project(userLocation.lat, userLocation.lng).y})`}>
            <circle r="22" fill="#2563eb" fillOpacity="0.2" className="animate-ping" />
            <circle r="8" fill="#2563eb" stroke="#ffffff" strokeWidth="2" />
            <text x="0" y="18" textAnchor="middle" fontSize="9" fontWeight="900" fill="#2563eb">YOU</text>
          </g>
        )}
      </svg>
    </div>
  );
}
