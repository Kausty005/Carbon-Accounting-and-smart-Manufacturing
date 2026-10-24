from typing import List, Dict, Any, Optional
from datetime import datetime

def get_hour_tariff_rate(timestamp_str: str, tariff_config: Dict[str, Any]) -> float:
    base_rate = tariff_config.get("energy_rate_inr_per_kwh", 9.0)
    tou_rates = tariff_config.get("tou_rates", [])
    if not tou_rates:
        return base_rate
    
    try:
        dt = datetime.fromisoformat(timestamp_str)
        hour = dt.hour
        for tier in tou_rates:
            if hour in tier.get("hours", []):
                return tier.get("rate_inr_per_kwh", base_rate)
    except Exception:
        pass
    return base_rate

def calculate_metrics(
    records: List[Dict[str, Any]],
    tariff_config: Dict[str, Any],
    emission_factor_metadata: Optional[Dict[str, Any]] = None,
    interval_hours: float = 1.0
) -> Dict[str, Any]:
    if not records:
        return {
            "total_energy_kwh": 0.0,
            "peak_demand_kw": 0.0,
            "peak_timestamp": None,
            "energy_cost_inr": 0.0,
            "demand_penalty_inr": 0.0,
            "total_cost_inr": 0.0,
            "scope2_kg_co2e": None,
            "by_machine": {}
        }

    total_energy_kwh = 0.0
    energy_cost_inr = 0.0
    slot_power: Dict[str, float] = {}
    by_machine: Dict[str, Dict[str, float]] = {}

    for r in records:
        mid = r["machine_id"]
        ts = r["timestamp"]
        p_kw = float(r.get("power_kw", 0.0))
        # Interval energy = average power * interval duration
        e_kwh = float(r.get("energy_kwh", p_kw * interval_hours))
        
        total_energy_kwh += e_kwh
        rate = get_hour_tariff_rate(ts, tariff_config)
        energy_cost_inr += e_kwh * rate

        slot_power[ts] = slot_power.get(ts, 0.0) + p_kw

        if mid not in by_machine:
            by_machine[mid] = {"energy_kwh": 0.0, "max_power_kw": 0.0}
        by_machine[mid]["energy_kwh"] += e_kwh
        if p_kw > by_machine[mid]["max_power_kw"]:
            by_machine[mid]["max_power_kw"] = p_kw

    # Find peak demand and timestamp
    peak_demand_kw = 0.0
    peak_timestamp = None
    for ts, kw in slot_power.items():
        if kw > peak_demand_kw:
            peak_demand_kw = kw
            peak_timestamp = ts

    # Demand charge / limit penalty
    contract_limit = float(tariff_config.get("contract_demand_limit_kw", 85.0))
    penalty_rate = float(tariff_config.get("demand_penalty_charge_inr_per_kw", 350.0))
    demand_penalty_inr = 0.0
    if peak_demand_kw > contract_limit:
        demand_penalty_inr = round((peak_demand_kw - contract_limit) * penalty_rate, 2)

    total_cost_inr = round(energy_cost_inr + demand_penalty_inr, 2)

    # Scope 2 emissions
    scope2_kg_co2e = None
    if emission_factor_metadata and "kg_co2e_per_kwh" in emission_factor_metadata:
        factor = float(emission_factor_metadata["kg_co2e_per_kwh"])
        scope2_kg_co2e = round(total_energy_kwh * factor, 3)

    return {
        "total_energy_kwh": round(total_energy_kwh, 2),
        "peak_demand_kw": round(peak_demand_kw, 2),
        "peak_timestamp": peak_timestamp,
        "contract_demand_limit_kw": contract_limit,
        "peak_exceedance_kw": round(max(0.0, peak_demand_kw - contract_limit), 2),
        "energy_cost_inr": round(energy_cost_inr, 2),
        "demand_penalty_inr": demand_penalty_inr,
        "total_cost_inr": total_cost_inr,
        "scope2_kg_co2e": scope2_kg_co2e,
        "by_machine": by_machine,
        "time_slot_power": slot_power
    }

def calculate_deltas(baseline: Dict[str, Any], scenario: Dict[str, Any]) -> Dict[str, Any]:
    # Sign convention as required by Section 9.1 & 11.2: scenario minus baseline
    # Negative value means reduction
    e_delta = round(scenario["total_energy_kwh"] - baseline["total_energy_kwh"], 2)
    c_delta = round(scenario["total_cost_inr"] - baseline["total_cost_inr"], 2)
    p_delta = round(scenario["peak_demand_kw"] - baseline["peak_demand_kw"], 2)
    
    s2_delta = None
    if scenario.get("scope2_kg_co2e") is not None and baseline.get("scope2_kg_co2e") is not None:
        s2_delta = round(scenario["scope2_kg_co2e"] - baseline["scope2_kg_co2e"], 3)

    # UI friendly savings (baseline - scenario)
    savings = {
        "energy_kwh": round(-e_delta, 2),
        "cost_inr": round(-c_delta, 2),
        "peak_kw": round(-p_delta, 2),
        "scope2_kg_co2e": round(-s2_delta, 3) if s2_delta is not None else None
    }

    return {
        "energy_kwh": e_delta,
        "cost_inr": c_delta,
        "peak_kw": p_delta,
        "scope2_kg_co2e": s2_delta,
        "savings_positive": savings
    }
