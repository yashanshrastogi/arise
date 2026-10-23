import re
import logging
from typing import List, Dict, Optional, Tuple, Any
from app.domain.models import ForecastPoint, BestWindowResult
from app.sources.weather import OpenMeteoWeatherProvider

logger = logging.getLogger(__name__)

# Explicit, documented outdoor suitability limits
MAX_SUITABLE_AQI = 300               # CPCB Severe threshold (>300). General outdoor activity is never recommended.
MAX_SUITABLE_PRECIP_MM = 1.0         # Precipitation >= 1.0 mm/h is active continuous rainfall (unsuitable).
MAX_SUITABLE_RAIN_PROB_ALONE = 75.0  # If precipitation amount is missing, rain prob > 75% is deemed unsuitable.
MAX_SUITABLE_WIND_KMH = 30.0         # Sustained wind speed > 30 km/h is unsuitable for outdoor activity.
MAX_SUITABLE_GUST_KMH = 45.0         # Wind gusts > 45 km/h are hazardous.
MAX_ACCEPTABLE_RISK_SCORE = 320.0    # Ceiling for composite environmental risk.

# Waking hours boundary: outdoor activities are strictly recommended between 6:00 AM and 9:00 PM
MIN_OUTDOOR_WAKING_HOUR = 6   # 6:00 AM
MAX_OUTDOOR_WAKING_HOUR = 21  # 9:00 PM (21:00)


def _get_hour_from_point(p: ForecastPoint) -> Optional[int]:
    """Extract 0-23 local hour number from ForecastPoint, prioritizing time_label for human-facing accuracy."""
    if p.time_label:
        match = re.match(r"^(\d{1,2})(?::\d{2})?\s*(AM|PM)$", p.time_label.strip(), re.IGNORECASE)
        if match:
            h = int(match.group(1))
            meridiem = match.group(2).upper()
            if meridiem == "PM" and h < 12:
                h += 12
            elif meridiem == "AM" and h == 12:
                h = 0
            return h
    if p.timestamp and "T" in p.timestamp:
        try:
            return int(p.timestamp.split("T")[1].split(":")[0])
        except Exception:
            pass
    return None


