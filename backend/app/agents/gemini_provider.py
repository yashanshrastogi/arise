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
) -> str:
    """
    Build a strictly grounded prompt providing verified environmental context
    without user names, emails, or personal addresses.
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
    pm25 = air_data.get("pm25", "N/A")
    pm10 = air_data.get("pm10", "N/A")
    best_window = verdict_data.get("best_window") or fc_data.get("best_window") or "No recommended outdoor window"
    recheck_at = verdict_data.get("recheck_at") or fc_data.get("recheck_at") or "in 1 hour"

    fire_count = fire_data.get("signals_count", 0)
    fire_source = fire_data.get("source", "NASA FIRMS")

    clean_question = sanitize_input(question)

    return f"""You are Arise — Delhi-NCR's Environmental Intelligence Copilot.
You help citizens, families, parents, runners, schools, and workers understand real-time air quality, weather, and safety protocols.

CORE OPERATIONAL RULES:
1. Ground every statement exclusively in the verified environmental telemetry and authoritative verdict provided below.
2. NEVER invent, extrapolate, or hallucinate pollutant concentrations, temperatures, dates, or measurements.
3. NEVER override the authoritative verdict ({verdict}). The verdict ({verdict}) is final and non-negotiable.
4. Satellite fire signals (NASA FIRMS) indicate active thermal detections upwind. NEVER claim fire signals prove direct pollution causation without verified dispersion evidence.
5. Provide clear, empathetic, plain-English guidance tailored to the user's health persona ({persona}). Avoid medical advice.
6. Return answers conforming strictly to the AskAriseVerdictResponse JSON structure.

VERIFIED ENVIRONMENTAL DATA:
- Location Region: Delhi-NCR
- Authoritative Verdict: {verdict}
- Authoritative AQI: {aqi}
- Air Quality Category: {category}
- Dominant Pollutant: {dominant}
- Ground Monitoring Stations: {station_count} active CPCB / OpenAQ stations
- PM2.5 Concentration: {pm25} µg/m³
- PM10 Concentration: {pm10} µg/m³
- Best Outdoor Window: {best_window}
- Recommended Recheck Time: {recheck_at}
- Upwind Fire Signals: {fire_count} ({fire_source} thermal detections)
- Target User Persona: {persona}

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
    timeout_sec: float = 5.0,
) -> AskAriseVerdictResponse:
    """
    Invoke Google Gemini using official google-genai SDK with structured output.

    Args:
        question: User query.
        verdict_data: Authoritative environmental verdict dict.
        air_data: Ground station telemetry dict.
        fc_data: Forecast telemetry dict.
        fire_data: Satellite fire signal dict.
        persona: Active health persona.
        api_key: Google Gemini API key.
        model_id: Supported model identifier (e.g. 'gemini-3.5-flash-lite').
        timeout_sec: Strict invocation timeout in seconds.

    Returns:
        Structured AskAriseVerdictResponse.

    Raises:
        GeminiTimeoutError: On timeout.
        GeminiRateLimitError: On HTTP 429 or ResourceExhausted.
        GeminiProviderError: On other API errors.
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
    )

    try:
        client = genai.Client(api_key=api_key)
        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=600,
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
