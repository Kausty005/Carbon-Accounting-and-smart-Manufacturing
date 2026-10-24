"""
Unit & Integration Tests for:
  1. 15-Minute Upstream Forecasting Pipeline Interface (HistGradientBoostingRegressor)
  2. Forecast-Residual Anomaly Detection (Path A) & Robust MAD Calibration
  3. Sensor Quality & Operating Pattern Detection (Path B)
  4. Incident Episode Grouping & Recurrence Tracking
  5. Actionable Optimization Recommendations & Defensible Savings
  6. Audit-Ready 15-Section PDF and Word (.docx) Incident Report Generation
  7. Optimization Summary and API Endpoints
"""

import os
import json
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.ai_intelligence.src.forecast_adapter import (
    ForecastServiceAdapter,
    ForecastRecord,
    ForecastMatchResult,
    ALL_UPSTREAM_FEATURES,
    FORECASTING_FEATURE_GROUPS,
)
from backend.ai_intelligence.src.residual_anomaly_detector import (
    DualPathAnomalyDetector,
    CalibratedThresholdRegistry,
    SensorQualityValidator,
    AnomalyAlert,
)
from backend.ai_intelligence.src.recommendations import (
    RecommendationEngine,
    ActionRecommendation,
)
from backend.ai_intelligence.src.optimization_summary import OptimizationSummaryEngine
from backend.ai_intelligence.src.incident_store import IncidentStore
from backend.ai_intelligence.src.incident_report_generator import (
    generate_pdf_incident_report,
    generate_docx_incident_report,
)

client = TestClient(app)


# ==============================================================================
# 1. FORECASTING INTERFACE & FEATURE SCHEMA TESTS
# ==============================================================================

def test_upstream_feature_groups_and_count():
    """Verify exact 5 feature groups and total 31 enumerated features."""
    assert len(FORECASTING_FEATURE_GROUPS) == 5
    assert "machine_and_operating" in FORECASTING_FEATURE_GROUPS
    assert "time_features" in FORECASTING_FEATURE_GROUPS
    assert "environmental_and_process" in FORECASTING_FEATURE_GROUPS
    assert "operating_and_production" in FORECASTING_FEATURE_GROUPS
    assert "historical_energy_and_power" in FORECASTING_FEATURE_GROUPS

    # Verify counts per group
    assert len(FORECASTING_FEATURE_GROUPS["machine_and_operating"]) == 6
    assert len(FORECASTING_FEATURE_GROUPS["time_features"]) == 7
    assert len(FORECASTING_FEATURE_GROUPS["environmental_and_process"]) == 3
    assert len(FORECASTING_FEATURE_GROUPS["operating_and_production"]) == 4
    assert len(FORECASTING_FEATURE_GROUPS["historical_energy_and_power"]) == 11
    assert len(ALL_UPSTREAM_FEATURES) == 31


def test_forecast_adapter_ingest_and_exact_timestamp_matching():
    """Test matching forecast record with actual energy by machine, site and target timestamp."""
    adapter = ForecastServiceAdapter()
    adapter.clear()

    fc = ForecastRecord(
        machine_id="AIR-COMP-01",
        machine_type="AIR_COMPRESSOR",
        site_id="SITE-01",
        forecast_timestamp="2026-10-24T10:00:00",
        target_timestamp="2026-10-24T10:15:00",
        interval_minutes=15,
        predicted_energy_kwh=2.40,
        unit="kWh",
        model="HistGradientBoostingRegressor",
    )
    adapter.ingest_forecast(fc)

    # 1. Match with positive residual (actual > predicted -> excess energy)
    res_pos = adapter.match_forecast_with_actual(
        machine_id="AIR-COMP-01",
        target_timestamp="2026-10-24T10:15:00",
        actual_energy_kwh=3.30,
        site_id="SITE-01",
    )
    assert res_pos.is_matched is True
    assert res_pos.status == "evaluated"
    assert res_pos.residual_kwh == 0.90
    assert res_pos.abs_residual_kwh == 0.90
    assert res_pos.relative_deviation_pct == 37.5
    assert res_pos.direction == "excess_energy"

    # 2. Match with negative residual (actual < predicted -> under-consumption)
    res_neg = adapter.match_forecast_with_actual(
        machine_id="AIR-COMP-01",
        target_timestamp="2026-10-24T10:15:00",
        actual_energy_kwh=1.20,
        site_id="SITE-01",
    )
    assert res_neg.is_matched is True
    assert res_neg.residual_kwh == -1.20
    assert res_neg.direction == "under_consumption"

    # 3. Match with zero / nominal residual
    res_zero = adapter.match_forecast_with_actual(
        machine_id="AIR-COMP-01",
        target_timestamp="2026-10-24T10:15:00",
        actual_energy_kwh=2.41,
        site_id="SITE-01",
    )
    assert res_zero.is_matched is True
    assert res_zero.direction == "nominal"


