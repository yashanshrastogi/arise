"""
Comprehensive API Contract Stability & Geographic Correctness Audit Test Suite.
Verifies:
1. Contract adherence and status codes for all 12 Arise routes.
2. Coordinate boundary enforcement (ge=-90, le=90, ge=-180, le=180, NaN/Infinity rejection).
3. Geographic isolation across London, New York, Delhi, and remote coordinates.
4. Prevention of cross-coordinate cache leakage.
5. Distinction between genuine AQI 0 and missing/unavailable AQI (None).
6. Honest handling of missing station measurements (no fabricated defaults).
7. Comparison across locations when some or all have missing telemetry.
8. Authentication guardrails for user profile routes.
"""

import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from main import app
from app.domain.models import EnvironmentalSnapshot, AirMeasurement, StationObservation, WeatherSnapshot
from app.domain.verdict import evaluate_environment
from app.services.location_estimator import LocationEstimator
from app.services.compare_places import ComparePlacesService, PlaceTarget
from app.agents.schemas import AskAriseRequest
from app.agents.arise_agent import _generate_grounded_fallback_response


class TestApiContractGeographicAudit(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    # =========================================================================
    # 1. Coordinate Boundaries & Input Validation (Reject invalid / non-finite)
    # =========================================================================

    def test_coordinate_validation_air_now(self):
        # Out of bounds latitude
        r1 = self.client.get("/air/now?lat=95.0&lon=77.2")
        self.assertEqual(r1.status_code, 422)

        # Out of bounds longitude
        r2 = self.client.get("/air/now?lat=28.6&lon=200.0")
        self.assertEqual(r2.status_code, 422)

        # Non-finite values: NaN and Inf
        r3 = self.client.get("/air/now?lat=nan&lon=77.2")
        self.assertEqual(r3.status_code, 422)
        r4 = self.client.get("/air/now?lat=inf&lon=77.2")
        self.assertEqual(r4.status_code, 422)

        # Missing required parameter
        r5 = self.client.get("/air/now?lat=28.6")
        self.assertEqual(r5.status_code, 422)

    def test_coordinate_validation_weather_now(self):
        self.assertEqual(self.client.get("/weather/now?lat=-95.0&lon=0.0").status_code, 422)
        self.assertEqual(self.client.get("/weather/now?lat=0.0&lon=185.0").status_code, 422)
        self.assertEqual(self.client.get("/weather/now?lat=nan&lon=0.0").status_code, 422)

    def test_coordinate_validation_environment(self):
        self.assertEqual(self.client.get("/environment?lat=99.0&lon=77.2").status_code, 422)
        self.assertEqual(self.client.get("/environment?lat=28.6&lon=-190.0").status_code, 422)
        self.assertEqual(self.client.get("/environment?lat=-inf&lon=77.2").status_code, 422)

    def test_coordinate_validation_forecast(self):
        self.assertEqual(self.client.get("/forecast?lat=95.0&lon=77.2").status_code, 422)
        # Negative AQI is invalid
        self.assertEqual(self.client.get("/forecast?lat=28.6&lon=77.2&aqi=-5").status_code, 422)

    def test_coordinate_validation_verdict(self):
        self.assertEqual(self.client.get("/verdict?lat=-100.0&lon=0.0").status_code, 422)

    def test_coordinate_validation_compare(self):
        # Invalid latitude inside body list
        body = {
            "places": [
                {"label": "Valid", "latitude": 28.5, "longitude": 77.2},
                {"label": "Invalid", "latitude": 105.0, "longitude": 77.2}
            ]
        }
        resp = self.client.post("/compare", json=body)
        self.assertEqual(resp.status_code, 422)

    def test_coordinate_validation_chat(self):
        body = {
            "question": "Is it safe to run?",
            "lat": 150.0,
            "lon": 77.2
        }
        resp = self.client.post("/chat", json=body)
        self.assertEqual(resp.status_code, 422)

    # =========================================================================
    # 2. Route Inventory & Status Code Baseline for All 12 Routes
    # =========================================================================

    def test_route_1_root(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["service"], "Arise API")
        self.assertEqual(data["description"], "Environmental Intelligence Platform")
        self.assertIn("docs_url", data)
        self.assertIn("health_url", data)

    def test_route_2_health(self):
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["ok"])
        self.assertIn("timestamp", data)
        self.assertIn("cache", data)

    def test_route_3_air_now(self):
        r = self.client.get("/air/now?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("aqi", data)
        self.assertIn("category", data)
        self.assertIn("location", data)
        self.assertEqual(data["location"]["latitude"], 28.6139)
        self.assertEqual(data["location"]["longitude"], 77.2090)

    def test_route_4_weather_now(self):
        r = self.client.get("/weather/now?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("temperature", data)
        self.assertIn("wind_speed", data)
        self.assertIn("data_provenance", data)

    def test_route_5_forecast(self):
        r = self.client.get("/forecast?lat=28.6139&lon=77.2090&aqi=312&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("hourly", data)
        self.assertIn("forecast7Day", data)
        self.assertIn("bestWindow", data)
        self.assertIn("bestWindowDetails", data)

    def test_route_6_environment(self):
        r = self.client.get("/environment?lat=28.6139&lon=77.2090&persona=General+Public&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("aqi", data)
        self.assertIn("verdict", data)
        self.assertIn("weather", data)
        self.assertIn("pollutants", data)
        self.assertIn("forecast", data)
        self.assertIn("stations", data)
        self.assertIn("school", data)

    def test_route_7_compare(self):
        body = {
            "places": [
                {"label": "Delhi", "latitude": 28.6139, "longitude": 77.2090},
                {"label": "Dwarka", "latitude": 28.5921, "longitude": 77.0460}
            ],
            "demo": True
        }
        r = self.client.post("/compare", json=body)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(len(data["results"]), 2)
        self.assertIn("cleanest_place", data)
        self.assertIn("worst_place", data)

    def test_route_8_verdict(self):
        r = self.client.get("/verdict?lat=28.6139&lon=77.2090&persona=Athlete&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn(data["verdict"], ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"])
        self.assertIn("headline", data)
        self.assertIn("why", data)
        self.assertIn("do", data)

    def test_route_9_chat(self):
        body = {
            "question": "Can kids play outdoors this afternoon?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "Children & Schools",
            "demo": True
        }
        r = self.client.post("/chat", json=body)
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn(data["verdict"], ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"])
        self.assertIn("headline", data)
        self.assertIn("assistant_label", data)
        self.assertTrue(data["is_rule_based"])

    def test_route_10_profile_requires_auth(self):
        r = self.client.get("/profile")
        self.assertEqual(r.status_code, 401)

    def test_route_11_profile_bootstrap_requires_auth(self):
        r = self.client.post("/profile/bootstrap", json={"display_name": "Test User"})
        self.assertEqual(r.status_code, 401)

    def test_route_12_fire_signals(self):
        r = self.client.get("/fire/signals?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIn("signals_count", data)
        self.assertIn("signals", data)
        self.assertIn("disclaimer", data)

    # =========================================================================
    # 3. Geographic Integrity: London, New York, Delhi, Remote Locations
    # =========================================================================

    def test_geographic_isolation_london_has_no_delhi_stations(self):
        """London (51.5074, -0.1278) must never receive Delhi station observations."""
        r = self.client.get("/air/now?lat=51.5074&lon=-0.1278&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        # London coordinates must be preserved
        self.assertEqual(data["location"]["latitude"], 51.5074)
        self.assertEqual(data["location"]["longitude"], -0.1278)
        # In demo mode, only Delhi stations exist; London must return 0 stations and null AQI
        self.assertEqual(data["stations_count"], 0)
        self.assertIsNone(data["aqi"])
        self.assertEqual(data["category"], "Unavailable")
        self.assertEqual(data["quality"], "unavailable")
        self.assertEqual(len(data["contributing_stations"]), 0)

    def test_geographic_isolation_new_york_has_no_delhi_stations(self):
        """New York (40.7128, -74.0060) must never receive Delhi station observations."""
        r = self.client.get("/air/now?lat=40.7128&lon=-74.0060&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["location"]["latitude"], 40.7128)
        self.assertEqual(data["location"]["longitude"], -74.0060)
        self.assertEqual(data["stations_count"], 0)
        self.assertIsNone(data["aqi"])
        self.assertEqual(data["category"], "Unavailable")

    def test_remote_location_unavailable_aqi(self):
        """Remote location with no monitoring stations (0.0, -160.0 in Pacific Ocean)."""
        r = self.client.get("/air/now?lat=0.0&lon=-160.0&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIsNone(data["aqi"])
        self.assertEqual(data["category"], "Unavailable")
        self.assertEqual(data["quality"], "unavailable")

    def test_environment_remote_location_handles_unavailable_gracefully(self):
        """Remote location unified environment payload must not fabricate station AQI."""
        r = self.client.get("/environment?lat=0.0&lon=-160.0&persona=General+Public&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertIsNone(data["aqi"])
        self.assertEqual(data["status"], "Unavailable")
        self.assertEqual(data["aqi_category"], "Unavailable")
        self.assertIn("No ground stations in range", data["location"])
        # School action must be MODIFY (cautious fallback), NOT GO
        self.assertEqual(data["school"]["action"], "MODIFY")
        # Stations list must be empty
        self.assertEqual(len(data["stations"]), 0)

    def test_verdict_unavailable_aqi_gives_cautious_modify(self):
        """When AQI is unavailable, verdict engine gives BE_SMART and MODIFY school action."""
        r = self.client.get("/verdict?lat=0.0&lon=-160.0&persona=Children+%26+Schools&demo=true")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["verdict"], "BE_SMART")
        self.assertIsNone(data["aqi"])
        self.assertEqual(data["category"], "Unavailable")
        self.assertEqual(data["school_action"], "MODIFY")
        self.assertIn("unavailable", data["headline"].lower())
        # Check why structure has label, detail, and type keys
        for why_item in data["why"]:
            self.assertIn("label", why_item)
            self.assertIn("detail", why_item)

    # =========================================================================
    # 4. Cache Leakage: Verify London & Delhi Do Not Cross-Contaminate
    # =========================================================================

    def test_cache_non_leakage_between_coordinates(self):
        """Verify calling London and Delhi cannot cross-contaminate cached responses."""
        from app.cache.repository import get_cache_repository
        cache = get_cache_repository()
        cache.clear()

        # Call London
        r_london = self.client.get("/environment?lat=51.5074&lon=-0.1278&demo=true")
        self.assertEqual(r_london.status_code, 200)
        data_london = r_london.json()
        self.assertIsNone(data_london["aqi"])

        # Call Delhi
        r_delhi = self.client.get("/environment?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(r_delhi.status_code, 200)
        data_delhi = r_delhi.json()
        self.assertIsNotNone(data_delhi["aqi"])
        self.assertGreater(data_delhi["aqi"], 200)

        # Call London again: must still be None and never polluted with Delhi's AQI
        r_london_2 = self.client.get("/environment?lat=51.5074&lon=-0.1278&demo=true")
        self.assertEqual(r_london_2.status_code, 200)
        data_london_2 = r_london_2.json()
        self.assertIsNone(data_london_2["aqi"])
        self.assertNotIn("ITO", data_london_2["location"])
        self.assertNotIn("Delhi", data_london_2["location"])

    # =========================================================================
    # 5. Null and Numeric Semantics: AQI 0 vs None, Missing Pollutants
    # =========================================================================

    def test_aqi_zero_preserved_and_not_treated_as_none(self):
        """AQI 0 (pure clean air) must be preserved as 0, category Good, verdict GO."""
        snap_zero = EnvironmentalSnapshot(
            location="High Altitude Observatory",
            latitude=32.0,
            longitude=77.0,
            timestamp="2026-10-19T10:00:00Z",
            aqi=0,
            aqi_category="Good",
            dominant_pollutant="PM2.5",
            pollutants={"PM2.5": AirMeasurement(pollutant="PM2.5", value=1.0, timestamp="2026-10-19T10:00:00Z")}
        )
        verdict = evaluate_environment(snap_zero, persona="General Public")
        self.assertEqual(verdict.aqi, 0)
        self.assertIsNotNone(verdict.aqi)
        self.assertEqual(verdict.verdict, "GO")
        self.assertEqual(verdict.category, "Good")
        self.assertEqual(verdict.school_action, "GO")

    def test_compare_places_with_all_unavailable_places(self):
        """When comparing places where all locations lack telemetry, results remain robust."""
        import asyncio
        service = ComparePlacesService()
        places = [
            PlaceTarget(label="Ocean Point A", latitude=0.0, longitude=-160.0),
            PlaceTarget(label="Ocean Point B", latitude=10.0, longitude=-150.0),
        ]
        res = asyncio.run(service.compare_locations(places, force_demo=True))
        self.assertEqual(len(res.results), 2)
        self.assertEqual(res.cleanest_place, "None")
        self.assertEqual(res.worst_place, "None")
        self.assertIn("unavailable", res.recommendation.lower())
        for it in res.results:
            self.assertIsNone(it.aqi)
            self.assertIsNone(it.relative_ranking)
            self.assertEqual(it.category, "Unavailable")

    def test_compare_places_service_logic_with_mixed_telemetry(self):
        """Verify sorting and ranking when one place is available and one is unavailable."""
        import asyncio
        service = ComparePlacesService()
        places = [
            PlaceTarget(label="Delhi Station", latitude=28.6139, longitude=77.2090),
            PlaceTarget(label="Remote Sea", latitude=0.0, longitude=-160.0),
        ]
        res = asyncio.run(service.compare_locations(places, force_demo=True))
        self.assertEqual(len(res.results), 2)
        # Delhi has monitored AQI
        delhi_item = next(it for it in res.results if it.label == "Delhi Station")
        self.assertIsNotNone(delhi_item.aqi)
        self.assertEqual(delhi_item.relative_ranking, 1)

        # Remote Sea has unavailable AQI and relative_ranking None
        sea_item = next(it for it in res.results if it.label == "Remote Sea")
        self.assertIsNone(sea_item.aqi)
        self.assertIsNone(sea_item.relative_ranking)
        self.assertEqual(sea_item.category, "Unavailable")

    def test_chat_fallback_missing_weather_does_not_fabricate_28_degrees(self):
        """When weather telemetry is missing, chat fallback honestly reports unavailable."""
        fallback = _generate_grounded_fallback_response(
            question="What is the current temperature outside?",
            verdict_data={"verdict": "BE_SMART", "aqi": 120, "category": "Moderate"},
            air_data={"aqi": 120, "category": "Moderate", "dominant_pollutant": "PM2.5"},  # weather omitted
            fc_data={},
            fire_data={},
        )
        # Headline must not state "Current temperature is 28.4°C"
        self.assertNotIn("28.4", fallback.headline)
        self.assertIn("unavailable", fallback.headline.lower())


if __name__ == "__main__":
    unittest.main()
