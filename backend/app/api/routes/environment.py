from fastapi import APIRouter, Query
from app.services.environment import EnvironmentService
from app.services.forecast import ForecastService

router = APIRouter(tags=["Environment"])
env_service = EnvironmentService()
forecast_service = ForecastService()


@router.get("/environment")
async def get_environment_snapshot(
    lat: float = Query(default=28.6139, ge=-90.0, le=90.0),
    lon: float = Query(default=77.2090, ge=-180.0, le=180.0),
    persona: str = Query(default="General Public"),
    demo: bool = Query(default=False)
):
    """
    Unified environmental snapshot endpoint.
    Feeds the entire Arise React dashboard in a single, perfectly synchronized atomic payload.
    """
    snapshot = await env_service.get_environmental_snapshot(
        lat=lat, lon=lon, persona=persona, force_demo=demo
    )
    forecast_bundle = await forecast_service.get_forecast(
        lat=lat, lon=lon, current_aqi=snapshot.aqi, force_demo=demo
    )
    payload = env_service.format_ui_payload(snapshot, forecast_bundle)
    return payload
