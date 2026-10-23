import logging
import math
import socket
import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import Optional, Tuple, Dict, Any, List
import httpx

from app.core.config import get_settings
from app.domain.models import WeatherSnapshot, ForecastPoint
from app.sources.base import BaseWeatherProvider
from app.cache.repository import get_cache_repository, get_geographic_cell

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


from app.sources.openweather import OpenWeatherProvider
from app.sources.tomorrow import TomorrowIoProvider


class OpenMeteoWeatherProvider(BaseWeatherProvider):
    """
    Open-Meteo live weather & air quality provider adapter.
    Fetches genuine real surface meteorology and hourly forecasts with zero external API key.
    Includes high-precision spatial grid caching (configurable resolution), multi-Lambda
    request coalescing, and multi-secondary provider fallback (OpenWeather, Tomorrow.io).
    """
    name: str = "Open-Meteo"
    WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
    AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"

    def __init__(
        self,
        timeout: float = 10.0,
        secondary_provider: Optional[BaseWeatherProvider] = None,
        secondary_providers: Optional[List[BaseWeatherProvider]] = None,
    ):
        settings = get_settings()
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS
        self.cache = get_cache_repository()
        self.grid_res = settings.WEATHER_GRID_RESOLUTION_DEG
        self.fresh_seconds = settings.WEATHER_FRESH_SECONDS
        self.grace_seconds = settings.WEATHER_GRACE_SECONDS

        self.secondary_providers: List[BaseWeatherProvider] = []
        if secondary_providers:
            self.secondary_providers.extend(secondary_providers)
        elif secondary_provider:
            self.secondary_providers.append(secondary_provider)
        else:
            # Auto-configure configured secondary providers
            ow = OpenWeatherProvider(timeout=self.timeout)
            if ow.is_configured:
                self.secondary_providers.append(ow)
            tom = TomorrowIoProvider(timeout=self.timeout)
            if tom.is_configured:
                self.secondary_providers.append(tom)

        self.secondary_provider = self.secondary_providers[0] if self.secondary_providers else None

    async def get_current_weather(self, lat: float, lon: float, force_demo: bool = False) -> WeatherSnapshot:
        """Fetch current surface weather, using cache, single-flight coalescing, or secondary fallback on network failure."""
        cell_lat, cell_lon, cache_key = get_geographic_cell(lat, lon, resolution_deg=self.grid_res)
        
        now_iso = datetime.now(timezone.utc).isoformat()
        if not force_demo:
            # 1. Fresh cache check
            cached = self.cache.get(cache_key, allow_stale=False)
            if cached:
                logger.debug(f"Weather cache hit (fresh) for cell {cell_lat}, {cell_lon}")
                snap = WeatherSnapshot(**cached.value)
                snap.is_stale = False
                return snap

            # 2. Multi-Lambda / Multi-Process Request Coalescing (Single-Flight Lock)
            lock_token = self.cache.acquire_fetch_lock(cache_key, lease_seconds=8)
            if not lock_token:
                # Another worker is actively fetching upstream; poll for cache population
                for _ in range(12):
                    await asyncio.sleep(0.25)
                    c = self.cache.get(cache_key, allow_stale=False)
                    if c:
                        logger.debug(f"Coalesced concurrent request waited and hit fresh cache for cell {cell_lat}, {cell_lon}")
                        snap = WeatherSnapshot(**c.value)
                        snap.is_stale = False
                        return snap

                # Polling window elapsed. First check if eligible stale cache exists rather than duplicating upstream fetch
                cached_stale = self.cache.get(cache_key, allow_stale=True)
                if cached_stale:
                    logger.info(f"Serving stale cached weather after coalescing wait for cell {cell_lat}, {cell_lon}.")
                    stale_snap = WeatherSnapshot(**cached_stale.value)
                    stale_snap.is_stale = True
                    return stale_snap

                # If no stale cache exists, only proceed to upstream if we can now acquire the lock
                lock_token = self.cache.acquire_fetch_lock(cache_key, lease_seconds=8)
                if not lock_token:
                    logger.warning(f"Coalescing wait elapsed and lock still active for {cache_key}. Returning degraded weather.")
                    return self._build_degraded_weather(now_iso)

            try:
                # 3. Query Upstream Primary Provider (Open-Meteo)
                try:
                    params = {
                        "latitude": lat,
                        "longitude": lon,
                        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,surface_pressure,dew_point_2m,visibility",
                        "daily": "sunrise,sunset,uv_index_max",
                        "timezone": "auto"
                    }
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        resp = await client.get(self.WEATHER_URL, params=params)
                        if resp.status_code == 200:
                            data = resp.json()
                            current = data.get("current", {})
                            daily = data.get("daily", {})
                            tz_name = data.get("timezone", "UTC")

                            temp = float(current.get("temperature_2m", 20.0))
                            feels = float(current.get("apparent_temperature", temp))
                            humidity = float(current.get("relative_humidity_2m", 50.0))
                            cloud = float(current.get("cloud_cover", 30.0))
                            precip = float(current.get("precipitation", 0.0))
                            w_speed = float(current.get("wind_speed_10m", 3.0))
                            w_deg = float(current.get("wind_direction_10m", 0.0))
                            w_dir = degrees_to_cardinal(w_deg)
                            w_code = int(current.get("weather_code", 0))
                            cond_text, _ = wmo_code_to_condition(w_code)

                            # Parse real surface pressure, dew point, and visibility (convert meters to km)
                            surface_pres = float(current["surface_pressure"]) if "surface_pressure" in current and current["surface_pressure"] is not None else None
                            dew_pt = float(current["dew_point_2m"]) if "dew_point_2m" in current and current["dew_point_2m"] is not None else None
                            raw_vis = current.get("visibility")
                            vis_km = round(float(raw_vis) / 1000.0, 1) if raw_vis is not None else None

                            # Parse real UV index from daily endpoint
                            uv_list = daily.get("uv_index_max", [])
                            real_uv = float(uv_list[0]) if uv_list and uv_list[0] is not None else None

                            disp_text = (
                                f"Calm winds ({w_speed} km/h {w_dir}) limiting atmospheric dispersion."
                                if w_speed < 8.0
                                else f"Moderate winds ({w_speed} km/h {w_dir}) promoting particulate dispersion."
                            )

                            # Parse dynamic sunrise/sunset in local timezone
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

                            now_iso = datetime.now(timezone.utc).isoformat()
                            obs_time = current.get("time") or now_iso

                            snapshot = WeatherSnapshot(
                                timestamp=obs_time,
                                temperature=round(temp, 1),
                                feels_like=round(feels, 1),
                                humidity=round(humidity, 1),
                                cloud_cover=round(cloud, 1),
                                rain_probability=10.0 if precip == 0 else 70.0,
                                precipitation=round(precip, 1),
                                wind_speed=round(w_speed, 1),
                                wind_direction=w_dir,
                                wind_degrees=w_deg,
                                visibility=vis_km,
                                uv_index=real_uv,
                                surface_pressure=surface_pres,
                                dew_point=dew_pt,
                                condition_text=cond_text,
                                correlation_text=disp_text,
                                sunrise=sunrise_str,
                                sunset=sunset_str,
                                source="Open-Meteo",
                                data_provenance="numerical_weather_prediction",
                                retrieval_timestamp=now_iso,
                                observation_time=obs_time,
                                local_timezone=tz_name,
                                grid_resolution_deg=self.grid_res,
                                is_stale=False
                            )
                            self.cache.set(
                                cache_key,
                                snapshot.model_dump(),
                                ttl_seconds=self.fresh_seconds,
                                source="Open-Meteo",
                                grace_seconds=self.grace_seconds,
                            )
                            return snapshot
                        else:
                            logger.warning(f"Open-Meteo returned status {resp.status_code}. Checking fallback providers.")
                except Exception as e:
                    logger.warning(f"Open-Meteo weather fetch failed: {e}. Checking fallback providers.")

                # 4. Secondary Provider Fallback (OpenWeather / Tomorrow.io)
                providers_to_try = self.secondary_providers or ([self.secondary_provider] if self.secondary_provider else [])
                for sec_prov in providers_to_try:
                    try:
                        logger.info(f"Attempting secondary weather provider ({sec_prov.name})...")
                        sec_snap = await sec_prov.get_current_weather(lat, lon)
                        self.cache.set(
                            cache_key,
                            sec_snap.model_dump(),
                            ttl_seconds=self.fresh_seconds,
                            source=sec_snap.source,
                            grace_seconds=self.grace_seconds,
                        )
                        return sec_snap
                    except Exception as sec_e:
                        logger.warning(f"Secondary weather provider ({sec_prov.name}) failed: {sec_e}. Trying next provider.")

                # 5. Try stale cache within grace window (e.g. up to 1800s)
                cached_stale = self.cache.get(cache_key, allow_stale=True)
                if cached_stale:
                    logger.info(f"Serving stale cached weather snapshot for cell {cell_lat}, {cell_lon}.")
                    stale_snap = WeatherSnapshot(**cached_stale.value)
                    stale_snap.is_stale = True
                    return stale_snap
            finally:
                if lock_token:
                    self.cache.release_fetch_lock(cache_key, token=lock_token)

        # 6. Fallback Handling (Never return fabricated Delhi-NCR data for unrelated coordinates)
        if force_demo:
            # Calibrated demo weather for explicit demo requests
            return WeatherSnapshot(
                timestamp=now_iso,
                temperature=28.0,
                feels_like=30.0,
                humidity=65.0,
                cloud_cover=20.0,
                rain_probability=10.0,
                precipitation=0.0,
                wind_speed=4.0,
                wind_direction="NW",
                wind_degrees=315.0,
                visibility=8.0,
                uv_index=4.0,
                surface_pressure=1012.0,
                dew_point=13.5,
                condition_text="Clear Sky",
                correlation_text="Simulated atmospheric telemetry (Demo Mode).",
                source="DEMO",
                data_provenance="degraded",
                retrieval_timestamp=now_iso,
                observation_time=now_iso,
                local_timezone="UTC",
                grid_resolution_deg=self.grid_res,
                is_stale=False,
            )

        # Honest degraded response when providers and cache are unavailable
        return self._build_degraded_weather(now_iso)

    def _build_degraded_weather(self, now_iso: str) -> WeatherSnapshot:
        """Honest degraded response without fabricated zero-valued measurements."""
        return WeatherSnapshot(
            timestamp=now_iso,
            temperature=None,
            feels_like=None,
            humidity=None,
            cloud_cover=None,
            rain_probability=None,
            precipitation=None,
            wind_speed=None,
            wind_direction="—",
            wind_degrees=None,
            visibility=None,
            uv_index=None,
            surface_pressure=None,
            dew_point=None,
            condition_text="Unavailable",
            correlation_text="Live atmospheric telemetry is currently unreachable for these coordinates.",
            source="Unavailable",
            data_provenance="degraded",
            retrieval_timestamp=now_iso,
            observation_time=now_iso,
            local_timezone="UTC",
            grid_resolution_deg=self.grid_res,
            is_stale=True,
        )

    async def get_hourly_forecast(self, lat: float, lon: float, force_demo: bool = False) -> List[ForecastPoint]:
        """Fetch hourly weather and air quality forecast from Open-Meteo or provide calibrated demo forecast."""
        cell_lat, cell_lon, _ = get_geographic_cell(lat, lon, resolution_deg=self.grid_res)
        cache_key = f"forecast_weather:{cell_lat:.4f}:{cell_lon:.4f}"
        
        if not force_demo:
            cached = self.cache.get(cache_key)
            if cached and not cached.is_expired:
                return [ForecastPoint(**p) for p in cached.value]

            try:
                weather_params = {
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,cloud_cover",
                    "forecast_days": 2,
                    "timezone": "auto"
                }
                aq_params = {
                    "latitude": lat,
                    "longitude": lon,
                    "hourly": "pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
                    "forecast_days": 2,
                    "timezone": "auto"
                }

                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    w_task = client.get(self.WEATHER_URL, params=weather_params)
                    aq_task = client.get(self.AIR_QUALITY_URL, params=aq_params)
                    results = await asyncio.gather(w_task, aq_task, return_exceptions=True)
                    w_res, aq_res = results[0], results[1]

                    w_resp = w_res if not isinstance(w_res, Exception) else None
                    aq_resp = aq_res if not isinstance(aq_res, Exception) else None

                    if w_resp and w_resp.status_code == 200:
                        w_json = w_resp.json()
                        w_data = w_json.get("hourly", {})
                        aq_data = aq_resp.json().get("hourly", {}) if (aq_resp and aq_resp.status_code == 200) else {}
                        tz_str = w_json.get("timezone", "UTC")

                        times = w_data.get("time", [])
                        temps = w_data.get("temperature_2m", [])
                        rains = w_data.get("precipitation_probability", [])
                        precips = w_data.get("precipitation", [])
                        winds = w_data.get("wind_speed_10m", [])
                        gusts = w_data.get("wind_gusts_10m", [])
                        clouds = w_data.get("cloud_cover", [])
                        aq_us = aq_data.get("us_aqi", [])
                        aq_pm25 = aq_data.get("pm2_5", [])

                        # Determine current local hour for past/future tag based on local timezone
                        try:
                            loc_tz = ZoneInfo(tz_str)
                        except Exception:
                            loc_tz = timezone.utc
                        now_local = datetime.now(loc_tz)
                        now_str_hour = now_local.strftime("%Y-%m-%dT%H:00")

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
                            raw_precip = float(precips[i]) if i < len(precips) and precips[i] is not None else None
                            raw_gust = float(gusts[i]) if i < len(gusts) and gusts[i] is not None else None

                            pt = ForecastPoint(
                                timestamp=t_raw,
                                time_label=t_label,
                                aqi=int(raw_aqi) if raw_aqi is not None else None,
                                pm25=raw_pm25,
                                temperature=float(temps[i]) if i < len(temps) else 20.0,
                                rain_probability=float(rains[i]) if i < len(rains) else 10.0,
                                precipitation=raw_precip,
                                cloud_cover=float(clouds[i]) if i < len(clouds) else 40.0,
                                wind_speed=float(winds[i]) if i < len(winds) else 3.5,
                                wind_gusts=raw_gust,
                                past=is_past,
                                is_current=is_curr,
                                source="Open-Meteo Air Quality Model" if raw_aqi is not None else "Open-Meteo NWP (Air Quality Unavailable)"
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

            return []

        # Fallback calibrated demo hourly forecast points anchored to current UTC hour (only when force_demo=True)
        now_utc = datetime.now(timezone.utc)
        demo_points: List[ForecastPoint] = []
        for offset in range(-3, 21):
            target_dt = now_utc.replace(minute=0, second=0, microsecond=0) + timedelta(hours=offset)
            t_label = target_dt.strftime("%-I %p")
            is_past = offset < 0
            is_curr = offset == 0
            thour = target_dt.hour
            diurnal_aqi = 65 if 14 <= thour <= 17 else (110 if thour < 10 or thour > 20 else 85)
            is_best = (14 <= thour <= 17) and not is_past

            demo_points.append(
                ForecastPoint(
                    timestamp=target_dt.strftime("%Y-%m-%dT%H:00"),
                    time_label=t_label,
                    aqi=diurnal_aqi,
                    temperature=22.0 if 12 <= thour <= 18 else 16.0,
                    rain_probability=10.0,
                    wind_speed=4.5 if 14 <= thour <= 17 else 2.8,
                    past=is_past,
                    is_current=is_curr,
                    best_window=is_best,
                    source="DEMO"
                )
            )
        return demo_points

    async def get_current_air_quality(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Fetch current regional modelled atmospheric air quality (PM2.5, PM10, etc.) from Open-Meteo CAMS models."""
        cell_lat, cell_lon, _ = get_geographic_cell(lat, lon, resolution_deg=self.grid_res)
        cache_key = f"air_quality_model:{cell_lat:.4f}:{cell_lon:.4f}"
        cached = self.cache.get(cache_key)
        if cached and not cached.is_expired:
            return cached.value

        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi",
            "timezone": "auto"
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(self.AIR_QUALITY_URL, params=params)
                if resp.status_code == 200:
                    data = resp.json().get("current", {})
                    if data:
                        self.cache.set(cache_key, data, ttl_seconds=self.fresh_seconds)
                        return data
        except Exception as e:
            logger.warning(f"Open-Meteo modelled air quality fetch failed for {lat}, {lon}: {e}")
        return None

    async def get_7day_outlook(self, lat: float, lon: float, current_aqi: Optional[int] = None, force_demo: bool = False) -> List[Dict[str, Any]]:
        """Fetch real 7-day outlook from Open-Meteo daily endpoint."""
        cell_lat, cell_lon, _ = get_geographic_cell(lat, lon, resolution_deg=self.grid_res)
        aqi_tag = f"aqi_{current_aqi}" if current_aqi is not None else "no_aqi"
        cache_key = f"outlook_7day:{cell_lat:.4f}:{cell_lon:.4f}:{aqi_tag}"
        
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
                    "timezone": "auto"
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
                            temp_max = round(float(temps_max[i])) if i < len(temps_max) else 22
                            temp_min = round(float(temps_min[i])) if i < len(temps_min) else 14
                            rain_val = round(float(rains[i])) if i < len(rains) else 10
                            wind_val = round(float(winds[i]), 1) if i < len(winds) else 3.5

                            # Projected AQI variation based on wind speed dispersion
                            if current_aqi is not None:
                                if i == 0:
                                    aqi_val = current_aqi
                                else:
                                    wind_dispersion_effect = -10 if wind_val > 10.0 else (8 if wind_val < 5.0 else -3)
                                    aqi_val = max(0, min(500, current_aqi + (i * wind_dispersion_effect)))

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
                            else:
                                aqi_val = None
                                status = "Unavailable"

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
                            self.cache.set(cache_key, days_data, ttl_seconds=7200, source="Open-Meteo")
                            return days_data
            except Exception as e:
                logger.warning(f"Failed to fetch 14-day outlook from Open-Meteo: {e}")

            # Try stale cache
            cached_stale = self.cache.get(cache_key, allow_stale=True)
            if cached_stale:
                return cached_stale.value

            return []

        # Fallback calibrated demo for full 14 days (only when force_demo=True)
        now_dt = datetime.now(timezone.utc)
        demo_14d = []
        demo_base_aqi = current_aqi if current_aqi is not None else 100
        for i in range(14):
            day_dt = now_dt + timedelta(days=i)
            day_label = "Today" if i == 0 else ("Tomorrow" if i == 1 else day_dt.strftime("%a"))
            demo_14d.append({
                "days_ahead": i,
                "day": day_label,
                "weekday": day_dt.strftime("%A"),
                "date": day_dt.strftime("%Y-%m-%d"),
                "aqi": max(30, demo_base_aqi - (i * 5)),
                "temp": 22 + (i % 4),
                "temp_max": 24 + (i % 3),
                "temp_min": 14 + (i % 2),
                "rainProb": 10 + (i * 3) % 40,
                "windSpeed": 4.0,
                "status": "Moderate" if demo_base_aqi > 100 else "Good",
                "condition": "Partly Cloudy",
            })
        return demo_14d
