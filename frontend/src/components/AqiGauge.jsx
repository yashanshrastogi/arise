import React from 'react';

/**
 * AQI Gauge — Semicircle arc with needle and plain-language verdict details.
 */
export default function AqiGauge({
  aqi = 312,
  status = 'Very Poor',
  location = 'Delhi-NCR',
  country = 'India',
  verdict = 'STAY IN',
  recommendation = 'Outdoor exposure should be minimized today. Keep windows closed and run purifiers if available.',
  bestWindow = '3 PM – 5 PM',
  recheckAt = '4:00 PM',
  hasSafeWindow = false,
  size = 240
}) {
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = size / 2 - 24;
  const strokeWidth = 14;

  const startAngle = Math.PI;
  const totalAngle = Math.PI;

  const clampedAqi = Math.min(500, Math.max(0, aqi));
  const progressRatio = clampedAqi / 500;
  const currentAngle = startAngle + progressRatio * totalAngle;

  const x1 = cx - r;
  const y1 = cy;
  const x2 = cx + r;
  const y2 = cy;
  const arcD = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;

  const nx = cx + r * Math.cos(currentAngle);
  const ny = cy + r * Math.sin(currentAngle);

  const statusColor =
    clampedAqi > 400 ? 'var(--sev)' :
    clampedAqi > 300 ? 'var(--vpoor)' :
    clampedAqi > 200 ? 'var(--poor)' :
    clampedAqi > 100 ? 'var(--mod)' :
    clampedAqi > 50  ? 'var(--sat)' : 'var(--good)';

  const emoji =
    clampedAqi > 400 ? '⚠️' :
    clampedAqi > 300 ? '■' :
    clampedAqi > 200 ? '▲' :
    clampedAqi > 100 ? '●' :
    clampedAqi > 50  ? '●' : '✓';

  return (
    <div className="card p-6 flex flex-col items-center justify-between h-full text-center" style={{ background: 'var(--card)' }}>
      {/* Header — Banish 'Live Telemetry (AQI 329)' chip */}
      <div className="w-full flex items-center justify-between mb-2">
        <div className="text-left">
          <div className="text-xs font-black t1 flex items-center gap-1">
            <span>📍</span>
            <span>{location}</span>
          </div>
          <div className="text-[10px] font-bold tm">{country}</div>
        </div>
        <span
          className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 shadow-2xs"
          style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          <span className="font-extrabold tracking-wide uppercase text-[10px] text-emerald-600 dark:text-emerald-400">Live</span>
        </span>
      </div>

      {/* Semicircle Gauge SVG */}
      <div className="relative my-2" style={{ width: size, height: size / 2 + 30 }}>
        <svg width={size} height={size / 2 + 30} className="overflow-visible">
          <defs>
            <linearGradient id="aqiGaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#067647" />
              <stop offset="20%" stopColor="#4D7C0F" />
              <stop offset="40%" stopColor="#FDB022" />
              <stop offset="60%" stopColor="#B54708" />
              <stop offset="80%" stopColor="#B42318" />
              <stop offset="100%" stopColor="#7A1B3D" />
            </linearGradient>
            <filter id="gaugeGlow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Colorful arc */}
          <path
            d={arcD}
            fill="none"
            stroke="url(#aqiGaugeGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Needle indicator */}
          <circle
            cx={nx}
            cy={ny}
            r={strokeWidth / 2 + 3}
            fill="#ffffff"
            stroke={statusColor}
            strokeWidth="3.5"
            filter="url(#gaugeGlow)"
          />
        </svg>

        {/* Center AQI reading */}
        <div
          className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none"
          style={{ top: cy - 40 }}
        >
          <span
            className="text-4xl lg:text-5xl font-black tracking-tight"
            style={{ color: statusColor, lineHeight: 1 }}
          >
            {clampedAqi}
          </span>
          <span className="text-[10px] font-black t3 uppercase tracking-widest mt-1">
            AQI
          </span>
        </div>
      </div>

      {/* Status Badge */}
      <div className="my-1">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider"
          style={{
            color: statusColor,
            background: 'var(--surface-alt)',
            border: `1.5px solid ${statusColor}40`
          }}
        >
          <span>{emoji}</span>
          <span>{status}</span>
        </span>
      </div>

      {/* Verdict & Recommendation Banner */}
      <div
        className="w-full mt-4 p-4 rounded-2xl text-left border"
        style={{
          background: 'var(--surface-alt)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md text-white"
            style={{ background: statusColor }}
          >
            {verdict}
          </span>
          <span className="text-[11px] font-bold t3">Check again at {recheckAt}</span>
        </div>
        <p className="text-xs font-semibold t1 leading-snug mt-2">
          {recommendation}
        </p>
        <div className="flex items-center justify-between text-xs font-bold mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="t3">Best time to go out:</span>
          {hasSafeWindow ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded bg-emerald-500/10">
              {bestWindow}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400 font-bold">
              No safe time to go out today.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
