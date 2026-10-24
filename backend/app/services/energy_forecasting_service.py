"""
WattWise AI — Energy Forecasting Service
Application-level singleton service managing the machine energy forecasting model.
Loads the serialized scikit-learn pipeline artifact once, validates inference payloads,
applies physical thermodynamic bounds, and returns next 15-minute expected energy consumption.
"""

from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
from typing import Any, Dict, Optional
import joblib
import pandas as pd

# Ensure repository root is on sys.path dynamically
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.models import EnergyForecastInput, EnergyForecastResponse, ProvenanceType
from ml.energy_forecasting.src.features import prepare_inference_features


class EnergyForecastingServiceError(Exception):
    """Raised when energy forecasting fails due to invalid parameters or model errors."""
    pass


class ModelNotReadyError(EnergyForecastingServiceError):
    """Raised when model artifact is missing or corrupted; prevents silent mock fallbacks."""
    pass


class EnergyForecastingService:
    """Service to load, cache, and query the machine energy forecasting model."""

    def __init__(self, model_path: Optional[Path] = None):
        if model_path is None:
            # Default path: ml/energy_forecasting/models/energy_forecasting_model.joblib
            model_path = PROJECT_ROOT / "ml" / "energy_forecasting" / "models" / "energy_forecasting_model.joblib"
        self.model_path = Path(model_path)
        self._artifact: Optional[Dict[str, Any]] = None
        self._model = None
        self._metadata: Optional[Dict[str, Any]] = None
        self._load_error: Optional[str] = None

    def load_model(self) -> None:
        """
        Application-level model loader called during FastAPI startup lifespan.
        Loads and verifies the pipeline artifact once into memory.
        """
        if self._model is not None:
            return

        if not self.model_path.exists():
            self._load_error = f"Model artifact not found at {self.model_path}."
            print(f"[WARN] {self._load_error}")
            return

        try:
            artifact = joblib.load(self.model_path)
            if not isinstance(artifact, dict) or "model" not in artifact:
                raise ValueError("Joblib artifact is corrupt or missing 'model' pipeline.")

            self._artifact = artifact
            self._model = artifact["model"]
            self._metadata = {
                "model_class": artifact.get("model_class", "HistGradientBoostingRegressor"),
                "dataset_hash": artifact.get("dataset_hash"),
                "trained_at_utc": artifact.get("trained_at_utc"),
                "is_synthetic": artifact.get("is_synthetic", True),
                "synthetic_data_designation": artifact.get(
                    "synthetic_data_designation",
                    "Synthetic Industrial Energy Dataset (Demo Benchmark)"
                ),
                "test_metrics": artifact.get("test_metrics", {}),
                "unseen_machines_generalization": artifact.get("unseen_machines_generalization", {}),
            }
            self._load_error = None
            print(f"[INFO] Energy forecasting model loaded successfully from {self.model_path}")
        except Exception as e:
            self._load_error = f"Failed to load model artifact: {str(e)}"
            self._model = None
            print(f"[ERROR] {self._load_error}")

    def _ensure_model_loaded(self) -> None:
        """Ensures the model is loaded; raises ModelNotReadyError if artifact is missing."""
        if self._model is None:
            self.load_model()

        if self._model is None:
            err_msg = self._load_error or f"Energy forecasting model artifact unavailable at {self.model_path}."
            raise ModelNotReadyError(
                f"{err_msg} Please ensure the training pipeline has been executed."
            )

    def is_ready(self) -> bool:
        """Returns True if the model is loaded and ready for inference."""
        return self._model is not None

    def get_metadata(self) -> Dict[str, Any]:
        """Returns model metadata and evaluation benchmarks."""
        if self._model is None:
            try:
                self._ensure_model_loaded()
            except ModelNotReadyError:
                return {
                    "model_status": "NOT_LOADED",
                    "model_path": str(self.model_path),
                    "error": self._load_error,
                    "is_synthetic": True,
                    "synthetic_data_designation": "Synthetic Industrial Energy Dataset (Demo Benchmark)",
                }

        assert self._metadata is not None
        return self._metadata

    def predict_next_15min(self, input_data: EnergyForecastInput) -> EnergyForecastResponse:
        """
        Generates the next 15-minute expected energy consumption (in kWh)
        for a machine given its current operational state and telemetry.
        Applies physical lower and upper capacity bounds.
        """
        self._ensure_model_loaded()

        # Input validation
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
        # Default temporal features to current hour/day if omitted
        if input_dict.get("hour") is None:
            input_dict["hour"] = now_utc.hour
        if input_dict.get("day_of_week") is None:
            input_dict["day_of_week"] = now_utc.weekday()
        if input_dict.get("energy_kwh") is None:
            input_dict["energy_kwh"] = current_energy

        # Target intervals
        target_start = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        target_end = (now_utc + timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
        target_interval_str = f"{target_start} to {target_end} (+15m)"

        # 1. Feature Preparation (exact training logic)
        X_inf = prepare_inference_features(input_dict)

        # 2. Model Prediction
        try:
            raw_pred = float(self._model.predict(X_inf)[0])
        except Exception as e:
            raise EnergyForecastingServiceError(f"Model inference failed: {str(e)}") from e

        # 3. Physical Constraints (Energy cannot be negative; cannot exceed rated surge capacity)
        # In a 15-min interval, max energy is rated_power_kw * 0.25h * 1.30 (surge factor)
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

        meta = self.get_metadata().copy()
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


# Global service instance
energy_forecasting_service = EnergyForecastingService()
