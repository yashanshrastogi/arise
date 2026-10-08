import React from 'react';

/**
 * Weather Intelligence Card
 * Displays ambient meteorological conditions and provides deterministic
 * correlation with particulate accumulation / dispersion over Delhi-NCR.
 */
export default function WeatherCard({ weather, aqi }) {
  if (!weather) return null;

  return (
    <div className="card p-5 h-full flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌤️</span>
          <div>
            <h3 className="text-sm font-black t1">Weather Intelligence</h3>
            <p className="text-[10px] font-bold tm">Delhi-NCR Surface Dynamics</p>
          </div>
        </div>
        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo/10 text-indigo uppercase">
          Meteorology
        </span>
      </div>

      {/* Main Temp & Condition Hero */}
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
          <div className="text-xs font-black text-indigo">
            {weather.windSpeed} km/h · {weather.windDirection}
          </div>
          <div className="text-[10px] font-bold tm mt-1">
            Visibility: <span className="font-extrabold t1">{weather.visibility} km</span>
          </div>
        </div>
      </div>

      {/* Weather Grid Indicators */}
      <div
        className="grid grid-cols-4 gap-2 p-2.5 rounded-2xl border my-2 text-center"
        style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}
      >
        <div>
          <div className="text-[9px] font-black uppercase tm">Rain Prob</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.rainProb}%</div>
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tm">Cloud</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.cloudCover}%</div>
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tm">Humidity</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.humidity}%</div>
        </div>
        <div>
          <div className="text-[9px] font-black uppercase tm">UV Index</div>
          <div className="text-xs font-black t1 mt-0.5">{weather.uvIndex}</div>
        </div>
      </div>

      {/* Weather + AQI Correlation Box (Deterministic Rule-Based) */}
      <div
        className="p-3 rounded-2xl border text-xs leading-snug"
        style={{
          background: aqi > 300 ? '#F28C2812' : '#2EB87212',
          borderColor: aqi > 300 ? '#F28C2840' : '#2EB87240',
        }}
      >
        <div className="flex items-center gap-1.5 font-black mb-1" style={{ color: aqi > 300 ? '#F28C28' : '#2EB872' }}>
          <span>ⓘ</span>
          <span className="text-[10px] uppercase tracking-wider">Air + Weather Correlation</span>
        </div>
        <p className="text-[11px] font-semibold t1 leading-tight">
          {weather.correlation}
        </p>
      </div>

      {/* Sunrise / Sunset */}
      <div className="flex items-center justify-between text-[10px] font-bold tm pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <span>🌅 Sunrise: {weather.sunrise}</span>
        <span>🌇 Sunset: {weather.sunset}</span>
      </div>
    </div>
  );
}
