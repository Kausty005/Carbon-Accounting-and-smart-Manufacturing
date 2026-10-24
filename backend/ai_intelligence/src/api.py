"""
FastAPI Service for AI Anomaly Intelligence & Incident Reporting.
Provides endpoints for the Dashboard UI, incident management, investigation status persistence,
and real-time PDF / Word DOCX incident report generation.
"""

from typing import List, Dict, Any, Optional
from pathlib import Path
import json
import re
from datetime import datetime
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Response, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .inference import EnergyIntelligencePipeline
from .incident_store import IncidentStore
from .incident_report_generator import generate_pdf_incident_report, generate_docx_incident_report

BASE_DIR = Path(__file__).resolve().parent.parent

app = FastAPI(
    title="PrecisionWorks AI Anomaly Intelligence & Incident Reporting API",
    description="Operational dashboard backend, condition baselines, and downloadable incident reports.",
    version="1.2.0",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    status: str = Field(..., example="Investigating", description="Status: 'New', 'Investigating', 'Resolved', 'False Positive'")
    technician_notes: Optional[str] = Field(None, example="Checked bearing vibration on site; lubrication replenished.")
    resolution_notes: Optional[str] = Field(None, example="Bearing relubricated and vibration returned to 0.21 mm/s.")


class MachineReading(BaseModel):
    reading_id: Optional[str] = "R_LIVE"
    timestamp: str = Field(..., example="2024-01-08 12:00:00")
    equipment_id: str = Field(..., example="EQ-001")
    operating_mode: str = Field(..., example="normal")
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

@app.get("/api/health")
@app.get("/health")
def health_check():
    """Service health check."""
    store = get_incident_store()
    return {
        "status": "healthy",
        "service": "ai_anomaly_intelligence",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "models_loaded": get_pipeline().supervised_model is not None,
        "total_incidents_tracked": len(store.incidents),
    }


@app.get("/api/dashboard/summary")
def get_dashboard_summary():
    """Retrieve high-level dashboard KPIs, breakdown charts, and telemetry trends."""
    store = get_incident_store()
    return store.get_dashboard_summary()


@app.get("/api/anomalies")
def list_anomalies(
    equipment_id: Optional[str] = Query(None, description="Filter by equipment ID e.g. EQ-001"),
    anomaly_type: Optional[str] = Query(None, description="Filter by type e.g. thermal_runaway"),
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


@app.get("/api/anomalies/{incident_id}")
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

    # Attach telemetry trend window for chart rendering
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



@app.patch("/api/anomalies/{incident_id}/status")
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


@app.post("/api/anomalies/{incident_id}/report")
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

    # Telemetry slice for report chart
    telemetry_window = store.get_telemetry_window(
        equipment_id=inc["equipment_id"],
        center_timestamp=inc["timestamp"],
        window_minutes=30,
    )

    # Sanitized filename e.g. incident_EQ-001_20240106_215100.pdf
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


@app.get("/api/equipment/registry")
def get_equipment_registry():
    """Retrieve equipment specifications, sensors, and operating thresholds."""
    reg_path = BASE_DIR / "data" / "synthetic_v1" / "equipment_registry.json"
    if not reg_path.exists():
        raise HTTPException(status_code=404, detail="Equipment registry file not found.")
    with open(reg_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.post("/api/upload-telemetry")
async def upload_telemetry(
    file: UploadFile = File(...),
    equipment_type: Optional[str] = Form(None),
):
    """
    Validated ingestion path for user-supplied telemetry files (CSV or Excel).
    - Inspects file type and columns
    - Validates mandatory fields (timestamp, equipment_id, power_consumption_kw, operating_mode)
    - Validates machine-specific sensor schema against equipment registry
    - Rejects missing measurements and corrupt values (does NOT treat missing as 0)
    - Prevents data leakage by stripping labels / ground-truth columns
    - Executes rule-based engineering plausibility and ML inference
    - Persists original upload with timestamp and creates tracking incidents
    """
    import io
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

    # Validation checks
    validation_errors = []
    warnings = []

    # Mandatory columns check
    required_cols = ["timestamp", "equipment_id", "power_consumption_kw", "operating_mode"]
    missing_required = [c for c in required_cols if c not in df.columns]
    if missing_required:
        validation_errors.append(f"Missing mandatory telemetry column(s): {missing_required}. Required: {required_cols}")

    # Timestamp parseability check
    if "timestamp" in df.columns:
        try:
            df["timestamp"] = pd.to_datetime(df["timestamp"])
            if df["timestamp"].isnull().any():
                n_null_ts = int(df["timestamp"].isnull().sum())
                validation_errors.append(f"{n_null_ts} rows contain unparseable or null timestamps.")
        except Exception:
            validation_errors.append("Invalid timestamp format. Expected ISO-8601 or standard date format.")

    # Equipment identity check
    if "equipment_id" in df.columns:
        if df["equipment_id"].isnull().any():
            validation_errors.append("Equipment ID contains null or missing values.")
        unique_eqs = df["equipment_id"].dropna().unique().tolist()
        if len(unique_eqs) == 0:
            validation_errors.append("No valid equipment IDs detected in upload.")

    # Power consumption bounds check
    if "power_consumption_kw" in df.columns:
        if not pd.api.types.is_numeric_dtype(df["power_consumption_kw"]):
            validation_errors.append("Column 'power_consumption_kw' must contain numeric values.")
        else:
            if (df["power_consumption_kw"] < 0).any():
                n_neg = int((df["power_consumption_kw"] < 0).sum())
                validation_errors.append(f"Physical violation: {n_neg} rows contain negative active power (< 0 kW).")
            if df["power_consumption_kw"].isnull().all():
                validation_errors.append("Column 'power_consumption_kw' is completely empty (all NaN).")

    # Equipment-specific sensor checks against registry
    reg_path = BASE_DIR / "data" / "synthetic_v1" / "equipment_registry.json"
    registry = {}
    if reg_path.exists():
        with open(reg_path, "r", encoding="utf-8") as f:
            registry = json.load(f)

    # Check equipment consistency
    if not validation_errors and "equipment_id" in df.columns:
        for eq_id in df["equipment_id"].unique():
            if str(eq_id) in registry:
                meta = registry[str(eq_id)]
                expected_type = meta.get("equipment_type")
                # Check sensor presence
                if expected_type == "furnace":
                    if "temperature_c" not in df.columns:
                        validation_errors.append(f"Furnace {eq_id} schema violation: missing primary sensor 'temperature_c'.")
                elif expected_type == "air_compressor":
                    if "discharge_pressure_bar" not in df.columns and "pressure_kpa" not in df.columns:
                        validation_errors.append(f"Air Compressor {eq_id} schema violation: missing 'discharge_pressure_bar'.")
                elif expected_type == "cnc_machine":
                    if "spindle_rpm" not in df.columns and "vibration_mm_s" not in df.columns:
                        validation_errors.append(f"CNC Machine {eq_id} schema violation: missing 'spindle_rpm' or 'vibration_mm_s'.")
                elif expected_type == "chiller":
                    if "supply_temp_c" not in df.columns and "water_flow_m3h" not in df.columns:
                        validation_errors.append(f"Chilled Water System {eq_id} schema violation: missing 'supply_temp_c' or 'water_flow_m3h'.")

    # Check for excessive missing values
    for col in df.columns:
        pct_missing = df[col].isnull().mean()
        if pct_missing > 0.5:
            warnings.append(f"Column '{col}' has {pct_missing*100:.1f}% missing values.")

    # Return errors before analysis if validation failed
    if validation_errors:
        return {
            "valid": False,
            "success": False,
            "filename": filename,
            "row_count": len(df),
            "errors": validation_errors,
            "warnings": warnings,
        }

    # If valid: preserve uploaded file with provenance
    uploads_dir = BASE_DIR / "data" / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)
    ts_prefix = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    saved_upload_path = uploads_dir / f"{ts_prefix}_{filename}"
    with open(saved_upload_path, "wb") as f:
        f.write(content)

    # Prevent target/ground-truth leakage into inference
    LEAKAGE_COLS = ["is_anomaly", "anomaly_type", "is_energy_waste", "severity", "event_id", "ground_truth"]
    clean_df = df.drop(columns=[c for c in LEAKAGE_COLS if c in df.columns], errors="ignore").copy()
    clean_df["data_provenance"] = "uploaded_telemetry"

    # Execute Rule-based plausibility checks
    from .rule_based_detector import RuleBasedEquipmentDetector
    rule_detector = RuleBasedEquipmentDetector()
    rule_anomalies = rule_detector.check_dataframe(clean_df)

    # Execute ML Inference Pipeline
    pipeline = get_pipeline()
    ml_results = pipeline.predict_new_readings(clean_df, model_preference="supervised")

    # Register detected incidents into IncidentStore
    store = get_incident_store()
    new_incidents_count = 0
    now_iso = datetime.utcnow().isoformat() + "Z"

    # Merge ML anomaly records
    for rec in ml_results.get("detected_anomalies", []):
        eq = rec.get("equipment_id", "UPLOADED")
        ts = rec.get("timestamp", now_iso)
        ts_clean = str(ts).replace(":", "").replace("-", "").replace("T", "_")[:15]
        inc_id = f"INC-UPL-{eq}-{ts_clean}"
        store.incidents[inc_id] = {
            "incident_id": inc_id,
            "equipment_id": eq,
            "equipment_type": rec.get("equipment_type", "uploaded_equipment"),
            "timestamp": str(ts),
            "anomaly_type": rec.get("anomaly_type", "telemetry_anomaly"),
            "severity": rec.get("severity", "medium"),
            "is_energy_waste": rec.get("is_energy_waste", False),
            "model_name": rec.get("model_name", "AI Energy Intelligence"),
            "model_score": rec.get("model_score"),
            "actual_power_kw": rec.get("actual_power_kw"),
            "expected_power_kw": rec.get("expected_power_kw"),
            "deviation_kw": rec.get("deviation_kw"),
            "deviation_pct": rec.get("deviation_pct"),
            "estimated_excess_energy_kwh": rec.get("estimated_excess_energy_kwh"),
            "evidence": rec.get("evidence", []),
            "possible_causes": rec.get("possible_causes", []),
            "recommended_action": rec.get("recommended_action", "Inspect operating subsystem."),
            "status": "New",
            "technician_notes": "",
            "resolution_notes": "",
            "created_at": now_iso,
            "updated_at": now_iso,
            "sensor_readings": rec.get("sensor_readings", {}),
            "data_provenance": "uploaded_telemetry",
        }
        new_incidents_count += 1

    # Merge Rule-based anomalies (if not already captured)
    for r_anom in rule_anomalies:
        eq = r_anom.get("equipment_id", "UPLOADED")
        ts = r_anom.get("timestamp", now_iso)
        ts_clean = str(ts).replace(":", "").replace("-", "").replace("T", "_")[:15]
        inc_id = f"INC-RULE-{eq}-{ts_clean}"
        if inc_id not in store.incidents:
            store.incidents[inc_id] = {
                "incident_id": inc_id,
                "equipment_id": eq,
                "equipment_type": r_anom.get("equipment_type", "uploaded_equipment"),
                "timestamp": str(ts),
                "anomaly_type": r_anom.get("anomaly_type", "limit_exceeded"),
                "severity": r_anom.get("severity", "high"),
                "is_energy_waste": r_anom.get("is_energy_waste", False),
                "model_name": "Physical Limit & Plausibility Rules",
                "model_score": 1.0,
                "actual_power_kw": None,
                "expected_power_kw": None,
                "deviation_kw": None,
                "deviation_pct": None,
                "estimated_excess_energy_kwh": None,
                "evidence": [r_anom.get("evidence", "Sensor value exceeded physical threshold.")],
                "possible_causes": ["Physical threshold breach or transducer sensor failure."],
                "recommended_action": "Verify sensor calibration and machinery limits immediately.",
                "status": "New",
                "technician_notes": "",
                "resolution_notes": "",
                "created_at": now_iso,
                "updated_at": now_iso,
                "sensor_readings": {},
                "data_provenance": "uploaded_telemetry",
            }
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

@app.post("/predict")
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


@app.get("/reports/summary")
def get_report_summary():
    """Retrieve precomputed model metrics and plant KPIs."""
    json_path = BASE_DIR / "reports" / "anomaly_report.json"
    if not json_path.exists():
        raise HTTPException(status_code=404, detail="Report not generated yet. Run train.py first.")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------------------
# Static Frontend Mount (Serves prebuilt Dashboard UI if present)
# ------------------------------------------------------------------------------
from fastapi.staticfiles import StaticFiles

frontend_dist = BASE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")

