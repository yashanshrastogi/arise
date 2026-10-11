"""
Unit and Integration Tests for Google Gemini Provider in Arise.
Mocks all external AWS Secrets Manager and Google GenAI API calls.
Covers:
1. Secrets Manager retrieval & in-memory caching.
2. Provider selection (LLM_PROVIDER=gemini, rule-based, bedrock).
3. Successful Gemini structured responses and honest labeling.
4. Verdict integrity preservation (AI cannot override deterministic ground truth).
5. Timeout handling and rule-based fallback.
6. API errors and 429 rate limit / quota exhaustion handling.
7. Circuit breaker cooldown on Gemini failure.
8. Unavailable environmental data handling.
9. Privacy & zero PII leakage verification.
"""

import asyncio
from datetime import datetime, timezone
import json
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from botocore.exceptions import ClientError
from google.genai import errors

from app.core.config import get_settings
from app.core.secrets import get_secret, clear_secret_cache
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.gemini_provider import (
    invoke_gemini,
    build_gemini_prompt,
    sanitize_input,
    GeminiTimeoutError,
    GeminiRateLimitError,
    GeminiProviderError,
)
from app.agents.arise_agent import AriseAgent, _generate_grounded_fallback_response


@pytest.fixture(autouse=True)
def clean_cache():
    """Ensure secret cache and agent cache are cleared before and after each test."""
    clear_secret_cache()
    from app.cache.repository import get_cache_repository
    cache = get_cache_repository()
    cache.clear()
    yield
    clear_secret_cache()
    cache.clear()


# ==============================================================
# 1. AWS Secrets Manager Retrieval and In-Memory Caching
# ==============================================================

def test_secrets_manager_cold_and_warm_retrieval():
    """Verify Secrets Manager retrieves on cold start and caches in memory for warm starts."""
    mock_boto = MagicMock()
    mock_sm_client = MagicMock()
    mock_boto.client.return_value = mock_sm_client
    mock_sm_client.get_secret_value.return_value = {
        "SecretString": "fake_test_gemini_api_key_12345"
    }

    with patch("app.core.secrets.boto3", mock_boto):
        # Cold start invocation
        key1 = get_secret("arise/gemini-api-key")
        assert key1 == "fake_test_gemini_api_key_12345"
        assert mock_sm_client.get_secret_value.call_count == 1

        # Warm start invocation (must read from memory without re-querying Secrets Manager)
        key2 = get_secret("arise/gemini-api-key")
        assert key2 == "fake_test_gemini_api_key_12345"
        assert mock_sm_client.get_secret_value.call_count == 1  # Still 1


def test_secrets_manager_json_payload_extraction():
    """Verify JSON-formatted secret objects are correctly parsed."""
    mock_boto = MagicMock()
    mock_sm_client = MagicMock()
    mock_boto.client.return_value = mock_sm_client
    mock_sm_client.get_secret_value.return_value = {
        "SecretString": json.dumps({"GEMINI_API_KEY": "fake_test_gemini_json_key_999"})
    }

    with patch("app.core.secrets.boto3", mock_boto):
        key = get_secret("arise/gemini-api-key")
        assert key == "fake_test_gemini_json_key_999"


def test_secrets_manager_failure_returns_none_gracefully():
    """Verify Secrets Manager client errors do not raise unhandled exceptions."""
    mock_boto = MagicMock()
    mock_sm_client = MagicMock()
    mock_boto.client.return_value = mock_sm_client
    mock_sm_client.get_secret_value.side_effect = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "Secret not found"}},
        "GetSecretValue",
    )

    with patch("app.core.secrets.boto3", mock_boto):
        key = get_secret("arise/nonexistent-key")
        assert key is None


# ==============================================================
# 2. Privacy & PII Sanitization
# ==============================================================

def test_sanitize_input_redacts_pii():
    """Verify emails and phone numbers are scrubbed from queries before sending to Gemini."""
    dirty_query = "Hello, my email is john.doe@example.com and phone is 987-654-3210, should I go running?"
    clean = sanitize_input(dirty_query)
    assert "john.doe@example.com" not in clean
    assert "987-654-3210" not in clean
    assert "[REDACTED_EMAIL]" in clean
    assert "[REDACTED_PHONE]" in clean


