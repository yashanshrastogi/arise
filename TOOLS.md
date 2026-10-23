# TOOLS.md — Arise Environment & Operations Guide

**Read first on every task. Reconciled and verified against current WSL2 runtime environment.**
> **Active Memory & Operating Protocol:** For active milestone, verified test results, blockers, and pending tasks, see [PROJECT_STATE.md](PROJECT_STATE.md). Operating rules and session workflows are defined in [AGENTS.md](AGENTS.md).

---

## 1. Environment & Runtime Specifications

- **Operating System:** WSL2 Ubuntu 24.04 LTS.
- **Repository Root:** `~/arise` (Never execute work from `/mnt/c` due to filesystem performance and permission degradation).
- **Python Runtime:** Python 3.12.3 in virtual environment at `~/arise/.venv`.
  - Always activate via: `source ~/arise/.venv/bin/activate`
  - Installed libraries: `strands-agents`, `fastapi`, `boto3`, `uvicorn`, `httpx`, `pydantic`, `pytest`, `pytest-asyncio`, `python-dotenv`, `awscli-local`.
- **Node.js Runtime:** Node 24.21.0 managed via NVM (`~/.nvm`).
  - **CRITICAL SHELL CAVEAT:** In non-interactive shells or subshells, WSL defaults to system Node 18, which causes Vite 8 / Rolldown builds to fail (`SyntaxError: styleText`).
  - Always activate Node 24 via: `source ~/.nvm/nvm.sh && nvm use 24`
  - Package manager: npm 11.19.0.
- **Docker & LocalStack:** Docker engine runs without sudo. LocalStack CLI (`lstk` 1.3), Ollama 0.40 available locally.
- **External Routing Provider (OpenRouteService):**
  - Used for commute route geometry (`driving-car`, `cycling-regular`, `foot-walking`).
  - Local configuration: Set `ORS_API_KEY` in `.env` (overrides AWS lookup). Free tier: 2,000 requests/day at https://openrouteservice.org/
  - AWS staging/production: Secrets Manager secret named `arise/ors-api-key` (configurable via `ORS_SECRET_ID`).
  - Key remains strictly server-side; client calls `GET /route` on the Arise API.
- **External Secondary Weather & Air Quality Providers:**
  - **OpenWeather (Current Weather 2.5 + Air Pollution API):**
    - Local configuration: Set `OPENWEATHER_API_KEY` in `.env` (overrides AWS lookup).
    - AWS staging/production: Secrets Manager secret named `arise/openweather-api-key` (configurable via `OPENWEATHER_SECRET_ID`).
  - **Tomorrow.io (Realtime v4 Weather + Air Quality):**
    - Local configuration: Set `TOMORROW_API_KEY` in `.env` (overrides AWS lookup).
    - AWS staging/production: Secrets Manager secret named `arise/tomorrow-api-key` (configurable via `TOMORROW_SECRET_ID`).
  - *Strict Security Boundary:* All provider keys remain strictly server-side; never exposed to browser or client code.

---

## 2. Verified Test & Verification Commands

All commands below have been tested and verified in the active environment:

### Evidence-Grounded Weather AI Test Suite
```bash
cd ~/arise
source .venv/bin/activate
pytest backend/tests/test_evidence_grounded_weather_ai.py -v
```
*Result: 15 passed in 2.64s across 15 core evaluation dimensions (current weather accuracy, forecast horizons, speciation, timestamps/units, location isolation, missing data, comparisons, routes, scientific explanations, conciseness, conversation context, prompt injection defense, API efficiency/token reduction, deterministic safety preservation).*

### Pan-India & Fusion Focused Test Suite
```bash
cd ~/arise
source .venv/bin/activate
pytest backend/tests/test_pan_india_fusion.py backend/tests/test_pan_india_caching.py -v
```
*Result: 15 passed in 0.36s (12 fusion rules, provider adapters, disagreement detection, non-Delhi isolation; 3 spatial cell caching & request coalescing).*

### Comprehensive Regression Backend Suite
```bash
cd ~/arise
source .venv/bin/activate
pytest backend/tests
```
*Result: 303 passed in 112.06s with 0 failures across 29 test suites.*

### Persistent AI Memory & Intelligence Pipeline Backend Suite
```bash
cd ~/arise
source .venv/bin/activate
pytest backend/tests/test_conversations_memories.py backend/tests/test_intelligence_pipeline.py -v
```
*Result: 32 passed in 28.46s (24 conversation & memory tests including saved health memory recall, 'Check my new memory' flow, secret scrubbing, simulated page refresh, empty memory handling, bounded slicing, strict user isolation, and out-of-bounds prevention; 8 pipeline tests including request planner, context retriever, assembler redaction, and evaluator adherence).*

### Weather & Forecast Backend Suite
```bash
cd ~/arise
source .venv/bin/activate
pytest backend/tests/test_weather_forecast.py -v
```
*Result: 17 passed in 2.02s (testing outdoor waking window capping, severe weather limits, and ground calibration).*

### Frontend Test Suite
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
npm test -- --run
```
*Result: 184 passed in 5.38s with 0 failures.*

### Spatial Map Performance & Hierarchical Drill-Down Benchmark
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
node scripts/test-map-comprehensive.mjs
```
*Result: 6/6 tests passed; confirmed absence of floating 0-500 legend, verified Tier 1/Tier 2 zoom and centering, fluid gesture response clocked at 316ms per cycle, non-Delhi Pune isolation with 0 Delhi fallbacks, and inspector pin placement.*

### Headless Chrome Accessibility & Assistive Technology Audit
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
node scripts/test-accessibility.mjs
```
*Result: 10/10 critical workflows passed, 0 defects, 0 critical/high accessibility findings.*

### Universal Responsive Layout Audit
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
node scripts/test-responsive.mjs
```
*Result: 78/78 checks passed across 12 viewports (360px–2560px) and 6 routes with 0 layout overflows.*

### Frontend Production Build
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh && nvm use 24
npm run build
```
*Result: Vite production bundle built in 365ms with 0 errors.*

### SAM Template Validation
```bash
cd ~/arise/infra
sam validate
```
*Result: Template `infra/template.yaml` confirmed valid.*

---

## 3. Local Development Workflows

### Start Backend API
```bash
cd ~/arise/backend
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000
```
- API Documentation available at: `http://localhost:8000/docs`
- Health check available at: `http://localhost:8000/health`

### Start Frontend Dev Server
```bash
cd ~/arise/frontend
source ~/.nvm/nvm.sh
npm run dev
```
- Application available at: `http://localhost:5173/`

---

## 4. Operational Boundaries & Safety Rules

1. **Explicit Permission for Cloud & Destructive Operations:**
   - **NEVER** run `sam deploy`, `sam delete`, `docker prune`, or modify live AWS resources without explicit user confirmation.
   - **NEVER** execute `rm -rf` on project directories.
2. **Strict Secret Hygiene:**
   - Secrets belong exclusively in `.env` (git-ignored).
   - Never print, log, or commit API keys, tokens, or credentials.
3. **Preserve User Changes:**
   - Check `git status` before touching files. Do not revert or overwrite uncommitted user work.
4. **Local Verification First:**
   - Always run unit tests and builds locally before proposing changes.
5. **No Speculative Abstractions:**
   - Keep code modular, standard, and clearly commented in plain English.
