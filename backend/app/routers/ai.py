"""
WattWise AI — Local LLM Contextual Explainer & Floating Chatbot Router.
Endpoints:
  GET   /api/v1/ai/status
  GET   /api/v1/ai/models
  POST  /api/v1/ai/explain
  POST  /api/v1/ai/chat
  POST  /api/v1/ai/chat/stream
Also aliased without /v1 prefix for maximum frontend compatibility:
  /api/ai/status
  /api/ai/explain
  /api/ai/chat
  /api/ai/chat/stream
"""

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from backend.app.schemas.ai import (
    AIStatusResponse,
    ChatRequest,
    ChatResponse,
    ExplainRequest,
    ExplainResponse,
)
from backend.app.services.ollama_service import ollama_service

router = APIRouter(prefix="/api/v1/ai", tags=["Local AI Intelligence"])
legacy_router = APIRouter(prefix="/api/ai", tags=["Local AI Intelligence (Aliased)"])


@router.get("/status", response_model=AIStatusResponse)
@legacy_router.get("/status", response_model=AIStatusResponse)
async def get_ai_status():
    """
    Check availability of local Ollama inference service,
    installed LLM models, active selected model, and GPU acceleration.
    """
    try:
        return await ollama_service.check_status()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check AI status: {str(e)}",
        )


@router.get("/models", response_model=List[str])
@legacy_router.get("/models", response_model=List[str])
async def list_available_models():
    """List locally installed Ollama models without external egress."""
    return await ollama_service.get_available_models()


@router.post("/explain", response_model=ExplainResponse)
@legacy_router.post("/explain", response_model=ExplainResponse)
async def explain_dashboard_element(request: ExplainRequest):
    """
    Generate an audit-grade, grounded industrial explanation for any clicked
    dashboard KPI, chart, machine card, alert, or incident.
    """
    try:
        return await ollama_service.explain(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Contextual explanation failed: {str(e)}",
        )


@router.post("/chat", response_model=ChatResponse)
@legacy_router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(request: ChatRequest):
    """
    Conversational assistant grounded in real-time plant telemetry,
    energy demand, and selected asset context.
    """
    try:
        return await ollama_service.chat(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Chat generation failed: {str(e)}",
        )


@router.post("/chat/stream")
@legacy_router.post("/chat/stream")
async def chat_stream_with_assistant(request: ChatRequest):
    """
    Stream tokens from local Ollama using Server-Sent Events (SSE)
    for responsive, word-by-word streaming in the floating chatbot.
    """
    try:
        return StreamingResponse(
            ollama_service.chat_stream(request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Streaming chat failed: {str(e)}",
        )
