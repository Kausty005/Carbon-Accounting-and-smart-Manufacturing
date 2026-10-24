"""
Dual-Path Anomaly Detector & Residual Threshold Calibrator.

Provides:
  1. Path A: Forecast-residual energy anomaly detection (actual vs predicted 15-min energy).
     - Calibrated on historical validation data using robust MAD or Quantile statistics.
     - Stratified by machine_type and operating_state.
     - Distinguishes unusually high consumption (energy waste) from unusually low consumption.
  2. Path B: Sensor and operating-pattern anomaly detection.
     - Evaluates physical constraints and Isolation Forest pattern scores.
     - Explicit sensor data-quality validation (missing, frozen, or impossible values -> data_quality_warning).
  3. Transparent alert synthesis: preserves individual scores, thresholds, and evidence.
"""

import os
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .forecast_adapter import ForecastMatchResult

logger = logging.getLogger("ai_energy_intelligence.residual_detector")


# -------------------------------------------------------------------------
# Machine Physical Operating Limits (for Sensor Quality & Rule Verification)
# -------------------------------------------------------------------------
PHYSICAL_LIMITS: Dict[str, Dict[str, Tuple[float, float]]] = {
    "default": {
        "power_kw": (0.0, 500.0),
        "energy_kwh": (0.0, 150.0),
        "ambient_temperature": (-20.0, 60.0),
        "humidity": (0.0, 100.0),
        "load_factor": (0.0, 2.0),
        "operating_minutes": (0.0, 15.0),
    },
    "AIR_COMPRESSOR": {
        "power_kw": (0.0, 75.0),
        "energy_kwh": (0.0, 25.0),
        "process_temperature": (10.0, 130.0),  # Discharge air temp
        "discharge_pressure_bar": (0.0, 16.0),
        "airflow_cfm": (0.0, 600.0),
    },
    "FURNACE": {
        "power_kw": (0.0, 120.0),
        "energy_kwh": (0.0, 40.0),
        "process_temperature": (15.0, 1200.0),
    },
    "CNC_MACHINE": {
        "power_kw": (0.0, 60.0),
        "energy_kwh": (0.0, 20.0),
        "process_temperature": (15.0, 95.0),
        "spindle_rpm": (0.0, 24000.0),
    },
    "PAINTING_LINE": {
        "power_kw": (0.0, 50.0),
        "energy_kwh": (0.0, 18.0),
        "process_temperature": (15.0, 90.0),
    },
    "CHILLER": {
        "power_kw": (0.0, 150.0),
        "energy_kwh": (0.0, 50.0),
        "process_temperature": (-10.0, 40.0),
    },
}


class SensorQualityValidator:
    """
    Checks for sensor anomalies, missing inputs, frozen telemetry, or out-of-physical-range signals.
    Generates data-quality warnings instead of diagnosing mechanical breakdown from corrupted data.
    """

    @classmethod
    def validate_reading(
        cls,
        telemetry: Dict[str, Any],
        machine_type: str = "default",
        recent_window: Optional[List[Dict[str, Any]]] = None,
    ) -> Tuple[bool, List[str], List[str]]:
        """
        Validate telemetry.
        Returns:
            is_valid: bool
            quality_warnings: list of warning descriptions
            missing_sensors: list of missing expected keys
        """
        warnings = []
        missing = []
        mt = machine_type.upper()
        limits = dict(PHYSICAL_LIMITS.get("default", {}))
        if mt in PHYSICAL_LIMITS:
            limits.update(PHYSICAL_LIMITS[mt])

        # 1. Missing required core inputs
        core_sensors = ["power_kw"]
        for s in core_sensors:
            if s not in telemetry or telemetry[s] is None or pd.isna(telemetry[s]):
                missing.append(s)
                warnings.append(f"Essential sensor '{s}' is missing or null.")

        # 2. Out of physical bounds
        for s, (min_val, max_val) in limits.items():
            if s in telemetry and telemetry[s] is not None and not pd.isna(telemetry[s]):
                try:
                    val = float(telemetry[s])
                    if val < min_val or val > max_val:
                        warnings.append(
                            f"Sensor '{s}' reading {val:.2f} is outside physical boundary [{min_val}, {max_val}]."
                        )
                except (ValueError, TypeError):
                    warnings.append(f"Sensor '{s}' contains non-numeric value: {telemetry[s]}.")

        # 3. Stuck / frozen sensor detection (constant values across >= 4 readings)
        if recent_window and len(recent_window) >= 4:
            for s in ["power_kw", "process_temperature", "discharge_pressure_bar"]:
                vals = [w.get(s) for w in recent_window if w.get(s) is not None and not pd.isna(w.get(s))]
                if len(vals) >= 4:
                    try:
                        arr = np.array(vals, dtype=float)
                        if np.std(arr) < 1e-6 and not np.all(arr == 0.0):
                            warnings.append(
                                f"Sensor '{s}' appears stuck/frozen at {arr[0]:.2f} across {len(vals)} consecutive intervals."
                            )
                    except Exception:
                        pass

        is_valid = len(missing) == 0 and len(warnings) == 0
        return is_valid, warnings, missing


