from datetime import datetime, timezone
from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(tags=["Health"])


@router.get("/health")
def health_check():
    """Health check endpoint exposing operational status without leaking credentials."""
    from app.cache.repository import get_cache_repository
    settings = get_settings()
    cache = get_cache_repository()
    return {
        "status": "healthy",
        "service": "Arise API",
        "version": "2.0.0",
        "mode": settings.MODE,
        "llm_provider": settings.LLM_PROVIDER,
        "cache": "connected" if cache else "unavailable",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ok": True,
        "project": "Arise"
    }
