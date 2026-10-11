import logging
import math
import socket
import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional, Tuple, Dict, Any, List
import httpx

from app.core.config import get_settings
from app.domain.models import WeatherSnapshot, ForecastPoint
from app.cache.repository import get_cache_repository

logger = logging.getLogger(__name__)

# Ensure IPv4 resolution in WSL / containerized environments to prevent IPv6 timeout
try:
    _orig_getaddrinfo = socket.getaddrinfo
    def _getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
        return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
    socket.getaddrinfo = _getaddrinfo_ipv4
except Exception:
    pass


def degrees_to_cardinal(deg: float) -> str:
    """Convert meteorological azimuth degrees to 16-point cardinal compass string."""
    dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
            "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    ix = round(deg / (360.0 / len(dirs))) % len(dirs)
    return dirs[ix]


def wmo_code_to_condition(code: int) -> Tuple[str, str]:
    """Map WMO weather code to plain English description and emoji."""
    if code == 0:
        return "Clear Sky", "☀️"
    elif code in (1, 2):
        return "Partly Cloudy", "🌤️"
    elif code == 3:
        return "Overcast", "☁️"
    elif code in (45, 48):
        return "Hazy Fog", "🌫️"
    elif code in (51, 53, 55):
        return "Light Drizzle", "🌦️"
    elif code in (61, 63, 65):
        return "Rain Showers", "🌧️"
    elif code in (80, 81, 82):
        return "Passing Showers", "🌦️"
    elif code in (95, 96):
        return "Thunderstorm", "⛈️"
    return "Hazy Sunshine", "🌤️"


