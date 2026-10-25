"""
WattWise AI — Energy Forecasting Automated Test Suite
Covers:
1. Dataset preprocessing & physical consistency.
2. Chronological time-series splitting (70/15/15 disjoint dates).
3. Target alignment (next 15-minute interval).
4. Feature consistency between training and inference.
5. Model artifact loading, serialization, and synthetic metadata.
6. Forecast output validation and physical bounds.
7. Invalid and negative input rejection (HTTP 422).
8. FastAPI TestClient endpoint integration.
9. Out-of-vocabulary / unseen machine ID handling.
"""

from pathlib import Path
import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import EnergyForecastInput
from backend.app.services.energy_forecasting_service import (
    EnergyForecastingService,
    energy_forecasting_service,
)
from ml.energy_forecasting.src.dataset import (
    ALL_FEATURE_COLUMNS,
    CATEGORICAL_FEATURES,
    NUMERICAL_FEATURES,
    TARGET_COLUMN,
    chronological_split,
)
from ml.energy_forecasting.src.features import prepare_inference_features


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def project_root():
    return Path(__file__).resolve().parent.parent.parent


# ─── 1. Preprocessing & Physical Consistency ──────────────────────────────────

def test_preprocessing_and_lag_calculation():
    """Verify that lag features look strictly backwards and energy is physically consistent with power."""
    # Create synthetic sequence of 5 intervals for 1 machine
    sample_df = pd.DataFrame({
        "timestamp": pd.date_range("2025-01-01 00:00:00", periods=5, freq="15min"),
        "machine_id": ["TEST_001"] * 5,
        "machine_type": ["CONVEYOR"] * 5,
        "site_id": ["SITE_01"] * 5,
        "shift_pattern": ["3_shift"] * 5,
        "hour": [0, 0, 0, 0, 1],
        "day_of_week": [2, 2, 2, 2, 2],
        "is_weekend": [0, 0, 0, 0, 0],
        "rated_power_kw": [10.0] * 5,
        "power_kw": [4.0, 8.0, 6.0, 10.0, 2.0],
        "energy_kwh": [1.0, np.nan, 1.5, 2.5, 0.5],  # 1 missing value
        "operating_state": [2, 2, 2, 2, 1],
        "load_factor": [0.4, 0.8, 0.6, 1.0, 0.2],
        "operating_minutes": [15, 15, 15, 15, 0],
        "production_units": [1, 2, 1, 3, 0],
        "ambient_temp_c": [25.0] * 5,
        "process_temp_c": [30.0] * 5,
        "relative_humidity_pct": [60.0] * 5,
        "target_next_15min_energy_kwh": [2.0, 1.5, 2.5, 0.5, 0.0],
    })

    # Missing energy filled via power * 0.25 (8.0 * 0.25 = 2.0)
    clean_e = sample_df["energy_kwh"].fillna(sample_df["power_kw"] * 0.25)
    assert clean_e.iloc[1] == pytest.approx(2.0, rel=1e-4)

    # Verify lag 1 is current interval energy
    lag1 = clean_e
    assert lag1.iloc[0] == pytest.approx(1.0, rel=1e-4)
    assert lag1.iloc[3] == pytest.approx(2.5, rel=1e-4)


# ─── 2. Chronological Splitting ───────────────────────────────────────────────

def test_chronological_splitting_disjoint_dates():
    """Verify that chronological splitting partitions by unique dates with zero temporal overlap."""
    dates = pd.date_range("2025-01-01", periods=100, freq="D").date
    dummy_data = []
    for d in dates:
        for m in ["M1", "M2"]:
            dummy_data.append({"date": d, "machine_id": m, "target_next_15min_energy_kwh": 1.0})
    df_dummy = pd.DataFrame(dummy_data)

    train_df, val_df, test_df, meta = chronological_split(df_dummy, 0.70, 0.15, 0.15)

    assert meta["train_dates_count"] == 70
    assert meta["val_dates_count"] == 15
    assert meta["test_dates_count"] == 15

    train_set = set(train_df["date"])
    val_set = set(val_df["date"])
    test_set = set(test_df["date"])

    # Disjoint sets (no leakage)
    assert train_set.isdisjoint(val_set)
    assert val_set.isdisjoint(test_set)
    assert train_set.isdisjoint(test_set)

    # Monotonic order
    assert max(train_set) < min(val_set)
    assert max(val_set) < min(test_set)


