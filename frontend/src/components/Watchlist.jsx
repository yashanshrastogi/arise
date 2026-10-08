import React from 'react';

/**
 * Watchlist component — compact cards for monitored personal locations:
 * Home, School, Office.
 */
const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

export default function Watchlist({ items = [] }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
      {items.map(w => {
        const col = AQI_COLOR(w.aqi);
        const icon = w.name === 'Home' ? '🏠' : w.name === 'School' ? '🏫' : '🏢';
        return (
          <div
            key={w.name}
            className="card px-3.5 py-2 flex items-center gap-2.5 min-w-[135px] hover:shadow-sm transition-shadow"
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: `${col}18`, color: col }}
            >
              {icon}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black t1 leading-tight truncate">
                {w.name} <span className="font-medium tm">({w.location})</span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm font-black" style={{ color: col }}>
                  {w.aqi}
                </span>
                <span className="text-[9px] font-bold tm truncate">{w.status}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
