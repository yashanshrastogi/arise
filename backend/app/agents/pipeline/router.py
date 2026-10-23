"""
Stage A: Context-Aware Request Router & Request Planner.
Interprets natural-language environmental questions before model synthesis.
Classifies intent, time sensitivity, required telemetry sources, target location,
and missing data into a strictly validated RequestPlan schema.
"""

import logging
import re
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field

from app.agents.guardrails import is_environmental_query

logger = logging.getLogger("arise.pipeline.router")

IntentType = Literal[
    "current_safety",       # "Can I go out?", "Is it safe for kids right now?"
    "current_weather",      # "What is the temperature, humidity, wind, rainfall, visibility?"
    "forecast_planning",    # "What is the best time today?", "What about tomorrow?", "Weekly outlook"
    "weather_trends",       # "Is temperature rising?", "Diurnal inversion changes", "Wind shifts"
    "outdoor_planning",     # "Can I run at 5 PM?", "Is it a good day for gardening / washing car / picnic?"
    "transit_commute",      # "Air on expressway", "Commute route exposure", "Cleanest driving route"
    "pollutant_inquiry",    # "Why is PM2.5 high?", "What is driving the AQI?", "Breakdown of pollutants"
    "health_sensitivity",   # "I have asthma, what precautions?", "Elderly advice", "Saved remarks"
    "fire_satellite",       # "Are crop fires burning upwind?", "Stubble burning hotspots", "NASA FIRMS"
    "comparison",           # "Compare Noida and Gurugram", "Is today warmer than yesterday?"
    "scientific_explanation", # "How is AQI calculated?", "What does PM2.5 mean?", "Uncertainty & dispersion"
    "general_environmental",# Broad inquiry about air, temperature, humidity
    "out_of_scope",         # General coding, math, trivia
]

TimeHorizon = Literal["realtime", "today_window", "tomorrow", "multi_day", "historical"]
DetailLevel = Literal["concise", "standard", "deep_dive"]
SourceType = Literal[
    "verdict",
    "air_quality",
    "weather",
    "forecast",
    "fire_signals",
    "traffic_corridors",
    "user_memories",
    "user_profile",
]


class RequestPlan(BaseModel):
    """Validated structured execution plan for environmental query synthesis."""
    intent: IntentType
    sub_intent: Optional[str] = None
    time_horizon: TimeHorizon = "realtime"
    target_location: Dict[str, Optional[float]] = Field(
        default_factory=lambda: {"lat": 28.6139, "lon": 77.2090}
    )
    location_name: Optional[str] = "Selected Location"
    required_sources: List[SourceType] = Field(default_factory=list)
    requested_detail: DetailLevel = "standard"
    is_out_of_scope: bool = False
    requires_profile: bool = False
    requires_memories: bool = True
    missing_data_flags: List[str] = Field(default_factory=list)
    days_ahead: Optional[int] = None


