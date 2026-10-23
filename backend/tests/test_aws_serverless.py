"""
Unit and integration tests for AWS Serverless Architecture (Phase 3).
Validates:
1. FastAPI Mangum adapter handling API Gateway HTTP v2 events.
2. Scheduled Ingestion Lambda invocation.
3. DynamoDB cache repository with strict application-level freshness.
4. Parity of API contract between local and serverless execution.
"""

import unittest
import json
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone, timedelta

from app.main_lambda import handler as api_lambda_handler, resolve_api_gateway_base_path
from app.lambdas.ingestion import handler as ingestion_lambda_handler
from app.cache.repository import AwsDynamoCacheRepository, CacheEntry


def create_apigw_http_event(method: str, path: str, query_params: dict = None, body: dict = None, stage: str = "prod"):
    """Generate API Gateway HTTP API payload format v2.0 event."""
    qs = "&".join(f"{k}={v}" for k, v in (query_params or {}).items())
    return {
        "version": "2.0",
        "routeKey": f"{method} {path}",
        "rawPath": path,
        "rawQueryString": qs,
        "queryStringParameters": query_params or {},
        "headers": {
            "accept": "application/json",
            "content-type": "application/json",
            "host": "test.execute-api.us-east-1.amazonaws.com",
            "x-forwarded-proto": "https"
        },
        "requestContext": {
            "http": {
                "method": method,
                "path": path,
                "protocol": "HTTP/1.1",
                "sourceIp": "127.0.0.1",
                "userAgent": "AriseTestClient/1.0"
            },
            "stage": stage
        },
        "body": json.dumps(body) if body else None,
        "isBase64Encoded": False
    }


def create_mock_context():
    """Create a mock Lambda context object compatible with AWS Lambda Powertools."""
    ctx = MagicMock()
    ctx.function_name = "arise-api-function"
    ctx.memory_limit_in_mb = 512
    ctx.invoked_function_arn = "arn:aws:lambda:us-east-1:123456789012:function:arise-api-function"
    ctx.aws_request_id = "test-request-id-1234"
    return ctx


