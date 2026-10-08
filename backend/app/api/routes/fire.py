from fastapi import APIRouter, Query
from app.sources.firms import FirmsFireProvider

router = APIRouter(tags=["Fire Signals"])
fire_provider = FirmsFireProvider()


@router.get("/fire/signals")
async def get_fire_signals(
    lat: float = Query(default=28.6139, ge=-90.0, le=90.0),
    lon: float = Query(default=77.2090, ge=-180.0, le=180.0),
    demo: bool = Query(default=False)
):
    """Retrieve satellite fire signals. Terminology uses non-causal signal language only."""
    signals = await fire_provider.get_regional_fire_signals(lat, lon, force_demo=demo)
    return {
        "signals_count": len(signals),
        "signals": [s.model_dump() for s in signals],
        "disclaimer": "Satellite thermal signals indicate potential regional burning. They do not constitute direct proof of local pollution causation."
    }
