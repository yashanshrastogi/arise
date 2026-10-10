import React from 'react';

/**
 * Mobility / Commute & Smog Impact Card
 * Displays arterial NCR corridors, smog visibility impact, travel delays,
 * and air-informed commute recommendations.
 * Explicitly labeled as Simulated/Demo Data for Phase 1.
 */
export default function MobilityCard({ traffic }) {
  if (!traffic || !traffic.corridors) return null;

  return (
    <div className="card p-5 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🚗</span>
          <div>
            <h3 className="text-sm font-black t1">Mobility &amp; Smog Corridors</h3>
            <p className="text-[10px] font-bold tm">Transit Delay &amp; Road Visibility</p>
          </div>
        </div>
        <span
          className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full"
          style={{ background: 'var(--surface-alt)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
        >
          Simulated (demo data)
        </span>
      </div>

      {/* Corridor Cards List */}
      <div className="space-y-2.5 my-1">
        {traffic.corridors.map(c => {
          const isHeavy = c.status === 'Heavy';
          const isMod = c.status === 'Moderate';
          const badgeColor = isHeavy ? '#E5484D' : isMod ? '#F28C28' : '#2EB872';

          return (
            <div
              key={c.id}
              className="p-3 rounded-2xl border transition-all hover:bg-[var(--surface-alt)]"
              style={{
                borderColor: 'var(--border)',
                borderLeft: `4px solid ${badgeColor}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black t1 leading-tight">{c.name}</span>
                <span
                  className="text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase"
                  style={{ background: `${badgeColor}18`, color: badgeColor }}
                >
                  {c.status} ({c.delay})
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] font-bold t3 mt-1.5">
                <span>Visibility: <strong className="t1">{c.visibility}</strong></span>
                <span>Travel Time: <strong className="t1">{c.currentTime}</strong> (typ. {c.normalTime})</span>
              </div>

              <p className="text-[10px] font-semibold text-indigo mt-1 leading-tight">
                💡 {c.recommendation}
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer Advisory */}
      <div className="pt-2 mt-2 border-t flex items-center justify-between text-[10px] font-bold tm" style={{ borderColor: 'var(--border)' }}>
        <span>Smog Advisory: Keep vehicle ventilation on recirculation</span>
        <span className="text-indigo hover:underline cursor-pointer">Corridor Details →</span>
      </div>
    </div>
  );
}
