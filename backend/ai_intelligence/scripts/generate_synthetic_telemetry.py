"""
Synthetic Telemetry Generator for Industrial Manufacturing Equipment.
Simulates four distinct industrial equipment categories:
1. Industrial Furnace (FURNACE-01)
2. Rotary Screw Air Compressor (AIR-COMP-01)
3. Multi-Axis CNC Machine (CNC-01)
4. Chilled Water Cooling System (CHILLER-01)

Generates:
- telemetry.csv: Simulated physical sensor telemetry with operational modes and power (kW).
- ground_truth_events.csv: Segregated ground-truth anomaly events (health vs energy-waste).
- equipment_registry.json: Formal registry and operational thresholds for all 4 machines.
- dataset_card.md: Detailed schema, physics assumptions, and unit conventions.
- validation_summary.json: Data-quality checks, row counts, event counts, and label distributions.

Deterministic seed ensures exact reproducibility.
All values are explicitly flagged as SIMULATED / SYNTHETIC.
"""

import argparse
import json
import math
from datetime import datetime, timedelta
from pathlib import Path
import numpy as np
import pandas as pd


EQUIPMENT_REGISTRY = {
    "FURNACE-01": {
        "equipment_id": "FURNACE-01",
        "equipment_type": "furnace",
        "equipment_name": "High-Temperature Reheat Electric Furnace",
        "rated_power_kw": 250.0,
        "operating_modes": ["heating", "holding", "cooling", "idle", "off"],
        "primary_sensors": {
            "temperature_c": {"unit": "°C", "nominal_range": [25.0, 950.0], "critical_threshold": 920.0},
            "temp_setpoint_c": {"unit": "°C", "nominal_range": [20.0, 850.0]},
            "power_consumption_kw": {"unit": "kW", "nominal_range": [0.0, 250.0]},
            "door_open": {"unit": "binary", "nominal_range": [0, 1]},
            "heating_element_active": {"unit": "binary", "nominal_range": [0, 1]},
            "ambient_temp_c": {"unit": "°C", "nominal_range": [15.0, 42.0]},
        },
        "description": "Industrial electric batch heat-treatment furnace with programmable PID heating cycle.",
    },
    "AIR-COMP-01": {
        "equipment_id": "AIR-COMP-01",
        "equipment_type": "air_compressor",
        "equipment_name": "Variable Speed Rotary Screw Air Compressor",
        "rated_power_kw": 75.0,
        "operating_modes": ["load", "unload", "standby", "off"],
        "primary_sensors": {
            "discharge_pressure_bar": {"unit": "bar", "nominal_range": [6.5, 8.5], "critical_threshold": 5.5},
            "airflow_cfm": {"unit": "CFM", "nominal_range": [0.0, 420.0]},
            "power_consumption_kw": {"unit": "kW", "nominal_range": [0.0, 78.0]},
            "discharge_temp_c": {"unit": "°C", "nominal_range": [65.0, 95.0], "critical_threshold": 105.0},
            "vibration_mm_s": {"unit": "mm/s", "nominal_range": [0.8, 3.2], "critical_threshold": 6.5},
            "ambient_temp_c": {"unit": "°C", "nominal_range": [15.0, 42.0]},
        },
        "description": "Plant pneumatic utility rotary screw compressor supplying 7.5 bar compressed air header.",
    },
    "CNC-01": {
        "equipment_id": "CNC-01",
        "equipment_type": "cnc_machine",
        "equipment_name": "5-Axis High-Precision CNC Machining Center",
        "rated_power_kw": 35.0,
        "operating_modes": ["cutting", "setup", "idle", "off"],
        "primary_sensors": {
            "spindle_rpm": {"unit": "RPM", "nominal_range": [0.0, 12000.0]},
            "spindle_load_pct": {"unit": "%", "nominal_range": [0.0, 100.0], "critical_threshold": 90.0},
            "power_consumption_kw": {"unit": "kW", "nominal_range": [0.0, 38.0]},
            "vibration_mm_s": {"unit": "mm/s", "nominal_range": [0.5, 2.2], "critical_threshold": 5.0},
            "spindle_temp_c": {"unit": "°C", "nominal_range": [25.0, 60.0], "critical_threshold": 75.0},
            "ambient_temp_c": {"unit": "°C", "nominal_range": [15.0, 42.0]},
        },
        "description": "Production milling machine for aerospace turbine brackets and precision tooling.",
    },
    "CHILLER-01": {
        "equipment_id": "CHILLER-01",
        "equipment_type": "chilled_water_system",
        "equipment_name": "Water-Cooled Centrifugal Chilled Water System",
        "rated_power_kw": 160.0,
        "operating_modes": ["running", "low_load", "standby", "off"],
        "primary_sensors": {
            "supply_temp_c": {"unit": "°C", "nominal_range": [6.0, 8.5], "critical_threshold": 11.0},
            "return_temp_c": {"unit": "°C", "nominal_range": [11.0, 14.5]},
            "delta_t_c": {"unit": "°C", "nominal_range": [4.5, 6.5], "critical_threshold": 2.5},
            "water_flow_m3h": {"unit": "m³/h", "nominal_range": [100.0, 180.0], "critical_threshold": 60.0},
            "power_consumption_kw": {"unit": "kW", "nominal_range": [0.0, 165.0]},
            "cooling_demand_pct": {"unit": "%", "nominal_range": [10.0, 100.0]},
            "cooling_output_kw_th": {"unit": "kW_th", "nominal_range": [0.0, 750.0]},
            "cop_proxy": {"unit": "COP", "nominal_range": [3.2, 5.2]},
            "ambient_temp_c": {"unit": "°C", "nominal_range": [15.0, 42.0]},
        },
        "description": "Central plant chiller circulating chilled water across facility heat exchangers and machine cooling jackets.",
    },
}


