from fastapi import APIRouter, Query
from app.services.forecast import ForecastService

router = APIRouter(tags=["Forecast"])
forecast_service = ForecastService()


@router.get("/forecast")
async def get_forecast(
    lat: float = Query(default=28.6139, ge=-90.0, le=90.0),
    lon: float = Query(default=77.2090, ge=-180.0, le=180.0),
    aqi: int = Query(default=312, ge=0),
    demo: bool = Query(default=False)
):
    """Retrieve 24-hour and 7-day forecast series with dynamic best outdoor window."""
    bundle = await forecast_service.get_forecast(lat, lon, current_aqi=aqi, force_demo=demo)
    return bundle
