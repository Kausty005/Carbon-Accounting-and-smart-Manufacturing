"""
Comprehensive Test Suite for Synthetic Telemetry, 4 Machine Categories,
Decoupled Energy Intelligence, and Telemetry Upload API.
"""

import io
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.ai_intelligence.src.config import (
    GRID_EMISSION_FACTOR_KG_PER_KWH,
    INDUSTRIAL_TARIFF_INR_PER_KWH,
)
from backend.ai_intelligence.src.incident_report_generator import (
    generate_docx_incident_report,
    generate_pdf_incident_report,
)
from backend.ai_intelligence.src.incident_store import IncidentStore
from backend.ai_intelligence.src.preprocessing import LEAKAGE_COLUMNS, extract_features_and_target
from backend.ai_intelligence.src.rule_based_detector import RuleBasedEquipmentChecker
from backend.app.main import app

BASE_DIR = Path(__file__).resolve().parent.parent / "ai_intelligence"


@pytest.fixture
def client():
    return TestClient(app)


def test_synthetic_dataset_and_registry_files():
    """Verify synthetic dataset v1 artifacts, row counts, and equipment categories."""
    synth_dir = BASE_DIR / "data" / "synthetic_v1"
    telemetry_file = synth_dir / "telemetry.csv"
    events_file = synth_dir / "ground_truth_events.csv"
    registry_file = synth_dir / "equipment_registry.json"
    card_file = synth_dir / "dataset_card.md"
    summary_file = synth_dir / "validation_summary.json"

    assert telemetry_file.exists(), "telemetry.csv must exist"
    assert events_file.exists(), "ground_truth_events.csv must exist"
    assert registry_file.exists(), "equipment_registry.json must exist"
    assert card_file.exists(), "dataset_card.md must exist"
    assert summary_file.exists(), "validation_summary.json must exist"

    df = pd.read_csv(telemetry_file)
    assert len(df) == 34560, f"Expected exactly 34,560 rows (30 days x 288 steps x 4 machines), got {len(df)}"

    expected_machines = {"FURNACE-01", "AIR-COMP-01", "CNC-01", "CHILLER-01"}
    actual_machines = set(df["equipment_id"].unique())
    assert actual_machines == expected_machines, f"Expected {expected_machines}, got {actual_machines}"

    for eq in expected_machines:
        eq_df = df[df["equipment_id"] == eq]
        assert len(eq_df) == 8640, f"Machine {eq} expected 8,640 rows, got {len(eq_df)}"

    assert "data_provenance" in df.columns
    assert (df["data_provenance"] == "synthetic_simulation").all()

    df_events = pd.read_csv(events_file)
    assert len(df_events) >= 12, "Ground truth events file should contain episodes across all machines"
    assert "is_energy_waste" in df_events.columns
    assert "severity" in df_events.columns


def test_no_feature_leakage_in_preprocessing():
    """Verify that all target labels, post-event markers, and provenance columns are stripped."""
    df_synth = pd.read_csv(BASE_DIR / "data" / "synthetic_v1" / "telemetry.csv").iloc[:20]
    X, y, meta = extract_features_and_target(df_synth)

    for leak_col in LEAKAGE_COLUMNS:
        assert leak_col not in X.columns, f"Leakage column '{leak_col}' found in model input features!"

    assert "is_anomaly" not in X.columns
    assert "anomaly_type" not in X.columns
    assert "is_energy_waste" not in X.columns
    assert "severity" not in X.columns
    assert "event_id" not in X.columns
    assert "data_provenance" not in X.columns


