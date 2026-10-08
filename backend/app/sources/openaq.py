import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict
import httpx

from app.core.config import get_settings
from app.domain.models import StationObservation, AirMeasurement
from app.sources.base import BaseAirQualityProvider

logger = logging.getLogger(__name__)


class OpenAQProvider(BaseAirQualityProvider):
    """
    OpenAQ API v3 provider adapter.
    Queries official OpenAQ v3 endpoints, supports X-API-Key authentication,
    normalizes observations into canonical Arise domain models.
    """
    name: str = "OpenAQ"
    BASE_URL: str = "https://api.openaq.org/v3"

    def __init__(self, api_key: Optional[str] = None, timeout: float = 10.0):
        settings = get_settings()
        self.api_key = api_key or settings.OPENAQ_API_KEY
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "application/json",
            "User-Agent": "Arise-Environmental-Intelligence/2.0",
        }
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers

    async def get_nearby_stations(
        self,
        lat: float,
        lon: float,
        radius_km: float = 35.0
    ) -> List[StationObservation]:
        """Fetch stations within radius_km using OpenAQ API v3 locations endpoint."""
        radius_meters = int(radius_km * 1000)
        url = f"{self.BASE_URL}/locations"
        params = {
            "coordinates": f"{lat},{lon}",
            "radius": radius_meters,
            "limit": 20
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url, params=params, headers=self._get_headers())
                if response.status_code == 401 or response.status_code == 403:
                    logger.warning("OpenAQ API authentication failed (invalid or missing X-API-Key).")
                    return []
                if response.status_code == 429:
                    logger.warning("OpenAQ API rate limit exceeded.")
                    return []
                if response.status_code != 200:
                    logger.warning(f"OpenAQ API returned non-200 status: {response.status_code}")
                    return []

                data = response.json()
                results = data.get("results", [])
                stations: List[StationObservation] = []

                for item in results:
                    loc_id = str(item.get("id"))
                    name = item.get("name") or f"Station {loc_id}"
                    coords = item.get("coordinates", {})
                    st_lat = coords.get("latitude")
                    st_lon = coords.get("longitude")
                    if st_lat is None or st_lon is None:
                        continue

                    # Parse latest sensors / measurements if present
                    pollutants: Dict[str, AirMeasurement] = {}
                    sensors = item.get("sensors", [])
                    now_iso = datetime.now(timezone.utc).isoformat()
                    
                    for sensor in sensors:
                        parameter = sensor.get("parameter", {})
                        param_name = parameter.get("name", "").upper()
                        latest = sensor.get("latest", {})
                        val = latest.get("value")
                        if val is not None and val >= 0:
                            unit = parameter.get("units", "µg/m³")
                            obs_time = latest.get("datetime", now_iso)
                            try:
                                m = AirMeasurement(
                                    pollutant=param_name,
                                    value=float(val),
                                    unit=unit,
                                    timestamp=obs_time,
                                    station_id=loc_id,
                                    station_name=name,
                                    latitude=st_lat,
                                    longitude=st_lon,
                                    source="OpenAQ"
                                )
                                pollutants[m.pollutant] = m
                            except Exception as ex:
                                logger.debug(f"Failed to normalize OpenAQ measurement: {ex}")

                    st_obs = StationObservation(
                        station_id=loc_id,
                        name=name,
                        latitude=st_lat,
                        longitude=st_lon,
                        pollutants=pollutants,
                        timestamp=now_iso,
                        source="OpenAQ",
                        is_stale=False
                    )
                    stations.append(st_obs)

                return stations

        except httpx.TimeoutException:
            logger.warning(f"OpenAQ API timed out after {self.timeout}s.")
            return []
        except Exception as e:
            logger.warning(f"OpenAQ API request error: {e}")
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
