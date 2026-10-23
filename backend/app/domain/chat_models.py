"""
Pydantic data models for Persistent Conversations, Messages, and Structured User Memory.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
import re
import uuid


def _sanitize_text(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    # Strip HTML tags and control characters to prevent stored XSS
    return re.sub(r"[<>]", "", str(val)).strip()


class ChatMessage(BaseModel):
    """Individual message in a conversation thread."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    role: Literal["user", "assistant", "system"]
    content: str
    timestamp: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    verdict: Optional[str] = None
    headline: Optional[str] = None
    why: List[str] = Field(default_factory=list)
    do: List[str] = Field(default_factory=list)
    best_window: Optional[str] = None
    recheck_at: Optional[str] = None
    sources: List[str] = Field(default_factory=list)
    assistant_label: Optional[str] = None
    is_rule_based: bool = False
    provider: Optional[str] = None
    evaluation_metadata: Optional[Dict[str, Any]] = None
    stage_metadata: Optional[Dict[str, Any]] = None

    @field_validator("content", "headline", "verdict")
    @classmethod
    def sanitize_strings(cls, v):
        return _sanitize_text(v)


class ConversationSummary(BaseModel):
    """Metadata summary for sidebar conversation listing."""
    id: str
    user_id: str
    title: str = Field(default="New Environmental Chat", max_length=150)
    created_at: str
    updated_at: str
    is_archived: bool = False
    is_pinned: bool = False
    message_count: int = 0
    last_message_preview: Optional[str] = None
    location_name: Optional[str] = None
    persona: Optional[str] = None


class ConversationDetail(BaseModel):
    """Full conversation with complete message history."""
    id: str
    user_id: str
    title: str = Field(default="New Environmental Chat", max_length=150)
    created_at: str
    updated_at: str
    is_archived: bool = False
    is_pinned: bool = False
    messages: List[ChatMessage] = Field(default_factory=list)
    location_name: Optional[str] = None
    persona: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ConversationCreate(BaseModel):
    """Payload to initialize a new conversation."""
    id: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=150)
    initial_message: Optional[str] = None
    initial_messages: Optional[List[Any]] = None
    location_name: Optional[str] = None
    persona: Optional[str] = "General Public"


class ConversationPatch(BaseModel):
    """Payload to rename, archive, or pin a conversation."""
    title: Optional[str] = Field(default=None, min_length=1, max_length=150)
    is_archived: Optional[bool] = None
    is_pinned: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v):
        if v is not None:
            clean = _sanitize_text(v)
            if not clean:
                raise ValueError("Title cannot be empty after sanitization.")
            return clean
        return v


# ─────────────────────────────────────────────────────────────────────────────
# STRUCTURED USER MEMORY MODELS
# ─────────────────────────────────────────────────────────────────────────────

MemoryCategory = Literal[
    "preference",            # e.g., "Prefers concise bullet points and AQI numbers"
    "health_environmental",  # e.g., "Has asthma, triggers on high PM2.5 > 150"
    "location_reference",   # e.g., "Commutes from GK to Greater Noida by car"
    "routine_task",          # e.g., "Regularly jogs between 6 AM and 7 AM"
    "approved_fact"          # e.g., "School administrator for primary campus"
]

MemoryStatus = Literal["approved", "pending_approval", "rejected"]


class UserMemoryItem(BaseModel):
    """Structured long-term memory entity separate from conversation logs."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    category: MemoryCategory
    key: str = Field(default="", max_length=100)
    content: str = Field(default="", max_length=500)
    fact: Optional[str] = Field(default=None, max_length=500)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    status: MemoryStatus = "approved"
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    last_confirmed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source_conversation_id: Optional[str] = None
    is_sensitive: bool = False

    @model_validator(mode="before")
    @classmethod
    def reconcile_fact_and_content(cls, data: Any) -> Any:
        if isinstance(data, dict):
            c = data.get("content")
            f = data.get("fact")
            if not c and f:
                data["content"] = str(f).strip()
            elif not f and c:
                data["fact"] = str(c).strip()
            elif c and f:
                data["fact"] = str(f).strip()
                data["content"] = str(c).strip()
            if not data.get("key") and (data.get("content") or data.get("fact")):
                raw = (data.get("content") or data.get("fact") or "").strip()
                derived = re.sub(r"[^\w]+", "_", raw[:30].lower()).strip("_")
                data["key"] = derived or "user_memory"
        return data

    @field_validator("key", "content", "fact")
    @classmethod
    def clean_text(cls, v):
        return _sanitize_text(v)


class MemoryCreate(BaseModel):
    """Payload to create an approved or proposed memory."""
    category: MemoryCategory = "preference"
    key: Optional[str] = Field(default=None, max_length=100)
    content: Optional[str] = Field(default=None, max_length=500)
    fact: Optional[str] = Field(default=None, max_length=500)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    status: Optional[MemoryStatus] = None
    source_conversation_id: Optional[str] = None
    is_sensitive: bool = False

    @model_validator(mode="before")
    @classmethod
    def check_content_or_fact(cls, data: Any) -> Any:
        if isinstance(data, dict):
            c = data.get("content")
            f = data.get("fact")
            c_str = str(c).strip() if c is not None else ""
            f_str = str(f).strip() if f is not None else ""
            if not c_str and not f_str:
                raise ValueError("Either 'content' or 'fact' must be provided as non-empty text.")
            data["content"] = c_str or f_str
            data["fact"] = f_str or c_str
            if not data.get("key"):
                raw = data["content"]
                derived = re.sub(r"[^\w]+", "_", raw[:35].lower()).strip("_")
                data["key"] = derived or "user_fact"
        return data


class MemoryPatch(BaseModel):
    """Payload to update, approve, or correct a saved memory."""
    content: Optional[str] = Field(default=None, min_length=1, max_length=500)
    fact: Optional[str] = Field(default=None, min_length=1, max_length=500)
    status: Optional[MemoryStatus] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    @model_validator(mode="before")
    @classmethod
    def reconcile_patch_content(cls, data: Any) -> Any:
        if isinstance(data, dict):
            c = data.get("content")
            f = data.get("fact")
            if c is not None and not str(c).strip():
                raise ValueError("'content' cannot be empty or whitespace.")
            if f is not None and not str(f).strip():
                raise ValueError("'fact' cannot be empty or whitespace.")
            if not data.get("content") and data.get("fact"):
                data["content"] = str(data["fact"]).strip()
        return data

