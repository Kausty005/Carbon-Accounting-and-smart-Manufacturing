"""
Unit & Integration Test Suite for AI & Energy Intelligence.
Tests schema validation, data leakage prevention, chronological splitting,
pressure-leak features, temporal leakage, missing/irregular timestamps,
energy units, carbon calculations, and health vs energy decoupling.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from backend.ai_intelligence.src.config import (
    DEFAULT_SAMPLING_INTERVAL_HOURS,
    GRID_EMISSION_FACTOR_KG_PER_KWH,
    INDUSTRIAL_TARIFF_INR_PER_KWH,
    MAX_INTEGRATION_GAP_HOURS,
)
from backend.ai_intelligence.src.data_loader import (
    EXPECTED_COLUMNS,
    load_and_validate_data,
    profile_dataset,
)
from backend.ai_intelligence.src.energy_baseline import OperatingConditionEnergyBaseline
from backend.ai_intelligence.src.explanations import determine_severity, generate_anomaly_record
from backend.ai_intelligence.src.feature_engineering import (
    ConditionAwareFeatureTransformer,
    add_engineered_features,
)
from backend.ai_intelligence.src.inference import EnergyIntelligencePipeline
from backend.ai_intelligence.src.isolation_forest import UnsupervisedIsolationForestDetector
from backend.ai_intelligence.src.kpis import calculate_energy_kpis
from backend.ai_intelligence.src.preprocessing import (
    LEAKAGE_COLUMNS,
    chronological_split,
    extract_features_and_target,
    verify_no_leakage,
)
from backend.ai_intelligence.src.supervised_model import SupervisedAnomalyClassifier


@pytest.fixture
def sample_fixture_df():
    """Small canonical test fixture with 20 rows across 2 equipment units and 10 timestamps."""
    timestamps = pd.date_range("2024-01-01 00:00:00", periods=10, freq="1min")
    rows = []
    rid = 0
    for ts in timestamps:
        for eq in ["EQ-001", "EQ-002"]:
            is_anom = 1 if rid in [3, 7] else 0
            rows.append({
                "reading_id": f"R{rid:05d}",
                "timestamp": ts,
                "equipment_id": eq,
                "operating_mode": "normal" if rid < 16 else "high_load",
                "temperature_c": 110.0 + (rid * 0.5) if rid != 5 else np.nan,
                "vibration_mm_s": 0.22 if is_anom == 0 else 0.85,
                "pressure_kpa": 150.0 if is_anom == 0 else 140.0,
                "motor_rpm": 2950.0,
                "flow_rate_lpm": 26.5 if is_anom == 0 else 29.0,
                "power_consumption_kw": 49.0 if is_anom == 0 else 62.0,
                "coolant_temp_c": 25.0,
                "acoustic_level_db": 73.0,
                "oil_viscosity_cst": 75.0,
                "humidity_pct": 52.0,
                "ambient_temp_c": 22.0,
                "equipment_age_hours": 2000.0,
                "hours_since_maintenance": 50.0,
                "is_anomaly": is_anom,
                "anomaly_type": "pressure_leak" if is_anom else "normal",
                "rolling_anomaly_rate": 0.05,
                "maintenance_priority_score": 10.0,
                "alert_code": "PRESS_WARN" if is_anom else "NONE",
            })
            rid += 1
    return pd.DataFrame(rows)


def test_schema_and_column_verification(sample_fixture_df):
    """Test that all expected columns are present and schema validation works."""
    for col in EXPECTED_COLUMNS:
        assert col in sample_fixture_df.columns

    broken = sample_fixture_df.drop(columns=["power_consumption_kw"])
    assert "power_consumption_kw" not in broken.columns


def test_leakage_exclusion():
    """Verify that forbidden leakage columns are detected and excluded."""
    for leak_col in LEAKAGE_COLUMNS:
        with pytest.raises(ValueError):
            verify_no_leakage(["temperature_c", leak_col])

    clean_features = ["temperature_c", "vibration_mm_s", "power_consumption_kw"]
    verify_no_leakage(clean_features)


def test_extract_features_no_leakage(sample_fixture_df):
    """Ensure extract_features_and_target strips out leakage and identifier fields."""
    X, y, meta = extract_features_and_target(sample_fixture_df)
    for col in LEAKAGE_COLUMNS:
        assert col not in X.columns
    assert "reading_id" not in X.columns
    assert "timestamp" not in X.columns
    assert len(X) == len(sample_fixture_df)
    assert len(y) == len(sample_fixture_df)


def test_chronological_split(sample_fixture_df):
    """Ensure chronological split maintains timestamp boundaries without overlapping timestamps."""
    train_df, val_df, test_df = chronological_split(sample_fixture_df, train_pct=0.70, val_pct=0.15, test_pct=0.15)
    
    assert len(train_df) > 0
    assert len(val_df) > 0
    assert len(test_df) > 0
    assert len(train_df) + len(val_df) + len(test_df) == len(sample_fixture_df)

    max_train_ts = train_df["timestamp"].max()
    min_val_ts = val_df["timestamp"].min()
    max_val_ts = val_df["timestamp"].max()
    min_test_ts = test_df["timestamp"].min()

    assert max_train_ts < min_val_ts
    assert max_val_ts < min_test_ts


def test_temporal_lookahead_leakage(sample_fixture_df):
    """Verify that rolling features on row t never depend on future row t+1."""
    df_sorted = sample_fixture_df.sort_values(by=["equipment_id", "timestamp"]).reset_index(drop=True)
    eq1_data = df_sorted[df_sorted["equipment_id"] == "EQ-001"].copy().reset_index(drop=True)
    
    feat_orig = add_engineered_features(eq1_data)
    val_t_minus_1 = feat_orig.loc[3, "temp_dev_30m"]

    eq1_perturbed = eq1_data.copy()
    eq1_perturbed.loc[5, "temperature_c"] += 1000.0
    feat_perturbed = add_engineered_features(eq1_perturbed)

    assert abs(feat_perturbed.loc[3, "temp_dev_30m"] - val_t_minus_1) < 1e-6


def test_pressure_leak_features(sample_fixture_df):
    """Verify hydraulic conductance and condition-aware pressure baseline."""
    transformer = ConditionAwareFeatureTransformer().fit(sample_fixture_df)
    transformed = add_engineered_features(sample_fixture_df, transformer=transformer)

    assert "flow_pressure_ratio" in transformed.columns
    assert "press_cond_dev" in transformed.columns
    assert "press_cond_z" in transformed.columns

    leak_rows = transformed[transformed["pressure_kpa"] == 140.0]
    normal_rows = transformed[transformed["pressure_kpa"] == 150.0]
    assert leak_rows["press_cond_dev"].mean() < normal_rows["press_cond_dev"].mean()


def test_irregular_sampling_and_missing_timestamps():
    """Verify that energy integration handles irregular intervals and caps large gaps."""
    timestamps = [
        pd.Timestamp("2024-01-01 00:00:00"),
        pd.Timestamp("2024-01-01 00:01:00"),
        pd.Timestamp("2024-01-01 00:06:00"),
        pd.Timestamp("2024-01-01 00:16:00"),
        pd.Timestamp("2024-01-01 01:16:00"),
    ]
    df_irreg = pd.DataFrame({
        "timestamp": timestamps,
        "equipment_id": ["EQ-001"] * 5,
        "operating_mode": ["normal"] * 5,
        "power_consumption_kw": [60.0] * 5,
    })

    kpis = calculate_energy_kpis(df_irreg)
    plant = kpis["plant_kpis"]

    expected_energy = 60.0 * (1.0/60.0 + 1.0/60.0 + 5.0/60.0 + 10.0/60.0 + 0.25)
    assert abs(plant["total_measured_energy_kwh"] - round(expected_energy, 2)) < 0.1


def test_energy_units_and_carbon_calculations(sample_fixture_df):
    """Test energy units (kW * hr = kWh), CEA India grid carbon, and tariff math."""
    kpis = calculate_energy_kpis(
        sample_fixture_df,
        grid_emission_factor=0.82,
        electricity_tariff_inr=8.00,
    )
    plant = kpis["plant_kpis"]
    carbon = kpis["carbon_accounting"]

    total_kwh = plant["total_measured_energy_kwh"]
    expected_carbon_kg = round(total_kwh * 0.82, 2)
    assert abs(carbon["scope_2_electricity_emissions_kg_co2e"] - expected_carbon_kg) < 0.05

    assert "CEA India" in carbon["grid_emission_factor_used"]
    assert "INR 8" in carbon["electricity_tariff_used"]
    assert "disclaimer" in carbon


def test_decoupling_equipment_health_from_energy_waste():
    """Verify that a pure mechanical bearing fault does NOT trigger an energy waste anomaly."""
    row = pd.Series({
        "equipment_id": "EQ-001",
        "timestamp": pd.Timestamp("2024-01-01 10:00:00"),
        "operating_mode": "normal",
        "power_consumption_kw": 49.0,
        "vibration_mm_s": 0.88,
        "temperature_c": 110.0,
        "pressure_kpa": 150.0,
        "anomaly_type": "bearing_degradation",
    })

    rec = generate_anomaly_record(
        row=row,
        model_name="Unit Test Model",
        expected_power_kw=49.0,
        deviation_kw=0.0,
        deviation_pct=0.0,
        estimated_excess_energy_kwh=0.0,
    )

    assert rec["is_anomaly"] is True
    assert rec["anomaly_type"] == "bearing_degradation"
    assert rec["estimated_excess_energy_kwh"] is None
    assert any("within normal operating limits" in ev for ev in rec["evidence"])


def test_model_training_and_pipeline_persistence(tmp_path, sample_fixture_df):
    """Test model fitting, threshold tuning, serialization to disk, and reloading."""
    transformer = ConditionAwareFeatureTransformer().fit(sample_fixture_df)
    df_feat = add_engineered_features(sample_fixture_df, transformer=transformer)
    X, y, meta = extract_features_and_target(df_feat)

    # Supervised
    rf = SupervisedAnomalyClassifier(n_estimators=10, max_depth=5, random_state=42)
    rf.fit(X, y)
    probs = rf.predict_proba(X)
    preds = rf.predict(X)
    assert len(preds) == len(X)
    assert 0 <= probs.min() and probs.max() <= 1.0

    # Isolation Forest
    iso = UnsupervisedIsolationForestDetector(n_estimators=10, random_state=42)
    iso.fit(X, y)
    iso_preds = iso.predict(X)
    assert len(iso_preds) == len(X)

    # Energy baseline
    eb = OperatingConditionEnergyBaseline()
    eb.fit(sample_fixture_df)

    # Save
    models_dir = tmp_path / "models"
    pipe = EnergyIntelligencePipeline(
        supervised_model=rf,
        isolation_forest_model=iso,
        energy_baseline_model=eb,
        feature_transformer=transformer,
        metadata={"version": "test-1.1"},
    )
    saved = pipe.save_artifacts(models_dir=str(models_dir))
    assert Path(saved["supervised_model"]).exists()
    assert Path(saved["feature_transformer"]).exists()
    assert Path(saved["metadata"]).exists()

    # Reload
    reloaded = EnergyIntelligencePipeline.load_saved_model(models_dir=str(models_dir))
    assert reloaded.supervised_model is not None
    assert reloaded.feature_transformer is not None
    assert reloaded.metadata["version"] == "test-1.1"

    # Predict new readings
    inf_res = reloaded.predict_new_readings(sample_fixture_df.tail(4))
    assert inf_res["total_input_readings"] == 4
    assert "energy_kpis" in inf_res
