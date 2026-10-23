"""
API routes for Ask Arise user-controlled long-term memory.
Provides full CRUD, approval workflows, secret scrubbing, and category filtering:
- List memories
- Create memory
- Update memory (approve, modify content, revoke)
- Delete memory
"""

import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.cognito_auth import get_current_user
from app.domain.chat_models import (
    MemoryCategory,
    MemoryCreate,
    MemoryPatch,
    MemoryStatus,
    UserMemoryItem,
)
from app.services.memories import MemoryService, get_memory_service
from app.services.identity import get_identity_service

logger = logging.getLogger("arise.memories_route")
router = APIRouter(prefix="/memories", tags=["Memories"])


@router.get("", response_model=List[UserMemoryItem])
async def list_memories(
    category: Optional[str] = Query(default=None, description="Filter by memory category"),
    status_filter: Optional[str] = Query(
        default=None, alias="status", description="Filter by approval status"
    ),
    only_approved: bool = Query(default=False, description="Return only approved memories"),
    user: dict = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
) -> List[UserMemoryItem]:
    """List memories belonging to the authenticated user and verified linked identities."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    if only_approved:
        return await service.get_approved_memories(
            user_id=identity.canonical_user_id,
            linked_user_ids=identity.linked_subs,
        )

    return await service.list_memories(
        user_id=identity.canonical_user_id,
        status=status_filter,
        category=category,
        linked_user_ids=identity.linked_subs,
    )


@router.post("", response_model=UserMemoryItem, status_code=status.HTTP_201_CREATED)
async def create_memory(
    payload: MemoryCreate,
    user: dict = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
) -> UserMemoryItem:
    """Create a new memory entry for the authenticated canonical user. Automatically scrubs secrets."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    return await service.create_memory(user_id=identity.canonical_user_id, create_data=payload)


@router.patch("/{memory_id}", response_model=UserMemoryItem)
async def patch_memory(
    memory_id: str,
    patch: MemoryPatch,
    user: dict = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
) -> UserMemoryItem:
    """Update or approve/reject/revoke an existing memory."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    updated = await service.patch_memory(
        user_id=identity.canonical_user_id,
        memory_id=memory_id,
        patch_data=patch,
        linked_user_ids=identity.linked_subs,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory {memory_id} not found or access denied.",
        )
    return updated


@router.post("/{memory_id}/approve", response_model=UserMemoryItem)
async def approve_memory(
    memory_id: str,
    user: dict = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
) -> UserMemoryItem:
    """Explicitly approve a pending memory item."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    updated = await service.patch_memory(
        user_id=identity.canonical_user_id,
        memory_id=memory_id,
        patch_data=MemoryPatch(status="approved"),
        linked_user_ids=identity.linked_subs,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory {memory_id} not found or access denied.",
        )
    return updated


@router.delete("/{memory_id}", status_code=status.HTTP_200_OK)
async def delete_memory(
    memory_id: str,
    user: dict = Depends(get_current_user),
    service: MemoryService = Depends(get_memory_service),
) -> dict:
    """Permanently delete a memory item owned by the authenticated user."""
    user_id = user.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user claims.")

    identity = get_identity_service().resolve_identity(user)

    success = await service.delete_memory(
        user_id=identity.canonical_user_id,
        memory_id=memory_id,
        linked_user_ids=identity.linked_subs,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Memory {memory_id} not found or access denied.",
        )
    return {"success": True, "memory_id": memory_id}

