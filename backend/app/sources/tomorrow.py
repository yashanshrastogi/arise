"""
Tomorrow.io Weather & Environmental API Source Adapter.
Handles real-time meteorology and air quality telemetry from Tomorrow.io API v4.

SECURITY & PROVENANCE INVARIANTS:
- API key is backend-only, loaded from Settings or Secrets Manager.
- Never log, print, or expose API keys in URLs or exception traces.
- Validates latitude [-90, 90] and longitude [-180, 180].
- Normalizes units: wind speed (m/s -> km/h), visibility (km), pressure (hPa).
- Maps Tomorrow.io numeric weather codes to plain English descriptions.
- Preserves provider observation timestamp vs retrieval timestamp.
"""

import logging
import math
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
import httpx

from app.core.config import get_settings
from app.core.secrets import get_secret
from app.domain.models import WeatherSnapshot
from app.sources.base import BaseWeatherProvider

logger = logging.getLogger(__name__)


def degrees_to_cardinal(deg: float) -> str:
    """Convert meteorological azimuth degrees to 16-point cardinal compass string."""
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    ix = round(deg / (360.0 / len(dirs))) % len(dirs)
    return dirs[ix]


def redact_tomorrow_key(url_or_text: str) -> str:
    """Strip apikey query parameter from strings or URLs."""
    return re.sub(r'(apikey=)[^&]+', r'\1******', str(url_or_text))


def tomorrow_code_to_condition(code: int) -> Tuple[str, str]:
    """Map Tomorrow.io weatherCode integer to description and emoji."""
    mapping = {
        1000: ("Clear Sky", "☀️"),
        1100: ("Mostly Clear", "🌤️"),
        1101: ("Partly Cloudy", "🌤️"),
        1102: ("Mostly Cloudy", "⛅"),
        1001: ("Cloudy", "☁️"),
        2000: ("Fog", "🌫️"),
        2100: ("Light Fog", "🌫️"),
        4000: ("Light Drizzle", "🌦️"),
        4001: ("Rain", "🌧️"),
        4200: ("Light Rain", "🌦️"),
        4201: ("Heavy Rain", "🌧️"),
        5000: ("Snow", "❄️"),
        5001: ("Flurries", "❄️"),
        5100: ("Light Snow", "🌨️"),
        5101: ("Heavy Snow", "❄️"),
        6000: ("Freezing Drizzle", "🌧️"),
        6001: ("Freezing Rain", "🌧️"),
        7000: ("Ice Pellets", "🧊"),
        8000: ("Thunderstorm", "⛈️"),
    }
    return mapping.get(int(code), ("Hazy Conditions", "🌤️"))


