import logging
import os
from functools import lru_cache

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)


@lru_cache(maxsize=4)
def _jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(
        f"{issuer}/.well-known/jwks.json",
        cache_keys=True,
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="A valid Cognito access token is required.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = get_settings()
    pool_id = os.getenv("COGNITO_USER_POOL_ID", "").strip() or (settings.COGNITO_USER_POOL_ID or "").strip()
    client_id = os.getenv("COGNITO_APP_CLIENT_ID", "").strip() or (settings.COGNITO_APP_CLIENT_ID or "").strip()
    region = os.getenv("AWS_REGION", "").strip() or (settings.AWS_REGION or "us-east-1").strip()

    if not pool_id or not client_id:
        raise HTTPException(
            status_code=503,
            detail="Cognito authentication is not configured on the API.",
        )

    issuer = f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"

    try:
        signing_key = _jwks_client(issuer).get_signing_key_from_jwt(
            credentials.credentials
        )
        claims = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            issuer=issuer,
            options={
                "verify_aud": False,
                "require": ["exp", "iat", "sub", "iss", "token_use"],
            },
        )
    except PyJWTError as exc:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Cognito token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except Exception as exc:
        logger.warning("Cognito signing-key verification unavailable.")
        raise HTTPException(
            status_code=503,
            detail="Authentication verification is temporarily unavailable.",
        ) from exc

    token_use = claims.get("token_use")
    if token_use not in ("access", "id"):
        raise HTTPException(status_code=401, detail="A valid Cognito access or ID token is required.")

    token_client_id = claims.get("client_id") or claims.get("aud")
    if token_client_id != client_id:
        raise HTTPException(status_code=401, detail="Token is for another application.")

    # If email not present in token claims and access token was provided, attempt GetUser lookup
    if not claims.get("email") and token_use == "access":
        try:
            import boto3
            from botocore.config import Config
            fast_boto = Config(connect_timeout=3, read_timeout=3, retries={"max_attempts": 1})
            cognito_client = boto3.client("cognito-idp", region_name=region, config=fast_boto)
            user_info = cognito_client.get_user(AccessToken=credentials.credentials)
            for attr in user_info.get("UserAttributes", []):
                if attr.get("Name") == "email":
                    claims["email"] = attr.get("Value")
                elif attr.get("Name") == "email_verified":
                    claims["email_verified"] = attr.get("Value") == "true"
                elif attr.get("Name") == "name":
                    claims["name"] = attr.get("Value")
        except Exception as e:
            logger.debug(f"Cognito GetUser user attributes query skipped: {e}")
            username = claims.get("cognito:username") or claims.get("username")
            if username and "@" in str(username):
                claims["email"] = str(username)

    # Safe development diagnostics: log masked metadata without logging raw tokens or secrets
    sub = claims.get("sub")
    email = claims.get("email")
    raw_verified = claims.get("email_verified", False)
    email_verified = (
        raw_verified.lower() == "true"
        if isinstance(raw_verified, str)
        else bool(raw_verified)
    )
    identities = claims.get("identities", [])
    provider = (
        identities[0].get("providerName")
        if (identities and isinstance(identities, list) and isinstance(identities[0], dict))
        else ("Google" if str(claims.get("cognito:username", "")).startswith("Google") else "Cognito")
    )

    masked_sub = f"{sub[:4]}...{sub[-4:]}" if sub and len(sub) > 8 else "***"
    masked_email = (
        (email.split("@")[0][:1] + "***@" + email.split("@")[1])
        if email and "@" in str(email)
        else "none"
    )

    logger.debug(
        "Cognito authentication verified: use=%s, sub=%s, email=%s, verified=%s, idp=%s",
        token_use,
        masked_sub,
        masked_email,
        email_verified,
        provider,
    )

    return claims

