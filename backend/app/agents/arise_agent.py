"""
Strands Ask Arise Agent.
Single-agent architecture with domain tools and structured output.
Enforces core principles:
- Try Amazon Bedrock first. Preserve current configuration and behavior when it succeeds.
- On exception, timeout, or empty/unusable Bedrock response, generate a rule-based
  answer using the environmental verdict engine and available tool data.
- NEVER invent measurements, conditions, forecasts, citations, or recommendations.
- Fallback identifies source visibly and unambiguously as 'Arise Assistant (rule-based)'.
- Never describe a fallback response as AI-generated or imply Bedrock succeeded when it did not.
- If necessary environmental information is unavailable, say so rather than fabricating an answer.
"""

import asyncio
from datetime import datetime, timezone
import logging
from typing import Any, List, Optional
from strands import Agent
from strands.models.bedrock import BedrockModel

from app.core.config import get_settings
from app.core.secrets import get_secret
from app.cache.repository import get_cache_repository
from app.agents.schemas import AskAriseVerdictResponse, AskAriseRequest
from app.agents.guardrails import is_environmental_query, get_out_of_scope_response
from app.agents.gemini_provider import (
    invoke_gemini,
    GeminiTimeoutError,
    GeminiRateLimitError,
    GeminiProviderError,
)
from app.agents.tools import (
    get_air_now,
    get_forecast,
    get_fire_signal,
    get_indoor,
    get_verdict,
    compare_places,
)

logger = logging.getLogger("arise.agent")

SYSTEM_PROMPT = """You are Arise — an evidence-grounded weather, air-quality, and environmental intelligence assistant.
You turn Arise's weather observations, sensor readings, forecasts, satellite detections, dispersion models, commute routes, and scientific data into clear, concise answers tailored to the user's question.

CORE OPERATIONAL & RESPONSE RULES:
1. Answer the user's exact question first in the headline.
2. In 'why', provide concise bullet points explaining key evidence, trends, and practical implications.
3. In 'do', include actionable guidance and precautions grounded strictly in the evidence (not medical advice).
4. Include the most relevant values, units (°C, km/h, µg/m³, mm, hPa), and observation or forecast times.
5. Explain technical terms (like inversion, PM2.5, or boundary layer) in simple English.
6. State clearly when important information is unavailable, stale, estimated, or uncertain.
7. Avoid repeating the entire weather report when the user asks one specific question.
8. PREDICTION & FUTURE INQUIRIES: Cite predicted values from the multi-day forecast dataset, never today's ambient readings!
9. PRACTICAL WAKING HOURS: All outdoor windows must fall strictly between 6:00 AM and 9:00 PM. Never recommend overnight hours (10:00 PM to 5:59 AM) for outdoor workouts or errands.
10. NEVER override the authoritative deterministic verdict (GO, BE_SMART, CUT_BACK, STAY_IN).
11. Never substitute Delhi or another city for the selected location.
12. Return answers conforming strictly to the AskAriseVerdictResponse structured output model.
"""


def _is_usable_bedrock_response(resp: Any) -> bool:
    """Validate whether Bedrock returned a valid, usable structured response."""
    if not isinstance(resp, AskAriseVerdictResponse):
        return False
    if not resp.headline or not resp.headline.strip():
        return False
    if resp.verdict not in ("GO", "BE_SMART", "CUT_BACK", "STAY_IN"):
        return False
    # If the response is completely devoid of explanation (both why and do empty) and headline is trivial
    if not resp.why and not resp.do and len(resp.headline.strip()) < 5:
        return False
    return True


def _parse_future_day_offset(question: str) -> Optional[int]:
    """
    Parse days ahead offset from queries like:
    'what will be temp after 2 days' -> 2
    'temp in 3 days' -> 3
    'temp tomorrow' -> 1
    'day after tomorrow' -> 2
    'weather after 5 days' -> 5
    'next week' -> 7
    """
    import re
    q = question.lower()
    if "day after tomorrow" in q:
        return 2
    if "tomorrow" in q:
        return 1
    if "next week" in q:
        return 7

    m = re.search(r'(?:after|in|next)\s+(\d+)\s+days?', q)
    if m:
        return int(m.group(1))

    m2 = re.search(r'(\d+)\s+days?\s+(?:after|later|ahead)', q)
    if m2:
        return int(m2.group(1))

    word_to_num = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    for word, num in word_to_num.items():
        if f"after {word} day" in q or f"in {word} day" in q or f"{word} days after" in q or f"{word} days later" in q:
            return num

    return None


def is_practical_outdoor_window(window_str: Optional[str]) -> bool:
    """Validate that the outdoor window falls strictly within realistic waking daytime hours."""
    if not window_str or not isinstance(window_str, str):
        return False
    lower = window_str.lower().strip()
    if lower in ("no recommended outdoor window", "unavailable", "later", "now", "none", "check live hourly forecast"):
        return False
    # Overnight hours (10:00 PM to 5:59 AM) are completely impractical for outdoor activities
    overnight = ["12 am", "1 am", "2 am", "3 am", "4 am", "5 am", "10 pm", "11 pm", "midnight"]
    return not any(h in lower for h in overnight)


def sanitize_recheck_time(recheck_str: Optional[str]) -> str:
    """Cap recheck times to waking daytime hours; do not ask users to recheck air at 2 AM or 3 AM."""
    if not recheck_str or not isinstance(recheck_str, str):
        return "in 1 hour"
    lower = recheck_str.lower().strip()
    overnight = ["12 am", "1 am", "2 am", "3 am", "4 am", "5 am", "10 pm", "11 pm", "midnight"]
    if any(h in lower for h in overnight):
        return "Tomorrow morning (7:00 AM)"
    return recheck_str


