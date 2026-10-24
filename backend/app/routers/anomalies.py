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
import math
import random
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.ai_intelligence.src.incident_report_generator import (
    generate_docx_incident_report,
    generate_pdf_incident_report,
)
from backend.ai_intelligence.src.incident_store import IncidentStore, normalize_incident_dict
from backend.ai_intelligence.src.inference import EnergyIntelligencePipeline
from backend.ai_intelligence.src.forecast_adapter import (
    ForecastServiceAdapter,
    ForecastRecord,
    ALL_UPSTREAM_FEATURES,
    FORECASTING_FEATURE_GROUPS,
)
from backend.ai_intelligence.src.residual_anomaly_detector import (
    DualPathAnomalyDetector,
    CalibratedThresholdRegistry,
    SensorQualityValidator,
)
from backend.ai_intelligence.src.recommendations import RecommendationEngine
from backend.ai_intelligence.src.optimization_summary import OptimizationSummaryEngine

router = APIRouter(tags=["AI Anomaly Intelligence"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent / "ai_intelligence"

# Lazy singletons
_pipeline: Optional[EnergyIntelligencePipeline] = None
_incident_store: Optional[IncidentStore] = None
_forecast_adapter: Optional[ForecastServiceAdapter] = None
_threshold_registry: Optional[CalibratedThresholdRegistry] = None


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


def get_forecast_adapter() -> ForecastServiceAdapter:
    global _forecast_adapter
    if _forecast_adapter is None:
        _forecast_adapter = ForecastServiceAdapter()
    return _forecast_adapter


def get_threshold_registry() -> CalibratedThresholdRegistry:
    global _threshold_registry
    if _threshold_registry is None:
        _threshold_registry = CalibratedThresholdRegistry()
    return _threshold_registry


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
    Supports both modern ISO incident statuses and legacy SCADA tags.
    """
    valid_statuses = [
        "New", "Investigating", "Resolved", "False Positive",
        "open", "acknowledged", "investigating", "resolved", "dismissed",
    ]
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


# ------------------------------------------------------------------------------
# Forecasting & Energy Optimization Endpoints
# ------------------------------------------------------------------------------

@router.get("/api/forecast/status")
def get_forecast_service_status():
    """
    Check connectivity status, schema alignment, and cache size of the upstream
    HistGradientBoostingRegressor forecasting adapter.
    """
    adapter = get_forecast_adapter()
    return adapter.get_service_status()


class ForecastBatchPayload(BaseModel):
    forecasts: List[Dict[str, Any]]


@router.post("/api/forecast/ingest")
def ingest_forecast_records(payload: ForecastBatchPayload):
    """
    Ingest batch 15-minute forecast predictions into the adapter cache.
    """
    adapter = get_forecast_adapter()
    count = adapter.ingest_batch(payload.forecasts)
    return {
        "status": "success",
        "ingested_count": count,
        "total_cached": len(adapter._forecast_store),
        "message": f"Successfully ingested {count} forecast records into adapter cache.",
    }


@router.get("/api/forecast/comparison")
def get_forecast_comparison(
    machine_id: str = Query(..., description="Machine ID e.g. AIR-COMP-01 or COMP-01"),
    target_timestamp: str = Query(..., description="Target 15-minute interval timestamp (ISO 8601)"),
    actual_energy_kwh: Optional[float] = Query(None, description="Actual measured 15-min energy in kWh"),
    site_id: str = Query("SITE-01", description="Site identifier"),
):
    """
    Match 15-minute forecast against actual measured energy reading and compute signed/relative residuals.
    """
    adapter = get_forecast_adapter()
    match_result = adapter.match_forecast_with_actual(
        machine_id=machine_id,
        target_timestamp=target_timestamp,
        actual_energy_kwh=actual_energy_kwh,
        site_id=site_id,
    )
    return match_result.dict() if hasattr(match_result, "dict") else match_result.model_dump()


@router.get("/api/optimization/summary")
def get_machine_site_optimization_summary(
    site_id: Optional[str] = Query(None, description="Filter by site ID"),
    machine_id: Optional[str] = Query(None, description="Filter by machine ID"),
):
    """
    Aggregate machine and site energy optimization summary:
    unique incident episodes, repeat offenders, total avoidable excess kWh, and prioritized checklist.
    """
    store = get_incident_store()
    return store.get_optimization_summary(site_id=site_id, machine_id=machine_id)


@router.get("/api/recommendations")
def get_equipment_recommendations(
    machine_type: str = Query(..., description="Machine category e.g. AIR_COMPRESSOR, FURNACE, CNC_MACHINE"),
    residual_kwh: Optional[float] = Query(None, description="Residual excess energy in kWh"),
    power_kw: Optional[float] = Query(None, description="Active power in kW"),
    operating_state: Optional[str] = Query(None, description="Operating state e.g. running, idle"),
):
    """
    Generate evidence-linked industrial energy optimization recommendations without unevidenced mechanical claims.
    """
    recs = RecommendationEngine.generate_recommendations(
        machine_type=machine_type,
        evidence_list=[f"Residual deviation: {residual_kwh} kWh"] if residual_kwh else [],
        residual_kwh=residual_kwh,
        power_kw=power_kw,
        operating_state=operating_state,
    )
    return [r.dict() if hasattr(r, "dict") else r.model_dump() for r in recs]


@router.get("/api/data-quality/status")
def get_data_quality_health():
    """
    Retrieve sensor data quality warnings and telemetry validation status.
    """
    store = get_incident_store()
    summary = store.get_optimization_summary()
    dq_warnings = summary["summary_metrics"]["data_quality_warnings"]
    return {
        "status": "healthy" if dq_warnings == 0 else "warnings_detected",
        "total_quality_warnings": dq_warnings,
        "monitored_equipment_count": summary["summary_metrics"]["unique_incident_episodes"],
        "message": (
            "All sensor telemetry streams within nominal calibration."
            if dq_warnings == 0
            else f"{dq_warnings} sensor data quality warning(s) detected across equipment."
        ),
    }


@router.get("/api/anomalies/{incident_id}/report")
@router.post("/api/anomalies/{incident_id}/report")
@router.get("/api/anomalies/{incident_id}/report/pdf")
@router.get("/api/anomalies/{incident_id}/report/docx")
def download_incident_report(
    incident_id: str,
    format: Optional[str] = Query(None, description="Report format: 'pdf' or 'docx'"),
    request: Request = None,
):
    """
    Generate and stream a genuine, downloadable PDF or Word (.docx) incident report.
    Supports both GET/POST methods and direct /pdf and /docx extension endpoints.
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

    # Determine format from path or query parameter
    req_path = str(request.url.path).lower() if request else ""
    if req_path.endswith("/docx"):
        resolved_format = "docx"
    elif req_path.endswith("/pdf"):
        resolved_format = "pdf"
    elif format is not None:
        if format.lower() not in ["pdf", "docx"]:
            raise HTTPException(status_code=400, detail="Unsupported report format. Must be 'pdf' or 'docx'.")
        resolved_format = format.lower()
    else:
        resolved_format = "pdf"

    eq_safe = re.sub(r"[^A-Za-z0-9_-]", "", inc.get("equipment_id", "EQ"))
    ts_safe = str(inc.get("timestamp", "")).replace(":", "").replace("-", "").replace("T", "_")[:15]
    reports_temp_dir = BASE_DIR / "reports" / "generated_downloads"
    reports_temp_dir.mkdir(parents=True, exist_ok=True)

    if resolved_format == "pdf":
        file_name = f"incident_{eq_safe}_{ts_safe}.pdf"
        out_path = reports_temp_dir / file_name
        generate_pdf_incident_report(inc, telemetry_window, out_path)
        return FileResponse(
            path=str(out_path),
            media_type="application/pdf",
            filename=file_name,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    elif resolved_format == "docx":
        file_name = f"incident_{eq_safe}_{ts_safe}.docx"
        out_path = reports_temp_dir / file_name
        generate_docx_incident_report(inc, telemetry_window, out_path)
        return FileResponse(
            path=str(out_path),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=file_name,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"',
                "Access-Control-Expose-Headers": "Content-Disposition",
            },
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported report format. Must be 'pdf' or 'docx'.")


# ------------------------------------------------------------------------------
# Real-Time Telemetry Simulation & Live Anomaly Detection Engine
# ------------------------------------------------------------------------------

_simulation_state: Dict[str, Any] = {
    "tick": 0,
    "last_timestamp": None,
    "injected_anomaly": None,
    "history": [],
}

SIMULATED_MACHINES_CONFIG = [
    {
        "equipment_id": "AIR-COMP-01",
        "name": "ELGi Industrial Air Compressor",
        "equipment_type": "air_compressor",
        "rated_power_kw": 75.0,
        "base_power_kw": 24.5,
        "base_pressure_bar": 7.2,
        "base_cfm": 125.0,
        "base_vibration_mm_s": 1.25,
        "base_temp_c": 77.5,
    },
    {
        "equipment_id": "CNC-01",
        "name": "5-Axis CNC Machining Center",
        "equipment_type": "cnc_machine",
        "rated_power_kw": 25.0,
        "base_power_kw": 10.4,
        "base_rpm": 4250.0,
        "base_load_pct": 42.0,
        "base_vibration_mm_s": 0.58,
        "base_temp_c": 24.2,
    },
    {
        "equipment_id": "FURNACE-01",
        "name": "Industrial Heat Treating Furnace",
        "equipment_type": "furnace",
        "rated_power_kw": 120.0,
        "base_power_kw": 48.5,
        "base_temp_c": 850.0,
        "setpoint_temp_c": 850.0,
        "base_vibration_mm_s": 0.32,
    },
    {
        "equipment_id": "CHILLER-01",
        "name": "Central Chilled Water System",
        "equipment_type": "chiller",
        "rated_power_kw": 60.0,
        "base_power_kw": 22.8,
        "base_supply_temp_c": 7.2,
        "base_delta_t_c": 5.4,
        "base_flow_m3h": 40.5,
        "base_vibration_mm_s": 0.78,
    },
]


class InjectedAnomalyRequest(BaseModel):
    equipment_id: Optional[str] = "FURNACE-01"
    anomaly_type: Optional[str] = "excessive_power"


@router.post("/api/anomalies/live-stream/inject")
def inject_live_anomaly(payload: InjectedAnomalyRequest):
    """
    Queue a manual anomaly fault to trigger on the immediate next simulation tick.
    """
    _simulation_state["injected_anomaly"] = {
        "equipment_id": payload.equipment_id or "FURNACE-01",
        "anomaly_type": payload.anomaly_type or "excessive_power",
    }
    return {
        "status": "queued",
        "message": f"Fault scheduled for {payload.equipment_id} on next simulation tick.",
    }


@router.get("/api/anomalies/live-stream/tick")
def get_live_simulation_tick():
    """
    Heartbeat endpoint called every 2 seconds.
    Generates dynamic physical SCADA readings across all 4 industrial assets,
    detects live operational deviations in real time, and persists live incidents.
    """
    _simulation_state["tick"] += 1
    t = _simulation_state["tick"]
    now_dt = datetime.now()
    now_iso = now_dt.strftime("%Y-%m-%d %H:%M:%S")

    store = get_incident_store()
    injected = _simulation_state.get("injected_anomaly")
    _simulation_state["injected_anomaly"] = None

    # Scheduled periodic anomaly (e.g., every 15 ticks ~ 30 seconds for live demo drama)
    auto_trigger = (t > 2 and t % 15 == 7)

    target_anomaly_eq = None
    target_fault_type = None

    if injected:
        target_anomaly_eq = injected["equipment_id"]
        target_fault_type = injected["anomaly_type"]
    elif auto_trigger:
        # Rotate among the 4 machines
        machine_idx = (t // 15) % len(SIMULATED_MACHINES_CONFIG)
        target_anomaly_eq = SIMULATED_MACHINES_CONFIG[machine_idx]["equipment_id"]
        target_fault_type = "auto"

    active_detected_incident: Optional[Dict[str, Any]] = None
    machine_readings: List[Dict[str, Any]] = []
    total_plant_kw = 0.0

    for cfg in SIMULATED_MACHINES_CONFIG:
        eq_id = cfg["equipment_id"]
        is_faulted = (eq_id == target_anomaly_eq)
        cycle = math.sin(t * 0.2 + hash(eq_id) % 5)
        noise = random.uniform(-0.15, 0.15)

        if eq_id == "AIR-COMP-01":
            if is_faulted:
                # Pressure leak / header drop
                p_kw = round(38.2 + random.uniform(-0.6, 1.2), 2)
                press = round(5.4 + random.uniform(-0.1, 0.2), 2)
                cfm = round(146.5 + random.uniform(-3, 4), 1)
                vib = round(2.35 + random.uniform(-0.1, 0.2), 2)
                temp = round(83.2 + random.uniform(-0.5, 0.8), 1)
                status_label = "ANOMALY"
            else:
                p_kw = round(cfg["base_power_kw"] + cycle * 1.2 + noise, 2)
                press = round(cfg["base_pressure_bar"] + cycle * 0.12 + random.uniform(-0.05, 0.05), 2)
                cfm = round(cfg["base_cfm"] + cycle * 4.0 + random.uniform(-1, 1), 1)
                vib = round(cfg["base_vibration_mm_s"] + random.uniform(-0.04, 0.05), 2)
                temp = round(cfg["base_temp_c"] + random.uniform(-0.3, 0.4), 1)
                status_label = "NORMAL"

            reading = {
                "equipment_id": eq_id,
                "name": cfg["name"],
                "equipment_type": cfg["equipment_type"],
                "status": status_label,
                "power_kw": p_kw,
                "expected_power_kw": cfg["base_power_kw"],
                "discharge_pressure_bar": press,
                "airflow_cfm": cfm,
                "vibration_mm_s": vib,
                "temperature_c": temp,
            }

            if is_faulted:
                active_detected_incident = {
                    "incident_id": f"INC-LIVE-AIRCOMP-{now_dt.strftime('%Y%m%d_%H%M%S')}",
                    "timestamp": now_iso,
                    "equipment_id": eq_id,
                    "machine_type": "air_compressor",
                    "operating_mode": "loaded_cycle",
                    "anomaly_type": "pressure_leak",
                    "detection_method": "supervised_random_forest",
                    "model_name": "Supervised Random Forest",
                    "model_score": 0.942,
                    "confidence": 0.942,
                    "confidence_available": True,
                    "severity": "high",
                    "status": "New",
                    "is_live": True,
                    "actual_power_kw": p_kw,
                    "expected_power_kw": cfg["base_power_kw"],
                    "deviation_kw": round(p_kw - cfg["base_power_kw"], 2),
                    "deviation_pct": round(((p_kw - cfg["base_power_kw"]) / cfg["base_power_kw"]) * 100, 1),
                    "estimated_excess_energy_kwh": round((p_kw - cfg["base_power_kw"]) * (2.0 / 3600.0) * 120, 3),
                    "evidence": [
                        f"Discharge pressure {press} bar collapsed below critical 6.0 bar line limit",
                        f"Continuous load power {p_kw} kW (+55.9% above nominal unloader setpoint)",
                        f"Elevated airflow demand {cfm} CFM indicating pneumatic header loss",
                    ],
                    "possible_causes": [
                        "Main distribution manifold seal compromise or burst quick-disconnect fitting",
                        "Compressor unloader solenoid valve stuck in permanent loaded bypass state",
                    ],
                    "recommended_action": "Isolate header sector B and scan distribution trunk lines with ultrasonic leak detector.",
                    "sensor_readings": {
                        "power_consumption_kw": p_kw,
                        "discharge_pressure_bar": press,
                        "airflow_cfm": cfm,
                        "vibration_mm_s": vib,
                        "temperature_c": temp,
                    },
                    "data_provenance": "simulated_scada_stream",
                }

        elif eq_id == "FURNACE-01":
            if is_faulted:
                p_kw = round(78.4 + random.uniform(-1.0, 1.8), 2)
                temp = round(871.2 + random.uniform(-1.5, 2.0), 1)
                vib = round(0.42 + random.uniform(-0.02, 0.04), 2)
                status_label = "ANOMALY"
            else:
                p_kw = round(cfg["base_power_kw"] + cycle * 2.1 + noise, 2)
                temp = round(cfg["base_temp_c"] + cycle * 1.5 + random.uniform(-0.4, 0.4), 1)
                vib = round(cfg["base_vibration_mm_s"] + random.uniform(-0.02, 0.03), 2)
                status_label = "NORMAL"

            reading = {
                "equipment_id": eq_id,
                "name": cfg["name"],
                "equipment_type": cfg["equipment_type"],
                "status": status_label,
                "power_kw": p_kw,
                "expected_power_kw": cfg["base_power_kw"],
                "temperature_c": temp,
                "temp_setpoint_c": 850.0,
                "vibration_mm_s": vib,
            }

            if is_faulted:
                active_detected_incident = {
                    "incident_id": f"INC-LIVE-FURNACE-{now_dt.strftime('%Y%m%d_%H%M%S')}",
                    "timestamp": now_iso,
                    "equipment_id": eq_id,
                    "machine_type": "furnace",
                    "operating_mode": "thermal_soak",
                    "anomaly_type": "excessive_power_consumption",
                    "detection_method": "supervised_random_forest",
                    "model_name": "Supervised Random Forest",
                    "model_score": 0.965,
                    "confidence": 0.965,
                    "confidence_available": True,
                    "severity": "high",
                    "status": "New",
                    "is_live": True,
                    "actual_power_kw": p_kw,
                    "expected_power_kw": cfg["base_power_kw"],
                    "deviation_kw": round(p_kw - cfg["base_power_kw"], 2),
                    "deviation_pct": round(((p_kw - cfg["base_power_kw"]) / cfg["base_power_kw"]) * 100, 1),
                    "estimated_excess_energy_kwh": round((p_kw - cfg["base_power_kw"]) * (2.0 / 3600.0) * 150, 3),
                    "evidence": [
                        f"Active power {p_kw} kW exceeding nominal 48.5 kW soak baseline by +61.6%",
                        f"Chamber heat chamber temp elevated to {temp}°C during soak cycle",
                        "Zone 2 heating elements running at 94% continuous firing angle",
                    ],
                    "possible_causes": [
                        "Vestibule door seal degradation or micro-switch alignment displacement",
                        "Thermal insulation refractory wall micro-fissure allowing radiant energy escape",
                    ],
                    "recommended_action": "Perform immediate infrared thermography on door perimeter and verify pneumatic seal interlock.",
                    "sensor_readings": {
                        "power_consumption_kw": p_kw,
                        "temperature_c": temp,
                        "temp_setpoint_c": 850.0,
                        "vibration_mm_s": vib,
                    },
                    "data_provenance": "simulated_scada_stream",
                }

        elif eq_id == "CNC-01":
            if is_faulted:
                p_kw = round(18.5 + random.uniform(-0.5, 0.7), 2)
                rpm = round(3950.0 + random.uniform(-40, 50), 0)
                load_pct = round(86.5 + random.uniform(-2, 3), 1)
                vib = round(3.42 + random.uniform(-0.15, 0.25), 2)
                temp = round(28.4 + random.uniform(-0.3, 0.5), 1)
                status_label = "ANOMALY"
            else:
                p_kw = round(cfg["base_power_kw"] + cycle * 0.8 + noise, 2)
                rpm = round(cfg["base_rpm"] + cycle * 30.0 + random.uniform(-10, 10), 0)
                load_pct = round(cfg["base_load_pct"] + cycle * 2.5 + random.uniform(-1, 1), 1)
                vib = round(cfg["base_vibration_mm_s"] + random.uniform(-0.03, 0.04), 2)
                temp = round(cfg["base_temp_c"] + random.uniform(-0.2, 0.2), 1)
                status_label = "NORMAL"

            reading = {
                "equipment_id": eq_id,
                "name": cfg["name"],
                "equipment_type": cfg["equipment_type"],
                "status": status_label,
                "power_kw": p_kw,
                "expected_power_kw": cfg["base_power_kw"],
                "spindle_rpm": rpm,
                "spindle_load_pct": load_pct,
                "vibration_mm_s": vib,
                "coolant_temp_c": temp,
            }

            if is_faulted:
                active_detected_incident = {
                    "incident_id": f"INC-LIVE-CNC-{now_dt.strftime('%Y%m%d_%H%M%S')}",
                    "timestamp": now_iso,
                    "equipment_id": eq_id,
                    "machine_type": "cnc_machine",
                    "operating_mode": "profile_milling",
                    "anomaly_type": "spindle_bearing_wear",
                    "detection_method": "supervised_random_forest",
                    "model_name": "Supervised Random Forest",
                    "model_score": 0.918,
                    "confidence": 0.918,
                    "confidence_available": True,
                    "severity": "medium",
                    "status": "New",
                    "is_live": True,
                    "actual_power_kw": p_kw,
                    "expected_power_kw": cfg["base_power_kw"],
                    "deviation_kw": round(p_kw - cfg["base_power_kw"], 2),
                    "deviation_pct": round(((p_kw - cfg["base_power_kw"]) / cfg["base_power_kw"]) * 100, 1),
                    "estimated_excess_energy_kwh": round((p_kw - cfg["base_power_kw"]) * (2.0 / 3600.0) * 100, 3),
                    "evidence": [
                        f"Spindle vibration velocity {vib} mm/s violates ISO 10816 threshold (1.8 mm/s)",
                        f"Spindle motor load sustained at {load_pct}% exceeding roughing baseline",
                        f"Active power {p_kw} kW (+77.9% deviation)",
                    ],
                    "possible_causes": [
                        "Tool insert micro-chipping inducing cutting harmonic imbalance",
                        "Spindle ceramic front bearing race fatigue or lubrication starvation",
                    ],
                    "recommended_action": "Pause cycle at next toolchange; inspect insert edge for flank wear and record FFT vibration spectrum.",
                    "sensor_readings": {
                        "power_consumption_kw": p_kw,
                        "spindle_rpm": rpm,
                        "spindle_load_pct": load_pct,
                        "vibration_mm_s": vib,
                        "coolant_temp_c": temp,
                    },
                    "data_provenance": "simulated_scada_stream",
                }

        else:  # CHILLER-01
            if is_faulted:
                p_kw = round(34.2 + random.uniform(-0.7, 1.0), 2)
                supply_t = round(9.3 + random.uniform(-0.2, 0.3), 1)
                delta_t = round(2.1 + random.uniform(-0.1, 0.2), 1)
                flow = round(44.2 + random.uniform(-1, 1), 1)
                vib = round(1.22 + random.uniform(-0.05, 0.08), 2)
                status_label = "ANOMALY"
            else:
                p_kw = round(cfg["base_power_kw"] + cycle * 1.4 + noise, 2)
                supply_t = round(cfg["base_supply_temp_c"] + cycle * 0.2 + random.uniform(-0.1, 0.1), 1)
                delta_t = round(cfg["base_delta_t_c"] + cycle * 0.15 + random.uniform(-0.1, 0.1), 1)
                flow = round(cfg["base_flow_m3h"] + random.uniform(-0.5, 0.5), 1)
                vib = round(cfg["base_vibration_mm_s"] + random.uniform(-0.03, 0.03), 2)
                status_label = "NORMAL"

            reading = {
                "equipment_id": eq_id,
                "name": cfg["name"],
                "equipment_type": cfg["equipment_type"],
                "status": status_label,
                "power_kw": p_kw,
                "expected_power_kw": cfg["base_power_kw"],
                "supply_temp_c": supply_t,
                "delta_t_c": delta_t,
                "water_flow_m3h": flow,
                "vibration_mm_s": vib,
            }

            if is_faulted:
                active_detected_incident = {
                    "incident_id": f"INC-LIVE-CHILLER-{now_dt.strftime('%Y%m%d_%H%M%S')}",
                    "timestamp": now_iso,
                    "equipment_id": eq_id,
                    "machine_type": "chiller",
                    "operating_mode": "cooling_demand",
                    "anomaly_type": "low_delta_t_syndrome",
                    "detection_method": "supervised_random_forest",
                    "model_name": "Supervised Random Forest",
                    "model_score": 0.895,
                    "confidence": 0.895,
                    "confidence_available": True,
                    "severity": "medium",
                    "status": "New",
                    "is_live": True,
                    "actual_power_kw": p_kw,
                    "expected_power_kw": cfg["base_power_kw"],
                    "deviation_kw": round(p_kw - cfg["base_power_kw"], 2),
                    "deviation_pct": round(((p_kw - cfg["base_power_kw"]) / cfg["base_power_kw"]) * 100, 1),
                    "estimated_excess_energy_kwh": round((p_kw - cfg["base_power_kw"]) * (2.0 / 3600.0) * 110, 3),
                    "evidence": [
                        f"Supply/return Delta-T collapsed to {delta_t}°C (minimum nominal >= 5.0°C)",
                        f"Compressor power surging to {p_kw} kW unable to pull down supply temp to setpoint",
                        f"Water circulation rate {flow} m3/h indicates excessive bypass pumping",
                    ],
                    "possible_causes": [
                        "Air handling unit 2-way control valve seized open, driving excessive flow bypass",
                        "Evaporator plate heat exchanger surface scale fouling reducing heat transfer coefficient",
                    ],
                    "recommended_action": "Check AHU chilled water coil bypass valves and inspect evaporator differential pressure.",
                    "sensor_readings": {
                        "power_consumption_kw": p_kw,
                        "supply_temp_c": supply_t,
                        "delta_t_c": delta_t,
                        "water_flow_m3h": flow,
                        "vibration_mm_s": vib,
                    },
                    "data_provenance": "simulated_scada_stream",
                }

        machine_readings.append(reading)
        total_plant_kw += p_kw

    # If an anomaly was detected on this tick, normalize and persist it
    if active_detected_incident:
        norm_inc = normalize_incident_dict(active_detected_incident)
        store.incidents[active_detected_incident["incident_id"]] = norm_inc
        # Save incident to disk store
        try:
            store.save_incidents()
        except Exception:
            pass

    # Store rolling history
    _simulation_state["last_timestamp"] = now_iso
    history_entry = {
        "tick": t,
        "timestamp": now_iso,
        "plant_power_kw": round(total_plant_kw, 2),
        "has_anomaly": active_detected_incident is not None,
    }
    _simulation_state["history"].append(history_entry)
    if len(_simulation_state["history"]) > 60:
        _simulation_state["history"] = _simulation_state["history"][-60:]

    return {
        "tick": t,
        "timestamp": now_iso,
        "interval_seconds": 2.0,
        "plant_power_kw": round(total_plant_kw, 2),
        "machines": machine_readings,
        "active_anomaly": active_detected_incident,
        "total_incidents": len(store.incidents),
    }


@router.get("/api/anomalies/live-stream/history")
def get_live_simulation_history():
    """Retrieve rolling history of recent simulation ticks."""
    return {
        "current_tick": _simulation_state["tick"],
        "history": _simulation_state["history"],
    }


@router.post("/api/anomalies/live-stream/reset")
def reset_live_simulation():
    """Reset simulation tick counter."""
    _simulation_state["tick"] = 0
    _simulation_state["history"] = []
    _simulation_state["injected_anomaly"] = None
    return {"status": "reset", "tick": 0}


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

        raw_score = anom.get("model_score")
        incident_obj = {
            "incident_id": inc_id,
            "timestamp": str(anom.get("timestamp")),
            "equipment_id": str(anom.get("equipment_id")),
            "operating_mode": str(anom.get("operating_mode", "normal")),
            "anomaly_type": str(anom.get("anomaly_type", "operational_deviation")),
            "detection_method": str(anom.get("detection_method", "supervised_random_forest" if anom.get("model_name") == "Supervised RF" else "condition_aware_baseline")),
            "model_name": str(anom.get("model_name", "Supervised Random Forest")),
            "model_score": raw_score,
            "confidence": raw_score if anom.get("model_name") == "Supervised RF" else None,
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
        normalized_inc = normalize_incident_dict(incident_obj)
        store.incidents[inc_id] = normalized_inc
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
