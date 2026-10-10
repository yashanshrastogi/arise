import logging
import os
from functools import lru_cache

import jwt
from jwt import PyJWKClient
from jwt.exceptions import PyJWTError
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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

    pool_id = os.getenv("COGNITO_USER_POOL_ID", "").strip()
    client_id = os.getenv("COGNITO_APP_CLIENT_ID", "").strip()
    region = os.getenv("AWS_REGION", "us-east-1").strip()

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
            cognito_client = boto3.client("cognito-idp", region_name=region)
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

    return claims
