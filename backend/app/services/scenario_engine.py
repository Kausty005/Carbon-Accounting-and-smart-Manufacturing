from copy import deepcopy
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .twin_metrics import calculate_metrics, calculate_deltas

class ScenarioEngine:
    def __init__(self, profile_store, constraint_validator, tariff_config, emission_factor_metadata):
        self.profile_store = profile_store
        self.constraint_validator = constraint_validator
        self.tariff_config = tariff_config
        self.emission_factor_metadata = emission_factor_metadata

    def run_scenario(
        self,
        baseline_records: List[Dict[str, Any]],
        request: Dict[str, Any]
    ) -> Dict[str, Any]:
        scenario_id = request.get("scenario_id", "SCN-001")
        action = request.get("action", {})
        assumptions = request.get("assumptions", {})
        
        # Copy baseline: original is strictly immutable
        scenario_records = deepcopy(baseline_records)

        # Apply action transformation
        action_type = action.get("type", "")
        if action_type == "reduce_idle_power":
            self._apply_reduce_idle(scenario_records, action)
        elif action_type == "shift_schedule":
            self._apply_shift_schedule(scenario_records, action)
        elif action_type == "reduce_runtime":
            self._apply_reduce_runtime(scenario_records, action)
        elif action_type == "pressure_optimization":
            self._apply_pressure_opt(scenario_records, action)

        # Validate process constraints
        feasibility, violations = self.constraint_validator.validate_scenario(
            scenario_records, action, baseline_records
        )

        # Calculate metrics
        baseline_metrics = calculate_metrics(
            baseline_records, self.tariff_config, self.emission_factor_metadata
        )
        scenario_metrics = calculate_metrics(
            scenario_records, self.tariff_config, self.emission_factor_metadata
        )
        deltas = calculate_deltas(baseline_metrics, scenario_metrics)

        # Window metadata
        timestamps = sorted(list(set(r["timestamp"] for r in baseline_records)))
        window = {
            "start": timestamps[0] if timestamps else "",
            "end": timestamps[-1] if timestamps else "",
            "interval_minutes": 60,
            "total_slots": len(timestamps)
        }

        return {
            "scenario_id": scenario_id,
            "status": "simulation_only",
            "feasibility": feasibility,
            "data_source": "simulated",
            "window": window,
            "baseline": baseline_metrics,
            "scenario": scenario_metrics,
            "deltas": deltas,
            "constraint_violations": violations,
            "assumptions": assumptions,
            "requires_operator_approval": True,
            "action_executed": action
        }

    def _apply_reduce_idle(self, records: List[Dict[str, Any]], action: Dict[str, Any]):
        mid = action.get("machine_id")
        start_str = action.get("start")
        duration_hours = float(action.get("duration_hours", 1.0))
        target_kw = float(action.get("target_power_kw", 8.0))
        target_state = action.get("target_state", "idle")

        start_dt = datetime.fromisoformat(start_str) if start_str else None
        end_dt = start_dt + timedelta(hours=duration_hours) if start_dt else None

        for r in records:
            if r["machine_id"] != mid:
                continue
            r_dt = datetime.fromisoformat(r["timestamp"])
            if start_dt and end_dt:
                if start_dt <= r_dt < end_dt:
                    # Partial hour fraction handling
                    elapsed_in_slot = 1.0
                    r["power_kw"] = target_kw
                    r["energy_kwh"] = target_kw * elapsed_in_slot
                    r["machine_state"] = target_state

    def _apply_shift_schedule(self, records: List[Dict[str, Any]], action: Dict[str, Any]):
        mid = action.get("machine_id")
        offset_hours = int(action.get("offset_hours", 0))
        if offset_hours == 0:
            return

        # Extract only this machine's records sorted by timestamp
        machine_recs = [r for r in records if r["machine_id"] == mid]
        machine_recs.sort(key=lambda x: x["timestamp"])

        # Shift the power and state values forward or backward by offset_hours
        n = len(machine_recs)
        original_states = [(r["power_kw"], r["energy_kwh"], r["machine_state"], r["production_units"]) for r in machine_recs]
        
        default_off = (0.8, 0.8, "off", 0.0)

        for i in range(n):
            src_idx = i - offset_hours
            if 0 <= src_idx < n:
                kw, kwh, state, prod = original_states[src_idx]
            else:
                kw, kwh, state, prod = default_off
            
            machine_recs[i]["power_kw"] = kw
            machine_recs[i]["energy_kwh"] = kwh
            machine_recs[i]["machine_state"] = state
            machine_recs[i]["production_units"] = prod

    def _apply_reduce_runtime(self, records: List[Dict[str, Any]], action: Dict[str, Any]):
        mid = action.get("machine_id")
        cut_hours = int(action.get("cut_hours", 1))
        # Find machine running records and turn the last N hours to off/idle
        m_running = [r for r in records if r["machine_id"] == mid and r["machine_state"] == "running"]
        for r in m_running[-cut_hours:]:
            r["power_kw"] = 0.8
            r["energy_kwh"] = 0.8
            r["machine_state"] = "off"
            r["production_units"] = 0.0

    def _apply_pressure_opt(self, records: List[Dict[str, Any]], action: Dict[str, Any]):
        mid = action.get("machine_id", "COMP-01")
        target_bar = float(action.get("target_pressure_bar", 6.8))
        base_bar = float(action.get("baseline_pressure_bar", 7.5))
        delta_bar = max(0.0, base_bar - target_bar)
        # 1% power reduction per 0.1 bar reduction -> (delta_bar * 10) percent
        pct_savings = min(0.15, (delta_bar * 10.0) / 100.0)

        for r in records:
            if r["machine_id"] == mid and r["machine_state"] == "running":
                r["power_kw"] = round(r["power_kw"] * (1.0 - pct_savings), 2)
                r["energy_kwh"] = r["power_kw"]
