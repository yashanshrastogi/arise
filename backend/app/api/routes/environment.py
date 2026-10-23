from fastapi import APIRouter, Query
from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService

router = APIRouter(tags=["Environment"])
env_service = EnvironmentService()
forecast_service = ForecastService()


@router.get("/environment")
async def get_environment_snapshot(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    persona: str = Query(default="General Public"),
    demo: bool = Query(default=False),
    location_name: str = Query(default=None, description="Optional user-selected location or city display name")
):
    """
    Unified environmental snapshot endpoint.
    Feeds the entire Arise React dashboard in a single, perfectly synchronized atomic payload.
    """
    snapshot = await env_service.get_environmental_snapshot(
        lat=lat, lon=lon, persona=persona, force_demo=demo, location_name=location_name
    )
    forecast_bundle = await forecast_service.get_forecast(
        lat=lat, lon=lon, current_aqi=snapshot.aqi, force_demo=demo
    )
    payload = env_service.format_ui_payload(snapshot, forecast_bundle)
    return payload
