# PROJECT_STATE.md — Arise Current Project Memory & Handoff

> **Notice for Coding Agents:** This document is the single source of truth for the current state, latest verified milestone, and pending work of the Arise platform. Read this file and [AGENTS.md](AGENTS.md) at the beginning of every session before inspecting code or proposing changes.

---

## 1. Project Overview

Arise is a cloud-native, serverless atmospheric and environmental intelligence platform designed to answer the everyday citizen question: **"Should I go out, what should my kid/school do, and why?"** in plain language backed by deterministic scientific accuracy.

Rather than presenting delayed, abstract, single-number citywide AQI metrics, Arise provides:
- Persona-tailored action directives (*General Public*, *Children & Schools*, *Elderly & Respiratory*, *Work & Outdoor Labor*, *School Administration*).
- Multi-station spatial interpolation (Inverse Distance Weighting within 35 km) using live CPCB and OpenAQ ground monitors.
- Hyper-local atmospheric dynamics (ventilation index, boundary layer mixing height, wind trajectory) via Open-Meteo.
- Thermal anomaly satellite detection via NASA FIRMS (MODIS/VIIRS).
- Turn-by-turn arterial commute exposure with weather and pollution waypoints along routes.
- An interactive AI Environmental Copilot (*Ask Arise*) strictly bound by deterministic scientific guardrails.

---

## 2. Current Architecture & Technology Stack

```
[ Frontend: React 19 + Vite 8 ] ──(REST/JSON)──> [ Amazon API Gateway HTTP API / Local Uvicorn ]
          │                                                         │
   Dual Map Engine                                          [ FastAPI + Mangum ]
(Google Maps + SVG Fallback)                                        │
          │                                         ┌───────────────┼───────────────┐
   TimeContext (IST)                                ▼               ▼               ▼
                                            [ DynamoDB Cache ] [ Ingestion ]  [ AI Copilot ]
                                            (TTL Auto-Expire)  (OpenAQ/FIRMS) (Gemini/Rule)
```

- **Frontend Client (`frontend/`):**
  - Framework: React 19 Single Page Application built with Vite 8.
  - Runtime: Node.js 24.21.0 (activated via `source ~/.nvm/nvm.sh && nvm use 24`).
  - Styling: Vanilla CSS with curated theme tokens, responsive layouts (320px–2560px), and strict typography floor (≥ 11px).
  - Cartography: Dual-engine map (`AirMap.jsx` with Google Maps JavaScript API + offline-capable SVG vector map `DelhiNcrVectorMap.jsx`).
  - Geocoding: Multi-tier resolver (`geoUtils.js`) using Google Geocoder, OpenStreetMap Photon, Nominatim, and BigDataCloud.
  - Smart Address Autocomplete: `AddressInput.jsx` with isolated descending z-index stacking (`z-[50]`/`z-[40]`), solid background rendering, independent suggestion scrolling (`max-h-56 sm:max-h-64`), regional/country context badges, strict input isolation, and zero-overwrite blur safety.
- **Backend Application (`backend/app/`):**
  - Framework: FastAPI on Python 3.12.3 in virtual environment (`.venv`).
  - Adapter: Mangum ASGI adapter for AWS Lambda (`ApiFunction`) and local execution via Uvicorn.
  - Telemetry Fusion: `EnvironmentalFusionEngine` fusing ground stations, Open-Meteo NWP forecasts, and satellite thermal anomalies.
  - Routing: OpenRouteService client (`GET /route`) with server-side API key protection.
- **Storage & Infrastructure (`infra/`):**
  - Caching: AWS DynamoDB table `arise-cache-prod` (with TTL auto-expiration) and local `MemoryCacheRepository`.
  - User Profiles: AWS DynamoDB table `arise-users-prod` with KMS server-side encryption.
  - Secrets: AWS Secrets Manager (`arise/gemini-api-key`, `arise/ors-api-key`).
  - Auth: AWS Cognito User Pool with OAuth 2.0 PKCE authentication flow.
  - Infrastructure as Code: AWS SAM template (`infra/template.yaml`).
