"""
WattWise AI — Local LLM Explain & Chat Pydantic Schemas.
Conforms strictly to industrial engineering standards and grounding guidelines.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChartSeriesInfo(BaseModel):
    """Metadata and statistics about an individual series in a chart."""
    name: str
    unit: Optional[str] = None
    color: Optional[str] = None
    peak_value: Optional[float] = None
    average_value: Optional[float] = None
    current_value: Optional[float] = None
    summary_note: Optional[str] = None


class ExplainContext(BaseModel):
    """Structured operational context sent to the contextual AI explainer."""
    component_type: str = Field(
        ...,
        description="Type of dashboard element: 'kpi', 'chart', 'alert', 'machine_card', 'incident', 'banner', 'metric'"
    )
    title: str = Field(..., description="Human-readable title or label of the component")
    identifier: Optional[str] = Field(None, description="Unique identifier (e.g. 'AIR-COMP-01', 'energy_today')")
    
    # Values & metrics
    value: Optional[Any] = Field(None, description="Current measured or displayed value")
    unit: Optional[str] = Field(None, description="Unit of measurement (e.g., 'kWh', 'kW', '₹', 'tCO2e')")
    baseline_or_target: Optional[Any] = Field(None, description="Expected baseline, nominal target, or benchmark value")
    trend: Optional[str] = Field(None, description="Observed trend, e.g. '+8.4% vs yesterday'")
    
    # Temporal & spatial grounding
    timestamp: Optional[str] = Field(None, description="ISO timestamp or display time of the data")
    time_range: Optional[str] = Field(None, description="Active temporal range, e.g. 'Last 24 Hours'")
    site: Optional[str] = Field(default="PrecisionWorks Mfg, Unit 1", description="Industrial facility or campus name")
    asset_id: Optional[str] = Field(None, description="Machine code e.g. 'AIR-COMP-01', 'FURNACE-01'")
    asset_name: Optional[str] = Field(None, description="Machine label e.g. 'Air Compressor (ELGi)'")
    
    # Severity & evidence
    severity: Optional[str] = Field(None, description="Criticality: 'critical', 'high', 'medium', 'low', 'info', 'optimal'")
    evidence: Optional[Dict[str, Any]] = Field(None, description="Key sensor measurements or residual values")
    series: Optional[List[ChartSeriesInfo]] = Field(None, description="Plotted series if component is a chart")
    additional_context: Optional[str] = Field(None, description="Extra domain notes or incident context")


class ExplainRequest(BaseModel):
    """Payload for POST /api/v1/ai/explain."""
    context: ExplainContext
    user_question: Optional[str] = Field(
        None,
        description="Optional follow-up question or specific aspect to explain"
    )


class ExplainResponse(BaseModel):
    """Audit-ready structured explanation adhering strictly to grounding rules."""
    summary: str = Field(..., description="One to two sentence executive summary in plain language")
    what_it_means: str = Field(..., description="Physical and operational meaning of this metric or status")
    why_it_matters: str = Field(..., description="Impact on plant cost, energy efficiency, safety, or equipment health")
    observed_evidence: List[str] = Field(
        default_factory=list,
        description="Factual, measured sensor observations and baseline comparisons (strictly grounded)"
    )
    possible_causes: List[str] = Field(
        default_factory=list,
        description="Potential root causes, clearly marked as unconfirmed engineering hypotheses"
    )
    recommended_actions: List[str] = Field(
        default_factory=list,
        description="Prioritized, safe investigative steps or operational adjustments"
    )
    caveats: List[str] = Field(
        default_factory=list,
        description="Data limitations, sensor quality assumptions, or confidence bounds"
    )
    data_freshness: str = Field(
        default="Telemetry live synced with SCADA timestamp",
        description="Statement regarding telemetry freshness and provenance"
    )
    model_name: str = Field(..., description="Local LLM model name that generated or grounded this response")
    is_grounded: bool = Field(default=True, description="Indicates response adheres to verified telemetry constraints")

    model_config = {"protected_namespaces": ()}


class ChatMessage(BaseModel):
    """Single chat turn in conversation history."""
    role: str = Field(..., description="'system', 'user', or 'assistant'")
    content: str = Field(..., description="Message text")


class ChatRequest(BaseModel):
    """Payload for POST /api/v1/ai/chat."""
    messages: List[ChatMessage] = Field(..., min_length=1)
    current_plant: Optional[str] = Field(default="PrecisionWorks Mfg")
    selected_asset: Optional[str] = Field(default=None)
    active_context: Optional[ExplainContext] = Field(
        default=None,
        description="Active element context if chat was opened from 'Open in Chat'"
    )
    stream: bool = Field(default=False, description="Whether to stream the response via SSE")


class ChatResponse(BaseModel):
    """Non-streaming response for POST /api/v1/ai/chat."""
    message: ChatMessage
    model_name: str
    relevant_references: Optional[List[str]] = Field(
        default_factory=list,
        description="Contextual asset, metric or alert citations referenced in answer"
    )

    model_config = {"protected_namespaces": ()}


class AIStatusResponse(BaseModel):
    """Response schema for GET /api/v1/ai/status."""
    status: str = Field(..., description="'ready', 'degraded', 'unavailable'")
    ollama_url: str
    active_model: str
    available_models: List[str]
    is_local: bool = True
    gpu_accelerated: bool = True
    provider: str = "Ollama Local Inference"
