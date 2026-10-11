"""
Unit and Integration Tests for Strands Ask Arise Agent and /chat API.
Tests tool correctness, schema validation, non-causal fire language,
query answering, Bedrock success, Bedrock exceptions, Bedrock empty responses,
Bedrock timeouts, and unavailable environmental data handling.
"""

import unittest
import asyncio
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.tools import (
    get_air_now,
    get_forecast,
    get_fire_signal,
    get_indoor,
    get_verdict,
    compare_places,
)
from app.agents.arise_agent import AriseAgent
from app.core.config import Settings
from main import app


class TestStrandsAgent(unittest.TestCase):
    """Test Strands tools and agent reasoning."""

    def test_get_air_now_tool(self):
        result = get_air_now(lat=28.6139, lon=77.2090, demo=True)
        self.assertIn("aqi", result)
        self.assertIn("category", result)
        self.assertIn("dominant_pollutant", result)
        self.assertIn("pollutants", result)
        self.assertGreater(result["aqi"], 0)

    def test_get_forecast_tool(self):
        result = get_forecast(lat=28.6139, lon=77.2090, demo=True)
        self.assertIn("best_window", result)
        self.assertIn("recheck_at", result)
        self.assertIn("forecast_points", result)

    def test_get_fire_signal_tool_non_causal(self):
        result = get_fire_signal(lat=28.6139, lon=77.2090, demo=True)
        self.assertIn("signals_count", result)
        self.assertIn("disclaimer", result)
        # Terminology check: disclaimer must not assert direct causation
        self.assertIn("Thermal anomalies indicate satellite heat detections", result["disclaimer"])

    def test_get_indoor_tool(self):
        result = get_indoor(demo=True)
        self.assertTrue(result["is_simulated"])
        self.assertEqual(result["status"], "Good")

    def test_get_verdict_tool(self):
        result = get_verdict(lat=28.6139, lon=77.2090, persona="Child/Parent", demo=True)
        self.assertIn(result["verdict"], ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"])
        self.assertIn("recommendation", result)

    def test_compare_places_tool(self):
        places = [
            {"label": "Home", "latitude": 28.5245, "longitude": 77.2066},
            {"label": "Office", "latitude": 28.4986, "longitude": 77.0878},
        ]
        result = compare_places(places=places, demo=True)
        self.assertIn("comparison", result)
        self.assertEqual(len(result["comparison"]), 2)

    def test_arise_agent_kid_question(self):
        agent = AriseAgent()
        req = AskAriseRequest(
            question="Can my kid play outside today?",
            lat=28.6139,
            lon=77.2090,
            persona="Child/Parent",
            demo=True,
        )
        res = asyncio.run(agent.answer(req))
        self.assertIsInstance(res, AskAriseVerdictResponse)
        self.assertEqual(res.verdict, "STAY_IN")
        self.assertTrue(any("children" in w.lower() or "kid" in w.lower() for w in res.why + res.do + [res.headline]))
        self.assertIn("CPCB", res.sources[0])

    def test_arise_agent_school_question(self):
        agent = AriseAgent()
        req = AskAriseRequest(
            question="Should my school cancel outdoor sports?",
            lat=28.6139,
            lon=77.2090,
            persona="School Admin",
            demo=True,
        )
        res = asyncio.run(agent.answer(req))
        self.assertIsInstance(res, AskAriseVerdictResponse)
        self.assertEqual(res.verdict, "STAY_IN")
        self.assertTrue("sports" in res.headline.lower() or "school" in res.headline.lower())

    def test_arise_agent_why_question(self):
        agent = AriseAgent()
        req = AskAriseRequest(
            question="Why is the AQI bad today?",
            lat=28.6139,
            lon=77.2090,
            persona="General Public",
            demo=True,
        )
        res = asyncio.run(agent.answer(req))
        self.assertIsInstance(res, AskAriseVerdictResponse)
        self.assertTrue(len(res.why) >= 2)

    def test_arise_agent_best_time_question(self):
        agent = AriseAgent()
        req = AskAriseRequest(
            question="What is the best time to go outside?",
            lat=28.6139,
            lon=77.2090,
            persona="Athlete",
            demo=True,
        )
        res = asyncio.run(agent.answer(req))
        self.assertIsInstance(res, AskAriseVerdictResponse)
        self.assertIn("window", res.headline.lower())


class TestChatApiRoute(unittest.TestCase):
    """Test POST /chat API endpoint."""

    def setUp(self):
        self.client = TestClient(app)
        from app.cache.repository import get_cache_repository
        get_cache_repository().clear()

    def test_chat_endpoint_valid(self):
        payload = {
            "question": "Can I go out now?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "General Public",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("verdict", data)
        self.assertIn("headline", data)
        self.assertIn("why", data)
        self.assertIn("do", data)
        self.assertIn("best_window", data)
        self.assertIn("recheck_at", data)
        self.assertIn("sources", data)
        self.assertEqual(data.get("assistant_label"), "Arise Assistant (rule-based)")
        self.assertTrue(data.get("is_rule_based"))
        self.assertEqual(data.get("provider"), "rule-based")
        self.assertIn("Arise Assistant (rule-based)", data.get("sources", []))

    def test_chat_bedrock_success(self):
        """
        Verify that when Bedrock succeeds, its response is preserved,
        labeled as Bedrock AI with is_rule_based=False.
        """
        mock_bedrock_resp = AskAriseVerdictResponse(
            verdict="STAY_IN",
            headline="Severe particulate accumulation requires indoor stay today.",
            aqi=312,
            category="Very Poor",
            why=["Ground telemetry indicates elevated PM2.5 concentrations."],
            do=["Remain indoors and operate HEPA purifiers."],
            best_window="3 PM – 5 PM",
            recheck_at="4:00 PM",
            sources=["CPCB / OpenAQ Ground Stations"],
            provider="bedrock",
        )

        with patch("app.agents.arise_agent.get_settings") as mock_settings, \
             patch("app.agents.arise_agent.Agent.invoke_async", new_callable=AsyncMock) as mock_invoke:
            mock_settings.return_value = Settings(
                MODE="local",
                LLM_PROVIDER="bedrock",
            )
            mock_invoke.return_value = mock_bedrock_resp
            payload = {
                "question": "Can I go out now?",
                "lat": 28.6139,
                "lon": 77.2090,
                "persona": "General Public",
                "demo": True,
            }
            res = self.client.post("/chat", json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertIn("Amazon Bedrock", data.get("assistant_label", ""))
            self.assertFalse(data.get("is_rule_based"))
            self.assertEqual(data.get("provider"), "bedrock")
            self.assertEqual(data.get("headline"), "Severe particulate accumulation requires indoor stay today.")
            self.assertEqual(data.get("verdict"), "STAY_IN")

    def test_chat_bedrock_exception_fallback(self):
        """
        Verify that on any Bedrock exception, /chat automatically falls back to
        a rule-based answer labeled 'Arise Assistant (rule-based)', never returning 500.
        """
        payload = {
            "question": "Can my kid play outside today?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "Child/Parent",
            "demo": True,
        }
        with patch("app.agents.arise_agent.BedrockModel", side_effect=RuntimeError("Simulated Bedrock Throttling")):
            res = self.client.post("/chat", json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data.get("assistant_label"), "Arise Assistant (rule-based)")
            self.assertTrue(data.get("is_rule_based"))
            self.assertEqual(data.get("provider"), "rule-based")
            self.assertIn("verdict", data)
            self.assertIn("headline", data)
            self.assertIn("Arise Assistant (rule-based)", data.get("sources", []))

    def test_chat_bedrock_empty_response_fallback(self):
        """
        Verify that if Bedrock returns an empty or unusable response,
        it automatically falls back to a rule-based answer labeled 'Arise Assistant (rule-based)'.
        """
        unusable_resp = AskAriseVerdictResponse(
            verdict="STAY_IN",
            headline="   ",  # empty headline
            why=[],
            do=[],
            best_window="",
            recheck_at="",
        )

        with patch("app.agents.arise_agent.Agent.invoke_async", new_callable=AsyncMock) as mock_invoke:
            mock_invoke.return_value = unusable_resp
            payload = {
                "question": "Why is the AQI bad today?",
                "lat": 28.6139,
                "lon": 77.2090,
                "persona": "General Public",
                "demo": True,
            }
            res = self.client.post("/chat", json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data.get("assistant_label"), "Arise Assistant (rule-based)")
            self.assertTrue(data.get("is_rule_based"))
            self.assertTrue(len(data.get("headline", "").strip()) > 0)
            self.assertIn("Arise Assistant (rule-based)", data.get("sources", []))

    def test_chat_bedrock_timeout_fallback(self):
        """
        Verify that if Bedrock times out, /chat automatically falls back to
        a rule-based answer.
        """
        with patch("app.agents.arise_agent.Agent.invoke_async", side_effect=asyncio.TimeoutError()):
            payload = {
                "question": "What is the best time to go outside?",
                "lat": 28.6139,
                "lon": 77.2090,
                "persona": "General Public",
                "demo": True,
            }
            res = self.client.post("/chat", json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.json()
            self.assertEqual(data.get("assistant_label"), "Arise Assistant (rule-based)")
            self.assertTrue(data.get("is_rule_based"))
            self.assertIn("Arise Assistant (rule-based)", data.get("sources", []))

    def test_chat_environmental_data_unavailable(self):
        """
        Verify that if environmental telemetry is unavailable, the fallback response
        truthfully states data is unavailable, rather than inventing measurements,
        conditions, or forecasts.
        """
        with patch("app.agents.arise_agent.get_verdict", return_value={}), \
             patch("app.agents.arise_agent.get_air_now", return_value={}), \
             patch("app.agents.arise_agent.get_forecast", return_value={}), \
             patch("app.agents.arise_agent.get_fire_signal", return_value={}):

            payload = {
                "question": "Can I go out now?",
                "lat": 28.6139,
                "lon": 77.2090,
                "persona": "General Public",
                "demo": False,
            }
            res = self.client.post("/chat", json=payload)
            self.assertEqual(res.status_code, 200)
            data = res.json()

            # Must visibly identify as rule-based fallback
            self.assertEqual(data.get("assistant_label"), "Arise Assistant (rule-based)")
            self.assertTrue(data.get("is_rule_based"))

            # Must NOT invent AQI
            self.assertIsNone(data.get("aqi"))

            # Must state data is unavailable
            self.assertIn("unavailable", data.get("headline", "").lower())
            self.assertTrue(any("unreachable" in w.lower() or "unavailable" in w.lower() for w in data.get("why", [])))

            # Must not invent unmeasured sources
            self.assertEqual(data.get("sources"), ["Arise Assistant (rule-based)"])
            self.assertEqual(data.get("best_window"), "No recommended outdoor window")

    def test_chat_temperature_query(self):
        """Verify temperature queries return short, crisp ambient temperature & conditions."""
        payload = {
            "question": "What is the temperature right now?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "General Public",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("°C", data.get("headline", ""))
        self.assertIn("temperature", data.get("headline", "").lower())

    def test_chat_python_code_query(self):
        """Verify python coding queries return useful automation code instead of refusing."""
        payload = {
            "question": "Can you write a Python script to fetch air quality data?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "General Public",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("Python script", data.get("headline", ""))
        # Verify code is present in 'do' action recommendations
        self.assertTrue(any("import requests" in item or "requests.get" in item for item in data.get("do", [])))

    def test_chat_work_persona_query(self):
        """Verify queries regarding work/commute receive targeted occupational guidance."""
        payload = {
            "question": "Is it safe for my outdoor work shift and commute today?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "Work",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(any(term in data.get("headline", "").lower() for term in ("work", "commute", "transit", "shift")))

    def test_chat_future_forecast_query(self):
        """Verify queries asking about future days (e.g. after 2 days) return predicted temperature, not current."""
        payload = {
            "question": "what will be temp after 2 days",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "General Public",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        headline = data.get("headline", "").lower()
        self.assertIn("predicted temperature", headline)
        self.assertIn("after 2 days", headline)
        self.assertNotIn("current temperature is", headline)

    def test_chat_tomorrow_forecast_query(self):
        """Verify queries asking about tomorrow return predicted forecast."""
        payload = {
            "question": "what is the temperature tomorrow?",
            "lat": 28.6139,
            "lon": 77.2090,
            "persona": "General Public",
            "demo": True,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        headline = data.get("headline", "").lower()
        self.assertIn("predicted temperature tomorrow", headline)


if __name__ == "__main__":
    unittest.main()

