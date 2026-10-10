import logging
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.cognito_auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["Profile"])


class SavedLocation(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_must_be_a_pair(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be provided together.")
        return self


class ProfileBootstrap(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    home_location: SavedLocation | None = None
    work_location: SavedLocation | None = None
    persona: str | None = Field(default="General Public", max_length=80)
    alerts_enabled: bool | None = False

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Display name cannot be empty.")
        return value


class ProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    home_location: SavedLocation | None = None
    work_location: SavedLocation | None = None
    persona: str | None = Field(default=None, min_length=1, max_length=80)
    alerts_enabled: bool | None = None

    @model_validator(mode="after")
    def validate_patch(self):
        if not self.model_fields_set:
            raise ValueError("Provide at least one profile field.")
        if "display_name" in self.model_fields_set and self.display_name is None:
            raise ValueError("Display name cannot be null.")
        if "persona" in self.model_fields_set and self.persona is None:
            raise ValueError("Persona cannot be null.")
        return self


def _get_profile_table():
    table_name = os.getenv("USER_PROFILE_TABLE_NAME", "").strip()
    if not table_name:
        raise HTTPException(
            status_code=503,
            detail="User profile storage is not configured.",
        )
    try:
        return boto3.resource(
            "dynamodb",
            region_name=os.getenv("AWS_REGION", "us-east-1"),
        ).Table(table_name)
    except Exception as exc:
        logger.warning("User profile storage initialization failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc


def _get_item(table, user_id: str):
    try:
        return table.get_item(Key={"user_id": user_id}).get("Item")
    except Exception as exc:
        logger.exception("Profile read failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc


def _public_profile(item: dict) -> dict:
    if not item:
        return {}
    return {
        key: item.get(key)
        for key in (
            "user_id",
            "display_name",
            "email",
            "home_location",
            "work_location",
            "persona",
            "alerts_enabled",
            "created_at",
            "updated_at",
        )
    }


@router.get("")
def get_profile(user: dict = Depends(get_current_user)):
    table = _get_profile_table()
    item = _get_item(table, user["sub"])
    if not item:
        raise HTTPException(
            status_code=404,
            detail="Profile not initialized. Create it through /profile/bootstrap.",
        )
    return _public_profile(item)


@router.post("/bootstrap")
def bootstrap_profile(
    payload: ProfileBootstrap,
    user: dict = Depends(get_current_user),
):
    # Ownership is strictly derived from the validated token 'sub'
    user_id = user["sub"]
    # Verified email is strictly sourced from Cognito authentication, never from client body
    verified_email = user.get("email")

    table = _get_profile_table()
    existing = _get_item(table, user_id)
    if existing:
        return _public_profile(existing)

    now = datetime.now(timezone.utc).isoformat()
    item = {
        "user_id": user_id,
        "display_name": payload.display_name,
        "email": verified_email,
        "home_location": payload.home_location.model_dump(mode="json") if payload.home_location else None,
        "work_location": payload.work_location.model_dump(mode="json") if payload.work_location else None,
        "persona": payload.persona or "General Public",
        "alerts_enabled": bool(payload.alerts_enabled),
        "created_at": now,
        "updated_at": now,
    }

    try:
        table.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(user_id)",
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            existing = _get_item(table, user_id)
            if existing:
                return _public_profile(existing)
        logger.exception("Profile creation failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc
    except Exception as exc:
        logger.exception("Profile creation failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc

    return _public_profile(item)


@router.patch("")
def update_profile(
    payload: ProfilePatch,
    user: dict = Depends(get_current_user),
):
    # Ownership is strictly derived from validated token 'sub'
    user_id = user["sub"]
    table = _get_profile_table()

    # Dynamic UpdateExpression avoiding read-modify-write race conditions
    update_parts = []
    expr_attr_names = {}
    expr_attr_values = {}

    for field in payload.model_fields_set:
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

    update_expr = "SET " + ", ".join(update_parts)

    try:
        response = table.update_item(
            Key={"user_id": user_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_attr_names,
            ExpressionAttributeValues=expr_attr_values,
            ConditionExpression="attribute_exists(user_id)",
            ReturnValues="ALL_NEW",
        )
        updated_item = response.get("Attributes")
        return _public_profile(updated_item)
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise HTTPException(
                status_code=404,
                detail="Profile not initialized. Create it through /profile/bootstrap.",
            )
        logger.exception("Profile update failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc
    except Exception as exc:
        logger.exception("Profile update failed.")
        raise HTTPException(status_code=503, detail="Profile storage unavailable.") from exc