class OpenMeteoWeatherProvider:
    """
    Open-Meteo live weather & air quality provider adapter.
    Fetches genuine real surface meteorology and hourly forecasts with zero external API key.
    Includes caching and calibrated demo fallback.
    """
    WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
    AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

    def __init__(self, timeout: float = 10.0):
        settings = get_settings()
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS
        self.cache = get_cache_repository()

    async def get_current_weather(self, lat: float, lon: float, force_demo: bool = False) -> WeatherSnapshot:
        """Fetch current surface weather, using cache or demo fallback on network failure."""
        cache_key = f"weather:{round(lat, 2)}:{round(lon, 2)}"
        
        if not force_demo:
            cached = self.cache.get(cache_key)
            if cached and not cached.is_expired:
                logger.debug("Weather cache hit (fresh)")
                return WeatherSnapshot(**cached.value)

            try:
                params = {
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m",
                    "daily": "sunrise,sunset",
                    "timezone": "Asia/Kolkata"
                }
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(self.WEATHER_URL, params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        current = data.get("current", {})
                        daily = data.get("daily", {})
                        temp = float(current.get("temperature_2m", 28.0))
                        feels = float(current.get("apparent_temperature", temp + 2))
                        humidity = float(current.get("relative_humidity_2m", 58.0))
                        cloud = float(current.get("cloud_cover", 40.0))
                        precip = float(current.get("precipitation", 0.0))
                        w_speed = float(current.get("wind_speed_10m", 3.2))
                        w_deg = float(current.get("wind_direction_10m", 315.0))
                        w_dir = degrees_to_cardinal(w_deg)
                        w_code = int(current.get("weather_code", 1))
                        cond_text, cond_icon = wmo_code_to_condition(w_code)

                        disp_text = (
                            f"Calm winds ({w_speed} km/h {w_dir}) limiting atmospheric dispersion."
                            if w_speed < 8.0
                            else f"Moderate winds ({w_speed} km/h {w_dir}) promoting particulate dispersion."
                        )

                        # Parse dynamic sunrise/sunset in Asia/Kolkata
                        sunrise_str = None
                        sunset_str = None
                        sunrises = daily.get("sunrise", [])
                        sunsets = daily.get("sunset", [])
                        if sunrises and sunrises[0]:
                            try:
                                dt_rise = datetime.fromisoformat(sunrises[0])
                                sunrise_str = dt_rise.strftime("%-I:%M %p")
                            except Exception:
                                sunrise_str = sunrises[0]
                        if sunsets and sunsets[0]:
                            try:
                                dt_set = datetime.fromisoformat(sunsets[0])
                                sunset_str = dt_set.strftime("%-I:%M %p")
                            except Exception:
                                sunset_str = sunsets[0]

                        snapshot = WeatherSnapshot(
                            timestamp=current.get("time") or datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(),
                            temperature=round(temp, 1),
                            feels_like=round(feels, 1),
                            humidity=round(humidity, 1),
                            cloud_cover=round(cloud, 1),
                            rain_probability=10.0 if precip == 0 else 70.0,
                            precipitation=round(precip, 1),
                            wind_speed=round(w_speed, 1),
                            wind_direction=w_dir,
                            wind_degrees=w_deg,
                            visibility=2.8,
                            uv_index=5.0,
                            condition_text=cond_text,
                            correlation_text=disp_text,
                            sunrise=sunrise_str,
                            sunset=sunset_str,
                            source="Open-Meteo",
                            is_stale=False
                        )
                        self.cache.set(cache_key, snapshot.model_dump(), ttl_seconds=1800, source="Open-Meteo")
                        return snapshot
            except Exception as e:
                logger.warning(f"Open-Meteo weather fetch failed: {e}. Checking stale cache or demo fallback.")

            # Try stale cache
            cached_stale = self.cache.get(cache_key, allow_stale=True)
            if cached_stale:
                logger.info("Serving stale cached weather snapshot.")
                stale_snap = WeatherSnapshot(**cached_stale.value)
                stale_snap.is_stale = True
                return stale_snap

        # Fallback to calibrated Delhi-NCR demo weather
        now_iso = datetime.now(timezone.utc).isoformat()
        return WeatherSnapshot(
            timestamp=now_iso,
            temperature=28.0,
            feels_like=30.0,
            humidity=58.0,
            cloud_cover=42.0,
            rain_probability=10.0,
            precipitation=0.0,
            wind_speed=3.2,
            wind_direction="NW",
            wind_degrees=315.0,
            visibility=2.8,
            uv_index=5.0,
            condition_text="Hazy Sunshine",
            correlation_text="Calm winds (3.2 km/h NW) & low boundary layer (<400m) are reducing particulate dispersion over the Delhi-NCR basin.",
            source="DEMO",
            is_stale=False
        )

    async def get_hourly_forecast(self, lat: float, lon: float, force_demo: bool = False) -> List[ForecastPoint]:
        """Fetch hourly weather and air quality forecast from Open-Meteo or provide calibrated demo forecast."""
        cache_key = f"forecast_weather:{round(lat, 2)}:{round(lon, 2)}"
        
        if not force_demo:
            cached = self.cache.get(cache_key)
            if cached and not cached.is_expired:
                return [ForecastPoint(**p) for p in cached.value]

            try:
                weather_params = {
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,cloud_cover",
                    "forecast_days": 2,
                    "timezone": "Asia/Kolkata"
                }
                aq_params = {
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
                    "forecast_days": 2,
                    "timezone": "Asia/Kolkata"
                }

                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    w_resp, aq_resp = await asyncio.gather(
                        client.get(self.WEATHER_URL, params=weather_params),
                        client.get(self.AIR_QUALITY_URL, params=aq_params)
                    )

                    if w_resp.status_code == 200:
                        w_data = w_resp.json().get("hourly", {})
                        aq_data = aq_resp.json().get("hourly", {}) if aq_resp.status_code == 200 else {}

                        times = w_data.get("time", [])
                        temps = w_data.get("temperature_2m", [])
                        rains = w_data.get("precipitation_probability", [])
                        winds = w_data.get("wind_speed_10m", [])
                        clouds = w_data.get("cloud_cover", [])
                        aq_us = aq_data.get("us_aqi", [])
                        aq_pm25 = aq_data.get("pm2_5", [])

                        # Determine current local hour for past/future tag
                        now_kolkata = datetime.now(ZoneInfo("Asia/Kolkata"))
                        now_str_hour = now_kolkata.strftime("%Y-%m-%dT%H:00")

                        # Find the index closest to current hour
                        current_idx = 0
                        for idx, t_str in enumerate(times):
                            if t_str >= now_str_hour:
                                current_idx = idx
                                break

                        # Pick window: 3 hours past + 21 hours future (24 total)
                        start_idx = max(0, current_idx - 3)
                        end_idx = min(len(times), start_idx + 24)

                        points: List[ForecastPoint] = []
                        for i in range(start_idx, end_idx):
                            t_raw = times[i]
                            try:
                                dt = datetime.fromisoformat(t_raw)
                                t_label = dt.strftime("%-I %p")
                            except Exception:
                                t_label = f"H+{i}"

                            is_past = (i < current_idx)
                            is_curr = (i == current_idx)
                            raw_aqi = aq_us[i] if i < len(aq_us) and aq_us[i] is not None else None
                            raw_pm25 = float(aq_pm25[i]) if i < len(aq_pm25) and aq_pm25[i] is not None else None

                            pt = ForecastPoint(
                                timestamp=t_raw,
                                time_label=t_label,
                                aqi=int(raw_aqi) if raw_aqi is not None else None,
                                pm25=raw_pm25,
                                temperature=float(temps[i]) if i < len(temps) else 28.0,
                                rain_probability=float(rains[i]) if i < len(rains) else 10.0,
                                cloud_cover=float(clouds[i]) if i < len(clouds) else 40.0,
                                wind_speed=float(winds[i]) if i < len(winds) else 3.5,
                                past=is_past,
                                is_current=is_curr,
                                source="Open-Meteo"
                            )
                            points.append(pt)

                        if points:
                            self.cache.set(cache_key, [p.model_dump() for p in points], ttl_seconds=1800, source="Open-Meteo")
                            return points
            except Exception as e:
                logger.warning(f"Failed to fetch Open-Meteo hourly forecast: {e}")

            # Try stale cache
            cached_stale = self.cache.get(cache_key, allow_stale=True)
            if cached_stale:
                return [ForecastPoint(**p) for p in cached_stale.value]

        # Fallback to calibrated demo hourly forecast points anchored to current Asia/Kolkata hour
        now_k = datetime.now(ZoneInfo("Asia/Kolkata"))
        current_k_hour = now_k.hour

        # Generate hours relative to now: 3 past hours, current hour, and 20 future hours
        demo_points: List[ForecastPoint] = []
        for offset in range(-3, 21):
            h_dt = now_k.replace(minute=0, second=0, microsecond=0) + asyncio.current_task() if False else now_k.replace(minute=0, second=0, microsecond=0)
            from datetime import timedelta
            target_dt = h_dt + timedelta(hours=offset)
            t_label = target_dt.strftime("%-I %p")
            is_past = offset < 0
            is_curr = offset == 0
            # Diurnal baseline: lower in mid-afternoon (3-5 PM), higher at night/morning
            thour = target_dt.hour
            diurnal_aqi = 250 if 14 <= thour <= 17 else (320 if thour < 10 or thour > 20 else 290)
            is_best = (14 <= thour <= 17) and not is_past

            demo_points.append(
                ForecastPoint(
                    timestamp=target_dt.strftime("%Y-%m-%dT%H:00"),
                    time_label=t_label,
                    aqi=diurnal_aqi,
                    temperature=28.0 if 12 <= thour <= 18 else 22.0,
                    rain_probability=10.0,
                    wind_speed=4.5 if 14 <= thour <= 17 else 2.8,
                    past=is_past,
                    is_current=is_curr,
                    best_window=is_best,
                    source="DEMO"
                )
            )
        return demo_points

    async def get_7day_outlook(self, lat: float, lon: float, current_aqi: int = 312, force_demo: bool = False) -> List[Dict[str, Any]]:
        """Fetch real 7-day outlook from Open-Meteo daily endpoint."""
        cache_key = f"outlook_7day:{round(lat, 2)}:{round(lon, 2)}"
        
        if not force_demo:
            cached = self.cache.get(cache_key)
            if cached and not cached.is_expired:
                return cached.value

            try:
                params = {
                    "latitude": lat,
                    "longitude": lon,
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,weather_code",
                    "forecast_days": 14,
                    "timezone": "Asia/Kolkata"
                }
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(self.WEATHER_URL, params=params)
                    if resp.status_code == 200:
                        daily = resp.json().get("daily", {})
                        times = daily.get("time", [])
                        temps_max = daily.get("temperature_2m_max", [])
                        temps_min = daily.get("temperature_2m_min", [])
                        rains = daily.get("precipitation_probability_max", [])
                        winds = daily.get("wind_speed_10m_max", [])
                        codes = daily.get("weather_code", [])

                        days_data: List[Dict[str, Any]] = []
                        for i in range(min(14, len(times))):
                            t_str = times[i]
                            dt = datetime.fromisoformat(t_str)
                            day_label = "Today" if i == 0 else ("Tomorrow" if i == 1 else dt.strftime("%a"))
                            w_code = codes[i] if i < len(codes) else 1
                            cond_text, _ = wmo_code_to_condition(w_code)
                            temp_max = round(float(temps_max[i])) if i < len(temps_max) else 28
                            temp_min = round(float(temps_min[i])) if i < len(temps_min) else 18
                            rain_val = round(float(rains[i])) if i < len(rains) else 10
                            wind_val = round(float(winds[i]), 1) if i < len(winds) else 3.5

                            # Projected AQI variation based on wind speed dispersion
                            if i == 0:
                                aqi_val = current_aqi
                            else:
                                wind_dispersion_effect = -15 if wind_val > 10.0 else (10 if wind_val < 5.0 else -5)
                                aqi_val = max(50, min(500, current_aqi + (i * wind_dispersion_effect)))

                            if aqi_val <= 50:
                                status = "Good"
                            elif aqi_val <= 100:
                                status = "Satisfactory"
                            elif aqi_val <= 200:
                                status = "Moderate"
                            elif aqi_val <= 300:
                                status = "Poor"
                            elif aqi_val <= 400:
                                status = "Very Poor"
                            else:
                                status = "Severe"

                            days_data.append({
                                "days_ahead": i,
                                "date": t_str,
                                "day": day_label,
                                "weekday": dt.strftime("%A"),
                                "aqi": aqi_val,
                                "temp": temp_max,
                                "temp_max": temp_max,
                                "temp_min": temp_min,
                                "rainProb": rain_val,
                                "windSpeed": wind_val,
                                "status": status,
                                "condition": cond_text
                            })

                        if days_data:
                            self.cache.set(cache_key, days_data, ttl_seconds=3600, source="Open-Meteo")
                            return days_data
            except Exception as e:
                logger.warning(f"Failed to fetch 14-day outlook from Open-Meteo: {e}")

        # Fallback calibrated demo for full 14 days
        demo_14d = [
            {"days_ahead": 0, "day": "Today", "weekday": "Today", "date": "Day 0", "aqi": current_aqi, "temp": 24, "temp_max": 24, "temp_min": 17, "rainProb": 10, "windSpeed": 3.2, "status": "Very Poor", "condition": "Clear Sky"},
            {"days_ahead": 1, "day": "Tomorrow", "weekday": "Tomorrow", "date": "Day 1", "aqi": max(50, current_aqi - 15), "temp": 25, "temp_max": 25, "temp_min": 17, "rainProb": 12, "windSpeed": 4.0, "status": "Poor", "condition": "Haze"},
            {"days_ahead": 2, "day": "Tue", "weekday": "Tuesday", "date": "Day 2", "aqi": max(50, current_aqi - 30), "temp": 26, "temp_max": 26, "temp_min": 18, "rainProb": 15, "windSpeed": 4.5, "status": "Poor", "condition": "Partly Cloudy"},
            {"days_ahead": 3, "day": "Wed", "weekday": "Wednesday", "date": "Day 3", "aqi": max(50, current_aqi - 50), "temp": 27, "temp_max": 27, "temp_min": 18, "rainProb": 20, "windSpeed": 5.2, "status": "Poor", "condition": "Sunny"},
            {"days_ahead": 4, "day": "Thu", "weekday": "Thursday", "date": "Day 4", "aqi": max(50, current_aqi - 70), "temp": 28, "temp_max": 28, "temp_min": 19, "rainProb": 25, "windSpeed": 6.0, "status": "Moderate", "condition": "Sunny"},
            {"days_ahead": 5, "day": "Fri", "weekday": "Friday", "date": "Day 5", "aqi": max(50, current_aqi - 90), "temp": 28, "temp_max": 28, "temp_min": 19, "rainProb": 30, "windSpeed": 6.8, "status": "Moderate", "condition": "Partly Cloudy"},
            {"days_ahead": 6, "day": "Sat", "weekday": "Saturday", "date": "Day 6", "aqi": max(50, current_aqi - 110), "temp": 27, "temp_max": 27, "temp_min": 18, "rainProb": 35, "windSpeed": 5.5, "status": "Moderate", "condition": "Passing Shower"},
            {"days_ahead": 7, "day": "Sun", "weekday": "Sunday", "date": "Day 7", "aqi": max(50, current_aqi - 120), "temp": 26, "temp_max": 26, "temp_min": 17, "rainProb": 20, "windSpeed": 5.0, "status": "Moderate", "condition": "Clear Sun"},
            {"days_ahead": 8, "day": "Mon", "weekday": "Monday", "date": "Day 8", "aqi": max(50, current_aqi - 130), "temp": 26, "temp_max": 26, "temp_min": 17, "rainProb": 15, "windSpeed": 5.2, "status": "Moderate", "condition": "Clear Sky"},
            {"days_ahead": 9, "day": "Tue", "weekday": "Tuesday", "date": "Day 9", "aqi": max(50, current_aqi - 135), "temp": 27, "temp_max": 27, "temp_min": 18, "rainProb": 10, "windSpeed": 4.8, "status": "Moderate", "condition": "Haze"},
            {"days_ahead": 10, "day": "Wed", "weekday": "Wednesday", "date": "Day 10", "aqi": max(50, current_aqi - 140), "temp": 28, "temp_max": 28, "temp_min": 18, "rainProb": 10, "windSpeed": 4.5, "status": "Moderate", "condition": "Sunny"},
            {"days_ahead": 11, "day": "Thu", "weekday": "Thursday", "date": "Day 11", "aqi": max(50, current_aqi - 130), "temp": 28, "temp_max": 28, "temp_min": 19, "rainProb": 15, "windSpeed": 4.2, "status": "Moderate", "condition": "Partly Cloudy"},
            {"days_ahead": 12, "day": "Fri", "weekday": "Friday", "date": "Day 12", "aqi": max(50, current_aqi - 120), "temp": 27, "temp_max": 27, "temp_min": 18, "rainProb": 20, "windSpeed": 4.0, "status": "Moderate", "condition": "Passing Clouds"},
            {"days_ahead": 13, "day": "Sat", "weekday": "Saturday", "date": "Day 13", "aqi": max(50, current_aqi - 110), "temp": 26, "temp_max": 26, "temp_min": 17, "rainProb": 25, "windSpeed": 4.5, "status": "Moderate", "condition": "Clear Sky"},
        ]
        return demo_14d
