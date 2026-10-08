from fastapi import APIRouter, Query
from app.services.air_quality import AirQualityService
from app.services.location_estimator import LocationEstimator
from app.domain.aqi import calculate_aqi

router = APIRouter(tags=["Air Quality"])
air_service = AirQualityService()
estimator = LocationEstimator()


@router.get("/air/now")
async def get_air_now(
    lat: float = Query(default=28.6139, ge=-90.0, le=90.0),
    lon: float = Query(default=77.2090, ge=-180.0, le=180.0),
    demo: bool = Query(default=False)
):
    """Retrieve ground stations and IDW-interpolated air quality for coordinates."""
    stations = await air_service.get_stations(lat, lon, force_demo=demo)
    estimation = estimator.estimate_location_pollutants(lat, lon, stations)
    aqi_res = calculate_aqi(estimation.estimated_pollutants)

    return {
        "location": {"latitude": lat, "longitude": lon},
        "aqi": aqi_res.aqi,
        "category": aqi_res.category,
        "color": aqi_res.color,
        "dominant_pollutant": aqi_res.dominant_pollutant,
        "pollutants": estimation.estimated_pollutants,
        "quality": estimation.estimation_quality,
        "confidence": estimation.confidence,
        "stations_count": len(stations),
        "contributing_stations": [
            {
                "id": s.station_id,
                "name": s.name,
                "distance_km": s.distance_km,
                "weight": s.weight,
                "source": s.source
            }
            for s in estimation.contributing_stations
        ]
    }