def parse_args():
    parser = argparse.ArgumentParser(description="Generate synthetic industrial telemetry for 4 equipment categories.")
    parser.add_argument("--duration-days", type=int, default=30, help="Duration of simulation in days (default: 30).")
    parser.add_argument("--interval-minutes", type=int, default=5, help="Sampling interval in minutes (default: 5).")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed (default: 42).")
    parser.add_argument(
        "--output-dir",
        type=str,
        default="data/synthetic_v1",
        help="Target output directory (default: data/synthetic_v1).",
    )
    return parser.parse_args()


def get_ambient_temperature(dt: datetime, rng: np.random.Generator) -> float:
    """Realistic diurnal temperature profile with seasonal variation."""
    day_of_year = dt.timetuple().tm_yday
    hour = dt.hour + dt.minute / 60.0
    # Peak at 14:00, trough at 04:00
    diurnal = math.sin((hour - 8.0) * math.pi / 12.0) * 6.5
    seasonal = math.sin(day_of_year * 2 * math.pi / 365.0) * 4.0
    base = 25.0 + diurnal + seasonal
    noise = rng.normal(0, 0.4)
    return round(float(base + noise), 2)


def generate_furnace_telemetry(timestamps, rng: np.random.Generator):
    """Simulates FURNACE-01: electric reheat furnace with batch heating cycles."""
    rows = []
    events = []

    # Nominal cycle parameters
    setpoint_holding = 850.0
    setpoint_standby = 200.0

    current_temp = 25.0
    door_open = 0
    heating_element = 0
    mode = "off"
    batch_idx = 0

    # Planned event windows (deterministic days & hours)
    # Event 1: Day 4, 10:00 to 14:00 - Excessive Idle Heating (pure energy waste, door closed, empty furnace heating)
    # Event 2: Day 9, 08:00 to 12:30 - Temp Overshoot (health/safety alert)
    # Event 3: Day 15, 14:00 to 17:00 - Door Open Heat Loss during heating (energy waste + process)
    # Event 4: Day 21, 02:00 to 05:00 - Thermocouple Sensor Malfunction (health alert, normal power)
    # Event 5: Day 26, 11:00 to 16:00 - Slow Heating / Element Degradation (equipment health + energy overrun)

    for i, ts in enumerate(timestamps):
        amb = get_ambient_temperature(ts, rng)
        day = ts.day
        hour = ts.hour
        is_weekend = ts.weekday() >= 5

        # Operating schedule: Weekdays 06:00 to 22:00 batches, nights/weekends standby or off
        if is_weekend:
            target_mode = "idle" if hour >= 8 and hour <= 18 else "off"
        else:
            if 6 <= hour < 10:
                target_mode = "heating"
            elif 10 <= hour < 18:
                target_mode = "holding"
            elif 18 <= hour < 22:
                target_mode = "cooling"
            else:
                target_mode = "idle"

        setpoint = setpoint_holding if target_mode in ["heating", "holding"] else (setpoint_standby if target_mode == "idle" else amb)
        demand = 1.0 if target_mode in ["heating", "holding"] else (0.2 if target_mode == "idle" else 0.0)

        # Baseline physics
        if target_mode == "heating":
            heating_element = 1
            power = rng.normal(210.0, 12.0)
            current_temp += (setpoint - current_temp) * 0.08 + rng.normal(0, 1.2)
        elif target_mode == "holding":
            heating_element = 1 if current_temp < setpoint else 0
            power = rng.normal(58.0, 6.0) if heating_element else rng.normal(8.0, 1.5)
            current_temp += (setpoint - current_temp) * 0.05 + rng.normal(0, 0.8)
        elif target_mode == "cooling":
            heating_element = 0
            power = rng.normal(3.5, 0.5)
            current_temp -= (current_temp - amb) * 0.04 + rng.normal(0, 0.5)
        elif target_mode == "idle":
            heating_element = 0
            power = rng.normal(4.5, 0.8)
            current_temp -= (current_temp - setpoint_standby) * 0.02 + rng.normal(0, 0.5)
        else:
            heating_element = 0
            power = rng.normal(0.4, 0.1)
            current_temp -= (current_temp - amb) * 0.02

        door_open = 1 if (target_mode in ["heating", "holding"] and rng.random() < 0.02) else 0

        # Anomaly Injection Logic
        active_event_type = None
        event_severity = None
        is_energy_waste = False

        # Event 1: Excessive Idle Heating (Day 4: 10:00 - 14:00)
        if day == 4 and 10 <= hour < 14:
            active_event_type = "excessive_idle_heating"
            event_severity = "high"
            is_energy_waste = True
            target_mode = "idle"
            setpoint = setpoint_standby
            heating_element = 1
            power = rng.normal(85.0, 4.0)  # Firing elements while idle!
            current_temp += 3.5

        # Event 2: Temp Overshoot (Day 9: 08:00 - 12:30)
        elif day == 9 and (8 <= hour < 12 or (hour == 12 and ts.minute <= 30)):
            active_event_type = "temperature_overshoot"
            event_severity = "critical"
            is_energy_waste = True
            power = rng.normal(245.0, 4.0)
            current_temp = 965.0 + rng.normal(0, 8.0)

        # Event 3: Door Open Heat Loss (Day 15: 14:00 - 17:00)
        elif day == 15 and 14 <= hour < 17:
            active_event_type = "door_open_heat_loss"
            event_severity = "high"
            is_energy_waste = True
            door_open = 1
            power = rng.normal(235.0, 5.0)  # Maximum power struggling against loss
            current_temp = max(680.0, current_temp - 4.0)

        # Event 4: Thermocouple Malfunction (Day 21: 02:00 - 05:00)
        elif day == 21 and 2 <= hour < 5:
            active_event_type = "sensor_malfunction"
            event_severity = "medium"
            is_energy_waste = False
            # Sensor reading jumps to extreme without physical change in power
            current_temp = 1380.0 if rng.random() < 0.5 else 0.0

        # Event 5: Slow Heating / Degraded Elements (Day 26: 11:00 - 16:00)
        elif day == 26 and 11 <= hour < 16:
            active_event_type = "slow_heating"
            event_severity = "high"
            is_energy_waste = True
            power = rng.normal(140.0, 5.0)  # Partial element firing
            current_temp = min(610.0, current_temp)  # Stuck below setpoint 850°C

        # Small sensor dropout (data quality test)
        reported_temp = round(float(current_temp), 1)
        if rng.random() < 0.003:
            reported_temp = None

        rows.append({
            "timestamp": ts.isoformat(),
            "equipment_id": "FURNACE-01",
            "equipment_type": "furnace",
            "operating_mode": target_mode,
            "production_demand": round(float(demand), 2),
            "temperature_c": reported_temp,
            "temp_setpoint_c": round(float(setpoint), 1),
            "power_consumption_kw": max(0.0, round(float(power), 2)),
            "door_open": int(door_open),
            "heating_element_active": int(heating_element),
            "ambient_temp_c": amb,
            "discharge_pressure_bar": None,
            "airflow_cfm": None,
            "discharge_temp_c": None,
            "vibration_mm_s": None,
            "spindle_rpm": None,
            "spindle_load_pct": None,
            "spindle_temp_c": None,
            "supply_temp_c": None,
            "return_temp_c": None,
            "delta_t_c": None,
            "water_flow_m3h": None,
            "cooling_demand_pct": None,
            "cooling_output_kw_th": None,
            "cop_proxy": None,
            "is_anomaly": active_event_type is not None,
            "anomaly_type": active_event_type or "normal",
            "is_energy_waste": is_energy_waste,
            "severity": event_severity or "normal",
            "data_provenance": "synthetic_simulation",
        })

    return rows


