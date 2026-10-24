"""
WattWise AI — Industrial Energy Forecasting Dataset & Splitting Pipeline
Implements reproducible, leakage-free preprocessing and chronological time-series
data splitting for machine-level energy consumption forecasting.
"""

from pathlib import Path
from typing import Dict, List, Optional, Tuple
import hashlib
import numpy as np
import pandas as pd


# Explicit feature definitions available at prediction time t
CATEGORICAL_FEATURES = [
    "machine_id",
    "machine_type",
    "site_id",
    "shift_pattern",
    "operating_state",
]

NUMERICAL_FEATURES = [
    "rated_power_kw",
    "hour",
    "day_of_week",
    "is_weekend",
    "hour_sin",
    "hour_cos",
    "day_sin",
    "day_cos",
    "ambient_temp_c",
    "process_temp_c",
    "relative_humidity_pct",
    "load_factor",
    "operating_minutes",
    "production_units",
    "power_kw",
    "energy_kwh_lag1",
    "energy_kwh_lag2",
    "energy_kwh_lag3",
    "energy_kwh_lag4",
    "power_kw_lag1",
    "power_kw_lag2",
    "energy_rolling_mean_1h",
    "energy_rolling_std_1h",
    "energy_same_hour_prev_day",
]

ALL_FEATURE_COLUMNS = CATEGORICAL_FEATURES + NUMERICAL_FEATURES
TARGET_COLUMN = "target_next_15min_energy_kwh"


def compute_file_hash(path: Path) -> str:
    """Calculates SHA-256 hash of dataset file for lineage tracking."""
    sha = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192 * 1024):
            sha.update(chunk)
    return sha.hexdigest()[:16]


def load_and_preprocess_dataset(csv_path: Path) -> pd.DataFrame:
    """
    Loads raw CSV, repairs missing energy values with physical power*0.25,
    computes past lags and temporal encodings per machine without target leakage.
    """
    if not csv_path.exists():
        raise FileNotFoundError(f"Dataset CSV not found at: {csv_path}")

    print(f"Loading raw dataset from {csv_path} ...")
    df = pd.read_csv(csv_path)

    # 1. Parse timestamps and sort chronologically per machine
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df.sort_values(by=["machine_id", "timestamp"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # 2. Repair missing energy (due to communication dropouts) using physical power_kw * 0.25
    # Physics relationship: Energy (kWh) in 15 mins = Power (kW) * 0.25 hours
    clean_energy = df["energy_kwh"].fillna(df["power_kw"] * 0.25)

    # 3. Engineer Lag Features strictly looking BACKWARD in time
    # At prediction time t, the interval (t-15m, t] just completed.
    # Therefore, current row's clean_energy is lag1 (most recent observation).
    print("Computing historical lag features and rolling statistics per machine...")
    grouped = df.groupby("machine_id")

    df["energy_kwh_lag1"] = clean_energy
    df["energy_kwh_lag2"] = grouped[clean_energy.name].shift(1).fillna(clean_energy)
    df["energy_kwh_lag3"] = grouped[clean_energy.name].shift(2).fillna(df["energy_kwh_lag2"])
    df["energy_kwh_lag4"] = grouped[clean_energy.name].shift(3).fillna(df["energy_kwh_lag3"])

    df["power_kw_lag1"] = df["power_kw"]
    df["power_kw_lag2"] = grouped["power_kw"].shift(1).fillna(df["power_kw"])

    # Rolling statistics over last 1 hour (4 x 15-min intervals: lag1, lag2, lag3, lag4)
    lags_matrix = df[["energy_kwh_lag1", "energy_kwh_lag2", "energy_kwh_lag3", "energy_kwh_lag4"]]
    df["energy_rolling_mean_1h"] = lags_matrix.mean(axis=1)
    df["energy_rolling_std_1h"] = lags_matrix.std(axis=1).fillna(0.0)

    # Same-hour previous day baseline feature (96 intervals = 24 hours ago)
    # Where previous day is unavailable (e.g., day 1), fallback to lag1
    df["energy_same_hour_prev_day"] = grouped[clean_energy.name].shift(96).fillna(clean_energy)

    # 4. Cyclical Temporal Encodings
    df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24.0)
    df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24.0)
    df["day_sin"] = np.sin(2 * np.pi * df["day_of_week"] / 7.0)
    df["day_cos"] = np.cos(2 * np.pi * df["day_of_week"] / 7.0)

    # 5. Extract calendar date for leakage-free chronological splitting
    df["date"] = df["timestamp"].dt.date

    # Ensure operating_state is treated as categorical
    df["operating_state"] = df["operating_state"].astype(str)

    print(f"Preprocessed {len(df):,} records with {len(ALL_FEATURE_COLUMNS)} input features.")
    return df


