"""
Arise Secrets Manager Client.
Provides secure runtime secret retrieval from AWS Secrets Manager with
in-memory caching for warm Lambda invocations.

SECURITY RULES:
- Never log, print, or commit raw secret values.
- Never expose keys to client responses or frontend.
- Allow environment variable overrides for local development and unit tests.
"""

import json
import logging
import os
from typing import Optional
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger("arise.secrets")

# In-memory secret cache for warm Lambda executions
_SECRET_CACHE: dict[str, str] = {}


def get_secret(secret_id: str, region_name: Optional[str] = None) -> Optional[str]:
    """
    Retrieve a secret from AWS Secrets Manager with in-memory caching.

    Args:
        secret_id: Secret ID, name, or ARN in AWS Secrets Manager.
        region_name: AWS region (defaults to AWS_REGION env var or 'us-east-1').

    Returns:
        The secret string, or None if unavailable.
    """
    if not secret_id:
        return None

    # 1. Warm Lambda in-memory cache check
    if secret_id in _SECRET_CACHE:
        return _SECRET_CACHE[secret_id]

    # 2. Local environment variable fallback (for local dev / unit tests)
    env_key = os.getenv("GEMINI_API_KEY")
    if env_key and env_key.strip():
        _SECRET_CACHE[secret_id] = env_key.strip()
        return _SECRET_CACHE[secret_id]

    # 3. Fetch from AWS Secrets Manager
    region = region_name or os.getenv("AWS_REGION", "us-east-1")
    try:
        client = boto3.client("secretsmanager", region_name=region)
        response = client.get_secret_value(SecretId=secret_id)
        raw_secret = response.get("SecretString")

        if not raw_secret:
            logger.warning(f"Secret '{secret_id}' returned empty SecretString.")
            return None

        secret_str = raw_secret.strip()

        # Parse JSON if the secret is stored as a JSON object
        if secret_str.startswith("{") and secret_str.endswith("}"):
            try:
                data = json.loads(secret_str)
                extracted = (
                    data.get("GEMINI_API_KEY")
                    or data.get("gemini_api_key")
                    or data.get("api_key")
                    or data.get("apiKey")
                    or next(iter(data.values()), None)
                )
                if extracted and isinstance(extracted, str):
                    secret_str = extracted.strip()
            except Exception:
                pass  # Fall back to using the raw secret string

        _SECRET_CACHE[secret_id] = secret_str
        return secret_str

    except ClientError as e:
        error_code = e.response.get("Error", {}).get("Code", "ClientError")
        logger.warning(f"Secrets Manager lookup for '{secret_id}' failed with code: {error_code}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error retrieving secret '{secret_id}': {type(e).__name__}")
        return None


def clear_secret_cache() -> None:
    """Clear in-memory secret cache (used in automated test suites)."""
    _SECRET_CACHE.clear()
