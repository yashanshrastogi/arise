import unittest
import time
import os
import shutil
from datetime import datetime, timezone, timedelta
from app.cache.repository import MemoryCacheRepository, JsonFileCacheRepository, CacheEntry


class TestCacheRepository(unittest.TestCase):
    def setUp(self):
        self.test_cache_dir = "data/test_cache"
        os.makedirs(self.test_cache_dir, exist_ok=True)

    def tearDown(self):
        if os.path.exists(self.test_cache_dir):
            shutil.rmtree(self.test_cache_dir)

    def test_memory_cache_hit_and_miss(self):
        cache = MemoryCacheRepository()
        self.assertIsNone(cache.get("missing_key"))

        cache.set("key1", {"aqi": 312}, ttl_seconds=60, source="CPCB")
        entry = cache.get("key1")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.value["aqi"], 312)
        self.assertEqual(entry.source, "CPCB")
        self.assertEqual(entry.status, "fresh")
        self.assertFalse(entry.is_expired)

    def test_stale_while_revalidate_behavior(self):
        cache = MemoryCacheRepository()
        # Set entry with negative/expired TTL directly
        now = datetime.now(timezone.utc)
        expired_entry = CacheEntry(
            key="stale_key",
            value={"temp": 28},
            fetched_at=(now - timedelta(seconds=2000)).isoformat(),
            expires_at=(now - timedelta(seconds=100)).isoformat(),
            source="Open-Meteo",
            ttl_seconds=1800
        )
        cache._store["stale_key"] = expired_entry

        # allow_stale=True should return stale entry
        stale_hit = cache.get("stale_key", allow_stale=True)
        self.assertIsNotNone(stale_hit)
        self.assertEqual(stale_hit.status, "stale")
        self.assertTrue(stale_hit.is_expired)

        # allow_stale=False should reject stale entry
        strict_hit = cache.get("stale_key", allow_stale=False)
        self.assertIsNone(strict_hit)

    def test_json_file_cache_persistence(self):
        cache1 = JsonFileCacheRepository(cache_dir=self.test_cache_dir)
        cache1.set("persisted_key", {"data": "verified"}, ttl_seconds=300)

        # Instantiate second cache pointing to same directory
        cache2 = JsonFileCacheRepository(cache_dir=self.test_cache_dir)
        entry = cache2.get("persisted_key")
        self.assertIsNotNone(entry)
        self.assertEqual(entry.value["data"], "verified")


if __name__ == "__main__":
    unittest.main()