class TomorrowIoProvider(BaseWeatherProvider):
    """
    Tomorrow.io v4 API adapter for real-time surface meteorology and air quality.
    """
    name: str = "Tomorrow.io"
    BASE_URL: str = "https://api.tomorrow.io/v4/weather/realtime"

    def __init__(self, api_key: Optional[str] = None, timeout: float = 8.0):
        settings = get_settings()
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS
        self._api_key = api_key or settings.TOMORROW_API_KEY
        if not self._api_key:
            self._api_key = get_secret(settings.TOMORROW_SECRET_ID)

    @property
    def is_configured(self) -> bool:
        """Return True if an API key is available."""
        return bool(self._api_key and str(self._api_key).strip())

    def _validate_coordinates(self, lat: float, lon: float) -> Tuple[float, float]:
        """Validate and bound geographic coordinates."""
        if not (math.isfinite(lat) and math.isfinite(lon)):
            raise ValueError(f"Non-finite coordinates provided: lat={lat}, lon={lon}")
        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude out of bounds [-90, 90]: {lat}")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude out of bounds [-180, 180]: {lon}")
        return round(float(lat), 6), round(float(lon), 6)

    async def get_current_weather(self, lat: float, lon: float) -> WeatherSnapshot:
        """
        Fetch current surface meteorology from Tomorrow.io Realtime v4 API.
        Normalizes units to Arise standard (temperature °C, wind km/h, visibility km).
        """
        lat, lon = self._validate_coordinates(lat, lon)
        if not self.is_configured:
            raise ValueError("Tomorrow.io API key is not configured.")

        params = {
            "location": f"{lat},{lon}",
            "units": "metric",
            "apikey": self._api_key,
        }

        now_iso = datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(self.BASE_URL, params=params)
            except httpx.TimeoutException as exc:
                raise TimeoutError("Tomorrow.io weather request timed out.") from exc
            except httpx.RequestError as exc:
                safe_err = redact_tomorrow_key(str(exc))
                raise ConnectionError(f"Tomorrow.io weather network error: {safe_err}") from exc

            if resp.status_code == 401 or resp.status_code == 403:
                raise PermissionError("Tomorrow.io authentication failed: Invalid or inactive API key.")
            elif resp.status_code == 429:
                raise RuntimeError("Tomorrow.io rate limit exceeded (HTTP 429).")
            elif resp.status_code != 200:
                safe_body = redact_tomorrow_key(resp.text[:200])
                raise RuntimeError(f"Tomorrow.io returned HTTP {resp.status_code}: {safe_body}")

            data = resp.json().get("data", {})
            values = data.get("values", {})
            obs_time = data.get("time") or now_iso

            temp = float(values.get("temperature", 0.0))
            feels = float(values.get("temperatureApparent", temp))
            humidity = float(values.get("humidity", 0.0))
            pressure = float(values.get("pressureSurfaceLevel", 1013.25))
            visibility_km = float(values["visibility"]) if "visibility" in values and values["visibility"] is not None else None

            # Tomorrow.io metric windSpeed is m/s; convert to km/h (1 m/s = 3.6 km/h)
            w_speed_ms = float(values.get("windSpeed", 0.0))
            w_speed_kmh = round(w_speed_ms * 3.6, 1)
            w_deg = float(values.get("windDirection", 0.0))
            w_dir = degrees_to_cardinal(w_deg)

            cloud_cover = float(values.get("cloudCover", 0.0))
            rain_prob = float(values.get("precipitationProbability", 0.0))
            rain_intensity = float(values.get("rainIntensity", 0.0))
            uv_index = float(values["uvIndex"]) if "uvIndex" in values and values["uvIndex"] is not None else None
            dew_point = float(values["dewPoint"]) if "dewPoint" in values and values["dewPoint"] is not None else None

            weather_code = int(values.get("weatherCode", 1000))
            cond_desc, _ = tomorrow_code_to_condition(weather_code)

            disp_text = (
                f"Calm winds ({w_speed_kmh} km/h {w_dir}) limiting atmospheric dispersion."
                if w_speed_kmh < 8.0
                else f"Active winds ({w_speed_kmh} km/h {w_dir}) promoting particulate dispersion."
            )

            return WeatherSnapshot(
                timestamp=obs_time,
                temperature=round(temp, 1),
                feels_like=round(feels, 1),
                humidity=round(humidity, 1),
                cloud_cover=round(cloud_cover, 1),
                rain_probability=round(rain_prob, 1),
                precipitation=round(rain_intensity, 1),
                wind_speed=round(w_speed_kmh, 1),
                wind_direction=w_dir,
                wind_degrees=w_deg,
                visibility=visibility_km,
                uv_index=uv_index,
                surface_pressure=pressure,
                dew_point=dew_point,
                source="Tomorrow.io",
                data_provenance="satellite_radar_nwp",
                retrieval_timestamp=now_iso,
                observation_time=obs_time,
                local_timezone="UTC",
                is_stale=False,
                condition_text=cond_desc,
                correlation_text=disp_text,
                sunrise=None,
                sunset=None,
            )

    async def get_air_pollution(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch air pollution from Tomorrow.io if available on the current subscription.
        Extracts particulate matter and criteria gases.
        """
        lat, lon = self._validate_coordinates(lat, lon)
        if not self.is_configured:
            return None

        params = {
            "location": f"{lat},{lon}",
            "units": "metric",
            "apikey": self._api_key,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(self.BASE_URL, params=params)
                if resp.status_code != 200:
                    return None
                data = resp.json().get("data", {})
                values = data.get("values", {})
                now_iso = datetime.now(timezone.utc).isoformat()
                obs_time = data.get("time") or now_iso

                pm25 = float(values["particulateMatter25"]) if "particulateMatter25" in values and values["particulateMatter25"] is not None else None
                pm10 = float(values["particulateMatter10"]) if "particulateMatter10" in values and values["particulateMatter10"] is not None else None
                no2 = float(values["pollutantNO2"]) if "pollutantNO2" in values and values["pollutantNO2"] is not None else None
                so2 = float(values["pollutantSO2"]) if "pollutantSO2" in values and values["pollutantSO2"] is not None else None
                raw_co = float(values["pollutantCO"]) if "pollutantCO" in values and values["pollutantCO"] is not None else None
                co_mg = round(raw_co / 1000.0, 3) if raw_co is not None and raw_co > 10.0 else raw_co
                o3 = float(values["pollutantO3"]) if "pollutantO3" in values and values["pollutantO3"] is not None else None

                pollutants = {}
                if pm25 is not None:
                    pollutants["PM2.5"] = pm25
                if pm10 is not None:
                    pollutants["PM10"] = pm10
                if no2 is not None:
                    pollutants["NO2"] = no2
                if so2 is not None:
                    pollutants["SO2"] = so2
                if co_mg is not None:
                    pollutants["CO"] = co_mg
                if o3 is not None:
                    pollutants["O3"] = o3

                if not pollutants:
                    return None

                return {
                    "source": "Tomorrow.io",
                    "data_type": "modelled",
                    "observation_time": obs_time,
                    "retrieval_time": now_iso,
                    "latitude": lat,
                    "longitude": lon,
                    "pollutants": pollutants,
                    "units": {
                        "PM2.5": "µg/m³",
                        "PM10": "µg/m³",
                        "NO2": "µg/m³",
                        "SO2": "µg/m³",
                        "CO": "mg/m³",
                        "O3": "µg/m³",
                    }
                }
            except Exception as e:
                logger.warning(f"Error querying Tomorrow.io air pollution: {e}")
                return None

    # Alias for uniform provider interface
    get_current_air_quality = get_air_pollution

