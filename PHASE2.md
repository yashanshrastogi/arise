# Phase 2 — Production-Grade Data + Intelligence Layer
**Arise — Delhi-NCR Air & Weather Intelligence Platform**

---

## 1. Executive Summary
Phase 2 transforms Arise from a polished static UI demo into a resilient, production-grade environmental intelligence system.
The system is built upon a deterministic environmental intelligence core:
- **Real data sources:** OpenAQ API v3, Open-Meteo Weather & Forecast API, and NASA FIRMS Active Fire Signals.
- **CPCB-compliant math:** Spatial Inverse Distance Weighting (IDW) interpolation and official 6-tier AQI break-point calculations.
- **Deterministic Verdict Engine:** Rules-based decisions (`GO`, `BE_SMART`, `CUT_BACK`, `STAY_IN`) with persona sensitivity shifts.
- **AI grounded copilot:** Strands Agent integrating backend tools and outputting validated structured JSON conforming to `AskAriseVerdictResponse`.
- **Google Maps Integration:** Non-intrusive environmental map canvas with POI suppression, station markers, satellite signals, and GPS sync.

---

## 2. Architecture & Data Flow

```text
[ Ground Sensors ]       [ Meteorological ]       [ Satellite ]
 OpenAQ v3 / CPCB          Open-Meteo Dynamics      NASA FIRMS VIIRS
        │                         │                      │
        ▼                         ▼                      ▼
 [ Source Adapters: Timeout, Exponential Retry & Normalization ]
                                  │
                                  ▼
                   [ Resilient Cache Repository ]
                   (Fresh -> Stale-while-Revalidate)
                                  │
                                  ▼
             [ Spatial IDW Engine (3-Station Minimum) ]
                                  │
                                  ▼
            [ Deterministic CPCB AQI & Verdict Engine ]
             (GO / BE_SMART / CUT_BACK / STAY_IN)
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
[ FastAPI REST Endpoints ]                     [ Strands Agent Copilot ]
- /health                                      - get_air_now
- /air/now                                     - get_forecast
- /weather/now                                 - get_fire_signal
- /forecast                                    - get_indoor
- /fire/signals                                - get_verdict
- /environment                                 - compare_places
- /verdict                                                 │
- /compare                                                 ▼
- /chat                                       [ Structured Output JSON ]
         │                                                 │
         └────────────────────────┬────────────────────────┘
                                  ▼
                 [ Unified React / Vite Frontend ]
                 - Executive Verdict Banner & Gauge
                 - Google Maps Layer Canvas & GPS Sync
                 - Hourly Multi-Metric Forecast Chart
                 - Pollutants Breakdown & Dominant Ranking
                 - School Safety Protocol & Watchlist
                 - Ask Arise Interactive Structured Cards
```

---

## 3. Environment Variables & Configuration

Configuration is managed via `backend/app/core/config.py` using Pydantic Settings with automatic secret masking.

| Variable | Type | Default | Description |
|---|---|---|---|
| `MODE` | string | `local` | Operational mode: `local` or `aws`. |
| `AWS_REGION` | string | `us-east-1` | Target AWS region (required if `MODE=aws`). |
| `OPENAQ_API_KEY` | string | `None` | Optional OpenAQ API key for elevated rate limits. |
| `FIRMS_MAP_KEY` | string | `None` | Optional NASA FIRMS Map Key for live satellite queries. |
| `CACHE_TTL_SECONDS` | integer | `1800` | In-memory & filesystem cache TTL (30 minutes). |
| `CACHE_DIR` | string | `data/cache` | Local filesystem directory for disk caching. |
| `API_TIMEOUT_SECONDS` | float | `10.0` | Default network timeout for external providers. |
| `DEMO_MODE_DEFAULT` | boolean | `false` | Fallback operational flag. |
| `BEDROCK_MODEL_ID` | string | `us.amazon.nova-lite-v1:0`| Bedrock model for production AWS mode. |
| `VITE_GOOGLE_MAPS_API_KEY` | string | `.env.local` | Google Maps JS API key for React frontend. |

> **Security Note:** Secrets are never committed, logged, or returned in client payloads. Local fallbacks ensure full development functionality without paid external keys.

---

## 4. External Data Providers

