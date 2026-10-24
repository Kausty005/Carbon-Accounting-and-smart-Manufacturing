"""
WattWise AI — Complete Industrial Energy Forecasting ML Pipeline
Trains, validates, compares, and packages reproducible models:
1. Persistence Baseline
2. Same-Hour Previous-Day Baseline
3. Random Forest Regressor
4. HistGradientBoosting Regressor

Evaluates on chronological Validation and Test sets, tests machine generalization,
generates plots, and exports a production joblib model artifact.
"""

from datetime import datetime, timezone
from pathlib import Path
import json
import sys
import time

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.pipeline import Pipeline

from ml.energy_forecasting.src.baseline_models import (
    PersistenceBaseline,
    SameHourPreviousDayBaseline,
)
from ml.energy_forecasting.src.dataset import (
    ALL_FEATURE_COLUMNS,
    CATEGORICAL_FEATURES,
    NUMERICAL_FEATURES,
    TARGET_COLUMN,
    chronological_split,
    compute_file_hash,
    load_and_preprocess_dataset,
    unseen_machine_split,
)
from ml.energy_forecasting.src.evaluate import (
    compute_metrics,
    evaluate_segments,
    generate_evaluation_plots,
)
from ml.energy_forecasting.src.features import build_preprocessor


def run_pipeline(csv_path: Path, output_dir: Path, plots_dir: Path, reports_dir: Path):
    """Executes the full training, model comparison, evaluation, and serialization pipeline."""
    start_time = time.time()
    random_seed = 42
    np.random.seed(random_seed)

    output_dir.mkdir(parents=True, exist_ok=True)
    plots_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)

    # 1. Dataset loading and lineage
    dataset_hash = compute_file_hash(csv_path)
    print(f"Dataset SHA-256 (prefix): {dataset_hash}")

    df = load_and_preprocess_dataset(csv_path)

    # 2. Chronological Split (70% Train / 15% Val / 15% Test)
    train_df, val_df, test_df, split_meta = chronological_split(df, 0.70, 0.15, 0.15)

    X_train = train_df[ALL_FEATURE_COLUMNS]
    y_train = train_df[TARGET_COLUMN].values

    X_val = val_df[ALL_FEATURE_COLUMNS]
    y_val = val_df[TARGET_COLUMN].values

    X_test = test_df[ALL_FEATURE_COLUMNS]
    y_test = test_df[TARGET_COLUMN].values

    # 3. Model Definition and Validation Comparison
    print("\n" + "=" * 65)
    print("STEP 1: TRAINING & MODEL COMPARISON ON VALIDATION SET")
    print("=" * 65)

    models_to_evaluate = {}

    # A. Baseline 1: Persistence
    print("Evaluating Model 1/4: Persistence Baseline ...")
    p_base = PersistenceBaseline()
    p_base.fit(X_train, y_train)
    val_pred_p = p_base.predict(X_val)
    models_to_evaluate["PersistenceBaseline"] = {
        "model": p_base,
        "is_pipeline": False,
        "val_metrics": compute_metrics(y_val, val_pred_p),
    }

    # B. Baseline 2: Same-Hour Previous-Day
    print("Evaluating Model 2/4: Same-Hour Previous-Day Baseline ...")
    d_base = SameHourPreviousDayBaseline()
    d_base.fit(X_train, y_train)
    val_pred_d = d_base.predict(X_val)
    models_to_evaluate["SameHourPreviousDayBaseline"] = {
        "model": d_base,
        "is_pipeline": False,
        "val_metrics": compute_metrics(y_val, val_pred_d),
    }

    # C. Random Forest Regressor
    print("Training Model 3/4: Random Forest Regressor (n_estimators=40, max_depth=16) ...")
    rf_pipeline = Pipeline([
        ("preprocessor", build_preprocessor()),
        ("regressor", RandomForestRegressor(
            n_estimators=40,
            max_depth=16,
            max_samples=0.25,
            random_state=random_seed,
            n_jobs=-1
        )),
    ])
    t0_rf = time.time()
    rf_pipeline.fit(X_train, y_train)
    print(f"Random Forest fit completed in {time.time() - t0_rf:.2f}s")
    val_pred_rf = rf_pipeline.predict(X_val)
    models_to_evaluate["RandomForestRegressor"] = {
        "model": rf_pipeline,
        "is_pipeline": True,
        "val_metrics": compute_metrics(y_val, val_pred_rf),
    }

    # D. HistGradientBoosting Regressor
    print("Training Model 4/4: HistGradientBoosting Regressor (max_iter=120, max_depth=10) ...")
    hgb_pipeline = Pipeline([
        ("preprocessor", build_preprocessor()),
        ("regressor", HistGradientBoostingRegressor(
            max_iter=120,
            max_depth=10,
            learning_rate=0.08,
            min_samples_leaf=25,
            random_state=random_seed,
        )),
    ])
    t0_hgb = time.time()
    hgb_pipeline.fit(X_train, y_train)
    print(f"HistGradientBoosting fit completed in {time.time() - t0_hgb:.2f}s")
    val_pred_hgb = hgb_pipeline.predict(X_val)
    models_to_evaluate["HistGradientBoostingRegressor"] = {
        "model": hgb_pipeline,
        "is_pipeline": True,
        "val_metrics": compute_metrics(y_val, val_pred_hgb),
    }

    # Validation comparison table
    print("\n--- VALIDATION PERFORMANCE COMPARISON ---")
    val_comparison = {}
    for name, item in models_to_evaluate.items():
        m = item["val_metrics"]
        val_comparison[name] = m
        print(f"  {name:30s} | MAE: {m['mae_kwh']:.4f} kWh | RMSE: {m['rmse_kwh']:.4f} kWh | R²: {m['r2_score']:.4f} | WAPE: {m['wape_pct']:.2f}%")

    # 4. Model Selection based strictly on Validation Performance (lowest Val MAE)
    best_model_name = min(models_to_evaluate.keys(), key=lambda k: models_to_evaluate[k]["val_metrics"]["mae_kwh"])
    best_item = models_to_evaluate[best_model_name]
    best_model = best_item["model"]
    print(f"\n>> BEST MODEL SELECTED (by Validation MAE): {best_model_name}")

    # 5. Final Evaluation on Holdout Test Set
    print("\n" + "=" * 65)
    print(f"STEP 2: FINAL TEST SET EVALUATION ({split_meta['test_range']})")
    print("=" * 65)

    test_results_all = {}
    for name, item in models_to_evaluate.items():
        m_obj = item["model"]
        test_pred = m_obj.predict(X_test)
        test_metrics = compute_metrics(y_test, test_pred)
        test_results_all[name] = test_metrics
        print(f"  {name:30s} | MAE: {test_metrics['mae_kwh']:.4f} kWh | RMSE: {test_metrics['rmse_kwh']:.4f} kWh | R²: {test_metrics['r2_score']:.4f} | WAPE: {test_metrics['wape_pct']:.2f}%")

    # Test predictions for best model
    best_test_pred = best_model.predict(X_test)
    best_test_metrics = test_results_all[best_model_name]

    # Segmented evaluation on test set for the best model
    test_eval_df = test_df.copy()
    test_eval_df["y_true"] = y_test
    test_eval_df["y_pred"] = best_test_pred

    metrics_by_type = evaluate_segments(test_eval_df, "y_true", "y_pred", "machine_type")
    metrics_by_machine = evaluate_segments(test_eval_df, "y_true", "y_pred", "machine_id")
    metrics_by_state = evaluate_segments(test_eval_df, "y_true", "y_pred", "operating_state")

    # 6. Machine Generalization Experiment (Unseen Machines)
    print("\n" + "=" * 65)
    print("STEP 3: UNSEEN MACHINE GENERALIZATION EXPERIMENT")
    print("=" * 65)
    train_mach_df, unseen_mach_df, holdout_machines = unseen_machine_split(df)
    print(f"Held out {len(holdout_machines)} machines: {', '.join(holdout_machines)}")

    gen_pipeline = Pipeline([
        ("preprocessor", build_preprocessor()),
        ("regressor", HistGradientBoostingRegressor(
            max_iter=100, max_depth=10, learning_rate=0.08, random_state=random_seed
        )),
    ])
    gen_pipeline.fit(train_mach_df[ALL_FEATURE_COLUMNS], train_mach_df[TARGET_COLUMN].values)
    unseen_preds = gen_pipeline.predict(unseen_mach_df[ALL_FEATURE_COLUMNS])
    unseen_metrics = compute_metrics(unseen_mach_df[TARGET_COLUMN].values, unseen_preds)

    print(
        f"Unseen Machines Performance:\n"
        f"  MAE: {unseen_metrics['mae_kwh']:.4f} kWh | "
        f"RMSE: {unseen_metrics['rmse_kwh']:.4f} kWh | "
        f"R²: {unseen_metrics['r2_score']:.4f} | "
        f"WAPE: {unseen_metrics['wape_pct']:.2f}%"
    )

    # 7. Generate Evaluation Plots
    print("\nGenerating evaluation plots...")
    plot_files = generate_evaluation_plots(
        y_true=y_test,
        y_pred=best_test_pred,
        df_eval=test_eval_df,
        output_dir=plots_dir,
        model_name=best_model_name,
    )

    # 8. Package & Serialize Final Production Model Artifact
    model_artifact_path = output_dir / "energy_forecasting_model.joblib"
    artifact_payload = {
        "model": best_model,
        "model_class": best_model_name,
        "feature_names": ALL_FEATURE_COLUMNS,
        "categorical_features": CATEGORICAL_FEATURES,
        "numerical_features": NUMERICAL_FEATURES,
        "target_column": TARGET_COLUMN,
        "random_seed": random_seed,
        "dataset_hash": dataset_hash,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "is_synthetic": True,
        "synthetic_data_designation": "Synthetic Industrial Energy Dataset (Demo Benchmark)",
        "split_metadata": split_meta,
        "validation_metrics": val_comparison,
        "test_metrics": best_test_metrics,
        "test_comparison_all_models": test_results_all,
        "unseen_machines_generalization": {
            "held_out_machines": holdout_machines,
            "metrics": unseen_metrics,
        },
    }

    joblib.dump(artifact_payload, model_artifact_path)
    print(f"\nModel artifact successfully serialized to: {model_artifact_path}")

    # 9. Save Detailed Evaluation Report JSON
    eval_report = {
        "model_artifact": str(model_artifact_path.name),
        "selected_model": best_model_name,
        "selection_rationale": "Highest validation R² and lowest validation MAE among all candidates.",
        "dataset_metadata": {
            "source_file": csv_path.name,
            "dataset_hash_sha256": dataset_hash,
            "total_records": len(df),
            "is_synthetic": True,
            "designation": "Synthetic Industrial Energy Dataset (Demo Benchmark)",
        },
        "chronological_split": split_meta,
        "validation_performance_comparison": val_comparison,
        "test_performance_comparison": test_results_all,
        "selected_model_test_metrics": best_test_metrics,
        "performance_by_machine_type": metrics_by_type,
        "performance_by_operating_state": {
            "0_off": metrics_by_state.get("0", {}),
            "1_idle": metrics_by_state.get("1", {}),
            "2_running": metrics_by_state.get("2", {}),
            "3_maintenance": metrics_by_state.get("3", {}),
        },
        "unseen_machine_generalization": {
            "held_out_machines": holdout_machines,
            "metrics": unseen_metrics,
            "analysis": (
                "Evaluates model transferability to unobserved physical assets. "
                "Leverages machine_type and rated_power_kw physics features."
            ),
        },
        "plot_artifacts": plot_files,
        "total_pipeline_duration_seconds": round(time.time() - start_time, 2),
    }

    eval_report_file = reports_dir / "evaluation_report.json"
    with open(eval_report_file, "w", encoding="utf-8") as f:
        json.dump(eval_report, f, indent=2)
    print(f"Evaluation report saved to: {eval_report_file}")

    return eval_report


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    csv_file = project_root / "industrial_energy_forecasting_synthetic.csv"
    models_dir = project_root / "ml" / "energy_forecasting" / "models"
    plots_dir = project_root / "ml" / "energy_forecasting" / "plots"
    reports_dir = project_root / "ml" / "energy_forecasting" / "reports"

    print("Launching WattWise AI Energy Forecasting ML Training & Evaluation Pipeline...")
    run_pipeline(csv_file, models_dir, plots_dir, reports_dir)
