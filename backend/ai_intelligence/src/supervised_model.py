"""
Supervised Anomaly Detection Model (Model A).
Implements Baseline Dummy Classifier and Weighted Random Forest Classifier.
Pre-processing and threshold tuning are strictly fitted on training/validation data.
"""

from typing import Dict, Any, Tuple, Optional, List
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline
from sklearn.metrics import precision_recall_fscore_support, f1_score

from .preprocessing import build_preprocessor, CATEGORICAL_FEATURES, SENSOR_NUMERIC_FEATURES
from .feature_engineering import ENGINEERED_NUMERIC_FEATURES


class SupervisedAnomalyClassifier:
    """
    Random Forest Anomaly Classifier with class weighting and calibrated decision threshold.
    """

    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: Optional[int] = 16,
        class_weight: str = "balanced",
        random_state: int = 42,
        decision_threshold: float = 0.50,
    ):
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.class_weight = class_weight
        self.random_state = random_state
        self.decision_threshold = decision_threshold
        self.pipeline: Optional[Pipeline] = None
        self.feature_names_: List[str] = []
        self.is_fitted: bool = False

    def build_pipeline(self, numeric_features: List[str], categorical_features: List[str]) -> Pipeline:
        preprocessor = build_preprocessor(
            categorical_cols=categorical_features,
            numeric_cols=numeric_features,
        )
        classifier = RandomForestClassifier(
            n_estimators=self.n_estimators,
            max_depth=self.max_depth,
            class_weight=self.class_weight,
            random_state=self.random_state,
            n_jobs=-1,
        )
        return Pipeline(steps=[("preprocessor", preprocessor), ("classifier", classifier)])

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        numeric_features: Optional[List[str]] = None,
        categorical_features: Optional[List[str]] = None,
    ) -> "SupervisedAnomalyClassifier":
        if categorical_features is None:
            cat_cols = [c for c in X_train.columns if X_train[c].dtype == "object" or X_train[c].dtype.name == "category"]
        else:
            cat_cols = [c for c in categorical_features if c in X_train.columns]

        if numeric_features is None:
            num_cols = [c for c in X_train.columns if c not in cat_cols]
        else:
            num_cols = [c for c in numeric_features if c in X_train.columns]

        self.feature_names_ = cat_cols + num_cols
        self.pipeline = self.build_pipeline(numeric_features=num_cols, categorical_features=cat_cols)
        self.pipeline.fit(X_train[self.feature_names_], y_train)
        self.is_fitted = True
        return self


    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        if not self.is_fitted or self.pipeline is None:
            raise RuntimeError("Model is not fitted yet.")
        return self.pipeline.predict_proba(X[self.feature_names_])[:, 1]

    def predict(self, X: pd.DataFrame, threshold: Optional[float] = None) -> np.ndarray:
        t = threshold if threshold is not None else self.decision_threshold
        proba = self.predict_proba(X)
        return (proba >= t).astype(int)

    def tune_threshold(
        self,
        X_val: pd.DataFrame,
        y_val: pd.Series,
        metric: str = "f1",
    ) -> Dict[str, Any]:
        """
        Sweep threshold values on validation data to maximize F1-score.
        """
        proba_val = self.predict_proba(X_val)
        thresholds = np.linspace(0.10, 0.90, 81)
        best_threshold = 0.50
        best_f1 = -1.0
        best_precision = 0.0
        best_recall = 0.0

        for t in thresholds:
            preds = (proba_val >= t).astype(int)
            p, r, f1, _ = precision_recall_fscore_support(y_val, preds, average="binary", zero_division=0)
            if f1 > best_f1:
                best_f1 = f1
                best_threshold = float(t)
                best_precision = float(p)
                best_recall = float(r)

        self.decision_threshold = best_threshold
        return {
            "optimal_threshold": round(best_threshold, 3),
            "val_f1": round(best_f1, 4),
            "val_precision": round(best_precision, 4),
            "val_recall": round(best_recall, 4),
        }

    def get_feature_importances(self) -> pd.DataFrame:
        if not self.is_fitted or self.pipeline is None:
            raise RuntimeError("Model is not fitted.")
        
        clf = self.pipeline.named_steps["classifier"]
        prep = self.pipeline.named_steps["preprocessor"]
        
        try:
            num_names = prep.transformers_[0][2]
            cat_names = list(prep.transformers_[1][1].named_steps["onehot"].get_feature_names_out(prep.transformers_[1][2]))
            all_names = list(num_names) + cat_names
            importances = clf.feature_importances_
            fi_df = pd.DataFrame({"feature": all_names, "importance": importances})
            return fi_df.sort_values(by="importance", ascending=False).reset_index(drop=True)
        except Exception:
            return pd.DataFrame({"feature": self.feature_names_, "importance": clf.feature_importances_[:len(self.feature_names_)]})


def train_dummy_baseline(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    strategy: str = "most_frequent",
) -> DummyClassifier:
    """Train simple baseline classifier for honest benchmark comparison."""
    dummy = DummyClassifier(strategy=strategy, random_state=42)
    dummy.fit(X_train, y_train)
    return dummy