1. **Air Quality (CPCB / OpenAQ v3):**
   - Base URL: `https://api.openaq.org/v3`
   - Resources: `/locations` within 35km radius of Delhi-NCR.
   - Authentication: `X-API-Key` header when configured.
   - Fallback: Calibrated Delhi-NCR ground station telemetry snapshot.

2. **Meteorology & Forecast (Open-Meteo):**
   - Free, keyless API for coordinates (`latitude`, `longitude`).
   - Retrieves temperature, feels-like, relative humidity, precipitation probability, surface wind speed/direction, and 48h hourly forecasts.

3. **Active Fire Signals (NASA FIRMS):**
   - Queries VIIRS active fire hotspots in upwind regions (Punjab, Haryana, Western UP).
   - Strict Non-Causal Policy: Labeled as *"Satellite fire signal detected"*. Thermal anomalies reflect heat detection and are never asserted as sole pollution causes without meteorological dispersion analysis.

---

## 5. API Endpoints

All endpoints support `?lat=...&lon=...` with default `28.6139, 77.2090` (Delhi-NCR Central).

- `GET /health`: Service health, uptime, operational mode, and provider availability.
- `GET /air/now`: Real-time air quality, nearest ground stations, dominant pollutant, and IDW estimation.
- `GET /weather/now`: Current surface temperature, wind velocity, humidity, and atmospheric dispersion correlation.
- `GET /forecast`: 24-hour and 7-day hourly forecasts for AQI, Temperature, Rain %, and Wind speed, plus data-derived best outdoor window.
- `GET /fire/signals`: Regional satellite fire anomalies detected upwind within monitored radius.
- `GET /environment`: **Single Unified Snapshot** consolidating air, weather, forecast, fires, verdict, and school actions.
- `GET /verdict`: Deterministic persona verdict (`GO`, `BE_SMART`, `CUT_BACK`, `STAY_IN`).
- `POST /compare`: Multi-location environmental comparison (e.g. Home, School, Office).
- `POST /chat`: Strands Agent Copilot executing grounded tools and returning validated structured verdict JSON.

---

## 6. Deterministic Verdict & Rule Engine

AQI is computed according to standard CPCB breakpoints:
- `0–50`: Good (`GO`)
- `51–100`: Satisfactory (`GO`)
- `101–200`: Moderate (`BE_SMART`)
- `201–300`: Poor (`CUT_BACK`)
- `301–400`: Very Poor (`STAY_IN`)
- `401+`: Severe (`STAY_IN`)

**Persona Vulnerability Shifts:**
- `Child/Parent` & `Elderly/Asthma`: Stricter by one tier (e.g., Moderate AQI becomes `CUT_BACK`; Poor AQI becomes `STAY_IN`).
- `School Admin`: Mandates outdoor activity suspensions (`CANCEL`) when AQI exceeds 300, and modifications when AQI is 201–300.
- `Athlete` & `Outdoor Worker`: Receive specific exertion cutbacks and hydration/filtration guidance.

---

## 7. Strands Agent Architecture

- **Single-Agent Model:** Single `AriseAgent` avoiding multi-agent race conditions or token explosion.
- **Tool Grounding:** Agent invokes 6 canonical Python tools (`get_air_now`, `get_forecast`, `get_fire_signal`, `get_indoor`, `get_verdict`, `compare_places`).
- **Structured Output Schema:**
  ```json
  {
    "verdict": "STAY_IN",
    "headline": "Avoid outdoor activities — current air is Very Poor with an AQI of 312.",
    "why": ["Dominant PM2.5 at 149 µg/m³", "Calm surface winds trapping surface emissions"],
    "do": ["Wear N95 masks outdoors", "Operate indoor HEPA purifiers"],
    "best_window": "3 PM – 5 PM",
    "recheck_at": "4:00 PM",
    "sources": ["CPCB Ground Stations", "Open-Meteo Dynamics"]
  }
  ```
- **Inviolable Principle:** The LLM explains data; the LLM **cannot** override the deterministic verdict engine or invent raw measurements.

---

## 8. Testing & Validation

All 59 unit and integration tests execute cleanly in under 2.5 seconds:
```bash
# Run all backend tests
cd ~/arise/backend
../.venv/bin/python -m unittest discover tests

# Build and validate frontend
cd ~/arise/frontend
npm run build
```

