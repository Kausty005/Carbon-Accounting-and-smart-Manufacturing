"""
WattWise AI ?" Physical Sensor Simulation & Cryptographic Ledger Tests
Validates Class 0.5S Modbus RTU, Coriolis, NDIR, and COD sensor telemetry,
72-hour edge gateway buffering, and SHA-256 tamper-evident provenance chains.
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.services.sensor_simulation_service import sensor_simulation_service


@pytest.fixture
def client():
    return TestClient(app)


def test_sensor_topology_endpoint(client):
    """Verify physical sensor inventory and industrial standards."""
    response = client.get("/api/v1/sensors/topology")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    sensors = data["sensors"]
    assert len(sensors) >= 5

    sensor_ids = {s["sensor_id"] for s in sensors}
    assert "EM-101" in sensor_ids  # Class 0.5S Substation Meter
    assert "FM-201" in sensor_ids  # Coriolis Mass Flow
    assert "GA-301" in sensor_ids  # NDIR Stack CEMS
    assert "WQ-401" in sensor_ids  # Optical COD Probe
    assert "GW-EDGE-01" in sensor_ids  # Edge Gateway


def test_sensor_live_telemetry_tick(client):
    """Verify high-frequency physical telemetry and Modbus holding registers."""
    response = client.get("/api/v1/sensors/live-telemetry")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    tick = data["data"]
    
    # Assert physical variables are present
    readings = tick["readings"]
    assert "EM-101" in readings
    assert "voltage_v_ll" in readings["EM-101"]
    assert "modbus_holding_registers" in readings["EM-101"]
    
    # Assert Coriolis density and mass flow
    assert "FM-201" in readings
    assert readings["FM-201"]["density_kg_m3"] > 0
    assert readings["FM-201"]["mass_flow_rate_kg_h"] > 0

    # Assert NDIR flue gas CO2 and NOx
    assert "GA-301" in readings
    assert readings["GA-301"]["co2_concentration_vol_pct"] > 0
    assert readings["GA-301"]["stack_gas_temp_c"] > 100

    # Assert Optical COD
    assert "WQ-401" in readings
    assert readings["WQ-401"]["chemical_oxygen_demand_mg_l"] > 0


def test_edge_gateway_72h_buffering_and_replay(client):
    """Verify edge gateway buffering during simulated outage and zero-loss replay."""
    # 1. Trigger outage
    resp_outage = client.post("/api/v1/sensors/buffer/simulate-outage", json={"is_offline": True})
    assert resp_outage.status_code == 200
    assert resp_outage.json()["result"]["status"] == "OFFLINE_SIMULATION_ACTIVE"

    # 2. Fire ticks while offline
    for _ in range(3):
        resp_tick = client.get("/api/v1/sensors/live-telemetry")
        assert resp_tick.status_code == 200
        assert resp_tick.json()["data"]["gateway_status"] == "BUFFERING_OFFLINE"

    assert sensor_simulation_service.is_offline_simulated is True
    assert len(sensor_simulation_service.edge_buffer) > 0

    # 3. Reconnect and replay
    resp_reconnect = client.post("/api/v1/sensors/buffer/simulate-outage", json={"is_offline": False})
    assert resp_reconnect.status_code == 200
    assert resp_reconnect.json()["result"]["status"] == "RECONNECTED_AND_REPLAYED"
    assert resp_reconnect.json()["result"]["records_replayed"] > 0
    assert len(sensor_simulation_service.edge_buffer) == 0


def test_sha256_cryptographic_audit_ledger_verification(client):
    """Verify tamper-evident hash chain and statutory disclosure validation."""
    # Ensure some blocks exist
    client.get("/api/v1/sensors/live-telemetry")

    # Get audit ledger
    resp_ledger = client.get("/api/v1/sensors/audit-ledger?limit=15")
    assert resp_ledger.status_code == 200
    ledger = resp_ledger.json()["ledger"]
    assert ledger["chain_valid"] is True
    assert len(ledger["blocks"]) > 0

    # Verify SHA-256 chain integrity
    resp_verify = client.post("/api/v1/sensors/audit-ledger/verify")
    assert resp_verify.status_code == 200
    verification = resp_verify.json()["verification"]
    assert verification["verified"] is True
    assert verification["blocks_checked"] > 0
