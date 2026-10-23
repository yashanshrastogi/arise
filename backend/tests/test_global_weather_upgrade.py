"""
Comprehensive Verification Test Suite for Arise Global Weather & Bedrock Upgrade.

Covers:
1. Worldwide coordinates & local timezones (London, New York, Tokyo, Sydney).
2. Input validation for coordinates (boundary enforcement ge=-90, le=90, ge=-180, le=180).
3. Real visibility and UV parsing without hardcoded Delhi fallbacks.
4. Provider provenance and observation timestamps.
5. Caching: 150-second fresh window and 1,800-second stale grace period.
6. Multi-Lambda / concurrent request coalescing via acquire_fetch_lock / release_fetch_lock.
7. Secondary provider fallback (OpenWeather) with metric conversions.
8. Amazon Bedrock Nova Lite (us.amazon.nova-lite-v1:0) with permissions/timeout fallback.
"""

import asyncio
from datetime import datetime, timedelta, timezone
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
from fastapi.testclient import TestClient

from app.cache.repository import (
    CacheEntry,
    MemoryCacheRepository,
    get_cache_repository,
    get_geographic_cell,
)
from app.core.config import Settings
from app.domain.models import WeatherSnapshot
from app.sources.weather import (
    OpenMeteoWeatherProvider,
    OpenWeatherProvider,
    degrees_to_cardinal,
    wmo_code_to_condition,
)
from app.agents.arise_agent import AriseAgent
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.sources.demo import DemoAirProvider
from app.services.forecast import ForecastService
from app.services.environment import EnvironmentService
from main import app


