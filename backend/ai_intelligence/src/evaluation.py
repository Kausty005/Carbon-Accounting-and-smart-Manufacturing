"""
Evaluation Metrics & Benchmark Comparison Module.
Computes Precision, Recall, F1, False Positive Rate, ROC-AUC, PR-AUC,
Confusion Matrix, per-anomaly-type breakdown, and per-equipment metrics.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    accuracy_score,
    confusion_matrix,
    roc_auc_score,
    precision_recall_curve,
    auc,
)


def evaluate_binary_predictions(
    y_true: pd.Series,
    y_pred: np.ndarray,
    y_proba: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Compute binary classification performance metrics.
    Handles imbalanced and edge cases gracefully.
    """
    y_t = np.array(y_true).astype(int)
    y_p = np.array(y_pred).astype(int)

    prec = float(precision_score(y_t, y_p, zero_division=0))
    rec = float(recall_score(y_t, y_p, zero_division=0))
    f1 = float(f1_score(y_t, y_p, zero_division=0))
    acc = float(accuracy_score(y_t, y_p))

    cm = confusion_matrix(y_t, y_p)
    if cm.shape == (2, 2):
        tn, fp, fn, tp = cm.ravel()
        fpr = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    else:
        tn = int(cm[0, 0]) if len(cm) > 0 else 0
        fp = 0
        fn = 0
        tp = 0
        fpr = 0.0

    roc_auc = None
    pr_auc = None
    if y_proba is not None and len(np.unique(y_t)) > 1:
        try:
            roc_auc = float(roc_auc_score(y_t, y_proba))
            precision_pts, recall_pts, _ = precision_recall_curve(y_t, y_proba)
            pr_auc = float(auc(recall_pts, precision_pts))
        except Exception:
            pass

    return {
        "precision": round(prec, 4),
        "recall": round(rec, 4),
        "f1_score": round(f1, 4),
        "accuracy": round(acc, 4),
        "false_positive_rate": round(fpr, 4),
        "roc_auc": round(roc_auc, 4) if roc_auc is not None else None,
        "pr_auc": round(pr_auc, 4) if pr_auc is not None else None,
        "confusion_matrix": {
            "true_negatives": int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives": int(tp),
        },
    }


def evaluate_per_anomaly_type(
    df: pd.DataFrame,
    y_pred: np.ndarray,
) -> Dict[str, Dict[str, Any]]:
    """
    Evaluate recall and detection count for each individual anomaly type.
    """
    if "anomaly_type" not in df.columns:
        return {}

    y_p = np.array(y_pred).astype(int)
    results = {}

    for atype in df["anomaly_type"].unique():
        mask = (df["anomaly_type"] == atype)
        count = int(mask.sum())
        detected = int(y_p[mask].sum())
        detection_rate = round(detected / count, 4) if count > 0 else 0.0

        results[str(atype)] = {
            "total_occurrences": count,
            "detected_count": detected,
            "detection_rate": detection_rate,
        }

    return results


def evaluate_per_equipment(
    df: pd.DataFrame,
    y_pred: np.ndarray,
) -> Dict[str, Dict[str, Any]]:
    """
    Evaluate precision, recall, and F1 broken down by equipment ID.
    """
    if "equipment_id" not in df.columns or "is_anomaly" not in df.columns:
        return {}

    y_p = np.array(y_pred).astype(int)
    y_t = np.array(df["is_anomaly"]).astype(int)
    results = {}

    for eq in sorted(df["equipment_id"].unique()):
        mask = (df["equipment_id"] == eq)
        eq_yt = y_t[mask]
        eq_yp = y_p[mask]

        prec = float(precision_score(eq_yt, eq_yp, zero_division=0))
        rec = float(recall_score(eq_yt, eq_yp, zero_division=0))
        f1 = float(f1_score(eq_yt, eq_yp, zero_division=0))

        results[str(eq)] = {
            "total_readings": int(mask.sum()),
            "actual_anomalies": int(eq_yt.sum()),
            "predicted_anomalies": int(eq_yp.sum()),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
        }

    return results
