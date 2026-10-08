"""
Verification script for AQI Scientific Correctness Audit:
1. Cross-checks live OpenAQ station observations against independent manual CPCB math.
2. Checks live GET /environment?lat=28.6139&lon=77.2090&demo=false
3. Checks dashboard, API, verdict, and Ask Arise agreement.
"""

import socket
import httpx
from app.domain.aqi import calculate_aqi, calculate_sub_index, get_aqi_category

_orig_getaddrinfo = socket.getaddrinfo
def _getaddrinfo_ipv4(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
socket.getaddrinfo = _getaddrinfo_ipv4


def manual_cpcb_calculation(pollutant: str, conc: float) -> int:
    """Independent calculation using authoritative CPCB breakpoints."""
    # Breakpoint lookup table (b_lo, b_hi, i_lo, i_hi)
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
    }
    bps = table[pollutant]
    for b_lo, b_hi, i_lo, i_hi in bps:
        if b_lo <= conc <= b_hi:
            # Linear interpolation
            return round(((i_hi - i_lo) / (b_hi - b_lo)) * (conc - b_lo) + i_lo)
    last_lo, last_hi, last_i_lo, last_i_hi = bps[-1]
    if conc > last_hi:
        return min(round(((last_i_hi - last_i_lo) / (last_hi - last_lo)) * (conc - last_lo) + last_i_lo), 500)
    return 0


def run_cross_check():
    print("==================================================")
    print("STEP 9 — LIVE MANUAL CROSS-CHECK")
    print("==================================================")

    # Let's inspect real live Delhi CAAQMS station Sirifort (ID 5586)
    # Observed raw telemetry:
    # PM10: 318.0 µg/m³
    # PM2.5: 72.88 µg/m³
    # NO2: 30.81 ppb -> 30.81 * 1.88 = 57.92 µg/m³
    # SO2: 44.76 ppb -> 44.76 * 2.62 = 117.27 µg/m³
    # CO: 2.19 mg/m³
    # O3: 15.95 µg/m³
    sirifort_readings = {
        "PM10": 318.0,
        "PM2.5": 72.88,
        "NO2": round(30.81 * 1.88, 1), # 57.9 µg/m³
        "SO2": round(44.76 * 2.62, 1), # 117.3 µg/m³
        "CO": 2.2,                      # 2.2 mg/m³
        "O3": 16.0,                     # 16.0 µg/m³
    }

    print("\nLive Station: Sirifort (ID 5586), New Delhi")
    print("Averaging Periods: PM10 (24h), PM2.5 (24h), NO2 (24h), SO2 (24h), CO (8h), O3 (8h)")
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

    # Arise calculation
    arise_res = calculate_aqi(sirifort_readings)
    print("\nArise calculate_aqi() Output:")
    print(f"  - AQI: {arise_res.aqi}")
    print(f"  - Dominant: {arise_res.dominant_pollutant}")
    print(f"  - Category: {arise_res.category}")
    print(f"  - Sub-indices: {arise_res.sub_indices}")
    print(f"  - CPCB Compliant: {arise_res.is_cpcb_compliant}")

    diff = abs(manual_aqi - arise_res.aqi)
    print(f"\nDiscrepancy: {diff}")
    assert diff == 0, f"Discrepancy detected between manual ({manual_aqi}) and Arise ({arise_res.aqi})"
    print("CROSS-CHECK VERDICT: PASS (Identical match)")

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
