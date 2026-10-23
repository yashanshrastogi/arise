"""
Regression tests for the Arise commute route endpoint (GET /route).

All ORS network calls are mocked — no real API key or network connection
is required to run this suite.  Tests cover:
  - Valid route response shape and unit conversions
  - Identical-coordinate rejection (400)
  - Out-of-range coordinate rejection (422)
  - Missing ORS key (503)
  - ORS timeout (503)
  - ORS rate-limit / 429 (503)
  - No navigable route / 404 from ORS (404)
  - Cache hit: second call does not make an upstream request
  - Unknown profile (422)
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PARAMS = dict(
    origin_lat=28.6139,
    origin_lon=77.2090,
    dest_lat=28.5244,
    dest_lon=77.2066,
    profile="driving-car",
)

# Minimal ORS GeoJSON response for a short route
ORS_MOCK_RESPONSE = {
    "type": "FeatureCollection",
    "bbox": [77.2066, 28.5244, 77.2090, 28.6139],
    "features": [
        {
            "type": "Feature",
            "properties": {
                "summary": {
                    "distance": 10234.5,   # metres
                    "duration": 1347.8,    # seconds
                },
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [77.2090, 28.6139],
                    [77.2080, 28.5900],
                    [77.2066, 28.5244],
                ],
            },
        }
    ],
}


def _mock_ors_response(status_code: int = 200, json_body: dict = None) -> httpx.Response:
    """Build a fake httpx Response."""
    body = json.dumps(json_body or ORS_MOCK_RESPONSE).encode()
    request = httpx.Request("POST", "https://api.openrouteservice.org/v2/directions/driving-car/geojson")
    return httpx.Response(status_code, content=body, headers={"content-type": "application/json"}, request=request)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Force settings to re-read environment on each test."""
    from app.core.config import get_settings
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def clear_route_cache():
    """Clear the route service cache before and after each test."""
    from app.cache.repository import get_cache_repository
    repo = get_cache_repository()

    def _clear():
        if hasattr(repo, "_memory"):
            repo._memory._store.clear()
            repo._save_to_disk()
        elif hasattr(repo, "_store"):
            repo._store.clear()

    _clear()
    yield
    _clear()


# ---------------------------------------------------------------------------
# Helper to mock the ORS HTTP call
# ---------------------------------------------------------------------------

