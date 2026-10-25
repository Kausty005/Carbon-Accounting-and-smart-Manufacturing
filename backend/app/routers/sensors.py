"""
WattWise AI ?" Physical Sensor & Cryptographic Audit Ledger Router
Exposes simulated shop-floor instrumentation telemetry, edge gateway buffering,
and SHA-256 tamper-evident provenance logs for statutory carbon disclosures
(SEBI BRSR Core, EU CBAM, ISO 14064-1/3).
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.app.services.sensor_simulation_service import sensor_simulation_service

router = APIRouter(prefix="/api/v1/sensors", tags=["Physical Sensors & Cryptographic Audit Ledger"])


class OutageSimulationRequest(BaseModel):
    is_offline: bool = Field(..., description="True to simulate shop-floor network outage; False to reconnect and replay")


@router.get("/topology")
def get_sensor_topology():
    """
    Returns the physical sensor hardware topology, including Class 0.5S Modbus meters,
    Coriolis mass flow meters, NDIR flue gas stack analyzers, optical COD probes,
    and the 72-hour Edge IoT Gateway.
    """
    return {
        "status": "success",
        "gateway_serial": "GW-EDGE-01",
        "statutory_assurance": "SEBI BRSR Core / EU CBAM Annex IV / ISO 14064-1 Tier 3",
        "sensors": list(sensor_simulation_service.sensors_topology.values()),
    }


@router.get("/live-telemetry")
def get_sensor_live_telemetry():
    """
    High-frequency telemetry tick from simulated physical instruments.
    Returns real physical variables, Modbus holding registers, edge gateway buffer state,
    and the latest SHA-256 cryptographic block hash.
    """
    tick_data = sensor_simulation_service.tick()
    return {
        "status": "success",
        "data": tick_data,
    }


@router.get("/audit-ledger")
def get_audit_ledger(limit: int = Query(30, ge=1, le=250, description="Max blocks to return")):
    """
    Retrieves the immutable SHA-256 cryptographic audit chain for statutory inspection.
    Includes previous hash, current block hash, Modbus register proofs, and calibration certificate IDs.
    """
    ledger = sensor_simulation_service.get_audit_ledger(limit=limit)
    return {
        "status": "success",
        "ledger": ledger,
    }


@router.post("/buffer/simulate-outage")
def toggle_edge_outage(payload: OutageSimulationRequest):
    """
    Simulates a shop-floor edge network disruption.
    When offline, telemetry continuously queues into the 72-hour edge circular buffer.
    When reconnected, buffered records are verified and replayed with original timestamps.
    """
    result = sensor_simulation_service.toggle_outage_simulation(payload.is_offline)
    return {
        "status": "success",
        "result": result,
    }


@router.post("/audit-ledger/verify")
def verify_audit_ledger():
    """
    Third-party auditor verification endpoint.
    Traverses the entire SHA-256 hash chain from genesis root to the active tip
    to mathematically prove zero tampering and data completeness.
    """
    verification = sensor_simulation_service.verify_ledger()
    return {
        "status": "success",
        "verification": verification,
    }
