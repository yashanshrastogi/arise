import asyncio
import json
from app.cache.repository import get_cache_repository
from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService

async def main():
    get_cache_repository().clear()
    env_service = EnvironmentService()
    forecast_service = ForecastService()
    
    print("Executing full environmental pipeline for Delhi (lat: 28.6139, lon: 77.2090, demo=False)...")
    snapshot = await env_service.get_environmental_snapshot(
        lat=28.6139, lon=77.2090, persona="General Public", force_demo=False
    )
    
    forecast_bundle = await forecast_service.get_forecast(
        lat=28.6139, lon=77.2090, current_aqi=snapshot.aqi, force_demo=False
    )
    
    payload = env_service.format_ui_payload(snapshot, forecast_bundle)
    
    print("=== LIVE PIPELINE RESULTS ===")
    print(f"Location: {payload.get('location')}")
    print(f"Updated: {payload.get('updated')}")
    print(f"Is Demo: {payload.get('isDemo')}")
    print(f"Is Stale: {payload.get('isStale')}")
    print(f"AQI: {payload.get('aqi')}")
    print(f"Status: {payload.get('status')}")
    print(f"Dominant Pollutant: {payload.get('dominantPollutant')}")
    print(f"Verdict: {payload.get('verdict')}")
    print(f"Best Window: {payload.get('bestWindow')}")
    print(f"Contributing Stations Count: {len(payload.get('stations', []))}")
    for s in payload.get('stations', [])[:3]:
        print(f"  Station: {s.get('name')} (AQI: {s.get('aqi')}, PM2.5: {s.get('pm25')})")
    print(f"Fire Signals Count: {len(payload.get('fires', []))}")
    print(f"Weather: Temp={payload.get('weather', {}).get('temp')}°C, Wind={payload.get('weather', {}).get('windSpeed')} km/h {payload.get('weather', {}).get('windDirection')}, RainProb={payload.get('weather', {}).get('rainProb')}%, Condition={payload.get('weather', {}).get('condition')}")
    print(f"Pollutants count: {len(payload.get('pollutants', []))}")
    for p in payload.get('pollutants', []):
        print(f"  {p.get('name')}: {p.get('value')} {p.get('unit')} (Sub-index: {p.get('aqi')}, Status: {p.get('status')})")
    print(f"Forecast 24h count: {len(payload.get('forecast', []))}")
    print(f"Forecast 7-day count: {len(payload.get('forecast7Day', []))}")
    for day in payload.get('forecast7Day', []):
        print(f"  {day.get('day')}: AQI={day.get('aqi')} ({day.get('status')}), Temp={day.get('temp')}°C, Rain={day.get('rainProb')}%, Wind={day.get('windSpeed')}km/h, Cond={day.get('condition')}")

if __name__ == "__main__":
    asyncio.run(main())
