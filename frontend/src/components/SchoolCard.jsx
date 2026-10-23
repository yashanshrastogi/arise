import React from 'react';
import InfoTooltip from './InfoTooltip';

export default function SchoolCard({ data = {} }) {
  const isCancel = data.action === 'CANCEL';
  const isModify = data.action === 'MODIFY';

  const statusLabel = isCancel
    ? 'Move Activities Indoors'
    : isModify
    ? 'Limit Outdoor Sports'
    : 'Safe for Outdoor Play';

  const actionPill = isCancel ? 'INDOORS ONLY' : isModify ? 'MODIFIED PLAY' : 'NORMAL PLAY';
  const statusColor = isCancel ? '#DC2626' : isModify ? '#D97706' : '#059669';
  const statusBg = isCancel
    ? 'rgba(254, 242, 242, 0.95)'
    : isModify
    ? 'rgba(255, 251, 235, 0.95)'
    : 'rgba(240, 253, 244, 0.95)';
  const statusBorder = isCancel ? '#FECACA' : isModify ? '#FDE68A' : '#A7F3D0';
  const statusInk = isCancel ? '#991B1B' : isModify ? '#92400E' : '#065F46';
  const statusIcon = isCancel ? '✕' : isModify ? '▲' : '✓';

  const pm25Value = data.indoorPm25 || 28;
  const co2Value = data.indoorCo2 || 640;
  const ventilationStatus = data.ventilation || 'HEPA Active';

  return (
    <div
      className="card p-5 sm:p-6 h-full flex flex-col justify-between transition-all shadow-xs hover:shadow-md"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">🏫</span>
            <div>
              <h3 className="text-base font-black t1 leading-tight">Should kids play outside?</h3>
              <p className="text-xs font-semibold tm mt-0.5">School &amp; Children Outdoor Guideline</p>
            </div>
          </div>
          <span
            className="text-[11px] font-black px-2.5 py-0.5 rounded-full border shadow-2xs uppercase tracking-tight"
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Daily Protocol
          </span>
        </div>

        {/* Action Status Banner */}
        <div
          className="p-3.5 rounded-2xl border flex items-center justify-between gap-3 my-2.5 transition-colors shadow-2xs"
          style={{
            background: statusBg,
            borderColor: statusBorder,
            color: statusInk,
          }}
        >
          <div className="flex items-center gap-2.5">
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 shadow-xs"
              style={{ backgroundColor: statusColor }}
              aria-hidden="true"
            >
              {statusIcon}
            </span>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider opacity-80 block">
                Answer for Today
              </span>
              <span className="text-sm sm:text-base font-black leading-snug">
                {statusLabel}
              </span>
            </div>
          </div>
          <span
            className="text-xs font-black px-2.5 py-1 rounded-full border border-current shadow-2xs uppercase tracking-tight shrink-0"
          >
            {actionPill}
          </span>
        </div>

        {/* Direct Plain-Language Guidance */}
        <p className="text-xs sm:text-sm font-semibold t1 my-3 leading-relaxed">
          {isCancel
            ? 'Keep sports, morning assembly, and recess indoors. Run classroom air purifiers with doors and windows sealed.'
            : isModify
            ? 'Limit high-intensity cardiovascular sports. Low-exertion recess permitted under close teacher observation.'
            : 'Normal outdoor sports, assembly, and recess permitted under current acceptable atmospheric conditions.'}
        </p>
      </div>

      {/* Classroom & Indoor Air Metrics */}
      <div
        className="rounded-2xl p-3.5 border transition-all mt-2"
        style={{
          background: 'var(--surface-alt)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold tm uppercase tracking-wider">Classroom Air</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              Clean Protocol
            </span>
            <InfoTooltip
              title="Clean Indoor Protocol"
              explanation="Protective guidelines for schools and homes: keep outdoor doors and windows closed during peak pollution, circulate indoor air through HEPA filtration units, and maintain fresh oxygen levels."
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="p-1.5 rounded-xl bg-[var(--card)] border shadow-2xs" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-bold tm block">Indoor PM2.5</span>
            <span className="text-sm font-black t1 block mt-0.5">{pm25Value} <span className="text-[10px] tm font-semibold">µg/m³</span></span>
            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">Good</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--card)] border shadow-2xs" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-bold tm block">Air Freshness</span>
            <span className="text-sm font-black t1 block mt-0.5">{co2Value} <span className="text-[10px] tm font-semibold">ppm</span></span>
            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 block mt-0.5">Fresh</span>
          </div>

          <div className="p-1.5 rounded-xl bg-[var(--card)] border shadow-2xs" style={{ borderColor: 'var(--border)' }}>
            <span className="text-[10px] font-bold tm block">Purifiers</span>
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 block mt-1 truncate">
              {ventilationStatus.includes('HEPA') ? 'HEPA Active' : ventilationStatus}
            </span>
            <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 block mt-0.5">✓ Running</span>
          </div>
        </div>
      </div>
    </div>
  );
}
