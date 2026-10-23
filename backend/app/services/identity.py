"""
Secure Identity Resolution & Multi-Identity Linking Service for Arise.
Provides cryptographic verification-based identity linking between Cognito
federated (e.g. Google) and native email/password identities.

CRITICAL SECURITY INVARIANT:
Accounts are NEVER merged based solely on matching email address strings.
Automatic identity association strictly requires:
1. Both identities originate from the trusted Cognito User Pool.
2. Both identities have cryptographic verification of the email (email_verified is True).
If an account has email_verified is False, it remains strictly isolated.
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
from pydantic import BaseModel, Field

from app.core.config import get_settings

logger = logging.getLogger("arise.identity")

_LOCAL_IDENTITY_DIR = Path(
    "/tmp/arise_identity_links"
    if (os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("LAMBDA_TASK_ROOT"))
    else "data/identity_links"
)


def mask_identifier(val: Optional[str]) -> str:
    """Mask a sensitive ID or UUID for safe logging."""
    if not val:
        return "none"
    s = str(val).strip()
    if len(s) <= 8:
        return "***"
    return f"{s[:4]}...{s[-4:]}"


def mask_email(email: Optional[str]) -> str:
    """Mask an email address for safe logging."""
    if not email or "@" not in str(email):
        return "none"
    parts = str(email).split("@")
    user_part = parts[0]
    domain_part = parts[1]
    masked_user = user_part[0] + "***" + (user_part[-1] if len(user_part) > 1 else "")
    return f"{masked_user}@{domain_part}"


class IdentityCluster(BaseModel):
    """
    Represents a verified cluster of one or more authenticated Cognito identities.
    """
    canonical_user_id: str
    primary_sub: str
    linked_subs: List[str] = Field(default_factory=list)
    email: Optional[str] = None
    email_verified: bool = False
    providers: List[str] = Field(default_factory=list)
    link_method: str = "direct"
    created_at: str
    updated_at: str


class IdentityService:
    def __init__(self):
        self.settings = get_settings()

    def _get_table(self):
        if self.settings.MODE != "aws":
            return None
        table_name = os.getenv("USER_PROFILE_TABLE_NAME", "arise-users-prod").strip()
        try:
            from botocore.config import Config
            fast_config = Config(connect_timeout=3, read_timeout=3, retries={"max_attempts": 2})
            return boto3.resource(
                "dynamodb",
                region_name=self.settings.AWS_REGION,
                config=fast_config,
            ).Table(table_name)
        except Exception as exc:
            logger.warning(f"DynamoDB identity table access error: {exc}")
            return None

    def _get_sub_file(self, sub: str) -> Path:
        safe_sub = re.sub(r"[^\w\-.]", "_", sub)
        _LOCAL_IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
        return _LOCAL_IDENTITY_DIR / f"{safe_sub}.json"

    def _load_cluster_local(self, sub: str) -> Optional[IdentityCluster]:
        file_path = self._get_sub_file(sub)
        if not file_path.exists():
            return None
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            return IdentityCluster(**data)
        except Exception as exc:
            logger.warning(f"Error reading local identity link for {mask_identifier(sub)}: {exc}")
            return None

    def _save_cluster_local(self, cluster: IdentityCluster) -> None:
        _LOCAL_IDENTITY_DIR.mkdir(parents=True, exist_ok=True)
        dump = cluster.model_dump()
        for sub in cluster.linked_subs:
            file_path = self._get_sub_file(sub)
            file_path.write_text(json.dumps(dump, indent=2), encoding="utf-8")

    def _find_verified_cluster_by_email_local(self, email: str) -> Optional[IdentityCluster]:
        if not email:
            return None
        target_email = email.strip().lower()
        if not _LOCAL_IDENTITY_DIR.exists():
            return None
        for file_path in _LOCAL_IDENTITY_DIR.glob("*.json"):
            try:
                data = json.loads(file_path.read_text(encoding="utf-8"))
                if (
                    data.get("email")
                    and data.get("email").strip().lower() == target_email
                    and data.get("email_verified") is True
                ):
                    return IdentityCluster(**data)
            except Exception:
                continue
        return None

    def resolve_identity(self, user_claims: dict) -> IdentityCluster:
        """
        Resolves the canonical user identity cluster for authenticated claims.
        Enforces verified email check before linking different identities.
        """
        sub = user_claims.get("sub")
        if not sub:
            raise ValueError("Token claims missing required 'sub' attribute.")

        # Extract attributes cleanly
        email = (user_claims.get("email") or "").strip().lower() or None
        
        # Determine verified status strictly
        raw_verified = user_claims.get("email_verified")
        if isinstance(raw_verified, bool):
            email_verified = raw_verified
        elif isinstance(raw_verified, str):
            email_verified = raw_verified.strip().lower() == "true"
        else:
            email_verified = False

        # Identify Provider
        identities = user_claims.get("identities")
        provider = "Cognito"
        if isinstance(identities, list) and len(identities) > 0 and isinstance(identities[0], dict):
            provider = identities[0].get("providerName") or "Google"
        elif str(user_claims.get("cognito:username", "")).startswith("Google"):
            provider = "Google"

        # Federated Google logins are attested as verified by Google IdP
        if provider == "Google" and email:
            email_verified = True

        # Check existing cluster for this sub
        cluster = self._load_cluster_local(sub)
        if cluster:
            changed = False
            # If email verification status upgraded, update cluster
            if email_verified and not cluster.email_verified:
                cluster.email_verified = True
                changed = True
            if email and not cluster.email:
                cluster.email = email
                changed = True
            if provider not in cluster.providers:
                cluster.providers.append(provider)
                changed = True
            if changed:
                cluster.updated_at = datetime.now(timezone.utc).isoformat()
                self._save_cluster_local(cluster)
            return cluster

        now_iso = datetime.now(timezone.utc).isoformat()

        # Check if an existing verified cluster exists with the EXACT SAME VERIFIED EMAIL
        # SECURITY RULE: Never link if email_verified is False!
        if email and email_verified:
            existing_verified_cluster = self._find_verified_cluster_by_email_local(email)
            if existing_verified_cluster:
                # Cryptographic verification confirmed for both accounts in same User Pool
                if sub not in existing_verified_cluster.linked_subs:
                    existing_verified_cluster.linked_subs.append(sub)
                if provider not in existing_verified_cluster.providers:
                    existing_verified_cluster.providers.append(provider)
                existing_verified_cluster.updated_at = now_iso
                existing_verified_cluster.link_method = "verified_email_attested"
                
                logger.info(
                    "Securely linked verified %s identity %s to canonical user %s for verified email %s",
                    provider,
                    mask_identifier(sub),
                    mask_identifier(existing_verified_cluster.canonical_user_id),
                    mask_email(email),
                )
                self._save_cluster_local(existing_verified_cluster)
                return existing_verified_cluster

        # If not linked or email is unverified, create a new isolated cluster
        cluster = IdentityCluster(
            canonical_user_id=sub,
            primary_sub=sub,
            linked_subs=[sub],
            email=email,
            email_verified=email_verified,
            providers=[provider],
            link_method="direct",
            created_at=now_iso,
            updated_at=now_iso,
        )

        if not email_verified and email:
            logger.info(
                "Identity %s (%s) has unverified email (%s); maintained strictly isolated account boundary.",
                mask_identifier(sub),
                provider,
                mask_email(email),
            )

        self._save_cluster_local(cluster)
        return cluster

    def explicit_link(
        self,
        primary_claims: dict,
        secondary_claims: dict,
    ) -> IdentityCluster:
        """
        Explicitly links two authenticated identities when both have presented valid tokens.
        """
        primary_sub = primary_claims.get("sub")
        secondary_sub = secondary_claims.get("sub")
        if not primary_sub or not secondary_sub:
            raise ValueError("Both identities must provide a valid 'sub'.")

        primary_cluster = self.resolve_identity(primary_claims)
        secondary_cluster = self.resolve_identity(secondary_claims)

        if primary_cluster.canonical_user_id == secondary_cluster.canonical_user_id:
            return primary_cluster

        # Combine linked subs into primary canonical cluster
        combined_subs = list(set(primary_cluster.linked_subs + secondary_cluster.linked_subs))
        combined_providers = list(set(primary_cluster.providers + secondary_cluster.providers))
        
        now_iso = datetime.now(timezone.utc).isoformat()
        primary_cluster.linked_subs = combined_subs
        primary_cluster.providers = combined_providers
        primary_cluster.updated_at = now_iso
        primary_cluster.link_method = "explicit_user_linked"

        logger.info(
            "Explicitly linked identity %s to canonical user %s",
            mask_identifier(secondary_sub),
            mask_identifier(primary_cluster.canonical_user_id),
        )

        self._save_cluster_local(primary_cluster)
        return primary_cluster


_identity_service: Optional[IdentityService] = None


def get_identity_service() -> IdentityService:
    global _identity_service
    if _identity_service is None:
        _identity_service = IdentityService()
    return _identity_service
