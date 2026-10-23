"""
Environmental Data Fusion Engine.
Implements safe multi-source fusion for surface meteorology and atmospheric air quality
across India with explicit source-selection policies, disagreement thresholds, and provenance transparency.

ARCHITECTURAL INVARIANTS:
1. Deterministic Science: CPCB NAQI math and safety verdicts are calculated in the domain layer.
   Never average provider AQI numbers; always compute AQI from validated pollutant concentrations.
2. Ground-First Hierarchy: Validated ground monitoring stations (CPCB/OpenAQ within 35 km) strictly
   take precedence over regional numerical models.
3. Model Fallback: When no ground stations exist in range (e.g. remote or tier-2/3 Indian cities),
   regional atmospheric numerical models (Open-Meteo CAMS, OpenWeather, Tomorrow.io) provide
   honest modelled estimates (tagged as data_type='modelled').
4. Non-Delhi Isolation: Never leak or substitute Delhi stations or baseline demo stations into
   non-Delhi coordinates (e.g. Mumbai, Bengaluru, Chennai, Kolkata, Srinagar, Guwahati).
5. Disagreement Detection: Compares concurrent weather sources and records divergence exceeding
   meteorological thresholds (±3.0°C temp, ±15% humidity, ±8 km/h wind).
6. Zero Fabrication: When both ground monitors and models are unavailable, return honest
   aqi=None, category='Unavailable', data_type='unavailable'.
"""

import logging
import math
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple

from app.domain.models import (
    EnvironmentalSnapshot,
    WeatherSnapshot,
    AirMeasurement,
    StationObservation,
    LocationSelection,
)
from app.domain.aqi import calculate_aqi, get_aqi_category
from app.domain.verdict import evaluate_environment, VerdictOutput
from app.services.location_estimator import LocationEstimator, haversine_distance_km

logger = logging.getLogger(__name__)

# Meteorological disagreement thresholds for co-located, concurrent readings
WEATHER_DISAGREEMENT_THRESHOLDS = {
    "temperature_c": 3.0,     # ±3.0 °C
    "humidity_pct": 15.0,     # ±15 %
    "wind_speed_kmh": 8.0,    # ±8 km/h
    "pressure_hpa": 5.0,      # ±5 hPa
}


