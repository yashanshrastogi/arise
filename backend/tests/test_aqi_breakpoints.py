"""
Unit tests for CPCB AQI Breakpoint Correctness, Continuity, Boundary Conditions,
Unit Normalizations, and CPCB Completeness Rules.
"""

import unittest
from app.domain.aqi import (
    CPCB_BREAKPOINTS,
    calculate_sub_index,
    calculate_aqi,
    get_aqi_category,
)


class TestAqiBreakpointsAndBoundaries(unittest.TestCase):
    """
    Validates CPCB linear interpolation across all 6 pollutants,
    continuous boundary transitions without holes, and extreme/boundary conditions.
    """

    def test_pm25_boundary_continuity(self):
        # Good (0-30 -> 0-50)
        self.assertEqual(calculate_sub_index("PM2.5", 0.0), 0)
        self.assertEqual(calculate_sub_index("PM2.5", 15.0), 25)
        self.assertEqual(calculate_sub_index("PM2.5", 30.0), 50)

        # Fractional gap test (Previously dropped into gap returning 0)
        sub_gap = calculate_sub_index("PM2.5", 30.05)
        self.assertIsNotNone(sub_gap)
        self.assertEqual(sub_gap, 51)

        # Satisfactory (30-60 -> 51-100)
        self.assertEqual(calculate_sub_index("PM2.5", 30.1), 51)
        self.assertEqual(calculate_sub_index("PM2.5", 60.0), 100)

        # Moderate (60-90 -> 101-200)
        self.assertEqual(calculate_sub_index("PM2.5", 60.05), 101)
        self.assertEqual(calculate_sub_index("PM2.5", 75.0), 150)
        self.assertEqual(calculate_sub_index("PM2.5", 90.0), 200)

        # Poor (90-120 -> 201-300)
        self.assertEqual(calculate_sub_index("PM2.5", 90.05), 201)
        self.assertEqual(calculate_sub_index("PM2.5", 105.0), 250)
        self.assertEqual(calculate_sub_index("PM2.5", 120.0), 300)

        # Very Poor (120-250 -> 301-400)
        self.assertEqual(calculate_sub_index("PM2.5", 120.05), 301)
        self.assertEqual(calculate_sub_index("PM2.5", 185.0), 350)
        self.assertEqual(calculate_sub_index("PM2.5", 250.0), 400)

        # Severe (250-500 -> 401-500)
        self.assertEqual(calculate_sub_index("PM2.5", 250.05), 401)
        self.assertEqual(calculate_sub_index("PM2.5", 375.0), 450)
        self.assertEqual(calculate_sub_index("PM2.5", 500.0), 500)

        # Extreme values capped at 500
        self.assertEqual(calculate_sub_index("PM2.5", 600.0), 500)
        self.assertEqual(calculate_sub_index("PM2.5", 1000.0), 500)

    def test_pm10_boundary_continuity(self):
        # Good (0-50 -> 0-50)
        self.assertEqual(calculate_sub_index("PM10", 0.0), 0)
        self.assertEqual(calculate_sub_index("PM10", 50.0), 50)
        self.assertEqual(calculate_sub_index("PM10", 50.05), 51)

        # Satisfactory (50-100 -> 51-100)
        self.assertEqual(calculate_sub_index("PM10", 100.0), 100)
        self.assertEqual(calculate_sub_index("PM10", 100.05), 101)

        # Moderate (100-250 -> 101-200)
        self.assertEqual(calculate_sub_index("PM10", 250.0), 200)
        self.assertEqual(calculate_sub_index("PM10", 250.05), 201)

        # Poor (250-350 -> 201-300)
        self.assertEqual(calculate_sub_index("PM10", 350.0), 300)
        self.assertEqual(calculate_sub_index("PM10", 350.05), 301)

        # Very Poor (350-430 -> 301-400)
        self.assertEqual(calculate_sub_index("PM10", 430.0), 400)
        self.assertEqual(calculate_sub_index("PM10", 430.05), 401)

        # Severe (430-600 -> 401-500)
        self.assertEqual(calculate_sub_index("PM10", 600.0), 500)
        self.assertEqual(calculate_sub_index("PM10", 750.0), 500)

    def test_no2_boundary_continuity(self):
        # 0-40 -> 0-50, 40-80 -> 51-100, 80-180 -> 101-200
        self.assertEqual(calculate_sub_index("NO2", 0.0), 0)
        self.assertEqual(calculate_sub_index("NO2", 40.0), 50)
        self.assertEqual(calculate_sub_index("NO2", 40.05), 51)
        self.assertEqual(calculate_sub_index("NO2", 80.0), 100)
        self.assertEqual(calculate_sub_index("NO2", 80.05), 101)
        self.assertEqual(calculate_sub_index("NO2", 180.0), 200)
        self.assertEqual(calculate_sub_index("NO2", 280.0), 300)
        self.assertEqual(calculate_sub_index("NO2", 400.0), 400)
        self.assertEqual(calculate_sub_index("NO2", 600.0), 500)

    def test_so2_boundary_continuity(self):
        self.assertEqual(calculate_sub_index("SO2", 0.0), 0)
        self.assertEqual(calculate_sub_index("SO2", 40.0), 50)
        self.assertEqual(calculate_sub_index("SO2", 40.05), 51)
        self.assertEqual(calculate_sub_index("SO2", 80.0), 100)
        self.assertEqual(calculate_sub_index("SO2", 380.0), 200)
        self.assertEqual(calculate_sub_index("SO2", 800.0), 300)
        self.assertEqual(calculate_sub_index("SO2", 1600.0), 400)
        self.assertEqual(calculate_sub_index("SO2", 2000.0), 500)

    def test_co_boundary_continuity(self):
        # In mg/m3: 0-1 -> 0-50, 1-2 -> 51-100, 2-10 -> 101-200, 10-17 -> 201-300, 17-34 -> 301-400, 34-50 -> 401-500
        self.assertEqual(calculate_sub_index("CO", 0.0), 0)
        self.assertEqual(calculate_sub_index("CO", 1.0), 50)
        self.assertEqual(calculate_sub_index("CO", 1.005), 51)
        self.assertEqual(calculate_sub_index("CO", 2.0), 100)
        self.assertEqual(calculate_sub_index("CO", 2.005), 101)
        self.assertEqual(calculate_sub_index("CO", 10.0), 200)
        self.assertEqual(calculate_sub_index("CO", 17.0), 300)
        self.assertEqual(calculate_sub_index("CO", 34.0), 400)
        self.assertEqual(calculate_sub_index("CO", 50.0), 500)

    def test_o3_boundary_continuity(self):
        # 0-50 -> 0-50, 50-100 -> 51-100, 100-168 -> 101-200, 168-208 -> 201-300, 208-748 -> 301-400, 748-1000 -> 401-500
        self.assertEqual(calculate_sub_index("O3", 0.0), 0)
        self.assertEqual(calculate_sub_index("O3", 50.0), 50)
        self.assertEqual(calculate_sub_index("O3", 50.05), 51)
        self.assertEqual(calculate_sub_index("O3", 100.0), 100)
        self.assertEqual(calculate_sub_index("O3", 168.0), 200)
        self.assertEqual(calculate_sub_index("O3", 208.0), 300)
        self.assertEqual(calculate_sub_index("O3", 748.0), 400)
        self.assertEqual(calculate_sub_index("O3", 1000.0), 500)

    def test_invalid_and_negative_values(self):
        self.assertIsNone(calculate_sub_index("PM2.5", -5.0))
        self.assertIsNone(calculate_sub_index("UNKNOWN_POLLUTANT", 50.0))

    def test_cpcb_completeness_rule(self):
        # Compliant: >= 3 pollutants including PM2.5 or PM10
        res_compliant = calculate_aqi({
            "PM2.5": 72.8,
            "PM10": 180.0,
            "NO2": 58.0
        })
        self.assertTrue(res_compliant.is_cpcb_compliant)
        self.assertEqual(res_compliant.pollutants_monitored, 3)

        # Non-compliant: 3 gaseous pollutants but missing PM
        res_no_pm = calculate_aqi({
            "NO2": 45.0,
            "SO2": 25.0,
            "CO": 1.5
        })
        self.assertFalse(res_no_pm.is_cpcb_compliant)

        # Non-compliant: Only 2 pollutants
        res_two = calculate_aqi({
            "PM2.5": 80.0,
            "PM10": 150.0
        })
        self.assertFalse(res_two.is_cpcb_compliant)

    def test_empty_or_zero_pollutants(self):
        res = calculate_aqi({})
        self.assertEqual(res.aqi, 0)
        self.assertEqual(res.category, "Good")
        self.assertFalse(res.is_cpcb_compliant)


if __name__ == "__main__":
    unittest.main()
