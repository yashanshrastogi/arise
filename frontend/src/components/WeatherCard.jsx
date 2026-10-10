import React from 'react';

export default function WeatherCard({ weather, aqi }) {
  if (!weather) return null;

  return (
    <div className="card p-5 h-full flex flex-col justify-between" style={{ background: 'var(--card)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌤️</span>
          <div>
            <h3 className="text-sm font-black t1">Weather &amp; Wind</h3>
            <p className="text-xs font-semibold t3">Local conditions</p>
          </div>
        </div>
      </div>

      {/* Main Temp & Condition */}
      <div className="flex items-center justify-between py-2 px-1">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl lg:text-4xl font-black t1 leading-none">
              {weather.temp}°C
            </span>
            <span className="text-xs font-bold tm">
              Feels like {weather.feelsLike}°C
            </span>
          </div>
          <div className="text-xs font-bold t2 mt-1.5 flex items-center gap-1.5">
            <span>{weather.icon}</span>
            <span>{weather.condition}</span>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-black text-indigo-600 dark:text-indigo-400">
            {weather.windSpeed} km/h · {weather.windDirection}
          </div>
          <div className="text-xs font-bold tm mt-1">
            How far you can see: <span className="font-extrabold t1">{weather.visibility} km</span>
          </div>
        </div>
      </div>

      {/* Weather Grid Indicators (Plain-Language rewrites) */}
      <div
        className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl border my-2 text-center"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-[10px] font-bold uppercase tm">Chance of rain</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.rainProb}%</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tm">Cloud cover</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.cloudCover}%</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tm">Humidity</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.humidity}%</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tm">Sun strength</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.uvIndex}</div>
        </div>
      </div>

      {/* Weather Correlation Box */}
      <div
        className="p-3 rounded-2xl border text-xs leading-snug"
        style={{
          background: aqi > 300 ? 'var(--poor-bg)' : 'var(--good-bg)',
          borderColor: aqi > 300 ? 'var(--poor)' : 'var(--good)',
        }}
      >
        <div className="flex items-center gap-1.5 font-black mb-1" style={{ color: aqi > 300 ? 'var(--poor-ink)' : 'var(--good-ink)' }}>
          <span>ⓘ</span>
          <span className="text-[10px] uppercase tracking-wider font-extrabold">Why the air is stuck</span>
        </div>
        <p className="text-xs font-semibold t1 leading-tight">
          {weather.correlation || (aqi > 300 ? 'Calm surface wind under 4 km/h prevents smoke and dust from dispersing.' : 'Active winds help ventilate the surface layer.')}
        </p>
      </div>

      {/* Sunrise / Sunset */}
      <div className="flex items-center justify-between text-xs font-bold tm pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span>🌅 Sunrise: {weather.sunrise}</span>
        <span>🌇 Sunset: {weather.sunset}</span>
      </div>
    </div>
  );
}