def generate_compressor_telemetry(timestamps, rng: np.random.Generator):
    """Simulates AIR-COMP-01: Rotary screw air compressor with load/unload states."""
    rows = []

    # Baseline physics
    nom_pressure_load = 7.8
    nom_pressure_unload = 8.3

    for i, ts in enumerate(timestamps):
        amb = get_ambient_temperature(ts, rng)
        day = ts.day
        hour = ts.hour
        is_weekend = ts.weekday() >= 5

        # Compressor schedule: Weekdays 07:00 to 20:00 high load, night unload/standby
        if is_weekend:
            mode = "unload" if (9 <= hour < 17 and rng.random() < 0.6) else "standby"
        else:
            if 7 <= hour < 19:
                mode = "load" if rng.random() < 0.75 else "unload"
            elif 19 <= hour < 23:
                mode = "load" if rng.random() < 0.3 else "unload"
            else:
                mode = "standby" if rng.random() < 0.8 else "off"

        # Nominal variables
        if mode == "load":
            flow = rng.normal(320.0, 35.0)
            pressure = rng.normal(nom_pressure_load, 0.25)
            power = rng.normal(68.5, 3.5)
            discharge_temp = rng.normal(82.0, 3.0)
            vibration = rng.normal(1.6, 0.2)
        elif mode == "unload":
            flow = rng.normal(15.0, 5.0)
            pressure = rng.normal(nom_pressure_unload, 0.2)
            power = rng.normal(26.0, 2.0)  # Unload draws ~35% full load power
            discharge_temp = rng.normal(74.0, 2.5)
            vibration = rng.normal(1.2, 0.15)
        elif mode == "standby":
            flow = 0.0
            pressure = rng.normal(7.2, 0.3)
            power = rng.normal(2.5, 0.4)
            discharge_temp = rng.normal(amb + 10.0, 2.0)
            vibration = rng.normal(0.2, 0.05)
        else:
            flow = 0.0
            pressure = max(0.0, 6.0 - (i % 20) * 0.1)
            power = rng.normal(0.2, 0.05)
            discharge_temp = amb
            vibration = 0.02

        active_event_type = None
        event_severity = None
        is_energy_waste = False

        # Event 1: Air Leakage / Low Pressure High Power (Day 6: 09:00 - 15:00)
        if day == 6 and 9 <= hour < 15:
            active_event_type = "pressure_loss_leak"
            event_severity = "high"
            is_energy_waste = True
            mode = "load"
            pressure = rng.normal(5.1, 0.18)  # Pressure dropped to 5.1 bar
            power = rng.normal(74.0, 1.5)      # Maximum power struggling to maintain header
            flow = rng.normal(390.0, 10.0)

        # Event 2: Excessive Unload Operation (Day 12: 21:00 to Day 13: 05:00)
        elif (day == 12 and hour >= 21) or (day == 13 and hour < 5):
            active_event_type = "excessive_unload_operation"
            event_severity = "medium"
            is_energy_waste = True
            mode = "unload"
            flow = 0.0
            power = rng.normal(32.0, 1.5)  # 32 kW continuously wasted during empty shift
            pressure = rng.normal(8.4, 0.1)

        # Event 3: Bearing Degradation / Mechanical Wear (Day 18: 10:00 - 18:00)
        elif day == 18 and 10 <= hour < 18:
            active_event_type = "bearing_degradation"
            event_severity = "critical"
            is_energy_waste = False  # Health alert decoupled from energy waste
            vibration = rng.normal(7.2, 0.4)  # Severe vibration >6.5 mm/s
            discharge_temp = rng.normal(98.0, 2.5)

        # Event 4: Pressure Transducer Malfunction (Day 24: 13:00 - 16:00)
        elif day == 24 and 13 <= hour < 16:
            active_event_type = "sensor_malfunction"
            event_severity = "medium"
            is_energy_waste = False
            pressure = 0.0 if rng.random() < 0.5 else 14.8

        reported_p = round(float(pressure), 2)
        if rng.random() < 0.003:
            reported_p = None

        rows.append({
            "timestamp": ts.isoformat(),
            "equipment_id": "AIR-COMP-01",
            "equipment_type": "air_compressor",
            "operating_mode": mode,
            "production_demand": round(float(flow / 420.0), 2),
            "temperature_c": None,
            "temp_setpoint_c": None,
            "power_consumption_kw": max(0.0, round(float(power), 2)),
            "door_open": None,
            "heating_element_active": None,
            "ambient_temp_c": amb,
            "discharge_pressure_bar": reported_p,
            "airflow_cfm": max(0.0, round(float(flow), 1)),
            "discharge_temp_c": round(float(discharge_temp), 1),
            "vibration_mm_s": round(float(vibration), 3),
            "spindle_rpm": None,
            "spindle_load_pct": None,
            "spindle_temp_c": None,
            "supply_temp_c": None,
            "return_temp_c": None,
            "delta_t_c": None,
            "water_flow_m3h": None,
            "cooling_demand_pct": None,
            "cooling_output_kw_th": None,
            "cop_proxy": None,
            "is_anomaly": active_event_type is not None,
            "anomaly_type": active_event_type or "normal",
            "is_energy_waste": is_energy_waste,
            "severity": event_severity or "normal",
            "data_provenance": "synthetic_simulation",
        })

    return rows


