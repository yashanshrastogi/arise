from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

from app.domain.models import EnvironmentalSnapshot, WeatherSnapshot


class VerdictOutput(BaseModel):
    verdict: str = Field(description="GO | BE_SMART | CUT_BACK | STAY_IN")
    headline: str
    recommendation: str
    aqi: int = 0
    category: str = "Good"
    why: List[Dict[str, str]] = Field(default_factory=list)
    do: List[str] = Field(default_factory=list)
    best_window: Optional[str] = None
    recheck_at: str
    sources: List[Dict[str, str]] = Field(default_factory=list)
    persona: str = "General Public"
    school_action: Optional[str] = None # GO | MODIFY | CANCEL


# Verdict tiers in order of severity
VERDICT_TIERS = ["GO", "BE_SMART", "CUT_BACK", "STAY_IN"]


def get_base_verdict(aqi: int) -> str:
    """Base environmental thresholding aligned with CPCB and PRODUCT.md."""
    if aqi <= 100:
        return "GO"
    elif aqi <= 200:
        return "BE_SMART"
    elif aqi <= 300:
        return "CUT_BACK"
    else:
        return "STAY_IN"


def escalate_tier(tier: str) -> str:
    """Make verdict one tier more cautious for vulnerable demographics."""
    idx = VERDICT_TIERS.index(tier)
    if idx < len(VERDICT_TIERS) - 1:
        return VERDICT_TIERS[idx + 1]
    return tier


def evaluate_environment(
    snapshot: EnvironmentalSnapshot,
    persona: str = "General Public"
) -> VerdictOutput:
    """
    Pure deterministic verdict engine.
    Applies health guidelines strictly based on environmental data and persona risk profiles.
    The LLM never computes or overrides this decision.
    """
    aqi = snapshot.aqi
    base_verdict = get_base_verdict(aqi)
    p_clean = persona.strip().lower()

    # Vulnerability adjustments
    effective_verdict = base_verdict
    is_vulnerable = any(k in p_clean for k in ("child", "parent", "elderly", "asthma", "senior"))
    is_athlete = "athlete" in p_clean
    is_school = any(k in p_clean for k in ("school", "principal", "admin"))
    is_worker = any(k in p_clean for k in ("worker", "labour", "traffic", "police"))

    if is_vulnerable and aqi > 50:
        effective_verdict = escalate_tier(base_verdict)
    elif is_athlete and aqi > 150 and base_verdict == "BE_SMART":
        effective_verdict = "CUT_BACK"

    # Headline and core actions
    if effective_verdict == "GO":
        headline = "Air quality is favorable. Outdoor activities are safe."
        recommendation = "Enjoy outdoor activities. Air pollution levels are within healthy thresholds."
        do_actions = [
            "Normal outdoor recreation and exercise permitted.",
            "Ventilate homes and classrooms during daylight hours.",
            "No masking required for healthy individuals."
        ]
        school_act = "GO"
    elif effective_verdict == "BE_SMART":
        headline = "Moderate pollution levels. Exercise caution during extended exertion."
        recommendation = "Sensitive individuals should limit prolonged heavy outdoor exertion."
        do_actions = [
            "Reduce heavy outdoor aerobic sessions if feeling respiratory discomfort.",
            "Keep windows closed during early morning and late evening rush hours.",
            "Vulnerable groups should carry inhalers/medication if outdoors."
        ]
        school_act = "MODIFY"
    elif effective_verdict == "CUT_BACK":
        headline = "Poor air quality. Reduce unnecessary outdoor exposure."
        recommendation = "Limit intense outdoor activity. Use certified N95 masks if commuting outdoors."
        do_actions = [
            "Move high-intensity cardio exercises indoors.",
            "Avoid prolonged exposure near high-traffic arterial roads.",
            "Run HEPA indoor air purifiers where available."
        ]
        school_act = "MODIFY"
    else: # STAY_IN
        headline = "Severe particulate load. Outdoor exposure should be avoided."
        recommendation = "Outdoor exposure should be minimized today. Keep windows closed and use air purifiers if available."
        do_actions = [
            "Cancel or reschedule outdoor sports and recreational activities.",
            "Wear a well-fitted N95/FFP2 mask for essential transit.",
            "Keep indoor air recirculating and maintain sealed doors/windows."
        ]
        school_act = "CANCEL"

    # Specific school action override
    if is_school:
        if aqi > 250:
            school_act = "CANCEL"
        elif aqi > 100:
            school_act = "MODIFY"
        else:
            school_act = "GO"

    # Deterministic why explanations from snapshot
    why_items: List[Dict[str, str]] = []
    
    # 1. Dominant pollutant
    if snapshot.dominant_pollutant:
        pol_m = snapshot.pollutants.get(snapshot.dominant_pollutant)
        val_str = f"{pol_m.value} {pol_m.unit}" if pol_m else "elevated"
        why_items.append({
            "label": f"{snapshot.dominant_pollutant} is dominant",
            "detail": f"Fine particulate concentration at {val_str}. Primary driver of local AQI.",
            "type": "pollutant"
        })

    # 2. Meteorological dispersion
    if snapshot.weather:
        w = snapshot.weather
        if w.wind_speed < 5.0:
            why_items.append({
                "label": "Calm surface wind",
                "detail": f"Surface wind at {w.wind_speed} km/h ({w.wind_direction}) limits horizontal ventilation.",
                "type": "weather"
            })
        if w.humidity > 70:
            why_items.append({
                "label": "High humidity & haze",
                "detail": f"High relative humidity ({int(w.humidity)}%) promotes secondary particulate condensation.",
                "type": "weather"
            })

    # 3. Fire signals (always signal language, never direct causation proof)
    if snapshot.fire_signals:
        why_items.append({
            "label": "Upwind thermal signals detected",
            "detail": f"{len(snapshot.fire_signals)} satellite fire signals detected in monitored regional basins.",
            "type": "fire"
        })

    # 4. Regional baseline
    if aqi > 200:
        why_items.append({
            "label": "Low atmospheric mixing depth",
            "detail": "Seasonal boundary layer suppression trapping emissions near surface level.",
            "type": "atmosphere"
        })

    # Sources
    sources = [
        {"name": "CPCB / Delhi-NCR Station Network", "time": snapshot.timestamp},
        {"name": "Open-Meteo Surface Dynamics", "time": snapshot.timestamp}
    ]
    if snapshot.fire_signals:
        is_demo_fires = any(f.source == "DEMO" for f in snapshot.fire_signals)
        sources.append({
            "name": "NASA FIRMS (Demo Simulation)" if is_demo_fires else "NASA FIRMS (VIIRS Near-Real-Time)",
            "time": snapshot.timestamp
        })

    return VerdictOutput(
        verdict=effective_verdict,
        headline=headline,
        recommendation=recommendation,
        aqi=snapshot.aqi,
        category=snapshot.aqi_category,
        why=why_items,
        do=do_actions,
        best_window=snapshot.best_window or "3 PM – 5 PM",
        recheck_at=snapshot.recheck_at or "4:00 PM",
        sources=sources,
        persona=persona,
        school_action=school_act
    )
