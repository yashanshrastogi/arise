"""
Unit and Integration Tests for Identity Resolution and Multi-Identity Linking.
Verifies:
1. Two accounts with identical verified emails (e.g. Google OAuth and verified Cognito)
   are securely linked under a canonical user ID and share conversation histories.
2. SECURITY INVARIANT: Unverified accounts (email_verified=False) MUST NEVER be merged
   based only on matching email addresses.
3. Conversation lifecycle (list, get, update, delete) functions seamlessly across linked identities.
4. Unverified accounts cannot access private conversations of other identities.
"""

import pytest
import os
import shutil
from pathlib import Path

from app.domain.chat_models import ConversationCreate, ConversationPatch, ChatMessage
from app.services.identity import IdentityService, get_identity_service, mask_identifier, mask_email
from app.services.conversations import ConversationService


@pytest.fixture(autouse=True)
def clean_test_storage():
    """Ensure clean local directories for testing identity links and conversations."""
    test_identity_dir = Path("data/identity_links")
    test_conv_dir = Path("data/conversations")
    if test_identity_dir.exists():
        shutil.rmtree(test_identity_dir, ignore_errors=True)
    if test_conv_dir.exists():
        shutil.rmtree(test_conv_dir, ignore_errors=True)
    yield
    if test_identity_dir.exists():
        shutil.rmtree(test_identity_dir, ignore_errors=True)
    if test_conv_dir.exists():
        shutil.rmtree(test_conv_dir, ignore_errors=True)


def test_masking_helpers():
    """Verify diagnostic masking prevents logging raw secrets or identifiable tokens."""
    assert mask_identifier(None) == "none"
    assert mask_identifier("short") == "***"
    assert mask_identifier("64186408-2041-7005-b032-0bcea81acb3d") == "6418...cb3d"

    assert mask_email(None) == "none"
    assert mask_email("invalid") == "none"
    assert mask_email("yashanshrastogi@gmail.com") == "y***i@gmail.com"
    assert mask_email("a@b.com") == "a***@b.com"


def test_verified_google_and_verified_native_linking():
    """
    When both Google and Native accounts have email_verified=True with matching email,
    they must be securely linked into the same canonical identity cluster.
    """
    service = IdentityService()

    google_claims = {
        "sub": "google-sub-1111",
        "email": "user@example.com",
        "email_verified": True,
        "cognito:username": "Google_1234567890",
        "identities": [{"providerName": "Google", "userId": "1234567890"}],
    }

    native_verified_claims = {
        "sub": "native-sub-2222",
        "email": "user@example.com",
        "email_verified": True,
        "cognito:username": "native-sub-2222",
    }

    # Step 1: Google login establishes initial verified cluster
    google_cluster = service.resolve_identity(google_claims)
    assert google_cluster.canonical_user_id == "google-sub-1111"
    assert google_cluster.email == "user@example.com"
    assert google_cluster.email_verified is True
    assert "google-sub-1111" in google_cluster.linked_subs

    # Step 2: Native verified login links with Google cluster
    native_cluster = service.resolve_identity(native_verified_claims)
    assert native_cluster.canonical_user_id == google_cluster.canonical_user_id
    assert "native-sub-2222" in native_cluster.linked_subs
    assert "google-sub-1111" in native_cluster.linked_subs
    assert "Google" in native_cluster.providers
    assert "Cognito" in native_cluster.providers


def test_security_invariant_unverified_account_never_merges_on_matching_email():
    """
    CRITICAL SECURITY TEST:
    An unverified account (email_verified=False) with the same email MUST NOT be merged
    with an existing verified account. This prevents account takeover attacks.
    """
    service = IdentityService()

    # Legitimate user logs in with Google (verified)
    legit_claims = {
        "sub": "victim-google-sub",
        "email": "victim@example.com",
        "email_verified": True,
        "cognito:username": "Google_99999",
        "identities": [{"providerName": "Google", "userId": "99999"}],
    }
    legit_cluster = service.resolve_identity(legit_claims)
    assert legit_cluster.canonical_user_id == "victim-google-sub"

    # Attacker / unverified user signs up with the same email (email_verified=False)
    unverified_claims = {
        "sub": "attacker-native-sub",
        "email": "victim@example.com",
        "email_verified": False,
        "cognito:username": "attacker-native-sub",
    }
    unverified_cluster = service.resolve_identity(unverified_claims)

    # MUST NOT BE MERGED!
    assert unverified_cluster.canonical_user_id == "attacker-native-sub"
    assert unverified_cluster.canonical_user_id != legit_cluster.canonical_user_id
    assert "attacker-native-sub" not in legit_cluster.linked_subs
    assert "victim-google-sub" not in unverified_cluster.linked_subs


