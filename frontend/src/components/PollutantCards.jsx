import React from 'react';

/**
 * Pollutant mini-cards — Age-friendly design with plain English explanations
 * so users aged 12 to 80 easily understand particulate types.
 */
const STATUS_CONFIG = {
  Good:         { color: '#2EB872', bg: '#2EB87214' },
  Satisfactory: { color: '#9BD34A', bg: '#9BD34A14' },
  Moderate:     { color: '#F5C542', bg: '#F5C54214' },
  Poor:         { color: '#F28C28', bg: '#F28C2814' },
  'Very Poor':  { color: '#E5484D', bg: '#E5484D14' },
  Severe:       { color: '#8B1E3F', bg: '#8B1E3F14' },
};

function MiniRing({ pct, color, size = 32 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export default function PollutantCards({ pollutants }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {pollutants.map(p => {
        const conf = STATUS_CONFIG[p.status] || { color: '#6b7280', bg: '#6b728014' };
        return (
          <div
            key={p.name}
            className={`card p-3.5 flex flex-col justify-between transition-all hover:scale-[1.02] ${
              p.dominant ? 'ring-2 ring-rose-500/50 shadow-md' : ''
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-black t1 flex items-center gap-1">
                  <span>{p.name}</span>
                  {p.dominant && (
                    <span
                      className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full uppercase"
                      style={{ background: '#E5484D', color: '#ffffff' }}
                    >
                      Dom
                    </span>
                  )}
                </span>
                <MiniRing pct={p.pct} color={conf.color} size={28} />
              </div>

              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black t1 leading-tight">
                  {p.value !== undefined && p.value !== null ? p.value : 'Unavailable'}
                </span>
                {p.value !== undefined && p.value !== null && <span className="text-[10px] font-bold tm">{p.unit}</span>}
              </div>

              <div className="mt-1">
                <span
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full"
                  style={{ color: conf.color, background: conf.bg }}
                >
                  {p.status}
                </span>
              </div>
            </div>

            {/* Plain English explanation for broad age accessibility */}
            {p.desc && (
              <p className="text-[10px] font-medium tm mt-2 pt-2 border-t leading-tight line-clamp-2" style={{ borderColor: 'var(--border)' }}>
                {p.desc}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
