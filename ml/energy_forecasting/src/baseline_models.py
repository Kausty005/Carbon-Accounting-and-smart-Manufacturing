"""
WattWise AI — Energy Forecasting Baseline Models
Implements:
1. Persistence Baseline: predicts next interval using most recent energy measurement.
2. Same-Hour Previous-Day Baseline: predicts next interval using 24h lag (lag 96 intervals).
"""

from typing import Optional, Union
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, RegressorMixin


class PersistenceBaseline(BaseEstimator, RegressorMixin):
    """
    Persistence Baseline:
    Forecasts next 15-minute energy consumption using the most recent available
    energy measurement (energy_kwh_lag1).
    """

    def fit(self, X: Union[pd.DataFrame, np.ndarray], y: Optional = None):
        return self

    def predict(self, X: Union[pd.DataFrame, np.ndarray]) -> np.ndarray:
        if isinstance(X, pd.DataFrame):
            if "energy_kwh_lag1" in X.columns:
                return X["energy_kwh_lag1"].to_numpy(dtype=float)
            elif "energy_kwh" in X.columns:
                return X["energy_kwh"].fillna(X.get("power_kw", 0) * 0.25).to_numpy(dtype=float)
            elif "power_kw" in X.columns:
                return (X["power_kw"] * 0.25).to_numpy(dtype=float)
        # Fallback to column index if numpy array
        return np.asarray(X)[:, 0].astype(float)


class SameHourPreviousDayBaseline(BaseEstimator, RegressorMixin):
    """
    Same-Hour Previous-Day Baseline:
    Forecasts next 15-minute energy consumption using the energy consumed at the
    exact same 15-minute interval 24 hours ago (lag 96 intervals).
    Falls back to persistence if historical day is unavailable.
    """

    def fit(self, X: Union[pd.DataFrame, np.ndarray], y: Optional = None):
        return self

    def predict(self, X: Union[pd.DataFrame, np.ndarray]) -> np.ndarray:
        if isinstance(X, pd.DataFrame):
            if "energy_same_hour_prev_day" in X.columns:
                pred = X["energy_same_hour_prev_day"].copy()
                if "energy_kwh_lag1" in X.columns:
                    pred = pred.fillna(X["energy_kwh_lag1"])
                return pred.to_numpy(dtype=float)
            elif "energy_kwh_lag1" in X.columns:
                return X["energy_kwh_lag1"].to_numpy(dtype=float)
        return np.asarray(X)[:, 0].astype(float)
