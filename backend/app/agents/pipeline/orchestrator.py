"""
Multi-Stage Intelligence Pipeline Orchestrator.
Coordinates Stage A (Planner), Stage B (Retriever), Stage C (Assembler),
Stage D (Generator), Stage E (Evaluator), and Stage F (Conditional Revision).
Enforces strict deterministic verdict compliance and records safe observability metrics.
"""

from datetime import datetime, timezone
import logging
import time
from typing import Any, Dict, List, Optional

from app.core.config import get_settings
from app.core.secrets import get_secret
from app.agents.schemas import AskAriseRequest, AskAriseVerdictResponse
from app.agents.guardrails import get_out_of_scope_response
from app.agents.pipeline.router import route_request, RequestPlan
from app.agents.pipeline.retriever import retrieve_context, RetrievedContext
from app.agents.pipeline.assembler import assemble_context
from app.agents.pipeline.evaluator import evaluate_response, EvaluationReport
from app.agents.arise_agent import _generate_grounded_fallback_response
from app.agents.gemini_provider import (
    invoke_gemini,
    GeminiTimeoutError,
    GeminiRateLimitError,
    GeminiProviderError,
)
from app.services.memories import MemoryService
from app.domain.chat_models import ChatMessage

logger = logging.getLogger("arise.pipeline.orchestrator")


