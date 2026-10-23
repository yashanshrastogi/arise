"""Multi-stage intelligence pipeline package for Arise.

Exposes the stage components and orchestrator:
- Stage A: Request Routing & Planning (router.py)
- Stage B: Context Retrieval (retriever.py)
- Stage C: Context Assembly (assembler.py)
- Stage D: Evaluation & Revision (evaluator.py)
- Orchestrator: IntelligencePipeline (orchestrator.py)
"""

from app.agents.pipeline.router import route_request, RequestPlan, IntentType
from app.agents.pipeline.retriever import retrieve_context, RetrievedContext
from app.agents.pipeline.assembler import (
    assemble_context,
    AssembledPromptContext,
    redact_precise_address,
)
from app.agents.pipeline.evaluator import evaluate_response, EvaluationReport
from app.agents.pipeline.orchestrator import IntelligencePipeline

AssembledContext = AssembledPromptContext

__all__ = [
    "route_request",
    "RequestPlan",
    "IntentType",
    "retrieve_context",
    "RetrievedContext",
    "assemble_context",
    "AssembledPromptContext",
    "AssembledContext",
    "redact_precise_address",
    "evaluate_response",
    "EvaluationReport",
    "IntelligencePipeline",
]
