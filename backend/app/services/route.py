"""
Route service for Arise commute intelligence.

Orchestrates the OpenRouteService provider and applies DynamoDB / filesystem
caching using the shared CacheRepository.  Route geometry is structural data
that changes very rarely, so a 1-hour TTL is appropriate.  No stale grace
window is used because serving stale route geometry to a changed road network
is preferable to crashing, but outdated geometry is not a safety concern.
"""

import asyncio
import logging
import math
from typing import Optional, List, Dict, Any, Tuple

from app.cache.repository import get_cache_repository
from app.domain.aqi import calculate_aqi, get_aqi_category
from app.domain.models import RoutePollutionPoint, RoutePollutionSummary
from app.services.air_quality import AirQualityService
from app.services.location_estimator import LocationEstimator
from app.sources.openrouteservice import OpenRouteServiceProvider, SUPPORTED_PROFILES
from app.sources.weather import OpenMeteoWeatherProvider, WeatherSnapshot

logger = logging.getLogger(__name__)

# Route cache TTL: 1 hour.  Routes change far less frequently than weather.
_ROUTE_CACHE_TTL = 3600
# Minimum coordinate displacement to consider two points as different locations
# (roughly 11 metres at the equator — well below GPS accuracy thresholds).
_MIN_COORD_DELTA = 0.0001


def _make_cache_key(profile: str, olat: float, olon: float, dlat: float, dlon: float) -> str:
    """Deterministic cache key for a specific origin/destination/profile triple."""
    return f"route:{profile}:{olat:.4f}:{olon:.4f}:{dlat:.4f}:{dlon:.4f}"