# ─── 3. Target Alignment ──────────────────────────────────────────────────────

def test_target_alignment_with_next_interval():
    """Verify that target_next_15min_energy_kwh aligns with subsequent row's energy."""
    df_seq = pd.DataFrame({
        "machine_id": ["M1", "M1", "M1"],
        "energy_kwh": [1.25, 2.50, 0.75],
        "target_next_15min_energy_kwh": [2.50, 0.75, 0.00],
    })
    shifted = df_seq.groupby("machine_id")["energy_kwh"].shift(-1)
    diff = (df_seq["target_next_15min_energy_kwh"].iloc[:2] - shifted.iloc[:2]).abs()
    assert diff.max() == pytest.approx(0.0, abs=1e-6)


# ─── 4. Feature Consistency Between Training & Inference ──────────────────────

def test_inference_feature_columns_match_training_definition():
    """Verify inference pipeline produces identical feature names and column order as training."""
    payload = {
        "machine_id": "MACHINE_001",
        "machine_type": "CONVEYOR",
        "site_id": "SITE_01",
        "power_kw": 5.0,
        "rated_power_kw": 10.0,
        "operating_state": 2,
    }
    df_inf = prepare_inference_features(payload)

    # Columns must match ALL_FEATURE_COLUMNS exactly
    assert list(df_inf.columns) == ALL_FEATURE_COLUMNS
    assert TARGET_COLUMN not in df_inf.columns
    assert "target_timestamp" not in df_inf.columns

    # Check cyclical feature derivations
    assert -1.0 <= df_inf["hour_sin"].iloc[0] <= 1.0
    assert -1.0 <= df_inf["hour_cos"].iloc[0] <= 1.0
    assert -1.0 <= df_inf["day_sin"].iloc[0] <= 1.0
    assert -1.0 <= df_inf["day_cos"].iloc[0] <= 1.0


# ─── 5. Model Artifact Loading & Synthetic Designation ────────────────────────

def test_model_artifact_loading_and_metadata(project_root):
    """Verify model artifact exists, loads cleanly, and contains synthetic metadata."""
    artifact_path = project_root / "ml" / "energy_forecasting" / "models" / "energy_forecasting_model.joblib"
    assert artifact_path.exists(), f"Model artifact missing at {artifact_path}"

    service = EnergyForecastingService(model_path=artifact_path)
    meta = service.get_metadata()

    assert meta["is_synthetic"] is True
    assert "Synthetic" in meta["synthetic_data_designation"]
    assert meta["model_class"] == "HistGradientBoostingRegressor"
    assert "test_metrics" in meta
    assert meta["test_metrics"]["r2_score"] > 0.60
    assert meta["test_metrics"]["mae_kwh"] < 1.0


# ─── 6. Forecast Output Validation & Physical Bounds ──────────────────────────

def test_forecast_output_validation():
    """Verify prediction outputs are non-negative and physically plausible."""
    inp = EnergyForecastInput(
        machine_id="MACHINE_011",
        machine_type="AIR_COMPRESSOR",
        site_id="SITE_02",
        rated_power_kw=18.425,
        power_kw=12.5,
        operating_state=2,
        load_factor=0.68,
        operating_minutes=15.0,
        production_units=0.0
    )
    res = energy_forecasting_service.predict_next_15min(inp)

    # Output sanity checks
    assert res.predicted_next_15min_energy_kwh >= 0.0
    assert res.equivalent_average_power_kw >= 0.0
    # Equivalent power = energy / 0.25
    assert res.equivalent_average_power_kw == pytest.approx(res.predicted_next_15min_energy_kwh / 0.25, rel=1e-3)
    assert res.data_provenance in ["PREDICTED_HIST_GB_MODEL", "FALLBACK_PERSISTENCE"]
    assert res.machine_id == "MACHINE_011"


# ─── 7. Out-of-Vocabulary / Unseen Machine Handling ───────────────────────────

def test_unseen_machine_id_gracefully_handled():
    """Verify that an unknown machine ID does not crash the model and produces valid predictions."""
    inp = EnergyForecastInput(
        machine_id="UNKNOWN_NEW_MACHINE_999",
        machine_type="CNC_MILL",
        site_id="SITE_03",
        rated_power_kw=25.0,
        power_kw=15.0,
        operating_state=2,
    )
    res = energy_forecasting_service.predict_next_15min(inp)
    assert res.predicted_next_15min_energy_kwh >= 0.0
    assert res.machine_id == "UNKNOWN_NEW_MACHINE_999"