def test_build_prompt_contains_no_user_pii():
    """Verify generated prompt contains only verified environmental data and persona, not user names or emails."""
    prompt = build_gemini_prompt(
        question="Can my child play outside at 4 PM?",
        verdict_data={"verdict": "CUT_BACK", "aqi": 210, "category": "Poor"},
        air_data={"station_count": 4, "pm25": 115.0, "pm10": 210.0},
        fc_data={"best_window": "1 PM – 3 PM"},
        fire_data={"signals_count": 5, "source": "NASA FIRMS"},
        persona="Parent / Child Care",
    )
    assert "CUT_BACK" in prompt
    assert "210" in prompt
    assert "PM2.5" in prompt
    assert "Parent / Child Care" in prompt
    assert "NASA FIRMS" in prompt
    # Ensure no PII placeholders exist
    assert "alice" not in prompt.lower()
    assert "email" not in prompt.lower() or "redacted" in prompt.lower()


# ==============================================================
# 3. Successful Gemini Invocation & Honest Labeling
# ==============================================================

@pytest.mark.asyncio
async def test_invoke_gemini_success_and_labeling():
    """Verify successful Gemini structured response and honest assistant labeling."""
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_client.aio = mock_aio
    mock_aio.models = mock_models

    fake_response = MagicMock()
    fake_response.text = json.dumps({
        "verdict": "STAY_IN",
        "aqi": 320,
        "category": "Very Poor",
        "headline": "Avoid outdoor activities due to severe PM2.5 concentrations.",
        "why": ["High particulate concentration across Delhi stations.", "Low wind dispersion."],
        "do": ["Stay indoors with air purifier on.", "Wear N95 if transit is necessary."],
        "best_window": "No recommended outdoor window",
        "recheck_at": "in 1 hour",
        "sources": ["CPCB Ground Stations", "Open-Meteo", "NASA FIRMS"],
        "assistant_label": "Should be overwritten with honest label",
        "is_rule_based": True,
        "provider": "rule-based"
    })
    mock_models.generate_content = AsyncMock(return_value=fake_response)

    with patch("app.agents.gemini_provider.genai.Client", return_value=mock_client):
        resp = await invoke_gemini(
            question="Can I exercise outside today?",
            verdict_data={"verdict": "STAY_IN", "aqi": 320, "category": "Very Poor"},
            air_data={"station_count": 3, "pm25": 160.0},
            fc_data={},
            fire_data={},
            persona="General Public",
            api_key="fake-test-key",
            model_id="gemini-3.5-flash-lite",
            timeout_sec=5.0,
        )

        assert resp.verdict == "STAY_IN"
        assert resp.aqi == 320
        # Honest labeling requirements
        assert resp.provider == "gemini"
        assert resp.is_rule_based is False
        assert "Google Gemini · gemini-3.5-flash-lite" in resp.assistant_label
        assert resp.headline == "Avoid outdoor activities due to severe PM2.5 concentrations."


@pytest.mark.asyncio
async def test_invoke_gemini_defaults_to_gemini_3_5_flash_lite():
    """Verify that invoke_gemini without model_id parameter defaults to gemini-3.5-flash-lite."""
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_client.aio = mock_aio
    mock_aio.models = mock_models

    fake_response = MagicMock()
    fake_response.text = json.dumps({
        "verdict": "BE_SMART",
        "aqi": 120,
        "category": "Moderate",
        "headline": "Moderate air quality.",
        "why": [],
        "do": [],
        "best_window": "Now",
        "recheck_at": "Later",
        "sources": [],
    })
    mock_models.generate_content = AsyncMock(return_value=fake_response)

    with patch("app.agents.gemini_provider.genai.Client", return_value=mock_client):
        resp = await invoke_gemini(
            question="Is air okay?",
            verdict_data={"verdict": "BE_SMART", "aqi": 120},
            air_data={},
            fc_data={},
            fire_data={},
            api_key="fake-key",
        )
        assert resp.provider == "gemini"
        assert "gemini-3.5-flash-lite" in resp.assistant_label
        # Verify default model was passed to generate_content
        call_kwargs = mock_models.generate_content.call_args.kwargs
        assert call_kwargs.get("model") == "gemini-3.5-flash-lite"