def test_rule_based_equipment_limits():
    """Verify rule-based physical plausibility and limit checks for the 4 equipment types."""
    checker = RuleBasedEquipmentChecker()

    # 1. Furnace: High temperature overshoot (> 920 °C)
    row_furnace_overshoot = pd.Series({
        "equipment_id": "FURNACE-01",
        "equipment_type": "furnace",
        "operating_mode": "heating",
        "temperature_c": 935.0,
        "temp_setpoint_c": 850.0,
        "power_consumption_kw": 220.0,
    })
    res_f = checker.evaluate_row(row_furnace_overshoot)
    assert res_f is not None
    assert res_f["anomaly_type"] == "temperature_overshoot"
    assert res_f["severity"] == "critical"

    # 2. Furnace: Door open heat loss
    row_furnace_door = pd.Series({
        "equipment_id": "FURNACE-01",
        "equipment_type": "furnace",
        "operating_mode": "heating",
        "temperature_c": 600.0,
        "temp_setpoint_c": 800.0,
        "door_open": 1,
        "power_consumption_kw": 230.0,
    })
    res_door = checker.evaluate_row(row_furnace_door)
    assert res_door is not None
    assert res_door["anomaly_type"] == "door_open_heat_loss"
    assert res_door["is_energy_waste"] is True

    # 3. Air Compressor: Discharge pressure loss in load mode
    row_comp_leak = pd.Series({
        "equipment_id": "AIR-COMP-01",
        "equipment_type": "air_compressor",
        "operating_mode": "load",
        "discharge_pressure_bar": 5.4,
        "airflow_cfm": 380.0,
        "power_consumption_kw": 68.0,
    })
    res_comp = checker.evaluate_row(row_comp_leak)
    assert res_comp is not None
    assert res_comp["anomaly_type"] == "pressure_loss_leak"
    assert res_comp["is_energy_waste"] is True

    # 4. CNC Machine: Tool wear chatter
    row_cnc_chatter = pd.Series({
        "equipment_id": "CNC-01",
        "equipment_type": "cnc_machine",
        "operating_mode": "cutting",
        "vibration_mm_s": 5.8,
        "spindle_rpm": 8000.0,
        "spindle_load_pct": 92.0,
        "power_consumption_kw": 34.0,
    })
    res_cnc = checker.evaluate_row(row_cnc_chatter)
    assert res_cnc is not None
    assert res_cnc["anomaly_type"] == "tool_wear_chatter"
    assert res_cnc["is_energy_waste"] is True

    # 5. CNC Machine: Bearing degradation (pure mechanical health degradation, no energy waste)
    row_bearing = pd.Series({
        "equipment_id": "CNC-01",
        "equipment_type": "cnc_machine",
        "operating_mode": "cutting",
        "vibration_mm_s": 5.2,
        "spindle_temp_c": 75.0,
        "spindle_rpm": 7000.0,
        "power_consumption_kw": 18.0,
    })
    res_bearing = checker.evaluate_row(row_bearing)
    assert res_bearing is not None
    assert res_bearing["anomaly_type"] == "bearing_degradation"
    assert res_bearing["is_energy_waste"] is False

    # 6. Chiller: Low Delta-T syndrome (Low COP energy waste)
    row_chiller_dt = pd.Series({
        "equipment_id": "CHILLER-01",
        "equipment_type": "chiller",
        "operating_mode": "running",
        "supply_temp_c": 7.0,
        "return_temp_c": 9.0,
        "delta_t_c": 2.0,
        "power_consumption_kw": 110.0,
        "water_flow_m3h": 90.0,
    })
    res_chiller = checker.evaluate_row(row_chiller_dt)
    assert res_chiller is not None
    assert res_chiller["anomaly_type"] == "low_delta_t_syndrome"
    assert res_chiller["is_energy_waste"] is True


def test_api_equipment_registry_endpoint(client):
    """Verify GET /api/equipment/registry returns specs for the 4 equipment types."""
    res = client.get("/api/equipment/registry")
    assert res.status_code == 200
    data = res.json()
    assert "FURNACE-01" in data
    assert "AIR-COMP-01" in data
    assert "CNC-01" in data
    assert "CHILLER-01" in data

    furnace = data["FURNACE-01"]
    assert furnace["equipment_type"] == "furnace"
    assert "temperature_c" in furnace["primary_sensors"]
    assert furnace["rated_power_kw"] == 250.0

    compressor = data["AIR-COMP-01"]
    assert compressor["equipment_type"] == "air_compressor"
    assert "discharge_pressure_bar" in compressor["primary_sensors"]


