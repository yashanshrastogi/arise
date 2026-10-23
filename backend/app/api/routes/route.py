"""
Route API endpoint for Arise commute intelligence.

Exposes GET /route which accepts origin and destination coordinates plus an
optional routing profile and returns distance, duration, and a GeoJSON-style
polyline geometry for rendering on the frontend map.

Authentication: None required.  Route geometry is public information derived
from open map data.  The ORS API key never leaves the backend.

Error behaviour:
  400  – Identical origin/destination or unsupported profile.
  422  – Pydantic validation failure (out-of-range or non-finite coordinates).
  503  – ORS key not configured, or ORS upstream unavailable / rate-limited.
  404  – ORS found no navigable route between the coordinates.
"""

import logging
import math
from typing import Annotated, Literal, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.domain.models import (
    RoutePollutionPoint,
    RoutePollutionSummary,
    RouteWeatherPoint,
    RouteWeatherSummary,
)
from app.services import route as route_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Commute"])

# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------


class RouteResult(BaseModel):
    """Commute route result returned by GET /route."""

    profile: str
    """ORS routing profile (e.g. 'driving-car')."""

    distance_m: float
    """Total route distance in metres."""

    distance_km: float
    """Total route distance in kilometres, rounded to 1 decimal place."""

    duration_s: float
    """Estimated travel time in seconds."""

    duration_min: float
    """Estimated travel time in minutes, rounded to 1 decimal place."""

    geometry: list[list[float]]
    """Route polyline as [[lat, lon], ...] pairs ready for Google Maps Polyline."""

    bbox: list[float]
    """Bounding box [min_lon, min_lat, max_lon, max_lat] for map auto-fit."""

    source: str = "OpenRouteService"
    """Upstream data source identifier."""

    cached: bool = False
    """True when the result was served from cache rather than a live ORS call."""

    origin_label: Optional[str] = None
    """Human-readable origin name (e.g. 'Home')."""

    destination_label: Optional[str] = None
    """Human-readable destination name (e.g. 'Work')."""

    weather_points: Optional[list[RouteWeatherPoint]] = None
    """Representative weather sampling points along the route corridor."""

    weather_summary: Optional[RouteWeatherSummary] = None
    """Corridor-wide aggregate meteorological conditions and deterministic advisory."""

    pollution_points: Optional[list[RoutePollutionPoint]] = None
    """Representative air quality & pollution exposure points along the route corridor."""

    pollution_summary: Optional[RoutePollutionSummary] = None
    """Corridor-wide aggregate pollution exposure metrics and deterministic health advisory."""


# ---------------------------------------------------------------------------
# Validators
# ---------------------------------------------------------------------------


def _validate_finite(value: float, name: str) -> float:
    """Reject NaN and infinity — Pydantic ge/le allow them on some builds."""
    if not math.isfinite(value):
        raise HTTPException(
            status_code=422,
            detail=f"'{name}' must be a finite number; got {value}.",
        )
    return value


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.get("/route", response_model=RouteResult)
async def get_route(
    origin_lat: float = Query(..., ge=-90.0, le=90.0, description="Route start latitude (-90 to 90)"),
    origin_lon: float = Query(..., ge=-180.0, le=180.0, description="Route start longitude (-180 to 180)"),
    dest_lat: float = Query(..., ge=-90.0, le=90.0, description="Route end latitude (-90 to 90)"),
    dest_lon: float = Query(..., ge=-180.0, le=180.0, description="Route end longitude (-180 to 180)"),
    profile: Literal["driving-car", "cycling-regular", "foot-walking"] = Query(
        default="driving-car",
        description="Routing profile: 'driving-car' | 'cycling-regular' | 'foot-walking'",
    ),
    origin_label: Optional[str] = Query(default=None, max_length=120, description="Human-readable origin name"),
    destination_label: Optional[str] = Query(default=None, max_length=120, description="Human-readable destination name"),
    include_weather: bool = Query(
        default=True,
        description="Whether to fetch weather conditions along representative route points",
    ),
    include_pollution: bool = Query(
        default=True,
        description="Whether to fetch air quality & pollution exposure along representative route points",
    ),
    force_demo: bool = Query(
        default=False,
        description="Enable calibrated demo data for Delhi-NCR testing",
    ),
):
    """
    Return driving / cycling / walking route geometry between two coordinates,
    with representative Open-Meteo weather sampling along the route corridor.

    The route polyline is ready for direct use with `google.maps.Polyline`.
    Distance and duration are pre-computed for display without client-side math.
    The ORS API key is never returned and stays strictly server-side.
    """
    # Extra finiteness guard (Pydantic ge/le does not reject NaN on all versions)
    _validate_finite(origin_lat, "origin_lat")
    _validate_finite(origin_lon, "origin_lon")
    _validate_finite(dest_lat, "dest_lat")
    _validate_finite(dest_lon, "dest_lon")

    try:
        result = await route_service.get_route(
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            profile=profile,
            origin_label=origin_label,
            destination_label=destination_label,
            include_weather=include_weather,
            include_pollution=include_pollution,
            force_demo=force_demo,
        )
        return RouteResult(**result)

    except ValueError as exc:
        # Identical coords or unsupported profile
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    except RuntimeError as exc:
        # ORS API key not configured
        logger.warning("Route service misconfigured: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    except httpx.TimeoutException as exc:
        logger.warning("ORS request timed out: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Route service timed out. Please try again shortly.",
        ) from exc

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status == 429:
            raise HTTPException(
                status_code=503,
                detail="Route service is temporarily rate-limited. Please try again in a moment.",
            ) from exc
        if status == 404:
            raise HTTPException(
                status_code=404,
                detail="No navigable route found between the provided coordinates.",
            ) from exc
        # Extract ORS error message if available
        try:
            ors_detail = exc.response.json().get("error", {})
            msg = ors_detail.get("message") or f"Route service error (ORS {status})."
        except Exception:
            msg = f"Route service error (ORS {status})."
        raise HTTPException(status_code=400, detail=msg) from exc

    except Exception as exc:
        logger.error("Unexpected route service error: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Route service temporarily unavailable.",
        ) from exc
