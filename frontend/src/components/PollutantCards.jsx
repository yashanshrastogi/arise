import React from 'react';
import InfoTooltip from './InfoTooltip';

/**
 * Pollutant mini-cards — Age-friendly design with plain English explanations
 * and interactive info tooltips for clear health understanding.
 */
const STATUS_CONFIG = {
  Good:         { color: '#2EB872', bg: '#2EB87214' },
  Satisfactory: { color: '#9BD34A', bg: '#9BD34A14' },
  Moderate:     { color: '#F5C542', bg: '#F5C54214' },
  Poor:         { color: '#F28C28', bg: '#F28C2814' },
  'Very Poor':  { color: '#E5484D', bg: '#E5484D14' },
  Severe:       { color: '#8B1E3F', bg: '#8B1E3F14' },
};

const POLLUTANT_TOOLTIPS = {
  'PM2.5': {
    title: 'PM2.5 (Fine Particulate Matter)',
    desc: 'Microscopic particles from vehicle smoke and fires that penetrate deep into your lungs and blood, triggering asthma and heart strain.',
  },
  'PM10': {
    title: 'PM10 (Coarse Dust & Particles)',
    desc: 'Coarse dust from roads, construction, and wind that settles in your nose and throat, causing dry cough and eye irritation.',
  },
  'NO2': {
    title: 'NO2 (Nitrogen Dioxide)',
    desc: 'Gas from vehicle exhaust and power stations that inflames lung airways and increases susceptibility to chest infections.',
  },
  'SO2': {
    title: 'SO2 (Sulfur Dioxide)',
    desc: 'Gas from fuel combustion and factories that irritates throat lining and can trigger acute wheezing or breathing distress.',
  },
  'CO': {
    title: 'CO (Carbon Monoxide)',
    desc: 'Invisible, odorless gas from engine exhaust that reduces oxygen delivery in your bloodstream, leading to fatigue and dizziness.',
  },
  'O3': {
    title: 'O3 (Ground-Level Ozone)',
    desc: 'Smog gas formed when sunlight bakes vehicle exhaust. Irritates breathing passages and induces coughing on bright afternoons.',
  },
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
  if (!pollutants || pollutants.length === 0) {
    return (
      <div className="card p-5 text-center tm text-sm font-semibold rounded-2xl border shadow-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
        No ground monitoring stations reporting pollutant measurements in range for this location.
      </div>
    );
  }
  return (
    <div
      className="card p-4 sm:p-5 rounded-2xl border shadow-sm"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
    >
      {/* Unified Card Header */}
      <div
        className="flex items-center justify-between pb-3.5 mb-3 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-base sm:text-lg" aria-hidden="true">💨</span>
          <h3 className="text-sm sm:text-base font-black t1">Air Pollutants</h3>
          <InfoTooltip
            title="Monitored Air Pollutants"
            text="Key airborne metrics: PM2.5 & PM10 (fine/coarse dust and smoke that penetrate lungs), NO2 & SO2 (combustion gases from vehicles and power plants), CO (carbon monoxide from vehicle exhaust), and O3 (ground-level ozone smog formed in sunlight)."
            impact="The pollutant with the highest sub-index (marked DOM) determines today's overall AQI."
          />
        </div>
        <span
          className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border tm bg-[var(--surface-alt)] shadow-2xs"
          style={{ borderColor: 'var(--border)' }}
        >
          Official Ground Telemetry
        </span>
      </div>

      {/* Clubbed Pollutants Grid inside the Single Card */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
        {pollutants.map(p => {
          const conf = STATUS_CONFIG[p.status] || { color: '#6b7280', bg: '#6b728014' };
          return (
            <div
              key={p.name}
              className={`p-3 sm:p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                p.dominant ? 'ring-2 ring-rose-500/40 shadow-xs' : 'hover:border-indigo-400/40'
              }`}
              style={{
                background: 'var(--surface-alt)',
                borderColor: p.dominant ? '#E5484D' : 'var(--border)',
              }}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm sm:text-base font-black t1">{p.name}</span>
                    {p.dominant && (
                      <span
                        className="text-[10px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-wider"
                        style={{ background: '#E5484D', color: '#ffffff' }}
                        title="Dominant pollutant determining today's overall AQI"
                      >
                        Dom
                      </span>
                    )}
                  </div>
                  <MiniRing pct={p.pct} color={conf.color} size={28} />
                </div>

                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl sm:text-2xl font-black t1 leading-tight tabular-nums">
                    {p.value !== undefined && p.value !== null ? p.value : '—'}
                  </span>
                  {p.value !== undefined && p.value !== null && (
                    <span className="text-[11px] font-bold tm">{p.unit}</span>
                  )}
                </div>

                <div className="mt-2">
                  <span
                    className="text-[11px] font-black px-2 py-0.5 rounded-full uppercase tracking-tight inline-block"
                    style={{ color: conf.color, background: conf.bg }}
                  >
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
