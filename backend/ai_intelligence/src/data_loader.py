"""
Data Loader & Dataset Profiler for Energy Anomaly Detection.
"""

import os
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import pandas as pd
import numpy as np

EXPECTED_COLUMNS = [
    "reading_id",
    "timestamp",
    "equipment_id",
    "operating_mode",
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
    "is_anomaly",
    "anomaly_type",
    "rolling_anomaly_rate",
    "maintenance_priority_score",
    "alert_code",
]

_SRC_DIR = Path(__file__).resolve().parent
_PKG_DIR = _SRC_DIR.parent
_REPO_ROOT = _PKG_DIR.parent.parent

DEFAULT_DATA_PATHS = [
    _PKG_DIR / "data" / "synthetic_v1" / "telemetry.csv",
    _PKG_DIR / "data" / "data.csv",
    _REPO_ROOT / "src" / "data" / "data.csv",
    Path("data/synthetic_v1/telemetry.csv"),
    Path("data/data.csv"),
    Path("../data/synthetic_v1/telemetry.csv"),
    Path("../data/data.csv"),
    Path("src/data/data.csv"),
]

SYNTHETIC_V1_REQUIRED_COLUMNS = [
    "timestamp",
    "equipment_id",
    "equipment_type",
    "operating_mode",
    "power_consumption_kw",
    "is_anomaly",
    "anomaly_type",
    "severity",
]


def find_data_file(custom_path: Optional[str] = None) -> Path:
    """Locate data file from a custom path or search standard project locations."""
    if custom_path and os.path.exists(custom_path):
        return Path(custom_path)
    
    for candidate in DEFAULT_DATA_PATHS:
        if candidate.exists():
            return candidate.resolve()
            
    raise FileNotFoundError(
        f"Data file not found in candidate paths: {[str(p) for p in DEFAULT_DATA_PATHS]}"
    )


def load_and_validate_data(filepath: Optional[str] = None) -> pd.DataFrame:
    """
    Load telemetry CSV and perform schema and type validation.
    Supports both synthetic_v1 and legacy data.csv schemas.
    Returns sorted, timestamp-parsed DataFrame.
    """
    target_path = find_data_file(filepath)
    df = pd.read_csv(target_path)

    # 1. Schema check based on dataset version
    if "equipment_type" in df.columns:
        # Synthetic v1 schema
        missing_cols = [c for c in SYNTHETIC_V1_REQUIRED_COLUMNS if c not in df.columns]
        if missing_cols:
            raise ValueError(f"Synthetic v1 schema mismatch: missing columns {missing_cols}")
    else:
        # Legacy data.csv schema
        missing_cols = [c for c in EXPECTED_COLUMNS if c not in df.columns]
        if missing_cols:
            raise ValueError(f"Legacy schema mismatch: missing columns {missing_cols}")

    # 2. Parse timestamps and sort chronologically
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(by=["timestamp", "equipment_id"]).reset_index(drop=True)

    # 3. Ensure boolean/int target
    df["is_anomaly"] = df["is_anomaly"].astype(int)

    return df



def profile_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Create a short dataset profile:
    row count, missing values, duplicates, label distribution, equipment coverage, etc.
    """
    total_rows = len(df)
    missing_by_col = df.isnull().sum()
    missing_cols = {col: int(count) for col, count in missing_by_col[missing_by_col > 0].items()}
    
    dup_exact = int(df.duplicated().sum())
    dup_ts_equip = int(df.duplicated(subset=["timestamp", "equipment_id"]).sum())

    equipment_counts = {str(k): int(v) for k, v in df["equipment_id"].value_counts().items()}
    operating_modes = {str(k): int(v) for k, v in df["operating_mode"].value_counts().items()}
    
    anomaly_counts = {int(k): int(v) for k, v in df["is_anomaly"].value_counts().items()}
    anomaly_rate_pct = round((anomaly_counts.get(1, 0) / total_rows) * 100, 2)

    anomaly_types = {str(k): int(v) for k, v in df["anomaly_type"].value_counts().items()} if "anomaly_type" in df.columns else {}
    alert_codes = {str(k): int(v) for k, v in df["alert_code"].value_counts().items()} if "alert_code" in df.columns else {}


    min_ts = str(df["timestamp"].min())
    max_ts = str(df["timestamp"].max())
    unique_ts = int(df["timestamp"].nunique())

    profile = {
        "total_rows": total_rows,
        "total_columns": len(df.columns),
        "columns": list(df.columns),
        "timestamp_coverage": {
            "start": min_ts,
            "end": max_ts,
            "unique_timestamps": unique_ts,
        },
        "missing_values": missing_cols,
        "duplicates": {
            "exact_duplicate_rows": dup_exact,
            "timestamp_equipment_duplicates": dup_ts_equip,
        },
        "equipment_counts": equipment_counts,
        "operating_modes": operating_modes,
        "anomaly_distribution": {
            "normal_count": anomaly_counts.get(0, 0),
            "anomaly_count": anomaly_counts.get(1, 0),
            "anomaly_rate_pct": anomaly_rate_pct,
        },
        "anomaly_types": anomaly_types,
        "alert_codes": alert_codes,
    }
    return profile
