# Arise — Delhi-NCR air intelligence for everyday decisions
Hackathon: AWS x WeMakeDevs "Environmental Hacks", Air track. Deadline Sun Oct 11. Needs a 3-min demo video.
## One-line pitch
Not "what is the AQI" but "should I go out, what should my kid/school do, and why" — in plain language.
## Users (personas)
Child/Parent, Elderly/Asthma, Outdoor worker, Athlete, School admin. Non-technical. Desktop Chrome first.
## Screens
1. Today: AQI gauge + big verdict banner (GO / BE_SMART / CUT_BACK / STAY_IN) + one-sentence action + best time window + "recheck at".
2. Map: Leaflet map, GPS pin, station bubbles (PM2.5/PM10), AQI colour zone, fire hotspot layer, layer toggles (eye icons), search + "Use my location".
3. Forecast: hourly chart, solid past / dashed future, scrub tooltip, green "best window" band.
4. Why panel: pollutant cards (status word, colour dot, value, mini ring); dominant pollutant highlighted; fire-signal line.
5. Ask Arise (AI chat): side panel, one-tap chips, answers rendered as verdict cards with sources + timestamps.
6. School card: Go / Modify / Cancel outdoor activity; simulated indoor sensor labelled "demo data".
7. Watchlist (Home/School/Office), alerts bell, share verdict card, light/dark mode, compact "Today card".
8. Demo mode toggle: loads a saved very-bad-air day.
## Data (cache everything; app must never break if an API fails)
- CPCB / OpenAQ: station PM2.5, PM10, NO2, SO2, CO, O3. Use 3 nearest stations, inverse-distance weighting. Never a single Delhi average.
- NASA FIRMS (VIIRS): fire hotspots in Punjab/Haryana/NCR-UP. Say "fire signal", NEVER claim cause.
- Weather/wind/forecast: free weather API (Open-Meteo, verify endpoints).
- CAQM/GRAP: static context text only.
- Indoor: simulated, always labelled demo.
## Verdict logic (plain Python, NOT the LLM)
CPCB bands: 0-50 Good, 51-100 Satisfactory, 101-200 Moderate, 201-300 Poor, 301-400 Very Poor, 401+ Severe.
GO (<=100), BE_SMART (101-200), CUT_BACK (201-300), STAY_IN (>300). Stricter by one level for Child, Elderly/Asthma.
Output: verdict, headline, why[], do[], best_window, recheck_at, sources[{name,time}].
## AI chat rules
Strands agent. Tools: get_air_now, get_forecast, get_fire_signal, get_indoor, get_verdict. Use ONLY tool data.
If data missing, say so. Return JSON verdict schema. General guidance, not medical advice.
## Design
Inspired by clean map dashboards (see /design screenshots). Do NOT copy any brand/logo/icons. Name: Arise.
Font: Plus Jakarta Sans. Cards white, 16px radius, soft shadow, glass on map. Accent indigo #5B4BDB.
AQI colours: Good #2EB872, Satisfactory #9BD34A, Moderate #F5C542, Poor #F28C28, Very Poor #E5484D, Severe #8B1E3F. Light + dark mode.
## Architecture
Local: React/Vite (5173) -> FastAPI (8000) -> local JSON cache -> real Bedrock or Ollama.
AWS later: Amplify (frontend), API Gateway+Lambda (FastAPI via Mangum), DynamoDB cache, EventBridge every 30 min, Bedrock Nova Lite. MODE=local|aws env var.
## Folders
/frontend  /backend (app/, verdict.py, tools/, data/cache.json, tests/)  /design  /infra (template.yaml)
