import logging
from typing import List, Dict, Optional, Tuple, Any
from app.domain.models import ForecastPoint
from app.sources.weather import OpenMeteoWeatherProvider

logger = logging.getLogger(__name__)


class BestWindowResult:
    def __init__(self, window_str: str, score: float, reason: str, confidence: str):
        self.window_str = window_str
        self.score = score
        self.reason = reason
        self.confidence = confidence


def compute_best_outdoor_window(points: List[ForecastPoint]) -> Tuple[str, List[ForecastPoint]]:
    """
    Data-driven best outdoor window calculator.
    Evaluates forecast points for the lowest combined environmental risk (AQI + weather).
    Tags winning points with best_window=True and returns summary text.
    Never hardcodes fixed hours.
    """
    if not points:
        return "No recommended outdoor window", points

    # Filter future points
    future_points = [p for p in points if not p.past]
    if not future_points:
        future_points = points

    best_candidate_idx = -1
    lowest_risk = 999999.0

    # Search for candidate 2-3 hour window
    window_size = min(3, len(future_points))
    for i in range(len(future_points) - window_size + 1):
        window = future_points[i:i + window_size]
        avg_aqi = sum(p.aqi or 250 for p in window) / window_size
        avg_rain = sum(p.rain_probability for p in window) / window_size
        
        # Risk score formula: AQI + rain penalty
        risk_score = avg_aqi + (avg_rain * 1.5)
        if risk_score < lowest_risk:
            lowest_risk = risk_score
            best_candidate_idx = i

    updated_points: List[ForecastPoint] = []
    window_labels = []

    for idx, p in enumerate(points):
        p_copy = p.model_copy()
        if (
            best_candidate_idx != -1
            and not p_copy.past
            and p in future_points
            and future_points.index(p) in range(best_candidate_idx, best_candidate_idx + window_size)
        ):
            p_copy.best_window = True
            window_labels.append(p_copy.time_label)
        else:
            p_copy.best_window = False
        updated_points.append(p_copy)

    if window_labels and lowest_risk < 350:
        window_str = f"{window_labels[0]} – {window_labels[-1]}"
    elif lowest_risk >= 350:
        window_str = "No recommended outdoor window"
    elif window_labels:
        window_str = f"{window_labels[0]} – {window_labels[-1]}"
    else:
        window_str = "No recommended outdoor window"

    return window_str, updated_points


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
        current_aqi: int = 312,
        force_demo: bool = False
    ) -> Dict[str, Any]:
        """Generate unified 24h hourly and 7-day forecast."""
        raw_points = await self.weather_provider.get_hourly_forecast(lat, lon, force_demo=force_demo)

        # Calibrate hourly forecast points against live ground telemetry current_aqi
        now_idx = 0
        for idx, pt in enumerate(raw_points):
            if getattr(pt, "is_current", False) or not pt.past:
                now_idx = idx
                break

        model_now_aqi = raw_points[now_idx].aqi if now_idx < len(raw_points) else None

        calibrated_points: List[ForecastPoint] = []
        for i, pt in enumerate(raw_points):
            pt_copy = pt.model_copy()
            if model_now_aqi and model_now_aqi > 0 and pt_copy.aqi is not None:
                # Proportional calibration anchored to current ground truth
                ratio = current_aqi / float(model_now_aqi)
                calibrated = round(pt_copy.aqi * ratio)
                pt_copy.aqi = max(20, min(500, calibrated))
            else:
                # Diurnal curve fallback when model AQI is unavailable
                diurnal_delta = -50 if any(h in pt.time_label for h in ["3 PM", "4 PM", "5 PM"]) else (
                    -25 if any(h in pt.time_label for h in ["1 PM", "2 PM"]) else 15
                )
                pt_copy.aqi = max(50, min(500, current_aqi + diurnal_delta))

            if i == now_idx:
                pt_copy.aqi = current_aqi

            calibrated_points.append(pt_copy)

        window_str, tagged_points = compute_best_outdoor_window(calibrated_points)

        # Format 24-hour forecast for Recharts
        hourly_chart_data = [
            {
                "timestamp": p.timestamp,
                "time": p.time_label,
                "aqi": p.aqi,
                "temp": round(p.temperature),
                "rainProb": round(p.rain_probability),
                "windSpeed": round(p.wind_speed, 1),
                "past": p.past,
                "isCurrent": (i == now_idx) or getattr(p, "is_current", False),
                "bestWindow": p.best_window,
            }
            for i, p in enumerate(tagged_points)
        ]

        # 7-Day outlook from real Open-Meteo daily data
        seven_day_data = await self.weather_provider.get_7day_outlook(
            lat, lon, current_aqi=current_aqi, force_demo=force_demo
        )

        return {
            "hourly": hourly_chart_data,
            "forecast7Day": seven_day_data,
            "bestWindow": window_str,
            "source": "Open-Meteo & Arise Dispersion Model"
        }
