import unittest
import asyncio
from unittest.mock import AsyncMock, patch
from app.sources.demo import DemoAirProvider
from app.sources.openaq import OpenAQProvider
from app.services.air_quality import AirQualityService


class TestAirSources(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def tearDown(self):
        self.loop.close()

    def test_demo_provider_returns_stations(self):
        async def run_test():
            provider = DemoAirProvider()
            stations = await provider.get_nearby_stations(28.6139, 77.2090)
            self.assertGreaterEqual(len(stations), 5)
            
            # Check station details
            ito = next((s for s in stations if s.name == "ITO"), None)
            self.assertIsNotNone(ito)
            self.assertEqual(ito.source, "DEMO")
            self.assertIn("PM2.5", ito.pollutants)
            self.assertIn("PM10", ito.pollutants)
            self.assertEqual(ito.pollutants["PM2.5"].value, 142.5)

        self.loop.run_until_complete(run_test())

    def test_openaq_handles_unauthenticated_or_error(self):
        async def run_test():
            provider = OpenAQProvider(api_key=None, timeout=2.0)
            # Should not raise exception, but return empty list
            stations = await provider.get_nearby_stations(28.6139, 77.2090)
            self.assertIsInstance(stations, list)

        self.loop.run_until_complete(run_test())

    def test_service_fallback_to_demo(self):
        async def run_test():
            # Mock failing primary provider
            failing_primary = OpenAQProvider(api_key=None)
            failing_primary.get_nearby_stations = AsyncMock(return_value=[])

            service = AirQualityService(primary_provider=failing_primary)
            stations = await service.get_stations(28.6139, 77.2090)
            
            # Must fall back to demo stations rather than returning empty
            self.assertGreaterEqual(len(stations), 5)
            self.assertEqual(stations[0].source, "DEMO")

        self.loop.run_until_complete(run_test())

    def test_service_force_demo(self):
        async def run_test():
            service = AirQualityService()
            stations = await service.get_stations(28.6139, 77.2090, force_demo=True)
            self.assertGreaterEqual(len(stations), 5)
            self.assertEqual(stations[0].source, "DEMO")

        self.loop.run_until_complete(run_test())


if __name__ == "__main__":
    unittest.main()
