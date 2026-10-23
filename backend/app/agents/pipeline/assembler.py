"""
Stage C: Context Assembler & Privacy Controller.
Constructs a compact, task-specific context package respecting token budgets.
Enforces privacy controls: scrubs credentials, redacts house numbers, incorporates
approved memories, and formats authoritative data with provenance and freshness tags.
"""

import logging
import re
from typing import Any, Dict, List, Optional

from app.agents.pipeline.retriever import RetrievedContext
from app.domain.chat_models import ChatMessage, UserMemoryItem
from app.services.memories import scrub_secrets

logger = logging.getLogger("arise.pipeline.assembler")

# Regex to strip house/flat numbers from addresses for privacy
_HOUSE_NUMBER_REGEX = re.compile(
    r"^\s*(?:flat|house|apt|apartment|plot|bldg|building|villa|unit|tower)?\s*(?:no\.?|number|#)?\s*[\w\d\-\/]+\s*,\s*",
    re.IGNORECASE,
)


def redact_precise_address(address_str: Optional[str]) -> Optional[str]:
    """Redact specific apartment/house numbers from prompt text for user privacy."""
    if not address_str:
        return None
    # Strip house or unit number, keep neighborhood and city
    cleaned = _HOUSE_NUMBER_REGEX.sub("", address_str).strip()
    return cleaned or address_str


class AssembledPromptContext:
    def __init__(
        self,
        system_instruction: str,
        user_prompt: str,
        recent_history: List[Dict[str, str]],
        sources: List[str],
        token_estimate: int,
        deterministic_verdict: str,
    ):
        self.system_instruction = system_instruction
        self.user_prompt = user_prompt
        self.recent_history = recent_history
        self.sources = sources
        self.token_estimate = token_estimate
        self.deterministic_verdict = deterministic_verdict


