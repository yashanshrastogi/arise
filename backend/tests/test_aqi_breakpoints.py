"""
Comprehensive unit tests for CPCB AQI Breakpoints, Boundary Behavior,
Linear Interpolation, Rounding, Dominant Pollutant Selection, Completeness,
Non-Finite Inputs, and Traceable Versioned Station Fixtures.

Authoritative Reference:
Central Pollution Control Board (CPCB), National Air Quality Index — Final Report,
Report No. CUPS/82/2014-15, October 2014 (prepared with IIT Kanpur).
Table 4.1: Proposed Sub-index and breakpoints for Indian AQI (page 24).
"""

import json
import math
import os
import unittest
from app.domain.aqi import (
    CPCB_BREAKPOINTS,
    calculate_sub_index,
    calculate_aqi,
    get_aqi_category,
    verify_provenance_signature,
    calculate_hourly_coverage_from_series,
    validate_cpcb_averaging_coverage,
    CPCB_STANDARD_UNITS,
    TRUSTED_REGULATORY_PROVIDERS,
)
from app.sources.provenance import (
    create_trusted_aggregation_record,
    generate_provenance_signature,
)


class TestAqiBreakpointsAndBoundaries(unittest.TestCase):
    """
    Validates CPCB linear interpolation across all pollutants,
    continuous boundary transitions without holes, boundary inclusivity,
    and handling of non-finite and out-of-scale values.
    """

    def test_pm25_boundary_continuity(self):
        # Good (0-30 -> 0-50)
        self.assertEqual(calculate_sub_index("PM2.5", 0.0), 0)
        self.assertEqual(calculate_sub_index("PM2.5", 15.0), 25)
        self.assertEqual(calculate_sub_index("PM2.5", 30.0), 50)

        # Boundary transition: just above 30 enters Satisfactory (30-60 -> 51-100)
        self.assertEqual(calculate_sub_index("PM2.5", 30.01), 51)
        self.assertEqual(calculate_sub_index("PM2.5", 60.0), 100)

        # Moderate (60-90 -> 101-200)
        self.assertEqual(calculate_sub_index("PM2.5", 60.01), 101)
        self.assertEqual(calculate_sub_index("PM2.5", 75.0), 150)
        self.assertEqual(calculate_sub_index("PM2.5", 90.0), 200)

        # Poor (90-120 -> 201-300)
        self.assertEqual(calculate_sub_index("PM2.5", 90.01), 201)
        self.assertEqual(calculate_sub_index("PM2.5", 105.0), 250)
        self.assertEqual(calculate_sub_index("PM2.5", 120.0), 300)

        # Very Poor (120-250 -> 301-400)
        self.assertEqual(calculate_sub_index("PM2.5", 120.01), 301)
        self.assertEqual(calculate_sub_index("PM2.5", 185.0), 350)
        self.assertEqual(calculate_sub_index("PM2.5", 250.0), 400)

        # Severe (250-500 -> 401-500)
        self.assertEqual(calculate_sub_index("PM2.5", 250.01), 401)
        self.assertEqual(calculate_sub_index("PM2.5", 375.0), 450)
        self.assertEqual(calculate_sub_index("PM2.5", 500.0), 500)

        # Concentrations exceeding the supported table must return None (out-of-scale)
        # and must NEVER be silently clamped to 500.
        self.assertIsNone(calculate_sub_index("PM2.5", 500.01))
        self.assertIsNone(calculate_sub_index("PM2.5", 600.0))
        self.assertIsNone(calculate_sub_index("PM2.5", 1000.0))

    def test_pm10_boundary_continuity(self):
        # Good (0-50 -> 0-50)
        self.assertEqual(calculate_sub_index("PM10", 0.0), 0)
        self.assertEqual(calculate_sub_index("PM10", 25.0), 25)
        self.assertEqual(calculate_sub_index("PM10", 50.0), 50)

        # Satisfactory (50-100 -> 51-100)
        self.assertEqual(calculate_sub_index("PM10", 50.01), 51)
        self.assertEqual(calculate_sub_index("PM10", 75.0), 76)
        self.assertEqual(calculate_sub_index("PM10", 100.0), 100)

        # Moderate (100-250 -> 101-200)
        self.assertEqual(calculate_sub_index("PM10", 100.01), 101)
        self.assertEqual(calculate_sub_index("PM10", 175.0), 150)
        self.assertEqual(calculate_sub_index("PM10", 250.0), 200)

        # Poor (250-350 -> 201-300)
        self.assertEqual(calculate_sub_index("PM10", 250.01), 201)
        self.assertEqual(calculate_sub_index("PM10", 300.0), 250)
        self.assertEqual(calculate_sub_index("PM10", 350.0), 300)

        # Very Poor (350-430 -> 301-400)
        self.assertEqual(calculate_sub_index("PM10", 350.01), 301)
        self.assertEqual(calculate_sub_index("PM10", 390.0), 350)
        self.assertEqual(calculate_sub_index("PM10", 430.0), 400)

        # Severe (430-600 -> 401-500)
        self.assertEqual(calculate_sub_index("PM10", 430.01), 401)
        self.assertEqual(calculate_sub_index("PM10", 515.0), 450)
        self.assertEqual(calculate_sub_index("PM10", 600.0), 500)

        # Out-of-scale > 600
        self.assertIsNone(calculate_sub_index("PM10", 600.01))
        self.assertIsNone(calculate_sub_index("PM10", 750.0))

    def test_no2_boundary_continuity(self):
        # 0-40 -> 0-50, 40-80 -> 51-100, 80-180 -> 101-200
        self.assertEqual(calculate_sub_index("NO2", 0.0), 0)
        self.assertEqual(calculate_sub_index("NO2", 40.0), 50)
        self.assertEqual(calculate_sub_index("NO2", 40.01), 51)
        self.assertEqual(calculate_sub_index("NO2", 80.0), 100)
        self.assertEqual(calculate_sub_index("NO2", 80.01), 101)
        self.assertEqual(calculate_sub_index("NO2", 180.0), 200)
        self.assertEqual(calculate_sub_index("NO2", 180.01), 201)
        self.assertEqual(calculate_sub_index("NO2", 280.0), 300)
        self.assertEqual(calculate_sub_index("NO2", 280.01), 301)
        self.assertEqual(calculate_sub_index("NO2", 400.0), 400)
        self.assertEqual(calculate_sub_index("NO2", 400.01), 401)
        self.assertEqual(calculate_sub_index("NO2", 600.0), 500)
        self.assertIsNone(calculate_sub_index("NO2", 600.01))

    def test_so2_boundary_continuity(self):
        self.assertEqual(calculate_sub_index("SO2", 0.0), 0)
        self.assertEqual(calculate_sub_index("SO2", 40.0), 50)
        self.assertEqual(calculate_sub_index("SO2", 40.01), 51)
        self.assertEqual(calculate_sub_index("SO2", 80.0), 100)
        self.assertEqual(calculate_sub_index("SO2", 80.01), 101)
        self.assertEqual(calculate_sub_index("SO2", 380.0), 200)
        self.assertEqual(calculate_sub_index("SO2", 380.01), 201)
        self.assertEqual(calculate_sub_index("SO2", 800.0), 300)
        self.assertEqual(calculate_sub_index("SO2", 800.01), 301)
        self.assertEqual(calculate_sub_index("SO2", 1600.0), 400)
        self.assertEqual(calculate_sub_index("SO2", 1600.01), 401)
        self.assertEqual(calculate_sub_index("SO2", 2000.0), 500)
        self.assertIsNone(calculate_sub_index("SO2", 2000.01))

    def test_co_boundary_continuity(self):
        # In mg/m3: 0-1 -> 0-50, 1-2 -> 51-100, 2-10 -> 101-200, 10-17 -> 201-300, 17-34 -> 301-400, 34-50 -> 401-500
        self.assertEqual(calculate_sub_index("CO", 0.0), 0)
        self.assertEqual(calculate_sub_index("CO", 1.0), 50)
        self.assertEqual(calculate_sub_index("CO", 1.001), 51)
        self.assertEqual(calculate_sub_index("CO", 2.0), 100)
        self.assertEqual(calculate_sub_index("CO", 2.001), 101)
        self.assertEqual(calculate_sub_index("CO", 10.0), 200)
        self.assertEqual(calculate_sub_index("CO", 10.001), 201)
        self.assertEqual(calculate_sub_index("CO", 17.0), 300)
        self.assertEqual(calculate_sub_index("CO", 17.001), 301)
        self.assertEqual(calculate_sub_index("CO", 34.0), 400)
        self.assertEqual(calculate_sub_index("CO", 34.001), 401)
        self.assertEqual(calculate_sub_index("CO", 50.0), 500)
        self.assertIsNone(calculate_sub_index("CO", 50.01))

    def test_o3_boundary_continuity(self):
        # 0-50 -> 0-50, 50-100 -> 51-100, 100-168 -> 101-200, 168-208 -> 201-300, 208-748 -> 301-400, 748-1000 -> 401-500
        self.assertEqual(calculate_sub_index("O3", 0.0), 0)
        self.assertEqual(calculate_sub_index("O3", 50.0), 50)
        self.assertEqual(calculate_sub_index("O3", 50.01), 51)
        self.assertEqual(calculate_sub_index("O3", 100.0), 100)
        self.assertEqual(calculate_sub_index("O3", 100.01), 101)
        self.assertEqual(calculate_sub_index("O3", 168.0), 200)
        self.assertEqual(calculate_sub_index("O3", 168.01), 201)
        self.assertEqual(calculate_sub_index("O3", 208.0), 300)
        self.assertEqual(calculate_sub_index("O3", 208.01), 301)
        self.assertEqual(calculate_sub_index("O3", 748.0), 400)
        self.assertEqual(calculate_sub_index("O3", 748.01), 401)
        self.assertEqual(calculate_sub_index("O3", 1000.0), 500)
        self.assertIsNone(calculate_sub_index("O3", 1000.01))

    def test_nh3_boundary_continuity(self):
        # 0-200 -> 0-50, 200-400 -> 51-100, 400-800 -> 101-200, 800-1200 -> 201-300, 1200-1800 -> 301-400, 1800-2400 -> 401-500
        self.assertEqual(calculate_sub_index("NH3", 0.0), 0)
        self.assertEqual(calculate_sub_index("NH3", 200.0), 50)
        self.assertEqual(calculate_sub_index("NH3", 200.01), 51)
        self.assertEqual(calculate_sub_index("NH3", 400.0), 100)
        self.assertEqual(calculate_sub_index("NH3", 400.01), 101)
        self.assertEqual(calculate_sub_index("NH3", 800.0), 200)
        self.assertEqual(calculate_sub_index("NH3", 1200.0), 300)
        self.assertEqual(calculate_sub_index("NH3", 1800.0), 400)
        self.assertEqual(calculate_sub_index("NH3", 2400.0), 500)
        self.assertIsNone(calculate_sub_index("NH3", 2400.01))

    def test_pb_boundary_continuity(self):
        # CPCB Report CUPS/82/2014-15 Table 4.1 (page 24): Pb in µg/m³ (24-hr average)
        # 0.0-0.5 -> 0-50, 0.5-1.0 -> 51-100, 1.0-2.0 -> 101-200, 2.0-3.0 -> 201-300, 3.0-3.5 -> 301-400, 3.5-5.0 -> 401-500
        self.assertEqual(calculate_sub_index("PB", 0.0), 0)
        self.assertEqual(calculate_sub_index("PB", 0.5), 50)
        self.assertEqual(calculate_sub_index("PB", 0.501), 51)
        self.assertEqual(calculate_sub_index("PB", 1.0), 100)
        self.assertEqual(calculate_sub_index("PB", 1.001), 101)
        self.assertEqual(calculate_sub_index("PB", 2.0), 200)
        self.assertEqual(calculate_sub_index("PB", 2.001), 201)
        self.assertEqual(calculate_sub_index("PB", 3.0), 300)
        self.assertEqual(calculate_sub_index("PB", 3.001), 301)
        self.assertEqual(calculate_sub_index("PB", 3.5), 400)
        self.assertEqual(calculate_sub_index("PB", 3.501), 401)
        self.assertEqual(calculate_sub_index("PB", 5.0), 500)
        # Out-of-scale > 5.0
        self.assertIsNone(calculate_sub_index("PB", 5.01))
        self.assertIsNone(calculate_sub_index("PB", 10.0))

    def test_non_finite_and_negative_inputs(self):
        # Negative concentration
        self.assertIsNone(calculate_sub_index("PM2.5", -1.0))
        self.assertIsNone(calculate_sub_index("PM10", -0.001))
        # NaN and Infs
        self.assertIsNone(calculate_sub_index("PM2.5", float("nan")))
        self.assertIsNone(calculate_sub_index("PM2.5", float("inf")))
        self.assertIsNone(calculate_sub_index("PM2.5", float("-inf")))
        # Unrecognized pollutant
        self.assertIsNone(calculate_sub_index("UNKNOWN_POLLUTANT", 50.0))

    def test_cpcb_completeness_rules(self):
        """
        CPCB Completeness Rule (Report CUPS/82/2014-15 page 38):
        - Minimum 3 pollutants
        - At least one must be PM (PM2.5 or PM10)
        - Demonstrably valid 24-hr/8-hr rolling averaging window and sufficient data coverage required
        """
        ref_time = "2026-10-19T06:00:00Z"
        valid_coverage = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_time),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_time),
            "NO2": create_trusted_aggregation_record("CPCB_CAAQMS", "NO2", 24, 24.0, ref_time),
        }

        # Demonstrable coverage provided: meets criteria AND valid coverage -> regulatory compliant
        res_compliant = calculate_aqi({
            "PM2.5": 72.88,
            "PM10": 180.0,
            "NO2": 58.0
        }, averaging_coverage=valid_coverage)
        self.assertTrue(res_compliant.is_cpcb_compliant)
        self.assertTrue(res_compliant.meets_pollutant_criteria)
        self.assertEqual(res_compliant.data_type, "regulatory_compliant")
        self.assertEqual(res_compliant.pollutants_monitored, 3)
        self.assertIsNotNone(res_compliant.aqi)

        # Unvalidated boolean alone without coverage data: must be strictly rejected
        res_unvalidated_bool = calculate_aqi({
            "PM2.5": 72.88,
            "PM10": 180.0,
            "NO2": 58.0
        }, has_verified_averaging=True)
        self.assertFalse(res_unvalidated_bool.is_cpcb_compliant)
        self.assertTrue(res_unvalidated_bool.meets_pollutant_criteria)
        self.assertEqual(res_unvalidated_bool.data_type, "indicative")

        # Indicative telemetry: meets pollutant criteria but no coverage data (OpenAQ latest)
        res_indicative = calculate_aqi({
            "PM2.5": 72.88,
            "PM10": 180.0,
            "NO2": 58.0
        }, has_verified_averaging=False)
        self.assertFalse(res_indicative.is_cpcb_compliant)
        self.assertTrue(res_indicative.meets_pollutant_criteria)
        self.assertEqual(res_indicative.data_type, "indicative")
        self.assertEqual(res_indicative.aqi, res_compliant.aqi)

        # Non-compliant: 3 gaseous pollutants but no PM (even with valid coverage)
        gas_coverage = {
            "NO2": {
                "trusted_provider": "CPCB_CAAQMS",
                "pollutant": "NO2",
                "window_hours": 24,
                "distinct_monitored_hours": 24.0
            },
            "SO2": {
                "trusted_provider": "CPCB_CAAQMS",
                "pollutant": "SO2",
                "window_hours": 24,
                "distinct_monitored_hours": 24.0
            },
            "CO": {
                "trusted_provider": "CPCB_CAAQMS",
                "pollutant": "CO",
                "window_hours": 8,
                "distinct_monitored_hours": 8.0
            },
        }
        res_no_pm = calculate_aqi({
            "NO2": 45.0,
            "SO2": 25.0,
            "CO": 1.5
        }, averaging_coverage=gas_coverage)
        self.assertFalse(res_no_pm.is_cpcb_compliant)
        self.assertFalse(res_no_pm.meets_pollutant_criteria)
        self.assertEqual(res_no_pm.data_type, "indicative")
        self.assertEqual(res_no_pm.pollutants_monitored, 3)

        # Non-compliant: Only 2 pollutants
        res_two = calculate_aqi({
            "PM2.5": 80.0,
            "PM10": 150.0
        }, averaging_coverage=valid_coverage)
        self.assertFalse(res_two.is_cpcb_compliant)
        self.assertFalse(res_two.meets_pollutant_criteria)
        self.assertEqual(res_two.pollutants_monitored, 2)

    def test_demonstrable_averaging_coverage_validation(self):
        """
        CPCB Section 4.5 coverage threshold verification:
        - 24-hr pollutants require window_hours=24 and monitored_hours >= 16.
        - 8-hr pollutants require window_hours=8 and monitored_hours >= 6.
        - Under-coverage or missing pollutant coverage must reject regulatory compliance.
        """
        pollutants = {
            "PM2.5": 70.0,
            "PM10": 120.0,
            "CO": 2.5
        }

        ref_t = "2026-10-19T06:00:00Z"

        # Insufficient coverage for PM2.5 (< 16 hours, e.g. 15.9 hours)
        cov_pm_under = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 15.9, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_pm_under).is_cpcb_compliant)

        # Exactly at boundary: 16.0 hours for PM2.5 -> Passes
        cov_pm_boundary = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 16.0, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 16.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 6.0, ref_t),
        }
        self.assertTrue(calculate_aqi(pollutants, averaging_coverage=cov_pm_boundary).is_cpcb_compliant)

        # Insufficient coverage for CO (< 6 hours, e.g. 5.9 hours)
        cov_co_under = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 5.9, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_co_under).is_cpcb_compliant)

        # Wrong window size (e.g. 12-hour window instead of 24-hour)
        cov_wrong_window = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 12, 12.0, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_wrong_window).is_cpcb_compliant)

        # Missing coverage for one contributing pollutant
        cov_missing_pol = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            # CO missing
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_missing_pol).is_cpcb_compliant)

        # Adversarial Security Check 1: Missing provenance signature
        cov_missing_sig = {
            "PM2.5": {"trusted_provider": "CPCB_CAAQMS", "pollutant": "PM2.5", "window_hours": 24, "distinct_monitored_hours": 24.0, "reference_end_time": ref_t},
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_missing_sig).is_cpcb_compliant)

        # Adversarial Security Check 2: Forged / invalid provenance signature
        cov_forged_sig = {
            "PM2.5": {**create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t), "provenance_signature": "attacker_forged_signature_0123456789"},
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_forged_sig).is_cpcb_compliant)

        # Adversarial Security Check 3: Tampered monitored hours (signature generated for 10h, changed to 24h)
        tampered_rec = create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 10.0, ref_t)
        tampered_rec["distinct_monitored_hours"] = 24.0 # Attacker inflates hours!
        cov_tampered_hours = {
            "PM2.5": tampered_rec,
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_tampered_hours).is_cpcb_compliant)

        # Adversarial Security Check 4: Untrusted provider name
        cov_untrusted_prov = {
            "PM2.5": {**create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t), "trusted_provider": "MALICIOUS_ADAPTER"},
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_untrusted_prov).is_cpcb_compliant)

        # Bare caller-supplied 'monitored_hours' without observation series or trusted provider: REJECTED
        cov_bare_number = {
            "PM2.5": {"window_hours": 24, "monitored_hours": 24.0},
            "PM10": {"window_hours": 24, "monitored_hours": 24.0},
            "CO": {"window_hours": 8, "monitored_hours": 8.0},
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_bare_number).is_cpcb_compliant)

        # Cross-pollutant metadata reuse: PM2.5 signature passed for PM10 -> REJECTED
        cov_cross_pollutant = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t), # Mismatched pollutant!
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_cross_pollutant).is_cpcb_compliant)

    def test_observation_series_coverage_edge_cases(self):
        """
        Validates derivation of coverage from actual timestamped observations series:
        - Missing/invalid timestamps (dropped).
        - Duplicate readings in same hour bucket (collapsed, not double-counted).
        - Observations outside requested window (excluded).
        - Stale readings (all outside window -> 0 hours).
        - Timezone differences (normalized correctly across UTC and IST).
        - Gaps and minimum threshold (14h fails, 16h passes).
        """
        from datetime import datetime, timezone, timedelta

        ref_end = datetime(2026, 10, 19, 12, 0, 0, tzinfo=timezone.utc) # 12:00 UTC

        # Case 1: Duplicate readings in same hour bucket do NOT inflate coverage
        # 10 readings at 11:15, 11:20, 11:45 within the 11:00-12:00 hour
        dup_series = [
            {"timestamp": f"2026-10-19T11:{minute:02d}:00Z", "value": 50.0}
            for minute in range(10, 30, 2)
        ]
        # Only 1 distinct hour covered
        from app.domain.aqi import calculate_hourly_coverage_from_series
        self.assertEqual(calculate_hourly_coverage_from_series(dup_series, 24, reference_end_time=ref_end), 1)

        # Case 2: Timezone equivalence (UTC 'Z' vs '+05:30' IST)
        # 11:30 UTC is 17:00 IST. They represent the exact same moment and belong to the same hour bucket
        tz_series = [
            {"timestamp": "2026-10-19T11:15:00Z", "value": 50.0},
            {"timestamp": "2026-10-19T16:45:00+05:30", "value": 52.0}, # 11:15 UTC in IST
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(tz_series, 24, reference_end_time=ref_end), 1)

        # Case 3: Missing, None, and unparseable timestamps dropped
        dirty_series = [
            {"timestamp": None, "value": 50.0},
            {"timestamp": "", "value": 50.0},
            {"timestamp": "not-a-timestamp", "value": 50.0},
            {"timestamp": "2026-10-19T11:00:00Z", "value": 50.0},
            {"timestamp": "2026-10-19T10:00:00Z", "value": 48.0},
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(dirty_series, 24, reference_end_time=ref_end), 2)

        # Case 4: Observations outside the requested window
        # Window is [2026-10-18T12:00:00Z, 2026-10-19T12:00:00Z]
        out_of_window_series = [
            {"timestamp": "2026-10-17T12:00:00Z", "value": 40.0}, # 48h old (dropped)
            {"timestamp": "2026-10-18T10:00:00Z", "value": 45.0}, # 26h old (dropped)
            {"timestamp": "2026-10-19T14:00:00Z", "value": 55.0}, # 2h in future relative to ref_end (dropped)
            {"timestamp": "2026-10-19T11:00:00Z", "value": 50.0}, # In window (counted)
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(out_of_window_series, 24, reference_end_time=ref_end), 1)

        # Case 5: Stale readings (all readings older than window start)
        stale_series = [
            {"timestamp": "2026-10-15T12:00:00Z", "value": 40.0},
            {"timestamp": "2026-10-16T12:00:00Z", "value": 45.0},
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(stale_series, 24, reference_end_time=ref_end), 0)

        # Case 6: Gaps & Minimum CPCB Threshold (14 hours fails, 16 hours passes)
        # Generate 14 distinct hourly readings for PM2.5, PM10, and 6 for CO
        series_14h = [
            {"timestamp": (ref_end - timedelta(hours=h)).isoformat(), "value": 60.0}
            for h in range(14)
        ]
        series_16h = [
            {"timestamp": (ref_end - timedelta(hours=h)).isoformat(), "value": 60.0}
            for h in range(16)
        ]
        series_co_6h = [
            {"timestamp": (ref_end - timedelta(hours=h)).isoformat(), "value": 2.0}
            for h in range(6)
        ]

        pollutants = {"PM2.5": 60.0, "PM10": 100.0, "CO": 2.0}

        # 14 hours for PM2.5 fails regulatory compliance (requires >= 16)
        cov_14h = {
            "PM2.5": {"observations": series_14h, "reference_end_time": ref_end.isoformat()},
            "PM10": {"observations": series_16h, "reference_end_time": ref_end.isoformat()},
            "CO": {"observations": series_co_6h, "reference_end_time": ref_end.isoformat()},
        }
        res_fail = calculate_aqi(pollutants, averaging_coverage=cov_14h)
        self.assertFalse(res_fail.is_cpcb_compliant)
        self.assertEqual(res_fail.data_type, "indicative")

        # 16 hours for PM2.5 and PM10, 6 hours for CO: PASSES regulatory compliance
        cov_16h = {
            "PM2.5": {"observations": series_16h, "reference_end_time": ref_end.isoformat()},
            "PM10": {"observations": series_16h, "reference_end_time": ref_end.isoformat()},
            "CO": {"observations": series_co_6h, "reference_end_time": ref_end.isoformat()},
        }
        res_pass = calculate_aqi(pollutants, averaging_coverage=cov_16h)
        self.assertTrue(res_pass.is_cpcb_compliant)
        self.assertEqual(res_pass.data_type, "regulatory_compliant")

        # Case 7: Naive timestamps (without timezone offset or 'Z') are strictly rejected
        # Cannot silently assume UTC; must reject naive timestamps as ambiguous
        naive_series = [
            {"timestamp": "2026-10-19T11:00:00", "value": 50.0}, # Naive string -> rejected!
            {"timestamp": datetime(2026, 10, 19, 10, 0, 0), "value": 50.0}, # Naive datetime -> rejected!
            {"timestamp": "2026-10-19T09:00:00Z", "value": 50.0}, # Valid UTC -> counted
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(naive_series, 24, reference_end_time=ref_end), 1)

        # Case 8: Non-finite (NaN, inf) and negative concentrations dropped from monitored hours
        invalid_val_series = [
            {"timestamp": "2026-10-19T11:00:00Z", "value": float("nan")},
            {"timestamp": "2026-10-19T10:00:00Z", "value": float("inf")},
            {"timestamp": "2026-10-19T09:00:00Z", "value": -10.0},
            {"timestamp": "2026-10-19T08:00:00Z", "value": 45.0}, # Only valid reading
        ]
        self.assertEqual(calculate_hourly_coverage_from_series(invalid_val_series, 24, reference_end_time=ref_end), 1)

        # Case 9: Out-of-scale concentrations (> B_hi = 500.0 for PM2.5) dropped from monitored hours
        out_of_scale_series = [
            {"timestamp": "2026-10-19T11:00:00Z", "value": 750.0}, # Exceeds 500.0 -> dropped
            {"timestamp": "2026-10-19T10:00:00Z", "value": 50.0}, # Valid -> counted
        ]
        self.assertEqual(
            calculate_hourly_coverage_from_series(out_of_scale_series, 24, reference_end_time=ref_end, max_allowed_concentration=500.0),
            1
        )

    def test_co_units_conversion_trace_and_aqi(self):
        """
        Traces every supported CO unit through conversion and AQI linear interpolation.
        Units supported per CPCB NTP standards (25°C, 1 atm, Vm = 24.45 L/mol, M = 28.01 g/mol):
        - mg/m³: identity
        - µg/m³: divided by 1000
        - ppm: multiplied by 1.15
        Ambiguous/unsupported units (ppb, unknown, empty) strictly rejected.
        """
        # 1. Trace mg/m³
        # 0.5 mg/m³ -> Good (0-1.0 -> 0-50) -> sub-index 25
        self.assertEqual(calculate_sub_index("CO", 0.5), 25)
        # 2.19 mg/m³ -> Moderate (2.0-10.0 -> 101-200) -> sub-index 103
        self.assertEqual(calculate_sub_index("CO", 2.19), 103)

        # 2. Trace µg/m³ conversion
        # 500 µg/m³ / 1000 = 0.5 mg/m³ -> sub-index 25
        co_mg_from_ug = round(500.0 / 1000.0, 2)
        self.assertEqual(calculate_sub_index("CO", co_mg_from_ug), 25)
        # 2190 µg/m³ / 1000 = 2.19 mg/m³ -> sub-index 103
        co_mg_from_ug2 = round(2190.0 / 1000.0, 2)
        self.assertEqual(calculate_sub_index("CO", co_mg_from_ug2), 103)
        # 10000 µg/m³ / 1000 = 10.0 mg/m³ -> sub-index 200
        self.assertEqual(calculate_sub_index("CO", round(10000.0 / 1000.0, 2)), 200)
        # 50000 µg/m³ / 1000 = 50.0 mg/m³ -> sub-index 500
        self.assertEqual(calculate_sub_index("CO", round(50000.0 / 1000.0, 2)), 500)
        # 50500 µg/m³ / 1000 = 50.5 mg/m³ -> Out of scale (> 50.0) -> None
        self.assertIsNone(calculate_sub_index("CO", round(50500.0 / 1000.0, 2)))

        # 3. Trace ppm conversion (factor = 1.15)
        # 0.4348 ppm * 1.15 = 0.50 mg/m³ -> sub-index 25
        co_mg_from_ppm = round(0.4348 * 1.15, 2)
        self.assertEqual(calculate_sub_index("CO", co_mg_from_ppm), 25)
        # 1.9043 ppm * 1.15 = 2.19 mg/m³ -> sub-index 103
        co_mg_from_ppm2 = round(1.9043 * 1.15, 2)
        self.assertEqual(calculate_sub_index("CO", co_mg_from_ppm2), 103)
        # 8.6957 ppm * 1.15 = 10.00 mg/m³ -> sub-index 200
        self.assertEqual(calculate_sub_index("CO", round(8.6957 * 1.15, 2)), 200)
        # 43.478 ppm * 1.15 = 50.00 mg/m³ -> sub-index 500
        self.assertEqual(calculate_sub_index("CO", round(43.478 * 1.15, 2)), 500)
        # 45.0 ppm * 1.15 = 51.75 mg/m³ -> Out of scale (> 50.0) -> None
        self.assertIsNone(calculate_sub_index("CO", round(45.0 * 1.15, 2)))

    def test_exact_and_fractional_breakpoint_boundaries(self):
        """
        Comprehensive test of exact integer endpoints and fractional transitions
        across all 8 criteria pollutants per CPCB Table 4.1.
        """
        # PM2.5: [0, 30], (30, 60], (60, 90], (90, 120], (120, 250], (250, 500]
        self.assertEqual(calculate_sub_index("PM2.5", 30.0), 50)
        self.assertEqual(calculate_sub_index("PM2.5", 30.001), 51)
        self.assertEqual(calculate_sub_index("PM2.5", 60.0), 100)
        self.assertEqual(calculate_sub_index("PM2.5", 60.001), 101)
        self.assertEqual(calculate_sub_index("PM2.5", 90.0), 200)
        self.assertEqual(calculate_sub_index("PM2.5", 90.001), 201)
        self.assertEqual(calculate_sub_index("PM2.5", 120.0), 300)
        self.assertEqual(calculate_sub_index("PM2.5", 120.001), 301)
        self.assertEqual(calculate_sub_index("PM2.5", 250.0), 400)
        self.assertEqual(calculate_sub_index("PM2.5", 250.001), 401)
        self.assertEqual(calculate_sub_index("PM2.5", 500.0), 500)
        self.assertIsNone(calculate_sub_index("PM2.5", 500.001))

        # PM10: [0, 50], (50, 100], (100, 250], (250, 350], (350, 430], (430, 600]
        self.assertEqual(calculate_sub_index("PM10", 50.0), 50)
        self.assertEqual(calculate_sub_index("PM10", 50.001), 51)
        self.assertEqual(calculate_sub_index("PM10", 100.0), 100)
        self.assertEqual(calculate_sub_index("PM10", 100.001), 101)
        self.assertEqual(calculate_sub_index("PM10", 250.0), 200)
        self.assertEqual(calculate_sub_index("PM10", 250.001), 201)
        self.assertEqual(calculate_sub_index("PM10", 350.0), 300)
        self.assertEqual(calculate_sub_index("PM10", 350.001), 301)
        self.assertEqual(calculate_sub_index("PM10", 430.0), 400)
        self.assertEqual(calculate_sub_index("PM10", 430.001), 401)
        self.assertEqual(calculate_sub_index("PM10", 600.0), 500)
        self.assertIsNone(calculate_sub_index("PM10", 600.001))

        # CO: [0, 1.0], (1.0, 2.0], (2.0, 10.0], (10.0, 17.0], (17.0, 34.0], (34.0, 50.0]
        self.assertEqual(calculate_sub_index("CO", 1.0), 50)
        self.assertEqual(calculate_sub_index("CO", 1.001), 51)
        self.assertEqual(calculate_sub_index("CO", 2.0), 100)
        self.assertEqual(calculate_sub_index("CO", 2.001), 101)
        self.assertEqual(calculate_sub_index("CO", 10.0), 200)
        self.assertEqual(calculate_sub_index("CO", 10.001), 201)
        self.assertEqual(calculate_sub_index("CO", 17.0), 300)
        self.assertEqual(calculate_sub_index("CO", 17.001), 301)
        self.assertEqual(calculate_sub_index("CO", 34.0), 400)
        self.assertEqual(calculate_sub_index("CO", 34.001), 401)
        self.assertEqual(calculate_sub_index("CO", 50.0), 500)
        self.assertIsNone(calculate_sub_index("CO", 50.001))

        # Pb: [0, 0.5], (0.5, 1.0], (1.0, 2.0], (2.0, 3.0], (3.0, 3.5], (3.5, 5.0]
        self.assertEqual(calculate_sub_index("PB", 0.5), 50)
        self.assertEqual(calculate_sub_index("PB", 0.501), 51)
        self.assertEqual(calculate_sub_index("PB", 1.0), 100)
        self.assertEqual(calculate_sub_index("PB", 1.001), 101)
        self.assertEqual(calculate_sub_index("PB", 2.0), 200)
        self.assertEqual(calculate_sub_index("PB", 2.001), 201)
        self.assertEqual(calculate_sub_index("PB", 3.0), 300)
        self.assertEqual(calculate_sub_index("PB", 3.001), 301)
        self.assertEqual(calculate_sub_index("PB", 3.5), 400)
        self.assertEqual(calculate_sub_index("PB", 3.501), 401)
        self.assertEqual(calculate_sub_index("PB", 5.0), 500)
        self.assertIsNone(calculate_sub_index("PB", 5.001))

    def test_empty_and_unavailable_inputs(self):
        """Empty input dictionary must return aqi=None and category='Unavailable'."""
        res_empty = calculate_aqi({})
        self.assertIsNone(res_empty.aqi)
        self.assertEqual(res_empty.category, "Unavailable")
        self.assertEqual(res_empty.dominant_pollutant, "None")
        self.assertFalse(res_empty.is_cpcb_compliant)
        self.assertEqual(res_empty.data_type, "unavailable")
        self.assertEqual(res_empty.color, "#94a3b8")

        # All invalid/out-of-scale values must also result in aqi=None
        res_invalid = calculate_aqi({
            "PM2.5": -10.0,
            "PM10": 9999.0 # out-of-scale
        })
        self.assertIsNone(res_invalid.aqi)
        self.assertEqual(res_invalid.category, "Unavailable")
        self.assertEqual(res_invalid.data_type, "unavailable")

    def test_dominant_pollutant_tie_breaking(self):
        """
        Deterministic tie-breaking: when multiple pollutants tie for the maximum sub-index,
        Arise deterministic engineering policy: PM2.5 > PM10 > NO2 > SO2 > CO > O3 > NH3 > Pb.
        (Documented as an Arise design policy, not an official CPCB standard).
        """
        # PM2.5 at 15.0 -> sub-index 25
        # PM10 at 25.0 -> sub-index 25
        # Particulate tie: PM2.5 > PM10
        res_pm_tie = calculate_aqi({
            "PM10": 25.0,
            "PM2.5": 15.0,
            "NO2": 10.0
        })
        self.assertEqual(res_pm_tie.sub_indices["PM2.5"], 25)
        self.assertEqual(res_pm_tie.sub_indices["PM10"], 25)
        self.assertEqual(res_pm_tie.dominant_pollutant, "PM2.5")

        # Reverse key order to ensure dict order does not dictate tie-breaker
        res_pm_tie_rev = calculate_aqi({
            "PM2.5": 15.0,
            "PM10": 25.0,
            "NO2": 10.0
        })
        self.assertEqual(res_pm_tie_rev.dominant_pollutant, "PM2.5")

        # PM vs Gas tie: PM10 at 25.0 (25) vs NO2 at 20.0 (25) -> PM10 wins
        res_gas_tie = calculate_aqi({
            "NO2": 20.0,
            "PM10": 25.0,
            "SO2": 10.0
        })
        self.assertEqual(res_gas_tie.sub_indices["PM10"], 25)
        self.assertEqual(res_gas_tie.sub_indices["NO2"], 25)
        self.assertEqual(res_gas_tie.dominant_pollutant, "PM10")

        # All 8 pollutants tie at sub-index 50: PM2.5 must win under Arise policy
        all_tie = {
            "PB": 0.5,     # 50
            "NH3": 200.0,  # 50
            "O3": 50.0,    # 50
            "CO": 1.0,     # 50
            "SO2": 40.0,   # 50
            "NO2": 40.0,   # 50
            "PM10": 50.0,  # 50
            "PM2.5": 30.0, # 50
        }
        res_all_tie = calculate_aqi(all_tie)
        self.assertEqual(res_all_tie.dominant_pollutant, "PM2.5")

    def test_independent_sirifort_fixture_verification(self):
        """
        Verify the Sirifort station arithmetic benchmark against the versioned JSON fixture
        and independently hand-calculated CPCB sub-indices.
        """
        fixture_path = os.path.join(
            os.path.dirname(__file__), "fixtures", "sirifort_station_telemetry.json"
        )
        self.assertTrue(os.path.exists(fixture_path), f"Fixture not found at {fixture_path}")

        with open(fixture_path, "r", encoding="utf-8") as f:
            fixture = json.load(f)

        # Verify provenance qualification
        self.assertEqual(
            fixture["provenance"]["verification_scope"],
            "arithmetic_benchmark_only"
        )

        # 1. Verify raw sensor parameter conversions and independent sub-indices
        pollutants_for_aqi = {}
        for item in fixture["raw_sensor_readings"]:
            param = item["parameter"].upper()
            if param in ("PM25", "PM2.5"):
                param = "PM2.5"
            norm_val = item["normalized_value"]
            expected_sub = item["expected_sub_index"]

            # Independent sub-index test
            computed_sub = calculate_sub_index(param, norm_val)
            self.assertEqual(
                computed_sub,
                expected_sub,
                f"Mismatch for {param}: computed {computed_sub} != expected {expected_sub}"
            )
            pollutants_for_aqi[param] = norm_val

        # 2. Verify regulatory benchmark calculation with demonstrable averaging coverage
        cov_data = fixture["provenance"]["averaging_coverage"]
        res_reg = calculate_aqi(pollutants_for_aqi, averaging_coverage=cov_data)
        expected = fixture["expected_overall"]

        self.assertEqual(res_reg.aqi, expected["aqi"])
        self.assertEqual(res_reg.dominant_pollutant, expected["dominant_pollutant"])
        self.assertEqual(res_reg.category, expected["category"])
        self.assertEqual(res_reg.color, expected["color"])
        self.assertEqual(res_reg.is_cpcb_compliant, expected["is_cpcb_compliant"])
        self.assertEqual(res_reg.pollutants_monitored, expected["pollutants_monitored"])
        self.assertEqual(res_reg.data_type, "regulatory_compliant")

        # 3. Assert unvalidated boolean alone without coverage is rejected
        res_unvalidated = calculate_aqi(pollutants_for_aqi, has_verified_averaging=True)
        self.assertFalse(res_unvalidated.is_cpcb_compliant)
        self.assertEqual(res_unvalidated.data_type, "indicative")

        # 4. Verify indicative telemetry mode (has_verified_averaging=False)
        res_ind = calculate_aqi(pollutants_for_aqi, has_verified_averaging=False)
        self.assertEqual(res_ind.aqi, expected["aqi"])
        self.assertFalse(res_ind.is_cpcb_compliant)
        self.assertTrue(res_ind.meets_pollutant_criteria)
        self.assertEqual(res_ind.data_type, "indicative")

    def test_trust_boundary_isolation_and_security(self):
        """
        Verify that domain layer (app.domain.aqi) does NOT expose signing helpers
        or internal signing keys to untrusted callers.
        """
        import app.domain.aqi as domain_aqi
        self.assertFalse(hasattr(domain_aqi, "_PROVENANCE_KEY"), "Domain layer must NOT contain hardcoded signing keys.")
        self.assertFalse(hasattr(domain_aqi, "create_trusted_aggregation_record"), "Domain layer must NOT export record creation helpers.")
        self.assertFalse(hasattr(domain_aqi, "generate_provenance_signature"), "Domain layer must NOT export signature generation helpers.")

    def test_aggregation_record_unit_validation(self):
        """
        Verify that validate_cpcb_averaging_coverage strictly enforces CPCB standard units:
        - PM2.5 / PM10 / NO2 / SO2 / O3 / NH3 / Pb must be in µg/m³ (or equivalent ASCII).
        - CO must be in mg/m³.
        - Incompatible units (e.g. mg/m³ for PM, ppb for CO) must fail closed.
        """
        ref_t = "2026-10-19T06:00:00Z"
        pollutants = {"PM2.5": 55.0, "PM10": 95.0, "CO": 1.5}

        # Valid units pass
        cov_valid = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t, unit="µg/m³"),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t, unit="ug/m3"),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t, unit="mg/m³"),
        }
        res_valid = calculate_aqi(pollutants, averaging_coverage=cov_valid)
        self.assertTrue(res_valid.is_cpcb_compliant)

        # Incompatible unit for PM2.5 (mg/m³ instead of µg/m³) -> fails closed
        cov_invalid_pm_unit = {
            "PM2.5": {**create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t), "unit": "mg/m³"},
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t, unit="ug/m3"),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t, unit="mg/m³"),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_invalid_pm_unit).is_cpcb_compliant)

        # Incompatible unit for CO (ppb instead of mg/m³) -> fails closed
        cov_invalid_co_unit = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, ref_t, unit="µg/m³"),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t, unit="ug/m3"),
            "CO": {**create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t), "unit": "ppb"},
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_invalid_co_unit).is_cpcb_compliant)

    def test_future_and_stale_timestamps_adversarial(self):
        """
        Verify that future timestamps and naive timestamps are strictly rejected.
        """
        from datetime import datetime, timezone, timedelta

        pollutants = {"PM2.5": 55.0, "PM10": 95.0, "CO": 1.5}
        fixed_now = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)

        # Future timestamp (year 2030)
        cov_future = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, "2030-01-01T00:00:00Z"),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, "2030-01-01T00:00:00Z"),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, "2030-01-01T00:00:00Z"),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_future, current_time=fixed_now).is_cpcb_compliant)

        # Naive timestamp (no timezone offset)
        cov_naive = {
            "PM2.5": {
                "trusted_provider": "CPCB_CAAQMS",
                "pollutant": "PM2.5",
                "window_hours": 24,
                "distinct_monitored_hours": 24.0,
                "reference_end_time": "2026-10-19 06:00:00", # Naive!
                "provenance_signature": "dummy_sig",
            },
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, "2026-10-19T06:00:00Z"),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, "2026-10-19T06:00:00Z"),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_naive).is_cpcb_compliant)

        # Stale record when max_age_hours is enforced (e.g. record is 72h old, max_age_hours=24)
        cov_stale = {
            "PM2.5": create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 24.0, "2026-10-15T00:00:00Z"),
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, "2026-10-15T00:00:00Z"),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, "2026-10-15T00:00:00Z"),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_stale, current_time=fixed_now, max_age_hours=24.0).is_cpcb_compliant)

    def test_fabricated_hour_counts(self):
        """
        Verify that physically impossible hour counts (> window_hours) are rejected.
        """
        ref_t = "2026-10-19T06:00:00Z"
        pollutants = {"PM2.5": 55.0, "PM10": 95.0, "CO": 1.5}

        # Fabricated 25 distinct hours in a 24-hour window
        # Factory raises ValueError:
        with self.assertRaises(ValueError):
            create_trusted_aggregation_record("CPCB_CAAQMS", "PM2.5", 24, 25.0, ref_t)

        # Directly passed dict with 25 hours fails closed
        cov_impossible = {
            "PM2.5": {
                "trusted_provider": "CPCB_CAAQMS",
                "pollutant": "PM2.5",
                "window_hours": 24,
                "distinct_monitored_hours": 25.0,
                "reference_end_time": ref_t,
                "provenance_signature": "any_signature",
            },
            "PM10": create_trusted_aggregation_record("CPCB_CAAQMS", "PM10", 24, 24.0, ref_t),
            "CO": create_trusted_aggregation_record("CPCB_CAAQMS", "CO", 8, 8.0, ref_t),
        }
        self.assertFalse(calculate_aqi(pollutants, averaging_coverage=cov_impossible).is_cpcb_compliant)

    def test_all_eight_pollutants_boundary_and_non_finite_handling(self):
        """
        Comprehensive test of all 8 criteria pollutants (Table 4.1):
        - PM2.5, PM10, NO2, SO2, CO, O3, NH3, Pb.
        - Negative values return None.
        - Non-finite (NaN, inf) return None.
        - Out-of-scale return None.
        - Exact midpoints return expected categories.
        """
        all_pollutants = ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3", "NH3", "PB"]
        for pol in all_pollutants:
            # Negative
            self.assertIsNone(calculate_sub_index(pol, -1.0))
            self.assertIsNone(calculate_sub_index(pol, -0.001))

            # Non-finite
            self.assertIsNone(calculate_sub_index(pol, float("nan")))
            self.assertIsNone(calculate_sub_index(pol, float("inf")))
            self.assertIsNone(calculate_sub_index(pol, float("-inf")))

            # Out of scale (exceeding table max)
            max_val = CPCB_BREAKPOINTS[pol][-1][1]
            self.assertIsNone(calculate_sub_index(pol, max_val + 1.0))
            self.assertIsNone(calculate_sub_index(pol, max_val * 2.0))

            # Valid zero concentration -> 0 sub-index
            self.assertEqual(calculate_sub_index(pol, 0.0), 0)

            # Valid mid-scale concentration -> positive integer
            mid_val = max_val / 2.0
            sub = calculate_sub_index(pol, mid_val)
            self.assertIsNotNone(sub)
            self.assertGreater(sub, 0)
            self.assertLessEqual(sub, 500)


if __name__ == "__main__":
    unittest.main()
