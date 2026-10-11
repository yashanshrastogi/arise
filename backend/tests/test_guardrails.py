import unittest
from app.agents.guardrails import is_environmental_query, get_out_of_scope_response


class TestGuardrails(unittest.TestCase):
    def test_out_of_scope_queries(self):
        off_topic_queries = [
            "what is car",
            "write python code for me",
            "who is the president",
            "tell me a recipe for pizza",
            "solve x^2 + 5x + 6 = 0",
            "how do airplanes fly",
            "write an essay on economics",
        ]
        for q in off_topic_queries:
            self.assertFalse(
                is_environmental_query(q),
                f"Query '{q}' should be classified as out-of-scope"
            )

    def test_in_scope_queries(self):
        in_scope_queries = [
            "Can I go out now?",
            "What is the temperature right now?",
            "Can my kid play outside?",
            "Why is the AQI bad today?",
            "Write a python script to fetch air data",
            "What mask should I wear?",
            "Is it safe to exercise?",
            "Should my school cancel outdoor sports?",
            "How do car emissions affect PM2.5 in Delhi?",
            "What are the current wind speeds?",
        ]
        for q in in_scope_queries:
            self.assertTrue(
                is_environmental_query(q),
                f"Query '{q}' should be classified as in-scope"
            )

    def test_guardrail_response_structure(self):
        resp = get_out_of_scope_response("what is car")
        self.assertEqual(resp.verdict, "BE_SMART")
        self.assertIn("air quality", resp.headline)
        self.assertGreater(len(resp.why), 0)
        self.assertGreater(len(resp.do), 0)
        self.assertTrue(resp.is_rule_based)


if __name__ == "__main__":
    unittest.main()
