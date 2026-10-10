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
}) {
  const currentAqi = Number(aqi) || 0;
  const bandInfo = getAqiBandInfo(currentAqi);

  // 15% better rule or better band check
  const forecastAqiValues = (forecast || [])
    .map(f => Number(f.aqi))
    .filter(v => !isNaN(v) && v > 0);

  const minForecastAqi = forecastAqiValues.length > 0 ? Math.min(...forecastAqiValues) : currentAqi;
  const bestForecastHour = (forecast || []).find(f => Number(f.aqi) === minForecastAqi);
  const minBandInfo = getAqiBandInfo(minForecastAqi);

  // Condition: >= 15% improvement OR moves into a strictly better band
  const percentImprovement = currentAqi > 0 ? (currentAqi - minForecastAqi) / currentAqi : 0;
  const isBetterBand = minBandInfo.band !== bandInfo.band && minForecastAqi < currentAqi;
  const hasRealBestWindow = percentImprovement >= 0.15 || isBetterBand;

  // Person-tailored 3-bullet advice
  const bullets = React.useMemo(() => {
    if (persona === 'Children & Schools' || persona === 'School Administration') {
      return [
        'Move sports, recess, and morning assemblies indoors.',
        'Keep windows shut and run classroom air filtration.',
        `Check again at ${recheckAt || '4:00 PM'} before afternoon pickup.`,
      ];
    }
    if (persona === 'Elderly & Respiratory') {
      return [
        'Avoid all outdoor walks and strenuous morning activity.',
        'Wear a snug, well-fitted N95 mask if you must step outside.',
        `Keep rescue inhalers close and recheck at ${recheckAt || '4:00 PM'}.`,
      ];
    }
    if (persona === 'Outdoor Workers') {
      return [
        'Wear a snug N95 mask throughout outdoor shifts.',
        'Take regular breaks in closed, filtered rest areas.',
        `Stay hydrated and recheck exposure levels at ${recheckAt || '4:00 PM'}.`,
      ];
    }
    // General Public default
    return [
      'Keep windows shut to keep fine dust outside.',
      'Wear a snug N95 mask if you must go outdoors.',
      `Check again at ${recheckAt || '4:00 PM'}.`,
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl" aria-hidden="true">📍</span>
          <span className="text-base font-extrabold t1">{locationName}</span>
          {onOpenMap && (
            <button
              type="button"
              onClick={onOpenMap}
              className="text-[11px] font-black px-2.5 py-0.5 rounded-lg border bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors flex items-center gap-1 shadow-2xs"
              style={{ borderColor: 'var(--border)' }}
              title="Open Delhi-NCR interactive map"
            >
              <span>🗺️</span>
              <span>Map view</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLoading && (
            <span
              className="text-[11px] font-black px-2.5 py-0.5 rounded-full border border-indigo-400/40 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 animate-pulse flex items-center gap-1.5"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
              <span>Fetching telemetry…</span>
            </span>
          )}
          <span
            className="text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5"
            style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            <span>Updated 10 minutes ago</span>
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
                fontSize: 'clamp(3.5rem, 7vw, 5rem)',
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
                ? 'Tiny fine dust is trapped near the ground across Delhi-NCR.'
                : 'Air quality permits regular routines today.'}
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl hatched-window-pattern border border-emerald-500/40 text-emerald-800 dark:text-emerald-300 font-bold">
              <span>🌟</span>
              <span>
                Best time to go out: <strong>{bestForecastHour?.hour || '4 AM - 6 AM'}</strong> (AQI {minForecastAqi})
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-rose-100 text-rose-950 border border-rose-300 font-extrabold shadow-2xs dark:bg-rose-950/50 dark:text-rose-100 dark:border-rose-800">
              <span className="text-rose-700 dark:text-rose-400">✕</span>
              <span>No safe time to go out today.</span>
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
