"""
Ask Arise Chat Route.
Executes the multi-stage intelligence pipeline:
- Context-aware request routing & planning
- Selective authoritative data retrieval
- Context assembly with bounded memory and address redaction
- Generative answer synthesis (Gemini / Bedrock / grounded fallback)
- Independent evaluation and conditional revision
- Persistent conversation logging and user memory candidate extraction
"""

from datetime import datetime, timezone
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends
from fastapi.security import HTTPAuthorizationCredentials

from app.core.cognito_auth import bearer, get_current_user
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.arise_agent import _generate_grounded_fallback_response
from app.agents.tools import get_verdict, get_air_now, get_forecast, get_fire_signal
from app.agents.pipeline import IntelligencePipeline
from app.domain.chat_models import ChatMessage, ConversationCreate
from app.services.conversations import get_conversation_service
from app.services.identity import get_identity_service
from app.services.memories import get_memory_service

from fastapi import APIRouter, Depends, Request

logger = logging.getLogger("arise.chat")
router = APIRouter(prefix="", tags=["Chat"])


def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> Optional[dict]:
    """Helper to extract user credentials gracefully without throwing 401 for anonymous chat queries."""
    try:
        if get_current_user in request.app.dependency_overrides:
            override = request.app.dependency_overrides[get_current_user]
            return override() if callable(override) else override
    except Exception:
        pass

    if not credentials or not credentials.credentials:
        return None
    try:
        user = get_current_user(credentials)
        return user
    except Exception as e:
        logger.debug(f"Optional auth resolution skipped/failed for chat query: {e}")
        return None


@router.post("/chat", response_model=AskAriseVerdictResponse)
async def ask_arise(
    request: AskAriseRequest,
    user: Optional[dict] = Depends(get_optional_current_user),
) -> AskAriseVerdictResponse:
    """
    Ask Arise Environmental Copilot.
    Executes the multi-stage intelligence pipeline with persistent history and user memory.
    Falls back gracefully to deterministic rule-based output on any pipeline failure.
    """
    identity = get_identity_service().resolve_identity(user) if user and user.get("sub") else None
    user_id = identity.canonical_user_id if identity else None
    linked_subs = identity.linked_subs if identity else []

    conv_service = get_conversation_service()
    mem_service = get_memory_service()

    recent_messages = []
    # If conversation_id provided and user authenticated, load recent messages
    if user_id and request.conversation_id:
        conv = await conv_service.get_conversation(
            user_id=user_id,
            conv_id=request.conversation_id,
            linked_user_ids=linked_subs,
        )
        if conv:
            recent_messages = conv.messages[-8:]

    try:
        pipeline = IntelligencePipeline()
        response = await pipeline.execute(
            request=request,
            conversation_history=recent_messages,
            user_id=user_id,
        )

        # Append turn to conversation history if authenticated
        if user_id:
            try:
                conv_id = request.conversation_id
                if not conv_id:
                    # Auto-initialize conversation with title from prompt
                    new_conv = await conv_service.create_conversation(
                        user_id=user_id,
                        create_data=ConversationCreate(
                            title=(request.question[:40].strip() or "New Conversation")
                        ),
                    )
                    conv_id = new_conv.id

                asst_chat_msg = ChatMessage(
                    role="assistant",
                    content=response.headline,
                    headline=response.headline,
                    verdict=response.verdict,
                    aqi=response.aqi,
                    why=response.why or [],
                    do=response.do or [],
                    best_window=response.best_window,
                    recheck_at=response.recheck_at,
                    sources=response.sources or [],
                    assistant_label=response.assistant_label or "Arise Multi-Stage Intelligence",
                    is_rule_based=getattr(response, "is_rule_based", False) or False,
                    provider=getattr(response, "provider", None),
                    timestamp=response.timestamp or datetime.now(timezone.utc).isoformat(),
                    stage_metadata={"data_used_categories": getattr(response, "data_used_categories", [])},
                    evaluation_metadata={"evaluator_verdict": getattr(response, "evaluator_verdict", None)},
                )
                await conv_service.append_turn(
                    user_id=user_id,
                    conv_id=conv_id,
                    user_content=request.question,
                    assistant_message=asst_chat_msg,
                    location_name=request.location_name,
                    persona=request.persona,
                    linked_user_ids=linked_subs,
                )
                response.conversation_id = conv_id
            except Exception as e:
                logger.warning(f"Failed to append turn to conversation: {e}")


        # Extract candidate memories if user is authenticated
        if user_id:
            try:
                candidates = mem_service.extract_candidate_memories(
                    user_id=user_id,
                    user_question=request.question,
                    assistant_response=response.headline + " " + " ".join(response.why),
                )
                if candidates:
                    response.candidate_memories = [c.model_dump() for c in candidates]
            except Exception as e:
                logger.debug(f"Candidate memory extraction skipped: {e}")

        return response

    except Exception as e:
        logger.warning(
            f"Pipeline top-level exception ({type(e).__name__}: {e}). "
            f"Executing direct rule-based fallback."
        )
        verdict_data = {}
        air_data = {}
        fc_data = {}
        fire_data = {}

        try:
            verdict_data = get_verdict(lat=request.lat, lon=request.lon, persona=request.persona, demo=request.demo) or {}
        except Exception:
            pass

        try:
            air_data = get_air_now(lat=request.lat, lon=request.lon, demo=request.demo) or {}
        except Exception:
            pass

        try:
            fc_data = get_forecast(lat=request.lat, lon=request.lon, demo=request.demo) or {}
        except Exception:
            pass

        try:
            fire_data = get_fire_signal(lat=request.lat, lon=request.lon, demo=request.demo) or {}
        except Exception:
            pass

        fallback_memories = []
        if user_id:
            try:
                fallback_memories = await mem_service.get_approved_memories(user_id)
            except Exception:
                fallback_memories = []

        fallback = _generate_grounded_fallback_response(
            question=request.question,
            verdict_data=verdict_data,
            air_data=air_data,
            fc_data=fc_data,
            fire_data=fire_data,
            location_name=request.location_name,
            user_context=request.user_context,
            environmental_context=request.environmental_context,
            approved_memories=fallback_memories,
        )
        if request.conversation_id:
            fallback.conversation_id = request.conversation_id
            if user_id:
                try:
                    asst_fallback_msg = ChatMessage(
                        role="assistant",
                        content=fallback.headline,
                        headline=fallback.headline,
                        verdict=fallback.verdict,
                        aqi=fallback.aqi,
                        why=fallback.why or [],
                        do=fallback.do or [],
                        best_window=fallback.best_window,
                        recheck_at=fallback.recheck_at,
                        sources=fallback.sources or [],
                        assistant_label=fallback.assistant_label or "Arise Copilot (rule-based)",
                        is_rule_based=True,
                        timestamp=fallback.timestamp or datetime.now(timezone.utc).isoformat(),
                        stage_metadata={"data_used_categories": getattr(fallback, "data_used_categories", [])},
                    )
                    await conv_service.append_turn(
                        user_id=user_id,
                        conv_id=request.conversation_id,
                        user_content=request.question,
                        assistant_message=asst_fallback_msg,
                        location_name=request.location_name,
                        persona=request.persona,
                    )
                except Exception as append_err:
                    logger.debug(f"Could not persist fallback turn: {append_err}")

        return fallback
