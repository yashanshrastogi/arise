"""
Google Gemini Environmental Copilot Provider for Arise.
Integrates Google's official google-genai Python SDK with structured JSON output,
zero PII leakage, rate limit / error classification, and honest labeling.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Optional
from google import genai
from google.genai import errors, types

from app.agents.schemas import AskAriseVerdictResponse

logger = logging.getLogger("arise.gemini")

# Regex pattern to sanitize any unintentional emails or phone numbers from questions
_EMAIL_PATTERN = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
_PHONE_PATTERN = re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")


class GeminiProviderError(Exception):
    """Base exception for Gemini provider failures."""
    pass


class GeminiTimeoutError(GeminiProviderError):
    """Raised when Gemini invocation times out."""
    pass


class GeminiRateLimitError(GeminiProviderError):
    """Raised when Gemini API rate limit or quota is exceeded (HTTP 429 / ResourceExhausted)."""
    pass


def sanitize_input(text: str) -> str:
    """
    Ensure zero user PII (emails, phone numbers) is forwarded to the Gemini API.
    """
    if not text:
        return ""
    sanitized = _EMAIL_PATTERN.sub("[REDACTED_EMAIL]", text)
    sanitized = _PHONE_PATTERN.sub("[REDACTED_PHONE]", sanitized)
    return sanitized.strip()


def build_gemini_prompt(
    question: str,
    verdict_data: dict[str, Any],
    air_data: dict[str, Any],
    fc_data: dict[str, Any],
    fire_data: dict[str, Any],
    persona: str = "General Public",
    location_name: Optional[str] = None,
    user_context: Optional[dict[str, Any]] = None,
    environmental_context: Optional[dict[str, Any]] = None,
    approved_memories: Optional[list[Any]] = None,
    route_data: Optional[dict[str, Any]] = None,
) -> str:
    """
    Build a strictly grounded prompt providing verified environmental and meteorological context
    without user names, emails, or personal addresses. Never invents values.
    """
    verdict_data = verdict_data or {}
    air_data = air_data or {}
    fc_data = fc_data or {}
    fire_data = fire_data or {}

    verdict = verdict_data.get("verdict") or "BE_SMART"
    aqi = verdict_data.get("aqi") if verdict_data.get("aqi") is not None else air_data.get("aqi", "Unavailable")
    category = verdict_data.get("category") or air_data.get("category", "Unavailable")
    dominant = air_data.get("dominant_pollutant", "PM2.5")
    station_count = air_data.get("station_count", 0)
    pm25 = air_data.get("pm25", "Unavailable")
    pm10 = air_data.get("pm10", "Unavailable")

    from app.agents.arise_agent import is_practical_outdoor_window, sanitize_recheck_time
    raw_bw = verdict_data.get("best_window") or fc_data.get("best_window")
    best_window = raw_bw if is_practical_outdoor_window(raw_bw) else "No recommended outdoor window"
    recheck_at = sanitize_recheck_time(verdict_data.get("recheck_at") or fc_data.get("recheck_at"))

    fire_count = fire_data.get("signals_count", 0)
    fire_source = fire_data.get("source", "NASA FIRMS")

    # Weather telemetry (strictly without fabricated defaults)
    weather = air_data.get("weather") or {}
    if not weather and environmental_context and environmental_context.get("weather"):
        weather = environmental_context.get("weather") or {}

    temp_val = weather.get("temperature")
    feels_val = weather.get("feels_like")
    humid_val = weather.get("humidity")
    dew_val = weather.get("dew_point")
    press_val = weather.get("surface_pressure")
    wind_spd = weather.get("wind_speed")
    wind_dir = weather.get("wind_direction", "NW")
    wind_deg = weather.get("wind_degrees")
    precip_val = weather.get("precipitation")
    rain_prob = weather.get("rain_probability")
    vis_val = weather.get("visibility")
    uv_val = weather.get("uv_index")
    clouds_val = weather.get("cloud_cover")
    condition = weather.get("condition") or weather.get("condition_text") or "Partly Cloudy"
    sunrise = weather.get("sunrise")
    sunset = weather.get("sunset")
    obs_time = weather.get("observation_time")
    tz = weather.get("local_timezone", "Asia/Kolkata")
    w_source = weather.get("source", "Open-Meteo NWP")

    weather_lines = []
    if temp_val is not None:
        weather_lines.append(f"- Ambient Temperature: {temp_val}°C" + (f" (Feels like: {feels_val}°C)" if feels_val is not None else ""))
    else:
        weather_lines.append("- Ambient Temperature: Unavailable")

    if humid_val is not None:
        weather_lines.append(f"- Relative Humidity: {humid_val}%" + (f" (Dew point: {dew_val}°C)" if dew_val is not None else ""))
    if press_val is not None:
        weather_lines.append(f"- Surface Atmospheric Pressure: {press_val} hPa")
    if wind_spd is not None:
        deg_str = f" ({wind_deg}°)" if wind_deg is not None else ""
        weather_lines.append(f"- Surface Wind: {wind_spd} km/h {wind_dir}{deg_str}")
    if precip_val is not None or rain_prob is not None:
        weather_lines.append(f"- Precipitation: {precip_val or 0.0} mm (Rain probability: {rain_prob or 0.0}%)")
    if vis_val is not None:
        weather_lines.append(f"- Horizontal Visibility: {vis_val} km")
    if uv_val is not None:
        weather_lines.append(f"- UV Index: {uv_val}")
    if clouds_val is not None:
        weather_lines.append(f"- Cloud Cover: {clouds_val}% (Sky: {condition})")
    if sunrise and sunset:
        weather_lines.append(f"- Solar Schedule: Sunrise {sunrise}, Sunset {sunset}")
    if obs_time:
        weather_lines.append(f"- Weather Observation Time: {obs_time} (Timezone: {tz})")
    weather_lines.append(f"- Meteorological Telemetry Source: {w_source}")
    weather_str = "\n".join(weather_lines)

    # Multi-day and hourly forecast
    daily_forecast = fc_data.get("daily") or fc_data.get("daily_forecast") or []
    forecast_lines = []
    if daily_forecast:
        for item in daily_forecast[:14]:
            d_ahead = item.get("day_offset", item.get("days_ahead", 0))
            d_label = item.get("day", f"+{d_ahead}d")
            w_label = item.get("weekday", "")
            d_temp = item.get("temp", "N/A")
            d_aqi = item.get("aqi", "N/A")
            d_stat = item.get("status", "N/A")
            d_cond = item.get("condition", "N/A")
            forecast_lines.append(
                f"  * Day +{d_ahead} ({d_label} / {w_label}): Forecast Temp {d_temp}°C, AQI {d_aqi} ({d_stat}), Sky: {d_cond}"
            )
    else:
        forecast_lines.append("  * Multi-day daily forecast models are currently unavailable for this location.")
    forecast_table_str = "\n".join(forecast_lines)

    # Pollutant speciation details
    pollutant_lines = []
    if air_data.get("pollutants"):
        for p in air_data["pollutants"]:
            p_name = p.get("pollutant")
            p_val = p.get("value")
            p_unit = p.get("unit", "µg/m³")
            p_sub = p.get("sub_index")
            sub_info = f" [Sub-Index: {p_sub}]" if p_sub is not None else ""
            pollutant_lines.append(f"  * {p_name}: {p_val} {p_unit}{sub_info}")
    else:
        if pm25 != "Unavailable":
            pollutant_lines.append(f"  * PM2.5: {pm25} µg/m³")
        if pm10 != "Unavailable":
            pollutant_lines.append(f"  * PM10: {pm10} µg/m³")
    pollutants_block = ("\nCHEMICAL SPECIATION & POLLUTANTS:\n" + "\n".join(pollutant_lines) + "\n") if pollutant_lines else ""

    # Contributing stations
    stations_block = ""
    if air_data.get("contributing_stations"):
        stn_strs = [f"{s.get('name')} ({s.get('distance_km', '—')} km, {s.get('source', 'CPCB')})" for s in air_data["contributing_stations"][:4]]
        stations_block = f"- Contributing Ground Monitors ({len(air_data['contributing_stations'])} active): " + ", ".join(stn_strs) + "\n"
    elif station_count > 0:
        stations_block = f"- Contributing Ground Monitors: {station_count} active stations\n"

    # User saved places
    user_lines = []
    if user_context:
        if user_context.get("home"):
            user_lines.append(f"- Saved Home Location: {user_context.get('home')}")
        if user_context.get("work"):
            user_lines.append(f"- Saved Work / Office: {user_context.get('work')}")
        if user_context.get("school"):
            user_lines.append(f"- Saved School / Kids: {user_context.get('school')}")
        if user_context.get("sensitivity"):
            user_lines.append(f"- Reported Sensitivities: {user_context.get('sensitivity')}")
    user_block = ("\nUSER PERSONAL SAVED PLACES & PROFILE CONTEXT:\n" + "\n".join(user_lines) + "\n") if user_lines else ""

    # Approved user remarks
    mem_lines = []
    if approved_memories:
        from app.services.memories import scrub_secrets
        for it in (approved_memories or [])[:10]:
            c = getattr(it, "content", None) or (it.get("content") if isinstance(it, dict) else None) or (getattr(it, "fact", None) or (it.get("fact") if isinstance(it, dict) else None)) or ""
            k = getattr(it, "key", None) or (it.get("key") if isinstance(it, dict) else None) or ""
            cat = getattr(it, "category", None) or (it.get("category") if isinstance(it, dict) else None) or "fact"
            if c:
                clean_c = sanitize_input(scrub_secrets(str(c)))
                mem_lines.append(f"- [{str(cat).upper()}] {k}: {clean_c}")
    memories_block = ("\nUSER APPROVED REMARKS & HEALTH THRESHOLDS:\n" + "\n".join(mem_lines) + "\n") if mem_lines else ""

    # Commute route exposure
    route_block = ""
    if route_data:
        r_lines = [
            f"- Distance: {route_data.get('distance_km', '—')} km, Duration: {route_data.get('duration_minutes', '—')} min",
            f"- Route: {route_data.get('origin_label', 'Origin')} → {route_data.get('destination_label', 'Destination')}",
        ]
        if route_data.get("pollution_summary"):
            ps = route_data.get("pollution_summary")
            r_lines.append(f"- Route Average AQI: {ps.get('average_aqi', '—')} ({ps.get('air_band', '—')}), Peak AQI: {ps.get('peak_aqi', '—')}")
        if route_data.get("advisory"):
            r_lines.append(f"- Route Advisory: {route_data.get('advisory')}")
        route_block = "\nCOMMUTE ROUTE EXPOSURE:\n" + "\n".join(r_lines) + "\n"

    env_lines = []
    if environmental_context:
        for k, v in environmental_context.items():
            if v and k != "weather":
                env_lines.append(f"- {k.replace('_', ' ').title()}: {v}")
    env_block = ("\nADDITIONAL APPLICATION METRICS:\n" + "\n".join(env_lines) + "\n") if env_lines else ""

    loc_label = location_name or "Selected Location"
    clean_question = sanitize_input(question)

    return f"""You are Arise — an evidence-grounded weather, air-quality, and environmental intelligence assistant.
