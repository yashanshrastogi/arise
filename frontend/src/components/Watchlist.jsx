import React from 'react';
import { getWatchlistAqiColor, getWatchlistSeverityIcon } from '../utils/aqiBands.js';

export { getWatchlistAqiColor, getWatchlistSeverityIcon };

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

const DEFAULT_PRESET_PLACES = [
  {
    name: 'Home Hub',
    location: 'Your primary residence',
    lat: 28.6258,
    lon: 77.1996,
    aqi: 311,
    status: 'Very Poor',
  },
  {
    name: 'Work Hub',
    location: 'Your office or workplace',
    lat: 28.6315,
    lon: 77.2167,
    aqi: 285,
    status: 'Poor',
  },
  {
    name: 'School Hub',
    location: "Your child's school",
    lat: 28.529,
    lon: 77.154,
    aqi: 295,
    status: 'Poor',
  },
];

export default function Watchlist({
  items = [],
  isGuest = true,
  onSelect = null,
  onOpenSaveLocations = null,
  onOpenMap: _onOpenMap = null,
}) {
  const hasSavedItems = items && items.length > 0;

  return (
    <div className="space-y-2 max-w-full" role="list" aria-label="My places">
      {hasSavedItems ? (
        <>
          {/* Subheader for saved places */}
          <div className="flex items-center justify-between px-1 text-xs mb-1">
            <span className="font-extrabold t1">Your Saved Places</span>
            {onOpenSaveLocations && !isGuest && (
              <button
                type="button"
                onClick={onOpenSaveLocations}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Manage places →
              </button>
            )}
          </div>

          {items.map(w => {
            const lowerName = (w.name || '').toLowerCase();
            const icon = lowerName.includes('home')
              ? '🏠'
              : lowerName.includes('school') || lowerName.includes('campus')
              ? '🏫'
              : lowerName.includes('parent')
              ? '🫁'
              : '💼';
            const severityIcon = getWatchlistSeverityIcon(w.aqi);
            const col = getWatchlistAqiColor(w.aqi);

            // Resolve coordinates
            const resolvedLat = w.lat != null ? Number(w.lat) : (KNOWN_COORDS[w.location] ? KNOWN_COORDS[w.location].lat : null);
            const resolvedLon = w.lon != null ? Number(w.lon) : (KNOWN_COORDS[w.location] ? KNOWN_COORDS[w.location].lon : null);

            return (
              <div
                key={w.name}
                role="button"
                tabIndex={0}
                onClick={() => onSelect && resolvedLat != null && resolvedLon != null && onSelect(resolvedLat, resolvedLon, `${w.name} (${w.location})`)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && onSelect && resolvedLat != null && resolvedLon != null) {
                    e.preventDefault();
                    onSelect(resolvedLat, resolvedLon, `${w.name} (${w.location})`);
                  }
                }}
                aria-label={`Select ${w.name}: AQI ${w.aqi != null ? w.aqi : 'Unavailable'}, status ${w.status || 'Unavailable'}`}
                className={`p-2.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                  onSelect ? 'cursor-pointer hover:border-indigo-400/50 hover:bg-[var(--surface-alt)] hover:shadow-xs active:scale-[0.99] touch-target' : ''
                }`}
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: 'var(--border)',
                }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 shadow-2xs"
                    style={{ background: `${col}18`, color: col }}
                    aria-hidden="true"
                  >
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-black t1 leading-tight truncate">
                      {w.name}
                    </div>
                    <div className="text-[11px] font-semibold tm truncate mt-0.5">
                      {w.location}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="text-sm sm:text-base font-black flex items-center gap-1 justify-end tabular-nums" style={{ color: col }}>
                      <span aria-hidden="true" className="text-xs">{severityIcon}</span>
                      <span>{w.aqi != null ? w.aqi : '—'}</span>
                    </div>
                    <span
                      className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight"
                      style={{ background: `${col}18`, color: col }}
                    >
                      {w.status || (w.aqi != null ? 'Good' : 'Unavailable')}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      ) : isGuest ? (
        /* Guest prompt to save places by signing in normally */
        <div
          className="p-4 rounded-2xl border text-center space-y-2.5 my-1"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center text-lg">
            📍
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black t1">Save your places by signing in</div>
            <p className="text-[11px] font-semibold tm mt-0.5 leading-relaxed">
              Sign in to save and monitor live air quality for your Home, Work, and School locations.
            </p>
          </div>
          <button
            type="button"
            id="btn-watchlist-guest-signin"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.hash = '#/login';
            }}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs active:scale-95 transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>Sign In</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        /* Authenticated but no places configured yet */
        <div
          className="p-4 rounded-2xl border text-center space-y-2 my-1"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div className="text-xs sm:text-sm font-black t1">No places saved yet</div>
          <p className="text-[11px] font-semibold tm leading-relaxed">
            Configure your Home, Work, or School in Profile Settings to monitor live air quality here.
          </p>
          {onOpenSaveLocations && (
            <button
              type="button"
              onClick={onOpenSaveLocations}
              className="px-3.5 py-1.5 rounded-xl border text-xs font-bold hover:bg-[var(--surface)] transition-all cursor-pointer"
              style={{ borderColor: 'var(--border)' }}
            >
              Configure Places
            </button>
          )}
        </div>
      )}
    </div>
  );
}

