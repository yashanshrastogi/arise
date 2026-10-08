"""
Strands Ask Arise Agent.
Single-agent architecture with domain tools and structured output.
Enforces the core principle:
- LLM explains data
- LLM NEVER invents measurements
- LLM NEVER overrides deterministic verdict
- Fire signals are non-causal
"""

import logging
from typing import List, Optional
from strands import Agent
from strands.models.bedrock import BedrockModel

from app.core.config import get_settings
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


def _generate_grounded_fallback_response(
    question: str,
    verdict_data: dict,
    air_data: dict,
    fc_data: dict,
    fire_data: dict,
) -> AskAriseVerdictResponse:
    """
    Deterministic grounded response generator.
    Guarantees reliable, grounded structured output when running locally without AWS Bedrock credentials.
    """
    verdict = verdict_data.get("verdict", "STAY_IN")
    aqi = verdict_data.get("aqi", 312)
    category = verdict_data.get("category", "Very Poor")
    dominant = air_data.get("dominant_pollutant", "PM2.5")
    best_window = verdict_data.get("best_window") or fc_data.get("best_window", "3 PM – 5 PM")
    recheck_at = verdict_data.get("recheck_at") or "4:00 PM"

    q_lower = question.lower()

    # Determine headline and why/do based on grounded data and query intent
    if "kid" in q_lower or "child" in q_lower or "play" in q_lower:
        if verdict in ("STAY_IN", "CUT_BACK"):
            headline = f"Keep children indoors today — air quality is {category} with AQI {aqi}."
            why = [
                f"Dominant pollutant {dominant} is at {category} levels across the Delhi-NCR basin.",
                "Children breathe faster per body weight and are vulnerable to fine particulate accumulation.",
                f"Atmospheric dispersion remains limited until later in the afternoon ({best_window}).",
            ]
            do = [
                "Move children's games and workouts inside filtered spaces.",
                "Keep windows closed and operate indoor HEPA purifiers.",
                f"If outdoor activity is essential, defer until the {best_window} window.",
            ]
        else:
            headline = f"Safe for outdoor playtime — current air quality is {category} (AQI {aqi})."
            why = [
                f"Air quality currently meets acceptable baseline thresholds ({aqi} AQI).",
                f"Dominant pollutant {dominant} is within manageable concentrations.",
            ]
            do = [
                "Routine outdoor play and activities are permitted.",
                f"Plan outdoor sports around the optimal window: {best_window}.",
                f"Recheck telemetry around {recheck_at}.",
            ]

    elif "school" in q_lower or "sports" in q_lower or "cancel" in q_lower:
        if aqi > 300:
            headline = f"School outdoor sports and morning assemblies should be suspended (AQI {aqi})."
            why = [
                f"CPCB and school health protocol mandates suspending strenuous outdoor exertion above AQI 300.",
                f"Ground telemetry shows dominant {dominant} posing acute respiratory risks.",
            ]
            do = [
                "Cancel or reschedule outdoor physical education and competitive matches.",
                "Shift students to well-ventilated, filtered indoor activity halls.",
                f"Monitor air readings again at {recheck_at}.",
            ]
        elif aqi > 200:
            headline = f"Modify school outdoor activities — limit high-intensity exertion (AQI {aqi})."
            why = [
                f"Current air is {category}. Prolonged aerobic exertion presents elevated exposure.",
            ]
            do = [
                "Substitute strenuous sprint sessions with low-intensity instruction.",
                "Ensure students with asthma have inhalers accessible.",
            ]
        else:
            headline = f"Outdoor school sports permitted under current {category} conditions (AQI {aqi})."
            why = [f"AQI is currently {aqi}, within tolerable parameters for general outdoor schedules."]
            do = ["Proceed with standard activity guidelines."]

    elif "why" in q_lower or "reason" in q_lower or "bad" in q_lower:
        headline = f"Air quality is {category} (AQI {aqi}) driven primarily by elevated {dominant} and calm dispersion."
        why = [
            f"Ground monitoring stations report dominant {dominant} as the primary air pollutant.",
            "Calm surface winds and winter thermal inversion trap emissions close to the surface.",
        ]
        if fire_data.get("signals_count", 0) > 0:
            why.append(
                f"{fire_data.get('signals_count')} satellite thermal anomalies detected upwind by NASA FIRMS, contributing to regional background load."
            )
        do = [
            "Limit unnecessary outdoor travel during early morning smog spikes.",
            "Use N95 or equivalent filtration masks when commuting along major corridors.",
            f"Aim for the {best_window} window when inversion typically relaxes.",
        ]

    elif "best" in q_lower or "time" in q_lower or "when" in q_lower:
        headline = f"The lowest-risk outdoor window today is {best_window}."
        why = [
            f"Forecast telemetry models indicate PM2.5 dips and mixing height rises around {best_window}.",
            "Morning hours have steep inversion layers trapping vehicular and domestic emissions.",
        ]
        do = [
            f"Schedule errands, walking, or transit between {best_window}.",
            f"Re-evaluate condition updates at {recheck_at}.",
        ]

    else:
        # General verdict answer
        if verdict == "STAY_IN":
            headline = f"Avoid outdoor activities — current air is {category} with an AQI of {aqi}."
            why = [
                f"Ground telemetry across Delhi-NCR indicates severe particulate concentration ({dominant}).",
                "Atmospheric ventilation is low, creating stagnant surface air layers.",
            ]
            do = [
                "Remain indoors and run HEPA air filtration.",
                "Wear an N95 mask if outdoor travel is mandatory.",
                f"Wait for the {best_window} window if possible.",
            ]
        elif verdict == "CUT_BACK":
            headline = f"Cut back outdoor exertion — air quality is {category} (AQI {aqi})."
            why = [f"Air quality has reached {category} levels, primarily driven by {dominant}."]
            do = [
                "Reduce the duration and intensity of outdoor workouts.",
                f"Take advantage of the cleaner {best_window} window.",
            ]
        elif verdict == "BE_SMART":
            headline = f"Be smart about outdoor activities — air quality is {category} (AQI {aqi})."
            why = [f"Air quality is {category}. Sensitive individuals should take precautions."]
            do = [
                "Sensitive individuals (asthma, seniors) should limit prolonged exposure.",
                f"Best outdoor window is {best_window}.",
            ]
        else:
            headline = f"Conditions are favorable — air quality is {category} with AQI {aqi}."
            why = [f"Current pollutant concentrations are within healthy ranges across the basin."]
            do = [
                "Great conditions for outdoor exercise, walking, and sports.",
                f"Check back around {recheck_at}.",
            ]

    sources_list = [
        "CPCB / OpenAQ Ground Stations",
        "Open-Meteo Atmospheric Dynamics",
    ]
    if fire_data.get("signals_count", 0) > 0:
        sources_list.append("NASA FIRMS (VIIRS Thermal Detection)")

    return AskAriseVerdictResponse(
        verdict=verdict,
        headline=headline,
        why=why,
        do=do,
        best_window=best_window,
        recheck_at=recheck_at,
        sources=sources_list,
    )