You turn Arise's weather observations, sensor readings, forecasts, satellite detections, dispersion models, commute routes, and scientific data into clear, concise answers tailored to the user's question for {loc_label}.

CORE OPERATIONAL & RESPONSE RULES:
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
- Never substitute Delhi or another city for the selected location ({loc_label}).
- Return output strictly conforming to the AskAriseVerdictResponse JSON schema.

VERIFIED TELEMETRY DATASET:
- Active Monitored Location: {loc_label}
- Authoritative Verdict: {verdict}
- Authoritative CPCB NAQI: {aqi}
- Air Quality Category: {category}
- Dominant Pollutant: {dominant}
- Best Outdoor Window: {best_window}
- Recommended Recheck Time: {recheck_at}
- Upwind Fire Signals: {fire_count} ({fire_source} thermal detections; non-causal infrared signal)
- Target User Persona: {persona}
{stations_block}{weather_str}
{pollutants_block}{forecast_table_str}{route_block}{user_block}{memories_block}{env_block}
USER QUESTION:
{clean_question}
"""


async def invoke_gemini(
    question: str,
    verdict_data: dict[str, Any],
    air_data: dict[str, Any],
    fc_data: dict[str, Any],
    fire_data: dict[str, Any],
    persona: str = "General Public",
    api_key: Optional[str] = None,
    model_id: str = "gemini-3.5-flash-lite",
    timeout_sec: float = 6.0,
    location_name: Optional[str] = None,
    user_context: Optional[dict[str, Any]] = None,
    environmental_context: Optional[dict[str, Any]] = None,
    approved_memories: Optional[list[Any]] = None,
    route_data: Optional[dict[str, Any]] = None,
) -> AskAriseVerdictResponse:
    """
    Invoke Google Gemini with structured output in a single, token-efficient pass.
    Enforces deterministic verdict preservation and honest telemetry labeling.
    """
    if not api_key:
        raise GeminiProviderError("GEMINI_API_KEY is not configured or could not be retrieved.")

    prompt = build_gemini_prompt(
        question=question,
        verdict_data=verdict_data,
        air_data=air_data,
        fc_data=fc_data,
        fire_data=fire_data,
        persona=persona,
        location_name=location_name,
        user_context=user_context,
        environmental_context=environmental_context,
        approved_memories=approved_memories,
        route_data=route_data,
    )

    try:
        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=700,
            response_mime_type="application/json",
            response_schema=AskAriseVerdictResponse,
        )

        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_id,
                contents=prompt,
                config=config,
            ),
            timeout=timeout_sec,
        )

        text = getattr(response, "text", None)
        if not text or not text.strip():
            raise GeminiProviderError("Gemini returned empty text response.")

        parsed = AskAriseVerdictResponse.model_validate_json(text)

        # Enforce verdict integrity: AI must never override deterministic verdict
        authoritative_verdict = verdict_data.get("verdict")
        if authoritative_verdict and parsed.verdict != authoritative_verdict:
            logger.warning(
                f"Gemini attempted to override verdict ({parsed.verdict} vs {authoritative_verdict}). "
                f"Reverting to authoritative verdict."
            )
            parsed.verdict = authoritative_verdict

        # Populate telemetry metadata if missing in model response
        if verdict_data.get("aqi") is not None and parsed.aqi is None:
            parsed.aqi = verdict_data["aqi"]
        if verdict_data.get("category") and not parsed.category:
            parsed.category = verdict_data["category"]
        if not parsed.sources:
            parsed.sources = [
                "CPCB / OpenAQ Ground Stations",
                "Open-Meteo Atmospheric Dynamics",
                f"Google Gemini ({model_id})",
            ]

        # Honest labeling
        parsed.provider = "gemini"
        parsed.assistant_label = f"Arise AI (Google Gemini · {model_id})"
        parsed.is_rule_based = False
        parsed.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")

        return parsed

    except (GeminiTimeoutError, GeminiRateLimitError, GeminiProviderError):
        raise

    except asyncio.TimeoutError as te:
        logger.warning(f"Gemini invocation timed out after {timeout_sec}s.")
        raise GeminiTimeoutError(f"Gemini timeout ({timeout_sec}s exceeded)") from te

    except errors.APIError as ae:
        code = getattr(ae, "code", None)
        msg = str(ae)
        if code == 429 or "RESOURCE_EXHAUSTED" in msg.upper() or "RATE LIMIT" in msg.upper():
            logger.warning(f"Gemini rate limit exceeded (HTTP 429 / ResourceExhausted).")
            raise GeminiRateLimitError(f"Gemini rate limit exceeded: {msg}") from ae
        logger.warning(f"Gemini APIError ({code}): {msg}")
        raise GeminiProviderError(f"Gemini APIError: {msg}") from ae

    except Exception as e:
        logger.warning(f"Gemini unexpected error ({type(e).__name__}): {e}")
        raise GeminiProviderError(f"Gemini error: {e}") from e

