import React, { useState, useEffect } from 'react';
import { fetchRoute } from '../api/client';
import { getAqiBandInfo } from '../utils/aqiBands';
import { stripLeadingIcon } from '../utils/advisoryUtils';

/**
 * CommuteRouteCard
 * Displays the commute route summary (distance + duration) between two saved
 * profile locations and offers a "Show on map" action to render the polyline.
 *
 * Props:
 *   originLat, originLon   — float, saved home/origin coordinates
 *   destLat, destLon       — float, saved work/destination coordinates
 *   originLabel            — string, e.g. "Home"
 *   destinationLabel       — string, e.g. "Work"
 *   profile                — 'driving-car' | 'cycling-regular' | 'foot-walking'
 *   onShowOnMap(geometry)  — callback to lift route geometry to parent (AirMap)
 *   onOpenMap              — callback to switch to the Map tab
 */
export default function CommuteRouteCard({
  originLat,
  originLon,
  destLat,
  destLon,
  originLabel = 'Home',
  destinationLabel = 'Work',
  profile = 'driving-car',
  isRouteActive = false,
  onShowOnMap,
  onClearFromMap,
  onOpenMap,
  onConfigureLocations,
}) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeProfile, setActiveProfile] = useState(profile);
  const [isReversed, setIsReversed] = useState(false);

  // Compute effective origin and destination depending on reverse toggle
  const curOriginLat = isReversed ? destLat : originLat;
  const curOriginLon = isReversed ? destLon : originLon;
  const curDestLat = isReversed ? originLat : destLat;
  const curDestLon = isReversed ? originLon : destLon;
  const curOriginLabel = isReversed ? destinationLabel : originLabel;
  const curDestLabel = isReversed ? originLabel : destinationLabel;

  // Coordinate validation guard
  const coordsValid = (
    Number.isFinite(curOriginLat) && Number.isFinite(curOriginLon) &&
    Number.isFinite(curDestLat) && Number.isFinite(curDestLon)
  );

  // Fetch route whenever coordinates, reverse direction, or profile change
  useEffect(() => {
    if (!coordsValid) {
      setRoute(null);
      setError(null);
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setRoute(null);
      try {
        const result = await fetchRoute({
          originLat: curOriginLat,
          originLon: curOriginLon,
          destLat: curDestLat,
          destLon: curDestLon,
          profile: activeProfile,
          originLabel: curOriginLabel,
          destinationLabel: curDestLabel,
        });
        if (!cancelled) {
          if (result && result.geometry && result.geometry.length > 0) {
            setRoute(result);
          } else {
            setError('Route unavailable. OpenRouteService credentials may be missing or the route could not be calculated.');
          }
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Unable to load route.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [curOriginLat, curOriginLon, curDestLat, curDestLon, activeProfile, curOriginLabel, curDestLabel, coordsValid]);

  // If locations are missing, show clear configuration prompt
  if (!coordsValid) {
    return (
      <div className="card p-5 flex flex-col gap-3" style={{ background: 'var(--card)' }}>
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden="true">🛣️</span>
          <div>
            <h3 className="text-sm sm:text-base font-black t1">Commute Intelligence</h3>
            <p className="text-xs font-semibold tm mt-0.5">
              Personalized daily travel route
            </p>
          </div>
        </div>
        <div
          className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
        >
          <div className="flex items-start gap-2.5">
            <span className="text-base mt-0.5" aria-hidden="true">📍</span>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-black t1">Home and Work locations not configured</span>
              <p className="text-xs font-medium tm leading-relaxed">
                Save your home and work coordinates in Profile Settings to calculate your real commute distance, travel time, and route geometry.
              </p>
            </div>
          </div>
          {onConfigureLocations && (
            <button
              type="button"
              id="btn-configure-commute-locations"
              onClick={onConfigureLocations}
              className="shrink-0 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-xs transition-all active:scale-[0.98]"
            >
              Configure locations
            </button>
          )}
        </div>
      </div>
    );
  }

  const PROFILE_OPTIONS = [
    { id: 'driving-car',    icon: '🚗', label: 'Drive'  },
    { id: 'cycling-regular', icon: '🚴', label: 'Cycle'  },
    { id: 'foot-walking',   icon: '🚶', label: 'Walk'   },
  ];

  function formatDuration(mins) {
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div className="card p-5 flex flex-col gap-4" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl" aria-hidden="true">🛣️</span>
          <div>
            <h3 className="text-sm sm:text-base font-black t1">Commute Route</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-semibold tm truncate max-w-[180px]">
                {curOriginLabel} → {curDestLabel}
              </span>
              <button
                type="button"
                id="btn-reverse-commute"
                title={`Reverse commute: switch to ${curDestLabel} → ${curOriginLabel}`}
                onClick={() => {
                  setIsReversed((prev) => !prev);
                  if (isRouteActive && onClearFromMap) {
                    onClearFromMap();
                  }
                }}
                className="px-1.5 py-0.5 rounded border text-[11px] font-black t2 hover:t1 hover:bg-[var(--surface-alt)] transition-all cursor-pointer"
                style={{ borderColor: 'var(--border)' }}
                aria-label={`Reverse commute: switch to ${curDestLabel} → ${curOriginLabel}`}
              >
                ⇄
              </button>
            </div>
          </div>
        </div>
        {/* Profile selector chips */}
        <div className="flex items-center gap-1">
          {PROFILE_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => {
                setActiveProfile(p.id);
                if (isRouteActive && onClearFromMap) {
                  onClearFromMap();
                }
              }}
              className={`px-2 py-1 rounded-lg text-xs font-black border transition-all ${
                activeProfile === p.id
                  ? 'bg-indigo-600 text-white border-transparent shadow-xs'
                  : 'border-[var(--border)] t2 hover:bg-[var(--surface-alt)]'
              }`}
            >
              {p.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 text-xs font-semibold tm py-2">
          <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
          Calculating route…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
          ⚠️ {error}
        </div>
      )}

      {/* Route result */}
      {!loading && route && (
        <>
          {/* Distance chip */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border shadow-2xs"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              📏 {route.distance_km} km
            </span>
          </div>

          {/* Route source attribution */}
          <p className="text-[11px] font-medium tm leading-relaxed">
            Via {route.source} · {activeProfile === 'driving-car' ? 'Fastest driving route' :
              activeProfile === 'cycling-regular' ? 'Recommended cycling route' : 'Walking route'}
          </p>

          {/* Milestone 2: Weather Along the Route Corridor */}
          {route.weather_points && route.weather_points.length > 0 && (
            <div
              className="rounded-xl border p-3.5 flex flex-col gap-3"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              {/* Header with provider attribution */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm" aria-hidden="true">🌤️</span>
                  <span className="text-xs font-black t1">Weather along corridor</span>
                </div>
                <span className="text-[11px] font-semibold tm px-2 py-0.5 rounded-full border"
                  style={{ borderColor: 'var(--border)', background: 'var(--card)' }}>
                  {route.weather_summary?.spatial_resolution || 'Open-Meteo ~2 km grid'}
                </span>
              </div>

              {/* Advisory banner */}
              {route.weather_summary?.advisory && (
                <div
                  className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2 border ${
                    route.weather_summary.has_fog_risk
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                      : route.weather_summary.has_rain_risk
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                      : route.weather_summary.data_provenance === 'degraded'
                      ? 'bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <span className="text-sm leading-none" aria-hidden="true">
                    {route.weather_summary.has_fog_risk ? '🌫️' :
                     route.weather_summary.has_rain_risk ? '🌧️' :
                     route.weather_summary.data_provenance === 'degraded' ? 'ℹ️' : '✅'}
                  </span>
                  <span className="leading-tight">{stripLeadingIcon(route.weather_summary.advisory)}</span>
                </div>
              )}

              {/* Waypoints cards row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {route.weather_points.map((pt, idx) => {
                  const isDegraded = pt.temp_c == null;
                  const hasFog = pt.fog_risk && pt.fog_risk !== 'None';
                  const rainText = pt.precipitation_mm != null && pt.precipitation_mm > 0
                    ? `${pt.precipitation_mm} mm`
                    : pt.rain_probability != null
                    ? `${Math.round(pt.rain_probability)}% rain`
                    : '—';
                  const windText = pt.wind_speed_kmh != null
                    ? `${Math.round(pt.wind_speed_kmh)} km/h ${pt.wind_direction || ''}`
                    : '—';

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border flex flex-col gap-1.5 shadow-2xs"
                      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black t1 truncate max-w-[120px]" title={pt.label}>
                          {pt.label}
                        </span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 tabular-nums">
                          +{Math.round(pt.eta_min)}m
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xl" aria-hidden="true">{pt.icon || '🌤️'}</span>
                        <div>
                          <div className="text-xs font-black t1 tabular-nums">
                            {isDegraded ? '—' : `${Math.round(pt.temp_c)}°C`}
                            {!isDegraded && pt.feels_like_c != null && (
                              <span className="text-[11px] font-normal tm ml-1 tabular-nums">
                                (feels {Math.round(pt.feels_like_c)}°)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-semibold tm truncate max-w-[130px]">
                            {pt.condition}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-medium tm pt-1 border-t tabular-nums" style={{ borderColor: 'var(--border)' }}>
                        <span title="Precipitation / Rain probability">💧 {rainText}</span>
                        <span>·</span>
                        <span title="Wind speed and direction">💨 {windText}</span>
                      </div>

                      {hasFog && (
                        <div className="mt-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                          <span>⚠️</span>
                          <span>{pt.fog_risk}</span>
                          {pt.visibility_km != null && (
                            <span className="font-normal tm tabular-nums">({pt.visibility_km} km vis)</span>
                          )}
                        </div>
                      )}

                      {pt.is_stale && (
                        <span className="text-[11px] font-bold text-amber-500">
                          (Cached / Stale)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Microclimate notice */}
              <p className="text-[11px] font-normal tm leading-tight">
                Weather points represent regional numerical prediction grid cells (~2 km). Road-level microclimates and sudden wind gusts may vary.
              </p>
            </div>
          )}


          {/* Show / Hide on Map action */}
          <div className="flex items-center gap-2">
            {onShowOnMap && (
              <button
                type="button"
                id="btn-show-commute-on-map"
                onClick={() => {
                  onShowOnMap(route.geometry, route.bbox, route.weather_points, route.pollution_points);
                  if (onOpenMap) onOpenMap();
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-xs transition-all active:scale-[0.98]"
              >
                <span aria-hidden="true">🗺️</span>
                <span>{isRouteActive ? 'View on map' : 'Show route on map'}</span>
              </button>
            )}
            {isRouteActive && onClearFromMap && (
              <button
                type="button"
                id="btn-hide-commute-from-map"
                onClick={onClearFromMap}
                className="px-3.5 py-2.5 rounded-xl border text-xs font-black t2 hover:t1 hover:bg-[var(--surface-alt)] transition-all"
                style={{ borderColor: 'var(--border)' }}
                title="Hide route from map"
              >
                Hide
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
