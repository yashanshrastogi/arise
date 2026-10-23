"""
Tests for Ask Arise persistent conversations and user-controlled long-term memory.
Verifies:
- Conversation CRUD, listing, search, pinning, archiving, deletion.
- Strict per-user ownership and isolation (User A vs User B).
- Memory CRUD, category filtering, approval workflow.
- Secret scrubbing from memory content.
- Duplicate and conflict detection in memories.
"""

import os
import shutil
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from main import app
from app.core.cognito_auth import get_current_user
from app.domain.chat_models import MemoryCategory, MemoryStatus

client = TestClient(app)

USER_A = {"sub": "user-uuid-1111", "email": "alice@example.com"}
USER_B = {"sub": "user-uuid-2222", "email": "bob@example.com"}

# Clean test data directory before and after
TEST_DATA_DIR = Path("data")


@pytest.fixture(autouse=True)
def cleanup_test_data():
    yield
    # Clean up any test user data folders
    for uid in ["user-uuid-1111", "user-uuid-2222", "test-user-id"]:
        conv_dir = TEST_DATA_DIR / "conversations" / uid
        if conv_dir.exists():
            shutil.rmtree(conv_dir, ignore_errors=True)
        mem_file = TEST_DATA_DIR / "memories" / f"{uid}.json"
        if mem_file.exists():
            mem_file.unlink(missing_ok=True)


# ---------------- CONVERSATION TESTS ----------------


def test_conversations_require_authentication():
    response = client.get("/conversations")
    assert response.status_code == 401

    response = client.post("/conversations", json={"title": "Test Chat"})
    assert response.status_code == 401


