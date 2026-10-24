"""
Unsupervised Anomaly Detection Model (Model B).
Implements Isolation Forest on legitimate sensor features without anomaly labels during fitting.
Threshold is calibrated on validation data only.
"""

from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.pipeline import Pipeline
from sklearn.metrics import precision_recall_fscore_support

from .preprocessing import build_preprocessor, CATEGORICAL_FEATURES, SENSOR_NUMERIC_FEATURES
from .feature_engineering import ENGINEERED_NUMERIC_FEATURES


class UnsupervisedIsolationForestDetector:
    """
    Isolation Forest Detector fitted strictly on legitimate features without labels.
    Calibrates score cutoff threshold on validation set.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        contamination: Any = "auto",
        normal_only: bool = True,
        random_state: int = 42,
    ):
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.normal_only = normal_only
        self.random_state = random_state
        self.pipeline: Optional[Pipeline] = None
        self.feature_names_: List[str] = []
        self.decision_threshold_: float = 0.0  # Cutoff: score <= threshold -> anomaly
        self.is_fitted: bool = False

    def build_pipeline(self, numeric_features: List[str], categorical_features: List[str]) -> Pipeline:
        preprocessor = build_preprocessor(
            categorical_cols=categorical_features,
            numeric_cols=numeric_features,
        )
        detector = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=-1,
        )
        return Pipeline(steps=[("preprocessor", preprocessor), ("detector", detector)])

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: Optional[pd.Series] = None,
        numeric_features: Optional[List[str]] = None,
        categorical_features: Optional[List[str]] = None,
    ) -> "UnsupervisedIsolationForestDetector":
        if categorical_features is None:
            cat_cols = [c for c in X_train.columns if X_train[c].dtype == "object" or X_train[c].dtype.name == "category"]
        else:
            cat_cols = [c for c in categorical_features if c in X_train.columns]

        if numeric_features is None:
            num_cols = [c for c in X_train.columns if c not in cat_cols]
        else:
            num_cols = [c for c in numeric_features if c in X_train.columns]

        self.feature_names_ = cat_cols + num_cols

        # Optionally filter training data to normal-only subset if labels available
        if self.normal_only and y_train is not None:
            train_mask = (y_train == 0)
            X_fit = X_train.loc[train_mask, self.feature_names_]
        else:
            X_fit = X_train[self.feature_names_]

        self.pipeline = self.build_pipeline(numeric_features=num_cols, categorical_features=cat_cols)
        self.pipeline.fit(X_fit)
        self.is_fitted = True
        return self

    def anomaly_scores(self, X: pd.DataFrame) -> np.ndarray:
        """
        Return raw decision function scores.
        Note: Lower values indicate more anomalous readings.
        """
        if not self.is_fitted or self.pipeline is None:
            raise RuntimeError("Isolation Forest is not fitted.")
        detector = self.pipeline.named_steps["detector"]
        prep = self.pipeline.named_steps["preprocessor"]
        X_prep = prep.transform(X[self.feature_names_])
        # decision_function: negative is anomaly, positive is normal
        return detector.decision_function(X_prep)

    def calibrate_threshold(
        self,
        X_val: pd.DataFrame,
        y_val: pd.Series,
    ) -> Dict[str, Any]:
        """
        Calibrate cutoff threshold on validation data.
        Rule: score <= threshold => predicted anomaly (1).
        """
        scores_val = self.anomaly_scores(X_val)
        
        # Search percentiles of score from 1st to 20th percentile
        percentiles = np.linspace(1, 20, 50)
        best_threshold = 0.0
        best_f1 = -1.0
        best_precision = 0.0
        best_recall = 0.0

        for p in percentiles:
            cand_thresh = np.percentile(scores_val, p)
            preds = (scores_val <= cand_thresh).astype(int)
            prec, rec, f1, _ = precision_recall_fscore_support(y_val, preds, average="binary", zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_threshold = float(cand_thresh)
                best_precision = float(prec)
                best_recall = float(rec)

        self.decision_threshold_ = best_threshold
        return {
            "calibrated_threshold": round(best_threshold, 4),
            "val_f1": round(best_f1, 4),
            "val_precision": round(best_precision, 4),
            "val_recall": round(best_recall, 4),
        }

    def predict(self, X: pd.DataFrame, threshold: Optional[float] = None) -> np.ndarray:
        """
        Predict binary anomalies: 1 = anomaly, 0 = normal.
        """
        t = threshold if threshold is not None else self.decision_threshold_
        scores = self.anomaly_scores(X)
        return (scores <= t).astype(int)
