"""
WattWise AI — Multi-Horizon Energy Forecasting Service
Application-level singleton service managing machine energy forecasting across:
1. Next 15 Minutes (15m interval target)
2. Next 1 Day (24-hour hourly profile target)
3. Next 1 Week (7-day daily profile target)

Loads serialized scikit-learn pipeline artifacts once into memory, validates payloads,
applies physical thermodynamic and capacity bounds, and aggregates machine-to-plant fleet predictions.
"""

from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional
import joblib
import numpy as np
import pandas as pd
import sklearn.compose._column_transformer

# Backwards-compatibility for models serialized with scikit-learn <= 1.6
if not hasattr(sklearn.compose._column_transformer, '_RemainderColsList'):
    class _RemainderColsList(list):
        pass
    sklearn.compose._column_transformer._RemainderColsList = _RemainderColsList

# Ensure repository root is on sys.path dynamically
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.models import (
    EnergyForecastInput,
    EnergyForecastResponse,
    ForecastHorizon,
    ForecastTimeSeriesPoint,
    HorizonForecastResponse,
    MachineForecastBreakdown,
    ProvenanceType,
)
from ml.energy_forecasting.src.features import prepare_inference_features


class EnergyForecastingServiceError(Exception):
    """Raised when energy forecasting fails due to invalid parameters or model errors."""
    pass


class ModelNotReadyError(EnergyForecastingServiceError):
    """Raised when model artifact is missing or corrupted; prevents silent mock fallbacks."""
    pass


