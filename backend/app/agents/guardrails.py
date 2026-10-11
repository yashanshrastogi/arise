"""
Arise Scope Guardrail & Domain Verification for Environmental Copilot.
Restricts the AI strictly to the context of air quality, meteorology,
outdoor health precautions, and environmental telemetry.
"""

import re
from typing import List
from app.agents.schemas import AskAriseVerdictResponse

# Regex with strict word boundaries to avoid false positives (e.g. 'code' matching 'co', 'airplane' matching 'air')
ENVIRONMENTAL_REGEX = re.compile(
    r"\b("
    # Air quality & pollutants
    r"aqi|air|airshed|basin|cpcb|openaq|pm2\.5|pm25|pm10|pm\s*2\.5|pm\s*10|"
    r"pollut\w*|smog|smoke|haze|dust|particulate\w*|ozone|o3|no2|so2|co2|carbon monoxide|"
    r"emission\w*|exhaust|stubble|parali|inversion|stagnat\w*|boundary layer|"
    # Weather & atmospheric dynamics
    r"weather|temp|temperature\w*|forecast\w*|wind\w*|breeze|rain\w*|cloud\w*|sun\w*|uv|"
    r"humid\w*|climate|celsius|fahrenheit|degree\w*|hot|cold|warm\w*|chilly|winter|monsoon|fog|visibility|"
    # Outdoor activities & exposure safety
    r"go out|going out|outside|outdoor\w*|stay in|staying in|walk\w*|run\w*|jog\w*|marathon|"
    r"exercise\w*|workout\w*|gym|cycle\w*|cycling|bike|biking|commute\w*|transit|play\w*|playground|park|"
    r"safe|safety|hazard\w*|risk\w*|"
    # Sensitive demographics & health symptoms
    r"kid\w*|child\w*|baby|babies|toddler\w*|school\w*|student\w*|sports|elderly|senior\w*|"
    r"parent\w*|grandparent\w*|asthma|respiratory|breath\w*|lung\w*|cough\w*|throat|allergy|allergies|inhaler|"
    # Protective actions & protocols
    r"mask\w*|n95|kn95|ffp2|purifier\w*|hepa|filter\w*|filtration|window\w*|balcony|indoor\w*|recirculat\w*|"
    # Satellite fire anomalies & agricultural burning
    r"fire\w*|burn\w*|flame\w*|hotspot\w*|thermal|firms|viirs|modis|"
    # Geographic airshed
    r"delhi|ncr|noida|gurugram|gurgaon|ghaziabad|faridabad|mandir marg|anand vihar|punjab|haryana|"
    # Platform & environmental telemetry
    r"arise|telemetry|sensor\w*|station\w*"
    r")\b",
    re.IGNORECASE
)


def is_environmental_query(question: str) -> bool:
    """
    Check if a query is within Arise's environmental domain using word-boundary matching.
    """
    if not question:
        return False
    q = question.strip()
    if not q:
        return False
    return bool(ENVIRONMENTAL_REGEX.search(q))


def get_out_of_scope_response(question: str) -> AskAriseVerdictResponse:
    """
    Generate a polite, user-training denial response for off-topic queries,
    highlighting key terms and coaching the user on what Arise can do.
    """
    return AskAriseVerdictResponse(
        verdict="BE_SMART",
        headline="I am **Arise**, an **environmental intelligence assistant**. I focus on **air quality**, **weather**, **health advisories**, and **environmental telemetry**.",
        why=[
            "I am **Arise**, an **environmental intelligence assistant**. I focus on **air quality**, **weather**, **health advisories**, and **environmental telemetry**.",
            "If you have general coding, math, or off-topic questions, I politely decline so I remain dedicated to atmospheric and health intelligence.",
        ],
        do=[
            "Ask: *\"Can I go for an outdoor run right now?\"* to evaluate **respiratory exertion safety**.",
            "Ask: *\"Is the air safe for children or elderly parents?\"* for **tailored group health advisories**.",
            "Ask: *\"What is the current temperature and wind speed?\"* for **real-time meteorological telemetry**.",
            "Ask: *\"Write a python script to fetch air data\"* for **Arise environmental REST API integration**.",
        ],
        best_window="Check live hourly forecast",
        recheck_at="Hourly",
        sources=["Arise Intelligence Guardrail"],
        assistant_label="Arise Intelligence (Scope Guardrail)",
        is_rule_based=True,
        provider="rule-based",
        timestamp="Scope Guidance",
    )
