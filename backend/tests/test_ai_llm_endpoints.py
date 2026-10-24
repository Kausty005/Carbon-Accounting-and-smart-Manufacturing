"""
Tests for Local LLM Contextual AI Explainer and Floating Chatbot.
Verifies grounding, Pydantic schemas, streaming, fallback, and error handling.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_ai_status_endpoint():
    """Verify AI status endpoint reports local Ollama metadata."""
    response = client.get("/api/v1/ai/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "ollama_url" in data
    assert "active_model" in data
    assert data["is_local"] is True
    assert isinstance(data["available_models"], list)

    # Also test legacy alias
    alias_res = client.get("/api/ai/status")
    assert alias_res.status_code == 200
    assert alias_res.json()["status"] == data["status"]


def test_explain_kpi_card_valid():
    """Test explaining a standard KPI card (Energy cost)."""
    payload = {
        "context": {
            "component_type": "kpi",
            "title": "Energy cost",
            "identifier": "energy_cost_today",
            "value": "₹23,044",
            "unit": "INR",
            "trend": "+6.1% vs yesterday",
            "time_range": "Last 24 Hours",
            "site": "PrecisionWorks Mfg",
            "evidence": {"total_energy_kwh": 12480, "avg_tariff_inr": 9.0}
        },
        "user_question": "Why is the energy cost increasing today?"
    }
    response = client.post("/api/v1/ai/explain", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "what_it_means" in data
    assert "why_it_matters" in data
    assert isinstance(data["observed_evidence"], list)
    assert len(data["observed_evidence"]) > 0
    assert isinstance(data["possible_causes"], list)
    assert isinstance(data["recommended_actions"], list)
    assert isinstance(data["caveats"], list)
    assert data["is_grounded"] is True


def test_explain_compressor_unloaded_alert():
    """Test explaining an anomaly alert for Air Compressor."""
    payload = {
        "context": {
            "component_type": "alert",
            "title": "Air compressor running unloaded",
            "identifier": "AIR-COMP-01",
            "asset_id": "AIR-COMP-01",
            "asset_name": "Air Compressor (ELGi)",
            "severity": "critical",
            "value": "18 kW",
            "unit": "kW",
            "evidence": {
                "idle_draw_kw": 18,
                "idle_duration_hrs": 3.2,
                "waste_kwh": 998,
                "cost_inr": 7987
            }
        }
    }
    response = client.post("/api/ai/explain", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "compressor" in data["summary"].lower() or "unloaded" in data["summary"].lower()
    assert len(data["recommended_actions"]) > 0
    # Confirm evidence is present
    evidence_text = " ".join(data["observed_evidence"])
    assert "18" in evidence_text or "998" in evidence_text or "40" in evidence_text


def test_explain_missing_context_fails():
    """Verify validation error when required context fields are missing."""
    invalid_payload = {
        "context": {
            # Missing component_type and title
            "value": 123
        }
    }
    response = client.post("/api/v1/ai/explain", json=invalid_payload)
    assert response.status_code == 422  # Pydantic validation error


def test_chat_endpoint_valid():
    """Test non-streaming multi-turn chat assistant."""
    payload = {
        "messages": [
            {"role": "user", "content": "Which machine is wasting the most energy today?"}
        ],
        "current_plant": "PrecisionWorks Mfg",
        "selected_asset": "AIR-COMP-01"
    }
    response = client.post("/api/v1/ai/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["message"]["role"] == "assistant"
    content = data["message"]["content"]
    assert "compressor" in content.lower()
    assert "model_name" in data


def test_chat_with_active_context():
    """Test asking follow-up question with active KPI context."""
    payload = {
        "messages": [
            {"role": "user", "content": "What can I do to fix this immediately?"}
        ],
        "active_context": {
            "component_type": "alert",
            "title": "Air compressor running unloaded",
            "asset_id": "AIR-COMP-01",
            "asset_name": "Air Compressor (ELGi)",
            "value": "18 kW",
            "severity": "critical"
        }
    }
    response = client.post("/api/ai/chat", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["message"]["content"]) > 20


def test_chat_stream_endpoint():
    """Verify SSE streaming chat endpoint returns formatted data events."""
    payload = {
        "messages": [
            {"role": "user", "content": "Explain the energy demand chart briefly"}
        ],
        "stream": True
    }
    response = client.post("/api/v1/ai/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    content = response.text
    assert "data:" in content
