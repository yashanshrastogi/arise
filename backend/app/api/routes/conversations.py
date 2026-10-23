"""
API routes for Ask Arise persistent conversations.
Enforces strict per-user ownership and full conversation lifecycle:
- List conversations (with search, archive filter, pin sorting)
- Create new conversation
- Get full conversation detail and message history
- Patch conversation (rename title, archive, pin)
- Delete conversation
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.cognito_auth import get_current_user
from app.domain.chat_models import (
    ConversationCreate,
    ConversationDetail,
    ConversationPatch,
    ConversationSummary,
)
from app.services.conversations import ConversationService, get_conversation_service
from app.services.identity import get_identity_service

logger = logging.getLogger("arise.conversations_route")
router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    include_archived: bool = Query(default=False, description="Include archived conversations"),
    query: Optional[str] = Query(default=None, description="Search query string for filtering titles"),
    limit: int = Query(default=50, ge=1, le=100, description="Max conversations to return"),
    user: dict = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
) -> List[ConversationSummary]:
    """List all conversations owned by the authenticated user and verified linked identities."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    return await service.list_conversations(
        user_id=identity.canonical_user_id,
        linked_user_ids=identity.linked_subs,
        include_archived=include_archived,
        search_query=query,
    )


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
async def create_conversation(
    payload: ConversationCreate,
    user: dict = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationDetail:
    """Create a new conversation for the authenticated canonical user."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    return await service.create_conversation(user_id=identity.canonical_user_id, create_data=payload)


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationDetail:
    """Retrieve full conversation details and history. Strictly isolates user conversations."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    conv = await service.get_conversation(
        user_id=identity.canonical_user_id,
        conv_id=conversation_id,
        linked_user_ids=identity.linked_subs,
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found or access denied.",
        )
    return conv


@router.patch("/{conversation_id}", response_model=ConversationDetail)
async def patch_conversation(
    conversation_id: str,
    patch: ConversationPatch,
    user: dict = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
) -> ConversationDetail:
    """Update title, pinned status, or archive status of a conversation."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    updated = await service.patch_conversation(
        user_id=identity.canonical_user_id,
        conv_id=conversation_id,
        patch_data=patch,
        linked_user_ids=identity.linked_subs,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found or access denied.",
        )
    return updated


@router.delete("/{conversation_id}", status_code=status.HTTP_200_OK)
async def delete_conversation(
    conversation_id: str,
    user: dict = Depends(get_current_user),
    service: ConversationService = Depends(get_conversation_service),
) -> dict:
    """Permanently delete a conversation owned by the authenticated user."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    success = await service.delete_conversation(
        user_id=identity.canonical_user_id,
        conv_id=conversation_id,
        linked_user_ids=identity.linked_subs,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found or access denied.",
        )
    return {"success": True, "conversation_id": conversation_id}