def chronological_split(
    df: pd.DataFrame,
    train_pct: float = 0.70,
    val_pct: float = 0.15,
    test_pct: float = 0.15,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict[str, any]]:
    """
    Performs chronological splitting by unique dates to prevent temporal leakage.
    First 70% dates -> Train
    Next 15% dates  -> Validation
    Final 15% dates -> Test
    """
    assert abs(train_pct + val_pct + test_pct - 1.0) < 1e-5, "Split percentages must sum to 1.0"

    unique_dates = sorted(df["date"].unique())
    n_dates = len(unique_dates)

    train_end = int(n_dates * train_pct)
    val_end = int(n_dates * (train_pct + val_pct))

    train_dates = unique_dates[:train_end]
    val_dates = unique_dates[train_end:val_end]
    test_dates = unique_dates[val_end:]

    train_df = df[df["date"].isin(train_dates)].copy()
    val_df = df[df["date"].isin(val_dates)].copy()
    test_df = df[df["date"].isin(test_dates)].copy()

    # Validation: ensure strictly disjoint dates
    assert set(train_dates).isdisjoint(set(val_dates)), "Temporal leakage between train and val!"
    assert set(val_dates).isdisjoint(set(test_dates)), "Temporal leakage between val and test!"
    assert set(train_dates).isdisjoint(set(test_dates)), "Temporal leakage between train and test!"

    split_meta = {
        "total_unique_dates": n_dates,
        "train_dates_count": len(train_dates),
        "train_range": f"{train_dates[0]} to {train_dates[-1]}",
        "train_records": len(train_df),
        "val_dates_count": len(val_dates),
        "val_range": f"{val_dates[0]} to {val_dates[-1]}",
        "val_records": len(val_df),
        "test_dates_count": len(test_dates),
        "test_range": f"{test_dates[0]} to {test_dates[-1]}",
        "test_records": len(test_df),
    }

    print(
        f"Chronological split complete:\n"
        f"  Train: {len(train_df):,} records ({split_meta['train_range']})\n"
        f"  Val:   {len(val_df):,} records ({split_meta['val_range']})\n"
        f"  Test:  {len(test_df):,} records ({split_meta['test_range']})"
    )

    return train_df, val_df, test_df, split_meta


def unseen_machine_split(
    df: pd.DataFrame,
    holdout_machines: Optional[List[str]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, List[str]]:
    """
    Separates unseen machines for out-of-sample machine generalization testing.
    Default holdouts: 1 machine from 6 diverse machine types.
    """
    if holdout_machines is None:
        # Select 6 diverse machines across types
        holdout_machines = [
            "MACHINE_001",  # CONVEYOR
            "MACHINE_011",  # AIR_COMPRESSOR
            "MACHINE_008",  # CNC_MILL
            "MACHINE_006",  # HYDRAULIC_PRESS
            "MACHINE_007",  # INJECTION_MOLDER
            "MACHINE_003",  # PUMP
        ]

    train_machines_df = df[~df["machine_id"].isin(holdout_machines)].copy()
    unseen_machines_df = df[df["machine_id"].isin(holdout_machines)].copy()

    return train_machines_df, unseen_machines_df, holdout_machines
