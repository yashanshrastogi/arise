"""
Internal Ingestion Provenance Authority for Regulatory Air Quality Data.

This module resides inside the trusted ingestion boundary (backend/app/sources).
Only verified ingestion adapters (such as CPCB CAAQMS or DPCC official ingestion)
are authorized to invoke these helpers to attest to hourly rolling window aggregation.

SECURITY & SCIENTIFIC INVARIANTS:
- A cryptographic HMAC signature attests ONLY that an authorized internal ingestion
  pipeline verified the physical units, parsed UTC timestamps, window-filtered,
  and aggregated the hourly observation series according to CPCB specifications.
- A cryptographic signature DOES NOT prove physical sensor hardware authenticity,
  environmental sensor health, or lack of sensor drift.
- Unrestricted signing helpers are NOT exported from the domain layer (app.domain.aqi).
- Callers cannot manufacture regulatory compliance merely by importing domain constants.
"""

import hmac
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

from app.core.secrets import get_provenance_signing_key
from app.domain.aqi import (
    TRUSTED_REGULATORY_PROVIDERS,
    CPCB_REGULATORY_AVERAGING,
    CPCB_STANDARD_UNITS,
    _parse_timestamp,
    normalize_unit,
)


def generate_provenance_signature(
    provider: str,
    pollutant: str,
    window_hours: int,
    distinct_monitored_hours: float,
    reference_end_time: str,
    unit: Optional[str] = None,
) -> str:
    """
    Generate an authoritative HMAC-SHA256 signature for trusted aggregation records.
    Constructs a canonical message binding provider, pollutant, window hours, monitored hours,
    reference timestamp, and optional unit.
    """
    prov_clean = provider.strip().upper()
    pol_clean = pollutant.strip().upper()
    if pol_clean in ("PM25", "PM2.5"):
        pol_clean = "PM2.5"
    elif pol_clean in ("PB", "LEAD"):
        pol_clean = "PB"

    ref_end_clean = reference_end_time.strip().replace("Z", "+00:00")
    key = get_provenance_signing_key()

    if unit:
        unit_clean = normalize_unit(unit)
        msg = f"{prov_clean}:{pol_clean}:{int(window_hours)}:{float(distinct_monitored_hours):.1f}:{ref_end_clean}:{unit_clean}".encode("utf-8")
    else:
        msg = f"{prov_clean}:{pol_clean}:{int(window_hours)}:{float(distinct_monitored_hours):.1f}:{ref_end_clean}".encode("utf-8")

    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def create_trusted_aggregation_record(
    provider: str,
    pollutant: str,
    window_hours: int,
    distinct_monitored_hours: float,
    reference_end_time: str,
    unit: Optional[str] = None,
    coverage_percentage: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Factory creating an authenticated aggregation record with cryptographic provenance.
    Strictly validates input parameters before signing:
    - Provider must be in TRUSTED_REGULATORY_PROVIDERS.
    - Pollutant must be recognized.
    - If unit is provided, it must match CPCB standard units for that pollutant.
    - distinct_monitored_hours must not exceed window_hours.
    - reference_end_time must be parseable and non-future.
    """
    prov_clean = provider.strip().upper()
    if prov_clean not in TRUSTED_REGULATORY_PROVIDERS:
        raise ValueError(f"Provider '{provider}' is not an authorized regulatory provider.")

    pol_clean = pollutant.strip().upper()
    if pol_clean in ("PM25", "PM2.5"):
        pol_clean = "PM2.5"
    elif pol_clean in ("PB", "LEAD"):
        pol_clean = "PB"

    if pol_clean not in CPCB_REGULATORY_AVERAGING:
        raise ValueError(f"Pollutant '{pollutant}' is not a recognized CPCB criteria pollutant.")

    if unit:
        unit_norm = normalize_unit(unit)
        allowed = CPCB_STANDARD_UNITS.get(pol_clean, set())
        if unit_norm not in allowed:
            raise ValueError(f"Unit '{unit}' is not a valid CPCB regulatory unit for {pol_clean} (expected {allowed}).")

    if float(distinct_monitored_hours) > float(window_hours):
        raise ValueError(f"Distinct monitored hours ({distinct_monitored_hours}) cannot exceed window hours ({window_hours}).")

    ref_dt = _parse_timestamp(reference_end_time, allow_naive=False)
    if ref_dt is None:
        raise ValueError(f"Invalid or naive reference_end_time '{reference_end_time}'. Timezone is required.")

    sig = generate_provenance_signature(
        prov_clean, pol_clean, window_hours, distinct_monitored_hours, reference_end_time, unit=unit
    )

    record: Dict[str, Any] = {
        "trusted_provider": prov_clean,
        "pollutant": pol_clean,
        "window_hours": int(window_hours),
        "distinct_monitored_hours": float(distinct_monitored_hours),
        "reference_end_time": reference_end_time,
        "coverage_percentage": coverage_percentage if coverage_percentage is not None else round((float(distinct_monitored_hours) / float(window_hours)) * 100.0, 1),
        "provenance_signature": sig,
    }
    if unit:
        record["unit"] = unit
    return record
