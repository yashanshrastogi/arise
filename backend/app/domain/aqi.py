import math
import hmac
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Tuple, Optional, Any, List
from pydantic import BaseModel


class AQIResult(BaseModel):
    aqi: Optional[int] = None
    category: str = "Unavailable"
    dominant_pollutant: str = "None"
    sub_indices: Dict[str, int] = {}
    color: str = "#94a3b8"
    is_cpcb_compliant: bool = False
    meets_pollutant_criteria: bool = False
    data_type: str = "unavailable" # "regulatory_compliant" | "indicative" | "unavailable"
    pollutants_monitored: int = 0


# CPCB India Official Breakpoints: (B_lo, B_hi, I_lo, I_hi)
# Source: Central Pollution Control Board (CPCB), National Air Quality Index — Final Report,
# Report No. CUPS/82/2014-15, October 2014 (prepared with IIT Kanpur), Table 4.1 (page 24).
# Contiguous intervals handle real-valued sensor measurements:
# First interval is [B_lo, B_hi]; subsequent intervals are (B_lo, B_hi].
# Official standard covers 8 criteria pollutants: PM10, PM2.5, NO2, O3, CO, SO2, NH3, and Pb.
CPCB_BREAKPOINTS = {
    "PM2.5": [
        (0.0, 30.0, 0, 50),
        (30.0, 60.0, 51, 100),
        (60.0, 90.0, 101, 200),
        (90.0, 120.0, 201, 300),
        (120.0, 250.0, 301, 400),
        (250.0, 500.0, 401, 500),
    ],
    "PM10": [
        (0.0, 50.0, 0, 50),
        (50.0, 100.0, 51, 100),
        (100.0, 250.0, 101, 200),
        (250.0, 350.0, 201, 300),
        (350.0, 430.0, 301, 400),
        (430.0, 600.0, 401, 500),
    ],
    "NO2": [
        (0.0, 40.0, 0, 50),
        (40.0, 80.0, 51, 100),
        (80.0, 180.0, 101, 200),
        (180.0, 280.0, 201, 300),
        (280.0, 400.0, 301, 400),
        (400.0, 600.0, 401, 500),
    ],
    "SO2": [
        (0.0, 40.0, 0, 50),
        (40.0, 80.0, 51, 100),
        (80.0, 380.0, 101, 200),
        (380.0, 800.0, 201, 300),
        (800.0, 1600.0, 301, 400),
        (1600.0, 2000.0, 401, 500),
    ],
    "CO": [
        (0.0, 1.0, 0, 50),
        (1.0, 2.0, 51, 100),
        (2.0, 10.0, 101, 200),
        (10.0, 17.0, 201, 300),
        (17.0, 34.0, 301, 400),
        (34.0, 50.0, 401, 500),
    ],
    "O3": [
        (0.0, 50.0, 0, 50),
        (50.0, 100.0, 51, 100),
        (100.0, 168.0, 101, 200),
        (168.0, 208.0, 201, 300),
        (208.0, 748.0, 301, 400),
        (748.0, 1000.0, 401, 500),
    ],
    "NH3": [
        (0.0, 200.0, 0, 50),
        (200.0, 400.0, 51, 100),
        (400.0, 800.0, 101, 200),
        (800.0, 1200.0, 201, 300),
        (1200.0, 1800.0, 301, 400),
        (1800.0, 2400.0, 401, 500),
    ],
    "PB": [
        (0.0, 0.5, 0, 50),
        (0.5, 1.0, 51, 100),
        (1.0, 2.0, 101, 200),
        (2.0, 3.0, 201, 300),
        (3.0, 3.5, 301, 400),
        (3.5, 5.0, 401, 500),
    ],
}

CATEGORY_MAP = [
    (50, "Good", "#2EB872"),
    (100, "Satisfactory", "#9BD34A"),
    (200, "Moderate", "#F5C542"),
    (300, "Poor", "#F28C28"),
    (400, "Very Poor", "#E5484D"),
    (500, "Severe", "#8B1E3F"),
]

