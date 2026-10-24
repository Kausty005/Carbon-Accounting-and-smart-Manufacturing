"""
Forecasting Interface & Adapter for AI Anomaly Intelligence.
Integrates with upstream 15-minute energy forecasting pipelines (HistGradientBoostingRegressor).

Interfaces:
  Target: target_next_15min_energy_kwh (kWh per 15-minute interval)
  Model: HistGradientBoostingRegressor
  Feature Count: 29 features specified by upstream contract (with 31 enumerated features
                 across 5 groups documented explicitly below to prevent silent drops or inventions).
"""

import os
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple, Union
from pydantic import BaseModel, Field

logger = logging.getLogger("ai_energy_intelligence.forecast_adapter")

# -------------------------------------------------------------------------
# Upstream Forecasting Feature Schema
# Documents the 5 feature groups. Total enumerated features = 31.
# Upstream metadata references "29 features before encoding"; we document
# the full verified list to ensure 100% schema alignment without dropping.
# -------------------------------------------------------------------------
FORECASTING_FEATURE_GROUPS: Dict[str, List[str]] = {
    "machine_and_operating": [
        "machine_id",
        "machine_type",
        "site_id",
        "rated_power_kw",
        "shift_pattern",
        "operating_state",
    ],
    "time_features": [
        "hour",
        "day_of_week",
        "is_weekend",
        "hour_sin",
        "hour_cos",
        "day_sin",
        "day_cos",
    ],
    "environmental_and_process": [
        "ambient_temperature",
        "process_temperature",
        "humidity",
    ],
    "operating_and_production": [
        "load_factor",
        "operating_minutes",
        "production_units",
        "power_kw",
    ],
    "historical_energy_and_power": [
        "energy_lag_1",
        "energy_lag_2",
        "energy_lag_3",
        "energy_lag_4",
        "power_lag_1",
        "power_lag_2",
        "power_lag_3",
        "power_lag_4",
        "rolling_mean_1h",
        "rolling_std_1h",
        "same_hour_previous_day",
    ],
}

# Flattened list of all 31 verified upstream features before encoding
ALL_UPSTREAM_FEATURES: List[str] = [
    feat for group in FORECASTING_FEATURE_GROUPS.values() for feat in group
]


class ForecastRecord(BaseModel):
    """
    Contract for teammate-provided 15-minute machine energy forecast.
    """
    machine_id: str
    machine_type: str
    site_id: str = "SITE-01"
    forecast_timestamp: str  # ISO 8601 string
    target_timestamp: str    # ISO 8601 string
    interval_minutes: int = 15
    predicted_energy_kwh: float
    unit: str = "kWh"
    model: str = "HistGradientBoostingRegressor"
    confidence_lower_kwh: Optional[float] = None
    confidence_upper_kwh: Optional[float] = None


class ForecastMatchResult(BaseModel):
    """
    Outcome of matching a real forecast with an actual energy reading.
    """
    machine_id: str
    site_id: str
    target_timestamp: str
    is_matched: bool = False
    status: str  # "evaluated", "awaiting_actual", "forecast_unavailable", "actual_unavailable"
    actual_energy_kwh: Optional[float] = None
    predicted_energy_kwh: Optional[float] = None
    residual_kwh: Optional[float] = None
    abs_residual_kwh: Optional[float] = None
    relative_deviation_pct: Optional[float] = None
    direction: Optional[str] = None  # "excess_energy", "under_consumption", "nominal", None
    unit: str = "kWh"
    model_name: str = "HistGradientBoostingRegressor"
    message: str = ""


