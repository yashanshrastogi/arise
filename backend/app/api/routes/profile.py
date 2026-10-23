import json
import logging
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import boto3
from botocore.exceptions import ClientError, BotoCoreError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.cognito_auth import get_current_user
from app.services.identity import get_identity_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["Profile"])

# Database Guardrails Constants
MAX_ITEM_PAYLOAD_BYTES = 32 * 1024  # 32 KB maximum profile size
ALLOWED_PROFILE_FIELDS = {
    "user_id",
    "canonical_user_id",
    "linked_user_ids",
    "display_name",
    "email",
    "home_location",
    "work_location",
    "school_location",
    "parent_location",
    "saved_locations",
    "persona",
    "configured_personas",
    "alerts_enabled",
    "created_at",
    "updated_at",
}



def _sanitize_string(val: str | None) -> str | None:
    if val is None:
        return None
    # Strip HTML tags and control characters to prevent stored XSS and corruption
    cleaned = re.sub(r"[<>]", "", str(val)).strip()
    return cleaned


class SavedLocation(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)

    @field_validator("label", "address")
    @classmethod
    def sanitize_location(cls, value):
        if value is not None:
            value = _sanitize_string(value)
            if not value:
                raise ValueError("Location string cannot be empty after sanitization.")
        return value

    @model_validator(mode="after")
    def coordinates_must_be_a_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together.")
        return self