def route_request(
    question: str,
    lat: float = 28.6139,
    lon: float = 77.2090,
    persona: str = "General Public",
    location_name: Optional[str] = None,
    has_user_profile: bool = False,
) -> RequestPlan:
    """
    Classify user request, determine required data sources, and return a validated RequestPlan.
    Does not execute external model calls; uses deterministic schema routing.
    Never forces Delhi-NCR fallback when a different location or general location is queried.
    """
    q_clean = question.strip()
    q_lower = q_clean.lower()
    resolved_loc_name = location_name or "Selected Location"

    # 1. Out-of-scope check
    if not is_environmental_query(q_clean):
        return RequestPlan(
            intent="out_of_scope",
            is_out_of_scope=True,
            required_sources=[],
            location_name=resolved_loc_name,
            requested_detail="concise",
        )

    # 2. Detail level preference
    detail: DetailLevel = "standard"
    if any(w in q_lower for w in ["brief", "short", "quick", "one sentence", "in short"]):
        detail = "concise"
    elif any(w in q_lower for w in ["explain", "deep dive", "breakdown", "detailed", "analysis"]):
        detail = "deep_dive"

    # 3. Time horizon & day offset
    time_horizon: TimeHorizon = "realtime"
    days_ahead: Optional[int] = None

    if "day after tomorrow" in q_lower:
        time_horizon = "multi_day"
        days_ahead = 2
    elif "tomorrow" in q_lower:
        time_horizon = "tomorrow"
        days_ahead = 1
    elif any(w in q_lower for w in ["next week", "later this week", "7 days", "weekly"]):
        time_horizon = "multi_day"
        days_ahead = 7
    elif any(w in q_lower for w in ["best window", "best time", "when should i", "outdoor window", "favorable time"]):
        time_horizon = "today_window"
    else:
        m = re.search(r'(?:after|in|next)\s+(\d+)\s+days?', q_lower)
        if m:
            time_horizon = "multi_day"
            days_ahead = int(m.group(1))

    # 4. Intent Classification & Selective Data Retrieval Sources
    sources: List[SourceType] = ["verdict", "air_quality", "weather"]
    sub_intent = None

    # Health & Sensitivity & Personal Memory Recall check
    is_memory_inquiry = any(
        w in q_lower for w in [
            "memory", "memories", "remember", "health fact", "saved fact",
            "saved health", "health condition", "sensitivities", "sensitivity",
            "my preference", "check my memory", "check my new memory", "what did i save",
            "what health fact", "recall my", "remark", "remarks", "saved remarks",
        ]
    )

    if is_memory_inquiry:
        intent: IntentType = "health_sensitivity"
        sources.extend(["forecast", "weather", "user_profile", "user_memories"])
        sub_intent = "personal_memory_lookup"

    # Comparisons
    elif any(w in q_lower for w in ["compare", "comparison", "difference between", "cleaner than", "warmer than", "colder than", " vs "]):
        intent = "comparison"
        sources.extend(["forecast", "weather"])
        sub_intent = "location_or_time_comparison"

    # Scientific explanations
    elif any(w in q_lower for w in ["inversion", "how is aqi", "formula", "breakpoint", "speciation", "what does pm2.5 mean", "uncertainty", "science", "scientific", "methodology"]):
        intent = "scientific_explanation"
        sources.extend(["forecast", "weather"])
        sub_intent = "methodology_and_science"

    # Commute & Transit
    elif any(w in q_lower for w in ["commute", "highway", "expressway", "traffic", "route", "drive", "cycling route"]):
        intent = "transit_commute"
        sources.extend(["weather", "traffic_corridors", "user_profile"])
        sub_intent = "arterial_exposure"

    # Fire signals
    elif any(w in q_lower for w in ["fire", "stubble", "hotspot", "satellite", "nasa", "crop burning", "firms"]):
        intent = "fire_satellite"
        sources.extend(["fire_signals", "weather"])
        sub_intent = "upwind_thermal_hotspots"

    # Current Weather Inquiries (temp, wind, rain, humidity, visibility, pressure, sunrise/sunset)
    elif any(w in q_lower for w in [
        "weather", "temperature", "temp", "feels like", "humidity", "humid", "wind",
        "rain", "raining", "precipitation", "visibility", "fog", "pressure", "dew point",
        "sunrise", "sunset", "uv index", "cloud", "overcast", "clear sky",
    ]) and time_horizon == "realtime":
        intent = "current_weather"
        sources.extend(["weather", "forecast"])
        sub_intent = "surface_meteorology"

    # Weather & AQI Trends
    elif any(w in q_lower for w in ["trend", "rising", "falling", "getting better", "getting worse", "improving", "deteriorating"]):
        intent = "weather_trends"
        sources.extend(["forecast", "weather"])
        sub_intent = "atmospheric_trend"

    # Current safety & direct verdict queries
    elif any(w in q_lower for w in ["is it safe", "safe to", "can i go out", "should i stay in", "safe for", "is it healthy"]):
        intent = "current_safety"
        sources.extend(["forecast", "weather"])
        sub_intent = "direct_safety_verdict"

    # Outdoor Planning Activities
    elif any(w in q_lower for w in [
        "jog", "jogging", "run", "running", "marathon", "walk", "walking", "cycle", "cycling",
        "gardening", "picnic", "bbq", "drying clothes", "wash car", "car wash", "exercise", "workout",
        "outdoor event", "play outside", "can kids play",
    ]):
        intent = "outdoor_planning"
        sources.extend(["forecast", "weather", "user_profile"])
        sub_intent = "activity_suitability"

    # Specific pollutant inquiry
    elif any(w in q_lower for w in ["pm2.5", "pm10", "no2", "so2", "ozone", "o3", "carbon monoxide", "why is aqi"]):
        intent = "pollutant_inquiry"
        sources.extend(["weather", "forecast"])
        sub_intent = "chemical_speciation"

    # Forecast & timing
    elif time_horizon in ("today_window", "tomorrow", "multi_day") or any(w in q_lower for w in ["forecast", "future", "later"]):
        intent = "forecast_planning"
        sources.extend(["forecast", "weather"])
        sub_intent = "diurnal_timeline"

    elif any(w in q_lower for w in ["asthma", "inhaler", "kid", "child", "school", "parent", "elderly", "mask", "n95"]):
        intent = "health_sensitivity"
        sources.extend(["forecast", "weather", "user_profile", "user_memories"])
        sub_intent = "vulnerable_protocol"

    else:
        intent = "current_safety"
        sources.extend(["forecast", "weather"])
        sub_intent = "general_verdict"

    # Add memories if user profile exists or if memory is explicitly queried
    if has_user_profile or is_memory_inquiry:
        sources.append("user_memories")

    # Deduplicate sources while preserving order
    deduped_sources: List[SourceType] = []
    for s in sources:
        if s not in deduped_sources:
            deduped_sources.append(s)

    plan = RequestPlan(
        intent=intent,
        sub_intent=sub_intent,
        time_horizon=time_horizon,
        target_location={"lat": lat, "lon": lon},
        location_name=resolved_loc_name,
        required_sources=deduped_sources,
        requested_detail=detail,
        is_out_of_scope=False,
        requires_profile=has_user_profile,
        requires_memories="user_memories" in deduped_sources,
        days_ahead=days_ahead,
    )

    logger.debug(f"Router produced plan: intent={plan.intent}, sources={plan.required_sources}")
    return plan
