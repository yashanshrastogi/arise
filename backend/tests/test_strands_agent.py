"""
Unit and Integration Tests for Strands Ask Arise Agent and /chat API.
Tests tool correctness, schema validation, non-causal fire language,
and query answering.
"""

import unittest
import asyncio
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
        self.assertIn("Arise Assistant (rule-based)", data.get("sources", []))

    def test_chat_bedrock_exception_fallback(self):
        """
        Verify that on any Bedrock exception, /chat automatically falls back to
        a rule-based answer labeled 'Arise Assistant (rule-based)', never returning 500.
        """
        from unittest.mock import patch
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
            self.assertIn("verdict", data)
            self.assertIn("headline", data)

    def test_chat_endpoint_empty_question(self):
        payload = {
            "question": "",
            "lat": 28.6139,
            "lon": 77.2090,
        }
        res = self.client.post("/chat", json=payload)
        self.assertEqual(res.status_code, 422)  # Validation error


if __name__ == "__main__":
    unittest.main()
