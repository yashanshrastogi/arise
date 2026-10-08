import React, { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';

/**
 * Air Quality Forecast Chart — exact recreation of s1 & s2 bottom panel.
 * - Hourly / Daily / Monthly / Yearly period selector pills
 * - Smooth undulating curve (solid past, dashed future)
 * - Scrubber tooltip with timestamp & mini rainbow ring
 * - Best Window reference area (3 PM – 5 PM)
 * - Vertical rainbow gradient scale bar on the right side
 */

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const aqi = payload[0].value;
  if (!aqi) return null;

  const col =
    aqi > 400 ? '#8B1E3F' :
    aqi > 300 ? '#E5484D' :
    aqi > 200 ? '#F28C28' :
    aqi > 100 ? '#F5C542' :
    aqi > 50  ? '#9BD34A' : '#2EB872';

  const status =
    aqi > 400 ? 'Severe' :
    aqi > 300 ? 'Very Poor' :
    aqi > 200 ? 'Poor' :
    aqi > 100 ? 'Moderate' : 'Good';

  return (
    <div className="glass rounded-2xl p-3 shadow-xl border border-gray-200/60 dark:border-slate-700 min-w-[130px] text-center">
      <div className="text-[11px] font-bold t3 mb-1">{label} · Oct 8</div>
      <div className="flex items-center justify-center gap-2">
        {/* Mini rainbow circle */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center relative p-0.5"
          style={{ background: `conic-gradient(#2EB872, #F5C542, #F28C28, #E5484D, #8B1E3F)` }}
        >
          <div className="w-full h-full rounded-full bg-[var(--surface)] flex items-center justify-center">
            <span className="text-[9px] font-extrabold" style={{ color: col }}>●</span>
          </div>
        </div>
        <div className="text-left">
          <div className="text-lg font-black leading-none" style={{ color: col }}>{aqi}</div>
          <div className="text-[9px] font-bold tm uppercase">AQI · {status}</div>
        </div>
      </div>
    </div>
  );
}

export default function ForecastChart({ data }) {
  const [activeTab, setActiveTab] = useState('Hourly');
  const tabs = ['Hourly', 'Daily', 'Monthly', 'Yearly'];

  // Current time marker
  const nowIdx = data.findIndex(d => !d.past);
  const nowTime = nowIdx > 0 ? data[nowIdx - 1].time : data[0].time;

  // Process data for smooth past solid vs future dashed with seamless connection at now
  const merged = data.map((d, i) => ({
    ...d,
    pastAqi: d.past ? d.aqi : null,
    futureAqi: !d.past || (nowIdx > 0 && i === nowIdx - 1) ? d.aqi : null,
  }));

  // Best window range
  const bwStart = data.find(d => d.bestWindow)?.time;
  const bwItems = data.filter(d => d.bestWindow);
  const bwEnd = bwItems[bwItems.length - 1]?.time;

  return (
    <div className="card p-6 h-full flex flex-col justify-between">
      {/* Header with Title and Period Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-extrabold t1 tracking-tight">Air Quality Forecast</h3>
          <p className="text-xs font-semibold t3 mt-0.5">
            24-Hour Trend Analysis · Continuous Dispersion Tracking
          </p>
        </div>

        {/* Period Selector Tabs — matching s1/s2 */}
        <div className="flex items-center gap-1 bg-[var(--surface-alt)] p-1 rounded-xl self-start sm:self-auto border" style={{ borderColor: 'var(--border)' }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab
                  ? 'bg-indigo text-white shadow-sm'
                  : 't3 hover:text-[var(--text-primary)] hover:bg-[var(--border-subtle)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart Area with Vertical Scale Bar on the right */}
      <div className="flex items-stretch gap-3 flex-1 min-h-[220px]">
        {/* Recharts Container */}
        <div className="flex-1 min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged} margin={{ top: 15, right: 10, left: -16, bottom: 0 }}>
              <defs>
                {/* Past area gradient fill */}
                <linearGradient id="pastAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B4BDB" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#5B4BDB" stopOpacity={0.01} />
                </linearGradient>
                {/* Future area gradient fill */}
                <linearGradient id="futureAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5B4BDB" stopOpacity={0.10} />
                  <stop offset="100%" stopColor="#5B4BDB" stopOpacity={0.00} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--border)"
                opacity={0.7}
              />

              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
                dy={8}
              />

              <YAxis
                domain={[220, 340]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
              />

              <Tooltip
                content={<CustomTooltip />}
                cursor={{ stroke: '#5B4BDB', strokeDasharray: '4 4', strokeWidth: 1.5 }}
              />

              {/* Best Outdoor Window Area (Green highlight band) */}
              {bwStart && bwEnd && (
                <ReferenceArea
                  x1={bwStart}
                  x2={bwEnd}
                  fill="#2EB872"
                  fillOpacity={0.12}
                  stroke="#2EB872"
                  strokeOpacity={0.4}
                  strokeDasharray="4 4"
                />
              )}

              {/* NOW Vertical Reference Line */}
              <ReferenceLine
                x={nowTime}
                stroke="#E5484D"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: 'NOW (312)',
                  position: 'top',
                  fill: '#E5484D',
                  fontSize: 10,
                  fontWeight: 800,
                  offset: 8
                }}
              />

              {/* Past Solid Curve */}
              <Area
                type="monotone"
                dataKey="pastAqi"
                stroke="#5B4BDB"
                strokeWidth={3}
                fill="url(#pastAreaFill)"
                connectNulls={false}
                dot={false}
                activeDot={{ r: 6, fill: '#5B4BDB', stroke: '#ffffff', strokeWidth: 2 }}
              />

              {/* Future Dashed Curve */}
              <Line
                type="monotone"
                dataKey="futureAqi"
                stroke="#5B4BDB"
                strokeWidth={2.5}
                strokeDasharray="6 6"
                dot={false}
                connectNulls={false}
                activeDot={{ r: 6, fill: '#5B4BDB', stroke: '#ffffff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Vertical Rainbow Spectrum Bar Legend — exact match to s1 right edge! */}
        <div className="hidden sm:flex flex-col items-center justify-between py-3 pl-2">
          <span className="text-[9px] font-extrabold text-[#8B1E3F]">500</span>
          <div
            className="w-2.5 flex-1 my-1.5 rounded-full shadow-inner"
            style={{
              background: 'linear-gradient(to top, #2EB872, #9BD34A, #F5C542, #F28C28, #E5484D, #8B1E3F)'
            }}
          />
          <span className="text-[9px] font-extrabold text-[#2EB872]">0</span>
        </div>
      </div>

      {/* Legend & Summary Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-indigo rounded-full"></span>
            <span className="t2 font-bold text-[11px]">Observed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-indigo rounded-full opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(90deg,#5B4BDB 0,#5B4BDB 3px,transparent 3px,transparent 6px)' }}></span>
            <span className="t2 font-bold text-[11px]">Model Forecast</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500"></span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">Best Window (3–5 PM)</span>
          </div>
        </div>

        <div className="text-[11px] font-bold t3">
          Expected low: <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">245 AQI</span> at 4:00 PM
        </div>
      </div>
    </div>
  );
}
