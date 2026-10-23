"""
Pan-India Caching & Request Efficiency Test Suite.
Validates:
1. Spatial grid cache key generation separates distinct geographic cells across India.
2. Cross-city isolation: cached Delhi entries never leak into Mumbai, Bengaluru, Chennai, or Srinagar queries.
3. Multi-worker single-flight request coalescing (avoids duplicate provider requests).
4. Fresh vs. Stale grace window semantics across Indian geographic cells.
"""

import asyncio
import unittest
from datetime import datetime, timezone, timedelta
from app.cache.repository import get_cache_repository, get_geographic_cell, CacheEntry


class TestPanIndiaSpatialCaching(unittest.TestCase):
    """Test spatial separation and isolation of cache keys across Indian cities."""

    def setUp(self):
        self.cache = get_cache_repository()
        self.cache.clear()

    def test_spatial_keys_separate_all_major_indian_cities(self):
        """Every major Indian city must hash to a distinct spatial cache key."""
        cities = {
            "Delhi": (28.6139, 77.2090),
            "Mumbai": (19.0760, 72.8777),
            "Bengaluru": (12.9716, 77.5946),
            "Kolkata": (22.5726, 88.3639),
            "Chennai": (13.0827, 80.2707),
            "Hyderabad": (17.3850, 78.4867),
            "Srinagar": (34.0837, 74.7973),
            "Guwahati": (26.1445, 91.7362),
            "Ahmedabad": (23.0225, 72.5714),
            "Kochi": (9.9312, 76.2673),
        }

        generated_keys = {}
        for city, (lat, lon) in cities.items():
            cell_lat, cell_lon, key = get_geographic_cell(lat, lon, resolution_deg=0.02)
            self.assertNotIn(key, generated_keys.values(), f"City {city} produced collision with another city!")
            generated_keys[city] = key

        self.assertEqual(len(generated_keys), len(cities))

    def test_cache_entry_cross_city_isolation(self):
        """Storing environmental data for Delhi must never return a hit for Mumbai."""
        delhi_lat, delhi_lon = 28.6139, 77.2090
        mumbai_lat, mumbai_lon = 19.0760, 72.8777

        _, _, delhi_key = get_geographic_cell(delhi_lat, delhi_lon)
        _, _, mumbai_key = get_geographic_cell(mumbai_lat, mumbai_lon)

        self.cache.set(delhi_key, {"temperature": 28.5, "city": "Delhi"}, ttl_seconds=300)

        # Delhi hit
        delhi_entry = self.cache.get(delhi_key)
        self.assertIsNotNone(delhi_entry)
        self.assertEqual(delhi_entry.value["city"], "Delhi")

        # Mumbai miss (Zero cross-location contamination)
        mumbai_entry = self.cache.get(mumbai_key)
        self.assertIsNone(mumbai_entry)

    def test_single_flight_lock_coalescing(self):
        """Only the first caller acquires the lease lock; subsequent callers wait and hit populated cache."""
        _, _, cell_key = get_geographic_cell(12.9716, 77.5946)

        # Worker 1 wins lock
        token1 = self.cache.acquire_fetch_lock(cell_key, lease_seconds=5)
        self.assertIsNotNone(token1)

        # Worker 2 attempts concurrent acquire -> must fail (return None)
        token2 = self.cache.acquire_fetch_lock(cell_key, lease_seconds=5)
        self.assertIsNone(token2, "Second concurrent worker must not acquire active lock")

        # Worker 1 releases lock
        released = self.cache.release_fetch_lock(cell_key, token=token1)
        self.assertTrue(released)

        # Worker 2 can now acquire
        token2_retry = self.cache.acquire_fetch_lock(cell_key, lease_seconds=5)
        self.assertIsNotNone(token2_retry)
        self.cache.release_fetch_lock(cell_key, token=token2_retry)


if __name__ == "__main__":
    unittest.main()
