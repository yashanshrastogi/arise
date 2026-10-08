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
mangum_handler = Mangum(app, lifespan="off")


@logger.inject_lambda_context(log_event=False)
def handler(event, context):
    """
    AWS Lambda entrypoint.
    Executes identical business logic and domain services as local development.
    """
    return mangum_handler(event, context)
