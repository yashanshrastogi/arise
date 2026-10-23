"""
Tests for Arise Commute Intelligence — Milestone 2: Weather Along the Route.

Validates:
1. Geodesic distance calculation and representative waypoint sampling along route geometry.
2. Waypoint ETA offset calculations.
3. Open-Meteo weather integration with mocked responses.
4. Rain, wind, temperature, and fog/visibility indicator extraction.
5. Deterministic advisory synthesis without AI alteration.
6. Zero-fabrication and graceful degradation when Open-Meteo is unavailable or degraded.
7. Verification that non-Delhi coordinates never substitute Delhi data.
8. API endpoint handling of include_weather flag and response schema.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.domain.models import WeatherSnapshot
from app.services.route import (
    haversine_km,
    sample_route_waypoints,
    condition_to_icon,
    get_route_weather,
    get_route,
)
from app.sources.weather import OpenMeteoWeatherProvider
from main import app


# ---------------------------------------------------------------------------
# 1. Waypoint sampling and geometry math tests
# ---------------------------------------------------------------------------


def test_haversine_distance():
    """Verify haversine distance between known coordinates (Saket to CP ~13.7 km)."""
    # Saket: 28.5244, 77.2167; Connaught Place: 28.6315, 77.2167
    dist = haversine_km(28.5244, 77.2167, 28.6315, 77.2167)
    assert 11.0 < dist < 13.0  # Great-circle straight-line distance is ~11.9 km


def test_sample_route_waypoints_short_route():
    """Short routes (< 4 km) should sample exactly 2 points: Origin and Destination."""
    # 2 km straight line
    geom = [[28.5000, 77.2000], [28.5100, 77.2000], [28.5180, 77.2000]]
    pts = sample_route_waypoints(geom, duration_min=5.0, origin_label="Home", destination_label="Market")
    assert len(pts) == 2
    assert pts[0]["label"] == "Home"
    assert pts[0]["eta_min"] == 0.0
    assert pts[1]["label"] == "Market"
    assert pts[1]["eta_min"] == 5.0


def test_sample_route_waypoints_medium_route():
    """Medium routes (4-20 km) should sample 3 points: Origin, Midpoint, Destination."""
    # Build a 10 km route with 11 equidistant points
    geom = [[28.5000 + i * 0.009, 77.2000] for i in range(11)]
    pts = sample_route_waypoints(geom, duration_min=20.0, origin_label="Home", destination_label="Work")
    assert len(pts) == 3
    assert pts[0]["label"] == "Home"
    assert pts[0]["eta_min"] == 0.0
    assert pts[1]["label"] == "Midpoint"
    assert 9.0 <= pts[1]["eta_min"] <= 11.0
    assert pts[2]["label"] == "Work"
    assert pts[2]["eta_min"] == 20.0


def test_sample_route_waypoints_long_route():
    """Long routes (> 20 km) should sample 4 points: Origin, 33%, 67%, Destination."""
    # Build a 30 km route
    geom = [[28.5000 + i * 0.03, 77.2000] for i in range(11)]
    pts = sample_route_waypoints(geom, duration_min=45.0, origin_label="Gurugram", destination_label="Noida")
    assert len(pts) == 4
    assert pts[0]["label"] == "Gurugram"
    assert pts[0]["eta_min"] == 0.0
    assert "33%" in pts[1]["label"]
    assert "67%" in pts[2]["label"]
    assert pts[3]["label"] == "Noida"
    assert pts[3]["eta_min"] == 45.0


# ---------------------------------------------------------------------------
# 2. Weather condition and icon mapping tests
# ---------------------------------------------------------------------------


def test_condition_to_icon():
    assert condition_to_icon("Clear Sky") == "☀️"
    assert condition_to_icon("Partly Cloudy") == "🌤️"
    assert condition_to_icon("Overcast") == "☁️"
    assert condition_to_icon("Hazy Fog") == "🌫️"
    assert condition_to_icon("Rain Showers") == "🌧️"
    assert condition_to_icon("Light Drizzle") == "🌧️"
    assert condition_to_icon("Thunderstorm") == "⛈️"


# ---------------------------------------------------------------------------
# 3. Weather retrieval and fog / rain indicators
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_route_weather_clear_conditions():
    """Verify normal clear weather along corridor generates accurate points and clear advisory."""
    geom = [[28.50, 77.20], [28.55, 77.20], [28.60, 77.20]]
    
    mock_provider = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_provider.get_current_weather.return_value = WeatherSnapshot(
        timestamp="2026-10-20T08:00:00Z",
        temperature=26.5,
        feels_like=27.0,
        humidity=45.0,
        cloud_cover=10.0,
        rain_probability=5.0,
        precipitation=0.0,
        wind_speed=9.5,
        wind_direction="NW",
        visibility=8.0,
        condition_text="Clear Sky",
        source="Open-Meteo",
        data_provenance="numerical_weather_prediction",
        is_stale=False,
    )

    points, summary = await get_route_weather(
        geometry=geom,
        duration_min=18.0,
        origin_label="Saket",
        destination_label="Connaught Place",
        weather_provider=mock_provider,
    )

    assert len(points) == 3
    assert points[0]["temp_c"] == 26.5
    assert points[0]["condition"] == "Clear Sky"
    assert points[0]["icon"] == "☀️"
    assert points[0]["fog_risk"] == "None"
    assert points[0]["rain_probability"] == 5.0

    assert summary["has_rain_risk"] is False
    assert summary["has_fog_risk"] is False
    assert summary["min_temp_c"] == 26.5
    assert summary["max_wind_kmh"] == 9.5
    assert "Clear meteorological conditions" in summary["advisory"]
    assert "Open-Meteo" in summary["spatial_resolution"]


@pytest.mark.asyncio
async def test_get_route_weather_dense_fog_detection():
    """Verify visibility <= 1.0 km or WMO 45/48 triggers Dense Fog alert and caution advisory."""
    geom = [[28.50, 77.20], [28.55, 77.20], [28.60, 77.20]]
    
    mock_provider = AsyncMock(spec=OpenMeteoWeatherProvider)
    # Origin clear, Midpoint foggy, Destination clear
    def mock_weather(lat, lon):
        if abs(lat - 28.55) < 0.01:
            return WeatherSnapshot(
                timestamp="2026-10-20T06:00:00Z",
                temperature=14.0,
                humidity=95.0,
                visibility=0.8,  # 800m visibility = dense fog
                condition_text="Hazy Fog",
                wind_speed=3.0,
                wind_direction="CALM",
                source="Open-Meteo",
                data_provenance="numerical_weather_prediction",
            )
        return WeatherSnapshot(
            timestamp="2026-10-20T06:00:00Z",
            temperature=16.0,
            humidity=80.0,
            visibility=4.0,
            condition_text="Partly Cloudy",
            wind_speed=5.0,
            wind_direction="NW",
            source="Open-Meteo",
            data_provenance="numerical_weather_prediction",
        )
    mock_provider.get_current_weather.side_effect = mock_weather

    points, summary = await get_route_weather(
        geometry=geom,
        duration_min=25.0,
        weather_provider=mock_provider,
    )

    assert len(points) == 3
    assert points[1]["fog_risk"] == "Dense Fog"
    assert points[1]["visibility_km"] == 0.8
    assert points[1]["icon"] == "🌫️"

    assert summary["has_fog_risk"] is True
    assert summary["lowest_visibility_km"] == 0.8
    assert "Low visibility or fog" in summary["advisory"]


@pytest.mark.asyncio
async def test_get_route_weather_rain_detection():
    """Verify precipitation > 0 mm or high rain probability triggers rain risk and wet roads advisory."""
    geom = [[28.50, 77.20], [28.55, 77.20], [28.60, 77.20]]
    
    mock_provider = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_provider.get_current_weather.return_value = WeatherSnapshot(
        timestamp="2026-10-20T08:00:00Z",
        temperature=22.0,
        rain_probability=85.0,
        precipitation=3.2,
        wind_speed=18.0,
        condition_text="Rain Showers",
        source="Open-Meteo",
        data_provenance="numerical_weather_prediction",
    )

    points, summary = await get_route_weather(
        geometry=geom,
        duration_min=15.0,
        weather_provider=mock_provider,
    )

    assert summary["has_rain_risk"] is True
    assert "Wet road conditions" in summary["advisory"]
    assert points[0]["icon"] == "🌧️"
    assert points[0]["precipitation_mm"] == 3.2


# ---------------------------------------------------------------------------
# 4. Graceful degradation and zero-fabrication tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_route_weather_provider_failure_zero_fabrication():
    """
    If Open-Meteo fails or raises an exception, the system must NOT invent values
    or substitute Delhi data. It must return honest degraded objects (temp_c=None, condition=Unavailable).
    """
    geom = [[12.9716, 77.5946], [12.9800, 77.6000], [13.0000, 77.6200]]  # Bengaluru coordinates
    
    mock_provider = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_provider.get_current_weather.side_effect = RuntimeError("Open-Meteo network timeout")

    points, summary = await get_route_weather(
        geometry=geom,
        duration_min=30.0,
        origin_label="MG Road",
        destination_label="Whitefield",
        weather_provider=mock_provider,
    )

    assert len(points) == 3
    for pt in points:
        assert pt["temp_c"] is None
        assert pt["rain_probability"] is None
        assert pt["wind_speed_kmh"] is None
        assert pt["condition"] == "Unavailable"
        assert pt["icon"] == "—"
        assert pt["is_stale"] is True
        assert pt["data_source"] == "Unavailable"
        # Zero-fabrication: must not contain Delhi coordinates or Delhi temperatures
        assert pt["lat"] != 28.6139

    assert summary["has_rain_risk"] is False
    assert summary["has_fog_risk"] is False
    assert summary["min_temp_c"] is None
    assert summary["data_provenance"] == "degraded"
    assert "Atmospheric telemetry unavailable" in summary["advisory"]


# ---------------------------------------------------------------------------
# 5. FastApi GET /route endpoint weather integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_route_with_weather():
    """Test GET /route returns weather_points and weather_summary when include_weather=true."""
    fake_ors_route = {
        "profile": "driving-car",
        "distance_m": 12500.0,
        "distance_km": 12.5,
        "duration_s": 1020.0,
        "duration_min": 17.0,
        "geometry": [[28.5244, 77.2167], [28.5800, 77.2167], [28.6315, 77.2167]],
        "bbox": [77.2167, 28.5244, 77.2167, 28.6315],
        "source": "OpenRouteService",
    }

    mock_weather_snap = WeatherSnapshot(
        timestamp="2026-10-20T08:00:00Z",
        temperature=28.0,
        feels_like=29.0,
        humidity=50.0,
        rain_probability=10.0,
        precipitation=0.0,
        wind_speed=8.0,
        wind_direction="NW",
        visibility=6.0,
        condition_text="Partly Cloudy",
        source="Open-Meteo",
        data_provenance="numerical_weather_prediction",
    )

    with patch("app.services.route.OpenRouteServiceProvider.get_route", new=AsyncMock(return_value=fake_ors_route)), \
         patch("app.sources.weather.OpenMeteoWeatherProvider.get_current_weather", new=AsyncMock(return_value=mock_weather_snap)), \
         patch("app.services.route.get_cache_repository") as mock_cache_fn:
        
        mock_cache = MagicMock()
        mock_cache.get.return_value = None  # Force fresh fetch
        mock_cache_fn.return_value = mock_cache

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/route", params={
                "origin_lat": 28.5244,
                "origin_lon": 77.2167,
                "dest_lat": 28.6315,
                "dest_lon": 77.2167,
                "include_weather": "true",
                "origin_label": "Home",
                "destination_label": "Office",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert "weather_points" in data
            assert len(data["weather_points"]) == 3
            assert data["weather_points"][0]["label"] == "Home"
            assert data["weather_points"][0]["temp_c"] == 28.0
            assert data["weather_points"][0]["condition"] == "Partly Cloudy"
            assert data["weather_points"][0]["icon"] == "🌤️"

            assert "weather_summary" in data
            assert data["weather_summary"]["min_temp_c"] == 28.0
            assert data["weather_summary"]["spatial_resolution"] == "Open-Meteo NWP (~2 km grid resolution)"
            assert "Clear meteorological conditions" in data["weather_summary"]["advisory"]


@pytest.mark.asyncio
async def test_api_route_without_weather():
    """Test GET /route with include_weather=false omits weather fetching."""
    fake_ors_route = {
        "profile": "driving-car",
        "distance_m": 12500.0,
        "distance_km": 12.5,
        "duration_s": 1020.0,
        "duration_min": 17.0,
        "geometry": [[28.5244, 77.2167], [28.6315, 77.2167]],
        "bbox": [77.2167, 28.5244, 77.2167, 28.6315],
        "source": "OpenRouteService",
    }

    with patch("app.services.route.OpenRouteServiceProvider.get_route", new=AsyncMock(return_value=fake_ors_route)), \
         patch("app.services.route.get_cache_repository") as mock_cache_fn:
        
        mock_cache = MagicMock()
        mock_cache.get.return_value = None
        mock_cache_fn.return_value = mock_cache

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get("/route", params={
                "origin_lat": 28.5244,
                "origin_lon": 77.2167,
                "dest_lat": 28.6315,
                "dest_lon": 77.2167,
                "include_weather": "false",
            })
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("weather_points") is None
            assert data.get("weather_summary") is None
