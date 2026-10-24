"""
Feature Engineering for Industrial Equipment & Energy Intelligence.
Strictly relies on current and past information only (no future leakage).
Includes condition-aware baseline deviations and hydraulic features to detect pressure leaks.
"""

from typing import List, Tuple, Dict, Optional, Any
import pandas as pd
import numpy as np


ENGINEERED_NUMERIC_FEATURES = [
    "press_cond_dev",          # Condition-aware pressure deviation from (equipment, mode) baseline
    "press_cond_z",            # Condition-aware pressure z-score
    "flow_pressure_ratio",     # Hydraulic conductance: flow_rate_lpm / (pressure_kpa + 1.0)
    "press_diff_5m",           # Backward causal drop in pressure over last 5 minutes
    "temp_dev_30m",            # Temperature - rolling 30m mean
    "press_dev_30m",           # Pressure - rolling 30m mean
    "vib_dev_30m",             # Vibration - rolling 30m mean
    "power_dev_30m",           # Power - rolling 30m mean
    "temp_gradient",           # Temperature_c - ambient_temp_c
    "coolant_efficiency",      # Temperature_c - coolant_temp_c
    "power_rpm_ratio",         # Power_consumption_kw / (motor_rpm + 1e-3)
    "vib_acoustic_interaction",# Vibration_mm_s * acoustic_level_db
    "hour_of_day",             # Hour from timestamp
    "day_of_week",             # Day of week from timestamp
]