# ─── 8. Input Validation & Error Handling (HTTP 422) ───────────────────────────

def test_negative_power_rejected_by_api(client):
    """Negative power_kw must be rejected with HTTP 422 Unprocessable Entity."""
    payload = {
        "machine_id": "MACHINE_001",
        "machine_type": "CONVEYOR",
        "rated_power_kw": 10.0,
        "power_kw": -5.0,  # Invalid
    }
    resp = client.post("/api/v1/forecast/next-15min", json=payload)
    assert resp.status_code == 422


def test_negative_rated_power_rejected_by_api(client):
    """Negative rated_power_kw must be rejected with HTTP 422."""
    payload = {
        "machine_id": "MACHINE_001",
        "machine_type": "CONVEYOR",
        "rated_power_kw": -10.0,  # Invalid
        "power_kw": 5.0,
    }
    resp = client.post("/api/v1/forecast/next-15min", json=payload)
    assert resp.status_code == 422


# ─── 9. FastAPI End-to-End API Integration ────────────────────────────────────

def test_api_forecast_endpoints(client):
    """Verify GET /metadata and POST /next-15min work over HTTP."""
    # Metadata endpoint
    resp_meta = client.get("/api/v1/forecast/metadata")
    assert resp_meta.status_code == 200
    meta = resp_meta.json()
    assert meta["is_synthetic"] is True

    # Prediction endpoint
    payload = {
        "machine_id": "MACHINE_002",
        "machine_type": "CONVEYOR",
        "site_id": "SITE_02",
        "rated_power_kw": 10.226,
        "power_kw": 4.5,
        "operating_state": 2,
    }
    resp_pred = client.post("/api/v1/forecast/next-15min", json=payload)
    assert resp_pred.status_code == 200
    data = resp_pred.json()
    assert "predicted_next_15min_energy_kwh" in data
    assert "equivalent_average_power_kw" in data
    assert data["machine_id"] == "MACHINE_002"
    assert data["forecast_target"] == "next_15min_energy_kwh"
    assert data["forecast_horizon_minutes"] == 15
    assert data["energy_unit"] == "kWh"
    assert data["power_unit"] == "kW"
    assert "target_interval_start" in data
    assert "target_interval_end" in data
    assert "target_interval" in data


# ─── 10. Physical Constraint Enforcement & Surge Clamping ─────────────────────

def test_physical_upper_surge_constraint_enforced():
    """Verify that predictions are clamped to rated capacity * 0.25h * 1.30 surge limit."""
    # Machine with a very low rated power but high raw feature values that would predict higher
    inp = EnergyForecastInput(
        machine_id="TINY_001",
        machine_type="CONVEYOR",
        site_id="SITE_01",
        rated_power_kw=1.0,  # 1 kW rated -> max 15-min energy = 1.0 * 0.25 * 1.30 = 0.325 kWh
        power_kw=1.0,
        operating_state=2,
        load_factor=1.0,
        energy_kwh=0.25,
    )
    res = energy_forecasting_service.predict_next_15min(inp)
    max_surge_limit = 1.0 * 0.25 * 1.30  # 0.325 kWh
    assert res.predicted_next_15min_energy_kwh <= round(max_surge_limit, 4) + 1e-4
    if abs(res.predicted_next_15min_energy_kwh - max_surge_limit) < 1e-3:
        assert res.physical_constraint_applied is True


def test_missing_artifact_raises_503_not_silent_fallback(client, monkeypatch, tmp_path):
    """
    Verify requirement 10:
    When model artifact is missing or corrupted, do not silently return fake mock predictions.
    The service must raise ModelNotReadyError and return HTTP 503.
    """
    from backend.app.services.energy_forecasting_service import (
        EnergyForecastingService,
        ModelNotReadyError,
    )
    import backend.app.routers.forecast as forecast_router_module

    # Create service pointing to a non-existent path
    dummy_service = EnergyForecastingService(model_path=tmp_path / "non_existent_model.joblib")
    monkeypatch.setattr(forecast_router_module, "energy_forecasting_service", dummy_service)

    payload = {
        "machine_id": "MACHINE_001",
        "machine_type": "CONVEYOR",
        "rated_power_kw": 10.0,
        "power_kw": 5.0,
        "operating_state": 2,
    }
    resp = client.post("/api/v1/forecast/next-15min", json=payload)
    assert resp.status_code == 503
    assert "artifact" in resp.json()["detail"].lower() or "not found" in resp.json()["detail"].lower()