def evaluate_outdoor_window(
    points: List[ForecastPoint],
    is_calibrated: bool = False
) -> Tuple[BestWindowResult, List[ForecastPoint]]:
    """
    Data-driven outdoor window evaluator considering AQI, precipitation, rain probability,
    and wind conditions against documented severe-weather thresholds.
    Distinguishes ground-calibrated projections from uncalibrated atmospheric model forecasts.
    """
    if not points:
        return BestWindowResult(
            window_str="No recommended outdoor window",
            status="unavailable",
            confidence="low",
            provenance="none",
            reason="No forecast points provided.",
            missing_inputs=["forecast_points"]
        ), points

    # Filter future points (current hour and upcoming)
    future_points = [p for p in points if not p.past]
    if not future_points:
        future_points = points

    # Check AQI data availability
    valid_aqi_points = [p for p in future_points if p.aqi is not None]
    if not valid_aqi_points:
        updated_points = [p.model_copy(update={"best_window": False}) for p in points]
        return BestWindowResult(
            window_str="No recommended outdoor window",
            status="unavailable",
            confidence="low",
            provenance="none",
            reason="Air quality forecast data is unavailable.",
            missing_inputs=["aqi"]
        ), updated_points

    best_candidate_idx = -1
    lowest_risk = 999999.0
    best_stats: Dict[str, Any] = {}
    missing_weather_inputs: set = set()

    # Search for contiguous candidate window (min 1, up to 3 hours)
    window_size = min(3, max(1, len(future_points)))
    for i in range(len(future_points) - window_size + 1):
        window = future_points[i:i + window_size]

        # 1. AQI input check
        if any(p.aqi is None for p in window):
            continue

        # 2. Waking hours check: Best time to go out must be within 6:00 AM to 10:00 PM
        is_overnight = False
        for p in window:
            h = _get_hour_from_point(p)
            if h is not None and (h < MIN_OUTDOOR_WAKING_HOUR or h > MAX_OUTDOOR_WAKING_HOUR):
                is_overnight = True
                break
        if is_overnight:
            continue

        # 3. Severe weather and AQI limit enforcement
        is_unsuitable = False
        for p in window:
            # Check severe air quality limit
            if p.aqi > MAX_SUITABLE_AQI:
                is_unsuitable = True
                break

            # Check precipitation limit:
            # Do not infer heavy rainfall from rain probability alone if precipitation amount is known
            if p.precipitation is not None:
                if p.precipitation >= MAX_SUITABLE_PRECIP_MM:
                    is_unsuitable = True
                    break
            else:
                missing_weather_inputs.add("precipitation_amount")
                if p.rain_probability > MAX_SUITABLE_RAIN_PROB_ALONE:
                    is_unsuitable = True
                    break

            # Check wind speed and gust limits
            # Do not interpret low wind as proof of poor air quality
            if p.wind_speed > MAX_SUITABLE_WIND_KMH:
                is_unsuitable = True
                break
            if p.wind_gusts is not None and p.wind_gusts > MAX_SUITABLE_GUST_KMH:
                is_unsuitable = True
                break

        if is_unsuitable:
            continue

        # 3. Composite risk score formula (AQI + precipitation + wind discomfort)
        avg_aqi = sum(p.aqi for p in window) / window_size
        avg_rain_prob = sum(p.rain_probability for p in window) / window_size
        precip_vals = [p.precipitation for p in window if p.precipitation is not None]
        avg_precip = sum(precip_vals) / len(precip_vals) if precip_vals else None
        avg_wind = sum(p.wind_speed for p in window) / window_size
        gust_vals = [p.wind_gusts for p in window if p.wind_gusts is not None]
        avg_gust = sum(gust_vals) / len(gust_vals) if gust_vals else None

        # Rain penalty:
        if avg_precip is not None:
            rain_penalty = (avg_precip * 30.0) + (avg_rain_prob * 0.3)
        else:
            rain_penalty = avg_rain_prob * 1.0

        # High-wind penalty: only winds above 15 km/h add discomfort. Low winds add 0.
        wind_penalty = max(0.0, avg_wind - 15.0) * 1.5
        if avg_gust is not None and avg_gust > 25.0:
            wind_penalty += (avg_gust - 25.0) * 1.0

        risk_score = avg_aqi + rain_penalty + wind_penalty
        if risk_score < lowest_risk:
            lowest_risk = risk_score
            best_candidate_idx = i
            best_stats = {
                "avg_aqi": round(avg_aqi),
                "avg_rain_prob": round(avg_rain_prob, 1),
                "avg_precipitation": round(avg_precip, 2) if avg_precip is not None else None,
                "avg_wind_speed": round(avg_wind, 1),
            }

    if best_candidate_idx == -1 or lowest_risk >= MAX_ACCEPTABLE_RISK_SCORE:
        updated_points = [p.model_copy(update={"best_window": False}) for p in points]
        return BestWindowResult(
            window_str="No recommended outdoor window",
            status="unsuitable",
            confidence="moderate" if is_calibrated else "low",
            provenance="ground_calibrated" if is_calibrated else "model_projection",
            reason="Environmental conditions (AQI or weather) exceed comfortable outdoor thresholds.",
            missing_inputs=list(missing_weather_inputs)
        ), updated_points

    updated_points: List[ForecastPoint] = []
    window_labels = []

    for p in points:
        p_copy = p.model_copy()
        if (
            not p_copy.past
            and p in future_points
            and future_points.index(p) in range(best_candidate_idx, best_candidate_idx + window_size)
        ):
            p_copy.best_window = True
            window_labels.append(p_copy.time_label)
        else:
            p_copy.best_window = False
        updated_points.append(p_copy)

    window_str = f"{window_labels[0]} – {window_labels[-1]}" if window_labels else "No recommended outdoor window"

    provenance_tag = "ground_calibrated" if is_calibrated else "atmospheric_model_projection"
    confidence_level = "high" if is_calibrated else "moderate"
    status_tag = "ground_calibrated" if is_calibrated else "model_projected"
    reason_text = (
        "Optimal window anchored to verified ground telemetry and favorable weather."
        if is_calibrated
        else "Projected window based on atmospheric composition model and forecast weather."
    )

    result = BestWindowResult(
        window_str=window_str,
        status=status_tag,
        confidence=confidence_level,
        provenance=provenance_tag,
        reason=reason_text,
        avg_aqi=best_stats.get("avg_aqi"),
        avg_rain_prob=best_stats.get("avg_rain_prob"),
        avg_precipitation=best_stats.get("avg_precipitation"),
        avg_wind_speed=best_stats.get("avg_wind_speed"),
        missing_inputs=list(missing_weather_inputs)
    )

    return result, updated_points


def compute_best_outdoor_window(
    points: List[ForecastPoint],
    is_calibrated: bool = False
) -> Tuple[str, List[ForecastPoint]]:
    """Backward-compatible wrapper returning (window_str, updated_points)."""
    result, updated_points = evaluate_outdoor_window(points, is_calibrated=is_calibrated)
    return result.window_str, updated_points


