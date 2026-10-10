"""
Unit tests for Task F1 requirements:
1. Chat speed & LLM_PROVIDER ('rule-based' instant bypass, 5s timeout, 10m circuit breaker, 30m answer cache).
2. /health reporting active LLM_PROVIDER.
3. FIRMS satellite signals handling in both unconfigured (DEMO) and live states.
"""

import unittest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.arise_agent import AriseAgent, _generate_grounded_fallback_response
from app.domain.models import FireSignal, EnvironmentalSnapshot
from app.domain.verdict import evaluate_environment
from app.cache.repository import get_cache_repository
from main import app


class TestF1ChatSpeedAndProvider(unittest.IsolatedAsyncioTestCase):
    """Test LLM_PROVIDER modes, timeout, circuit breaker, and answer caching."""

    def setUp(self):
        self.cache = get_cache_repository()
        self.cache.clear()
        self.client = TestClient(app)

    def tearDown(self):
        self.cache.clear()

    async def test_rule_based_mode_does_not_call_bedrock(self):
        """When LLM_PROVIDER is 'rule-based', Bedrock is never called and answer is instant."""
        agent = AriseAgent()
        agent.settings.LLM_PROVIDER = "rule-based"

        with patch("app.agents.arise_agent.BedrockModel") as mock_bedrock, \
             patch("app.agents.arise_agent.Agent") as mock_agent_cls:
            req = AskAriseRequest(
                question="Is it safe to run in Delhi right now?",
                lat=28.6139,
                lon=77.2090,
                persona="Runner/Athlete",
                demo=True,
            )
            resp = await agent.answer(req)

            # Bedrock must NEVER be invoked
            mock_bedrock.assert_not_called()
            mock_agent_cls.assert_not_called()

            self.assertEqual(resp.provider, "rule-based")
            self.assertEqual(resp.assistant_label, "Arise Assistant (rule-based)")
            self.assertTrue(resp.is_rule_based)
            self.assertIn(resp.verdict, ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"])

    async def test_chat_answers_cached_for_30_minutes(self):
        """Repeated questions within 30 minutes return cached answer directly."""
        agent = AriseAgent()
        agent.settings.LLM_PROVIDER = "rule-based"

        req = AskAriseRequest(
            question="What is the air quality near India Gate?",
            lat=28.6129,
            lon=77.2295,
            persona="General Public",
            demo=True,
        )

        resp1 = await agent.answer(req)
        self.assertEqual(resp1.provider, "rule-based")

        # Second call should serve from cache
        with patch("app.agents.arise_agent._generate_grounded_fallback_response") as mock_fallback:
            resp2 = await agent.answer(req)
            mock_fallback.assert_not_called()
            self.assertEqual(resp2.headline, resp1.headline)
            self.assertEqual(resp2.verdict, resp1.verdict)

    async def test_bedrock_circuit_breaker_trips_for_10_minutes(self):
        """When Bedrock fails, a 10-minute circuit breaker trips so subsequent calls bypass Bedrock."""
        agent = AriseAgent()
        agent.settings.LLM_PROVIDER = "bedrock"

        with patch("app.agents.arise_agent.BedrockModel"), \
             patch("app.agents.arise_agent.Agent") as mock_agent_cls:
            mock_agent_instance = MagicMock()
            mock_agent_instance.invoke_async = AsyncMock(side_effect=Exception("Bedrock Error 002"))
            mock_agent_cls.return_value = mock_agent_instance

            req = AskAriseRequest(
                question="Can I exercise outside?",
                lat=28.6500,
                lon=77.2300,
                persona="General Public",
                demo=True,
            )

            # First call attempts Bedrock and trips breaker
            resp1 = await agent.answer(req)
            self.assertEqual(resp1.provider, "rule-based")
            self.assertEqual(mock_agent_instance.invoke_async.call_count, 1)

            # Verify breaker is cached
            breaker_entry = self.cache.get("bedrock_circuit_breaker:failure")
            self.assertIsNotNone(breaker_entry)

            # Second call (with different question to bypass answer cache)
            req2 = AskAriseRequest(
                question="Should schools stay open?",
                lat=28.6500,
                lon=77.2300,
                persona="General Public",
                demo=True,
            )
            resp2 = await agent.answer(req2)
            self.assertEqual(resp2.provider, "rule-based")
            # invoke_async call count should STILL be 1 (never called second time)
            self.assertEqual(mock_agent_instance.invoke_async.call_count, 1)

    def test_health_reports_active_provider(self):
        """GET /health reports the real active provider ('rule-based' or 'bedrock')."""
        with patch("app.api.routes.health.get_settings") as mock_settings:
            mock_settings.return_value = Settings(
                MODE="local",
                LLM_PROVIDER="rule-based",
            )
            res = self.client.get("/health")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json().get("llm_provider"), "rule-based")

        with patch("app.api.routes.health.get_settings") as mock_settings:
            mock_settings.return_value = Settings(
                MODE="local",
                LLM_PROVIDER="bedrock",
            )
            res = self.client.get("/health")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json().get("llm_provider"), "bedrock")