def _coords_are_identical(olat: float, olon: float, dlat: float, dlon: float) -> bool:
    """Return True when the two coordinate pairs are effectively the same point."""
    return (
        abs(olat - dlat) < _MIN_COORD_DELTA
        and abs(olon - dlon) < _MIN_COORD_DELTA
    )


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Compute great-circle distance between two coordinates in kilometres."""
    r = 6371.0088  # Earth mean radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return r * c


def condition_to_icon(condition_text: str) -> str:
    """Map human-readable weather condition to representative emoji icon."""
    c = (condition_text or "").lower()
    if "fog" in c:
        return "🌫️"
    if "thunder" in c:
        return "⛈️"
    if "rain" in c or "shower" in c or "drizzle" in c:
        return "🌧️"
    if "partly" in c or "sun" in c:
        return "🌤️"
    if "overcast" in c or "cloud" in c:
        return "☁️"
    if "clear" in c:
        return "☀️"
    return "🌤️"



def sample_route_waypoints(
    geometry: List[List[float]],
    duration_min: float,
    origin_label: Optional[str] = None,
    destination_label: Optional[str] = None,
    max_points: int = 4,
) -> List[Dict[str, Any]]:
    """
    Select 2 to 4 representative weather sampling points along the route geometry.

    Uses cumulative geodesic distance along the polyline to pick proportionally spaced
    waypoints (e.g. Origin, Midpoint, Destination) and calculates estimated arrival time
    (ETA) offsets for each point.
    """
    if not geometry:
        return []
    if len(geometry) == 1:
        return [{
            "lat": round(geometry[0][0], 5),
            "lon": round(geometry[0][1], 5),
            "label": origin_label or "Start",
            "eta_min": 0.0,
            "fraction": 0.0,
        }]

    # 1. Compute cumulative distances along coordinate path
    cum_dist = [0.0]
    for i in range(1, len(geometry)):
        seg = haversine_km(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1])
        cum_dist.append(cum_dist[-1] + seg)

    total_dist = cum_dist[-1]

    # 2. Select target fractions based on total route distance
    if total_dist < 4.0:
        fractions = [0.0, 1.0]
    elif total_dist <= 20.0:
        fractions = [0.0, 0.5, 1.0]
    else:
        # Long corridor: sample up to 4 points (0%, 33%, 67%, 100%)
        fractions = [0.0, 0.33, 0.67, 1.0]

    if max_points < len(fractions):
        fractions = fractions[:max_points]

    sampled: List[Dict[str, Any]] = []
    used_indices = set()

    for f in fractions:
        target_d = f * total_dist
        best_idx = min(range(len(cum_dist)), key=lambda i: abs(cum_dist[i] - target_d))
        if best_idx in used_indices and len(used_indices) < len(geometry):
            continue
        used_indices.add(best_idx)

        pt = geometry[best_idx]
        eta = round(f * duration_min, 1)

        if f == 0.0:
            lbl = origin_label or "Start"
        elif f == 1.0:
            lbl = destination_label or "Destination"
        elif f == 0.5:
            lbl = "Midpoint"
        else:
            pct = int(round(f * 100))
            lbl = f"Waypoint ({pct}%)"

        sampled.append({
            "lat": round(pt[0], 5),
            "lon": round(pt[1], 5),
            "label": lbl,
            "eta_min": eta,
            "fraction": f,
        })

    # Guard: ensure at least origin and destination if geometry has >= 2 points
    if len(sampled) < 2 and len(geometry) >= 2:
        sampled = [
            {
                "lat": round(geometry[0][0], 5),
                "lon": round(geometry[0][1], 5),
                "label": origin_label or "Start",
                "eta_min": 0.0,
                "fraction": 0.0,
            },
            {
                "lat": round(geometry[-1][0], 5),
                "lon": round(geometry[-1][1], 5),
                "label": destination_label or "Destination",
                "eta_min": round(duration_min, 1),
                "fraction": 1.0,
            },
        ]

    return sampled


async def get_route_weather(
    geometry: List[List[float]],
    duration_min: float,
    origin_label: Optional[str] = None,
    destination_label: Optional[str] = None,
    weather_provider: Optional[OpenMeteoWeatherProvider] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Retrieve real weather forecasts from Open-Meteo for representative points along route.

    Preserves zero-fabrication rules: if a point fails, returns an honest degraded object
    rather than synthesizing artificial numbers or substituting Delhi data.
    """
    waypoints = sample_route_waypoints(
        geometry=geometry,
        duration_min=duration_min,
        origin_label=origin_label,
        destination_label=destination_label,
    )
    if not waypoints:
        return [], {
            "has_rain_risk": False,
            "has_fog_risk": False,
            "min_temp_c": None,
            "max_temp_c": None,
            "max_wind_kmh": None,
            "lowest_visibility_km": None,
            "advisory": "No route geometry available for weather sampling.",
            "spatial_resolution": "Open-Meteo NWP (~2 km grid resolution)",
            "data_provenance": "degraded",
        }

    provider = weather_provider or OpenMeteoWeatherProvider()

    # Query Open-Meteo concurrently for sampled coordinates (utilizing spatial grid cache)
    tasks = [provider.get_current_weather(wp["lat"], wp["lon"]) for wp in waypoints]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    weather_points: List[Dict[str, Any]] = []

    for wp, res in zip(waypoints, raw_results):
        if isinstance(res, WeatherSnapshot) and res.data_provenance != "degraded" and res.temperature is not None:
            cond = res.condition_text or "Clear Sky"
            icon = condition_to_icon(cond)
            vis = res.visibility
            fog_risk = "None"
            if "fog" in cond.lower() or (vis is not None and vis <= 1.0):
                fog_risk = "Dense Fog"
            elif vis is not None and vis <= 2.5:
                fog_risk = "Moderate Fog"

            weather_points.append({
                "label": wp["label"],
                "lat": wp["lat"],
                "lon": wp["lon"],
                "eta_min": wp["eta_min"],
                "temp_c": res.temperature,
                "feels_like_c": res.feels_like,
                "humidity": res.humidity,
                "condition": cond,
                "icon": icon,
                "rain_probability": res.rain_probability,
                "precipitation_mm": res.precipitation,
                "wind_speed_kmh": res.wind_speed,
                "wind_direction": res.wind_direction,
                "visibility_km": vis,
                "fog_risk": fog_risk,
                "is_stale": res.is_stale,
                "data_source": res.source or "Open-Meteo",
                "data_provenance": res.data_provenance or "numerical_weather_prediction",
            })
        else:
            # Degraded snapshot without fabricated numbers or substitutes
            weather_points.append({
                "label": wp["label"],
                "lat": wp["lat"],
                "lon": wp["lon"],
                "eta_min": wp["eta_min"],
                "temp_c": None,
                "feels_like_c": None,
                "humidity": None,
                "condition": "Unavailable",
                "icon": "—",
                "rain_probability": None,
                "precipitation_mm": None,
                "wind_speed_kmh": None,
                "wind_direction": "—",
                "visibility_km": None,
                "fog_risk": "Unknown",
                "is_stale": True,
                "data_source": "Unavailable",
                "data_provenance": "degraded",
            })

    # Synthesize aggregate summary and deterministic advisory
    valid_points = [p for p in weather_points if p.get("temp_c") is not None]
    if valid_points:
        temps = [p["temp_c"] for p in valid_points]
        winds = [p["wind_speed_kmh"] for p in valid_points if p.get("wind_speed_kmh") is not None]
        vis_list = [p["visibility_km"] for p in valid_points if p.get("visibility_km") is not None]
        has_rain = any(
            (p.get("precipitation_mm") or 0.0) > 0.0 or (p.get("rain_probability") or 0.0) >= 40.0
            for p in valid_points
        )
        has_fog = any(p.get("fog_risk") in ("Dense Fog", "Moderate Fog") for p in valid_points)

        if has_fog and has_rain:
            advisory = "Rain showers and fog along corridor. Reduce speed and increase following distance."
        elif has_fog:
            advisory = "Low visibility or fog along corridor. Drive with caution."
        elif has_rain:
            advisory = "Wet road conditions expected along commute corridor."
        else:
            advisory = "Clear meteorological conditions along commute route."

        summary = {
            "has_rain_risk": has_rain,
            "has_fog_risk": has_fog,
            "min_temp_c": min(temps),
            "max_temp_c": max(temps),
            "max_wind_kmh": max(winds) if winds else None,
            "lowest_visibility_km": min(vis_list) if vis_list else None,
            "advisory": advisory,
            "spatial_resolution": "Open-Meteo NWP (~2 km grid resolution)",
            "data_provenance": "numerical_weather_prediction",
        }
    else:
        summary = {
            "has_rain_risk": False,
            "has_fog_risk": False,
            "min_temp_c": None,
            "max_temp_c": None,
            "max_wind_kmh": None,
            "lowest_visibility_km": None,
            "advisory": "Atmospheric telemetry unavailable along this corridor.",
            "spatial_resolution": "Open-Meteo NWP (~2 km grid resolution)",
            "data_provenance": "degraded",
        }

    return weather_points, summary