def test_create_and_get_conversation():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Create
        create_res = client.post(
            "/conversations",
            json={
                "title": "Morning Run in Connaught Place",
                "location_name": "Connaught Place",
                "lat": 28.6315,
                "lon": 77.2167,
            },
        )
        assert create_res.status_code == 201
        data = create_res.json()
        conv_id = data["id"]
        assert data["title"] == "Morning Run in Connaught Place"
        assert data["user_id"] == USER_A["sub"]
        assert len(data["messages"]) == 0

        # Get detail
        get_res = client.get(f"/conversations/{conv_id}")
        assert get_res.status_code == 200
        conv_data = get_res.json()
        assert conv_data["id"] == conv_id
        assert conv_data["title"] == "Morning Run in Connaught Place"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_list_and_search_conversations():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        c1 = client.post("/conversations", json={"title": "Air Quality Noida"}).json()
        c2 = client.post("/conversations", json={"title": "Gurugram Forecast Saturday"}).json()

        # List all
        list_res = client.get("/conversations")
        assert list_res.status_code == 200
        items = list_res.json()
        ids = [c["id"] for c in items]
        assert c1["id"] in ids
        assert c2["id"] in ids

        # Search query
        search_res = client.get("/conversations?query=Gurugram")
        assert search_res.status_code == 200
        search_items = search_res.json()
        assert len(search_items) == 1
        assert search_items[0]["id"] == c2["id"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_patch_and_archive_conversation():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        c = client.post("/conversations", json={"title": "Initial Title"}).json()
        conv_id = c["id"]

        # Rename
        patch_res = client.patch(
            f"/conversations/{conv_id}",
            json={"title": "Renamed Trip Plan", "is_pinned": True},
        )
        assert patch_res.status_code == 200
        assert patch_res.json()["title"] == "Renamed Trip Plan"
        assert patch_res.json()["is_pinned"] is True

        # Archive
        archive_res = client.patch(
            f"/conversations/{conv_id}",
            json={"is_archived": True},
        )
        assert archive_res.status_code == 200
        assert archive_res.json()["is_archived"] is True

        # Verify not returned by default list
        active_list = client.get("/conversations").json()
        assert conv_id not in [x["id"] for x in active_list]

        # Verify returned when include_archived=true
        all_list = client.get("/conversations?include_archived=true").json()
        assert conv_id in [x["id"] for x in all_list]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_delete_conversation():
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        c = client.post("/conversations", json={"title": "To Delete"}).json()
        conv_id = c["id"]

        del_res = client.delete(f"/conversations/{conv_id}")
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

        # Ensure subsequent get returns 404
        get_res = client.get(f"/conversations/{conv_id}")
        assert get_res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_strict_user_conversation_isolation():
    """Verify User B cannot view, modify, or delete User A's conversations."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    c = client.post("/conversations", json={"title": "Alice Secret Chat"}).json()
    conv_id = c["id"]

    # Switch to User B
    app.dependency_overrides[get_current_user] = lambda: USER_B
    try:
        # User B cannot get User A's conversation
        b_get = client.get(f"/conversations/{conv_id}")
        assert b_get.status_code == 404

        # User B cannot see it in list
        b_list = client.get("/conversations").json()
        assert conv_id not in [item["id"] for item in b_list]

        # User B cannot patch User A's conversation
        b_patch = client.patch(f"/conversations/{conv_id}", json={"title": "Hacked"})
        assert b_patch.status_code == 404

        # User B cannot delete User A's conversation
        b_del = client.delete(f"/conversations/{conv_id}")
        assert b_del.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_conversation_persistence_and_turn_append():
    """Verify conversations persist turns across re-instantiation and strictly isolate between users."""
    from app.services.conversations import ConversationService
    from app.domain.chat_models import ConversationCreate, ChatMessage

    service1 = ConversationService()

    # User A creates a conversation
    c_a = await service1.create_conversation(
        user_id=USER_A["sub"],
        create_data=ConversationCreate(title="Alice Air Strategy", initial_message="Can I jog today?"),
    )
    conv_id_a = c_a.id

    # Append assistant turn to Alice's conversation
    asst_turn = ChatMessage(
        role="assistant",
        content="Air quality is moderate; morning jog is acceptable before 9 AM.",
        verdict="BE SMART",
        timestamp="2026-10-22T06:00:00Z",
    )
    await service1.append_turn(
        user_id=USER_A["sub"],
        conv_id=conv_id_a,
        user_content="Can I jog today?",
        assistant_message=asst_turn,
        location_name="Connaught Place",
    )

    # Re-instantiate service (simulating session restart/fresh request)
    service2 = ConversationService()

    # Alice fetches her conversation: message turns must persist
    loaded_a = await service2.get_conversation(user_id=USER_A["sub"], conv_id=conv_id_a)
    assert loaded_a is not None
    assert loaded_a.id == conv_id_a
    assert loaded_a.title == "Alice Air Strategy"
    assert len(loaded_a.messages) >= 2
    assert loaded_a.messages[-1].content == "Air quality is moderate; morning jog is acceptable before 9 AM."
    assert loaded_a.messages[-1].verdict == "BE SMART"

    # Bob tries to access Alice's conversation: strictly blocked
    loaded_b_attempt = await service2.get_conversation(user_id=USER_B["sub"], conv_id=conv_id_a)
    assert loaded_b_attempt is None

    # Bob's conversation list does NOT contain Alice's chat
    bob_list = await service2.list_conversations(user_id=USER_B["sub"])
    assert conv_id_a not in [c.id for c in bob_list]

    # Bob creates his own conversation
    c_b = await service2.create_conversation(
        user_id=USER_B["sub"],
        create_data=ConversationCreate(title="Bob Weather Check", initial_message="Is it raining?"),
    )
    conv_id_b = c_b.id

    # Alice's conversation list does NOT contain Bob's chat
    alice_list = await service2.list_conversations(user_id=USER_A["sub"])
    assert conv_id_b not in [c.id for c in alice_list]
    assert conv_id_a in [c.id for c in alice_list]


# ---------------- MEMORY TESTS ----------------


def test_memory_requires_authentication():
    response = client.get("/memories")
    assert response.status_code == 401


def test_create_memory_with_secret_scrubbing():
    """Verify API keys and passwords are scrubbed out before storage."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        res = client.post(
            "/memories",
            json={
                "category": "preference",
                "key": "api_key_test",
                "content": "My Google API key is AIzaSyB1234567890abcdef1234567890abc and I prefer evening runs",
                "confidence": 0.9,
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert "AIzaSy" not in data["content"]
        assert "[REDACTED_SECRET]" in data["content"]
        assert "evening runs" in data["content"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_sensitive_memory_requires_explicit_approval():
    """Verify health facts default to pending_approval."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        res = client.post(
            "/memories",
            json={
                "category": "health_environmental",
                "key": "asthma_condition",
                "content": "User has mild allergic asthma triggered by PM2.5 above 150",
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["status"] == "pending_approval"

        mem_id = data["id"]

        # Only approved memories should NOT list this yet
        approved_res = client.get("/memories?only_approved=true")
        assert mem_id not in [m["id"] for m in approved_res.json()]

        # Approve memory
        app_res = client.post(f"/memories/{mem_id}/approve")
        assert app_res.status_code == 200
        assert app_res.json()["status"] == "approved"

        # Now should be listed in approved memories
        approved_res = client.get("/memories?only_approved=true")
        assert mem_id in [m["id"] for m in approved_res.json()]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_memory_deduplication_and_conflict_update():
    """Updating same key should supersede the older fact."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        res1 = client.post(
            "/memories",
            json={
                "category": "location_reference",
                "key": "office_location",
                "content": "Works in Cyber Hub, Gurugram",
            },
        )
        assert res1.status_code == 201
        m1_id = res1.json()["id"]

        # User moves office
        res2 = client.post(
            "/memories",
            json={
                "category": "location_reference",
                "key": "office_location",
                "content": "Works in Noida Sector 62",
            },
        )
        assert res2.status_code == 201
        m2_id = res2.json()["id"]
        assert m1_id == m2_id  # Reused same key ID

        memories = client.get("/memories?category=location_reference").json()
        assert len(memories) == 1
        assert "Noida Sector 62" in memories[0]["content"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_strict_user_memory_isolation():
    """Verify User B cannot access or delete User A's memories."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    res = client.post(
        "/memories",
        json={
            "category": "preference",
            "key": "alice_habit",
            "content": "Runs at Lodhi Garden at 6 AM",
            "status": "approved",
        },
    )
    assert res.status_code == 201
    mem_id = res.json()["id"]

    # Switch to User B
    app.dependency_overrides[get_current_user] = lambda: USER_B
    try:
        b_memories = client.get("/memories").json()
        assert mem_id not in [m["id"] for m in b_memories]

        # User B cannot patch or delete User A's memory
        b_patch = client.patch(f"/memories/{mem_id}", json={"content": "Tampered"})
        assert b_patch.status_code == 404

        b_del = client.delete(f"/memories/{mem_id}")
        assert b_del.status_code == 404
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_memory_creation_with_fact_alias_and_auto_key():
    """Verify memory creation accepting 'fact' instead of 'content' and auto-generating 'key'."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        res = client.post(
            "/memories",
            json={
                "category": "preference",
                "fact": "Sensitive to early morning smoke",
                "confidence": 0.85,
            },
        )
        assert res.status_code == 201
        data = res.json()
        assert data["fact"] == "Sensitive to early morning smoke"
        assert data["content"] == "Sensitive to early morning smoke"
        assert data["key"] is not None and len(data["key"]) > 0
        mem_id = data["id"]

        # Verify it is listed immediately
        list_res = client.get("/memories")
        assert list_res.status_code == 200
        memories = list_res.json()
        assert any(m["id"] == mem_id for m in memories)
        matching = next(m for m in memories if m["id"] == mem_id)
        assert matching["fact"] == "Sensitive to early morning smoke"
        assert matching["content"] == "Sensitive to early morning smoke"
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_multiple_memories_same_category_do_not_overwrite():
    """Verify adding distinct facts under the same category keeps both records intact."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        res1 = client.post(
            "/memories",
            json={
                "category": "preference",
                "fact": "Prefers morning running at Lodhi Garden",
            },
        )
        assert res1.status_code == 201
        id1 = res1.json()["id"]

        res2 = client.post(
            "/memories",
            json={
                "category": "preference",
                "fact": "Cycles along Yamuna Biodiversity Park on weekends",
            },
        )
        assert res2.status_code == 201
        id2 = res2.json()["id"]

        assert id1 != id2

        list_res = client.get("/memories?category=preference")
        assert list_res.status_code == 200
        all_pref = list_res.json()
        ids = [m["id"] for m in all_pref]
        assert id1 in ids
        assert id2 in ids
        assert len([m for m in all_pref if m["id"] in (id1, id2)]) == 2
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_conversation_switching_and_turn_isolation():
    """Verify switching between conversations A and B preserves independent turn histories and metadata."""
    from app.services.conversations import ConversationService
    from app.domain.chat_models import ConversationCreate, ChatMessage

    service = ConversationService()

    # Create Conversation A
    conv_a = await service.create_conversation(
        user_id=USER_A["sub"],
        create_data=ConversationCreate(title="Conv A - Morning Jog"),
    )
    # Append turns to A with recommendations
    asst_turn_a = ChatMessage(
        role="assistant",
        content="Morning air quality is Moderate; jog before 8:30 AM.",
        verdict="BE SMART",
        headline="Morning Jog Advisory",
        why=["PM2.5 elevated near main roads"],
        do=["Stick to interior park paths"],
        best_window="07:00 AM - 08:30 AM",
    )
    await service.append_turn(
        user_id=USER_A["sub"],
        conv_id=conv_a.id,
        user_content="Can I run in Lodhi Garden?",
        assistant_message=asst_turn_a,
    )

    # Create Conversation B
    conv_b = await service.create_conversation(
        user_id=USER_A["sub"],
        create_data=ConversationCreate(title="Conv B - Evening Commute"),
    )
    # Append turns to B
    asst_turn_b = ChatMessage(
        role="assistant",
        content="Evening commute window has Poor AQI; roll windows up.",
        verdict="STAY IN",
        headline="Commute Air Alert",
        why=["Traffic congestion and temperature inversion"],
        do=["Use cabin recirculate mode"],
    )
    await service.append_turn(
        user_id=USER_A["sub"],
        conv_id=conv_b.id,
        user_content="How is the route to Noida at 6 PM?",
        assistant_message=asst_turn_b,
    )

    # Re-fetch Conversation A (simulating switch back from B to A)
    loaded_a = await service.get_conversation(user_id=USER_A["sub"], conv_id=conv_a.id)
    assert loaded_a is not None
    assert loaded_a.title == "Conv A - Morning Jog"
    assert len(loaded_a.messages) == 2
    assert loaded_a.messages[0].content == "Can I run in Lodhi Garden?"
    assert loaded_a.messages[1].headline == "Morning Jog Advisory"
    assert loaded_a.messages[1].why == ["PM2.5 elevated near main roads"]
    assert loaded_a.messages[1].do == ["Stick to interior park paths"]
    assert loaded_a.messages[1].best_window == "07:00 AM - 08:30 AM"

    # Re-fetch Conversation B (simulating switch back to B)
    loaded_b = await service.get_conversation(user_id=USER_A["sub"], conv_id=conv_b.id)
    assert loaded_b is not None
    assert loaded_b.title == "Conv B - Evening Commute"
    assert len(loaded_b.messages) == 2
    assert loaded_b.messages[0].content == "How is the route to Noida at 6 PM?"
    assert loaded_b.messages[1].headline == "Commute Air Alert"

    # Create empty Conversation C
    conv_c = await service.create_conversation(
        user_id=USER_A["sub"],
        create_data=ConversationCreate(title="Conv C - Empty New Chat"),
    )
    assert len(conv_c.messages) == 0

    # Ensure Conv A and Conv B are completely unmodified after creating empty C
    loaded_a_again = await service.get_conversation(user_id=USER_A["sub"], conv_id=conv_a.id)
    assert len(loaded_a_again.messages) == 2


def test_storage_validation_failure_does_not_falsely_report_success():
    """Verify validation and auth failures return HTTP 4xx and never claim false success."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Empty payload
        empty_res = client.post("/memories", json={})
        assert empty_res.status_code == 422

        # Whitespace-only fact
        ws_res = client.post("/memories", json={"category": "preference", "fact": "   "})
        assert ws_res.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # Without auth
    unauth_mem = client.post("/memories", json={"category": "preference", "fact": "No auth fact"})
    assert unauth_mem.status_code == 401

    unauth_conv = client.post("/conversations", json={"title": "No auth conv"})
    assert unauth_conv.status_code == 401


# ---------------- FOCUSED REGRESSION TESTS: MEMORY RETRIEVAL & BOUNDS ----------------


def test_saved_health_fact_retrieved_in_chat():
    """Regression Test 1: Save an approved health fact and retrieve it in a new question."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # 1. Save health fact
        save_res = client.post(
            "/memories",
            json={
                "category": "health_environmental",
                "key": "asthma_pm25_trigger",
                "fact": "Patient has seasonal allergic asthma triggered by elevated PM2.5",
            },
        )
        assert save_res.status_code == 201
        mem_id = save_res.json()["id"]

        # 2. Approve the memory
        app_res = client.post(f"/memories/{mem_id}/approve")
        assert app_res.status_code == 200

        # 3. Ask assistant to recall the health fact
        chat_res = client.post(
            "/chat",
            headers={"Authorization": "Bearer mock-token"},
            json={"question": "What health fact did I save?"},
        )
        assert chat_res.status_code == 200
        data = chat_res.json()
        assert "saved health" in data["headline"].lower() or "memories" in data["headline"].lower()
        full_text = " ".join(data.get("why", [])) + " " + data.get("headline", "")
        assert "allergic asthma" in full_text.lower() or "asthma" in full_text.lower()
        # Non-medical disclaimer must be present
        assert any("medical diagnosis" in w.lower() or "healthcare professional" in w.lower() for w in data["why"])
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_check_my_new_memory_query():
    """Regression Test 2: Use 'Check my new memory' and verify a useful response."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        save_res = client.post(
            "/memories",
            json={
                "category": "health_environmental",
                "key": "coarse_dust_allergy",
                "fact": "Severe respiratory cough triggered by coarse dust and road sweeping",
                "status": "approved",
            },
        )
        assert save_res.status_code == 201

        chat_res = client.post(
            "/chat",
            headers={"Authorization": "Bearer mock-token"},
            json={"question": "Check my new memory"},
        )
        assert chat_res.status_code == 200
        data = chat_res.json()
        assert "out of bound" not in data["headline"].lower()
        assert "saved health" in data["headline"].lower() or "memories" in data["headline"].lower()
        full_text = " ".join(data.get("why", [])) + " " + data.get("headline", "")
        assert "coarse dust" in full_text.lower() or "respiratory cough" in full_text.lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_retrieve_memories_after_simulated_refresh():
    """Regression Test 3: Retrieve memories after service re-instantiation (page refresh)."""
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Save memory
        client.post(
            "/memories",
            json={
                "category": "health_environmental",
                "key": "pollen_rhinitis",
                "fact": "User experiences spring pollen rhinitis and throat irritation",
                "status": "approved",
            },
        )

        # Simulate page refresh by querying anew
        chat_res = client.post(
            "/chat",
            headers={"Authorization": "Bearer mock-token"},
            json={"question": "Do you remember my health conditions?"},
        )
        assert chat_res.status_code == 200
        data = chat_res.json()
        full_text = " ".join(data.get("why", [])) + " " + data.get("headline", "")
        assert "pollen rhinitis" in full_text.lower() or "throat irritation" in full_text.lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_handle_user_with_no_saved_memories():
    """Regression Test 4: Handle users with no saved memories cleanly without errors."""
    clean_user = {"sub": "user-uuid-fresh-9999", "email": "fresh@example.com"}
    app.dependency_overrides[get_current_user] = lambda: clean_user
    try:
        chat_res = client.post(
            "/chat",
            headers={"Authorization": "Bearer mock-token"},
            json={"question": "Check my new memory"},
        )
        assert chat_res.status_code == 200
        data = chat_res.json()
        assert "out of bound" not in data["headline"].lower()
        assert "no approved health memories" in data["headline"].lower()
        # Verify it explains how to add memories in Memory Manager
        assert any("memory manager" in w.lower() for w in data["why"])
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_handle_malformed_or_missing_memory_fields():
    """Regression Test 5: Handle malformed or missing memory fields safely without exceptions."""
    from app.agents.pipeline.assembler import assemble_context
    from app.agents.pipeline.retriever import RetrievedContext
    from app.agents.pipeline.router import RequestPlan
    from app.agents.arise_agent import _generate_grounded_fallback_response

    plan = RequestPlan(
        intent="health_sensitivity",
        sub_intent="personal_memory_lookup",
        required_sources=["user_memories"],
    )

    # Malformed memories with None content, missing keys, and dicts
    malformed_mems = [
        {"content": None, "fact": None, "key": None, "category": None},
        {"content": "Valid text but missing category"},
        {"content": "", "key": "empty_item"},
    ]

    retrieved = RetrievedContext(
        plan=plan,
        sources=["User Approved Memory Profile"],
        verdict_data={"verdict": "BE_SMART", "aqi": 100},
        air_data={"aqi": 100},
        approved_memories=malformed_mems,
    )

    # Assembler must not crash with TypeError or AttributeError
    assembled = assemble_context(
        retrieved=retrieved,
        question="What health fact did I save?",
    )
    assert assembled is not None
    assert isinstance(assembled.user_prompt, str)

    # Fallback generator must handle malformed memories safely
    resp = _generate_grounded_fallback_response(
        question="What health fact did I save?",
        verdict_data={"verdict": "BE_SMART", "aqi": 100},
        air_data={"aqi": 100},
        fc_data={},
        fire_data={},
        approved_memories=malformed_mems,
    )
    assert resp is not None
    assert "out of bound" not in resp.headline.lower()


def test_context_limits_and_bounded_memory_slicing():
    """Regression Test 6: Handle context limits and oversized memory lists safely."""
    from app.agents.pipeline.assembler import assemble_context
    from app.agents.pipeline.retriever import RetrievedContext
    from app.agents.pipeline.router import RequestPlan
    from app.domain.chat_models import UserMemoryItem

    # Create 25 mock memories
    large_mem_list = [
        UserMemoryItem(
            id=f"mem-{i}",
            user_id="user-bulk",
            category="health_environmental",
            key=f"health_fact_{i}",
            content=f"Saved health observation number {i} regarding air quality",
            status="approved",
        )
        for i in range(25)
    ]

    plan = RequestPlan(intent="health_sensitivity", required_sources=["user_memories"])
    retrieved = RetrievedContext(
        plan=plan,
        sources=["User Approved Memory Profile"],
        verdict_data={"verdict": "BE_SMART", "aqi": 90},
        air_data={"aqi": 90},
        approved_memories=large_mem_list,
    )

    assembled = assemble_context(
        retrieved=retrieved,
        question="Check my new memory",
    )
    # Ensure assembler slices memories to top 10
    assert assembled.user_prompt.count("Saved health observation number") <= 10


def test_user_cannot_retrieve_another_users_health_facts():
    """Regression Test 7: Verify User B cannot retrieve User A's health memories."""
    # User A saves sensitive asthma fact
    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        client.post(
            "/memories",
            json={
                "category": "health_environmental",
                "key": "alice_secret_asthma",
                "fact": "Alice has severe nocturnal asthma requiring budesonide inhaler",
                "status": "approved",
            },
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    # User B queries their memories
    app.dependency_overrides[get_current_user] = lambda: USER_B
    try:
        b_res = client.post(
            "/chat",
            headers={"Authorization": "Bearer mock-token-b"},
            json={"question": "Check my new memory"},
        )
        assert b_res.status_code == 200
        b_data = b_res.json()
        b_text = " ".join(b_data.get("why", [])) + " " + b_data.get("headline", "")
        # Alice's health fact must NEVER appear in Bob's response
        assert "alice" not in b_text.lower()
        assert "budesonide" not in b_text.lower()
        assert "nocturnal asthma" not in b_text.lower()
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_retrieval_failure_produces_clear_message_not_out_of_bound():
    """Regression Test 8: Verify retrieval failures produce a clear message rather than 'out of bound'."""
    from unittest.mock import patch

    app.dependency_overrides[get_current_user] = lambda: USER_A
    try:
        # Mock MemoryService.get_approved_memories to simulate storage error
        with patch("app.services.memories.MemoryService.get_approved_memories", side_effect=RuntimeError("Storage connection failed")):
            res = client.post(
                "/chat",
                headers={"Authorization": "Bearer mock-token"},
                json={"question": "Check my new memory"},
            )
            assert res.status_code == 200
            data = res.json()
            assert "out of bound" not in data["headline"].lower()
            # Explains cleanly without exposing raw exception
            assert "RuntimeError" not in data["headline"]
            assert "Storage connection failed" not in data["headline"]
    finally:
        app.dependency_overrides.pop(get_current_user, None)