class TestF1FirmsBothStates(unittest.TestCase):
    """Test FIRMS satellite signals in unconfigured (DEMO) and live states."""

    def test_firms_unconfigured_labels_demo(self):
        """When FIRMS_MAP_KEY is unconfigured, fires are marked DEMO and NASA FIRMS is not live."""
        demo_fire = FireSignal(
            latitude=29.52,
            longitude=76.82,
            acquisition_time="2026-10-10T12:00:00Z",
            confidence="nominal",
            satellite="VIIRS",
            distance_km=115.0,
            direction="NW",
            source="DEMO",
            is_signal=True,
            display_text="Simulated demo fire hotspot (Demo mode)."
        )

        snapshot = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-10T12:00:00Z",
            aqi=310,
            aqi_category="Very Poor",
            dominant_pollutant="PM2.5",
            pollutants={},
            contributing_stations=[],
            weather=None,
            fire_signals=[demo_fire],
            best_window="3 PM – 5 PM",
            recheck_at="4:00 PM",
            is_demo=True,
            is_stale=False,
            data_quality="reliable"
        )

        # Verdict output test
        verdict_res = evaluate_environment(snapshot)
        source_names = [s["name"] for s in verdict_res.sources]
        self.assertIn("Simulated Fires (Demo Mode)", source_names)
        self.assertNotIn("NASA FIRMS (VIIRS Near-Real-Time - fire signal, not proof of cause)", source_names)
        self.assertNotIn("NASA FIRMS (VIIRS Near-Real-Time)", source_names)

        # Agent fallback test
        fire_tool_data = {
            "signals_count": 1,
            "is_live": False,
            "is_demo": True,
            "source": "DEMO",
        }
        agent_resp = _generate_grounded_fallback_response(
            question="Are there fires burning upwind?",
            verdict_data={"aqi": 310, "category": "Very Poor", "verdict": "STAY_IN"},
            air_data={"aqi": 310, "category": "Very Poor", "dominant_pollutant": "PM2.5"},
            fc_data={},
            fire_data=fire_tool_data,
        )
        self.assertIn("Simulated Fires (Demo Mode)", agent_resp.sources)
        self.assertNotIn("NASA FIRMS (VIIRS Thermal Detection - fire signal, not proof of cause)", agent_resp.sources)
        self.assertTrue(any("simulated" in w.lower() for w in agent_resp.why))

    def test_firms_live_labels_fire_signal_not_proof_of_cause(self):
        """When FIRMS is live, sources list NASA FIRMS and display_text contains 'fire signal, not proof of cause'."""
        live_fire = FireSignal(
            latitude=29.80,
            longitude=76.50,
            acquisition_time="2026-10-10T12:00:00Z",
            confidence="high",
            satellite="VIIRS",
            distance_km=130.0,
            direction="NW",
            source="NASA-FIRMS",
            is_signal=True,
            display_text="Satellite fire signal detected in monitored upwind region (fire signal, not proof of cause)."
        )
        self.assertIn("fire signal, not proof of cause", live_fire.display_text)

        snapshot = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-10T12:00:00Z",
            aqi=310,
            aqi_category="Very Poor",
            dominant_pollutant="PM2.5",
            pollutants={},
            contributing_stations=[],
            weather=None,
            fire_signals=[live_fire],
            best_window="3 PM – 5 PM",
            recheck_at="4:00 PM",
            is_demo=False,
            is_stale=False,
            data_quality="reliable"
        )

        # Verdict output test
        verdict_res = evaluate_environment(snapshot)
        source_names = [s["name"] for s in verdict_res.sources]
        self.assertIn("NASA FIRMS (VIIRS Near-Real-Time - fire signal, not proof of cause)", source_names)
        self.assertNotIn("Simulated Fires (Demo Mode)", source_names)

        # Agent fallback test
        fire_tool_data = {
            "signals_count": 1,
            "is_live": True,
            "is_demo": False,
            "source": "NASA-FIRMS",
        }
        agent_resp = _generate_grounded_fallback_response(
            question="Are there fires burning upwind?",
            verdict_data={"aqi": 310, "category": "Very Poor", "verdict": "STAY_IN"},
            air_data={"aqi": 310, "category": "Very Poor", "dominant_pollutant": "PM2.5"},
            fc_data={},
            fire_data=fire_tool_data,
        )
        self.assertIn("NASA FIRMS (VIIRS Thermal Detection - fire signal, not proof of cause)", agent_resp.sources)
        self.assertNotIn("Simulated Fires (Demo Mode)", agent_resp.sources)
        self.assertTrue(any("fire signal, not proof of cause" in w for w in agent_resp.why))


if __name__ == "__main__":
    unittest.main()