class EnvironmentalFusionEngine:
    """
    Central environmental telemetry fusion engine.
    Orchestrates multi-source validation, disagreement analysis, and provenance labeling.
    """

    def __init__(self, estimator: Optional[LocationEstimator] = None):
        self.estimator = estimator or LocationEstimator()

    def fuse_weather(
        self,
        primary_snap: Optional[WeatherSnapshot],
        secondary_snaps: Optional[List[WeatherSnapshot]] = None,
    ) -> Tuple[Optional[WeatherSnapshot], Dict[str, Any]]:
        """
        Fuse multiple weather telemetry streams.
        Selects primary provider (Open-Meteo NWP) while cross-checking against any available
        secondary providers (OpenWeather, Tomorrow.io).

        Returns:
            Tuple of (Selected WeatherSnapshot, Disagreement & Provenance Details Dict)
        """
        secondary_snaps = [s for s in (secondary_snaps or []) if s is not None and s.temperature is not None]

        # Case 1: Primary available, no secondary
        if primary_snap and primary_snap.temperature is not None and not secondary_snaps:
            return primary_snap, {
                "fusion_policy": "primary_only",
                "selected_source": primary_snap.source,
                "data_provenance": primary_snap.data_provenance,
                "disagreement_detected": False,
                "disagreement_details": None,
                "secondary_sources_checked": [],
            }

        # Case 2: Primary missing, secondary available
        if (not primary_snap or primary_snap.temperature is None) and secondary_snaps:
            chosen = secondary_snaps[0]
            return chosen, {
                "fusion_policy": "secondary_fallback",
                "selected_source": chosen.source,
                "data_provenance": chosen.data_provenance,
                "disagreement_detected": False,
                "disagreement_details": None,
                "secondary_sources_checked": [s.source for s in secondary_snaps],
            }

        # Case 3: Both primary and secondary available -> Cross-check for meteorological agreement
        if primary_snap and primary_snap.temperature is not None and secondary_snaps:
            disagreements = {}
            for sec in secondary_snaps:
                diff_temp = abs((primary_snap.temperature or 0.0) - (sec.temperature or 0.0))
                diff_humidity = abs((primary_snap.humidity or 0.0) - (sec.humidity or 0.0))
                diff_wind = abs((primary_snap.wind_speed or 0.0) - (sec.wind_speed or 0.0))

                exceeds = (
                    diff_temp > WEATHER_DISAGREEMENT_THRESHOLDS["temperature_c"]
                    or diff_humidity > WEATHER_DISAGREEMENT_THRESHOLDS["humidity_pct"]
                    or diff_wind > WEATHER_DISAGREEMENT_THRESHOLDS["wind_speed_kmh"]
                )

                if exceeds:
                    disagreements[sec.source] = {
                        "delta_temp_c": round(diff_temp, 1),
                        "delta_humidity_pct": round(diff_humidity, 1),
                        "delta_wind_kmh": round(diff_wind, 1),
                        "secondary_temp": sec.temperature,
                        "secondary_humidity": sec.humidity,
                        "secondary_wind": sec.wind_speed,
                    }

            # If secondary is genuine station observation (e.g. METAR/airport from OpenWeather)
            # and within range, we give weight to the physical reading
            selected = primary_snap
            policy = "primary_nwp_validated"

            # Check if a physical station observation should be preferred
            for sec in secondary_snaps:
                if sec.data_provenance == "station_observation" and sec.source == "OpenWeather":
                    # Keep Open-Meteo for comprehensive cloud/pressure/UV fields, but annotate station alignment
                    policy = "primary_nwp_station_crosschecked"

            return selected, {
                "fusion_policy": policy,
                "selected_source": selected.source,
                "data_provenance": selected.data_provenance,
                "disagreement_detected": bool(disagreements),
                "disagreement_details": disagreements if disagreements else None,
                "secondary_sources_checked": [s.source for s in secondary_snaps],
            }

        # Case 4: Neither primary nor secondary available
        return None, {
            "fusion_policy": "all_unavailable",
            "selected_source": "Unavailable",
            "data_provenance": "degraded",
            "disagreement_detected": False,
            "disagreement_details": None,
            "secondary_sources_checked": [],
        }

    def fuse_air_quality(
        self,
        lat: float,
        lon: float,
        ground_stations: List[StationObservation],
        model_payloads: Optional[List[Dict[str, Any]]] = None,
        max_ground_radius_km: float = 35.0,
    ) -> Dict[str, Any]:
        """
        Fuse air quality telemetry using Ground-First Hierarchy:
        1. Ground Stations (CPCB/OpenAQ): Filter to radius <= 35km; run IDW.
           Tag as data_type='observed'.
        2. Atmospheric Numerical Models (Open-Meteo CAMS, OpenWeather, Tomorrow.io):
           Used ONLY when ground stations within 35km are absent.
           Tag as data_type='modelled'.
        3. Deterministic AQI: Run calculate_aqi() on raw concentrations.
        4. Zero Fabrication: If neither ground stations nor models have coverage,
           return aqi=None, category='Unavailable', data_type='unavailable'.
        """
        now_iso = datetime.now(timezone.utc).isoformat()

        # Step 1: Filter ground stations within valid physical radius
        nearby_stations = []
        for s in ground_stations:
            dist = s.distance_km
            if dist is None and s.latitude is not None and s.longitude is not None:
                dist = haversine_distance_km(lat, lon, s.latitude, s.longitude)
                s.distance_km = round(dist, 2)
            if dist is not None and dist <= max_ground_radius_km:
                nearby_stations.append(s)

        if nearby_stations:
            # Use spatial interpolation (IDW) across nearby ground stations
            estimation = self.estimator.estimate_location_pollutants(lat, lon, nearby_stations)
            pollutant_values = estimation.estimated_pollutants

            if estimation.contributing_stations and pollutant_values:
                aqi_res = calculate_aqi(pollutant_values, has_verified_averaging=False)
                return {
                    "data_type": "observed",
                    "provenance_description": "Ground station observations (IDW spatial interpolation)",
                    "primary_source": nearby_stations[0].source,
                    "contributing_stations": estimation.contributing_stations,
                    "pollutant_values": pollutant_values,
                    "aqi_result": aqi_res,
                    "aqi": aqi_res.aqi,
                    "category": aqi_res.category,
                    "dominant_pollutant": aqi_res.dominant_pollutant,
                    "is_cpcb_compliant": aqi_res.is_cpcb_compliant,
                    "quality": "reliable" if estimation.estimation_quality in ("high", "exact_match") else "degraded",
                }

        # Step 2: No ground stations in range -> Fall back to regional atmospheric numerical models
        valid_models = [m for m in (model_payloads or []) if m and m.get("pollutants")]
        if valid_models:
            chosen_model = valid_models[0]
            pollutants = chosen_model.get("pollutants", {})
            model_src = chosen_model.get("source", "Open-Meteo Air Quality Model")

            if pollutants:
                aqi_res = calculate_aqi(pollutants, has_verified_averaging=False)
                return {
                    "data_type": "modelled",
                    "provenance_description": f"Regional atmospheric numerical model ({model_src})",
                    "primary_source": model_src,
                    "contributing_stations": [],
                    "pollutant_values": pollutants,
                    "aqi_result": aqi_res,
                    "aqi": aqi_res.aqi,
                    "category": aqi_res.category,
                    "dominant_pollutant": aqi_res.dominant_pollutant,
                    "is_cpcb_compliant": aqi_res.is_cpcb_compliant,
                    "quality": "degraded",  # Modelled data is categorized as degraded relative to official ground monitors
                }

        # Step 3: Zero Coverage -> Clean unavailable response without dummy numbers
        return {
            "data_type": "unavailable",
            "provenance_description": "No ground monitors or atmospheric models available for target coordinates",
            "primary_source": "Unavailable",
            "contributing_stations": [],
            "pollutant_values": {},
            "aqi_result": None,
            "aqi": None,
            "category": "Unavailable",
            "dominant_pollutant": "None",
            "is_cpcb_compliant": False,
            "quality": "degraded",
        }
