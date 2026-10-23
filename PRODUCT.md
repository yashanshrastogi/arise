# Product

<!-- impeccable:product-schema 1 -->

> **Active Project Status:** For the active milestone, verified test outcomes, blockers, and pending tasks, see [PROJECT_STATE.md](PROJECT_STATE.md). Operating rules are in [AGENTS.md](AGENTS.md).

## Platform

web

## Users
Citizens across Delhi-NCR, metropolitan India, and global regions, including General Public, Parents & Children, Seniors & Asthma patients, Commuters & Outdoor Workers, and School Administrators requiring immediate daily outdoor safety answers.

## Product Purpose
Not simply "what is the AQI?", but *"should I go out, what should my kid/school do, and why?"* — delivered in plain language backed by deterministic atmospheric science, multi-provider data fusion, and zero data fabrication.

## Positioning
Arise uniquely combines hyper-local ground station IDW spatial interpolation, Open-Meteo atmospheric dynamics, NASA FIRMS thermal anomaly detection, and route-level commute exposure into persona-tailored actionable directives. Deterministic safety rules and CPCB NAQI formulations are strictly deterministic and never hallucinated or overridden by generative AI models.

## Operating Context
Everyday mobility and health decisions: school morning assemblies, outdoor recess, daily office commutes, athletic training windows, and senior citizen walking times during high pollution episodes and winter inversion events.

## Capabilities and Constraints
- Full Pan-India coordinate resolution with non-Delhi isolation.
- Real-time CPCB / OpenAQ ground telemetry, Open-Meteo NWP atmospheric dynamics, NASA FIRMS fire signals.
- Turn-by-turn Commute Intelligence with weather and pollution waypoints along route.
- Grounded Ask Arise AI copilot with sub-second deterministic rule engine fallback.
- Strictly no LLM calculation of AQI; missing data is reported as `Unavailable`, never 0.

## Brand Commitments
- Name: Arise (Arise Environmental Intelligence)
- Voice: Calm, scientifically honest, actionable, non-alarmist, plain English accessible from age 12 to 80.
- Zero fabrication on missing data (`Unavailable` rather than 0).

## Evidence on Hand
- CPCB National Air Quality Index formulations (0–500 scale).
- NASA FIRMS VIIRS/MODIS satellite active fire thermal anomaly telemetry.
- Open-Meteo ECMWF / CAMS atmospheric model grid predictions.

## Product Principles
1. Scientific honesty over synthetic completeness: never fabricate numbers or substitute Delhi data for other locations.
2. Actionable clarity over raw data dumping: answer "Can I go out?" first.
3. Deterministic safety: LLMs never override environmental calculations.
4. Inclusive, age-friendly accessibility: plain English definitions for complex atmospheric terms.

---

# ARISE — Product Requirements & Specifications

## 1. Product Scope & User Personas

Arise serves citizens across the Delhi-NCR metropolitan region and worldwide locations, translating raw environmental and meteorological telemetry into persona-specific action directives:

| Persona | Primary Vulnerability | Core Product Directives |
|---|---|---|
| **General Public** | Baseline cardiovascular & respiratory health | General outdoor safety, commuting advice, window ventilation recommendations |
| **Sensitive / Asthma** | Reactive airway disease, COPD, asthma triggers | Tighter safety thresholds, early exposure warnings, medication / N95 reminders |
| **Elderly** | Cardiac stress, respiratory vulnerability | Minimized morning peak exposure, indoor purification guidance |
| **Athletes / Runners** | High minute ventilation & deep lung particle deposition | Identification of clean diurnal training windows, outdoor exertion warnings |
| **Schools / Children** | Developing lungs, outdoor sports activity | Objective Go / Modify / Cancel protocols for sports, recess, and school commutes |

---

## 2. Core User Workflows & Screen Capabilities

