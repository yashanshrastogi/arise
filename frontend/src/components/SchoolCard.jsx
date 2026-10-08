import React from 'react';

/**
 * School Safety decision card — inspired by s4 remediation workflow.
 * Clear GO / MODIFY / CANCEL verdict with indoor telemetry indicators.
 */
const ACTIONS = [
  { key: 'GO',     color: '#2EB872', label: 'Go',     icon: '✓' },
  { key: 'MODIFY', color: '#F28C28', label: 'Modify', icon: '⚠' },
  { key: 'CANCEL', color: '#E5484D', label: 'Cancel', icon: '✕' },
];

export default function SchoolCard({ data }) {
  return (
    <div className="card p-5 h-full flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-extrabold t1">School Safety Protocol</h3>
          <p className="text-[11px] font-semibold t3 mt-0.5">{data.question}</p>
        </div>
        <span className="text-2xl">🏫</span>
      </div>

      {/* Decision Action Buttons */}
      <div className="grid grid-cols-3 gap-2 my-2">
        {ACTIONS.map(a => {
          const isActive = data.action === a.key;
          return (
            <button
              key={a.key}
              className={`py-2.5 px-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                isActive ? 'shadow-md scale-100' : 'opacity-60 hover:opacity-100'
              }`}
              style={{
                background: isActive ? a.color : 'var(--surface-alt)',
                color: isActive ? '#ffffff' : 'var(--text-tertiary)',
                border: `1.5px solid ${isActive ? a.color : 'var(--border)'}`,
              }}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>

      {/* Action Directive */}
      <div
        className="p-3 rounded-2xl my-2 text-xs font-bold"
        style={{
          background: '#E5484D14',
          border: '1px solid #E5484D35',
          color: '#E5484D',
        }}
      >
        🚨 Outdoor sports, morning assemblies, and recess suspended. Move all activities to filtered indoor rooms.
      </div>

      {/* Indoor Metrics (Demo Data) */}
      <div
        className="rounded-2xl p-3.5 relative"
        style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)' }}
      >
        <span
          className="absolute -top-2.5 right-3 text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ background: 'var(--border)', color: 'var(--text-tertiary)' }}
        >
          Demo Indoor Sensor
        </span>
        <div className="grid grid-cols-3 gap-2 mt-1">
          <div>
            <div className="text-[10px] font-bold t3 uppercase">Indoor PM2.5</div>
            <div className="text-base font-black t1 mt-0.5">
              {data.indoorPm25} <span className="text-[10px] font-semibold tm">µg/m³</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold t3 uppercase">Indoor CO₂</div>
            <div className="text-base font-black t1 mt-0.5">
              {data.indoorCo2} <span className="text-[10px] font-semibold tm">ppm</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold t3 uppercase">Air Filtration</div>
            <div className="text-xs font-black text-indigo mt-1">
              {data.ventilation}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