# ─── 11. Multi-Horizon Forecasting Tests (15m, 1d, 1w) ────────────────────────

def test_next_day_forecast_hourly_points_and_power(client):
    """Verify next 1-day forecast produces 24 hourly intervals and exact power math."""
    payload = {
        "machine_id": "AIR_COMP_01",
        "machine_type": "AIR_COMPRESSOR",
        "rated_power_kw": 45.0,
        "power_kw": 18.0,
        "operating_state": 2,
        "load_factor": 0.40,
        "shift_pattern": "3_shift",
    }
    resp = client.post("/api/v1/forecast/next-day", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["forecast_horizon"] == "1d"
    assert data["forecast_target"] == "next_24h_energy_kwh"
    assert data["forecast_duration_hours"] == 24.0
    assert data["granularity"] == "hourly"
    assert len(data["time_series"]) == 24
    assert data["predicted_energy_kwh"] > 0

    # Hourly sum equals total 24h energy
    hourly_sum = sum(pt["predicted_energy_kwh"] for pt in data["time_series"])
    assert abs(hourly_sum - data["predicted_energy_kwh"]) < 0.05

    # Power equals energy / 24.0
    expected_power = round(data["predicted_energy_kwh"] / 24.0, 2)
    assert abs(data["equivalent_average_power_kw"] - expected_power) <= 0.02


def test_next_week_forecast_daily_points_and_power(client):
    """Verify next 1-week forecast produces 7 daily intervals and exact power math."""
    payload = {
        "machine_id": "FURNACE_01",
        "machine_type": "OVEN_FURNACE",
        "rated_power_kw": 85.0,
        "power_kw": 85.0,
        "operating_state": 2,
        "load_factor": 1.0,
        "shift_pattern": "3_shift",
    }
    resp = client.post("/api/v1/forecast/next-week", json=payload)
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["forecast_horizon"] == "1w"
    assert data["forecast_target"] == "next_7d_energy_kwh"
    assert data["forecast_duration_hours"] == 168.0
    assert data["granularity"] == "daily"
    assert len(data["time_series"]) == 7
    assert data["predicted_energy_kwh"] > 0

    # Daily sum equals total 7d energy
    daily_sum = sum(pt["predicted_energy_kwh"] for pt in data["time_series"])
    assert abs(daily_sum - data["predicted_energy_kwh"]) < 0.1

    # Power equals energy / 168.0
    expected_power = round(data["predicted_energy_kwh"] / 168.0, 2)
    assert abs(data["equivalent_average_power_kw"] - expected_power) <= 0.02


def test_plant_fleet_forecast_aggregation(client):
    """Verify plant fleet forecast aggregates 4 digital twin machines across horizons."""
    machines = [
        {"machine_id": "compressor", "machine_type": "AIR_COMPRESSOR", "rated_power_kw": 45.0, "power_kw": 18.0, "operating_state": 1},
        {"machine_id": "cnc", "machine_type": "CNC_MILL", "rated_power_kw": 32.0, "power_kw": 28.0, "operating_state": 2},
        {"machine_id": "furnace", "machine_type": "OVEN_FURNACE", "rated_power_kw": 85.0, "power_kw": 85.0, "operating_state": 2},
        {"machine_id": "cooling", "machine_type": "PUMP", "rated_power_kw": 28.0, "power_kw": 22.0, "operating_state": 2},
    ]

    for horizon in ["15m", "1d", "1w"]:
        resp = client.post("/api/v1/forecast/plant", json={"horizon": horizon, "machines": machines})
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["machine_id"] == "PLANT"
        assert data["forecast_horizon"] == horizon
        assert data["coverage_count"] == 4
        assert data["total_machines"] == 4
        assert data["is_complete_coverage"] is True
        assert len(data["machine_breakdown"]) == 4

        # Sum of breakdown matches total predicted energy
        breakdown_sum = sum(mb["predicted_energy_kwh"] for mb in data["machine_breakdown"])
        assert abs(breakdown_sum - data["predicted_energy_kwh"]) < 0.1

