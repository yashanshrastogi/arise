import os
import unittest
from app.core.config import Settings, get_settings


class TestConfig(unittest.TestCase):
    def test_default_local_config(self):
        settings = Settings()
        self.assertEqual(settings.MODE, "local")
        self.assertEqual(settings.AWS_REGION, "us-east-1")
        self.assertIsNone(settings.OPENAQ_API_KEY)
        self.assertFalse(settings.is_secret_set("OPENAQ_API_KEY"))
        self.assertEqual(settings.CACHE_TTL_SECONDS, 1800)
        self.assertEqual(settings.API_TIMEOUT_SECONDS, 10.0)

    def test_secret_masking(self):
        settings = Settings(
            OPENAQ_API_KEY="mock_sample_openaq_key_val_12345",
            FIRMS_MAP_KEY="mock_sample_firms_key_val_67890"
        )
        self.assertTrue(settings.is_secret_set("OPENAQ_API_KEY"))
        # Secrets must never appear in repr or str
        repr_str = repr(settings)
        self.assertNotIn("mock_sample_openaq_key_val_12345", repr_str)
        self.assertNotIn("mock_sample_firms_key_val_67890", repr_str)
        self.assertIn("******", repr_str)
        
        # safe_dict masks secrets
        safe_data = settings.safe_dict()
        self.assertEqual(safe_data["OPENAQ_API_KEY"], "******")
        self.assertEqual(safe_data["FIRMS_MAP_KEY"], "******")

    def test_malformed_numeric_values(self):
        with self.assertRaises(ValueError):
            Settings(CACHE_TTL_SECONDS=-10)

        with self.assertRaises(ValueError):
            Settings(API_TIMEOUT_SECONDS=0)

    def test_mode_normalization(self):
        settings = Settings(MODE="LOCAL")
        self.assertEqual(settings.MODE, "local")
        settings_aws = Settings(MODE="AWS", AWS_REGION="ap-south-1")
        self.assertEqual(settings_aws.MODE, "aws")

        with self.assertRaises(ValueError):
            Settings(MODE="invalid_mode")


if __name__ == "__main__":
    unittest.main()
