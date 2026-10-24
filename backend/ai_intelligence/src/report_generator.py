"""
Report Generation & Visualization Module.
Produces machine-readable JSON, detected anomalies CSV, comprehensive Markdown report,
and rich industrial charts saved to disk.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import matplotlib
matplotlib.use("Agg")  # Non-interactive headless backend
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


class ReportGenerator:
    """
    Generates reports (JSON, CSV, Markdown) and visualizations for industrial energy intelligence.
    """

    def __init__(self, reports_dir: str = "reports", plots_dir: str = "plots"):
        self.reports_dir = Path(reports_dir)
        self.plots_dir = Path(plots_dir)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.plots_dir.mkdir(parents=True, exist_ok=True)

    def generate_json_report(
        self,
        metrics_summary: Dict[str, Any],
        kpis: Dict[str, Any],
        model_metadata: Dict[str, Any],
        sample_anomalies: List[Dict[str, Any]],
        filename: str = "anomaly_report.json",
    ) -> Path:
        """Export comprehensive machine-readable JSON report."""
        report = {
            "report_metadata": {
                "report_id": f"REP-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}",
                "generated_at": datetime.utcnow().isoformat() + "Z",
                "system": "PrecisionWorks AI Energy Intelligence",
                "version": model_metadata.get("version", "1.0.0"),
            },
            "model_metadata": model_metadata,
            "evaluation_metrics": metrics_summary,
            "energy_and_carbon_kpis": kpis,
            "sample_detected_anomalies": sample_anomalies[:50],  # Sample for JSON payload
        }

        output_path = self.reports_dir / filename
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        return output_path

    def generate_anomalies_csv(
        self,
        anomaly_records: List[Dict[str, Any]],
        filename: str = "detected_anomalies.csv",
    ) -> Path:
        """Export detected anomaly records to CSV for operational inspection."""
        rows = []
        for r in anomaly_records:
            row_copy = r.copy()
            if isinstance(row_copy.get("evidence"), list):
                row_copy["evidence"] = " | ".join(row_copy["evidence"])
            rows.append(row_copy)

        df_anom = pd.DataFrame(rows)
        output_path = self.reports_dir / filename
        df_anom.to_csv(output_path, index=False)
        return output_path

    def generate_markdown_report(
        self,
        dataset_profile: Dict[str, Any],
        metrics_summary: Dict[str, Any],
        kpis: Dict[str, Any],
        model_metadata: Dict[str, Any],
        top_anomalies: List[Dict[str, Any]],
        filename: str = "ANOMALY_DETECTION_REPORT.md",
    ) -> Path:
        """Generate human-readable engineering Markdown report."""
        output_path = self.reports_dir / filename
        
        plant_kpis = kpis.get("plant_kpis", {})
        carbon = kpis.get("carbon_accounting", {})
        eq_breakdown = kpis.get("equipment_breakdown", {})
        rf_metrics = metrics_summary.get("supervised_random_forest", {})
        if_metrics = metrics_summary.get("unsupervised_isolation_forest", {})
        eb_metrics = metrics_summary.get("energy_baseline_detector", {})

        md = f"""# AI-Driven Carbon Accounting & Intelligent Energy Management Report