@dataclass
class ThresholdMetadata:
    """Provenance and parameters for calibrated residual thresholds."""
    group_key: str
    sample_size: int
    method: str
    upper_threshold_kwh: float
    lower_threshold_kwh: float
    median_kwh: float
    mad_kwh: float
    calibrated_at: str


class CalibratedThresholdRegistry:
    """
    Calibrates and manages residual thresholds from historical validation data.
    Uses Median Absolute Deviation (MAD) or Quantiles, stratified by (machine_type, operating_state).
    """

    def __init__(self, k_mad: float = 2.5):
        self.k_mad = k_mad
        # Key: (machine_type, operating_state) or machine_type or "global"
        self._thresholds: Dict[str, ThresholdMetadata] = {}
        self._set_default_thresholds()

    def _set_default_thresholds(self) -> None:
        """Seed safe physical baseline thresholds pending empirical validation calibration."""
        defaults = {
            "global": (-1.2, 1.2, 0.0, 0.35),
            "AIR_COMPRESSOR": (-0.8, 0.8, 0.0, 0.25),
            "FURNACE": (-2.0, 2.0, 0.0, 0.60),
            "CNC_MACHINE": (-0.7, 0.7, 0.0, 0.20),
            "PAINTING_LINE": (-0.6, 0.6, 0.0, 0.18),
            "CHILLER": (-1.5, 1.5, 0.0, 0.45),
        }
        now_str = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
        for k, (low, up, med, mad) in defaults.items():
            self._thresholds[k] = ThresholdMetadata(
                group_key=k,
                sample_size=100,
                method="safe_engineering_prior",
                upper_threshold_kwh=up,
                lower_threshold_kwh=low,
                median_kwh=med,
                mad_kwh=mad,
                calibrated_at=now_str,
            )

    def calibrate_from_validation_residuals(
        self,
        df_residuals: pd.DataFrame,
        actual_col: str = "actual_energy_kwh",
        predicted_col: str = "predicted_energy_kwh",
        machine_type_col: str = "machine_type",
        state_col: str = "operating_state",
    ) -> Dict[str, ThresholdMetadata]:
        """
        Empirically calibrate residual thresholds from validation data.
        Does NOT touch the final test set.
        """
        if df_residuals.empty:
            return self._thresholds

        df = df_residuals.copy()
        df["residual"] = df[actual_col] - df[predicted_col]

        # 1. Global calibration
        res_global = df["residual"].dropna().values
        if len(res_global) >= 10:
            med = float(np.median(res_global))
            mad = float(np.median(np.abs(res_global - med)))
            sigma_mad = 1.4826 * mad if mad > 1e-4 else 0.25
            up = round(med + self.k_mad * sigma_mad, 4)
            low = round(med - self.k_mad * sigma_mad, 4)
            self._thresholds["global"] = ThresholdMetadata(
                group_key="global",
                sample_size=len(res_global),
                method="validation_MAD_robust",
                upper_threshold_kwh=up,
                lower_threshold_kwh=low,
                median_kwh=round(med, 4),
                mad_kwh=round(mad, 4),
                calibrated_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
            )

        # 2. Stratified calibration by (machine_type, operating_state)
        for (mtype, state), group in df.groupby([machine_type_col, state_col]):
            res = group["residual"].dropna().values
            key = f"{str(mtype).upper()}::{str(state).lower()}"
            if len(res) >= 15:
                med = float(np.median(res))
                mad = float(np.median(np.abs(res - med)))
                sigma_mad = 1.4826 * mad if mad > 1e-4 else 0.2
                up = round(med + self.k_mad * sigma_mad, 4)
                low = round(med - self.k_mad * sigma_mad, 4)
                self._thresholds[key] = ThresholdMetadata(
                    group_key=key,
                    sample_size=len(res),
                    method="validation_stratified_MAD",
                    upper_threshold_kwh=up,
                    lower_threshold_kwh=low,
                    median_kwh=round(med, 4),
                    mad_kwh=round(mad, 4),
                    calibrated_at=datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
                )

        return self._thresholds

    def get_thresholds(
        self,
        machine_type: str,
        operating_state: Optional[str] = None,
    ) -> ThresholdMetadata:
        """
        Lookup best calibrated threshold with hierarchical fallback:
        (machine_type::operating_state) -> machine_type -> global.
        """
        mt = str(machine_type).upper()
        if operating_state:
            st = str(operating_state).lower()
            key = f"{mt}::{st}"
            if key in self._thresholds:
                return self._thresholds[key]

        if mt in self._thresholds:
            return self._thresholds[mt]

        return self._thresholds["global"]


