import React from 'react';

/**
 * Accessible Technical Terms & Environmental Glossary Modal.
 * Provides plain-English explanations for technical metrics (AQI, PM2.5, PM10, IDW, FIRMS).
 */
const GLOSSARY_ITEMS = [
  {
    term: 'AQI (Air Quality Index)',
    subtitle: 'Composite Environmental Scale (0–500)',
    icon: '📊',
    definition:
      'A standardized composite score calculated from key airborne pollutants (PM2.5, PM10, NO₂, SO₂, CO, Ozone). Categorized into Good (0–50), Satisfactory (51–100), Moderate (101–200), Poor (201–300), Very Poor (301–400), and Severe (401–500).',
  },
  {
    term: 'PM2.5 (Fine Particulate Matter)',
    subtitle: 'Particles ≤ 2.5 µm',
    icon: '🎯',
    definition:
      'Ultra-fine inhalable particles from combustion, vehicular exhaust, and secondary atmospheric reactions. Because they penetrate deep into lung alveoli and the bloodstream, PM2.5 is the primary health driver across Delhi-NCR.',
  },
  {
    term: 'PM10 (Coarse Particulate Matter)',
    subtitle: 'Particles ≤ 10 µm',
    icon: '💨',
    definition:
      'Coarse inhalable particles such as construction dust, road re-suspension, fly ash, and regional windblown soil that irritate eyes, nose, and upper airways.',
  },
  {
    term: 'Spatial IDW (Inverse Distance Weighting)',
    subtitle: 'Spatial Interpolation Algorithm',
    icon: '📐',
    definition:
      'A mathematical interpolation method that calculates air quality for your exact device or saved coordinates by weighting readings from the nearest certified ground monitoring stations inversely proportional to their geographic distance.',
  },
  {
    term: 'CPCB & OpenAQ Stations',
    subtitle: 'Official Ground Telemetry',
    icon: '📍',
    definition:
      'Continuous Ambient Air Quality Monitoring Stations (CAAQMS) operated by the Central Pollution Control Board (CPCB), DPCC, and verified international open telemetry networks.',
  },
  {
    term: 'NASA FIRMS Fire Signals',
    subtitle: 'Satellite Thermal Anomaly Detections',
    icon: '🔥',
    definition:
      'Near real-time thermal anomaly detections from NASA VIIRS and MODIS satellite sensors. Signals denote active thermal hotspots in upwind agricultural and industrial regions, indicating smoke potential rather than standalone proof of local causation.',
  },
];

export default function TechnicalGlossaryModal({ onClose }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="glossary-title"
      className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        className="card max-w-xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ background: 'var(--surface)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">📖</span>
            <div>
              <h3 id="glossary-title" className="text-base font-black t1 leading-tight">
                Environmental Metrics &amp; Definitions
              </h3>
              <p className="text-[11px] font-semibold t3">
                Understand Delhi-NCR air quality indicators in plain English
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close glossary modal"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold t3 hover:bg-[var(--surface-alt)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Definition Cards */}
        <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-1">
          {GLOSSARY_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="p-3.5 rounded-2xl border transition-colors"
              style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-xs font-black t1">{item.term}</h4>
                    <span className="text-[10px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full">
                      {item.subtitle}
                    </span>
                  </div>
                  <p className="text-xs font-medium t2 leading-relaxed mt-1.5">
                    {item.definition}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <span className="text-[10px] font-medium tm">
            CPCB / WHO Reference Standard Compliant
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-indigo text-white font-extrabold text-xs shadow-md hover:scale-105 active:scale-95 transition-all"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