class EnergyForecastingService:
    """Service to load, cache, and query the multi-horizon machine energy forecasting models."""

    def __init__(
        self,
        models_dir: Optional[Path] = None,
        model_path: Optional[Path] = None,
    ):
        if model_path is not None:
            self.model_15m_path = Path(model_path)
            self.models_dir = self.model_15m_path.parent
        elif models_dir is not None:
            self.models_dir = Path(models_dir)
            self.model_15m_path = self.models_dir / "energy_forecasting_model.joblib"
        else:
            self.models_dir = PROJECT_ROOT / "ml" / "energy_forecasting" / "models"
            self.model_15m_path = self.models_dir / "energy_forecasting_model.joblib"

        # Backward compatibility attribute
        self.model_path = self.model_15m_path
        self.model_hourly_path = self.models_dir / "energy_forecasting_hourly_model.joblib"
        self.model_daily_path = self.models_dir / "energy_forecasting_daily_model.joblib"

        # Cached models & metadata
        self._model_15m = None
        self._model_hourly = None
        self._model_daily = None
        self._artifact_15m: Optional[Dict[str, Any]] = None
        self._artifact_hourly: Optional[Dict[str, Any]] = None
        self._artifact_daily: Optional[Dict[str, Any]] = None
        self._metadata: Optional[Dict[str, Any]] = None
        self._load_error: Optional[str] = None

    def load_model(self) -> None:
        """Loads and verifies the 15-minute, hourly, and daily forecasting artifacts into memory."""
        try:
            import sklearn.compose._column_transformer as _ct
            if not hasattr(_ct, "_RemainderColsList"):
                _ct._RemainderColsList = type("_RemainderColsList", (list,), {})
        except Exception:
            pass

        def _patch_imputer(model_obj):
            if model_obj is None:
                return
            try:
                from sklearn.impute import SimpleImputer
                if hasattr(model_obj, 'named_steps'):
                    for step_name, step in model_obj.named_steps.items():
                        if hasattr(step, 'transformers_'):
                            for name, trans, cols in step.transformers_:
                                if hasattr(trans, 'named_steps'):
                                    for s_name, s in trans.named_steps.items():
                                        if isinstance(s, SimpleImputer) and not hasattr(s, '_fill_dtype'):
                                            s._fill_dtype = object if any(isinstance(x, str) for x in getattr(s, 'statistics_', [])) else float
                                elif isinstance(trans, SimpleImputer) and not hasattr(trans, '_fill_dtype'):
                                    trans._fill_dtype = object if any(isinstance(x, str) for x in getattr(trans, 'statistics_', [])) else float
            except Exception as patch_err:
                print(f"[WARN] Imputer compatibility patch skipped: {patch_err}")

        errors = []

        # 1. 15-Minute Model
        if self.model_15m_path.exists():
            try:
                art_15m = joblib.load(self.model_15m_path)
                if isinstance(art_15m, dict) and "model" in art_15m:
                    self._artifact_15m = art_15m
                    self._model_15m = art_15m["model"]
                    _patch_imputer(self._model_15m)
                    self._artifact = self._artifact_15m
                    self._model = self._model_15m
            except Exception as e:
                errors.append(f"15m model: {e}")
        else:
            errors.append(f"15m model missing at {self.model_15m_path}")

        # 2. Hourly Model (Next-Day)
        if self.model_hourly_path.exists():
            try:
                art_h = joblib.load(self.model_hourly_path)
                if isinstance(art_h, dict) and "model" in art_h:
                    self._artifact_hourly = art_h
                    self._model_hourly = art_h["model"]
                    _patch_imputer(self._model_hourly)
            except Exception as e:
                errors.append(f"Hourly model: {e}")
        else:
            errors.append(f"Hourly model missing at {self.model_hourly_path}")

        # 3. Daily Model (Next-Week)
        if self.model_daily_path.exists():
            try:
                art_d = joblib.load(self.model_daily_path)
                if isinstance(art_d, dict) and "model" in art_d:
                    self._artifact_daily = art_d
                    self._model_daily = art_d["model"]
                    _patch_imputer(self._model_daily)
            except Exception as e:
                errors.append(f"Daily model: {e}")
        else:
            errors.append(f"Daily model missing at {self.model_daily_path}")

        if errors:
            self._load_error = "; ".join(errors)
            print(f"[WARN] Energy forecasting model loader warnings: {self._load_error}")
        else:
            self._load_error = None
            print("[INFO] Multi-horizon energy forecasting models (15m, 1d, 1w) loaded successfully.")

        # Build composite metadata
        self._build_composite_metadata()

    def _build_composite_metadata(self) -> None:
        art_15m = self._artifact_15m or {}
        art_h = self._artifact_hourly or {}
        art_d = self._artifact_daily or {}

        # Top-level keys for backward compatibility with existing tests and clients
        self._metadata = {
            "service_version": "1.3.0",
            "model_class": art_15m.get("model_class", "HistGradientBoostingRegressor"),
            "dataset_hash": art_15m.get("dataset_hash") or art_h.get("dataset_hash"),
            "trained_at_utc": art_15m.get("trained_at_utc"),
            "is_synthetic": True,
            "synthetic_data_designation": art_15m.get(
                "synthetic_data_designation",
                "Synthetic Industrial Energy Dataset (Demo Benchmark)"
            ),
            "test_metrics": art_15m.get("test_metrics", {}),
            "unseen_machines_generalization": art_15m.get("unseen_machines_generalization", {}),
            "supported_horizons": ["15m", "1d", "1w"],
            "models": {
                "15_minute_model": {
                    "model_class": art_15m.get("model_class", "HistGradientBoostingRegressor"),
                    "target": "target_next_15min_energy_kwh",
                    "trained_at_utc": art_15m.get("trained_at_utc"),
                    "test_metrics": art_15m.get("test_metrics", {}),
                    "unseen_machines_generalization": art_15m.get("unseen_machines_generalization", {}),
                    "status": "READY" if self._model_15m is not None else "NOT_LOADED",
                },
                "hourly_model_for_day": {
                    "model_class": art_h.get("model_class", "HistGradientBoostingRegressor"),
                    "target": "hourly_energy_kwh",
                    "trained_at_utc": art_h.get("trained_at_utc"),
                    "test_metrics": art_h.get("test_metrics", {}),
                    "status": "READY" if self._model_hourly is not None else "NOT_LOADED",
                },
                "daily_model_for_week": {
                    "model_class": art_d.get("model_class", "HistGradientBoostingRegressor"),
                    "target": "daily_energy_kwh",
                    "trained_at_utc": art_d.get("trained_at_utc"),
                    "test_metrics": art_d.get("test_metrics", {}),
                    "status": "READY" if self._model_daily is not None else "NOT_LOADED",
                },
            },
        }

    def _ensure_model_loaded(self, horizon: str = "15m") -> None:
        """Ensures the appropriate horizon model is loaded into memory."""
        if horizon == "15m" and self._model_15m is None:
            self.load_model()
            if self._model_15m is None:
                err_msg = self._load_error or f"Model artifact not found at {self.model_15m_path}."
                raise ModelNotReadyError(f"15-minute forecasting model artifact not found or unavailable: {err_msg}")
        elif horizon == "1d" and self._model_hourly is None:
            self.load_model()
            if self._model_hourly is None:
                err_msg = self._load_error or f"Model artifact not found at {self.model_hourly_path}."
                raise ModelNotReadyError(f"Daily forecasting model artifact not found or unavailable: {err_msg}")
        elif horizon == "1w" and self._model_daily is None:
            self.load_model()
            if self._model_daily is None:
                err_msg = self._load_error or f"Model artifact not found at {self.model_daily_path}."
                raise ModelNotReadyError(f"Weekly forecasting model artifact not found or unavailable: {err_msg}")

    def is_ready(self) -> bool:
        """Returns True if all required forecasting models are loaded."""
        return self._model_15m is not None

    def get_metadata(self) -> Dict[str, Any]:
        """Returns model metadata and multi-horizon evaluation benchmarks."""
        if self._metadata is None:
            self.load_model()
        return self._metadata or {}

    # ─────────────────────────────────────────────────────────────────
    # 1. Next 15-Minute Forecast (Preserves existing API exactly)
    # ─────────────────────────────────────────────────────────────────
    def predict_next_15min(self, input_data: EnergyForecastInput) -> EnergyForecastResponse:
        """
        Generates next 15-minute expected energy consumption (kWh)
        using the dedicated 15-min gradient boosting model.
        """
        self._ensure_model_loaded("15m")

        if input_data.power_kw < 0.0:
            raise EnergyForecastingServiceError("power_kw cannot be negative.")
        if input_data.rated_power_kw < 0.0:
            raise EnergyForecastingServiceError("rated_power_kw cannot be negative.")
        if input_data.operating_state not in [0, 1, 2, 3]:
            raise EnergyForecastingServiceError("operating_state must be 0 (Off), 1 (Idle), 2 (Running), or 3 (Maintenance).")

        now_utc = datetime.now(timezone.utc)
        current_energy = (
            input_data.energy_kwh
            if input_data.energy_kwh is not None
            else round(input_data.power_kw * 0.25, 4)
        )

        input_dict = input_data.model_dump()
        if input_dict.get("hour") is None:
            input_dict["hour"] = now_utc.hour
        if input_dict.get("day_of_week") is None:
            input_dict["day_of_week"] = now_utc.weekday()
        if input_dict.get("energy_kwh") is None:
            input_dict["energy_kwh"] = current_energy

        target_start = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        target_end = (now_utc + timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
        target_interval_str = f"{target_start} to {target_end} (+15m)"

        # Prepare 15m inference features
        X_inf = prepare_inference_features(input_dict)

        try:
            raw_pred = float(self._model_15m.predict(X_inf)[0])
        except Exception as e:
            raise EnergyForecastingServiceError(f"15-minute inference failed: {str(e)}") from e

        # Handle off-state explicitly
        if input_data.operating_state == 0 or input_data.power_kw <= 0.05:
            raw_pred = 0.0

        physical_constraint_applied = False
        pred_kwh = raw_pred

        if pred_kwh < 0.0:
            pred_kwh = 0.0
            physical_constraint_applied = True

        if input_data.rated_power_kw > 0.0:
            max_surge_energy_kwh = input_data.rated_power_kw * 0.25 * 1.30
            if pred_kwh > max_surge_energy_kwh:
                pred_kwh = max_surge_energy_kwh
                physical_constraint_applied = True

        pred_kwh = round(pred_kwh, 4)
        equiv_power_kw = round(pred_kwh / 0.25, 3)
        delta_kwh = round(pred_kwh - current_energy, 4)
        delta_pct = (
            round((delta_kwh / current_energy) * 100.0, 2)
            if current_energy > 1e-4
            else 0.0
        )

        meta = self.get_metadata().get("models", {}).get("15_minute_model", {}).copy()
        meta["provenance"] = "PREDICTED_HIST_GB_MODEL"

        return EnergyForecastResponse(
            machine_id=input_data.machine_id,
            machine_type=input_data.machine_type,
            forecast_target="next_15min_energy_kwh",
            forecast_horizon_minutes=15,
            predicted_next_15min_energy_kwh=pred_kwh,
            energy_unit="kWh",
            equivalent_average_power_kw=equiv_power_kw,
            power_unit="kW",
            current_power_kw=round(input_data.power_kw, 3),
            current_energy_kwh=round(current_energy, 4),
            delta_kwh=delta_kwh,
            delta_percentage=delta_pct,
            input_provenance=input_data.input_provenance,
            prediction_timestamp=now_utc.isoformat(),
            target_interval_start=target_start,
            target_interval_end=target_end,
            target_interval=target_interval_str,
            physical_constraint_applied=physical_constraint_applied,
            model_metadata=meta,
            data_provenance="PREDICTED_HIST_GB_MODEL",
        )

    # ─────────────────────────────────────────────────────────────────
    # 2. Next 1-Day Forecast (24 Hours, Hourly Profile)
    # ─────────────────────────────────────────────────────────────────
    def predict_next_day(self, input_data: EnergyForecastInput) -> HorizonForecastResponse:
        """
        Generates 24-hour daily energy forecast by predicting each of the
        upcoming 24 hours using the trained hourly gradient boosting model.
        Sums hourly predictions for total 24h energy and equivalent power.
        """
        self._ensure_model_loaded("1d")

        now_utc = datetime.now(timezone.utc)
        start_time = now_utc.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        end_time = start_time + timedelta(hours=24)

        current_load_factor = (
            input_data.load_factor
            if input_data.load_factor is not None
            else min(1.0, max(0.0, input_data.power_kw / input_data.rated_power_kw if input_data.rated_power_kw > 0 else 0.5))
        )

        # Build 24 hourly rows
        hourly_rows = []
        for h in range(24):
            interval_time = start_time + timedelta(hours=h)
            target_hour = interval_time.hour
            target_dow = interval_time.weekday()
            is_weekend = 1 if target_dow >= 5 else 0

            hourly_rows.append({
                "machine_type": input_data.machine_type,
                "shift_pattern": input_data.shift_pattern,
                "rated_power_kw": input_data.rated_power_kw,
                "hour": target_hour,
                "day_of_week": target_dow,
                "is_weekend": is_weekend,
                "hour_sin": np.sin(2 * np.pi * target_hour / 24.0),
                "hour_cos": np.cos(2 * np.pi * target_hour / 24.0),
                "day_sin": np.sin(2 * np.pi * target_dow / 7.0),
                "day_cos": np.cos(2 * np.pi * target_dow / 7.0),
                "ambient_temp_c": input_data.ambient_temp_c or 27.5,
                "load_factor": current_load_factor,
            })

        df_hourly = pd.DataFrame(hourly_rows)

        try:
            preds_h = self._model_hourly.predict(df_hourly)
        except Exception as e:
            raise EnergyForecastingServiceError(f"Hourly multi-step inference failed: {str(e)}") from e

        # Apply physical constraints to each hour (0 <= kWh <= rated * 1.30)
        time_series_points: List[ForecastTimeSeriesPoint] = []
        total_energy = 0.0
        clamped = False
        max_hourly_kwh = input_data.rated_power_kw * 1.30 if input_data.rated_power_kw > 0 else 9999.0

        for h, raw_val in enumerate(preds_h):
            interval_time = start_time + timedelta(hours=h)
            h_kwh = float(raw_val)

            # If machine is currently off, scale baseline appropriately
            if input_data.operating_state == 0:
                h_kwh = 0.0

            if h_kwh < 0.0:
                h_kwh = 0.0
                clamped = True
            elif h_kwh > max_hourly_kwh:
                h_kwh = max_hourly_kwh
                clamped = True

            h_kwh = round(h_kwh, 3)
            total_energy += h_kwh

            time_series_points.append(
                ForecastTimeSeriesPoint(
                    timestamp=interval_time.strftime("%Y-%m-%dT%H:00:00Z"),
                    interval_label=f"{interval_time.strftime('%H:00')}",
                    predicted_energy_kwh=h_kwh,
                    equivalent_average_power_kw=h_kwh,  # for 1 hour, kWh == average kW
                )
            )

        total_energy = round(total_energy, 3)
        equiv_power_kw = round(total_energy / 24.0, 2)

        meta = self.get_metadata().get("models", {}).get("hourly_model_for_day", {}).copy()

        return HorizonForecastResponse(
            forecast_horizon="1d",
            forecast_target="next_24h_energy_kwh",
            forecast_start=start_time.strftime("%Y-%m-%dT%H:00:00Z"),
            forecast_end=end_time.strftime("%Y-%m-%dT%H:00:00Z"),
            forecast_duration_hours=24.0,
            machine_id=input_data.machine_id,
            machine_type=input_data.machine_type,
            predicted_energy_kwh=total_energy,
            energy_unit="kWh",
            equivalent_average_power_kw=equiv_power_kw,
            power_unit="kW",
            granularity="hourly",
            time_series=time_series_points,
            machine_breakdown=[],
            model_metadata=meta,
            data_provenance="PREDICTED_HIST_GB_MODEL",
            physical_constraint_applied=clamped,
            coverage_count=1,
            total_machines=1,
            is_complete_coverage=True,
            assumptions=[
                "Operating schedule accounts for active 3-shift factory profile and diurnal cycle.",
                "Hourly predictions model shift handover dips (06:00, 12:00, 17:00 IST).",
                "Ambient temperature assumed constant at 27.5°C across the 24-hour horizon.",
                "Physics constraints enforce upper nameplate surge limits (<= 1.30x rated power).",
            ],
        )

    # ─────────────────────────────────────────────────────────────────
    # 3. Next 1-Week Forecast (7 Days, Daily Profile)
    # ─────────────────────────────────────────────────────────────────
    def predict_next_week(self, input_data: EnergyForecastInput) -> HorizonForecastResponse:
        """
        Generates 7-day weekly energy forecast by predicting each day
        using the trained daily gradient boosting model.
        Captures weekday full-production vs weekend low-draw schedules.
        """
        self._ensure_model_loaded("1w")

        now_utc = datetime.now(timezone.utc)
        start_date = now_utc.date() + timedelta(days=1)
        end_date = start_date + timedelta(days=7)

        current_load_factor = (
            input_data.load_factor
            if input_data.load_factor is not None
            else min(1.0, max(0.0, input_data.power_kw / input_data.rated_power_kw if input_data.rated_power_kw > 0 else 0.5))
        )

        daily_rows = []
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

        for d in range(7):
            cur_date = start_date + timedelta(days=d)
            dow = cur_date.weekday()
            is_weekend = 1 if dow >= 5 else 0

            daily_rows.append({
                "machine_type": input_data.machine_type,
                "shift_pattern": input_data.shift_pattern,
                "rated_power_kw": input_data.rated_power_kw,
                "day_of_week": dow,
                "is_weekend": is_weekend,
                "day_sin": np.sin(2 * np.pi * dow / 7.0),
                "day_cos": np.cos(2 * np.pi * dow / 7.0),
                "ambient_temp_c": input_data.ambient_temp_c or 27.5,
                "load_factor": current_load_factor,
            })

        df_daily = pd.DataFrame(daily_rows)

        try:
            preds_d = self._model_daily.predict(df_daily)
        except Exception as e:
            raise EnergyForecastingServiceError(f"Daily multi-step inference failed: {str(e)}") from e

        time_series_points: List[ForecastTimeSeriesPoint] = []
        total_energy = 0.0
        clamped = False
        max_daily_kwh = input_data.rated_power_kw * 24.0 * 1.30 if input_data.rated_power_kw > 0 else 99999.0

        for d, raw_val in enumerate(preds_d):
            cur_date = start_date + timedelta(days=d)
            dow = cur_date.weekday()
            d_kwh = float(raw_val)

            if input_data.operating_state == 0:
                d_kwh = 0.0

            if d_kwh < 0.0:
                d_kwh = 0.0
                clamped = True
            elif d_kwh > max_daily_kwh:
                d_kwh = max_daily_kwh
                clamped = True

            d_kwh = round(d_kwh, 2)
            total_energy += d_kwh
            equiv_daily_kw = round(d_kwh / 24.0, 2)

            time_series_points.append(
                ForecastTimeSeriesPoint(
                    timestamp=f"{cur_date.isoformat()}T00:00:00Z",
                    interval_label=f"Day {d+1} ({day_names[dow]})",
                    predicted_energy_kwh=d_kwh,
                    equivalent_average_power_kw=equiv_daily_kw,
                )
            )

        total_energy = round(total_energy, 2)
        equiv_power_kw = round(total_energy / (7.0 * 24.0), 2)

        meta = self.get_metadata().get("models", {}).get("daily_model_for_week", {}).copy()

        return HorizonForecastResponse(
            forecast_horizon="1w",
            forecast_target="next_7d_energy_kwh",
            forecast_start=f"{start_date.isoformat()}T00:00:00Z",
            forecast_end=f"{end_date.isoformat()}T00:00:00Z",
            forecast_duration_hours=168.0,
            machine_id=input_data.machine_id,
            machine_type=input_data.machine_type,
            predicted_energy_kwh=total_energy,
            energy_unit="kWh",
            equivalent_average_power_kw=equiv_power_kw,
            power_unit="kW",
            granularity="daily",
            time_series=time_series_points,
            machine_breakdown=[],
            model_metadata=meta,
            data_provenance="PREDICTED_HIST_GB_MODEL",
            physical_constraint_applied=clamped,
            coverage_count=1,
            total_machines=1,
            is_complete_coverage=True,
            assumptions=[
                "Models weekday full production vs weekend off/idle schedule variance.",
                "Assumes steady production batch schedule across 7-day window.",
                "Daily energy predictions derived from chronological gradient-boosted training.",
                "Equivalent average power calculated as total 7-day energy divided by 168.0 hours.",
            ],
        )

    # ─────────────────────────────────────────────────────────────────
    # 4. Plant Fleet Multi-Horizon Aggregator
    # ─────────────────────────────────────────────────────────────────
    def predict_fleet(
        self,
        horizon: ForecastHorizon,
        machines: List[EnergyForecastInput],
    ) -> HorizonForecastResponse:
        """
        Aggregates valid machine-level predictions across the fleet
        for the chosen forecast horizon (15m, 1d, or 1w).
        Computes synchronized time-series profile and machine breakdown.
        Explicitly tracks and handles machine coverage without silent zeroing.
        """
        if not machines:
            raise EnergyForecastingServiceError("Machines list cannot be empty for fleet forecast.")

        machine_responses = []
        coverage_count = 0

        for m in machines:
            try:
                if horizon == ForecastHorizon.NEXT_15MIN:
                    res_15m = self.predict_next_15min(m)
                    # Convert to uniform HorizonForecastResponse representation
                    res = HorizonForecastResponse(
                        forecast_horizon="15m",
                        forecast_target="next_15min_energy_kwh",
                        forecast_start=res_15m.target_interval_start,
                        forecast_end=res_15m.target_interval_end,
                        forecast_duration_hours=0.25,
                        machine_id=m.machine_id,
                        machine_type=m.machine_type,
                        predicted_energy_kwh=res_15m.predicted_next_15min_energy_kwh,
                        energy_unit="kWh",
                        equivalent_average_power_kw=res_15m.equivalent_average_power_kw,
                        power_unit="kW",
                        granularity="15-minute",
                        time_series=[
                            ForecastTimeSeriesPoint(
                                timestamp=res_15m.target_interval_start,
                                interval_label="Next 15m",
                                predicted_energy_kwh=res_15m.predicted_next_15min_energy_kwh,
                                equivalent_average_power_kw=res_15m.equivalent_average_power_kw,
                            )
                        ],
                        machine_breakdown=[],
                        model_metadata=res_15m.model_metadata,
                        data_provenance=res_15m.data_provenance,
                        physical_constraint_applied=res_15m.physical_constraint_applied,
                        coverage_count=1,
                        total_machines=1,
                        is_complete_coverage=True,
                    )
                elif horizon == ForecastHorizon.NEXT_DAY:
                    res = self.predict_next_day(m)
                else:  # NEXT_WEEK
                    res = self.predict_next_week(m)

                machine_responses.append((m, res))
                coverage_count += 1
            except Exception as e:
                print(f"[WARN] Failed machine prediction for {m.machine_id}: {e}")

        if not machine_responses:
            raise EnergyForecastingServiceError("Failed to generate forecast for all fleet machines.")

        total_predicted_kwh = sum(r.predicted_energy_kwh for _, r in machine_responses)
        first_res = machine_responses[0][1]
        duration_hours = first_res.forecast_duration_hours
        total_equiv_kw = round(total_predicted_kwh / duration_hours, 2)

        # Build machine breakdown
        machine_breakdown = []
        for m, r in machine_responses:
            pct = (
                round((r.predicted_energy_kwh / total_predicted_kwh) * 100.0, 1)
                if total_predicted_kwh > 0
                else 0.0
            )
            machine_breakdown.append(
                MachineForecastBreakdown(
                    machine_id=m.machine_id,
                    machine_name=m.machine_id.replace("_", " ").title(),
                    machine_type=m.machine_type,
                    predicted_energy_kwh=r.predicted_energy_kwh,
                    equivalent_average_power_kw=r.equivalent_average_power_kw,
                    percentage_of_fleet=pct,
                    is_fallback=False,
                )
            )

        # Build fleet time-series by summing interval points
        fleet_time_series: List[ForecastTimeSeriesPoint] = []
        num_intervals = len(first_res.time_series)

        for i in range(num_intervals):
            interval_label = first_res.time_series[i].interval_label
            interval_ts = first_res.time_series[i].timestamp
            interval_kwh = sum(r.time_series[i].predicted_energy_kwh for _, r in machine_responses if len(r.time_series) > i)
            interval_kwh = round(interval_kwh, 3)

            # For 1-day, each point is 1 hour => average kW == kWh
            # For 1-week, each point is 24 hours => average kW == kWh / 24
            # For 15-min, point is 0.25h => average kW == kWh / 0.25
            if horizon == ForecastHorizon.NEXT_15MIN:
                pt_kw = round(interval_kwh / 0.25, 2)
            elif horizon == ForecastHorizon.NEXT_DAY:
                pt_kw = round(interval_kwh, 2)
            else:
                pt_kw = round(interval_kwh / 24.0, 2)

            fleet_time_series.append(
                ForecastTimeSeriesPoint(
                    timestamp=interval_ts,
                    interval_label=interval_label,
                    predicted_energy_kwh=interval_kwh,
                    equivalent_average_power_kw=pt_kw,
                )
            )

        is_complete = coverage_count == len(machines)

        return HorizonForecastResponse(
            forecast_horizon=horizon.value,
            forecast_target=first_res.forecast_target,
            forecast_start=first_res.forecast_start,
            forecast_end=first_res.forecast_end,
            forecast_duration_hours=duration_hours,
            machine_id="PLANT",
            machine_type="FLEET_AGGREGATE",
            predicted_energy_kwh=round(total_predicted_kwh, 2),
            energy_unit="kWh",
            equivalent_average_power_kw=total_equiv_kw,
            power_unit="kW",
            granularity=first_res.granularity,
            time_series=fleet_time_series,
            machine_breakdown=machine_breakdown,
            model_metadata=self.get_metadata(),
            data_provenance="PREDICTED_HIST_GB_MODEL",
            physical_constraint_applied=any(r.physical_constraint_applied for _, r in machine_responses),
            coverage_count=coverage_count,
            total_machines=len(machines),
            is_complete_coverage=is_complete,
            assumptions=first_res.assumptions,
        )


# Global service instance
energy_forecasting_service = EnergyForecastingService()