@dataclass
class AnomalyAlert:
    """
    Structured, evidence-based anomaly alert artifact.
    """
    alert_id: str
    machine_id: str
    machine_type: str
    site_id: str
    timestamp: str
    target_timestamp: str
    alert_category: str  # "forecast_residual_anomaly", "sensor_pattern_anomaly", "sensor_data_quality_warning", "equipment_health_concern", "energy_waste_event"
    title: str
    severity: str        # "informational", "low", "medium", "high", "critical"
    actual_energy_kwh: Optional[float] = None
    predicted_energy_kwh: Optional[float] = None
    residual_kwh: Optional[float] = None
    abs_residual_kwh: Optional[float] = None
    relative_deviation_pct: Optional[float] = None
    direction: Optional[str] = None  # "excess_energy", "under_consumption", "nominal"
    detector_score: Optional[float] = None
    threshold: Optional[float] = None
    threshold_basis: str = ""
    explanation: str = ""
    evidence: List[str] = field(default_factory=list)
    recommended_action: str = ""
    status: str = "open"  # "open", "acknowledged", "investigating", "resolved", "dismissed"
    first_detected: str = ""
    latest_occurrence: str = ""
    recurrence_count: int = 1
    data_provenance: str = "simulated_telemetry"
    missing_inputs: List[str] = field(default_factory=list)
    quality_warnings: List[str] = field(default_factory=list)
    sensor_readings: Dict[str, Any] = field(default_factory=dict)
    confidence: Optional[float] = None
    confidence_available: bool = False
    anomaly_score: Optional[float] = None
    detection_method: str = "rule_based"
    detection_method_label: str = "Rule-based"
    observed_value: Optional[float] = None
    expected_value: Optional[float] = None
    deviation_percent: Optional[float] = None


