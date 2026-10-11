import React, { useState } from 'react';

/**
 * Mobility / Commute & Smog Impact Card
 * Displays arterial NCR corridors, smog visibility impact, travel delays,
 * and air-informed commute recommendations with an interactive detailed view.
 */
export default function MobilityCard({ traffic, corridors, onOpenMap }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const corridorList = corridors || traffic?.corridors;
  if (!corridorList || corridorList.length === 0) return null;

  return (
    <>
      <div className="card p-5 h-full flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">🚗</span>
            <div>
              <h3 className="text-sm sm:text-base font-black t1">Mobility &amp; Smog Corridors</h3>
              <p className="text-xs font-bold tm">Transit Delay &amp; Road Visibility</p>
            </div>
          </div>
          <span
            className="text-[10px] sm:text-xs font-black uppercase px-2.5 py-1 rounded-full shadow-2xs"
            style={{ background: 'var(--surface-alt)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
          >
            Live Arterial Smog Watch
          </span>
        </div>

        {/* Corridor Cards List */}
        <div className="space-y-3 my-1">
          {corridorList.map(c => {
            const isHeavy = c.status?.includes('Heavy');
            const isMod = c.status?.includes('Moderate') || c.status?.includes('Delay');
            const badgeColor = isHeavy ? '#E5484D' : isMod ? '#F28C28' : '#2EB872';

            return (
              <div
                key={c.id}
                className="p-3.5 rounded-2xl border transition-all hover:bg-[var(--surface-alt)]"
                style={{
                  borderColor: 'var(--border)',
                  borderLeft: `5px solid ${badgeColor}`,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-black t1 leading-tight">{c.name}</span>
                  <span
                    className="text-[10px] sm:text-xs font-black px-2.5 py-0.5 rounded-full uppercase"
                    style={{ background: `${badgeColor}18`, color: badgeColor }}
                  >
                    {c.status} ({c.delay})
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs sm:text-[13px] font-bold t3 mt-2">
                  <span>Visibility: <strong className="t1">{c.visibility}</strong></span>
                  <span>Travel Time: <strong className="t1">{c.currentTime}</strong> (typ. {c.normalTime})</span>
                </div>

                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mt-1.5 leading-snug">
                  💡 {c.recommendation}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer Advisory with Interactive Corridor Details Action */}
        <div className="pt-3 mt-2 border-t flex items-center justify-between text-xs font-semibold tm" style={{ borderColor: 'var(--border)' }}>
          <span>Smog Advisory: Keep vehicle ventilation on recirculation</span>
          <button
            type="button"
            id="btn-corridor-details"
            onClick={() => setDetailsOpen(true)}
            className="text-indigo-600 dark:text-indigo-400 font-black hover:underline cursor-pointer flex items-center gap-1 transition-colors"
          >
            <span>Corridor Details</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* ── INTERACTIVE CORRIDOR DETAILS MODAL ── */}
      {detailsOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-black/60 dark:bg-black/75 transition-all animate-fadeIn"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl p-6 sm:p-7 shadow-2xl border relative flex flex-col max-h-[90vh]"
            style={{
              background: 'var(--card)',
              borderColor: 'var(--border)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🚗</span>
                  <h3 className="text-lg font-black t1">Arterial Corridor Smog &amp; Mobility</h3>
                </div>
                <p className="text-xs font-medium tm mt-1">
                  Live vehicular delays, localized smog hotspots, and air-safe commute guidance for major Delhi-NCR arteries.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors border"
                style={{ borderColor: 'var(--border)' }}
                aria-label="Close details"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Corridors List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {corridorList.map(c => {
                const isHeavy = c.status?.includes('Heavy');
                const isMod = c.status?.includes('Moderate') || c.status?.includes('Delay');
                const badgeColor = isHeavy ? '#E5484D' : isMod ? '#F28C28' : '#2EB872';

                return (
                  <div
                    key={c.id}
                    className="p-4 rounded-2xl border space-y-3"
                    style={{
                      background: 'var(--surface-alt)',
                      borderColor: 'var(--border)',
                      borderLeft: `5px solid ${badgeColor}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-base font-black t1">{c.name}</h4>
                        <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                          📍 Route: {c.route || 'Major Arterial Transit Corridor'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-black px-3 py-1 rounded-full uppercase"
                          style={{ background: `${badgeColor}20`, color: badgeColor }}
                        >
                          {c.status} ({c.delay})
                        </span>
                      </div>
                    </div>

                    {/* Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                      <div className="p-3 rounded-xl border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-xs font-bold tm">Current Travel</div>
                        <div className="text-base font-black t1 mt-0.5">{c.currentTime}</div>
                        <div className="text-[11px] font-semibold t3">typ. {c.normalTime}</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-xs font-bold tm">Road Visibility</div>
                        <div className="text-base font-black t1 mt-0.5">{c.visibility}</div>
                        <div className="text-[11px] font-semibold t3">Low beam advised</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-xs font-bold tm">Estimated AQI</div>
                        <div className="text-base font-black t1 mt-0.5" style={{ color: badgeColor }}>
                          {c.aqi || 340}
                        </div>
                        <div className="text-[11px] font-semibold t3">{c.smogBand || 'Very Poor'}</div>
                      </div>
                      <div className="p-3 rounded-xl border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                        <div className="text-xs font-bold tm">Cabin Intake</div>
                        <div className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">Recirculate</div>
                        <div className="text-[11px] font-semibold t3">Cuts 70% PM2.5</div>
                      </div>
                    </div>

                    {/* Smog Impact & Safety Advice */}
                    <div className="text-xs sm:text-sm space-y-2 pt-1">
                      <div className="flex items-start gap-2.5">
                        <span className="text-amber-500 font-bold shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
                        <span className="font-medium t2 leading-relaxed">
                          <strong>Smog Hotspot:</strong> {c.smogImpact || 'Heavy vehicle particulate stagnation along underpasses and riverfronts.'}
                        </span>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold shrink-0 mt-0.5" aria-hidden="true">💡</span>
                        <span className="font-semibold text-indigo-700 dark:text-indigo-300 leading-relaxed">
                          {c.transitAdvice || c.recommendation}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Actions */}
            <div className="pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs" style={{ borderColor: 'var(--border)' }}>
              <span className="font-semibold tm">
                🛡️ Tip: Always switch vehicle ventilation to recirculation before entering tunnels and flyovers.
              </span>
              <div className="flex items-center gap-2">
                {onOpenMap && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailsOpen(false);
                      onOpenMap();
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <span>🗺️</span>
                    <span>View Corridors on Map</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="px-3 py-2 rounded-xl text-xs font-bold border t2 hover:t1 hover:bg-[var(--surface-alt)] transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