class ConditionAwareFeatureTransformer:
    """
    Fits operating-condition sensor statistics strictly on training data
    and applies them without look-ahead leakage.
    """

    def __init__(self):
        # Maps (equipment_id, operating_mode) -> dict of stats
        self.press_stats_: Dict[Tuple[str, str], Dict[str, float]] = {}
        self.mode_press_fallback_: Dict[str, Dict[str, float]] = {}
        self.global_press_mean_: float = 150.0
        self.global_press_std_: float = 4.0
        self.is_fitted: bool = False

    def fit(self, train_df: pd.DataFrame) -> "ConditionAwareFeatureTransformer":
        """Fit condition-aware baselines exclusively from training data."""
        # Use normal training readings if labeled, else all training readings
        if "is_anomaly" in train_df.columns:
            fit_data = train_df[train_df["is_anomaly"] == 0]
        else:
            fit_data = train_df

        press_col = "pressure_kpa" if "pressure_kpa" in fit_data.columns else (
            "discharge_pressure_bar" if "discharge_pressure_bar" in fit_data.columns else None
        )
        if press_col and "equipment_id" in fit_data.columns and "operating_mode" in fit_data.columns:
            valid = fit_data.dropna(subset=[press_col, "equipment_id", "operating_mode"])
            if len(valid) > 0:
                self.global_press_mean_ = float(valid[press_col].mean())
                self.global_press_std_ = float(valid[press_col].std()) or 4.0

                # Group by (equipment_id, operating_mode)
                grouped = valid.groupby(["equipment_id", "operating_mode"])[press_col].agg(["mean", "std"])
                self.press_stats_ = {}
                for (eq, mode), row in grouped.iterrows():
                    m = float(row["mean"])
                    s = float(row["std"]) if not np.isnan(row["std"]) and row["std"] > 0.1 else 2.0
                    self.press_stats_[(str(eq), str(mode))] = {"mean": m, "std": s}

                # Fallback by operating_mode only
                mode_grouped = valid.groupby("operating_mode")[press_col].agg(["mean", "std"])
                self.mode_press_fallback_ = {}
                for mode, row in mode_grouped.iterrows():
                    m = float(row["mean"])
                    s = float(row["std"]) if not np.isnan(row["std"]) and row["std"] > 0.1 else 3.0
                    self.mode_press_fallback_[str(mode)] = {"mean": m, "std": s}

        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Apply condition-aware pressure baseline transformations."""
        data = df.copy()
        n = len(data)
        exp_mean = np.full(n, self.global_press_mean_)
        exp_std = np.full(n, self.global_press_std_)

        if self.is_fitted:
            for i, row in data.reset_index(drop=True).iterrows():
                eq = str(row.get("equipment_id", "UNKNOWN"))
                mode = str(row.get("operating_mode", "normal"))
                key = (eq, mode)
                if key in self.press_stats_:
                    exp_mean[i] = self.press_stats_[key]["mean"]
                    exp_std[i] = self.press_stats_[key]["std"]
                elif mode in self.mode_press_fallback_:
                    exp_mean[i] = self.mode_press_fallback_[mode]["mean"]
                    exp_std[i] = self.mode_press_fallback_[mode]["std"]

        data["exp_press_mean"] = exp_mean
        data["exp_press_std"] = exp_std

        press_col = "pressure_kpa" if "pressure_kpa" in data.columns else (
            "discharge_pressure_bar" if "discharge_pressure_bar" in data.columns else None
        )
        if press_col:
            data["press_cond_dev"] = data[press_col] - data["exp_press_mean"]
            safe_std = np.where(data["exp_press_std"] > 0.1, data["exp_press_std"], 1.0)
            data["press_cond_z"] = data["press_cond_dev"] / safe_std
        else:
            data["press_cond_dev"] = 0.0
            data["press_cond_z"] = 0.0

        return data



def add_engineered_features(
    df: pd.DataFrame,
    transformer: Optional[ConditionAwareFeatureTransformer] = None,
) -> pd.DataFrame:
    """
    Generate causal, physics-inspired, temporal, and hydraulic features.
    Computes interactions on current sensor values and causal rolling deviations.
    Guarantees no future look-ahead leakage.
    """
    data = df.copy()

    # Time-based features
    if "timestamp" in data.columns:
        ts = pd.to_datetime(data["timestamp"])
        data["hour_of_day"] = ts.dt.hour
        data["day_of_week"] = ts.dt.dayofweek
    else:
        data["hour_of_day"] = 12
        data["day_of_week"] = 2

    # Physical interaction features
    if "temperature_c" in data.columns and "ambient_temp_c" in data.columns:
        data["temp_gradient"] = data["temperature_c"] - data["ambient_temp_c"]
    else:
        data["temp_gradient"] = np.nan

    if "temperature_c" in data.columns and "coolant_temp_c" in data.columns:
        data["coolant_efficiency"] = data["temperature_c"] - data["coolant_temp_c"]
    else:
        data["coolant_efficiency"] = np.nan

    if "power_consumption_kw" in data.columns and "motor_rpm" in data.columns:
        data["power_rpm_ratio"] = data["power_consumption_kw"] / (data["motor_rpm"].abs() + 1.0)
    else:
        data["power_rpm_ratio"] = np.nan

    if "vibration_mm_s" in data.columns and "acoustic_level_db" in data.columns:
        data["vib_acoustic_interaction"] = data["vibration_mm_s"] * data["acoustic_level_db"]
    else:
        data["vib_acoustic_interaction"] = np.nan

    # Hydraulic conductance feature for pressure-leak detection: flow_rate_lpm / (pressure_kpa + 1.0)
    if "flow_rate_lpm" in data.columns and "pressure_kpa" in data.columns:
        data["flow_pressure_ratio"] = data["flow_rate_lpm"] / (data["pressure_kpa"].abs() + 1.0)
    else:
        data["flow_pressure_ratio"] = np.nan

    # Backward-looking rolling deviation and causal lag per equipment (strictly past observations)
    if "equipment_id" in data.columns:
        if "timestamp" in data.columns:
            data = data.sort_values(by=["equipment_id", "timestamp"]).reset_index(drop=True)
        else:
            data = data.sort_values(by=["equipment_id"]).reset_index(drop=True)

        for sensor, dev_col in [
            ("temperature_c", "temp_dev_30m"),
            ("pressure_kpa", "press_dev_30m"),
            ("vibration_mm_s", "vib_dev_30m"),
            ("power_consumption_kw", "power_dev_30m"),
        ]:
            if sensor in data.columns:
                rolling_mean = (
                    data.groupby("equipment_id")[sensor]
                    .transform(lambda s: s.rolling(30, min_periods=1).mean())
                )
                data[dev_col] = data[sensor] - rolling_mean
            else:
                data[dev_col] = 0.0

        # Causal backward lag diff (rate of pressure change over preceding interval)
        press_col = "pressure_kpa" if "pressure_kpa" in data.columns else (
            "discharge_pressure_bar" if "discharge_pressure_bar" in data.columns else None
        )
        if press_col:
            data["press_diff_5m"] = (
                data.groupby("equipment_id")[press_col]
                .diff(1)
                .fillna(0.0)
            )
        else:
            data["press_diff_5m"] = 0.0


        # Restore chronological order if timestamp present
        if "timestamp" in data.columns:
            data = data.sort_values(by="timestamp").reset_index(drop=True)
    else:
        data["temp_dev_30m"] = 0.0
        data["press_dev_30m"] = 0.0
        data["vib_dev_30m"] = 0.0
        data["power_dev_30m"] = 0.0
        data["press_diff_5m"] = 0.0

    # Apply condition-aware transformer if provided
    if transformer is not None:
        data = transformer.transform(data)
    else:
        # Fallback if no transformer supplied yet
        if "press_cond_dev" not in data.columns:
            data["press_cond_dev"] = 0.0
        if "press_cond_z" not in data.columns:
            data["press_cond_z"] = 0.0

    return data
