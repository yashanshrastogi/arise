from datetime import datetime, timezone
from typing import Optional, List, Dict, Literal, Any
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
            "ozone": "O3",
            "nh3": "NH3",
            "pb": "Pb",
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


class LocationSelection(BaseModel):
    """Canonical location model for location-aware environmental requests across India."""
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    display_name: str
    city: Optional[str] = None
    district: Optional[str] = None
    state: Optional[str] = None
    source: Literal["device", "manual_search", "map_click", "saved", "national_overview"] = "manual_search"
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    timezone: Optional[str] = "Asia/Kolkata"
    viewport: Optional[Dict[str, float]] = None
    is_approximate: bool = False


class WeatherSnapshot(BaseModel):
    """Surface meteorological conditions with full provenance and timestamping."""
    timestamp: str
    temperature: Optional[float] = Field(default=None, description="Air temperature in Celsius")
    feels_like: Optional[float] = Field(default=None, description="Apparent temperature in Celsius")
    humidity: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Relative humidity percentage")
    cloud_cover: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Cloud cover percentage")
    rain_probability: Optional[float] = Field(default=None, ge=0.0, le=100.0, description="Precipitation probability %")
    precipitation: Optional[float] = Field(default=None, ge=0.0, description="Precipitation depth in mm")
    wind_speed: Optional[float] = Field(default=None, ge=0.0, description="Surface wind speed in km/h")
    wind_direction: Optional[str] = Field(default="NW", description="Cardinal wind direction (e.g. NW)")
    wind_degrees: Optional[float] = Field(default=None, ge=0.0, le=360.0)
    visibility: Optional[float] = Field(default=None, ge=0.0, description="Horizontal visibility in km")
    uv_index: Optional[float] = Field(default=None, ge=0.0)
    surface_pressure: Optional[float] = Field(default=None, ge=0.0, description="Surface atmospheric pressure in hPa")
    dew_point: Optional[float] = Field(default=None, description="Dew point temperature in Celsius")
    source: str = "Open-Meteo"
    data_provenance: Literal["numerical_weather_prediction", "station_observation", "satellite_radar_nwp", "cached", "degraded", "fused"] = "numerical_weather_prediction"
    retrieval_timestamp: Optional[str] = Field(default=None, description="ISO timestamp when Arise queried the upstream provider")
    observation_time: Optional[str] = Field(default=None, description="ISO timestamp of underlying model run or physical station reading")
    local_timezone: Optional[str] = Field(default=None, description="IANA local timezone identifier (e.g. Europe/London)")
    grid_resolution_deg: Optional[float] = Field(default=None, description="Spatial cache grid cell resolution in degrees")
    is_stale: bool = False
    condition_text: Optional[str] = "Haze"
    correlation_text: Optional[str] = None
    sunrise: Optional[str] = None
    sunset: Optional[str] = None



class ForecastPoint(BaseModel):
    """Single hour or day forecast projection."""
    timestamp: str
    time_label: str
    aqi: Optional[int] = Field(default=None, ge=0)
    pm25: Optional[float] = Field(default=None, ge=0.0)
    temperature: float
    rain_probability: float = Field(default=0.0, ge=0.0, le=100.0)
    precipitation: Optional[float] = Field(default=None, ge=0.0)
    cloud_cover: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    wind_speed: float = Field(default=0.0, ge=0.0)
    wind_gusts: Optional[float] = Field(default=None, ge=0.0)
    wind_direction: Optional[str] = None
    past: bool = False
    is_current: bool = False
    best_window: bool = False
    source: str = "Open-Meteo"
    confidence: Literal["high", "moderate", "low"] = "moderate"


class BestWindowResult(BaseModel):
    """Data-driven outdoor window evaluation result."""
    window_str: str = "No recommended outdoor window"
    status: Literal["ground_calibrated", "model_projected", "unsuitable", "unavailable"] = "unavailable"
    confidence: Literal["high", "moderate", "low"] = "low"
    provenance: str = "none"
    reason: str = ""
    avg_aqi: Optional[int] = None
    avg_rain_prob: Optional[float] = None
    avg_precipitation: Optional[float] = None
    avg_wind_speed: Optional[float] = None
    missing_inputs: List[str] = Field(default_factory=list)


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
    location: str = "Selected Location"
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    timestamp: str
    aqi: Optional[int] = Field(default=None, ge=0)
    aqi_category: str = "Unavailable"
    dominant_pollutant: str = "None"
    pollutants: Dict[str, AirMeasurement] = Field(default_factory=dict)
    contributing_stations: List[StationObservation] = Field(default_factory=list)
    weather: Optional[WeatherSnapshot] = None
    fire_signals: List[FireSignal] = Field(default_factory=list)
    forecast: List[ForecastPoint] = Field(default_factory=list)
    verdict: Optional[str] = None
    verdict_headline: Optional[str] = None
    recommendation: Optional[str] = None
    best_window: Optional[str] = None
    best_window_details: Optional[Dict[str, Any]] = None
    recheck_at: Optional[str] = None
    why_factors: List[Dict[str, str]] = Field(default_factory=list)
    sources: List[Dict[str, str]] = Field(default_factory=list)
    is_demo: bool = False
    is_stale: bool = False
    is_cpcb_compliant: bool = False
    data_quality: Literal["reliable", "degraded", "cached", "simulated", "fused"] = "reliable"


