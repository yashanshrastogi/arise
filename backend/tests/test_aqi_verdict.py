import unittest
from app.domain.aqi import calculate_aqi, calculate_sub_index, get_aqi_category
from app.domain.models import EnvironmentalSnapshot, WeatherSnapshot, FireSignal, AirMeasurement
from app.domain.verdict import evaluate_environment, get_base_verdict


class TestAqiVerdictEngine(unittest.TestCase):
    def test_cpcb_sub_index_calculations(self):
        # PM2.5 15 -> Good (25)
        sub1 = calculate_sub_index("PM2.5", 15.0)
        self.assertEqual(sub1, 25)

        # PM2.5 142.5 -> Very Poor (~317 or ~312 range)
        sub2 = calculate_sub_index("PM2.5", 142.5)
        self.assertGreaterEqual(sub2, 301)
        self.assertLessEqual(sub2, 330)

        # PM10 210.3 -> Moderate (~174)
        sub3 = calculate_sub_index("PM10", 210.3)
        self.assertGreaterEqual(sub3, 101)
        self.assertLessEqual(sub3, 200)

    def test_dominant_pollutant_selection(self):
        # PM2.5 has higher sub-index than PM10 and NO2
        pollutants = {
            "PM2.5": 142.5, # sub ~317
            "PM10": 100.0,  # sub 100
            "NO2": 40.0     # sub 50
        }
        res = calculate_aqi(pollutants)
        self.assertEqual(res.dominant_pollutant, "PM2.5")
        self.assertGreaterEqual(res.aqi, 301)
        self.assertEqual(res.category, "Very Poor")

    def test_boundary_categories(self):
        cat, col = get_aqi_category(45)
        self.assertEqual(cat, "Good")
        cat, col = get_aqi_category(85)
        self.assertEqual(cat, "Satisfactory")
        cat, col = get_aqi_category(150)
        self.assertEqual(cat, "Moderate")
        cat, col = get_aqi_category(250)
        self.assertEqual(cat, "Poor")
        cat, col = get_aqi_category(350)
        self.assertEqual(cat, "Very Poor")
        cat, col = get_aqi_category(450)
        self.assertEqual(cat, "Severe")

    def test_verdict_thresholds_general_public(self):
        self.assertEqual(get_base_verdict(80), "GO")
        self.assertEqual(get_base_verdict(150), "BE_SMART")
        self.assertEqual(get_base_verdict(250), "CUT_BACK")
        self.assertEqual(get_base_verdict(312), "STAY_IN")

    def test_persona_vulnerability_escalation(self):
        snap_moderate = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-08T10:00:00Z",
            aqi=150,
            aqi_category="Moderate",
            dominant_pollutant="PM2.5",
            pollutants={"PM2.5": AirMeasurement(pollutant="PM2.5", value=75.0, timestamp="2026-10-08T10:00:00Z")}
        )

        # General Public: BE_SMART
        v_gen = evaluate_environment(snap_moderate, persona="General Public")
        self.assertEqual(v_gen.verdict, "BE_SMART")

        # Child/Parent: Escalated to CUT_BACK
        v_child = evaluate_environment(snap_moderate, persona="Child/Parent")
        self.assertEqual(v_child.verdict, "CUT_BACK")

        # Elderly/Asthma: Escalated to CUT_BACK
        v_elder = evaluate_environment(snap_moderate, persona="Elderly/Asthma")
        self.assertEqual(v_elder.verdict, "CUT_BACK")

    def test_school_action_cancellation(self):
        snap_severe = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-08T10:00:00Z",
            aqi=312,
            aqi_category="Very Poor",
            dominant_pollutant="PM2.5",
            pollutants={"PM2.5": AirMeasurement(pollutant="PM2.5", value=142.5, timestamp="2026-10-08T10:00:00Z")}
        )
        v_school = evaluate_environment(snap_severe, persona="School Admin")
        self.assertEqual(v_school.verdict, "STAY_IN")
        self.assertEqual(v_school.school_action, "CANCEL")

    def test_fire_signal_wording(self):
        snap_with_fire = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-08T10:00:00Z",
            aqi=312,
            aqi_category="Very Poor",
            dominant_pollutant="PM2.5",
            pollutants={"PM2.5": AirMeasurement(pollutant="PM2.5", value=142.5, timestamp="2026-10-08T10:00:00Z")},
            fire_signals=[FireSignal(latitude=29.5, longitude=76.8, acquisition_time="2026-10-08T08:00:00Z")]
        )
        v = evaluate_environment(snap_with_fire)
        fire_why = next((w for w in v.why if w["type"] == "fire"), None)
        self.assertIsNotNone(fire_why)
        self.assertIn("signal", fire_why["detail"].lower())
        self.assertNotIn("caused", fire_why["detail"].lower())


if __name__ == "__main__":
    unittest.main()
