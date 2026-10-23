"""
Persistent Conversation Service for Ask Arise.
Manages chat threads, message histories, auto-titling, search, archiving, and deletion
with strict authenticated user ownership isolation.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import re
from typing import List, Optional
import uuid

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings
from app.domain.chat_models import (
    ChatMessage,
    ConversationCreate,
    ConversationDetail,
    ConversationPatch,
    ConversationSummary,
)

logger = logging.getLogger("arise.conversations")

_LOCAL_CONVERSATIONS_DIR = Path(
    "/tmp/arise_conversations"
    if (os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"))
    else "data/conversations"
)


def _generate_title(text: str) -> str:
    """Generate a clean, readable conversation title from initial query."""
    clean = re.sub(r"[^\w\s-]", "", text).strip()
    words = clean.split()
    if not words:
        return "Environmental Inquiry"
    if len(words) <= 7:
        title = " ".join(words).capitalize()
    else:
        title = " ".join(words[:7]).capitalize() + "..."
    return title[:60]


class ConversationService:
    def __init__(self):
        self.settings = get_settings()

    def _get_table(self):
        if self.settings.MODE != "aws":
            return None
        table_name = os.getenv("CONVERSATION_TABLE_NAME", "arise-conversations-prod").strip()
        try:
            from botocore.config import Config
            fast_config = Config(connect_timeout=3, read_timeout=3, retries={"max_attempts": 2})
            return boto3.resource(
                "dynamodb",
                region_name=self.settings.AWS_REGION,
                config=fast_config,
            ).Table(table_name)
        except Exception as exc:
            logger.warning(f"DynamoDB initialization failed ({exc}). Using local storage.")
            return None

    def _get_user_dir(self, user_id: str) -> Path:
        safe_user_id = re.sub(r"[^\w\-.]", "_", user_id)
        user_dir = _LOCAL_CONVERSATIONS_DIR / safe_user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    def _load_local_detail(self, user_id: str, conv_id: str) -> Optional[ConversationDetail]:
        user_dir = self._get_user_dir(user_id)
        file_path = user_dir / f"{conv_id}.json"
        if not file_path.exists():
            return None
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            if data.get("user_id") != user_id:
                logger.warning(f"Ownership mismatch for {conv_id} vs {user_id}")
                return None
            return ConversationDetail(**data)
        except Exception as exc:
            logger.warning(f"Error reading conversation {conv_id}: {exc}")
            return None

    def _save_local_detail(self, detail: ConversationDetail) -> None:
        user_dir = self._get_user_dir(detail.user_id)
        file_path = user_dir / f"{detail.id}.json"
        file_path.write_text(json.dumps(detail.model_dump(), indent=2), encoding="utf-8")

    async def list_conversations(
        self,
        user_id: str,
        linked_user_ids: Optional[List[str]] = None,
        include_archived: bool = False,
        search_query: Optional[str] = None,
    ) -> List[ConversationSummary]:
        """List conversation summaries for a user and any verified linked identities, sorted newest updated first."""
        target_uids = list(dict.fromkeys([user_id] + (linked_user_ids or [])))
        table = self._get_table()
        summaries_by_id: dict[str, ConversationSummary] = {}

        if table is not None:
            try:
                from boto3.dynamodb.conditions import Key
                for uid in target_uids:
                    resp = table.query(
                        KeyConditionExpression=Key("user_id").eq(uid),
                        ScanIndexForward=False,
                    )
                    for item in resp.get("Items", []):
                        if not include_archived and item.get("is_archived", False):
                            continue
                        s = ConversationSummary(**item)
                        if s.id not in summaries_by_id:
                            summaries_by_id[s.id] = s
            except Exception as e:
                logger.warning(f"DynamoDB list conversations query failed ({e}), checking local.")

        # Local directory check across all linked user IDs
        for uid in target_uids:
            user_dir = self._get_user_dir(uid)
            if not user_dir.exists():
                continue
            for file_path in user_dir.glob("*.json"):
                try:
                    data = json.loads(file_path.read_text(encoding="utf-8"))
                    if data.get("user_id") not in target_uids:
                        continue
                    if not include_archived and data.get("is_archived", False):
                        continue
                    cid = data["id"]
                    if cid in summaries_by_id:
                        continue
                    last_preview = (
                        data["messages"][-1]["content"][:80]
                        if data.get("messages")
                        else None
                    )
                    summaries_by_id[cid] = ConversationSummary(
                        id=data["id"],
                        user_id=data["user_id"],
                        title=data.get("title", "New Environmental Chat"),
                        created_at=data["created_at"],
                        updated_at=data["updated_at"],
                        is_archived=data.get("is_archived", False),
                        is_pinned=data.get("is_pinned", False),
                        message_count=len(data.get("messages", [])),
                        last_message_preview=last_preview,
                        location_name=data.get("location_name"),
                        persona=data.get("persona"),
                    )
                except Exception as exc:
                    logger.warning(f"Error listing local conversation {file_path}: {exc}")

        summaries = list(summaries_by_id.values())

        # Search filter
        if search_query and search_query.strip():
            sq = search_query.lower().strip()
            summaries = [
                s for s in summaries
                if sq in s.title.lower() or (s.last_message_preview and sq in s.last_message_preview.lower())
            ]

        # Sort pinned first, then newest updated first
        summaries.sort(key=lambda s: (s.is_pinned, s.updated_at), reverse=True)
        return summaries

    async def create_conversation(
        self,
        user_id: str,
        create_data: ConversationCreate,
    ) -> ConversationDetail:
        """Create a new conversation thread."""
        now_iso = datetime.now(timezone.utc).isoformat()
        conv_id = (
            re.sub(r"[^\w\-.]", "_", str(create_data.id).strip())
            if create_data.id and str(create_data.id).strip()
            else str(uuid.uuid4())
        )
        title = (
            create_data.title.strip()
            if create_data.title and create_data.title.strip()
            else (
                _generate_title(create_data.initial_message)
                if create_data.initial_message
                else "New Environmental Chat"
            )
        )

        messages: List[ChatMessage] = []
        if create_data.initial_messages:
            for m in create_data.initial_messages:
                if isinstance(m, dict):
                    messages.append(ChatMessage(**m))
                elif isinstance(m, ChatMessage):
                    messages.append(m)
        elif create_data.initial_message:
            messages.append(
                ChatMessage(
                    role="user",
                    content=create_data.initial_message,
                    timestamp=now_iso,
                )
            )

        detail = ConversationDetail(
            id=conv_id,
            user_id=user_id,
            title=title,
            created_at=now_iso,
            updated_at=now_iso,
            is_archived=False,
            messages=messages,
            location_name=create_data.location_name,
            persona=create_data.persona,
        )

        table = self._get_table()
        if table is not None:
            try:
                table.put_item(Item=detail.model_dump())
            except Exception as e:
                logger.warning(f"DynamoDB put conversation failed: {e}")

        self._save_local_detail(detail)
        return detail

    async def get_conversation(
        self,
        user_id: str,
        conv_id: str,
        linked_user_ids: Optional[List[str]] = None,
    ) -> Optional[ConversationDetail]:
        """Retrieve conversation detail, strictly enforcing owner or verified linked identity isolation."""
        target_uids = list(dict.fromkeys([user_id] + (linked_user_ids or [])))
        table = self._get_table()
        if table is not None:
            try:
                for uid in target_uids:
                    resp = table.get_item(Key={"user_id": uid, "id": conv_id})
                    item = resp.get("Item")
                    if item and item.get("user_id") in target_uids:
                        return ConversationDetail(**item)
            except Exception as e:
                logger.warning(f"DynamoDB get conversation error: {e}")

        for uid in target_uids:
            detail = self._load_local_detail(uid, conv_id)
            if detail and detail.user_id in target_uids:
                return detail
        return None

    async def update_conversation(
        self,
        user_id: str,
        conv_id: Optional[str] = None,
        patch: Optional[ConversationPatch] = None,
        conversation_id: Optional[str] = None,
        patch_data: Optional[ConversationPatch] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> Optional[ConversationDetail]:
        """Update conversation title or archived status for owner or verified linked identity."""
        target_id = conv_id or conversation_id
        target_patch = patch or patch_data
        if not target_id or not target_patch:
            return None

        detail = await self.get_conversation(user_id, target_id, linked_user_ids=linked_user_ids)
        if not detail:
            return None

        if target_patch.title is not None:
            detail.title = target_patch.title
        if target_patch.is_archived is not None:
            detail.is_archived = target_patch.is_archived
        if target_patch.is_pinned is not None:
            detail.is_pinned = target_patch.is_pinned

        detail.updated_at = datetime.now(timezone.utc).isoformat()

        table = self._get_table()
        if table is not None:
            try:
                table.put_item(Item=detail.model_dump())
            except Exception as e:
                logger.warning(f"DynamoDB update conversation error: {e}")

        self._save_local_detail(detail)
        return detail

    patch_conversation = update_conversation

    async def delete_conversation(
        self,
        user_id: str,
        conv_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> bool:
        """Delete a conversation, strictly ensuring user ownership or verified linked identity."""
        target_id = conv_id or conversation_id
        if not target_id:
            return False

        detail = await self.get_conversation(user_id, target_id, linked_user_ids=linked_user_ids)
        if not detail:
            return False

        table = self._get_table()
        if table is not None:
            try:
                table.delete_item(Key={"user_id": detail.user_id, "id": target_id})
            except Exception as e:
                logger.warning(f"DynamoDB delete conversation error: {e}")

        user_dir = self._get_user_dir(detail.user_id)
        file_path = user_dir / f"{target_id}.json"
        if file_path.exists():
            try:
                file_path.unlink()
                return True
            except Exception as exc:
                logger.warning(f"Error removing file {file_path}: {exc}")
                return False
        return True

    async def append_turn(
        self,
        user_id: str,
        conv_id: str,
        user_content: str,
        assistant_message: ChatMessage,
        location_name: Optional[str] = None,
        persona: Optional[str] = None,
        linked_user_ids: Optional[List[str]] = None,
    ) -> ConversationDetail:
        """Append user question and assistant answer to the conversation."""
        detail = await self.get_conversation(user_id, conv_id, linked_user_ids=linked_user_ids)
        now_iso = datetime.now(timezone.utc).isoformat()

        if not detail:
            # Auto-create if not found
            detail = ConversationDetail(
                id=conv_id,
                user_id=user_id,
                title=_generate_title(user_content),
                created_at=now_iso,
                updated_at=now_iso,
                is_archived=False,
                messages=[],
                location_name=location_name,
                persona=persona,
            )

        # Add user turn
        detail.messages.append(
            ChatMessage(
                role="user",
                content=user_content,
                timestamp=now_iso,
            )
        )
        # Add assistant turn
        detail.messages.append(assistant_message)
        detail.updated_at = now_iso

        # If title is generic default and this is first turn, auto-title it
        if detail.title in ("New Environmental Chat", "Environmental Inquiry", ""):
            detail.title = _generate_title(user_content)

        if location_name:
            detail.location_name = location_name
        if persona:
            detail.persona = persona

        table = self._get_table()
        if table is not None:
            try:
                table.put_item(Item=detail.model_dump())
            except Exception as e:
                logger.warning(f"DynamoDB append_turn error: {e}")

        self._save_local_detail(detail)
        return detail



_conversation_service: Optional[ConversationService] = None


def get_conversation_service() -> ConversationService:
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService()
    return _conversation_service
