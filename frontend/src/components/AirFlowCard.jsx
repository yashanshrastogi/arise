import React from 'react';

/**
 * Air Flow Status card — inspired by s2 screenshot middle card.
 * Shows wind speed, circular compass dial with N/S/E/W markers,
 * and atmospheric dispersion status banner.
 */
export default function AirFlowCard({ speed = '3.2', unit = 'km/h', direction = 'NW', degrees = 315 }) {
  const speedNum = parseFloat(speed) || 3.2;
  const speedMs = (speedNum / 3.6).toFixed(1);

  const flowCategory = speedNum < 5.0
    ? { label: 'Calm / Stagnant', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', layer: 'Surface boundary layer < 400m' }
    : speedNum < 12.0
    ? { label: 'Moderate Mixing', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', layer: 'Surface boundary layer ~600m' }
    : { label: 'Active Dispersion', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', layer: 'Ventilated boundary layer > 800m' };

  // Compass dial points
  const points = [
    { deg: 0, label: 'N' },
    { deg: 30, label: '30' },
    { deg: 60, label: '60' },
    { deg: 90, label: 'E' },
    { deg: 120, label: '120' },
    { deg: 150, label: '150' },
    { deg: 180, label: 'S' },
    { deg: 210, label: '210' },
    { deg: 240, label: '240' },
    { deg: 270, label: 'W' },
    { deg: 300, label: '300' },
    { deg: 330, label: '330' },
  ];

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 62;

  return (
    <div className="card p-5 flex flex-col justify-between h-full" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-sm sm:text-base font-black t1">Air Flow Status</h3>
          <p className="text-xs font-semibold tm">Wind &amp; Atmospheric Mixing</p>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${flowCategory.color}`}>
          {flowCategory.label}
        </span>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between my-2 gap-3 sm:gap-4">
        {/* Big wind speed stat */}
        <div className="min-w-0">
          <div className="text-3xl sm:text-4xl font-black t1 leading-none">{speed}</div>
          <div className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">{unit} · {direction}</div>
          <div className="text-xs font-semibold tm mt-2">
            {flowCategory.layer}
          </div>
        </div>

        {/* Circular Compass Dial */}
        <div className="relative flex-shrink-0 mx-auto sm:mx-0 w-32 h-32 sm:w-36 sm:h-36">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
            {/* Outer dial ring */}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="var(--border)"
              strokeWidth="2"
              strokeDasharray="2 4"
            />
            {/* Inner circle */}
            <circle
              cx={cx}
              cy={cy}
              r={36}
              fill="var(--surface-alt)"
              stroke="var(--border)"
              strokeWidth="1.5"
            />

            {/* Compass markers */}
            {points.map(pt => {
              const rad = ((pt.deg - 90) * Math.PI) / 180;
              const isMajor = ['N', 'S', 'E', 'W'].includes(pt.label);
              const tx = isMajor ? cx + r * Math.cos(rad) : cx + (r + 10) * Math.cos(rad);
              const ty = isMajor ? cy + r * Math.sin(rad) : cy + (r + 10) * Math.sin(rad);

              return (
                <g key={pt.deg}>
                  {isMajor ? (
                    <circle
                      cx={tx}
                      cy={ty}
                      r={8}
                      fill={pt.label === 'N' ? '#4F46E5' : 'var(--card)'}
                      stroke={pt.label === 'N' ? '#4F46E5' : 'var(--border)'}
                      strokeWidth="1.5"
                    />
                  ) : null}
                  <text
                    x={tx}
                    y={ty}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isMajor ? 8.5 : 6.5}
                    fontWeight={isMajor ? 800 : 500}
                    fill={isMajor ? (pt.label === 'N' ? '#ffffff' : 'var(--text-primary)') : 'var(--text-muted)'}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}

            {/* Needle line */}
            {(() => {
              const needleRad = ((degrees - 90) * Math.PI) / 180;
              const nx = cx + 32 * Math.cos(needleRad);
              const ny = cy + 32 * Math.sin(needleRad);
              return (
                <line
                  x1={cx}
                  y1={cy}
                  x2={nx}
                  y2={ny}
                  stroke="#4F46E5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              );
            })()}

            {/* Center wind icon & text */}
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="12"
            >
              🌬️
            </text>
            <text
              x={cx}
              y={cy + 10}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="9"
              fontWeight="800"
              fill="var(--text-primary)"
            >
              {speedMs} m/s
            </text>
          </svg>
        </div>
      </div>

      {/* Dispersion Banner */}
      <div
        className="rounded-xl p-3 flex items-center gap-2.5 mt-2"
        style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
      >
        <span className="text-base flex-shrink-0">⚠️</span>
        <p className="text-[11px] font-semibold t2 leading-snug">
          <strong className="text-amber-600 dark:text-amber-400">Calm Air Trap:</strong> Indo-Gangetic basin stagnation is preventing dispersion of fine particulates.
        </p>
      </div>
    </div>
  );
}