@pytest.mark.asyncio
async def test_invoke_gemini_enforces_authoritative_verdict():
    """Verify Gemini cannot override the authoritative ground-truth verdict (e.g. STAY_IN changed to GO)."""
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_client.aio = mock_aio
    mock_aio.models = mock_models

    # Simulate Gemini hallucinating a 'GO' verdict when ground truth is 'STAY_IN'
    fake_response = MagicMock()
    fake_response.text = json.dumps({
        "verdict": "GO",
        "aqi": 320,
        "category": "Very Poor",
        "headline": "Go enjoy the outdoors!",
        "why": [],
        "do": [],
        "best_window": "Anytime",
        "recheck_at": "Later",
        "sources": [],
    })
    mock_models.generate_content = AsyncMock(return_value=fake_response)

    with patch("app.agents.gemini_provider.genai.Client", return_value=mock_client):
        resp = await invoke_gemini(
            question="Can I go outside?",
            verdict_data={"verdict": "STAY_IN", "aqi": 320, "category": "Very Poor"},
            air_data={},
            fc_data={},
            fire_data={},
            api_key="fake-key",
        )
        # Ground truth verdict MUST prevail
        assert resp.verdict == "STAY_IN"


# ==============================================================
# 4. Timeout and API Error Handling
# ==============================================================

@pytest.mark.asyncio
async def test_invoke_gemini_timeout_raises_gemini_timeout():
    """Verify timeout triggers GeminiTimeoutError."""
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_client.aio = mock_aio
    mock_aio.models = mock_models

    async def slow_generate(*args, **kwargs):
        await asyncio.sleep(2.0)

    mock_models.generate_content = slow_generate

    with patch("app.agents.gemini_provider.genai.Client", return_value=mock_client):
        with pytest.raises(GeminiTimeoutError):
            await invoke_gemini(
                question="Quick check",
                verdict_data={"verdict": "GO"},
                air_data={},
                fc_data={},
                fire_data={},
                api_key="fake-key",
                timeout_sec=0.1,  # 100ms timeout
            )


@pytest.mark.asyncio
async def test_invoke_gemini_rate_limit_raises_rate_limit_error():
    """Verify HTTP 429 / RESOURCE_EXHAUSTED triggers GeminiRateLimitError."""
    mock_client = MagicMock()
    mock_aio = MagicMock()
    mock_models = MagicMock()
    mock_client.aio = mock_aio
    mock_aio.models = mock_models

    api_err = errors.APIError(429, {"error": {"code": 429, "message": "Resource has been exhausted (e.g. check quota)."}})
    mock_models.generate_content = AsyncMock(side_effect=api_err)

    with patch("app.agents.gemini_provider.genai.Client", return_value=mock_client):
        with pytest.raises(GeminiRateLimitError):
            await invoke_gemini(
                question="Check air",
                verdict_data={"verdict": "GO"},
                air_data={},
                fc_data={},
                fire_data={},
                api_key="fake-key",
            )


# ==============================================================
# 5. Full AriseAgent Integration & Fallback Behavior
# ==============================================================

@pytest.mark.asyncio
async def test_agent_with_llm_provider_rule_based_bypasses_gemini():
    """When LLM_PROVIDER is 'rule-based', Gemini is never invoked."""
    agent = AriseAgent()
    agent.settings.LLM_PROVIDER = "rule-based"

    with patch("app.agents.arise_agent.invoke_gemini") as mock_gemini:
        req = AskAriseRequest(question="Is it safe for kids to play today?")
        resp = await agent.answer(req)

        assert mock_gemini.call_count == 0
        assert resp.provider == "rule-based"
        assert resp.is_rule_based is True
        assert resp.assistant_label == "Arise Assistant (rule-based)"


