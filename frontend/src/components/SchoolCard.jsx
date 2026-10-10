import React from 'react';

export default function SchoolCard({ data = {} }) {
  const isCancel = data.action === 'CANCEL';
  const isModify = data.action === 'MODIFY';

  const statusLabel = isCancel
    ? 'Move activities indoors'
    : isModify
    ? 'Limit outdoor sports'
    : 'Normal outdoor activities permitted';

  const statusColor = isCancel ? '#B42318' : isModify ? '#B54708' : '#067647';
  const statusBg = isCancel ? 'var(--vpoor-bg)' : isModify ? 'var(--poor-bg)' : 'var(--good-bg)';
  const statusInk = isCancel ? 'var(--vpoor-ink)' : isModify ? 'var(--poor-ink)' : 'var(--good-ink)';
  const statusIcon = isCancel ? '■' : isModify ? '▲' : '✓';

  return (
    <div className="card p-5 h-full flex flex-col justify-between" style={{ background: 'var(--card)' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-extrabold t1">Should kids play outside?</h3>
          <p className="text-xs font-semibold t3 mt-0.5">School and children outdoor guideline</p>
        </div>
        <span className="text-2xl" aria-hidden="true">🏫</span>
      </div>

      {/* Single Labelled Status (Truth Fix: not clickable buttons) */}
      <div
        className="p-4 rounded-xl border flex items-center justify-between gap-3 my-2"
        style={{
          background: statusBg,
          borderColor: `${statusColor}40`,
          color: statusInk,
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg font-black" aria-hidden="true">{statusIcon}</span>
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider opacity-80">
              Answer for today
            </div>
            <div className="text-sm font-black">
              {statusLabel}
            </div>
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-current opacity-90">
          {isCancel ? 'CANCEL' : isModify ? 'MODIFY' : 'GO'}
        </span>
      </div>

      {/* Directive text in plain language */}
      <p className="text-xs font-medium t2 my-2">
        {isCancel
          ? 'Keep sports, assembly and recess indoors today. Run clean indoor filtration in classrooms.'
          : isModify
          ? 'Limit high-intensity sports. Low-exertion recess permitted with close observation.'
          : 'Outdoor sports and routine recess permitted under current acceptable air levels.'}
      </p>

      {/* Inside Air (Practice data) */}
      <div
        className="rounded-xl p-3.5 relative mt-2 border"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold t3 uppercase">Inside air</span>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            Practice data
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] font-bold t3">Inside dust</div>
            <div className="text-sm font-black t1 mt-0.5">
              {data.indoorPm25 || 28} <span className="text-[10px] font-semibold tm">µg/m³</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold t3">Stuffy-air level</div>
            <div className="text-sm font-black t1 mt-0.5">
              {data.indoorCo2 || 640} <span className="text-[10px] font-semibold tm">ppm</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold t3">Air filtration</div>
            <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-1">
              {data.ventilation || 'HEPA Active'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
