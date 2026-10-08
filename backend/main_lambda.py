"""
Re-export for AWS Lambda entrypoint at backend root.
Permits both `main_lambda.handler` and `app.main_lambda.handler`.
"""
from app.main_lambda import handler, resolve_api_gateway_base_path, mangum_handler

__all__ = ["handler", "resolve_api_gateway_base_path", "mangum_handler"]
