"""
Complete End-to-End Training & Evaluation Pipeline for Industrial Energy Anomaly Detection.
KPCL Hackathon — AI & Energy Intelligence Module
"""

import sys
import os
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
from datetime import datetime
import json
import numpy as np
import pandas as pd

# Add module root to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from src.config import get_config_dict, ESTIMATE_DISCLAIMER
from src.data_loader import load_and_validate_data, profile_dataset
from src.preprocessing import chronological_split, extract_features_and_target, LEAKAGE_COLUMNS
from src.feature_engineering import add_engineered_features, ConditionAwareFeatureTransformer
from src.supervised_model import SupervisedAnomalyClassifier, train_dummy_baseline
from src.isolation_forest import UnsupervisedIsolationForestDetector
from src.energy_baseline import OperatingConditionEnergyBaseline
from src.evaluation import evaluate_binary_predictions, evaluate_per_anomaly_type, evaluate_per_equipment
from src.explanations import generate_anomaly_record
from src.kpis import calculate_energy_kpis
from src.report_generator import ReportGenerator
from src.inference import EnergyIntelligencePipeline


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Train industrial energy anomaly intelligence pipeline.")
    parser.add_argument("--data-path", type=str, default=None, help="Path to telemetry CSV file (default: synthetic_v1).")
    args = parser.parse_args()

    print("=" * 80)
    print("KPCL HACKATHON: INDUSTRIAL ENERGY ANOMALY DETECTION & INTELLIGENCE")
    print(f"Timestamp: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 80)

    # ---------------------------------------------------------
    # STEP 1: Load and Validate Data
    # ---------------------------------------------------------
    print("\n[Step 1] Loading and validating dataset...")
    df = load_and_validate_data(args.data_path)
    print(f"Loaded {len(df):,} rows with {len(df.columns)} columns.")


    # ---------------------------------------------------------
    # STEP 2: Dataset Profile & Data Quality
    # ---------------------------------------------------------
    print("\n[Step 2] Profiling dataset & checking data quality...")
    profile = profile_dataset(df)
    print(f"- Unique equipment units: {list(profile['equipment_counts'].keys())}")
    print(f"- Operating modes: {profile['operating_modes']}")
    print(f"- Timestamp range: {profile['timestamp_coverage']['start']} to {profile['timestamp_coverage']['end']}")
    print(f"- Overall anomaly count: {profile['anomaly_distribution']['anomaly_count']} ({profile['anomaly_distribution']['anomaly_rate_pct']}%)")
    print(f"- Missing values: {profile['missing_values']}")
    print(f"- Duplicates: {profile['duplicates']}")

    # ---------------------------------------------------------
    # STEP 3: Chronological Split & Leakage-Safe Feature Engineering
    # ---------------------------------------------------------
    print("\n[Step 3] Applying chronological split (70% / 15% / 15%) and strictly causal feature engineering...")
    train_raw, val_raw, test_raw = chronological_split(df, train_pct=0.70, val_pct=0.15, test_pct=0.15)

    # Fit condition-aware transformer strictly on training data
    feat_transformer = ConditionAwareFeatureTransformer().fit(train_raw)

    train_df = add_engineered_features(train_raw, transformer=feat_transformer)
    val_df = add_engineered_features(val_raw, transformer=feat_transformer)
    test_df = add_engineered_features(test_raw, transformer=feat_transformer)

    print(f"- Train set: {len(train_df):,} rows (Anomalies: {train_df['is_anomaly'].sum():,}, {train_df['is_anomaly'].mean()*100:.2f}%)")
    print(f"- Val set:   {len(val_df):,} rows (Anomalies: {val_df['is_anomaly'].sum():,}, {val_df['is_anomaly'].mean()*100:.2f}%)")
    print(f"- Test set:  {len(test_df):,} rows (Anomalies: {test_df['is_anomaly'].sum():,}, {test_df['is_anomaly'].mean()*100:.2f}%)")

    # Extract X, y with strict leakage prevention verification
    X_train, y_train, meta_train = extract_features_and_target(train_df)
    X_val, y_val, meta_val = extract_features_and_target(val_df)
    X_test, y_test, meta_test = extract_features_and_target(test_df)

    print(f"- Verified exclusion of leakage columns: {LEAKAGE_COLUMNS}")
    print(f"- Features used in model ({len(X_train.columns)} features): {list(X_train.columns)}")

    # ---------------------------------------------------------
    # STEP 4: Train Baseline & Model A (Supervised Random Forest)
    # ---------------------------------------------------------
    print("\n[Step 4] Training Model A: Supervised Random Forest Classifier...")
    # Baseline dummy
    dummy = train_dummy_baseline(X_train, y_train)
    dummy_test_preds = dummy.predict(X_test)
    dummy_metrics = evaluate_binary_predictions(y_test, dummy_test_preds)

    # Supervised RF
    rf_model = SupervisedAnomalyClassifier(
        n_estimators=100,
        max_depth=16,
        class_weight="balanced",
        random_state=42,
    )
    rf_model.fit(X_train, y_train)
    
    # Tune threshold on validation data only
    rf_tuning = rf_model.tune_threshold(X_val, y_val)
    print(f"- Calibrated optimal decision threshold on Val set: {rf_tuning['optimal_threshold']} (Val F1: {rf_tuning['val_f1']})")

    # Evaluate on held-out test period
    rf_test_probs = rf_model.predict_proba(X_test)
    rf_test_preds = rf_model.predict(X_test)
    rf_metrics = evaluate_binary_predictions(y_test, rf_test_preds, rf_test_probs)
    print(f"- Test Metrics: Precision={rf_metrics['precision']:.4f}, Recall={rf_metrics['recall']:.4f}, F1={rf_metrics['f1_score']:.4f}, ROC-AUC={rf_metrics['roc_auc']}")

    # ---------------------------------------------------------
    # STEP 5: Train Model B (Unsupervised Isolation Forest)
    # ---------------------------------------------------------
    print("\n[Step 5] Training Model B: Unsupervised Isolation Forest...")
    if_model = UnsupervisedIsolationForestDetector(
        n_estimators=100,
        contamination="auto",
        normal_only=True,
        random_state=42,
    )
    if_model.fit(X_train, y_train)
    if_tuning = if_model.calibrate_threshold(X_val, y_val)
    print(f"- Calibrated score threshold on Val set: {if_tuning['calibrated_threshold']} (Val F1: {if_tuning['val_f1']})")

    if_test_scores = if_model.anomaly_scores(X_test)
    if_test_preds = if_model.predict(X_test)
    # Invert scores for ROC-AUC so lower raw score = higher anomaly prob
    if_metric_scores = -if_test_scores
    if_metrics = evaluate_binary_predictions(y_test, if_test_preds, if_metric_scores)
    print(f"- Test Metrics: Precision={if_metrics['precision']:.4f}, Recall={if_metrics['recall']:.4f}, F1={if_metrics['f1_score']:.4f}")

    # ---------------------------------------------------------
    # STEP 6: Fit Model C (Operating-Condition Energy Baseline)
    # ---------------------------------------------------------
    print("\n[Step 6] Fitting Model C: Condition-Aware Energy Baseline...")
    energy_baseline = OperatingConditionEnergyBaseline()
    energy_baseline.fit(train_df, normal_only=True)
    test_energy_df = energy_baseline.detect_energy_anomalies(test_df)
    eb_test_preds = test_energy_df["is_energy_anomaly"].values

    # Evaluate separately for energy anomalies vs general equipment health anomalies
    eb_metrics_vs_equipment = evaluate_binary_predictions(y_test, eb_test_preds)
    print(f"- Energy Baseline evaluated vs general equipment anomalies: Precision={eb_metrics_vs_equipment['precision']:.4f}, Recall={eb_metrics_vs_equipment['recall']:.4f}, F1={eb_metrics_vs_equipment['f1_score']:.4f}")
    print(f"- (Note: Model C detects excess power waste, not non-energy mechanical faults like bearing degradation)")

    # ---------------------------------------------------------
    # STEP 7: Granular Evaluations (by Anomaly Type & Equipment)
    # ---------------------------------------------------------
    print("\n[Step 7] Evaluating granular breakdowns...")
    rf_per_type = evaluate_per_anomaly_type(test_df, rf_test_preds)
    rf_per_eq = evaluate_per_equipment(test_df, rf_test_preds)

    print("\nModel A Detection Rates by Anomaly Type:")
    for k, v in rf_per_type.items():
        print(f"  {k:22s}: {v['detected_count']:3d} / {v['total_occurrences']:3d} ({v['detection_rate']*100:.1f}%)")

    # ---------------------------------------------------------
    # STEP 8: Energy KPIs & Explanations on Test Set
    # ---------------------------------------------------------
    print("\n[Step 8] Computing Energy KPIs & Evidence Records (Decoupled Health vs Energy Alerts)...")
    kpis = calculate_energy_kpis(test_energy_df)
    print(f"- Total Test Energy: {kpis['plant_kpis']['total_measured_energy_kwh']:,.1f} kWh")
    print(f"- Peak Power: {kpis['plant_kpis']['peak_power_kw']:.1f} kW")
    print(f"- Equipment Health Anomalies: {kpis['plant_kpis']['equipment_health_anomalies']:,} ({kpis['plant_kpis']['equipment_health_anomaly_rate_pct']}%)")
    print(f"- Excess Energy Anomalies:    {kpis['plant_kpis']['excess_energy_anomalies']:,} ({kpis['plant_kpis']['excess_energy_anomaly_rate_pct']}%)")
    print(f"- Estimated Excess Energy Waste: {kpis['plant_kpis']['estimated_excess_energy_kwh']:,.1f} kWh")
    print(f"- Financial Loss (INR 8/kWh): INR {kpis['plant_kpis']['estimated_excess_energy_cost_inr']:,.2f}")
    print(f"- Scope 2 Avoidable Carbon: {kpis['carbon_accounting']['scope_2_avoidable_excess_emissions_kg_co2e']:,.2f} kg CO2e")

    # Generate anomaly evidence records
    anomaly_records = []
    for i, row in test_energy_df.reset_index(drop=True).iterrows():
        if rf_test_preds[i] == 1 or row.get("is_energy_anomaly", 0) == 1:
            rec = generate_anomaly_record(
                row=row,
                model_name="Supervised Random Forest" if rf_test_preds[i] == 1 else "Condition-Aware Energy Baseline",
                model_score=rf_test_probs[i] if rf_test_preds[i] == 1 else None,
                expected_power_kw=row.get("expected_power_kw"),
                deviation_kw=row.get("power_deviation_kw"),
                deviation_pct=row.get("power_deviation_pct"),
                estimated_excess_energy_kwh=row.get("estimated_excess_energy_kwh"),
            )
            anomaly_records.append(rec)

    print(f"- Total Anomaly Records Generated: {len(anomaly_records)}")

    # ---------------------------------------------------------
    # STEP 9: Model Persistence & Pipeline Packaging
    # ---------------------------------------------------------
    print("\n[Step 9] Serializing trained pipeline & model metadata...")
    model_metadata = {
        "version": "1.1.0",
        "training_timestamp": datetime.utcnow().isoformat() + "Z",
        "selected_model": "Supervised Random Forest Classifier",
        "random_seed": 42,
        "feature_names": list(X_train.columns),
        "decision_threshold": rf_model.decision_threshold,
        "tuning_results": rf_tuning,
        "leakage_columns_excluded": LEAKAGE_COLUMNS,
        "configuration": get_config_dict(),
        "test_metrics": {
            "dummy_baseline": dummy_metrics,
            "supervised_random_forest": rf_metrics,
            "unsupervised_isolation_forest": if_metrics,
            "energy_baseline_detector": eb_metrics_vs_equipment,
        },
    }

    pipeline = EnergyIntelligencePipeline(
        supervised_model=rf_model,
        isolation_forest_model=if_model,
        energy_baseline_model=energy_baseline,
        feature_transformer=feat_transformer,
        metadata=model_metadata,
    )
    saved_artifacts = pipeline.save_artifacts(models_dir=str(BASE_DIR / "models"))
    for k, path in saved_artifacts.items():
        print(f"  Saved {k} -> {path}")

    # ---------------------------------------------------------
    # STEP 10: Reports & Visualizations
    # ---------------------------------------------------------
    print("\n[Step 10] Generating reports and visualizations...")
    rep_gen = ReportGenerator(
        reports_dir=str(BASE_DIR / "reports"),
        plots_dir=str(BASE_DIR / "plots"),
    )

    metrics_summary = {
        "dummy_baseline": dummy_metrics,
        "supervised_random_forest": rf_metrics,
        "unsupervised_isolation_forest": if_metrics,
        "energy_baseline_detector": eb_metrics_vs_equipment,
        "rf_per_anomaly_type": rf_per_type,
        "rf_per_equipment": rf_per_eq,
    }

    json_path = rep_gen.generate_json_report(
        metrics_summary=metrics_summary,
        kpis=kpis,
        model_metadata=model_metadata,
        sample_anomalies=anomaly_records,
    )
    csv_path = rep_gen.generate_anomalies_csv(anomaly_records)
    md_path = rep_gen.generate_markdown_report(
        dataset_profile=profile,
        metrics_summary=metrics_summary,
        kpis=kpis,
        model_metadata=model_metadata,
        top_anomalies=anomaly_records,
    )
    plots = rep_gen.generate_visualizations(
        df_test=test_df,
        y_test=y_test.values,
        y_pred_rf=rf_test_preds,
        y_prob_rf=rf_test_probs,
        energy_df=test_energy_df,
        metrics_summary=metrics_summary,
    )

    print(f"- Exported JSON report: {json_path}")
    print(f"- Exported CSV anomalies: {csv_path}")
    print(f"- Exported Markdown report: {md_path}")
    print(f"- Generated {len(plots)} diagnostic and energy plots in {BASE_DIR / 'plots'}")

    print("\n" + "=" * 80)
    print("PIPELINE EXECUTION COMPLETED SUCCESSFULLY!")
    print("=" * 80)


if __name__ == "__main__":
    main()
