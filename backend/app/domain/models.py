from datetime import datetime, timezone
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel, Field, field_validator


class AirMeasurement(BaseModel):
    """Normalized observation for an individual chemical / particulate pollutant."""
    pollutant: str = Field(description="Standardized name: PM2.5, PM10, NO2, SO2, CO, O3")
    value: float = Field(ge=0.0, description="Concentration value in given unit")
    unit: str = Field(default="µg/m³", description="Unit of measurement, e.g. µg/m³ or mg/m³")
    timestamp: str = Field(description="ISO 8601 observation timestamp")
    station_id: Optional[str] = None
    station_name: Optional[str] = None
    latitude: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    longitude: Optional[float] = Field(default=None, ge=-180.0, le=180.0)
    source: str = Field(default="CPCB", description="Source provider: CPCB, OpenAQ, DEMO")
    quality: Literal["valid", "estimated", "suspect"] = "valid"
    aqi_sub_index: Optional[int] = Field(default=None, ge=0)

    @field_validator("pollutant")
    @classmethod
    def normalize_pollutant_name(cls, v: str) -> str:
        mapping = {
            "pm25": "PM2.5",
            "pm2.5": "PM2.5",
            "pm10": "PM10",
            "no2": "NO2",
            "so2": "SO2",
            "co": "CO",
            "o3": "O3",
            "ozone": "O3"
        }
        clean = v.strip().lower()
        return mapping.get(clean, v.upper())


class StationObservation(BaseModel):
    """Aggregate readings from a single ground monitoring station."""
    station_id: str
    name: str
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    pollutants: Dict[str, AirMeasurement] = Field(default_factory=dict)
    aqi: Optional[int] = Field(default=None, ge=0)
    dominant_pollutant: Optional[str] = None
    timestamp: str
    source: str = "CPCB"
    is_stale: bool = False
    distance_km: Optional[float] = Field(default=None, ge=0.0)
    weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class WeatherSnapshot(BaseModel):
    """Surface meteorological conditions."""
    timestamp: str
    temperature: float = Field(description="Air temperature in Celsius")
    feels_like: float = Field(description="Apparent temperature in Celsius")
    humidity: float = Field(ge=0.0, le=100.0, description="Relative humidity percentage")
    cloud_cover: float = Field(default=0.0, ge=0.0, le=100.0, description="Cloud cover percentage")
    rain_probability: float = Field(default=0.0, ge=0.0, le=100.0, description="Precipitation probability %")
    precipitation: float = Field(default=0.0, ge=0.0, description="Precipitation depth in mm")
    wind_speed: float = Field(ge=0.0, description="Surface wind speed in km/h")
    wind_direction: str = Field(default="NW", description="Cardinal wind direction (e.g. NW)")
    wind_degrees: Optional[float] = Field(default=None, ge=0.0, le=360.0)
    visibility: Optional[float] = Field(default=None, ge=0.0, description="Horizontal visibility in km")
    uv_index: Optional[float] = Field(default=None, ge=0.0)
    source: str = "Open-Meteo"
    is_stale: bool = False
    condition_text: Optional[str] = "Haze"
    correlation_text: Optional[str] = None


class ForecastPoint(BaseModel):
    """Single hour or day forecast projection."""
    timestamp: str
    time_label: str
    aqi: Optional[int] = Field(default=None, ge=0)
    pm25: Optional[float] = Field(default=None, ge=0.0)
    temperature: float
    rain_probability: float = Field(default=0.0, ge=0.0, le=100.0)
    cloud_cover: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    wind_speed: float = Field(default=0.0, ge=0.0)
    wind_direction: Optional[str] = None
    past: bool = False
    best_window: bool = False
    source: str = "Open-Meteo"
    confidence: Literal["high", "moderate", "low"] = "moderate"


class FireSignal(BaseModel):
    """Satellite thermal hotspot signal (VIIRS/MODIS via NASA FIRMS).
    Note: Signal terminology only; never assert direct causation."""
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    acquisition_time: str
    confidence: Literal["low", "nominal", "high"] = "nominal"
    brightness: Optional[float] = None
    frp: Optional[float] = Field(default=None, description="Fire Radiative Power (MW)")
    satellite: str = "VIIRS"
    distance_km: Optional[float] = Field(default=None, ge=0.0)
    direction: Optional[str] = None
    source: str = "NASA-FIRMS"
    is_signal: bool = True
    display_text: str = Field(
        default="Satellite fire signal detected in monitored upwind basin.",
        description="Non-causal environmental observation"
    )


class EnvironmentalSnapshot(BaseModel):
    """Unified multi-source environmental snapshot for a specific coordinate or basin."""
    location: str = "Delhi-NCR"
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    timestamp: str
    aqi: int = Field(ge=0)
    aqi_category: str
    dominant_pollutant: str
    pollutants: Dict[str, AirMeasurement] = Field(default_factory=dict)
    contributing_stations: List[StationObservation] = Field(default_factory=list)
    weather: Optional[WeatherSnapshot] = None
    fire_signals: List[FireSignal] = Field(default_factory=list)
    forecast: List[ForecastPoint] = Field(default_factory=list)
    verdict: Optional[str] = None
    verdict_headline: Optional[str] = None
    recommendation: Optional[str] = None
    best_window: Optional[str] = None
    recheck_at: Optional[str] = None
    why_factors: List[Dict[str, str]] = Field(default_factory=list)
    sources: List[Dict[str, str]] = Field(default_factory=list)
    is_demo: bool = False
    is_stale: bool = False
    data_quality: Literal["reliable", "degraded", "cached", "simulated"] = "reliable"