@pytest.mark.asyncio
async def test_agent_with_llm_provider_gemini_success():
    """When LLM_PROVIDER is 'gemini', agent uses Gemini and caches result."""
    agent = AriseAgent()
    agent.settings.LLM_PROVIDER = "gemini"

    fake_gemini_resp = AskAriseVerdictResponse(
        verdict="CUT_BACK",
        aqi=245,
        category="Poor",
        headline="Cut back on strenuous outdoor running today.",
        why=["PM2.5 concentrations are elevated."],
        do=["Move workout indoors."],
        best_window="2 PM – 4 PM",
        recheck_at="3:00 PM",
        sources=["CPCB", "Google Gemini"],
        assistant_label="Arise AI (Google Gemini · gemini-3.5-flash-lite)",
        is_rule_based=False,
        provider="gemini",
    )

    with patch("app.agents.arise_agent.get_secret", return_value="fake-secret-key"), \
         patch("app.agents.arise_agent.invoke_gemini", AsyncMock(return_value=fake_gemini_resp)):

        req = AskAriseRequest(question="Can I go for an outdoor marathon run?")
        resp = await agent.answer(req)

        assert resp.provider == "gemini"
        assert resp.is_rule_based is False
        assert "Google Gemini" in resp.assistant_label
        assert resp.headline == "Cut back on strenuous outdoor running today."


@pytest.mark.asyncio
async def test_agent_gemini_timeout_falls_back_to_rule_based_and_trips_breaker():
    """When Gemini times out, agent immediately falls back to rule-based and trips circuit breaker."""
    agent = AriseAgent()
    agent.settings.LLM_PROVIDER = "gemini"

    with patch("app.agents.arise_agent.get_secret", return_value="fake-secret-key"), \
         patch("app.agents.arise_agent.invoke_gemini", AsyncMock(side_effect=GeminiTimeoutError("5s timeout"))):

        req = AskAriseRequest(question="What is the air quality now?")
        resp = await agent.answer(req)

        # Fallback to rule-based engine
        assert resp.provider == "rule-based"
        assert resp.is_rule_based is True
        assert resp.assistant_label == "Arise Assistant (rule-based)"

        # Check circuit breaker was tripped in cache
        breaker = agent.cache.get("gemini_circuit_breaker:failure")
        assert breaker is not None
        assert breaker.value.get("reason") == "timeout"


@pytest.mark.asyncio
async def test_agent_gemini_rate_limit_trips_breaker_and_cools_down():
    """When Gemini encounters a 429 rate limit, breaker trips so next request does not call API."""
    agent = AriseAgent()
    agent.settings.LLM_PROVIDER = "gemini"

    with patch("app.agents.arise_agent.get_secret", return_value="fake-secret-key"), \
         patch("app.agents.arise_agent.invoke_gemini", AsyncMock(side_effect=GeminiRateLimitError("Quota exceeded"))) as mock_gemini:

        req = AskAriseRequest(question="Should I open the windows?")
        resp1 = await agent.answer(req)
        assert resp1.provider == "rule-based"
        assert mock_gemini.call_count == 1

        # Second request must hit circuit breaker and bypass Gemini entirely
        req2 = AskAriseRequest(question="Can my elderly parents walk outside?")
        resp2 = await agent.answer(req2)
        assert resp2.provider == "rule-based"
        assert mock_gemini.call_count == 1  # Still 1, did not call Gemini again


@pytest.mark.asyncio
async def test_unavailable_environmental_data_fallback():
    """Verify that when ground telemetry is completely unavailable, response honestly states unavailability."""
    fallback = _generate_grounded_fallback_response(
        question="Can I exercise outdoors?",
        verdict_data={},
        air_data={},
        fc_data={},
        fire_data={},
    )
    assert "unavailable" in fallback.headline.lower()
    assert fallback.is_rule_based is True
    assert fallback.provider == "rule-based"
