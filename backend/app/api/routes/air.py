from fastapi import APIRouter, Query
from app.services.air_quality import AirQualityService
from app.services.location_estimator import LocationEstimator
from app.domain.aqi import calculate_aqi

from app.services.fusion import EnvironmentalFusionEngine
from app.sources.weather import OpenMeteoWeatherProvider

router = APIRouter(tags=["Air Quality"])
air_service = AirQualityService()
estimator = LocationEstimator()
fusion_engine = EnvironmentalFusionEngine(estimator=estimator)
weather_provider = OpenMeteoWeatherProvider()


@router.get("/air/now")
async def get_air_now(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180"),
    demo: bool = Query(default=False)
):
    """Retrieve ground stations and IDW-interpolated air quality for coordinates with regional model fallback."""
    stations = await air_service.get_stations(lat, lon, force_demo=demo)
    nearby_stations = [s for s in stations if s.distance_km is not None and s.distance_km <= 35.0]

    if not nearby_stations:
        return {
            "location": {"latitude": lat, "longitude": lon},
            "aqi": None,
            "category": "Unavailable",
            "color": "#94a3b8",
            "dominant_pollutant": "None",
            "pollutants": {},
            "quality": "unavailable",
            "confidence": "low",
            "stations_count": len(stations),
            "contributing_stations": [],
            "is_cpcb_compliant": False,
            "data_type": "unavailable"
        }

    aq_fusion = fusion_engine.fuse_air_quality(lat, lon, stations)
    aqi_res = aq_fusion.get("aqi_result")
    contributing_stations = aq_fusion.get("contributing_stations", [])
    data_type = aq_fusion.get("data_type", "unavailable")

    if data_type == "unavailable" or not aq_fusion.get("pollutant_values") or not aqi_res:
        return {
            "location": {"latitude": lat, "longitude": lon},
            "aqi": None,
            "category": "Unavailable",
            "color": "#94a3b8",
            "dominant_pollutant": "None",
            "pollutants": {},
            "quality": "unavailable",
            "confidence": "low",
            "stations_count": len(stations),
            "contributing_stations": [],
            "is_cpcb_compliant": False,
            "data_type": "unavailable"
        }

    return {
        "location": {"latitude": lat, "longitude": lon},
        "aqi": aqi_res.aqi,
        "category": aqi_res.category,
        "color": aqi_res.color,
        "dominant_pollutant": aqi_res.dominant_pollutant,
        "pollutants": aq_fusion["pollutant_values"],
        "quality": aq_fusion.get("quality", "reliable"),
        "confidence": "high" if data_type == "observed" else "moderate",
        "stations_count": len(stations),
        "contributing_stations": [
            {
                "id": s.station_id,
                "name": s.name,
                "distance_km": s.distance_km,
                "weight": s.weight,
                "source": s.source
            }
            for s in contributing_stations
        ],
        "is_cpcb_compliant": aqi_res.is_cpcb_compliant,
        "data_type": data_type
    }
