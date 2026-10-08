import unittest
import asyncio
from app.sources.weather import degrees_to_cardinal, wmo_code_to_condition, OpenMeteoWeatherProvider
from app.services.forecast import compute_best_outdoor_window, ForecastService
from app.domain.models import ForecastPoint


class TestWeatherForecast(unittest.TestCase):
    def setUp(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)

    def tearDown(self):
        self.loop.close()

    def test_degrees_to_cardinal(self):
        self.assertEqual(degrees_to_cardinal(0), "N")
        self.assertEqual(degrees_to_cardinal(90), "E")
        self.assertEqual(degrees_to_cardinal(180), "S")
        self.assertEqual(degrees_to_cardinal(270), "W")
        self.assertEqual(degrees_to_cardinal(315), "NW")

    def test_wmo_weather_code_mapping(self):
        desc, icon = wmo_code_to_condition(0)
        self.assertEqual(desc, "Clear Sky")
        desc, icon = wmo_code_to_condition(95)
        self.assertEqual(desc, "Thunderstorm")

    def test_weather_provider_demo_fallback(self):
        async def run_test():
            provider = OpenMeteoWeatherProvider()
            snap = await provider.get_current_weather(28.6139, 77.2090, force_demo=True)
            self.assertEqual(snap.temperature, 28.0)
            self.assertEqual(snap.wind_direction, "NW")
            self.assertFalse(snap.is_stale)

        self.loop.run_until_complete(run_test())

    def test_best_window_calculation(self):
        points = [
            ForecastPoint(timestamp="t1", time_label="12 PM", aqi=320, temperature=30, rain_probability=10, wind_speed=3, past=False),
            ForecastPoint(timestamp="t2", time_label="1 PM", aqi=300, temperature=31, rain_probability=10, wind_speed=4, past=False),
            ForecastPoint(timestamp="t3", time_label="2 PM", aqi=270, temperature=30, rain_probability=10, wind_speed=4, past=False),
            ForecastPoint(timestamp="t4", time_label="3 PM", aqi=240, temperature=29, rain_probability=10, wind_speed=5, past=False), # Window start
            ForecastPoint(timestamp="t5", time_label="4 PM", aqi=235, temperature=28, rain_probability=10, wind_speed=5, past=False),
            ForecastPoint(timestamp="t6", time_label="5 PM", aqi=245, temperature=27, rain_probability=10, wind_speed=4, past=False), # Window end
            ForecastPoint(timestamp="t7", time_label="6 PM", aqi=280, temperature=26, rain_probability=10, wind_speed=3, past=False),
        ]
        window_str, updated = compute_best_outdoor_window(points)
        self.assertIn("3 PM", window_str)
        self.assertIn("5 PM", window_str)
        
        # Points in window must have best_window=True
        best_pts = [p for p in updated if p.best_window]
        self.assertEqual(len(best_pts), 3)

    def test_hazardous_air_no_window(self):
        points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=450, temperature=30, rain_probability=10, wind_speed=2, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=430, temperature=30, rain_probability=10, wind_speed=2, past=False),
            ForecastPoint(timestamp="t3", time_label="3 PM", aqi=420, temperature=29, rain_probability=10, wind_speed=2, past=False),
        ]
        window_str, _ = compute_best_outdoor_window(points)
        self.assertEqual(window_str, "No recommended outdoor window")


if __name__ == "__main__":
    unittest.main()