def generate_cnc_telemetry(timestamps, rng: np.random.Generator):
    """Simulates CNC-01: 5-axis precision machining center."""
    rows = []

    for i, ts in enumerate(timestamps):
        amb = get_ambient_temperature(ts, rng)
        day = ts.day
        hour = ts.hour
        is_weekend = ts.weekday() >= 5

        # Operating schedule: 2 production shifts (08:00 - 16:00, 16:00 - 24:00)
        if is_weekend:
            mode = "idle" if (10 <= hour < 14 and rng.random() < 0.5) else "off"
        else:
            if 8 <= hour < 23:
                r_mode = rng.random()
                if r_mode < 0.65:
                    mode = "cutting"
                elif r_mode < 0.85:
                    mode = "setup"
                else:
                    mode = "idle"
            else:
                mode = "idle" if rng.random() < 0.1 else "off"

        # Nominal dynamics
        if mode == "cutting":
            rpm = rng.normal(8200.0, 450.0)
            load_pct = rng.normal(55.0, 6.0)
            power = rng.normal(26.5, 2.5)
            vibration = rng.normal(1.2, 0.15)
            spindle_temp = rng.normal(48.0, 2.5)
        elif mode == "setup":
            rpm = rng.normal(1200.0, 200.0)
            load_pct = rng.normal(12.0, 2.0)
            power = rng.normal(5.8, 0.6)
            vibration = rng.normal(0.6, 0.08)
            spindle_temp = rng.normal(32.0, 1.5)
        elif mode == "idle":
            rpm = 0.0
            load_pct = 0.0
            power = rng.normal(3.8, 0.4)
            vibration = rng.normal(0.2, 0.04)
            spindle_temp = rng.normal(amb + 4.0, 1.0)
        else:
            rpm = 0.0
            load_pct = 0.0
            power = rng.normal(0.25, 0.04)
            vibration = 0.03
            spindle_temp = amb

        active_event_type = None
        event_severity = None
        is_energy_waste = False

        # Event 1: Overnight Idle Waste (Day 5: 00:00 - 07:00)
        if day == 5 and 0 <= hour < 7:
            active_event_type = "excessive_idle_energy"
            event_severity = "medium"
            is_energy_waste = True
            mode = "idle"
            power = rng.normal(5.4, 0.3)  # Hydraulics and chiller left running without job

        # Event 2: Tool Wear Chatter (Day 11: 13:00 - 17:00)
        elif day == 11 and 13 <= hour < 17:
            active_event_type = "tool_wear_chatter"
            event_severity = "high"
            is_energy_waste = True
            mode = "cutting"
            vibration = rng.normal(5.4, 0.35)  # Severe chatter
            load_pct = rng.normal(88.0, 4.0)
            power = rng.normal(34.5, 1.5)

        # Event 3: Spindle Bearing Degradation (Day 17: 09:00 - 15:00)
        elif day == 17 and 9 <= hour < 15:
            active_event_type = "bearing_degradation"
            event_severity = "critical"
            is_energy_waste = False  # Health alert decoupled from energy waste
            vibration = rng.normal(6.1, 0.4)
            spindle_temp = rng.normal(78.5, 2.0)  # Overheating bearing

        # Event 4: Spindle RPM Sensor Malfunction (Day 23: 14:00 - 17:00)
        elif day == 23 and 14 <= hour < 17:
            active_event_type = "sensor_malfunction"
            event_severity = "medium"
            is_energy_waste = False
            rpm = 0.0  # Sensor dropped to 0 while machine is actually cutting at 26 kW!

        rows.append({
            "timestamp": ts.isoformat(),
            "equipment_id": "CNC-01",
            "equipment_type": "cnc_machine",
            "operating_mode": mode,
            "production_demand": round(float(load_pct / 100.0), 2),
            "temperature_c": None,
            "temp_setpoint_c": None,
            "power_consumption_kw": max(0.0, round(float(power), 2)),
            "door_open": None,
            "heating_element_active": None,
            "ambient_temp_c": amb,
            "discharge_pressure_bar": None,
            "airflow_cfm": None,
            "discharge_temp_c": None,
            "vibration_mm_s": round(float(vibration), 3),
            "spindle_rpm": round(float(rpm), 0),
            "spindle_load_pct": round(float(load_pct), 1),
            "spindle_temp_c": round(float(spindle_temp), 1),
            "supply_temp_c": None,
            "return_temp_c": None,
            "delta_t_c": None,
            "water_flow_m3h": None,
            "cooling_demand_pct": None,
            "cooling_output_kw_th": None,
            "cop_proxy": None,
            "is_anomaly": active_event_type is not None,
            "anomaly_type": active_event_type or "normal",
            "is_energy_waste": is_energy_waste,
            "severity": event_severity or "normal",
            "data_provenance": "synthetic_simulation",
        })

    return rows


