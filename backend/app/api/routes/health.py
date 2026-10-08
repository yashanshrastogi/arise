from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check():
    """Health check endpoint exposing operational status without leaking credentials."""
    settings = get_settings()
    return {
        "ok": True,
        "project": "Arise",
        "mode": settings.MODE,
        "llm_provider": settings.LLM_PROVIDER,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