**PrecisionWorks Manufacturing — Industrial Energy Anomaly Intelligence**
*Report Generated:* {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC  
*Dataset Evaluated:* {dataset_profile.get('total_rows', 0):,} records ({dataset_profile.get('timestamp_coverage', {}).get('start')} to {dataset_profile.get('timestamp_coverage', {}).get('end')})  
*Model Version:* {model_metadata.get('version', '1.0.0')} | *Selected Prototype:* {model_metadata.get('selected_model', 'Supervised Random Forest')}

---

## 1. Executive Summary & Energy KPIs

| Metric | Measured Value | Unit / Benchmark |
|---|---|---|
| **Total Measured Electricity** | {plant_kpis.get('total_measured_energy_kwh', 0):,.2f} | kWh (trapezoidal integration per equipment) |
| **Plant Average Power** | {plant_kpis.get('average_power_kw', 0):.2f} | kW |
| **Plant Peak Power** | {plant_kpis.get('peak_power_kw', 0):.2f} | kW |
| **Total Readings Evaluated** | {plant_kpis.get('total_readings', 0):,} | 1-min telemetry points |
| **Equipment Health Anomalies** | {plant_kpis.get('equipment_health_anomalies', plant_kpis.get('anomalous_readings', 0)):,} | ({plant_kpis.get('equipment_health_anomaly_rate_pct', plant_kpis.get('anomaly_rate_pct', 0)):.2f}% health anomaly rate) |
| **Excess Energy Anomalies** | {plant_kpis.get('excess_energy_anomalies', 0):,} | ({plant_kpis.get('excess_energy_anomaly_rate_pct', 0):.2f}% power excess rate) |
| **Estimated Excess Energy Waste** | {plant_kpis.get('estimated_excess_energy_kwh', 0):,.2f} | kWh (Model estimate) |
| **Estimated Financial Loss (₹8/kWh)** | ₹{plant_kpis.get('estimated_excess_energy_cost_inr', 0):,.2f} | INR ({carbon.get('electricity_tariff_used', 'INR 8.00 / kWh')}) |
| **Scope 2 Carbon Footprint** | {carbon.get('scope_2_electricity_emissions_kg_co2e', 0):,.2f} | kg CO2e ({carbon.get('grid_emission_factor_used', '')}) |
| **Avoidable Excess Emissions** | {carbon.get('scope_2_avoidable_excess_emissions_kg_co2e', 0):,.2f} | kg CO2e (Model estimate) |

> **Accounting Boundary & Estimation Note:** {carbon.get('disclaimer', carbon.get('scope_1_note', ''))}

---

## 2. Equipment-Level Breakdown & Priority Ranking

The equipment units are prioritized based on detected equipment health anomaly frequency and excess energy consumption:
**Inspection Priority:** `{" -> ".join(kpis.get('highest_priority_equipment', []))}`

| Equipment ID | Total Energy (kWh) | Energy Share (%) | Avg Power (kW) | Peak Power (kW) | Health Anomalies | Health Anom Rate (%) | Excess Energy Alerts | Excess Energy (kWh) | Financial Waste (₹) |
|---|---|---|---|---|---|---|---|---|---|
"""
        for eq_id, stats in eq_breakdown.items():
            md += f"| **{eq_id}** | {stats.get('total_energy_kwh', 0):,.1f} | {stats.get('energy_share_pct', 0):.1f}% | {stats.get('avg_power_kw', 0):.1f} | {stats.get('peak_power_kw', 0):.1f} | {stats.get('equipment_health_anomalies', stats.get('anomaly_count', 0)):,} | {stats.get('health_anomaly_rate_pct', stats.get('anomaly_rate_pct', 0)):.2f}% | {stats.get('energy_excess_anomalies', 0):,} | {stats.get('estimated_excess_energy_kwh', 0):,.1f} | ₹{stats.get('estimated_excess_cost_inr', 0):,.2f} |\n"

        md += f"""
---

## 3. Model Benchmark & Held-Out Test Evaluation

Models were evaluated on a strict **chronological held-out test period** (the final 15% of timestamped readings, never seen during training or threshold tuning):

| Model Architecture | Precision | Recall | F1-Score | False Positive Rate | ROC-AUC | PR-AUC |
|---|---|---|---|---|---|---|
| **Dummy Baseline (Most Frequent)** | {metrics_summary.get('dummy_baseline', {}).get('precision', 0):.4f} | {metrics_summary.get('dummy_baseline', {}).get('recall', 0):.4f} | {metrics_summary.get('dummy_baseline', {}).get('f1_score', 0):.4f} | {metrics_summary.get('dummy_baseline', {}).get('false_positive_rate', 0):.4f} | N/A | N/A |
| **Model A: Supervised Random Forest** | **{rf_metrics.get('precision', 0):.4f}** | **{rf_metrics.get('recall', 0):.4f}** | **{rf_metrics.get('f1_score', 0):.4f}** | **{rf_metrics.get('false_positive_rate', 0):.4f}** | **{rf_metrics.get('roc_auc', 0)}** | **{rf_metrics.get('pr_auc', 0)}** |
| **Model B: Unsupervised Isolation Forest** | {if_metrics.get('precision', 0):.4f} | {if_metrics.get('recall', 0):.4f} | {if_metrics.get('f1_score', 0):.4f} | {if_metrics.get('false_positive_rate', 0):.4f} | {if_metrics.get('roc_auc', 'N/A')} | {if_metrics.get('pr_auc', 'N/A')} |
| **Model C: Energy Baseline Detector** | {eb_metrics.get('precision', 0):.4f} | {eb_metrics.get('recall', 0):.4f} | {eb_metrics.get('f1_score', 0):.4f} | {eb_metrics.get('false_positive_rate', 0):.4f} | N/A | N/A |

### Confusion Matrix (Model A: Supervised Random Forest)
- **True Negatives (Normal correctly identified):** {rf_metrics.get('confusion_matrix', {}).get('true_negatives', 0):,}
- **False Positives (Normal falsely flagged):** {rf_metrics.get('confusion_matrix', {}).get('false_positives', 0):,}
- **False Negatives (Anomalies missed):** {rf_metrics.get('confusion_matrix', {}).get('false_negatives', 0):,}
- **True Positives (Anomalies successfully detected):** {rf_metrics.get('confusion_matrix', {}).get('true_positives', 0):,}

### Anomaly Type Detection Recall (Model A)
"""
        per_type = metrics_summary.get("rf_per_anomaly_type", {})
        for atype, tstats in per_type.items():
            md += f"- **{atype.replace('_', ' ').title()}:** {tstats.get('detected_count', 0)} / {tstats.get('total_occurrences', 0)} detected ({tstats.get('detection_rate', 0)*100:.1f}% recall)\n"

        md += f"""
---

## 4. Evidence-Based Anomaly Records (Real Model Detections)

Below are representative sample records produced by the evidence generator on held-out test telemetry:

"""
        for i, sample in enumerate(top_anomalies[:5], 1):
            md += f"""### Incident #{i}: {sample.get('equipment_id')} — {sample.get('anomaly_type').replace('_', ' ').title()} ({sample.get('severity').upper()})
- **Timestamp:** `{sample.get('timestamp')}`
- **Actual vs Expected Power:** {sample.get('actual_power_kw')} kW vs {sample.get('expected_power_kw')} kW (Deviation: {sample.get('deviation_pct')}%)
- **Model Confidence Score:** {sample.get('model_score')}
- **Evidence Trail:**
"""
            for ev in sample.get("evidence", []):
                md += f"  - *{ev}*\n"
            md += f"- **Recommended Action:** {sample.get('recommended_action')}\n\n"

        md += """---

## 5. Engineering Assumptions & Limitations

1. **Chronological Splitting:** Training on earlier 70% and testing on the latest 15% measures performance on this dataset and does not prove generalization to uncalibrated physical machines.
2. **Leakage Exclusion:** Prohibited columns (`is_anomaly`, `anomaly_type`, `rolling_anomaly_rate`, `maintenance_priority_score`, `alert_code`, `reading_id`) were strictly excluded from model feature sets.
3. **Power Baselines:** High-load operating states are treated as legitimate high-load regimes; power alerts are only generated when consumption statistically deviates within that operating regime.
4. **Scope 2 Carbon Accounting:** Relies strictly on the official CEA India National Grid Emission Factor (0.82 kg CO2e/kWh) without fabricated Scope 1 assumptions.
"""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md)

        return output_path

    def generate_visualizations(
        self,
        df_test: pd.DataFrame,
        y_test: np.ndarray,
        y_pred_rf: np.ndarray,
        y_prob_rf: Optional[np.ndarray],
        energy_df: pd.DataFrame,
        metrics_summary: Dict[str, Any],
    ) -> List[Path]:
        """Generate and save all required diagnostic and energy charts."""
        saved_plots = []
        plt.style.use("default")
        plt.rcParams.update({"font.size": 10, "figure.autolayout": True})

        # 1. Power Consumption Over Time with Anomalies Highlighted
        fig, ax = plt.subplots(figsize=(12, 5))
        sample_eq_id = "EQ-001" if "EQ-001" in df_test["equipment_id"].values else (
            "FURNACE-01" if "FURNACE-01" in df_test["equipment_id"].values else df_test["equipment_id"].iloc[0]
        )
        sample_eq = df_test[df_test["equipment_id"] == sample_eq_id].copy()
        sample_eq["ts"] = pd.to_datetime(sample_eq["timestamp"])
        sample_eq = sample_eq.sort_values("ts")
        
        ax.plot(sample_eq["ts"], sample_eq["power_consumption_kw"], label="Measured Power (kW)", color="#2563eb", alpha=0.8, lw=1.2)
        anom_mask = (sample_eq["is_anomaly"] == 1)
        ax.scatter(sample_eq.loc[anom_mask, "ts"], sample_eq.loc[anom_mask, "power_consumption_kw"], color="#dc2626", label="Detected Anomaly", s=30, zorder=5)
        ax.set_title(f"{sample_eq_id}: Power Consumption Over Time with Anomalies Highlighted")
        ax.set_xlabel("Timestamp")
        ax.set_ylabel("Power Consumption (kW)")
        ax.legend(loc="upper right")
        ax.grid(True, alpha=0.3)
        p1 = self.plots_dir / "power_consumption_anomalies.png"
        fig.savefig(p1, dpi=200)
        plt.close(fig)
        saved_plots.append(p1)

        # 2. Temperature and Vibration Trends
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 7), sharex=True)
        # Choose equipment with valid temperature
        eq_with_temp = sample_eq
        if "temperature_c" not in sample_eq.columns or sample_eq["temperature_c"].dropna().empty:
            candidates = df_test[df_test["temperature_c"].notnull()]
            if not candidates.empty:
                eq_with_temp = df_test[df_test["equipment_id"] == candidates["equipment_id"].iloc[0]].copy()
                eq_with_temp["ts"] = pd.to_datetime(eq_with_temp["timestamp"])
                eq_with_temp = eq_with_temp.sort_values("ts")

        anom_t_mask = (eq_with_temp["is_anomaly"] == 1)
        temp_vals = eq_with_temp["temperature_c"].fillna(25.0) if "temperature_c" in eq_with_temp else pd.Series(25.0, index=eq_with_temp.index)
        vib_vals = eq_with_temp["vibration_mm_s"].fillna(1.0) if "vibration_mm_s" in eq_with_temp else pd.Series(1.0, index=eq_with_temp.index)

        ax1.plot(eq_with_temp["ts"], temp_vals, color="#d97706", lw=1.2, label="Temperature (°C)")
        ax1.scatter(eq_with_temp.loc[anom_t_mask, "ts"], temp_vals.loc[anom_t_mask], color="#dc2626", s=25, label="Anomaly Point")
        ax1.set_ylabel("Temperature (°C)")
        t_id = eq_with_temp["equipment_id"].iloc[0] if "equipment_id" in eq_with_temp else sample_eq_id
        ax1.set_title(f"{t_id}: Temperature & Vibration Telemetry Trends")
        ax1.grid(True, alpha=0.3)
        ax1.legend(loc="upper right")

        ax2.plot(eq_with_temp["ts"], vib_vals, color="#7c3aed", lw=1.2, label="Vibration (mm/s)")
        ax2.scatter(eq_with_temp.loc[anom_t_mask, "ts"], vib_vals.loc[anom_t_mask], color="#dc2626", s=25, label="Anomaly Point")
        ax2.set_ylabel("Vibration (mm/s)")
        ax2.set_xlabel("Timestamp")
        ax2.grid(True, alpha=0.3)
        ax2.legend(loc="upper right")
        p2 = self.plots_dir / "sensor_trends_temperature_vibration.png"
        fig.savefig(p2, dpi=200)
        plt.close(fig)
        saved_plots.append(p2)

        # 3. Actual vs Expected Power
        fig, ax = plt.subplots(figsize=(10, 5))
        sample_energy_id = "EQ-001" if "EQ-001" in energy_df["equipment_id"].values else energy_df["equipment_id"].iloc[0]
        eq1_energy = energy_df[energy_df["equipment_id"] == sample_energy_id].head(300)
        ax.plot(range(len(eq1_energy)), eq1_energy["actual_power_kw"], label="Actual Measured Power (kW)", color="#0284c7", lw=1.5)
        ax.plot(range(len(eq1_energy)), eq1_energy["expected_power_kw"], label="Expected Condition Baseline (kW)", color="#16a34a", lw=1.5, linestyle="--")
        ax.fill_between(
            range(len(eq1_energy)),
            eq1_energy["expected_power_kw"] - eq1_energy["expected_std_kw"],
            eq1_energy["expected_power_kw"] + eq1_energy["expected_std_kw"],
            color="#16a34a",
            alpha=0.15,
            label="Baseline ±1σ Tolerance",
        )
        ax.set_title(f"Actual vs Condition-Aware Expected Power Consumption ({sample_energy_id})")
        ax.set_xlabel("Reading Index (Consecutive Intervals)")
        ax.set_ylabel("Power (kW)")
        ax.legend(loc="upper right")
        ax.grid(True, alpha=0.3)
        p3 = self.plots_dir / "actual_vs_expected_power.png"
        fig.savefig(p3, dpi=200)
        plt.close(fig)
        saved_plots.append(p3)


        # 4. Anomaly Count by Equipment
        fig, ax = plt.subplots(figsize=(8, 5))
        eq_counts = df_test.groupby("equipment_id")["is_anomaly"].sum()
        bars = ax.bar(eq_counts.index, eq_counts.values, color="#3b82f6", edgecolor="#1d4ed8")
        ax.set_title("Test Period Detected Anomalies by Equipment ID")
        ax.set_xlabel("Equipment ID")
        ax.set_ylabel("Detected Anomaly Count")
        ax.grid(axis="y", alpha=0.3)
        for b in bars:
            h = b.get_height()
            ax.annotate(f"{int(h)}", (b.get_x() + b.get_width() / 2, h + 2), ha="center", va="bottom", fontsize=9)
        p4 = self.plots_dir / "anomalies_by_equipment.png"
        fig.savefig(p4, dpi=200)
        plt.close(fig)
        saved_plots.append(p4)

        # 5. Anomaly Distribution by Type
        fig, ax = plt.subplots(figsize=(8, 5))
        type_counts = df_test[df_test["anomaly_type"] != "normal"]["anomaly_type"].value_counts()
        colors = ["#ef4444", "#f97316", "#8b5cf6", "#06b6d4"]
        bars = ax.bar(type_counts.index.str.replace("_", " ").str.title(), type_counts.values, color=colors[:len(type_counts)])
        ax.set_title("Test Period Anomaly Distribution by Ground Truth Type")
        ax.set_xlabel("Anomaly Type")
        ax.set_ylabel("Occurrence Count")
        ax.grid(axis="y", alpha=0.3)
        plt.xticks(rotation=15)
        for b in bars:
            h = b.get_height()
            ax.annotate(f"{int(h)}", (b.get_x() + b.get_width() / 2, h + 2), ha="center", va="bottom", fontsize=9)
        p5 = self.plots_dir / "anomaly_distribution_by_type.png"
        fig.savefig(p5, dpi=200)
        plt.close(fig)
        saved_plots.append(p5)

        # 6. Confusion Matrix Heatmap
        fig, ax = plt.subplots(figsize=(6, 5))
        cm = metrics_summary.get("supervised_random_forest", {}).get("confusion_matrix", {})
        cm_matrix = np.array([
            [cm.get("true_negatives", 0), cm.get("false_positives", 0)],
            [cm.get("false_negatives", 0), cm.get("true_positives", 0)],
        ])
        cax = ax.matshow(cm_matrix, cmap="Blues", alpha=0.8)
        fig.colorbar(cax)
        for i in range(2):
            for j in range(2):
                ax.text(j, i, f"{cm_matrix[i, j]:,}", ha="center", va="center", color="black", fontsize=12, fontweight="bold")
        ax.set_xticks([0, 1])
        ax.set_yticks([0, 1])
        ax.set_xticklabels(["Predicted Normal", "Predicted Anomaly"])
        ax.set_yticklabels(["Actual Normal", "Actual Anomaly"])
        ax.set_title("Confusion Matrix: Supervised Random Forest", pad=20)
        p6 = self.plots_dir / "confusion_matrix.png"
        fig.savefig(p6, dpi=200)
        plt.close(fig)
        saved_plots.append(p6)

        # 7. Precision-Recall Curve
        if y_prob_rf is not None and len(np.unique(y_test)) > 1:
            fig, ax = plt.subplots(figsize=(7, 5))
            from sklearn.metrics import precision_recall_curve, auc
            p_pts, r_pts, _ = precision_recall_curve(y_test, y_prob_rf)
            pr_auc_val = auc(r_pts, p_pts)
            ax.plot(r_pts, p_pts, color="#2563eb", lw=2, label=f"PR Curve (AUC = {pr_auc_val:.4f})")
            ax.set_title("Precision-Recall Curve (Supervised Random Forest)")
            ax.set_xlabel("Recall")
            ax.set_ylabel("Precision")
            ax.set_xlim([0.0, 1.05])
            ax.set_ylim([0.0, 1.05])
            ax.legend(loc="lower left")
            ax.grid(True, alpha=0.3)
            p7 = self.plots_dir / "precision_recall_curve.png"
            fig.savefig(p7, dpi=200)
            plt.close(fig)
            saved_plots.append(p7)

        # 8. Energy Consumption by Equipment and Operating Mode
        fig, ax = plt.subplots(figsize=(10, 5))
        energy_by_eq_mode = df_test.groupby(["equipment_id", "operating_mode"])["power_consumption_kw"].mean().unstack().fillna(0)
        energy_by_eq_mode.plot(kind="bar", stacked=True, ax=ax, colormap="viridis")
        ax.set_title("Average Power Consumption by Equipment and Operating Mode (kW)")
        ax.set_xlabel("Equipment ID")
        ax.set_ylabel("Average Power (kW)")
        ax.legend(title="Operating Mode", bbox_to_anchor=(1.02, 1), loc="upper left")
        ax.grid(axis="y", alpha=0.3)
        p8 = self.plots_dir / "energy_by_equipment_and_mode.png"
        fig.savefig(p8, dpi=200)
        plt.close(fig)
        saved_plots.append(p8)

        return saved_plots