def generate_chiller_telemetry(timestamps, rng: np.random.Generator):
    """Simulates CHILLER-01: Central water-cooled centrifugal chiller."""
    rows = []

    for i, ts in enumerate(timestamps):
        amb = get_ambient_temperature(ts, rng)
        day = ts.day
        hour = ts.hour
        is_weekend = ts.weekday() >= 5

        # Plant cooling demand driven by ambient temp and day of week
        base_demand = (amb - 15.0) / 25.0  # 0 to 1
        load_factor = 0.4 if is_weekend else (0.85 if 8 <= hour < 19 else 0.5)
        demand_pct = max(10.0, min(100.0, base_demand * load_factor * 100.0 + rng.normal(0, 3.0)))

        if demand_pct > 35.0:
            mode = "running"
        elif demand_pct > 15.0:
            mode = "low_load"
        elif demand_pct > 5.0:
            mode = "standby"
        else:
            mode = "off"

        # Nominal thermodynamics:
        # Supply setpoint ~7.0 °C, Return ~12.5 °C, Delta T ~5.5 °C
        # Flow ~140 m3/h
        # Cooling Output kW_th = flow_m3h * 1000 / 3600 * 4.186 * delta_t
        # Chiller Power = Cooling Output / COP
        if mode == "running":
            supply_temp = rng.normal(7.0, 0.3)
            delta_t = rng.normal(5.5, 0.3)
            return_temp = supply_temp + delta_t
            flow = rng.normal(145.0, 8.0)
            cooling_th = (flow * 1000.0 / 3600.0) * 4.186 * delta_t
            cop = rng.normal(4.4, 0.2)
            power = cooling_th / cop
        elif mode == "low_load":
            supply_temp = rng.normal(7.2, 0.4)
            delta_t = rng.normal(3.8, 0.3)
            return_temp = supply_temp + delta_t
            flow = rng.normal(110.0, 6.0)
            cooling_th = (flow * 1000.0 / 3600.0) * 4.186 * delta_t
            cop = rng.normal(3.6, 0.2)
            power = cooling_th / cop
        elif mode == "standby":
            supply_temp = rng.normal(12.0, 0.5)
            return_temp = rng.normal(13.0, 0.5)
            delta_t = return_temp - supply_temp
            flow = rng.normal(40.0, 4.0)
            cooling_th = 0.0
            cop = 1.0
            power = rng.normal(12.0, 1.0)  # Sump heater and control power
        else:
            supply_temp = amb
            return_temp = amb
            delta_t = 0.0
            flow = 0.0
            cooling_th = 0.0
            cop = 0.0
            power = rng.normal(0.4, 0.05)

        active_event_type = None
        event_severity = None
        is_energy_waste = False

        # Event 1: Low Delta T Syndrome (Day 7: 11:00 - 17:00)
        # Return temp falls near supply due to 3-way valve bypass; high flow, low delta T, bad COP
        if day == 7 and 11 <= hour < 17:
            active_event_type = "low_delta_t_syndrome"
            event_severity = "high"
            is_energy_waste = True
            delta_t = rng.normal(1.7, 0.15)
            return_temp = supply_temp + delta_t
            flow = rng.normal(160.0, 5.0)
            cop = 2.1  # Highly degraded COP!
            cooling_th = (flow * 1000.0 / 3600.0) * 4.186 * delta_t
            power = rng.normal(135.0, 4.0)

        # Event 2: Reduced Cooling Effectiveness / Condenser Fouling (Day 14: 12:00 - 18:00)
        elif day == 14 and 12 <= hour < 18:
            active_event_type = "reduced_cooling_effectiveness"
            event_severity = "critical"
            is_energy_waste = True
            supply_temp = rng.normal(11.8, 0.4)  # Chilled water not reaching 7°C setpoint!
            return_temp = supply_temp + delta_t
            power = rng.normal(158.0, 3.0)       # Chiller running at max draw
            cop = 2.4

        # Event 3: Weekend Low Demand Waste (Day 20: 08:00 - 18:00)
        elif day == 20 and 8 <= hour < 18:
            active_event_type = "excessive_low_demand_operation"
            event_severity = "medium"
            is_energy_waste = True
            demand_pct = 12.0
            power = rng.normal(78.0, 3.0)  # Running full compressor for negligible demand

        # Event 4: Chilled Water Flow Meter Malfunction (Day 25: 09:00 - 13:00)
        elif day == 25 and 9 <= hour < 13:
            active_event_type = "sensor_malfunction"
            event_severity = "medium"
            is_energy_waste = False
            flow = 0.0  # Sensor signal drops to 0 m3/h while compressor is running normally

        rows.append({
            "timestamp": ts.isoformat(),
            "equipment_id": "CHILLER-01",
            "equipment_type": "chilled_water_system",
            "operating_mode": mode,
            "production_demand": round(float(demand_pct / 100.0), 2),
            "temperature_c": None,
            "temp_setpoint_c": None,
            "power_consumption_kw": max(0.0, round(float(power), 2)),
            "door_open": None,
            "heating_element_active": None,
            "ambient_temp_c": amb,
            "discharge_pressure_bar": None,
            "airflow_cfm": None,
            "discharge_temp_c": None,
            "vibration_mm_s": None,
            "spindle_rpm": None,
            "spindle_load_pct": None,
            "spindle_temp_c": None,
            "supply_temp_c": round(float(supply_temp), 2),
            "return_temp_c": round(float(return_temp), 2),
            "delta_t_c": round(float(delta_t), 2),
            "water_flow_m3h": round(float(flow), 1),
            "cooling_demand_pct": round(float(demand_pct), 1),
            "cooling_output_kw_th": round(float(cooling_th), 2),
            "cop_proxy": round(float(cop), 2),
            "is_anomaly": active_event_type is not None,
            "anomaly_type": active_event_type or "normal",
            "is_energy_waste": is_energy_waste,
            "severity": event_severity or "normal",
            "data_provenance": "synthetic_simulation",
        })

    return rows


