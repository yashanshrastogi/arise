import asyncio
from unittest.mock import patch
import httpx
from app.cache.repository import get_cache_repository
from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService

async def test_failure_matrix():
    env_service = EnvironmentService()
    forecast_service = ForecastService()
    
    # Pre-populate cache with initial live data
    get_cache_repository().clear()
    initial_snapshot = await env_service.get_environmental_snapshot(force_demo=False)
    
    # 1. OpenAQ DOWN -> Weather continues
    print("Test 1: OpenAQ DOWN -> Weather continues")
    async def mock_openaq_down(client, url, *args, **kwargs):
        if "openaq.org" in str(url):
            raise httpx.ConnectTimeout("OpenAQ outage")
        return await client.get_original(url, *args, **kwargs)
    
    with patch.object(env_service.air_service.primary_provider, "get_nearby_stations", side_effect=httpx.ConnectTimeout("OpenAQ down")):
        snap = await env_service.get_environmental_snapshot(force_demo=False)
        assert snap.weather is not None, "Weather must continue when OpenAQ is down"
        assert snap.weather.temperature > 0, "Weather temperature must be valid"
        print(f"  OK: Weather temperature={snap.weather.temperature}°C, AQI={snap.aqi}")

    # 2. Weather DOWN -> AQI continues
    print("\nTest 2: Weather DOWN -> AQI continues")
    with patch.object(env_service.weather_provider, "get_current_weather", side_effect=httpx.ConnectTimeout("Weather down")):
        snap = await env_service.get_environmental_snapshot(force_demo=False)
        assert snap.aqi > 0, "AQI must continue when weather is down"
        assert len(snap.contributing_stations) > 0, "Stations must continue"
        print(f"  OK: AQI={snap.aqi}, Stations={len(snap.contributing_stations)}")

    # 3. FIRMS DOWN -> AQI and Weather continue
    print("\nTest 3: FIRMS DOWN -> AQI/Weather continue")
    with patch.object(env_service.fire_provider, "get_regional_fire_signals", side_effect=httpx.ConnectTimeout("FIRMS down")):
        snap = await env_service.get_environmental_snapshot(force_demo=False)
        assert snap.aqi > 0, "AQI must continue"
        assert snap.weather is not None, "Weather must continue"
        print(f"  OK: AQI={snap.aqi}, Weather={snap.weather.temperature}°C, Fire signals={len(snap.fire_signals)}")

    # 4. No cache, all providers down -> safe clean handling
    print("\nTest 4: No cache, all providers down -> safe handling")
    get_cache_repository().clear()
    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectTimeout("Global network outage")):
        snap = await env_service.get_environmental_snapshot(force_demo=False)
        fc = await forecast_service.get_forecast(28.6139, 77.2090, current_aqi=snap.aqi, force_demo=False)
        payload = env_service.format_ui_payload(snap, fc)
        assert payload is not None
        assert "aqi" in payload
        assert "weather" in payload
        assert "verdict" in payload
        print(f"  OK: Handled complete outage safely, verdict={payload.get('verdict')}")

    print("\nSUCCESS: Network Failure Matrix completely validated!")

if __name__ == "__main__":
    asyncio.run(test_failure_matrix())
