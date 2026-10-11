# Arise — Product Specification & Design System
**Delhi-NCR Environmental & Atmospheric Intelligence for Everyday Decisions**

---

## 1. Product Pitch & Mission
Arise answers the everyday citizen dilemma: **"Should I go out, what should my kid/school do, and why?"** in plain language with scientific accuracy, rather than simply presenting an abstract, delayed city-wide AQI number.

---

## 2. Target Personas
- **Parents & Children:** Clear safety guidance on playground visits, school sports, and bedroom air quality.
- **Seniors & Sensitive Groups (Asthma / COPD):** Early exposure warnings and tighter safety thresholds.
- **Outdoor Workers & Commuters:** Route advisories for arterial smog corridors and cabin air intake advice.
- **Athletes & Runners:** High-exertion respiratory windows and optimal workout hours.
- **School Administrators:** Clear Go / Modify / Cancel outdoor activity protocols.

---

## 3. Screen Specifications & Features

### 3.1. Today (Executive Environmental Intelligence)
- **Air Quality Gauge:** Displays hyper-local calculated AQI with prominent status badge.
- **Verdict Banner:** Clear, deterministic action verdict (`GO`, `BE SMART`, `CUT BACK`, `STAY IN`).
- **Actionable Guidance:** One-sentence immediate summary, dynamically evaluated safe outdoor window, and scheduled recheck time.
- **Live Honesty Indicators:** Transparent telemetry provenance badges showing station count, nearest sensor distance, and satellite status.

### 3.2. Air Map (Dual-Engine Spatial Exploration)
- **Interactive Map:** Google Maps JavaScript API with clean custom styling, GPS centering, station markers (PM2.5/PM10), and color-coded AQI zones.
- **Dual Engine:** Graceful fallback to interactive high-fidelity SVG vector map (`DelhiNcrVectorMap`) when map keys or network connections are unavailable.
- **Layers:** Ground monitoring stations, NASA FIRMS thermal anomaly hotspots, and arterial traffic corridor lines.

### 3.3. Hourly Forecast Horizon
- **Diurnal Timeline:** 24-hour and multi-day hourly trajectory with distinct past vs. future visual states.
- **Dynamic NOW Marker:** Authoritative synchronization to local IST (`Asia/Kolkata`) time.
- **Best Window Highlight:** Shaded indicator highlighting the lowest-risk diurnal window.

### 3.4. Pollutant Breakdown (Why Panel)
- **Pollutant Grid:** Individual cards for PM2.5, PM10, NO2, SO2, CO, and O3 with value, unit, status band, and circular completion gauge.
- **Dominant Pollutant Callout:** Visual emphasis on the primary driver of current air toxicity.
- **Atmospheric Context:** Dynamic mixing layer height and surface ventilation telemetry.

### 3.5. Ask Arise (AI Environmental Copilot)
- **Interactive Panel:** Grounded atmospheric AI assistant powered by Google Gemini with automatic rule-based fallback.
- **Predefined Prompts:** 3 curated, high-impact citizen questions to prevent layout crowding across devices.
- **Structured Output:** Verdict cards with clear reasoning, dos/don'ts, and data source citations.
- **Guest Access Gating:** Members-only card inviting users to sign in or create a free account.

### 3.6. Regional Life, School & Places (More)
- **School Sports Advisory:** Go / Modify / Cancel protocols based on Delhi Government and CPCB standards.
- **Personalized Watchlist:** Saved monitors for Home, Work, and School locations.
- **NCR Smog Corridors:** Arterial route warnings (DND Flyway, NH-48) with cabin ventilation advice.

---

## 4. Scientific Telemetry & Methodology

### 4.1. Station Spatial Interpolation
- Combines live CPCB and OpenAQ ground monitoring stations across the Delhi-NCR airshed.
- Utilizes Inverse Distance Weighting (IDW) interpolation with a minimum 3-station requirement. Avoids misleading single-point regional averages.

### 4.2. Indian CPCB NAQI Breakpoints
Deterministic evaluation according to official Central Pollution Control Board categories:
- **Good (0–50):** `GO` (Minimal impact)
- **Satisfactory (51–100):** `GO` (Minor breathing discomfort to sensitive people)
- **Moderate (101–200):** `BE SMART` (Breathing discomfort to people with lungs, asthma, and heart diseases)
- **Poor (201–300):** `CUT BACK` (Breathing discomfort to most people on prolonged exposure)
- **Very Poor (301–400):** `STAY IN` (Respiratory illness on prolonged exposure)
- **Severe (401+):** `STAY IN` (Affects healthy people and seriously impacts those with existing diseases)

*Thresholds are automatically tightened by one band for Sensitive/Asthma, Children, and Elderly personas.*

### 4.3. Upwind Fire Detection
- Ingests NASA FIRMS (VIIRS/MODIS) satellite thermal anomalies across Punjab, Haryana, and Western UP.
- Transparently labeled as "fire signal / thermal anomaly" rather than definitive single-source causality.

---

## 5. Visual Design System

### 5.1. Typography
- **Primary Typeface:** `Plus Jakarta Sans`, sans-serif.
- **Display Typeface:** `Outfit`, sans-serif.

### 5.2. Color Tokens
- **Brand Primary:** Indigo `#4F46E5` / `#6366F1`
- **Good:** `#2EB872` (Green)
- **Satisfactory:** `#9BD34A` (Light Green)
- **Moderate:** `#F5C542` (Amber/Yellow)
- **Poor:** `#F28C28` (Orange)
- **Very Poor:** `#E5484D` (Coral Red)
- **Severe:** `#8B1E3F` (Deep Maroon)

### 5.3. Surface & Card Geometry
- **Border Radius:** 16px (`rounded-2xl`) for primary cards, 12px (`rounded-xl`) for controls.
- **Shadows:** Soft elevations (`shadow-xs` to `shadow-md`) with subtle border framing (`var(--border)`).
- **Themes:** Semantic CSS variables supporting automatic high-contrast light and dark modes.