class IntelligencePipeline:
    def __init__(self):
        self.settings = get_settings()
        self.memory_service = MemoryService()

    async def execute(
        self,
        request: AskAriseRequest,
        conversation_history: Optional[List[ChatMessage]] = None,
        user_id: Optional[str] = None,
    ) -> AskAriseVerdictResponse:
        """
        Execute full multi-stage intelligence pipeline with evaluation and conditional revision.
        """
        t0 = time.time()
        stage_timings: Dict[str, float] = {}

        # ── STAGE A: REQUEST PLANNER ──
        t_plan_start = time.time()
        plan: RequestPlan = route_request(
            question=request.question,
            lat=request.lat,
            lon=request.lon,
            persona=request.persona,
            location_name=request.location_name,
            has_user_profile=bool(request.user_context or user_id),
        )
        stage_timings["planner_ms"] = round((time.time() - t_plan_start) * 1000, 1)

        # Handle Out of Scope queries immediately
        if plan.is_out_of_scope:
            oos = get_out_of_scope_response(request.question)
            resp = AskAriseVerdictResponse(
                verdict=oos["verdict"],
                aqi=oos.get("aqi"),
                category=oos.get("category"),
                headline=oos["headline"],
                why=oos["why"],
                do=oos["do"],
                best_window=oos["best_window"],
                recheck_at=oos["recheck_at"],
                sources=["Arise Scope Policy"],
                assistant_label="Arise Scope Guardrail",
                is_rule_based=True,
                provider="rule-based",
                timestamp=oos.get("timestamp", "Live"),
            )
            return resp

        # ── STAGE B: CONTEXT RETRIEVER ──
        t_ret_start = time.time()
        retrieved: RetrievedContext = await retrieve_context(
            plan=plan,
            lat=request.lat,
            lon=request.lon,
            persona=request.persona,
            demo=request.demo,
            user_id=user_id,
            user_context=request.user_context,
            environmental_context=request.environmental_context,
            memory_service=self.memory_service,
        )
        stage_timings["retriever_ms"] = round((time.time() - t_ret_start) * 1000, 1)

        # ── STAGE C: TASK-SPECIFIC CONTEXT ASSEMBLER ──
        t_asm_start = time.time()
        assembled = assemble_context(
            retrieved=retrieved,
            question=request.question,
            conversation_history=conversation_history,
            persona=request.persona,
        )
        stage_timings["assembler_ms"] = round((time.time() - t_asm_start) * 1000, 1)

        # ── STAGE D: ANSWER GENERATION ──
        t_gen_start = time.time()
        candidate_response: Optional[AskAriseVerdictResponse] = None
        from app.agents.arise_agent import AriseAgent
        try:
            agent = AriseAgent()
            candidate_response = await agent.answer(
                request=request,
                assembled_context=assembled,
                approved_memories=retrieved.approved_memories,
                user_id=user_id,
                retrieved_context=retrieved,
            )
        except Exception as ge:
            logger.warning(f"Answer generation error ({ge}). Falling back to rule engine.")
            candidate_response = _generate_grounded_fallback_response(
                question=request.question,
                verdict_data=retrieved.verdict_data,
                air_data=retrieved.air_data,
                fc_data=retrieved.forecast_data,
                fire_data=retrieved.fire_data,
                location_name=request.location_name,
                user_context=request.user_context,
                environmental_context=request.environmental_context,
                approved_memories=retrieved.approved_memories,
                route_data=retrieved.route_data,
            )

        stage_timings["generator_ms"] = round((time.time() - t_gen_start) * 1000, 1)

        # ── STAGE E: INDEPENDENT EVALUATION ──
        t_eval_start = time.time()
        report: EvaluationReport = evaluate_response(
            response=candidate_response,
            retrieved=retrieved,
            plan=plan,
            question=request.question,
        )
        stage_timings["evaluator_ms"] = round((time.time() - t_eval_start) * 1000, 1)

        # ── STAGE F: CONDITIONAL REVISION (Max 1 attempt) ──
        revisions_count = 0
        if not report.passed and revisions_count < 1:
            revisions_count += 1
            logger.info(f"Applying conditional revision based on evaluator feedback: {report.issues}")

            # 1. Enforce authoritative verdict strictly
            expected_verdict = (retrieved.verdict_data.get("verdict") or "BE_SMART").replace("_", " ").upper()
            if candidate_response.verdict.replace("_", " ").upper() != expected_verdict:
                candidate_response.verdict = expected_verdict

            # 2. Check for missing forecast data in future questions
            if any("future timeframe" in issue for issue in report.issues):
                daily = (
                    retrieved.forecast_data.get("daily")
                    or retrieved.forecast_data.get("daily_forecast")
                    or []
                )
                if daily and len(daily) > 1:
                    day1 = daily[1]
                    candidate_response.why.append(
                        f"Forecast trajectory: Tomorrow is expected to reach AQI {day1.get('aqi', '—')} "
                        f"with temperatures around {day1.get('temp', '—')}°C."
                    )

            # Re-evaluate revised answer
            report = evaluate_response(
                response=candidate_response,
                retrieved=retrieved,
                plan=plan,
                question=request.question,
            )

        # ── METADATA & OBSERVABILITY ATTACHMENT ──
        total_duration = round((time.time() - t0) * 1000, 1)
        stage_timings["total_ms"] = total_duration

        # Ensure authoritative verdict and AQI are guaranteed
        authoritative_verdict = (retrieved.verdict_data.get("verdict") or "BE_SMART").replace("_", " ").upper()
        if candidate_response.verdict.replace("_", " ").upper() != authoritative_verdict:
            candidate_response.verdict = authoritative_verdict

        if retrieved.verdict_data.get("aqi") is not None:
            candidate_response.aqi = retrieved.verdict_data["aqi"]

        # Populate telemetry sources while preserving existing assistant source tags
        if not retrieved.sources:
            # All telemetry was unavailable; preserve fallback single source
            candidate_response.sources = [s for s in (candidate_response.sources or []) if "Assistant" in s] or ["Arise Assistant (rule-based)"]
        else:
            combined_sources = list(candidate_response.sources or [])
            for s in retrieved.sources:
                if s not in combined_sources:
                    combined_sources.append(s)
            candidate_response.sources = combined_sources

        logger.info(
            f"Pipeline complete in {total_duration}ms. "
            f"Intent: {plan.intent}, Passed: {report.passed}, Revisions: {revisions_count}"
        )

        return candidate_response
