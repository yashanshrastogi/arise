import React from 'react';

/**
 * Band mapping with WCAG-compliant colors, word labels, and distinct symbols.
 * Never relies on color alone.
 */
export function getAqiBandInfo(aqi) {
  const val = Number(aqi) || 0;
  if (val > 400) {
    return {
      band: 'Severe',
      label: 'Severe air emergency',
      symbol: '⚠️',
      color: 'var(--sev)',
      bg: 'var(--sev-bg)',
      ink: 'var(--sev-ink)',
      iconClass: 'alert-triangle',
      plainAction: 'Stay indoors today',
    };
  }
  if (val > 300) {
    return {
      band: 'Very Bad',
      label: 'Very bad air',
      symbol: '■',
      color: 'var(--vpoor)',
      bg: 'var(--vpoor-bg)',
      ink: 'var(--vpoor-ink)',
      iconClass: 'square',
      plainAction: 'Stay indoors today',
    };
  }
  if (val > 200) {
    return {
      band: 'Poor',
      label: 'Poor air',
      symbol: '▲',
      color: 'var(--poor)',
      bg: 'var(--poor-bg)',
      ink: 'var(--poor-ink)',
      iconClass: 'triangle',
      plainAction: 'Limit outdoor exertion',
    };
  }
  if (val > 100) {
    return {
      band: 'Moderate',
      label: 'Moderate air',
      symbol: '●',
      color: 'var(--mod)',
      bg: 'var(--mod-bg)',
      ink: 'var(--mod-ink)',
      iconClass: 'circle',
      plainAction: 'Sensitive groups take care',
    };
  }
  if (val > 50) {
    return {
      band: 'Satisfactory',
      label: 'Satisfactory air',
      symbol: '●',
      color: 'var(--sat)',
      bg: 'var(--sat-bg)',
      ink: 'var(--sat-ink)',
      iconClass: 'circle-small',
      plainAction: 'Normal outdoor activity permitted',
    };
  }
  return {
    band: 'Good',
    label: 'Good air',
    symbol: '✓',
    color: 'var(--good)',
    bg: 'var(--good-bg)',
    ink: 'var(--good-ink)',
    iconClass: 'check',
    plainAction: 'Great time to be outside',
  };
}

export default function VerdictHero({
  aqi = 329,
  locationName = 'Mandir Marg, New Delhi',
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
}) {
  const currentAqi = Number(aqi) || 0;
  const bandInfo = getAqiBandInfo(currentAqi);

  // Derive dynamic region and display location per Google Maps / reverse-geocoded metadata
  const regionName = React.useMemo(() => {
    if (region && region.trim() && region !== 'Device Location' && region !== 'Selected Area') {
      return region.trim();
    }
    if (district && city && district.toLowerCase() !== city.toLowerCase()) {
      return `${district}, ${city}`;
    }
    if (city) return city;
    if (district) return district;
    if (locationName && !locationName.includes('°') && locationName !== 'Device Location' && locationName !== 'Selected Area') {
      return locationName;
    }
    return 'Delhi-NCR';
  }, [region, district, city, locationName]);

  const displayLocation = React.useMemo(() => {
    if (locationName && locationName !== 'Device Location' && locationName !== 'Selected Area' && !locationName.includes('°')) {
      return locationName;
    }
    if (district && city && district.toLowerCase() !== city.toLowerCase()) {
      return `${district}, ${city}`;
    }
    if (city) return city;
    if (district) return district;
    if (locationName) return locationName;
    return 'Delhi-NCR';
  }, [locationName, district, city]);

  // Filter for valid future intervals (current hour and upcoming)
  const futurePoints = (forecast || []).filter(f => !f.past);
  const candidatePoints = futurePoints.length > 0 ? futurePoints : (forecast || []);

  const forecastAqiValues = candidatePoints
    .map(f => Number(f.aqi))
    .filter(v => !isNaN(v) && v > 0);

  const minForecastAqi = forecastAqiValues.length > 0 ? Math.min(...forecastAqiValues) : currentAqi;
  const bestForecastHour = candidatePoints.find(f => Number(f.aqi) === minForecastAqi);
  const minBandInfo = getAqiBandInfo(minForecastAqi);

  // Condition: >= 15% improvement OR moves into a strictly better band
  const percentImprovement = currentAqi > 0 ? (currentAqi - minForecastAqi) / currentAqi : 0;
  const isBetterBand = minBandInfo.band !== bandInfo.band && minForecastAqi < currentAqi;
  const hasRealBestWindow = (percentImprovement >= 0.15 || isBetterBand) && minForecastAqi < currentAqi;

  // Derive human-readable best window label
  const bwTaggedItems = candidatePoints.filter(f => f.bestWindow);
  const bestWindowLabel = bwTaggedItems.length > 0
    ? (bwTaggedItems.length === 1 ? bwTaggedItems[0].time : `${bwTaggedItems[0].time} – ${bwTaggedItems[bwTaggedItems.length - 1].time}`)
    : (bestForecastHour?.time || bestForecastHour?.time_label || bestForecastHour?.hour || 'Upcoming window');

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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-xl shrink-0" aria-hidden="true">📍</span>
          <span className="text-sm sm:text-base font-extrabold t1 safe-wrap">{displayLocation}</span>
          {onOpenMap && (
            <button
              type="button"
              onClick={onOpenMap}
              className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-all flex items-center gap-1.5 active:scale-95 touch-target shrink-0"
              title={`Open ${regionName} interactive map`}
            >
              <span aria-hidden="true">🗺️</span>
              <span>Map view</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isLoading && (
            <span
              className="text-[11px] font-black px-2.5 py-0.5 rounded-full border border-indigo-400/40 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 animate-pulse flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
              <span>Fetching telemetry…</span>
            </span>
          )}
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
              <span>{liveDateTime.dayDate}</span>
              <span className="opacity-40">·</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-black">{liveDateTime.liveTime}</span>
            </span>
          )}
          <span
            className="text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 shadow-2xs"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span className="font-extrabold tracking-wide uppercase text-[11px] text-emerald-600 dark:text-emerald-400">Live</span>
          </span>
        </div>
      </div>

      {/* Main Verdict Row: Huge AQI & Plain-Language Status */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center my-2">
        {/* Left: Giant AQI Score */}
        <div className="md:col-span-5 flex flex-col items-start justify-center">
          <div className="flex items-baseline gap-2">
            <span
              className="font-black tracking-tight"
              style={{
                fontSize: 'clamp(2.75rem, 6vw, 4.75rem)',
                lineHeight: 1,
                color: bandInfo.color,
              }}
              aria-label={`Air quality score ${currentAqi}`}
            >
              {currentAqi}
            </span>
            <span className="text-sm font-bold t3 uppercase tracking-wider">AQI</span>
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
          <div aria-live="polite">
            <h2 className="text-2xl sm:text-3xl font-black t1 leading-tight">
              {bandInfo.plainAction}
            </h2>
            <p className="text-sm font-medium t2 mt-1">
              {currentAqi > 200
                ? `Tiny fine dust is trapped near the ground across ${regionName}.`
                : `Air quality permits regular routines today across ${regionName}.`}
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
          {hasRealBestWindow ? (
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
                Best time to go out: <strong className="font-black">{bestWindowLabel}</strong> (AQI {minForecastAqi})
              </span>
            </div>
          ) : (
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
                No safe outdoor window today
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
