import React from 'react';
import InfoTooltip from './InfoTooltip';

export default function WeatherCard({ weather, aqi }) {
  if (!weather) return null;

  return (
    <div className="card p-5 h-full flex flex-col justify-between" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌤️</span>
          <div>
            <h3 className="text-base font-black t1">Weather &amp; Wind</h3>
            <p className="text-xs sm:text-sm font-semibold tm">Local conditions</p>
          </div>
        </div>
      </div>

      {/* Main Temp & Condition */}
      <div className="flex items-center justify-between py-2 px-1">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl lg:text-4xl font-black t1 leading-none tabular-nums" data-testid="weather-temp">
              {weather.temp != null ? `${typeof weather.temp === 'number' ? Math.round(weather.temp) : weather.temp}°C` : '—'}
            </span>
            <span className="text-xs sm:text-sm font-bold tm tabular-nums">
              {weather.feelsLike != null ? `Feels like ${typeof weather.feelsLike === 'number' ? Math.round(weather.feelsLike) : weather.feelsLike}°C` : 'Feels like —'}
            </span>
          </div>
          <div className="text-xs sm:text-sm font-bold t2 mt-1.5 flex items-center gap-1.5">
            <span>{weather.icon || '🌤️'}</span>
            <span>{weather.condition || 'Unavailable'}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs sm:text-sm font-bold tm">
            Visibility: <span className="font-extrabold t1 tabular-nums">{weather.visibility != null ? `${typeof weather.visibility === 'number' ? Number(weather.visibility).toFixed(1) : weather.visibility} km` : '—'}</span>
          </div>
          <div className="text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-1 tabular-nums">
            {weather.humidity != null ? `${weather.humidity}% Humidity` : ''}
          </div>
        </div>
      </div>

      {/* Weather Grid Indicators */}
      <div
        className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-2xl border my-2 text-center"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-xs font-bold uppercase tm">Chance of rain</div>
          <div className="text-sm sm:text-base font-black t1 mt-0.5 tabular-nums">{weather.rainProb != null ? `${weather.rainProb}%` : '—'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tm">Cloud cover</div>
          <div className="text-sm sm:text-base font-black t1 mt-0.5 tabular-nums">{weather.cloudCover != null ? `${weather.cloudCover}%` : '—'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tm">Humidity</div>
          <div className="text-sm sm:text-base font-black t1 mt-0.5 tabular-nums">{weather.humidity != null ? `${weather.humidity}%` : '—'}</div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tm flex items-center justify-center gap-1">
            <span>Sun strength</span>
          </div>
          <div className="text-sm sm:text-base font-black t1 mt-0.5 tabular-nums">{weather.uvIndex != null ? `${typeof weather.uvIndex === 'number' ? Math.round(weather.uvIndex) : weather.uvIndex} (UV)` : '—'}</div>
        </div>
      </div>

      {/* Weather Correlation Box */}
      <div
        className="p-3.5 rounded-2xl border text-xs sm:text-sm leading-snug"
        style={{
          background: (aqi || 0) > 300 ? 'var(--poor-bg)' : 'var(--good-bg)',
          borderColor: (aqi || 0) > 300 ? 'var(--poor)' : 'var(--good)',
        }}
      >
        <div className="flex items-center gap-1.5 font-black mb-1" style={{ color: (aqi || 0) > 300 ? 'var(--poor-ink)' : 'var(--good-ink)' }}>
          <span className="text-xs sm:text-sm uppercase tracking-wider font-extrabold flex items-center gap-1.5">
            <span>{(aqi || 0) > 300 ? 'Thermal & Moisture Impact' : 'Atmospheric Conditions'}</span>
            <InfoTooltip
              title="Weather & Air Quality Link"
              text="Temperature, humidity, and atmospheric pressure interact directly with air pollution. Cool, humid air condenses airborne particulates and prevents them from rising away."
              impact="High humidity combined with stagnant air exacerbates breathing discomfort."
            />
          </span>
        </div>
        <p className="text-xs sm:text-sm font-semibold t1 leading-relaxed">
          {weather.correlation || ((aqi || 0) > 300 ? 'Cooler ambient air and moisture condense particulates near ground level.' : 'Favorable temperature and mixing allow clean air circulation.')}
        </p>
      </div>

      {/* Sunrise / Sunset */}
      <div className="flex items-center justify-between text-sm sm:text-base font-bold t1 pt-2.5 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span>🌅 Sunrise: {weather.sunrise || '—'}</span>
        <span>🌇 Sunset: {weather.sunset || '—'}</span>
      </div>
    </div>
  );
}