### 2.1. Today (Executive Environmental Intelligence)
- **Calculated NAQI Gauge:** Hyper-local computed AQI displayed with official CPCB color bands and status labels.
- **Deterministic Action Verdict:** Prominent status badge (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`) tailored to the selected persona.
- **Dynamic Regional Location Subtitle:** Accurately renders the active regional district and city (e.g., `Kothrud, Pune`, `Pune`, `Brahmpuri, Jaipur`, `Brahmpuri`, `Central Delhi, New Delhi`) without hardcoded or synthetic fallback to "Delhi-NCR" for non-Delhi locations.
- **Waking Hours Outdoor Window:** Lowest-risk outdoor window recommendation is strictly capped between waking hours (6:00 AM to 10:00 PM). Overnight/sleeping hours (10:01 PM to 5:59 AM) are never recommended for outdoor activity even if overnight AQI is lower.
- **Telemetry Transparency Badges:** Honest provenance metrics displaying station count, nearest sensor distance, and satellite signal age.

### 2.2. Air Map (Spatial Exploration)
- **Dual Map Engine:** Interactive Google Maps JavaScript API with styled markers, AQI zones, and GPS location centering.
- **Zero-Downtime Fallback:** Automatic switch to an interactive SVG vector map (`DelhiNcrVectorMap`) when Google Maps keys or network connections are unavailable.
- **Telemetry Overlays:** Ground monitoring stations (CPCB / OpenAQ) and NASA FIRMS thermal anomaly fire hotspots.

### 2.3. Hourly Forecast & Horizon
- **Diurnal Timeline:** 24-hour hourly trajectory distinguishing past hours from upcoming forecast hours.
- **Authoritative Time Synchronization:** Local time handling synced to `Asia/Kolkata` for Delhi-NCR and local timezone context for global coordinates.
- **Optimal Window Highlighting:** Distinct visual callout of the lowest-risk outdoor activity window.

### 2.4. Ask Arise (Evidence-Grounded Weather AI)
- **Grounded Weather & Environmental Synthesis:** Multi-domain conversational copilot answering a comprehensive spectrum of surface meteorology (ambient temperature, feels-like temperature, humidity, dew point, surface atmospheric pressure, wind speed/direction/degrees, precipitation, rain probability, visibility, UV index, cloud cover, and solar schedule sunrise/sunset), air quality speciation, multi-day forecasts, and outdoor planning.
- **Intent-Selective Context Assembly:** Dynamic intent routing (`current_weather`, `forecast_planning`, `weather_trends`, `outdoor_planning`, `transit_commute`, `pollutant_inquiry`, `health_sensitivity`, `fire_satellite`, `comparison`, `scientific_explanation`, `current_safety`) assembling only relevant evidence blocks into compact prompts.
- **Single-Shot Retrieval & Cost Optimization:** Unified single-call environmental snapshot fetching with full context reuse in `AriseAgent.answer`, eliminating duplicate upstream tool queries and retiring redundant critic LLM invocations to reduce token usage and latency by over 50%.
- **Schema Enforcement & Flexible Answer Structure:** Strict structured output conforming to `AskAriseVerdictResponse` (`verdict`, `headline`, `why` bullet points, `do` actionable advice, `best_window`, `recheck_at`, `sources`, and provenance metadata).
- **Domain Guardrails & Injection Defense:** Regex and heuristic guardrails rejecting off-topic queries and neutralizing prompt injection attempts embedded in telemetry or user prompts.
- **Strict Deterministic Safety & Zero Cross-City Substitution:** Authoritative backend CPCB NAQI verdicts (`GO`, `BE_SMART`, `CUT_BACK`, `STAY_IN`) are strictly inviolable and can never be overridden by model hallucinations. Non-Delhi coordinates (e.g. Pune, Mumbai, Bengaluru) are strictly isolated with zero Delhi fallback.
- **Persistent Conversations & Long-Term Memory:** ChatGPT-style sidebar with auto-titling, search, pinning, archiving, and deletion; user-controlled long-term memory with sensitive health consent approval banners and secret scrubbing. Each conversation maintains an isolated unique ID with preserved turn directives (`why`, `do`, `best_window`, `sources`).
- **Honest Storage Status & Offline Resilience:** Truthful storage badges (`☁️ Server Storage`, `💾 Local Storage (Device Only)`, `⚠️ Local Fallback (Offline)`) accurately communicate device versus server-synced tiers. Memory inputs are preserved on failure and local device storage provides seamless offline operation.
- **Read Aloud (Text-to-Speech):** Native, zero-latency Web Speech API integration (`speechSynthesis`) allowing users to listen to AI responses. Formats structured speech (Verdict, Headline, Observations, Actions) with markdown stripping, Indian English voice preference (`en-IN`), active playback toggle (`🔊 Read Aloud` / `⏹️ Stop`), and automatic cancellation on navigation or unmount.
- **Verified Evaluation Suite:** 15-category automated test suite (`backend/tests/test_evidence_grounded_weather_ai.py`) covering factual accuracy, forecast horizons, pollutant speciation, timestamps/units, location isolation, missing data honesty, trends, comparisons, route exposure, scientific uncertainty, conciseness, conversation history, prompt injection defense, API call efficiency, and verdict preservation.

### 2.5. Commute Intelligence & Route Planning (Milestones 1, 2 & 3)
- **Saved Location Integration:** Uses saved Home and Work locations from user profile to calculate real-world commute corridors. No synthetic demo locations or fake coordinates are substituted; when unconfigured, a clear setup banner directs users to configure their Home and Work locations in Profile Settings.
- **Routing Provider:** OpenRouteService (ORS) Directions v2 adapter delivering driving (`driving-car`), cycling (`cycling-regular`), and walking (`foot-walking`) geometries.
- **Reverse Commute Support:** Explicit direction flip (`⇄`) allowing users to calculate either Home → Work or Work → Home, sending swapped origin and destination coordinates to ORS with independent caching keys.
- **Structural Caching:** 1-hour cache TTL keyed by profile and coordinates via `CacheRepository`.
- **Pre-computed Metrics & Zero Fabrication:** Returns distance in kilometres and duration in minutes, with geometry normalized to `[lat, lon]` pairs ready for Google Maps polylines. Missing credentials, timeouts, or route errors strictly return HTTP 503/404/400 and client-side `null` without fabricating synthetic routes.
- **Backend-Only Secrets:** ORS API key is strictly maintained on the server; never exposed to browser or client code.
- **Interactive Route Card & Map Display:** Visual distance and duration badges with "Show route on map" and "Hide from map" controls, interactive map polyline in Indigo-600 (`#4F46E5`), endpoints (Origin 'A', Destination 'B'), and immediate overlay cleanup on unmount or route dismissal.
- **Milestone 2 — Weather Along the Corridor:**
  - *Representative Point Sampling:* Samples 2 to 4 representative waypoints along actual route polyline geometry (Origin, Midpoint(s), Destination) spaced by cumulative geodesic distance, with proportional estimated arrival times (`eta_min`).
  - *Weather Provider Reuse:* Reuses the existing `OpenMeteoWeatherProvider` without creating duplicate providers; queries surface conditions using spatial grid cell caching (`0.02` deg ~2 km resolution) and request coalescing.
  - *Comprehensive Atmospheric Telemetry:* Delivers ambient temperature, feels-like temperature, humidity, precipitation (mm), rain probability (%), wind speed & cardinal direction, visibility (km), and fog risk classification (`None`, `Moderate Fog`, `Dense Fog`).
  - *Fog & Low-Visibility Detection:* Automatically flags low visibility (< 2.5 km) and dense fog (<= 1.0 km or WMO 45/48) as road hazard warnings.
  - *Deterministic Corridor Advisory:* Rule engine generates condition advisories (rain warnings, fog alerts, clear commute) without AI alteration.
  - *Data Provenance & Microclimate Disclosure:* Clearly labels spatial resolution ("Open-Meteo NWP (~2 km grid resolution)"), identifies stale cache entries, and explicitly disclaims road-level microclimate variations.
  - *Zero Fabrication on Degraded Weather:* If weather provider fails or is unreachable, returns honest `temp_c: null`, `condition: "Unavailable"`, `data_provenance: "degraded"` without synthetic numbers or Delhi fallbacks.
  - *Interactive Map Waypoints:* Waypoint pins with condition icons and interactive info windows displaying point ETA, temperature, rain chance, and wind speed.
- **Milestone 3 — Pollution Exposure Along the Corridor:**
  - *Waypoint Air Quality Sampling:* Evaluates air quality at sampled route waypoints, computing CPCB NAQI integer scores, sub-indices, and dominant pollutants.
  - *Provenance Differentiation (Observed vs Modelled):* Prioritizes observed ground monitoring stations (CPCB / OpenAQ) via Inverse Distance Weighting (IDW) interpolation within 35 km; falls back to regional atmospheric numerical models (`OpenMeteoWeatherProvider.get_current_air_quality`) when no ground monitors are in range; tags each point honestly as `observed`, `modelled`, or `unavailable`.
  - *Zero Fabrication on Missing Telemetry:* If neither ground stations nor numerical models have coverage, returns `aqi: None`, `aqi_category: "Unavailable"`, `data_type: "unavailable"` without synthetic numbers or dummy scores.
  - *Strict Non-Delhi Isolation:* Completely prohibits Delhi ground or demo stations from leaking into non-Delhi routes (e.g. Bengaluru, Mumbai, London).
  - *Deterministic Corridor Summary & Advisory:* Synthesizes corridor average AQI (`avg_aqi`), peak hotspot (`max_aqi`, `hotspot_label`), cleanest point (`min_aqi`, `cleanest_label`), and health advisories based on authoritative CPCB bands without AI alteration.
  - *Roadside Microclimate Disclaimer:* Explicitly displays: *"Ambient background estimates. Roadside tailpipe microclimates and congested idling hotspots may exceed ambient station readings."*
  - *Rich UI & Map Integration:* Route card features corridor average badge, advisory banner, hotspot callouts, waypoint cards with pollutant concentrations (`PM2.5`, `PM10`, `NO2`), provenance badges, station distance, and enriched map InfoWindows.

### 2.6. Pan-India Environmental Data Fusion & Dynamic Maps
- **Shared Canonical Location Model:** Validates coordinates (`-90 <= lat <= 90`, `-180 <= lon <= 180`) and follows deterministic priority: session user choice -> saved profile home -> device GPS permission -> India-wide overview at `[22.5937, 78.9629]`, zoom 5. Unintended global Delhi fallbacks are strictly eliminated.
- **Dynamic National Map Engine:** Centers and zooms dynamically to user-selected locations across India (including Srinagar, Guwahati, Kochi, Kolkata, Mumbai, Chennai, Bengaluru, Delhi). Overlays and wind vectors anchor dynamically to active coordinates. Delhi traffic corridors are strictly scoped to Delhi-NCR boundaries (`isInDelhiNcr`).
- **Multi-Provider Weather & Air Quality Fusion:** Integrates OpenWeather (Current Weather 2.5 + Air Pollution) and Tomorrow.io (Realtime v4) as secondary adapters with strict unit normalization and backend secret isolation.
- **Ground-First Hierarchy & Disagreement Detection:** Ground observations within 35 km take precedence over numerical models; unmonitored locations honestly return regional model estimates (`data_type = 'modelled'`) or `Unavailable`. Discrepancies exceeding safety thresholds (±3.0°C temp, ±15% RH, ±8 km/h wind) are flagged in telemetry metadata without uncalibrated averaging.
- **Request Cancellation & Caching:** Frontend cancels obsolete in-flight requests on location change via `AbortController`; backend partitions cache keys by 2 km spatial cells with request coalescing mutex locks.

### 2.7. Hierarchical Spatial Intelligence & 5-Tier Cartography
- **Lag-Free Map Navigation:** Decouples marker viewport evaluations from high-frequency zoom events by utilizing Google Maps `'idle'` event listeners and direct differential marker rendering (`renderMarkersRef`), eliminating UI thread frame drops and continuous React component re-mounting.
- **Permanent Removal of Floating Legend:** Eliminated redundant floating `0–500` concentration legend scale to maximize interactive map canvas space.
- **5-Tier Geographic Hierarchy:**
  - *Tier 1 (Zoom <= 3):* Global country overview (`GLOBAL_COUNTRIES`) with flags, min/max/average AQI.
  - *Tier 2 (Zoom 4–8):* National overview with 16 major Indian metro hubs.
  - *Tier 3 (Zoom 8–10):* Regional district boundaries (`REGIONAL_DISTRICTS`) with aggregated AQI telemetry.
  - *Tier 4 (Zoom 11–13):* Local clustered stations with spherical Mercator clustering (`radiusPx: 55`) preventing visual overlap.
  - *Tier 5 (Zoom > 13):* Individual ground monitoring stations with high-contrast numeric AQI badges and station name pills.
- **Zero-Substitution Geographic Integrity:** Strict non-Delhi isolation; offline-capable district resolution with real coordinates and authentic data provenance (`observed`, `aggregated`, `modelled`).

---

## 3. Feature Implementation Status & Evidence Matrix

Every feature is classified per the project Evidence Model:

| Feature | Classification | Source & Verification Evidence |
|---|---|---|
| **CPCB NAQI Deterministic Calculation** | **VERIFIED** | Unit tested in `backend/tests/test_aqi_breakpoints.py` and `test_aqi_verdict.py` (all passing). |
| **Persona Risk Verdict Engine** | **VERIFIED** | Validated across 5 personas with strict test coverage (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`). |
| **Dual Map Engine (Google + SVG Vector)** | **VERIFIED** | Tested in frontend test suite and live Amplify deployment; vector fallback verified offline. |
| **NASA FIRMS Satellite Thermal Hotspots** | **VERIFIED** | Ingestion pipeline unit tested in `backend/tests/test_air_sources.py`; live ingestion verified on AWS Lambda. |
| **Ask Arise Rule-Based AI Fallback** | **VERIFIED** | Verified sub-second response times and circuit breaker activation in `backend/tests/test_f1_requirements.py`. |
| **AWS Serverless Production Deployment** | **REPORTED (HISTORICAL PASS)** | Deployed to AWS on 2026-10-11 per `docs/AWS_DEPLOYMENT_REPORT.md` (Amplify, API Gateway, Lambda, DynamoDB, Secrets Manager). Current local cloud management is **BLOCKED** pending AWS SSO session refresh (`Token has expired and refresh failed`). |
| **Global Weather & Coordinate Upgrade** | **VERIFIED (LOCAL WORKSPACE)** | Implemented in working directory (`backend/app/sources/weather.py`, `frontend/src/utils/timeContext.js`) with 100% passing tests in `backend/tests/test_global_weather_upgrade.py`. |
| **Commute Intelligence (Milestone 1: Real Routes & Geometry)** | **VERIFIED (LOCAL WORKSPACE & LIVE UPSTREAM)** | Implemented with OpenRouteService adapter (`backend/app/sources/openrouteservice.py`), route service with caching (`backend/app/services/route.py`), validated API endpoint (`backend/app/api/routes/route.py`), reverse commute direction flip, prompt for unconfigured locations, map cleanup, frontend client & tests (`fetchRoute`), `CommuteRouteCard.jsx`, and `AirMap.jsx` polyline rendering. 18 unit tests in `backend/tests/test_route_service.py` passing. |
| **Commute Intelligence (Milestone 2: Weather Along Route)** | **VERIFIED (LOCAL WORKSPACE & LIVE UPSTREAM)** | Implemented waypoint sampling (`sample_route_waypoints`), Open-Meteo weather along route integration (`get_route_weather`), fog/rain hazard detection, deterministic corridor advisories, zero-fabrication degraded responses, `CommuteRouteCard.jsx` weather corridor strip, and `AirMap.jsx` interactive waypoint markers. 11 unit tests in `backend/tests/test_route_weather.py` passing. |
| **Commute Intelligence (Milestone 3: Pollution Exposure Along Route)** | **VERIFIED (LOCAL WORKSPACE & LIVE UPSTREAM)** | Implemented route air quality sampling (`get_route_pollution`), CAMS model provider integration (`OpenMeteoWeatherProvider.get_current_air_quality`), observed/modelled/unavailable provenance classification, zero fabrication on missing telemetry, non-Delhi isolation, corridor aggregation & advisory, roadside microclimate disclaimer, CommuteRouteCard air quality strip, and AirMap enriched InfoWindows. 9 unit tests in `backend/tests/test_route_pollution.py` passing (223 total backend tests passing); 45 frontend tests passing; production build verified. |
| **Pan-India Environmental Data Fusion & Adapters** | **VERIFIED (LOCAL WORKSPACE)** | Implemented multi-provider fusion engine (`backend/app/services/fusion.py`), OpenWeather adapter (`openweather.py`), and Tomorrow.io adapter (`tomorrow.py`) with 12 unit tests passing in `backend/tests/test_pan_india_fusion.py`. |
| **Dynamic Maps & Canonical Location System** | **VERIFIED (LOCAL WORKSPACE)** | Implemented canonical location state (`frontend/src/utils/locationState.js`), dynamic map centering, scoped NCR overlays, and abortable client requests with 5 frontend unit tests passing in `locationState.test.js` (50 total frontend tests passing). |
| **Spatial Cell Caching & Request Coalescing** | **VERIFIED (LOCAL WORKSPACE)** | Implemented 2 km spatial cell hashing and mutex lock preventing cache stampedes in `backend/tests/test_pan_india_caching.py` (3 tests passing). |
| **Address UX Refactoring & Dynamic Profile Telemetry** | **VERIFIED (LOCAL WORKSPACE)** | Removed manual lat/lon inputs; added smart `AddressInput.jsx` autocomplete, granular `reverseGeocodeDetailed`, dynamic profile location switching in `App.jsx`, and 58 passing frontend unit tests. |
| **Persistent Conversations (ChatGPT-style)** | **VERIFIED (LOCAL WORKSPACE)** | Implemented authenticated server-side conversation persistence with DynamoDB backend (`conversations.py`), responsive collapsible sidebar, auto-titling, search, pinning, archiving, and deletion with full user isolation. 11 unit tests in `test_conversations_memories.py` passing. |
| **User-Controlled Long-Term Memory System** | **VERIFIED (LOCAL WORKSPACE & BROWSER)** | Implemented structured memory service (`memories.py`) with secret scrubbing (API keys, JWTs), sensitive health consent requirements (`pending_approval`), conflict detection, deduplication, address door number redaction, `MemoryManagerModal.jsx` user controls, robust bounded array slicing, active query cache-bypassing, and non-medical disclaimers. 24 unit and regression tests in `test_conversations_memories.py` passing and verified via browser subagent. |
| **Multi-Stage Intelligence Pipeline** | **VERIFIED (LOCAL WORKSPACE)** | Implemented 5-stage pipeline (`router.py`, `retriever.py`, `assembler.py`, `evaluator.py`, `orchestrator.py`) with structured planning, selective telemetry retrieval, prompt budgeting, independent Stage D safety evaluation, and conditional revision. 8 unit tests in `test_intelligence_pipeline.py` passing. |
| **Hierarchical Spatial Intelligence & 5-Tier Map Drill-Down** | **VERIFIED (LOCAL WORKSPACE & BROWSER)** | Implemented 5-tier drill-down (Global, National, Regional, Local Clustered, Ground Stations), Google Maps `'idle'` event listener decoupling, direct viewport-bounds marker rendering, spherical Mercator station clustering, permanent removal of floating 0-500 legend, and offline regional district resolution. 6 unit tests in `AirMapPerformanceAndDrilldown.test.js`, 156 passing frontend tests, 29 passing geographic contract tests, and Puppeteer gesture benchmark (316ms/cycle) verified. |
| **Amazon Bedrock Nova Lite (`us.amazon.nova-lite-v1:0`)** | **BLOCKED** | Model profile active, but live invocation returns `ValidationException: Error 002: Access to Bedrock models is not allowed for this account`. Fallback to rule engine is verified. |
| **Native Mobile App (iOS / Android)** | **PLANNED** | Not currently started; web application is fully responsive across mobile viewports (320px–428px). |
| **Push Notification Alerting** | **PLANNED** | Scheduled for future release once user notification preferences are finalized. |

---

## 4. Explicitly Rejected or Deferred Product Decisions

1. **AI Override of Environmental Science (REJECTED):**
   - *Decision:* Generative AI models must never calculate AQI or override deterministic verdicts.
   - *Rationale:* LLMs suffer from numeric hallucination; human safety requires deterministic scientific calculations based on CPCB formulations.
2. **Hardcoded Delhi Fallbacks for Global Locations (REJECTED):**
   - *Decision:* When users query non-Delhi coordinates, the system must never silently serve Delhi weather.
   - *Rationale:* Delivering misleading meteorological conditions violates safety and transparency principles.
3. **Unbounded Out-of-Scope Chat (REJECTED):**
   - *Decision:* Queries unrelated to air quality, weather, or health precautions are rejected with a structured guardrail response.
   - *Rationale:* Keeps the platform focused on high-stakes atmospheric decisions and eliminates off-topic API token waste.
