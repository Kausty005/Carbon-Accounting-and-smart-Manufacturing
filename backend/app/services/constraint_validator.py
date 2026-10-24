from typing import List, Dict, Any, Tuple

class ConstraintValidator:
    def __init__(self, profile_store):
        self.profile_store = profile_store

    def validate_scenario(
        self,
        scenario_records: List[Dict[str, Any]],
        action: Dict[str, Any],
        baseline_records: List[Dict[str, Any]]
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Validates the scenario and returns:
          feasibility: "feasible" | "review_required" | "blocked"
          violations: List of violation objects {code, severity, machine_id, message}
        """
        violations = []
        action_type = action.get("type", "")
        machine_id = action.get("machine_id", "")
        profile = self.profile_store.get_profile(machine_id)

        # 1. Machine existence check
        if not profile:
            violations.append({
                "code": "ERR_UNKNOWN_MACHINE",
                "severity": "error",
                "machine_id": machine_id,
                "message": f"Machine ID '{machine_id}' is not recognized in factory profiles."
            })
            return "blocked", violations

        rated_kw = float(profile.get("rated_power_kw", 100.0))
        permitted_states = profile.get("permitted_states", ["running", "idle", "off"])
        constraints = profile.get("constraints", {})

        # 2. Power bounds check
        target_power = action.get("target_power_kw")
        if target_power is not None:
            if target_power < 0:
                violations.append({
                    "code": "ERR_POWER_NEGATIVE",
                    "severity": "error",
                    "machine_id": machine_id,
                    "message": f"Target power ({target_power} kW) cannot be negative."
                })
            elif target_power > rated_kw:
                violations.append({
                    "code": "ERR_POWER_EXCEEDS_RATED",
                    "severity": "error",
                    "machine_id": machine_id,
                    "message": f"Target power ({target_power} kW) exceeds rated capacity ({rated_kw} kW) of {machine_id}."
                })

        # 3. State check
        target_state = action.get("target_state")
        if target_state and target_state not in permitted_states:
            violations.append({
                "code": "ERR_INVALID_STATE",
                "severity": "error",
                "machine_id": machine_id,
                "message": f"Proposed state '{target_state}' is not permitted for {machine_id}. Allowed: {permitted_states}."
            })

        # 4. Protected process block check (e.g. FURN-01)
        if constraints.get("protected_process_block") or constraints.get("cannot_interrupt_holding_cycle"):
            # Check if action attempts to interrupt a running heating/holding cycle
            if action_type in ["reduce_idle_power", "reduce_runtime"] and target_power is not None:
                # If target power is drastically cut during active holding
                if target_power < float(profile.get("expected_idle_power_kw", 15.0)):
                    violations.append({
                        "code": "ERR_PROTECTED_PROCESS_VIOLATION",
                        "severity": "error",
                        "machine_id": machine_id,
                        "message": f"Heat-treatment cycle on {machine_id} is a protected metallurgical process; cutting below thermal holding limit ({profile.get('expected_idle_power_kw')} kW) will ruin heat-treatment batch."
                    })

        # 5. Paint ventilation check (e.g. PAINT-01)
        if constraints.get("ventilation_mandatory_during_paint"):
            if action_type in ["reduce_idle_power", "reduce_runtime"]:
                # Check if paint line power is turned completely off during painting hours
                for r in scenario_records:
                    if r["machine_id"] == "PAINT-01" and r["machine_state"] == "running" and r["power_kw"] < 5.0:
                        violations.append({
                            "code": "ERR_VENTILATION_REQUIRED",
                            "severity": "error",
                            "machine_id": "PAINT-01",
                            "message": "Mandatory exhaust ventilation must remain active during painting operations for VOC environmental safety."
                        })
                        break

        # 6. Production target check (e.g. CNC-01)
        if constraints.get("production_target_required"):
            base_prod = sum(r["production_units"] for r in baseline_records if r["machine_id"] == machine_id)
            scen_prod = sum(r["production_units"] for r in scenario_records if r["machine_id"] == machine_id)
            min_target = float(constraints.get("min_daily_production_units", 100))
            if scen_prod < min_target:
                violations.append({
                    "code": "WARN_PRODUCTION_DEFICIT",
                    "severity": "warning",
                    "machine_id": machine_id,
                    "message": f"Simulated schedule achieves {scen_prod} parts, falling below daily production target of {min_target} parts."
                })

        # 7. Check if there are any blocking errors
        has_error = any(v["severity"] == "error" for v in violations)
        has_warning = any(v["severity"] == "warning" for v in violations)

        if has_error:
            return "blocked", violations

        # Every valid scenario is an advisory simulation requiring human sign-off
        violations.append({
            "code": "INFO_OPERATOR_APPROVAL_REQUIRED",
            "severity": "info",
            "machine_id": machine_id,
            "message": "Scenario passed digital twin validation. Human operator sign-off required prior to plant implementation."
        })

        if has_warning:
            return "review_required", violations
        return "feasible", violations
