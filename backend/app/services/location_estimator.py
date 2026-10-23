import math
import logging
from typing import List, Dict, Optional, Tuple
from pydantic import BaseModel, Field

from app.domain.models import StationObservation, AirMeasurement

logger = logging.getLogger(__name__)


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in kilometers."""
    R = 6371.0 # Earth's mean radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 3)


class LocalAirEstimation(BaseModel):
    """Result of Inverse Distance Weighting (IDW) interpolation from nearby stations."""
    latitude: float
    longitude: float
    estimated_pollutants: Dict[str, float] = Field(default_factory=dict)
    contributing_stations: List[StationObservation] = Field(default_factory=list)
    nearest_station_id: Optional[str] = None
    nearest_station_name: Optional[str] = None
    nearest_station_distance_km: Optional[float] = None
    estimation_quality: str = "moderate" # exact_match, high, moderate, low, unavailable
    confidence: str = "moderate"


class LocationEstimator:
    """
    Inverse Distance Weighting (IDW) engine for estimating local air quality.
    Selects up to k nearest stations, computes weights, and interpolates pollutant concentrations.
    """

    def __init__(self, power: float = 2.0, max_stations: int = 5, max_radius_km: float = 50.0):
        self.power = power
        self.max_stations = max_stations
        self.max_radius_km = max_radius_km

    def estimate_location_pollutants(
        self,
        target_lat: float,
        target_lon: float,
        stations: List[StationObservation]
    ) -> LocalAirEstimation:
        """
        Estimate local pollutant concentrations from candidate ground stations.
        """
        if not stations:
            return LocalAirEstimation(
                latitude=target_lat,
                longitude=target_lon,
                estimation_quality="unavailable",
                confidence="low"
            )

        # 1. Calculate distance for candidate stations within max_radius_km
        # Prefer fresh stations; if all available stations are stale (e.g. outage fallback), allow stale within radius
        has_fresh = any(not st.is_stale for st in stations)
        candidate_stations: List[Tuple[float, StationObservation]] = []
        for st in stations:
            if has_fresh and st.is_stale:
                continue
            dist = haversine_distance_km(target_lat, target_lon, st.latitude, st.longitude)
            if dist <= self.max_radius_km:
                # Store distance on station model
                st_copy = st.model_copy()
                st_copy.distance_km = dist
                candidate_stations.append((dist, st_copy))

        if not candidate_stations:
            return LocalAirEstimation(
                latitude=target_lat,
                longitude=target_lon,
                estimated_pollutants={},
                contributing_stations=[],
                nearest_station_id=None,
                nearest_station_name=None,
                nearest_station_distance_km=None,
                estimation_quality="unavailable",
                confidence="low"
            )

        # Sort by distance
        candidate_stations.sort(key=lambda x: x[0])
        selected_candidates = candidate_stations[:self.max_stations]

        # Check for zero distance / exact match (< 50 meters)
        if selected_candidates and selected_candidates[0][0] < 0.05:
            nearest_dist, nearest_st = selected_candidates[0]
            pollutants = {
                k: m.value for k, m in nearest_st.pollutants.items()
            }
            nearest_st.weight = 1.0
            return LocalAirEstimation(
                latitude=target_lat,
                longitude=target_lon,
                estimated_pollutants=pollutants,
                contributing_stations=[nearest_st],
                nearest_station_id=nearest_st.station_id,
                nearest_station_name=nearest_st.name,
                nearest_station_distance_km=nearest_dist,
                estimation_quality="exact_match",
                confidence="high"
            )

        # Calculate IDW weights for each candidate
        # w_i = 1 / (d_i ^ p)
        raw_weights = [1.0 / (max(d, 0.01) ** self.power) for d, _ in selected_candidates]
        sum_raw_weights = sum(raw_weights)
        norm_weights = [w / sum_raw_weights for w in raw_weights]

        # Attach normalized weight to contributing stations
        contributing: List[StationObservation] = []
        for i, (_, st) in enumerate(selected_candidates):
            st.weight = round(norm_weights[i], 4)
            contributing.append(st)

        # Interpolate each pollutant independently
        # Only stations measuring pollutant p contribute to p
        all_pollutants = set()
        for _, st in selected_candidates:
            all_pollutants.update(st.pollutants.keys())

        estimated_values: Dict[str, float] = {}
        for pol in all_pollutants:
            pol_weights_sum = 0.0
            pol_val_sum = 0.0
            for i, (_, st) in enumerate(selected_candidates):
                if pol in st.pollutants:
                    w = raw_weights[i]
                    val = st.pollutants[pol].value
                    pol_weights_sum += w
                    pol_val_sum += w * val
            if pol_weights_sum > 0:
                dec = 2 if pol == "CO" else 1
                estimated_values[pol] = round(pol_val_sum / pol_weights_sum, dec)

        # Determine estimation quality & confidence
        num_contributors = len(contributing)
        closest_dist = selected_candidates[0][0]

        if num_contributors >= 3 and closest_dist <= 15.0:
            quality = "high"
            confidence = "high"
        elif num_contributors >= 2 and closest_dist <= 25.0:
            quality = "moderate"
            confidence = "moderate"
        elif num_contributors >= 1:
            quality = "single_station" if num_contributors == 1 else "low"
            confidence = "low"
        else:
            quality = "unavailable"
            confidence = "low"

        return LocalAirEstimation(
            latitude=target_lat,
            longitude=target_lon,
            estimated_pollutants=estimated_values,
            contributing_stations=contributing,
            nearest_station_id=contributing[0].station_id if contributing else None,
            nearest_station_name=contributing[0].name if contributing else None,
            nearest_station_distance_km=closest_dist,
            estimation_quality=quality,
            confidence=confidence
        )
