import React from 'react';
import { getAqiBandInfo } from '../utils/aqiBands.js';
import { resolveVerdictWindowStatus } from '../utils/verdictStatus.js';
import { resolveRegionalLocation, isInDelhiNcr } from '../utils/locationState.js';
import InfoTooltip from './InfoTooltip';

export { getAqiBandInfo, resolveVerdictWindowStatus, resolveRegionalLocation };

export default function VerdictHero({
  aqi = 329,
  locationName = 'Global Overview',
  forecast = [],
  recheckAt = '4:00 PM',
  persona = 'General Public',
  isLoading = false,
  onOpenAdvisory = null,
  onOpenMap = null,
  liveDateTime = null,
  city = '',
  district = '',
  region = '',
  lat = null,
  lon = null,
  bestWindowDetails = null,
  locationSource = 'default',
  onDetectLocation = null,
  isDetectingLocation = false,
  detectionMessage = null,
}) {
  const isUnavailable = (aqi === null || aqi === undefined || aqi === '');
  const currentAqi = isUnavailable ? null : Number(aqi);
  const bandInfo = getAqiBandInfo(aqi);

  // Derive dynamic regional district and city per Google Maps / reverse-geocoded metadata
  const regionName = React.useMemo(() => {
    return resolveRegionalLocation({
      district,
      city,
      region,
      locationName,
      lat,
      lon,
    });
  }, [district, city, region, locationName, lat, lon]);

  const displayLocation = React.useMemo(() => {
    if (locationName && locationName !== 'Device Location' && locationName !== 'Selected Area' && !locationName.includes('°')) {
      return locationName;
    }
    if (district && city && district.toLowerCase() !== city.toLowerCase()) {
      return `${district}, ${city}`;
    }
    if (city && !/^(home|work|school|parent|saved location|my location)$/i.test(city)) return city;
    if (district) return district;
    if (lat != null && lon != null && !isInDelhiNcr(lat, lon)) {
      return regionName;
    }
    return regionName || 'National Capital Region';
  }, [locationName, district, city, lat, lon, regionName]);

  // Filter for valid future intervals (current hour and upcoming)
  const futurePoints = (forecast || []).filter(f => !f.past);
  const candidatePoints = futurePoints.length > 0 ? futurePoints : (forecast || []);

  const forecastAqiValues = candidatePoints
    .map(f => Number(f.aqi))
    .filter(v => !isNaN(v) && v > 0);

  const minForecastAqi = forecastAqiValues.length > 0 ? Math.min(...forecastAqiValues) : currentAqi;
  const bestForecastHour = candidatePoints.find(f => Number(f.aqi) === minForecastAqi);

  // Derive human-readable best window label
  const bwTaggedItems = candidatePoints.filter(f => f.bestWindow);
  const modelTaggedItems = candidatePoints.filter(f => f.modelWindow);
  const activeWindowItems = bwTaggedItems.length > 0 ? bwTaggedItems : modelTaggedItems;

  const windowAqi = React.useMemo(() => {
    if (activeWindowItems.length > 0) {
      const aqiVals = activeWindowItems
        .map(f => Number(f.aqi))
        .filter(v => !isNaN(v) && v > 0);
      if (aqiVals.length > 0) return Math.min(...aqiVals);
    }
    if (bestWindowDetails?.avg_aqi) return bestWindowDetails.avg_aqi;
    return minForecastAqi;
  }, [activeWindowItems, bestWindowDetails, minForecastAqi]);

  const bestWindowLabel = activeWindowItems.length > 0
    ? (activeWindowItems.length === 1 ? activeWindowItems[0].time : `${activeWindowItems[0].time} – ${activeWindowItems[activeWindowItems.length - 1].time}`)
    : (bestWindowDetails?.window_str && bestWindowDetails.window_str !== 'No recommended outdoor window'
      ? bestWindowDetails.window_str
      : (bestForecastHour?.time || bestForecastHour?.time_label || bestForecastHour?.hour || 'Upcoming window'));

  // Distinguish the 5 outdoor window statuses
  const windowStatus = React.useMemo(() => {
    return resolveVerdictWindowStatus({
      bestWindowDetails,
      bwTaggedItems,
      modelTaggedItems,
      currentAqi,
      forecastAqiValues,
      candidatePoints,
    });
  }, [bestWindowDetails, bwTaggedItems, modelTaggedItems, currentAqi, forecastAqiValues, candidatePoints]);

  // Person-tailored 3-bullet advice
  const bullets = React.useMemo(() => {
    const recheckTimeText = recheckAt || 'in 3 hours';
    if (persona === 'Children & Schools' || persona === 'School Administration') {
      return [
        'Move sports, recess, and morning assemblies indoors.',
        'Keep windows shut and run classroom air filtration.',
        `Check again at ${recheckTimeText} before afternoon pickup.`,
      ];
    }
    if (persona === 'Elderly & Respiratory') {
      return [
        'Avoid all outdoor walks and strenuous morning activity.',
        'Wear a snug, well-fitted N95 mask if you must step outside.',
        `Keep rescue inhalers close and recheck at ${recheckTimeText}.`,
      ];
    }
    if (persona === 'Outdoor Workers') {
      return [
        'Wear a snug N95 mask throughout outdoor shifts.',
        'Take regular breaks in closed, filtered rest areas.',
        `Stay hydrated and recheck exposure levels at ${recheckTimeText}.`,
      ];
    }
    // General Public default
    return [
      'Keep windows shut to keep fine dust outside.',
      'Wear a snug N95 mask if you must go outdoors.',
      `Check again at ${recheckTimeText}.`,
    ];
  }, [persona, recheckAt]);

  return (
    <div
      className="card p-6 sm:p-8 relative overflow-hidden"
      style={{
        background: 'var(--card)',
        borderLeft: `8px solid ${bandInfo.color}`,
      }}
      role="region"
      aria-label="Current Air Quality Verdict"
    >
      {/* Top Meta Line: Location & Live Status */}
      {detectionMessage && (
        <div
          className={`text-xs font-bold px-3 py-1.5 rounded-xl mb-3 flex items-center justify-between gap-2 border animate-in fade-in duration-200 ${
            detectionMessage.type === 'error'
              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
          }`}
          role="status"
        >
          <div className="flex items-center gap-2">
            <span>{detectionMessage.type === 'error' ? '⚠️' : '✓'}</span>
            <span>{detectionMessage.text}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
              onDetectLocation ? 'cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-[var(--surface-alt)]' : ''
            }`}
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
            }}
            onClick={onDetectLocation ? onDetectLocation : undefined}
            role={onDetectLocation ? 'button' : undefined}
            tabIndex={onDetectLocation ? 0 : undefined}
            onKeyDown={onDetectLocation ? (e) => (e.key === 'Enter' || e.key === ' ') && onDetectLocation() : undefined}
            title={onDetectLocation ? "Click to detect your current location via GPS" : undefined}
          >
            <span className="text-base shrink-0" aria-hidden="true">📍</span>
            <span className="text-sm sm:text-base font-extrabold t1 safe-wrap">{displayLocation}</span>
            {locationSource === 'default' && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                Default Station
              </span>
            )}
            {locationSource === 'device' && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live GPS
              </span>
            )}
          </div>

          {onDetectLocation && (
            <button
              type="button"
              id="btn-detect-location-hero"
              onClick={onDetectLocation}
              disabled={isDetectingLocation}
              className="text-xs font-black px-3 py-1.5 rounded-xl border transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 disabled:opacity-60 cursor-pointer"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
              title="Detect and update to your current live location"
            >
              <span className={isDetectingLocation ? 'animate-spin' : ''} aria-hidden="true">
                {isDetectingLocation ? '⏳' : '🎯'}
              </span>
              <span>{isDetectingLocation ? 'Locating…' : 'Update Location'}</span>
            </button>
          )}

          {onOpenMap && (
            <button
              type="button"
              onClick={onOpenMap}
              className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5 active:scale-95 touch-target shrink-0 cursor-pointer"
              title={`Open ${regionName} interactive map`}
            >
              <span aria-hidden="true">🗺️</span>
              <span>Map view</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {liveDateTime?.dayDate && (
            <span
              className="text-xs font-black px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <span>🗓️</span>
              <span className="hidden sm:inline">{liveDateTime.dayDate}</span>
              <span className="inline sm:hidden">{liveDateTime.shortDayDate || liveDateTime.dayDate}</span>
              <span className="opacity-40">·</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-black">{liveDateTime.liveTime}</span>
            </span>
          )}
          <span
            className="text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <span
              className={`w-2 h-2 rounded-full ${isLoading ? 'bg-indigo-500 animate-ping' : (isUnavailable ? 'bg-slate-400 dark:bg-slate-500' : 'bg-emerald-500 animate-pulse')}`}
              aria-hidden="true"
            />
            <span className={`font-extrabold tracking-wide uppercase text-[11px] ${isLoading ? 'text-indigo-600 dark:text-indigo-400' : (isUnavailable ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-600 dark:text-emerald-400')}`}>
              {isLoading ? 'Updating…' : (isUnavailable ? 'Unavailable' : 'Live')}
            </span>
          </span>
        </div>
      </div>

      {/* Main Verdict Row: Huge AQI & Plain-Language Status */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center my-2">
        {/* Left: Giant AQI Score */}
        <div className="md:col-span-5 flex flex-col items-start justify-center">
          <div className="flex items-baseline gap-2">
            <span
              className="font-black tracking-tight tabular-nums"
              style={{
                fontSize: 'clamp(2.75rem, 6vw, 4.75rem)',
                lineHeight: 1,
                color: bandInfo.color,
              }}
              aria-label={isUnavailable ? 'Air quality score unavailable' : `Air quality score ${currentAqi}`}
              data-testid="hero-aqi-value"
            >
              {isUnavailable ? '—' : currentAqi}
            </span>
            <span className="text-sm font-bold t3 uppercase tracking-wider flex items-center gap-1">
              <span>AQI</span>
              <InfoTooltip
                title="Air Quality Index (AQI)"
                text="Standard 0–500 composite metric tracking key airborne pollutants. Lower numbers represent cleaner, safer air."
                impact="Above 200, wear an N95 mask outdoors and keep windows shut."
              />
            </span>
          </div>

          <div
            className="mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-extrabold"
            style={{ background: bandInfo.bg, color: bandInfo.ink }}
          >
            <span className="text-base font-black" aria-hidden="true">{bandInfo.symbol}</span>
            <span>{bandInfo.label}</span>
          </div>
        </div>

        {/* Right: The Core "Can I go out?" Verdict & Bulleted Actions */}
        <div className="md:col-span-7 flex flex-col justify-center space-y-3">
          <div aria-live="polite" className="min-h-[4.25rem] flex flex-col justify-center">
            <h2 className="text-2xl sm:text-3xl font-black t1 leading-tight">
              {bandInfo.plainAction}
            </h2>
            <p className="text-sm font-medium t2 mt-1">
              {isUnavailable
                ? `Local air quality monitoring is unavailable for ${regionName}.`
                : (currentAqi > 200
                  ? `Tiny fine dust is trapped near the ground across ${regionName}.`
                  : `Air quality permits regular routines today across ${regionName}.`)}
            </p>
          </div>

          {/* 3-Bullet "What To Do" */}
          <ul className="space-y-1.5 pt-1 text-sm font-semibold t1">
            {bullets.map((b, idx) => (
              <li key={idx} className="flex items-start gap-2.5">
                <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0 mt-0.5">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer Banner: Best Window (Truth Fix) & Full Advisory Button */}
      <div
        className="mt-6 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* The Best Window Check */}
        <div className="flex items-center gap-2">
          {windowStatus === 'ground_calibrated' && (
            <div
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl hatched-window-pattern border font-bold shadow-xs transition-colors"
              style={{
                backgroundColor: 'var(--good-bg)',
                borderColor: 'var(--good)',
                color: 'var(--good-ink)',
              }}
            >
              <span className="text-base" aria-hidden="true">🌟</span>
              <span style={{ color: 'var(--good-ink)' }}>
                Best time to go out: <strong className="font-black">{bestWindowLabel}</strong> (AQI {windowAqi})
              </span>
              <InfoTooltip
                title="Best Outdoor Window"
                text="The safest hours today when atmospheric winds help disperse toxic ground particulates."
                impact="Ideal for workouts, groceries, and kids recess."
              />
            </div>
          )}

          {windowStatus === 'model_projected' && (
            <div
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border font-bold shadow-xs tracking-tight transition-colors"
              style={{
                backgroundColor: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            >
              <span className="text-base" aria-hidden="true">🌤️</span>
              <span className="flex items-center gap-1.5 flex-wrap">
                <span>
                  Projected window: <strong className="font-black">{bestWindowLabel}</strong>{' '}
                  <span className="text-xs font-semibold t3">
                    (Model estimate · AQI ~{windowAqi}{bestForecastHour?.rainProb ? ` · Rain ${bestForecastHour.rainProb}%` : ''})
                  </span>
                </span>
                <InfoTooltip
                  title="Projected Outdoor Window"
                  text="Model-forecasted cleanest window today based on wind patterns and solar mixing."
                  impact="Best hours for non-essential outdoor transit."
                />
              </span>
            </div>
          )}

          {windowStatus === 'unsuitable' && (
            <div
              className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border font-black shadow-xs tracking-tight transition-colors"
              style={{
                backgroundColor: 'var(--vpoor-bg)',
                borderColor: 'rgba(180, 35, 24, 0.45)',
              }}
            >
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-black shadow-xs shrink-0"
                style={{ backgroundColor: 'var(--vpoor, #B42318)' }}
                aria-hidden="true"
              >
                ✕
              </span>
              <span
                className="text-xs sm:text-sm font-black"
                style={{ color: 'var(--vpoor-ink)' }}
              >
                No suitable outdoor window today
              </span>
            </div>
          )}

          {windowStatus === 'forecast_unavailable' && (
            <div
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-bold shadow-xs transition-colors"
              style={{
                backgroundColor: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="text-base" aria-hidden="true">⚠️</span>
              <span className="text-xs sm:text-sm font-semibold">
                Outdoor forecast unavailable (insufficient data)
              </span>
            </div>
          )}

          {windowStatus === 'current_unavailable_no_window' && (
            <div
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border font-bold shadow-xs transition-colors"
              style={{
                backgroundColor: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              <span className="text-base" aria-hidden="true">ℹ️</span>
              <span className="text-xs sm:text-sm font-semibold">
                Outdoor window advisory unavailable (no ground monitoring in range)
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onOpenMap && (
            <button
              type="button"
              onClick={onOpenMap}
              className="text-xs font-black text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 touch-target"
            >
              <span>Explore regional map</span>
              <span>🗺️</span>
            </button>
          )}
          {onOpenAdvisory && (
            <button
              type="button"
              onClick={onOpenAdvisory}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 touch-target"
            >
              <span>What should I do? (Full advisory)</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
