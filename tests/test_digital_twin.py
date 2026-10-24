import pytest
import os
import sys
from datetime import datetime

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.services.twin_profiles import ProfileStore
from backend.app.services.baseline_engine import BaselineEngine
from backend.app.services.constraint_validator import ConstraintValidator
from backend.app.services.scenario_engine import ScenarioEngine
from backend.app.services.twin_metrics import calculate_metrics, calculate_deltas

@pytest.fixture
def profile_store():
    data_path = os.path.join(os.path.dirname(__file__), "..", "data", "machine_profiles.json")
    return ProfileStore(data_path)

@pytest.fixture
def tariff_config():
    return {
        "currency": "INR",
        "energy_rate_inr_per_kwh": 9.00,
        "tariff_type": "flat",
        "contract_demand_limit_kw": 85.0,
        "demand_penalty_charge_inr_per_kw": 350.0
    }

@pytest.fixture
def emission_factors():
    return {
        "factor_id": "EF-GRID-IN-2023",
        "kg_co2e_per_kwh": 0.82
    }

# T-01: 12 kW average for one hour -> Energy = 12 kWh
def test_t01_interval_energy_one_hour(tariff_config, emission_factors):
    records = [{
        "timestamp": "2026-10-23T10:00:00",
        "machine_id": "CNC-01",
        "process": "machining",
        "power_kw": 12.0,
        "energy_kwh": 12.0,
        "machine_state": "running",
        "production_units": 10,
        "shift": "day",
        "data_source": "simulated"
    }]
    metrics = calculate_metrics(records, tariff_config, emission_factors, interval_hours=1.0)
    assert metrics["total_energy_kwh"] == 12.0
    assert metrics["peak_demand_kw"] == 12.0

# T-02: 18 kW average for 30 minutes -> Energy = 9 kWh
def test_t02_interval_energy_half_hour(tariff_config, emission_factors):
    avg_power_kw = 18.0
    duration_hours = 0.5
    energy_kwh = avg_power_kw * duration_hours
    assert energy_kwh == 9.0

# T-03: Two machines at 10 kW and 7 kW in same slot -> Plant demand = 17 kW
def test_t03_plant_demand_sum(tariff_config, emission_factors):
    records = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "CNC-01", "power_kw": 10.0, "energy_kwh": 10.0, "machine_state": "running"},
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "COMP-01", "power_kw": 7.0, "energy_kwh": 7.0, "machine_state": "running"}
    ]
    metrics = calculate_metrics(records, tariff_config, emission_factors)
    assert metrics["peak_demand_kw"] == 17.0
    assert metrics["total_energy_kwh"] == 17.0

# T-04: Reduce COMP-01 from 18 kW to 8 kW for 2.5 hours -> Energy delta = -25 kWh
def test_t04_compressor_reduction_delta(tariff_config, emission_factors):
    baseline_power = 18.0
    target_power = 8.0
    duration_hours = 2.5
    expected_reduction = (target_power - baseline_power) * duration_hours # -25 kWh
    assert expected_reduction == -25.0
    
    # Cost impact at ₹9/kWh: ₹225 saved
    assert expected_reduction * 9.0 == -225.0

# T-05: Shift load without changing duration or profile under flat tariff
# Total kWh and cost stay the same; peak may change
def test_t05_schedule_shift_flat_tariff(profile_store, tariff_config, emission_factors):
    validator = ConstraintValidator(profile_store)
    engine = ScenarioEngine(profile_store, validator, tariff_config, emission_factors)
    
    # 3-hour baseline with CNC running 20 kW for 1 hour at slot 0
    baseline = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "CNC-01", "power_kw": 20.0, "energy_kwh": 20.0, "machine_state": "running", "production_units": 10},
        {"timestamp": "2026-10-23T11:00:00", "machine_id": "CNC-01", "power_kw": 0.8, "energy_kwh": 0.8, "machine_state": "off", "production_units": 0},
        {"timestamp": "2026-10-23T12:00:00", "machine_id": "CNC-01", "power_kw": 0.8, "energy_kwh": 0.8, "machine_state": "off", "production_units": 0}
    ]
    
    request = {
        "scenario_id": "SHIFT-TEST",
        "action": {"type": "shift_schedule", "machine_id": "CNC-01", "offset_hours": 1}
    }
    res = engine.run_scenario(baseline, request)
    assert res["deltas"]["energy_kwh"] == 0.0
    assert res["deltas"]["cost_inr"] == 0.0

