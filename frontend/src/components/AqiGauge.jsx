import React from 'react';

/**
 * AQI Gauge — inspired by s1 and s3 screenshots.
 * Semicircle rainbow arc with glowing needle, bold AQI value,
 * status badge with emoji, and verdict details.
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
  size = 240
}) {
  const cx = size / 2;
  const cy = size / 2 + 10;
  const r = size / 2 - 24;
  const strokeWidth = 14;

  // Arc angles (180deg to 360deg / Math.PI to 2*Math.PI)
  const startAngle = Math.PI;
  const totalAngle = Math.PI;

  // Clamped AQI 0 to 500
  const clampedAqi = Math.min(500, Math.max(0, aqi));
  const progressRatio = clampedAqi / 500;
  const currentAngle = startAngle + progressRatio * totalAngle;

  // Semicircle arc path (180 to 360)
  const x1 = cx - r;
  const y1 = cy;
  const x2 = cx + r;
  const y2 = cy;
  const arcD = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;

  // Needle indicator position
  const nx = cx + r * Math.cos(currentAngle);
  const ny = cy + r * Math.sin(currentAngle);

  // Status color
  const statusColor =
    clampedAqi > 400 ? '#8B1E3F' :
    clampedAqi > 300 ? '#E5484D' :
    clampedAqi > 200 ? '#F28C28' :
    clampedAqi > 100 ? '#F5C542' :
    clampedAqi > 50  ? '#9BD34A' : '#2EB872';

  const emoji =
    clampedAqi > 300 ? '🚨' :
    clampedAqi > 200 ? '⚠️' :
    clampedAqi > 100 ? '😷' :
    clampedAqi > 50  ? '🙂' : '😍';

  return (
    <div className="card p-6 flex flex-col items-center justify-between h-full text-center">
      {/* Location Header — matching s1 */}
      <div className="mb-2">
        <h2 className="text-xl font-extrabold t1 tracking-tight">{location}</h2>
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold t3 mt-0.5">
          <span>🇮🇳</span>
          <span>{country} · Monitored via CPCB</span>
        </div>
      </div>

      {/* Semicircle Rainbow Gauge */}
      <div className="relative flex-shrink-0 my-3" style={{ width: size, height: size * 0.58 }}>
        <svg viewBox={`0 0 ${size} ${size * 0.68}`} className="w-full h-full overflow-visible">
          <defs>
            {/* Rainbow gradient arc matching CPCB / s1 */}
            <linearGradient id="aqiRainbow" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2EB872" />     {/* Good */}
              <stop offset="20%" stopColor="#9BD34A" />    {/* Satisfactory */}
              <stop offset="40%" stopColor="#F5C542" />    {/* Moderate */}
              <stop offset="60%" stopColor="#F28C28" />    {/* Poor */}
              <stop offset="80%" stopColor="#E5484D" />    {/* Very Poor */}
              <stop offset="100%" stopColor="#8B1E3F" />   {/* Severe */}
            </linearGradient>
            {/* Glow filter */}
            <filter id="needleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={statusColor} floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Background track */}
          <path
            d={arcD}
            fill="none"
            stroke="var(--border)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity="0.35"
          />

          {/* Rainbow colored arc */}
          <path
            d={arcD}
            fill="none"
            stroke="url(#aqiRainbow)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Indicator Dot on the arc (exact like s1/s3) */}
          <circle
            cx={nx}
            cy={ny}
            r={8}
            fill="#ffffff"
            stroke={statusColor}
            strokeWidth="3.5"
            filter="url(#needleGlow)"
          />
        </svg>

        {/* Centered AQI Value and Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1 pointer-events-none">
          <span className="text-5xl font-extrabold t1 tracking-tighter leading-none">{aqi}</span>
          <span className="text-xs font-extrabold t3 uppercase tracking-widest mt-1">AQI</span>
        </div>
      </div>

      {/* Status Badge with Emoji — exact match to s1/s3 "😍 Very Good" / "🚨 Very Poor" */}
      <div className="my-1">
        <span
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-extrabold shadow-sm"
          style={{
            color: statusColor,
            background: statusColor + '18',
            border: `1.5px solid ${statusColor}40`
          }}
        >
          <span>{emoji}</span>
          <span>{status}</span>
        </span>
      </div>

      {/* Verdict & Recommendation Banner (High Impact) */}
      <div
        className="w-full mt-4 p-4 rounded-2xl text-left"
        style={{
          background: clampedAqi > 300 ? 'linear-gradient(135deg, #DC26260e, #8B1E3F15)' : 'var(--surface-alt)',
          border: `1.5px solid ${clampedAqi > 300 ? '#DC262640' : 'var(--border)'}`
        }}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md text-white"
            style={{ background: statusColor }}
          >
            {verdict}
          </span>
          <span className="text-[11px] font-bold t3">Recheck at {recheckAt}</span>
        </div>
        <p className="text-xs font-semibold t1 leading-snug mt-2">
          {recommendation}
        </p>
        <div className="flex items-center justify-between text-[11px] font-bold mt-3 pt-2.5 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="t3">Best Outdoor Window:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded bg-emerald-500/10">
            {bestWindow}
          </span>
        </div>
      </div>
    </div>
  );
}