class TestGlobalWeatherUpgrade(unittest.IsolatedAsyncioTestCase):
    """Test suite covering the 7 core requirements of the Arise Global Upgrade."""

    def setUp(self):
        self.client = TestClient(app)
        self.cache = get_cache_repository()
        self.cache.clear()

    def tearDown(self):
        self.cache.clear()

    # -------------------------------------------------------------------------
    # 1. Geographic Cell Resolution & Coordinate Validation
    # -------------------------------------------------------------------------
    def test_geographic_grid_resolution_and_physical_dimensions(self):
        """
        Verify that 0.02-degree cell rounding works globally and documents
        varying longitudinal physical distance by latitude.
        """
        # Delhi (~28.6 deg N)
        delhi_lat, delhi_lon, delhi_key = get_geographic_cell(28.6139, 77.2090, resolution_deg=0.02)
        self.assertEqual(delhi_lat, 28.62)
        self.assertEqual(delhi_lon, 77.2)
        self.assertEqual(delhi_key, "weather:cell:28.6200:77.2000")

        # London (~51.5 deg N)
        lon_lat, lon_lon, lon_key = get_geographic_cell(51.5074, -0.1278, resolution_deg=0.02)
        self.assertEqual(lon_lat, 51.5)
        self.assertEqual(lon_lon, -0.12)
        self.assertEqual(lon_key, "weather:cell:51.5000:-0.1200")

        # Custom resolution test
        c_lat, c_lon, c_key = get_geographic_cell(40.7128, -74.0060, resolution_deg=0.05)
        self.assertEqual(c_lat, 40.7)
        self.assertEqual(c_lon, -74.0)
        self.assertEqual(c_key, "weather:cell:40.7000:-74.0000")

    def test_api_route_coordinate_validation(self):
        """Verify endpoints reject invalid coordinates with HTTP 422."""
        # Latitude out of bounds (> 90)
        res = self.client.get("/weather/now?lat=95.0&lon=77.0")
        self.assertEqual(res.status_code, 422)

        # Latitude out of bounds (< -90)
        res = self.client.get("/weather/now?lat=-95.0&lon=77.0")
        self.assertEqual(res.status_code, 422)

        # Longitude out of bounds (> 180)
        res = self.client.get("/weather/now?lat=28.0&lon=185.0")
        self.assertEqual(res.status_code, 422)

        # Missing required lat or lon
        res = self.client.get("/weather/now")
        self.assertEqual(res.status_code, 422)

        res = self.client.get("/environment")
        self.assertEqual(res.status_code, 422)

        res = self.client.get("/forecast")
        self.assertEqual(res.status_code, 422)

        res = self.client.get("/air/now")
        self.assertEqual(res.status_code, 422)

        res = self.client.get("/verdict")
        self.assertEqual(res.status_code, 422)

    # -------------------------------------------------------------------------
    # 2. Worldwide Weather & Local Timezone Support
    # -------------------------------------------------------------------------
    async def test_worldwide_coordinates_and_local_timezones(self):
        """
        Verify OpenMeteoWeatherProvider extracts genuine local timezones
        and doesn't return Delhi fallbacks for worldwide locations.
        """
        mock_open_meteo_response = {
            "timezone": "America/New_York",
            "current": {
                "temperature_2m": 15.4,
                "apparent_temperature": 14.8,
                "relative_humidity_2m": 62.0,
                "cloud_cover": 45.0,
                "precipitation": 0.0,
                "weather_code": 1,
                "wind_speed_10m": 12.5,
                "wind_direction_10m": 220.0,
                "surface_pressure": 1014.2,
                "dew_point_2m": 8.1,
                "visibility": 10000.0,  # 10 km
            },
            "daily": {
                "sunrise": ["2026-10-18T07:10"],
                "sunset": ["2026-10-18T18:15"],
                "uv_index_max": [4.2],
            }
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = mock_open_meteo_response
            mock_get.return_value = mock_resp

            provider = OpenMeteoWeatherProvider()
            snap = await provider.get_current_weather(lat=40.7128, lon=-74.0060)

            self.assertEqual(snap.temperature, 15.4)
            self.assertEqual(snap.local_timezone, "America/New_York")
            self.assertEqual(snap.visibility, 10.0)  # Converted to km
            self.assertEqual(snap.uv_index, 4.2)
            self.assertEqual(snap.source, "Open-Meteo")
            self.assertEqual(snap.data_provenance, "numerical_weather_prediction")
            self.assertFalse(snap.is_stale)
            self.assertEqual(snap.surface_pressure, 1014.2)
            self.assertEqual(snap.dew_point, 8.1)

    # -------------------------------------------------------------------------
    # 3. Weather Caching: 150s Fresh Window & 1,800s Stale Grace Period
    # -------------------------------------------------------------------------
    async def test_weather_caching_fresh_and_stale_grace_windows(self):
        """
        Verify 150-second fresh window and 1,800-second stale grace period.
        """
        mock_open_meteo_response = {
            "timezone": "Europe/London",
            "current": {
                "temperature_2m": 12.0,
                "apparent_temperature": 11.5,
                "relative_humidity_2m": 70.0,
                "cloud_cover": 80.0,
                "precipitation": 0.0,
                "weather_code": 3,
                "wind_speed_10m": 8.0,
                "wind_direction_10m": 180.0,
                "surface_pressure": 1008.0,
                "dew_point_2m": 6.5,
                "visibility": 8000.0,
            },
            "daily": {
                "sunrise": ["2026-10-18T07:30"],
                "sunset": ["2026-10-18T17:55"],
                "uv_index_max": [2.5],
            }
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = mock_open_meteo_response
            mock_get.return_value = mock_resp

            provider = OpenMeteoWeatherProvider()
            provider.cache = MemoryCacheRepository()
            lat, lon = 51.5074, -0.1278

            # Call 1: Fetches upstream and caches
            snap1 = await provider.get_current_weather(lat, lon)
            self.assertEqual(snap1.temperature, 12.0)
            self.assertEqual(mock_get.call_count, 1)

            # Call 2 (within fresh 150s window): Serves fresh cache without network call
            snap2 = await provider.get_current_weather(lat, lon)
            self.assertEqual(snap2.temperature, 12.0)
            self.assertFalse(snap2.is_stale)
            self.assertEqual(mock_get.call_count, 1)

            # Simulate passage of 200 seconds (past 150s fresh TTL, but within 1800s grace)
            _, _, cache_key = get_geographic_cell(lat, lon, resolution_deg=provider.grid_res)
            entry = provider.cache.get(cache_key, allow_stale=True)
            self.assertIsNotNone(entry)

            # Manually age the entry to 200 seconds ago
            now = datetime.now(timezone.utc)
            aged_entry = CacheEntry(
                key=cache_key,
                value=entry.value,
                fetched_at=(now - timedelta(seconds=200)).isoformat(),
                expires_at=(now - timedelta(seconds=50)).isoformat(),  # expired 50s ago
                grace_expires_at=(now + timedelta(seconds=1600)).isoformat(),  # still valid for 1600s
                source="Open-Meteo",
                ttl_seconds=150,
                grace_seconds=1800,
            )
            provider.cache._store[cache_key] = aged_entry

            # Mock upstream failure (e.g. 503)
            mock_resp.status_code = 503
            mock_resp.json.return_value = {}

            # Call 3: Upstream fails -> serves stale cache with is_stale=True
            snap3 = await provider.get_current_weather(lat, lon)
            self.assertEqual(snap3.temperature, 12.0)
            self.assertTrue(snap3.is_stale)

            # Simulate passage of 2000 seconds (past 1800s grace window)
            expired_grace_entry = CacheEntry(
                key=cache_key,
                value=entry.value,
                fetched_at=(now - timedelta(seconds=2500)).isoformat(),
                expires_at=(now - timedelta(seconds=2350)).isoformat(),
                grace_expires_at=(now - timedelta(seconds=550)).isoformat(),  # grace expired!
                source="Open-Meteo",
                ttl_seconds=150,
                grace_seconds=1800,
            )
            provider.cache._store[cache_key] = expired_grace_entry

            # Call 4: Past grace period and upstream fails -> returns honest degraded response
            snap4 = await provider.get_current_weather(lat, lon)
            self.assertEqual(snap4.data_provenance, "degraded")
            self.assertIsNone(snap4.temperature)
            self.assertEqual(snap4.source, "Unavailable")

    # -------------------------------------------------------------------------
    # 4. Multi-Lambda / Concurrent Request Coalescing
    # -------------------------------------------------------------------------
    async def test_concurrent_request_coalescing(self):
        """
        Verify acquire_fetch_lock coordinates across concurrent requests so
        only one worker fetches upstream while others await cache population.
        """
        lock_key = "weather:cell:28.6200:77.2000"

        # Worker 1 acquires lock
        has_lock_1 = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertTrue(has_lock_1)

        # Worker 2 attempts to acquire lock on same cell: must be denied
        has_lock_2 = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertFalse(has_lock_2)

        # Worker 1 completes fetch and releases lock
        self.cache.release_fetch_lock(lock_key)

        # Worker 3 can now acquire lock
        has_lock_3 = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertTrue(has_lock_3)
        self.cache.release_fetch_lock(lock_key)

    async def test_fetch_lock_released_on_upstream_non_200_or_failure(self):
        """
        Verify that even if Open-Meteo returns a non-200 HTTP status (e.g. 503)
        or throws a connection error, the acquired fetch lock is released immediately
        in the finally block so subsequent requests are never blocked.
        """
        provider = OpenMeteoWeatherProvider()
        lat, lon = 28.6139, 77.2090
        _, _, cache_key = get_geographic_cell(lat, lon, resolution_deg=provider.grid_res)

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 503  # Upstream service unavailable
            mock_get.return_value = mock_resp

            # Fetch fails and returns degraded or fallback snapshot
            snap = await provider.get_current_weather(lat, lon)
            self.assertIsNotNone(snap)

            # Lock MUST be released immediately, not remaining active for the 8s lease
            can_acquire_immediately = self.cache.acquire_fetch_lock(cache_key, lease_seconds=5)
            self.assertTrue(can_acquire_immediately, "Fetch lock was not released after upstream non-200 failure!")
            self.cache.release_fetch_lock(cache_key)

    # -------------------------------------------------------------------------
    # 5. Secondary Provider Fallback (OpenWeather)
    # -------------------------------------------------------------------------
    async def test_openweather_secondary_fallback(self):
        """
        Verify OpenWeather fallback is triggered when Open-Meteo fails,
        with correct unit conversions (m/s to km/h, visibility to km).
        """
        openweather_payload = {
            "weather": [{"id": 800, "main": "Clear", "description": "clear sky"}],
            "main": {
                "temp": 22.5,
                "feels_like": 21.8,
                "humidity": 48.0,
                "pressure": 1013,
            },
            "visibility": 9500,  # 9.5 km
            "wind": {"speed": 4.5, "deg": 180},  # 4.5 m/s = 16.2 km/h
            "clouds": {"all": 10},
            "dt": 1729245600,
            "sys": {
                "sunrise": 1729221600,
                "sunset": 1729263600,
            },
            "timezone": 19800,  # +05:30
        }

        ow_provider = OpenWeatherProvider(api_key="mock_ow_key")

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = openweather_payload
            mock_get.return_value = mock_resp

            snap = await ow_provider.get_current_weather(28.6139, 77.2090)

            self.assertEqual(snap.source, "OpenWeather")
            self.assertEqual(snap.temperature, 22.5)
            self.assertEqual(snap.feels_like, 21.8)
            self.assertEqual(snap.humidity, 48.0)
            self.assertEqual(snap.visibility, 9.5)  # 9500m / 1000 = 9.5 km
            self.assertEqual(snap.wind_speed, 16.2)  # 4.5 * 3.6 = 16.2 km/h
            self.assertEqual(snap.wind_direction, "S")  # 180 deg
            self.assertEqual(snap.condition_text, "Clear Sky")
            self.assertEqual(snap.data_provenance, "station_observation")

    # -------------------------------------------------------------------------
    # 6. Amazon Bedrock Nova Lite & Deterministic Fallback
    # -------------------------------------------------------------------------
    async def test_bedrock_nova_lite_success_and_verdict_preservation(self):
        """
        Verify that Bedrock Nova Lite responses are honored, labeled properly,
        and cannot override the deterministic environmental verdict.
        """
        mock_bedrock_resp = AskAriseVerdictResponse(
            verdict="GO",  # Bedrock attempts to return GO...
            headline="Air conditions appear acceptable today.",
            aqi=320,
            category="Very Poor",
            why=["Atmospheric dispersion is calm."],
            do=["Exercise caution."],
            best_window="3 PM – 5 PM",
            recheck_at="4:00 PM",
            sources=["CPCB Ground Stations"],
            provider="bedrock",
        )

        with patch("app.agents.arise_agent.get_settings") as mock_settings, \
             patch("app.agents.arise_agent.get_verdict", return_value={"verdict": "STAY_IN", "aqi": 320, "category": "Very Poor"}), \
             patch("app.agents.arise_agent.Agent.invoke_async", new_callable=AsyncMock) as mock_invoke:

            mock_settings.return_value = Settings(
                MODE="local",
                LLM_PROVIDER="bedrock",
                BEDROCK_MODEL_ID="us.amazon.nova-lite-v1:0",
                AWS_REGION="us-east-1",
            )
            mock_invoke.return_value = mock_bedrock_resp
            agent = AriseAgent()

            req = AskAriseRequest(
                question="Can I go running outside now?",
                lat=28.6139,
                lon=77.2090,
                persona="Athlete",
                demo=True,
            )
            res = await agent.answer(req)

            # Verdict integrity: Bedrock cannot override authoritative STAY_IN verdict!
            self.assertEqual(res.verdict, "STAY_IN")
            self.assertEqual(res.provider, "bedrock")
            self.assertIn("us.amazon.nova-lite-v1:0", res.assistant_label)
            self.assertFalse(res.is_rule_based)

    async def test_bedrock_permission_and_timeout_fallbacks(self):
        """
        Verify that AccessDeniedException (IAM failure) or Timeout triggers
        the circuit breaker and falls back to deterministic rule-based output.
        """
        # 1. Simulate IAM / AccessDenied failure
        with patch("app.agents.arise_agent.get_settings") as mock_settings, \
             patch("app.agents.arise_agent.Agent.invoke_async", side_effect=Exception("AccessDeniedException: User is not authorized to perform: bedrock:InvokeModel")):

            mock_settings.return_value = Settings(
                MODE="local",
                LLM_PROVIDER="bedrock",
                BEDROCK_MODEL_ID="us.amazon.nova-lite-v1:0",
                AWS_REGION="us-east-1",
            )
            agent = AriseAgent()

            req = AskAriseRequest(
                question="Why is air quality poor today?",
                lat=28.6139,
                lon=77.2090,
                persona="General Public",
                demo=True,
            )
            res = await agent.answer(req)

            # Must fall back to rule-based engine cleanly
            self.assertEqual(res.provider, "rule-based")
            self.assertEqual(res.assistant_label, "Arise Assistant (rule-based)")
            self.assertTrue(res.is_rule_based)
            self.assertIn("Arise Assistant (rule-based)", res.sources)
            self.assertIsNotNone(res.headline)

    # -------------------------------------------------------------------------
    # Priority 1: Geographic Integrity Regression Tests
    # -------------------------------------------------------------------------
    async def test_priority_1_london_coordinates_never_receive_delhi_station_data(self):
        """
        Verify that London coordinates (51.5074, -0.1278) never receive Delhi ground
        station data, returning explicit unavailable status for air quality.
        """
        # 1. Direct DemoAirProvider distance check
        demo_provider = DemoAirProvider()
        london_demo_stations = await demo_provider.get_nearby_stations(51.5074, -0.1278, radius_km=35.0)
        self.assertEqual(len(london_demo_stations), 0, "Demo provider must return 0 stations for London")

        # 2. /air/now endpoint check (demo mode must return 0 stations for London, never Delhi stations)
        res_air_demo = self.client.get("/air/now?lat=51.5074&lon=-0.1278&demo=true")
        self.assertEqual(res_air_demo.status_code, 200)
        air_data_demo = res_air_demo.json()
        self.assertIsNone(air_data_demo.get("aqi"), "AQI must be None for London in demo mode")
        self.assertEqual(air_data_demo.get("category"), "Unavailable")
        self.assertEqual(air_data_demo.get("quality"), "unavailable")
        self.assertEqual(len(air_data_demo.get("contributing_stations", [])), 0)
        self.assertEqual(len(air_data_demo.get("pollutants", {})), 0)

        # 3. /environment endpoint check (demo mode must never inject Delhi stations into London)
        res_env_demo = self.client.get("/environment?lat=51.5074&lon=-0.1278&demo=true")
        self.assertEqual(res_env_demo.status_code, 200)
        env_data_demo = res_env_demo.json()
        self.assertIsNone(env_data_demo.get("aqi"), "Unified payload AQI must be None for London in demo mode")
        self.assertEqual(env_data_demo.get("status"), "Unavailable")
        self.assertIn("No ground stations in range", env_data_demo.get("location", ""))
        self.assertEqual(len(env_data_demo.get("pollutants", [])), 0)
        self.assertEqual(len(env_data_demo.get("stations", [])), 0)

        # 4. Global unmonitored coordinates (e.g. Atlantic Ocean 0.0, -30.0) with demo=false
        # must return explicit Unavailable and never fall back to Delhi stations
        res_ocean = self.client.get("/air/now?lat=0.0&lon=-30.0&demo=false")
        self.assertEqual(res_ocean.status_code, 200)
        ocean_data = res_ocean.json()
        self.assertIsNone(ocean_data.get("aqi"), "Unmonitored ocean coordinates must return AQI=None")
        self.assertEqual(ocean_data.get("category"), "Unavailable")
        self.assertEqual(len(ocean_data.get("contributing_stations", [])), 0)

    # -------------------------------------------------------------------------
    # Priority 2: DynamoDB Fetch-Lock Ownership & Fencing
    # -------------------------------------------------------------------------
    def test_priority_2_fetch_lock_ownership_token_fencing(self):
        """
        Verify that lock ownership tokens prevent stale workers from releasing
        active locks held by newer workers.
        """
        lock_key = "test:fencing:cell:100"

        # Worker A acquires lock with 1-second lease
        token_a = self.cache.acquire_fetch_lock(lock_key, lease_seconds=1)
        self.assertIsNotNone(token_a)
        self.assertIsInstance(token_a, str)

        # Worker B tries to acquire immediately: must be denied
        token_b_early = self.cache.acquire_fetch_lock(lock_key, lease_seconds=1)
        self.assertIsNone(token_b_early)

        # Simulate Worker A lease expiry
        import time
        time.sleep(1.05)

        # Worker B acquires new lock after A's lease expired
        token_b = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertIsNotNone(token_b)
        self.assertNotEqual(token_a, token_b)

        # Worker A wakes up and attempts to release with stale token_a: MUST FAIL
        released_a = self.cache.release_fetch_lock(lock_key, token=token_a)
        self.assertFalse(released_a, "Stale worker A must not be allowed to release lock")

        # Verify Worker B's lock is STILL held: Worker C cannot acquire
        token_c = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertIsNone(token_c, "Worker B's active lock must not have been released by Worker A")

        # Worker B releases with valid token_b: MUST SUCCEED
        released_b = self.cache.release_fetch_lock(lock_key, token=token_b)
        self.assertTrue(released_b)

        # Now Worker C can acquire
        token_c_after = self.cache.acquire_fetch_lock(lock_key, lease_seconds=5)
        self.assertIsNotNone(token_c_after)
        self.cache.release_fetch_lock(lock_key, token=token_c_after)

    # -------------------------------------------------------------------------
    # Priority 3: Weather and Forecast Truthfulness
    # -------------------------------------------------------------------------
    async def test_priority_3_forecast_truthfulness_when_upstream_outage_demo_disabled(self):
        """
        Verify that when demo mode is disabled and upstream fails with empty cache,
        no synthetic demo points or zero-valued fallback weather measurements are returned.
        """
        provider = OpenMeteoWeatherProvider()
        forecast_service = ForecastService(weather_provider=provider)
        lat, lon = 51.5074, -0.1278

        with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectTimeout("Upstream down")):
            # Hourly forecast must return empty list, not synthetic demo points
            hourly = await provider.get_hourly_forecast(lat, lon, force_demo=False)
            self.assertEqual(hourly, [])

            # 7-day outlook must return empty list, not synthetic 14d outlook
            outlook = await provider.get_7day_outlook(lat, lon, force_demo=False)
            self.assertEqual(outlook, [])

            # Current weather must return honest degraded snapshot without 0.0 zeroes
            snap = await provider.get_current_weather(lat, lon, force_demo=False)
            self.assertEqual(snap.data_provenance, "degraded")
            self.assertEqual(snap.source, "Unavailable")
            self.assertIsNone(snap.temperature)
            self.assertIsNone(snap.humidity)
            self.assertIsNone(snap.wind_speed)

            # Unified forecast bundle
            bundle = await forecast_service.get_forecast(lat, lon, current_aqi=None, force_demo=False)
            self.assertEqual(bundle["hourly"], [])
            self.assertEqual(bundle["forecast7Day"], [])
            self.assertEqual(bundle["source"], "Unavailable")
            self.assertEqual(bundle["bestWindow"], "No recommended outdoor window")

    # -------------------------------------------------------------------------
    # Priority 4: Cache Freshness and Stale-Grace Semantics
    # -------------------------------------------------------------------------
    def test_priority_4_cache_set_and_grace_boundary_semantics(self):
        """
        Verify cache semantics using real set() path at fresh, stale, and expired boundaries.
        """
        key = "test:boundary:cell"
        ttl_seconds = 2
        grace_seconds = 4

        # Real set() call
        entry = self.cache.set(
            key=key,
            value={"metric": 42},
            ttl_seconds=ttl_seconds,
            source="test",
            grace_seconds=grace_seconds,
        )
        self.assertEqual(entry.ttl_seconds, ttl_seconds)
        self.assertEqual(entry.grace_seconds, grace_seconds)

        # 1. Fresh state immediately (t = 0)
        fresh_entry = self.cache.get(key, allow_stale=False)
        self.assertIsNotNone(fresh_entry)
        self.assertFalse(fresh_entry.is_expired)
        self.assertFalse(fresh_entry.is_grace_expired)

        # 2. Stale state (past ttl_seconds, within grace_seconds)
        import time
        time.sleep(2.35)
        stale_disallowed = self.cache.get(key, allow_stale=False)
        self.assertIsNone(stale_disallowed, "Should return None when allow_stale=False after TTL")

        stale_allowed = self.cache.get(key, allow_stale=True)
        self.assertIsNotNone(stale_allowed, "Should return stale entry within grace period")
        self.assertTrue(stale_allowed.is_expired)
        self.assertFalse(stale_allowed.is_grace_expired)

        # 3. Grace-expired state (past grace_seconds)
        time.sleep(2.3)
        grace_expired = self.cache.get(key, allow_stale=True)
        self.assertIsNone(grace_expired, "Should return None when grace period has elapsed")

    # -------------------------------------------------------------------------
    # Priority 5: Request Coalescing Polling Window & Bounded Wait
    # -------------------------------------------------------------------------
    async def test_priority_5_request_coalescing_respects_lock_and_avoids_duplicate_fetch(self):
        """
        Verify that a second worker waiting on an active lock serves stale cache
        or waits boundedly without duplicating upstream fetch.
        """
        provider = OpenMeteoWeatherProvider()
        lat, lon = 28.6139, 77.2090
        _, _, cache_key = get_geographic_cell(lat, lon, resolution_deg=provider.grid_res)

        # Pre-seed a stale cache entry
        now = datetime.now(timezone.utc)
        stale_seed = CacheEntry(
            key=cache_key,
            value={
                "timestamp": now.isoformat(),
                "temperature": 27.5,
                "feels_like": 29.0,
                "humidity": 55.0,
                "cloud_cover": 10.0,
                "rain_probability": 0.0,
                "precipitation": 0.0,
                "wind_speed": 5.0,
                "wind_direction": "NW",
                "condition_text": "Clear",
                "source": "Open-Meteo",
                "data_provenance": "cached",
                "local_timezone": "Asia/Kolkata",
                "grid_resolution_deg": 0.02,
                "is_stale": False,
            },
            fetched_at=(now - timedelta(seconds=200)).isoformat(),
            expires_at=(now - timedelta(seconds=50)).isoformat(),
            grace_expires_at=(now + timedelta(seconds=1600)).isoformat(),
            source="Open-Meteo",
            ttl_seconds=150,
            grace_seconds=1800,
        )
        mem_store = getattr(self.cache, "_memory", self.cache)._store
        mem_store[cache_key] = stale_seed

        # Worker 1 acquires lock simulating a long fetch (> 2.5s)
        lock_token = self.cache.acquire_fetch_lock(cache_key, lease_seconds=8)
        self.assertIsNotNone(lock_token)

        # Worker 2 calls get_current_weather: lock is held and upstream would take time.
        # Worker 2's coalescing loop will find stale cache and return it without duplicating upstream call!
        with patch("httpx.AsyncClient.get") as mock_get:
            snap2 = await provider.get_current_weather(lat, lon, force_demo=False)
            self.assertEqual(snap2.temperature, 27.5)
            self.assertTrue(snap2.is_stale)
            self.assertEqual(mock_get.call_count, 0, "Worker 2 must NOT execute duplicate upstream fetch")

        # Worker 1 finishes and releases lock
        self.cache.release_fetch_lock(cache_key, token=lock_token)

    # -------------------------------------------------------------------------
    # Priority 6: Forecast AQI Provenance & Missing Ground-Truth Isolation
    # -------------------------------------------------------------------------
    async def test_priority_6_london_and_new_york_forecast_provenance(self):
        """
        Verify that London and New York forecast requests:
        1. Default current_aqi to None (never injects 100 or 312).
        2. Set 7-day outlook AQI to None (never synthesizes wind-dispersion projections down to 0).
        3. Correctly label overall source as CAMS Air Quality Model or NWP, never Heuristic Dispersion.
        4. Preserve real meteorological variables across hourly and 7-day forecasts.
        """
        mock_weather_hourly = {
            "timezone": "Europe/London",
            "hourly": {
                "time": ["2026-10-19T12:00", "2026-10-19T13:00"],
                "temperature_2m": [17.0, 18.0],
                "precipitation_probability": [5, 10],
                "wind_speed_10m": [8.5, 9.0],
                "cloud_cover": [30, 40]
            }
        }
        mock_aq_hourly = {
            "hourly": {
                "us_aqi": [28, 26],
                "pm2_5": [6.8, 6.2]
            }
        }
        mock_daily = {
            "daily": {
                "time": ["2026-10-19", "2026-10-20"],
                "temperature_2m_max": [18.0, 19.0],
                "temperature_2m_min": [11.0, 12.0],
                "precipitation_probability_max": [10, 20],
                "wind_speed_10m_max": [10.0, 12.0],
                "weather_code": [1, 2]
            }
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            def side_effect(url, **kwargs):
                resp = MagicMock()
                resp.status_code = 200
                if "air-quality" in str(url):
                    resp.json.return_value = mock_aq_hourly
                elif "daily" in str(kwargs.get("params", {})):
                    resp.json.return_value = mock_daily
                else:
                    resp.json.return_value = mock_weather_hourly
                return resp

            mock_get.side_effect = side_effect

            # 1. London (/forecast)
            self.cache.clear()
            res_lon = self.client.get("/forecast?lat=51.5074&lon=-0.1278")
            self.assertEqual(res_lon.status_code, 200)
            data_lon = res_lon.json()
            self.assertEqual(data_lon["source"], "Open-Meteo NWP & CAMS Air Quality Model")
            self.assertEqual(data_lon["hourly"][0]["aqi"], 28)
            self.assertEqual(data_lon["hourly"][0]["source"], "Open-Meteo Air Quality Model")
            for day in data_lon["forecast7Day"]:
                self.assertIsNone(day["aqi"], "7-day AQI must be None without ground truth")
                self.assertEqual(day["status"], "Unavailable")
                self.assertIsNotNone(day["temp"])

            # 2. New York (/forecast)
            self.cache.clear()
            res_ny = self.client.get("/forecast?lat=40.7128&lon=-74.0060")
            self.assertEqual(res_ny.status_code, 200)
            data_ny = res_ny.json()
            self.assertEqual(data_ny["source"], "Open-Meteo NWP & CAMS Air Quality Model")
            for day in data_ny["forecast7Day"]:
                self.assertIsNone(day["aqi"])
                self.assertEqual(day["status"], "Unavailable")


if __name__ == "__main__":
    unittest.main()

