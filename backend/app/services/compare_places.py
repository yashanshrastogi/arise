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
    aqi: Optional[int] = Field(default=None, ge=0)
    category: str = "Unavailable"
    dominant_pollutant: str = "None"
    verdict: str = "BE_SMART"
    temperature: Optional[float] = None
    wind_speed: Optional[float] = None
    relative_ranking: Optional[int] = None # 1 = cleanest, None for unavailable


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
            temp = snap.weather.temperature if snap.weather else None
            wind = snap.weather.wind_speed if snap.weather else None
            items.append(PlaceComparisonResult(
                label=p.label,
                latitude=p.latitude,
                longitude=p.longitude,
                aqi=snap.aqi,
                category=snap.aqi_category or "Unavailable",
                dominant_pollutant=snap.dominant_pollutant or "None",
                verdict=snap.verdict or "BE_SMART",
                temperature=temp,
                wind_speed=wind,
                relative_ranking=None
            ))

        # Separate items with valid AQI from unavailable
        valid_items = [it for it in items if it.aqi is not None]
        unavailable_items = [it for it in items if it.aqi is None]

        # Sort valid items by AQI ascending (lower is cleaner)
        valid_items.sort(key=lambda x: x.aqi)
        for rank, item in enumerate(valid_items, 1):
            item.relative_ranking = rank

        # Unavailable items retain relative_ranking = None (never ranked as 0 or fabricated)
        sorted_results = valid_items + unavailable_items

        if len(valid_items) > 1:
            cleanest = valid_items[0].label
            worst = valid_items[-1].label
            diff = valid_items[-1].aqi - valid_items[0].aqi
            rec = f"{cleanest} currently has the lowest exposure risk (AQI {valid_items[0].aqi}). "
            if diff > 30:
                rec += f"{worst} is substantially more polluted (+{diff} AQI). Shift outdoor periods towards {cleanest}."
            else:
                rec += "Regional pollution conditions are relatively uniform across the monitored basin."
            if unavailable_items:
                rec += f" Note: Air quality is currently unavailable for {', '.join(u.label for u in unavailable_items)}."
        elif len(valid_items) == 1:
            cleanest = valid_items[0].label
            worst = valid_items[0].label
            unav_labels = ", ".join(u.label for u in unavailable_items)
            rec = f"{cleanest} has monitored air quality (AQI {valid_items[0].aqi}). Air quality telemetry is unavailable for {unav_labels}."
        else:
            cleanest = "None"
            worst = "None"
            rec = "Air quality telemetry is currently unavailable for all requested locations."

        return ComparePlacesResponse(
            results=sorted_results,
            cleanest_place=cleanest,
            worst_place=worst,
            recommendation=rec
        )
