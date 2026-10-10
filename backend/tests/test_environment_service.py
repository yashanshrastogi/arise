import unittest
import asyncio
from app.services.environment import EnvironmentService
from app.services.compare_places import ComparePlacesService, PlaceTarget


class TestEnvironmentService(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def tearDown(self):
        self.loop.close()

    def test_full_environmental_pipeline(self):
        async def run_test():
            service = EnvironmentService()
            snap = await service.get_environmental_snapshot(
                lat=28.6289, lon=77.2412, force_demo=True # Target near ITO
            )
            self.assertIsNotNone(snap)
            self.assertIn("IDW", snap.location)
            self.assertGreater(snap.aqi, 200)
            self.assertEqual(snap.dominant_pollutant, "PM2.5")
            self.assertIsNotNone(snap.verdict)
            self.assertIn(snap.verdict, ("GO", "BE_SMART", "CUT_BACK", "STAY_IN"))
            self.assertGreaterEqual(len(snap.why_factors), 2)
            self.assertIsNotNone(snap.weather)
            self.assertGreaterEqual(len(snap.fire_signals), 1)

            # Test UI formatting
            ui_payload = service.format_ui_payload(snap, forecast_bundle={"hourly": [], "forecast7Day": []})
            self.assertIn("aqi", ui_payload)
            self.assertIn("verdict", ui_payload)
            self.assertIn("pollutants", ui_payload)
            self.assertIn("stations", ui_payload)
            self.assertIn("weather", ui_payload)
            self.assertIn("school", ui_payload)
            self.assertIn("watchlist", ui_payload)

        self.loop.run_until_complete(run_test())

    def test_compare_places_ranking(self):
        async def run_test():
            service = ComparePlacesService()
            places = [
                PlaceTarget(label="ITO Office", latitude=28.6289, longitude=77.2412),
                PlaceTarget(label="Dwarka Home", latitude=28.5921, longitude=77.0460),
            ]
            comp = await service.compare_locations(places, force_demo=True)
            self.assertEqual(len(comp.results), 2)
            self.assertEqual(comp.results[0].relative_ranking, 1)
            self.assertEqual(comp.results[1].relative_ranking, 2)
            # Cleanest place must have lower or equal AQI
            self.assertLessEqual(comp.results[0].aqi, comp.results[1].aqi)

        self.loop.run_until_complete(run_test())


if __name__ == "__main__":
    unittest.main()
