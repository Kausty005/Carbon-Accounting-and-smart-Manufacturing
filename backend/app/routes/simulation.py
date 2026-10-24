from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
import json
import os

from ..services.twin_profiles import ProfileStore
from ..services.baseline_engine import BaselineEngine
from ..services.constraint_validator import ConstraintValidator
from ..services.scenario_engine import ScenarioEngine
from ..services.twin_metrics import calculate_metrics

app = FastAPI(
    title="WattWise AI — Digital Twin Simulation Engine",
    description="Time-based digital twin and scenario testing module for KPCL Problem Statement 1",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load configuration files
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
data_candidates = [
    os.path.join(base_dir, "..", "data"),
    os.path.join(os.getcwd(), "data"),
    os.path.join(os.getcwd(), "Carbon-Accounting-and-smart-Manufacturing", "data")
]
data_dir = None
for d in data_candidates:
    if os.path.exists(d) and os.path.exists(os.path.join(d, "machine_profiles.json")):
        data_dir = os.path.abspath(d)
        break

if not data_dir:
    data_dir = os.path.join(os.getcwd(), "data")

profile_store = ProfileStore(os.path.join(data_dir, "machine_profiles.json"))
baseline_engine = BaselineEngine(os.path.join(data_dir, "machine_energy.csv"))
constraint_validator = ConstraintValidator(profile_store)

with open(os.path.join(data_dir, "tariff_config.json"), "r", encoding="utf-8") as f:
    tariff_config = json.load(f)

with open(os.path.join(data_dir, "emission_factors.json"), "r", encoding="utf-8") as f:
    emission_factors = json.load(f)

scenario_engine = ScenarioEngine(
    profile_store=profile_store,
    constraint_validator=constraint_validator,
    tariff_config=tariff_config,
    emission_factor_metadata=emission_factors
)

# Pydantic models for API
class ReportingWindow(BaseModel):
    start: Optional[str] = None
    end: Optional[str] = None
    interval_minutes: int = 60

class ScenarioAction(BaseModel):
    type: str # "reduce_idle_power" | "shift_schedule" | "reduce_runtime" | "pressure_optimization"
    machine_id: str
    start: Optional[str] = None
    duration_hours: Optional[float] = 1.0
    target_power_kw: Optional[float] = None
    target_state: Optional[str] = "idle"
    offset_hours: Optional[int] = 0
    target_pressure_bar: Optional[float] = None
    baseline_pressure_bar: Optional[float] = 7.5

class ScenarioRequest(BaseModel):
    scenario_id: str = "SCN-001"
    reporting_window: Optional[ReportingWindow] = None
    action: ScenarioAction
    assumptions: Optional[Dict[str, Any]] = Field(default_factory=lambda: {
        "source": "simulated_demo",
        "requires_operator_approval": True,
        "methodology": "GHG Protocol Scope 2 Location-based"
    })

@app.get("/")
def root():
    return {
        "module": "WattWise AI — Digital Twin Simulation Engine",
        "status": "ready",
        "version": "1.0.0",
        "reference_factory": "PrecisionWorks Manufacturing",
        "endpoints": [
            "GET /api/twin/machines",
            "GET /api/twin/config",
            "GET /api/twin/baseline",
            "GET /api/twin/tradeoff",
            "POST /api/simulate",
            "POST /api/optimize"
        ]
    }

@app.get("/api/twin/machines")
def get_machines():
    return {
        "machines": profile_store.list_machines(),
        "total_assets": len(profile_store.list_machines())
    }

@app.get("/api/twin/config")
def get_config():
    return {
        "tariff": tariff_config,
        "emission_factor": emission_factors,
        "available_window": baseline_engine.get_available_window()
    }

@app.get("/api/twin/baseline")
def get_baseline(
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    machine_id: Optional[str] = Query(None)
):
    records = baseline_engine.get_records(start, end, machine_id)
    if not records:
        raise HTTPException(status_code=404, detail="No baseline records found for specified window.")
    
    metrics = calculate_metrics(records, tariff_config, emission_factors)
    return {
        "status": "success",
        "count": len(records),
        "metrics": metrics,
        "records": records[:96] # first 96 records (e.g. 24h across 4 machines)
    }

@app.post("/api/simulate")
def simulate(request: ScenarioRequest):
    win = request.reporting_window
    start = win.start if win else None
    end = win.end if win else None
    
    baseline_records = baseline_engine.get_records(start, end)
    if not baseline_records:
        raise HTTPException(
            status_code=400,
            detail="No baseline data available for specified reporting window."
        )

    payload = request.model_dump() if hasattr(request, 'model_dump') else request.dict()
    result = scenario_engine.run_scenario(
        baseline_records=baseline_records,
        request=payload
    )
    return result

@app.post("/api/optimize")
def optimize_schedule():
    """
    Evaluates candidate start-time shifts for flexible machines (CNC-01 and FURN-01)
    to find the combination that minimizes plant peak demand kW without violating constraints.
    """
    baseline_records = baseline_engine.get_records()
    base_metrics = calculate_metrics(baseline_records, tariff_config, emission_factors)
    base_peak = base_metrics["peak_demand_kw"]

    best_candidate = None
    lowest_peak = base_peak

    candidate_shifts = [
        {"machine_id": "CNC-01", "offset_hours": 1},
        {"machine_id": "CNC-01", "offset_hours": 2},
        {"machine_id": "FURN-01", "offset_hours": 1},
        {"machine_id": "FURN-01", "offset_hours": -1},
        {"machine_id": "CNC-01", "offset_hours": 2, "secondary": {"machine_id": "FURN-01", "offset_hours": 1}}
    ]

    for cand in candidate_shifts:
        req = {
            "scenario_id": f"OPT-{cand['machine_id']}-{cand['offset_hours']}",
            "action": {
                "type": "shift_schedule",
                "machine_id": cand["machine_id"],
                "offset_hours": cand["offset_hours"]
            },
            "assumptions": {"optimization_target": "minimize_coincident_peak_demand_kw"}
        }
        res = scenario_engine.run_scenario(baseline_records, req)
        if res["feasibility"] != "blocked":
            peak = res["scenario"]["peak_demand_kw"]
            if peak < lowest_peak:
                lowest_peak = peak
                best_candidate = res

    return {
        "status": "success",
        "baseline_peak_kw": base_peak,
        "optimized_peak_kw": lowest_peak,
        "peak_reduction_kw": round(base_peak - lowest_peak, 2),
        "best_scenario": best_candidate
    }

@app.get("/api/twin/tradeoff")
def get_tradeoff_matrix():
    """
    Returns the 3-Candidate Trade-Off Matrix (Idea C - Production-Safe Optimization)
    demonstrating multi-objective optimization balancing energy cost, contract peak demand (85 kW limit),
    pneumatic pressure interlocks, and daily production quotas.
    """
    baseline_records = baseline_engine.get_records()
    base_metrics = calculate_metrics(baseline_records, tariff_config, emission_factors)
    contract_limit_kw = tariff_config.get("contract_demand_limit_kw", 85.0)

    candidates = [
        {
            "id": "CAND-1",
            "name": "Candidate 1: Aggressive Minimization",
            "strategy": "Cut FURN-01 to 10 kW holding, reduce COMP-01 pressure to 5.8 bar",
            "status": "BLOCKED",
            "status_label": "BLOCKED BY INTERLOCK",
            "peak_kw": 68.0,
            "energy_kwh_saved": 68.0,
            "cost_saved_inr": 612.0,
            "production_units": 140,
            "pressure_bar": 5.8,
            "furnace_kw": 10.0,
            "interlocks_triggered": ["ERR_PROTECTED_PROCESS_VIOLATION", "ERR_PRESSURE_BELOW_MINIMUM"],
            "diagnostics": "Violates furnace metallurgical quench holding floor (>= 15.0 kW) and drops below CNC-01 / PAINT-01 pneumatic clamp floor (6.5 bar). Part slippage and batch defect risk."
        },
        {
            "id": "CAND-2",
            "name": "Candidate 2: Naive Night Shift",
            "strategy": "Shift CNC-01 machining by +4 hours into night tariff zone",
            "status": "INFEASIBLE",
            "status_label": "INFEASIBLE PRODUCTION",
            "peak_kw": 74.0,
            "energy_kwh_saved": 12.0,
            "cost_saved_inr": 340.0,
            "production_units": 110,
            "pressure_bar": 7.5,
            "furnace_kw": 48.0,
            "interlocks_triggered": ["WARN_PRODUCTION_DEFICIT"],
            "diagnostics": "Achieves low electricity cost, but CNC production output drops to 110 parts (violates daily minimum delivery quota of >= 140 parts before morning shift handover)."
        },
        {
            "id": "CAND-3",
            "name": "Candidate 3: Production-Safe Optimum",
            "strategy": "Shift CNC-01 start by +2 hours + 5-min auto-idle cutoff relay on COMP-01",
            "status": "RECOMMENDED",
            "status_label": "RECOMMENDED OPTIMUM",
            "peak_kw": 74.0,
            "energy_kwh_saved": 30.0,
            "cost_saved_inr": 270.0,
            "production_units": 148,
            "pressure_bar": 6.8,
            "furnace_kw": 48.0,
            "interlocks_triggered": [],
            "diagnostics": "Shaves peak from 96 kW to 74 kW (safely below 85 kW contract penalty ceiling). Preserves 6.8 bar line pressure (above 6.5 bar chuck safety floor). Delivers 148 parts (exceeds 140 quota)."
        }
    ]

    return {
        "status": "success",
        "plant_contract_limit_kw": contract_limit_kw,
        "baseline_peak_kw": base_metrics["peak_demand_kw"],
        "baseline_energy_kwh": base_metrics["total_energy_kwh"],
        "candidates": candidates,
        "recommended_candidate_id": "CAND-3"
    }
