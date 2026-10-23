"""
Scheduled Environmental Ingestion Lambda for Phase 3.
Invoked every 30 minutes via AWS EventBridge Scheduler.
Gathers real-time telemetry across OpenAQ, Open-Meteo, and NASA FIRMS,
normalizes data, evaluates AQI, and populates the cache table idempotently.
"""

import asyncio
import logging
import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
from aws_lambda_powertools import Logger
from app.core.config import get_settings
from app.services.environment import EnvironmentService
from app.cache.repository import get_cache_repository, get_geographic_cell

settings = get_settings()
logger = Logger(service="arise-ingestion")


async def run_ingestion_pipeline(lat: float = 28.6139, lon: float = 77.2090):
    """Execute environmental pipeline and refresh cache."""
    logger.info(f"Starting scheduled environmental ingestion for coordinates ({lat}, {lon}).")
    env_service = EnvironmentService()
    cache = get_cache_repository()

    # 1. Fetch live snapshot (which internally queries providers, interpolates, and evaluates AQI)
    snapshot = await env_service.get_environmental_snapshot(lat=lat, lon=lon, force_demo=False)
    
    # 2. Store pre-computed unified snapshot in cache with deterministic spatial key
    _, _, cell_key = get_geographic_cell(lat, lon, settings.WEATHER_GRID_RESOLUTION_DEG)
    cache_key = cell_key.replace("weather:cell:", "env:cell:")
    cache.set(
        key=cache_key,
        value=snapshot.model_dump(),
        ttl_seconds=settings.CACHE_TTL_SECONDS,
        source="ingestion_scheduler"
    )

    logger.info(
        f"Ingestion complete: AQI={snapshot.aqi}, Category={snapshot.aqi_category}, "
        f"Dominant={snapshot.dominant_pollutant}, Stations={len(snapshot.contributing_stations)}, "
        f"Fires={len(snapshot.fire_signals)}."
    )
    return {
        "status": "success",
        "aqi": snapshot.aqi,
        "category": snapshot.aqi_category,
        "dominant_pollutant": snapshot.dominant_pollutant,
        "stations_count": len(snapshot.contributing_stations),
        "fire_signals_count": len(snapshot.fire_signals),
        "is_stale": snapshot.is_stale,
        "data_quality": snapshot.data_quality
    }


@logger.inject_lambda_context(log_event=False)
def handler(event, context):
    """
    AWS EventBridge Scheduler target handler.
    Runs asynchronously and completes within Lambda timeout.
    """
    try:
        lat = float(event.get("lat", 28.6139)) if isinstance(event, dict) else 28.6139
        lon = float(event.get("lon", 77.2090)) if isinstance(event, dict) else 77.2090
        
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError("Closed")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        result = loop.run_until_complete(run_ingestion_pipeline(lat=lat, lon=lon))
        return {
            "statusCode": 200,
            "body": result
        }
    except Exception as e:
        logger.exception(f"Scheduled ingestion failed: {e}")
        return {
            "statusCode": 500,
            "error": str(e)
        }