class ProfileBootstrap(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    home_location: SavedLocation | None = None
    work_location: SavedLocation | None = None
    school_location: SavedLocation | None = None
    parent_location: SavedLocation | None = None
    saved_locations: list[SavedLocation] | None = None
    persona: str | None = Field(default="General Public", max_length=80)
    configured_personas: list[str] | None = None
    alerts_enabled: bool | None = False

    @field_validator("display_name", "persona")
    @classmethod
    def clean_name(cls, value):
        if value is not None:
            value = _sanitize_string(value)
            if not value:
                raise ValueError("Display name cannot be empty.")
        return value

    @field_validator("configured_personas")
    @classmethod
    def clean_configured_personas(cls, values):
        if values is not None:
            return [_sanitize_string(p) for p in values if _sanitize_string(p)]
        return values


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    home_location: SavedLocation | None = None
    work_location: SavedLocation | None = None
    school_location: SavedLocation | None = None
    parent_location: SavedLocation | None = None
    saved_locations: list[SavedLocation] | None = None
    persona: str | None = Field(default=None, min_length=1, max_length=80)
    configured_personas: list[str] | None = None
    alerts_enabled: bool | None = None

    @field_validator("display_name", "persona")
    @classmethod
    def clean_patch_strings(cls, value):
        if value is not None:
            value = _sanitize_string(value)
            if not value:
                raise ValueError("Value cannot be empty.")
        return value

    @field_validator("configured_personas")
    @classmethod
    def clean_configured_personas(cls, values):
        if values is not None:
            return [_sanitize_string(p) for p in values if _sanitize_string(p)]
        return values

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one profile field.")
        if "display_name" in self.model_fields_set and self.display_name is None:
            raise ValueError("Display name cannot be null.")
        if "persona" in self.model_fields_set and self.persona is None:
            raise ValueError("Persona cannot be null.")
        return self


# Local file fallback storage for development & offline resilience.
# In AWS Lambda environment, only /tmp is writable.
_LOCAL_USERS_DIR = Path(
    "/tmp/arise_users"
    if (os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"))
    else "data/users"
)


def _get_local_item(user_id: str) -> dict | None:
    try:
        _LOCAL_USERS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = _LOCAL_USERS_DIR / f"{user_id}.json"
        if file_path.exists():
            return json.loads(file_path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"Local storage read warning: {exc}")
    return None


def _put_local_item(item: dict) -> None:
    try:
        _LOCAL_USERS_DIR.mkdir(parents=True, exist_ok=True)
        file_path = _LOCAL_USERS_DIR / f"{item['user_id']}.json"
        file_path.write_text(json.dumps(item, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning(f"Local storage write warning: {exc}")


def _get_profile_table():
    from app.core.config import get_settings
    settings = get_settings()
    if settings.MODE != "aws":
        return None

    table_name = (
        os.getenv("USER_PROFILE_TABLE_NAME")
        or settings.USER_PROFILE_TABLE_NAME
        or "arise-users-prod"
    ).strip()
    if not table_name:
        return None
    try:
        from botocore.config import Config
        fast_config = Config(
            connect_timeout=3,
            read_timeout=3,
            retries={"max_attempts": 2},
        )
        return boto3.resource(
            "dynamodb",
            region_name=os.getenv("AWS_REGION", settings.AWS_REGION),
            config=fast_config,
        ).Table(table_name)
    except Exception as exc:
        logger.warning(f"DynamoDB initialization notice: {exc}. Local storage active.")
        return None


def _floats_to_decimals(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: _floats_to_decimals(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_floats_to_decimals(x) for x in obj]
    return obj


def _decimals_to_floats(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, dict):
        return {k: _decimals_to_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimals_to_floats(x) for x in obj]
    return obj


def _get_item(table, user_id: str):
    if table is not None:
        try:
            item = table.get_item(Key={"user_id": user_id}).get("Item")
            if item:
                return _decimals_to_floats(item)
            return None
        except (ClientError, BotoCoreError, Exception) as exc:
            logger.warning(f"DynamoDB read notice ({exc}). Falling back to local store.")
    return _get_local_item(user_id)


def _validate_payload_size(item: dict):
    """DB Guardrail: Enforces item size is strictly within limits."""
    if isinstance(item, dict):
        try:
            serialized = json.dumps(item, default=str).encode("utf-8")
            if len(serialized) > MAX_ITEM_PAYLOAD_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail=f"Profile payload size exceeds DB guardrail ({MAX_ITEM_PAYLOAD_BYTES} bytes).",
                )
        except HTTPException:
            raise
        except Exception:
            pass


def _public_profile(item: dict) -> dict:
    if not item or not isinstance(item, dict):
        return {}
    return {
        key: item.get(key)
        for key in (
            "user_id",
            "canonical_user_id",
            "linked_user_ids",
            "display_name",
            "email",
            "home_location",
            "work_location",
            "school_location",
            "parent_location",
            "saved_locations",
            "persona",
            "configured_personas",
            "alerts_enabled",
            "created_at",
            "updated_at",
        )
    }


@router.get("")
def get_profile(user: dict = Depends(get_current_user)):
    identity = get_identity_service().resolve_identity(user)
    table = _get_profile_table()

    # Search canonical ID, current sub, and any linked verified subs
    target_uids = list(dict.fromkeys([identity.canonical_user_id, user["sub"]] + identity.linked_subs))
    item = None
    for uid in target_uids:
        item = _get_item(table, uid)
        if item:
            break

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Profile not initialized. Create it through /profile/bootstrap.",
        )
    pub = _public_profile(item)
    pub["canonical_user_id"] = identity.canonical_user_id
    pub["linked_user_ids"] = identity.linked_subs
    return pub


@router.post("/bootstrap")
def bootstrap_profile(
    payload: ProfileBootstrap,
    user: dict = Depends(get_current_user),
):
    identity = get_identity_service().resolve_identity(user)
    # Guardrail 1: Ownership is strictly derived from the canonical verified identity
    user_id = identity.canonical_user_id
    # Guardrail 2: Verified email is strictly sourced from Cognito authentication claims
    verified_email = user.get("email")

    table = _get_profile_table()
    existing = _get_item(table, user_id)
    if not existing:
        for uid in identity.linked_subs:
            existing = _get_item(table, uid)
            if existing:
                break

    if existing:
        pub = _public_profile(existing)
        pub["canonical_user_id"] = identity.canonical_user_id
        pub["linked_user_ids"] = identity.linked_subs
        return pub

    now = datetime.now(timezone.utc).isoformat()
    item = {
        "user_id": user_id,
        "canonical_user_id": identity.canonical_user_id,
        "linked_user_ids": identity.linked_subs,
        "display_name": payload.display_name,
        "email": verified_email,
        "home_location": payload.home_location.model_dump(mode="json") if payload.home_location else None,
        "work_location": payload.work_location.model_dump(mode="json") if payload.work_location else None,
        "school_location": payload.school_location.model_dump(mode="json") if payload.school_location else None,
        "parent_location": payload.parent_location.model_dump(mode="json") if payload.parent_location else None,
        "saved_locations": [loc.model_dump(mode="json") for loc in payload.saved_locations] if payload.saved_locations else [],
        "persona": payload.persona or "General Public",
        "configured_personas": payload.configured_personas or [],
        "alerts_enabled": bool(payload.alerts_enabled),
        "created_at": now,
        "updated_at": now,
    }

    # Guardrail 3: Validate item size
    _validate_payload_size(item)

    # Persist with conditional check guardrail
    if table is not None:
        try:
            db_item = _floats_to_decimals(item)
            table.put_item(
                Item=db_item,
                ConditionExpression="attribute_not_exists(user_id)",
            )
            _put_local_item(item)
            pub = _public_profile(item)
            pub["canonical_user_id"] = identity.canonical_user_id
            pub["linked_user_ids"] = identity.linked_subs
            return pub
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                existing = _get_item(table, user_id)
                if existing:
                    pub = _public_profile(existing)
                    pub["canonical_user_id"] = identity.canonical_user_id
                    pub["linked_user_ids"] = identity.linked_subs
                    return pub
            logger.warning(f"DynamoDB put notice ({exc}). Fallback to local store.")
        except Exception as exc:
            logger.warning(f"DynamoDB put notice ({exc}). Fallback to local store.")

    # Always persist locally for offline resilience
    _put_local_item(item)
    pub = _public_profile(item)
    pub["canonical_user_id"] = identity.canonical_user_id
    pub["linked_user_ids"] = identity.linked_subs
    return pub


@router.patch("")
def update_profile(
    payload: ProfilePatch,
    user: dict = Depends(get_current_user),
):
    identity = get_identity_service().resolve_identity(user)
    # Guardrail 1: Ownership is strictly derived from verified canonical identity
    user_id = identity.canonical_user_id
    table = _get_profile_table()

    # Guardrail 2: Attribute allowlist and dynamic UpdateExpression avoiding race conditions
    update_parts = []
    expr_attr_names = {}
    expr_attr_values = {}

    for field in payload.model_fields_set:
        if field not in ALLOWED_PROFILE_FIELDS or field in ("user_id", "email", "created_at"):
            continue  # Immutable or disallowed fields
        val = getattr(payload, field)
        json_val = val.model_dump(mode="json") if isinstance(val, SavedLocation) else val
        name_placeholder = f"#{field}"
        val_placeholder = f":{field}"
        update_parts.append(f"{name_placeholder} = {val_placeholder}")
        expr_attr_names[name_placeholder] = field
        expr_attr_values[val_placeholder] = json_val

    now = datetime.now(timezone.utc).isoformat()
    update_parts.append("#updated_at = :updated_at")
    expr_attr_names["#updated_at"] = "updated_at"
    expr_attr_values[":updated_at"] = now

    # Guardrail 3: Validate update payload size
    _validate_payload_size(expr_attr_values)

    update_expr = "SET " + ", ".join(update_parts)

    if table is not None:
        try:
            db_attr_values = _floats_to_decimals(expr_attr_values)
            response = table.update_item(
                Key={"user_id": user_id},
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_attr_names,
                ExpressionAttributeValues=db_attr_values,
                ConditionExpression="attribute_exists(user_id)",
                ReturnValues="ALL_NEW",
            )
            updated_item = response.get("Attributes")
            if updated_item and isinstance(updated_item, dict):
                clean_item = _decimals_to_floats(updated_item)
                _put_local_item(clean_item)
                return _public_profile(clean_item)
            return _public_profile(updated_item)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise HTTPException(
                    status_code=404,
                    detail="Profile not initialized. Create it through /profile/bootstrap.",
                )
            logger.warning(f"DynamoDB update error ({exc}). Updating local store.")
        except Exception as exc:
            logger.warning(f"DynamoDB update error ({exc}). Updating local store.")

    # Local fallback update if table not accessible
    existing = _get_local_item(user_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail="Profile not initialized. Create it through /profile/bootstrap.",
        )

    for field in payload.model_fields_set:
        val = getattr(payload, field)
        json_val = val.model_dump(mode="json") if isinstance(val, SavedLocation) else val
        existing[field] = json_val
    existing["updated_at"] = now
    _put_local_item(existing)
    return _public_profile(existing)


class LinkAccountRequest(BaseModel):
    secondary_token: str


@router.post("/link-account")
def link_account(
    payload: LinkAccountRequest,
    user: dict = Depends(get_current_user),
):
    """
    Explicitly link another authenticated Cognito account to the current account.
    Validates secondary_token against the same Cognito User Pool and JWKS.
    """
    import jwt
    from app.core.cognito_auth import _jwks_client
    from app.core.config import get_settings

    settings = get_settings()
    pool_id = os.getenv("COGNITO_USER_POOL_ID", "").strip() or (settings.COGNITO_USER_POOL_ID or "").strip()
    client_id = os.getenv("COGNITO_APP_CLIENT_ID", "").strip() or (settings.COGNITO_APP_CLIENT_ID or "").strip()
    region = os.getenv("AWS_REGION", "").strip() or (settings.AWS_REGION or "us-east-1").strip()
    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(payload.secondary_token)
        secondary_claims = jwt.decode(
            payload.secondary_token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"verify_aud": False, "require": ["exp", "iat", "sub", "iss", "token_use"]},
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid secondary account token.") from exc

    token_client_id = secondary_claims.get("client_id") or secondary_claims.get("aud")
    if token_client_id != client_id:
        raise HTTPException(status_code=400, detail="Secondary token is for another application.")

    identity_service = get_identity_service()
    cluster = identity_service.explicit_link(primary_claims=user, secondary_claims=secondary_claims)

    return {
        "success": True,
        "canonical_user_id": cluster.canonical_user_id,
        "linked_subs": cluster.linked_subs,
        "link_method": cluster.link_method,
    }


