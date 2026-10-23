---
name: arise
description: >-
  Essential domain engineering memory, architectural invariants, deterministic verdict rules,
  and operational safety principles for the Arise Atmospheric & Environmental Intelligence Platform.
---

# ARISE — Project Skill & Domain Memory

Arise is an atmospheric and environmental intelligence platform designed to answer the core citizen question: **"Should I go out, what should my kid/school do, and why?"** in plain language backed by deterministic scientific precision.

---

## 1. System Architecture & Component Roles

```
[ Frontend: React 19 + Vite ] ──(HTTP/JSON)──> [ Amazon API Gateway v2 / Local Uvicorn ]
         │                                                        │
    Dual Map Engine                                     [ FastAPI + Mangum ]
 (Google Maps + SVG Fallback)                                     │
         │                                      ┌─────────────────┼──────────────────┐
    TimeContext                                 ▼                 ▼                  ▼
 (Asia/Kolkata & Global)                   [ Cache Repo ]   [ Ingestion ]      [ AI Engine ]
                                           (DynamoDB/Mem)   (OpenAQ/FIRMS)   (Gemini/Bedrock/Rule)
```

- **Frontend Client (`frontend/`):** React 19 Single Page Application built with Vite. Implements responsive UI (320px–2560px), time synchronization (`timeContext.js`), and a dual map engine (Google Maps JavaScript API with automatic offline-capable SVG fallback `DelhiNcrVectorMap`).
- **Backend Application (`backend/app/`):** FastAPI running on Python 3.12. Executed locally via Uvicorn (`main:app`) and deployed to AWS Lambda via the Mangum ASGI adapter (`ApiFunction`).
- **Cache & Telemetry Ingestion (`backend/app/cache/`, `backend/app/lambdas/`):** DynamoDB `arise-cache-prod` (with TTL auto-expiration) and local `MemoryCacheRepository`. Background ingestion Lambda (`IngestionFunction`) periodically captures OpenAQ ground station data and NASA FIRMS thermal anomaly fire signals.
- **AI & Copilot Service (`backend/app/agents/`):** Multi-provider copilot (`Ask Arise`) enforcing strict structured JSON schemas (`AskAriseVerdictResponse`). Supported backends:
  - `gemini`: Google Gemini 2.5 Flash Lite (production active backend via AWS Secrets Manager).
  - `bedrock`: Amazon Bedrock Nova Lite `us.amazon.nova-lite-v1:0` (under implementation, currently blocked by AWS account model policy).
  - `rule-based`: Deterministic, sub-second rule engine providing guaranteed safety fallback during network failure, timeouts, or permission errors.

---

## 2. Non-Negotiable Architectural & Product Invariants