def _generate_grounded_fallback_response(
    question: str,
    verdict_data: dict,
    air_data: dict,
    fc_data: dict,
    fire_data: dict,
    location_name: Optional[str] = None,
    user_context: Optional[dict] = None,
    environmental_context: Optional[dict] = None,
    approved_memories: Optional[list[Any]] = None,
    route_data: Optional[dict] = None,
) -> AskAriseVerdictResponse:
    """
    Deterministic grounded response generator.
    Guarantees reliable, grounded structured output using only available tool/verdict data.
    Never invents measurements, conditions, forecasts, citations, or recommendations.
    Identifies source visibly and unambiguously as 'Arise Assistant (rule-based)'.
    If necessary environmental information is unavailable, says so explicitly.
    """
    verdict_data = verdict_data or {}
    air_data = air_data or {}
    fc_data = fc_data or {}
    fire_data = fire_data or {}

    verdict = verdict_data.get("verdict")
    aqi = verdict_data.get("aqi") if verdict_data.get("aqi") is not None else air_data.get("aqi")
    category = verdict_data.get("category") or air_data.get("category")
    dominant = air_data.get("dominant_pollutant") or verdict_data.get("dominant_pollutant")
    raw_window = verdict_data.get("best_window") or fc_data.get("best_window")
    if is_practical_outdoor_window(raw_window):
        best_window = raw_window
        window_desc = raw_window
    else:
        best_window = "No recommended outdoor window"
        window_desc = None

    recheck_desc = sanitize_recheck_time(verdict_data.get("recheck_at") or fc_data.get("recheck_at"))

    sources_list = []
    if air_data.get("station_count", 0) > 0 or verdict_data.get("sources"):
        sources_list.append("CPCB / OpenAQ Ground Stations")
    if fc_data.get("forecast_points"):
        sources_list.append("Open-Meteo Atmospheric Dynamics")
    if fire_data.get("signals_count", 0) > 0:
        if fire_data.get("is_demo") or fire_data.get("source") == "DEMO":
            sources_list.append("Simulated Fires (Demo Mode)")
        else:
            sources_list.append("NASA FIRMS (VIIRS Thermal Detection - fire signal, not proof of cause)")
    sources_list.append("Arise Assistant (rule-based)")

    # 1. If necessary environmental data is unavailable, state it truthfully without fabricating
    if aqi is None:
        return AskAriseVerdictResponse(
            verdict=verdict or "BE_SMART",
            headline="Environmental air quality data is currently unavailable for this location.",
            aqi=None,
            category=category or "Unavailable",
            why=[
                "Ground monitoring station telemetry and forecast models are currently unreachable or reporting no data.",
            ],
            do=[
                "Check back shortly or verify local station telemetry.",
                "Exercise general caution if outdoor conditions appear hazy or polluted.",
            ],
            best_window=best_window or "No recommended outdoor window",
            recheck_at=recheck_desc,
            sources=sources_list,
            assistant_label="Arise Assistant (rule-based)",
            is_rule_based=True,
        )

    # AQI is available, proceed with grounded evaluation
    if not verdict:
        from app.domain.verdict import get_base_verdict
        verdict = get_base_verdict(aqi)

    if not category:
        from app.domain.aqi import get_aqi_category
        category, _ = get_aqi_category(aqi)

    pollutant_desc = f"dominant {dominant}" if dominant else "particulate pollution"

    weather_info = air_data.get("weather", {})
    temp = weather_info.get("temperature")
    feels_like = weather_info.get("feels_like")
    condition = weather_info.get("condition")
    humidity = weather_info.get("humidity")
    wind_speed = weather_info.get("wind_speed")
    wind_dir = weather_info.get("wind_direction")

    q_lower = question.lower()
    if not is_environmental_query(question):
        guardrail_resp = get_out_of_scope_response(question)
        guardrail_resp.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
        return guardrail_resp

    # Handle personal health and environmental remarks recall queries
    is_memory_query = any(k in q_lower for k in (
        "memory", "memories", "remember", "health fact", "saved fact",
        "saved health", "check my memory", "check my new memory", "what did i save",
        "what health fact", "my health condition", "my sensitivities",
        "my preference", "recall my", "remark", "remarks", "my remarks", "saved remarks",
        "saved remark",
    ))

    if is_memory_query:
        from app.services.memories import scrub_secrets
        safe_approved = []
        for m in (approved_memories or []):
            stat = getattr(m, "status", None) or (m.get("status") if isinstance(m, dict) else None)
            if stat == "approved" or stat is None:
                safe_approved.append(m)

        if safe_approved:
            formatted_items = []
            for it in safe_approved[:5]:
                c = (
                    getattr(it, "content", None)
                    or (it.get("content") if isinstance(it, dict) else None)
                    or getattr(it, "fact", None)
                    or (it.get("fact") if isinstance(it, dict) else None)
                    or ""
                )
                clean_c = scrub_secrets(str(c))
                if clean_c.strip():
                    formatted_items.append(clean_c.strip())

            count_str = f"{len(formatted_items)} saved item{'s' if len(formatted_items) != 1 else ''}"
            headline = f"Here are your approved saved health and environmental remarks ({count_str}):"
            why = [f"• {item}" for item in formatted_items]
            why.append("Note: These are your saved personal environmental preferences and do not constitute a medical diagnosis. Consult a qualified healthcare professional for clinical care.")
            do = [
                "Manage or update your remarks and preferences anytime in Remarks.",
                f"Current ambient air quality in your monitored location is {category} (AQI {aqi}). Follow precautions tailored to your sensitivities.",
            ]
            mem_sources = ["User Approved Memory Profile", "CPCB Ground Stations", "Arise Assistant (rule-based)"]
            return AskAriseVerdictResponse(
                verdict=verdict or "BE_SMART",
                headline=headline,
                aqi=aqi,
                category=category,
                why=why,
                do=do,
                best_window=best_window or "Check daily morning window",
                recheck_at=recheck_desc or "in 1 hour",
                sources=mem_sources,
                assistant_label="Arise Copilot (rule-based)",
                is_rule_based=True,
                data_used_categories=["User Memory Context", "CPCB Ground Telemetry"],
            )
        else:
            headline = "No approved health memories or personal preferences were found in your profile."
            why = [
                "You have not saved or approved any health conditions or environmental sensitivities yet.",
                "If you recently added a health condition (such as asthma or respiratory sensitivity), make sure it has been approved in the Memory Manager.",
            ]
            do = [
                "Open the Memory Manager to record and approve personal health facts.",
                f"Current outdoor air quality is {category} (AQI {aqi}). Follow baseline precautions accordingly.",
            ]
            mem_sources = ["Arise Memory Store", "Arise Assistant (rule-based)"]
            return AskAriseVerdictResponse(
                verdict=verdict or "BE_SMART",
                headline=headline,
                aqi=aqi,
                category=category,
                why=why,
                do=do,
                best_window=best_window or "No recommended outdoor window",
                recheck_at=recheck_desc or "in 1 hour",
                sources=mem_sources,
                assistant_label="Arise Copilot (rule-based)",
                is_rule_based=True,
                data_used_categories=["User Memory Context"],
            )

    # Determine headline and why/do based on grounded data and query intent
    future_offset = _parse_future_day_offset(question)
    daily_list = fc_data.get("daily_forecast") or fc_data.get("daily") or fc_data.get("forecast7Day") or []

    # Handle multi-day future forecast inquiries with exact predicted telemetry
    if future_offset is not None and daily_list:
        target_day = None
        for item in daily_list:
            if item.get("days_ahead") == future_offset:
                target_day = item
                break
        if not target_day and future_offset < len(daily_list):
            target_day = daily_list[future_offset]

        if target_day:
            day_name = target_day.get("weekday") or target_day.get("day") or f"+{future_offset} days"
            target_temp = target_day.get("temp", temp)
            target_aqi = target_day.get("aqi", aqi)
            target_status = target_day.get("status", category)
            target_cond = target_day.get("condition", condition or "Clear")
            target_rain = target_day.get("rainProb", 0)
            target_wind = target_day.get("windSpeed", 0.0)

            if future_offset == 1:
                headline = f"Predicted temperature tomorrow ({day_name}) is {target_temp}°C with {target_cond} skies." if target_temp is not None else f"Weather models project {target_cond} skies tomorrow ({day_name})."
            else:
                headline = f"Predicted temperature after {future_offset} days ({day_name}) is {target_temp}°C with {target_cond} skies." if target_temp is not None else f"Weather models project {target_cond} skies after {future_offset} days ({day_name})."

            why = [
                f"Atmospheric dispersion models project air quality to be {target_status} with an estimated AQI of {target_aqi}." if target_aqi is not None else "Multi-day air quality forecast models are not available for this basin.",
                f"Precipitation probability is {target_rain}% with surface winds around {target_wind} km/h.",
            ]
            do = [
                f"Plan outdoor schedules according to projected {target_status} air conditions.",
                "Continue tracking daily updates as forecast models refine wind and dispersion telemetry.",
            ]
            return AskAriseVerdictResponse(
                verdict=verdict or "BE_SMART",
                headline=headline,
                aqi=target_aqi,
                category=target_status,
                why=why,
                do=do,
                best_window=best_window or "Check daily morning window",
                recheck_at=recheck_desc or "in 1 hour",
                sources=sources_list,
                assistant_label="Arise Assistant (rule-based)",
                is_rule_based=True,
            )

    if any(k in q_lower for k in ("rain", "raining", "precipitation", "drizzle", "shower", "umbrella")):
        rain_prob = weather_info.get("rain_probability", 0)
        precip = weather_info.get("precipitation", 0.0)
        if precip and precip > 0:
            headline = f"Rain detected: {precip} mm precipitation with a {rain_prob}% rain probability."
            why = [
                f"Atmospheric surface telemetry records active precipitation ({precip} mm).",
                f"Relative humidity is {humidity}% with {condition} skies." if humidity is not None else "Surface moisture levels are elevated.",
            ]
            do = [
                "Carry an umbrella or waterproof jacket when stepping outside.",
                "Note that precipitation often washes out coarse particulates, temporarily aiding air dispersion.",
            ]
        elif rain_prob and rain_prob > 30:
            headline = f"{rain_prob}% chance of rain today with {condition} skies."
            why = [
                f"NWP forecasts indicate a {rain_prob}% probability of precipitation.",
                f"Current temperature is {temp}°C with {wind_speed} km/h {wind_dir} winds." if temp is not None else "Surface conditions are active.",
            ]
            do = [
                "Keep an umbrella handy if planning extended outdoor travel.",
                f"Recheck precipitation radar updates around {recheck_desc}.",
            ]
        else:
            headline = f"No significant rain expected today — rain probability is {rain_prob or 0}%."
            why = [
                f"Sky condition is {condition} with surface humidity at {humidity}%." if humidity is not None else f"Sky condition is {condition}.",
                f"Air quality in {location_name or 'the area'} is {category} (AQI {aqi}).",
            ]
            do = [
                "No rain gear is needed for outdoor plans today.",
                "Plan outdoor activities around air quality guidelines.",
            ]

    elif any(k in q_lower for k in ("fire", "fires", "stubble", "hotspot", "hotspots", "satellite", "firms", "burning")):
        sig_count = fire_data.get("signals_count", 0)
        is_demo = fire_data.get("is_demo") or fire_data.get("source") == "DEMO"
        if sig_count > 0:
            if is_demo:
                headline = f"{sig_count} simulated thermal hotspot anomalies displayed in upwind agricultural corridors (Demo mode)."
                why = [
                    f"{sig_count} simulated thermal anomalies shown for demonstration (Demo data).",
                    "Simulated satellite telemetry is used when NASA FIRMS API key is not active.",
                ]
            else:
                headline = f"{sig_count} satellite thermal fire detections observed upwind by NASA FIRMS (fire signal, not proof of cause)."
                why = [
                    f"{sig_count} satellite thermal anomalies detected upwind by NASA FIRMS (fire signal, not proof of cause).",
                    "Satellite observations reflect thermal signatures; direct pollutant impact depends on wind dispersion telemetry.",
                ]
        else:
            headline = "No active thermal fire anomalies detected in the immediate regional basin."
            why = [
                "Satellite infrared sensors detect no elevated thermal signatures in upwind corridors.",
            ]
        do = [
            "Monitor regional boundary layer dispersion and wind speed updates.",
            f"Check updated readings around {recheck_desc}.",
        ]

    elif any(k in q_lower for k in ("wind", "windy", "breeze", "gust")) and not any(k in q_lower for k in ("fire", "fires", "stubble", "hotspot", "satellite", "burning")):
        if wind_speed is not None:
            speed_desc = "light" if wind_speed < 10 else ("moderate" if wind_speed < 25 else "strong")
            headline = f"Surface winds are {speed_desc} at {wind_speed} km/h blowing from the {wind_dir}."
            why = [
                f"Wind speed of {wind_speed} km/h from {wind_dir} dictates regional atmospheric dispersion.",
                f"Active ventilation ({wind_speed} km/h) assists in dispersing local emissions." if wind_speed >= 8 else "Calm winds (< 8 km/h) limit particulate ventilation under surface inversions.",
            ]
            do = [
                "Outdoor sports and cycling will experience minimal wind resistance." if wind_speed < 15 else "Expect noticeable crosswinds if cycling or commuting on elevated roads.",
                f"Current air quality is {category} (AQI {aqi}).",
            ]
        else:
            headline = "Surface wind telemetry is currently unavailable for this coordinate."
            why = ["Meteorological station wind sensors are unreachable."]
            do = ["Check back shortly for updated dispersion readings."]

    elif any(k in q_lower for k in ("pm2.5", "pm10", "pm 2.5", "pm 10", "pollutant", "speciation")):
        pm25_val = air_data.get("pm25")
        pm10_val = air_data.get("pm10")
        headline = f"Dominant pollutant is {dominant} with overall AQI at {aqi} ({category})."
        why_pol = [
            f"Ground stations record dominant {dominant} driving the CPCB sub-index.",
        ]
        if pm25_val is not None:
            why_pol.append(f"PM2.5 concentration: {pm25_val} µg/m³ (CPCB 24-hr safe standard: 60 µg/m³).")
        if pm10_val is not None:
            why_pol.append(f"PM10 concentration: {pm10_val} µg/m³ (CPCB 24-hr safe standard: 100 µg/m³).")
        why = why_pol
        do = [
            "Use N95 filtration masks during outdoor exposure if PM2.5 exceeds 60 µg/m³." if (pm25_val and pm25_val > 60) else "Fine particulate levels are within manageable bounds.",
            "Run indoor HEPA purifiers in sealed living spaces.",
        ]

    elif any(k in q_lower for k in ("picnic", "bbq", "garden", "gardening", "wash car", "car wash", "drying clothes", "dry clothes")):
        rain_prob = weather_info.get("rain_probability", 0)
        if (rain_prob and rain_prob > 50) or (verdict == "STAY_IN"):
            headline = f"Not recommended for outdoor chores or leisure today ({category} air, {rain_prob}% rain risk)."
            why = [
                f"Air quality is {category} (AQI {aqi}) and rain probability is {rain_prob}%.",
                "Outdoor exposure or drying clothes in poor air causes particulate accumulation.",
            ]
            do = [
                "Postpone car washing or drying clothes outside until cleaner air windows.",
                "Move social gatherings to well-ventilated indoor spaces.",
            ]
        else:
            headline = f"Conditions are suitable for outdoor plans today ({category} air, {temp}°C)." if temp is not None else f"Outdoor plans permitted under {category} air."
            why = [
                f"Weather is {condition} with {rain_prob}% rain risk and {humidity}% humidity." if humidity is not None else f"Air quality is {category}.",
            ]
            do = [
                "Proceed with outdoor activities during daytime hours.",
                f"Optimal window for outdoor plans: {best_window}.",
            ]

    elif any(k in q_lower for k in ("temperature", "temp", "weather", "forecast", "climate", "degree", "celsius")):
        if temp is not None:
            headline = f"Current temperature is {temp}°C" + (f" (feels like {feels_like}°C)" if feels_like is not None else "") + (f" with {condition} skies." if condition else ".")
            why = [
                f"Relative humidity is {humidity}% with {wind_dir} winds at {wind_speed} km/h." if (humidity is not None and wind_speed is not None and wind_dir) else "Surface meteorological conditions are active.",
                f"Air quality in {location_name or 'this area'} is currently {category} (AQI {aqi}, dominant: {pollutant_desc}).",
            ]
        else:
            headline = "Surface temperature telemetry is currently unavailable for this coordinate."
            why = [
                "Meteorological monitoring stations for this grid point are unreachable or out of range.",
                f"Air quality in {location_name or 'this area'} is currently {category} (AQI {aqi}, dominant: {pollutant_desc}).",
            ]
        do = [
            "Dress comfortably for prevailing temperatures.",
            "If planning outdoor exercise, monitor current AQI levels and stay hydrated." if verdict == "GO" else "Limit prolonged outdoor physical exertion under current particulate levels.",
            f"Next telemetry update expected around {recheck_desc}.",
        ]

    elif any(k in q_lower for k in ("python", "code", "script", "program", "api", "developer", "sdk", "function")):
        temp_label = f"{temp}°C" if temp is not None else "N/A"
        headline = f"Here is a Python script to fetch real-time air quality & weather telemetry (AQI {aqi}, {temp_label}):"
        why = [
            "Arise exposes real-time REST endpoints at `/api/v1/environment/air-now` and `/api/v1/verdict/now`.",
            "You can query live telemetry, AQI, temperature, and dominant pollutants using Python requests or httpx.",
        ]
        do = [
            "Run: `pip install requests`",
            f"import requests\n\ndef get_local_air():\n    url = 'http://localhost:8000/api/v1/environment/air-now?lat={round(air_data.get('latitude', 28.6139), 4)}&lon={round(air_data.get('longitude', 77.2090), 4)}'\n    res = requests.get(url).json()\n    print(f\"AQI: {{res.get('aqi')}} ({{res.get('aqi_category')}})\")\n    print(f\"Dominant: {{res.get('dominant_pollutant')}}\")\n    w = res.get('weather', {{}})\n    print(f\"Temp: {{w.get('temperature')}}°C | Condition: {{w.get('condition_text')}}\")\n    return res\n\nif __name__ == '__main__':\n    get_local_air()",
            "Run this script against the Arise backend to access live ground telemetry.",
        ]

    elif route_data or any(k in q_lower for k in ("route", "corridor", "way to work", "way home", "commute route")):
        if route_data:
            summary = route_data.get("summary") or {}
            avg_aqi = summary.get("average_aqi", aqi)
            dist_km = summary.get("total_distance_km")
            dur_min = summary.get("total_duration_minutes")
            hotspot = summary.get("hotspot_segment") or {}
            hotspot_name = hotspot.get("name") or "arterial segment"
            hotspot_aqi = hotspot.get("aqi")
            headline = f"Commute route exposure averages AQI {avg_aqi}" + (f" across {dist_km} km ({dur_min} mins)." if dist_km else ".")
            why = [
                f"Peak exposure reaches AQI {hotspot_aqi} along {hotspot_name}." if hotspot_aqi else f"Corridor air quality averages {category} levels.",
                "Vehicle exhaust and stop-and-go congestion elevate ultrafine particulate concentrations on arterial corridors.",
            ]
            do = [
                "Keep vehicle windows rolled up and switch air circulation to cabin recirculation mode.",
                "Wear an N95 mask if traveling by two-wheeler, auto-rickshaw, or walking.",
            ]
        else:
            headline = f"Commute exposure along local transit corridors is currently {category} (AQI {aqi})."
            why = [
                f"Air quality in {location_name or 'the area'} is {category} with dominant {pollutant_desc}.",
                "Traffic corridors typically experience elevated particulate concentrations compared to ambient background monitors.",
            ]
            do = [
                "Use cabin air recirculation with AC if driving.",
                "Wear an N95 respirator mask if using two-wheelers or open public transit.",
            ]

    elif any(k in q_lower for k in ("work", "commute", "commuter", "office", "transit", "shift", "travel")):
        if verdict in ("STAY_IN", "CUT_BACK"):
            headline = f"Outdoor workers & commuters should wear N95 masks today (AQI {aqi}, {category})."
            why = [
                f"Elevated {pollutant_desc} levels increase inhalation toxicity during travel and outdoor shifts.",
                "Vehicle exhaust and road dust along arterial transit corridors create localized exposure spikes.",
            ]
            do = [
                "Wear an N95 or FFP2 respirator mask during transit and outdoor assignments.",
                "Keep vehicle windows rolled up and switch air conditioning to internal recirculation.",
                "Take indoor recovery breaks away from high-traffic roadways whenever possible.",
                f"Recheck telemetry around {recheck_desc}.",
            ]
        else:
            headline = f"Transit and work commute conditions are favorable under {category} air (AQI {aqi})."
            why = [
                f"AQI is {aqi}, within tolerable baseline thresholds for outdoor workers and commuters.",
            ]
            do = [
                "Proceed with routine commuting and outdoor work schedules.",
                f"Recheck telemetry around {recheck_desc}.",
            ]

    elif "kid" in q_lower or "child" in q_lower or "play" in q_lower:
        if verdict in ("STAY_IN", "CUT_BACK"):
            headline = f"Keep children indoors today — air quality is {category} with AQI {aqi}."
            why = [
                f"{pollutant_desc.capitalize()} is at {category} levels across {location_name or 'the monitored area'}.",
                "Children breathe faster per body weight and are vulnerable to fine particulate accumulation.",
            ]
            if window_desc:
                why.append(f"Atmospheric dispersion remains limited until later ({window_desc}).")
            else:
                why.append(f"Atmospheric dispersion remains limited across {location_name or 'the area'}.")

            do = [
                "Move children's games and workouts inside filtered spaces.",
                "Keep windows closed and operate indoor HEPA purifiers.",
            ]
            if window_desc:
                do.append(f"If outdoor activity is essential, defer until the {window_desc} window.")
            else:
                do.append("Avoid non-essential outdoor activity until telemetry indicates improving air.")
        else:
            status_word = "Safe for outdoor playtime" if verdict == "GO" else "Outdoor playtime permitted with caution"
            headline = f"{status_word} — current air quality is {category} (AQI {aqi})."
            why = [
                f"Air quality currently meets baseline thresholds ({aqi} AQI, {category}).",
                f"{pollutant_desc.capitalize()} is within manageable concentrations.",
            ]
            do = [
                "Routine outdoor play and activities are permitted." if verdict == "GO" else "Sensitive children should avoid prolonged heavy exertion.",
            ]
            if window_desc:
                do.append(f"Plan outdoor sports around the optimal window: {window_desc}.")
            do.append(f"Recheck telemetry around {recheck_desc}.")

    elif "school" in q_lower or "sports" in q_lower or "cancel" in q_lower:
        if aqi > 300:
            headline = f"School outdoor sports and morning assemblies should be suspended (AQI {aqi})."
            why = [
                "CPCB and school health protocols mandate suspending strenuous outdoor exertion above AQI 300.",
                f"Ground telemetry shows {pollutant_desc} posing acute respiratory risks.",
            ]
            do = [
                "Cancel or reschedule outdoor physical education and competitive matches.",
                "Shift students to well-ventilated, filtered indoor activity halls.",
                f"Monitor air readings again at {recheck_desc}.",
            ]
        elif aqi > 200:
            headline = f"Modify school outdoor activities — limit high-intensity exertion (AQI {aqi})."
            why = [
                f"Current air is {category}. Prolonged aerobic exertion presents elevated exposure.",
            ]
            do = [
                "Substitute strenuous sprint sessions with low-intensity instruction.",
                "Ensure students with asthma have inhalers accessible.",
                f"Monitor air readings again at {recheck_desc}.",
            ]
        else:
            headline = f"Outdoor school sports permitted under current {category} conditions (AQI {aqi})."
            why = [f"AQI is currently {aqi}, within tolerable parameters for general outdoor schedules."]
            do = [
                "Proceed with standard activity guidelines.",
                f"Recheck air quality around {recheck_desc}.",
            ]

    elif "why" in q_lower or "reason" in q_lower or "bad" in q_lower:
        headline = f"Air quality is {category} (AQI {aqi}) driven primarily by elevated {pollutant_desc} and calm dispersion."
        why = [
            f"Ground monitoring stations report {pollutant_desc} as the primary air pollutant.",
            "Calm surface winds and atmospheric inversion trap emissions close to the surface.",
        ]
        if fire_data.get("signals_count", 0) > 0:
            if fire_data.get("is_demo") or fire_data.get("source") == "DEMO":
                why.append(
                    f"{fire_data.get('signals_count')} simulated thermal anomalies shown for demonstration (Demo data)."
                )
            else:
                why.append(
                    f"{fire_data.get('signals_count')} satellite thermal anomalies detected upwind by NASA FIRMS (fire signal, not proof of cause)."
                )
        do = [
            "Limit unnecessary outdoor travel during early morning smog spikes.",
            "Use N95 or equivalent filtration masks when commuting along major corridors.",
        ]
        if window_desc:
            do.append(f"Aim for the {window_desc} window when inversion typically relaxes.")

    elif any(k in q_lower for k in ("jog", "run", "running", "jogging", "marathon", "sprint", "morning walk", "workout", "exercise", "cardio")):
        if verdict in ("STAY_IN", "CUT_BACK") or (aqi is not None and aqi > 200):
            headline = f"Avoid outdoor jogging today — air quality is {category} (AQI {aqi})."
            why = [
                f"Ground telemetry indicates {category} air driven by fine {pollutant_desc}.",
                "Early mornings trap emissions under cold inversion layers; deep aerobic breathing increases lung particle deposition.",
            ]
            do = [
                "Switch running or cardio to an indoor gym or treadmill with filtered air.",
                "Avoid intense outdoor exertion until regional atmospheric ventilation improves.",
            ]
            if window_desc:
                do.append(f"If you must step outside, the cleanest daytime window is {window_desc}.")
        elif verdict == "BE_SMART" or (aqi is not None and aqi > 100):
            headline = f"Keep morning jogs light or wait for midday dispersion (AQI {aqi}, {category})."
            why = [
                f"Air quality is {category}. Morning surface inversion can trap local dust near roadways.",
                "Sensitive individuals or runners with asthma may experience airway irritation during prolonged exertion.",
            ]
            do = [
                "Reduce workout duration and choose tree-lined parks away from arterial transit corridors.",
                f"Optimal daytime window for outdoor exercise: {window_desc}." if window_desc else "Prefer low-intensity walking or indoor training.",
            ]
        else:
            headline = f"Favorable conditions for outdoor exercise and running (AQI {aqi}, {category})."
            why = [
                "Air quality meets safe baseline criteria for cardiovascular training.",
            ]
            do = [
                "Proceed with routine outdoor running, jogging, and athletic activities.",
                f"Check back around {recheck_desc} as daily traffic patterns evolve.",
            ]

    elif any(k in q_lower for k in ("go out", "leave now", "heading out", "step out", "outside now", "can i go")) and not any(k in q_lower for k in ("best", "when", "window", "ideal")):
        if verdict == "STAY_IN":
            headline = f"Stay indoors right now — air quality is {category} with an AQI of {aqi}."
            why = [
                f"Ground monitors report severe {pollutant_desc} concentrations across the area.",
                "Calm surface air limits particulate dispersion, posing acute health risks.",
            ]
            do = [
                "Keep windows closed and operate indoor HEPA purifiers.",
                "Wear an N95 respirator mask if you must go outside briefly.",
            ]
            if window_desc:
                do.append(f"Wait for the {window_desc} daytime window if transit can be deferred.")
        elif verdict == "CUT_BACK":
            headline = f"Minimize outdoor exposure right now — air quality is {category} (AQI {aqi})."
            why = [
                f"Elevated {pollutant_desc} creates high inhalation toxicity during extended exposure.",
            ]
            do = [
                "Keep outdoor trips brief and avoid strenuous outdoor exertion.",
                "Wear an N95 mask during transit along roadways.",
            ]
            if window_desc:
                do.append(f"Cleaner daytime window expected around {window_desc}.")
        elif verdict == "BE_SMART":
            headline = f"Safe for brief outings right now, but exercise caution (AQI {aqi}, {category})."
            why = [
                f"Air quality is {category}. Healthy adults can perform brief outdoor routines.",
                "Sensitive individuals (asthma, seniors) should limit prolonged exposure.",
            ]
            do = [
                "Sensitive individuals should wear a mask or avoid heavy physical exertion.",
                f"Best daytime outdoor window: {window_desc}." if window_desc else "Monitor live air updates before extended outdoor tasks.",
            ]
        else:
            headline = f"You can safely go out right now — air is {category} with AQI {aqi}."
            why = [
                "Air quality is currently in a safe and healthy range.",
            ]
            do = [
                "Proceed with your regular outdoor plans and activities.",
                f"Check back around {recheck_desc}.",
            ]

    elif "best" in q_lower or "time" in q_lower or "when" in q_lower or "window" in q_lower:
        if window_desc:
            headline = f"The lowest-risk daytime window today is {window_desc}."
            why = [
                f"Forecast telemetry models indicate PM2.5 dips and mixing height rises around {window_desc}.",
                "Morning and evening hours have steeper inversion layers trapping emissions.",
            ]
            do = [
                f"Schedule errands, walking, or transit between {window_desc}.",
                f"Re-evaluate condition updates at {recheck_desc}.",
            ]
        else:
            headline = f"No clearly favorable outdoor window identified today under {category} conditions (AQI {aqi})."
            why = [
                "Atmospheric dispersion remains suppressed throughout waking hours.",
                f"Pollutant levels remain in the {category} tier across daytime hours.",
            ]
            do = [
                "Keep outdoor transit brief and defer non-urgent exercise.",
                f"Re-evaluate condition updates at {recheck_desc}.",
            ]

    else:
        # General verdict answer
        if verdict == "STAY_IN":
            headline = f"Avoid outdoor activities — current air is {category} with an AQI of {aqi}."
            why = [
                f"Ground telemetry across {location_name or 'the monitored area'} indicates severe particulate concentration ({pollutant_desc}).",
                "Atmospheric ventilation is low, creating stagnant surface air layers.",
            ]
            do = [
                "Remain indoors and run HEPA air filtration.",
                "Wear an N95 mask if outdoor travel is mandatory.",
            ]
            if window_desc:
                do.append(f"Wait for the {window_desc} window if possible.")
        elif verdict == "CUT_BACK":
            headline = f"Cut back outdoor exertion — air quality is {category} (AQI {aqi})."
            why = [f"Air quality has reached {category} levels, primarily driven by {pollutant_desc}."]
            do = [
                "Reduce the duration and intensity of outdoor workouts.",
            ]
            if window_desc:
                do.append(f"Take advantage of the cleaner {window_desc} window.")
        elif verdict == "BE_SMART":
            headline = f"Be smart about outdoor activities — air quality is {category} (AQI {aqi})."
            why = [f"Air quality is {category}. Sensitive individuals should take precautions."]
            do = [
                "Sensitive individuals (asthma, seniors) should limit prolonged exposure.",
            ]
            if window_desc:
                do.append(f"Best daytime outdoor window is {window_desc}.")
        else:
            headline = f"Conditions are favorable — air quality is {category} with AQI {aqi}."
            why = ["Current pollutant concentrations are within healthy ranges across the basin."]
            do = [
                "Great conditions for outdoor exercise, walking, and sports.",
                f"Check back around {recheck_desc}.",
            ]

    return AskAriseVerdictResponse(
        verdict=verdict,
        headline=headline,
        aqi=aqi,
        category=category,
        why=why,
        do=do,
        best_window=best_window or "No recommended outdoor window",
        recheck_at=recheck_desc,
        sources=sources_list,
        assistant_label="Arise Assistant (rule-based)",
        is_rule_based=True,
        provider="rule-based",
        timestamp=datetime.now(timezone.utc).strftime("%I:%M %p"),
    )


