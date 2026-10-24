"""
Unit & Integration Tests for FastAPI Endpoints and Report Generators.
Tests listing anomalies, filtering, dashboard KPIs, status patching,
and real PDF / Word (.docx) report generation in the integrated application.
"""

import os
from pathlib import Path

import docx
import pymupdf
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.routers.anomalies import get_incident_store


@pytest.fixture
def client():
    return TestClient(app)


def test_api_health(client):
    """Test health check endpoint."""
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "total_incidents_tracked" in data


def test_dashboard_summary(client):
    """Test dashboard summary endpoint."""
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 200
    data = res.json()
    assert "kpis" in data
    assert "distributions" in data
    assert "recent_incidents" in data
    kpis = data["kpis"]
    assert "total_anomalies_detected" in kpis
    assert "total_excess_kwh" in kpis
    assert "estimated_cost_inr" in kpis
    assert "estimated_co2e_kg" in kpis


def test_list_anomalies_and_filtering(client):
    """Test listing anomalies and query parameters."""
    res = client.get("/api/anomalies?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) <= 10

    # Filter by severity
    res_crit = client.get("/api/anomalies?severity=critical")
    assert res_crit.status_code == 200
    for item in res_crit.json()["items"]:
        assert item["severity"] == "critical"

    # Filter by anomaly_type
    res_type = client.get("/api/anomalies?anomaly_type=thermal_runaway")
    assert res_type.status_code == 200
    for item in res_type.json()["items"]:
        assert item["anomaly_type"] == "thermal_runaway"


def test_get_specific_incident(client):
    """Test fetching single incident by ID."""
    store = get_incident_store()
    assert len(store.incidents) > 0
    first_id = list(store.incidents.keys())[0]

    res = client.get(f"/api/anomalies/{first_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["incident_id"] == first_id
    assert "telemetry_window" in data
    assert "evidence" in data
    assert "recommended_action" in data


def test_unknown_incident_404(client):
    """Test 404 on nonexistent incident ID."""
    res = client.get("/api/anomalies/NONEXISTENT_INCIDENT_ID")
    assert res.status_code == 404


def test_patch_incident_status(client):
    """Test updating incident investigation status and technician notes."""
    store = get_incident_store()
    first_id = list(store.incidents.keys())[0]

    payload = {
        "status": "Investigating",
        "technician_notes": "Technician dispatched to floor for vibration analysis.",
        "resolution_notes": "Awaiting spectral results."
    }
    res = client.patch(f"/api/anomalies/{first_id}/status", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["incident"]["status"] == "Investigating"
    assert data["incident"]["technician_notes"] == payload["technician_notes"]

    # Verify invalid status returns 422
    bad_res = client.patch(f"/api/anomalies/{first_id}/status", json={"status": "INVALID_STATUS"})
    assert bad_res.status_code == 422


def test_download_pdf_report(client):
    """Test PDF report generation and download headers."""
    store = get_incident_store()
    first_id = list(store.incidents.keys())[0]

    res = client.post(f"/api/anomalies/{first_id}/report?format=pdf")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment" in res.headers.get("content-disposition", "")
    assert ".pdf" in res.headers.get("content-disposition", "")
    assert len(res.content) > 1000

    # Verify that the returned bytes form a readable PDF
    pdf_doc = pymupdf.open(stream=res.content, filetype="pdf")
    assert len(pdf_doc) >= 1
    page1_text = pdf_doc[0].get_text()
    assert "PRECISIONWORKS" in page1_text
    assert "EQUIPMENT ANOMALY INCIDENT REPORT" in page1_text
    pdf_doc.close()


def test_download_docx_report(client):
    """Test Word DOCX report generation and download headers."""
    store = get_incident_store()
    first_id = list(store.incidents.keys())[0]

    res = client.post(f"/api/anomalies/{first_id}/report?format=docx")
    assert res.status_code == 200
    assert "wordprocessingml.document" in res.headers["content-type"]
    assert ".docx" in res.headers.get("content-disposition", "")
    assert len(res.content) > 1000

    # Verify that the returned bytes form a readable DOCX
    import io
    doc = docx.Document(io.BytesIO(res.content))
    headings = [p.text for p in doc.paragraphs if p.text]
    assert any("EQUIPMENT ANOMALY INCIDENT REPORT" in h for h in headings)


def test_invalid_report_format(client):
    """Test error on invalid report format."""
    store = get_incident_store()
    first_id = list(store.incidents.keys())[0]

    res = client.post(f"/api/anomalies/{first_id}/report?format=xml")
    assert res.status_code in [400, 422]


def test_frontend_mount(client):
    """Test that prebuilt Vite React dashboard is served at root."""
    res = client.get("/")
    assert res.status_code == 200
    assert "<!DOCTYPE html>" in res.text or "<!doctype html>" in res.text.lower()
    assert "root" in res.text


def test_api_decoupling_and_leakage_safety(client):
    """
    Verify that:
    1. Leakage columns are never required or produced as model features.
    2. Health anomalies and excess-energy calculations remain separated.
    """
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 200
    data = res.json()
    kpis = data["kpis"]
    
    # Total anomalies is distinct from energy waste instances
    assert "total_anomalies_detected" in kpis
    assert "total_excess_kwh" in kpis
    
    # Verify incident item details do not have leakage features
    res_list = client.get("/api/anomalies?page=1&page_size=5")
    items = res_list.json()["items"]
    forbidden_features = ["is_anomaly", "alert_code", "rolling_anomaly_rate", "maintenance_priority_score"]
    for item in items:
        if "actual_sensor_values" in item:
            for k in forbidden_features:
                assert k not in item["actual_sensor_values"]


def test_incident_details_schema_mapping(client):
    """
    Verify the exact schema mapping required by the incident details panel
    for target incident INC-EQ-002-20240107_223300.
    """
    target_id = "INC-EQ-002-20240107_223300"
    res = client.get(f"/api/anomalies/{target_id}")
    assert res.status_code == 200
    data = res.json()

    inc = data.get("incident") or data
    assert inc["incident_id"] == target_id
    assert inc["equipment_id"] == "EQ-002"
    assert inc["anomaly_type"] == "thermal_runaway"
    assert inc["severity"] == "critical"
    assert inc["model_name"] == "Supervised Random Forest"
    assert inc["model_score"] == 0.39
    assert inc["actual_power_kw"] == 51.16
    assert inc["expected_power_kw"] == 52.8
    assert inc["deviation_kw"] == -1.64
    assert inc["deviation_pct"] == -3.1
    assert inc["status"] == "New"

    assert isinstance(inc["evidence"], list)
    assert len(inc["evidence"]) >= 2
    assert any("temperature" in ev.lower() for ev in inc["evidence"])
    assert "coolant" in inc["recommended_action"].lower()

    assert "sensor_readings" in inc
    sensors = inc["sensor_readings"]
    assert "temperature_c" in sensors
    assert sensors["temperature_c"] == 137.96
    assert "vibration_mm_s" in sensors
    assert sensors["vibration_mm_s"] == 0.24
    assert "pressure_kpa" in sensors
    assert sensors["pressure_kpa"] == 150.75
    assert "power_consumption_kw" in sensors
    assert sensors["power_consumption_kw"] == 51.16

    assert "telemetry_window" in data
    window = data["telemetry_window"]
    assert len(window) > 0
    first_pt = window[0]
    assert "power_consumption_kw" in first_pt
    assert "temperature_c" in first_pt
    assert "vibration_mm_s" in first_pt
    assert "pressure_kpa" in first_pt
    assert "timestamp" in first_pt
    assert any(pt.get("is_incident_point") is True for pt in window)


def test_incident_missing_optional_fields_and_decoupling(client):
    """
    Verify that thermal health anomalies with normal power consumption:
    1. Have estimated_excess_energy_kwh as None (not falsely billed as energy waste).
    2. Handle missing or optional fields gracefully without 500 or NaN serialization errors.
    """
    target_id = "INC-EQ-002-20240107_223300"
    res = client.get(f"/api/anomalies/{target_id}")
    assert res.status_code == 200
    data = res.json()
    inc = data.get("incident") or data

    assert inc["estimated_excess_energy_kwh"] is None

    window = data["telemetry_window"]
    for pt in window:
        assert pt["timestamp"] is not None
        for k, v in pt.items():
            if isinstance(v, float):
                import math
                assert not math.isnan(v)
                assert not math.isinf(v)


def test_confidence_semantics_and_defensible_mapping(client):
    """
    Verify defensible model confidence semantics across detection methods:
    1. Condition-aware baseline threshold rules must NOT report 0.0% confidence;
       they must report confidence=None, confidence_available=False, and detection_method='condition_aware_baseline'.
    2. Supervised Random Forest with validated predict_proba reports calibrated confidence.
    3. Unsupervised Isolation Forest preserves raw decision margin in anomaly_score, but confidence is None.
    """
    # 1. Condition-aware baseline rule incident (e.g. FURNACE idle excess power)
    furnace_id = "INC-FURNACE-01-20240130_232500"
    res1 = client.get(f"/api/anomalies/{furnace_id}")
    if res1.status_code == 200:
        d1 = res1.json()
        inc1 = d1.get("incident") or d1
        assert inc1["confidence"] is None
        assert inc1["confidence_available"] is False
        assert inc1["detection_method"] == "condition_aware_baseline"
        assert inc1["observed_value"] == 5.93
        assert inc1["expected_value"] == 4.52
        assert abs(inc1["deviation_percent"] - 31.18) < 0.1

    # 2. Supervised Random Forest incident (INC-EQ-002)
    supervised_id = "INC-EQ-002-20240107_223300"
    res2 = client.get(f"/api/anomalies/{supervised_id}")
    assert res2.status_code == 200
    d2 = res2.json()
    inc2 = d2.get("incident") or d2
    assert inc2["confidence"] == 0.39
    assert inc2["confidence_available"] is True
    assert inc2["detection_method"] == "supervised_random_forest"
    assert inc2["model_score"] == 0.39

    # 3. List endpoint schema consistency
    res_list = client.get("/api/anomalies?page=1&page_size=20")
    assert res_list.status_code == 200
    list_data = res_list.json()
    items = list_data.get("items", [])
    assert len(items) > 0
    for item in items:
        assert "confidence" in item
        assert "confidence_available" in item
        assert "detection_method" in item
        assert "detection_method_label" in item
        # If confidence is provided, it must be a valid float between 0.0 and 1.0
        if item["confidence_available"]:
            assert item["confidence"] is not None
            assert 0.0 <= item["confidence"] <= 1.0
        else:
            assert item["confidence"] is None


def test_old_persisted_incidents_never_default_to_zero_confidence():
    """
    Directly verify that normalize_incident_dict never turns a null/missing
    confidence on a baseline detection into 0.0.
    """
    from backend.ai_intelligence.src.incident_store import normalize_incident_dict

    legacy_raw = {
        "incident_id": "INC-TEST-001",
        "equipment_id": "FURNACE-01",
        "model_name": "Condition-Aware Energy Baseline",
        "model_score": None,
        "actual_power_kw": 5.93,
        "expected_power_kw": 4.52,
        "deviation_pct": 31.18,
    }
    normalized = normalize_incident_dict(legacy_raw)
    assert normalized["confidence"] is None
    assert normalized["confidence_available"] is False
    assert normalized["detection_method"] == "condition_aware_baseline"
    assert normalized["observed_value"] == 5.93
    assert normalized["expected_value"] == 4.52
    assert normalized["deviation_percent"] == 31.18

    # Isolation Forest raw score must not be interpreted as probability
    iso_raw = {
        "incident_id": "INC-TEST-002",
        "equipment_id": "CNC-01",
        "model_name": "Unsupervised Isolation Forest",
        "model_score": 0.1684,
    }
    normalized_iso = normalize_incident_dict(iso_raw)
    assert normalized_iso["confidence"] is None
    assert normalized_iso["confidence_available"] is False
    assert normalized_iso["anomaly_score"] == 0.1684
    assert normalized_iso["detection_method"] == "unsupervised_isolation_forest"

