from datetime import datetime, timezone
from typing import List, Optional, Dict
from app.domain.models import StationObservation, AirMeasurement
from app.sources.base import BaseAirQualityProvider
from app.services.location_estimator import haversine_distance_km


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
        },
        {
            "id": "st-sanjaynagar",
            "name": "Sanjay Nagar, Ghaziabad",
            "lat": 28.6853,
            "lon": 77.4538,
            "aqi": 358,
            "dominant": "PM2.5",
            "pm25": 172.0,
            "pm10": 255.0,
            "no2": 54.0,
            "so2": 16.5,
            "co": 1.6,
            "o3": 26.0
        },
        {
            "id": "st-vasundhara",
            "name": "Vasundhara, Ghaziabad",
            "lat": 28.6603,
            "lon": 77.3573,
            "aqi": 348,
            "dominant": "PM2.5",
            "pm25": 165.5,
            "pm10": 242.0,
            "no2": 50.2,
            "so2": 14.8,
            "co": 1.4,
            "o3": 28.0
        },
        {
            "id": "st-indirapuram",
            "name": "Indirapuram, Ghaziabad",
            "lat": 28.6416,
            "lon": 77.3712,
            "aqi": 342,
            "dominant": "PM2.5",
            "pm25": 161.0,
            "pm10": 236.0,
            "no2": 49.0,
            "so2": 14.2,
            "co": 1.3,
            "o3": 29.5
        },
        {
            "id": "st-loni",
            "name": "Loni, Ghaziabad",
            "lat": 28.7511,
            "lon": 77.2882,
            "aqi": 365,
            "dominant": "PM2.5",
            "pm25": 178.0,
            "pm10": 268.0,
            "no2": 56.5,
            "so2": 17.2,
            "co": 1.7,
            "o3": 24.0
        },
        {
            "id": "st-noida62",
            "name": "Sector 62, Noida",
            "lat": 28.6276,
            "lon": 77.3653,
            "aqi": 335,
            "dominant": "PM2.5",
            "pm25": 158.0,
            "pm10": 230.0,
            "no2": 47.8,
            "so2": 13.5,
            "co": 1.3,
            "o3": 31.0
        },
        {
            "id": "st-gurugram",
            "name": "Vikas Sadan, Gurugram",
            "lat": 28.4595,
            "lon": 77.0266,
            "aqi": 310,
            "dominant": "PM2.5",
            "pm25": 145.0,
            "pm10": 215.0,
            "no2": 44.5,
            "so2": 12.0,
            "co": 1.2,
            "o3": 33.0
        },
        {
            "id": "st-faridabad",
            "name": "Sector 16A, Faridabad",
            "lat": 28.4089,
            "lon": 77.3178,
            "aqi": 328,
            "dominant": "PM2.5",
            "pm25": 154.0,
            "pm10": 228.0,
            "no2": 46.2,
            "so2": 13.0,
            "co": 1.3,
            "o3": 32.5
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
            dist = haversine_distance_km(lat, lon, item["lat"], item["lon"])
            if dist > radius_km:
                continue
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
                is_stale=False,
                distance_km=dist
            )
            stations.append(st)

        return stations

    async def get_station_details(self, station_id: str) -> Optional[StationObservation]:
        stations = await self.get_nearby_stations(28.6139, 77.2090)
        for s in stations:
            if s.station_id == station_id:
                return s
        return None
