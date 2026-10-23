import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, Any, Optional, List

from app.domain.models import EnvironmentalSnapshot, AirMeasurement, StationObservation
from app.domain.aqi import calculate_aqi, get_aqi_category
from app.domain.verdict import evaluate_environment, VerdictOutput
from app.services.air_quality import AirQualityService
from app.services.location_estimator import LocationEstimator, haversine_distance_km
from app.sources.weather import OpenMeteoWeatherProvider
from app.services.forecast import ForecastService
from app.sources.firms import FirmsFireProvider

from app.services.fusion import EnvironmentalFusionEngine

logger = logging.getLogger(__name__)


def _build_dynamic_corridors(lat: float, lon: float, location_name: str, aqi: Optional[int], weather_dict: dict) -> List[dict]:
    loc_lower = (location_name or "").lower()
    base_aqi = aqi if aqi is not None else 180
    vis_val = weather_dict.get("visibility") if weather_dict else None
    vis_str = f"{vis_val:.1f} km" if isinstance(vis_val, (int, float)) else "3.2 km"

    # 1. Noida (lat ~28.57, lon ~77.35)
    if "noida" in loc_lower or (28.48 <= lat <= 28.66 and 77.29 <= lon <= 77.46):
        return [
            {
                "id": "c_noida_1",
                "name": "Noida-Greater Noida Expressway (Sec 18 → Pari Chowk)",
                "status": "Peak Flow & Highway Delay",
                "delay": "+12 min",
                "normalTime": "22 min",
                "currentTime": "34 min",
                "visibility": vis_str,
                "aqi": max(50, base_aqi - 5),
                "airBand": "Moderate" if base_aqi < 200 else "Poor",
                "route": "Sector 18 · Advant Navis · Knowledge Park · Pari Chowk",
                "environmentalImpact": "High vehicular speed produces re-suspended road dust along expressway",
                "recommendation": "Keep vehicle ventilation on internal recirculation during peak hours.",
                "transitAdvice": "Arterial expressway traffic; cabin air recirculation protects against particulate surges.",
            },
            {
                "id": "c_noida_2",
                "name": "DND Flyway & Sector 62 Link",
                "status": "Moderate Congestion",
                "delay": "+15 min",
                "normalTime": "20 min",
                "currentTime": "35 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 12),
                "airBand": "Moderate" if base_aqi < 200 else "Poor",
                "route": "Mayur Vihar Link · Film City · Sector 62 Corridor",
                "environmentalImpact": "Riverfront moisture traps localized vehicular exhaust near toll gates",
                "recommendation": "Allow 15 min travel buffer. Roll up car windows.",
                "transitAdvice": "High diesel commercial vehicle concentration during evening commute.",
            },
            {
                "id": "c_noida_3",
                "name": "Delhi-Meerut Expressway / NH-24 (Akshardham → Indirapuram)",
                "status": "Dense Arterial Corridor",
                "delay": "+16 min",
                "normalTime": "24 min",
                "currentTime": "40 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 18),
                "airBand": "Poor" if base_aqi > 150 else "Moderate",
                "route": "Akshardham · Ghazipur · Indirapuram · Model Town Crossing",
                "environmentalImpact": "Underpass areas experience trapped particulate concentration",
                "recommendation": "Use Blue Line Metro or keep vehicle AC in closed loop.",
                "transitAdvice": "Heavy arterial transit; avoid open two-wheeler travel without N95 mask.",
            },
        ]

    # 2. Gurugram (lat ~28.45, lon ~77.02)
    if "gurugram" in loc_lower or "gurgaon" in loc_lower or (28.38 <= lat <= 28.55 and 76.92 <= lon <= 77.12):
        return [
            {
                "id": "c_ggn_1",
                "name": "NH-48 Expressway (Rajiv Chowk → Cyber City)",
                "status": "Heavy Arterial Delay",
                "delay": "+19 min",
                "normalTime": "25 min",
                "currentTime": "44 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 10),
                "airBand": "Poor" if base_aqi > 150 else "Moderate",
                "route": "Rajiv Chowk · IFFCO Chowk · Shankar Chowk · Cyber City",
                "environmentalImpact": "Peak hour stop-and-go exhaust accumulation between IFFCO and Shankar Chowk",
                "recommendation": "Allow 20 min buffer. Keep cabin air recirculation sealed.",
                "transitAdvice": "Dense peak hour vehicle exhaust traps PM2.5 in underpasses.",
            },
            {
                "id": "c_ggn_2",
                "name": "Golf Course Road & Extension Corridor",
                "status": "Moderate Flow",
                "delay": "+8 min",
                "normalTime": "16 min",
                "currentTime": "24 min",
                "visibility": vis_str,
                "aqi": max(50, base_aqi - 8),
                "airBand": "Moderate" if base_aqi < 200 else "Poor",
                "route": "Sector 54 · Sector 56 · Southern Peripheral Road Link",
                "environmentalImpact": "Aravalli proximity provides moderate atmospheric mixing",
                "recommendation": "Smooth flow observed; low ventilation risk.",
                "transitAdvice": "Routine commute precautions apply.",
            },
            {
                "id": "c_ggn_3",
                "name": "Dwarka Expressway Link (Bajghera → Kherki Daula)",
                "status": "Smooth Transit",
                "delay": "+6 min",
                "normalTime": "20 min",
                "currentTime": "26 min",
                "visibility": vis_str,
                "aqi": max(50, base_aqi - 2),
                "airBand": "Moderate" if base_aqi < 200 else "Poor",
                "route": "Bajghera · Sector 84 · Kherki Daula Cloverleaf",
                "environmentalImpact": "Open elevated corridor maintains steady crosswind ventilation",
                "recommendation": "Preferred bypass alternative to NH-48 during morning rush.",
                "transitAdvice": "Optimal transit corridor with lower tailpipe exposure.",
            },
        ]

    # 3. Ghaziabad (lat ~28.67, lon ~77.45)
    if "ghaziabad" in loc_lower or (28.60 <= lat <= 28.76 and 77.36 <= lon <= 77.56):
        return [
            {
                "id": "c_gzb_1",
                "name": "Delhi-Meerut Expressway (UP Gate → Dasna)",
                "status": "Expressway Transit",
                "delay": "+11 min",
                "normalTime": "20 min",
                "currentTime": "31 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 14),
                "airBand": "Poor" if base_aqi > 150 else "Moderate",
                "route": "UP Gate · Vijay Nagar · Lal Kuan · Dasna Interchange",
                "environmentalImpact": "Heavy inter-state freight transit generates particulate spikes",
                "recommendation": "Keep vehicle windows rolled up and cabin AC on recirculation.",
                "transitAdvice": "Elevated corridor experiences diesel exhaust convergence during night shifts.",
            },
            {
                "id": "c_gzb_2",
                "name": "Hindon Elevated Road (Raj Nagar Ext → UP Gate)",
                "status": "Fast Arterial Link",
                "delay": "+7 min",
                "normalTime": "14 min",
                "currentTime": "21 min",
                "visibility": vis_str,
                "aqi": base_aqi,
                "airBand": "Moderate" if base_aqi < 200 else "Poor",
                "route": "Raj Nagar Extension · Karhera · Kanawani · UP Gate",
                "environmentalImpact": "Elevated bridge design allows wind mixing above surface dust layer",
                "recommendation": "Preferred quick link avoiding GT road congestion.",
                "transitAdvice": "Normal travel precautions apply.",
            },
            {
                "id": "c_gzb_3",
                "name": "GT Road Arterial (Mohan Nagar → Dilshad Garden)",
                "status": "Arterial Congestion",
                "delay": "+16 min",
                "normalTime": "18 min",
                "currentTime": "34 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 22),
                "airBand": "Very Poor" if base_aqi > 250 else "Poor",
                "route": "Mohan Nagar · Arthala · Dilshad Garden Border",
                "environmentalImpact": "Dense street-level traffic traps ground dust between commercial complexes",
                "recommendation": "Use Red Line Metro (Dilshad Garden to Shaheed Sthal) when possible.",
                "transitAdvice": "Wear N95 masks when traveling by two-wheeler or auto-rickshaw.",
            },
        ]

    # 4. Mumbai (lat ~19.07, lon ~72.87)
    if "mumbai" in loc_lower or (18.85 <= lat <= 19.35 and 72.70 <= lon <= 73.10):
        return [
            {
                "id": "c_mum_1",
                "name": "Western Express Highway (Bandra → Borivali)",
                "status": "Heavy Traffic & Delays",
                "delay": "+22 min",
                "normalTime": "35 min",
                "currentTime": "57 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 15),
                "airBand": "Moderate",
                "route": "Kalanagar · Santacruz · Andheri Flyover · Goregaon · Borivali",
                "environmentalImpact": "Dense coastal traffic convergence; sea breeze helps afternoon dispersion",
                "recommendation": "Plan 25 min travel buffer. Keep vehicle AC on recirculation.",
                "transitAdvice": "High congestion along flyover ramps during evening rush.",
            },
            {
                "id": "c_mum_2",
                "name": "Eastern Freeway (Orange Gate → Chembur)",
                "status": "Smooth Arterial Flow",
                "delay": "+8 min",
                "normalTime": "18 min",
                "currentTime": "26 min",
                "visibility": vis_str,
                "aqi": base_aqi,
                "airBand": "Satisfactory" if base_aqi < 100 else "Moderate",
                "route": "Orange Gate · Wadala · Anik Junction · Chembur",
                "environmentalImpact": "Harbor-side wind mixing maintains healthy air dispersion",
                "recommendation": "Preferred south-north commute corridor.",
                "transitAdvice": "Good transit conditions.",
            },
            {
                "id": "c_mum_3",
                "name": "Coastal Road & Sea Link Link",
                "status": "Fast Coastal Flow",
                "delay": "+5 min",
                "normalTime": "15 min",
                "currentTime": "20 min",
                "visibility": vis_str,
                "aqi": max(30, base_aqi - 20),
                "airBand": "Good" if base_aqi < 60 else "Satisfactory",
                "route": "Marine Drive · Worli Seaface · Bandra-Worli Sea Link",
                "environmentalImpact": "Direct Arabian Sea marine winds provide maximum ventilation",
                "recommendation": "Excellent air corridor; open ventilation suitable.",
                "transitAdvice": "Clean coastal breeze with low particulate stagnation.",
            },
        ]

    # 5. Bengaluru (lat ~12.97, lon ~77.59)
    if "bengaluru" in loc_lower or "bangalore" in loc_lower or (12.80 <= lat <= 13.15 and 77.45 <= lon <= 77.75):
        return [
            {
                "id": "c_blr_1",
                "name": "Outer Ring Road (Silk Board → Marathahalli)",
                "status": "Heavy Tech Corridor Transit",
                "delay": "+25 min",
                "normalTime": "28 min",
                "currentTime": "53 min",
                "visibility": vis_str,
                "aqi": min(500, base_aqi + 18),
                "airBand": "Satisfactory" if base_aqi < 100 else "Moderate",
                "route": "Central Silk Board · HSR Layout · Bellandur · Marathahalli",
                "environmentalImpact": "Continuous tech park traffic creates localized particulate buildup",
                "recommendation": "Use BMTC Volvo bus or carpool; keep vehicle windows rolled up.",
                "transitAdvice": "Heavy commuter rush; avoid peak travel times if possible.",
            },
            {
                "id": "c_blr_2",
                "name": "Hosur Road Elevated Expressway (Electronic City Link)",
                "status": "Elevated Flow",
                "delay": "+9 min",
                "normalTime": "15 min",
                "currentTime": "24 min",
                "visibility": vis_str,
                "aqi": base_aqi,
                "airBand": "Satisfactory" if base_aqi < 100 else "Moderate",
                "route": "Madiwala · Bommanahalli · Electronic City Phase 1",
                "environmentalImpact": "Elevated transit avoids surface road dust",
                "recommendation": "Elevated highway recommended over surface Hosur road.",
                "transitAdvice": "Smooth flow on elevated tollway.",
            },
            {
                "id": "c_blr_3",
                "name": "Airport Road / Bellary Road (Hebbal → Yelahanka)",
                "status": "Steady Airport Flow",
                "delay": "+10 min",
                "normalTime": "22 min",
                "currentTime": "32 min",
                "visibility": vis_str,
                "aqi": max(40, base_aqi - 10),
                "airBand": "Good" if base_aqi < 50 else "Satisfactory",
                "route": "Hebbal Flyover · Kodigehalli · Jakkur · Yelahanka",
                "environmentalImpact": "Open northern terrain with good atmospheric mixing",
                "recommendation": "Reliable transit corridor with clear visibility.",
                "transitAdvice": "Normal precautions apply.",
            },
        ]

    # 6. Default Delhi / Regional Arterials
    city_name = location_name if location_name and "°" not in location_name and location_name not in ("Device Location", "Selected Area") else "Regional"
    return [
        {
            "id": "c_gen_1",
            "name": f"{city_name} Arterial Expressway" if city_name != "Regional" else "Outer Ring Road (Munirka → IIT → Nehru Place)",
            "status": "Moderate Traffic Flow",
            "delay": "+12 min",
            "normalTime": "24 min",
            "currentTime": "36 min",
            "visibility": vis_str,
            "aqi": base_aqi,
            "airBand": "Moderate" if base_aqi < 200 else "Poor",
            "route": f"Main Junction · City Center Link · Arterial Expressway",
            "environmentalImpact": "Peak hour stop-and-go exhaust accumulation near major intersections",
            "recommendation": "Keep vehicle AC on internal recirculation during transit.",
            "transitAdvice": "Roll up car windows in heavy traffic to reduce particulate inhalation.",
        },
        {
            "id": "c_gen_2",
            "name": f"{city_name} Ring Transit Link" if city_name != "Regional" else "Ring Road (Dhaula Kuan → AIIMS → Moolchand)",
            "status": "Highway Flow",
            "delay": "+9 min",
            "normalTime": "20 min",
            "currentTime": "29 min",
            "visibility": vis_str,
            "aqi": max(50, base_aqi - 10),
            "airBand": "Moderate" if base_aqi < 200 else "Satisfactory",
            "route": f"Outer Ring Interchange · Bypass Junction · Sector Link",
            "environmentalImpact": "Steady vehicular speed with active atmospheric mixing",
            "recommendation": "Allow 10 min buffer for highway interchanges.",
            "transitAdvice": "Prefer bypass roads during city center rush hours.",
        },
        {
            "id": "c_gen_3",
            "name": f"{city_name} Metro & Elevated Corridor" if city_name != "Regional" else "Delhi-Noida Direct (DND) / Barapullah Link",
            "status": "Smooth Transit Corridor",
            "delay": "+6 min",
            "normalTime": "18 min",
            "currentTime": "24 min",
            "visibility": vis_str,
            "aqi": min(500, base_aqi + 5),
            "airBand": "Moderate" if base_aqi < 200 else "Poor",
            "route": f"Station Link · Commercial Hub · Residential Sector",
            "environmentalImpact": "Bus and shared transit concentration along passenger hubs",
            "recommendation": "Use electric transit or metro when available.",
            "transitAdvice": "Avoid two-wheeler commutes during morning dust hours.",
        },
    ]


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
        fusion_engine: Optional[EnvironmentalFusionEngine] = None,
    ):
        self.air_service = air_service or AirQualityService()
        self.estimator = estimator or LocationEstimator()
        self.weather_provider = weather_provider or OpenMeteoWeatherProvider()
        self.forecast_service = forecast_service or ForecastService()
        self.fire_provider = fire_provider or FirmsFireProvider()
        self.fusion_engine = fusion_engine or EnvironmentalFusionEngine(estimator=self.estimator)

    async def get_environmental_snapshot(
        self,
        lat: float = 28.6139,
        lon: float = 77.2090,
        persona: str = "General Public",
        force_demo: bool = False,
        location_name: Optional[str] = None
    ) -> EnvironmentalSnapshot:
        """Execute the full environmental pipeline for a target coordinate."""
        now_dt = datetime.now(timezone.utc)
        now_iso = now_dt.isoformat()

        # 1. Fetch monitoring stations in basin
        stations = await self.air_service.get_stations(lat, lon, force_demo=force_demo)

        # 2. Check for nearby ground stations; if none in range, query regional atmospheric model
        for s in stations:
            if s.distance_km is None and s.latitude is not None and s.longitude is not None:
                s.distance_km = round(haversine_distance_km(lat, lon, s.latitude, s.longitude), 2)
        nearby_stations = [s for s in stations if s.distance_km is not None and s.distance_km <= 35.0]
        model_payloads: List[Dict[str, Any]] = []
        if not nearby_stations and not force_demo:
            try:
                raw_model = await self.weather_provider.get_current_air_quality(lat, lon)
                if raw_model:
                    mapped_pol = {}
                    if "pm2_5" in raw_model and raw_model["pm2_5"] is not None:
                        mapped_pol["PM2.5"] = float(raw_model["pm2_5"])
                    if "pm10" in raw_model and raw_model["pm10"] is not None:
                        mapped_pol["PM10"] = float(raw_model["pm10"])
                    if "nitrogen_dioxide" in raw_model and raw_model["nitrogen_dioxide"] is not None:
                        mapped_pol["NO2"] = float(raw_model["nitrogen_dioxide"])
                    if "sulphur_dioxide" in raw_model and raw_model["sulphur_dioxide"] is not None:
                        mapped_pol["SO2"] = float(raw_model["sulphur_dioxide"])
                    if "carbon_monoxide" in raw_model and raw_model["carbon_monoxide"] is not None:
                        mapped_pol["CO"] = round(float(raw_model["carbon_monoxide"]) / 1000.0, 3)
                    if "ozone" in raw_model and raw_model["ozone"] is not None:
                        mapped_pol["O3"] = float(raw_model["ozone"])
                    if mapped_pol:
                        model_payloads.append({
                            "source": "Open-Meteo Air Quality Model",
                            "pollutants": mapped_pol,
                        })
            except Exception as e:
                logger.warning(f"Error fetching model air quality for {lat}, {lon}: {e}")

            # Fallback to secondary provider air quality models if primary model is unavailable
            if not model_payloads and hasattr(self.weather_provider, "secondary_providers"):
                for sec_prov in (self.weather_provider.secondary_providers or []):
                    if hasattr(sec_prov, "get_air_pollution"):
                        try:
                            sec_air = await sec_prov.get_air_pollution(lat, lon)
                            if sec_air and sec_air.get("pollutants"):
                                model_payloads.append(sec_air)
                                break
                        except Exception as sec_err:
                            logger.warning(f"Secondary air pollution model ({sec_prov.name}) failed: {sec_err}")

        # 3. Fuse air quality telemetry
        aq_fusion = self.fusion_engine.fuse_air_quality(
            lat, lon, stations, model_payloads=model_payloads
        )

        aqi_result = aq_fusion.get("aqi_result")
        aqi_val = aq_fusion.get("aqi")
        aqi_cat = aq_fusion.get("category", "Unavailable")
        dom_pol = aq_fusion.get("dominant_pollutant", "None")
        contributing_stations = aq_fusion.get("contributing_stations", [])
        pollutant_values = aq_fusion.get("pollutant_values", {})
        data_type = aq_fusion.get("data_type", "unavailable")
        quality = aq_fusion.get("quality", "degraded")

        # Map pollutant dictionary to canonical models
        pollutants_map: Dict[str, AirMeasurement] = {}
        src_name = aq_fusion.get("primary_source") or (
            contributing_stations[0].source if contributing_stations else "Unavailable"
        )
        for pol, val in pollutant_values.items():
            unit = "mg/m³" if pol == "CO" else "µg/m³"
            sub_idx = aqi_result.sub_indices.get(pol) if aqi_result else None
            dec = 2 if pol == "CO" else 1
            pollutants_map[pol] = AirMeasurement(
                pollutant=pol,
                value=round(val, dec),
                unit=unit,
                timestamp=now_iso,
                source=src_name,
                quality="valid" if data_type == "observed" else "estimated",
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
                lat, lon, current_aqi=aqi_val, force_demo=force_demo
            )
            best_window = forecast_bundle.get("bestWindow", "No recommended outdoor window")
            best_window_details = forecast_bundle.get("bestWindowDetails")
        except Exception as e:
            logger.warning(f"Error from forecast service: {e}")
            best_window = "No recommended outdoor window"
            best_window_details = None

        # 6. Satellite Fire Signals
        try:
            fire_signals = await self.fire_provider.get_regional_fire_signals(lat, lon, force_demo=force_demo)
        except Exception as e:
            logger.warning(f"Error from fire provider: {e}")
            fire_signals = []

        # 7. Intermediate Snapshot — derive specific user location from nearest stations or model
        if location_name:
            loc_label = location_name
        elif contributing_stations:
            nearest_station = contributing_stations[0].name
            num_st = min(3, len(contributing_stations))
            loc_label = f"{nearest_station} & Surrounds ({num_st}-Station IDW)"
        elif data_type == "modelled":
            loc_label = f"{round(lat, 4)}°N, {round(lon, 4)}°E (Regional Model Estimate)"
        else:
            loc_label = f"{round(lat, 4)}°N, {round(lon, 4)}°E (No ground stations in range)"

        # Use local timezone from meteorology if available, else infer based on Indian coordinates
        is_india_coords = (6.0 <= lat <= 38.0 and 68.0 <= lon <= 98.0)
        default_tz = "Asia/Kolkata" if is_india_coords else "UTC"
        tz_name = getattr(weather, "local_timezone", None) or default_tz
        try:
            loc_tz = ZoneInfo(tz_name)
        except Exception:
            loc_tz = ZoneInfo("Asia/Kolkata") if is_india_coords else timezone.utc
        now_local = datetime.now(loc_tz)
        recheck_dt = now_local + timedelta(hours=3)
        recheck_hour = recheck_dt.hour
        # Cap recheck times to waking hours (do not ask citizens to check air at 2 AM or 3 AM)
        if recheck_hour < 6 or recheck_hour >= 22:
            recheck_label = "Tomorrow morning (7:00 AM)"
        else:
            recheck_label = recheck_dt.strftime("%-I:00 %p")

        snapshot = EnvironmentalSnapshot(
            location=loc_label,
            latitude=lat,
            longitude=lon,
            timestamp=now_iso,
            aqi=aqi_val,
            aqi_category=aqi_cat,
            dominant_pollutant=dom_pol,
            pollutants=pollutants_map,
            contributing_stations=contributing_stations,
            weather=weather,
            fire_signals=fire_signals,
            best_window=best_window,
            best_window_details=best_window_details,
            recheck_at=recheck_label,
            is_demo=force_demo or any(s.source == "DEMO" for s in stations),
            is_stale=any(s.is_stale for s in stations) or (weather.is_stale if weather else False),
            is_cpcb_compliant=aqi_result.is_cpcb_compliant if aqi_result else False,
            data_quality="reliable" if quality in ("high", "reliable", "exact_match") else "degraded"
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
        if snapshot.pollutants:
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
                display_name = "NO₂" if name == "NO2" else ("SO₂" if name == "SO2" else ("O₃" if name == "O3" else name))
                if m:
                    sub_val = m.aqi_sub_index if m.aqi_sub_index is not None else 50
                    cat, _ = get_aqi_category(sub_val)
                    val = round(m.value, 1) if isinstance(m.value, (int, float)) else m.value
                    pollutants_ui.append({
                        "name": display_name,
                        "value": val,
                        "unit": m.unit,
                        "aqi": sub_val,
                        "status": cat,
                        "pct": min(100, int((m.value / 150.0) * 100)) if name == "PM2.5" else min(100, int((m.value / 250.0) * 100)),
                        "dominant": (name == snapshot.dominant_pollutant),
                        "desc": cpcb_desc.get(name, "Atmospheric pollutant")
                    })
                else:
                    pollutants_ui.append({
                        "name": display_name,
                        "value": None,
                        "unit": "mg/m³" if name == "CO" else "µg/m³",
                        "aqi": None,
                        "status": "Unavailable",
                        "pct": 0,
                        "dominant": False,
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
                "aqi": getattr(st, "aqi", None) if getattr(st, "aqi", None) is not None else snapshot.aqi,
                "pm25": (st.pollutants.get("PM2.5").value if (getattr(st, "pollutants", None) and "PM2.5" in st.pollutants) else None),
                "pm10": (st.pollutants.get("PM10").value if (getattr(st, "pollutants", None) and "PM10" in st.pollutants) else None),
                "temp": snapshot.weather.temperature if snapshot.weather else None,
                "rain": getattr(snapshot.weather, "rain_probability", None) if snapshot.weather else None,
                "wind": snapshot.weather.wind_speed if snapshot.weather else None,
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
        if snapshot.weather:
            weather_dict = snapshot.weather.model_dump()
            weather_dict["temp"] = snapshot.weather.temperature
            weather_dict["feelsLike"] = snapshot.weather.feels_like
            weather_dict["windSpeed"] = snapshot.weather.wind_speed
            weather_dict["windDirection"] = snapshot.weather.wind_direction or "—"
            weather_dict["windDegrees"] = snapshot.weather.wind_degrees
            weather_dict["rainProb"] = snapshot.weather.rain_probability
            weather_dict["cloudCover"] = snapshot.weather.cloud_cover
            weather_dict["condition"] = snapshot.weather.condition_text or ("Unavailable" if snapshot.weather.temperature is None else "Clear")
            weather_dict["icon"] = "🌤️" if snapshot.weather.temperature is not None else "⚠️"
            weather_dict["correlation"] = snapshot.weather.correlation_text
            weather_dict["uvIndex"] = getattr(snapshot.weather, "uv_index", None)
            weather_dict["visibility"] = getattr(snapshot.weather, "visibility", None)
            weather_dict["sunrise"] = getattr(snapshot.weather, "sunrise", None)
            weather_dict["sunset"] = getattr(snapshot.weather, "sunset", None)
        else:
            weather_dict = {
                "temp": None,
                "feelsLike": None,
                "windSpeed": None,
                "windDirection": "—",
                "windDegrees": None,
                "rainProb": None,
                "cloudCover": None,
                "condition": "Unavailable",
                "icon": "⚠️",
                "correlation": "Weather telemetry is currently unavailable.",
                "uvIndex": None,
                "visibility": None,
                "sunrise": None,
                "sunset": None,
                "source": "Unavailable",
                "data_provenance": "degraded",
                "is_stale": False,
            }

        return {
            "location": snapshot.location,
            "updated": "Live Telemetry" if not snapshot.is_demo else "Saved Severe Event (Demo)",
            "aqi": snapshot.aqi,
            "status": snapshot.aqi_category,
            "aqi_category": snapshot.aqi_category,
            "verdict": (snapshot.verdict or "STAY IN").replace("_", " "),
            "verdictCode": snapshot.verdict or "STAY_IN",
            "recommendation": snapshot.recommendation or "Outdoor exposure should be minimized today.",
            "bestWindow": snapshot.best_window or "No recommended outdoor window",
            "bestWindowDetails": snapshot.best_window_details or forecast_bundle.get("bestWindowDetails"),
            "recheckAt": snapshot.recheck_at or "3:00 PM",
            "dominantPollutant": snapshot.dominant_pollutant,
            "dominant_pollutant": snapshot.dominant_pollutant,
            "confidence": "High" if snapshot.data_quality == "reliable" else "Moderate",
            "dataQuality": snapshot.data_quality,
            "isDemo": snapshot.is_demo,
            "isStale": snapshot.is_stale,
            "isCpcbCompliant": snapshot.is_cpcb_compliant,
            "is_cpcb_compliant": snapshot.is_cpcb_compliant,
            "dataType": "regulatory_compliant" if snapshot.is_cpcb_compliant else ("unavailable" if snapshot.aqi is None else ("modelled" if not snapshot.contributing_stations else "indicative")),
            "data_type": "regulatory_compliant" if snapshot.is_cpcb_compliant else ("unavailable" if snapshot.aqi is None else ("modelled" if not snapshot.contributing_stations else "indicative")),
            "isModelled": len(snapshot.contributing_stations) == 0 and snapshot.aqi is not None,
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
                "action": "CANCEL" if (snapshot.aqi is not None and snapshot.aqi > 250) else ("MODIFY" if (snapshot.aqi is not None and snapshot.aqi > 100) else ("GO" if snapshot.aqi is not None else "MODIFY")),
                "question": "Should outdoor school activity continue?",
                "indoorPm25": 45.2,
                "indoorCo2": 850,
                "ventilation": "HEPA & Recirculation Active"
            },
            "watchlist": [
                {"name": "Current Location", "location": snapshot.location, "lat": snapshot.latitude, "lon": snapshot.longitude, "aqi": snapshot.aqi, "status": snapshot.aqi_category},
            ] if (abs(snapshot.latitude - 28.6139) > 1.5 or abs(snapshot.longitude - 77.2090) > 1.5) else [
                {"name": "Home", "location": "Saket", "lat": 28.524, "lon": 77.206, "aqi": snapshot.aqi, "status": snapshot.aqi_category},
                {"name": "School", "location": "Vasant Kunj", "lat": 28.529, "lon": 77.154, "aqi": min(500, snapshot.aqi + 8) if snapshot.aqi is not None else None, "status": snapshot.aqi_category},
                {"name": "Office", "location": "Connaught Pl.", "lat": 28.631, "lon": 77.219, "aqi": max(50, snapshot.aqi - 17) if snapshot.aqi is not None else None, "status": snapshot.aqi_category}
            ],
            "traffic": {
                "corridors": _build_dynamic_corridors(
                    lat=snapshot.latitude,
                    lon=snapshot.longitude,
                    location_name=snapshot.location,
                    aqi=snapshot.aqi,
                    weather_dict=weather_dict,
                )
            },
            "nationalHubs": [
                {"name": "Delhi-NCR", "state": "Delhi", "lat": 28.6139, "lng": 77.2090, "aqi": snapshot.aqi, "status": snapshot.aqi_category, "temp": weather_dict.get("temp", 28)},
                {"name": "Mumbai", "state": "Maharashtra", "lat": 19.0760, "lng": 72.8777, "aqi": 164, "status": "Moderate", "temp": 31},
                {"name": "Bengaluru", "state": "Karnataka", "lat": 12.9716, "lng": 77.5946, "aqi": 74, "status": "Satisfactory", "temp": 26},
                {"name": "Kolkata", "state": "West Bengal", "lat": 22.5726, "lng": 88.3639, "aqi": 187, "status": "Moderate", "temp": 29},
                {"name": "Chennai", "state": "Tamil Nadu", "lat": 13.0827, "lng": 80.2707, "aqi": 66, "status": "Satisfactory", "temp": 30},
                {"name": "Hyderabad", "state": "Telangana", "lat": 17.3850, "lng": 78.4867, "aqi": 92, "status": "Satisfactory", "temp": 28},
                {"name": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lng": 72.5714, "aqi": 158, "status": "Moderate", "temp": 33},
                {"name": "Pune", "state": "Maharashtra", "lat": 18.5204, "lng": 73.8567, "aqi": 112, "status": "Moderate", "temp": 27},
                {"name": "Lucknow", "state": "Uttar Pradesh", "lat": 26.8467, "lng": 80.9462, "aqi": 215, "status": "Poor", "temp": 28},
                {"name": "Jaipur", "state": "Rajasthan", "lat": 26.9124, "lng": 75.7873, "aqi": 142, "status": "Moderate", "temp": 30},
                {"name": "Patna", "state": "Bihar", "lat": 25.6127, "lng": 85.1589, "aqi": 240, "status": "Poor", "temp": 27},
                {"name": "Guwahati", "state": "Assam", "lat": 26.1445, "lng": 91.7362, "aqi": 85, "status": "Satisfactory", "temp": 25},
                {"name": "Chandigarh", "state": "Punjab", "lat": 30.7333, "lng": 76.7794, "aqi": 175, "status": "Moderate", "temp": 27},
                {"name": "Bhopal", "state": "Madhya Pradesh", "lat": 23.2599, "lng": 77.4126, "aqi": 118, "status": "Moderate", "temp": 29},
                {"name": "Kochi", "state": "Kerala", "lat": 9.9312, "lng": 76.2673, "aqi": 52, "status": "Satisfactory", "temp": 29}
            ]
        }