async def _fetch_single_waypoint_pollution(
    wp: Dict[str, Any],
    air_svc: AirQualityService,
    estimator: LocationEstimator,
    weather_prov: OpenMeteoWeatherProvider,
    force_demo: bool = False,
) -> Dict[str, Any]:
    """Fetch air quality for a single waypoint, prioritizing observed ground monitors before regional models."""
    lat = wp["lat"]
    lon = wp["lon"]
    eta_min = wp["eta_min"]
    label = wp["label"]

    # 1. Try ground station observations (CPCB / OpenAQ / DEMO)
    try:
        stations = await air_svc.get_stations(lat, lon, radius_km=35.0, force_demo=force_demo)
        estimation = estimator.estimate_location_pollutants(lat, lon, stations)
        if estimation.contributing_stations and estimation.estimated_pollutants:
            aqi_res = calculate_aqi(estimation.estimated_pollutants, has_verified_averaging=False)
            is_stale_flag = any(st.is_stale for st in estimation.contributing_stations)

            nearest_dist = estimation.nearest_station_distance_km
            nearest_name = estimation.nearest_station_name

            if nearest_dist is not None and nearest_dist < 0.05:
                uncertainty = "Direct ground monitoring station observation"
            else:
                num_st = len(estimation.contributing_stations)
                uncertainty = f"IDW interpolated from {num_st} nearby ground monitors (nearest: {nearest_name}, {nearest_dist} km away)"

            return {
                "label": label,
                "lat": lat,
                "lon": lon,
                "eta_min": eta_min,
                "aqi": aqi_res.aqi,
                "aqi_category": aqi_res.category,
                "dominant_pollutant": aqi_res.dominant_pollutant,
                "pm25": round(estimation.estimated_pollutants["PM2.5"], 1) if "PM2.5" in estimation.estimated_pollutants else None,
                "pm10": round(estimation.estimated_pollutants["PM10"], 1) if "PM10" in estimation.estimated_pollutants else None,
                "no2": round(estimation.estimated_pollutants["NO2"], 1) if "NO2" in estimation.estimated_pollutants else None,
                "co": round(estimation.estimated_pollutants["CO"], 2) if "CO" in estimation.estimated_pollutants else None,
                "data_type": "observed",
                "source": stations[0].source,
                "nearest_station": nearest_name,
                "nearest_station_distance_km": nearest_dist,
                "confidence": estimation.confidence,
                "timestamp": stations[0].timestamp,
                "is_stale": is_stale_flag,
                "uncertainty_note": uncertainty,
            }
    except Exception as exc:
        logger.warning(f"Error querying ground stations for waypoint {label} ({lat}, {lon}): {exc}")

    # 2. Try Open-Meteo Air Quality regional numerical model (CAMS)
    try:
        model_data = await weather_prov.get_current_air_quality(lat, lon)
        if model_data and (model_data.get("pm2_5") is not None or model_data.get("pm10") is not None):
            pollutants = {}
            if model_data.get("pm2_5") is not None:
                pollutants["PM2.5"] = float(model_data["pm2_5"])
            if model_data.get("pm10") is not None:
                pollutants["PM10"] = float(model_data["pm10"])
            if model_data.get("nitrogen_dioxide") is not None:
                pollutants["NO2"] = float(model_data["nitrogen_dioxide"])
            if model_data.get("sulphur_dioxide") is not None:
                pollutants["SO2"] = float(model_data["sulphur_dioxide"])
            if model_data.get("carbon_monoxide") is not None:
                pollutants["CO"] = round(float(model_data["carbon_monoxide"]) / 1000.0, 2)
            if model_data.get("ozone") is not None:
                pollutants["O3"] = float(model_data["ozone"])

            aqi_res = calculate_aqi(pollutants, has_verified_averaging=False)
            return {
                "label": label,
                "lat": lat,
                "lon": lon,
                "eta_min": eta_min,
                "aqi": aqi_res.aqi,
                "aqi_category": aqi_res.category,
                "dominant_pollutant": aqi_res.dominant_pollutant,
                "pm25": pollutants.get("PM2.5"),
                "pm10": pollutants.get("PM10"),
                "no2": pollutants.get("NO2"),
                "co": pollutants.get("CO"),
                "data_type": "modelled",
                "source": "Open-Meteo",
                "nearest_station": None,
                "nearest_station_distance_km": None,
                "confidence": "moderate",
                "timestamp": model_data.get("time"),
                "is_stale": False,
                "uncertainty_note": "Regional atmospheric numerical model forecast (~10 km grid); uncalibrated against local ground monitors",
            }
    except Exception as exc:
        logger.warning(f"Error querying modelled air quality for waypoint {label} ({lat}, {lon}): {exc}")

    # 2b. Try secondary regional air pollution provider (OpenWeather / Tomorrow.io)
    if hasattr(weather_prov, "secondary_providers"):
        for sec in (weather_prov.secondary_providers or []):
            if hasattr(sec, "get_air_pollution"):
                try:
                    sec_air = await sec.get_air_pollution(lat, lon)
                    if sec_air and sec_air.get("pollutants"):
                        pollutants = sec_air["pollutants"]
                        aqi_res = calculate_aqi(pollutants, has_verified_averaging=False)
                        return {
                            "label": label,
                            "lat": lat,
                            "lon": lon,
                            "eta_min": eta_min,
                            "aqi": aqi_res.aqi,
                            "aqi_category": aqi_res.category,
                            "dominant_pollutant": aqi_res.dominant_pollutant,
                            "pm25": pollutants.get("PM2.5"),
                            "pm10": pollutants.get("PM10"),
                            "no2": pollutants.get("NO2"),
                            "co": pollutants.get("CO"),
                            "data_type": "modelled",
                            "source": sec_air.get("source", sec.name),
                            "nearest_station": None,
                            "nearest_station_distance_km": None,
                            "confidence": "moderate",
                            "timestamp": sec_air.get("observation_time"),
                            "is_stale": False,
                            "uncertainty_note": f"Secondary regional atmospheric model ({sec.name})",
                        }
                except Exception as sec_exc:
                    logger.warning(f"Error querying secondary air quality model ({sec.name}) for waypoint {label}: {sec_exc}")

    # 3. Honest degraded representation (Zero Fabrication)
    return {
        "label": label,
        "lat": lat,
        "lon": lon,
        "eta_min": eta_min,
        "aqi": None,
        "aqi_category": "Unavailable",
        "dominant_pollutant": "None",
        "pm25": None,
        "pm10": None,
        "no2": None,
        "co": None,
        "data_type": "unavailable",
        "source": "Unavailable",
        "nearest_station": None,
        "nearest_station_distance_km": None,
        "confidence": "low",
        "timestamp": None,
        "is_stale": True,
        "uncertainty_note": "No monitoring station or numerical model coverage available for this coordinate",
    }