class RouteWeatherPoint(BaseModel):
    """Atmospheric conditions at a specific sampled waypoint along a commute route."""
    label: str = Field(description="Waypoint label, e.g. 'Start', 'Midpoint', 'Destination'")
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    eta_min: float = Field(ge=0.0, description="Estimated arrival time offset from route start in minutes")
    temp_c: Optional[float] = Field(default=None, description="Air temperature in Celsius")
    feels_like_c: Optional[float] = Field(default=None, description="Apparent temperature in Celsius")
    humidity: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    condition: str = Field(default="Clear Sky", description="Human-readable condition description")
    icon: str = Field(default="🌤️", description="Condition emoji icon")
    rain_probability: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    precipitation_mm: Optional[float] = Field(default=None, ge=0.0)
    wind_speed_kmh: Optional[float] = Field(default=None, ge=0.0)
    wind_direction: str = "—"
    visibility_km: Optional[float] = Field(default=None, ge=0.0)
    fog_risk: str = Field(default="None", description="'None' | 'Moderate Fog' | 'Dense Fog' | 'Unknown'")
    is_stale: bool = False
    data_source: str = "Open-Meteo"
    data_provenance: str = "numerical_weather_prediction"


class RouteWeatherSummary(BaseModel):
    """Aggregate meteorological assessment across the commute corridor."""
    has_rain_risk: bool = False
    has_fog_risk: bool = False
    min_temp_c: Optional[float] = None
    max_temp_c: Optional[float] = None
    max_wind_kmh: Optional[float] = None
    lowest_visibility_km: Optional[float] = None
    advisory: Optional[str] = None
    spatial_resolution: str = "Open-Meteo NWP (~2 km grid resolution)"
    data_provenance: str = "numerical_weather_prediction"


class RoutePollutionPoint(BaseModel):
    """Air quality and pollution exposure at a sampled waypoint along a commute route."""
    label: str = Field(description="Waypoint label, e.g. 'Start', 'Midpoint', 'Destination'")
    lat: float = Field(ge=-90.0, le=90.0)
    lon: float = Field(ge=-180.0, le=180.0)
    eta_min: float = Field(ge=0.0, description="Estimated arrival time offset from route start in minutes")
    aqi: Optional[int] = Field(default=None, ge=0, description="CPCB NAQI integer score or None if unavailable")
    aqi_category: str = Field(default="Unavailable", description="Good, Satisfactory, Moderate, Poor, Very Poor, Severe, Unavailable")
    dominant_pollutant: str = Field(default="None")
    pm25: Optional[float] = Field(default=None, ge=0.0, description="PM2.5 concentration in µg/m³")
    pm10: Optional[float] = Field(default=None, ge=0.0, description="PM10 concentration in µg/m³")
    no2: Optional[float] = Field(default=None, ge=0.0, description="NO2 concentration in µg/m³")
    co: Optional[float] = Field(default=None, ge=0.0, description="CO concentration in mg/m³")
    data_type: str = Field(default="unavailable", description="'observed' | 'modelled' | 'unavailable'")
    source: str = Field(default="Unavailable", description="CPCB, OpenAQ, Open-Meteo, DEMO, Unavailable")
    nearest_station: Optional[str] = Field(default=None, description="Nearest ground monitoring station name")
    nearest_station_distance_km: Optional[float] = Field(default=None, ge=0.0)
    confidence: str = Field(default="low", description="'high' | 'moderate' | 'low'")
    timestamp: Optional[str] = None
    is_stale: bool = False
    uncertainty_note: Optional[str] = None


class RoutePollutionSummary(BaseModel):
    """Corridor-wide aggregate pollution exposure metrics and deterministic health advisory."""
    avg_aqi: Optional[int] = Field(default=None, ge=0, description="Average commute AQI exposure")
    max_aqi: Optional[int] = Field(default=None, ge=0, description="Peak AQI encountered along route")
    min_aqi: Optional[int] = Field(default=None, ge=0, description="Cleanest AQI encountered along route")
    dominant_pollutant: str = Field(default="None")
    exposure_category: str = Field(default="Unavailable")
    hotspot_label: Optional[str] = Field(default=None, description="Label of waypoint with highest AQI")
    cleanest_label: Optional[str] = Field(default=None, description="Label of waypoint with lowest AQI")
    advisory: str = Field(default="Atmospheric pollution telemetry is unavailable along this corridor.")
    coverage_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="Fraction of waypoints with valid telemetry")
    data_sources: List[str] = Field(default_factory=list)
    spatial_resolution: str = Field(default="Ambient monitoring stations (IDW) & Open-Meteo regional models")
    roadside_disclaimer: str = Field(
        default="Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings."
    )
