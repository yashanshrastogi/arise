from abc import ABC, abstractmethod
from typing import List, Optional
from app.domain.models import StationObservation, AirMeasurement


class BaseAirQualityProvider(ABC):
    """Abstract interface for air quality data sources."""
    name: str = "BaseAirQualityProvider"

    @abstractmethod
    async def get_nearby_stations(
        self,
        lat: float,
        lon: float,
        radius_km: float = 35.0
    ) -> List[StationObservation]:
        """Retrieve monitoring station observations near the target coordinate."""
        pass

    @abstractmethod
    async def get_station_details(
        self,
        station_id: str
    ) -> Optional[StationObservation]:
        """Retrieve detailed measurements for a single station."""
        pass