def assemble_context(
    retrieved: RetrievedContext,
    question: str,
    conversation_history: Optional[List[ChatMessage]] = None,
    persona: str = "General Public",
    max_history_turns: int = 5,
) -> AssembledPromptContext:
    """
    Assemble structured, task-specific prompt context respecting token budgets and privacy invariants.
    Extracts all surface weather, air quality speciation, forecast horizons, and uncertainty flags.
    """
    plan = retrieved.plan
    loc_name = plan.location_name or "Selected Location"
    clean_q = scrub_secrets(question).strip()

    # 1. Authoritative Verdict & Telemetry
    verdict_raw = retrieved.verdict_data.get("verdict", "BE_SMART")
    verdict = verdict_raw.replace("_", " ")
    aqi_val = retrieved.verdict_data.get("aqi")
    aqi_str = str(aqi_val) if aqi_val is not None else "Unavailable"
    category = retrieved.verdict_data.get("category", "Unavailable")
    recheck_at = retrieved.verdict_data.get("recheck_at", "3:00 PM")
    dominant_pol = retrieved.air_data.get("dominant_pollutant", "PM2.5")
    raw_bw = retrieved.verdict_data.get("best_window", "Unavailable")
    from app.agents.arise_agent import is_practical_outdoor_window, sanitize_recheck_time
    safe_best_window = raw_bw if is_practical_outdoor_window(raw_bw) else "No recommended outdoor window"
    safe_recheck = sanitize_recheck_time(recheck_at)

    # 2. Surface Meteorology Telemetry Block
    w = retrieved.weather_data or {}
    weather_lines = []
    if w:
        temp = w.get("temperature")
        feels = w.get("feels_like")
        humidity = w.get("humidity")
        dew_point = w.get("dew_point")
        pressure = w.get("surface_pressure")
        wind_spd = w.get("wind_speed")
        wind_dir = w.get("wind_direction", "NW")
        wind_deg = w.get("wind_degrees")
        rain_prob = w.get("rain_probability")
        precip = w.get("precipitation")
        visibility = w.get("visibility")
        uv = w.get("uv_index")
        clouds = w.get("cloud_cover")
        condition = w.get("condition", "Partly Cloudy")
        sunrise = w.get("sunrise")
        sunset = w.get("sunset")
        obs_time = w.get("observation_time")
        tz = w.get("local_timezone", "Asia/Kolkata")
        w_source = w.get("source", "Open-Meteo NWP")

        if temp is not None:
            weather_lines.append(f"- Ambient Temperature: {temp}°C" + (f" (Feels like: {feels}°C)" if feels is not None else ""))
        if humidity is not None:
            weather_lines.append(f"- Relative Humidity: {humidity}%" + (f" (Dew point: {dew_point}°C)" if dew_point is not None else ""))
        if wind_spd is not None:
            deg_str = f" ({wind_deg}°)" if wind_deg is not None else ""
            weather_lines.append(f"- Surface Wind: {wind_spd} km/h {wind_dir}{deg_str}")
        if rain_prob is not None or precip is not None:
            weather_lines.append(f"- Precipitation: {precip or 0.0} mm (Rain probability: {rain_prob or 0.0}%)")
        if visibility is not None:
            weather_lines.append(f"- Horizontal Visibility: {visibility} km")
        if uv is not None:
            weather_lines.append(f"- UV Index: {uv}")
        if clouds is not None:
            weather_lines.append(f"- Cloud Cover: {clouds}% (Sky: {condition})")
        if sunrise and sunset:
            weather_lines.append(f"- Solar Schedule: Sunrise {sunrise}, Sunset {sunset}")
        if obs_time:
            weather_lines.append(f"- Weather Observation Time: {obs_time} (Timezone: {tz})")
        weather_lines.append(f"- Weather Source: {w_source}")
    else:
        weather_lines.append("- Surface meteorology data is currently unavailable.")
    weather_block = "\nCURRENT SURFACE METEOROLOGY:\n" + "\n".join(weather_lines) + "\n"

    # 3. Air Quality Speciation & Contributing Ground Stations
    air = retrieved.air_data or {}
    air_lines = [
        f"- Authoritative CPCB NAQI: {aqi_str} ({category})",
        f"- Dominant Pollutant: {dominant_pol}",
        f"- Authoritative Verdict: {verdict}",
        f"- Best Outdoor Window: {safe_best_window}",
        f"- Recommended Recheck Time: {safe_recheck}",
    ]
    pollutants = air.get("pollutants") or []
    if pollutants:
        p_strs = []
        for p in pollutants:
            p_name = p.get("pollutant")
            p_val = p.get("value")
            p_unit = p.get("unit", "µg/m³")
            p_sub = p.get("sub_index")
            sub_info = f" [Sub-Index: {p_sub}]" if p_sub is not None else ""
            p_strs.append(f"    * {p_name}: {p_val} {p_unit}{sub_info}")
        air_lines.append("- Chemical Speciation Concentrations:\n" + "\n".join(p_strs))
    elif air.get("pm25") is not None or air.get("pm10") is not None:
        if air.get("pm25") is not None:
            air_lines.append(f"    * PM2.5: {air.get('pm25')} µg/m³")
        if air.get("pm10") is not None:
            air_lines.append(f"    * PM10: {air.get('pm10')} µg/m³")

    stations = air.get("contributing_stations") or []
    if stations:
        stn_strs = [f"{s.get('name')} ({s.get('distance_km', '—')} km, {s.get('source', 'CPCB')})" for s in stations[:4]]
        air_lines.append(f"- Contributing Ground Monitors ({len(stations)} active): " + ", ".join(stn_strs))
    else:
        stn_cnt = air.get("station_count", 0)
        if stn_cnt > 0:
            air_lines.append(f"- Contributing Ground Monitors: {stn_cnt} nearby stations")
        else:
            air_lines.append("- Contributing Ground Monitors: 0 in direct range (using regional dispersion model)")
    air_block = "\nCURRENT AIR QUALITY & POLLUTANT SPECIATION:\n" + "\n".join(air_lines) + "\n"

    # 4. Multi-Hour & Multi-Day Forecast Horizons
    forecast_lines = []
    fc = retrieved.forecast_data or {}
    hourly = fc.get("hourly") or []
    if hourly:
        # Provide compact diurnal summary (morning, afternoon, evening, night extremes)
        valid_aqi_pts = [p for p in hourly if p.get("aqi") is not None]
        if valid_aqi_pts:
            min_aqi_pt = min(valid_aqi_pts, key=lambda x: x.get("aqi", 999))
            max_aqi_pt = max(valid_aqi_pts, key=lambda x: x.get("aqi", -1))
            forecast_lines.append(
                f"  * Diurnal AQI Range: Lowest expected at {min_aqi_pt.get('time', 'midday')} "
                f"(AQI {min_aqi_pt.get('aqi')}), Peak inversion at {max_aqi_pt.get('time', 'morning')} "
                f"(AQI {max_aqi_pt.get('aqi')})"
            )
        # Select key representative forecast hours across the diurnal cycle
        sample_hours = hourly[:12]
        hr_summaries = []
        for h in sample_hours:
            hr_summaries.append(
                f"{h.get('time')}: {h.get('temp', '—')}°C, AQI {h.get('aqi', '—')}" +
                (f", Rain {h.get('rainProb')}%" if h.get('rainProb') else "")
            )
        forecast_lines.append("  * Hourly Timeline Samples: " + " | ".join(hr_summaries[:6]))

    daily_list = fc.get("daily") or fc.get("daily_forecast") or []
    if daily_list:
        forecast_lines.append("  * Multi-Day Horizon:")
        for d in daily_list[:7]:
            day_num = d.get("day_offset", d.get("days_ahead", 0))
            d_label = "Today" if day_num == 0 else ("Tomorrow" if day_num == 1 else f"+{day_num}d")
            d_aqi = d.get("aqi", "—")
            d_temp = d.get("temp", "—")
            d_cond = d.get("condition", "Moderate")
            forecast_lines.append(f"    - Day {day_num} ({d_label}): Expected Temp {d_temp}°C, AQI {d_aqi}, Sky: {d_cond}")
    elif not hourly:
        forecast_lines.append("  * Detailed multi-day forecast models are currently unavailable for this location.")
    forecast_block = "\nMULTI-HOUR & MULTI-DAY FORECAST DATASET:\n" + "\n".join(forecast_lines) + "\n"

    # 5. Commute / Route Exposure
    route_block = ""
    r = retrieved.route_data or {}
    if r:
        r_lines = [
            f"- Distance: {r.get('distance_km', '—')} km, Duration: {r.get('duration_minutes', '—')} min",
            f"- Commute Route: {r.get('origin_label', 'Origin')} → {r.get('destination_label', 'Destination')}",
        ]
        if r.get("pollution_summary"):
            ps = r.get("pollution_summary")
            r_lines.append(f"- Route Average AQI: {ps.get('average_aqi', '—')} ({ps.get('air_band', '—')}), Peak AQI: {ps.get('peak_aqi', '—')}")
        if r.get("advisory"):
            r_lines.append(f"- Corridor Advisory: {r.get('advisory')}")
        route_block = "\nCOMMUTE ROUTE EXPOSURE TELEMETRY:\n" + "\n".join(r_lines) + "\n"

    # 6. Satellite Fires
    fire_count = retrieved.fire_data.get("signals_count", 0)
    fire_source = retrieved.fire_data.get("source", "NASA-FIRMS")
    fire_line = f"- Upwind Satellite Thermal Anomalies: {fire_count} hotspots ({fire_source}). (Non-causal signal; reflects infrared detections, not direct pollution proof without dispersion evidence)."

    # 7. User Profile & Approved Remarks (Privacy-Preserving)
    profile_lines = []
    if retrieved.user_context:
        uc = retrieved.user_context
        if uc.get("home"):
            h = uc.get("home")
            addr = redact_precise_address(h.get("address") if isinstance(h, dict) else str(h))
            profile_lines.append(f"- Home Locality: {addr or 'Configured'}")
        if uc.get("work"):
            w = uc.get("work")
            addr = redact_precise_address(w.get("address") if isinstance(w, dict) else str(w))
            profile_lines.append(f"- Work Locality: {addr or 'Configured'}")
        if uc.get("school"):
            s = uc.get("school")
            addr = redact_precise_address(s.get("address") if isinstance(s, dict) else str(s))
            profile_lines.append(f"- School Locality: {addr or 'Configured'}")
        if uc.get("sensitivity"):
            profile_lines.append(f"- Sensitivity Tag: {uc.get('sensitivity')}")
    profile_block = (
        "\nUSER SAVED PLACES (Locality-Level):\n" + "\n".join(profile_lines) + "\n"
    ) if profile_lines else ""

    memory_lines = []
    safe_memories = retrieved.approved_memories or []
    for mem in safe_memories[:10]:
        c = (
            getattr(mem, "content", None)
            or (mem.get("content") if isinstance(mem, dict) else None)
            or getattr(mem, "fact", None)
            or (mem.get("fact") if isinstance(mem, dict) else None)
            or ""
        )
        safe_content = scrub_secrets(str(c))
        cat = getattr(mem, "category", None) or (mem.get("category") if isinstance(mem, dict) else None) or "fact"
        key = getattr(mem, "key", None) or (mem.get("key") if isinstance(mem, dict) else None) or "memory"
        if safe_content.strip():
            memory_lines.append(f"- [{str(cat).upper()}] {key}: {safe_content.strip()}")
    memories_block = (
        "\nUSER APPROVED REMARKS & HEALTH THRESHOLDS:\n" + "\n".join(memory_lines) + "\n"
    ) if memory_lines else ""

    # 8. Data Freshness & Uncertainty Notes
    freshness_lines = [f"- {k}: {v}" for k, v in retrieved.data_freshness.items()]
    if retrieved.uncertainty_flags:
        freshness_lines.append("- Uncertainty Notes: " + ", ".join(retrieved.uncertainty_flags))
    freshness_block = "\nDATA PROVENANCE, FRESHNESS & UNCERTAINTY:\n" + "\n".join(freshness_lines) + "\n"

    # 9. Recent Conversation History (Bounded to max_history_turns)
    recent_history: List[Dict[str, str]] = []
    if conversation_history:
        for msg in conversation_history[-max_history_turns:]:
            m_role = getattr(msg, "role", None) or (msg.get("role") if isinstance(msg, dict) else "user")
            m_content = getattr(msg, "content", None) or (msg.get("content") if isinstance(msg, dict) else "") or ""
            recent_history.append({
                "role": str(m_role),
                "content": scrub_secrets(str(m_content)[:400]),
            })

    # System instruction adhering strictly to the user prompt requirements
    system_instruction = f"""You are Arise — an evidence-grounded weather, air-quality, and environmental intelligence assistant.
You turn Arise's weather observations, sensor readings, forecasts, satellite detections, dispersion models, commute routes, and scientific data into clear, concise answers tailored to the user's question for {loc_name}.

CORE RESPONSE RULES:
1. Answer the user's exact question first in the headline.
2. In 'why', use concise bullet points explaining key evidence, what it means, trends, and comparisons grounded in the available data.
3. In 'do', include clear practical steps or precautions that follow strictly from the evidence (not medical advice).
4. Include the most relevant values, units (°C, km/h, µg/m³, mm, hPa), and observation or forecast times.
5. Explain technical terms (like inversion, PM2.5, or boundary layer) in simple English.
6. State clearly when important information is unavailable, stale, estimated, or uncertain.
7. Avoid repeating the entire weather report when the user asks one specific question (e.g. if asked about rain, focus on rain/cloud telemetry; if asked about temp, focus on temperature).
8. PREDICTION & FUTURE INQUIRIES: When asked about future conditions ('tomorrow', 'after 2 days', 'next week'), cite the predicted temperature, AQI, and sky from the MULTI-DAY FORECAST DATASET, never today's ambient readings!
9. PRACTICAL WAKING HOURS: All outdoor windows must fall strictly between 6:00 AM and 9:00 PM. NEVER recommend overnight hours (10:00 PM to 5:59 AM) for outdoor workouts or errands.
10. USER REMARKS & THRESHOLDS: When approved remarks or sensitivities exist, evaluate current/forecast conditions against the user's stated threshold and advise accordingly.

DATA GROUNDING & SAFETY BOUNDARIES:
- Ground every claim strictly in the VERIFIED TELEMETRY DATASET below. Never invent measurements, timestamps, station names, or sources.
- The authoritative verdict is {verdict}. You must NEVER contradict or override this verdict.
- Distinguish physically observed data from forecasts, models, and satellite thermal detections.
- Never substitute Delhi or another city for the selected location ({loc_name}).
- Return output strictly conforming to the AskAriseVerdictResponse JSON schema.
"""

    user_prompt = f"""VERIFIED TELEMETRY DATASET:
- Target Monitored Area: {loc_name}
- Target Persona: {persona}
{weather_block}{air_block}{forecast_block}{route_block}
SATELLITE THERMAL DETECTION:
{fire_line}
{profile_block}{memories_block}{freshness_block}
USER QUESTION:
{clean_q}
"""

    token_est = int((len(system_instruction) + len(user_prompt)) / 3.8)

    return AssembledPromptContext(
        system_instruction=system_instruction,
        user_prompt=user_prompt,
        recent_history=recent_history,
        sources=retrieved.sources,
        token_estimate=token_est,
        deterministic_verdict=verdict_raw,
    )
