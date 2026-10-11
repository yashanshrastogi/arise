import React from 'react';

export default function SchoolCard({ data = {} }) {
  const isCancel = data.action === 'CANCEL';
  const isModify = data.action === 'MODIFY';

  const statusLabel = isCancel
    ? 'Move activities indoors'
    : isModify
    ? 'Limit outdoor sports'
    : 'Normal outdoor activities permitted';

  const statusColor = isCancel ? '#B42318' : isModify ? '#B54708' : '#059669';
  const statusBg = isCancel ? 'var(--vpoor-bg)' : isModify ? 'var(--poor-bg)' : 'rgba(230, 246, 236, 0.95)';
  const statusInk = isCancel ? 'var(--vpoor-ink)' : isModify ? 'var(--poor-ink)' : '#064E3B';
  const statusIcon = isCancel ? '■' : isModify ? '▲' : '✓';

  return (
    <div className="card p-5 sm:p-6 h-full flex flex-col justify-between" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <h3 className="text-base font-black t1">Should kids play outside?</h3>
          <p className="text-xs sm:text-sm font-semibold tm mt-0.5">School and children outdoor guideline</p>
        </div>
        <span className="text-2xl sm:text-3xl" aria-hidden="true">🏫</span>
      </div>

      {/* Single Labelled Status */}
      <div
        className="p-4 rounded-2xl border flex items-center justify-between gap-3 my-2 shadow-2xs"
        style={{
          background: statusBg,
          borderColor: isCancel ? '#FCA5A5' : isModify ? '#FDBA74' : '#6EE7B7',
          color: statusInk,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl font-black" aria-hidden="true">{statusIcon}</span>
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider opacity-90">
              Answer for today
            </div>
            <div className="text-base font-black">
              {statusLabel}
            </div>
          </div>
        </div>
        <span className="text-xs sm:text-sm font-black px-2.5 py-1 rounded-full border border-current opacity-95">
          {isCancel ? 'CANCEL' : isModify ? 'MODIFY' : 'GO'}
        </span>
      </div>

      {/* Directive text in plain language */}
      <p className="text-xs sm:text-sm font-semibold t1 my-2.5 leading-relaxed">
        {isCancel
          ? 'Keep sports, assembly and recess indoors today. Run clean indoor filtration in classrooms.'
          : isModify
          ? 'Limit high-intensity sports. Low-exertion recess permitted with close observation.'
          : 'Outdoor sports and routine recess permitted under current acceptable air levels.'}
      </p>

      {/* Inside Air (Practice data) */}
      <div
        className="rounded-2xl p-4 relative mt-2 border"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold tm uppercase tracking-wide">Inside air</span>
          <span className="text-xs font-black px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-100 border border-emerald-400 dark:border-emerald-700 shadow-2xs">
            Clean Indoor Protocol
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <div className="text-xs font-bold tm">Indoor PM2.5</div>
            <div className="text-base font-black t1 mt-0.5">
              {data.indoorPm25 || 28} <span className="text-xs font-semibold tm">µg/m³</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold tm">Air Freshness (CO2)</div>
            <div className="text-base font-black t1 mt-0.5">
              {data.indoorCo2 || 640} <span className="text-xs font-semibold tm">ppm</span>
            </div>
          </div>
          <div>
            <div className="text-xs font-bold tm">Filtration Status</div>
            <div className="text-xs sm:text-sm font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {data.ventilation || 'HEPA & Recirculation Active'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