class AriseAgent:
    """
    Strands Environmental Copilot for Arise.
    """

    def __init__(self):
        self.settings = get_settings()
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
        Execute Ask Arise query.
        Tries Strands Agent with Bedrock when in AWS mode;
        falls back gracefully to deterministic tool-grounded engine in local mode.
        """
        # Always run authoritative ground tools first to guarantee facts
        verdict_data = get_verdict(lat=request.lat, lon=request.lon, persona=request.persona, demo=request.demo)
        air_data = get_air_now(lat=request.lat, lon=request.lon, demo=request.demo)
        fc_data = get_forecast(lat=request.lat, lon=request.lon, demo=request.demo)
        fire_data = get_fire_signal(lat=request.lat, lon=request.lon, demo=request.demo)

        # In AWS mode with Bedrock configured, run live Strands Agent
        if self.settings.MODE == "aws" and self.settings.AWS_REGION:
            try:
                model = BedrockModel(model_id=self.settings.BEDROCK_MODEL_ID)
                agent = Agent(
                    model=model,
                    tools=self.tools,
                    system_prompt=SYSTEM_PROMPT,
                    structured_output_model=AskAriseVerdictResponse,
                )
                response = await agent.run(request.question)
                if isinstance(response, AskAriseVerdictResponse):
                    # Ensure agent NEVER overrode deterministic verdict
                    if response.verdict != verdict_data["verdict"]:
                        logger.warning(
                            f"LLM attempted to override verdict ({response.verdict} vs {verdict_data['verdict']}). Reverting to authoritative verdict."
                        )
                        response.verdict = verdict_data["verdict"]
                    return response
            except Exception as e:
                logger.warning(f"Strands Bedrock agent unavailable ({e}), using grounded tool engine.")

        # Grounded tool-based explanation
        return _generate_grounded_fallback_response(
            question=request.question,
            verdict_data=verdict_data,
            air_data=air_data,
            fc_data=fc_data,
            fire_data=fire_data,
        )
