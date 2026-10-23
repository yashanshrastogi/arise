"""
Stage D: Independent Evaluator & Grounding Critic.
Evaluates candidate assistant responses against retrieved evidence and safety rules.
Verifies completeness, evidence support, coordinate/location matching, and
strictly rejects answers that contradict authoritative deterministic CPCB verdicts.
"""

import logging
import re
from typing import List, Optional
from pydantic import BaseModel, Field

from app.agents.pipeline.router import RequestPlan
from app.agents.pipeline.retriever import RetrievedContext
from app.agents.schemas import AskAriseVerdictResponse

logger = logging.getLogger("arise.pipeline.evaluator")


class EvaluationReport(BaseModel):
    """Structured evaluation report on response accuracy and safety compliance."""
    passed: bool
    completeness_score: float = Field(default=1.0, ge=0.0, le=1.0)
    grounding_score: float = Field(default=1.0, ge=0.0, le=1.0)
    verdict_consistent: bool = True
    location_consistent: bool = True
    issues: List[str] = Field(default_factory=list)
    suggested_revisions: List[str] = Field(default_factory=list)


def evaluate_response(
    response: AskAriseVerdictResponse,
    retrieved: RetrievedContext,
    plan: RequestPlan,
    question: str,
) -> EvaluationReport:
    """
    Independent deterministic evaluator checking candidate answer against evidence.
    """
    issues: List[str] = []
    revisions: List[str] = []
    passed = True
    verdict_consistent = True
    location_consistent = True

    # 1. Authoritative Verdict Compliance Check (Strict Invariant)
    expected_verdict = (retrieved.verdict_data.get("verdict") or "BE_SMART").replace("_", " ").upper()
    response_verdict = (response.verdict or "").replace("_", " ").upper()

    if expected_verdict and response_verdict != expected_verdict:
        passed = False
        verdict_consistent = False
        issues.append(
            f"Verdict contradiction: Authoritative verdict is '{expected_verdict}', "
            f"but model returned '{response_verdict}'."
        )
        revisions.append(f"Enforce verdict strictly to '{expected_verdict}'.")

    # 2. Location Consistency Check
    expected_loc = (plan.location_name or "").lower().strip()
    headline_lower = (response.headline or "").lower()
    why_text = " ".join(response.why).lower()

    if expected_loc and expected_loc not in ("delhi-ncr", "delhi", "india", ""):
        # Check if the answer mentions a completely different city when a specific city was targeted
        if "delhi" in headline_lower and expected_loc not in headline_lower and "greater noida" in expected_loc:
            issues.append(f"Location mismatch: Query was for '{expected_loc}', but response text emphasizes 'Delhi'.")
            revisions.append(f"Ground recommendations specifically for {plan.location_name}.")

    # 3. Completeness Check
    q_lower = question.lower()
    if not response.headline or len(response.headline.strip()) < 8:
        passed = False
        issues.append("Headline is missing or trivial.")
        revisions.append("Provide a clear, one-sentence plain English answer.")

    # Check if a future forecast query was answered with future information
    if plan.time_horizon in ("tomorrow", "multi_day") or "tomorrow" in q_lower or "days" in q_lower:
        forecast_terms = ["tomorrow", "day", "forecast", "projected", "expected", "will be", "trend"]
        if not any(t in headline_lower or any(t in w.lower() for w in response.why) for t in forecast_terms):
            issues.append("Question asked about a future timeframe, but response does not cite forecast trajectory.")
            revisions.append("Include predicted temperatures or AQI trajectory from the forecast dataset.")

    # 4. Telemetry Grounding & Fabricated Metric Check
    expected_aqi = retrieved.verdict_data.get("aqi")
    if expected_aqi is not None:
        # Check if response cited an AQI that radically differs by > 50 points from authoritative score
        cited_numbers = re.findall(r"\baqi\s*(?:of\s*)?(\d{2,3})\b", headline_lower + " " + why_text)
        for num_str in cited_numbers:
            val = int(num_str)
            if abs(val - expected_aqi) > 40:
                issues.append(
                    f"Factual discrepancy: Authoritative AQI is {expected_aqi}, but text cites AQI {val}."
                )
                revisions.append(f"Cite verified AQI {expected_aqi}.")

    # 5. Missing Data & Honesty Check
    if expected_aqi is None and "unavailable" not in (response.category or "").lower():
        if "aqi is good" in headline_lower or "aqi is 0" in headline_lower:
            passed = False
            issues.append("Fabricated zero score: Telemetry is unavailable but response reported clean air.")
            revisions.append("State truthfully that local ground station data is currently unavailable.")

    # 6. Practical Feasibility & Waking Hours Check
    from app.agents.arise_agent import is_practical_outdoor_window
    if response.best_window and not is_practical_outdoor_window(response.best_window):
        response.best_window = "No recommended outdoor window"

    # Compute scores
    completeness = 1.0 if not any("missing" in i.lower() for i in issues) else 0.6
    grounding = 1.0 if (verdict_consistent and not any("factual" in i.lower() for i in issues)) else 0.5
    if not passed or len(issues) > 0:
        passed = len(issues) == 0

    report = EvaluationReport(
        passed=passed,
        completeness_score=completeness,
        grounding_score=grounding,
        verdict_consistent=verdict_consistent,
        location_consistent=location_consistent,
        issues=issues,
        suggested_revisions=revisions,
    )

    logger.debug(f"EvaluationReport: passed={report.passed}, issues={report.issues}")
    return report
