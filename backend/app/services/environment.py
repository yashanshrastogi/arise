import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from app.domain.models import EnvironmentalSnapshot, AirMeasurement, StationObservation
from app.domain.aqi import calculate_aqi, get_aqi_category
from app.domain.verdict import evaluate_environment, VerdictOutput
from app.services.air_quality import AirQualityService
from app.services.location_estimator import LocationEstimator
from app.sources.weather import OpenMeteoWeatherProvider
from app.services.forecast import ForecastService
from app.sources.firms import FirmsFireProvider

logger = logging.getLogger(__name__)


class EnvironmentService:
    """
    Central environmental intelligence pipeline service.
    Orchestrates air quality, IDW spatial interpolation, weather, forecast,
    fire signals, and deterministic verdict calculation into a single coherent snapshot.
    """

    def __init__(
        self,
        air_service: Optional[AirQualityService] = None,
        estimator: Optional[LocationEstimator] = None,
        weather_provider: Optional[OpenMeteoWeatherProvider] = None,
        forecast_service: Optional[ForecastService] = None,
        fire_provider: Optional[FirmsFireProvider] = None,
    ):
        self.air_service = air_service or AirQualityService()
        self.estimator = estimator or LocationEstimator()
        self.weather_provider = weather_provider or OpenMeteoWeatherProvider()
        self.forecast_service = forecast_service or ForecastService()
        self.fire_provider = fire_provider or FirmsFireProvider()

    async def get_environmental_snapshot(
        self,
        lat: float = 28.6139,
        lon: float = 77.2090,
        persona: str = "General Public",
        force_demo: bool = False
    ) -> EnvironmentalSnapshot:
        """Execute the full environmental pipeline for a target coordinate."""
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()

        # 1. Fetch monitoring stations in basin
        stations = await self.air_service.get_stations(lat, lon, force_demo=force_demo)

        # 2. Estimate local pollutant concentrations via IDW
        estimation = self.estimator.estimate_location_pollutants(lat, lon, stations)
        pollutant_values = estimation.estimated_pollutants

        # 3. Deterministic AQI calculation
        aqi_result = calculate_aqi(pollutant_values)

        # Map pollutant dictionary to canonical models
        pollutants_map: Dict[str, AirMeasurement] = {}
        for pol, val in pollutant_values.items():
            unit = "mg/m³" if pol == "CO" else "µg/m³"
            sub_idx = aqi_result.sub_indices.get(pol)
            pollutants_map[pol] = AirMeasurement(
                pollutant=pol,
                value=round(val, 1),
                unit=unit,
                timestamp=now_iso,
                source=stations[0].source if stations else "DEMO",
                quality="valid",
                aqi_sub_index=sub_idx
            )

        # 4. Meteorology
        try:
            weather = await self.weather_provider.get_current_weather(lat, lon, force_demo=force_demo)
        except Exception as e:
            logger.warning(f"Error from weather provider: {e}")
            weather = None

        # 5. Forecast & Best Window
        try:
            forecast_bundle = await self.forecast_service.get_forecast(
                lat, lon, current_aqi=aqi_result.aqi, force_demo=force_demo
            )
            best_window = forecast_bundle.get("bestWindow", "No recommended outdoor window")
        except Exception as e:
            logger.warning(f"Error from forecast service: {e}")
            best_window = "No recommended outdoor window"

        # 6. Satellite Fire Signals
        try:
            fire_signals = await self.fire_provider.get_regional_fire_signals(lat, lon, force_demo=force_demo)
        except Exception as e:
            logger.warning(f"Error from fire provider: {e}")
            fire_signals = []

        # 7. Intermediate Snapshot — derive specific user location from nearest stations (IDW)
        if estimation.contributing_stations:
            nearest_station = estimation.contributing_stations[0].name
            num_st = min(3, len(estimation.contributing_stations))
            loc_label = f"{nearest_station} & Surrounds ({num_st}-Station IDW)"
        else:
            loc_label = f"{round(lat, 4)}°N, {round(lon, 4)}°E (Spatial IDW)"

        snapshot = EnvironmentalSnapshot(
            location=loc_label,
            latitude=lat,
            longitude=lon,
            timestamp=now_iso,
            aqi=aqi_result.aqi,
            aqi_category=aqi_result.category,
            dominant_pollutant=aqi_result.dominant_pollutant,
            pollutants=pollutants_map,
            contributing_stations=estimation.contributing_stations,
            weather=weather,
            fire_signals=fire_signals,
            best_window=best_window,
            recheck_at="4:00 PM",
            is_demo=force_demo or any(s.source == "DEMO" for s in stations),
            is_stale=any(s.is_stale for s in stations) or (weather.is_stale if weather else False),
            data_quality="reliable" if estimation.estimation_quality in ("high", "exact_match") else "degraded"
        )

        # 8. Deterministic Verdict Engine
        verdict_res: VerdictOutput = evaluate_environment(snapshot, persona=persona)
        snapshot.verdict = verdict_res.verdict
        snapshot.verdict_headline = verdict_res.headline
        snapshot.recommendation = verdict_res.recommendation
        snapshot.why_factors = verdict_res.why
        snapshot.sources = verdict_res.sources

        return snapshot

    def format_ui_payload(self, snapshot: EnvironmentalSnapshot, forecast_bundle: Dict[str, Any]) -> Dict[str, Any]:
        """Convert canonical snapshot into frontend-ready JSON payload matching React components."""
        # Pollutants list for PollutantCards.jsx
        pollutants_ui = []
        cpcb_desc = {
            "PM2.5": "Very fine particles that penetrate deep into the lungs (<2.5 µm)",
            "PM10": "Coarse dust particles from roads, soil, and construction (<10 µm)",
            "NO2": "Nitrogen Dioxide primarily emitted from vehicle exhaust",
            "SO2": "Sulfur Dioxide produced by industrial fuel burning",
            "CO": "Carbon Monoxide gas from incomplete combustion",
            "O3": "Ground-level Ozone formed by sunlight reacting with emissions",
        }

        for name in ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"]:
            m = snapshot.pollutants.get(name)
            if m:
                sub_val = m.aqi_sub_index if m.aqi_sub_index is not None else 50
                cat, _ = get_aqi_category(sub_val)
                pollutants_ui.append({
                    "name": "NO₂" if name == "NO2" else ("SO₂" if name == "SO2" else ("O₃" if name == "O3" else name)),
                    "value": m.value,
                    "unit": m.unit,
                    "aqi": sub_val,
                    "status": cat,
                    "pct": min(100, int((m.value / 150.0) * 100)) if name == "PM2.5" else min(100, int((m.value / 250.0) * 100)),
                    "dominant": (name == snapshot.dominant_pollutant),
                    "desc": cpcb_desc.get(name, "Atmospheric pollutant")
                })

        # Stations for AirMap.jsx
        stations_pool = snapshot.contributing_stations
        stations_ui = [
            {
                "id": getattr(st, "station_id", idx + 1),
                "name": st.name,
                "lat": st.latitude,
                "lng": st.longitude,
                "aqi": getattr(st, "aqi", None) or snapshot.aqi,
                "pm25": (st.pollutants.get("PM2.5").value if (getattr(st, "pollutants", None) and "PM2.5" in st.pollutants) else 140.0),
                "pm10": (st.pollutants.get("PM10").value if (getattr(st, "pollutants", None) and "PM10" in st.pollutants) else 200.0),
                "temp": snapshot.weather.temperature if snapshot.weather else 28,
                "rain": 10,
                "wind": snapshot.weather.wind_speed if snapshot.weather else 3.2,
                "source": getattr(st, "source", "CPCB"),
                "isDominant": (st.name == (snapshot.contributing_stations[0].name if snapshot.contributing_stations else ""))
            }
            for idx, st in enumerate(stations_pool)
        ]

        # Fires for AirMap.jsx
        fires_ui = [
            {
                "id": idx + 100,
                "lat": f.latitude,
                "lng": f.longitude,
                "intensity": f.confidence,
                "source": f.source,
                "isDemo": (f.source == "DEMO"),
            }
            for idx, f in enumerate(snapshot.fire_signals)
        ]

        # Weather dict
        weather_dict = snapshot.weather.model_dump() if snapshot.weather else {}
        weather_dict["temp"] = snapshot.weather.temperature if snapshot.weather else 28
        weather_dict["feelsLike"] = snapshot.weather.feels_like if snapshot.weather else 30
        weather_dict["windSpeed"] = snapshot.weather.wind_speed if snapshot.weather else 3.2
        weather_dict["windDirection"] = snapshot.weather.wind_direction if snapshot.weather else "NW"
        weather_dict["windDegrees"] = snapshot.weather.wind_degrees if snapshot.weather else 315
        weather_dict["rainProb"] = snapshot.weather.rain_probability if snapshot.weather else 10
        weather_dict["cloudCover"] = snapshot.weather.cloud_cover if snapshot.weather else 40
        weather_dict["condition"] = snapshot.weather.condition_text if snapshot.weather else "Hazy Sunshine"
        weather_dict["icon"] = "🌤️"
        weather_dict["correlation"] = snapshot.weather.correlation_text if snapshot.weather else "Calm winds limiting dispersion."
        weather_dict["uvIndex"] = getattr(snapshot.weather, "uv_index", 5.0) or 5.0
        weather_dict["visibility"] = getattr(snapshot.weather, "visibility", 2.8) or 2.8
        weather_dict["sunrise"] = "6:22 AM"
        weather_dict["sunset"] = "5:54 PM"

        return {
            "location": snapshot.location,
            "updated": "Live Telemetry" if not snapshot.is_demo else "Saved Severe Event (Demo)",
            "aqi": snapshot.aqi,
            "status": snapshot.aqi_category,
            "aqi_category": snapshot.aqi_category,
            "verdict": (snapshot.verdict or "STAY IN").replace("_", " "),
            "verdictCode": snapshot.verdict or "STAY_IN",
            "recommendation": snapshot.recommendation or "Outdoor exposure should be minimized today.",
            "bestWindow": snapshot.best_window or "3 PM – 5 PM",
            "recheckAt": snapshot.recheck_at or "4:00 PM",
            "dominantPollutant": snapshot.dominant_pollutant,
            "dominant_pollutant": snapshot.dominant_pollutant,
            "confidence": "High" if snapshot.data_quality == "reliable" else "Moderate",
            "dataQuality": snapshot.data_quality,
            "isDemo": snapshot.is_demo,
            "isStale": snapshot.is_stale,
            "sources": snapshot.sources,
            "contributingStations": [st.model_dump() for st in snapshot.contributing_stations],
            "why": snapshot.why_factors,
            "weather": weather_dict,
            "pollutants": pollutants_ui,
            "forecast": forecast_bundle.get("hourly", []),
            "forecast7Day": forecast_bundle.get("forecast7Day", []),
            "stations": stations_ui,
            "fires": fires_ui,
            "school": {
                "action": "CANCEL" if snapshot.aqi > 250 else ("MODIFY" if snapshot.aqi > 100 else "GO"),
                "question": "Should outdoor school activity continue?",
                "indoorPm25": 45.2,
                "indoorCo2": 850,
                "ventilation": "Recirculating (Simulated Demo)"
            },
            "watchlist": [
                {"name": "Home", "location": "Saket", "lat": 28.524, "lon": 77.206, "aqi": snapshot.aqi, "status": snapshot.aqi_category},
                {"name": "School", "location": "Vasant Kunj", "lat": 28.529, "lon": 77.154, "aqi": min(500, snapshot.aqi + 8), "status": snapshot.aqi_category},
                {"name": "Office", "location": "Connaught Pl.", "lat": 28.631, "lon": 77.219, "aqi": max(50, snapshot.aqi - 17), "status": snapshot.aqi_category}
            ],
            "traffic": {
                "corridors": [
                    {
                        "id": "c1",
                        "name": "Delhi → Noida (DND Flyway)",
                        "status": "Heavy (Simulated Demo)",
                        "delay": "+18 min",
                        "normalTime": "24 min",
                        "currentTime": "42 min",
                        "visibility": "2.2 km",
                        "smogImpact": "Severe haze on Yamuna riverfront",
                        "recommendation": "Leave 20 min earlier. Use car AC recirculation."
                    },
                    {
                        "id": "c2",
                        "name": "Delhi → Gurugram (NH-48)",
                        "status": "Moderate (Simulated Demo)",
                        "delay": "+11 min",
                        "normalTime": "35 min",
                        "currentTime": "46 min",
                        "visibility": "2.8 km",
                        "smogImpact": "Low visibility near Dhaula Kuan",
                        "recommendation": "Allow 15 min buffer. Keep headlights on low beam."
                    }
                ]
            }
        }
