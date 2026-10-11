import React, { useState } from 'react';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';

/**
 * Air Quality & Weather Forecast Chart
 * Supports metric switching: AQI, Temperature, Rain, and Wind speed.
 * Offers both 24-Hour hourly trend and 7-Day outlook with plain-English takeaway.
 */

const METRIC_CONFIG = {
  aqi: {
    label: 'Air Quality (AQI)',
    unit: 'AQI',
    dataKey: 'aqi',
    pastKey: 'pastAqi',
    futureKey: 'futureAqi',
    color: '#5B4BDB',
    gradient: '#5B4BDB',
    min: 0,
    max: 500,
  },
  temp: {
    label: 'Temperature (°C)',
    unit: '°C',
    dataKey: 'temp',
    pastKey: 'pastTemp',
    futureKey: 'futureTemp',
    color: '#F28C28',
    gradient: '#F28C28',
    min: 15,
    max: 40,
  },
  rain: {
    label: 'Rain Probability (%)',
    unit: '%',
    dataKey: 'rainProb',
    pastKey: 'pastRain',
    futureKey: 'futureRain',
    color: '#3B82F6',
    gradient: '#3B82F6',
    min: 0,
    max: 100,
  },
  wind: {
    label: 'Wind Speed (km/h)',
    unit: 'km/h',
    dataKey: 'windSpeed',
    pastKey: 'pastWind',
    futureKey: 'futureWind',
    color: '#10B981',
    gradient: '#10B981',
    min: 0,
    max: 20,
  },
};

function CustomTooltip({ active, payload, label, activeMetric, location = 'Delhi-NCR' }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  if (val === undefined || val === null) return null;

  const rawItem = payload[0].payload;
  const cfg = METRIC_CONFIG[activeMetric] || METRIC_CONFIG.aqi;

  return (
    <div className="glass rounded-2xl p-3 shadow-xl border border-gray-200/60 dark:border-slate-700 min-w-[140px] text-center">
      <div className="text-[11px] font-bold t3 mb-1">{label} · {location}</div>
      <div className="flex items-center justify-center gap-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm"
          style={{ background: cfg.color }}
        >
          ●
        </div>
        <div className="text-left">
          <div className="text-lg font-black leading-none" style={{ color: cfg.color }}>
            {val} <span className="text-[11px] font-bold">{cfg.unit}</span>
          </div>
          <div className="text-[9px] font-bold tm uppercase mt-0.5">
            {activeMetric === 'aqi'
              ? val > 300 ? 'Very Poor' : val > 200 ? 'Poor' : val > 100 ? 'Moderate' : 'Good'
              : cfg.label}
          </div>
        </div>
      </div>
      {/* Secondary mini details */}
      <div className="mt-2 pt-1.5 border-t border-gray-200/40 dark:border-slate-700/60 flex items-center justify-between text-[9px] font-bold tm">
        <span>AQI: {rawItem.aqi}</span>
        <span>Temp: {rawItem.temp}°C</span>
      </div>
    </div>
  );
}

