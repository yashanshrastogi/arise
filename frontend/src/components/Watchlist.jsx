import React from 'react';

/**
 * Watchlist component — compact cards for monitored personal locations:
 * Home, School, Office. Includes coordinates, AQI badge, and click-to-inspect.
 */
const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

export default function Watchlist({ items = [], onSelect = null }) {
  return (
    <div className="space-y-2 max-w-full">
      {items.map(w => {
        const col = AQI_COLOR(w.aqi);
        const icon = w.name === 'Home' ? '🏠' : w.name === 'School' ? '🏫' : '🏢';
        return (
          <div
            key={w.name}
            onClick={() => onSelect && w.lat && w.lon && onSelect(w.lat, w.lon, `${w.name} (${w.location})`)}
            className={`card p-3 flex items-center justify-between gap-3 transition-all ${
              onSelect ? 'cursor-pointer hover:border-indigo/40 hover:shadow-sm active:scale-[0.99]' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: `${col}18`, color: col }}
              >
                {icon}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black t1 leading-tight truncate">
                  {w.name} <span className="font-semibold tm text-[11px]">({w.location})</span>
                </div>
                <div className="text-[10px] font-bold t3 mt-0.5 flex items-center gap-1.5">
                  {w.lat && w.lon ? (
                    <span>{w.lat.toFixed(2)}°, {w.lon.toFixed(2)}°</span>
                  ) : (
                    <span>Delhi-NCR</span>
                  )}
                  <span>•</span>
                  <span>{w.updated || 'Live Telemetry'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <div className="text-sm font-black" style={{ color: col }}>
                  {w.aqi}
                </div>
                <span
                  className="inline-block text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase"
                  style={{ background: `${col}18`, color: col }}
                >
                  {w.status}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

