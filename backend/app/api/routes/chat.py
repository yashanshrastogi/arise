"""
Ask Arise Chat Route.
Executes Strands AI environmental copilot with structured JSON response.
"""

import logging
from fastapi import APIRouter
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.arise_agent import AriseAgent, _generate_grounded_fallback_response
from app.agents.tools import get_verdict, get_air_now, get_forecast, get_fire_signal

logger = logging.getLogger("arise.chat")
router = APIRouter(prefix="", tags=["Chat"])


@router.post("/chat", response_model=AskAriseVerdictResponse)
async def ask_arise(request: AskAriseRequest) -> AskAriseVerdictResponse:
    """
    Ask Arise Environmental Copilot.
    Tries Bedrock; on any exception, automatically falls back to a rule-based
    answer built from the verdict engine and tool data.
    Labels the response 'Arise Assistant (rule-based)' when the fallback is used.
    """
    try:
        agent = AriseAgent()
        return await agent.answer(request)
    except Exception as e:
        logger.warning(
            f"Top-level chat exception ({type(e).__name__}: {e}). "
            f"Executing direct rule-based fallback."
        )
        verdict_data = get_verdict(lat=request.lat, lon=request.lon, persona=request.persona, demo=request.demo)
        air_data = get_air_now(lat=request.lat, lon=request.lon, demo=request.demo)
        fc_data = get_forecast(lat=request.lat, lon=request.lon, demo=request.demo)
        fire_data = get_fire_signal(lat=request.lat, lon=request.lon, demo=request.demo)
        return _generate_grounded_fallback_response(
            question=request.question,
            verdict_data=verdict_data,
            air_data=air_data,
            fc_data=fc_data,
            fire_data=fire_data,
        )
