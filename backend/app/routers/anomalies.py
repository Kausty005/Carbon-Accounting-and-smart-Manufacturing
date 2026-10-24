"""
WattWise AI — Anomaly Intelligence & Industrial Incident Management Router.
Endpoints:
  GET   /api/health
  GET   /api/dashboard/summary
  GET   /api/anomalies
  GET   /api/anomalies/{incident_id}
  PATCH /api/anomalies/{incident_id}/status
  POST  /api/anomalies/{incident_id}/report
  GET   /api/equipment/registry
  POST  /api/upload-telemetry
  POST  /api/telemetry/upload
  POST  /predict
  GET   /reports/summary
"""

import io
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.ai_intelligence.src.incident_report_generator import (
    generate_docx_incident_report,
    generate_pdf_incident_report,
)
from backend.ai_intelligence.src.incident_store import IncidentStore
from backend.ai_intelligence.src.inference import EnergyIntelligencePipeline

router = APIRouter(tags=["AI Anomaly Intelligence"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent / "ai_intelligence"

# Lazy singletons
_pipeline: Optional[EnergyIntelligencePipeline] = None
_incident_store: Optional[IncidentStore] = None


def get_pipeline() -> EnergyIntelligencePipeline:
    global _pipeline
    if _pipeline is None:
        models_dir = str(BASE_DIR / "models")
        _pipeline = EnergyIntelligencePipeline.load_saved_model(models_dir=models_dir)
    return _pipeline


def get_incident_store() -> IncidentStore:
    global _incident_store
    if _incident_store is None:
        _incident_store = IncidentStore()
    return _incident_store


# ------------------------------------------------------------------------------
# Pydantic Schemas
# ------------------------------------------------------------------------------

class StatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Status: 'New', 'Investigating', 'Resolved', 'False Positive'")
    technician_notes: Optional[str] = Field(None, description="Investigative notes entered by technician")
    resolution_notes: Optional[str] = Field(None, description="Resolution confirmation notes")


class MachineReading(BaseModel):
    reading_id: Optional[str] = "R_LIVE"
    timestamp: str = Field(..., description="ISO 8601 or YYYY-MM-DD HH:MM:SS timestamp")
    equipment_id: str = Field(..., description="Equipment identifier e.g. FURNACE-01")
    operating_mode: str = Field(..., description="Operating mode e.g. normal")
    temperature_c: Optional[float] = 110.0
    vibration_mm_s: Optional[float] = 0.22
    pressure_kpa: Optional[float] = 150.0
    motor_rpm: Optional[float] = 2950.0
    flow_rate_lpm: Optional[float] = 27.0
    power_consumption_kw: Optional[float] = 49.0
    coolant_temp_c: Optional[float] = 25.0
    acoustic_level_db: Optional[float] = 73.0
    oil_viscosity_cst: Optional[float] = 75.0
    humidity_pct: Optional[float] = 55.0
    ambient_temp_c: Optional[float] = 22.0
    equipment_age_hours: Optional[float] = 2500.0
    hours_since_maintenance: Optional[float] = 120.0


class PredictionRequest(BaseModel):
    readings: List[MachineReading]
    preference: str = "supervised"


# ------------------------------------------------------------------------------
# API Endpoints
# ------------------------------------------------------------------------------

@router.get("/api/health")
def ai_health_check():
    """AI Anomaly Intelligence health check."""
    store = get_incident_store()
    pipeline = get_pipeline()
    return {
        "status": "healthy",
        "service": "ai_anomaly_intelligence",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "models_loaded": pipeline.supervised_model is not None,
        "total_incidents_tracked": len(store.incidents),
    }


@router.get("/api/dashboard/summary")
def get_dashboard_summary():
    """Retrieve high-level dashboard KPIs, breakdown charts, and telemetry distributions."""
    store = get_incident_store()
    return store.get_dashboard_summary()


@router.get("/api/anomalies")
def list_anomalies(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID e.g. AIR-COMP-01"),
    anomaly_type: Optional[str] = Query(None, description="Filter by anomaly mechanism e.g. pressure_leak"),
    severity: Optional[str] = Query(None, description="Filter by severity: critical, high, medium, low"),
    status: Optional[str] = Query(None, description="Filter by status: New, Investigating, Resolved, False Positive"),
    search: Optional[str] = Query(None, description="Free text search in ID, evidence, equipment"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    """
    List anomaly incidents with multi-faceted filtering, search, and pagination.
    """
    store = get_incident_store()
    return store.list_incidents(
        equipment_id=equipment_id,
        anomaly_type=anomaly_type,
        severity=severity,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get("/api/anomalies/{incident_id}")
def get_incident_details(incident_id: str):
    """
    Fetch comprehensive anomaly details, sensor readings, and 30-min pre/post telemetry trend points.
    """
    store = get_incident_store()
    inc = store.get_incident(incident_id)
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found.",
        )

    telemetry_window = store.get_telemetry_window(
        equipment_id=inc["equipment_id"],
        center_timestamp=inc["timestamp"],
        window_minutes=30,
    )

    return {
        **inc,
        "incident": inc,
        "telemetry_window": telemetry_window,
    }


@router.patch("/api/anomalies/{incident_id}/status")
def update_incident_status(incident_id: str, payload: StatusUpdateRequest):
    """
    Update investigation status and technician resolution notes with file persistence.
    """
    valid_statuses = ["New", "Investigating", "Resolved", "False Positive"]
    if payload.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{payload.status}'. Must be one of: {valid_statuses}",
        )

    store = get_incident_store()
    updated = store.update_incident_status(
        incident_id=incident_id,
        status=payload.status,
        technician_notes=payload.technician_notes,
        resolution_notes=payload.resolution_notes,
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found.",
        )

    return {"message": "Incident status updated successfully", "incident": updated}


@router.post("/api/anomalies/{incident_id}/report")
def download_incident_report(
    incident_id: str,
    format: str = Query("pdf", pattern="^(pdf|docx)$", description="Report format: 'pdf' or 'docx'"),
):
    """
    Generate and stream a genuine, downloadable PDF or Word (.docx) incident report.
    """
    store = get_incident_store()
    inc = store.get_incident(incident_id)
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with ID '{incident_id}' not found.",
        )

    telemetry_window = store.get_telemetry_window(
        equipment_id=inc["equipment_id"],
        center_timestamp=inc["timestamp"],
        window_minutes=30,
    )

    eq_safe = re.sub(r"[^A-Za-z0-9_-]", "", inc.get("equipment_id", "EQ"))
    ts_safe = str(inc.get("timestamp", "")).replace(":", "").replace("-", "").replace("T", "_")[:15]
    reports_temp_dir = BASE_DIR / "reports" / "generated_downloads"
    reports_temp_dir.mkdir(parents=True, exist_ok=True)

    if format.lower() == "pdf":
        file_name = f"incident_{eq_safe}_{ts_safe}.pdf"
        out_path = reports_temp_dir / file_name
        generate_pdf_incident_report(inc, telemetry_window, out_path)
        return FileResponse(
            path=str(out_path),
            media_type="application/pdf",
            filename=file_name,
        )
    elif format.lower() == "docx":
        file_name = f"incident_{eq_safe}_{ts_safe}.docx"
        out_path = reports_temp_dir / file_name
        generate_docx_incident_report(inc, telemetry_window, out_path)
        return FileResponse(
            path=str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file_name,
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported report format. Must be 'pdf' or 'docx'.")


@router.get("/api/equipment/registry")
def get_equipment_registry():
    """Retrieve equipment specifications, sensors, and operating thresholds."""
    reg_path = BASE_DIR / "data" / "synthetic_v1" / "equipment_registry.json"
    if not reg_path.exists():
        raise HTTPException(status_code=404, detail="Equipment registry file not found.")
    with open(reg_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/api/upload-telemetry")
@router.post("/api/telemetry/upload")
async def upload_telemetry(
    file: UploadFile = File(...),
    equipment_type: Optional[str] = Form(None),
):
    """
    Validated ingestion path for user-supplied telemetry files (CSV or Excel).
    """
    filename = file.filename or "upload.csv"
    ext = Path(filename).suffix.lower()
    if ext not in [".csv", ".xlsx", ".xls"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Upload must be a .csv, .xlsx, or .xls file.",
        )

    content = await file.read()
    try:
        if ext == ".csv":
            df = pd.read_csv(io.BytesIO(content))
        else:
            df = pd.read_excel(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse tabular file: {str(e)}",
        )

    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded dataset is empty (0 rows).")

    validation_errors = []
    warnings = []

    required_cols = ["timestamp", "equipment_id", "power_consumption_kw", "operating_mode"]
    missing_required = [c for c in required_cols if c not in df.columns]
    if missing_required:
        validation_errors.append(f"Missing mandatory telemetry column(s): {missing_required}. Required: {required_cols}")

    if "timestamp" in df.columns:
        parsed_ts = pd.to_datetime(df["timestamp"], errors="coerce")
        bad_ts_count = parsed_ts.isna().sum()
        if bad_ts_count > 0:
            validation_errors.append(f"Timestamp column contains {bad_ts_count} invalid or unparseable date strings.")
        else:
            df["timestamp"] = parsed_ts

    if "power_consumption_kw" in df.columns:
        power_numeric = pd.to_numeric(df["power_consumption_kw"], errors="coerce")
        nan_power = power_numeric.isna().sum()
        if nan_power > 0:
            validation_errors.append(f"power_consumption_kw contains {nan_power} null or non-numeric values.")
        elif (power_numeric < 0).any():
            validation_errors.append("Negative active power values detected (electrical power cannot be negative).")
        else:
            df["power_consumption_kw"] = power_numeric

    reg_path = BASE_DIR / "data" / "synthetic_v1" / "equipment_registry.json"
    equipment_registry = {}
    if reg_path.exists():
        with open(reg_path, "r", encoding="utf-8") as rf:
            equipment_registry = json.load(rf).get("equipment_registry", {})

    eq_ids = df["equipment_id"].dropna().unique() if "equipment_id" in df.columns else []
    for eq_id in eq_ids:
        eq_meta = equipment_registry.get(eq_id)
        if eq_meta:
            req_sensors = eq_meta.get("required_sensors", [])
            missing_sensors = [s for s in req_sensors if s not in df.columns]
            if missing_sensors:
                warnings.append(f"Equipment '{eq_id}' missing recommended sensor(s): {missing_sensors}.")

    leakage_columns = [
        "is_anomaly", "anomaly_type", "alert_code", "root_cause",
        "severity", "incident_id", "label", "is_fault", "failure"
    ]
    detected_leakage = [c for c in leakage_columns if c in df.columns]
    if detected_leakage:
        df = df.drop(columns=detected_leakage)
        warnings.append(
            f"Ground-truth label columns {detected_leakage} stripped to prevent model feature leakage."
        )

    if validation_errors:
        return {
            "valid": False,
            "success": False,
            "filename": filename,
            "row_count": len(df),
            "errors": validation_errors,
            "warnings": warnings,
        }

    pipeline = get_pipeline()
    ml_results = pipeline.predict_new_readings(df, model_preference="supervised")

    upload_dir = BASE_DIR / "data" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    ts_stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    saved_upload_path = upload_dir / f"upload_{ts_stamp}_{filename}"
    df.to_csv(saved_upload_path, index=False)

    store = get_incident_store()
    new_incidents_count = 0
    anomalies_detected = ml_results.get("detected_anomalies", [])

    for anom in anomalies_detected:
        inc_id = f"INC-UP-{anom.get('equipment_id', 'EQ')}-{ts_stamp}_{new_incidents_count:03d}"
        sensor_data = {}
        for col in df.columns:
            if col not in ["timestamp", "equipment_id", "operating_mode"]:
                val = anom.get(col)
                if val is not None and not pd.isna(val):
                    sensor_data[col] = float(val) if isinstance(val, (int, float, np.number)) else str(val)

        excess_kwh = anom.get("estimated_excess_energy_kwh")
        if excess_kwh is not None:
            excess_kwh = round(float(excess_kwh), 2)

        incident_obj = {
            "incident_id": inc_id,
            "timestamp": str(anom.get("timestamp")),
            "equipment_id": str(anom.get("equipment_id")),
            "operating_mode": str(anom.get("operating_mode", "normal")),
            "anomaly_type": str(anom.get("anomaly_type", "operational_deviation")),
            "detection_method": str(anom.get("detection_method", "AI Model")),
            "model_name": str(anom.get("model_name", "Supervised RF")),
            "model_score": float(anom.get("model_score", 0.85)),
            "confidence": float(anom.get("model_score", 0.85)),
            "severity": str(anom.get("severity", "medium")),
            "status": "New",
            "actual_power_kw": round(float(anom.get("actual_power_kw", anom.get("power_consumption_kw", 0))), 2),
            "expected_power_kw": round(float(anom.get("expected_power_kw", anom.get("power_consumption_kw", 0))), 2),
            "deviation_kw": round(float(anom.get("deviation_kw", 0.0)), 2),
            "deviation_pct": round(float(anom.get("deviation_pct", 0.0)), 1),
            "estimated_excess_energy_kwh": excess_kwh,
            "evidence": anom.get("evidence", [f"Anomaly flagged by {anom.get('model_name', 'model')}."]),
            "possible_causes": anom.get("possible_causes", ["Operating parameters outside nominal baseline."]),
            "recommended_action": anom.get("recommended_action", "Inspect machine telemetry and verify operating conditions."),
            "sensor_readings": sensor_data,
            "data_provenance": "user_uploaded_telemetry",
            "source_file": filename,
        }
        store.incidents.insert(0, incident_obj)
        new_incidents_count += 1

    if new_incidents_count > 0:
        store.save_incidents()

    return {
        "valid": True,
        "success": True,
        "filename": filename,
        "saved_path": str(saved_upload_path),
        "row_count": len(df),
        "equipments_detected": list(df["equipment_id"].unique()),
        "incidents_created": new_incidents_count,
        "warnings": warnings,
        "kpis": ml_results.get("kpis", {}),
    }


# ------------------------------------------------------------------------------
# Backwards Compatibility Endpoints
# ------------------------------------------------------------------------------

@router.post("/predict")
def predict_readings(payload: PredictionRequest):
    """Backwards compatible prediction endpoint."""
    pipeline = get_pipeline()
    records_dict = [r.dict() for r in payload.readings]
    df = pd.DataFrame(records_dict)

    try:
        results = pipeline.predict_new_readings(df, model_preference=payload.preference)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


@router.get("/reports/summary")
def get_report_summary():
    """Retrieve precomputed model metrics and plant KPIs."""
    json_path = BASE_DIR / "reports" / "anomaly_report.json"
    if not json_path.exists():
        raise HTTPException(status_code=404, detail="Report not generated yet. Run train.py first.")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)
