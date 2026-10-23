from fastapi import APIRouter, Query
from app.sources.weather import OpenMeteoWeatherProvider

router = APIRouter(tags=["Weather"])
weather_provider = OpenMeteoWeatherProvider()


@router.get("/weather/now")
async def get_weather_now(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    demo: bool = Query(default=False)
):
    """Retrieve current surface weather and meteorological dispersion factors."""
    snap = await weather_provider.get_current_weather(lat, lon, force_demo=demo)
    return snap.model_dump()
