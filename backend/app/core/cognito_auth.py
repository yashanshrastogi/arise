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
                "require": ["exp", "iat", "sub", "iss", "token_use", "client_id"],
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

    if claims.get("token_use") != "access":
        raise HTTPException(status_code=401, detail="An access token is required.")

    if claims.get("client_id") != client_id:
        raise HTTPException(status_code=401, detail="Token is for another application.")

    return claims