# Arise Deterministic Policy Note on Tie-Breaking:
# The official CPCB NAQI standard (Report CUPS/82/2014-15 page 23) defines overall AQI
# as the maximum of pollutant sub-indices, but does not prescribe an explicit tie-breaker
# when two or more pollutants share the exact same maximum sub-index.
# To ensure strictly deterministic, reproducible outputs independent of dictionary iteration order,
# Arise implements an internal engineering policy prioritizing fine particulates over gases
# due to their primary aerosol toxicological severity:
# PM2.5 > PM10 > NO2 > SO2 > CO > O3 > NH3 > Pb.
# This tie-priority is an Arise design policy, NOT an official CPCB regulatory mandate.
POLLUTANT_PRIORITY = {
    "PM2.5": 0,
    "PM10": 1,
    "NO2": 2,
    "SO2": 3,
    "CO": 4,
    "O3": 5,
    "NH3": 6,
    "PB": 7,
}


def calculate_sub_index(pollutant: str, concentration: float) -> Optional[int]:
    """
    Calculate single pollutant sub-index using CPCB linear interpolation:
        Ip = ((I_HI - I_LO) / (B_HI - B_LO)) * (Cp - B_LO) + I_LO
    Follows Report CUPS/82/2014-15 Table 4.1 (page 24).
    Returns None if:
    - concentration is negative, NaN, or infinite
    - pollutant is unrecognized
    - concentration exceeds the supported table (out-of-scale)
    """
    if concentration is None:
        return None
    try:
        c_val = float(concentration)
    except (TypeError, ValueError):
        return None

    if math.isnan(c_val) or math.isinf(c_val) or c_val < 0.0:
        return None

    pol_key = pollutant.strip().upper()
    if pol_key in ("PM2.5", "PM25"):
        pol_key = "PM2.5"
    elif pol_key in ("PB", "LEAD"):
        pol_key = "PB"

    breakpoints = CPCB_BREAKPOINTS.get(pol_key)
    if not breakpoints:
        return None

    last_hi = breakpoints[-1][1]
    # Out-of-scale: concentrations exceeding the official breakpoint upper bound
    # cannot produce a valid CPCB AQI and must not be silently clamped to 500.
    if c_val > last_hi:
        return None

    # Find matching bucket with contiguous interval bounds:
    # First bucket includes lower bound 0.0 [B_lo, B_hi];
    # Subsequent buckets use half-open intervals (B_lo, B_hi].
    for idx, (b_lo, b_hi, i_lo, i_hi) in enumerate(breakpoints):
        in_bucket = (b_lo <= c_val <= b_hi) if idx == 0 else (b_lo < c_val <= b_hi)
        if in_bucket:
            val = ((i_hi - i_lo) / (b_hi - b_lo)) * (c_val - b_lo) + i_lo
            return round(val)

    return None


def get_aqi_category(aqi_value: Optional[int]) -> Tuple[str, str]:
    """Return CPCB category and official design color token."""
    if aqi_value is None:
        return "Unavailable", "#94a3b8"
    for threshold, category, color in CATEGORY_MAP:
        if aqi_value <= threshold:
            return category, color
    return "Severe", "#8B1E3F"


# CPCB Report CUPS/82/2014-15 Section 4.5 (page 38) & Table 4.1 (page 24):
# Regulatory exposure periods and minimum data completeness:
# - 24-hourly pollutants (PM10, PM2.5, NO2, SO2, NH3, Pb) require at least 16 hours of monitored data.
# - 8-hourly pollutants (CO, O3) require at least 6 hours of monitored data.
CPCB_REGULATORY_AVERAGING = {
    "PM2.5": {"window_hours": 24, "min_monitored_hours": 16.0},
    "PM10": {"window_hours": 24, "min_monitored_hours": 16.0},
    "NO2": {"window_hours": 24, "min_monitored_hours": 16.0},
    "SO2": {"window_hours": 24, "min_monitored_hours": 16.0},
    "NH3": {"window_hours": 24, "min_monitored_hours": 16.0},
    "PB": {"window_hours": 24, "min_monitored_hours": 16.0},
    "CO": {"window_hours": 8, "min_monitored_hours": 6.0},
    "O3": {"window_hours": 8, "min_monitored_hours": 6.0},
}


