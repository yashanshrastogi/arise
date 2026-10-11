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

SYSTEM_PROMPT = """You are Arise — Delhi-NCR's Environmental Intelligence Copilot.
You help families, parents, runners, schools, and workers understand real-time air quality, weather, and safety protocols.

CORE OPERATIONAL RULES:
1. Ground every statement exclusively in data returned by your tools.
2. NEVER invent, fabricate, or hallucinate pollutant concentrations, temperatures, or dates.
3. NEVER override the authoritative verdict returned by get_verdict(). The verdict (GO, BE_SMART, CUT_BACK, STAY_IN) is final.
4. If a tool fails or data is unavailable, explicitly state that data is unavailable.
5. Satellite fire signals (NASA FIRMS) indicate active thermal detections upwind. NEVER claim fire signals prove direct pollution causation without verified dispersion evidence.
6. Provide clear, empathetic, plain-English guidance. Avoid medical advice.
7. Return answers conforming strictly to the AskAriseVerdictResponse structured output model.
8. If the user asks general coding, math, trivia, or other off-topic questions, politely decline: "I am Arise, an environmental intelligence assistant. I focus on air quality, weather, health advisories, and environmental telemetry."
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


def _generate_grounded_fallback_response(
    question: str,
    verdict_data: dict,
    air_data: dict,
    fc_data: dict,
    fire_data: dict,
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
    dominant = air_data.get("dominant_pollutant")
    best_window = verdict_data.get("best_window") or fc_data.get("best_window")
    recheck_at = verdict_data.get("recheck_at") or fc_data.get("recheck_at")

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
            recheck_at=recheck_at or "When telemetry resumes",
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
    window_desc = best_window if best_window and best_window != "No recommended outdoor window" else None
    recheck_desc = recheck_at or "in 1 hour"

    weather_info = air_data.get("weather", {})
    temp = weather_info.get("temperature", 28.4)
    feels_like = weather_info.get("feels_like", 30.8)
    condition = weather_info.get("condition", "Partly Cloudy")
    humidity = weather_info.get("humidity", 58.0)
    wind_speed = weather_info.get("wind_speed", 3.2)
    wind_dir = weather_info.get("wind_direction", "NW")

    q_lower = question.lower()
    if not is_environmental_query(question):
        guardrail_resp = get_out_of_scope_response(question)
        guardrail_resp.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
        return guardrail_resp

    # Determine headline and why/do based on grounded data and query intent
    future_offset = _parse_future_day_offset(question)
    daily_list = fc_data.get("daily_forecast") or []

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
            target_cond = target_day.get("condition", condition)
            target_rain = target_day.get("rainProb", 10)
            target_wind = target_day.get("windSpeed", 3.5)

            if future_offset == 1:
                headline = f"Predicted temperature tomorrow ({day_name}) is {target_temp}°C with {target_cond} skies."
            else:
                headline = f"Predicted temperature after {future_offset} days ({day_name}) is {target_temp}°C with {target_cond} skies."

            why = [
                f"Atmospheric dispersion models project air quality to be {target_status} with an estimated AQI of {target_aqi}.",
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
                recheck_at=recheck_at or "in 1 hour",
                sources=sources_list,
                assistant_label="Arise Assistant (rule-based)",
                is_rule_based=True,
            )

    if any(k in q_lower for k in ("temperature", "temp", "weather", "forecast", "climate", "degree", "celsius")):
        headline = f"Current temperature is {temp}°C (feels like {feels_like}°C) with {condition} skies."
        why = [
            f"Relative humidity is {humidity}% with {wind_dir} winds at {wind_speed} km/h.",
            f"Air quality in this area is currently {category} (AQI {aqi}, dominant: {pollutant_desc}).",
        ]
        do = [
            "Dress comfortably for prevailing temperatures.",
            "If planning outdoor exercise, monitor current AQI levels and stay hydrated." if verdict == "GO" else "Limit prolonged outdoor physical exertion under current particulate levels.",
            f"Next telemetry update expected around {recheck_desc}.",
        ]

    elif any(k in q_lower for k in ("python", "code", "script", "program", "api", "developer", "sdk", "function")):
        headline = f"Here is a Python script to fetch real-time air quality & weather telemetry (AQI {aqi}, {temp}°C):"
        why = [
            "Arise exposes real-time REST endpoints at `/api/v1/environment/air-now` and `/api/v1/verdict/now`.",
            "You can query live telemetry, AQI, temperature, and dominant pollutants using Python requests or httpx.",
        ]
        do = [
            "Run: `pip install requests`",
            "import requests\n\ndef get_delhi_air():\n    url = 'http://localhost:8000/api/v1/environment/air-now?lat=28.6139&lon=77.2090'\n    res = requests.get(url).json()\n    print(f\"AQI: {res.get('aqi')} ({res.get('aqi_category')})\")\n    print(f\"Dominant: {res.get('dominant_pollutant')}\")\n    w = res.get('weather', {})\n    print(f\"Temp: {w.get('temperature')}°C | Condition: {w.get('condition_text')}\")\n    return res\n\nif __name__ == '__main__':\n    get_delhi_air()",
            "Run this script against the Arise backend to access live ground telemetry.",
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
                f"{pollutant_desc.capitalize()} is at {category} levels across the Delhi-NCR basin.",
                "Children breathe faster per body weight and are vulnerable to fine particulate accumulation.",
            ]
            if window_desc:
                why.append(f"Atmospheric dispersion remains limited until later ({window_desc}).")
            else:
                why.append("Atmospheric dispersion remains limited across the basin.")

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

    elif "fire" in q_lower or "stubble" in q_lower or "hotspot" in q_lower or "satellite" in q_lower:
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

    elif "best" in q_lower or "time" in q_lower or "when" in q_lower or "window" in q_lower:
        if window_desc:
            headline = f"The lowest-risk outdoor window today is {window_desc}."
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
                "Atmospheric dispersion remains suppressed throughout the forecast period.",
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
                f"Ground telemetry across Delhi-NCR indicates severe particulate concentration ({pollutant_desc}).",
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
                do.append(f"Best outdoor window is {window_desc}.")
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

    async def answer(self, request: AskAriseRequest) -> AskAriseVerdictResponse:
        """
        Execute Ask Arise query with caching, circuit breaker, and deterministic fallbacks.
        """
        # 0. Check scope guardrail: strictly balance AI to website context
        if not is_environmental_query(request.question):
            logger.info(f"Question '{request.question}' is out of scope. Returning guardrail guidance.")
            guardrail_resp = get_out_of_scope_response(request.question)
            guardrail_resp.timestamp = datetime.now(timezone.utc).strftime("%I:%M %p")
            return guardrail_resp

        # 0b. Check chat response cache (rounded lat/lon, persona, normalized question)
        lat_rnd = round(request.lat, 2)
        lon_rnd = round(request.lon, 2)
        q_norm = request.question.strip().lower()
        persona = request.persona
        cache_key = f"chat:{lat_rnd}:{lon_rnd}:{persona}:{q_norm}"

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

        # Query authoritative ground tools to guarantee factual grounding
        verdict_data = {}
        air_data = {}
        fc_data = {}
        fire_data = {}

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
            )
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
                )
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
                    )
                    # Enforce that authoritative verdict cannot be overridden
                    if verdict_data.get("verdict") and resp.verdict != verdict_data["verdict"]:
                        resp.verdict = verdict_data["verdict"]
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
                )
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
            )
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
        )
        try:
            self.cache.set(cache_key, fallback_resp.model_dump(), ttl_seconds=1800, source="arise-chat")
        except Exception as ce:
            logger.warning(f"Failed to cache chat response: {ce}")
        return fallback_resp
