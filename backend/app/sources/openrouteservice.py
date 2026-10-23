"""
OpenRouteService adapter for Arise commute intelligence.

Provides driving, cycling, and walking route geometry (GeoJSON LineString)
between two coordinates using the ORS Directions v2 API.

API documentation: https://openrouteservice.org/dev/#/api-docs/v2/directions
Free tier: 2,000 requests/day, 40 req/min.

Security: The API key is read from the backend settings / AWS Secrets Manager.
It is never exposed to the frontend.
"""

import logging
import math
from typing import Optional

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Supported ORS routing profiles. Other profiles (e.g. driving-hgv) are
# intentionally excluded from the public API to prevent abuse.
SUPPORTED_PROFILES = frozenset({"driving-car", "cycling-regular", "foot-walking"})

ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions"
# Request timeout in seconds — ORS typically responds in <2 s for short routes.
_REQUEST_TIMEOUT_S = 12.0


def _resolve_ors_key() -> Optional[str]:
    """
    Resolve the ORS API key, checking the local settings first (env var
    ORS_API_KEY), then falling back to AWS Secrets Manager via the shared
    secrets module.

    Returns:
        The API key string, or None if not configured.
    """
    settings = get_settings()

    # 1. Direct env-var / settings value (local dev + staging parameter)
    if settings.ORS_API_KEY:
        return settings.ORS_API_KEY

    # 2. AWS Secrets Manager (production Lambda warm path)
    try:
        from app.core.secrets import get_secret
        secret = get_secret(settings.ORS_SECRET_ID)
        if secret and secret.strip():
            return secret.strip()
    except Exception as exc:
        logger.debug("ORS secret lookup skipped: %s", exc)

    return None


class OpenRouteServiceProvider:
    """
    Async httpx adapter for the OpenRouteService Directions v2 API.

    Raises:
        RuntimeError: When the ORS API key is not configured.
        httpx.TimeoutException: On network timeout.
        httpx.HTTPStatusError: On 4xx/5xx HTTP responses from ORS.
        ValueError: When ORS returns an empty or malformed feature collection.
    """

    def __init__(self, api_key: Optional[str] = None, timeout: float = _REQUEST_TIMEOUT_S):
        self._api_key = api_key  # Allows injection for unit tests
        self._timeout = timeout

    def _get_key(self) -> str:
        key = self._api_key or _resolve_ors_key()
        if not key:
            raise RuntimeError(
                "ORS_API_KEY is not configured. "
                "Add ORS_API_KEY to your .env file (local) or "
                "store 'arise/ors-api-key' in AWS Secrets Manager (staging/prod)."
            )
        return key

    async def get_route(
        self,
        origin_lat: float,
        origin_lon: float,
        dest_lat: float,
        dest_lon: float,
        profile: str = "driving-car",
    ) -> dict:
        """
        Fetch a route from ORS and return a normalised result dict.

        ORS coordinates are [longitude, latitude] (GeoJSON convention).
        The returned geometry is converted to [[latitude, longitude], ...]
        so React / Google Maps can consume it directly without reversal.

        Args:
            origin_lat, origin_lon: Route start point.
            dest_lat, dest_lon: Route end point.
            profile: One of SUPPORTED_PROFILES.

        Returns:
            Dict with keys: distance_m, distance_km, duration_s, duration_min,
            geometry (list of [lat, lon] pairs), bbox, profile, source.

        Raises:
            RuntimeError, httpx.TimeoutException, httpx.HTTPStatusError, ValueError.
        """
        if profile not in SUPPORTED_PROFILES:
            raise ValueError(
                f"Unsupported profile '{profile}'. "
                f"Allowed: {sorted(SUPPORTED_PROFILES)}"
            )

        api_key = self._get_key()
        url = f"{ORS_BASE_URL}/{profile}/geojson"
        headers = {
            "Authorization": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json, application/geo+json",
        }
        body = {
            "coordinates": [
                [origin_lon, origin_lat],   # ORS: [lon, lat]
                [dest_lon, dest_lat],
            ],
            "instructions": False,
            "preference": "fastest",
        }

        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(url, json=body, headers=headers)
            response.raise_for_status()

        data = response.json()
        features = data.get("features") or []
        if not features:
            raise ValueError("ORS returned an empty feature collection — no route found.")

        feature = features[0]
        props = feature.get("properties", {})
        summary = props.get("summary", {})
        geo = feature.get("geometry", {})
        coords = geo.get("coordinates", [])   # [[lon, lat], ...]

        if not coords:
            raise ValueError("ORS route geometry is empty.")

        distance_m: float = float(summary.get("distance", 0))
        duration_s: float = float(summary.get("duration", 0))

        # Convert GeoJSON [lon, lat] → frontend-friendly [lat, lon]
        geometry = [[c[1], c[0]] for c in coords]

        # Bounding box from ORS bbox field [min_lon, min_lat, max_lon, max_lat]
        bbox = data.get("bbox") or feature.get("bbox") or []

        return {
            "profile": profile,
            "distance_m": round(distance_m, 1),
            "distance_km": round(distance_m / 1000, 1),
            "duration_s": round(duration_s, 1),
            "duration_min": round(duration_s / 60, 1),
            "geometry": geometry,
            "bbox": bbox,
            "source": "OpenRouteService",
        }
