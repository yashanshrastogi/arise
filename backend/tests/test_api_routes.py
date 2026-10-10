import unittest
from fastapi.testclient import TestClient
from main import app


class TestApiRoutes(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        resp = self.client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["ok"])
        self.assertEqual(data["project"], "Arise")
        self.assertEqual(data["mode"], "local")

    def test_air_now_endpoint(self):
        resp = self.client.get("/air/now?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("aqi", data)
        self.assertIn("dominant_pollutant", data)
        self.assertIn("contributing_stations", data)

    def test_weather_now_endpoint(self):
        resp = self.client.get("/weather/now?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("temperature", data)
        self.assertIn("humidity", data)
        self.assertIn("wind_speed", data)

    def test_forecast_endpoint(self):
        resp = self.client.get("/forecast?lat=28.6139&lon=77.2090&aqi=312&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("hourly", data)
        self.assertIn("forecast7Day", data)
        self.assertIn("bestWindow", data)

    def test_fire_signals_endpoint(self):
        resp = self.client.get("/fire/signals?lat=28.6139&lon=77.2090&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("signals", data)
        self.assertIn("disclaimer", data)

    def test_environment_unified_endpoint(self):
        resp = self.client.get("/environment?lat=28.6139&lon=77.2090&persona=General+Public&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        # Verify complete React UI keys
        self.assertIn("IDW", data["location"])
        self.assertIn("aqi", data)
        self.assertIn("verdict", data)
        self.assertIn("recommendation", data)
        self.assertIn("why", data)
        self.assertIn("weather", data)
        self.assertIn("pollutants", data)
        self.assertIn("forecast", data)
        self.assertIn("forecast7Day", data)
        self.assertIn("stations", data)
        self.assertIn("fires", data)
        self.assertIn("school", data)
        self.assertIn("watchlist", data)

    def test_verdict_endpoint(self):
        resp = self.client.get("/verdict?lat=28.6139&lon=77.2090&persona=Child/Parent&demo=true")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn(data["verdict"], ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"])
        self.assertEqual(data["persona"], "Child/Parent")

    def test_compare_endpoint(self):
        body = {
            "places": [
                {"label": "Home", "latitude": 28.5921, "longitude": 77.0460},
                {"label": "Office", "latitude": 28.6289, "longitude": 77.2412}
            ],
            "demo": True
        }
        resp = self.client.post("/compare", json=body)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["results"]), 2)
        self.assertIn("cleanest_place", data)
        self.assertIn("recommendation", data)


if __name__ == "__main__":
    unittest.main()
