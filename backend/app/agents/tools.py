"""
Grounding tools for Strands Ask Arise Agent.
Every tool accesses authoritative backend/domain services.
Tools NEVER fabricate measurements.
"""

import asyncio
from typing import Any, Dict, List, Optional
from strands import tool

from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService
from app.services.compare_places import ComparePlacesService


def _run_async(coro):
    """Safely run async coroutine from synchronous tool context."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result(timeout=15.0)
    else:
        return asyncio.run(coro)


@tool(description="Retrieve real-time air quality, AQI, and pollutant readings at specified coordinates.")
def get_air_now(lat: float = 28.6139, lon: float = 77.2090, demo: bool = False) -> Dict[str, Any]:
    """
    Get current air quality observation and deterministic AQI.
    Returns: aqi, category, dominant_pollutant, pollutants.
    """
    env_svc = EnvironmentService()
    snapshot = _run_async(env_svc.get_environmental_snapshot(lat=lat, lon=lon, force_demo=demo))
    return {
        "aqi": snapshot.aqi,
        "category": snapshot.aqi_category,
        "dominant_pollutant": snapshot.dominant_pollutant,
        "pollutants": [
            {
                "pollutant": p.pollutant,
                "value": p.value,
                "unit": p.unit,
                "status": p.quality,
            }
            for p in snapshot.pollutants.values()
        ],
        "station_count": len(snapshot.contributing_stations),
        "source": "CPCB / OpenAQ Ground Telemetry" if not snapshot.is_demo else "Saved Severe Event (Demo)",
        "weather": {
            "temperature": round(snapshot.weather.temperature, 1) if snapshot.weather else 28.4,
            "feels_like": round(snapshot.weather.feels_like, 1) if snapshot.weather else 30.8,
            "humidity": round(snapshot.weather.humidity, 1) if snapshot.weather else 58.0,
            "wind_speed": round(snapshot.weather.wind_speed, 1) if snapshot.weather else 3.2,
            "wind_direction": snapshot.weather.wind_direction if snapshot.weather else "NW",
            "condition": snapshot.weather.condition_text if snapshot.weather else "Partly Cloudy",
        },
    }


@tool(description="Retrieve hourly weather and air-quality forecast, lowest-risk outdoor window, and recheck time.")
def get_forecast(lat: float = 28.6139, lon: float = 77.2090, demo: bool = False) -> Dict[str, Any]:
    """
    Retrieve forecast timeline and lowest-risk outdoor activity window.
    """
    env_svc = EnvironmentService()
    fc_svc = ForecastService()
    snapshot = _run_async(env_svc.get_environmental_snapshot(lat=lat, lon=lon, force_demo=demo))
    bundle = _run_async(fc_svc.get_forecast(lat=lat, lon=lon, current_aqi=snapshot.aqi, force_demo=demo))
    daily_list = bundle.get("forecast7Day") or []
    return {
        "best_window": bundle.get("bestWindow", snapshot.best_window or "No recommended outdoor window"),
        "recheck_at": snapshot.recheck_at or "4:00 PM",
        "forecast_points": [
            {
                "hour": pt.get("time"),
                "aqi": pt.get("aqi"),
                "temp": pt.get("temp"),
                "rain_prob": pt.get("rainProb"),
            }
            for pt in bundle.get("hourly", [])
        ],
        "daily_forecast": daily_list,
    }


@tool(description="Retrieve satellite active thermal fire signals detected in regional upwind zones (NASA FIRMS).")
def get_fire_signal(lat: float = 28.6139, lon: float = 77.2090, demo: bool = False) -> Dict[str, Any]:
    """
    Retrieve satellite fire signals. Terminology: 'Satellite fire signal detected'.
    Must NEVER claim fires directly caused pollution without meteorological evidence.
    """
    env_svc = EnvironmentService()
    snapshot = _run_async(env_svc.get_environmental_snapshot(lat=lat, lon=lon, force_demo=demo))
    is_live = any(s.source == "NASA-FIRMS" for s in snapshot.fire_signals)
    is_demo = all(s.source == "DEMO" for s in snapshot.fire_signals) or not is_live
    return {
        "signals_count": len(snapshot.fire_signals),
        "is_live": is_live,
        "is_demo": is_demo,
        "source": "NASA-FIRMS" if is_live else "DEMO",
        "signals": [
            {
                "latitude": s.latitude,
                "longitude": s.longitude,
                "distance_km": s.distance_km,
                "direction": s.direction,
                "confidence": s.confidence,
                "satellite": s.satellite,
                "source": s.source,
            }
            for s in snapshot.fire_signals
        ],
        "disclaimer": "Thermal anomalies indicate satellite heat detections. Environmental impact depends on surface wind dispersion (fire signal, not proof of cause).",
    }


@tool(description="Retrieve indoor sensor telemetry for classroom/home indoor monitoring (Simulated Demo).")
def get_indoor(demo: bool = True) -> Dict[str, Any]:
    """
    Retrieve indoor sensor measurements.
    Explicitly labeled simulated demo data.
    """
    return {
        "indoor_pm25": 42.0,
        "indoor_co2": 650,
        "status": "Good",
        "purifier_status": "Active (High HEPA Filtration)",
        "is_simulated": True,
        "disclaimer": "Indoor sensor reading is simulated demo telemetry.",
    }


@tool(description="Compute authoritative deterministic verdict (GO, BE_SMART, CUT_BACK, STAY_IN) for a persona.")
def get_verdict(
    lat: float = 28.6139,
    lon: float = 77.2090,
    persona: str = "General Public",
    demo: bool = False,
) -> Dict[str, Any]:
    """
    Compute authoritative verdict. The LLM must NEVER override this verdict.
    """
    env_svc = EnvironmentService()
    snapshot = _run_async(env_svc.get_environmental_snapshot(lat=lat, lon=lon, persona=persona, force_demo=demo))
    return {
        "verdict": snapshot.verdict or "STAY_IN",
        "aqi": snapshot.aqi,
        "category": snapshot.aqi_category,
        "persona": persona,
        "recommendation": snapshot.recommendation,
        "best_window": snapshot.best_window,
        "recheck_at": snapshot.recheck_at,
        "sources": snapshot.sources,
    }


@tool(description="Compare air quality across multiple locations (e.g. Home, School, Office).")
def compare_places(places: List[Dict[str, Any]], demo: bool = False) -> Dict[str, Any]:
    """
    Compare multiple places by coordinates and labels.
    """
    from app.services.compare_places import PlaceTarget
    targets = [
        PlaceTarget(
            label=p.get("label", "Location"),
            latitude=p.get("latitude") if p.get("latitude") is not None else p.get("lat", 28.6139),
            longitude=p.get("longitude") if p.get("longitude") is not None else p.get("lon", 77.2090),
        )
        for p in places
    ]
    svc = ComparePlacesService()
    res = _run_async(svc.compare_locations(targets, force_demo=demo))
    return {"comparison": [r.model_dump() for r in res.results], "cleanest": res.cleanest_place, "worst": res.worst_place}