async def get_route_pollution(
    geometry: List[List[float]],
    duration_min: float,
    origin_label: Optional[str] = None,
    destination_label: Optional[str] = None,
    air_service: Optional[AirQualityService] = None,
    location_estimator: Optional[LocationEstimator] = None,
    weather_provider: Optional[OpenMeteoWeatherProvider] = None,
    force_demo: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Retrieve air quality and pollution exposure for representative points along route corridor.

    Distinguishes observed ground monitor readings from regional modelled forecasts,
    enforcing deterministic CPCB calculation and zero fabrication on missing coverage.
    """
    waypoints = sample_route_waypoints(
        geometry=geometry,
        duration_min=duration_min,
        origin_label=origin_label,
        destination_label=destination_label,
    )
    if not waypoints:
        return [], {
            "avg_aqi": None,
            "max_aqi": None,
            "min_aqi": None,
            "dominant_pollutant": "None",
            "exposure_category": "Unavailable",
            "hotspot_label": None,
            "cleanest_label": None,
            "advisory": "No route geometry available for pollution sampling.",
            "coverage_ratio": 0.0,
            "data_sources": [],
            "spatial_resolution": "Ambient monitoring stations (IDW) & Open-Meteo regional models",
            "roadside_disclaimer": "Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings.",
        }

    air_svc = air_service or AirQualityService()
    estimator = location_estimator or LocationEstimator()
    weather_prov = weather_provider or OpenMeteoWeatherProvider()

    tasks = [
        _fetch_single_waypoint_pollution(wp, air_svc, estimator, weather_prov, force_demo)
        for wp in waypoints
    ]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    pollution_points: List[Dict[str, Any]] = []
    for wp, res in zip(waypoints, raw_results):
        if isinstance(res, dict):
            pollution_points.append(res)
        else:
            pollution_points.append({
                "label": wp["label"],
                "lat": wp["lat"],
                "lon": wp["lon"],
                "eta_min": wp["eta_min"],
                "aqi": None,
                "aqi_category": "Unavailable",
                "dominant_pollutant": "None",
                "pm25": None,
                "pm10": None,
                "no2": None,
                "co": None,
                "data_type": "unavailable",
                "source": "Unavailable",
                "nearest_station": None,
                "nearest_station_distance_km": None,
                "confidence": "low",
                "timestamp": None,
                "is_stale": True,
                "uncertainty_note": "Upstream error querying air quality for this coordinate",
            })

    # Corridor aggregate summary
    valid_points = [p for p in pollution_points if p.get("aqi") is not None]
    coverage_ratio = round(len(valid_points) / len(pollution_points), 2) if pollution_points else 0.0

    if valid_points:
        aqi_vals = [p["aqi"] for p in valid_points]
        avg_aqi = round(sum(aqi_vals) / len(aqi_vals))
        max_aqi = max(aqi_vals)
        min_aqi = min(aqi_vals)
        hotspot = max(valid_points, key=lambda p: p["aqi"])
        cleanest = min(valid_points, key=lambda p: p["aqi"])
        exp_category, _ = get_aqi_category(avg_aqi)
        dom_pol = hotspot.get("dominant_pollutant") or "PM2.5"

        if max_aqi > 300:
            advisory = f"Severe pollution corridor (Peak AQI {max_aqi} at {hotspot['label']}). Keep vehicle windows sealed, set ventilation to recirculation, and avoid walking or cycling."
        elif max_aqi > 200:
            advisory = f"Poor air quality along route (Peak AQI {max_aqi} at {hotspot['label']}). Keep vehicle windows closed; in-cabin filtration recommended."
        elif max_aqi > 100:
            advisory = f"Moderate particulate exposure along corridor (Average AQI {avg_aqi}). Sensitive commuters should limit strenuous outdoor activity."
        else:
            advisory = f"Favorable air quality along commute corridor (Average AQI {avg_aqi}). Normal outdoor activity permitted."

        if coverage_ratio < 1.0:
            advisory += f" (Partial coverage: {len(valid_points)}/{len(pollution_points)} waypoints reporting)."

        data_sources = sorted(list(set(p["source"] for p in valid_points)))
        summary = {
            "avg_aqi": avg_aqi,
            "max_aqi": max_aqi,
            "min_aqi": min_aqi,
            "dominant_pollutant": dom_pol,
            "exposure_category": exp_category,
            "hotspot_label": hotspot["label"],
            "cleanest_label": cleanest["label"],
            "advisory": advisory,
            "coverage_ratio": coverage_ratio,
            "data_sources": data_sources,
            "spatial_resolution": "Ambient monitoring stations (IDW) & Open-Meteo regional models",
            "roadside_disclaimer": "Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings.",
        }
    else:
        summary = {
            "avg_aqi": None,
            "max_aqi": None,
            "min_aqi": None,
            "dominant_pollutant": "None",
            "exposure_category": "Unavailable",
            "hotspot_label": None,
            "cleanest_label": None,
            "advisory": "Atmospheric pollution telemetry is unavailable along this corridor.",
            "coverage_ratio": 0.0,
            "data_sources": [],
            "spatial_resolution": "Ambient monitoring stations (IDW) & Open-Meteo regional models",
            "roadside_disclaimer": "Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings.",
        }

    return pollution_points, summary


async def get_route(
    origin_lat: float,
    origin_lon: float,
    dest_lat: float,
    dest_lon: float,
    profile: str = "driving-car",
    origin_label: Optional[str] = None,
    destination_label: Optional[str] = None,
    include_weather: bool = True,
    include_pollution: bool = True,
    weather_provider: Optional[OpenMeteoWeatherProvider] = None,
    air_service: Optional[AirQualityService] = None,
    location_estimator: Optional[LocationEstimator] = None,
    force_demo: bool = False,
) -> dict:
    """
    Fetch a commute route from ORS with caching and optional along-route weather and pollution sampling.

    Args:
        origin_lat, origin_lon: Start coordinates (home / current location).
        dest_lat, dest_lon:     End coordinates (work / school / custom).
        profile:                ORS routing profile ('driving-car', etc.).
        origin_label:           Human-readable origin name for the response.
        destination_label:      Human-readable destination name for the response.
        include_weather:        If True, sample representative points for Open-Meteo weather.
        include_pollution:      If True, sample representative points for pollution exposure.
        weather_provider:       Optional weather provider adapter for testing or override.
        air_service:            Optional air quality service adapter for testing or override.
        location_estimator:     Optional IDW location estimator for testing or override.
        force_demo:             Enable calibrated demo data for Delhi-NCR testing.

    Returns:
        A RouteResult-compatible dict (see api/routes/route.py for schema).

    Raises:
        ValueError:  Identical coordinates or unsupported profile.
        RuntimeError: ORS key not configured.
        HTTPException (via caller): Propagated from httpx on ORS errors.
    """
    if _coords_are_identical(origin_lat, origin_lon, dest_lat, dest_lon):
        raise ValueError("Origin and destination coordinates must differ.")

    if profile not in SUPPORTED_PROFILES:
        raise ValueError(
            f"Unsupported profile '{profile}'. Allowed: {sorted(SUPPORTED_PROFILES)}"
        )

    cache_key = _make_cache_key(profile, origin_lat, origin_lon, dest_lat, dest_lon)
    cache = get_cache_repository()

    # Check cache first for route geometry
    cached_entry = cache.get(cache_key)
    if cached_entry is not None and not cached_entry.is_expired:
        result = dict(cached_entry.value)
        # Strip dynamic meteorological & pollution fields that might have been cached in memory
        result.pop("weather_points", None)
        result.pop("weather_summary", None)
        result.pop("pollution_points", None)
        result.pop("pollution_summary", None)
        result["cached"] = True
        if origin_label is not None:
            result["origin_label"] = origin_label
        if destination_label is not None:
            result["destination_label"] = destination_label
        logger.debug("Route cache hit: %s", cache_key)
    else:
        # Fetch fresh route from ORS
        provider = OpenRouteServiceProvider()
        result = await provider.get_route(origin_lat, origin_lon, dest_lat, dest_lon, profile)
        result["cached"] = False
        result["origin_label"] = origin_label
        result["destination_label"] = destination_label

        # Persist ONLY structural geometry to cache (TTL 1 hour, no grace window)
        try:
            structural_copy = {
                k: v for k, v in result.items()
                if k not in ("weather_points", "weather_summary", "pollution_points", "pollution_summary")
            }
            cache.set(cache_key, structural_copy, ttl_seconds=_ROUTE_CACHE_TTL)
            logger.debug("Route cached: %s", cache_key)
        except Exception as exc:
            logger.warning("Route cache write failed (non-fatal): %s", exc)

    # Attach dynamic weather along route if requested
    if include_weather and result.get("geometry"):
        pts, summary = await get_route_weather(
            geometry=result["geometry"],
            duration_min=result.get("duration_min", 0.0),
            origin_label=origin_label,
            destination_label=destination_label,
            weather_provider=weather_provider,
        )
        result["weather_points"] = pts
        result["weather_summary"] = summary

    # Attach dynamic pollution exposure along route if requested
    if include_pollution and result.get("geometry"):
        pol_pts, pol_summary = await get_route_pollution(
            geometry=result["geometry"],
            duration_min=result.get("duration_min", 0.0),
            origin_label=origin_label,
            destination_label=destination_label,
            air_service=air_service,
            location_estimator=location_estimator,
            weather_provider=weather_provider,
            force_demo=force_demo,
        )
        result["pollution_points"] = pol_pts
        result["pollution_summary"] = pol_summary

    return result

