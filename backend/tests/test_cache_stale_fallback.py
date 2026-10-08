import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import httpx
from app.cache.repository import get_cache_repository
from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService

async def test_stale_cache_behavior():
    cache = get_cache_repository()
    cache.clear()
    
    env_service = EnvironmentService()
    forecast_service = ForecastService()
    
    print("1. Fetching initial LIVE data to populate cache...")
    live_snapshot = await env_service.get_environmental_snapshot(lat=28.6139, lon=77.2090, force_demo=False)
    assert not live_snapshot.is_stale, "Initial snapshot should be fresh (is_stale=False)"
    print(f"   LIVE data received: AQI={live_snapshot.aqi}, Stations={len(live_snapshot.contributing_stations)}, is_stale={live_snapshot.is_stale}")
    
    # Simulate cache expiration by artificially setting expires_at to 2 hours in the past
    print("\n2. Artificially aging cache entries to simulate expiration...")
    mem_store = getattr(cache, "_memory", cache)._store
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    for key, entry in list(mem_store.items()):
        entry.expires_at = past_iso
        assert entry.is_expired, f"Key {key} should now be expired"
    print(f"   Aged {len(mem_store)} cache entries. All are expired: {all(e.is_expired for e in mem_store.values())}")
    
    print("\n3. Simulating upstream provider outage (httpx ConnectTimeout)...")
    async def mock_network_failure(*args, **kwargs):
        raise httpx.ConnectTimeout("Simulated upstream provider network partition / outage")
    
    with patch("httpx.AsyncClient.get", side_effect=mock_network_failure):
        stale_snapshot = await env_service.get_environmental_snapshot(lat=28.6139, lon=77.2090, force_demo=False)
        forecast_bundle = await forecast_service.get_forecast(lat=28.6139, lon=77.2090, current_aqi=stale_snapshot.aqi, force_demo=False)
        payload = env_service.format_ui_payload(stale_snapshot, forecast_bundle)
        
        print("\n4. Verifying STALE cached data serving:")
        print(f"   Is Stale Flag: {stale_snapshot.is_stale}")
        print(f"   Payload isStale: {payload.get('isStale')}")
        print(f"   AQI: {payload.get('aqi')}")
        print(f"   Stations count: {len(payload.get('stations'))}")
        print(f"   Weather Temp: {payload.get('weather', {}).get('temp')}°C")
        print(f"   Verdict: {payload.get('verdict')}")
        
        # Verify dashboard remains completely functional with stale data
        assert stale_snapshot.is_stale is True, "Snapshot must be explicitly marked is_stale=True"
        assert payload.get("isStale") is True, "Payload must have isStale=True"
        assert payload.get("aqi") > 0, "AQI should be preserved from stale cache"
        assert len(payload.get("stations")) > 0, "Stations should be preserved from stale cache"
        assert payload.get("weather", {}).get("temp") is not None, "Weather should be preserved"
        print("\nSUCCESS: System seamlessly served STALE cached snapshot during simulated outage without crashing!")

if __name__ == "__main__":
    asyncio.run(test_stale_cache_behavior())