# Whitelist of trusted regulatory ambient air quality provider adapters
TRUSTED_REGULATORY_PROVIDERS = {
    "CPCB_CAAQMS",    # Central Pollution Control Board CAAQMS network
    "DPCC_OFFICIAL",   # Delhi Pollution Control Committee official stations
}

def normalize_unit(unit: str) -> str:
    """Normalize atmospheric concentration unit strings for robust canonical comparison."""
    if not unit or not isinstance(unit, str):
        return ""
    u = unit.strip().lower()
    # Replace unicode micro symbols (U+00B5 and U+03BC) with ASCII 'u'
    u = u.replace("µ", "u").replace("μ", "u")
    # Replace superscript 3 with regular 3
    u = u.replace("³", "3").replace("^3", "3")
    # Remove whitespace
    return "".join(u.split())


# Standard CPCB regulatory measurement units per Table 4.1 (page 24):
# - CO is officially measured in mg/m³ (8-hour average)
# - All other criteria pollutants (PM2.5, PM10, NO2, SO2, O3, NH3, Pb) are measured in µg/m³
CPCB_STANDARD_UNITS = {
    "PM2.5": {"ug/m3"},
    "PM10": {"ug/m3"},
    "NO2": {"ug/m3"},
    "SO2": {"ug/m3"},
    "CO": {"mg/m3"},
    "O3": {"ug/m3"},
    "NH3": {"ug/m3"},
    "PB": {"ug/m3"},
}


def verify_provenance_signature(
    provider: str,
    pollutant: str,
    window_hours: int,
    distinct_monitored_hours: float,
    reference_end_time: str,
    signature: str,
    unit: Optional[str] = None,
) -> bool:
    """
    Verify cryptographic authenticity of aggregation provenance metadata.
    Retrieves the server's approved signing key via app.core.secrets.get_provenance_signing_key().
    The domain layer verifies incoming records but does NOT generate or issue signatures.
    """
    if not signature or not isinstance(signature, str):
        return False

    from app.core.secrets import get_provenance_signing_key
    key = get_provenance_signing_key()

    prov_clean = provider.strip().upper()
    pol_clean = pollutant.strip().upper()
    if pol_clean in ("PM25", "PM2.5"):
        pol_clean = "PM2.5"
    elif pol_clean in ("PB", "LEAD"):
        pol_clean = "PB"
    ref_end_clean = reference_end_time.strip().replace("Z", "+00:00")

    # If unit was provided, test canonical message with normalized unit
    if unit:
        unit_clean = normalize_unit(unit)
        msg_with_unit = f"{prov_clean}:{pol_clean}:{int(window_hours)}:{float(distinct_monitored_hours):.1f}:{ref_end_clean}:{unit_clean}".encode("utf-8")
        expected_with_unit = hmac.new(key, msg_with_unit, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected_with_unit, signature.strip().lower()):
            return True

    # Standard v1 5-field canonical message
    msg_v1 = f"{prov_clean}:{pol_clean}:{int(window_hours)}:{float(distinct_monitored_hours):.1f}:{ref_end_clean}".encode("utf-8")
    expected_v1 = hmac.new(key, msg_v1, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_v1, signature.strip().lower())