@pytest.mark.asyncio
async def test_shared_conversations_between_verified_linked_identities():
    """
    Verify that conversations created by Google sign-in are visible, retrievable,
    and editable by the verified email/password sign-in.
    """
    id_service = IdentityService()
    conv_service = ConversationService()

    google_claims = {
        "sub": "sub-google-aaa",
        "email": "sarah@cleanair.org",
        "email_verified": True,
        "cognito:username": "Google_888",
        "identities": [{"providerName": "Google", "userId": "888"}],
    }
    native_claims = {
        "sub": "sub-native-bbb",
        "email": "sarah@cleanair.org",
        "email_verified": True,
        "cognito:username": "sub-native-bbb",
    }

    # Resolve both identities to link them
    google_identity = id_service.resolve_identity(google_claims)
    native_identity = id_service.resolve_identity(native_claims)
    assert google_identity.canonical_user_id == native_identity.canonical_user_id

    # 1. User creates a conversation while logged in as Google
    created_conv = await conv_service.create_conversation(
        user_id=google_identity.canonical_user_id,
        create_data=ConversationCreate(
            title="AQI forecast for Anand Vihar",
            initial_message="Should I run tomorrow morning?",
        ),
    )
    assert created_conv.id is not None

    # 2. User logs in via Email/Password (native) and lists conversations
    native_conv_list = await conv_service.list_conversations(
        user_id=native_identity.canonical_user_id,
        linked_user_ids=native_identity.linked_subs,
    )
    assert len(native_conv_list) == 1
    assert native_conv_list[0].id == created_conv.id
    assert native_conv_list[0].title == "AQI forecast for Anand Vihar"

    # 3. User gets detail via native identity
    detail = await conv_service.get_conversation(
        user_id=native_identity.canonical_user_id,
        conv_id=created_conv.id,
        linked_user_ids=native_identity.linked_subs,
    )
    assert detail is not None
    assert detail.id == created_conv.id

    # 4. User updates conversation via native identity
    updated = await conv_service.update_conversation(
        user_id=native_identity.canonical_user_id,
        conv_id=created_conv.id,
        patch=ConversationPatch(title="Updated Run Plan"),
        linked_user_ids=native_identity.linked_subs,
    )
    assert updated.title == "Updated Run Plan"

    # 5. User deletes conversation via native identity
    deleted = await conv_service.delete_conversation(
        user_id=native_identity.canonical_user_id,
        conv_id=created_conv.id,
        linked_user_ids=native_identity.linked_subs,
    )
    assert deleted is True

    # 6. Verify conversation is gone for Google identity too
    google_conv_list = await conv_service.list_conversations(
        user_id=google_identity.canonical_user_id,
        linked_user_ids=google_identity.linked_subs,
    )
    assert len(google_conv_list) == 0


@pytest.mark.asyncio
async def test_unverified_account_cannot_access_victim_conversations():
    """
    Verify that an unverified account cannot list or read conversations of another user
    even if the unverified account has the same email.
    """
    id_service = IdentityService()
    conv_service = ConversationService()

    victim_claims = {
        "sub": "victim-sub-123",
        "email": "ceo@startup.in",
        "email_verified": True,
        "cognito:username": "Google_777",
    }
    attacker_claims = {
        "sub": "attacker-sub-456",
        "email": "ceo@startup.in",
        "email_verified": False,
        "cognito:username": "attacker-sub-456",
    }

    victim_identity = id_service.resolve_identity(victim_claims)
    attacker_identity = id_service.resolve_identity(attacker_claims)

    # Victim creates a sensitive conversation
    victim_conv = await conv_service.create_conversation(
        user_id=victim_identity.canonical_user_id,
        create_data=ConversationCreate(
            title="Private Executive Air Quality Advisory",
            initial_message="Confidential travel schedule",
        ),
    )

    # Attacker lists conversations
    attacker_list = await conv_service.list_conversations(
        user_id=attacker_identity.canonical_user_id,
        linked_user_ids=attacker_identity.linked_subs,
    )
    assert len(attacker_list) == 0

    # Attacker attempts direct retrieval of victim conversation
    attacker_detail = await conv_service.get_conversation(
        user_id=attacker_identity.canonical_user_id,
        conv_id=victim_conv.id,
        linked_user_ids=attacker_identity.linked_subs,
    )
    assert attacker_detail is None
