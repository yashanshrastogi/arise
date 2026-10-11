"""
AWS Lambda Serverless Adapter for Arise FastAPI.
Wraps the canonical Phase 2 FastAPI application with Mangum for AWS API Gateway / Lambda proxy integration.
Includes AWS Lambda Powertools for structured observability, correlation IDs, and tracing.
"""

import sys
import os

# Ensure backend root is on sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from mangum import Mangum
from aws_lambda_powertools import Logger
from app.core.config import get_settings
from main import app

settings = get_settings()
logger = Logger(service=settings.POWERTOOLS_SERVICE_NAME)

# Mangum adapter for AWS API Gateway HttpApi & RestApi
def resolve_api_gateway_base_path(event: dict | None = None) -> str:
    """
    Derive the base path prefix to strip from API Gateway HTTP API v2 requests.
    In AWS API Gateway HTTP API with a named stage (e.g. 'prod'), requests reach
    Lambda with rawPath='/prod/...' which Mangum needs to strip to match the FastAPI route.
    If invoked directly, with '$default' stage, or in local tests without stage prefix,
    returns '/' so routes match cleanly.
    """
    # 1. Dynamic inspection from requestContext.stage and rawPath in the incoming event
    if isinstance(event, dict):
        rc = event.get("requestContext", {})
        stage = rc.get("stage")
        raw_path = event.get("rawPath") or rc.get("http", {}).get("path", "")
        if stage and stage != "$default":
            stage_prefix = f"/{stage.strip('/')}"
            if raw_path and (raw_path == stage_prefix or raw_path.startswith(f"{stage_prefix}/")):
                return stage_prefix

    # 2. Explicit API_GATEWAY_BASE_PATH setting or env var
    configured_base_path = settings.API_GATEWAY_BASE_PATH or os.getenv("API_GATEWAY_BASE_PATH")
    if configured_base_path:
        bp = configured_base_path.strip()
        if bp and bp != "/":
            return bp if bp.startswith("/") else f"/{bp}"
        return "/"

    # 3. Deployed STAGE setting or env var
    configured_stage = settings.STAGE or os.getenv("STAGE")
    if configured_stage and configured_stage != "$default":
        return f"/{configured_stage.strip('/')}"

    return "/"


mangum_handler = Mangum(
    app,
    lifespan="off",
    api_gateway_base_path=resolve_api_gateway_base_path()
)


import asyncio


@logger.inject_lambda_context(log_event=False)
def handler(event, context):
    """
    AWS Lambda entrypoint.
    Executes identical business logic and domain services as local development.
    Dynamically aligns Mangum's base path with the incoming request stage if needed.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    base_path = resolve_api_gateway_base_path(event)
    if mangum_handler.config.get("api_gateway_base_path") != base_path:
        mangum_handler.config["api_gateway_base_path"] = base_path
    return mangum_handler(event, context)