def _patch_ors(response: httpx.Response):
    """Context manager that patches httpx.AsyncClient.post to return `response`."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=response)
    return patch("app.sources.openrouteservice.httpx.AsyncClient", return_value=mock_client)


# ---------------------------------------------------------------------------
# Tests — happy path
# ---------------------------------------------------------------------------

class TestRouteHappyPath:
    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_route_returns_expected_fields(self):
        """Valid request → 200 with all required RouteResult fields."""
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=VALID_PARAMS)
        assert resp.status_code == 200
        body = resp.json()
        assert body["profile"] == "driving-car"
        assert body["source"] == "OpenRouteService"
        assert isinstance(body["geometry"], list)
        assert len(body["geometry"]) == 3  # matches ORS_MOCK_RESPONSE
        assert isinstance(body["geometry"][0], list)
        assert len(body["geometry"][0]) == 2

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_distance_and_duration_computed_correctly(self):
        """distance_km and duration_min are correctly derived from ORS metres/seconds."""
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=VALID_PARAMS)
        body = resp.json()
        assert body["distance_m"] == pytest.approx(10234.5, rel=1e-3)
        assert body["distance_km"] == pytest.approx(10.2, rel=1e-2)
        assert body["duration_s"] == pytest.approx(1347.8, rel=1e-3)
        assert body["duration_min"] == pytest.approx(22.5, rel=1e-2)

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_geometry_uses_lat_lon_order(self):
        """ORS [lon, lat] coords must be reversed to [lat, lon] for Google Maps."""
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=VALID_PARAMS)
        body = resp.json()
        first_point = body["geometry"][0]
        # ORS first coord is [77.2090, 28.6139] → should become [28.6139, 77.2090]
        assert first_point[0] == pytest.approx(28.6139, rel=1e-4)
        assert first_point[1] == pytest.approx(77.2090, rel=1e-4)

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_origin_destination_labels_returned(self):
        """Labels passed as query params are echoed in the response."""
        params = {**VALID_PARAMS, "origin_label": "Home", "destination_label": "Office"}
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=params)
        body = resp.json()
        assert body["origin_label"] == "Home"
        assert body["destination_label"] == "Office"

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_cached_false_on_first_call(self):
        """First call must have cached=False."""
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=VALID_PARAMS)
        assert resp.json()["cached"] is False

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_reverse_commute_uses_correct_origin_and_destination(self):
        """Reverse commute sends dest coords as origin and origin coords as dest."""
        reverse_params = {
            "origin_lat": VALID_PARAMS["dest_lat"],
            "origin_lon": VALID_PARAMS["dest_lon"],
            "dest_lat": VALID_PARAMS["origin_lat"],
            "dest_lon": VALID_PARAMS["origin_lon"],
            "origin_label": "Work",
            "destination_label": "Home",
            "profile": "driving-car",
        }
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=reverse_params)
        assert resp.status_code == 200
        body = resp.json()
        assert body["origin_label"] == "Work"
        assert body["destination_label"] == "Home"
        assert body["cached"] is False
        assert "geometry" in body


# ---------------------------------------------------------------------------
# Tests — input validation
# ---------------------------------------------------------------------------

class TestRouteValidation:
    def test_identical_coordinates_returns_400(self):
        """Same origin and destination → 400 Bad Request."""
        params = dict(
            origin_lat=28.6139, origin_lon=77.2090,
            dest_lat=28.6139, dest_lon=77.2090,
        )
        resp = client.get("/route", params=params)
        assert resp.status_code == 400
        assert "differ" in resp.json()["detail"].lower()

    def test_latitude_out_of_range_returns_422(self):
        """Latitude > 90 must be rejected with 422."""
        params = {**VALID_PARAMS, "origin_lat": 95.0}
        resp = client.get("/route", params=params)
        assert resp.status_code == 422

    def test_longitude_out_of_range_returns_422(self):
        """Longitude < -180 must be rejected with 422."""
        params = {**VALID_PARAMS, "origin_lon": -185.0}
        resp = client.get("/route", params=params)
        assert resp.status_code == 422

    def test_unknown_profile_returns_422(self):
        """An unsupported profile string must be rejected with 422."""
        params = {**VALID_PARAMS, "profile": "jet-ski"}
        resp = client.get("/route", params=params)
        assert resp.status_code == 422

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_cycling_profile_accepted(self):
        """cycling-regular is a valid profile and must not be rejected."""
        params = {**VALID_PARAMS, "profile": "cycling-regular"}
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=params)
        assert resp.status_code == 200

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_foot_walking_profile_accepted(self):
        """foot-walking is a valid profile and must not be rejected."""
        params = {**VALID_PARAMS, "profile": "foot-walking"}
        with _patch_ors(_mock_ors_response()):
            resp = client.get("/route", params=params)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests — error handling
# ---------------------------------------------------------------------------

class TestRouteErrors:
    @patch.dict("os.environ", {}, clear=False)
    def test_missing_ors_key_returns_503(self):
        """When ORS_API_KEY is absent, endpoint must return 503 (not 500)."""
        import os
        os.environ.pop("ORS_API_KEY", None)
        # Patch secrets module to return None
        with patch("app.sources.openrouteservice._resolve_ors_key", return_value=None):
            resp = client.get("/route", params=VALID_PARAMS)
        assert resp.status_code == 503
        assert "ORS_API_KEY" in resp.json()["detail"] or "not configured" in resp.json()["detail"].lower()
        assert "geometry" not in resp.json()
        assert "distance_km" not in resp.json()

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_ors_timeout_returns_503(self):
        """ORS network timeout must surface as 503."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
        with patch("app.sources.openrouteservice.httpx.AsyncClient", return_value=mock_client):
            resp = client.get("/route", params=VALID_PARAMS)
        assert resp.status_code == 503
        assert "timed out" in resp.json()["detail"].lower()
        assert "geometry" not in resp.json()
        assert "distance_km" not in resp.json()

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_ors_rate_limit_returns_503(self):
        """ORS 429 must be remapped to 503 (not forwarded as 429)."""
        rate_limit_resp = _mock_ors_response(429, {"error": {"message": "Rate limit exceeded"}})
        with _patch_ors(rate_limit_resp):
            # Need to trigger raise_for_status
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            rate_resp = httpx.Response(429, content=b'{"error":{"message":"Rate limit"}}',
                                       headers={"content-type": "application/json"},
                                       request=httpx.Request("POST", "https://api.openrouteservice.org/v2/directions/driving-car/geojson"))
            mock_client.post = AsyncMock(
                side_effect=httpx.HTTPStatusError("429", request=rate_resp.request, response=rate_resp)
            )
            with patch("app.sources.openrouteservice.httpx.AsyncClient", return_value=mock_client):
                resp = client.get("/route", params=VALID_PARAMS)
        assert resp.status_code == 503
        assert "rate-limited" in resp.json()["detail"].lower()
        assert "geometry" not in resp.json()
        assert "distance_km" not in resp.json()

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_ors_no_route_returns_404(self):
        """ORS 404 (no navigable route) must surface as 404."""
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        not_found_resp = httpx.Response(
            404, content=b'{"error":{"message":"Could not find route"}}',
            headers={"content-type": "application/json"},
            request=httpx.Request("POST", "https://api.openrouteservice.org/v2/directions/driving-car/geojson"),
        )
        mock_client.post = AsyncMock(
            side_effect=httpx.HTTPStatusError("404", request=not_found_resp.request, response=not_found_resp)
        )
        with patch("app.sources.openrouteservice.httpx.AsyncClient", return_value=mock_client):
            resp = client.get("/route", params=VALID_PARAMS)
        assert resp.status_code == 404
        assert "geometry" not in resp.json()
        assert "distance_km" not in resp.json()