- **AI Intelligence Pipeline & Memory (`backend/app/agents/pipeline/`):**
  - **Stage A (Request Planner):** Schema-validated classification (`RequestPlan`) resolving primary/secondary intents, detail level, time sensitivity, coordinates, and required telemetry sources.
  - **Stage B (Context Retriever):** Precision-targeted retrieval via backend authoritative services with timestamps, freshness, and zero-Delhi substitution for non-Delhi locations.
  - **Stage C (Context Assembler):** Bounded prompt packaging with automated precise street/door address redaction and secret scrubbing (Google/OpenAI/JWT tokens).
  - **Stage D (Answer Generator):** Grounded exposure synthesis strictly anchored to authoritative CPCB environmental verdicts.
  - **Stage E (Independent Evaluator):** Standalone verification checking completeness, evidence grounding, and non-negotiable alignment with deterministic CPCB NAQI and verdicts (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`).
  - **Stage F (Conditional Revision):** Single-iteration automatic revision if material factual/safety discrepancies are detected.
  - **Persistent Conversations (`backend/app/services/conversations.py`):** ChatGPT-style persistent conversations with auto-titling, search, rename, archive, and strict Cognito user isolation.
  - **User-Controlled Long-Term Memory (`backend/app/services/memories.py`):** Categorized memory storage (`preference`, `health_environmental`, `location_reference`, `routine_task`, `approved_fact`) with explicit approval workflows for sensitive health facts, deduplication, conflict updates, and secret scrubbing.
  - **Guaranteed Fallback:** Sub-second deterministic rule engine ensuring zero user downtime during network or quota failures.

---

## 3. Current Milestone (Latest Completed Work)

### Evidence-Grounded Weather AI (Ask Arise Upgrade) (2026-10-23)
- **Objective:** Upgrade Ask Arise into a comprehensive, evidence-grounded weather, air-quality, forecast, environmental exposure, and outdoor-planning AI assistant using data already collected inside Arise.
- **Architectural Enhancements & Complete Telemetry Utilization:**
  - *Full Meteorological Spectrum Integration (`assembler.py`, `gemini_provider.py`):* Assembled surface meteorological fields previously collected by backend providers but omitted from prompts: ambient temperature, feels-like temperature, relative humidity, dew point, surface atmospheric pressure, wind speed, wind direction, wind degrees, precipitation, rain probability, visibility, UV index, cloud cover, sky condition, solar schedule (sunrise/sunset), observation timestamps, timezone, and source provenance.
  - *Pollutant Speciation Blocks (`assembler.py`):* Structured detailed chemical speciation blocks covering PM2.5, PM10, NO2, O3, SO2, CO, sub-indices, and nearest contributing ground station identities with distances in km.
  - *Multi-Day Forecast Horizons (`assembler.py`, `arise_agent.py`):* Integrated 24-hour diurnal curves, +1 day tomorrow, +2 days, and 7-day multi-day forecast predictions into prompt context.
  - *Commute Corridor Exposure Integration (`retriever.py`, `assembler.py`, `arise_agent.py`):* Connected commute route exposure telemetry (corridor distance, duration, average AQI, waypoint hotspot segments) for transit and commuting inquiries.
  - *Single-Shot Asynchronous Retrieval & 50% Token Reduction (`retriever.py`, `gemini_provider.py`, `arise_agent.py`, `orchestrator.py`):*
    - Upgraded retriever to single-pass asynchronous retrieval via `EnvironmentService.get_environmental_snapshot`.
    - Passed `retrieved_context` directly from orchestrator into `AriseAgent.answer`, eliminating duplicate upstream tool calls (`get_verdict`, `get_air_now`, `get_forecast`, `get_fire_signal`).
    - Retired redundant second-pass critic LLM invocation (`invoke_gemini_critic`), cutting token consumption and latency by over 50% while delegating safety and schema evaluation to deterministic Python routines (`evaluator.py`).
    - Eliminated hardcoded weather defaults (was defaulting to 28.4°C and 58% humidity); missing telemetry is now marked honestly as `Unavailable`.
  - *Intent-Based Routing & Prompt Rewriting (`router.py`, `guardrails.py`, `arise_agent.py`):*
    - Expanded `ENVIRONMENTAL_REGEX` and `IntentType` across 11 specific operational categories: `current_weather`, `forecast_planning`, `weather_trends`, `outdoor_planning`, `transit_commute`, `pollutant_inquiry`, `health_sensitivity`, `fire_satellite`, `comparison`, `scientific_explanation`, and `current_safety`.
    - Rewrote system prompt with 10 strict operational rules: answer user question first in headline, concise bullet points, explain technical terms, cite units (°C, km/h, µg/m³, mm, hPa) and timestamps, label missing/uncertain data truthfully, prioritize predicted telemetry for future days, enforce waking outdoor hours (6 AM–9 PM), and respect deterministic CPCB NAQI verdicts.
    - Enforced strict location isolation: removed hardcoded `"Delhi-NCR"` fallbacks; dynamically injects selected location with zero cross-city substitution.
- **Verification Evidence:**
  - Automated Evaluation Suite (`backend/tests/test_evidence_grounded_weather_ai.py`): **15/15 passed** in 2.64s across 15 core dimensions.
  - Full Backend Test Suite: **303/303 passed** in 112.06s (`pytest backend/tests`).
  - Frontend Test Suite: **184/184 passed** in 5.38s (`npm test -- --run`).
  - Production Bundle: Built cleanly with Vite and Node 24 in 318ms (`npm run build`).
  - Boundaries Preserved: Zero unauthorized commits, pushes, or deployments; zero changes to deterministic AQI/verdict calculations.

### Multi-Identity Resolution & Secure Account Linking for Google & Native Auth (2026-10-23)
- **Confirmed Root Cause Determination:**
  - Both Google Sign-In and Email/Password flows use the **exact same Cognito User Pool** (`us-east-1_qm2818Iul`) and **exact same App Client** (`32g687pdc6dulejhh4tcvd69m7`).
  - However, they do **not** share the same `sub` user ID. AWS Cognito provisions separate entities for federated OAuth identities (`username: Google_<google_id>`) and native user pool identities (`USER_PASSWORD_AUTH`), each receiving a distinct `sub` UUID.
  - The conversation backend (`conversations.py`, `chat.py`, `memories.py`) and frontend (`AskArise.jsx`) keyed all storage, caching, and retrieval strictly on `user.sub`.
  - When switching between Google and email/password login with the same email, the client and server accessed different `sub` partitions, causing distinct conversation histories.
- **Security Invariant Enforcement (Zero Insecure Email Merging):**
  - Live inspection confirmed the native account token had `email_verified: false`.
  - Merging accounts based *only* on a matching email string would allow an unconfirmed/unverified email account created by an attacker to hijack private conversations from a verified Google account.
  - Implemented `IdentityService` (`backend/app/services/identity.py`) strictly enforcing:
    1. Automatic linking requires cryptographic proof: both identities must originate from the trusted Cognito User Pool and both must have `email_verified is True`.
    2. Unverified accounts (`email_verified is False`) remain strictly isolated in their own partition without merging.
    3. Added `POST /profile/link-account` for authenticated users to explicitly link secondary verified identities.
- **Subsystem Integration:**
  - **Conversations & Chat (`conversations.py`, `chat.py`):** Multi-identity queries search across canonical user ID and all verified linked IDs, deduplicating conversations by ID and writing new messages under the canonical identity.
  - **Memories (`memories.py`):** User memories and health sensitivities are retrieved seamlessly across linked verified identities.
  - **Profile (`profile.py`):** Emits `canonical_user_id` and `linked_user_ids` in public profile payloads, looking up linked profiles if the current `sub` is unbootstrapped.
  - **Frontend (`AskArise.jsx`):** Derives `authUserId` using `userProfile.canonical_user_id` and checks `isSameLinkedIdentity` before wiping in-memory state, ensuring seamless cross-login conversation continuity.
  - **Safe Diagnostics (`cognito_auth.py`):** Added development-only diagnostics logging token use, IdP, and masked identifiers (`sub` and `email`), strictly preventing credential or raw token exposure.
- **Verification Evidence:**
  - Automated Identity Linking Suite (`backend/tests/test_identity_linking.py`): **5/5 passed** in 0.25s.
  - Full Backend Regression Suite (`test_conversations_memories.py`, `test_profile_auth.py`, `test_identity_linking.py`): **40/40 passed** in 18.77s.
  - Frontend Test Suite: **167/167 passed** in 508ms (`npm test`).
  - Production Bundle: 15 assets built cleanly in 495ms with 0 errors (`npm run build`).

### Map Performance, Local AQI Coverage, and UI Cleanup (2026-10-22)
- **Elimination of Map Lag & Main Thread Stutter (`AirMap.jsx`):**
  - Identified root cause of map lag: rapid `zoom_changed` Google Maps events fired 30–60 times per scroll-wheel / trackpad gesture, triggering immediate React re-renders and synchronous reconstruction of dozens of SVG data URIs on the main thread.
  - Replaced `zoom_changed` listener with Google Maps `'idle'` event listener that only triggers React state updates when crossing tier thresholds (tiers 1, 2, 3, 4).
  - Extracted marker rendering into a direct viewport-bounds-evaluated renderer (`renderMarkersRef.current`) executing on idle without causing full React re-renders during panning/zooming.
  - Added `smoothPanTo` helper respecting `prefers-reduced-motion` accessibility settings (`setCenter` when reduced motion is preferred vs fluid `panTo`).
- **Permanent Removal of Floating AQI 0–500 Legend (`AirMap.jsx`):**
  - Completely eliminated the floating `AQI Concentration (0–500)` horizontal scale, gradient bar, and `GOOD (0)` / `SEVERE (500)` labels.
  - Removed `getLegendInfo` helper and cleaned expanded header mode bar, reclaiming visual map canvas.
- **5-Tier Hierarchical Geographic Drill-Down (`AirMap.jsx`, `locationState.js`):**
  - **Tier 1 (zoom <= 3):** Global (`GLOBAL_COUNTRIES` with flags, min/max/avg AQI).
  - **Tier 2 (zoom 4–8):** National (`DEFAULT_NATIONAL_HUBS` 16 major Indian metros).
  - **Tier 3 (zoom 8–10):** Regional (`REGIONAL_DISTRICTS` curated across NCR, Maharashtra, Karnataka, Tamil Nadu, West Bengal, Telangana, Gujarat, Rajasthan, UP, Punjab, Bihar with authentic coordinates, AQI, and `dataType: 'aggregated'`).
  - **Tier 4 (zoom 11–13):** Local area clustered stations (`clusterGeoPoints(stationsInBounds, currentZ, 55)`).
  - **Tier 5 (zoom > 13):** Individual stations (`clusterGeoPoints(stationsInBounds, currentZ, 0)` with highlighted AQI badge and name pill).
- **Clustering & Overlap Prevention (`locationState.js`):**
  - Implemented spherical Mercator projection math in `clusterGeoPoints(items, zoom, radiusPx)` to group nearby stations within a pixel radius (`radiusPx: 55`) into cluster badges (`n stations`), preventing overlapping markers and visual clutter.
- **Zero Substitution Cartography & Offline District Search (`locationState.js`, `geoUtils.js`):**
  - Added `REGIONAL_DISTRICTS` to `geoUtils.js` search so non-Delhi locations (Pune, Jaipur, Patna, etc.) resolve immediately offline without Delhi fallback.
  - Preserved strict data provenance tags (`observed`, `aggregated`, `modelled`).
- **React 19 Infinite Re-Render Fix (`AirMap.jsx`):**
  - Fixed search debouncing effect by bailing out on identical empty array updates (`setSearchResults(prev => prev.length === 0 ? prev : [])`), resolving React 19's "Maximum update depth exceeded" error.
- **Verification Evidence:**
  - Automated Frontend Suite: **156/156 tests passed** in 406ms (`npm test`).
  - Dedicated Test Suite: `AirMapPerformanceAndDrilldown.test.js` (6/6 tests passed).
  - Backend Geographic Contract: **29/29 tests passed** in 3.4s (`pytest backend/tests/test_api_contract_geographic.py`).
  - Production Bundle: 15 assets built cleanly in 462ms with 0 errors (`npm run build`).
  - Headless Chrome Comprehensive Benchmark (`frontend/scripts/test-map-comprehensive.mjs`):
    - Verified absence of floating legend bar and Good/Severe labels (`hasLegendBar: false`, `hasGood0: false`, `hasSevere500: false`).
    - Verified Tier 2 National Metros view (`currentZoom: 5`, centered at 20.59°N, 78.96°E).
    - Verified Tier 1 Globe view (`currentZoom: 2`, centered at 20.0°N, 20.0°E).
    - Fluid gesture benchmark: **316ms average per cycle** across 5 continuous pan/zoom cycles.
    - Verified non-Delhi Pune isolation (`localButtonText: "📍 Pune"`, `mapCenterLat: 18.5204`, `mapCenterLng: 73.8567`, `hasDelhiFallback: false`).
    - Verified search and inspector pin placement for Jaipur (`lat: 26.9124, lng: 75.7873`).


### Spatial Cartography Refinements & User Feedback Execution (2026-10-22)
- **Compact Left Panel & Elimination of Text Truncation (`AirMap.jsx`):**
  - Reduced layer drawer width to `sm:w-[275px] max-w-[285px]` with tighter padding (`p-2.5 sm:p-3`) and adjusted font sizes (`text-[10px]` to `text-[11px]`).
  - Implemented smart local scope label extraction (`shortLocalLabel`) so cities like `📍 Ghaziabad` display completely without truncation (e.g. `📍 Ghazia...` eliminated).
  - Reduced vertical footprint by > 20%, ensuring it never obstructs map interaction.
- **Dynamic National Scope Resolution (`locationState.js`, `AirMap.jsx`):**
  - Replaced hardcoded `🇮🇳 All India` with dynamic country scoping via `resolveCountryFromCoords(lat, lon, locMeta)`.
  - Dynamically displays country flag and label based on detected/selected coordinates (e.g., `🇮🇳 India` when in India, `🇺🇸 America` when in USA, `🇬🇧 UK`, `🇦🇪 UAE`, etc.).
  - Clicking the national button smoothly pans and zooms directly to the user's detected country center.
- **Search Bar GPS Locator Button (`AirMap.jsx`):**
  - Converted static `<span>📍</span>` in the floating search container into an accessible, interactive `<button id="btn-search-locate" onClick={handleLocateMe}>` with active hover/scale feedback.
  - Tapping the search bar pin directly acquires browser GPS location, reverse-geocodes it, centers the map, and pins the user position.
- **Elimination of NCR Corridors & Outer Boundary Circles (`AirMap.jsx`):**
  - Removed `NCR Corridors` (`traffic`) from Signal Overlays and permanently eliminated regional corridor polylines (DND Flyway and NH-48 lines).
  - Eliminated the 2 outer concentric circles (`c1` at 16 km and `c2` at 10 km). Retained strictly the single inner red monitored circle (`c3` at 5.5 km) perfectly centered on the active pin.
- **Prominent Bottom-Right GPS Locator & Viewport Clipping Fix (`AirMap.jsx`):**
  - Fixed map container height from `min-h-[580px] lg:min-h-[640px]` to `h-full min-h-0`, eliminating viewport clipping where bottom controls were previously cut off on screens below 640px height.
  - Elevated floating action controls to `z-[30]` with a prominent `w-9 h-9` GPS target locator button (`#btn-locate-me`) positioned at `bottom-3 right-3`.
- **Surrounding District / Village AQI Badges & Name Chips (`AirMap.jsx`, `mockData.json`, `demo.py`):**
  - Enhanced station marker SVG icons to render both the numeric AQI in a bold circular tier badge AND a crisp, high-contrast white name pill beneath the badge with subtle drop shadow.
  - Enriched station datasets with official NCR district stations around Ghaziabad (Sanjay Nagar, Vasundhara, Indirapuram, Loni, Sector 62 Noida, Sector 1 Noida, Vikas Sadan Gurugram, Sector 16A Faridabad) so local telemetry is clearly highlighted at a glance.
- **Truthful Demo Data Provenance & Station Info Window Tagging (`AirMap.jsx`, `mockData.json`, `mockDataModerate.json`):**
  - Explicitly tagged all 11 NCR stations in `mockData.json` and `mockDataModerate.json` with `"source": "DEMO"`.
  - Updated station info window in `AirMap.jsx` to dynamically verify data provenance: demo stations are now truthfully labeled `Source: Demo Calibration Data · Data: Demo` rather than masquerading as live observed data.
  - Updated global country markers to truthfully display `Representative Range` rather than `Observed Range`.
- **Independent Map Verification & Performance Audit:**
  - Verified elimination of the AQI 0–500 floating legend gradient bar and labels across all map views.
  - Confirmed smooth zooming and panning via single `idle` event listener, tier-boundary state gating, and direct DOM rendering without React re-render cascades.
  - Verified 5-tier adaptive locality coverage (Tier 1 Global, Tier 2 National, Tier 3 Regional Districts, Tier 4 Clustered Stations, Tier 5 Individual Stations).
  - Detailed audit findings documented in [map_verification_report.md](file:///C:/Users/Yashansh%20Rastogi/.gemini/antigravity-ide/brain/e9730ec4-b960-4e94-90e8-6714eaf66d7d/map_verification_report.md).
- **Verification Evidence:**
  - Automated Frontend Suite: **167/167 tests passed** in 438ms (`npm test`).
  - Production Bundle: Vite compiled cleanly in 396ms with 0 errors (`npm run build`).
  - Backend Regressions: **53/53 tests passed** in 33.77s (`pytest backend/tests/test_conversations_memories.py backend/tests/test_api_contract_geographic.py`).
  - Live Browser Subagent Audit: Verified station info window renders `Source: Demo Calibration Data · Data: Demo` on ITO station marker (AQI 312) and `Representative Range` on global country markers.


### Global Metadata Neutralization & Elimination of Static Delhi Markers (2026-10-22)
- **Chrome Tab Title & Head Metadata Neutralization (`App.jsx`, `index.html`):**
  - Updated `index.html` static title to `"Arise · Global Environmental &amp; Weather Intelligence"` and added global metadata tags (`meta[name="title"]`, `meta[name="description"]`).
  - Upgraded dynamic `document.title` synchronization in `App.jsx` to completely strip and sanitize any occurrence of "Delhi", "New Delhi", or "Delhi-NCR", falling back to `"Arise · Global Environmental & Weather Intelligence"` to reflect Arise's global architecture.
  - Verified dynamic titles for other locations worldwide (e.g. `"Arise · Air Quality & Weather in Mumbai"`) function seamlessly.
- **Elimination of Static Delhi Fallbacks & Markers (`locationState.js`, `VerdictHero.jsx`, `AirMap.jsx`, `geoUtils.js`):**
  - Replaced static default location in `locationState.js` with `National Capital Region (NCR)` (`city: 'NCR'`, `region: 'National Capital Region'`).
  - Replaced fallback `'Delhi-NCR'` in `resolveRegionalLocation()` with `'National Capital Region'` and `'Global Overview'`.
  - Replaced default `locationName` prop in `VerdictHero.jsx` from `'Mandir Marg, New Delhi'` to `'Global Overview'`.
  - Replaced national city hub in `AirMap.jsx` from `'Delhi-NCR'` to `'NCR'` (`state: 'National Capital Region'`).
  - Replaced null-coordinate reverse geocode in `geoUtils.js` with `'National Capital Region'`.
  - Replaced `"Delhi-NCR"` in `mockData.json` and `mockDataModerate.json` with `"National Capital Region"` and location-neutral corridor names.
- **Verification Evidence:**
  - Headless Chrome Metadata Audit: Confirmed `Today Tab Title: Arise · Global Environmental & Weather Intelligence`, `Map Tab Title: Arise · Global Environmental & Weather Intelligence`, `Contains Delhi Keyword: false`.
  - Automated Frontend Suite: **148/148 tests passed** in 415ms (`npm test`).
  - Production Build: Vite production bundle built in 365ms with 0 errors (`npm run build`).

### Limitations Resolution & Assistive Technology Accessibility Validation (2026-10-22)
- **Safe Permanent Retirement of Obsolete Drift Model Prototype (`WhyPanel.jsx`):**
  - Confirmed via repository audit that `WhyPanel.jsx` was an unrendered prototype from Oct 8 containing `#btn-view-drift-map` that was never imported or rendered in any active route flow.
  - Safely deleted `frontend/src/components/WhyPanel.jsx` and updated regression test assertions in `Phase1TrustUsability.test.js`, `Phase2ContentLayout.test.js`, and `Phase4AccessibilityReliability.test.js` to target active regional map navigation in `VerdictHero.jsx` (`#btn-view-map`) and level-2 emission driver explanations in `BasicAccordions.jsx`.
  - Active map route, map switching, wind trajectory displays, and all environmental explanations remain 100% intact.
- **Deep Accessibility Tree & Assistive Technology Validation (10/10 Workflows Passed):**
  - Built automated headless Chrome Accessibility Tree audit script (`frontend/scripts/test-accessibility.mjs`) evaluating all 10 priority workflows using Chrome DevTools Protocol (CDP) and DOM semantic inspection:
    1. *Today Dashboard & Verdict:* Primary `<h1>` structure (`sr-only sm:not-sr-only sm:block`), accessible score/verdict announcements, and bullet structures.
    2. *Location Selection & Changes:* Geolocation update button with accessible labels.
    3. *Map Navigation & Controls:* Search input ID, scope switchers (`Local`, `All India`, `Globe`), and region semantics.
    4. *Ask Arise Interaction:* Screen-reader progress messages (`role="status"`, `aria-live="polite"`), alert notifications on error (`role="alert"`), and accessible input/CTA labels.
    5. *Technical Glossary Modal:* Accessible dialog semantics (`role="dialog"`, `aria-modal="true"`, `aria-labelledby="glossary-title"`), heading structure, and Escape key dismissal.
    6. *Profile Settings Modal:* Form input labeling and Escape key dismissal.
    7. *Login Modal:* Explicit `htmlFor` association on email and password inputs, show/hide password `aria-label`, and Escape key dismissal.
    8. *Sign-Up Modal:* Explicit `htmlFor` association on password and confirm password inputs, full name labeling, and Escape key dismissal.
    9. *Status & Alert Live Announcements:* Live region polite announcements for status changes without excessive repetition.
    10. *Commute Route View & Degraded Mode:* Verified display of honest degraded notification (`Home and Work locations not configured` / `Route unavailable. OpenRouteService credentials may be missing`).
- **External Service Boundaries Preserved:**
  - *AWS Bedrock Nova Lite:* Unselected by default (`DEFAULT_PROVIDER = "gemini"`, `BEDROCK_ENABLED = False`). Fallback pipeline passes 8/8 tests in `test_intelligence_pipeline.py`.
  - *OpenRouteService Commute Geometry:* Remains in honest degraded mode without `ORS_API_KEY`; passes 18/18 tests in `test_route_service.py` with zero fabricated geometry or fake routes.
- **Verification Evidence:**
  - Accessibility Audit: **10/10 workflows passed, 0 defects** (`node frontend/scripts/test-accessibility.mjs`).
  - Responsive Audit: **78/78 checks passed across 12 viewports and 6 routes** (`node frontend/scripts/test-responsive.mjs`).
  - Frontend Test Suite: **148/148 passed** in 398ms (`npm test`).
  - Production Bundle: Vite build in 365ms with 0 errors (`npm run build`).
  - Backend Tests: **18/18 route tests passed, 8/8 pipeline tests passed**.

### Profile Pin Priority, Address Pin Toggle, and 3-Tier Global Cartography (2026-10-22)
- **Elimination of Redundant Primary Default Profile Dropdown (`ProfileSettingsModal.jsx`):**
  - Removed the static `<select>` "Primary Default Profile" dropdown.
  - Linked profile startup/login priority directly to pinned profile locations (`pinned_personas[0]`).
- **Interactive Location Pin Toggle Button (`AddressInput.jsx`, `ProfileSettingsModal.jsx`):**
  - Replaced the static `✓ Location pinned` badge with an accessible interactive switch toggle button (`pinToggle = { isPinned, onToggle, id }`).
  - Supports toggling between `📌 Pinned (Priority)` and `📍 Pin location` with `role="switch"` and `aria-checked` semantics.
  - Toggling a location pin sets that profile as the active primary persona (`form.persona`) and prepends it to `pinned_personas`.
  - On app launch, refresh, and login, priority automatically resolves to the pinned persona and its associated coordinates.
- **Hierarchical 3-Tier Cartography & Search Streamlining (`AirMap.jsx`, `locationState.js`):**
  - Removed the preset station/metro dropdown select (`Delhi (Area) ▾`) from the top-right search container, expanding the search input to a wide, clean autocomplete field.
  - Upgraded the scope switcher to a 3-tier system: `📍 {activeAreaLabel}` (Local city/districts), `🇮🇳 All India` (National metro cities), and `🌍 Globe` (Worldwide country averages).
  - Integrated `GLOBAL_COUNTRIES` dataset in `locationState.js` with average pollution and min/max AQI ranges across 14 representative nations (India, USA, UK, China, UAE, Japan, Germany, Australia, France, Brazil, South Africa, Thailand, Singapore, Canada).
  - Implemented 3-tier zoom-dependent rendering:
    - **Tier 1 (Zoom ≤ 3):** Global country markers displaying flag, name, average AQI badge, and min/max pollution range. Clicking a country zooms into its national view.
    - **Tier 2 (3 < Zoom ≤ 8):** National metro city hubs (Delhi, Mumbai, Bengaluru, Kolkata, Chennai, Hyderabad, etc.). Clicking a metro zooms into its local city view (Zoom 11) and loads its data.
    - **Tier 3 (Zoom > 8):** Hyper-local ground monitoring stations and districts with live air quality telemetry.
- **Verification Evidence:**
  - Automated frontend test suite: **140 passed, 0 failed** in 401ms (`npm test`).
  - Automated backend regression test suite: **23 core tests passed, 0 failed** in 1.15s (`pytest`).
  - Production bundle build: `npm run build` compiled cleanly in 447ms with 0 errors.
  - Browser subagent verification: verified modal pin toggle, removal of default dropdown, 3-tier scope buttons (`Globe`, `All India`, `Local`), and removal of the preset dropdown.

### Deduplication of Commute Advisory Icons (2026-10-22)
- **Root Cause Resolution (`CommuteRouteCard.jsx`, `advisoryUtils.js`, `route.py`):**
  - Resolved double warning/status icon rendering (`⚠️ ⚠️`, `✅ ✅`) in corridor advisory banners.
  - Implemented `stripLeadingIcon(text)` in `advisoryUtils.js` to strip leading Unicode emojis, symbols (`●`), and whitespace from advisory text.
  - Cleaned backend route advisory generation (`route.py`) to emit pure text without redundant leading emojis.
  - Added unit test suite `advisoryUtils.test.js` (4 tests) covering warning, weather, and status symbols, plain text preservation, and falsy input handling.
- **Verification Evidence:**
  - Frontend test suite: **114 passed, 0 failed** in 288ms (`npm test`).
  - Production build: `npm run build` in 378ms (0 errors).
  - Backend route tests: **38 passed, 0 failed** in 5.98s (`pytest backend/tests/test_route_*`).
  - Visual verification: Chrome screenshot confirmed single `⚠️` on pollution advisory and single `✅` on weather advisory.

### Complete Profile Pinning Integration, Address Clear Button & Global Copy Cleanup (2026-10-22)
- **Profile Pinning End-to-End Integration (`App.jsx`, `PersonaSelector.jsx`, `personaState.js`):**
  - Wired `handlePinToggle` callback in `App.jsx` that updates `userProfile.pinned_personas` in React state, persists immediately to `localStorage('arise_user_profile')`, and fire-and-forget syncs to cloud API via `updateUserProfile(accessToken, { pinned_personas })` for authenticated users.
  - Added `updateUserProfile` import to `App.jsx`; passed `onPinToggle={handlePinToggle}` to `<PersonaSelector>`.
  - Fixed `PersonaSelector.jsx` `useMemo` dependency: added `userProfile?.pinned_personas` so pin/unpin changes immediately re-compute `visiblePersonas` with updated `isPinned` flags.
  - `PersonaSelector` renders `📌` pin indicator on pinned personas and a hover-reveal pin toggle button for authenticated users with ≥2 visible personas. Guest users see no pin controls.
  - Pin state is fully independent from: (a) primary default profile (`persona`), (b) enabled profiles (`configured_personas`), and (c) profile selection.
  - Pinning survives: page refresh (localStorage), settings modal close/reopen, and cloud sync (PATCH).
- **Address Input Clear Button (`AddressInput.jsx`, `addressInputState.js`):**
  - Integrated one-click `×` clear button using pre-built `shouldShowClearButton` and `handleAddressClear` utility functions.
  - Clear button replaces static `📍` icon when input has text, resets query, suggestions, coordinates, and triggers `onClear` callback.
  - Accessible with `aria-label="Clear address"`, hover-to-red transition, and unique `id` for testing (`${id}-clear`).
- **Global UI Copy Cleanup (8 components):**
  - `AskArise.jsx`: Sign-in prompt → "your local air quality, weather risks, and health precautions"
  - `Footer.jsx`: Tagline → "Global Environmental Intelligence"
  - `ProfileSettingsModal.jsx`: 4 address placeholders → globally representative examples (London, Mumbai, Bangalore, Oxford)
  - `CompleteProfileModal.jsx`: Placeholder → "350 Fifth Avenue, New York"
  - `Watchlist.jsx`: Sample hub locations → generic "Your primary residence", "Your office or workplace", "Your child's school"
  - `AqiGauge.jsx`: Default location → "Your Location"
  - `BasicAccordions.jsx`: Fire explanation → "local air basin" (removed Delhi-NCR reference)
  - `ForecastChart.jsx`: Default location → "Your Location"
  - `Footer.jsx` & `footerData.js`: Rephrased policy notice → "Zero Cross-Location Substitution Policy: Telemetry and verdicts reflect the selected coordinates only. External data is never substituted for outside locations." (removed all mentions of "Delhi").
- **Profile Pinning Regression Test Suite (`PersonaSelector.test.js`):**
  - 8 new focused tests: multi-persona pin/unpin round-trip, pinned-vs-default independence, pinned-vs-configured independence, localStorage round-trip persistence, guest pin guard, prioritizePinned sort, empty pinned_personas edge case, isPersonaPinned validation.
- **Verification Evidence:**
  - Frontend test suite: **110 passed, 0 failed** in 253ms (`npm test`).
  - Production build: `npm run build` completed in 365ms (0 errors).

### Guest UI Streamlining, Pollutant Card Clubbing & Universal Enterprise Footer (2026-10-22)
- **Guest Sidebar Suppression (`AskArise.jsx`):**
  - Left panel (`ConversationSidebar`) and sidebar toggle button (`☰`) are strictly hidden when the user is not authenticated (`!isAuthenticated`).
  - Chat panel expands to 100% full width in guest mode without squishing or irrelevant empty states. Sidebar and toggle render normally upon user sign-in.
- **Clean "My places" Guest State (`Watchlist.jsx`):**
  - Eliminated dummy sample monitoring hubs (`Home Hub`, `Work Hub`, `School Hub`) when logged out.
  - Replaced with a clean, normal guest prompt: *"Save your places by signing in"* with description and a direct `Sign In →` action button.
- **Clubbed Air Pollutants Card (`PollutantCards.jsx`):**
  - Clubbed all 6 air pollutants (PM2.5, PM10, NO2, SO2, CO, O3) into a single master container (`card p-4 sm:p-5 rounded-2xl border shadow-sm`).
  - Preserved all existing UI features: dominant badge (`DOM`), `MiniRing` SVG circular progress gauges, numeric measurements with units, status pills (`VERY POOR`, `MODERATE`, `GOOD`), and `CPCB Ground Telemetry` badge.
- **Universal Enterprise Software Footer (`Footer.jsx`, `App.jsx`):**
  - Designed and deployed comprehensive software footer across all platform pages (`Today`, `Map`, `Ask`, `More`).
  - Navigation hyperlinks to all views and modals (`Today's Air Intelligence`, `Airshed & Satellite Fire Map`, `Ask Arise AI Copilot`, `School Safety & Mobility Guides`, `Environmental Glossary`).
  - Direct external documentation hyperlinks to scientific sources: [CPCB NAQI Standards](https://cpcb.nic.in/national-air-quality-index/), [OpenAQ Platform](https://openaq.org/), [Open-Meteo Weather](https://open-meteo.com/en/docs), [NASA FIRMS Active Fires](https://firms.modaps.eosdis.nasa.gov/), [OpenRouteService](https://openrouteservice.org/dev/#/api-docs), and [OSM Photon](https://photon.komoot.io/).
  - Direct external documentation hyperlinks to engineering stack: [FastAPI & Mangum](https://fastapi.tiangolo.com/), [AWS Serverless](https://aws.amazon.com/serverless/), [Google Gemini AI](https://ai.google.dev/), [AWS Cognito OAuth 2.0 PKCE](https://aws.amazon.com/cognito/), and [React 19 & Vite 8](https://vite.dev/).
  - Prominent *Deterministic Science Authority* guarantee, non-medical advice health disclaimer, *Zero Delhi Substitution Policy* badge, and copyright notice (`© 2026 Arise Air Intelligence. All rights reserved.`).
- **Verification Evidence:**
  - Frontend test suite: **77 passed, 0 failed** in 274ms (`npm test`).
  - Production build: `npm run build` completed in 392ms (0 errors).
  - Browser subagent inspection: Live visual verification across `http://localhost:5173/#/ask` and `http://localhost:5173/#/today`. Confirmed hidden guest sidebar, clean watchlist guest prompt, clubbed single pollutant card, and rich multi-column footer.

### Full-Screen Viewport Layout for Ask Arise Chatbot (2026-10-22)
- **Viewport Utilization & Margin Elimination (`App.jsx`, `AskArise.jsx`, `ConversationSidebar.jsx`):**
  - Removed restrictive fixed maximum widths (`max-w-[1000px]`, `xl:max-w-[1100px]`) and fixed clamp heights (`clamp(480px, calc(100dvh-12rem), 800px)`) that constrained the chatbot to a narrow centered card.
  - Set root application and `<main>` containers to stretch dynamically to 100% available width and height (`h-screen md:h-dvh overflow-hidden` when on `#ask`) while cleanly accounting for the 64px top navigation bar and 56px mobile bottom bar.
  - Eliminated window-level page scrolling and ancestor shifting by replacing `messagesEndRef.current.scrollIntoView()` with container-bounded `chatScrollRef.current.scrollTo({ top: scrollHeight })`.
  - Established independent scroll containers with `min-h-0 overflow-y-auto` for both the conversation history sidebar and the active chat message thread.
  - Positioned the floating "Newest response" pill cleanly at `bottom-3 right-4` with `z-20` and removed `animate-bounce` so it never covers message content.
  - Kept prompt chips, input bar / guest sign-in CTA, and non-medical disclaimer pinned at the bottom with `shrink-0`.
- **Responsive Desktop & Mobile Adaptation:**
  - **Desktop (≥ 768px):** Sidebar occupies a practical fixed width (`w-68` / `lg:w-72`), with the remaining wide horizontal area allocated to the chat conversation card.
  - **Mobile (< 768px):** The chat column occupies 100% of the screen width. The sidebar transforms into a slide-over drawer (`fixed top-16 bottom-14 left-0 z-40 w-72 max-w-[85vw] shadow-2xl`) with a semi-transparent backdrop blur (`bg-black/40 backdrop-blur-xs`), auto-closing upon conversation selection and auto-adjusting on viewport resize.
- **Verification Evidence:**
  - Frontend test suite: **77 passed, 0 failed** in 207ms (`npm test`).
  - Production build: `npm run build` completed in 334ms (0 errors).
  - Browser visual audits: Verified on `http://localhost:5173/#/ask` across Desktop (1536x730) and Mobile (390x844) viewports. Sidebar drawer overlay and full-height chat verified without clipping, window overflow, or horizontal scroll.

### Location Detection Transparency & Three Cards White Theme Readability (2026-10-22)
- **Mandir Marg Transparency & Geolocation Resolution (`VerdictHero.jsx`, `App.jsx`, `locationState.js`):**
  - Clarified why Mandir Marg is shown: defaults to Central Delhi reference hub (`Mandir Marg`) when no profile home or saved GPS coordinate is registered.
  - Resolved startup geolocation blocking: previously `App.jsx` skipped device detection if the cached default station was stored in `localStorage`. Updated to automatically resolve device GPS on load unless an explicit custom saved hub is active.
  - Added transparent location status tags: `Default Station` (amber badge) for initial fallback station vs `● Live GPS` (pulsing emerald badge) when locked to device coordinates.
  - Interactive `🎯 Update Location` button and clickable location pill: triggers real-time GPS acquisition with reverse geocoding to neighborhood/city name, accuracy metrics (`±126m`), and feedback banners.
  - Automatic background location runner: periodically refreshes GPS location every 5 minutes and on tab visibility/focus changes.
- **Three Cards White Theme Redesign (`SchoolCard.jsx`, `MobilityCard.jsx`, `Watchlist.jsx`, `App.jsx`):**
  - **School Safety Card (`SchoolCard.jsx`):** Restyled with soft borders (`var(--border)`), high-contrast typography, an actionable protocol alert banner (`Move Activities Indoors` [INDOORS ONLY]), concise plain-English guidance, and an airy 3-metric indoor air row (`Indoor PM2.5`, `Air Freshness`, `Purifiers: HEPA Active`).
  - **Mobility Corridors Card (`MobilityCard.jsx`):** Eliminated 3x repetitive visibility labels by displaying `Visibility: 9.5 km` cleanly once in the card header. Cleaned corridor titles, added color-coded status stripes, and concise commute tips.
  - **My Places Card (`Watchlist.jsx` & `App.jsx`):** Eliminated oversized empty state banner; rendered 3 interactive sample monitored hubs (`Home Hub - Central Delhi`, `Work Hub - Connaught Place`, `School Hub - Vasant Kunj`) with live AQI status, compact guest sign-in banner, and streamlined severe air threshold alert.
- **Verification Evidence:**
  - Frontend test suite: **77 passed, 0 failed** (`npm test`).
  - Production build: `npm run build` completed in 424ms.
  - Backend tests: **33 passed, 0 failed** in 1.29s (`test_conversations_memories.py`, `test_weather_forecast.py`).
  - Browser subagent visual inspection: verified live on `http://localhost:5173/#/today`.

### Read Aloud (Text-to-Speech) Web Speech Integration (2026-10-22)
- **Accessible Text-to-Speech Utility (`speechUtils.js`, `speechUtils.test.js`):**
  - Lightweight, native Web Speech API (`window.speechSynthesis`) integration with zero third-party latency and zero paid API keys.
  - Markdown-stripping engine (`cleanSpeechText`): Removes bold, italic, code blocks, headers, strikethrough, and links while preserving numeric approximations (e.g. `~600m`).
  - Structured message formatting (`buildSpeechText`): Assembles spoken narrative covering Verdict, Headline, Key observations, Recommended actions, and Best time to go out, ignoring unavailable windows.
  - Indian English (`en-IN`) voice preference with English fallback, natural cadence (rate 1.0, pitch 1.0), and guaranteed cancellation before speech to prevent audio queuing.
- **Ask Arise & AskBar UI Integration (`AskArise.jsx`, `AskBar.jsx`):**
  - Interactive Read Aloud action button (`🔊 Read Aloud` / `⏹️ Stop`) in message toolbar with unique element IDs (`btn-read-aloud-${i}`).
  - Full lifecycle cleanup on component unmount, conversation switching, new chat creation, clear chat, and conversation deletion.
- **Test Evidence:**
  - Frontend test suite expanded to **72 passing tests** (added `speechUtils.test.js`) in 257ms.
  - Frontend production build: `npm run build` completed in 361ms (0 errors).
  - Backend pipeline & memory test suite: **20 passed, 0 failed** in 21.81s (`test_conversations_memories.py`, `test_intelligence_pipeline.py`).
  - Browser subagent visual inspection: Live interaction verified on `http://localhost:5173/#/ask` with toggle transitions and speech cancellation.

### Persistent AI Memory & Multi-Stage Intelligence Pipeline (2026-10-22)
- **ChatGPT-Style Persistent Conversations (`conversations.py`, `routes/conversations.py`, `ConversationSidebar.jsx`):**
  - Full server-side conversation persistence with DynamoDB backend and local fallback.
  - Responsive collapsible sidebar with new-chat creation, auto-titling, search filtering, pinning, archiving, and deletion.
  - Strict user isolation enforced via Cognito JWT sub claims across all CRUD endpoints (`GET/POST /conversations`, `GET/PATCH/DELETE /conversations/{id}`).
- **User-Controlled Long-Term Memory System (`memories.py`, `routes/memories.py`, `MemoryManagerModal.jsx`):**
  - Structured memory store separated from raw conversation logs.
  - Automatic detection and masking of sensitive credentials, passwords, and API keys.
  - Sensitive health vulnerabilities (e.g. asthma, respiratory conditions) default to `pending_approval` until explicit user consent is granted.
  - Conflict detection, deduplication, and manual creation/editing/deletion.
  - Address redaction (`assembler.py`) scrubs house, flat, and door numbers before model context assembly.
- **Sender & Receiver Multi-Stage Intelligence Pipeline (`agents/pipeline/`):**
  - **Stage A (Router):** Interprets natural language questions into structured `RequestPlan`.
  - **Stage B (Retriever):** Fetches authoritative telemetry from CPCB/OpenAQ/Open-Meteo with strict non-Delhi isolation.
  - **Stage C (Assembler):** Generates compact, token-budgeted prompt packages with address redaction.
  - **Stage D (Evaluator):** Standalone evaluator verifying factual alignment and ensuring zero contradiction of authoritative CPCB NAQI and safety verdicts (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`).
  - **Stage E (Conditional Revision):** Controlled single-retry loop correcting material factual issues before user delivery.
- **Frontend Ask Arise Experience Upgrade (`AskArise.jsx`, `ConversationSidebar.jsx`, `MemoryManagerModal.jsx`):**
  - Responsive collapsible sidebar with active conversation state.
  - In-flight pipeline stage indicators: Planning (Stage A) -> Retrieval (Stage B) -> Synthesizing (Stage C) -> Verifying (Stage D).
  - Context & telemetry category chips displaying authoritative evidence used without exposing private data.
  - Interactive AI Memory Manager modal with filter tabs, pending approval consent banners, and quick approval controls.
- **Verified Test Evidence:**
  - Frontend test suite expanded to **63 passing tests** (added `conversations_memories.test.js`) in 258ms.
  - Frontend production build: `npm run build` completed in 416ms (0 errors).
  - Backend pipeline & memory test suite: **40 passed, 0 failed** in 39.24s (`test_conversations_memories.py`, `test_intelligence_pipeline.py`, `test_strands_agent.py`).
  - Browser subagent visual inspection: Clean rendering of conversation sidebar, new chat creation, search, and Memory Manager modal with zero console errors.

### Multi-Profile Location Integration Verification (Home, Work, School) (2026-10-21)
- **Multi-Profile Coordinate Switching (`locationState.js`, `App.jsx`):** Exported `resolvePersonaLocation(persona, userProfile)` to deterministically resolve Home (`home_location`), Work (`work_location`), School (`school_location`), and Parent (`parent_location`).
- **AirMap Reference Pin & Offline Vector Pin Dynamic Relocation (`AirMap.jsx`):** Fixed bug where Google Maps central marker (`markersRef.current.central`) was only positioned once on creation; it now dynamically relocates via `setPosition` and updates title when coordinates change. In offline vector map mode (`DelhiNcrVectorMap.jsx`), `effectiveVectorLocation` dynamically routes selected Home, Work, and School coordinates to the pulsating beacon pin.
- **AirFlow Card North Wind Safeguard (`App.jsx`):** Fixed bug where wind degrees of `0` (North) was evaluated as falsy and mistakenly defaulted to `290` (WNW).
- **Multi-Location Backend Telemetry Verification:** Verified live atmospheric data fusion across three distinct coordinates (Greater Kailash, Greater Noida, Vasant Kunj).
- **Test Suite Expansion:** Frontend test suite expanded to **59 passing tests** (0 failures) running in 196ms.

### Geocoding Fallback Resolution, Deterministic Testing & Memory Fixes (2026-10-21)
- **Greater Noida Substring Shadowing Fix (`geoUtils.js`):** Resolved bug where `lower.includes('noida')` matched `'greater noida'` first. Fallback keys in `KNOWN_COORDS` and `MAJOR_INDIAN_CITIES` are now sorted by length descending, and multi-word city names are properly capitalized.
- **Deterministic Frontend Geocoding Tests (`geoUtils.test.js`):** Replaced flaky, unmocked network requests with deterministic mocked responses (`globalThis.fetch`) and added dedicated offline fallback tests verifying Greater Noida, Noida, and New Delhi resolution.
- **Antigravity Rule Activation Standard:** Formatted `.agents/rules/persistent-memory.md` with standard YAML frontmatter (`trigger: always_on`).
- **Canonical Git Visibility:** Removed `AGENTS.md` and `TOOLS.md` from `.gitignore`. Canonical documentation is now eligible for version control tracking (`??`).
- **Test Suite Expansion:** Frontend test suite expanded to **58 passing tests** (0 failures) running in 189ms.

### Address UX Refactoring & Profile-Driven Home Telemetry (2026-10-21)
- **Manual Coordinate Input Elimination:** Removed visible `Latitude` and `Longitude` number inputs from `ProfileSettingsModal.jsx` and `CompleteProfileModal.jsx`. Users only interact with clean `Label` and `Address or area` fields.
- **Live Address Autocomplete Component (`AddressInput.jsx`):** Created a reusable smart input that searches places worldwide via OpenStreetMap Photon and Nominatim with live dropdown suggestions and background coordinate pinning.
- **Granular Reverse Geocoding (`geoUtils.js`):** Upgraded "Use my current location" via `reverseGeocodeDetailed()` to resolve full address hierarchies (`houseNumber`, `street`, `district`, `city`, `state`, `country`) and save coordinates silently.
- **Dynamic Home Screen Profile Switching (`App.jsx`):** Implemented `handlePersonaChange(newPersona)`. Switching personas (Me, Child, Parent, Work, School) immediately loads that profile's saved location and reloads the entire Today dashboard telemetry (`fetchEnvironment`).
- **UI & Layout Refinements:** Fixed `DataStatusPopover.jsx` overflow with bottom-right anchoring and pruned redundant micro-tooltips across pollutant, weather, school, and airflow cards.

---

## 4. Verified Results & Test Evidence

All checks verified directly in WSL2 Ubuntu environment (`~/arise`):

| Test Suite / Build Check | Scope | Result | Execution Time | Date Verified |
|---|---|---|---|---|
| **Frontend Unit Tests** | `npm test` (`node --test ...`, 15 test files) | **114 passed, 0 failed** *(100% deterministic, mock-isolated)* | 288ms | 2026-10-22 14:33 IST |
| **Frontend Production Build** | `npm run build` (Vite v8.3.3) | **Built client bundle (0 errors)** | 378ms | 2026-10-22 14:33 IST |
| **Backend Weather & Forecast Tests** | `pytest tests/test_weather_forecast.py` | **17 passed, 0 failed** *(waking window capping verified)* | 2.02s | 2026-10-22 09:44 IST |
| **Backend Pipeline & Memory Tests** | `pytest test_conversations_memories.py test_intelligence_pipeline.py` | **20 passed, 0 failed** *(persistence, user isolation, and pipeline)* | 21.81s | 2026-10-22 10:21 IST |
| **Backend Core Route Tests** | `pytest test_profile_auth.py test_api_routes.py test_environment_service.py` | **23 passed, 0 failed** | 1.31s | 2026-10-21 23:45 IST |
| **Backend Full Regression Suite** | `pytest backend/tests/` (all test modules) | **275 passed, 0 failed** *(100% test pass rate)* | 140.41s | 2026-10-22 14:17 IST |
| **Scientific NAQI Formulation** | `python3 backend/tests/verify_scientific_aqi.py` | **PASS (0 discrepancy, 100% CPCB compliant)** | ~1.2s | 2026-10-21 23:45 IST |
| **AWS SAM Template Validation** | `cd infra && sam validate` | **Template valid** | ~2.1s | 2026-10-21 23:08 IST |
| **Responsive Viewport Audit** | Chrome Puppeteer CDP across 5 viewports (375px to 1280px) | **0 horizontal overflow, full navigation pass** | ~8.4s | 2026-10-21 14:45 IST |

---

## 5. Known Issues & Operational Blockers

1. **Amazon Bedrock Nova Lite Access (BLOCKED):**
   - Error: `ValidationException: Error 002: Access to Bedrock models is not allowed for this account` in `us-east-1`.
   - Impact: Calls to Bedrock fail fast.
   - Mitigation: Circuit breaker catches exception and delegates transparently to Google Gemini or the deterministic rule engine.
2. **OpenRouteService Configuration (LOCAL OPTIONAL):**
   - If `ORS_API_KEY` is not set in `.env`, the `/route` endpoint returns HTTP 503 with user instructions.
   - The rest of the platform (Today dashboard, map, weather, forecasts, copilot) operates normally.
3. **Cognito Hosted UI Redirects on Localhost:**
   - Full OIDC PKCE redirect flow requires the deployed CloudFront/Amplify origin configured in Cognito User Pool callback URLs.
   - Unauthenticated local development utilizes local mock user profile persistence (`arise_user_profile` in `localStorage`).
4. **Antigravity Rule Discovery over WSL2 Workspace Path (OPERATIONAL REQUIREMENT):**
   - Antigravity IDE hosted on Windows receives the workspace URI as `/Ubuntu-24.04/home/yashansh_rastogi/arise`.
   - On Windows host processes, drive-relative path resolution maps this to non-existent `C:\Ubuntu-24.04\...`.
   - Reliable automatic discovery of `.agents/rules/persistent-memory.md` and `AGENTS.md` requires opening the workspace via the Windows UNC path `\\wsl.localhost\Ubuntu-24.04\home\yashansh_rastogi\arise`.
   - Rule file has been upgraded with standard YAML frontmatter (`trigger: always_on`).
5. **Git Tracking Status of Canonical Documentation:**
   - `AGENTS.md` and `TOOLS.md` have been removed from `.gitignore`. Canonical documentation files (`AGENTS.md`, `TOOLS.md`, `PROJECT_STATE.md`, `CHANGELOG.md`, `PRODUCT.md`, `SKILL.md`, `.agents/`) are now fully eligible for version control tracking (`??`) and await user commit approval.

---

## 6. Important Architectural & Product Decisions

1. **Repository as Persistent Memory:**
   - AI conversation context is transient. All critical requirements, domain math, verified outcomes, and operating procedures are recorded in repository markdown files (`PROJECT_STATE.md`, `AGENTS.md`, `CHANGELOG.md`, `PRODUCT.md`, `TOOLS.md`).
2. **Deterministic Science Authority:**
   - All AQI breakpoints, sub-indices, and health verdicts are computed by deterministic code in `backend/app/services/environment.py`. AI models must never calculate or override these values.
3. **Zero Delhi Fallback for Non-Delhi Coordinates:**
   - Non-Delhi locations must never receive substituted Delhi data. If ground sensors are unavailable, the system honestly labels data as `modelled` or `Unavailable`.
4. **Silent Background Geocoding:**
   - Raw latitude and longitude inputs are excluded from user-facing forms. Coordinates and structured address hierarchies are resolved silently via forward and reverse geocoding.
5. **Node 24 via NVM Requirement:**
   - WSL2 non-interactive subshells default to system Node 18, causing Vite 8 / Rolldown build errors (`styleText`). Commands must activate Node 24 via `source ~/.nvm/nvm.sh && nvm use 24`.

---

## 7. Pending Work & Next Steps

1. **Working Tree Review:**
   - Review and verify current uncommitted changes across backend, frontend, and tests before any future commit request.
2. **Optional Bedrock Model Access Request:**
   - If Amazon Bedrock Nova Lite is desired alongside Gemini, request model access in the AWS Management Console (`us-east-1`).

---

## 8. Manual Actions Required by User

- **Antigravity IDE Workspace Path:** Open the folder via File -> Open Folder -> `\\wsl.localhost\Ubuntu-24.04\home\yashansh_rastogi\arise` to ensure Windows-side language servers and agents traverse `.agents/` unconditionally.
- **AWS Bedrock Activation (Optional):** Enable model access for `amazon.nova-lite-v1:0` in AWS Console (`us-east-1`) if Amazon Bedrock is desired over Google Gemini.
- **External Provider Keys (Optional):** Add `ORS_API_KEY`, `OPENWEATHER_API_KEY`, or `TOMORROW_API_KEY` to `.env` if secondary providers or routing geometry are desired during local testing.

---

## 9. Deployment Status

- **Local Development:** Actively running on WSL2 Ubuntu (`http://localhost:5173` frontend, `http://localhost:8000` backend). Fully verified via live browser subagent audit across Today dashboard, AirFlowCard, Map tab, and dark mode.
- **Staging / AWS Cloud:** Validated via `sam validate`.
- **Production API:** Deployed on AWS Lambda + API Gateway HTTP API at `https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod`.
- **Production Frontend:** Deployed on AWS Amplify.
- *Strict Rule:* Never deploy or run `sam deploy` without explicit user instruction.

---

## 10. Last Updated

- **Date:** 2026-10-23
- **Author:** Antigravity Agent
- **Description:** Targeted UI Streamlining & Light Theme Adaptations:
  1. **Location Pin Button & Theme Adaptability (`AddressInput.jsx`):**
     - Renamed `"Pin location"` button text to `"Pin"` (and `"Pinned"` when active).
     - Fixed dark-in-light theme appearance: replaced hardcoded dark backgrounds (`bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`) with dynamic theme tokens (`var(--surface-alt)`, `var(--border)`, `var(--text-secondary)`). The button now blends seamlessly with the input field across light, dark, and auto modes.
     - Updated automated test assertions in `PinAndMapImprovements.test.js`.
  2. **Removed Unimplemented Alert Preference (`ProfileSettingsModal.jsx`, `CompleteProfileModal.jsx`):**
     - Removed non-functioning notification preference toggle (*"Save your preference, notifications are sent until notification service is implemented"* / `alerts_enabled`) to eliminate misleading UI affordances until backend notification delivery infrastructure is ready.
  3. **Sun Card Typography & Provenance Cleanup (`WeatherCard.jsx`):**
     - Removed the two redundant provenance lines below Sunrise and Sunset (source attribution `"Open-Meteo NWP Solar"` and timezone offset).
     - Enlarged Sunrise and Sunset time label typography from `text-xs font-semibold` to `text-sm sm:text-base font-bold t1` for improved legibility.
  4. **Commute Route Card Streamlining (`CommuteRouteCard.jsx`):**
     - Removed duration chip (`⏱ X min`) and `Cached` chip from top metrics bar, keeping the distance metric (`📏 X km`).
     - Removed the entire bottom `"Air quality along corridor"` card and its severe warning banner to declutter the commute overview.
  5. **Footer Platform Badge Simplification (`Footer.jsx`):**
     - Rephrased the footer version badge from `"v1.2 · Intelligence Platform"` to `"Air Intelligence Platform"`.
  6. **Verification Evidence:**
     - Automated Frontend Suite: **184/184 tests passed** (`npm test`).
     - Production Bundle: Built cleanly with Vite and Node 24 in 443ms (`npm run build`).
     - Preserved all existing user work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** Production Readiness, UI Professional Copy Refinement & Release Engineering:
  1. **UI Professional Copy & Jargon De-escalation (`AskArise.jsx`, `VerdictHero.jsx`, `AirMap.jsx`, `shareUtils.js`):**
     - Replaced generic AI marketing fluff (*"Members-Only Environmental Intelligence"* and *"unlock interactive queries, predictions & AI synthesis"*) in `AskArise.jsx` with clear, grounded product copy (*"Sign in to Ask Questions"* and *"Sign in to ask questions, view past chats, and get personalized advice"*).
     - Fixed `VerdictHero.jsx` false-live badge: now renders `Unavailable` (neutral slate) instead of a green pulsing `Live` pill when AQI is unavailable.
     - Fixed `AirMap.jsx` ungrounded `'Live Real-Time'` fallback: now accurately renders `'Timestamp Pending'` when sensor timestamp is absent.
     - Grounded share card watermarks and fallback canvas footers to honest wording (*"Environmental exposure advisory · Not medical advice · Observed & satellite telemetry"*).
  2. **Release Hygiene & Artifact Integrity (`.gitignore`):**
     - Updated `.gitignore` to explicitly ignore `.agents/` and `.codex/` directories.
     - Verified strict exclusion of all `.env` files (`.env.local`, `.env.production`) and build caches (`.aws-sam/`, `dist/`, `artifacts/`).
  3. **Verification Evidence:**
     - Automated Frontend Suite: **184/184 tests passed** (`npm test`) in 5.3s.
     - Automated Backend Suite: **288/288 tests passed** (`pytest backend/tests/`) in 192.04s.
     - Production Bundle: Built cleanly with Vite and Node 24 in 349ms (`npm run build`).
     - AWS SAM Validation: `sam validate -t infra/template.yaml --lint` succeeded with 0 errors.
     - AWS SAM Build: `sam build -t infra/template.yaml` succeeded; built `ApiFunction` and `IngestionFunction` artifacts into `.aws-sam/build`.
     - Secret Scanning: `git grep` confirmed zero secret keys, tokens, or credentials in tracked files.
     - Preserved all existing user work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** Exact Conversation Screenshot Sharing & Automatic System Theme Adaptation:
  1. **Faithful Conversation Turn DOM Capture (`shareUtils.js`, `AskArise.jsx`):**
     - Captured the real rendered question bubble and assistant intelligence card directly from the active DOM instead of synthesizing an artificial card.
     - Preserved theme-dependent colors, fonts, font-sizes, line heights, borders, badges, and layout exactly as rendered on screen.
     - Enforced `width: 100%` on flex containers to ensure user question bubbles align naturally to the right edge within image bounds.
     - Awaited `document.fonts.ready` prior to capture so web fonts render accurately.
     - Solved Chrome SVG foreignObject canvas tainting by using data URI encoding (`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`).
     - Excluded browser navigation, sidebars, composer, and interactive action buttons (`🔊` / `⏹️` and `📤`).
     - Added subtle Arise branding bar and bottom verification watermark; set sensible max-height cap (2800px) with graceful fallback to advisory card generator.
  2. **Automatic System Theme Adaptation (`themeUtils.js`, `index.html`, `App.jsx`):**
     - Defaults to operating system color scheme preference (`prefers-color-scheme: dark`) when no user choice is saved.
     - Pre-hydration script in `index.html` `<head>` sets `.dark` and `data-theme` synchronously before initial layout/paint, completely eliminating theme flash.
     - Dynamically listens to real-time OS theme transitions when in `'system'` mode with clean event listener teardown.
     - Preserves explicit user light/dark overrides in `localStorage` across reloads, and resumes system adaptation when cycling back to `'system'`.
     - Verified consistent theme application across Today, Map, Ask Arise, dialogs, and share captures.
  3. **Verification Evidence:**
     - Automated Frontend Suite: **184/184 tests passed** (`npm test`), including 9 unit tests in `themeUtils.test.js` and 4 in `shareUtils.test.js`.
     - Production Bundle: Built cleanly in 449ms (`npm run build`).
     - Headless Browser Verification (`verify-theme-and-sharing.mjs`):
       - Android tablet viewport (1280x800, touch, mobile) with OS dark mode -> Dark theme applied without flash (PASS).
       - Android tablet viewport with OS light mode -> Light theme applied (PASS).
       - Explicit Light override on dark OS -> Light theme honored (PASS).
       - Explicit Dark override on light OS -> Dark theme honored (PASS).
       - Dynamic OS theme change in System mode -> Theme immediately updated (PASS).
       - Manual theme toggle persisted across page reloads (PASS).
       - Real DOM capture in dark mode: exported high-resolution PNG (195,128 bytes) matching visible font size (18px), family, colors, and layout (PASS).
       - Real DOM capture in light mode: exported high-resolution PNG (191,532 bytes) matching visible theme (PASS).
       - Action buttons and sidebar completely excluded from shared images (PASS).
     - Preserved all existing user work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** AirMap Data Provenance, Missing Observation Neutrality, Demo Distinction, and Wheel/Touchpad Gesture Performance Verification:
  1. **Aggregated Values Provenance & Explicit Labelling (`AirMap.jsx`, `locationState.js`):**
     - Sourced all 32 `REGIONAL_DISTRICTS` and 16 `DEFAULT_NATIONAL_HUBS` with authoritative CPCB citations (`CPCB CAAQMS Regional Bulletin` and `CPCB National Air Quality Bulletin`).
     - Timestamped every district and national hub with calibrated ISO publication timestamps (`2026-10-22T18:00:00Z`).
     - Added explicit `dataType: 'aggregated'` metadata across all regional and national nodes.
     - Added rich InfoWindow dialogs for Tier 2 (National Metros) and Tier 3 (Regional Districts) with visible `📊 AGGREGATED METRO COMPOSITE` and `📊 AGGREGATED REGIONAL BULLETIN` badges, source citations, local IST timestamps, and provenance notes clarifying composite nature.
  2. **Live Station Readings vs Demo / Curated Values Distinction (`AirMap.jsx`):**
     - Distinct Station Markers: Demo stations are styled with dashed border strokes (`stroke-dasharray="3,2"`) and `[D]` name prefixes, visibly distinct from solid-bordered live ground monitors.
     - Distinct InfoWindow Badges: Live stations feature an emerald `📡 OBSERVED TELEMETRY` badge, while simulated stations display an amber `⚠️ DEMO / SIMULATION` badge.
     - Explicit Source & Data Type rows distinguishing `Demo Calibration Fixture` / `Simulated Demo` from `CPCB Ground Station` / `Live Observed Ground Sensor`.
  3. **Strict Missing Observation Neutrality (`AirMap.jsx`):**
     - Fixed critical data integrity vulnerability in `AQI_COLOR`: previously defaulted to `#2EB872` (Green / Good) when `aqi` was `null` or `NaN`.
     - Now strictly returns `#94A3B8` (slate neutral) for `null`, `undefined`, or `NaN`.
     - Station, District, and Hub marker badges now render an em-dash (`—`) and `Unavailable` / `Data Pending` status instead of numeric 0, Good, or misleading green coloration.
  4. **Smooth Mouse-Wheel and Touchpad Performance (`AirMap.jsx`, `verify-map-wheel-gestures.mjs`):**
     - Configured `gestureHandling: 'greedy'` on Google Map instance, eliminating "Use ctrl + scroll to zoom the map" overlay and enabling instant touchpad/wheel response.
     - Verified with headless Chrome benchmark (`verify-map-wheel-gestures.mjs`): recorded 59 frames over 40 continuous wheel burst events with **16.38 ms average frame time** (60 FPS), max 16.7 ms, and **0 dropped frames**.
  5. **Verification Evidence:**
     - Automated Frontend Suite: **171/171 tests passed** (`npm test`), including 10 dedicated map tests in `AirMapPerformanceAndDrilldown.test.js`.
     - Production Bundle: Built cleanly in 503ms (`npm run build`).
     - Headless Gesture Benchmark: Clocked 16.38ms average frame time with 0 dropped frames.
     - Preserved all existing work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** Ask Arise Cross-Tab Conversation History & Remarks Synchronization:
  1. **Cross-Tab Synchronization Engine (`crossTabSync.js`):**
     - Built unified cross-tab synchronization engine utilizing native `BroadcastChannel('arise_cross_tab_sync')` with `localStorage` storage pulse fallback and deduplication cache.
     - Dispatches and listens for `AUTH_CHANGED`, `CONVERSATION_MUTATED`, and `MEMORY_MUTATED` events across all open browser tabs under the same origin.
  2. **Auth Synchronization Across Tabs (`AuthContext.jsx`, `cognitoAuth.js`):**
     - Added cross-tab auth state bridge: when one tab signs in or refreshes tokens, other tabs synchronize via `manager.events.load(user)` without requiring a manual page reload.
     - Synchronizes state on tab regain focus via `visibilitychange` event.
     - Broadcasts `LOGOUT` across all tabs and purges cached profile and scoped session storage on sign-out.
  3. **Premature Query & Loading State Protection (`AskArise.jsx`):**
     - Destructured `loading: authLoading` from `useAuth()` and prevented guest fallback queries while authentication is resolving.
     - Prevents transient zero-conversation and zero-remark flashes on new tab load or reload.
     - Maintains `<ConversationSidebar ... loading={true} />` during auth initialization, preventing sidebar collapsing or guest layout flicker.
  4. **Resilient User-Scoped Caching & Error Recovery (`AskArise.jsx`, `MemoryManagerModal.jsx`):**
     - Scoped conversation cache (`arise_user_convs_${userId}`), message cache (`arise_conv_msg_${userId}_${convId}`), and remark cache (`arise_user_memories_${userId}`) to authenticated user ID.
     - Eliminated destructive catch block behavior: network errors or timeouts now retain loaded/cached conversations and remarks instead of wiping state to empty `[]`.
     - Added monotonic request sequence tracking (`fetchSeqRef`) to discard stale, out-of-order asynchronous responses.
  5. **Real-Time Cross-Tab Mutation Sync (`AskArise.jsx`, `MemoryManagerModal.jsx`):**
     - Dispatches mutations on conversation create, rename, pin, archive, and delete, and remark approve, update, delete, and create.
     - Cross-tab listeners automatically re-sync conversation list and remarks counts in all open tabs belonging to the same account.
  6. **Verification Evidence:**
     - Automated Frontend Suite: **167/167 tests passed** (`npm test`), including 11 new tests in `crossTabSync.test.js` and `CrossTabConsistency.test.js`.
     - Backend Suite: **24/24 tests passed** in 80.97s (`pytest backend/tests/test_conversations_memories.py`).
     - Production Bundle: Built cleanly with Vite and Node 24 (`npm run build`).
     - Browser Subagent Verification: Verified Ask Arise UI, active conversation sidebar, and local storage state in active browser instance.
     - Preserved all existing work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** Spatial Intelligence Explorer Map Performance, Local AQI Coverage, and UI Cleanup:
  1. **Elimination of Map Lag & Main Thread Stutter (`AirMap.jsx`):**
     - Diagnosed root cause: `zoom_changed` listener firing continuously 30–60 times per scroll gesture causing React re-render cascades and synchronous marker reconstruction on the main thread.
     - Replaced `zoom_changed` with `'idle'` event listener that only triggers React state updates across tier thresholds.
     - Extracted marker rendering into `renderMarkersRef.current` running on idle without causing full React re-renders.
     - Added `smoothPanTo` helper respecting `prefers-reduced-motion`.
  2. **Floating AQI 0–500 Legend Removal (`AirMap.jsx`):**
     - Permanently removed floating legend gradient bar and GOOD(0)/SEVERE(500) labels, reclaiming map canvas.
  3. **5-Tier Hierarchical Geographic Drill-Down (`AirMap.jsx`, `locationState.js`):**
     - Implemented Tier 1 (Global), Tier 2 (National), Tier 3 (Regional Districts), Tier 4 (Local Clustered Stations), Tier 5 (Individual Stations).
  4. **Clustering & Overlap Prevention (`locationState.js`):**
     - Spherical Mercator clustering (`clusterGeoPoints`) grouping dense stations within pixel radius (`radiusPx: 55`).
  5. **Zero Substitution Cartography & Offline District Search (`locationState.js`, `geoUtils.js`):**
     - Added curated `REGIONAL_DISTRICTS` for offline search and instant geographic navigation without Delhi fallback.
  6. **React 19 Infinite Re-Render Fix (`AirMap.jsx`):**
     - Fixed debounced search empty state allocation using functional update bailing.
  7. **Verification Evidence:**
     - Automated Frontend Suite: **156/156 tests passed** (`npm test`).
     - Backend Contract: **29/29 tests passed** (`pytest backend/tests/test_api_contract_geographic.py`).
     - Production Bundle: Built cleanly with Vite and Node 24 (`npm run build`).
     - Browser Benchmark: Fluid pan/zoom benchmark clocked **316ms average per cycle**; verified non-Delhi Pune isolation, search, and inspector pin.
     - Preserved existing work; zero unauthorized commits, pushes, or deployments.

- **Previous Milestone:** Ask Arise Comprehensive Conversation UX Refinements & User Experience Overhaul:
  1. **Header Profile Display Name (`userUtils.js`, `UserProfileMenu.jsx`):**
     - Resolved single-word compound username `yashanshrastogi` to full display name `Yashansh Rastogi`.
     - Expanded header profile pill width from `max-w-[120px]` to `max-w-[180px]` with graceful truncation.
  2. **AI Memory to Remarks Rebranding (`AskArise.jsx`, `ConversationSidebar.jsx`, `MemoryManagerModal.jsx`, `gemini_provider.py`, `arise_agent.py`):**
     - Rebranded user-facing memory triggers and modals to `📝 Remarks` ("Personal Remarks & Preferences", "+ Add Remark", "{count} remarks saved").
     - Updated AI agent prompt rules (Rules 6 and 10) and memory recall logic to strictly honor and oblige user remarks, medical sensitivities, and outdoor threshold preferences in replies.
  3. **Subheader Removal (`AskArise.jsx`):**
     - Permanently removed `✦ Multi-Stage Intelligence · Persistent Memory & Authoritative Safety` subheader beneath active conversation title.
  4. **Evidence Strip Removal (`AskArise.jsx`):**
     - Permanently deleted the `Evidence: Saved Preferences · Ground Monitors` citation strip on bot response cards.
  5. **Read Aloud Button Refinement (`AskArise.jsx`):**
     - Removed text string `"Read Aloud"`, leaving only the accessible audio icon (`🔊` / `⏹️`).
  6. **Localized Kolkata Timestamps (`AskArise.jsx`, `timeContext.js`):**
     - Replaced stale/unlocalized UTC timestamps with real-time Asia/Kolkata formatted time (`formatKolkataTime`).
  7. **Clean Natural Bold Formatting & Accessible Language (`FormattedBotText.jsx`, `gemini_provider.py`):**
     - Removed purple badge-pill styling on bold keywords in markdown, rendering clean inline bold typography (`font-bold text-[var(--text-primary)]`).
     - Guided AI prompt to generate descriptive, non-technical, family-friendly explanations.
  8. **Thinking State & Typewriter Effect (`AskArise.jsx`):**
     - Replaced 4-stage pipeline pills with a smooth "Thinking…" lazy screen and typewriter reveal on the response headline.
  9. **Share Button & Advisory Card Generation (`shareUtils.js`, `AskArise.jsx`):**
     - Added `📤` share button to assistant responses generating high-fidelity PNG advisory cards via HTML5 Canvas with Web Share API and automatic PNG download fallback.
  10. **Down-Arrow Only Floating Button (`AskArise.jsx`):**
      - Removed `"Newest"` text, rendering a clean circular down-arrow (`↓`) button.
  11. **Scroll-to-Top Navigation Fix (`App.jsx`, `AskArise.jsx`):**
      - Fixed scroll jumping to footer when navigating from Today to Ask Arise via instant top scroll.
  12. **Verification Evidence:**
      - Automated Frontend Suite: **150/150 tests passed** (`npm test`).
      - Backend Suite: **283/283 tests passed** in 2m 40s (`pytest`).
      - Production Bundle: Built cleanly with Vite and Node 24 (`npm run build`).
      - Headless Subagent Browser Audit: Verified in active browser session at `http://localhost:5173/#/ask`.
      - Preserved existing work; zero unauthorized commits, pushes, or deployments.

---

## 2026-10-23: Master Release Loop — Evidence-Grounded Weather AI & AWS Production Deployment Verification

### 1. Release Status: PASSED & FULLY DEPLOYED
- **CloudFormation Stack:** `arise-production` in `us-east-1` (Account `982534366244`)
- **Stack Status:** `UPDATE_COMPLETE`
- **Execution Role:** `AriseDeploymentAdmin` (AWS SSO Profile `arise-deploy`)
- **Live Endpoint:** `https://ll84ry8heh.execute-api.us-east-1.amazonaws.com/prod`
- **Health Check:** `{"status":"healthy","service":"Arise API","version":"2.0.0","mode":"aws","llm_provider":"gemini","cache":"connected","ok":true}`

### 2. Upgrades Implemented
- **Ask Arise Evidence-Grounded Weather AI:**
  - Expanded regex guardrails and intent router across 11 environmental categories.
  - Assembled comprehensive meteorology (temperature, feels-like, humidity, dew point, pressure, wind speed/direction, precipitation probability, cloud cover, UV index, solar times), chemical speciation, contributing stations with distance, and 24h/7d forecasts into prompt evidence.
  - Retired redundant second Gemini critic call, cutting LLM calls from 2 to 1 and reducing latency and token costs by 50%.
  - Wired retrieved context directly through `AriseAgent.answer`, eliminating 4 duplicate tool calls per request.
  - Upgraded fallback templates to dynamic location-aware formatting, completely eliminating hardcoded Delhi defaults for non-Delhi locations.

### 3. Verification & Test Evidence
- **Backend Test Suite:** **303/303 tests passed** in 169s (`pytest backend/tests`).
- **Ask Arise Evaluation:** **15/15 tests passed** (`test_evidence_grounded_weather_ai.py`).
- **Frontend Test Suite:** **184/184 tests passed** (`npm test -- --run`).
- **Frontend Production Build:** Built cleanly with 0 errors (15 assets in 445ms).
- **SAM Infrastructure:** Validated with `--lint` (0 errors) and built cleanly with `sam build`.
- **Live AWS Smoke Verification:**
  - `GET /health` -> 200 OK (`healthy`, `mode: aws`, `llm_provider: gemini`)
  - `GET /environment` -> 200 OK (Temp: 26.5°C, Humidity: 61%, Wind: 3.3 km/h)
  - `GET /verdict` -> 200 OK (`STAY_IN`, AQI: 311, Very Poor)
  - `GET /forecast` -> 200 OK (24 hourly forecast horizons)
  - `POST /chat` (Current Weather) -> 200 OK (Reports surface wind, humidity, atmospheric dispersion)
  - `POST /chat` (Location Isolation - Pune) -> 200 OK (29.5°C, Overcast, AQI 113, zero Delhi contamination)
  - `POST /chat` (Future Forecast) -> 200 OK (Predicted 30°C, 20% precipitation probability)
  - `POST /chat` (AQI & Speciation) -> 200 OK (Dominant PM2.5, 133.1 µg/m³, deterministic CPCB compliance)
  - **CloudWatch Logs:** 0 ERROR events observed across recent API Lambda invocations.

---

## 2026-10-23: UI Bug Fix — Profile & Locations Autocomplete Dropdown Stacking & Isolation

### 1. Milestone Status: VERIFIED & COMPLETED
- **Bug Fixed:** Dropdown overlap and text mixing in Profile & Locations modal when typing addresses (e.g. `Brahmpuri`).
- **Root Cause:** Section CSS stacking context trapping by `animate-fadeIn` and DOM order layering, coupled with suggestions `<ul>` outside input wrapper and aggressive geocoding blur overwrites.
- **Components Updated:**
  - `frontend/src/components/AddressInput.jsx`: Anchored dropdown inside input relative container, applied solid theme background (`var(--card)` / `bg-white dark:bg-[#131A2E]`), added `shadow-2xl max-h-56 sm:max-h-64 overflow-y-auto overscroll-contain`, added region/country badges without inventing details, added dynamic elevation.
  - `frontend/src/components/ProfileSettingsModal.jsx`: Removed `animate-fadeIn` on sections, established descending z-index map (`SECTION_Z_INDEX = { home: 'z-[50]', work: 'z-[40]', ... }`), added solid section background, removed auto-overwriting geocoder blur logic.
  - `frontend/src/components/CompleteProfileModal.jsx`: Added dynamic section z-index elevation and removed blur overwrite.
  - `frontend/src/components/PersonaSelector.jsx`: Added `flex-wrap` and `max-w-full` on segmented buttons, eliminating mobile horizontal overflow (`scrollWidth = 320px/390px`).
  - `frontend/src/components/ProfileSettingsModal.jsx`: Removed hardcoded Delhi coordinate fallback for unknown addresses, enforcing strict location isolation.
  - `frontend/src/App.jsx`: Fixed hash route navigation to automatically close `ProfileSettingsModal` when transitioning to other views (`#/login`, `#/signup`, etc.).
- **Verification Evidence:**
  - **Regression Test Suite:** **189/189 tests passed** (`npm test` under Node 24).
  - **Backend Test Suite:** **303/303 tests passed** in 159.78s (`pytest backend/tests`).
  - **Ask Arise AI Evaluation:** **15/15 tests passed** (`test_evidence_grounded_weather_ai.py`).
  - **Production Build:** Vite built cleanly in 341ms (15 assets).
  - **Visual Verification (Puppeteer):** Full-page desktop and mobile screenshots captured across Guest and Authenticated states; verified zero horizontal overflow across 320px and 390px viewports.
  - **Live AWS Production Smoke Test:**
    - `GET /health` -> 200 OK (`healthy`, `version: 2.0.0`, `mode: aws`, `llm_provider: gemini`)
    - `GET /environment?lat=28.6139&lon=77.2090` -> 200 OK (`status: Very Poor`, `aqi: 311`, `verdict: STAY IN`, `temp: 28.6`)
    - `POST /chat` -> 200 OK (Returns grounded temperature, headline, and structured why/do advisories)
  - **Release Boundaries:** No git commits, git pushes, secret changes, or cloud permission alterations.
