import logging
from typing import List, Optional
from app.core.config import get_settings
from app.domain.models import StationObservation
from app.sources.base import BaseAirQualityProvider
from app.sources.openaq import OpenAQProvider
from app.sources.demo import DemoAirProvider

logger = logging.getLogger(__name__)


class AirQualityService:
    """
    Air quality domain service.
    Orchestrates live providers (OpenAQ, CPCB) with graceful fallback to calibrated demo data.
    Ensures the system never crashes when external air APIs are unavailable or unauthenticated.
    """

    def __init__(
        self,
        primary_provider: Optional[BaseAirQualityProvider] = None,
        fallback_provider: Optional[BaseAirQualityProvider] = None
    ):
        settings = get_settings()
        self.primary_provider = primary_provider or OpenAQProvider(
            api_key=settings.OPENAQ_API_KEY,
            timeout=settings.API_TIMEOUT_SECONDS
        )
        self.fallback_provider = fallback_provider or DemoAirProvider()

    async def get_stations(
        self,
        lat: float,
        lon: float,
        radius_km: float = 35.0,
        force_demo: bool = False
    ) -> List[StationObservation]:
        """
        Retrieve ground station observations near target coordinates.
        Uses primary live provider if configured and available; falls back to demo data.
        """
        if force_demo:
            logger.info("Demo mode requested: returning deterministic demo stations.")
            return await self.fallback_provider.get_nearby_stations(lat, lon, radius_km)

        # Attempt primary live provider
        try:
            stations = await self.primary_provider.get_nearby_stations(lat, lon, radius_km)
            if stations:
                logger.info(f"Retrieved {len(stations)} stations from primary provider {self.primary_provider.name}.")
                return stations
            else:
                logger.warning(f"Primary provider {self.primary_provider.name} returned 0 stations. Using fallback.")
        except Exception as e:
            logger.error(f"Error querying primary provider {self.primary_provider.name}: {e}. Using fallback.")

        # Fallback to calibrated demo network
        return await self.fallback_provider.get_nearby_stations(lat, lon, radius_km)