class TestAwsServerlessPipeline(unittest.TestCase):
    """Validates Lambda handlers and Mangum proxy behavior."""

    def test_mangum_health_endpoint(self):
        """Validates /health direct invocation (no stage prefix)."""
        event = create_apigw_http_event("GET", "/health", stage="$default")
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertEqual(body.get("status"), "healthy")
        self.assertEqual(body.get("service"), "Arise API")

    def test_mangum_with_stage_prefix_prod_health(self):
        """
        Regression Test:
        Validates API Gateway HTTP API v2 named stage 'prod' routing.
        In AWS, requests to https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod/health
        arrive with rawPath: '/prod/health' and requestContext.stage: 'prod'.
        Mangum must strip '/prod' so FastAPI /health endpoint responds 200 OK instead of 404.
        """
        event = create_apigw_http_event("GET", "/prod/health", stage="prod")
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertEqual(body.get("status"), "healthy")
        self.assertEqual(body.get("service"), "Arise API")

    def test_mangum_with_stage_prefix_prod_environment(self):
        """
        Regression Test:
        GET /prod/environment with stage='prod' must route cleanly to /environment.
        """
        event = create_apigw_http_event(
            "GET",
            "/prod/environment",
            query_params={"lat": "28.6139", "lon": "77.2090", "demo": "true"},
            stage="prod"
        )
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertIn("aqi", body)
        self.assertIn("verdict", body)

    def test_mangum_with_stage_prefix_prod_verdict(self):
        """
        Regression Test:
        GET /prod/verdict with stage='prod' must route cleanly to /verdict.
        """
        event = create_apigw_http_event(
            "GET",
            "/prod/verdict",
            query_params={"lat": "28.6139", "lon": "77.2090", "demo": "true"},
            stage="prod"
        )
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertIn("verdict", body)
        self.assertIn("aqi", body)

    def test_resolve_api_gateway_base_path_helper(self):
        """
        Test helper function for resolving API gateway base path dynamically.
        """
        # Event with stage prefix in rawPath
        evt_prod = {
            "rawPath": "/prod/health",
            "requestContext": {"stage": "prod", "http": {"path": "/prod/health"}}
        }
        self.assertEqual(resolve_api_gateway_base_path(evt_prod), "/prod")

        # Event with different stage prefix
        evt_staging = {
            "rawPath": "/staging/health",
            "requestContext": {"stage": "staging", "http": {"path": "/staging/health"}}
        }
        self.assertEqual(resolve_api_gateway_base_path(evt_staging), "/staging")

        # Event with $default stage
        evt_default = {
            "rawPath": "/health",
            "requestContext": {"stage": "$default", "http": {"path": "/health"}}
        }
        self.assertEqual(resolve_api_gateway_base_path(evt_default), "/")

        # Event without stage in rawPath
        evt_no_prefix = {
            "rawPath": "/health",
            "requestContext": {"stage": "prod", "http": {"path": "/health"}}
        }
        self.assertEqual(resolve_api_gateway_base_path(evt_no_prefix), "/")

    def test_mangum_environment_endpoint(self):
        event = create_apigw_http_event(
            "GET",
            "/environment",
            query_params={"lat": "28.6139", "lon": "77.2090", "demo": "true"}
        )
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertIn("aqi", body)
        self.assertIn("verdict", body)
        self.assertIn("pollutants", body)

    def test_mangum_verdict_endpoint(self):
        event = create_apigw_http_event(
            "GET",
            "/verdict",
            query_params={"lat": "28.6139", "lon": "77.2090", "demo": "true"}
        )
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertIn("verdict", body)
        self.assertIn("aqi", body)

    def test_mangum_chat_endpoint(self):
        chat_req = {
            "question": "Is it safe to exercise outside?",
            "persona": "General Public",
            "lat": 28.6139,
            "lon": 77.2090,
            "demo": True
        }
        event = create_apigw_http_event("POST", "/chat", body=chat_req)
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertIn("verdict", body)
        self.assertIn("headline", body)
        self.assertIn("why", body)

    def test_ingestion_lambda_handler(self):
        event = {"lat": 28.6139, "lon": 77.2090}
        ctx = create_mock_context()
        resp = ingestion_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = resp.get("body", {})
        self.assertEqual(body.get("status"), "success")
        self.assertIn("aqi", body)

    def test_dynamodb_cache_freshness_separation(self):
        """
        Verify that application freshness relies strictly on fetched_at/expires_at,
        and not DynamoDB's delayed background TTL deletion.
        """
        cache = AwsDynamoCacheRepository(table_name="mock-table", region_name="us-east-1")
        # Mock DynamoDB table
        mock_table = MagicMock()
        cache._table = mock_table

        now = datetime.now(timezone.utc)
        expired_dt = now - timedelta(minutes=5)
        
        # Simulate DynamoDB returning an item whose application expires_at has passed
        # (even though DynamoDB hasn't deleted it yet via background TTL)
        mock_table.get_item.return_value = {
            "Item": {
                "pk": "test:key",
                "data": json.dumps({"aqi": 312}),
                "fetched_at": (now - timedelta(minutes=35)).isoformat(),
                "expires_at": expired_dt.isoformat(),
                "ttl_seconds": 1800,
                "source": "mock"
            }
        }

        # 1. When allow_stale=False: must return None (expired)
        entry_fresh_only = cache.get("test:key", allow_stale=False)
        self.assertIsNone(entry_fresh_only, "Expired item returned when allow_stale=False!")

        # 2. When allow_stale=True: must return stale entry
        entry_stale = cache.get("test:key", allow_stale=True)
        self.assertIsNotNone(entry_stale)
        self.assertTrue(entry_stale.is_expired)
        self.assertEqual(entry_stale.status, "stale")
        self.assertEqual(entry_stale.value.get("aqi"), 312)

    def test_dynamodb_fetch_lock_conditional_delete_fencing(self):
        """
        Verify that AwsDynamoCacheRepository.release_fetch_lock enforces token fencing
        via DynamoDB conditional delete, preventing a stale token from deleting a newer worker's lock.
        """
        cache = AwsDynamoCacheRepository(table_name="mock-table", region_name="us-east-1")
        mock_table = MagicMock()
        cache._table = mock_table

        lock_key = "weather:cell:28.6200:77.2000"

        # 1. Release with valid owner token -> succeeds with ConditionExpression
        mock_table.delete_item.return_value = {}
        res_valid = cache.release_fetch_lock(lock_key, token="active_token_123")
        self.assertTrue(res_valid)
        mock_table.delete_item.assert_called_with(
            Key={"pk": f"lock:{lock_key}"},
            ConditionExpression="owner_token = :token",
            ExpressionAttributeValues={":token": "active_token_123"},
        )

        # 2. Release with stale/mismatched owner token -> ConditionalCheckFailedException in DynamoDB
        mock_table.delete_item.side_effect = Exception("ConditionalCheckFailedException: The conditional request failed")
        res_stale = cache.release_fetch_lock(lock_key, token="stale_token_old")
        self.assertFalse(res_stale, "Conditional delete failure must return False and not delete newer worker's lock")

    def test_sam_template_and_config_schedule_state(self):
        """
        Verify that infra/template.yaml parameterizes IngestionScheduleState defaulting to ENABLED,
        and infra/samconfig.toml sets IngestionScheduleState='DISABLED' for staging.
        """
        import os
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        template_path = os.path.join(repo_root, "infra", "template.yaml")
        samconfig_path = os.path.join(repo_root, "infra", "samconfig.toml")

        with open(template_path, "r", encoding="utf-8") as f:
            template_content = f.read()

        self.assertIn("IngestionScheduleState:", template_content)
        self.assertIn("State: !Ref IngestionScheduleState", template_content)

        with open(samconfig_path, "r", encoding="utf-8") as f:
            samconfig_content = f.read()

        self.assertIn('[staging.deploy.parameters]', samconfig_content)
        self.assertIn('"IngestionScheduleState=\\"DISABLED\\""', samconfig_content)


if __name__ == "__main__":
    unittest.main()