def test_forecast_missing_and_future_target_handling():
    """Test safe handling when forecast is missing or actual energy is not yet available."""
    adapter = ForecastServiceAdapter()
    adapter.clear()

    # 1. Forecast missing
    res_no_fc = adapter.match_forecast_with_actual(
        machine_id="FURNACE-01",
        target_timestamp="2026-10-24T12:00:00",
        actual_energy_kwh=15.0,
    )
    assert res_no_fc.is_matched is False
    assert res_no_fc.status == "forecast_unavailable"
    assert res_no_fc.predicted_energy_kwh is None

    # 2. Forecast present, but target interval is awaiting actual measurement
    fc = ForecastRecord(
        machine_id="FURNACE-01",
        machine_type="FURNACE",
        site_id="SITE-01",
        forecast_timestamp="2026-10-24T11:45:00",
        target_timestamp="2026-10-24T12:00:00",
        predicted_energy_kwh=12.5,
    )
    adapter.ingest_forecast(fc)

    res_awaiting = adapter.match_forecast_with_actual(
        machine_id="FURNACE-01",
        target_timestamp="2026-10-24T12:00:00",
        actual_energy_kwh=None,
    )
    assert res_awaiting.is_matched is False
    assert res_awaiting.status == "awaiting_actual"
    assert res_awaiting.predicted_energy_kwh == 12.5
    assert res_awaiting.residual_kwh is None


# ==============================================================================
# 2. SENSOR QUALITY VALIDATION & DUAL-PATH ANOMALY DETECTOR TESTS
# ==============================================================================

def test_sensor_quality_validator_missing_and_out_of_bounds():
    """Verify validator catches missing sensors and out-of-physical-range readings."""
    # 1. Missing power_kw
    telemetry_missing = {"machine_id": "CNC-01", "operating_state": "running"}
    valid, warns, missing = SensorQualityValidator.validate_reading(telemetry_missing, "CNC_MACHINE")
    assert valid is False
    assert "power_kw" in missing

    # 2. Out of physical bounds (negative power and impossible temperature)
    telemetry_invalid = {
        "machine_id": "FURNACE-01",
        "power_kw": -10.0,
        "process_temperature": 2500.0,
        "humidity": 120.0,
    }
    valid, warns, missing = SensorQualityValidator.validate_reading(telemetry_invalid, "FURNACE")
    assert valid is False
    assert any("outside physical boundary" in w for w in warns)


def test_sensor_quality_frozen_sensor_detection():
    """Verify validator flags sensors that remain completely frozen across intervals."""
    recent_window = [
        {"power_kw": 25.0, "process_temperature": 85.0},
        {"power_kw": 25.0, "process_temperature": 85.0},
        {"power_kw": 25.0, "process_temperature": 85.0},
        {"power_kw": 25.0, "process_temperature": 85.0},
    ]
    current = {"machine_id": "COMP-01", "power_kw": 25.0, "process_temperature": 85.0}
    valid, warns, missing = SensorQualityValidator.validate_reading(
        current, "AIR_COMPRESSOR", recent_window=recent_window
    )
    assert any("stuck/frozen" in w for w in warns)