def _parse_timestamp(ts: Any, allow_naive: bool = False, default_tz: Optional[timezone] = None) -> Optional[datetime]:
    """
    Parse integer/float epochs, datetimes, or ISO-8601 strings into UTC-aware datetimes.
    Strictly rejects naive timestamps when allow_naive=False, preventing silent misattribution
    of local time to UTC.
    """
    if ts is None:
        return None
    if isinstance(ts, (int, float)):
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            return None
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            if not allow_naive:
                return None
            return ts.replace(tzinfo=default_tz or timezone.utc)
        return ts.astimezone(timezone.utc)
    if not isinstance(ts, str) or not ts.strip():
        return None

    cleaned = ts.strip()
    has_tz = cleaned.endswith("Z") or ("+" in cleaned[10:]) or ("-" in cleaned[10:])
    if not has_tz and not allow_naive:
        return None

    cleaned_iso = cleaned.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(cleaned_iso)
        if dt.tzinfo is None:
            if not allow_naive:
                return None
            dt = dt.replace(tzinfo=default_tz or timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def calculate_hourly_coverage_from_series(
    observations: List[Any],
    window_hours: int,
    reference_end_time: Optional[Any] = None,
    max_allowed_concentration: Optional[float] = None,
) -> int:
    """
    Computes distinct monitored hourly buckets from a series of timestamped readings.
    Filters:
    - Missing / unparseable / naive timestamps: dropped.
    - Non-finite (NaN, inf), negative, or out-of-scale concentration readings: dropped.
    - Readings outside (T_end - window_hours, T_end]: dropped.
    - Multiple / duplicate readings in the same hourly bucket: collapsed into one distinct hour.
    - Accurately normalizes timezone offsets (e.g. UTC 'Z' vs '+05:30' IST).
    Returns the count of distinct 1-hour intervals with at least one valid reading.
    """
    if not observations or not isinstance(observations, list):
        return 0

    valid_readings: List[datetime] = []
    for obs in observations:
        if isinstance(obs, dict):
            ts_val = obs.get("timestamp") or obs.get("ts")
            val = obs.get("value") if "value" in obs else obs.get("val")
            if val is not None:
                try:
                    num_val = float(val)
                    if math.isnan(num_val) or math.isinf(num_val) or num_val < 0.0:
                        continue
                    if max_allowed_concentration is not None and num_val > max_allowed_concentration:
                        continue
                except (TypeError, ValueError):
                    continue
        else:
            ts_val = obs

        dt = _parse_timestamp(ts_val, allow_naive=False)
        if dt is not None:
            valid_readings.append(dt)

    if not valid_readings:
        return 0

    end_dt = _parse_timestamp(reference_end_time, allow_naive=False)
    if end_dt is None:
        end_dt = max(valid_readings)

    start_dt = end_dt - timedelta(hours=window_hours)

    distinct_hour_buckets = set()
    for dt in valid_readings:
        if start_dt <= dt <= end_dt:
            bucket_idx = int(math.ceil((dt - start_dt).total_seconds() / 3600.0)) - 1
            bucket_idx = max(0, min(bucket_idx, window_hours - 1))
            distinct_hour_buckets.add(bucket_idx)

    return len(distinct_hour_buckets)


def validate_cpcb_averaging_coverage(
    sub_indices: Dict[str, int],
    averaging_coverage: Optional[Dict[str, Dict[str, Any]]] = None,
    current_time: Optional[datetime] = None,
    max_age_hours: Optional[float] = None,
) -> bool:
    """
    Demonstrably validate regulatory averaging periods and data coverage
    per CPCB Report CUPS/82/2014-15 Section 4.5 (page 38):
    1. At least 3 pollutants with at least one PM (PM2.5 or PM10) must be present.
    2. Coverage MUST be derived from:
       a) Actual timestamped observations series (parsed, window-filtered, deduplicated into hourly buckets), OR
       b) Trusted provider aggregation metadata with verified provider provenance, matching target pollutant,
          matching window hours, reference end timestamp, non-future freshness, and audited distinct monitored hours count.
       A bare caller-supplied 'monitored_hours' number without supporting observation series
       or trusted provider aggregation metadata is strictly rejected.
    3. For 24-hr pollutants (PM10, PM2.5, NO2, SO2, NH3, Pb):
       - Window must be 24 hours.
       - Monitored data coverage must be at least 16 distinct hours (>= 16/24 = 66.7%).
    4. For 8-hr pollutants (CO, O3):
       - Window must be 8 hours.
       - Monitored data coverage must be at least 6 distinct hours (>= 6/8 = 75.0%).
    5. A coverage record cannot be reused for a different pollutant or different window.
    6. Measurement units (if specified) must match official CPCB reference units.
    Returns True only when every contributing pollutant demonstrably meets its regulatory requirements.
    """
    if not averaging_coverage or not isinstance(averaging_coverage, dict):
        return False

    # Check 3-pollutant + PM completeness
    has_pm = ("PM2.5" in sub_indices or "PM10" in sub_indices)
    if len(sub_indices) < 3 or not has_pm:
        return False

    now_ref = current_time or datetime.now(timezone.utc)

    # Normalize coverage keys for case-insensitive lookup
    cov_normalized: Dict[str, Dict[str, Any]] = {}
    for k, v in averaging_coverage.items():
        if isinstance(v, dict):
            pol_k = k.strip().upper()
            if pol_k in ("PM25", "PM2.5"):
                pol_k = "PM2.5"
            elif pol_k in ("PB", "LEAD"):
                pol_k = "PB"
            cov_normalized[pol_k] = v

    # Verify every contributing pollutant in sub_indices has demonstrable coverage
    for pol in sub_indices.keys():
        pol_key = pol.strip().upper()
        if pol_key in ("PM25", "PM2.5"):
            pol_key = "PM2.5"
        elif pol_key in ("PB", "LEAD"):
            pol_key = "PB"

        req = CPCB_REGULATORY_AVERAGING.get(pol_key)
        if not req:
            return False

        cov = cov_normalized.get(pol_key)
        if not cov:
            return False

        # Unit validation: if unit is specified, must match standard CPCB unit for pollutant
        unit = cov.get("unit") or cov.get("units")
        if unit is not None:
            if not isinstance(unit, str):
                return False
            unit_norm = normalize_unit(unit)
            allowed = CPCB_STANDARD_UNITS.get(pol_key, set())
            if unit_norm not in allowed:
                return False

        # Prevent cross-pollutant reuse: if pollutant/parameter is specified, it MUST match pol_key
        record_pol = cov.get("pollutant") or cov.get("parameter")
        if record_pol:
            record_pol_clean = str(record_pol).strip().upper()
            if record_pol_clean in ("PM25", "PM2.5"):
                record_pol_clean = "PM2.5"
            elif record_pol_clean in ("PB", "LEAD"):
                record_pol_clean = "PB"
            if record_pol_clean != pol_key:
                return False

        # Check window requirement
        window = cov.get("window_hours")
        if window is not None:
            try:
                if float(window) != req["window_hours"]:
                    return False
            except (TypeError, ValueError):
                return False

        # Determine distinct hours covered:
        # Path A: Actual timestamped observations series
        obs_series = cov.get("observations") or cov.get("timestamped_observations") or cov.get("series")
        if obs_series and isinstance(obs_series, list):
            ref_end = cov.get("reference_end_time") or cov.get("reference_time")
            if ref_end:
                ref_dt = _parse_timestamp(ref_end, allow_naive=False)
                if ref_dt is None:
                    return False
                if ref_dt > now_ref + timedelta(seconds=300):
                    return False
                if max_age_hours is not None and (now_ref - ref_dt) > timedelta(hours=max_age_hours):
                    return False

            max_c = CPCB_BREAKPOINTS[pol_key][-1][1] if pol_key in CPCB_BREAKPOINTS else None
            distinct_hours = calculate_hourly_coverage_from_series(
                obs_series, req["window_hours"], reference_end_time=ref_end, max_allowed_concentration=max_c
            )
            if distinct_hours < req["min_monitored_hours"] or distinct_hours > req["window_hours"]:
                return False
            continue

        # Path B: Trusted provider aggregation metadata with verified cryptographic provenance
        trusted_provider = cov.get("trusted_provider") or cov.get("provider_provenance")
        if trusted_provider and isinstance(trusted_provider, str):
            provider_clean = trusted_provider.strip().upper()
            if provider_clean not in TRUSTED_REGULATORY_PROVIDERS:
                return False

            monitored = cov.get("distinct_monitored_hours")
            if monitored is None:
                monitored = cov.get("hourly_records_count")
            if monitored is None:
                monitored = cov.get("monitored_hours")

            try:
                monitored_val = float(monitored)
            except (TypeError, ValueError):
                return False

            if monitored_val < req["min_monitored_hours"] or monitored_val > req["window_hours"]:
                return False

            ref_end = cov.get("reference_end_time") or cov.get("reference_time")
            if not ref_end:
                return False
            ref_dt = _parse_timestamp(ref_end, allow_naive=False)
            if ref_dt is None:
                return False

            # Freshness: reject future reference times (> 300s ahead of reference clock)
            if ref_dt > now_ref + timedelta(seconds=300):
                return False
            # Freshness: check maximum age if enforced
            if max_age_hours is not None and (now_ref - ref_dt) > timedelta(hours=max_age_hours):
                return False

            sig = cov.get("provenance_signature") or cov.get("signature")
            if not sig or not isinstance(sig, str):
                return False
            if not verify_provenance_signature(
                provider_clean, pol_key, req["window_hours"], monitored_val, str(ref_end), sig, unit=unit
            ):
                return False

            continue

        # Path C: Bare caller-supplied 'monitored_hours' or unverified provider without observation series
        # or cryptographic provenance is strictly REJECTED.
        return False

    return True


def calculate_aqi(
    pollutants: Dict[str, float],
    has_verified_averaging: bool = False,
    averaging_coverage: Optional[Dict[str, Dict[str, Any]]] = None,
    current_time: Optional[datetime] = None,
    max_age_hours: Optional[float] = None,
) -> AQIResult:
    """
    Compute official CPCB AQI from dictionary of pollutant concentrations.
    AQI is the maximum of individual sub-indices (CUPS/82/2014-15 Table 4.1).

    Regulatory Compliance vs Indicative Telemetry:
    - Report CUPS/82/2014-15 Section 4.5 (page 38) mandates that a regulatory CPCB AQI
      requires 24-hr rolling averages (PM10, PM2.5, NO2, SO2, NH3, Pb) and 8-hr rolling averages
      (CO, O3), with at least 16 hours of monitored data for 24-hr averages (6 hours for 8-hr averages),
      plus a minimum of 3 pollutants with at least one PM.
    - Demonstrable Validation: Relying solely on a manually set boolean (has_verified_averaging=True)
      without demonstrable averaging coverage records is strictly rejected. Regulatory compliance
      is granted only when demonstrable averaging period and coverage records are validated.
    - If no valid sub-indices exist, returns aqi=None, category='Unavailable', data_type='unavailable'.
    """
    sub_indices: Dict[str, int] = {}
    for pol, val in pollutants.items():
        if val is not None:
            sub = calculate_sub_index(pol, val)
            if sub is not None:
                sub_indices[pol] = sub

    if not sub_indices:
        return AQIResult(
            aqi=None,
            category="Unavailable",
            dominant_pollutant="None",
            sub_indices={},
            color="#94a3b8",
            is_cpcb_compliant=False,
            meets_pollutant_criteria=False,
            data_type="unavailable",
            pollutants_monitored=0,
        )

    # Check CPCB completeness criterion: >= 3 pollutants and at least one PM
    has_pm = ("PM2.5" in sub_indices or "PM10" in sub_indices)
    meets_criteria = (len(sub_indices) >= 3 and has_pm)

    # Demonstrable CPCB compliance validation:
    # Requires valid averaging coverage records meeting Section 4.5 thresholds.
    # An unvalidated manual boolean without demonstrable coverage data is rejected.
    is_compliant = validate_cpcb_averaging_coverage(
        sub_indices, averaging_coverage, current_time=current_time, max_age_hours=max_age_hours
    )

    # Dominant pollutant: maximum sub-index with Arise deterministic tie-breaking policy
    dominant_pol = max(
        sub_indices.keys(),
        key=lambda p: (sub_indices[p], -POLLUTANT_PRIORITY.get(p.upper(), 99))
    )
    max_aqi = sub_indices[dominant_pol]
    category, color = get_aqi_category(max_aqi)

    return AQIResult(
        aqi=max_aqi,
        category=category,
        dominant_pollutant=dominant_pol,
        sub_indices=sub_indices,
        color=color,
        is_cpcb_compliant=is_compliant,
        meets_pollutant_criteria=meets_criteria,
        data_type="regulatory_compliant" if is_compliant else "indicative",
        pollutants_monitored=len(sub_indices),
    )


__all__ = [
    "AQIResult",
    "CPCB_BREAKPOINTS",
    "CPCB_REGULATORY_AVERAGING",
    "CPCB_STANDARD_UNITS",
    "TRUSTED_REGULATORY_PROVIDERS",
    "CATEGORY_MAP",
    "POLLUTANT_PRIORITY",
    "calculate_sub_index",
    "get_aqi_category",
    "calculate_aqi",
    "validate_cpcb_averaging_coverage",
    "calculate_hourly_coverage_from_series",
    "verify_provenance_signature",
    "normalize_unit",
]