class ForecastService:
    """
    Forecast domain service.
    Produces 24-hour and 7-day multi-metric forecast datasets for React Recharts UI.
    """

    def __init__(self, weather_provider: Optional[OpenMeteoWeatherProvider] = None):
        self.weather_provider = weather_provider or OpenMeteoWeatherProvider()

    async def get_forecast(
        self,
        lat: float,
        lon: float,
        current_aqi: Optional[int] = None,
        force_demo: bool = False
    ) -> Dict[str, Any]:
        """Generate unified 24h hourly and 7-day forecast with truthful AQI provenance."""
        raw_points = await self.weather_provider.get_hourly_forecast(lat, lon, force_demo=force_demo)

        # Calibrate hourly forecast points against live ground telemetry current_aqi if available
        now_idx = 0
        for idx, pt in enumerate(raw_points):
            if getattr(pt, "is_current", False) or not pt.past:
                now_idx = idx
                break

        model_now_aqi = raw_points[now_idx].aqi if now_idx < len(raw_points) else None

        calibrated_points: List[ForecastPoint] = []
        for i, pt in enumerate(raw_points):
            pt_copy = pt.model_copy()
            if current_aqi is not None:
                if model_now_aqi is not None and model_now_aqi > 0 and pt_copy.aqi is not None:
                    # Proportional calibration anchored to current ground truth
                    ratio = current_aqi / float(model_now_aqi)
                    calibrated = round(pt_copy.aqi * ratio)
                    pt_copy.aqi = max(0, min(500, calibrated))
                    pt_copy.source = "Calibrated Projection"
                elif current_aqi == 0:
                    # Legitimate clean air ground truth
                    pt_copy.aqi = 0
                    pt_copy.source = "Calibrated Projection"
                elif pt_copy.aqi is not None:
                    # Diurnal curve fallback when model AQI is unavailable or 0
                    diurnal_delta = -50 if any(h in pt.time_label for h in ["3 PM", "4 PM", "5 PM"]) else (
                        -25 if any(h in pt.time_label for h in ["1 PM", "2 PM"]) else 15
                    )
                    pt_copy.aqi = max(0, min(500, current_aqi + diurnal_delta))
                    pt_copy.source = "Heuristic Dispersion Projection"
                else:
                    pt_copy.aqi = None
                    pt_copy.source = "Unavailable"

                if i == now_idx:
                    pt_copy.aqi = current_aqi
            else:
                # When current_aqi is None, retain model AQI with genuine model provenance
                if pt_copy.aqi is not None:
                    pt_copy.source = "Open-Meteo Air Quality Model"
                else:
                    pt_copy.source = "Unavailable"

            calibrated_points.append(pt_copy)

        bw_result, tagged_points = evaluate_outdoor_window(
            calibrated_points,
            is_calibrated=(current_aqi is not None)
        )
        window_str = bw_result.window_str

        # Format 24-hour forecast for Recharts
        hourly_chart_data = [
            {
                "timestamp": p.timestamp,
                "time": p.time_label,
                "aqi": p.aqi,
                "temp": round(p.temperature) if p.temperature is not None else None,
                "rainProb": round(p.rain_probability) if p.rain_probability is not None else None,
                "precipitation": p.precipitation,
                "windSpeed": round(p.wind_speed, 1) if p.wind_speed is not None else None,
                "windGusts": round(p.wind_gusts, 1) if p.wind_gusts is not None else None,
                "past": p.past,
                "isCurrent": (i == now_idx) or getattr(p, "is_current", False),
                "bestWindow": p.best_window,
                "source": p.source,
            }
            for i, p in enumerate(tagged_points)
        ]

        # 7-Day outlook from real Open-Meteo daily data
        seven_day_data = await self.weather_provider.get_7day_outlook(
            lat, lon, current_aqi=current_aqi, force_demo=force_demo
        )

        if force_demo:
            fc_source = "DEMO"
        elif not raw_points:
            fc_source = "Unavailable"
        elif current_aqi is not None:
            fc_source = "Open-Meteo NWP & Ground-Calibrated Dispersion"
        elif any(p.aqi is not None for p in calibrated_points):
            fc_source = "Open-Meteo NWP & CAMS Air Quality Model"
        else:
            fc_source = "Open-Meteo NWP (Air Quality Unavailable)"

        return {
            "hourly": hourly_chart_data,
            "forecast7Day": seven_day_data,
            "bestWindow": window_str,
            "bestWindowDetails": bw_result.model_dump(),
            "source": fc_source
        }
