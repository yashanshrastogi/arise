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

    def test_7day_outlook_current_aqi_variations(self):
        """
        Verify that 7-day outlook represents unavailable AQI as None, preserves
        valid AQI=0 without treating it as missing, and projects positive AQI.
        """
        from unittest.mock import patch
        provider = OpenMeteoWeatherProvider()

        # Mock Open-Meteo daily response
        mock_daily_response = {
            "daily": {
                "time": ["2026-10-19", "2026-10-20", "2026-10-21"],
                "temperature_2m_max": [28.0, 29.0, 27.5],
                "temperature_2m_min": [18.0, 19.0, 17.0],
                "precipitation_probability_max": [10, 20, 5],
                "wind_speed_10m_max": [4.0, 12.0, 3.0],
                "weather_code": [0, 1, 2]
            }
        }

        async def run_test():
            with patch("httpx.AsyncClient.get") as mock_get:
                mock_resp = unittest.mock.MagicMock()
                mock_resp.status_code = 200
                mock_resp.json.return_value = mock_daily_response
                mock_get.return_value = mock_resp

                # 1. current_aqi = None (Air quality telemetry unavailable)
                outlook_none = await provider.get_7day_outlook(28.6139, 77.2090, current_aqi=None, force_demo=False)
                self.assertEqual(len(outlook_none), 3)
                for day in outlook_none:
                    self.assertIsNone(day["aqi"], "AQI must be None when current_aqi is None")
                    self.assertEqual(day["status"], "Unavailable")
                    self.assertIsNotNone(day["temp"])
                    self.assertIsNotNone(day["condition"])

                # 2. current_aqi = 0 (Zero must NOT be treated as missing)
                outlook_zero = await provider.get_7day_outlook(28.6139, 77.2090, current_aqi=0, force_demo=False)
                self.assertEqual(len(outlook_zero), 3)
                self.assertEqual(outlook_zero[0]["aqi"], 0, "Zero AQI must be preserved exactly on day 0")
                self.assertEqual(outlook_zero[0]["status"], "Good")
                for day in outlook_zero:
                    self.assertIsNotNone(day["aqi"], "AQI=0 must not be converted to None")
                    self.assertGreaterEqual(day["aqi"], 0)

                # 3. current_aqi = 150 (Valid positive AQI)
                outlook_pos = await provider.get_7day_outlook(28.6139, 77.2090, current_aqi=150, force_demo=False)
                self.assertEqual(len(outlook_pos), 3)
                self.assertEqual(outlook_pos[0]["aqi"], 150)
                self.assertEqual(outlook_pos[0]["status"], "Moderate")

        self.loop.run_until_complete(run_test())

    def test_regression_outdoor_window_missing_and_zero_aqi(self):
        """
        Verify that compute_best_outdoor_window:
        1. Returns 'No recommended outdoor window' and sets best_window=False when AQI is None.
        2. Preserves valid AQI=0 and does not treat 0 as 250 via truthiness check.
        """
        # 1. Missing AQI
        missing_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=None, temperature=20, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=None, temperature=21, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t3", time_label="3 PM", aqi=None, temperature=22, rain_probability=0, wind_speed=3, past=False),
        ]
        w_str, updated = compute_best_outdoor_window(missing_points)
        self.assertEqual(w_str, "No recommended outdoor window")
        self.assertTrue(all(not p.best_window for p in updated))

        # 2. AQI = 0 (pristine air) vs AQI = 50
        zero_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=50, temperature=20, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=0, temperature=21, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t3", time_label="3 PM", aqi=0, temperature=22, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t4", time_label="4 PM", aqi=0, temperature=22, rain_probability=0, wind_speed=3, past=False),
            ForecastPoint(timestamp="t5", time_label="5 PM", aqi=50, temperature=20, rain_probability=0, wind_speed=3, past=False),
        ]
        w_str, updated = compute_best_outdoor_window(zero_points)
        # Window should pick 2 PM - 4 PM because AQI is 0, not 250!
        self.assertIn("2 PM", w_str)
        self.assertIn("4 PM", w_str)

    def test_regression_weather_success_with_air_quality_failure(self):
        """
        Verify that upstream weather success paired with upstream air quality failure
        preserves meteorological forecast data while setting aqi=None and accurate provenance.
        """
        from unittest.mock import patch
        provider = OpenMeteoWeatherProvider()
        mock_weather_hourly = {
            "timezone": "Europe/London",
            "hourly": {
                "time": ["2026-10-19T12:00", "2026-10-19T13:00"],
                "temperature_2m": [18.5, 19.0],
                "precipitation_probability": [5, 10],
                "wind_speed_10m": [8.0, 9.0],
                "cloud_cover": [20, 25]
            }
        }

        async def run_test():
            with patch("httpx.AsyncClient.get") as mock_get:
                def side_effect(url, **kwargs):
                    resp = unittest.mock.MagicMock()
                    if "air-quality" in str(url):
                        resp.status_code = 503
                        resp.text = "Service Unavailable"
                    else:
                        resp.status_code = 200
                        resp.json.return_value = mock_weather_hourly
                    return resp

                mock_get.side_effect = side_effect
                provider.cache.clear()
                points = await provider.get_hourly_forecast(51.5074, -0.1278, force_demo=False)
                self.assertGreater(len(points), 0)
                for pt in points:
                    self.assertIsNone(pt.aqi, "AQI must be None when air quality upstream fails")
                    self.assertIsNotNone(pt.temperature)
                    self.assertIn("Air Quality Unavailable", pt.source)

        self.loop.run_until_complete(run_test())

    def test_regression_forecast_provenance_and_null_current_aqi(self):
        """
        Verify forecast provenance labels and null current_aqi behavior:
        1. When current_aqi is None and model AQI is present: labeled 'Open-Meteo Air Quality Model'.
        2. When current_aqi is provided: labeled 'Calibrated Projection' / 'Ground-Calibrated Dispersion'.
        3. When current_aqi is 0: preserves 0 without clamping to 20 or 50.
        4. When current_aqi is None and air quality fails: labeled 'Open-Meteo NWP (Air Quality Unavailable)'.
        """
        from unittest.mock import patch
        mock_weather = {
            "timezone": "UTC",
            "hourly": {
                "time": ["2026-10-19T12:00", "2026-10-19T13:00", "2026-10-19T14:00"],
                "temperature_2m": [22.0, 23.0, 24.0],
                "precipitation_probability": [0, 0, 0],
                "wind_speed_10m": [5.0, 5.0, 5.0],
                "cloud_cover": [10, 10, 10]
            }
        }
        mock_daily = {
            "daily": {
                "time": ["2026-10-19", "2026-10-20"],
                "temperature_2m_max": [24.0, 25.0],
                "temperature_2m_min": [15.0, 16.0],
                "precipitation_probability_max": [0, 0],
                "wind_speed_10m_max": [6.0, 6.0],
                "weather_code": [0, 0]
            }
        }

        async def run_test():
            service = ForecastService()

            # Case A: current_aqi is None, model has AQI=35
            with patch("httpx.AsyncClient.get") as mock_get:
                def side_effect(url, **kwargs):
                    resp = unittest.mock.MagicMock()
                    resp.status_code = 200
                    if "air-quality" in str(url):
                        resp.json.return_value = {
                            "hourly": {
                                "us_aqi": [35, 30, 25],
                                "pm2_5": [8.5, 7.2, 6.0]
                            }
                        }
                    elif "daily" in str(kwargs.get("params", {})):
                        resp.json.return_value = mock_daily
                    else:
                        resp.json.return_value = mock_weather
                    return resp

                mock_get.side_effect = side_effect
                service.weather_provider.cache.clear()
                bundle_none = await service.get_forecast(51.5074, -0.1278, current_aqi=None, force_demo=False)
                self.assertEqual(bundle_none["source"], "Open-Meteo NWP & CAMS Air Quality Model")
                self.assertEqual(bundle_none["hourly"][0]["aqi"], 35)
                self.assertEqual(bundle_none["hourly"][0]["source"], "Open-Meteo Air Quality Model")
                # 7-day outlook must have aqi=None because current_aqi is None
                for d in bundle_none["forecast7Day"]:
                    self.assertIsNone(d["aqi"])
                    self.assertEqual(d["status"], "Unavailable")

            # Case B: current_aqi = 0 (clean air ground truth)
            with patch("httpx.AsyncClient.get") as mock_get:
                mock_get.side_effect = side_effect
                service.weather_provider.cache.clear()
                bundle_zero = await service.get_forecast(51.5074, -0.1278, current_aqi=0, force_demo=False)
                self.assertEqual(bundle_zero["source"], "Open-Meteo NWP & Ground-Calibrated Dispersion")
                self.assertEqual(bundle_zero["hourly"][0]["aqi"], 0, "Current hour AQI must be 0")
                self.assertEqual(bundle_zero["hourly"][0]["source"], "Calibrated Projection")
                self.assertEqual(bundle_zero["forecast7Day"][0]["aqi"], 0, "7-day outlook day 0 must be 0")
                self.assertEqual(bundle_zero["forecast7Day"][0]["status"], "Good")

            # Case C: current_aqi is None and air quality fails completely
            with patch("httpx.AsyncClient.get") as mock_get:
                def side_effect_aq_fail(url, **kwargs):
                    resp = unittest.mock.MagicMock()
                    if "air-quality" in str(url):
                        resp.status_code = 500
                    elif "daily" in str(kwargs.get("params", {})):
                        resp.status_code = 200
                        resp.json.return_value = mock_daily
                    else:
                        resp.status_code = 200
                        resp.json.return_value = mock_weather
                    return resp

                mock_get.side_effect = side_effect_aq_fail
                service.weather_provider.cache.clear()
                bundle_aq_fail = await service.get_forecast(51.5074, -0.1278, current_aqi=None, force_demo=False)
                self.assertEqual(bundle_aq_fail["source"], "Open-Meteo NWP (Air Quality Unavailable)")
                self.assertEqual(bundle_aq_fail["bestWindow"], "No recommended outdoor window")
                for h in bundle_aq_fail["hourly"]:
                    self.assertIsNone(h["aqi"])
                    self.assertEqual(h["source"], "Unavailable")
                    self.assertFalse(h["bestWindow"])
                    self.assertIsNotNone(h["temp"])

            # Case D: Full upstream outage with force_demo=False
            with patch("httpx.AsyncClient.get") as mock_get:
                mock_resp = unittest.mock.MagicMock()
                mock_resp.status_code = 500
                mock_get.return_value = mock_resp
                service.weather_provider.cache.clear()
                bundle_outage = await service.get_forecast(51.5074, -0.1278, current_aqi=None, force_demo=False)
                self.assertEqual(bundle_outage["hourly"], [])
                self.assertEqual(bundle_outage["forecast7Day"], [])
                self.assertEqual(bundle_outage["bestWindow"], "No recommended outdoor window")
                self.assertEqual(bundle_outage["source"], "Unavailable")

        self.loop.run_until_complete(run_test())

    def test_regression_forecast_route_defaults_to_none_and_never_injects_100(self):
        """
        Verify that FastAPI route /forecast defaults current_aqi to None, not 100,
        ensuring London does not receive fabricated 100-baseline 7-day projections.
        """
        from fastapi.testclient import TestClient
        from unittest.mock import patch
        from main import app

        client = TestClient(app)
        mock_weather = {
            "timezone": "Europe/London",
            "hourly": {
                "time": ["2026-10-19T12:00", "2026-10-19T13:00"],
                "temperature_2m": [15.0, 16.0],
                "precipitation_probability": [0, 0],
                "wind_speed_10m": [12.0, 12.0],
                "cloud_cover": [50, 50]
            }
        }
        mock_daily = {
            "daily": {
                "time": ["2026-10-19", "2026-10-20"],
                "temperature_2m_max": [16.0, 17.0],
                "temperature_2m_min": [10.0, 11.0],
                "precipitation_probability_max": [0, 0],
                "wind_speed_10m_max": [12.0, 14.0],
                "weather_code": [1, 2]
            }
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            def side_effect(url, **kwargs):
                resp = unittest.mock.MagicMock()
                resp.status_code = 200
                if "air-quality" in str(url):
                    resp.json.return_value = {
                        "hourly": {
                            "us_aqi": [20, 22],
                            "pm2_5": [5.0, 5.5]
                        }
                    }
                elif "daily" in str(kwargs.get("params", {})):
                    resp.json.return_value = mock_daily
                else:
                    resp.json.return_value = mock_weather
                return resp

            mock_get.side_effect = side_effect
            res = client.get("/forecast?lat=51.5074&lon=-0.1278")
            self.assertEqual(res.status_code, 200)
            data = res.json()

            # Must NOT use Heuristic Dispersion Projection from 100
            self.assertEqual(data["source"], "Open-Meteo NWP & CAMS Air Quality Model")
            # 7-day outlook must NOT have projected AQI descending from 100 to 0
            for day in data["forecast7Day"]:
                self.assertIsNone(day["aqi"], "7-day AQI must be None when no ground-truth AQI is provided")
                self.assertEqual(day["status"], "Unavailable")
                self.assertIsNotNone(day["temp"])

    def test_outdoor_window_rain_prob_high_with_low_precipitation(self):
        """
        Verify that high rain probability (e.g. 80%) with negligible precipitation (0.05 mm)
        is not inferred as a heavy downpour and remains eligible for outdoor recommendation.
        """
        from app.services.forecast import evaluate_outdoor_window

        points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=40, temperature=18, rain_probability=80, precipitation=0.05, wind_speed=10, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=42, temperature=18, rain_probability=80, precipitation=0.05, wind_speed=10, past=False),
            ForecastPoint(timestamp="t3", time_label="3 PM", aqi=45, temperature=17, rain_probability=75, precipitation=0.05, wind_speed=9, past=False),
        ]
        result, updated = evaluate_outdoor_window(points, is_calibrated=False)
        self.assertNotEqual(result.window_str, "No recommended outdoor window")
        self.assertEqual(result.status, "model_projected")
        self.assertTrue(any(p.best_window for p in updated))

    def test_outdoor_window_disqualified_by_high_precipitation(self):
        """
        Verify that continuous heavy precipitation (>= 1.0 mm) disqualifies a window regardless of low AQI.
        """
        from app.services.forecast import evaluate_outdoor_window

        points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=25, temperature=15, rain_probability=95, precipitation=2.5, wind_speed=8, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=25, temperature=15, rain_probability=95, precipitation=3.0, wind_speed=8, past=False),
        ]
        result, updated = evaluate_outdoor_window(points, is_calibrated=False)
        self.assertEqual(result.window_str, "No recommended outdoor window")
        self.assertEqual(result.status, "unsuitable")
        self.assertTrue(all(not p.best_window for p in updated))

    def test_outdoor_window_disqualified_by_high_wind_and_gusts(self):
        """
        Verify that sustained wind > 30 km/h or gusts > 45 km/h disqualify a window.
        """
        from app.services.forecast import evaluate_outdoor_window

        # 1. High sustained wind
        gale_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=30, temperature=20, rain_probability=0, wind_speed=36, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=30, temperature=20, rain_probability=0, wind_speed=34, past=False),
        ]
        res_wind, _ = evaluate_outdoor_window(gale_points)
        self.assertEqual(res_wind.status, "unsuitable")

        # 2. Dangerous gusts
        gust_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=30, temperature=20, rain_probability=0, wind_speed=20, wind_gusts=50, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=30, temperature=20, rain_probability=0, wind_speed=20, wind_gusts=48, past=False),
        ]
        res_gust, _ = evaluate_outdoor_window(gust_points)
        self.assertEqual(res_gust.status, "unsuitable")

    def test_outdoor_window_low_wind_not_penalized(self):
        """
        Verify that calm wind (e.g. 2 km/h) is not interpreted as proof of poor outdoor conditions.
        """
        from app.services.forecast import evaluate_outdoor_window

        calm_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=35, temperature=22, rain_probability=0, wind_speed=1.5, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=35, temperature=22, rain_probability=0, wind_speed=2.0, past=False),
        ]
        result, updated = evaluate_outdoor_window(calm_points, is_calibrated=True)
        self.assertEqual(result.status, "ground_calibrated")
        self.assertEqual(result.confidence, "high")
        self.assertIn("1 PM", result.window_str)

    def test_outdoor_window_severe_aqi_disqualified(self):
        """
        Verify that AQI > 300 is never recommended for an outdoor window even on clear calm days.
        """
        from app.services.forecast import evaluate_outdoor_window

        smog_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=350, temperature=22, rain_probability=0, wind_speed=8, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=340, temperature=22, rain_probability=0, wind_speed=8, past=False),
        ]
        result, updated = evaluate_outdoor_window(smog_points, is_calibrated=True)
        self.assertEqual(result.status, "unsuitable")
        self.assertEqual(result.window_str, "No recommended outdoor window")

    def test_outdoor_window_aqi_zero_valid(self):
        """
        Verify that genuine AQI=0 is treated as a valid numeric clean-air score,
        not as missing data or division-by-zero.
        """
        from app.services.forecast import evaluate_outdoor_window

        clean_points = [
            ForecastPoint(timestamp="t1", time_label="1 PM", aqi=0, temperature=20, rain_probability=0, wind_speed=10, past=False),
            ForecastPoint(timestamp="t2", time_label="2 PM", aqi=0, temperature=20, rain_probability=0, wind_speed=10, past=False),
        ]
        result, updated = evaluate_outdoor_window(clean_points, is_calibrated=True)
        self.assertEqual(result.status, "ground_calibrated")
        self.assertEqual(result.avg_aqi, 0)
        self.assertIn("1 PM", result.window_str)

    def test_outdoor_window_overnight_hours_disqualified(self):
        """
        Verify that overnight hours (< 6 AM or > 10 PM) are strictly disqualified
        even if they have lower AQI than daytime waking hours.
        """
        from app.services.forecast import evaluate_outdoor_window

        points = [
            ForecastPoint(timestamp="2026-10-22T00:00:00", time_label="12 AM", aqi=120, temperature=20, rain_probability=0, wind_speed=5, past=False),
            ForecastPoint(timestamp="2026-10-22T01:00:00", time_label="1 AM", aqi=110, temperature=19, rain_probability=0, wind_speed=5, past=False),
            ForecastPoint(timestamp="2026-10-22T02:00:00", time_label="2 AM", aqi=105, temperature=19, rain_probability=0, wind_speed=5, past=False),
            ForecastPoint(timestamp="2026-10-22T03:00:00", time_label="3 AM", aqi=110, temperature=18, rain_probability=0, wind_speed=5, past=False),
            ForecastPoint(timestamp="2026-10-22T04:00:00", time_label="4 AM", aqi=115, temperature=18, rain_probability=0, wind_speed=5, past=False),
            ForecastPoint(timestamp="2026-10-22T05:00:00", time_label="5 AM", aqi=120, temperature=18, rain_probability=0, wind_speed=5, past=False),
            # Daytime waking hours:
            ForecastPoint(timestamp="2026-10-22T06:00:00", time_label="6 AM", aqi=150, temperature=21, rain_probability=0, wind_speed=6, past=False),
            ForecastPoint(timestamp="2026-10-22T07:00:00", time_label="7 AM", aqi=145, temperature=22, rain_probability=0, wind_speed=6, past=False),
            ForecastPoint(timestamp="2026-10-22T08:00:00", time_label="8 AM", aqi=140, temperature=24, rain_probability=0, wind_speed=6, past=False),
            ForecastPoint(timestamp="2026-10-22T09:00:00", time_label="9 AM", aqi=190, temperature=26, rain_probability=0, wind_speed=7, past=False),
        ]

        result, updated = evaluate_outdoor_window(points, is_calibrated=True)
        # Must NOT recommend 12 AM - 2 AM
        self.assertNotIn("12 AM", result.window_str)
        self.assertNotIn("1 AM", result.window_str)
        self.assertNotIn("2 AM", result.window_str)
        # Must recommend morning waking hours (6 AM – 8 AM)
        self.assertIn("6 AM", result.window_str)
        self.assertIn("8 AM", result.window_str)
        self.assertEqual(result.status, "ground_calibrated")

        # If points are overnight only, must return no recommended window
        overnight_only = points[:5]
        res_overnight, _ = evaluate_outdoor_window(overnight_only, is_calibrated=True)
        self.assertEqual(res_overnight.status, "unsuitable")
        self.assertEqual(res_overnight.window_str, "No recommended outdoor window")


if __name__ == "__main__":
    unittest.main()
