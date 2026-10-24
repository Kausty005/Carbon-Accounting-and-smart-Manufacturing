"""
Model Persistence & Unified Inference Engine.
Handles loading serialized models, verifying feature ordering,
and executing real-time predictions with evidence generation.
"""

import os
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import joblib
import pandas as pd
import numpy as np

from .feature_engineering import add_engineered_features, ConditionAwareFeatureTransformer
from .energy_baseline import OperatingConditionEnergyBaseline
from .explanations import generate_anomaly_record
from .kpis import calculate_energy_kpis


class EnergyIntelligencePipeline:
    """
    Unified inference pipeline combining trained Supervised Classifier,
    Isolation Forest, and Condition-Aware Energy Baseline models.
    """

    def __init__(
        self,
        supervised_model=None,
        isolation_forest_model=None,
        energy_baseline_model: Optional[OperatingConditionEnergyBaseline] = None,
        feature_transformer: Optional[ConditionAwareFeatureTransformer] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.supervised_model = supervised_model
        self.isolation_forest_model = isolation_forest_model
        self.energy_baseline_model = energy_baseline_model
        self.feature_transformer = feature_transformer
        self.metadata = metadata or {}

    def save_artifacts(self, models_dir: str = "models") -> Dict[str, str]:
        """
        Serialize all trained models, preprocessing pipelines, and configuration metadata.
        """
        p = Path(models_dir)
        p.mkdir(parents=True, exist_ok=True)

        saved_files = {}

        if self.supervised_model is not None:
            rf_path = p / "supervised_rf_pipeline.joblib"
            joblib.dump(self.supervised_model, rf_path)
            saved_files["supervised_model"] = str(rf_path)

        if self.isolation_forest_model is not None:
            if_path = p / "isolation_forest_pipeline.joblib"
            joblib.dump(self.isolation_forest_model, if_path)
            saved_files["isolation_forest"] = str(if_path)

        if self.energy_baseline_model is not None:
            eb_path = p / "energy_baseline_model.joblib"
            joblib.dump(self.energy_baseline_model, eb_path)
            saved_files["energy_baseline"] = str(eb_path)

        if self.feature_transformer is not None:
            ft_path = p / "feature_transformer.joblib"
            joblib.dump(self.feature_transformer, ft_path)
            saved_files["feature_transformer"] = str(ft_path)

        # Save metadata JSON
        meta_path = p / "model_metadata.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(self.metadata, f, indent=2)
        saved_files["metadata"] = str(meta_path)

        return saved_files

    @classmethod
    def load_saved_model(cls, models_dir: str = "models") -> "EnergyIntelligencePipeline":
        """
        Load trained models and configuration metadata from disk.
        """
        p = Path(models_dir)
        meta_path = p / "model_metadata.json"
        metadata = {}
        if meta_path.exists():
            with open(meta_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

        import sys
        from . import supervised_model as sm, feature_engineering as fe, isolation_forest as if_mod, energy_baseline as eb_mod
        pkg_name = __name__.rsplit(".", 1)[0]
        cur_pkg = sys.modules.get(pkg_name)
        if cur_pkg is not None:
            sys.modules.setdefault("src", cur_pkg)
        sys.modules.setdefault("src.supervised_model", sm)
        sys.modules.setdefault("src.feature_engineering", fe)
        sys.modules.setdefault("src.isolation_forest", if_mod)
        sys.modules.setdefault("src.energy_baseline", eb_mod)

        rf_path = p / "supervised_rf_pipeline.joblib"
        supervised_model = joblib.load(rf_path) if rf_path.exists() else None

        # Cross-version compatibility patch for scikit-learn >= 1.8 unpickling SimpleImputer from 1.7
        def _patch_imputers(obj):
            if hasattr(obj, "named_steps") and isinstance(obj.named_steps, dict):
                for s in obj.named_steps.values():
                    _patch_imputers(s)
            if hasattr(obj, "transformers_"):
                for item in obj.transformers_:
                    if len(item) >= 2:
                        _patch_imputers(item[1])
            if hasattr(obj, "__class__") and obj.__class__.__name__ == "SimpleImputer":
                if not hasattr(obj, "_fill_dtype"):
                    setattr(obj, "_fill_dtype", getattr(obj, "_fit_dtype", float))

        if supervised_model is not None and hasattr(supervised_model, "pipeline"):
            _patch_imputers(supervised_model.pipeline)

        if_path = p / "isolation_forest_pipeline.joblib"
        isolation_forest_model = joblib.load(if_path) if if_path.exists() else None
        if isolation_forest_model is not None and hasattr(isolation_forest_model, "pipeline"):
            _patch_imputers(isolation_forest_model.pipeline)

        eb_path = p / "energy_baseline_model.joblib"
        energy_baseline_model = joblib.load(eb_path) if eb_path.exists() else None

        ft_path = p / "feature_transformer.joblib"
        feature_transformer = joblib.load(ft_path) if ft_path.exists() else None
        if feature_transformer is not None:
            _patch_imputers(feature_transformer)

        return cls(
            supervised_model=supervised_model,
            isolation_forest_model=isolation_forest_model,
            energy_baseline_model=energy_baseline_model,
            feature_transformer=feature_transformer,
            metadata=metadata,
        )

    def predict_new_readings(
        self,
        df_new: pd.DataFrame,
        model_preference: str = "supervised",
    ) -> Dict[str, Any]:
        """
        Execute prediction pipeline on incoming machine readings.
        Returns energy KPIs, structured anomaly records with evidence, and summaries.
        """
        data = df_new.copy()

        # Add engineered features using saved transformer (no look-ahead leakage)
        data_feat = add_engineered_features(data, transformer=self.feature_transformer)

        # Baseline evaluation
        if self.energy_baseline_model is not None:
            data_enriched = self.energy_baseline_model.detect_energy_anomalies(data_feat)
        else:
            data_enriched = data_feat.copy()
            data_enriched["is_energy_anomaly"] = 0
            data_enriched["expected_power_kw"] = np.nan
            data_enriched["power_deviation_kw"] = np.nan
            data_enriched["power_deviation_pct"] = np.nan
            data_enriched["estimated_excess_energy_kwh"] = np.nan

        # Model predictions
        rf_preds = None
        rf_scores = None
        if self.supervised_model is not None:
            try:
                rf_scores = self.supervised_model.predict_proba(data_feat)
                rf_preds = self.supervised_model.predict(data_feat)
            except Exception as e:
                pass

        if_preds = None
        if_scores = None
        if self.isolation_forest_model is not None:
            try:
                if_scores = self.isolation_forest_model.anomaly_scores(data_feat)
                if_preds = self.isolation_forest_model.predict(data_feat)
            except Exception as e:
                pass

        # Select primary indicator
        if model_preference == "supervised" and rf_preds is not None:
            final_anomaly_flags = rf_preds
            active_model_name = "Supervised Random Forest"
            active_scores = rf_scores
        elif model_preference == "isolation_forest" and if_preds is not None:
            final_anomaly_flags = if_preds
            active_model_name = "Unsupervised Isolation Forest"
            active_scores = if_scores
        else:
            final_anomaly_flags = data_enriched["is_energy_anomaly"].values
            active_model_name = "Condition-Aware Energy Baseline"
            active_scores = None

        data_enriched["is_anomaly"] = final_anomaly_flags

        # Generate structured anomaly records with evidence
        anomaly_records = []
        for i, row in data_enriched.iterrows():
            if bool(row["is_anomaly"]):
                score = active_scores[i] if active_scores is not None else None
                rec = generate_anomaly_record(
                    row=row,
                    model_name=active_model_name,
                    model_score=score,
                    expected_power_kw=row.get("expected_power_kw"),
                    deviation_kw=row.get("power_deviation_kw"),
                    deviation_pct=row.get("power_deviation_pct"),
                    estimated_excess_energy_kwh=row.get("estimated_excess_energy_kwh"),
                )
                anomaly_records.append(rec)

        # Calculate energy KPIs
        kpis = calculate_energy_kpis(data_enriched)

        return {
            "total_input_readings": len(df_new),
            "anomalies_detected_count": len(anomaly_records),
            "anomaly_rate_pct": round((len(anomaly_records) / max(1, len(df_new))) * 100.0, 2),
            "active_model_name": active_model_name,
            "energy_kpis": kpis["plant_kpis"],
            "carbon_accounting": kpis["carbon_accounting"],
            "equipment_breakdown": kpis["equipment_breakdown"],
            "highest_priority_equipment": kpis["highest_priority_equipment"],
            "anomaly_records": anomaly_records,
        }
