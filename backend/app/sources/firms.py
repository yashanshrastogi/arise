import logging
from datetime import datetime, timezone
from typing import List, Optional
import httpx

from app.core.config import get_settings
from app.domain.models import FireSignal
from app.services.location_estimator import haversine_distance_km

logger = logging.getLogger(__name__)


class FirmsFireProvider:
    """
    NASA FIRMS (VIIRS Near-Real-Time) satellite thermal hotspot provider.
    Strictly reports thermal signal observations; NEVER asserts air pollution causation.
    """
    BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

    def __init__(self, map_key: Optional[str] = None, timeout: float = 10.0):
        settings = get_settings()
        self.map_key = map_key or settings.FIRMS_MAP_KEY
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS

    async def get_regional_fire_signals(
        self,
        target_lat: float = 28.6139,
        target_lon: float = 77.2090,
        force_demo: bool = False
    ) -> List[FireSignal]:
        """Query active thermal hotspots in monitored upwind agricultural/industrial corridors."""
        if not force_demo and self.map_key:
            # Regional bounding box for Punjab, Haryana, and NCR (West/North-West upwind)
            bbox = "74.0,28.0,78.5,31.5"
            url = f"{self.BASE_URL}/{self.map_key}/VIIRS_SNPP_NRT/{bbox}/1"
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        lines = resp.text.strip().split("\n")
                        signals: List[FireSignal] = []
                        if len(lines) > 1:
                            header = [h.strip() for h in lines[0].split(",")]
                            for line in lines[1:20]: # sample top 20
                                parts = [p.strip() for p in line.split(",")]
                                if len(parts) >= 3:
                                    f_lat = float(parts[0])
                                    f_lon = float(parts[1])
                                    dist = haversine_distance_km(target_lat, target_lon, f_lat, f_lon)
                                    signals.append(FireSignal(
                                        latitude=f_lat,
                                        longitude=f_lon,
                                        acquisition_time=datetime.now(timezone.utc).isoformat(),
                                        satellite="VIIRS",
                                        distance_km=dist,
                                        direction="NW",
                                        source="NASA-FIRMS",
                                        is_signal=True,
                                        display_text="Satellite fire signal detected in monitored upwind region."
                                    ))
                        return signals
            except Exception as e:
                logger.warning(f"NASA FIRMS API query failed: {e}. Falling back to demo signals.")

        # Calibrated demo fire signals in monitored upwind basin
        demo_fires = [
            (29.52, 76.82, "nominal", 115.0),
            (29.81, 76.48, "high", 152.0),
            (30.10, 76.15, "high", 195.0),
            (29.20, 77.05, "low", 82.0),
        ]
        now_iso = datetime.now(timezone.utc).isoformat()
        return [
            FireSignal(
                latitude=lat,
                longitude=lon,
                acquisition_time=now_iso,
                confidence=conf,
                satellite="VIIRS",
                distance_km=dist,
                direction="NW",
                source="DEMO",
                is_signal=True,
                display_text="Satellite fire signal detected in monitored upwind region."
            )
            for lat, lon, conf, dist in demo_fires
        ]
