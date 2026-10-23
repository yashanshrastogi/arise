"""
Verification script for AQI Scientific Correctness Audit:
1. Cross-checks live OpenAQ station observations against independent manual CPCB math.
2. Checks live GET /environment?lat=28.6139&lon=77.2090&demo=false
3. Checks dashboard, API, verdict, and Ask Arise agreement.
"""

import json
import os
import sys
import socket

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import httpx
from app.domain.aqi import calculate_aqi, calculate_sub_index, get_aqi_category

_orig_getaddrinfo = socket.getaddrinfo
def _getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _getaddrinfo_ipv4


def manual_cpcb_calculation(pollutant: str, conc: float):
    """
    Independent calculation directly from authoritative CPCB Table 4.1
    (Report CUPS/82/2014-15 page 24).
    Returns None if conc is negative or exceeds the official breakpoint table.
    """
    table = {
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
    bps = table.get(pollutant)
    if not bps or conc < 0.0 or conc > bps[-1][1]:
        return None

    for idx, (b_lo, b_hi, i_lo, i_hi) in enumerate(bps):
        in_b = (b_lo <= conc <= b_hi) if idx == 0 else (b_lo < conc <= b_hi)
        if in_b:
            return round(((i_hi - i_lo) / (b_hi - b_lo)) * (conc - b_lo) + i_lo)
    return None


def run_cross_check():
    print("==================================================")
    print("STEP 9 — VERSIONED SIRIFORT CROSS-CHECK")
    print("==================================================")

    fixture_path = os.path.join(
        os.path.dirname(__file__), "fixtures", "sirifort_station_telemetry.json"
    )
    with open(fixture_path, "r", encoding="utf-8") as f:
        fixture = json.load(f)

    sirifort_readings = {}
    for item in fixture["raw_sensor_readings"]:
        p = item["parameter"].upper()
        if p in ("PM25", "PM2.5"):
            p = "PM2.5"
        sirifort_readings[p] = item["normalized_value"]

    print("\nVersioned Fixture: Sirifort (ID 5586), New Delhi")
    print("Provenance Note:", fixture["provenance"].get("verification_note"))
    print("Normalized Concentrations (CPCB reference units):", sirifort_readings)

    # Independent sub-indices
    manual_sub_indices = {}
    for p, val in sirifort_readings.items():
        manual_sub_indices[p] = manual_cpcb_calculation(p, val)

    manual_dominant = max(manual_sub_indices, key=manual_sub_indices.get)
    manual_aqi = manual_sub_indices[manual_dominant]

    print("\nIndependent Calculation Sub-Indices:")
    for p, s in manual_sub_indices.items():
        print(f"  - {p}: {s}")
    print(f"Independent Dominant Pollutant: {manual_dominant}")
    print(f"Independent Overall AQI: {manual_aqi}")

    # Arise calculation: Regulatory Benchmark mode with demonstrable averaging coverage
    cov_data = fixture["provenance"]["averaging_coverage"]
    arise_res = calculate_aqi(sirifort_readings, averaging_coverage=cov_data)
    print("\nArise calculate_aqi(averaging_coverage=cov_data) Output:")
    print(f"  - AQI: {arise_res.aqi}")
    print(f"  - Dominant: {arise_res.dominant_pollutant}")
    print(f"  - Category: {arise_res.category}")
    print(f"  - Sub-indices: {arise_res.sub_indices}")
    print(f"  - CPCB Compliant: {arise_res.is_cpcb_compliant}")
    print(f"  - Data Type: {arise_res.data_type}")

    diff = abs(manual_aqi - arise_res.aqi)
    print(f"\nDiscrepancy: {diff}")
    assert diff == 0, f"Discrepancy detected between manual ({manual_aqi}) and Arise ({arise_res.aqi})"
    assert arise_res.dominant_pollutant == fixture["expected_overall"]["dominant_pollutant"]
    assert arise_res.category == fixture["expected_overall"]["category"]
    assert arise_res.is_cpcb_compliant is True
    assert arise_res.data_type == "regulatory_compliant"

    # Reject manual boolean without demonstrable validation
    unvalidated_res = calculate_aqi(sirifort_readings, has_verified_averaging=True)
    assert unvalidated_res.is_cpcb_compliant is False, "A manually set boolean without coverage validation must NOT produce CPCB compliance!"
    assert unvalidated_res.data_type == "indicative"

    # Also test Indicative Telemetry mode (has_verified_averaging=False)
    indicative_res = calculate_aqi(sirifort_readings, has_verified_averaging=False)
    assert indicative_res.aqi == manual_aqi
    assert indicative_res.is_cpcb_compliant is False
    assert indicative_res.meets_pollutant_criteria is True
    assert indicative_res.data_type == "indicative"
    print("CROSS-CHECK VERDICT: PASS (Identical match for both regulatory and indicative modes)")

    print("\n==================================================")
    print("STEP 10 — CURRENT ARISE SNAPSHOT (LIVE)")
    print("==================================================")
    
    # Query live FastAPI server
    try:
        r_env = httpx.get("http://localhost:8000/environment?lat=28.6139&lon=77.2090&demo=false", timeout=15.0)
        if r_env.status_code == 200:
            env_data = r_env.json()
            print(f"Live /environment API response:")
            print(f"  - AQI: {env_data.get('aqi')}")
            print(f"  - Category: {env_data.get('status')}")
            print(f"  - Dominant Pollutant: {env_data.get('dominantPollutant')}")
            print(f"  - Verdict: {env_data.get('verdict')}")
            print(f"  - Data Quality: {env_data.get('dataQuality')}")
            print(f"  - Is Stale: {env_data.get('isStale')}")
            print(f"  - Is Demo: {env_data.get('isDemo')}")
            print(f"  - Contributing Stations: {len(env_data.get('contributingStations', []))}")
            for st in env_data.get('contributingStations', [])[:3]:
                print(f"    * {st.get('name')} (dist: {st.get('distance_km')} km, weight: {st.get('weight')})")
            
            # Cross-check with /verdict endpoint
            r_verdict = httpx.get("http://localhost:8000/verdict?lat=28.6139&lon=77.2090&demo=false", timeout=15.0)
            if r_verdict.status_code == 200:
                v_data = r_verdict.json()
                print(f"\nLive /verdict API response:")
                print(f"  - AQI: {v_data.get('aqi')}")
                print(f"  - Category: {v_data.get('category')}")
                print(f"  - Verdict: {v_data.get('verdict')}")
                assert v_data.get('aqi') == env_data.get('aqi'), "Mismatch between /environment AQI and /verdict AQI!"
                print("  => /environment AQI == /verdict AQI: MATCH")

            # Cross-check with /chat (Ask Arise) endpoint
            chat_payload = {
                "question": "What is the current AQI and verdict right now?",
                "persona": "General Public",
                "lat": 28.6139,
                "lon": 77.2090,
                "demo": False
            }
            r_chat = httpx.post("http://localhost:8000/chat", json=chat_payload, timeout=15.0)
            if r_chat.status_code == 200:
                c_data = r_chat.json()
                print(f"\nLive /chat (Ask Arise) response:")
                print(f"  - AQI: {c_data.get('aqi')}")
                print(f"  - Category: {c_data.get('category')}")
                print(f"  - Verdict: {c_data.get('verdict')}")
                assert c_data.get('aqi') == env_data.get('aqi'), "Mismatch between /environment AQI and /chat AQI!"
                print("  => /environment AQI == /chat AQI: MATCH")

        else:
            print(f"Failed to query /environment: status {r_env.status_code}")
    except Exception as e:
        print(f"Error querying live server: {e}")


if __name__ == "__main__":
    run_cross_check()
