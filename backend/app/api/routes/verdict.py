from fastapi import APIRouter, Query
from app.services.environment import EnvironmentService
from app.domain.verdict import evaluate_environment

router = APIRouter(tags=["Verdict"])
env_service = EnvironmentService()


@router.get("/verdict")
async def get_verdict(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    persona: str = Query(default="General Public"),
    demo: bool = Query(default=False)
):
    """Deterministic verdict evaluation for a specific persona."""
    snapshot = await env_service.get_environmental_snapshot(
        lat=lat, lon=lon, persona=persona, force_demo=demo
    )
    verdict_res = evaluate_environment(snapshot, persona=persona)
    return verdict_res.model_dump()
