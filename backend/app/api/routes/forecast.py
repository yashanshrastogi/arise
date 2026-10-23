from typing import Optional
from fastapi import APIRouter, Query
from app.services.forecast import ForecastService

router = APIRouter(tags=["Forecast"])
forecast_service = ForecastService()


@router.get("/forecast")
async def get_forecast(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    aqi: Optional[int] = Query(default=None, ge=0, description="Current ground-truth AQI for calibration if available"),
    demo: bool = Query(default=False)
):
    """Retrieve 24-hour and 7-day forecast series with dynamic best outdoor window."""
    bundle = await forecast_service.get_forecast(lat, lon, current_aqi=aqi, force_demo=demo)
    return bundle
