import math
from typing import Dict, Tuple, Optional
from pydantic import BaseModel


class AQIResult(BaseModel):
    aqi: int
    category: str
    dominant_pollutant: str
    sub_indices: Dict[str, int]
    color: str


# CPCB India Official Breakpoints: (B_lo, B_hi, I_lo, I_hi)
CPCB_BREAKPOINTS = {
    "PM2.5": [
        (0.0, 30.0, 0, 50),
        (30.1, 60.0, 51, 100),
        (60.1, 90.0, 101, 200),
        (90.1, 120.0, 201, 300),
        (120.1, 250.0, 301, 400),
        (250.1, 500.0, 401, 500),
    ],
    "PM10": [
        (0.0, 50.0, 0, 50),
        (50.1, 100.0, 51, 100),
        (100.1, 250.0, 101, 200),
        (250.1, 350.0, 201, 300),
        (350.1, 430.0, 301, 400),
        (430.1, 600.0, 401, 500),
    ],
    "NO2": [
        (0.0, 40.0, 0, 50),
        (40.1, 80.0, 51, 100),
        (80.1, 180.0, 101, 200),
        (180.1, 280.0, 201, 300),
        (280.1, 400.0, 301, 400),
        (400.1, 600.0, 401, 500),
    ],
    "SO2": [
        (0.0, 40.0, 0, 50),
        (40.1, 80.0, 51, 100),
        (80.1, 380.0, 101, 200),
        (380.1, 800.0, 201, 300),
        (800.1, 1600.0, 301, 400),
        (1600.1, 2000.0, 401, 500),
    ],
    "CO": [
        (0.0, 1.0, 0, 50),
        (1.01, 2.0, 51, 100),
        (2.01, 10.0, 101, 200),
        (10.01, 17.0, 201, 300),
        (17.01, 34.0, 301, 400),
        (34.01, 50.0, 401, 500),
    ],
    "O3": [
        (0.0, 50.0, 0, 50),
        (50.1, 100.0, 51, 100),
        (100.1, 168.0, 101, 200),
        (168.1, 208.0, 201, 300),
        (208.1, 748.0, 301, 400),
        (748.1, 1000.0, 401, 500),
    ],
}

CATEGORY_MAP = [
    (50, "Good", "#2EB872"),
    (100, "Satisfactory", "#9BD34A"),
    (200, "Moderate", "#F5C542"),
    (300, "Poor", "#F28C28"),
    (400, "Very Poor", "#E5484D"),
    (9999, "Severe", "#8B1E3F"),
]


def calculate_sub_index(pollutant: str, concentration: float) -> Optional[int]:
    """Calculate single pollutant sub-index using CPCB linear interpolation."""
    pol_key = pollutant.strip().upper()
    if pol_key == "PM2.5" or pol_key == "PM25":
        pol_key = "PM2.5"

    breakpoints = CPCB_BREAKPOINTS.get(pol_key)
    if not breakpoints or concentration < 0:
        return None

    # Find matching bucket
    for b_lo, b_hi, i_lo, i_hi in breakpoints:
        if b_lo <= concentration <= b_hi:
            val = ((i_hi - i_lo) / (b_hi - b_lo)) * (concentration - b_lo) + i_lo
            return round(val)

    # If concentration exceeds highest breakpoint, extrapolate linearly
    last_lo, last_hi, last_i_lo, last_i_hi = breakpoints[-1]
    if concentration > last_hi:
        val = ((last_i_hi - last_i_lo) / (last_hi - last_lo)) * (concentration - last_lo) + last_i_lo
        return min(round(val), 500)

    return 0


def get_aqi_category(aqi_value: int) -> Tuple[str, str]:
    """Return CPCB category and official design color token."""
    for threshold, category, color in CATEGORY_MAP:
        if aqi_value <= threshold:
            return category, color
    return "Severe", "#8B1E3F"


def calculate_aqi(pollutants: Dict[str, float]) -> AQIResult:
    """
    Compute official CPCB AQI from dictionary of pollutant concentrations.
    AQI is the maximum of individual sub-indices.
    """
    sub_indices: Dict[str, int] = {}
    for pol, val in pollutants.items():
        if val is not None and val >= 0:
            sub = calculate_sub_index(pol, float(val))
            if sub is not None:
                sub_indices[pol] = sub

    if not sub_indices:
        return AQIResult(
            aqi=0,
            category="Good",
            dominant_pollutant="None",
            sub_indices={},
            color="#2EB872"
        )

    # Dominant pollutant is the one causing the highest sub-index
    dominant_pol = max(sub_indices, key=sub_indices.get)
    max_aqi = sub_indices[dominant_pol]
    category, color = get_aqi_category(max_aqi)

    return AQIResult(
        aqi=max_aqi,
        category=category,
        dominant_pollutant=dominant_pol,
        sub_indices=sub_indices,
        color=color
    )
