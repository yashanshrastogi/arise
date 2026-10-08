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

from app.main_lambda import handler as api_lambda_handler
from app.lambdas.ingestion import handler as ingestion_lambda_handler
from app.cache.repository import AwsDynamoCacheRepository, CacheEntry


def create_apigw_http_event(method: str, path: str, query_params: dict = None, body: dict = None):
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
            "stage": "prod"
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
        event = create_apigw_http_event("GET", "/health")
        ctx = create_mock_context()
        resp = api_lambda_handler(event, ctx)
        self.assertEqual(resp.get("statusCode"), 200)
        body = json.loads(resp.get("body", "{}"))
        self.assertEqual(body.get("status"), "healthy")
        self.assertEqual(body.get("service"), "Arise API")

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


if __name__ == "__main__":
    unittest.main()
