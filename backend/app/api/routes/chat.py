"""
Ask Arise Chat Route.
Executes Strands AI environmental copilot with structured JSON response.
"""

from fastapi import APIRouter, HTTPException, Depends
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.arise_agent import AriseAgent

router = APIRouter(prefix="", tags=["Chat"])


@router.post("/chat", response_model=AskAriseVerdictResponse)
async def ask_arise(request: AskAriseRequest) -> AskAriseVerdictResponse:
    """
    Ask Arise Environmental Copilot.
    Returns structured verdict response grounded in real-time telemetry.
    """
    try:
        agent = AriseAgent()
        return await agent.answer(request)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Environmental reasoning copilot error: {str(e)}"
        )