def extract_ground_truth_events(df: pd.DataFrame) -> pd.DataFrame:
    """Extracts contiguous anomaly episodes into a discrete ground truth event registry."""
    events = []
    event_counter = 1

    for eq_id, group in df.groupby("equipment_id"):
        group = group.sort_values(by="timestamp").reset_index(drop=True)
        in_event = False
        cur_event = {}

        for idx, row in group.iterrows():
            if row["is_anomaly"]:
                if not in_event:
                    in_event = True
                    cur_event = {
                        "event_id": f"EVT-{event_counter:04d}",
                        "equipment_id": eq_id,
                        "equipment_type": row["equipment_type"],
                        "start_timestamp": row["timestamp"],
                        "end_timestamp": row["timestamp"],
                        "anomaly_type": row["anomaly_type"],
                        "severity": row["severity"],
                        "is_energy_waste": bool(row["is_energy_waste"]),
                        "readings_count": 1,
                        "mean_power_kw": float(row["power_consumption_kw"]),
                    }
                    event_counter += 1
                else:
                    cur_event["end_timestamp"] = row["timestamp"]
                    cur_event["readings_count"] += 1
                    cur_event["mean_power_kw"] += float(row["power_consumption_kw"])
            else:
                if in_event:
                    in_event = False
                    cur_event["mean_power_kw"] = round(cur_event["mean_power_kw"] / cur_event["readings_count"], 2)
                    events.append(cur_event)

        if in_event:
            cur_event["mean_power_kw"] = round(cur_event["mean_power_kw"] / cur_event["readings_count"], 2)
            events.append(cur_event)

    return pd.DataFrame(events)