# ---------------------------------------------------------------------------
# Tests — caching
# ---------------------------------------------------------------------------

class TestRouteCaching:
    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_second_call_serves_from_cache(self):
        """Second identical request must not hit ORS upstream."""
        call_count = 0
        original_get_route = None

        async def counting_get_route(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return {
                "profile": "driving-car",
                "distance_m": 10234.5,
                "distance_km": 10.2,
                "duration_s": 1347.8,
                "duration_min": 22.5,
                "geometry": [[28.6139, 77.2090], [28.5244, 77.2066]],
                "bbox": [77.2066, 28.5244, 77.2090, 28.6139],
                "source": "OpenRouteService",
                "cached": False,
                "origin_label": None,
                "destination_label": None,
            }

        with patch("app.sources.openrouteservice.OpenRouteServiceProvider.get_route",
                   side_effect=counting_get_route):
            resp1 = client.get("/route", params=VALID_PARAMS)
            resp2 = client.get("/route", params=VALID_PARAMS)

        assert resp1.status_code == 200
        assert resp2.status_code == 200
        # Provider called once; second response served from cache
        assert call_count == 1
        assert resp2.json()["cached"] is True

    @patch.dict("os.environ", {"ORS_API_KEY": "test-key-123"})
    def test_forward_and_reverse_commutes_have_independent_cache_keys(self):
        """Forward and reverse routes must not share the same cache entry."""
        call_count = 0

        async def counting_get_route(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return {
                "profile": "driving-car",
                "distance_m": 10234.5,
                "distance_km": 10.2,
                "duration_s": 1347.8,
                "duration_min": 22.5,
                "geometry": [[28.6139, 77.2090], [28.5244, 77.2066]],
                "bbox": [77.2066, 28.5244, 77.2090, 28.6139],
                "source": "OpenRouteService",
                "cached": False,
                "origin_label": None,
                "destination_label": None,
            }

        reverse_params = {
            "origin_lat": VALID_PARAMS["dest_lat"],
            "origin_lon": VALID_PARAMS["dest_lon"],
            "dest_lat": VALID_PARAMS["origin_lat"],
            "dest_lon": VALID_PARAMS["origin_lon"],
            "profile": "driving-car",
        }

        with patch("app.sources.openrouteservice.OpenRouteServiceProvider.get_route",
                   side_effect=counting_get_route):
            resp_fwd = client.get("/route", params=VALID_PARAMS)
            assert resp_fwd.status_code == 200
            assert resp_fwd.json()["cached"] is False

            # Reverse call has distinct cache key -> triggers provider call
            resp_rev = client.get("/route", params=reverse_params)
            assert resp_rev.status_code == 200
            assert resp_rev.json()["cached"] is False
            assert call_count == 2