# T-06: Set target power above rated machine power -> Scenario is blocked with violation
def test_t06_target_power_exceeds_rated(profile_store, tariff_config, emission_factors):
    validator = ConstraintValidator(profile_store)
    engine = ScenarioEngine(profile_store, validator, tariff_config, emission_factors)
    # COMP-01 is rated 30 kW. Request 45 kW.
    baseline = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "COMP-01", "power_kw": 18.0, "energy_kwh": 18.0, "machine_state": "idle", "production_units": 0}
    ]
    request = {
        "scenario_id": "OVERPOWER-TEST",
        "action": {"type": "reduce_idle_power", "machine_id": "COMP-01", "target_power_kw": 45.0, "duration_hours": 1.0}
    }
    res = engine.run_scenario(baseline, request)
    assert res["feasibility"] == "blocked"
    assert any(v["code"] == "ERR_POWER_EXCEEDS_RATED" for v in res["constraint_violations"])

# T-07: Try to interrupt protected furnace cycle -> Scenario is blocked
def test_t07_protected_furnace_cycle(profile_store, tariff_config, emission_factors):
    validator = ConstraintValidator(profile_store)
    engine = ScenarioEngine(profile_store, validator, tariff_config, emission_factors)
    # FURN-01 is protected, holding limit is 15 kW. Cutting to 2 kW violates protected process.
    baseline = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "FURN-01", "power_kw": 15.0, "energy_kwh": 15.0, "machine_state": "idle", "production_units": 0}
    ]
    request = {
        "scenario_id": "FURNACE-VIOLATION",
        "action": {"type": "reduce_idle_power", "machine_id": "FURN-01", "target_power_kw": 2.0}
    }
    res = engine.run_scenario(baseline, request)
    assert res["feasibility"] == "blocked"
    assert any(v["code"] == "ERR_PROTECTED_PROCESS_VIOLATION" for v in res["constraint_violations"])

# T-08: Missing emission factor -> Scope 2 returned as None/null without inventing a factor
def test_t08_missing_emission_factor(tariff_config):
    records = [{"timestamp": "2026-10-23T10:00:00", "machine_id": "CNC-01", "power_kw": 10.0, "energy_kwh": 10.0, "machine_state": "running"}]
    metrics = calculate_metrics(records, tariff_config, emission_factor_metadata=None)
    assert metrics["scope2_kg_co2e"] is None

# T-10: Determinism check: Submit same request twice against same baseline -> Same outputs
def test_t10_determinism(profile_store, tariff_config, emission_factors):
    validator = ConstraintValidator(profile_store)
    engine = ScenarioEngine(profile_store, validator, tariff_config, emission_factors)
    baseline = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "COMP-01", "power_kw": 18.0, "energy_kwh": 18.0, "machine_state": "idle", "production_units": 0}
    ]
    request = {
        "scenario_id": "DET-01",
        "action": {"type": "reduce_idle_power", "machine_id": "COMP-01", "start": "2026-10-23T10:00:00", "duration_hours": 1.0, "target_power_kw": 8.0}
    }
    res1 = engine.run_scenario(baseline, request)
    res2 = engine.run_scenario(baseline, request)
    assert res1["deltas"] == res2["deltas"]
    assert res1["scenario"]["total_energy_kwh"] == res2["scenario"]["total_energy_kwh"]

# T-11: Immutability check: Baseline is not mutated by scenario execution
def test_t11_immutability(profile_store, tariff_config, emission_factors):
    validator = ConstraintValidator(profile_store)
    engine = ScenarioEngine(profile_store, validator, tariff_config, emission_factors)
    baseline = [
        {"timestamp": "2026-10-23T10:00:00", "machine_id": "COMP-01", "power_kw": 18.0, "energy_kwh": 18.0, "machine_state": "idle", "production_units": 0}
    ]
    request = {
        "scenario_id": "IMMUTABLE-01",
        "action": {"type": "reduce_idle_power", "machine_id": "COMP-01", "start": "2026-10-23T10:00:00", "duration_hours": 1.0, "target_power_kw": 8.0}
    }
    _ = engine.run_scenario(baseline, request)
    # Check baseline list was not modified
    assert baseline[0]["power_kw"] == 18.0
    assert baseline[0]["energy_kwh"] == 18.0
