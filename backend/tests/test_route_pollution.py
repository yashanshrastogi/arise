"""
Tests for Arise Commute Intelligence — Milestone 3: Pollution Exposure Along the Route.

Validates:
1. Observed ground station telemetry via AirQualityService & LocationEstimator (IDW).
2. Data provenance tagging (observed vs modelled vs unavailable) with uncertainty notes.
3. Modelled fallback via Open-Meteo regional atmospheric models when no ground monitors are in range.
4. Zero-fabrication and graceful degradation when data is unavailable (aqi is None).
5. Non-Delhi coordinate integrity: never leaks Delhi station data into non-Delhi routes.
6. Deterministic CPCB NAQI calculations and health advisories.
7. Roadside microclimate disclaimer presence.
8. API endpoint handling of include_pollution flag and response schema.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

from app.domain.models import StationObservation, AirMeasurement, RoutePollutionPoint, RoutePollutionSummary
from app.services.location_estimator import LocationEstimator, LocalAirEstimation
from app.services.air_quality import AirQualityService
from app.sources.weather import OpenMeteoWeatherProvider
from app.services.route import (
    sample_route_waypoints,
    _fetch_single_waypoint_pollution,
    get_route_pollution,
    get_route,
)
from main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_mock_station(
    id: str,
    name: str,
    lat: float,
    lon: float,
    pm25: float = 85.0,
    pm10: float = 140.0,
    no2: float = 35.0,
    co: float = 1.2,
    source: str = "CPCB",
    is_stale: bool = False,
) -> StationObservation:
    return StationObservation(
        station_id=id,
        name=name,
        latitude=lat,
        longitude=lon,
        source=source,
        timestamp="2026-10-20T08:00:00Z",
        is_stale=is_stale,
        pollutants={
            "PM2.5": AirMeasurement(pollutant="PM2.5", value=pm25, timestamp="2026-10-20T08:00:00Z"),
            "PM10": AirMeasurement(pollutant="PM10", value=pm10, timestamp="2026-10-20T08:00:00Z"),
            "NO2": AirMeasurement(pollutant="NO2", value=no2, timestamp="2026-10-20T08:00:00Z"),
            "CO": AirMeasurement(pollutant="CO", value=co, timestamp="2026-10-20T08:00:00Z"),
        },
    )


# ---------------------------------------------------------------------------
# 1. Observed ground monitor telemetry tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_waypoint_observed_station_telemetry():
    """Ground stations within range produce 'observed' data_type, nearest station info, and IDW note."""
    wp = {"label": "Midpoint", "lat": 28.55, "lon": 77.22, "eta_min": 12.0}

    mock_air_svc = AsyncMock(spec=AirQualityService)
    station = make_mock_station("st-1", "Sri Aurobindo Marg CPCB", 28.545, 77.218, pm25=60.0, pm10=110.0)
    mock_air_svc.get_stations.return_value = [station]

    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_estimator.estimate_location_pollutants.return_value = LocalAirEstimation(
        latitude=28.55,
        longitude=77.22,
        estimated_pollutants={"PM2.5": 60.0, "PM10": 110.0, "NO2": 30.0, "CO": 0.9},
        contributing_stations=[station],
        nearest_station_id="st-1",
        nearest_station_distance_km=0.6,
        nearest_station_name="Sri Aurobindo Marg CPCB",
        confidence="high",
    )

    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)

    res = await _fetch_single_waypoint_pollution(
        wp=wp,
        air_svc=mock_air_svc,
        estimator=mock_estimator,
        weather_prov=mock_weather,
    )

    assert res["label"] == "Midpoint"
    assert res["data_type"] == "observed"
    assert res["source"] == "CPCB"
    assert res["nearest_station"] == "Sri Aurobindo Marg CPCB"
    assert res["nearest_station_distance_km"] == 0.6
    assert res["confidence"] == "high"
    assert res["aqi"] is not None
    assert res["aqi_category"] in ("Moderate", "Poor", "Satisfactory")
    assert "IDW interpolated" in res["uncertainty_note"]
    assert res["is_stale"] is False
    # Weather provider should not be called when ground monitors succeed
    mock_weather.get_current_air_quality.assert_not_called()


@pytest.mark.asyncio
async def test_waypoint_stale_station_marking():
    """If contributing stations are stale, the waypoint is flagged as is_stale: True."""
    wp = {"label": "Start", "lat": 28.52, "lon": 77.21, "eta_min": 0.0}

    mock_air_svc = AsyncMock(spec=AirQualityService)
    station = make_mock_station("st-stale", "Old Station", 28.52, 77.21, is_stale=True)
    mock_air_svc.get_stations.return_value = [station]

    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_estimator.estimate_location_pollutants.return_value = LocalAirEstimation(
        latitude=28.52,
        longitude=77.21,
        estimated_pollutants={"PM2.5": 90.0},
        contributing_stations=[station],
        nearest_station_id="st-stale",
        nearest_station_distance_km=0.02,
        nearest_station_name="Old Station",
        confidence="moderate",
    )

    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)

    res = await _fetch_single_waypoint_pollution(
        wp=wp,
        air_svc=mock_air_svc,
        estimator=mock_estimator,
        weather_prov=mock_weather,
    )

    assert res["is_stale"] is True
    assert res["data_type"] == "observed"


# ---------------------------------------------------------------------------
# 2. Modelled fallback tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_waypoint_modelled_fallback_when_no_ground_stations():
    """When no ground monitors exist in range, Open-Meteo numerical model is used with proper provenance."""
    wp = {"label": "Rural Waypoint", "lat": 27.90, "lon": 76.80, "eta_min": 35.0}

    mock_air_svc = AsyncMock(spec=AirQualityService)
    mock_air_svc.get_stations.return_value = []  # No stations

    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_estimator.estimate_location_pollutants.return_value = LocalAirEstimation(
        latitude=27.90,
        longitude=76.80,
        estimated_pollutants={},
        contributing_stations=[],
        confidence="low",
    )

    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_weather.get_current_air_quality.return_value = {
        "time": "2026-10-20T08:00",
        "pm2_5": 42.0,
        "pm10": 78.0,
        "nitrogen_dioxide": 22.0,
        "sulphur_dioxide": 8.0,
        "carbon_monoxide": 650.0,  # µg/m³
        "ozone": 35.0,
    }

    res = await _fetch_single_waypoint_pollution(
        wp=wp,
        air_svc=mock_air_svc,
        estimator=mock_estimator,
        weather_prov=mock_weather,
    )

    assert res["data_type"] == "modelled"
    assert res["source"] == "Open-Meteo"
    assert res["pm25"] == 42.0
    assert res["pm10"] == 78.0
    assert res["co"] == 0.65  # 650 µg/m³ converted to mg/m³
    assert res["aqi"] is not None
    assert res["confidence"] == "moderate"
    assert res["nearest_station"] is None
    assert "Regional atmospheric numerical model forecast" in res["uncertainty_note"]


# ---------------------------------------------------------------------------
# 3. Honest degradation / Zero-fabrication tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_waypoint_unavailable_zero_fabrication():
    """When both ground monitors and Open-Meteo fail, return honest 'unavailable' without fake scores."""
    wp = {"label": "Remote Oceanic Point", "lat": -10.0, "lon": 60.0, "eta_min": 0.0}

    mock_air_svc = AsyncMock(spec=AirQualityService)
    mock_air_svc.get_stations.side_effect = Exception("Station DB down")

    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_weather.get_current_air_quality.side_effect = Exception("Open-Meteo 503")

    res = await _fetch_single_waypoint_pollution(
        wp=wp,
        air_svc=mock_air_svc,
        estimator=mock_estimator,
        weather_prov=mock_weather,
    )

    assert res["data_type"] == "unavailable"
    assert res["aqi"] is None
    assert res["aqi_category"] == "Unavailable"
    assert res["dominant_pollutant"] == "None"
    assert res["source"] == "Unavailable"
    assert res["confidence"] == "low"
    assert "No monitoring station" in res["uncertainty_note"]


# ---------------------------------------------------------------------------
# 4. Corridor aggregation and advisory synthesis
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_route_pollution_corridor_aggregation():
    """Corridor aggregation accurately identifies hotspot, cleanest point, average AQI, and advisory."""
    geom = [
        [28.50, 77.20],
        [28.55, 77.20],
        [28.60, 77.20],
    ]

    mock_air_svc = AsyncMock(spec=AirQualityService)
    # Give varying pollution at each waypoint
    async def mock_stations_by_lat(lat, lon, radius_km=35.0, force_demo=False):
        if lat < 28.53:
            return [make_mock_station("st-clean", "Clean South", lat, lon, pm25=25.0, pm10=45.0)]
        elif lat < 28.58:
            return [make_mock_station("st-mid", "Mid Point", lat, lon, pm25=70.0, pm10=120.0)]
        else:
            return [make_mock_station("st-dirty", "Hotspot North", lat, lon, pm25=180.0, pm10=300.0)]

    mock_air_svc.get_stations.side_effect = mock_stations_by_lat

    mock_estimator = MagicMock(spec=LocationEstimator)
    def mock_estimate(lat, lon, stations):
        st = stations[0]
        pm25 = st.pollutants["PM2.5"].value
        pm10 = st.pollutants["PM10"].value
        return LocalAirEstimation(
            latitude=lat,
            longitude=lon,
            estimated_pollutants={"PM2.5": pm25, "PM10": pm10},
            contributing_stations=[st],
            nearest_station_id=st.station_id,
            nearest_station_distance_km=0.5,
            nearest_station_name=st.name,
            confidence="high",
        )
    mock_estimator.estimate_location_pollutants.side_effect = mock_estimate

    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)

    points, summary = await get_route_pollution(
        geometry=geom,
        duration_min=30.0,
        origin_label="Saket",
        destination_label="Connaught Place",
        air_service=mock_air_svc,
        location_estimator=mock_estimator,
        weather_provider=mock_weather,
    )

    assert len(points) == 3
    assert points[0]["label"] == "Saket"
    assert points[2]["label"] == "Connaught Place"

    # Destination should have higher AQI (hotspot)
    assert points[2]["aqi"] > points[0]["aqi"]
    assert summary["hotspot_label"] == "Connaught Place"
    assert summary["cleanest_label"] == "Saket"
    assert summary["coverage_ratio"] == 1.0
    assert summary["min_aqi"] == points[0]["aqi"]
    assert summary["max_aqi"] == points[2]["aqi"]
    assert "CPCB" in summary["data_sources"]
    assert "Ambient background estimates" in summary["roadside_disclaimer"]


@pytest.mark.asyncio
async def test_get_route_pollution_all_unavailable():
    """When all points fail, summary reports honest unavailable state without crashing."""
    geom = [[20.0, 70.0], [20.1, 70.0]]
    mock_air_svc = AsyncMock(spec=AirQualityService)
    mock_air_svc.get_stations.return_value = []
    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_estimator.estimate_location_pollutants.return_value = LocalAirEstimation(
        latitude=20.0, longitude=70.0, estimated_pollutants={}, contributing_stations=[]
    )
    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)
    mock_weather.get_current_air_quality.return_value = None

    points, summary = await get_route_pollution(
        geometry=geom,
        duration_min=10.0,
        air_service=mock_air_svc,
        location_estimator=mock_estimator,
        weather_provider=mock_weather,
    )

    assert len(points) == 2
    assert points[0]["aqi"] is None
    assert summary["avg_aqi"] is None
    assert summary["max_aqi"] is None
    assert summary["coverage_ratio"] == 0.0
    assert "unavailable" in summary["advisory"].lower()


# ---------------------------------------------------------------------------
# 5. Non-Delhi isolation test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_delhi_route_never_uses_delhi_data():
    """Non-Delhi coordinates (e.g. Bengaluru) must never receive Delhi demo/ground data."""
    # Bengaluru coordinates
    bengaluru_geom = [
        [12.9716, 77.5946],
        [12.9800, 77.6000],
    ]

    mock_air_svc = AsyncMock(spec=AirQualityService)
    # Real AirQualityService returns empty stations for remote coords if no local stations exist
    mock_air_svc.get_stations.return_value = []

    mock_estimator = MagicMock(spec=LocationEstimator)
    mock_estimator.estimate_location_pollutants.return_value = LocalAirEstimation(
        latitude=12.9716,
        longitude=77.5946,
        estimated_pollutants={},
        contributing_stations=[],
    )

    mock_weather = AsyncMock(spec=OpenMeteoWeatherProvider)
    # Open-Meteo returns Bengaluru local regional forecast
    mock_weather.get_current_air_quality.return_value = {
        "time": "2026-10-20T08:00",
        "pm2_5": 28.0,
        "pm10": 55.0,
    }

    points, summary = await get_route_pollution(
        geometry=bengaluru_geom,
        duration_min=15.0,
        origin_label="MG Road",
        destination_label="Indiranagar",
        air_service=mock_air_svc,
        location_estimator=mock_estimator,
        weather_provider=mock_weather,
    )

    for pt in points:
        # None of the stations or sources should reference Delhi
        assert "Delhi" not in str(pt.get("nearest_station") or "")
        assert pt["source"] in ("Open-Meteo", "Unavailable")


# ---------------------------------------------------------------------------
# 6. API Route integration tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_route_includes_pollution():
    """GET /route with include_pollution=True returns pollution_points and pollution_summary in response."""
    sample_geometry = [[28.5244, 77.2167], [28.5700, 77.2167], [28.6315, 77.2167]]
    sample_ors_response = {
        "profile": "driving-car",
        "distance_m": 13800.0,
        "distance_km": 13.8,
        "duration_s": 1560.0,
        "duration_min": 26.0,
        "geometry": sample_geometry,
        "bbox": [77.2167, 28.5244, 77.2167, 28.6315],
        "source": "OpenRouteService",
        "cached": False,
    }

    mock_pol_points = [
        {
            "label": "Home",
            "lat": 28.5244,
            "lon": 77.2167,
            "eta_min": 0.0,
            "aqi": 165,
            "aqi_category": "Moderate",
            "dominant_pollutant": "PM2.5",
            "pm25": 72.0,
            "pm10": 130.0,
            "no2": 32.0,
            "co": 1.1,
            "data_type": "observed",
            "source": "CPCB",
            "nearest_station": "Saket CPCB",
            "nearest_station_distance_km": 0.8,
            "confidence": "high",
            "timestamp": "2026-10-20T08:00:00Z",
            "is_stale": False,
            "uncertainty_note": "IDW interpolated",
        }
    ]
    mock_pol_summary = {
        "avg_aqi": 165,
        "max_aqi": 165,
        "min_aqi": 165,
        "dominant_pollutant": "PM2.5",
        "exposure_category": "Moderate",
        "hotspot_label": "Home",
        "cleanest_label": "Home",
        "advisory": "Moderate air quality along corridor.",
        "coverage_ratio": 1.0,
        "data_sources": ["CPCB"],
        "spatial_resolution": "Ambient monitoring stations (IDW)",
        "roadside_disclaimer": "Ambient background estimates.",
    }

    with patch("app.sources.openrouteservice.OpenRouteServiceProvider.get_route", AsyncMock(return_value=sample_ors_response)), \
         patch("app.services.route.get_route_pollution", AsyncMock(return_value=(mock_pol_points, mock_pol_summary))), \
         patch("app.services.route.get_route_weather", AsyncMock(return_value=([], {}))):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/route",
                params={
                    "origin_lat": 28.5244,
                    "origin_lon": 77.2167,
                    "dest_lat": 28.6315,
                    "dest_lon": 77.2167,
                    "include_pollution": "true",
                },
            )

            assert resp.status_code == 200
            data = resp.json()
            assert "pollution_points" in data
            assert len(data["pollution_points"]) == 1
            assert data["pollution_points"][0]["aqi"] == 165
            assert data["pollution_points"][0]["data_type"] == "observed"
            assert "pollution_summary" in data
            assert data["pollution_summary"]["avg_aqi"] == 165
            assert "roadside_disclaimer" in data["pollution_summary"]


@pytest.mark.asyncio
async def test_api_route_excludes_pollution_when_flag_false():
    """GET /route with include_pollution=False omits pollution points."""
    sample_geometry = [[28.5244, 77.2167], [28.6315, 77.2167]]
    sample_ors_response = {
        "profile": "driving-car",
        "distance_m": 13800.0,
        "distance_km": 13.8,
        "duration_s": 1560.0,
        "duration_min": 26.0,
        "geometry": sample_geometry,
        "bbox": [77.2167, 28.5244, 77.2167, 28.6315],
        "source": "OpenRouteService",
        "cached": False,
    }

    with patch("app.sources.openrouteservice.OpenRouteServiceProvider.get_route", AsyncMock(return_value=sample_ors_response)), \
         patch("app.services.route.get_route_weather", AsyncMock(return_value=([], {}))), \
         patch("app.services.route.get_route_pollution", AsyncMock()) as mock_pol:

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(
                "/route",
                params={
                    "origin_lat": 28.5244,
                    "origin_lon": 77.2167,
                    "dest_lat": 28.6315,
                    "dest_lon": 77.2167,
                    "include_pollution": "false",
                },
            )

            assert resp.status_code == 200
            mock_pol.assert_not_called()
            data = resp.json()
            assert data.get("pollution_points") is None
            assert data.get("pollution_summary") is None
