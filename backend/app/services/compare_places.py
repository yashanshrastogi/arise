import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from app.services.environment import EnvironmentService

logger = logging.getLogger(__name__)


class PlaceTarget(BaseModel):
    label: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)


class PlaceComparisonResult(BaseModel):
    label: str
    latitude: float
    longitude: float
    aqi: int
    category: str
    dominant_pollutant: str
    verdict: str
    temperature: float
    wind_speed: float
    relative_ranking: int # 1 = cleanest


class ComparePlacesResponse(BaseModel):
    results: List[PlaceComparisonResult]
    cleanest_place: str
    worst_place: str
    recommendation: str


class ComparePlacesService:
    """Service to compare environmental conditions across multiple user locations (Home vs School vs Office)."""

    def __init__(self, env_service: Optional[EnvironmentService] = None):
        self.env_service = env_service or EnvironmentService()

    async def compare_locations(self, places: List[PlaceTarget], force_demo: bool = False) -> ComparePlacesResponse:
        """Compare multiple places and produce comparative actionable guidance."""
        items: List[PlaceComparisonResult] = []

        for p in places:
            snap = await self.env_service.get_environmental_snapshot(
                lat=p.latitude, lon=p.longitude, force_demo=force_demo
            )
            items.append(PlaceComparisonResult(
                label=p.label,
                latitude=p.latitude,
                longitude=p.longitude,
                aqi=snap.aqi,
                category=snap.aqi_category,
                dominant_pollutant=snap.dominant_pollutant,
                verdict=snap.verdict or "STAY_IN",
                temperature=snap.weather.temperature if snap.weather else 28.0,
                wind_speed=snap.weather.wind_speed if snap.weather else 3.2,
                relative_ranking=1 # placeholder
            ))

        # Sort by AQI ascending (lower is cleaner)
        items.sort(key=lambda x: x.aqi)
        for rank, item in enumerate(items, 1):
            item.relative_ranking = rank

        cleanest = items[0].label if items else "None"
        worst = items[-1].label if items else "None"
        
        diff = items[-1].aqi - items[0].aqi if len(items) > 1 else 0
        rec = f"{cleanest} currently has the lowest exposure risk (AQI {items[0].aqi}). "
        if diff > 30:
            rec += f"{worst} is substantially more polluted (+{diff} AQI). Shift outdoor periods towards {cleanest}."
        else:
            rec += "Regional pollution conditions are relatively uniform across the monitored basin."

        return ComparePlacesResponse(
            results=items,
            cleanest_place=cleanest,
            worst_place=worst,
            recommendation=rec
        )
