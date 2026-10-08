import unittest
from pydantic import ValidationError
from app.domain.models import (
    AirMeasurement,
    StationObservation,
    WeatherSnapshot,
    ForecastPoint,
    FireSignal,
    EnvironmentalSnapshot
)


class TestDomainModels(unittest.TestCase):
    def test_air_measurement_normalization(self):
        m = AirMeasurement(
            pollutant="pm2.5",
            value=142.5,
            timestamp="2026-10-08T10:00:00Z",
            source="CPCB"
        )
        self.assertEqual(m.pollutant, "PM2.5")
        self.assertEqual(m.value, 142.5)
        self.assertEqual(m.quality, "valid")

    def test_air_measurement_invalid_value(self):
        with self.assertRaises(ValidationError):
            AirMeasurement(
                pollutant="PM10",
                value=-5.0, # Negative value invalid
                timestamp="2026-10-08T10:00:00Z"
            )

    def test_station_observation(self):
        st = StationObservation(
            station_id="st-ito-01",
            name="ITO, Delhi",
            latitude=28.6289,
            longitude=77.2412,
            timestamp="2026-10-08T10:00:00Z",
            source="CPCB"
        )
        self.assertEqual(st.name, "ITO, Delhi")
        self.assertFalse(st.is_stale)

    def test_weather_snapshot_bounds(self):
        w = WeatherSnapshot(
            timestamp="2026-10-08T10:00:00Z",
            temperature=28.0,
            feels_like=30.0,
            humidity=58.0,
            wind_speed=3.2,
            wind_direction="NW"
        )
        self.assertEqual(w.humidity, 58.0)
        
        # Invalid humidity > 100%
        with self.assertRaises(ValidationError):
            WeatherSnapshot(
                timestamp="2026-10-08T10:00:00Z",
                temperature=28.0,
                feels_like=30.0,
                humidity=150.0,
                wind_speed=3.2,
                wind_direction="NW"
            )

    def test_fire_signal_signal_terminology(self):
        fire = FireSignal(
            latitude=29.52,
            longitude=76.82,
            acquisition_time="2026-10-08T08:30:00Z",
            satellite="VIIRS",
            source="NASA-FIRMS"
        )
        self.assertTrue(fire.is_signal)
        self.assertIn("signal", fire.display_text.lower())

    def test_environmental_snapshot(self):
        snap = EnvironmentalSnapshot(
            location="Delhi-NCR",
            latitude=28.6139,
            longitude=77.2090,
            timestamp="2026-10-08T10:00:00Z",
            aqi=312,
            aqi_category="Very Poor",
            dominant_pollutant="PM2.5"
        )
        self.assertEqual(snap.aqi, 312)
        self.assertEqual(snap.aqi_category, "Very Poor")


if __name__ == "__main__":
    unittest.main()