def generate_dataset(duration_days: int = 30, interval_minutes: int = 5, seed: int = 42, output_dir: str = "data/synthetic_v1"):
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)

    start_date = datetime(2024, 1, 1, 0, 0, 0)
    steps = int((duration_days * 24 * 60) / interval_minutes)
    timestamps = [start_date + timedelta(minutes=interval_minutes * i) for i in range(steps)]

    print(f"[GEN] Simulating 4 industrial machines across {duration_days} days ({len(timestamps)} timestamps each)...")

    f_rows = generate_furnace_telemetry(timestamps, rng)
    a_rows = generate_compressor_telemetry(timestamps, rng)
    c_rows = generate_cnc_telemetry(timestamps, rng)
    ch_rows = generate_chiller_telemetry(timestamps, rng)

    all_rows = f_rows + a_rows + c_rows + ch_rows
    df = pd.DataFrame(all_rows)
    df = df.sort_values(by=["timestamp", "equipment_id"]).reset_index(drop=True)

    # Export telemetry.csv
    telemetry_path = out_path / "telemetry.csv"
    df.to_csv(telemetry_path, index=False)
    print(f"[GEN] Saved telemetry ({len(df)} rows) -> {telemetry_path}")

    # Export ground_truth_events.csv
    events_df = extract_ground_truth_events(df)
    events_path = out_path / "ground_truth_events.csv"
    events_df.to_csv(events_path, index=False)
    print(f"[GEN] Saved ground truth events ({len(events_df)} distinct episodes) -> {events_path}")

    # Export equipment_registry.json
    reg_path = out_path / "equipment_registry.json"
    with open(reg_path, "w", encoding="utf-8") as f:
        json.dump(EQUIPMENT_REGISTRY, f, indent=2)
    print(f"[GEN] Saved equipment registry -> {reg_path}")

    # Export validation_summary.json
    val_summary = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "simulation_version": "v1.0-synthetic-hackathon",
        "seed": seed,
        "duration_days": duration_days,
        "sampling_interval_minutes": interval_minutes,
        "total_rows": len(df),
        "total_timestamps": len(timestamps),
        "equipment_counts": df["equipment_id"].value_counts().to_dict(),
        "operating_modes": df.groupby("equipment_id")["operating_mode"].unique().apply(list).to_dict(),
        "anomaly_distribution": df["anomaly_type"].value_counts().to_dict(),
        "severity_distribution": df["severity"].value_counts().to_dict(),
        "energy_waste_rows": int(df["is_energy_waste"].sum()),
        "distinct_events_count": len(events_df),
        "events_by_equipment": events_df["equipment_id"].value_counts().to_dict() if len(events_df) > 0 else {},
        "missing_values_count": int(df.isna().sum().sum()),
    }
    summary_path = out_path / "validation_summary.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(val_summary, f, indent=2)
    print(f"[GEN] Saved validation summary -> {summary_path}")

    # Export dataset_card.md
    dataset_card_path = out_path / "dataset_card.md"
    card_content = f"""# Synthetic Industrial Telemetry Dataset Card (v1.0)

## Overview
This synthetic dataset simulates 30 days of high-resolution (5-minute interval) multi-sensor telemetry across **four distinct industrial manufacturing equipment types**. It was generated using deterministic physical models to evaluate AI anomaly detection, condition-aware energy baselines, and carbon accounting.

> **CRITICAL NOTICE / PROVENANCE:**
> **All data in this directory is SIMULATED / SYNTHETIC.** It does not represent actual telemetry or proprietary measurements from KPCL or any physical plant. It is intended solely for algorithmic benchmarking, pipeline testing, and hackathon software demonstration.

---

## Equipment Profiles & Sensor Specifications

### 1. Reheat Electric Furnace (`FURNACE-01`)
- **Rated Power:** 250 kW
- **Operating Modes:** `heating`, `holding`, `cooling`, `idle`, `off`
- **Key Signals:**
  - `temperature_c`: Chamber temperature (°C) [ambient to 950°C]
  - `temp_setpoint_c`: Programmed temperature setpoint (°C)
  - `power_consumption_kw`: Electric power draw (kW)
  - `door_open`: Binary door open status (0 = closed, 1 = open)
  - `heating_element_active`: Heating element contactor status (0/1)
- **Simulated Faults:** Temperature overshoot (safety alert), slow heating / element degradation, excessive idle heating (energy waste), door-open thermal loss, thermocouple sensor failure.

### 2. Rotary Screw Air Compressor (`AIR-COMP-01`)
- **Rated Power:** 75 kW
- **Operating Modes:** `load`, `unload`, `standby`, `off`
- **Key Signals:**
  - `discharge_pressure_bar`: Header pressure (bar) [nominal 6.8 - 8.5 bar]
  - `airflow_cfm`: Compressed air volumetric output (CFM)
  - `power_consumption_kw`: Motor active power (kW) [~68 kW load, ~26 kW unload]
  - `discharge_temp_c`: Air/oil discharge temperature (°C)
  - `vibration_mm_s`: Mechanical vibration RMS (mm/s)
- **Simulated Faults:** Compressed air header leak, excessive unload operation (unproductive energy waste), mechanical bearing degradation (high vibration, normal power), pressure transducer sensor failure.

### 3. Precision CNC Machining Center (`CNC-01`)
- **Rated Power:** 35 kW
- **Operating Modes:** `cutting`, `setup`, `idle`, `off`
- **Key Signals:**
  - `spindle_rpm`: Spindle rotational speed (RPM) [0 - 12,000 RPM]
  - `spindle_load_pct`: Spindle drive torque load (%)
  - `power_consumption_kw`: Multi-axis active power (kW)
  - `vibration_mm_s`: Cutting head vibration RMS (mm/s)
  - `spindle_temp_c`: Spindle bearing temperature (°C)
- **Simulated Faults:** Overnight idle energy waste, tool wear chatter, spindle bearing failure, RPM encoder dropout.

### 4. Water-Cooled Centrifugal Chiller (`CHILLER-01`)
- **Rated Power:** 160 kW (Thermal capacity: ~700 kW_th)
- **Operating Modes:** `running`, `low_load`, `standby`, `off`
- **Key Signals:**
  - `supply_temp_c`: Chilled water supply temperature (°C) [nominal 6.5 - 7.5°C]
  - `return_temp_c`: Chilled water return temperature (°C) [nominal 11.5 - 13.5°C]
  - `delta_t_c`: Temperature difference ΔT = return - supply (°C)
  - `water_flow_m3h`: Circulating chilled water flow rate (m³/h)
  - `cooling_output_kw_th`: Derived thermal cooling rate (kW_th = flow × Cp × ΔT)
  - `cop_proxy`: Coefficient of Performance proxy (kW_th / kW_electric)
  - `power_consumption_kw`: Chiller compressor active power (kW)
- **Simulated Faults:** Low Delta-T syndrome (low COP waste), reduced cooling effectiveness / condenser fouling, unneeded low-demand operation, flow meter dropout.

---

## Dataset Statistics
- **Total Timestamps:** {len(timestamps)}
- **Total Telemetry Rows:** {len(df)} ({len(df) // 4} readings per machine)
- **Total Distinct Ground-Truth Anomaly Episodes:** {len(events_df)}
- **Sampling Interval:** {interval_minutes} minutes
- **Chronological Span:** {timestamps[0].strftime('%Y-%m-%d %H:%M:%S')} to {timestamps[-1].strftime('%Y-%m-%d %H:%M:%S')}
- **Random Seed:** {seed} (fully reproducible via `python scripts/generate_synthetic_telemetry.py --seed {seed}`)
"""
    with open(dataset_card_path, "w", encoding="utf-8") as f:
        f.write(card_content)
    print(f"[GEN] Saved dataset card -> {dataset_card_path}")

    return df, events_df


if __name__ == "__main__":
    args = parse_args()
    generate_dataset(
        duration_days=args.duration_days,
        interval_minutes=args.interval_minutes,
        seed=args.seed,
        output_dir=args.output_dir,
    )
