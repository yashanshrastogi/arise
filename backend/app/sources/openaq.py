import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import httpx

from app.core.config import get_settings
from app.domain.models import StationObservation, AirMeasurement
from app.domain.aqi import calculate_aqi
from app.sources.base import BaseAirQualityProvider
from app.cache.repository import get_cache_repository

logger = logging.getLogger(__name__)


class OpenAQProvider(BaseAirQualityProvider):
    """
    Official OpenAQ API v3 provider adapter.
    Queries official OpenAQ v3 locations & latest measurement endpoints with X-API-Key authentication.
    Normalizes observations into canonical Arise domain models with local caching and stale fallback.
    """
    name: str = "OpenAQ"
    BASE_URL: str = "https://api.openaq.org/v3"

    def __init__(self, api_key: Optional[str] = None, timeout: float = 25.0):
        settings = get_settings()
        self.api_key = api_key or settings.OPENAQ_API_KEY
        self.timeout = timeout if self.api_key else 3.5
        self.cache = get_cache_repository()

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": "Arise-Environmental-Intelligence/2.0",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def _fetch_single_station_latest(
        self,
        client: httpx.AsyncClient,
        loc: Dict[str, Any],
        now_iso: str
    ) -> Optional[StationObservation]:
        """Fetch latest pollutant measurements for a single OpenAQ location."""
        loc_id = str(loc.get("id"))
        name = loc.get("name") or f"Station {loc_id}"
        coords = loc.get("coordinates", {})
        st_lat = coords.get("latitude")
        st_lon = coords.get("longitude")
        if st_lat is None or st_lon is None:
            return None

        # Build sensor metadata lookup
        sensor_meta: Dict[int, Dict[str, str]] = {}
        for s in loc.get("sensors", []):
            s_id = s.get("id")
            p = s.get("parameter", {})
            if s_id is not None:
                sensor_meta[s_id] = {
                    "param": p.get("name", "").upper(),
                    "unit": p.get("units", "µg/m³")
                }

        pollutants: Dict[str, AirMeasurement] = {}
        try:
            latest_url = f"{self.BASE_URL}/locations/{loc_id}/latest"
            resp = await client.get(latest_url, headers=self._get_headers())
            if resp.status_code == 200:
                results = resp.json().get("results", [])
                for item in results:
                    s_id = item.get("sensorsId")
                    meta = sensor_meta.get(s_id, {})
                    p_name = meta.get("param")
                    val = item.get("value")
                    dt_obj = item.get("datetime", {})
                    obs_time = dt_obj.get("utc") if isinstance(dt_obj, dict) else str(dt_obj)

                    if p_name and val is not None and val >= 0:
                        try:
                            raw_val = float(val)
                            unit_str = meta.get("unit", "µg/m³")

                            # Convert CO to mg/m³ for CPCB Indian standard compliance
                            if p_name == "CO":
                                if unit_str in ("µg/m³", "ug/m3") or raw_val > 50.0:
                                    raw_val = round(raw_val / 1000.0, 2)
                                elif unit_str == "ppb":
                                    raw_val = round((raw_val / 1000.0) * 1.15, 2)
                                elif unit_str == "ppm":
                                    raw_val = round(raw_val * 1.15, 2)
                                unit_str = "mg/m³"

                            # Plausibility checks (reject impossible sensor glitches)
                            if p_name == "PM2.5" and (raw_val < 0 or raw_val > 1000.0):
                                continue
                            if p_name == "PM10" and (raw_val < 0 or raw_val > 1500.0):
                                continue
                            if p_name == "CO" and (raw_val < 0 or raw_val > 50.0):
                                continue
                            if p_name in ("NO2", "SO2", "O3") and (raw_val < 0 or raw_val > 1000.0):
                                continue

                            m = AirMeasurement(
                                pollutant=p_name,
                                value=round(raw_val, 1),
                                unit=unit_str,
                                timestamp=obs_time or now_iso,
                                station_id=loc_id,
                                station_name=name,
                                latitude=st_lat,
                                longitude=st_lon,
                                source="OpenAQ",
                                quality="valid"
                            )
                            pollutants[m.pollutant] = m
                        except Exception:
                            pass
        except Exception as e:
            logger.debug(f"Error fetching latest for OpenAQ location {loc_id}: {e}")

        if pollutants:
            latest_ts = max((m.timestamp for m in pollutants.values()), default=now_iso)
            # Compute station AQI and individual pollutant sub-indices
            st_aqi_res = calculate_aqi({k: m.value for k, m in pollutants.items()})
            for k, m in pollutants.items():
                m.aqi_sub_index = st_aqi_res.sub_indices.get(k)

            return StationObservation(
                station_id=loc_id,
                name=name,
                latitude=st_lat,
                longitude=st_lon,
                pollutants=pollutants,
                aqi=st_aqi_res.aqi,
                dominant_pollutant=st_aqi_res.dominant_pollutant,
                timestamp=latest_ts,
                source="OpenAQ",
                is_stale=False
            )
        return None

    async def get_nearby_stations(
        self,
        lat: float,
        lon: float,
        radius_km: float = 25.0
    ) -> List[StationObservation]:
        """
        Fetch real-time stations within radius_km using OpenAQ API v3.
        Applies local cache, parallel queries for sensor observations, and stale fallback.
        """
        cache_key = f"openaq:{round(lat, 2)}:{round(lon, 2)}"
        
        # 1. Check cache
        cached = self.cache.get(cache_key)
        if cached and not cached.is_expired:
            logger.info("Serving fresh cached OpenAQ station observations.")
            return [StationObservation(**s) for s in cached.value]

        # OpenAQ v3 schema restricts radius to a maximum of 25,000 meters
        radius_meters = min(int(radius_km * 1000), 25000)
        url = f"{self.BASE_URL}/locations"
        params = {
            "coordinates": f"{lat},{lon}",
            "radius": radius_meters,
            "limit": 8
        }
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params, headers=self._get_headers())
                if response.status_code in (401, 403):
                    logger.warning("OpenAQ API authentication failed (invalid or missing X-API-Key).")
                    return self._get_stale_or_empty(cache_key)
                if response.status_code == 429:
                    logger.warning("OpenAQ API rate limit exceeded.")
                    return self._get_stale_or_empty(cache_key)
                if response.status_code != 200:
                    logger.warning(f"OpenAQ API returned non-200 status: {response.status_code}")
                    return self._get_stale_or_empty(cache_key)

                data = response.json()
                results = data.get("results", [])
                if not results:
                    logger.info("OpenAQ API returned 0 locations for coordinates.")
                    return self._get_stale_or_empty(cache_key)

                # Fetch latest observations in parallel across candidate stations
                tasks = [
                    self._fetch_single_station_latest(client, loc, now_iso)
                    for loc in results
                ]
                gathered = await asyncio.gather(*tasks)
                stations = [s for s in gathered if s is not None]

                if stations:
                    logger.info(f"Successfully retrieved {len(stations)} live OpenAQ stations with valid measurements.")
                    # Cache valid stations for 30 minutes
                    self.cache.set(
                        cache_key,
                        [s.model_dump() for s in stations],
                        ttl_seconds=1800,
                        source="OpenAQ"
                    )
                    return stations
                else:
                    logger.warning("OpenAQ locations had no active measurements.")
                    return self._get_stale_or_empty(cache_key)

        except httpx.TimeoutException:
            logger.warning(f"OpenAQ API timed out after {self.timeout}s.")
            return self._get_stale_or_empty(cache_key)
        except Exception as e:
            logger.warning(f"OpenAQ API request error: {e}")
            return self._get_stale_or_empty(cache_key)

    def _get_stale_or_empty(self, cache_key: str) -> List[StationObservation]:
        """Retrieve stale cached observations on upstream network failure."""
        stale_entry = self.cache.get(cache_key, allow_stale=True)
        if stale_entry and stale_entry.value:
            logger.info("Serving stale cached OpenAQ observations.")
            stations = []
            for item in stale_entry.value:
                obs = StationObservation(**item)
                obs.is_stale = True
                stations.append(obs)
            return stations
        return []

    async def get_station_details(self, station_id: str) -> Optional[StationObservation]:
        """Fetch individual station details from OpenAQ v3."""
        url = f"{self.BASE_URL}/locations/{station_id}"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=self._get_headers())
                if resp.status_code == 200:
                    data = resp.json().get("results", [{}])[0]
                    coords = data.get("coordinates", {})
                    return StationObservation(
                        station_id=station_id,
                        name=data.get("name", f"Station {station_id}"),
                        latitude=coords.get("latitude", 28.6139),
                        longitude=coords.get("longitude", 77.2090),
                        timestamp=datetime.now(timezone.utc).isoformat(),
                        source="OpenAQ"
                    )
        except Exception as e:
            logger.warning(f"Failed to fetch OpenAQ station {station_id}: {e}")
        return None
