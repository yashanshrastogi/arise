"""
Persistent Structured User Memory Service for Ask Arise.
Maintains user-approved preferences, health/environmental sensitivities,
routine tasks, and stable facts independently of raw chat transcripts.
Enforces privacy scrubbing, duplicate/conflict detection, and explicit consent.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import Dict, List, Optional
import uuid

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings
from app.domain.chat_models import (
    MemoryCreate,
    MemoryPatch,
    UserMemoryItem,
)

logger = logging.getLogger("arise.memories")

_LOCAL_MEMORIES_DIR = Path(
    "/tmp/arise_memories"
    if (os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"))
    else "data/memories"
)

# Regex to detect potential secrets, tokens, and credentials
_SECRET_PATTERNS = [
    re.compile(r"(?:api[_-]?key|secret|token|password|auth|bearer)\s*(?:is\s*|[:=]\s*)\s*[\w\-\.]{8,}", re.IGNORECASE),
    re.compile(r"AIza[0-9A-Za-z-_]{20,45}"),  # Google API key
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),     # OpenAI key
    re.compile(r"ey[a-zA-Z0-9_-]{10,}\.ey[a-zA-Z0-9_-]{10,}"), # JWT
]

# Sensitive patterns that require explicit user approval
_SENSITIVE_PATTERNS = [
    re.compile(r"\b(asthma|inhaler|respiratory|bronchitis|copd|cardiac|pregnancy|pregnant)\b", re.IGNORECASE),
    re.compile(r"\b(my kid|my daughter|my son|my father|my mother|parents)\b", re.IGNORECASE),
    re.compile(r"\b(home address|my house is at|exact address)\b", re.IGNORECASE),
]


def scrub_secrets(text: Optional[str]) -> str:
    """Scrub sensitive credentials, keys, or passwords from string."""
    if not text:
        return ""
    clean = str(text)
    for pattern in _SECRET_PATTERNS:
        clean = pattern.sub("[REDACTED_SECRET]", clean)
    return clean


def is_sensitive_content(text: Optional[str]) -> bool:
    """Check if content mentions health, vulnerable family members, or sensitive facts."""
    if not text:
        return False
    clean = str(text)
    return any(p.search(clean) for p in _SENSITIVE_PATTERNS)


class MemoryService:
    def __init__(self):
        self.settings = get_settings()

    def _get_table(self):
        if self.settings.MODE != "aws":
            return None
        table_name = os.getenv("MEMORY_TABLE_NAME", "arise-memories-prod").strip()
        try:
            from botocore.config import Config
            fast_config = Config(connect_timeout=3, read_timeout=3, retries={"max_attempts": 2})
            return boto3.resource(
                "dynamodb",
                region_name=self.settings.AWS_REGION,
                config=fast_config,
            ).Table(table_name)
        except Exception as exc:
            logger.warning(f"DynamoDB memory table init notice: {exc}. Using local storage.")
            return None

    def _get_user_file(self, user_id: str) -> Path:
        safe_user_id = re.sub(r"[^\w\-.]", "_", user_id)
        _LOCAL_MEMORIES_DIR.mkdir(parents=True, exist_ok=True)
        return _LOCAL_MEMORIES_DIR / f"{safe_user_id}.json"

    def _load_local_memories(self, user_id: str) -> List[UserMemoryItem]:
        file_path = self._get_user_file(user_id)
        if not file_path.exists():
            return []
        try:
            items_raw = json.loads(file_path.read_text(encoding="utf-8"))
            return [UserMemoryItem(**item) for item in items_raw if item.get("user_id") == user_id]
        except Exception as exc:
            logger.warning(f"Error reading memories for {user_id}: {exc}")
            return []

    def _save_local_memories(self, user_id: str, memories: List[UserMemoryItem]) -> None:
        file_path = self._get_user_file(user_id)
        data = [m.model_dump() for m in memories if m.user_id == user_id]
        file_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    async def list_memories(
        self,
        user_id: str,
        status: Optional[str] = None,
        category: Optional[str] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> List[UserMemoryItem]:
        """List structured memories for user and linked identities, optionally filtered by status or category."""
        target_uids = list(dict.fromkeys([user_id] + (linked_user_ids or [])))
        table = self._get_table()
        memories_by_id: dict[str, UserMemoryItem] = {}

        if table is not None:
            try:
                from boto3.dynamodb.conditions import Key
                for uid in target_uids:
                    resp = table.query(
                        KeyConditionExpression=Key("user_id").eq(uid)
                    )
                    for it in resp.get("Items", []):
                        m = UserMemoryItem(**it)
                        if m.id not in memories_by_id:
                            memories_by_id[m.id] = m
            except Exception as e:
                logger.warning(f"DynamoDB list memories error: {e}")

        for uid in target_uids:
            local_list = self._load_local_memories(uid)
            for m in local_list:
                if m.id not in memories_by_id:
                    memories_by_id[m.id] = m

        memories = list(memories_by_id.values())
        if status:
            memories = [m for m in memories if m.status == status]
        if category:
            memories = [m for m in memories if m.category == category]
        memories.sort(key=lambda m: m.created_at, reverse=True)
        return memories

    async def get_approved_memories(
        self,
        user_id: str,
        linked_user_ids: Optional[List[str]] = None,
    ) -> List[UserMemoryItem]:
        """Get only approved memories for prompt context injection across linked identities."""
        return await self.list_memories(user_id, status="approved", linked_user_ids=linked_user_ids)

    async def create_memory(
        self,
        user_id: str,
        create_data: MemoryCreate,
    ) -> UserMemoryItem:
        """Create a new memory item, validating secrecy, deriving keys, and detecting conflicts."""
        raw_text = (create_data.content or create_data.fact or "").strip()
        clean_content = scrub_secrets(raw_text)
        sensitive = create_data.is_sensitive or is_sensitive_content(clean_content) or (create_data.category == "health_environmental")

        # Sensitive facts default to pending_approval if not explicitly specified
        status = create_data.status
        if status is None:
            status = "pending_approval" if sensitive else "approved"

        # Determine key
        raw_key = (create_data.key or "").strip()
        if not raw_key:
            words = re.findall(r"\w+", clean_content.lower())
            slug = "_".join(words[:4]) if words else "fact"
            raw_key = f"{create_data.category}_{slug}"[:60]

        now_iso = datetime.now(timezone.utc).isoformat()
        item = UserMemoryItem(
            id=str(uuid.uuid4()),
            user_id=user_id,
            category=create_data.category,
            key=raw_key,
            content=clean_content,
            fact=clean_content,
            confidence=create_data.confidence,
            status=status,
            created_at=now_iso,
            last_confirmed_at=now_iso,
            source_conversation_id=create_data.source_conversation_id,
            is_sensitive=sensitive,
        )

        existing = self._load_local_memories(user_id)

        # Check for duplicates or update existing key
        updated_list = []
        replaced = False
        for ex in existing:
            # Replace only if exact same explicit key or identical content within category
            is_exact_match = (
                (ex.key.lower() == item.key.lower() and ex.category == item.category)
                or (ex.content.lower() == item.content.lower() and ex.category == item.category)
            )
            if is_exact_match:
                item.id = ex.id
                item.created_at = ex.created_at
                updated_list.append(item)
                replaced = True
            else:
                updated_list.append(ex)

        if not replaced:
            updated_list.append(item)

        self._save_local_memories(user_id, updated_list)

        table = self._get_table()
        if table is not None:
            try:
                table.put_item(Item=item.model_dump())
            except Exception as e:
                logger.warning(f"DynamoDB put memory failed: {e}")

        return item

    async def update_memory(
        self,
        user_id: str,
        mem_id: Optional[str] = None,
        patch: Optional[MemoryPatch] = None,
        memory_id: Optional[str] = None,
        patch_data: Optional[MemoryPatch] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> Optional[UserMemoryItem]:
        """Update, approve, or correct a user memory item for user or linked identities."""
        target_id = mem_id or memory_id
        target_patch = patch or patch_data
        if not target_id or not target_patch:
            return None

        target_uids = list(dict.fromkeys([user_id] + (linked_user_ids or [])))
        for uid in target_uids:
            memories = self._load_local_memories(uid)
            target = None
            for m in memories:
                if m.id == target_id:
                    target = m
                    break

            if target:
                if target_patch.content is not None or target_patch.fact is not None:
                    patch_text = target_patch.content or target_patch.fact or ""
                    clean = scrub_secrets(patch_text)
                    target.content = clean.strip()
                    target.fact = clean.strip()
                    target.is_sensitive = is_sensitive_content(clean)

                if target_patch.status is not None:
                    target.status = target_patch.status

                if target_patch.confidence is not None:
                    target.confidence = target_patch.confidence

                target.last_confirmed_at = datetime.now(timezone.utc).isoformat()
                self._save_local_memories(uid, memories)

                table = self._get_table()
                if table is not None:
                    try:
                        table.put_item(Item=target.model_dump())
                    except Exception as e:
                        logger.warning(f"DynamoDB update memory error: {e}")

                return target

        return None

    patch_memory = update_memory

    async def delete_memory(
        self,
        user_id: str,
        mem_id: Optional[str] = None,
        memory_id: Optional[str] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> bool:
        """Delete a structured memory item for user or linked identities."""
        target_id = mem_id or memory_id
        if not target_id:
            return False

        target_uids = list(dict.fromkeys([user_id] + (linked_user_ids or [])))
        for uid in target_uids:
            memories = self._load_local_memories(uid)
            initial_len = len(memories)
            filtered = [m for m in memories if m.id != target_id]
            if len(filtered) < initial_len:
                self._save_local_memories(uid, filtered)
                table = self._get_table()
                if table is not None:
                    try:
                        table.delete_item(Key={"user_id": uid, "id": target_id})
                    except Exception as e:
                        logger.warning(f"DynamoDB delete memory error: {e}")
                return True
        return False


    def extract_candidate_memories(
        self,
        user_id: str,
        question: Optional[str] = None,
        conversation_id: Optional[str] = None,
        user_question: Optional[str] = None,
        assistant_response: Optional[str] = None,
    ) -> List[MemoryCreate]:
        """
        Analyze a user query for potential preferences or personal context to remember.
        Extracts candidate memories with appropriate categories and sensitivity flags.
        Does NOT auto-approve sensitive medical/location items.
        """
        candidates: List[MemoryCreate] = []
        raw_q = question or user_question or ""
        q = raw_q.strip()
        q_lower = q.lower()

        # 1. Health & Environmental sensitivities
        if "asthma" in q_lower or "inhaler" in q_lower:
            candidates.append(
                MemoryCreate(
                    category="health_environmental",
                    key="asthma_condition",
                    content="User or dependent has asthma; sensitive to elevated PM2.5 and cold dry air",
                    confidence=0.9,
                    status="pending_approval",
                    source_conversation_id=conversation_id,
                    is_sensitive=True,
                )
            )

        if "dust allergy" in q_lower or "allergic to dust" in q_lower or "bronchitis" in q_lower:
            candidates.append(
                MemoryCreate(
                    category="health_environmental",
                    key="dust_respiratory_sensitivity",
                    content="Respiratory sensitivity to coarse particulate (PM10) and airborne road dust",
                    confidence=0.85,
                    status="pending_approval",
                    source_conversation_id=conversation_id,
                    is_sensitive=True,
                )
            )

        # 2. Activity & Commute routines
        if "i cycle" in q_lower or "commute by bike" in q_lower or "cycling" in q_lower and ("commute" in q_lower or "work" in q_lower):
            candidates.append(
                MemoryCreate(
                    category="routine_task",
                    key="commute_mode_cycling",
                    content="Regularly commutes or travels via cycling; requires low-pollution arterial corridors",
                    confidence=0.9,
                    status="approved",
                    source_conversation_id=conversation_id,
                    is_sensitive=False,
                )
            )

        if "morning run" in q_lower or "jog at" in q_lower or "morning walk" in q_lower:
            candidates.append(
                MemoryCreate(
                    category="routine_task",
                    key="morning_outdoor_exercise",
                    content="Prefers morning outdoor exercise; ventilation index and morning boundary layer mixing height are key",
                    confidence=0.85,
                    status="approved",
                    source_conversation_id=conversation_id,
                    is_sensitive=False,
                )
            )

        # 3. Response style preference
        if "keep it brief" in q_lower or "concise answers" in q_lower or "short bullets" in q_lower:
            candidates.append(
                MemoryCreate(
                    category="preference",
                    key="response_style_concise",
                    content="Prefers concise, actionable bullet points with minimal narrative",
                    confidence=0.95,
                    status="approved",
                    source_conversation_id=conversation_id,
                    is_sensitive=False,
                )
            )

        return candidates


_memory_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    global _memory_service
    if _memory_service is None:
        _memory_service = MemoryService()
    return _memory_service