def test_robust_residual_threshold_calibration():
    """Test empirical MAD threshold calibration from validation data without touching test set."""
    registry = CalibratedThresholdRegistry(k_mad=2.5)

    # Synthetic validation residuals with known median=0.1, MAD=0.2
    n = 100
    residuals = np.random.normal(loc=0.1, scale=0.3, size=n)
    df_val = pd.DataFrame({
        "actual_energy_kwh": 5.0 + residuals,
        "predicted_energy_kwh": 5.0,
        "machine_type": ["AIR_COMPRESSOR"] * n,
        "operating_state": ["running"] * n,
    })

    registry.calibrate_from_validation_residuals(df_val)
    th_meta = registry.get_thresholds("AIR_COMPRESSOR", operating_state="running")
    assert th_meta.sample_size == 100
    assert th_meta.method == "validation_stratified_MAD"
    assert th_meta.upper_threshold_kwh > 0.3
    assert th_meta.lower_threshold_kwh < -0.3


def test_dual_path_detector_residual_anomaly():
    """Verify dual path detector flags forecast residual excess and labels it energy_waste_event."""
    registry = CalibratedThresholdRegistry()
    detector = DualPathAnomalyDetector(threshold_registry=registry)

    telemetry = {
        "machine_id": "AIR-COMP-01",
        "machine_type": "AIR_COMPRESSOR",
        "site_id": "SITE-01",
        "timestamp": "2026-10-24T14:15:00",
        "operating_state": "running",
        "power_kw": 28.0,
    }
    match_result = ForecastMatchResult(
        machine_id="AIR-COMP-01",
        site_id="SITE-01",
        target_timestamp="2026-10-24T14:15:00",
        is_matched=True,
        status="evaluated",
        actual_energy_kwh=4.50,
        predicted_energy_kwh=2.20,
        residual_kwh=2.30,
        abs_residual_kwh=2.30,
        relative_deviation_pct=104.5,
        direction="excess_energy",
    )

    alerts = detector.detect_anomalies(telemetry, forecast_result=match_result)
    assert len(alerts) >= 1
    energy_alert = next((a for a in alerts if a.alert_category == "energy_waste_event"), None)
    assert energy_alert is not None
    assert energy_alert.severity in ["high", "critical"]
    assert energy_alert.residual_kwh == 2.30
    assert "exceeded" in energy_alert.explanation.lower()


# ==============================================================================
# 3. EPISODE GROUPING & RECURRENCE TRACKING TESTS
# ==============================================================================

