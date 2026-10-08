from datetime import datetime, timezone
from typing import List, Optional, Dict
from app.domain.models import StationObservation, AirMeasurement
from app.sources.base import BaseAirQualityProvider


class DemoAirProvider(BaseAirQualityProvider):
    """
    Deterministic Demo air quality provider.
    Provides verifiable, high-fidelity monitoring station data across Delhi-NCR.
    Always explicitly marked as source='DEMO'.
    """
    name: str = "DEMO"

    # Delhi-NCR baseline monitoring stations
    STATIONS_RAW = [
        {
            "id": "st-ito",
            "name": "ITO",
            "lat": 28.6289,
            "lon": 77.2412,
            "aqi": 312,
            "dominant": "PM2.5",
            "pm25": 142.5,
            "pm10": 210.3,
            "no2": 45.1,
            "so2": 12.4,
            "co": 1.2,
            "o3": 35.8
        },
        {
            "id": "st-rkpuram",
            "name": "RK Puram",
            "lat": 28.5635,
            "lon": 77.1724,
            "aqi": 295,
            "dominant": "PM2.5",
            "pm25": 130.2,
            "pm10": 195.0,
            "no2": 42.0,
            "so2": 10.5,
            "co": 1.0,
            "o3": 32.0
        },
        {
            "id": "st-anandvihar",
            "name": "Anand Vihar",
            "lat": 28.6469,
            "lon": 77.3164,
            "aqi": 345,
            "dominant": "PM2.5",
            "pm25": 168.0,
            "pm10": 240.0,
            "no2": 52.4,
            "so2": 15.1,
            "co": 1.5,
            "o3": 28.5
        },
        {
            "id": "st-punjabibagh",
            "name": "Punjabi Bagh",
            "lat": 28.6683,
            "lon": 77.1308,
            "aqi": 330,
            "dominant": "PM2.5",
            "pm25": 155.8,
            "pm10": 225.0,
            "no2": 48.2,
            "so2": 13.0,
            "co": 1.4,
            "o3": 30.1
        },
        {
            "id": "st-dwarka",
            "name": "Dwarka",
            "lat": 28.5921,
            "lon": 77.0460,
            "aqi": 275,
            "dominant": "PM2.5",
            "pm25": 118.0,
            "pm10": 185.0,
            "no2": 38.5,
            "so2": 9.2,
            "co": 0.9,
            "o3": 38.0
        },
        {
            "id": "st-lodhiroad",
            "name": "Lodhi Road",
            "lat": 28.5918,
            "lon": 77.2273,
            "aqi": 285,
            "dominant": "PM2.5",
            "pm25": 122.0,
            "pm10": 190.5,
            "no2": 40.1,
            "so2": 11.0,
            "co": 1.1,
            "o3": 34.0
        }
    ]

    async def get_nearby_stations(
        self,
        lat: float,
        lon: float,
        radius_km: float = 35.0
    ) -> List[StationObservation]:
        """Return all calibrated Delhi-NCR demo stations."""
        now_iso = datetime.now(timezone.utc).isoformat()
        stations: List[StationObservation] = []

        for item in self.STATIONS_RAW:
            pollutants: Dict[str, AirMeasurement] = {
                "PM2.5": AirMeasurement(
                    pollutant="PM2.5",
                    value=item["pm25"],
                    unit="µg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
                "PM10": AirMeasurement(
                    pollutant="PM10",
                    value=item["pm10"],
                    unit="µg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
                "NO2": AirMeasurement(
                    pollutant="NO2",
                    value=item["no2"],
                    unit="µg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
                "SO2": AirMeasurement(
                    pollutant="SO2",
                    value=item["so2"],
                    unit="µg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
                "CO": AirMeasurement(
                    pollutant="CO",
                    value=item["co"],
                    unit="mg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
                "O3": AirMeasurement(
                    pollutant="O3",
                    value=item["o3"],
                    unit="µg/m³",
                    timestamp=now_iso,
                    station_id=item["id"],
                    station_name=item["name"],
                    latitude=item["lat"],
                    longitude=item["lon"],
                    source="DEMO",
                    quality="valid"
                ),
            }

            st = StationObservation(
                station_id=item["id"],
                name=item["name"],
                latitude=item["lat"],
                longitude=item["lon"],
                pollutants=pollutants,
                aqi=item["aqi"],
                dominant_pollutant=item["dominant"],
                timestamp=now_iso,
                source="DEMO",
                is_stale=False
            )
            stations.append(st)

        return stations

    async def get_station_details(self, station_id: str) -> Optional[StationObservation]:
        stations = await self.get_nearby_stations(28.6139, 77.2090)
        for s in stations:
            if s.station_id == station_id:
                return s
        return None
