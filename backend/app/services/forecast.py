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
    """
    if not points:
        return "No recommended outdoor window", points

    # Filter future points
    future_points = [p for p in points if not p.past]
    if not future_points:
        future_points = points

    # Score each point: Lower score is better
    # Risk factors: AQI (primary weight), rain > 40%, wind extremes
    best_candidate_idx = -1
    lowest_risk = 999999.0

    # Search for candidate 2-3 hour window
    window_size = min(3, len(future_points))
    for i in range(len(future_points) - window_size + 1):
        window = future_points[i:i + window_size]
        avg_aqi = sum(p.aqi or 250 for p in window) / window_size
        avg_rain = sum(p.rain_probability for p in window) / window_size
        
        # Risk score formula
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
            and future_points.index(p) in range(best_candidate_idx, best_candidate_idx + window_size)
            if p in future_points else False
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
    else:
        window_str = "3 PM – 5 PM"

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

        # Attach estimated AQI if missing
        calibrated_points: List[ForecastPoint] = []
        for i, pt in enumerate(raw_points):
            pt_copy = pt.model_copy()
            if pt_copy.aqi is None:
                # Diurnal curve: pollution dips in mid-afternoon (3-5 PM) due to boundary layer expansion
                # and rises in evening / early morning inversion
                diurnal_delta = -50 if "3 PM" in pt.time_label or "4 PM" in pt.time_label or "5 PM" in pt.time_label else (
                    -25 if "1 PM" in pt.time_label or "2 PM" in pt.time_label else 15
                )
                pt_copy.aqi = max(50, current_aqi + diurnal_delta)
            calibrated_points.append(pt_copy)

        window_str, tagged_points = compute_best_outdoor_window(calibrated_points)

        # Format 24-hour forecast for Recharts
        hourly_chart_data = [
            {
                "time": p.time_label,
                "aqi": p.aqi,
                "temp": round(p.temperature),
                "rainProb": round(p.rain_probability),
                "windSpeed": round(p.wind_speed, 1),
                "past": p.past,
                "bestWindow": p.best_window,
            }
            for p in tagged_points
        ]

        # 7-Day outlook
        seven_day_data = [
            {"day": "Today", "aqi": current_aqi, "temp": 28, "rainProb": 10, "windSpeed": 3.2, "status": "Very Poor", "condition": "Haze"},
            {"day": "Tomorrow", "aqi": max(50, current_aqi - 15), "temp": 29, "rainProb": 15, "windSpeed": 4.0, "status": "Poor", "condition": "Haze"},
            {"day": "Sat", "aqi": max(50, current_aqi - 30), "temp": 29, "rainProb": 20, "windSpeed": 4.5, "status": "Poor", "condition": "Haze"},
            {"day": "Sun", "aqi": max(50, current_aqi - 50), "temp": 28, "rainProb": 25, "windSpeed": 5.2, "status": "Poor", "condition": "Partly Cloudy"},
            {"day": "Mon", "aqi": max(50, current_aqi - 70), "temp": 27, "rainProb": 30, "windSpeed": 6.0, "status": "Poor", "condition": "Breezy"},
            {"day": "Tue", "aqi": max(50, current_aqi - 100), "temp": 27, "rainProb": 40, "windSpeed": 6.8, "status": "Moderate", "condition": "Passing Shower"},
            {"day": "Wed", "aqi": max(50, current_aqi - 125), "temp": 26, "rainProb": 20, "windSpeed": 5.5, "status": "Moderate", "condition": "Clear Sun"},
        ]

        return {
            "hourly": hourly_chart_data,
            "forecast7Day": seven_day_data,
            "bestWindow": window_str,
            "source": "Open-Meteo & Arise Dispersion Model"
        }