class AriseAgent:
    """
    Strands Environmental Copilot for Arise.
    1. Checks DynamoDB chat cache (30-minute TTL by rounded location, persona, question).
    2. When LLM_PROVIDER is 'rule-based', bypasses Bedrock entirely for instant response.
    3. When LLM_PROVIDER is 'bedrock':
       - Checks 10-minute circuit breaker on Bedrock failures.
       - Enforces 5-second timeout on Bedrock invocation.
       - Automatically trips 10-minute breaker and falls back to rule-based engine on failure.
    4. Caches answers in DynamoDB for 30 minutes.
    """

    def __init__(self):
        self.settings = get_settings()
        self.cache = get_cache_repository()
        self.tools = [
            get_air_now,
            get_forecast,
            get_fire_signal,
            get_indoor,
            get_verdict,
            compare_places,
        ]

    async def answer(
        self,
        request: AskAriseRequest,
        assembled_context: Optional[Any] = None,
        approved_memories: Optional[list[Any]] = None,
        user_id: Optional[str] = None,
        retrieved_context: Optional[Any] = None,
    ) -> AskAriseVerdictResponse:
        """
        Execute Ask Arise query with caching, circuit breaker, and deterministic fallbacks.
        """
        # 0. Check scope guardrail: strictly balance AI to website context
        if not is_environmental_query(request.question):
            logger.info(f"Question '{request.question}' is out of scope. Returning guardrail guidance.")
            guardrail_resp = get_out_of_scope_response(request.question)
            guardrail_resp.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
            return guardrail_resp

        # 0b. Load user memories safely if user_id is provided and approved_memories was not passed
        if approved_memories is None and user_id:
            try:
                from app.services.memories import MemoryService
                mem_svc = MemoryService()
                approved_memories = await mem_svc.get_approved_memories(user_id)
            except Exception as me:
                logger.warning(f"Error loading user memories in AriseAgent: {me}")
                approved_memories = []

        # 0c. Check chat response cache (rounded lat/lon, persona, user scope, normalized question)
        lat_rnd = round(request.lat, 2)
        lon_rnd = round(request.lon, 2)
        q_norm = request.question.strip().lower()
        persona = request.persona
        user_scope = user_id if user_id else "anon"

        # Check if question is an active personal memory/remark recall inquiry
        is_mem_inquiry = any(k in q_norm for k in (
            "memory", "memories", "remember", "health fact", "saved fact",
            "saved health", "check my memory", "check my new memory", "what did i save",
            "what health fact", "my health condition", "my sensitivities",
            "my preference", "recall my", "remark", "remarks", "my remarks", "saved remarks",
            "saved remark",
        ))

        # Personal memory inquiries must always reflect the current approved state, bypassing stale cache
        cache_key = f"chat:{lat_rnd}:{lon_rnd}:{persona}:{user_scope}:{q_norm}"
        if not is_mem_inquiry:
            cached_entry = self.cache.get(cache_key, allow_stale=False)
            if cached_entry and cached_entry.value:
                try:
                    cached_val = cached_entry.value
                    if isinstance(cached_val, dict):
                        cached_resp = AskAriseVerdictResponse(**cached_val)
                        cached_resp.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
                        logger.info(f"Serving cached chat response for '{q_norm}' (key: {cache_key})")
                        return cached_resp
                except Exception as e:
                    logger.warning(f"Error restoring cached chat response: {e}")

        # Reuse single-shot retrieved context when provided to avoid duplicate upstream queries
        if retrieved_context and hasattr(retrieved_context, "verdict_data"):
            verdict_data = retrieved_context.verdict_data or {}
            air_data = retrieved_context.air_data or {}
            fc_data = retrieved_context.forecast_data or {}
            fire_data = getattr(retrieved_context, "fire_data", {}) or {}
            route_data = getattr(retrieved_context, "route_data", None)
            if not air_data.get("weather") and getattr(retrieved_context, "weather_data", None):
                air_data["weather"] = retrieved_context.weather_data
        else:
            verdict_data = {}
            air_data = {}
            fc_data = {}
            fire_data = {}
            route_data = None

            try:
                verdict_data = get_verdict(lat=request.lat, lon=request.lon, persona=request.persona, demo=request.demo) or {}
            except Exception as e:
                logger.warning(f"Error querying get_verdict: {e}")

            try:
                air_data = get_air_now(lat=request.lat, lon=request.lon, demo=request.demo) or {}
            except Exception as e:
                logger.warning(f"Error querying get_air_now: {e}")

            try:
                fc_data = get_forecast(lat=request.lat, lon=request.lon, demo=request.demo) or {}
            except Exception as e:
                logger.warning(f"Error querying get_forecast: {e}")

            try:
                fire_data = get_fire_signal(lat=request.lat, lon=request.lon, demo=request.demo) or {}
            except Exception as e:
                logger.warning(f"Error querying get_fire_signal: {e}")

        # Check LLM_PROVIDER
        provider_mode = (self.settings.LLM_PROVIDER or "rule-based").lower()

        # 1. Rule-Based Mode: Bypasses all external LLMs entirely for instant response
        if provider_mode == "rule-based":
            logger.info("LLM_PROVIDER is 'rule-based'. Bypassing external models for immediate deterministic synthesis.")
            fallback_resp = _generate_grounded_fallback_response(
                question=request.question,
                verdict_data=verdict_data,
                air_data=air_data,
                fc_data=fc_data,
                fire_data=fire_data,
                location_name=request.location_name,
                user_context=request.user_context,
                environmental_context=request.environmental_context,
                approved_memories=approved_memories,
                route_data=route_data,
            )
            if not is_mem_inquiry:
                try:
                    self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
                except Exception as ce:
                    logger.warning(f"Failed to cache chat response: {ce}")
            return fallback_resp

        # 2. Google Gemini Mode
        if provider_mode == "gemini":
            breaker_key = "gemini_circuit_breaker:failure"
            breaker_entry = self.cache.get(breaker_key, allow_stale=False)
            if breaker_entry and breaker_entry.value:
                logger.info("Gemini is in 10-minute circuit breaker cooldown. Immediately using rule-based fallback.")
                fallback_resp = _generate_grounded_fallback_response(
                    question=request.question,
                    verdict_data=verdict_data,
                    air_data=air_data,
                    fc_data=fc_data,
                    fire_data=fire_data,
                    location_name=request.location_name,
                    user_context=request.user_context,
                    environmental_context=request.environmental_context,
                    approved_memories=approved_memories,
                    route_data=route_data,
                )
                if not is_mem_inquiry:
                    try:
                        self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
                    except Exception as ce:
                        logger.warning(f"Failed to cache chat response: {ce}")
                return fallback_resp

            api_key = get_secret(self.settings.GEMINI_SECRET_ID, region_name=self.settings.AWS_REGION)
            if not api_key:
                logger.warning("GEMINI_API_KEY could not be retrieved from Secrets Manager or environment. Tripping breaker.")
                self.cache.set(breaker_key, {"failed": True, "reason": "missing_api_key"}, ttl_seconds=600, source="circuit-breaker")
            else:
                model_id = self.settings.GEMINI_MODEL_ID or "gemini-3.5-flash-lite"
                timeout_sec = float(self.settings.GEMINI_TIMEOUT_SECONDS or 5.0)
                try:
                    resp = await invoke_gemini(
                        question=request.question,
                        verdict_data=verdict_data,
                        air_data=air_data,
                        fc_data=fc_data,
                        fire_data=fire_data,
                        persona=request.persona,
                        api_key=api_key,
                        model_id=model_id,
                        timeout_sec=timeout_sec,
                        location_name=request.location_name,
                        user_context=request.user_context,
                        environmental_context=request.environmental_context,
                        approved_memories=approved_memories,
                        route_data=route_data,
                    )
                    # Enforce that authoritative verdict cannot be overridden
                    if verdict_data.get("verdict") and resp.verdict != verdict_data["verdict"]:
                        resp.verdict = verdict_data["verdict"]
                    if not is_mem_inquiry:
                        try:
                            self.cache.set(cache_key, resp.model_dump(), ttl_seconds=1800, source="arise-chat")
                        except Exception as ce:
                            logger.warning(f"Failed to cache chat response: {ce}")
                    return resp
                except GeminiTimeoutError:
                    logger.warning(f"Gemini timed out ({timeout_sec}s limit). Tripping breaker for 10 minutes.")
                    self.cache.set(breaker_key, {"failed": True, "reason": "timeout"}, ttl_seconds=600, source="circuit-breaker")
                except GeminiRateLimitError:
                    logger.warning("Gemini rate limit exceeded. Tripping breaker for 10 minutes.")
                    self.cache.set(breaker_key, {"failed": True, "reason": "rate_limit"}, ttl_seconds=600, source="circuit-breaker")
                except Exception as e:
                    logger.warning(f"Gemini invocation failed ({type(e).__name__}: {e}). Tripping breaker for 10 minutes.")
                    self.cache.set(breaker_key, {"failed": True, "reason": str(e)}, ttl_seconds=600, source="circuit-breaker")

            # Fallback to deterministic rule-based answer
            fallback_resp = _generate_grounded_fallback_response(
                question=request.question,
                verdict_data=verdict_data,
                air_data=air_data,
                fc_data=fc_data,
                fire_data=fire_data,
                location_name=request.location_name,
                user_context=request.user_context,
                environmental_context=request.environmental_context,
                approved_memories=approved_memories,
                route_data=route_data,
            )
            try:
                self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
            except Exception as ce:
                logger.warning(f"Failed to cache chat response: {ce}")
            return fallback_resp

        # 3. Amazon Bedrock Mode
        if provider_mode == "bedrock":
            breaker_key = "bedrock_circuit_breaker:failure"
            breaker_entry = self.cache.get(breaker_key, allow_stale=False)
            if breaker_entry and breaker_entry.value:
                logger.info("Bedrock is in 10-minute circuit breaker cooldown. Immediately using rule-based fallback.")
                fallback_resp = _generate_grounded_fallback_response(
                    question=request.question,
                    verdict_data=verdict_data,
                    air_data=air_data,
                    fc_data=fc_data,
                    fire_data=fire_data,
                    location_name=request.location_name,
                    user_context=request.user_context,
                    environmental_context=request.environmental_context,
                    approved_memories=approved_memories,
                    route_data=route_data,
                )
                if not is_mem_inquiry:
                    try:
                        self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
                    except Exception as ce:
                        logger.warning(f"Failed to cache chat response: {ce}")
                return fallback_resp

            try:
                model_id = self.settings.BEDROCK_MODEL_ID or "us.amazon.nova-lite-v1:0"
                region_name = self.settings.AWS_REGION or "us-east-1"
                model = BedrockModel(model_id=model_id, region_name=region_name)
                agent = Agent(
                    model=model,
                    tools=self.tools,
                    system_prompt=SYSTEM_PROMPT,
                    structured_output_model=AskAriseVerdictResponse,
                )
                timeout_sec = 5.0
                result = await asyncio.wait_for(
                    agent.invoke_async(
                        request.question,
                        structured_output_model=AskAriseVerdictResponse,
                    ),
                    timeout=timeout_sec,
                )
                parsed = getattr(result, "structured_output", None) or result
                if _is_usable_bedrock_response(parsed):
                    if verdict_data and verdict_data.get("verdict"):
                        if parsed.verdict != verdict_data["verdict"]:
                            logger.warning(
                                f"LLM attempted to override verdict ({parsed.verdict} vs {verdict_data['verdict']}). Reverting to authoritative verdict."
                            )
                            parsed.verdict = verdict_data["verdict"]
                    parsed.provider = "bedrock"
                    parsed.assistant_label = f"Arise AI (Amazon Bedrock · {model_id})"
                    parsed.is_rule_based = False
                    if not getattr(parsed, "timestamp", None):
                        parsed.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
                    if not is_mem_inquiry:
                        try:
                            self.cache.set(cache_key, parsed.model_dump(), ttl_seconds=1800, source="arise-chat")
                        except Exception as ce:
                            logger.warning(f"Failed to cache chat response: {ce}")
                    return parsed
                else:
                    logger.warning("Bedrock returned empty or unusable response. Tripping breaker for 10 minutes.")
                    self.cache.set(breaker_key, {"failed": True, "reason": "unusable_response"}, ttl_seconds=600, source="circuit-breaker")
            except asyncio.TimeoutError:
                logger.warning("Bedrock invocation timed out (5s limit). Tripping breaker for 10 minutes.")
                self.cache.set(breaker_key, {"failed": True, "reason": "timeout"}, ttl_seconds=600, source="circuit-breaker")
            except Exception as e:
                logger.info(f"Bedrock invocation failed ({type(e).__name__}: {e}). Tripping breaker for 10 minutes.")
                self.cache.set(breaker_key, {"failed": True, "reason": str(e)}, ttl_seconds=600, source="circuit-breaker")

            fallback_resp = _generate_grounded_fallback_response(
                question=request.question,
                verdict_data=verdict_data,
                air_data=air_data,
                fc_data=fc_data,
                fire_data=fire_data,
                location_name=request.location_name,
                user_context=request.user_context,
                environmental_context=request.environmental_context,
                approved_memories=approved_memories,
                route_data=route_data,
            )
            if not is_mem_inquiry:
                try:
                    self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
                except Exception as ce:
                    logger.warning(f"Failed to cache chat response: {ce}")
            return fallback_resp

        # Fallback for unrecognized provider modes
        fallback_resp = _generate_grounded_fallback_response(
            question=request.question,
            verdict_data=verdict_data,
            air_data=air_data,
            fc_data=fc_data,
            fire_data=fire_data,
            location_name=request.location_name,
            user_context=request.user_context,
            environmental_context=request.environmental_context,
            approved_memories=approved_memories,
            route_data=route_data,
        )
        if not is_mem_inquiry:
            try:
                self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
            except Exception as ce:
                logger.warning(f"Failed to cache chat response: {ce}")
        return fallback_resp
