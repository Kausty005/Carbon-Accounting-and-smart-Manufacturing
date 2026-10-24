"""
WattWise AI — Energy Forecasting Feature Pipeline & Preprocessor
Builds production-grade ColumnTransformer and inference feature transformers.
"""

from pathlib import Path
import sys
from typing import Any, Dict, List
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from ml.energy_forecasting.src.dataset import (
    CATEGORICAL_FEATURES,
    NUMERICAL_FEATURES,
    ALL_FEATURE_COLUMNS,
)


def build_preprocessor() -> ColumnTransformer:
    """
    Constructs a ColumnTransformer that:
    1. OneHotEncodes categorical features with handle_unknown='ignore' (unseen machines produce all zeros).
    2. Imputes and scales numerical features.
    Produces 89 standardized features for model training and inference.
    """
    cat_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="UNKNOWN")),
        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    num_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", cat_pipeline, CATEGORICAL_FEATURES),
            ("num", num_pipeline, NUMERICAL_FEATURES),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    return preprocessor


def prepare_inference_features(input_dict: Dict[str, Any]) -> pd.DataFrame:
    """
    Validates and transforms a single inference payload into the exact DataFrame
    expected by the trained energy forecasting pipeline.
    
    Accepts current machine operating conditions and past energy/power measurements.
    Computes required cyclical and derived lag features.
    """
    def _get(key: str, default: Any) -> Any:
        v = input_dict.get(key)
        return default if v is None else v

    # 1. Base values and defaults
    machine_id = str(_get("machine_id", "MACHINE_001"))
    machine_type = str(_get("machine_type", "AIR_COMPRESSOR"))
    site_id = str(_get("site_id", "SITE_01"))
    shift_pattern = str(_get("shift_pattern", "3_shift"))
    operating_state = str(_get("operating_state", "2"))

    rated_power_kw = float(_get("rated_power_kw", 20.0))
    power_kw = float(_get("power_kw", 10.0))

    # If energy_kwh is not supplied, use physical relation: power_kw * 0.25 h
    raw_energy = _get("energy_kwh", None)
    energy_kwh = float(raw_energy) if raw_energy is not None else float(power_kw * 0.25)

    hour = int(_get("hour", 12))
    day_of_week = int(_get("day_of_week", 2))
    raw_weekend = _get("is_weekend", None)
    is_weekend = int(raw_weekend) if raw_weekend is not None else int(1 if day_of_week in [5, 6] else 0)

    # Cyclical encodings
    hour_sin = np.sin(2 * np.pi * hour / 24.0)
    hour_cos = np.cos(2 * np.pi * hour / 24.0)
    day_sin = np.sin(2 * np.pi * day_of_week / 7.0)
    day_cos = np.cos(2 * np.pi * day_of_week / 7.0)

    ambient_temp_c = float(_get("ambient_temp_c", 27.5))
    process_temp_c = float(_get("process_temp_c", 35.0))
    relative_humidity_pct = float(_get("relative_humidity_pct", 58.0))

    raw_load_factor = _get("load_factor", None)
    load_factor = float(raw_load_factor) if raw_load_factor is not None else float(min(1.0, max(0.0, power_kw / rated_power_kw if rated_power_kw > 0 else 0.5)))
    operating_minutes = float(_get("operating_minutes", 15.0 if operating_state in ["2", 2] else 0.0))
    production_units = float(_get("production_units", 1.0 if operating_state in ["2", 2] else 0.0))

    # Past lags (if not supplied, fall back to current interval's energy/power)
    energy_kwh_lag1 = float(_get("energy_kwh_lag1", energy_kwh))
    energy_kwh_lag2 = float(_get("energy_kwh_lag2", energy_kwh_lag1))
    energy_kwh_lag3 = float(_get("energy_kwh_lag3", energy_kwh_lag2))
    energy_kwh_lag4 = float(_get("energy_kwh_lag4", energy_kwh_lag3))

    power_kw_lag1 = float(_get("power_kw_lag1", power_kw))
    power_kw_lag2 = float(_get("power_kw_lag2", power_kw_lag1))

    # Rolling statistics
    recent_lags = [energy_kwh_lag1, energy_kwh_lag2, energy_kwh_lag3, energy_kwh_lag4]
    energy_rolling_mean_1h = float(np.mean(recent_lags))
    energy_rolling_std_1h = float(np.std(recent_lags))

    energy_same_hour_prev_day = float(_get("energy_same_hour_prev_day", energy_kwh_lag1))

    record = {
        # Categoricals
        "machine_id": machine_id,
        "machine_type": machine_type,
        "site_id": site_id,
        "shift_pattern": shift_pattern,
        "operating_state": operating_state,
        # Numericals
        "rated_power_kw": rated_power_kw,
        "hour": hour,
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "day_sin": day_sin,
        "day_cos": day_cos,
        "ambient_temp_c": ambient_temp_c,
        "process_temp_c": process_temp_c,
        "relative_humidity_pct": relative_humidity_pct,
        "load_factor": load_factor,
        "operating_minutes": operating_minutes,
        "production_units": production_units,
        "power_kw": power_kw,
        "energy_kwh_lag1": energy_kwh_lag1,
        "energy_kwh_lag2": energy_kwh_lag2,
        "energy_kwh_lag3": energy_kwh_lag3,
        "energy_kwh_lag4": energy_kwh_lag4,
        "power_kw_lag1": power_kw_lag1,
        "power_kw_lag2": power_kw_lag2,
        "energy_rolling_mean_1h": energy_rolling_mean_1h,
        "energy_rolling_std_1h": energy_rolling_std_1h,
        "energy_same_hour_prev_day": energy_same_hour_prev_day,
    }

    df_inf = pd.DataFrame([record])[ALL_FEATURE_COLUMNS]
    return df_inf
