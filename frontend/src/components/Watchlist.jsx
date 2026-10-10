import React from 'react';

const AQI_COLOR = aqi =>
  aqi > 400 ? '#7A1B3D' :
  aqi > 300 ? '#B42318' :
  aqi > 200 ? '#B54708' :
  aqi > 100 ? '#FDB022' :
  aqi > 50  ? '#4D7C0F' : '#067647';

const SEVERITY_ICON = aqi =>
  aqi > 400 ? '⚠️' :
  aqi > 300 ? '■' :
  aqi > 200 ? '▲' :
  aqi > 100 ? '●' :
  aqi > 50  ? '●' : '✓';

const KNOWN_COORDS = {
  'Saket': { lat: 28.524, lon: 77.206 },
  'Vasant Kunj': { lat: 28.529, lon: 77.154 },
  'Connaught Pl.': { lat: 28.631, lon: 77.219 },
  'Anand Vihar': { lat: 28.647, lon: 77.316 },
  'ITO': { lat: 28.629, lon: 77.241 },
  'Rohini': { lat: 28.749, lon: 77.067 },
  'Noida': { lat: 28.572, lon: 77.355 },
  'Gurugram': { lat: 28.459, lon: 77.026 },
};

export default function Watchlist({
  items = [],
  isGuest = true,
  onSelect = null,
  onOpenSaveLocations = null,
  onOpenMap = null,
}) {
  if (!items || items.length === 0) {
    return (
      <div
        className="p-4 rounded-2xl border text-center flex flex-col items-center justify-center gap-2.5"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center text-xl">
          📍
        </div>
        <div>
          <h4 className="text-xs font-black t1">No Saved Places Yet</h4>
          <p className="text-[11px] font-medium t3 max-w-xs mt-1 leading-relaxed">
            Save your Home and Work locations to personalize environmental alerts.
          </p>
        </div>
        {onOpenSaveLocations && (
          <button
            type="button"
            onClick={onOpenSaveLocations}
            className="mt-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition-all touch-target"
          >
            Save my places
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-w-full" role="list" aria-label={isGuest ? "Sample places" : "My places"}>
      {/* Subheader clarifying sample vs saved places */}
      <div className="flex items-center justify-between px-1 text-xs">
        <span className="font-bold t3">
          {isGuest ? 'Sample places (sign in to save yours)' : 'Your saved places'}
        </span>
        {isGuest && onOpenSaveLocations && (
          <button
            type="button"
            onClick={onOpenSaveLocations}
            className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Save my places →
          </button>
        )}
      </div>

      {items.map(w => {
        const col = AQI_COLOR(w.aqi);
        const icon = w.name === 'Home' ? '🏠' : w.name === 'School' ? '🏫' : '🏢';
        const severityIcon = SEVERITY_ICON(w.aqi);

        // Resolve coordinates
        const resolvedLat = w.lat || (KNOWN_COORDS[w.location] ? KNOWN_COORDS[w.location].lat : 28.6139);
        const resolvedLon = w.lon || (KNOWN_COORDS[w.location] ? KNOWN_COORDS[w.location].lon : 77.2090);

        return (
          <div
            key={w.name}
            role="button"
            tabIndex={0}
            onClick={() => onSelect && onSelect(resolvedLat, resolvedLon, `${w.name} (${w.location})`)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && onSelect) {
                e.preventDefault();
                onSelect(resolvedLat, resolvedLon, `${w.name} (${w.location})`);
              }
            }}
            aria-label={`Select ${w.name}: AQI ${w.aqi}, status ${w.status}`}
            className={`card p-3 flex items-center justify-between gap-3 transition-all ${
              onSelect ? 'cursor-pointer hover:border-indigo-400/50 hover:shadow-xs active:scale-[0.99] touch-target' : ''
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
                  <span>{isGuest ? 'Sample' : (w.updated || 'Saved')}</span>
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
