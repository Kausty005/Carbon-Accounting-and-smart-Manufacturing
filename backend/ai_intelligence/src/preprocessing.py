"""
Preprocessing and Chronological Split Module for Anomaly Detection.
Guarantees strict data leakage prevention.
"""

from typing import Tuple, List, Optional
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler, OneHotEncoder

# STRICTLY PROHIBITED AS MODEL INPUTS
LEAKAGE_COLUMNS = [
    "is_anomaly",                  # target label
    "anomaly_type",                # evaluation/explanation ground truth
    "is_energy_waste",             # ground truth label
    "severity",                    # ground truth severity
    "rolling_anomaly_rate",        # post-hoc centered window from anomaly labels
    "maintenance_priority_score",  # derived from anomaly status
    "alert_code",                  # derived from anomaly type
    "reading_id",                  # identifier
    "event_id",                    # identifier
    "data_provenance",             # simulation metadata
]


CATEGORICAL_FEATURES = [
    "equipment_id",
    "operating_mode",
]

SENSOR_NUMERIC_FEATURES = [
    "temperature_c",
    "vibration_mm_s",
    "pressure_kpa",
    "motor_rpm",
    "flow_rate_lpm",
    "power_consumption_kw",
    "coolant_temp_c",
    "acoustic_level_db",
    "oil_viscosity_cst",
    "humidity_pct",
    "ambient_temp_c",
    "equipment_age_hours",
    "hours_since_maintenance",
]


def verify_no_leakage(columns: List[str]) -> None:
    """Raise ValueError if any forbidden leakage column is present in feature list."""
    detected = [col for col in columns if col in LEAKAGE_COLUMNS]
    if detected:
        raise ValueError(f"CRITICAL DATA LEAKAGE: Forbidden columns found in feature set: {detected}")


def chronological_split(
    df: pd.DataFrame,
    train_pct: float = 0.70,
    val_pct: float = 0.15,
    test_pct: float = 0.15,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Split the dataset chronologically based on unique timestamps.
    Keeps all equipment readings for a given timestamp on the same side of the split.
    """
    assert abs((train_pct + val_pct + test_pct) - 1.0) < 1e-5, "Split percentages must sum to 1.0"

    df_sorted = df.sort_values(by="timestamp").copy()
    unique_ts = df_sorted["timestamp"].drop_duplicates().sort_values().reset_index(drop=True)
    n_ts = len(unique_ts)

    train_end_idx = int(n_ts * train_pct) - 1
    val_end_idx = int(n_ts * (train_pct + val_pct)) - 1

    train_end_ts = unique_ts.iloc[train_end_idx]
    val_end_ts = unique_ts.iloc[val_end_idx]

    train_df = df_sorted[df_sorted["timestamp"] <= train_end_ts].copy()
    val_df = df_sorted[(df_sorted["timestamp"] > train_end_ts) & (df_sorted["timestamp"] <= val_end_ts)].copy()
    test_df = df_sorted[df_sorted["timestamp"] > val_end_ts].copy()

    return train_df, val_df, test_df


def build_preprocessor(
    categorical_cols: Optional[List[str]] = None,
    numeric_cols: Optional[List[str]] = None,
) -> ColumnTransformer:
    """
    Build scikit-learn ColumnTransformer for numerical and categorical features.
    Fitted exclusively on training data.
    """
    cat_cols = categorical_cols or CATEGORICAL_FEATURES
    num_cols = numeric_cols or SENSOR_NUMERIC_FEATURES

    # Verify no leakage
    verify_no_leakage(cat_cols + num_cols)

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )

    categorical_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", numeric_transformer, num_cols),
            ("cat", categorical_transformer, cat_cols),
        ],
        remainder="drop",
    )

    return preprocessor


def extract_features_and_target(
    df: pd.DataFrame,
    feature_cols: Optional[List[str]] = None,
) -> Tuple[pd.DataFrame, Optional[pd.Series], pd.DataFrame]:
    """
    Extract feature DataFrame X, binary target Series y (if available), and context meta DataFrame.
    Strictly removes all leakage columns from X.
    """
    if feature_cols is None:
        non_feature_cols = set(LEAKAGE_COLUMNS + ["timestamp", "reading_id", "event_id", "data_provenance"])
        clean_cols = [c for c in df.columns if c not in non_feature_cols]
    else:
        clean_cols = [c for c in feature_cols if c in df.columns and c not in ["reading_id", "timestamp", "event_id"]]

    verify_no_leakage(clean_cols)

    X = df[clean_cols].copy()
    y = df["is_anomaly"].copy() if "is_anomaly" in df.columns else None

    # Context dataframe for reporting / evidence
    meta_cols = [c for c in ["reading_id", "event_id", "timestamp", "equipment_id", "equipment_type", "operating_mode", "anomaly_type", "severity", "is_energy_waste", "alert_code"] if c in df.columns]
    meta = df[meta_cols].copy()

    return X, y, meta

