"""
WattWise AI — Energy Forecasting Evaluation Module
Calculates MAE, RMSE, R², WAPE, and sMAPE overall and by segments.
Generates evaluation plots (actual vs predicted, residuals, machine-type comparisons).
"""

from pathlib import Path
from typing import Dict, Optional
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """
    Computes regression metrics for energy forecasting:
    - MAE (kWh)
    - RMSE (kWh)
    - R²
    - WAPE (%): Weighted Absolute Percentage Error (handles zeros safely: sum(|e|) / sum(y))
    - sMAPE (%): Symmetric Mean Absolute Percentage Error with epsilon
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    # Clean non-finite values if any
    mask = np.isfinite(y_true) & np.isfinite(y_pred)
    y_true = y_true[mask]
    y_pred = y_pred[mask]

    if len(y_true) == 0:
        return {"mae": 0.0, "rmse": 0.0, "r2": 0.0, "wape_pct": 0.0, "smape_pct": 0.0, "sample_count": 0}

    mae = float(mean_absolute_error(y_true, y_pred))
    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    r2 = float(r2_score(y_true, y_pred))

    sum_true = float(np.sum(np.abs(y_true)))
    sum_abs_err = float(np.sum(np.abs(y_true - y_pred)))
    wape = (sum_abs_err / sum_true * 100.0) if sum_true > 1e-6 else 0.0

    denom = np.abs(y_true) + np.abs(y_pred) + 1e-6
    smape = float(np.mean(2.0 * np.abs(y_pred - y_true) / denom) * 100.0)

    return {
        "mae_kwh": round(mae, 4),
        "rmse_kwh": round(rmse, 4),
        "r2_score": round(r2, 4),
        "wape_pct": round(wape, 2),
        "smape_pct": round(smape, 2),
        "sample_count": len(y_true),
    }


def evaluate_segments(
    df: pd.DataFrame,
    y_true_col: str,
    y_pred_col: str,
    segment_col: str,
) -> Dict[str, Dict[str, float]]:
    """Evaluates metrics grouped by a segmentation column (e.g., machine_type, machine_id)."""
    results = {}
    for seg_val, group in df.groupby(segment_col):
        m = compute_metrics(group[y_true_col].values, group[y_pred_col].values)
        results[str(seg_val)] = m
    return results


def generate_evaluation_plots(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    df_eval: pd.DataFrame,
    output_dir: Path,
    model_name: str = "HistGradientBoosting",
    sample_size: int = 4000,
) -> Dict[str, str]:
    """Generates actual vs. predicted, residual distribution, and machine-type comparison plots."""
    output_dir.mkdir(parents=True, exist_ok=True)
    plot_files = {}

    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    # Subsample for clear scatter visualization
    n_total = len(y_true)
    if n_total > sample_size:
        np.random.seed(42)
        idx = np.random.choice(n_total, sample_size, replace=False)
        yt_sub, yp_sub = y_true[idx], y_pred[idx]
    else:
        yt_sub, yp_sub = y_true, y_pred

    # 1. Actual vs. Predicted Plot
    fig, ax = plt.subplots(figsize=(7, 6), dpi=150)
    ax.scatter(yt_sub, yp_sub, alpha=0.25, color="#10b981", edgecolors="none", s=18, label="Test Samples")
    max_val = max(float(np.percentile(yt_sub, 99.5)), float(np.percentile(yp_sub, 99.5)), 5.0)
    ax.plot([0, max_val], [0, max_val], "r--", linewidth=1.5, label="Ideal 1:1 Parity")
    ax.set_xlim(-0.1, max_val * 1.05)
    ax.set_ylim(-0.1, max_val * 1.05)
    ax.set_xlabel("Actual Next 15-min Energy (kWh)", fontsize=11, fontweight="bold")
    ax.set_ylabel("Predicted Next 15-min Energy (kWh)", fontsize=11, fontweight="bold")
    ax.set_title(f"Actual vs. Predicted 15-Min Energy\n({model_name} on Test Set)", fontsize=12, fontweight="bold")
    ax.grid(True, linestyle=":", alpha=0.5)
    ax.legend(loc="upper left")
    plt.tight_layout()
    scatter_path = output_dir / "actual_vs_predicted.png"
    plt.savefig(scatter_path)
    plt.close()
    plot_files["actual_vs_predicted"] = str(scatter_path)

    # 2. Residual Distribution Plot
    residuals = y_pred - y_true
    fig, ax = plt.subplots(figsize=(7, 5), dpi=150)
    ax.hist(residuals, bins=60, color="#6366f1", edgecolor="black", alpha=0.75, density=True)
    ax.axvline(0, color="red", linestyle="--", linewidth=1.5, label="Zero Error")
    ax.axvline(float(np.mean(residuals)), color="orange", linestyle=":", linewidth=1.5,
               label=f"Mean Error: {np.mean(residuals):.3f} kWh")
    ax.set_xlabel("Residual Error (Predicted - Actual, kWh)", fontsize=11, fontweight="bold")
    ax.set_ylabel("Density", fontsize=11, fontweight="bold")
    ax.set_title(f"Residual Error Distribution\n({model_name} on Test Set)", fontsize=12, fontweight="bold")
    ax.set_xlim(-4, 4)
    ax.grid(True, linestyle=":", alpha=0.5)
    ax.legend(loc="upper left")
    plt.tight_layout()
    residual_path = output_dir / "residual_distribution.png"
    plt.savefig(residual_path)
    plt.close()
    plot_files["residual_distribution"] = str(residual_path)

    # 3. MAE by Machine Type
    if "machine_type" in df_eval.columns:
        type_maes = {}
        for m_type, grp in df_eval.groupby("machine_type"):
            type_maes[m_type] = float(mean_absolute_error(grp["y_true"], grp["y_pred"]))

        sorted_types = sorted(type_maes.items(), key=lambda x: x[1], reverse=True)
        names = [k for k, _ in sorted_types]
        vals = [v for _, v in sorted_types]

        fig, ax = plt.subplots(figsize=(9, 5), dpi=150)
        bars = ax.barh(names, vals, color="#0284c7", edgecolor="black", alpha=0.85)
        ax.set_xlabel("Mean Absolute Error (kWh)", fontsize=11, fontweight="bold")
        ax.set_title("Test Set MAE by Machine Type", fontsize=12, fontweight="bold")
        ax.grid(True, axis="x", linestyle=":", alpha=0.5)
        for bar in bars:
            width = bar.get_width()
            ax.text(width + 0.01, bar.get_y() + bar.get_height() / 2, f"{width:.3f}",
                    va="center", ha="left", fontsize=9, fontweight="bold")
        plt.tight_layout()
        type_path = output_dir / "metrics_by_machine_type.png"
        plt.savefig(type_path)
        plt.close()
        plot_files["metrics_by_machine_type"] = str(type_path)

    return plot_files
