import React from 'react';

/**
 * "Why is the air bad?" — Intelligence Brief panel.
 * Inspired by s4 "Source ranking & emission drivers" and PRODUCT.md.
 * Clean evidence cards with icons, impact tags, and scientific details.
 */
const TYPE_CONFIG = {
  pollutant:  { icon: '🎯', badge: 'Primary Driver', color: '#5B4BDB', bg: '#5B4BDB14' },
  weather:    { icon: '🌬️', badge: 'Regional Basin', color: '#F28C28', bg: '#F28C2814' },
  fire:       { icon: '🔥', badge: 'Upwind Signals', color: '#E5484D', bg: '#E5484D14' },
  atmosphere: { icon: '🌫️', badge: 'Inversion Cap', color: '#64748b', bg: '#64748b14' },
};

export default function WhyPanel({ reasons = [], dominantPollutant = 'PM2.5' }) {
  return (
    <div className="card p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-extrabold t1">Why is the air bad?</h3>
          <p className="text-[11px] font-semibold t3 mt-0.5">
            Intelligence Brief · {dominantPollutant} Dominant
          </p>
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
          4 Drivers Identified
        </span>
      </div>

      <div className="space-y-2.5 my-1">
        {reasons.map((r, i) => {
          const cfg = TYPE_CONFIG[r.type] || TYPE_CONFIG.atmosphere;
          return (
            <div
              key={i}
              className="p-3 rounded-2xl transition-all hover:bg-[var(--surface-alt)] flex items-start gap-3 border"
              style={{
                borderColor: 'var(--border)',
                borderLeft: `4px solid ${cfg.color}`,
              }}
            >
              <span className="text-xl flex-shrink-0 mt-0.5">{cfg.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black t1">{r.label}</span>
                  <span
                    className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase"
                    style={{ color: cfg.color, background: cfg.bg }}
                  >
                    {cfg.badge}
                  </span>
                </div>
                <p className="text-[11px] font-medium t3 leading-snug mt-1">
                  {r.detail}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 border-t mt-2 flex items-center justify-between text-[10px] font-bold t3" style={{ borderColor: 'var(--border)' }}>
        <span>Confidence: High (Satellite + In-situ cross-validated)</span>
        <span className="text-indigo hover:underline cursor-pointer">View Drift Model →</span>
      </div>
    </div>
  );
}