**Test Coverage Summary:**
- `test_config.py`: Environment validation, secret masking, positive numerical limits.
- `test_models.py`: Pydantic coordinate ranges, timestamp formats, pollutant aliases.
- `test_air_sources.py`: OpenAQ v3 adapter, demo fallback, unit normalization.
- `test_location_estimator.py`: IDW 3-station weighting, exact match (<50m), radius constraints.
- `test_aqi_verdict.py`: CPCB breakpoint interpolation, dominant pollutant, persona rules.
- `test_cache.py`: In-memory & JSON file cache hits, stale reads, expiration.
- `test_weather_forecast.py`: Open-Meteo normalization, diurnal curve, best-window logic.
- `test_environment_service.py`: Pipeline aggregation, UI formatting, multi-place comparison.
- `test_api_routes.py`: FastAPI route integration, error handling, X-Request-ID middleware.
- `test_strands_agent.py`: Grounding tools, non-causal fire language, Ask Arise structured output.

---

## 9. Running Locally

### Backend (FastAPI):
```bash
cd ~/arise/backend
source ../.venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend (React/Vite):
```bash
cd ~/arise/frontend
npm run dev
```

---

## 10. Future AWS Readiness (Phase 3 Roadmap)

1. **Serverless Deployment:**
   - Wrap FastAPI with `Mangum` handler in `template.yaml`.
   - Deploy behind Amazon API Gateway and AWS Lambda.
2. **Persistence:**
   - Migrate `CacheRepository` from JSON/memory to Amazon DynamoDB with TTL.
3. **Scheduled Ingestion:**
   - Configure AWS EventBridge cron (every 30 minutes) triggering an ingestion Lambda.
4. **Cloud AI:**
   - Switch `LLM_PROVIDER` to `bedrock` targeting `us.amazon.nova-lite-v1:0`.

---

## 11. AQI Scientific Correctness Audit & Methodology

### 11.1 Authoritative Standard & Source
Arise implements the official **Central Pollution Control Board (CPCB) National Air Quality Index (NAQI)** standard, developed in collaboration with IIT Kanpur (*Technical Report on National Air Quality Index*, October 2014).

### 11.2 Pollutant Averaging Periods & Operational Telemetry
CPCB NAQI breakpoints are formulated around specific ambient exposure periods:
- **PM2.5:** 24-hour average ($\mu\text{g/m}^3$)
- **PM10:** 24-hour average ($\mu\text{g/m}^3$)
- **NO2:** 24-hour average ($\mu\text{g/m}^3$)
- **SO2:** 24-hour average ($\mu\text{g/m}^3$)
- **CO:** 8-hour average ($\text{mg/m}^3$)
- **O3:** 8-hour average ($\mu\text{g/m}^3$)

**Operational Telemetry Proxy:** Continuous Ambient Air Quality Monitoring Stations (CAAQMS) operated by CPCB and DPCC compute rolling hourly and 24-hour averages on-site. OpenAQ v3 `/locations/{id}/latest` exposes these published hourly telemetry broadcasts. This is the exact operational real-time proxy used by CPCB's official *SAMEER* application.

### 11.3 Reference Physical Units & Normalization
CPCB breakpoints require exact physical metric units:
- **Particulates & Photochemicals:** PM2.5, PM10, NO2, SO2, O3 in **$\mu\text{g/m}^3$**.
- **Carbon Monoxide:** CO in **$\text{mg/m}^3$**.

**Unit Conversion Factors (at Indian NTP $25^\circ\text{C}$, 1 atm):**
- **NO2:** $1\text{ ppb} = 1.88\ \mu\text{g/m}^3$ ($46.01 / 24.45$)
- **SO2:** $1\text{ ppb} = 2.62\ \mu\text{g/m}^3$ ($64.07 / 24.45$)
- **O3:** $1\text{ ppb} = 1.96\ \mu\text{g/m}^3$ ($48.00 / 24.45$)
- **CO:** If raw concentration $> 50.0$ or labeled $\mu\text{g/m}^3$, divide by 1000 to convert to $\text{mg/m}^3$. In Indian CAAQMS telemetry, normal values (0.1–30.0) represent $\text{mg/m}^3$ directly.

### 11.4 Contiguous Breakpoint Table
To prevent fractional gaps (e.g. 30.05 $\mu\text{g/m}^3$ dropping into gaps), Arise employs contiguous lower and upper bounds:

| Category | AQI Range | PM2.5 (24h) | PM10 (24h) | NO2 (24h) | SO2 (24h) | CO (8h, mg/m³) | O3 (8h) |
|---|---|---|---|---|---|---|---|
| **Good** | 0 – 50 | 0.0 – 30.0 | 0.0 – 50.0 | 0.0 – 40.0 | 0.0 – 40.0 | 0.0 – 1.0 | 0.0 – 50.0 |
| **Satisfactory** | 51 – 100 | 30.0 – 60.0 | 50.0 – 100.0 | 40.0 – 80.0 | 40.0 – 80.0 | 1.0 – 2.0 | 50.0 – 100.0 |
| **Moderate** | 101 – 200 | 60.0 – 90.0 | 100.0 – 250.0 | 80.0 – 180.0 | 80.0 – 380.0 | 2.0 – 10.0 | 100.0 – 168.0 |
| **Poor** | 201 – 300 | 90.0 – 120.0 | 250.0 – 350.0 | 180.0 – 280.0 | 380.0 – 800.0 | 10.0 – 17.0 | 168.0 – 208.0 |
| **Very Poor** | 301 – 400 | 120.0 – 250.0 | 350.0 – 430.0 | 280.0 – 400.0 | 800.0 – 1600.0 | 17.0 – 34.0 | 208.0 – 748.0 |
| **Severe** | 401 – 500 | 250.0 – 500.0 | 430.0 – 600.0 | 400.0 – 600.0 | 1600.0 – 2000.0 | 34.0 – 50.0 | 748.0 – 1000.0 |

**Linear Interpolation Formula:**
$$I_p = \left[ \frac{I_{HI} - I_{LO}}{B_{HI} - B_{LO}} \right] \times (C_p - B_{LO}) + I_{LO}$$

### 11.5 Spatial Interpolation Architecture
Arise executes spatial estimation in the scientifically sound order:
$$\text{Live Stations} \longrightarrow \text{Physical Concentrations} \longrightarrow \text{IDW Spatial Interpolation} \longrightarrow \text{Local Concentrations} \longrightarrow \text{CPCB AQI}$$
Interpolating physical concentrations before computing AQI prevents the non-linear distortion caused by interpolating pre-computed index numbers.

### 11.6 Data Quality & Completeness
- **CPCB Completeness Rule:** A valid AQI requires $\ge 3$ monitored pollutants, at least one of which must be PM2.5 or PM10. Flagged via `is_cpcb_compliant: bool`.
- **Sensor Deduplication:** Station sensor arrays with historical/decommissioned duplicates are deduplicated by timestamp (`obs_time > existing.timestamp`), guaranteeing that only live telemetry enters the IDW engine.

### 11.7 Example Verified Live Calculation
Live CAAQMS telemetry from station **Sirifort (ID 5586), New Delhi**:
- PM10: $318.0\ \mu\text{g/m}^3 \implies \text{Sub-index } 268$ (Poor)
- PM2.5: $72.88\ \mu\text{g/m}^3 \implies \text{Sub-index } 144$ (Moderate)
- NO2: $30.81\text{ ppb} \times 1.88 = 57.9\ \mu\text{g/m}^3 \implies \text{Sub-index } 73$ (Satisfactory)
- SO2: $44.76\text{ ppb} \times 2.62 = 117.3\ \mu\text{g/m}^3 \implies \text{Sub-index } 113$ (Moderate)
- CO: $2.19\text{ mg/m}^3 \implies \text{Sub-index } 103$ (Moderate)
- O3: $16.0\ \mu\text{g/m}^3 \implies \text{Sub-index } 16$ (Good)

**Independent Mathematical Calculation:**
- Overall AQI = $\max(268, 144, 73, 113, 103, 16) = \mathbf{268}$
- Dominant Pollutant = **PM10**
- Category = **Poor**

**Arise Engine Output:**
- AQI: **268**, Dominant: **PM10**, Category: **Poor**
- Discrepancy: **0 (Exact match)**
- Result: **PASS**
