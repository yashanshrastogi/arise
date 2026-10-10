import os
from unittest.mock import MagicMock, patch
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
import pytest

# Ensure dummy test environment
os.environ["USER_PROFILE_TABLE_NAME"] = "test-user-profiles"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["AWS_ACCESS_KEY_ID"] = "testing"
os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"

from main import app
from app.core.cognito_auth import get_current_user

client = TestClient(app)

USER_A = {"sub": "user-uuid-1111", "email": "userA@example.com"}
USER_B = {"sub": "user-uuid-2222", "email": "userB@example.com"}


def test_get_profile_requires_authentication():
    response = client.get("/profile")
    assert response.status_code == 401


def test_bootstrap_profile_requires_authentication():
    response = client.post(
        "/profile/bootstrap",
        json={"display_name": "Test User"},
    )
    assert response.status_code == 401


def test_update_profile_requires_authentication():
    response = client.patch(
        "/profile",
        json={"display_name": "Test User"},
    )
    assert response.status_code == 401


def test_bootstrap_validation_empty_name():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        response = client.post("/profile/bootstrap", json={"display_name": "   "})
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_bootstrap_stores_verified_email_from_cognito_and_ignores_browser_email():
    mock_table = MagicMock()
    mock_table.get_item.return_value = {}  # Profile does not exist yet

    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        with patch("app.api.routes.profile._get_profile_table", return_value=mock_table):
            response = client.post(
                "/profile/bootstrap",
                json={
                    "display_name": "Alice Sharma",
                    "email": "should_be_ignored@hack.com",
                    "home_location": {
                        "label": "Home",
                        "address": "Saket, New Delhi",
                        "latitude": 28.5245,
                        "longitude": 77.2066
                    }
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["user_id"] == "user-uuid-1111"
            assert data["display_name"] == "Alice Sharma"
            # Verified email from Cognito must be saved, browser-supplied email must be ignored
            assert data["email"] == "userA@example.com"
            assert data["email"] != "should_be_ignored@hack.com"
            assert data["home_location"]["address"] == "Saket, New Delhi"

            # Verify put_item was called with token sub and verified email
            mock_table.put_item.assert_called_once()
            put_call_kwargs = mock_table.put_item.call_args[1]
            stored_item = put_call_kwargs["Item"]
            assert stored_item["user_id"] == "user-uuid-1111"
            assert stored_item["email"] == "userA@example.com"
            assert stored_item["email"] != "should_be_ignored@hack.com"
            assert stored_item["home_location"]["latitude"] == 28.5245
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_owner_isolation_user_a_and_user_b():
    mock_table = MagicMock()

    def mock_get(Key):
        user_id = Key.get("user_id")
        if user_id == "user-uuid-1111":
            return {"Item": {"user_id": "user-uuid-1111", "display_name": "User One"}}
        if user_id == "user-uuid-2222":
            return {"Item": {"user_id": "user-uuid-2222", "display_name": "User Two"}}
        return {}

    mock_table.get_item.side_effect = mock_get

    with patch("app.api.routes.profile._get_profile_table", return_value=mock_table):
        # User A requests their profile
        app.dependency_overrides[get_current_user] = lambda: USER_A
        res_a = client.get("/profile")
        assert res_a.status_code == 200
        assert res_a.json()["user_id"] == "user-uuid-1111"
        assert res_a.json()["display_name"] == "User One"

        # User B requests their profile
        app.dependency_overrides[get_current_user] = lambda: USER_B
        res_b = client.get("/profile")
        assert res_b.status_code == 200
        assert res_b.json()["user_id"] == "user-uuid-2222"
        assert res_b.json()["display_name"] == "User Two"

    app.dependency_overrides.pop(get_current_user, None)


def test_update_profile_uses_atomic_update_item():
    mock_table = MagicMock()
    mock_table.update_item.return_value = {
        "Attributes": {
            "user_id": "user-uuid-1111",
            "display_name": "Alice Updated",
            "persona": "Athlete",
            "alerts_enabled": True,
            "created_at": "2026-10-10T00:00:00Z",
            "updated_at": "2026-10-10T01:00:00Z",
        }
    }

    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        with patch("app.api.routes.profile._get_profile_table", return_value=mock_table):
            response = client.patch(
                "/profile",
                json={"display_name": "Alice Updated", "persona": "Athlete", "alerts_enabled": True},
            )
            assert response.status_code == 200
            data = response.json()
            assert data["display_name"] == "Alice Updated"
            assert data["persona"] == "Athlete"
            assert data["alerts_enabled"] is True

            # Verify update_item was called atomically with ConditionExpression
            mock_table.update_item.assert_called_once()
            call_kwargs = mock_table.update_item.call_args[1]
            assert call_kwargs["Key"] == {"user_id": "user-uuid-1111"}
            assert call_kwargs["ConditionExpression"] == "attribute_exists(user_id)"
            assert call_kwargs["ReturnValues"] == "ALL_NEW"
            assert "SET " in call_kwargs["UpdateExpression"]
            assert "#display_name = :display_name" in call_kwargs["UpdateExpression"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_update_profile_uninitialized_returns_404():
    mock_table = MagicMock()
    error_response = {"Error": {"Code": "ConditionalCheckFailedException", "Message": "Condition failed"}}
    mock_table.update_item.side_effect = ClientError(error_response, "UpdateItem")

    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        with patch("app.api.routes.profile._get_profile_table", return_value=mock_table):
            response = client.patch("/profile", json={"display_name": "New Name"})
            assert response.status_code == 404
            assert "Profile not initialized" in response.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_location_validation_incomplete_coordinates():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Latitude without longitude must fail validation
        response = client.post(
            "/profile/bootstrap",
            json={
                "display_name": "Bob",
                "home_location": {
                    "label": "Home",
                    "latitude": 28.5
                }
            }
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_location_validation_out_of_range_coordinates():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Latitude > 90 must fail validation
        response = client.post(
            "/profile/bootstrap",
            json={
                "display_name": "Bob",
                "home_location": {
                    "label": "Home",
                    "latitude": 95.0,
                    "longitude": 77.0
                }
            }
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_get_profile_returns_verified_cognito_email():
    mock_table = MagicMock()
    mock_table.get_item.return_value = {
        "Item": {
            "user_id": "user-uuid-1111",
            "display_name": "Alice Sharma",
            "email": "userA@example.com",
            "home_location": {"label": "Home", "address": "Delhi", "latitude": 28.6, "longitude": 77.2},
            "work_location": {"label": "Work", "address": "Gurugram", "latitude": 28.4, "longitude": 77.0},
            "persona": "Asthma / Respiratory Sensitive",
            "alerts_enabled": True,
            "created_at": "2026-10-10T00:00:00Z",
            "updated_at": "2026-10-10T00:00:00Z",
        }
    }

    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        with patch("app.api.routes.profile._get_profile_table", return_value=mock_table):
            response = client.get("/profile")
            assert response.status_code == 200
            data = response.json()
            assert data["email"] == "userA@example.com"
            assert data["persona"] == "Asthma / Respiratory Sensitive"
            assert data["home_location"]["address"] == "Delhi"
            assert data["work_location"]["address"] == "Gurugram"
    finally:
        app.dependency_overrides.pop(get_current_user, None)