class DualPathAnomalyDetector:
    """
    Coordinated dual-path detector:
      Path A: Forecast-residual energy anomaly detection.
      Path B: Sensor & operating-pattern anomaly detection (Isolation Forest + physical rules).
    """

    def __init__(
        self,
        threshold_registry: Optional[CalibratedThresholdRegistry] = None,
        iso_forest: Optional[IsolationForest] = None,
    ):
        self.thresholds = threshold_registry or CalibratedThresholdRegistry()
        self.iso_forest = iso_forest

    def detect_anomalies(
        self,
        telemetry: Dict[str, Any],
        forecast_result: Optional[ForecastMatchResult] = None,
        recent_window: Optional[List[Dict[str, Any]]] = None,
    ) -> List[AnomalyAlert]:
        """
        Analyze a 15-minute interval reading through both detection paths.
        Returns a list of clear, distinct alerts without inventing unevidenced causes.
        """
        alerts: List[AnomalyAlert] = []
        machine_id = str(telemetry.get("machine_id", telemetry.get("equipment_id", "UNKNOWN"))).upper()
        machine_type = str(telemetry.get("machine_type", telemetry.get("equipment_type", "AIR_COMPRESSOR"))).upper()
        site_id = str(telemetry.get("site_id", "SITE-01")).upper()
        ts = str(telemetry.get("timestamp", datetime.now().strftime("%Y-%m-%dT%H:%M:%S")))
        state = str(telemetry.get("operating_state", telemetry.get("machine_state", "running"))).lower()
        power_kw = float(telemetry.get("power_kw", telemetry.get("power_consumption_kw", 0.0)) or 0.0)

        # -------------------------------------------------------------
        # 1. Step 1: Sensor Data Quality & Provenance Check
        # -------------------------------------------------------------
        is_valid, q_warnings, missing = SensorQualityValidator.validate_reading(
            telemetry, machine_type=machine_type, recent_window=recent_window
        )
        if q_warnings or missing:
            alert = AnomalyAlert(
                alert_id=f"WARN-DQ-{machine_id}-{ts.replace(':', '').replace('-', '')[:15]}",
                machine_id=machine_id,
                machine_type=machine_type,
                site_id=site_id,
                timestamp=ts,
                target_timestamp=ts,
                alert_category="sensor_data_quality_warning",
                title=f"Data Quality Warning: {machine_id}",
                severity="medium" if missing else "low",
                explanation=f"Sensor telemetry for {machine_id} exhibits data quality anomalies: {'; '.join(q_warnings[:2])}",
                evidence=q_warnings + [f"Missing sensors: {missing}" if missing else "No null core fields"],
                recommended_action="Inspect sensor wiring, verify I/O gateway communications, and calibrate field transmitter.",
                first_detected=ts,
                latest_occurrence=ts,
                recurrence_count=1,
                data_provenance=telemetry.get("data_provenance", "simulated_telemetry"),
                missing_inputs=missing,
                quality_warnings=q_warnings,
                sensor_readings=telemetry,
                confidence=None,
                confidence_available=False,
                anomaly_score=None,
                detection_method="sensor_data_quality",
                detection_method_label="Sensor Data Quality Validation",
                observed_value=power_kw,
                expected_value=None,
                deviation_percent=None,
            )
            alerts.append(alert)

        # -------------------------------------------------------------
        # 2. Step 2: Path A - Forecast-Residual Energy Anomaly Detection
        # -------------------------------------------------------------
        if forecast_result and forecast_result.status == "evaluated":
            actual_kwh = forecast_result.actual_energy_kwh
            pred_kwh = forecast_result.predicted_energy_kwh
            residual = forecast_result.residual_kwh
            rel_pct = forecast_result.relative_deviation_pct

            th_meta = self.thresholds.get_thresholds(machine_type, operating_state=state)
            upper_th = th_meta.upper_threshold_kwh
            lower_th = th_meta.lower_threshold_kwh

            if residual is not None and (residual > upper_th or residual < lower_th):
                is_excess = residual > upper_th
                direction = "excess_energy" if is_excess else "under_consumption"
                category = "energy_waste_event" if is_excess else "forecast_residual_anomaly"

                # Calibrate severity from deviation magnitude and state
                if is_excess:
                    if rel_pct and rel_pct > 60.0 or residual > 2.5 * upper_th:
                        severity = "critical"
                    elif rel_pct and rel_pct > 30.0 or residual > 1.5 * upper_th:
                        severity = "high"
                    else:
                        severity = "medium"
                    title = f"High Energy Deviation: {machine_id} (+{residual:.2f} kWh)"
                    explanation = (
                        f"{machine_type.replace('_', ' ').title()} {machine_id} consumed {actual_kwh:.2f} kWh "
                        f"against a 15-min forecast of {pred_kwh:.2f} kWh, an excess deviation of +{residual:.2f} kWh "
                        f"({rel_pct:+.1f}%). Exceeded calibrated threshold of +{upper_th:.2f} kWh for '{state}' state."
                    )
                    action = (
                        f"Investigate unnecessary load, check for machine idling during {state} state, "
                        f"and verify operating pressure and setpoints before assuming mechanical fault."
                    )
                else:
                    severity = "medium" if (rel_pct and rel_pct < -40.0) else "low"
                    title = f"Unusual Low Energy Consumption: {machine_id} ({residual:.2f} kWh)"
                    explanation = (
                        f"{machine_type.replace('_', ' ').title()} {machine_id} consumed {actual_kwh:.2f} kWh "
                        f"against a 15-min forecast of {pred_kwh:.2f} kWh, a negative deviation of {residual:.2f} kWh "
                        f"({rel_pct:+.1f}%). Exceeded calibrated lower bound of {lower_th:.2f} kWh."
                    )
                    action = "Verify if production line was halted, starved of feed material, or in unscheduled hold."

                sigma = th_meta.mad_kwh * 1.4826 if th_meta.mad_kwh > 1e-4 else 0.25
                z_score = round(abs(residual - th_meta.median_kwh) / sigma, 2)

                alert = AnomalyAlert(
                    alert_id=f"INC-RES-{machine_id}-{ts.replace(':', '').replace('-', '')[:15]}",
                    machine_id=machine_id,
                    machine_type=machine_type,
                    site_id=site_id,
                    timestamp=ts,
                    target_timestamp=forecast_result.target_timestamp,
                    alert_category=category,
                    title=title,
                    severity=severity,
                    actual_energy_kwh=actual_kwh,
                    predicted_energy_kwh=pred_kwh,
                    residual_kwh=residual,
                    abs_residual_kwh=abs(residual),
                    relative_deviation_pct=rel_pct,
                    direction=direction,
                    detector_score=z_score,
                    threshold=upper_th if is_excess else lower_th,
                    threshold_basis=f"{th_meta.method} [{th_meta.group_key}] (N={th_meta.sample_size})",
                    explanation=explanation,
                    evidence=[
                        f"Measured 15-min Energy: {actual_kwh:.3f} kWh",
                        f"HistGradientBoostingRegressor Forecast: {pred_kwh:.3f} kWh",
                        f"Signed Residual: {residual:+.3f} kWh ({rel_pct:+.1f}%)",
                        f"Calibrated Threshold: [{lower_th:.2f}, +{upper_th:.2f}] kWh (k_mad={self.thresholds.k_mad})",
                        f"Operating State: {state.upper()}",
                    ],
                    recommended_action=action,
                    first_detected=ts,
                    latest_occurrence=ts,
                    recurrence_count=1,
                    data_provenance=telemetry.get("data_provenance", "simulated_telemetry"),
                    missing_inputs=[],
                    quality_warnings=q_warnings,
                    sensor_readings=telemetry,
                    confidence=None,
                    confidence_available=False,
                    anomaly_score=z_score,
                    detection_method="forecast_residual",
                    detection_method_label="Forecast Residual Deviation (MAD Calibrated)",
                    observed_value=actual_kwh,
                    expected_value=pred_kwh,
                    deviation_percent=rel_pct,
                )
                alerts.append(alert)

        elif forecast_result and forecast_result.status == "awaiting_actual":
            # Target is in future or actual reading not yet received -> mark informational
            pass

        # -------------------------------------------------------------
        # 3. Step 3: Path B - Sensor & Operating-Pattern Anomalies
        # -------------------------------------------------------------
        pattern_evidence = []
        is_pattern_anomaly = False
        health_alert = False

        # Physical Rule 1: High power consumption while machine is reported IDLE or OFF
        if state in ["idle", "off", "maintenance"] and power_kw > 15.0:
            is_pattern_anomaly = True
            pattern_evidence.append(
                f"Elevated power consumption ({power_kw:.1f} kW) during declared '{state}' state."
            )

        # Physical Rule 2: Air Compressor pressure loss under load
        if "COMP" in machine_id or machine_type == "AIR_COMPRESSOR":
            press = telemetry.get("discharge_pressure_bar") or telemetry.get("pressure_bar")
            if press is not None and float(press) < 6.0 and power_kw > 20.0:
                is_pattern_anomaly = True
                health_alert = True
                pattern_evidence.append(
                    f"Discharge pressure dropped to {float(press):.2f} bar while motor drew {power_kw:.1f} kW."
                )

        # Physical Rule 3: Furnace thermal overshoot
        if "FURN" in machine_id or machine_type == "FURNACE":
            temp = telemetry.get("process_temperature") or telemetry.get("temperature_c")
            setpoint = telemetry.get("temp_setpoint_c", 850.0)
            if temp is not None and float(temp) > (float(setpoint) + 40.0):
                is_pattern_anomaly = True
                health_alert = True
                pattern_evidence.append(
                    f"Process temperature ({float(temp):.1f} °C) exceeded setpoint ({float(setpoint):.1f} °C) by >40 °C."
                )

        # Isolation Forest Scoring (if model provided)
        iso_score = None
        if self.iso_forest:
            try:
                feature_vals = [
                    power_kw,
                    float(telemetry.get("process_temperature", 25.0) or 25.0),
                    float(telemetry.get("ambient_temperature", 25.0) or 25.0),
                    float(telemetry.get("humidity", 50.0) or 50.0),
                    float(telemetry.get("load_factor", 0.5) or 0.5),
                    float(telemetry.get("operating_minutes", 15.0) or 15.0),
                ]
                iso_score = float(self.iso_forest.decision_function([feature_vals])[0])
                if iso_score < -0.15:
                    is_pattern_anomaly = True
                    pattern_evidence.append(
                        f"Isolation Forest multi-sensor pattern anomaly score: {iso_score:.3f} (threshold: -0.150)."
                    )
            except Exception as e:
                logger.debug(f"Isolation Forest evaluation skipped: {e}")

        # Emit Pattern / Health Alert if evidence exists and we haven't already captured identical energy alert
        if is_pattern_anomaly and pattern_evidence:
            cat = "equipment_health_concern" if health_alert else "sensor_pattern_anomaly"
            alert = AnomalyAlert(
                alert_id=f"INC-PAT-{machine_id}-{ts.replace(':', '').replace('-', '')[:15]}",
                machine_id=machine_id,
                machine_type=machine_type,
                site_id=site_id,
                timestamp=ts,
                target_timestamp=ts,
                alert_category=cat,
                title=f"{'Equipment Health Concern' if health_alert else 'Sensor Pattern Anomaly'}: {machine_id}",
                severity="high" if health_alert else "medium",
                detector_score=iso_score,
                threshold=-0.150 if iso_score is not None else None,
                threshold_basis="Isolation Forest & Physical Envelope Rules",
                explanation=f"Abnormal operating pattern detected on {machine_id}: {'; '.join(pattern_evidence)}",
                evidence=pattern_evidence + [f"Operating Mode: {state}", f"Active Power: {power_kw:.2f} kW"],
                recommended_action=(
                    "Inspect subsystem operating parameters, check auxiliary cooling and pneumatic lines, "
                    "and review recent setpoint changes."
                ),
                first_detected=ts,
                latest_occurrence=ts,
                recurrence_count=1,
                data_provenance=telemetry.get("data_provenance", "simulated_telemetry"),
                missing_inputs=missing,
                quality_warnings=q_warnings,
                sensor_readings=telemetry,
                confidence=None,
                confidence_available=False,
                anomaly_score=iso_score,
                detection_method="unsupervised_isolation_forest" if iso_score is not None else "rule_based",
                detection_method_label="Unsupervised Isolation Forest" if iso_score is not None else "Physical Envelope Rule",
                observed_value=power_kw,
                expected_value=None,
                deviation_percent=None,
            )
            alerts.append(alert)

        return alerts