class ForecastServiceAdapter:
    """
    Configurable adapter for teammate-provided forecasting model / API.
    Supports in-memory cache, batch ingestion, external HTTP polling with timeout,
    and safe fallback to disconnected status without crashing anomaly detection.
    """

    def __init__(self, api_url: Optional[str] = None, timeout_seconds: float = 3.0):
        self.api_url = api_url or os.getenv("FORECAST_SERVICE_URL", "").strip()
        self.timeout_seconds = timeout_seconds
        # In-memory storage keyed by (machine_id, site_id, target_timestamp)
        self._forecast_store: Dict[Tuple[str, str, str], ForecastRecord] = {}
        self._service_connected: bool = bool(self.api_url)

    @property
    def is_connected(self) -> bool:
        """Indicates whether a remote or local forecast feed is configured."""
        return bool(self.api_url) or len(self._forecast_store) > 0

    def get_service_status(self) -> Dict[str, Any]:
        """Return connectivity and configuration health metadata."""
        return {
            "service_configured": bool(self.api_url),
            "service_url": self.api_url or None,
            "cached_forecasts_count": len(self._forecast_store),
            "status": "connected" if self.is_connected else "disconnected",
            "model": "HistGradientBoostingRegressor",
            "interval_minutes": 15,
            "target_unit": "kWh",
            "feature_count_declared": 29,
            "feature_count_enumerated": len(ALL_UPSTREAM_FEATURES),
            "message": "Forecast service is active" if self.is_connected else "Forecast service is disconnected; running in sensor-only mode.",
        }

    def _normalize_iso(self, ts: Union[str, datetime]) -> str:
        """Ensure standard ISO 8601 string format without timezone drift."""
        if isinstance(ts, datetime):
            return ts.strftime("%Y-%m-%dT%H:%M:%S")
        ts_str = str(ts).strip()
        # Strip trailing Z or +00:00 for uniform comparison
        if ts_str.endswith("Z"):
            ts_str = ts_str[:-1]
        elif "+" in ts_str:
            ts_str = ts_str.split("+")[0]
        return ts_str

    def ingest_forecast(self, record: Union[Dict[str, Any], ForecastRecord]) -> ForecastRecord:
        """Ingest a single forecast prediction into the adapter cache."""
        if isinstance(record, dict):
            fc = ForecastRecord(**record)
        else:
            fc = record

        norm_target = self._normalize_iso(fc.target_timestamp)
        fc.target_timestamp = norm_target
        fc.forecast_timestamp = self._normalize_iso(fc.forecast_timestamp)
        key = (fc.machine_id.upper(), fc.site_id.upper(), norm_target)
        self._forecast_store[key] = fc
        return fc

    def ingest_batch(self, records: List[Union[Dict[str, Any], ForecastRecord]]) -> int:
        """Ingest a batch of forecast predictions."""
        count = 0
        for r in records:
            try:
                self.ingest_forecast(r)
                count += 1
            except Exception as e:
                logger.warning(f"Failed to ingest forecast record: {e}")
        return count

    def get_forecast(
        self,
        machine_id: str,
        target_timestamp: Union[str, datetime],
        site_id: str = "SITE-01",
    ) -> Optional[ForecastRecord]:
        """
        Retrieve forecast prediction for exact machine, site and target timestamp.
        Checks cache first, then attempts remote API if configured.
        """
        norm_target = self._normalize_iso(target_timestamp)
        key = (machine_id.upper(), site_id.upper(), norm_target)

        # 1. Check local cache
        if key in self._forecast_store:
            return self._forecast_store[key]

        # 2. If remote API is configured, attempt retrieval
        if self.api_url:
            try:
                import urllib.request
                url = f"{self.api_url.rstrip('/')}/forecast?machine_id={machine_id}&target_timestamp={norm_target}&site_id={site_id}"
                req = urllib.request.Request(url, headers={"Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        fc = self.ingest_forecast(data)
                        return fc
            except Exception as ex:
                logger.debug(f"Remote forecast service call failed: {ex}")

        return None

    def match_forecast_with_actual(
        self,
        machine_id: str,
        target_timestamp: Union[str, datetime],
        actual_energy_kwh: Optional[float] = None,
        site_id: str = "SITE-01",
        is_future_target: bool = False,
    ) -> ForecastMatchResult:
        """
        Match actual measured energy reading with 15-minute forecast prediction.
        Computes signed residual, absolute residual, and relative percentage deviation.
        Does not fabricate forecast or actual energy values.
        """
        norm_target = self._normalize_iso(target_timestamp)
        fc = self.get_forecast(machine_id=machine_id, target_timestamp=norm_target, site_id=site_id)

        # Case 1: Forecast unavailable
        if fc is None:
            return ForecastMatchResult(
                machine_id=machine_id,
                site_id=site_id,
                target_timestamp=norm_target,
                is_matched=False,
                status="forecast_unavailable",
                actual_energy_kwh=actual_energy_kwh,
                predicted_energy_kwh=None,
                message=f"No forecast available from HistGradientBoostingRegressor for {machine_id} at {norm_target}.",
            )

        # Case 2: Forecast is available, but actual measurement has not arrived yet (future interval)
        if actual_energy_kwh is None or is_future_target:
            return ForecastMatchResult(
                machine_id=machine_id,
                site_id=site_id,
                target_timestamp=norm_target,
                is_matched=False,
                status="awaiting_actual",
                actual_energy_kwh=None,
                predicted_energy_kwh=fc.predicted_energy_kwh,
                message=f"Forecast of {fc.predicted_energy_kwh:.3f} kWh is registered; awaiting actual telemetry measurement for interval {norm_target}.",
            )

        # Case 3: Both forecast and actual reading are available -> Calculate residuals
        actual = float(actual_energy_kwh)
        predicted = float(fc.predicted_energy_kwh)
        residual = actual - predicted
        abs_residual = abs(residual)

        # Relative deviation percentage (valid when predicted > 0)
        rel_pct = None
        if predicted > 1e-4:
            rel_pct = round((residual / predicted) * 100.0, 2)

        # Initial direction (refined by detector thresholds)
        if abs(residual) < 0.05:
            direction = "nominal"
        elif residual > 0:
            direction = "excess_energy"
        else:
            direction = "under_consumption"

        return ForecastMatchResult(
            machine_id=machine_id,
            site_id=site_id,
            target_timestamp=norm_target,
            is_matched=True,
            status="evaluated",
            actual_energy_kwh=round(actual, 4),
            predicted_energy_kwh=round(predicted, 4),
            residual_kwh=round(residual, 4),
            abs_residual_kwh=round(abs_residual, 4),
            relative_deviation_pct=rel_pct,
            direction=direction,
            model_name=fc.model,
            message=f"Matched: Actual={actual:.3f} kWh vs Predicted={predicted:.3f} kWh (Residual={residual:+.3f} kWh).",
        )

    def clear(self) -> None:
        """Clear cached forecast records (useful for testing)."""
        self._forecast_store.clear()