def test_telemetry_upload_valid_csv(client):
    """Test validated telemetry upload endpoint with valid CSV data."""
    synth_file = BASE_DIR / "data" / "synthetic_v1" / "telemetry.csv"
    df = pd.read_csv(synth_file).iloc[:100]
    csv_bytes = df.to_csv(index=False).encode("utf-8")

    res = client.post(
        "/api/upload-telemetry",
        files={"file": ("test_upload_batch.csv", io.BytesIO(csv_bytes), "text/csv")},
        data={"equipment_type": "furnace"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["valid"] is True
    assert body["success"] is True
    assert body["row_count"] == 100
    assert "FURNACE-01" in body["equipments_detected"]
    assert Path(body["saved_path"]).exists(), "Upload file must be persisted to data/uploads"


def test_telemetry_upload_invalid_csv_rejected(client):
    """Test validated telemetry upload rejects files with missing columns or negative values."""
    # 1. Missing mandatory column
    bad_df_1 = pd.DataFrame({
        "timestamp": ["2024-01-01 12:00:00"],
        "equipment_id": ["FURNACE-01"],
        "operating_mode": ["heating"],
    })
    res1 = client.post(
        "/api/upload-telemetry",
        files={"file": ("bad_schema.csv", io.BytesIO(bad_df_1.to_csv(index=False).encode("utf-8")), "text/csv")},
    )
    assert res1.status_code == 200
    b1 = res1.json()
    assert b1["valid"] is False
    assert any("Missing mandatory" in err for err in b1["errors"])

    # 2. Negative active power
    bad_df_2 = pd.DataFrame({
        "timestamp": ["2024-01-01 12:00:00"],
        "equipment_id": ["FURNACE-01"],
        "operating_mode": ["heating"],
        "power_consumption_kw": [-25.0],
    })
    res2 = client.post(
        "/api/upload-telemetry",
        files={"file": ("bad_power.csv", io.BytesIO(bad_df_2.to_csv(index=False).encode("utf-8")), "text/csv")},
    )
    assert res2.status_code == 200
    b2 = res2.json()
    assert b2["valid"] is False
    assert any("negative active power" in err.lower() for err in b2["errors"])


def test_report_generation_with_synthetic_provenance(tmp_path):
    """Verify that generated PDF and Word reports include explicit data provenance callouts."""
    store = IncidentStore()
    inc_id = list(store.incidents.keys())[0]
    incident = store.get_incident(inc_id)
    window = store.get_telemetry_window(incident["equipment_id"], incident["timestamp"], window_minutes=30)

    out_docx = tmp_path / "test_report.docx"
    out_pdf = tmp_path / "test_report.pdf"

    generate_docx_incident_report(incident, window, out_docx)
    generate_pdf_incident_report(incident, window, out_pdf)

    assert out_docx.exists()
    assert out_docx.stat().st_size > 1000
    assert out_pdf.exists()
    assert out_pdf.stat().st_size > 1000

    import pymupdf
    pdf_doc = pymupdf.open(str(out_pdf))
    page_text = pdf_doc[0].get_text()
    assert "SIMULATED TELEMETRY" in page_text or "Benchmarking" in page_text


def test_energy_carbon_and_tariff_calculations():
    """Verify kWh integration, tariff cost, and emission factor calculations."""
    timestamps = pd.date_range("2024-01-01 00:00:00", periods=12, freq="5min")
    power_kw = [100.0] * 12
    dt_hours = 5.0 / 60.0
    kwh_total = sum(p * dt_hours for p in power_kw)
    assert abs(kwh_total - 100.0) < 1e-4

    cost_inr = kwh_total * INDUSTRIAL_TARIFF_INR_PER_KWH
    assert abs(cost_inr - 800.0) < 1e-4

    co2e_kg = kwh_total * GRID_EMISSION_FACTOR_KG_PER_KWH
    assert abs(co2e_kg - 82.0) < 1e-4
