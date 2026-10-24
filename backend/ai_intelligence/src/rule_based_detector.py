"""
Rule-Based Equipment Limit & Plausibility Checker.
Applies physical engineering limits and plausibility constraints specific to:
- FURNACE-01 (Furnace)
- AIR-COMP-01 (Air Compressor)
- CNC-01 (CNC Machine)
- CHILLER-01 (Chilled Water System)

Distinguishes between Equipment Health alerts, Energy Waste events, and Sensor Malfunctions.
All outputs are decision-support hypotheses requiring physical verification.
"""

from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np


class RuleBasedEquipmentChecker:
    """
    Evaluates machine telemetry against physical engineering constraints and operational limits.
    """

    def evaluate_row(self, row: pd.Series) -> Optional[Dict[str, Any]]:
        """
        Evaluate a single telemetry reading against machine-specific rules.
        Returns None if normal, or dict with anomaly details.
        """
        eq_id = str(row.get("equipment_id", ""))
        eq_type = str(row.get("equipment_type", "")).lower()
        mode = str(row.get("operating_mode", "")).lower()
        power = float(row.get("power_consumption_kw", 0.0) or 0.0)

        # ----------------------------------------------------------------------
        # 1. FURNACE RULES
        # ----------------------------------------------------------------------
        if eq_type == "furnace" or "furnace" in eq_id.lower():
            temp = row.get("temperature_c")
            setpoint = row.get("temp_setpoint_c")
            door_open = row.get("door_open")

            if temp is not None and not pd.isna(temp):
                temp = float(temp)
                # Sensor plausibility check
                if temp > 1200.0 or temp < 0.0:
                    return {
                        "anomaly_type": "sensor_malfunction",
                        "severity": "medium",
                        "is_energy_waste": False,
                        "category": "sensor_fault",
                        "evidence": [f"Furnace thermocouple reading ({temp} °C) exceeds physical chamber sensor envelope (0 - 1200 °C)."],
                        "recommended_action": "Inspect thermocouple probe junction, cabling, and transmitter calibration.",
                    }

                # Temperature overshoot check
                if temp > 930.0 or (setpoint is not None and pd.notnull(setpoint) and temp - float(setpoint) > 75.0):
                    return {
                        "anomaly_type": "temperature_overshoot",
                        "severity": "critical",
                        "is_energy_waste": True,
                        "category": "equipment_health",
                        "evidence": [f"Chamber temperature ({temp} °C) exceeds safety threshold (setpoint: {setpoint} °C)."],
                        "recommended_action": "Check SCR power controller, disengage heating elements, verify cooling damper actuation.",
                    }

            # Door open heat loss
            if door_open == 1 and mode in ["heating", "holding"] and power > 150.0:
                return {
                    "anomaly_type": "door_open_heat_loss",
                    "severity": "high",
                    "is_energy_waste": True,
                    "category": "energy_waste",
                    "evidence": ["Furnace door is open while heating elements draw high electrical power (>150 kW)."],
                    "recommended_action": "Close furnace charge door immediately; inspect door interlock limit switch.",
                }

            # Excessive idle heating
            if mode == "idle" and power > 50.0:
                return {
                    "anomaly_type": "excessive_idle_heating",
                    "severity": "high",
                    "is_energy_waste": True,
                    "category": "energy_waste",
                    "evidence": [f"Furnace drawing {power:.1f} kW during idle standby mode without active production batch."],
                    "recommended_action": "Verify idle setpoint schedule and ensure heating elements ramp down during unutilized shifts.",
                }

            # Slow heating
            if mode == "heating" and temp is not None and setpoint is not None and pd.notnull(setpoint):
                if float(setpoint) - float(temp) > 200.0 and power > 100.0 and power < 170.0:
                    return {
                        "anomaly_type": "slow_heating",
                        "severity": "high",
                        "is_energy_waste": True,
                        "category": "equipment_health",
                        "evidence": [f"Chamber temperature ({temp} °C) lagging setpoint ({setpoint} °C) despite active element draw."],
                        "recommended_action": "Inspect heating element banks for open-circuit failure or refractory insulation degradation.",
                    }

        # ----------------------------------------------------------------------
        # 2. AIR COMPRESSOR RULES
        # ----------------------------------------------------------------------
        elif eq_type == "air_compressor" or "compressor" in eq_id.lower() or "air-comp" in eq_id.lower():
            pressure = row.get("discharge_pressure_bar")
            vibration = row.get("vibration_mm_s")
            flow = row.get("airflow_cfm")

            # Pressure sensor plausibility
            if pressure is not None and not pd.isna(pressure):
                p_val = float(pressure)
                if p_val <= 0.0 or p_val > 14.0:
                    return {
                        "anomaly_type": "sensor_malfunction",
                        "severity": "medium",
                        "is_energy_waste": False,
                        "category": "sensor_fault",
                        "evidence": [f"Discharge pressure sensor reading ({p_val} bar) is outside valid operating range."],
                        "recommended_action": "Calibrate 4-20mA pressure transmitter and inspect sensor manifold connection.",
                    }

                # Pressure loss / Air leak
                if mode == "load" and p_val < 5.8 and power > 60.0:
                    return {
                        "anomaly_type": "pressure_loss_leak",
                        "severity": "high",
                        "is_energy_waste": True,
                        "category": "energy_waste",
                        "evidence": [f"Header pressure dropped to {p_val:.2f} bar while compressor draws full load power ({power:.1f} kW)."],
                        "recommended_action": "Perform ultrasonic acoustic leak survey across plant pneumatic distribution lines and drop legs.",
                    }

            # Mechanical bearing degradation
            if vibration is not None and not pd.isna(vibration):
                v_val = float(vibration)
                if v_val > 5.5:
                    return {
                        "anomaly_type": "bearing_degradation",
                        "severity": "critical",
                        "is_energy_waste": False,  # Health anomaly decoupled from energy waste
                        "category": "equipment_health",
                        "evidence": [f"Compressor drive-end vibration ({v_val:.2f} mm/s) exceeds ISO 10816 Zone D critical trip threshold (5.5 mm/s)."],
                        "recommended_action": "Schedule immediate bearing vibration spectrum analysis; inspect lube oil viscosity and metal particulate count.",
                    }

            # Excessive unload operation
            if mode == "unload" and power > 20.0 and (flow is None or float(flow or 0.0) < 30.0):
                return {
                    "anomaly_type": "excessive_unload_operation",
                    "severity": "medium",
                    "is_energy_waste": True,
                    "category": "energy_waste",
                    "evidence": [f"Compressor running unloaded drawing {power:.1f} kW with negligible CFM air output."],
                    "recommended_action": "Adjust compressor auto-dual timer to stop motor during sustained zero-demand intervals.",
                }

        # ----------------------------------------------------------------------
        # 3. CNC MACHINE RULES
        # ----------------------------------------------------------------------
        elif eq_type == "cnc_machine" or "cnc" in eq_id.lower():
            rpm = row.get("spindle_rpm")
            vibration = row.get("vibration_mm_s")
            spindle_load = row.get("spindle_load_pct")
            spindle_temp = row.get("spindle_temp_c")

            # RPM sensor dropout during cutting
            if mode == "cutting" and rpm is not None and float(rpm or 0.0) == 0.0 and power > 15.0:
                return {
                    "anomaly_type": "sensor_malfunction",
                    "severity": "medium",
                    "is_energy_waste": False,
                    "category": "sensor_fault",
                    "evidence": ["Spindle encoder reports 0 RPM while active cutting power is 20+ kW."],
                    "recommended_action": "Inspect spindle optical/magnetic rotary encoder wiring and cable shielding.",
                }

            # Spindle bearing degradation (Critical: combined high vibration and elevated bearing temperature)
            if vibration is not None and not pd.isna(vibration) and float(vibration) > 4.8:
                if spindle_temp is not None and float(spindle_temp or 0.0) > 70.0:
                    return {
                        "anomaly_type": "bearing_degradation",
                        "severity": "critical",
                        "is_energy_waste": False,
                        "category": "equipment_health",
                        "evidence": [f"Spindle vibration ({float(vibration):.2f} mm/s) and bearing temp ({float(spindle_temp):.1f} °C) both critically elevated."],
                        "recommended_action": "Check spindle cartridge lubrication, bearing preload, and thermal growth compensation.",
                    }

            # Tool wear chatter (Cutting mode high vibration with normal bearing temperature)
            if mode == "cutting" and vibration is not None and not pd.isna(vibration):
                v_val = float(vibration)
                if v_val > 4.5:
                    return {
                        "anomaly_type": "tool_wear_chatter",
                        "severity": "high",
                        "is_energy_waste": True,
                        "category": "equipment_health",
                        "evidence": [f"High cutting vibration ({v_val:.2f} mm/s) and elevated spindle load ({spindle_load}%)."],
                        "recommended_action": "Inspect cutting insert for flaking, chipping, or excessive flank wear; verify tool holding collet rigidity.",
                    }

            # Excessive idle energy
            if mode == "idle" and power > 4.5 and (rpm is None or float(rpm or 0.0) == 0.0):
                return {
                    "anomaly_type": "excessive_idle_energy",
                    "severity": "medium",
                    "is_energy_waste": True,
                    "category": "energy_waste",
                    "evidence": [f"CNC machine drawing {power:.1f} kW during idle mode with spindle stationary."],
                    "recommended_action": "Configure CNC automatic power-down timer for hydraulic power unit and auxiliary chip conveyors.",
                }

        # ----------------------------------------------------------------------
        # 4. CHILLED WATER COOLING SYSTEM RULES
        # ----------------------------------------------------------------------
        elif eq_type == "chilled_water_system" or "chiller" in eq_id.lower():
            supply = row.get("supply_temp_c")
            delta_t = row.get("delta_t_c")
            flow = row.get("water_flow_m3h")
            demand = row.get("cooling_demand_pct")

            # Flow sensor fault
            if mode == "running" and flow is not None and float(flow or 0.0) <= 0.0 and power > 50.0:
                return {
                    "anomaly_type": "sensor_malfunction",
                    "severity": "medium",
                    "is_energy_waste": False,
                    "category": "sensor_fault",
                    "evidence": ["Chilled water flow meter indicates 0 m³/h while compressor draws high electrical load."],
                    "recommended_action": "Inspect electromagnetic flow meter transducer signal cable and transmitter power supply.",
                }

            # Low Delta-T syndrome (Low COP energy waste)
            if mode == "running" and delta_t is not None and not pd.isna(delta_t):
                dt_val = float(delta_t)
                if dt_val < 2.5 and power > 90.0:
                    return {
                        "anomaly_type": "low_delta_t_syndrome",
                        "severity": "high",
                        "is_energy_waste": True,
                        "category": "energy_waste",
                        "evidence": [f"Chilled water ΔT is degraded ({dt_val:.1f} °C vs 5.5 °C design) causing compressor over-pumping."],
                        "recommended_action": "Inspect terminal air-handler 3-way bypass valves; rebalance secondary chilled water distribution.",
                    }

            # Reduced cooling effectiveness / condenser fouling
            if mode == "running" and supply is not None and not pd.isna(supply):
                s_val = float(supply)
                if s_val > 10.5 and power > 120.0:
                    return {
                        "anomaly_type": "reduced_cooling_effectiveness",
                        "severity": "critical",
                        "is_energy_waste": True,
                        "category": "equipment_health",
                        "evidence": [f"Supply temperature ({s_val:.1f} °C) fails to achieve 7.0 °C target despite 120+ kW compressor load."],
                        "recommended_action": "Check condenser tube cleanliness, cooling tower approach temperature, and refrigerant subcooling.",
                    }

            # Low demand waste
            if demand is not None and float(demand or 0.0) < 20.0 and power > 60.0:
                return {
                    "anomaly_type": "excessive_low_demand_operation",
                    "severity": "medium",
                    "is_energy_waste": True,
                    "category": "energy_waste",
                    "evidence": [f"Chiller drawing {power:.1f} kW during low plant cooling demand ({demand}%)."],
                    "recommended_action": "Switch to free-cooling economizer mode or stage chiller off on low plant cooling load.",
                }

        return None

    def check_dataframe(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Evaluate an entire DataFrame of telemetry against physical rules.
        Returns a list of detected rule-based anomaly dictionaries.
        """
        anomalies = []
        for idx, row in df.iterrows():
            res = self.evaluate_row(row)
            if res:
                item = dict(res)
                item["equipment_id"] = str(row.get("equipment_id", ""))
                item["equipment_type"] = str(row.get("equipment_type", ""))
                item["timestamp"] = str(row.get("timestamp", ""))
                item["operating_mode"] = str(row.get("operating_mode", ""))
                item["row_index"] = idx
                anomalies.append(item)
        return anomalies


# Alias for backward compatibility
RuleBasedEquipmentDetector = RuleBasedEquipmentChecker
