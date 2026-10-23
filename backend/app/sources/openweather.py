"""
OpenWeather API Source Adapter.
Handles surface weather and air pollution telemetry from OpenWeather (OpenWeatherMap) v2.5.

SECURITY & PROVENANCE INVARIANTS:
- API key is strictly backend-only, loaded from Settings or Secrets Manager.
- Never log, print, or expose API keys in URLs or exception traces.
- Validates latitude [-90, 90] and longitude [-180, 180].
- Normalizes units: wind speed (m/s -> km/h), visibility (m -> km), CO (µg/m³ -> mg/m³).
- Preserves provider observation timestamp vs retrieval timestamp.
"""

import logging
import re
import math
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, Tuple, List
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


def redact_key(url_or_text: str) -> str:
    """Strip secret values from URLs or query strings for safe error logging."""
    return re.sub(r'(appid=)[^&]+', r'\1******', str(url_or_text))


class OpenWeatherProvider(BaseWeatherProvider):
    """
    OpenWeather Current Weather and Air Pollution API adapter.
    Provides surface meteorology and atmospheric composition telemetry.
    """
    name: str = "OpenWeather"
    WEATHER_URL: str = "https://api.openweathermap.org/data/2.5/weather"
    AIR_POLLUTION_URL: str = "https://api.openweathermap.org/data/2.5/air_pollution"

    def __init__(self, api_key: Optional[str] = None, timeout: float = 8.0):
        settings = get_settings()
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS
        self._api_key = api_key or settings.OPENWEATHER_API_KEY
        if not self._api_key:
            self._api_key = get_secret(settings.OPENWEATHER_SECRET_ID)

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
        Fetch current surface weather observation from OpenWeather API 2.5.
        Normalizes units to Arise canonical standard (temp °C, wind km/h, visibility km).
        """
        lat, lon = self._validate_coordinates(lat, lon)
        if not self.is_configured:
            raise ValueError("OpenWeather API key is not configured.")

        params = {
            "lat": lat,
            "lon": lon,
            "appid": self._api_key,
            "units": "metric",
        }

        now_iso = datetime.now(timezone.utc).isoformat()

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(self.WEATHER_URL, params=params)
            except httpx.TimeoutException as exc:
                raise TimeoutError("OpenWeather weather request timed out.") from exc
            except httpx.RequestError as exc:
                safe_err = redact_key(str(exc))
                raise ConnectionError(f"OpenWeather weather network error: {safe_err}") from exc

            if resp.status_code == 401:
                raise PermissionError("OpenWeather authentication failed: Invalid or inactive API key.")
            elif resp.status_code == 429:
                raise RuntimeError("OpenWeather rate limit exceeded (HTTP 429).")
            elif resp.status_code != 200:
                safe_body = redact_key(resp.text[:200])
                raise RuntimeError(f"OpenWeather returned HTTP {resp.status_code}: {safe_body}")

            data = resp.json()
            main = data.get("main", {})
            wind = data.get("wind", {})
            clouds = data.get("clouds", {})
            weather_list = data.get("weather", [])
            sys_dict = data.get("sys", {})
            tz_offset_sec = int(data.get("timezone", 0))

            temp = float(main.get("temp", 0.0))
            feels = float(main.get("feels_like", temp))
            humidity = float(main.get("humidity", 0.0))
            pressure = float(main.get("pressure", 1013.25))
            raw_vis = data.get("visibility")
            visibility_km = round(float(raw_vis) / 1000.0, 1) if raw_vis is not None else None

            # OpenWeather wind speed in metric is m/s; convert to km/h (1 m/s = 3.6 km/h)
            w_speed_ms = float(wind.get("speed", 0.0))
            w_speed_kmh = round(w_speed_ms * 3.6, 1)
            w_deg = float(wind.get("deg", 0.0))
            w_dir = degrees_to_cardinal(w_deg)

            cloud_cover = float(clouds.get("all", 0.0))
            rain_dict = data.get("rain", {})
            precip = float(rain_dict.get("1h", 0.0))
            rain_prob = min(100.0, max(0.0, cloud_cover * 0.8)) if precip == 0.0 else 85.0

            cond_text = weather_list[0].get("main", "Clear") if weather_list else "Clear Sky"
            cond_desc = weather_list[0].get("description", cond_text) if weather_list else cond_text

            # Parse sunrise/sunset in local timezone offset
            loc_tz = timezone(timedelta(seconds=tz_offset_sec))
            sunrise_str = None
            sunset_str = None
            if sys_dict.get("sunrise"):
                try:
                    dt_rise = datetime.fromtimestamp(sys_dict["sunrise"], loc_tz)
                    sunrise_str = dt_rise.strftime("%-I:%M %p")
                except Exception:
                    pass
            if sys_dict.get("sunset"):
                try:
                    dt_set = datetime.fromtimestamp(sys_dict["sunset"], loc_tz)
                    sunset_str = dt_set.strftime("%-I:%M %p")
                except Exception:
                    pass

            disp_text = (
                f"Calm winds ({w_speed_kmh} km/h {w_dir}) limiting atmospheric dispersion."
                if w_speed_kmh < 8.0
                else f"Active winds ({w_speed_kmh} km/h {w_dir}) promoting particulate dispersion."
            )

            dt_raw = data.get("dt")
            obs_iso = datetime.fromtimestamp(dt_raw, timezone.utc).isoformat() if dt_raw else now_iso

            return WeatherSnapshot(
                timestamp=obs_iso,
                temperature=round(temp, 1),
                feels_like=round(feels, 1),
                humidity=round(humidity, 1),
                cloud_cover=round(cloud_cover, 1),
                rain_probability=round(rain_prob, 1),
                precipitation=round(precip, 1),
                wind_speed=round(w_speed_kmh, 1),
                wind_direction=w_dir,
                wind_degrees=w_deg,
                visibility=visibility_km,
                uv_index=None,
                surface_pressure=pressure,
                dew_point=None,
                source="OpenWeather",
                data_provenance="station_observation",
                retrieval_timestamp=now_iso,
                observation_time=obs_iso,
                local_timezone=f"UTC{tz_offset_sec // 3600:+03d}:00",
                is_stale=False,
                condition_text=cond_desc.title(),
                correlation_text=disp_text,
                sunrise=sunrise_str,
                sunset=sunset_str,
            )

    async def get_air_pollution(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """
        Fetch current atmospheric air pollution from OpenWeather Air Pollution endpoint.
        Normalizes gas and particulate units to standard CPCB reference units:
        - PM2.5: µg/m³
        - PM10: µg/m³
        - NO2: µg/m³
        - SO2: µg/m³
        - CO: OpenWeather reports µg/m³; Arise converts to mg/m³ (value / 1000.0)
        - O3: µg/m³
        - NH3: µg/m³
        """
        lat, lon = self._validate_coordinates(lat, lon)
        if not self.is_configured:
            return None

        params = {
            "lat": lat,
            "lon": lon,
            "appid": self._api_key,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                resp = await client.get(self.AIR_POLLUTION_URL, params=params)
                if resp.status_code != 200:
                    logger.warning(f"OpenWeather air pollution returned HTTP {resp.status_code}")
                    return None
                data = resp.json()
                items = data.get("list", [])
                if not items:
                    return None

                item = items[0]
                comps = item.get("components", {})
                dt_raw = item.get("dt")
                now_iso = datetime.now(timezone.utc).isoformat()
                obs_iso = datetime.fromtimestamp(dt_raw, timezone.utc).isoformat() if dt_raw else now_iso

                # Extract and normalize
                pm25 = float(comps["pm2_5"]) if "pm2_5" in comps and comps["pm2_5"] is not None else None
                pm10 = float(comps["pm10"]) if "pm10" in comps and comps["pm10"] is not None else None
                no2 = float(comps["no2"]) if "no2" in comps and comps["no2"] is not None else None
                so2 = float(comps["so2"]) if "so2" in comps and comps["so2"] is not None else None
                raw_co = float(comps["co"]) if "co" in comps and comps["co"] is not None else None
                # OpenWeather CO is in µg/m³; convert to CPCB mg/m³
                co_mg = round(raw_co / 1000.0, 3) if raw_co is not None else None
                o3 = float(comps["o3"]) if "o3" in comps and comps["o3"] is not None else None
                nh3 = float(comps["nh3"]) if "nh3" in comps and comps["nh3"] is not None else None

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
                if nh3 is not None:
                    pollutants["NH3"] = nh3

                return {
                    "source": "OpenWeather",
                    "data_type": "modelled",
                    "observation_time": obs_iso,
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
                        "NH3": "µg/m³",
                    }
                }
            except Exception as e:
                logger.warning(f"Error fetching OpenWeather air pollution: {e}")
                return None

    # Alias for uniform provider interface
    get_current_air_quality = get_air_pollution

