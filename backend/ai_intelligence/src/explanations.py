"""
Evidence-Based Anomaly Explanation & Action Recommendation Engine.
Produces structured, auditable explanation records adhering to the hackathon schema.
Supports:
1. Reheat Furnace (FURNACE-01)
2. Rotary Screw Compressor (AIR-COMP-01)
3. Precision CNC Machining Center (CNC-01)
4. Chilled Water Cooling System (CHILLER-01)

Strictly decouples equipment health degradation from excess energy waste.
Clearly labels hypotheses as possible non-confirmed causes.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


def determine_severity(
    deviation_pct: Optional[float] = None,
    z_score: Optional[float] = None,
    anomaly_type: Optional[str] = None,
    given_severity: Optional[str] = None,
) -> str:
    """
    Determine severity based on documented thresholds and safety rules.
    Respects ground-truth simulation severity when provided.
    """
    if given_severity and given_severity.lower() in ["critical", "high", "medium", "low"]:
        return given_severity.lower()

    dev = abs(deviation_pct) if deviation_pct is not None else 0.0
    z = abs(z_score) if z_score is not None else 0.0
    atype = str(anomaly_type).lower() if anomaly_type else ""

    if dev >= 50.0 or z >= 4.0 or atype in ["temperature_overshoot", "thermal_runaway", "reduced_cooling_effectiveness"]:
        return "critical"
    elif dev >= 30.0 or z >= 3.0 or atype in ["bearing_degradation", "pressure_loss_leak", "tool_wear_chatter", "slow_heating", "door_open_heat_loss"]:
        return "high"
    elif dev >= 15.0 or z >= 2.0 or atype in ["excessive_idle_energy", "excessive_unload_operation", "excessive_idle_heating", "low_delta_t_syndrome", "excessive_low_demand_operation"]:
        return "medium"
    return "low"


def get_machine_possible_causes(eq_type: str, anomaly_type: str) -> List[str]:
    """Return physical non-confirmed hypothesis causes for decision support."""
    atype = str(anomaly_type).lower()
    etype = str(eq_type).lower()

    if "furnace" in etype:
        if "overshoot" in atype:
            return [
                "SCR power controller thyristor short-circuit or analog gate control latch-up",
                "Thermocouple calibration drift causing negative feedback delay in PID controller",
                "Cooling damper failure or auxiliary air exhaust fan interlock trip",
            ]
        elif "slow_heating" in atype:
            return [
                "Open-circuit failure in one or more electric heating element banks",
                "Ceramic fiber refractory insulation breakdown and structural thermal bridge",
                "Sub-nominal incoming line voltage under heavy plant substation loading",
            ]
        elif "idle" in atype:
            return [
                "Night-shift heating setpoint schedule override not reset to 200 °C standby",
                "Furnace charge door limit switch stuck in closed position while chamber empty",
            ]
        elif "door" in atype:
            return [
                "Pneumatic door hoist cylinder leakage or hydraulic counterweight jam",
                "Manual operator override left door unsealed during soak cycle",
            ]

    elif "compressor" in etype or "air-comp" in etype:
        if "leak" in atype or "pressure" in atype:
            return [
                "Pneumatic distribution header rupture, unseated drain valve, or loose quick-coupling",
                "Compressor minimum pressure check-valve internal seal degradation",
                "Air dryer pre-filter differential pressure saturation or bypass leak",
            ]
        elif "unload" in atype:
            return [
                "Auto-dual shutdown timer configured too high (>20 min) for intermittent shift",
                "Inlet throttle valve actuator sticking in partially open position",
            ]
        elif "bearing" in atype:
            return [
                "Synthetic compressor lube oil breakdown, varnish buildup, or particulate contamination",
                "Male/female rotor thrust bearing sub-surface fatigue spalling",
                "Motor-compressor flexible coupling elastomeric element wear",
            ]

    elif "cnc" in etype:
        if "chatter" in atype or "wear" in atype:
            return [
                "Cutting insert micro-chipping, excessive flank wear, or thermal cratering",
                "Toolholder collet chuck clamping force loss or drawbar spring fatigue",
                "Workpiece clamping fixture resonance under high material removal rate",
            ]
        elif "bearing" in atype:
            return [
                "High-speed spindle ceramic hybrid bearing grease starvation or seal contamination",
                "Spindle shaft dynamic unbalance or toolholder taper runout (>3 µm)",
            ]
        elif "idle" in atype:
            return [
                "Operator shift changeover leaving auxiliary hydraulic pump and chiller active",
                "CNC control standby sleep mode parameter disabled in machine constants",
            ]

    elif "chiller" in etype:
        if "delta_t" in atype:
            return [
                "Terminal air-handler 3-way control valves stuck open, bypassing chilled water",
                "Excessive chilled water pumping rate exceeding building cooling coil heat transfer capacity",
                "Air-handler cooling coil air-side fouling or clogged strainers",
            ]
        elif "cooling" in atype:
            return [
                "Condenser tube scale accumulation or cooling tower high wet-bulb approach",
                "Refrigerant undercharge, thermal expansion valve restriction, or non-condensable gas in condenser",
            ]
        elif "low_demand" in atype:
            return [
                "Chiller plant staging logic running base centrifugal unit instead of small auxiliary chiller",
                "Free-cooling plate heat exchanger economizer bypass not engaged during cool ambient conditions",
            ]

    return [
        "Multivariate operating point excursion beyond nominal historical envelope",
        "Sensor transducer drift or electrical noise coupling on analog signal loop",
    ]


def generate_anomaly_record(
    row: pd.Series,
    model_name: str,
    model_score: Optional[float] = None,
    expected_power_kw: Optional[float] = None,
    deviation_kw: Optional[float] = None,
    deviation_pct: Optional[float] = None,
    estimated_excess_energy_kwh: Optional[float] = None,
    baseline_method: str = "Condition-aware baseline (equipment_id + operating_mode)",
) -> Dict[str, Any]:
    """
    Generate an auditable, evidence-backed anomaly record for an individual reading.
    Distinguishes equipment health anomalies from excess energy waste.
    """
    evidence: List[str] = []
    recommendations: List[str] = []

    equipment_id = str(row.get("equipment_id", "UNKNOWN"))
    eq_type = str(row.get("equipment_type", "industrial_machine"))
    ts_val = row.get("timestamp", None)
    timestamp_str = ts_val.isoformat() if hasattr(ts_val, "isoformat") else str(ts_val)
    operating_mode = str(row.get("operating_mode", "normal"))
    actual_power = float(row["power_consumption_kw"]) if pd.notnull(row.get("power_consumption_kw")) else None

    # Check ground-truth anomaly type and energy waste status if simulated
    sim_type = row.get("anomaly_type")
    is_waste_ground_truth = bool(row.get("is_energy_waste", False))

    # 1. Energy Analysis
    has_energy_waste = False
    if actual_power is not None and expected_power_kw is not None:
        if deviation_pct is not None and deviation_pct >= 15.0:
            has_energy_waste = True
            evidence.append(
                f"Active electrical power ({actual_power:.2f} kW) is {deviation_pct:.1f}% above "
                f"calibrated condition baseline ({expected_power_kw:.2f} kW) for {operating_mode} mode."
            )
            recommendations.append("Inspect operating demand, motor loading, and recent process recipe setpoints.")
        elif deviation_pct is not None and deviation_pct <= -15.0:
            evidence.append(
                f"Active electrical power ({actual_power:.2f} kW) is {abs(deviation_pct):.1f}% below "
                f"expected baseline ({expected_power_kw:.2f} kW) for {operating_mode} mode."
            )
        else:
            evidence.append(f"Power consumption ({actual_power:.2f} kW) is within normal operating limits for {operating_mode} mode (no excess energy waste).")

    # If simulation specifically labelled this as energy waste, retain flag
    if is_waste_ground_truth:
        has_energy_waste = True

    # 2. Machine-Specific Physical Sensor Evidence
    # A. Furnace
    if "furnace" in eq_type.lower() or "furnace" in equipment_id.lower():
        temp = row.get("temperature_c")
        setpoint = row.get("temp_setpoint_c")
        door = row.get("door_open")
        if pd.notnull(temp):
            t_val = float(temp)
            if t_val > 920.0:
                evidence.append(f"Furnace chamber temperature ({t_val:.1f} °C) is dangerously elevated (rated limit: 920 °C).")
                recommendations.append("Immediately disengage heating contactors and verify emergency cooling dampers.")
            elif setpoint is not None and pd.notnull(setpoint) and abs(t_val - float(setpoint)) > 60.0:
                evidence.append(f"Temperature deviation: measured {t_val:.1f} °C vs programmed setpoint {float(setpoint):.1f} °C.")
                recommendations.append("Check temperature controller PID parameters and inspect heating element resistance.")
        if door == 1 and operating_mode in ["heating", "holding"]:
            evidence.append("Furnace door open interlock active during high-temperature cycle.")
            recommendations.append("Close furnace door immediately and verify door seal compression.")

    # B. Compressor
    elif "compressor" in eq_type.lower() or "air-comp" in equipment_id.lower():
        pressure = row.get("discharge_pressure_bar")
        vib = row.get("vibration_mm_s")
        flow = row.get("airflow_cfm")
        if pd.notnull(pressure) and float(pressure) < 6.0 and operating_mode == "load":
            evidence.append(f"Discharge header pressure ({float(pressure):.2f} bar) is below operating pressure minimum (6.5 bar).")
            recommendations.append("Perform ultrasonic acoustic survey to identify downstream pneumatic leaks.")
        if pd.notnull(vib) and float(vib) > 5.0:
            evidence.append(f"Compressor drive vibration ({float(vib):.2f} mm/s) exceeds ISO 10816 Zone D critical threshold (5.0 mm/s).")
            recommendations.append("Schedule emergency vibration spectral analysis; inspect rotor thrust bearings.")

    # C. CNC
    elif "cnc" in eq_type.lower() or "cnc" in equipment_id.lower():
        vib = row.get("vibration_mm_s")
        rpm = row.get("spindle_rpm")
        load_pct = row.get("spindle_load_pct")
        if pd.notnull(vib) and float(vib) > 4.5:
            evidence.append(f"Spindle vibration ({float(vib):.2f} mm/s) indicates severe cutting chatter or bearing degradation.")
            recommendations.append("Inspect toolholder collet, check insert cutting edge flank wear, and rebalance tool.")
        if operating_mode == "idle" and actual_power is not None and actual_power > 4.5:
            evidence.append(f"CNC drawing {actual_power:.1f} kW during idle standby with spindle stationary.")
            recommendations.append("Review auto-standby power management parameters.")

    # D. Chiller
    elif "chiller" in eq_type.lower() or "chiller" in equipment_id.lower():
        delta_t = row.get("delta_t_c")
        supply = row.get("supply_temp_c")
        if pd.notnull(delta_t) and float(delta_t) < 2.5 and operating_mode == "running":
            evidence.append(f"Chilled water ΔT is degraded ({float(delta_t):.1f} °C vs 5.5 °C nominal design), causing Low Delta-T Syndrome.")
            recommendations.append("Inspect 3-way air handler modulating bypass valves and rebalance chilled water distribution loops.")
        if pd.notnull(supply) and float(supply) > 10.5 and operating_mode == "running":
            evidence.append(f"Supply water temperature ({float(supply):.1f} °C) is failing to reach 7.0 °C setpoint.")
            recommendations.append("Inspect condenser approach temperature and check refrigerant circuit pressure.")

    # General vibration fallback
    if not any("vibration" in e.lower() for e in evidence):
        vib_gen = row.get("vibration_mm_s")
        if pd.notnull(vib_gen) and float(vib_gen) > 0.40:
            evidence.append(f"Mechanical vibration level ({float(vib_gen):.3f} mm/s) is elevated above baseline.")
            recommendations.append("Perform acoustic & vibration spectrum inspection.")

    # General fallback
    if not evidence:
        evidence.append(f"Multivariate sensor telemetry deviated from historical baseline in {operating_mode} mode.")
    if not recommendations:
        recommendations.append("Conduct visual and diagnostic inspection of equipment subsystems.")

    # Anomaly type determination
    inferred_type = sim_type if sim_type and str(sim_type) != "normal" else None
    if not inferred_type:
        if any("vibration" in e.lower() for e in evidence):
            inferred_type = "bearing_degradation"
        elif any("temperature" in e.lower() for e in evidence):
            inferred_type = "temperature_overshoot"
        elif any("pressure" in e.lower() for e in evidence):
            inferred_type = "pressure_loss_leak"
        elif has_energy_waste:
            inferred_type = "excessive_power_consumption"
        else:
            inferred_type = "multivariate_sensor_anomaly"

    severity = determine_severity(
        deviation_pct=deviation_pct if has_energy_waste else None,
        z_score=row.get("power_z_score"),
        anomaly_type=str(inferred_type),
        given_severity=row.get("severity"),
    )

    possible_causes = get_machine_possible_causes(eq_type, str(inferred_type))

    return {
        "equipment_id": equipment_id,
        "equipment_type": eq_type,
        "timestamp": timestamp_str,
        "is_anomaly": True,
        "anomaly_type": str(inferred_type),
        "severity": severity,
        "actual_power_kw": round(actual_power, 2) if actual_power is not None else None,
        "expected_power_kw": round(expected_power_kw, 2) if expected_power_kw is not None else None,
        "deviation_kw": round(deviation_kw, 2) if deviation_kw is not None else None,
        "deviation_pct": round(deviation_pct, 2) if deviation_pct is not None else None,
        "model_name": model_name,
        "model_score": round(float(model_score), 4) if model_score is not None else None,
        "evidence": evidence,
        "possible_causes": possible_causes,
        "recommended_action": "; ".join(recommendations),
        "is_energy_waste": has_energy_waste,
        "estimated_excess_energy_kwh": (
            round(float(estimated_excess_energy_kwh), 4)
            if has_energy_waste and estimated_excess_energy_kwh is not None and estimated_excess_energy_kwh > 0
            else None
        ),
    }
