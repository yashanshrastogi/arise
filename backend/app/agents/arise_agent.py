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
from app.cache.repository import get_cache_repository
from app.agents.schemas import AskAriseVerdictResponse, AskAriseRequest
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

    q_lower = question.lower()

    # Determine headline and why/do based on grounded data and query intent
    if "kid" in q_lower or "child" in q_lower or "play" in q_lower:
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
        # 0. Check chat response cache (rounded lat/lon, persona, normalized question)
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

        # Check LLM_PROVIDER: When 'rule-based', do NOT call Bedrock at all (instant answer)
        provider_mode = (self.settings.LLM_PROVIDER or "rule-based").lower()
        if provider_mode == "rule-based":
            logger.info("LLM_PROVIDER is 'rule-based'. Bypassing Bedrock for immediate deterministic synthesis.")
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

        # When 'bedrock', check 10-minute circuit breaker on Bedrock failures
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

        # Try Bedrock with a strict 5-second timeout
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
            # 5-second timeout
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

        # Automatically fall back to rule-based answer
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
