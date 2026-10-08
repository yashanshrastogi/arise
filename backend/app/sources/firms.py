import logging
from datetime import datetime, timezone
from typing import List, Optional
import httpx

from app.core.config import get_settings
from app.domain.models import FireSignal
from app.services.location_estimator import haversine_distance_km
from app.cache.repository import get_cache_repository

logger = logging.getLogger(__name__)


class FirmsFireProvider:
    """
    NASA FIRMS (VIIRS Near-Real-Time) satellite thermal hotspot provider.
    Strictly reports thermal signal observations; NEVER asserts air pollution causation.
    Respects API quotas via aggressive local caching.
    """
    BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"

    def __init__(self, map_key: Optional[str] = None, timeout: float = 15.0):
        settings = get_settings()
        self.map_key = map_key or settings.FIRMS_MAP_KEY
        self.timeout = timeout or settings.API_TIMEOUT_SECONDS
        self.cache = get_cache_repository()

    async def get_regional_fire_signals(
        self,
        target_lat: float = 28.6139,
        target_lon: float = 77.2090,
        force_demo: bool = False
    ) -> List[FireSignal]:
        """Query active thermal hotspots in monitored upwind agricultural/industrial corridors."""
        cache_key = f"firms:{round(target_lat, 2)}:{round(target_lon, 2)}"

        if not force_demo:
            # 1. Check fresh cache to respect FIRMS rate limits
            cached = self.cache.get(cache_key)
            if cached and not cached.is_expired:
                logger.info("Serving fresh cached NASA FIRMS fire signals.")
                return [FireSignal(**s) for s in cached.value]

            if self.map_key:
                # Regional bounding box for Punjab, Haryana, Delhi-NCR & Western UP: W,S,E,N
                bbox = "74.0,27.0,78.5,32.0"
                url = f"{self.BASE_URL}/{self.map_key}/VIIRS_SNPP_NRT/{bbox}/3"
                try:
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            lines = resp.text.strip().split("\n")
                            signals: List[FireSignal] = []
                            now_iso = datetime.now(timezone.utc).isoformat()
                            if len(lines) > 1:
                                for line in lines[1:30]:  # Sample representative regional detections
                                    parts = [p.strip() for p in line.split(",")]
                                    if len(parts) >= 3:
                                        try:
                                            f_lat = float(parts[0])
                                            f_lon = float(parts[1])
                                            bright = float(parts[2]) if len(parts) > 2 and parts[2] else None
                                            acq_d = parts[5] if len(parts) > 5 else ""
                                            acq_t = parts[6] if len(parts) > 6 else ""
                                            conf_raw = parts[9].lower() if len(parts) > 9 else "n"
                                            conf = "high" if conf_raw == "h" else "low" if conf_raw == "l" else "nominal"
                                            frp_val = float(parts[12]) if len(parts) > 12 and parts[12] else None
                                            
                                            dist = round(haversine_distance_km(target_lat, target_lon, f_lat, f_lon), 1)
                                            # Relative bearing determination
                                            d_lat = f_lat - target_lat
                                            d_lon = f_lon - target_lon
                                            bearing = ("NW" if d_lat >= 0 and d_lon <= 0 else
                                                       "NE" if d_lat >= 0 and d_lon > 0 else
                                                       "SW" if d_lat < 0 and d_lon <= 0 else "SE")

                                            acq_ts = f"{acq_d}T{acq_t[:2]}:{acq_t[2:4]}:00Z" if len(acq_t) >= 4 and acq_d else now_iso

                                            signals.append(FireSignal(
                                                latitude=f_lat,
                                                longitude=f_lon,
                                                acquisition_time=acq_ts,
                                                confidence=conf,
                                                brightness=bright,
                                                frp=frp_val,
                                                satellite="VIIRS",
                                                distance_km=dist,
                                                direction=bearing,
                                                source="NASA-FIRMS",
                                                is_signal=True,
                                                display_text="Satellite fire signal detected in monitored upwind region."
                                            ))
                                        except Exception:
                                            pass

                            if signals:
                                logger.info(f"Retrieved {len(signals)} live NASA FIRMS fire signals.")
                                self.cache.set(
                                    cache_key,
                                    [s.model_dump() for s in signals],
                                    ttl_seconds=1800,
                                    source="NASA-FIRMS"
                                )
                                return signals
                except Exception as e:
                    logger.warning(f"NASA FIRMS API query failed: {e}. Checking stale cache or demo fallback.")

            # Stale cache check
            stale = self.cache.get(cache_key, allow_stale=True)
            if stale and stale.value:
                logger.info("Serving stale cached NASA FIRMS fire signals.")
                return [FireSignal(**s) for s in stale.value]

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
