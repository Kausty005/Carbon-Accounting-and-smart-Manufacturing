import pytest
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.routes.simulation import app

@pytest.fixture
def client():
    return TestClient(app)

def test_api_root(client):
    res = client.get("/")
    assert res.status_code == 200
    assert "WattWise AI" in res.json()["module"]

def test_api_get_machines(client):
    res = client.get("/api/twin/machines")
    assert res.status_code == 200
    data = res.json()
    assert "machines" in data
    assert "COMP-01" in data["machines"]
    assert "CNC-01" in data["machines"]
    assert "FURN-01" in data["machines"]
    assert "PAINT-01" in data["machines"]

def test_api_get_baseline(client):
    res = client.get("/api/twin/baseline")
    assert res.status_code == 200
    data = res.json()
    assert "metrics" in data
    assert data["metrics"]["total_energy_kwh"] > 0
    assert data["metrics"]["peak_demand_kw"] > 0

def test_api_simulate_idle_reduction(client):
    payload = {
        "scenario_id": "API-TEST-IDLE",
        "action": {
            "type": "reduce_idle_power",
            "machine_id": "COMP-01",
            "target_power_kw": 8.0,
            "duration_hours": 2.0
        },
        "assumptions": {"operator_approval": True}
    }
    res = client.post("/api/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["scenario_id"] == "API-TEST-IDLE"
    assert data["status"] == "simulation_only"
    assert data["feasibility"] in ["feasible", "review_required"]
    # Check that savings were achieved
    assert data["deltas"]["energy_kwh"] <= 0
    assert data["deltas"]["cost_inr"] <= 0

def test_api_simulate_blocked_violation(client):
    payload = {
        "scenario_id": "API-TEST-BLOCK",
        "action": {
            "type": "reduce_idle_power",
            "machine_id": "COMP-01",
            "target_power_kw": 50.0 # Exceeds 30 kW rated!
        }
    }
    res = client.post("/api/simulate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["feasibility"] == "blocked"
    assert any(v["severity"] == "error" for v in data["constraint_violations"])

def test_api_optimize_peak(client):
    res = client.post("/api/optimize")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["optimized_peak_kw"] <= data["baseline_peak_kw"]

def test_api_tradeoff_matrix(client):
    res = client.get("/api/twin/tradeoff")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["plant_contract_limit_kw"] == 85.0
    assert len(data["candidates"]) == 3

    c1 = next(c for c in data["candidates"] if c["id"] == "CAND-1")
    assert c1["status"] == "BLOCKED"
    assert "ERR_PRESSURE_BELOW_MINIMUM" in c1["interlocks_triggered"]

    c2 = next(c for c in data["candidates"] if c["id"] == "CAND-2")
    assert c2["status"] == "INFEASIBLE"
    assert c2["production_units"] < 140

    c3 = next(c for c in data["candidates"] if c["id"] == "CAND-3")
    assert c3["status"] == "RECOMMENDED"
    assert c3["peak_kw"] <= data["plant_contract_limit_kw"]
    assert c3["production_units"] >= 140

    assert data["recommended_candidate_id"] == "CAND-3"

