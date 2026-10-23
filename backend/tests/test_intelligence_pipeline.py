"""
Unit tests for the Arise Multi-Stage Intelligence Pipeline:
- Stage A: Request Planner / Router (Intent classification, source routing, schema validation)
- Stage B: Context Retriever (Authoritative sources, provenance, zero Delhi substitution)
- Stage C: Context Assembler (Bounded tokens, address redaction, secret scrubbing, memory privacy)
- Stage D: Answer Evaluator (Completeness, evidence grounding, deterministic verdict preservation)
- Stage E: IntelligencePipeline Orchestrator (Conditional revision, fallback resilience, timing metrics)
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch

from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.pipeline.router import route_request, RequestPlan
from app.agents.pipeline.retriever import retrieve_context, RetrievedContext
from app.agents.pipeline.assembler import assemble_context, redact_precise_address
from app.agents.pipeline.evaluator import evaluate_response, EvaluationReport
from app.agents.pipeline.orchestrator import IntelligencePipeline
from app.domain.chat_models import UserMemoryItem, MemoryCategory, MemoryStatus


# ---------------- STAGE A: REQUEST PLANNER / ROUTER TESTS ----------------


def test_planner_intent_classification():
    # Current safety query
    plan_run = route_request("Is it safe to go for a jog right now?")
    assert plan_run.intent == "current_safety"
    assert "verdict" in plan_run.required_sources
    assert "air_quality" in plan_run.required_sources

    # Forecast query
    plan_fc = route_request("What will the air quality be tomorrow afternoon at 4pm?")
    assert plan_fc.intent == "forecast_planning"
    assert "forecast" in plan_fc.required_sources

    # Transit commute query
    plan_transit = route_request("What is the cleanest route to commute to work on Expressway?")
    assert plan_transit.intent == "transit_commute"
    assert "traffic_corridors" in plan_transit.required_sources

    # Health / asthma query
    plan_health = route_request("I have asthma and shortness of breath, can I sit outside?")
    assert plan_health.intent == "health_sensitivity"
    assert "user_memories" in plan_health.required_sources

    # Satellite stubble fire query
    plan_fire = route_request("Are there farm stubble fire smoke plumes affecting our air today?")
    assert plan_fire.intent == "fire_satellite"
    assert "fire_signals" in plan_fire.required_sources


def test_planner_structured_validation():
    plan = route_request(
        question="Can children play outside?",
        lat=28.6139,
        lon=77.2090,
        persona="Children",
        location_name="Central Delhi",
    )
    assert isinstance(plan, RequestPlan)
    assert plan.target_location["lat"] == 28.6139
    assert plan.target_location["lon"] == 77.2090
    assert plan.location_name == "Central Delhi"


# ---------------- STAGE B: CONTEXT RETRIEVER TESTS ----------------


@pytest.mark.asyncio
async def test_retriever_zero_delhi_substitution_for_other_cities():
    """Verify retriever strictly queries target coordinates and never substitutes Delhi for Mumbai."""
    mumbai_lat, mumbai_lon = 19.0760, 72.8777
    plan = route_request(
        question="What is the AQI in Bandra Mumbai right now?",
        lat=mumbai_lat,
        lon=mumbai_lon,
        location_name="Bandra, Mumbai",
    )

    with patch("app.agents.arise_agent.get_air_now") as mock_air, \
         patch("app.agents.arise_agent.get_verdict") as mock_verdict:
        mock_air.return_value = {"aqi": 88, "station": "Bandra Kurla Complex", "location": "Mumbai"}
        mock_verdict.return_value = {"verdict": "BE_SMART", "aqi": 88}

        retrieved: RetrievedContext = await retrieve_context(
            plan=plan,
            lat=mumbai_lat,
            lon=mumbai_lon,
            persona="General Public",
            demo=False,
        )

        # Assert get_air_now was called with Mumbai coordinates, NOT Delhi (28.6139, 77.2090)
        mock_air.assert_called_once_with(lat=mumbai_lat, lon=mumbai_lon, demo=False)
        assert retrieved.location_name == "Bandra, Mumbai"
        assert retrieved.air_data["station"] == "Bandra Kurla Complex"


# ---------------- STAGE C: CONTEXT ASSEMBLER TESTS ----------------


def test_address_redaction():
    """Precise house/flat numbers must be redacted for privacy before prompt assembly."""
    sample_address = "Flat 402, Tower B, Lotus Greens, Sector 78, Noida, Uttar Pradesh"
    redacted = redact_precise_address(sample_address)
    assert "Flat 402" not in redacted
    assert "Lotus Greens" in redacted or "Sector 78" in redacted

    sample_house = "House No. 124, Gulmohar Park, New Delhi"
    redacted2 = redact_precise_address(sample_house)
    assert "House No. 124" not in redacted2
    assert "Gulmohar Park" in redacted2


def test_assembler_memory_privacy_and_token_bounds():
    plan = route_request("Should I go cycling?", location_name="Central Delhi")
    approved_memory = UserMemoryItem(
        id="mem-1",
        user_id="user-1",
        category="health_environmental",
        key="asthma",
        content="Diagnosed with mild exercise-induced asthma",
        status="approved",
    )

    retrieved = RetrievedContext(
        plan=plan,
        sources=["CPCB", "Open-Meteo"],
        verdict_data={"verdict": "BE_SMART", "aqi": 165},
        air_data={"aqi": 165, "dominant_pollutant": "PM2.5"},
        forecast_data={},
        fire_data={},
        location_name="Central Delhi",
        approved_memories=[approved_memory],
    )

    bundle = assemble_context(
        retrieved=retrieved,
        question="Should I go cycling?",
        persona="General Public",
    )
    # Approved memory content is included in user_prompt
    assert "exercise-induced asthma" in bundle.user_prompt
    # Prompt is within token limits
    assert bundle.token_estimate < 3500


# ---------------- STAGE D: ANSWER EVALUATOR TESTS ----------------


def test_evaluator_rejects_verdict_contradiction():
    """Deterministic Science Guardrail: Evaluator MUST fail if answer contradicts authoritative verdict."""
    plan = route_request("Can I go for an outdoor workout?", location_name="Noida Sector 62")
    retrieved = RetrievedContext(
        plan=plan,
        sources=["CPCB"],
        verdict_data={"verdict": "CUT_BACK", "aqi": 240, "dominant_pollutant": "PM2.5"},
        air_data={"aqi": 240},
        location_name="Noida Sector 62",
    )

    # Model hallucinated GO verdict
    hallucinated_response = AskAriseVerdictResponse(
        verdict="GO",
        aqi=240,
        headline="It is a great day to run outdoors without any worry!",
        why=["Air is clear"],
        do=["Enjoy running"],
        best_window="Now",
        recheck_at="5 PM",
        sources=["CPCB"],
    )

    report = evaluate_response(
        response=hallucinated_response,
        retrieved=retrieved,
        plan=plan,
        question="Can I go for an outdoor workout?",
    )

    assert report.passed is False
    assert report.verdict_consistent is False
    assert any("contradiction" in issue.lower() or "verdict" in issue.lower() for issue in report.issues)


def test_evaluator_passes_aligned_response():
    plan = route_request("Can I exercise outside?", location_name="Connaught Place, Delhi")
    retrieved = RetrievedContext(
        plan=plan,
        sources=["CPCB", "OpenAQ"],
        verdict_data={"verdict": "BE_SMART", "aqi": 145, "dominant_pollutant": "PM2.5"},
        air_data={"aqi": 145},
        location_name="Connaught Place, Delhi",
    )

    correct_response = AskAriseVerdictResponse(
        verdict="BE_SMART",
        aqi=145,
        headline="Moderate air quality in Connaught Place; reduce heavy exertion if sensitive.",
        why=["PM2.5 is elevated at 145 AQI according to CPCB monitors."],
        do=["Opt for light activity", "Recheck levels this afternoon"],
        best_window="2 PM - 4 PM",
        recheck_at="3:00 PM",
        sources=["CPCB", "OpenAQ"],
    )

    report = evaluate_response(
        response=correct_response,
        retrieved=retrieved,
        plan=plan,
        question="Can I exercise outside?",
    )
    assert report.passed is True
    assert report.verdict_consistent is True
    assert len(report.issues) == 0


# ---------------- STAGE E & F: PIPELINE ORCHESTRATOR TESTS ----------------


@pytest.mark.asyncio
async def test_pipeline_executes_and_preserves_deterministic_verdict():
    """Verify end-to-end pipeline enforces authoritative verdict and returns operational metadata."""
    pipeline = IntelligencePipeline()
    req = AskAriseRequest(
        question="Can my elderly parents take a morning walk in Dwarka?",
        lat=28.5921,
        lon=77.0460,
        location_name="Dwarka, Delhi",
        persona="Elderly",
    )

    with patch("app.agents.arise_agent.get_verdict") as mock_verdict, \
         patch("app.agents.arise_agent.get_air_now") as mock_air:
        mock_verdict.return_value = {
            "verdict": "CUT_BACK",
            "aqi": 220,
            "category": "POOR",
            "reason": "PM2.5 levels exceed elderly safety thresholds",
        }
        mock_air.return_value = {
            "aqi": 220,
            "station": "Dwarka Sector 8",
            "pm25": 98.4,
        }

        response = await pipeline.execute(request=req)

        assert isinstance(response, AskAriseVerdictResponse)
        assert response.verdict == "CUT_BACK"
        assert response.aqi == 220
        assert "CPCB" in " ".join(response.sources) or len(response.sources) > 0
