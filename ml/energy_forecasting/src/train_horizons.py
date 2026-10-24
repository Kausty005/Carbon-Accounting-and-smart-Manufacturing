"""
WattWise AI — Multi-Horizon Energy Forecasting Training Pipeline
Trains, evaluates, and serializes dedicated models for:
1. Hourly Energy Forecasting (powers 24-hour daily horizon)
2. Daily Energy Forecasting (powers 7-day weekly horizon)

Uses chronological train/validation/test splits on the industrial energy dataset.
Preserves existing 15-minute model intact.
"""

from datetime import datetime, timezone
from pathlib import Path
import json
import sys
import time

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml.energy_forecasting.src.dataset import compute_file_hash


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict:
    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))
    total_true = float(np.sum(np.abs(y_true)))
    wape = float(np.sum(np.abs(y_true - y_pred)) / total_true * 100.0) if total_true > 0 else 0.0
    return {
        "mae_kwh": round(mae, 4),
        "rmse_kwh": round(rmse, 4),
        "r2_score": round(r2, 4),
        "wape_pct": round(wape, 2),
    }


def train_and_save_horizons(csv_path: Path, models_dir: Path, reports_dir: Path):
    t_start = time.time()
    random_seed = 42
    np.random.seed(random_seed)
    models_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 65)
    print("WattWise AI — Training Multi-Horizon Models (1-Day & 1-Week)")
    print("=" * 65)

    dataset_hash = compute_file_hash(csv_path)
    print(f"Dataset SHA-256 (prefix): {dataset_hash}")

    print("Loading raw dataset ...")
    df = pd.read_csv(csv_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    clean_energy = df["energy_kwh"].fillna(df["power_kw"] * 0.25)
    df["clean_energy"] = clean_energy

    # ─────────────────────────────────────────────────────────────────
    # 1. Hourly Aggregation & Model Training (Next-Day 24h Horizon)
    # ─────────────────────────────────────────────────────────────────
    print("\n--- [HORIZON: 1-DAY] Aggregating 15-Minute Data to Hourly ---")
    df["date_hour"] = df["timestamp"].dt.floor("h")
    hourly = df.groupby(
        ["machine_id", "machine_type", "site_id", "shift_pattern", "rated_power_kw", "date_hour"],
        as_index=False
    ).agg({
        "clean_energy": "sum",
        "ambient_temp_c": "mean",
        "process_temp_c": "mean",
        "relative_humidity_pct": "mean",
        "load_factor": "mean",
        "power_kw": "mean",
    }).rename(columns={"clean_energy": "hourly_energy_kwh"})

    hourly["hour"] = hourly["date_hour"].dt.hour
    hourly["day_of_week"] = hourly["date_hour"].dt.dayofweek
    hourly["is_weekend"] = (hourly["day_of_week"] >= 5).astype(int)
    hourly["date"] = hourly["date_hour"].dt.date
    hourly["hour_sin"] = np.sin(2 * np.pi * hourly["hour"] / 24.0)
    hourly["hour_cos"] = np.cos(2 * np.pi * hourly["hour"] / 24.0)
    hourly["day_sin"] = np.sin(2 * np.pi * hourly["day_of_week"] / 7.0)
    hourly["day_cos"] = np.cos(2 * np.pi * hourly["day_of_week"] / 7.0)

    print(f"Aggregated {len(hourly):,} hourly records across {hourly['date'].nunique()} unique dates.")

    # Chronological Split
    dates = sorted(hourly["date"].unique())
    n_dates = len(dates)
    train_dates = dates[:int(n_dates * 0.70)]
    val_dates = dates[int(n_dates * 0.70):int(n_dates * 0.85)]
    test_dates = dates[int(n_dates * 0.85):]

    train_h = hourly[hourly["date"].isin(train_dates)].copy()
    val_h = hourly[hourly["date"].isin(val_dates)].copy()
    test_h = hourly[hourly["date"].isin(test_dates)].copy()

    split_meta_h = {
        "train_range": f"{train_dates[0]} to {train_dates[-1]} ({len(train_h):,} records)",
        "val_range": f"{val_dates[0]} to {val_dates[-1]} ({len(val_h):,} records)",
        "test_range": f"{test_dates[0]} to {test_dates[-1]} ({len(test_h):,} records)",
    }
    print(f"Chronological split (Hourly):\n  Train: {split_meta_h['train_range']}\n  Val:   {split_meta_h['val_range']}\n  Test:  {split_meta_h['test_range']}")

    hourly_cat_cols = ["machine_type", "shift_pattern"]
    hourly_num_cols = [
        "rated_power_kw",
        "hour",
        "day_of_week",
        "is_weekend",
        "hour_sin",
        "hour_cos",
        "day_sin",
        "day_cos",
        "ambient_temp_c",
        "load_factor",
    ]
    hourly_features = hourly_cat_cols + hourly_num_cols

    hourly_preprocessor = ColumnTransformer(
        transformers=[
            ("cat", Pipeline([
                ("imputer", SimpleImputer(strategy="constant", fill_value="UNKNOWN")),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]), hourly_cat_cols),
            ("num", Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]), hourly_num_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    hourly_pipeline = Pipeline([
        ("preprocessor", hourly_preprocessor),
        ("regressor", HistGradientBoostingRegressor(
            max_iter=120,
            max_depth=10,
            learning_rate=0.08,
            min_samples_leaf=20,
            random_state=random_seed,
        )),
    ])

    print("Fitting Hourly Energy Model (HistGradientBoostingRegressor)...")
    t0_fit_h = time.time()
    hourly_pipeline.fit(train_h[hourly_features], train_h["hourly_energy_kwh"].values)
    print(f"Hourly model fit in {time.time() - t0_fit_h:.2f}s")

    # Evaluate on val and test
    val_pred_h = hourly_pipeline.predict(val_h[hourly_features])
    test_pred_h = hourly_pipeline.predict(test_h[hourly_features])
    val_metrics_h = compute_metrics(val_h["hourly_energy_kwh"].values, val_pred_h)
    test_metrics_h = compute_metrics(test_h["hourly_energy_kwh"].values, test_pred_h)

    print(f"Hourly Validation: MAE={val_metrics_h['mae_kwh']} kWh, RMSE={val_metrics_h['rmse_kwh']} kWh, R²={val_metrics_h['r2_score']}, WAPE={val_metrics_h['wape_pct']}%")
    print(f"Hourly Test:       MAE={test_metrics_h['mae_kwh']} kWh, RMSE={test_metrics_h['rmse_kwh']} kWh, R²={test_metrics_h['r2_score']}, WAPE={test_metrics_h['wape_pct']}%")

    hourly_artifact_path = models_dir / "energy_forecasting_hourly_model.joblib"
    joblib.dump({
        "model": hourly_pipeline,
        "model_class": "HistGradientBoostingRegressor",
        "feature_names": hourly_features,
        "categorical_features": hourly_cat_cols,
        "numerical_features": hourly_num_cols,
        "target_column": "hourly_energy_kwh",
        "forecast_horizon": "1_day",
        "dataset_hash": dataset_hash,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_synthetic": True,
        "synthetic_data_designation": "Synthetic Industrial Energy Dataset (Demo Benchmark)",
        "split_metadata": split_meta_h,
        "validation_metrics": val_metrics_h,
        "test_metrics": test_metrics_h,
    }, hourly_artifact_path)
    print(f"Saved Hourly model artifact to: {hourly_artifact_path}")

    # ─────────────────────────────────────────────────────────────────
    # 2. Daily Aggregation & Model Training (Next-Week 7d Horizon)
    # ─────────────────────────────────────────────────────────────────
    print("\n--- [HORIZON: 1-WEEK] Aggregating Hourly Data to Daily ---")
    hourly["date_day"] = pd.to_datetime(hourly["date"])
    daily = hourly.groupby(
        ["machine_id", "machine_type", "site_id", "shift_pattern", "rated_power_kw", "date_day"],
        as_index=False
    ).agg({
        "hourly_energy_kwh": "sum",
        "ambient_temp_c": "mean",
        "load_factor": "mean",
    }).rename(columns={"hourly_energy_kwh": "daily_energy_kwh"})

    daily["day_of_week"] = daily["date_day"].dt.dayofweek
    daily["is_weekend"] = (daily["day_of_week"] >= 5).astype(int)
    daily["date"] = daily["date_day"].dt.date
    daily["day_sin"] = np.sin(2 * np.pi * daily["day_of_week"] / 7.0)
    daily["day_cos"] = np.cos(2 * np.pi * daily["day_of_week"] / 7.0)

    print(f"Aggregated {len(daily):,} daily records across {daily['date'].nunique()} unique dates.")

    train_d = daily[daily["date"].isin(train_dates)].copy()
    val_d = daily[daily["date"].isin(val_dates)].copy()
    test_d = daily[daily["date"].isin(test_dates)].copy()

    split_meta_d = {
        "train_range": f"{train_dates[0]} to {train_dates[-1]} ({len(train_d):,} records)",
        "val_range": f"{val_dates[0]} to {val_dates[-1]} ({len(val_d):,} records)",
        "test_range": f"{test_dates[0]} to {test_dates[-1]} ({len(test_d):,} records)",
    }
    print(f"Chronological split (Daily):\n  Train: {split_meta_d['train_range']}\n  Val:   {split_meta_d['val_range']}\n  Test:  {split_meta_d['test_range']}")

    daily_cat_cols = ["machine_type", "shift_pattern"]
    daily_num_cols = [
        "rated_power_kw",
        "day_of_week",
        "is_weekend",
        "day_sin",
        "day_cos",
        "ambient_temp_c",
        "load_factor",
    ]
    daily_features = daily_cat_cols + daily_num_cols

    daily_preprocessor = ColumnTransformer(
        transformers=[
            ("cat", Pipeline([
                ("imputer", SimpleImputer(strategy="constant", fill_value="UNKNOWN")),
                ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]), daily_cat_cols),
            ("num", Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]), daily_num_cols),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )

    daily_pipeline = Pipeline([
        ("preprocessor", daily_preprocessor),
        ("regressor", HistGradientBoostingRegressor(
            max_iter=100,
            max_depth=8,
            learning_rate=0.08,
            min_samples_leaf=15,
            random_state=random_seed,
        )),
    ])

    print("Fitting Daily Energy Model (HistGradientBoostingRegressor)...")
    t0_fit_d = time.time()
    daily_pipeline.fit(train_d[daily_features], train_d["daily_energy_kwh"].values)
    print(f"Daily model fit in {time.time() - t0_fit_d:.2f}s")

    val_pred_d = daily_pipeline.predict(val_d[daily_features])
    test_pred_d = daily_pipeline.predict(test_d[daily_features])
    val_metrics_d = compute_metrics(val_d["daily_energy_kwh"].values, val_pred_d)
    test_metrics_d = compute_metrics(test_d["daily_energy_kwh"].values, test_pred_d)

    print(f"Daily Validation: MAE={val_metrics_d['mae_kwh']} kWh, RMSE={val_metrics_d['rmse_kwh']} kWh, R²={val_metrics_d['r2_score']}, WAPE={val_metrics_d['wape_pct']}%")
    print(f"Daily Test:       MAE={test_metrics_d['mae_kwh']} kWh, RMSE={test_metrics_d['rmse_kwh']} kWh, R²={test_metrics_d['r2_score']}, WAPE={test_metrics_d['wape_pct']}%")

    daily_artifact_path = models_dir / "energy_forecasting_daily_model.joblib"
    joblib.dump({
        "model": daily_pipeline,
        "model_class": "HistGradientBoostingRegressor",
        "feature_names": daily_features,
        "categorical_features": daily_cat_cols,
        "numerical_features": daily_num_cols,
        "target_column": "daily_energy_kwh",
        "forecast_horizon": "1_week",
        "dataset_hash": dataset_hash,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_synthetic": True,
        "synthetic_data_designation": "Synthetic Industrial Energy Dataset (Demo Benchmark)",
        "split_metadata": split_meta_d,
        "validation_metrics": val_metrics_d,
        "test_metrics": test_metrics_d,
    }, daily_artifact_path)
    print(f"Saved Daily model artifact to: {daily_artifact_path}")

    # Save summary report
    report = {
        "dataset_hash": dataset_hash,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "horizons": {
            "hourly_model_for_next_day": {
                "artifact": str(hourly_artifact_path.name),
                "features": hourly_features,
                "split": split_meta_h,
                "val_metrics": val_metrics_h,
                "test_metrics": test_metrics_h,
            },
            "daily_model_for_next_week": {
                "artifact": str(daily_artifact_path.name),
                "features": daily_features,
                "split": split_meta_d,
                "val_metrics": val_metrics_d,
                "test_metrics": test_metrics_d,
            },
        },
        "duration_seconds": round(time.time() - t_start, 2),
    }

    report_file = reports_dir / "multi_horizon_evaluation_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"Saved report to: {report_file}")
    print(f"All horizon training finished in {time.time() - t_start:.2f}s!")
    return report


if __name__ == "__main__":
    csv_f = PROJECT_ROOT / "industrial_energy_forecasting_synthetic.csv"
    m_dir = PROJECT_ROOT / "ml" / "energy_forecasting" / "models"
    r_dir = PROJECT_ROOT / "ml" / "energy_forecasting" / "reports"
    train_and_save_horizons(csv_f, m_dir, r_dir)
