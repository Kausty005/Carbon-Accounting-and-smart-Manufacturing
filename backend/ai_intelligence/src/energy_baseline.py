"""
Energy Baseline and Condition-Aware Power Anomaly Detector (Model C).
Builds operating-condition-aware baselines comparing measured power against expected power
for specific equipment and operating modes.
Strictly separates excess energy anomalies from mechanical/sensor equipment health alerts.
"""

from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import pandas as pd

from .config import (
    ENERGY_Z_SCORE_THRESHOLD,
    ENERGY_PCT_DEVIATION_THRESHOLD,
    PERSISTENT_EXCESS_STEPS_THRESHOLD,
    DEFAULT_SAMPLING_INTERVAL_HOURS,
    MAX_INTEGRATION_GAP_HOURS,
)


class OperatingConditionEnergyBaseline:
    """
    Learns expected power baselines conditional on (equipment_id, operating_mode)
    strictly from historical training periods.
    """

    def __init__(
        self,
        z_score_threshold: float = ENERGY_Z_SCORE_THRESHOLD,
        pct_deviation_threshold: float = ENERGY_PCT_DEVIATION_THRESHOLD,
        persistent_steps_threshold: int = PERSISTENT_EXCESS_STEPS_THRESHOLD,
        max_integration_gap_hours: float = MAX_INTEGRATION_GAP_HOURS,
    ):
        self.z_score_threshold = z_score_threshold
        self.pct_deviation_threshold = pct_deviation_threshold
        self.persistent_steps_threshold = persistent_steps_threshold
        self.max_integration_gap_hours = max_integration_gap_hours
        
        # Baselines lookup: key = (equipment_id, operating_mode) -> dict of stats
        self.baselines_: Dict[Tuple[str, str], Dict[str, float]] = {}
        # Mode-level fallback: key = operating_mode -> dict of stats
        self.mode_baselines_: Dict[str, Dict[str, float]] = {}
        # Global fallback
        self.global_mean_: float = 48.0
        self.global_std_: float = 5.0
        self.is_fitted: bool = False

    def fit(self, df_train: pd.DataFrame, normal_only: bool = True) -> "OperatingConditionEnergyBaseline":
        """
        Fit condition-aware baselines from training records.
        Filters to normal operational periods when anomaly labels are available.
        """
        if normal_only and "is_anomaly" in df_train.columns:
            fit_df = df_train[df_train["is_anomaly"] == 0].copy()
        else:
            fit_df = df_train.copy()

        # Clean valid power records
        valid = fit_df.dropna(subset=["power_consumption_kw", "equipment_id", "operating_mode"])
        if len(valid) == 0:
            raise ValueError("No valid records to compute energy baseline.")

        self.global_mean_ = float(valid["power_consumption_kw"].mean())
        self.global_std_ = float(valid["power_consumption_kw"].std()) or 5.0

        # Group by (equipment_id, operating_mode)
        grouped = valid.groupby(["equipment_id", "operating_mode"])["power_consumption_kw"]
        stats = grouped.agg(["mean", "std", "median", "count"])

        self.baselines_ = {}
        for (eq, mode), row in stats.iterrows():
            mean_val = float(row["mean"])
            std_val = float(row["std"]) if not np.isnan(row["std"]) and row["std"] > 0.1 else 2.0
            self.baselines_[(str(eq), str(mode))] = {
                "mean": mean_val,
                "std": std_val,
                "median": float(row["median"]),
                "count": int(row["count"]),
            }

        # Fallback grouped by operating_mode only
        mode_grouped = valid.groupby("operating_mode")["power_consumption_kw"].agg(["mean", "std", "count"])
        self.mode_baselines_ = {}
        for mode, row in mode_grouped.iterrows():
            mean_val = float(row["mean"])
            std_val = float(row["std"]) if not np.isnan(row["std"]) and row["std"] > 0.1 else 3.0
            self.mode_baselines_[str(mode)] = {
                "mean": mean_val,
                "std": std_val,
                "count": int(row["count"]),
            }

        self.is_fitted = True
        return self

    def get_expected_power(self, equipment_id: str, operating_mode: str) -> Tuple[float, float]:
        """
        Return (expected_mean, expected_std) for given equipment and operating mode.
        """
        key = (str(equipment_id), str(operating_mode))
        if key in self.baselines_:
            b = self.baselines_[key]
            return b["mean"], b["std"]
        
        mode_key = str(operating_mode)
        if mode_key in self.mode_baselines_:
            b = self.mode_baselines_[mode_key]
            return b["mean"], b["std"]

        return self.global_mean_, self.global_std_

    def detect_energy_anomalies(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Evaluate energy features and identify condition-aware excess energy anomalies.
        Safely computes actual interval durations per equipment without cross-equipment mixing.
        """
        if not self.is_fitted:
            raise RuntimeError("Energy baseline is not fitted.")

        data = df.copy()
        if "timestamp" in data.columns:
            data["timestamp"] = pd.to_datetime(data["timestamp"])
            data = data.sort_values(by=["equipment_id", "timestamp"]).reset_index(drop=True)

        n = len(data)
        expected_power = np.zeros(n)
        expected_std = np.zeros(n)

        for i, row in data.iterrows():
            eq = row.get("equipment_id", "UNKNOWN")
            mode = row.get("operating_mode", "normal")
            exp_p, exp_s = self.get_expected_power(eq, mode)
            expected_power[i] = exp_p
            expected_std[i] = exp_s

        data["expected_power_kw"] = expected_power
        data["expected_std_kw"] = expected_std

        # Actual power and deviations (safe handling of nulls)
        data["actual_power_kw"] = data["power_consumption_kw"]
        data["power_deviation_kw"] = data["actual_power_kw"] - data["expected_power_kw"]
        
        # Percentage deviation safe handling
        safe_exp = np.where(data["expected_power_kw"] > 0.1, data["expected_power_kw"], np.nan)
        data["power_deviation_pct"] = (data["power_deviation_kw"] / safe_exp) * 100.0
        data["power_deviation_pct"] = data["power_deviation_pct"].fillna(0.0)

        # Z-score safe handling
        safe_std = np.where(data["expected_std_kw"] > 0.05, data["expected_std_kw"], 1.0)
        data["power_z_score"] = data["power_deviation_kw"] / safe_std
        data["power_z_score"] = data["power_z_score"].fillna(0.0)

        # Backward-looking causal rolling power mean & std strictly per equipment
        data["rolling_power_mean_15m"] = (
            data.groupby("equipment_id")["actual_power_kw"]
            .transform(lambda s: s.rolling(15, min_periods=1).mean())
        )
        data["rolling_power_std_15m"] = (
            data.groupby("equipment_id")["actual_power_kw"]
            .transform(lambda s: s.rolling(15, min_periods=1).std().fillna(0.0))
        )

        # Sudden power changes (|P_t - P_{t-1}| per equipment)
        data["sudden_power_change_kw"] = (
            data.groupby("equipment_id")["actual_power_kw"]
            .transform(lambda s: s.diff().abs().fillna(0.0))
        )

        # Persistent excess power indicator (excess > 15% for at least persistent_steps_threshold consecutive steps)
        is_excess_pct = (data["power_deviation_pct"] >= 15.0).astype(int)
        data["persistent_excess_power"] = (
            data.groupby("equipment_id")[is_excess_pct.name]
            .transform(lambda s: s.rolling(self.persistent_steps_threshold, min_periods=self.persistent_steps_threshold).sum() == self.persistent_steps_threshold)
            .fillna(False)
            .astype(bool)
        )

        # Calculate exact elapsed hours between consecutive readings per equipment
        if "timestamp" in data.columns:
            ts_diff = (
                data.groupby("equipment_id")["timestamp"]
                .diff()
                .dt.total_seconds() / 3600.0
            )
            # Fill first observation of each equipment with default sampling interval
            data["interval_hours"] = ts_diff.fillna(DEFAULT_SAMPLING_INTERVAL_HOURS)
            # Clamp gaps beyond max_integration_gap_hours to avoid unmetered runaway
            data["interval_hours"] = data["interval_hours"].clip(lower=0.0, upper=self.max_integration_gap_hours)
        else:
            data["interval_hours"] = DEFAULT_SAMPLING_INTERVAL_HOURS

        # Estimated excess energy in kWh (strictly positive power deviation represents waste)
        data["estimated_excess_energy_kwh"] = (
            np.maximum(0.0, data["power_deviation_kw"].fillna(0.0)) * data["interval_hours"]
        )

        # Flag EXCESS-ENERGY ANOMALY:
        # Triggered when actual power significantly exceeds expected consumption for that operating mode:
        # (Positive Z-score >= threshold OR percentage deviation >= threshold OR persistent excess)
        # AND power measurement is valid and positive
        energy_anomaly_condition = (
            (data["power_z_score"] >= self.z_score_threshold)
            | (data["power_deviation_pct"] >= self.pct_deviation_threshold)
            | (data["persistent_excess_power"] == True)
        ) & (data["actual_power_kw"] > 0) & (~data["actual_power_kw"].isna())

        data["is_energy_anomaly"] = energy_anomaly_condition.astype(int)

        return data