1. **Deterministic Verdict Authority:**
   - Authoritative environmental calculations (NAQI breakpoints, dominant pollutant sub-indices, and persona risk verdicts) are computed deterministically in `backend/app/services/environment.py`.
   - The AI Copilot (`Ask Arise`) **MUST NEVER** override, recalculate, or contradict the authoritative `verdict` (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`), calculated `aqi`, or `category`.
   - Any LLM output that disagrees with the deterministic verdict is sanitized and overwritten before returning to the user.

2. **Geographic & Coordinate Provenance:**
   - Never silently return Delhi weather or air quality data when a user requests another location.
   - For national and global coordinates outside Delhi-NCR, evaluate weather and local time using the requested latitude/longitude and its local timezone. Coordinate parameters must strictly validate bounds (`-90 <= lat <= 90`, `-180 <= lon <= 180`).
   - Location resolution strictly follows deterministic priority: session user choice -> saved profile home -> device GPS permission -> India-wide overview (`[22.5937, 78.9629]`, zoom 5).
   - Ground-First Hierarchy: Ground station observations (CPCB/OpenAQ within 35 km) strictly take precedence over numerical models. Unmonitored coordinates honestly return regional numerical models (`data_type = 'modelled'`) or `Unavailable` (`data_type = 'unavailable'`). Delhi station data is never substituted for non-Delhi locations.

3. **Persona-Specific Risk Calibration:**
   - 5 calibrated personas: *General Public*, *Sensitive / Asthma*, *Elderly*, *Athletes / Runners*, and *Schools / Children*.
   - Each persona defines distinct vulnerability thresholds, guidance statements, and safe outdoor activity windows.

4. **Honesty & Transparency:**
   - Live telemetry indicators must honestly state station count, nearest sensor distance, satellite signal age, and observation timestamps.
   - If data is served from the 1,800-second stale cache grace window, it must be explicitly labeled as cached/stale.

5. **Secrets & Cloud Safety:**
   - Never commit API keys, AWS credentials, or secrets to Git or documentation.
   - Never run destructive AWS commands (`sam delete`, `rm -rf`, modifying production IAM or DynamoDB tables) without explicit user authorization. Always prefer local and mocked test suites before cloud operations.

---

## 3. Telemetry Providers & External Data Flow

| Telemetry Type | Primary Provider | Fallback / Secondary | Role |
|---|---|---|---|
| **Air Quality (National Ground)** | OpenAQ v3 API (CPCB Ground Stations) | Open-Meteo CAMS / OpenWeather Air Pollution | PM2.5, PM10, NO2, SO2, CO, O3 ground observations (<= 35 km) |
| **Global & National Weather** | Open-Meteo Weather API | OpenWeather 2.5 / Tomorrow.io v4 | Temperature, humidity, wind, UV index, visibility, sunrise/sunset |
| **Boundary Layer & Ventilation** | Open-Meteo Hourly API | Atmospheric dispersion modeling | Boundary layer mixing height & smoke trapping risk |
| **Active Stubble Burning** | NASA FIRMS (VIIRS / MODIS) | Cached regional fire anomalies | Upwind agricultural fire counts in Punjab/Haryana |
| **AI Copilot** | Google Gemini (prod) / Amazon Bedrock (dev) | Deterministic Rule-Based Engine | Grounded conversational explanations and safe window advice |

---

## 4. High-Risk Failure Modes & Automatic Recovery

- **Bedrock IAM / Quota Failure (`ValidationException: Error 002` or `AccessDeniedException`):**
  - *Trigger:* Account lacking Bedrock model access or invalid IAM role permissions.
  - *Mitigation:* Circuit breaker records failure in cache for 10 minutes (`bedrock_circuit_breaker:failure`) and immediately routes requests to the deterministic rule-based engine (`provider: "rule-based"`).
- **External Telemetry Timeout / Outage:**
  - *Trigger:* Open-Meteo, OpenAQ, or NASA FIRMS API latency or downtime.
  - *Mitigation:* System serves data from the 1,800-second stale cache grace window with `is_stale=True`. If cache is empty and secondary weather provider (OpenWeather) is unreachable, an honest degraded payload (`data_provenance: "degraded"`, `condition_text: "Unavailable"`) is returned. Under no circumstances is Delhi data silently substituted for other geographic coordinates. Built-in fallback station coordinates apply exclusively to Delhi-NCR ground monitoring stations.
- **Thundering Herd / Concurrent Cache Stampede:**
  - *Trigger:* Multiple concurrent requests for the same geographic cell when cache expires.
  - *Mitigation:* Mutex lock via `acquire_fetch_lock` / `release_fetch_lock` ensures only one worker fetches upstream telemetry while other workers await the cached result.
- **Shell Node.js Incompatibility:**
  - *Trigger:* WSL non-interactive subshell invoking system Node 18 instead of Node 24, causing Vite 8 / Rolldown build failure (`SyntaxError: styleText`).
  - *Mitigation:* Prepend commands with `source ~/.nvm/nvm.sh` before running Vite build or frontend scripts.

---

## 5. Evidence Classification Model

When auditing, recording state, or making technical claims, strictly use these classifications:

- **VERIFIED:** Confirmed by current source inspection, reproducible passing test output, or live HTTP responses.
- **REPORTED:** Documented in prior reports but not currently verified against live systems.
- **PLANNED:** Intended architecture or features not yet implemented or merged.
- **BLOCKED:** Dependent on an unresolved external access restriction, credential, or dependency.
- **UNKNOWN:** Insufficient evidence available to reach a conclusive determination.

---

## 6. Canonical Documentation Index

- **Current Project Memory & Active Handoff:** [PROJECT_STATE.md](PROJECT_STATE.md)
- **Repository Operating Rules & Entry Point:** [AGENTS.md](AGENTS.md)
- **Product Requirements & Specifications:** [PRODUCT.md](PRODUCT.md)
- **Tooling, Verification Commands & Operations:** [TOOLS.md](TOOLS.md)
- **Development History & Audit Log:** [CHANGELOG.md](CHANGELOG.md)
- **Deep-Dive System Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Visual Design System & Persona Tokens:** [docs/DESIGN.md](docs/DESIGN.md)
- **Production AWS Deployment Audit:** [docs/AWS_DEPLOYMENT_REPORT.md](docs/AWS_DEPLOYMENT_REPORT.md)