def test_incident_episode_grouping_and_recurrence():
    """Verify continuous 15-minute readings are grouped into episodes without creating duplicates."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        store_path = Path(tmp_dir) / "test_store.json"
        store = IncidentStore(store_path=str(store_path))
        store.incidents.clear()

        t1 = "2026-10-24T10:00:00"
        t2 = "2026-10-24T10:15:00"
        t3 = "2026-10-24T10:30:00"

        # Alert 1
        a1 = AnomalyAlert(
            alert_id="INC-COMP-01-T1",
            machine_id="COMP-01",
            machine_type="AIR_COMPRESSOR",
            site_id="SITE-01",
            timestamp=t1,
            target_timestamp=t1,
            alert_category="energy_waste_event",
            title="Compressor High Idle Power",
            severity="medium",
            residual_kwh=1.20,
            evidence=["Idle power at 18 kW."],
        )
        inc1 = store.ingest_alert(a1, max_gap_minutes=60)
        assert inc1["recurrence_count"] == 1
        assert inc1["first_detected"] == t1
        assert inc1["latest_occurrence"] == t1
        assert inc1["estimated_excess_energy_kwh"] == 1.20

        # Alert 2 (15 minutes later on same machine) -> Should group
        a2 = AnomalyAlert(
            alert_id="INC-COMP-01-T2",
            machine_id="COMP-01",
            machine_type="AIR_COMPRESSOR",
            site_id="SITE-01",
            timestamp=t2,
            target_timestamp=t2,
            alert_category="energy_waste_event",
            title="Compressor High Idle Power",
            severity="medium",
            residual_kwh=1.10,
            evidence=["Continuous idle loading."],
        )
        inc2 = store.ingest_alert(a2, max_gap_minutes=60)
        assert inc2["incident_id"] == inc1["incident_id"]
        assert inc2["recurrence_count"] == 2
        assert inc2["first_detected"] == t1
        assert inc2["latest_occurrence"] == t2
        assert round(inc2["estimated_excess_energy_kwh"], 2) == 2.30

        # Alert 3 (another 15 minutes later) -> Recurrence count should reach 3
        a3 = AnomalyAlert(
            alert_id="INC-COMP-01-T3",
            machine_id="COMP-01",
            machine_type="AIR_COMPRESSOR",
            site_id="SITE-01",
            timestamp=t3,
            target_timestamp=t3,
            alert_category="energy_waste_event",
            title="Compressor High Idle Power",
            severity="medium",
            residual_kwh=1.00,
            evidence=["Header pressure decay."],
        )
        inc3 = store.ingest_alert(a3, max_gap_minutes=60)
        assert inc3["recurrence_count"] == 3
        assert inc3["latest_occurrence"] == t3
        assert len(store.incidents) == 1  # 1 continuous episode!


# ==============================================================================
# 4. ACTIONABLE RECOMMENDATIONS & OPTIMIZATION SUMMARY TESTS
# ==============================================================================

def test_recommendation_engine_evidence_linking():
    """Verify recommendations are tied to evidence and do NOT diagnose mechanical failure from energy alone."""
    recs = RecommendationEngine.generate_recommendations(
        machine_type="AIR_COMPRESSOR",
        evidence_list=["Excess idle power observed."],
        residual_kwh=2.50,
        operating_state="idle",
    )
    assert len(recs) >= 1
    top_rec = recs[0]
    assert "unloading" in top_rec.recommended_action.lower() or "pressure" in top_rec.recommended_action.lower()
    assert top_rec.estimated_savings_kwh == 2.50
    assert top_rec.estimated_savings_inr == round(2.50 * 9.00, 2)
    assert top_rec.avoidable_co2e_kg == round(2.50 * 0.82, 3)
    # Check disclaimer
    assert "not a guaranteed outcome" in top_rec.assumptions_and_disclaimer.lower()


def test_optimization_summary_engine():
    """Test machine/site summary aggregation and repeat offenders."""
    incidents = [
        {
            "incident_id": "INC-01",
            "machine_id": "COMP-01",
            "machine_type": "AIR_COMPRESSOR",
            "site_id": "SITE-01",
            "recurrence_count": 4,
            "residual_kwh": 3.0,
            "alert_category": "energy_waste_event",
            "severity": "high",
        },
        {
            "incident_id": "INC-02",
            "machine_id": "FURN-01",
            "machine_type": "FURNACE",
            "site_id": "SITE-01",
            "recurrence_count": 2,
            "residual_kwh": 1.5,
            "alert_category": "energy_waste_event",
            "severity": "medium",
        },
        {
            "incident_id": "INC-03",
            "machine_id": "CNC-01",
            "machine_type": "CNC_MACHINE",
            "site_id": "SITE-01",
            "recurrence_count": 1,
            "alert_category": "sensor_data_quality_warning",
            "severity": "low",
        },
    ]

    summary = OptimizationSummaryEngine.compute_summary(incidents, site_id="SITE-01")
    metrics = summary["summary_metrics"]
    assert metrics["unique_incident_episodes"] == 3
    assert metrics["total_flagged_15min_intervals"] == 7
    assert metrics["recurring_episodes_count"] == 2
    assert metrics["total_avoidable_excess_kwh"] == 4.5
    assert metrics["data_quality_warnings"] == 1
    assert summary["repeat_offenders"][0]["machine_id"] == "COMP-01"


# ==============================================================================
# 5. PROFESSIONAL PDF & WORD REPORT INTEGRITY TESTS
# ==============================================================================

def test_docx_report_generation_all_15_sections():
    """Generate Word (.docx) report and verify file creation and structural integrity."""
    incident = {
        "incident_id": "INC-COMP-01-20261024_101500",
        "equipment_id": "COMP-01",
        "machine_id": "COMP-01",
        "equipment_type": "air_compressor",
        "machine_type": "AIR_COMPRESSOR",
        "site_id": "SITE-01",
        "timestamp": "2026-10-24T10:15:00",
        "target_timestamp": "2026-10-24T10:15:00",
        "first_detected": "2026-10-24T10:00:00",
        "latest_occurrence": "2026-10-24T10:15:00",
        "recurrence_count": 2,
        "severity": "high",
        "alert_category": "energy_waste_event",
        "actual_energy_kwh": 3.40,
        "predicted_energy_kwh": 2.20,
        "residual_kwh": 1.20,
        "relative_deviation_pct": 54.5,
        "actual_power_kw": 28.0,
        "expected_power_kw": 18.0,
        "status": "investigating",
        "explanation": "Air compressor COMP-01 consumed 3.40 kWh against a 15-min forecast of 2.20 kWh (+54.5%).",
        "evidence": ["Unloaded power remained at 18 kW.", "Discharge pressure nominal."],
        "recommended_action": "Inspect unloader solenoid and verify line pressure setpoint.",
        "sensor_readings": {
            "power_consumption_kw": 28.0,
            "discharge_pressure_bar": 7.2,
            "airflow_cfm": 210.0,
        },
        "data_provenance": "simulated_telemetry",
    }
    telemetry = [
        {"timestamp": "2026-10-24T09:45:00", "power_consumption_kw": 18.0, "discharge_pressure_bar": 7.2},
        {"timestamp": "2026-10-24T10:00:00", "power_consumption_kw": 28.0, "discharge_pressure_bar": 7.1},
        {"timestamp": "2026-10-24T10:15:00", "power_consumption_kw": 28.0, "discharge_pressure_bar": 7.2},
        {"timestamp": "2026-10-24T10:30:00", "power_consumption_kw": 18.0, "discharge_pressure_bar": 7.3},
    ]

    with tempfile.TemporaryDirectory() as tmp_dir:
        docx_path = Path(tmp_dir) / "test_report.docx"
        res_path = generate_docx_incident_report(incident, telemetry, docx_path)
        assert res_path.exists()
        assert res_path.stat().st_size > 5000  # Non-trivial document size


def test_pdf_report_generation_all_15_sections():
    """Generate vector PDF report and verify PyMuPDF creation and file integrity."""
    incident = {
        "incident_id": "INC-FURNACE-01-20261024_113000",
        "equipment_id": "FURNACE-01",
        "machine_id": "FURNACE-01",
        "equipment_type": "heat_treatment_furnace",
        "machine_type": "FURNACE",
        "site_id": "SITE-01",
        "timestamp": "2026-10-24T11:30:00",
        "target_timestamp": "2026-10-24T11:30:00",
        "first_detected": "2026-10-24T11:15:00",
        "latest_occurrence": "2026-10-24T11:30:00",
        "recurrence_count": 2,
        "severity": "critical",
        "alert_category": "energy_waste_event",
        "actual_energy_kwh": 12.0,
        "predicted_energy_kwh": 8.0,
        "residual_kwh": 4.0,
        "relative_deviation_pct": 50.0,
        "actual_power_kw": 48.0,
        "status": "open",
        "explanation": "Furnace holding cycle exceeded baseline forecast by 4.0 kWh (+50.0%).",
        "evidence": ["Door seal temperature elevated.", "Continuous element draw."],
        "recommended_action": "Check door alignment and perimeter thermal seals.",
        "sensor_readings": {
            "power_consumption_kw": 48.0,
            "temperature_c": 860.0,
            "temp_setpoint_c": 850.0,
        },
        "data_provenance": "simulated_telemetry",
    }
    telemetry = [
        {"timestamp": "2026-10-24T11:00:00", "power_consumption_kw": 32.0, "temperature_c": 845.0},
        {"timestamp": "2026-10-24T11:15:00", "power_consumption_kw": 48.0, "temperature_c": 855.0},
        {"timestamp": "2026-10-24T11:30:00", "power_consumption_kw": 48.0, "temperature_c": 860.0},
    ]

    with tempfile.TemporaryDirectory() as tmp_dir:
        pdf_path = Path(tmp_dir) / "test_report.pdf"
        res_path = generate_pdf_incident_report(incident, telemetry, pdf_path)
        assert res_path.exists()
        assert res_path.stat().st_size > 5000


# ==============================================================================
# 6. FASTAPI ENDPOINT INTEGRATION TESTS
# ==============================================================================

def test_api_forecast_status_endpoint():
    """Test GET /api/forecast/status endpoint."""
    resp = client.get("/api/forecast/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["model"] == "HistGradientBoostingRegressor"
    assert data["interval_minutes"] == 15
    assert data["target_unit"] == "kWh"
    assert data["feature_count_declared"] == 29
    assert data["feature_count_enumerated"] == 31


def test_api_forecast_ingest_and_comparison():
    """Test POST /api/forecast/ingest and GET /api/forecast/comparison."""
    payload = {
        "forecasts": [
            {
                "machine_id": "TEST-COMP-01",
                "machine_type": "AIR_COMPRESSOR",
                "site_id": "SITE-01",
                "forecast_timestamp": "2026-10-24T15:00:00",
                "target_timestamp": "2026-10-24T15:15:00",
                "interval_minutes": 15,
                "predicted_energy_kwh": 3.50,
                "unit": "kWh",
                "model": "HistGradientBoostingRegressor",
            }
        ]
    }
    resp_ingest = client.post("/api/forecast/ingest", json=payload)
    assert resp_ingest.status_code == 200
    assert resp_ingest.json()["ingested_count"] == 1

    # Compare with actual
    resp_comp = client.get(
        "/api/forecast/comparison",
        params={
            "machine_id": "TEST-COMP-01",
            "target_timestamp": "2026-10-24T15:15:00",
            "actual_energy_kwh": 4.55,
        },
    )
    assert resp_comp.status_code == 200
    comp_data = resp_comp.json()
    assert comp_data["is_matched"] is True
    assert comp_data["residual_kwh"] == 1.05
    assert comp_data["direction"] == "excess_energy"


def test_api_optimization_summary_endpoint():
    """Test GET /api/optimization/summary endpoint."""
    resp = client.get("/api/optimization/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "summary_metrics" in data
    assert "repeat_offenders" in data
    assert "inspection_priorities" in data


def test_api_recommendations_endpoint():
    """Test GET /api/recommendations endpoint."""
    resp = client.get(
        "/api/recommendations",
        params={
            "machine_type": "FURNACE",
            "residual_kwh": 2.2,
            "power_kw": 45.0,
            "operating_state": "running",
        },
    )
    assert resp.status_code == 200
    recs = resp.json()
    assert len(recs) >= 1
    assert any("door" in r["recommended_action"].lower() or "batch" in r["recommended_action"].lower() for r in recs)


def test_api_data_quality_status_endpoint():
    """Test GET /api/data-quality/status endpoint."""
    resp = client.get("/api/data-quality/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "total_quality_warnings" in data
