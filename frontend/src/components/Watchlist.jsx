import React from 'react';

/**
 * Watchlist component — monitored personal locations (Home, Work, School).
 * Includes empty state explaining the real benefit of saved locations
 * and a high-converting CTA to save locations.
 */
const AQI_COLOR = aqi =>
  aqi > 400 ? '#8B1E3F' :
  aqi > 300 ? '#E5484D' :
  aqi > 200 ? '#F28C28' :
  aqi > 100 ? '#F5C542' :
  aqi > 50  ? '#9BD34A' : '#2EB872';

const SEVERITY_ICON = aqi =>
  aqi > 400 ? '🚨' :
  aqi > 300 ? '🔴' :
  aqi > 200 ? '🟠' :
  aqi > 100 ? '🟡' :
  aqi > 50  ? '🟢' : '✅';

export default function Watchlist({ items = [], onSelect = null, onOpenSaveLocations = null }) {
  if (!items || items.length === 0) {
    return (
      <div
        className="p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-2.5"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div className="w-10 h-10 rounded-2xl bg-indigo/10 text-indigo flex items-center justify-center text-xl">
          📍
        </div>
        <div>
          <h4 className="text-xs font-black t1">No Saved Locations Yet</h4>
          <p className="text-[11px] font-medium t3 max-w-xs mt-1 leading-relaxed">
            Registered users can save Home and Work locations to receive personalized environmental insights and quick-switch air quality monitoring across Delhi-NCR.
          </p>
        </div>
        {onOpenSaveLocations && (
          <button
            type="button"
            onClick={onOpenSaveLocations}
            className="mt-1 px-3.5 py-1.5 rounded-xl bg-indigo hover:bg-indigo-600 text-white font-bold text-xs shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            Save Locations &amp; Personalize Insights
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-full" role="list" aria-label="Monitored personal locations">
      {items.map(w => {
        const col = AQI_COLOR(w.aqi);
        const icon = w.name === 'Home' ? '🏠' : w.name === 'School' ? '🏫' : '🏢';
        const severityIcon = SEVERITY_ICON(w.aqi);

        return (
          <div
            key={w.name}
            role="button"
            tabIndex={0}
            onClick={() => onSelect && w.lat && w.lon && onSelect(w.lat, w.lon, `${w.name} (${w.location})`)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && onSelect && w.lat && w.lon) {
                e.preventDefault();
                onSelect(w.lat, w.lon, `${w.name} (${w.location})`);
              }
            }}
            aria-label={`Select ${w.name}: AQI ${w.aqi}, status ${w.status}`}
            className={`card p-3 flex items-center justify-between gap-3 transition-all ${
              onSelect ? 'cursor-pointer hover:border-indigo/50 hover:shadow-sm active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-indigo' : ''
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: `${col}18`, color: col }}
                aria-hidden="true"
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
                <div className="text-sm font-black flex items-center gap-1 justify-end" style={{ color: col }}>
                  <span aria-hidden="true" className="text-xs">{severityIcon}</span>
                  <span>{w.aqi}</span>
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