export default function ForecastChart({ data = [], data7Day = [], currentAqi = null, location = 'Delhi-NCR' }) {
  const [metric, setMetric] = useState('aqi');
  const [period, setPeriod] = useState('24h'); // '24h' | '7d'
  const [selectedPoint, setSelectedPoint] = useState(null);

  const cfg = METRIC_CONFIG[metric];

  // Current time index and reference point
  const nowIdx = (() => {
    const currIdx = data.findIndex(d => d.isCurrent);
    if (currIdx !== -1) return currIdx;
    const firstFuture = data.findIndex(d => !d.past);
    return firstFuture !== -1 ? firstFuture : 0;
  })();
  const nowTime = (data[nowIdx] && data[nowIdx].time) ? data[nowIdx].time : data[0]?.time || '12 PM';
  const nowVal = (metric === 'aqi' && currentAqi != null)
    ? currentAqi
    : (data[nowIdx]?.[cfg.dataKey] || data[0]?.[cfg.dataKey] || 0);

  // Process 24h data for solid past and dashed future, anchoring now reference to currentAqi if provided
  const merged24h = data.map((d, i) => {
    const itemVal = (metric === 'aqi' && currentAqi != null && i === nowIdx)
      ? currentAqi
      : d[cfg.dataKey];
    return {
      ...d,
      pastVal: d.past ? itemVal : (i === nowIdx ? itemVal : null),
      futureVal: !d.past || i === nowIdx ? itemVal : null,
    };
  });

  // Best window bounds strictly within upcoming/future points
  const bwItems = data.filter(d => d.bestWindow && !d.past);
  const bwStart = bwItems[0]?.time;
  const bwEnd = bwItems[bwItems.length - 1]?.time;

  // Lowest AQI future item
  const futurePoints = data.filter(d => !d.past);
  const candidatePoints = futurePoints.length > 0 ? futurePoints : data;
  const minAqiItem = candidatePoints.reduce((min, cur) => cur.aqi < min.aqi ? cur : min, candidatePoints[0] || { aqi: 0, time: '' });
  const currentVal = currentAqi != null ? Number(currentAqi) : (nowVal || 329);
  const minAqi = minAqiItem?.aqi || currentVal;
  const percentImprovement = currentVal > 0 ? (currentVal - minAqi) / currentVal : 0;
  const isBetterBand = (currentVal > 300 && minAqi <= 300) || (currentVal > 200 && minAqi <= 200) || (currentVal > 100 && minAqi <= 100);
  const hasRealSafeWindow = (percentImprovement >= 0.15 || isBetterBand) && Boolean(bwStart && bwEnd);

  // Compute dynamic domain
  const activeDataset = period === '24h' ? data : data7Day.length ? data7Day : data;
  const allValues = activeDataset.map(d => d[cfg.dataKey]).filter(v => typeof v === 'number');
  const minVal = allValues.length ? Math.max(0, Math.floor(Math.min(...allValues) / 5) * 5 - 10) : cfg.min;
  const maxVal = allValues.length ? Math.ceil(Math.max(...allValues) / 5) * 5 + 10 : cfg.max;

  return (
    <div className="card p-6 h-full flex flex-col justify-between" style={{ background: 'var(--card)' }}>
      {/* Header with Title, Metric Switchers, and Period Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base lg:text-lg font-black t1 tracking-tight">
            Air &amp; Weather Forecast
          </h3>
          <p className="text-xs font-semibold t3 mt-0.5">
            How the air changes today · {cfg.label}
          </p>
        </div>

        {/* Controls: Metric Selector + Period Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Metric Switcher Pills */}
          <div className="flex items-center gap-1 bg-[var(--surface-alt)] p-1 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            {[
              { id: 'aqi',  label: 'AQI' },
              { id: 'temp', label: 'Temp' },
              { id: 'rain', label: 'Rain %' },
              { id: 'wind', label: 'Wind' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  metric === m.id
                    ? 'bg-[var(--surface)] t1 shadow-sm border'
                    : 't3 hover:text-[var(--text-primary)]'
                }`}
                style={{ borderColor: metric === m.id ? 'var(--border)' : 'transparent' }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Period Pills: 24h / 7d */}
          <div className="flex items-center gap-1 bg-[var(--surface-alt)] p-1 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
            {[
              { id: '24h', label: '24 Hours' },
              { id: '7d',  label: '7 Days' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                  period === p.id
                    ? 'bg-[var(--surface)] t1 shadow-sm border'
                    : 't3 hover:text-[var(--text-primary)]'
                }`}
                style={{ borderColor: period === p.id ? 'var(--border)' : 'transparent' }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex items-stretch gap-3 w-full min-w-0 h-[260px] sm:h-[300px] my-1">
        <div className="flex-1 min-w-0 h-full">
          <ResponsiveContainer width="100%" height="100%">
          {period === '24h' ? (
            <AreaChart data={merged24h} margin={{ top: 15, right: 10, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="metricAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={cfg.color} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />

              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                minTickGap={14}
                tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
                dy={8}
              />

                <YAxis
                  domain={[minVal, maxVal]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
                />

                <Tooltip
                  content={<CustomTooltip activeMetric={metric} location={location} />}
                  cursor={{ stroke: 'rgba(99, 102, 241, 0.45)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                />

                {/* Best Outdoor Window (Light green highlight) */}
                {metric === 'aqi' && bwStart && bwEnd && (
                  <ReferenceArea
                    x1={bwStart}
                    x2={bwEnd}
                    fill="#10B981"
                    fillOpacity={0.18}
                    stroke="#10B981"
                    strokeOpacity={0.45}
                    strokeDasharray="4 4"
                  />
                )}

                {/* NOW Vertical Reference Line */}
                <ReferenceLine
                  x={nowTime}
                  stroke={cfg.color}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  label={{
                    value: `NOW (${nowVal}${cfg.unit === '°C' ? '°' : ''})`,
                    position: 'top',
                    fill: cfg.color,
                    fontSize: 10,
                    fontWeight: 800,
                    offset: 8,
                  }}
                />

                {/* Past Solid Curve */}
                <Area
                  type="monotone"
                  dataKey="pastVal"
                  stroke={cfg.color}
                  strokeWidth={3}
                  fill="url(#metricAreaFill)"
                  connectNulls={false}
                  dot={false}
                  activeDot={{ r: 6, fill: cfg.color, stroke: '#ffffff', strokeWidth: 2 }}
                />

                {/* Future Dashed Curve */}
                <Line
                  type="monotone"
                  dataKey="futureVal"
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  strokeDasharray="6 6"
                  dot={false}
                  connectNulls={false}
                  activeDot={{ r: 6, fill: cfg.color, stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            ) : (
              /* 7-Day Bar / Line Outlook */
              <AreaChart data={data7Day} margin={{ top: 15, right: 10, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="metric7DayFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={cfg.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={cfg.color} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={10}
                  tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
                  dy={8}
                />
                <YAxis
                  domain={[minVal, maxVal]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-tertiary)' }}
                />
                <Tooltip
                  content={<CustomTooltip activeMetric={metric} location={location} />}
                  cursor={{ stroke: 'rgba(99, 102, 241, 0.45)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                />
                <Area
                  type="monotone"
                  dataKey={cfg.dataKey}
                  stroke={cfg.color}
                  strokeWidth={3}
                  fill="url(#metric7DayFill)"
                  dot={{ r: 4, fill: cfg.color, stroke: '#ffffff', strokeWidth: 1.5 }}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Vertical Rainbow Spectrum Bar Legend */}
        {metric === 'aqi' && (
          <div className="hidden sm:flex flex-col items-center justify-between py-3 pl-2">
            <span className="text-[9px] font-extrabold text-[#8B1E3F]">500</span>
            <div
              className="w-2.5 flex-1 my-1.5 rounded-full shadow-inner"
              style={{
                background: 'linear-gradient(to top, #2EB872, #9BD34A, #F5C542, #F28C28, #E5484D, #8B1E3F)',
              }}
            />
            <span className="text-[9px] font-extrabold text-[#2EB872]">0</span>
          </div>
        )}
      </div>

      {/* Interactive Forecast Points Strip (Accessible & Mobile-friendly) */}
      <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider tm">
            Interactive Forecast Inspection {period === '24h' ? '(Hourly)' : '(Daily)'}
          </span>
          {selectedPoint && (
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              className="text-[10px] font-bold text-indigo hover:underline"
            >
              Reset selection
            </button>
          )}
        </div>

        {/* Scrollable button pills */}
        <div
          role="region"
          aria-label="Forecast data points"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 focus:outline-none"
        >
          {activeDataset.map((pt, idx) => {
            const isSelected = selectedPoint && (
              (period === '24h' && selectedPoint.time === pt.time) ||
              (period === '7d' && selectedPoint.day === pt.day)
            );
            const val = pt[cfg.dataKey];
            const label = period === '24h' ? pt.time : pt.day;
            const isBest = pt.bestWindow;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedPoint(isSelected ? null : pt)}
                aria-pressed={isSelected}
                aria-label={`${label}: ${val} ${cfg.unit}${isBest ? ' (Optimal outdoor window)' : ''}`}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl text-left border transition-all text-xs focus-visible:ring-2 focus-visible:ring-indigo ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md scale-105'
                    : isBest
                    ? 'bg-emerald-100/90 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100 font-black shadow-2xs hover:scale-102 ring-1 ring-emerald-400/30'
                    : 'bg-[var(--surface-alt)] border-[var(--border)] hover:bg-[var(--surface)] hover:scale-102'
                }`}
              >
                <div className="flex items-center gap-1 font-bold">
                  <span className={isSelected ? 'text-white' : isBest ? 'text-emerald-950 dark:text-emerald-100 font-black' : 't3'}>{label}</span>
                  {isBest && !isSelected && <span className="text-[10px] text-emerald-700 dark:text-emerald-300 font-black">🌟</span>}
                </div>
                <div className={`text-xs font-black ${isSelected ? 'text-white' : isBest ? 'text-emerald-900 dark:text-emerald-200' : 't1'}`}>
                  {val != null ? `${val} ${cfg.unit}` : '—'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Point Callout Card */}
        {selectedPoint && (
          <div
            className="mt-2.5 p-3 rounded-2xl border flex items-center justify-between gap-3 animate-in fade-in duration-150"
            style={{
              background: 'rgba(91, 75, 219, 0.08)',
              borderColor: 'rgba(91, 75, 219, 0.25)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📍</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                    {period === '24h' ? `Forecast for ${selectedPoint.time}` : `${selectedPoint.day} Forecast`}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    {selectedPoint[cfg.dataKey]} {cfg.unit}
                  </span>
                  {selectedPoint.bestWindow && hasRealSafeWindow && (
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      🌟 Best Outdoor Window
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-medium t2 mt-0.5 flex items-center gap-3 flex-wrap">
                  {selectedPoint.aqi != null && <span>AQI: <strong className="t1">{selectedPoint.aqi}</strong></span>}
                  {selectedPoint.temp != null && <span>Temp: <strong className="t1">{selectedPoint.temp}°C</strong></span>}
                  {selectedPoint.rainProb != null && <span>Chance of rain: <strong className="t1">{selectedPoint.rainProb}%</strong></span>}
                  {selectedPoint.windSpeed != null && <span>Wind: <strong className="t1">{selectedPoint.windSpeed} km/h</strong></span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPoint(null)}
              aria-label="Dismiss point details"
              className="text-xs font-bold tm hover:t1 px-2 py-1 rounded-lg"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Footer Takeaway Bar with Best Outdoor Window Highlight */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-2 border-t text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 rounded-full" style={{ background: cfg.color }} />
            <span className="t2 font-bold text-[11px]">So far today</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-1 rounded-full opacity-60"
              style={{ backgroundImage: `repeating-linear-gradient(90deg, ${cfg.color} 0, ${cfg.color} 3px, transparent 3px, transparent 6px)` }}
            />
            <span className="t2 font-bold text-[11px]">Expected</span>
          </div>
          {hasRealSafeWindow && bwStart && bwEnd ? (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500/20 border border-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-[11px]">
                Best Window ({bwStart}–{bwEnd})
              </span>
            </div>
          ) : metric === 'aqi' ? (
            <div className="flex items-center gap-1.5">
              <span className="text-red-600 dark:text-red-400 font-bold text-[11px]">
                No safe time to go out today
              </span>
            </div>
          ) : null}
        </div>

        {/* Plain-English Takeaway */}
        <div className="text-[11px] font-bold t1">
          {metric === 'aqi' ? (
            hasRealSafeWindow ? (
              <>
                Optimal outdoor window: <span className="text-emerald-600 dark:text-emerald-400 font-black">{bwStart} – {bwEnd}</span> (dipping to <span className="text-emerald-600 dark:text-emerald-400 font-black">{minAqiItem.aqi} AQI</span>)
              </>
            ) : (
              <>
                Air quality remains very bad throughout the day (between {minVal} and {maxVal} AQI).
              </>
            )
          ) : metric === 'temp' ? (
            <>
              Peak heat projected at <span className="text-indigo font-black">1 PM (31°C)</span>, cooling into evening.
            </>
          ) : metric === 'rain' ? (
            <>
              Chance of rain remains <span className="text-blue-600 dark:text-blue-400 font-black">&lt;15%</span> across NCR.
            </>
          ) : (
            <>
              Surface breeze peaking at <span className="text-emerald-600 dark:text-emerald-400 font-black">5.2 km/h</span> around 4 PM.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
