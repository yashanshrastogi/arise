import unittest
from app.domain.models import StationObservation, AirMeasurement
from app.services.location_estimator import LocationEstimator, haversine_distance_km


class TestLocationEstimator(unittest.TestCase):
    def setUp(self):
        self.estimator = LocationEstimator()
        
        # 3 mock stations around Central Delhi (28.6139, 77.2090)
        # Station 1: ITO (close: ~3.5 km)
        self.st1 = StationObservation(
            station_id="st-ito",
            name="ITO",
            latitude=28.6289,
            longitude=77.2412,
            pollutants={
                "PM2.5": AirMeasurement(pollutant="PM2.5", value=140.0, timestamp="2026-10-08T10:00:00Z"),
                "PM10": AirMeasurement(pollutant="PM10", value=200.0, timestamp="2026-10-08T10:00:00Z"),
            },
            timestamp="2026-10-08T10:00:00Z"
        )
        # Station 2: RK Puram (~6.5 km)
        self.st2 = StationObservation(
            station_id="st-rkp",
            name="RK Puram",
            latitude=28.5635,
            longitude=77.1724,
            pollutants={
                "PM2.5": AirMeasurement(pollutant="PM2.5", value=120.0, timestamp="2026-10-08T10:00:00Z"),
                "PM10": AirMeasurement(pollutant="PM10", value=180.0, timestamp="2026-10-08T10:00:00Z"),
            },
            timestamp="2026-10-08T10:00:00Z"
        )
        # Station 3: Dwarka (~16.5 km)
        self.st3 = StationObservation(
            station_id="st-dwk",
            name="Dwarka",
            latitude=28.5921,
            longitude=77.0460,
            pollutants={
                "PM2.5": AirMeasurement(pollutant="PM2.5", value=100.0, timestamp="2026-10-08T10:00:00Z"),
                "O3": AirMeasurement(pollutant="O3", value=35.0, timestamp="2026-10-08T10:00:00Z"),
            },
            timestamp="2026-10-08T10:00:00Z"
        )

    def test_haversine_accuracy(self):
        # Distance between ITO and RK Puram
        d = haversine_distance_km(28.6289, 77.2412, 28.5635, 77.1724)
        self.assertGreater(d, 9.0)
        self.assertLess(d, 12.0)

    def test_three_valid_stations_idw(self):
        # Target at Connaught Place
        res = self.estimator.estimate_location_pollutants(28.6315, 77.2167, [self.st1, self.st2, self.st3])
        self.assertEqual(len(res.contributing_stations), 3)
        self.assertEqual(res.estimation_quality, "high")
        
        # Closer station (ITO) must have the highest weight
        ito_weight = next(s.weight for s in res.contributing_stations if s.station_id == "st-ito")
        dwk_weight = next(s.weight for s in res.contributing_stations if s.station_id == "st-dwk")
        self.assertGreater(ito_weight, dwk_weight)
        
        # Interpolated PM2.5 must be between min and max
        self.assertGreater(res.estimated_pollutants["PM2.5"], 100.0)
        self.assertLess(res.estimated_pollutants["PM2.5"], 140.0)

    def test_zero_distance_exact_match(self):
        # Target exactly at ITO coordinates
        res = self.estimator.estimate_location_pollutants(28.6289, 77.2412, [self.st1, self.st2, self.st3])
        self.assertEqual(res.estimation_quality, "exact_match")
        self.assertEqual(res.nearest_station_id, "st-ito")
        self.assertEqual(res.estimated_pollutants["PM2.5"], 140.0)

    def test_two_stations(self):
        res = self.estimator.estimate_location_pollutants(28.6139, 77.2090, [self.st1, self.st2])
        self.assertEqual(len(res.contributing_stations), 2)
        self.assertIn(res.estimation_quality, ("high", "moderate"))

    def test_single_station(self):
        res = self.estimator.estimate_location_pollutants(28.6139, 77.2090, [self.st1])
        self.assertEqual(len(res.contributing_stations), 1)
        self.assertEqual(res.estimation_quality, "single_station")
        self.assertEqual(res.estimated_pollutants["PM2.5"], 140.0)

    def test_stale_station_exclusion(self):
        stale_st1 = self.st1.model_copy()
        stale_st1.is_stale = True
        res = self.estimator.estimate_location_pollutants(28.6139, 77.2090, [stale_st1, self.st2])
        # Stale station must be excluded
        self.assertEqual(len(res.contributing_stations), 1)
        self.assertEqual(res.nearest_station_id, "st-rkp")

    def test_missing_pollutant_handling(self):
        # Only Dwarka reports O3
        res = self.estimator.estimate_location_pollutants(28.6139, 77.2090, [self.st1, self.st2, self.st3])
        self.assertIn("O3", res.estimated_pollutants)
        self.assertEqual(res.estimated_pollutants["O3"], 35.0)

    def test_distant_stations_enforce_max_radius_unavailable(self):
        """Regression test for Priority 1: London coordinates cannot receive distant Delhi station data."""
        london_lat, london_lon = 51.5074, -0.1278
        res = self.estimator.estimate_location_pollutants(london_lat, london_lon, [self.st1, self.st2, self.st3])
        self.assertEqual(res.estimation_quality, "unavailable")
        self.assertEqual(len(res.contributing_stations), 0)
        self.assertEqual(len(res.estimated_pollutants), 0)
        self.assertIsNone(res.nearest_station_id)
        self.assertIsNone(res.nearest_station_distance_km)

    def test_distant_stations_with_empty_station_list(self):
        """Regression test: Empty station list for London returns unavailable without fabrication."""
        london_lat, london_lon = 51.5074, -0.1278
        res = self.estimator.estimate_location_pollutants(london_lat, london_lon, [])
        self.assertEqual(res.estimation_quality, "unavailable")
        self.assertEqual(len(res.contributing_stations), 0)
        self.assertEqual(len(res.estimated_pollutants), 0)


if __name__ == "__main__":
    unittest.main()
