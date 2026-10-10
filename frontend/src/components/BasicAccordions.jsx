import React, { useState } from 'react';
import { getAqiBandInfo } from './VerdictHero';

export default function BasicAccordions({ data }) {
  const [openWhy, setOpenWhy] = useState(false);
  const [openHourly, setOpenHourly] = useState(false);
  const [openPollutants, setOpenPollutants] = useState(false);

  const forecast = data?.forecast || [];
  const pollutants = data?.pollutants || {};

  return (
    <div className="space-y-4" role="region" aria-label="Detailed Air Quality Breakdown">
      {/* ── Accordion 1: Why is the air bad? ── */}
      <div className="card overflow-hidden" style={{ background: 'var(--card)' }}>
        <button
          type="button"
          onClick={() => setOpenWhy(prev => !prev)}
          className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold touch-target hover:bg-[var(--surface-alt)] transition-colors"
          aria-expanded={openWhy}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">💨</span>
            <div>
              <span className="text-base font-extrabold t1">Why is the air bad?</span>
              <p className="text-xs font-semibold t3 mt-0.5">4 reasons for today's high pollution</p>
            </div>
          </div>
          <span className="text-lg font-bold t2">{openWhy ? '▲' : '▼'}</span>
        </button>

        {openWhy && (
          <div className="p-5 pt-0 border-t space-y-3.5 mt-2" style={{ borderColor: 'var(--border)' }}>
            {/* Reason 1 */}
            <div className="p-3.5 rounded-xl border flex items-start gap-3 bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <span className="text-lg">🌫️</span>
              <div>
                <h4 className="text-sm font-extrabold t1">Tiny dust is the main problem</h4>
                <p className="text-xs font-medium t2 mt-0.5">
                  Microscopic fine dust (PM2.5) makes up most of the haze. These tiny particles travel deep into lungs and the bloodstream.
                </p>
              </div>
            </div>

            {/* Reason 2 */}
            <div className="p-3.5 rounded-xl border flex items-start gap-3 bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <span className="text-lg">🍃</span>
              <div>
                <h4 className="text-sm font-extrabold t1">No wind to clear the air</h4>
                <p className="text-xs font-medium t2 mt-0.5">
                  Surface winds are under 4 km/h. Without moving air, smoke and vehicle fumes stay trapped right over the streets.
                </p>
              </div>
            </div>

            {/* Reason 3 */}
            <div className="p-3.5 rounded-xl border flex items-start gap-3 bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <span className="text-lg">🔥</span>
              <div>
                <h4 className="text-sm font-extrabold t1">Fires seen upwind</h4>
                <p className="text-xs font-medium t2 mt-0.5">
                  Satellite sensors spotted farm fire signals upwind. Northwest winds carry external smoke plumes into the Delhi-NCR basin.
                </p>
              </div>
            </div>

            {/* Reason 4 */}
            <div className="p-3.5 rounded-xl border flex items-start gap-3 bg-[var(--surface-alt)]" style={{ borderColor: 'var(--border)' }}>
              <span className="text-lg">🛑</span>
              <div>
                <h4 className="text-sm font-extrabold t1">Air is trapped near the ground</h4>
                <p className="text-xs font-medium t2 mt-0.5">
                  A cool surface temperature layer acts like a closed ceiling under 400 meters, preventing pollutants from escaping upward.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Accordion 2: Hour by hour ── */}
      <div className="card overflow-hidden" style={{ background: 'var(--card)' }}>
        <button
          type="button"
          onClick={() => setOpenHourly(prev => !prev)}
          className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold touch-target hover:bg-[var(--surface-alt)] transition-colors"
          aria-expanded={openHourly}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">⏱️</span>
            <div>
              <span className="text-base font-extrabold t1">Hour by hour</span>
              <p className="text-xs font-semibold t3 mt-0.5">How the air changes today</p>
            </div>
          </div>
          <span className="text-lg font-bold t2">{openHourly ? '▲' : '▼'}</span>
        </button>

        {openHourly && (
          <div className="p-5 pt-0 border-t space-y-3 mt-2" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Expected to stay very bad between 318 and 331 throughout the day.
            </p>

            <div className="overflow-x-auto pb-2 -mx-1 px-1">
              <div className="flex gap-2 min-w-max">
                {forecast.slice(0, 12).map((item, index) => {
                  const b = getAqiBandInfo(item.aqi);
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-xl border text-center flex flex-col items-center justify-between min-w-[72px]"
                      style={{
                        background: 'var(--surface-alt)',
                        borderColor: 'var(--border)',
                      }}
                    >
                      <span className="text-xs font-bold t3">{item.hour}</span>
                      <span className="text-base font-black my-1" style={{ color: b.color }}>
                        {item.aqi}
                      </span>
                      <span
                        className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
                        style={{ background: b.bg, color: b.ink }}
                      >
                        {b.symbol} {b.band}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Accordion 3: What's in the air? ── */}
      <div className="card overflow-hidden" style={{ background: 'var(--card)' }}>
        <button
          type="button"
          onClick={() => setOpenPollutants(prev => !prev)}
          className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold touch-target hover:bg-[var(--surface-alt)] transition-colors"
          aria-expanded={openPollutants}
        >
          <div className="flex items-center gap-3">
            <span className="text-xl" aria-hidden="true">🧪</span>
            <div>
              <span className="text-base font-extrabold t1">What's in the air?</span>
              <p className="text-xs font-semibold t3 mt-0.5">Compared with India's official health limits</p>
            </div>
          </div>
          <span className="text-lg font-bold t2">{openPollutants ? '▲' : '▼'}</span>
        </button>

        {openPollutants && (
          <div className="p-5 pt-0 border-t space-y-3 mt-2" style={{ borderColor: 'var(--border)' }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Fine Dust */}
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black t1">Fine dust (PM2.5)</span>
                  <span className="text-xs font-black text-red-600 dark:text-red-400">10× healthy limit</span>
                </div>
                <div className="text-xl font-black t1 mt-1">
                  {pollutants.pm25 || 245} <span className="text-xs font-semibold tm">µg/m³</span>
                </div>
                <p className="text-[11px] font-medium t3 mt-1">
                  Main hazard today. India safety limit: 60 µg/m³.
                </p>
              </div>

              {/* Coarse Dust */}
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black t1">Coarse dust (PM10)</span>
                  <span className="text-xs font-black text-amber-600 dark:text-amber-400">4× healthy limit</span>
                </div>
                <div className="text-xl font-black t1 mt-1">
                  {pollutants.pm10 || 382} <span className="text-xs font-semibold tm">µg/m³</span>
                </div>
                <p className="text-[11px] font-medium t3 mt-1">
                  Road dust and construction grit. India safety limit: 100 µg/m³.
                </p>
              </div>

              {/* Vehicle Fumes */}
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black t1">Vehicle fumes (NO₂)</span>
                  <span className="text-xs font-bold text-amber-500">Elevated</span>
                </div>
                <div className="text-xl font-black t1 mt-1">
                  {pollutants.no2 || 88} <span className="text-xs font-semibold tm">µg/m³</span>
                </div>
                <p className="text-[11px] font-medium t3 mt-1">
                  Exhaust from diesel and petrol vehicles in urban corridors.
                </p>
              </div>

              {/* Sunlight Smog */}
              <div className="p-3.5 rounded-xl border" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black t1">Sunlight smog (O₃)</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Within limit</span>
                </div>
                <div className="text-xl font-black t1 mt-1">
                  {pollutants.o3 || 42} <span className="text-xs font-semibold tm">µg/m³</span>
                </div>
                <p className="text-[11px] font-medium t3 mt-1">
                  Ground-level ozone formed by sun reacting with vehicle exhaust.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
