import json
import csv
from datetime import datetime, timedelta

def generate_profiles():
    profiles = {
        "CNC-01": {
            "machine_id": "CNC-01",
            "name": "CNC Machining Center",
            "process": "machining",
            "rated_power_kw": 25.0,
            "expected_idle_power_kw": 3.0,
            "off_power_kw": 0.8,
            "permitted_states": ["running", "idle", "off", "maintenance"],
            "constraints": {
                "production_target_required": True,
                "min_daily_production_units": 140,
                "max_continuous_run_hours": 8
            },
            "data_source": "simulated_profile"
        },
        "COMP-01": {
            "machine_id": "COMP-01",
            "name": "Air Compressor",
            "process": "compressed_air",
            "rated_power_kw": 30.0,
            "expected_idle_power_kw": 8.0,
            "off_power_kw": 1.0,
            "permitted_states": ["running", "idle", "off", "maintenance"],
            "constraints": {
                "min_service_required": True,
                "idle_shutdown_requires_operator_approval": True,
                "min_pressure_bar": 6.5,
                "rated_pressure_bar": 7.5
            },
            "data_source": "simulated_profile"
        },
        "FURN-01": {
            "machine_id": "FURN-01",
            "name": "Heat-Treatment Furnace",
            "process": "heat_treatment",
            "rated_power_kw": 50.0,
            "expected_idle_power_kw": 15.0,
            "off_power_kw": 2.0,
            "permitted_states": ["running", "idle", "off", "maintenance"],
            "constraints": {
                "protected_process_block": True,
                "min_continuous_cycle_hours": 4,
                "cannot_interrupt_holding_cycle": True
            },
            "data_source": "simulated_profile"
        },
        "PAINT-01": {
            "machine_id": "PAINT-01",
            "name": "Painting Line",
            "process": "painting",
            "rated_power_kw": 20.0,
            "expected_idle_power_kw": 5.0,
            "off_power_kw": 0.5,
            "permitted_states": ["running", "idle", "off", "maintenance"],
            "constraints": {
                "ventilation_mandatory_during_paint": True,
                "voc_compliance_active": True
            },
            "data_source": "simulated_profile"
        }
    }
    return profiles

def generate_tariff():
    return {
        "currency": "INR",
        "energy_rate_inr_per_kwh": 9.00,
        "tariff_type": "time_of_day",
        "tou_rates": [
            { "zone": "OFF_PEAK", "hours": [22, 23, 0, 1, 2, 3, 4, 5], "multiplier": 0.85, "rate_inr_per_kwh": 7.65 },
            { "zone": "NORMAL", "hours": [6, 7, 8, 13, 14, 15, 16, 17], "multiplier": 1.0, "rate_inr_per_kwh": 9.00 },
            { "zone": "PEAK", "hours": [9, 10, 11, 12, 18, 19, 20, 21], "multiplier": 1.20, "rate_inr_per_kwh": 10.80 }
        ],
        "contract_demand_limit_kw": 85.0,
        "demand_penalty_charge_inr_per_kw": 350.0
    }

def generate_emission_factors():
    return {
        "factor_id": "EF-GRID-IN-2023",
        "name": "India National Grid Baseline Emission Factor",
        "kg_co2e_per_kwh": 0.82,
        "unit": "kg CO2e/kWh",
        "geography": "National Grid (CEA India)",
        "source": "Central Electricity Authority (CEA) Baseline Database v19 (2023-24)",
        "reporting_period": "2023-2024",
        "methodology": "GHG Protocol Location-based Scope 2",
        "version": "1.0.0"
    }

def generate_csv(start_date=datetime(2026, 10, 17, 0, 0, 0), days=7):
    rows = []
    # 7 days * 24 hours = 168 hours
    for h in range(days * 24):
        cur_time = start_date + timedelta(hours=h)
        iso_str = cur_time.strftime("%Y-%m-%dT%H:%M:%S")
        hour_of_day = cur_time.hour
        day_index = h // 24

        shift = "night" if hour_of_day < 8 else ("day_a" if hour_of_day < 16 else "day_b")

        # 1. CNC-01 (machining)
        # Active in day_a and day_b (08:00 to 20:00), idle at breaks (13:00)
        if 8 <= hour_of_day < 20:
            if hour_of_day == 13:
                cnc_state, cnc_kw, cnc_prod = "idle", 3.0, 0
            else:
                cnc_state, cnc_kw, cnc_prod = "running", 22.0, 15
        else:
            cnc_state, cnc_kw, cnc_prod = "off", 0.8, 0

        # 2. COMP-01 (compressed air)
        # Supplying compressed air. Anomaly on day_index >= 5 during lunch & shift change (11:00-13:00):
        # telemetry shows 18 kW unloaded idle instead of expected 8 kW!
        if 7 <= hour_of_day < 21:
            if hour_of_day in [11, 12, 13]: # lunch/break anomaly
                comp_state, comp_kw = "idle", 18.0 # ANOMALY: expected 8 kW, observed 18 kW!
            else:
                comp_state, comp_kw = "running", 28.0
        else:
            comp_state, comp_kw = "idle", 8.0 # regular night idle / base pressure maintain

        # 3. FURN-01 (heat treatment)
        # 4-hour cycle: 06:00 to 10:00 preheat & holding (48 kW), idle holding (15 kW) until 14:00, then batch 2 (14:00 to 18:00)
        if (6 <= hour_of_day < 10) or (14 <= hour_of_day < 18):
            furn_state, furn_kw = "running", 48.0
        elif (10 <= hour_of_day < 14):
            furn_state, furn_kw = "idle", 15.0
        else:
            furn_state, furn_kw = "off", 2.0

        # 4. PAINT-01 (painting line)
        # Operates 09:00 to 17:00 (18 kW running with ventilation), idle 17:00 to 19:00 (5 kW)
        if 9 <= hour_of_day < 17:
            paint_state, paint_kw = "running", 18.0
        elif 17 <= hour_of_day < 19:
            paint_state, paint_kw = "idle", 5.0
        else:
            paint_state, paint_kw = "off", 0.5

        # Interval energy = average kW * 1h
        rows.append({
            "timestamp": iso_str, "machine_id": "CNC-01", "process": "machining",
            "power_kw": cnc_kw, "energy_kwh": cnc_kw, "machine_state": cnc_state,
            "production_units": cnc_prod, "shift": shift, "data_source": "simulated"
        })
        rows.append({
            "timestamp": iso_str, "machine_id": "COMP-01", "process": "compressed_air",
            "power_kw": comp_kw, "energy_kwh": comp_kw, "machine_state": comp_state,
            "production_units": 0, "shift": shift, "data_source": "simulated"
        })
        rows.append({
            "timestamp": iso_str, "machine_id": "FURN-01", "process": "heat_treatment",
            "power_kw": furn_kw, "energy_kwh": furn_kw, "machine_state": furn_state,
            "production_units": 1 if furn_state == "running" else 0, "shift": shift, "data_source": "simulated"
        })
        rows.append({
            "timestamp": iso_str, "machine_id": "PAINT-01", "process": "painting",
            "power_kw": paint_kw, "energy_kwh": paint_kw, "machine_state": paint_state,
            "production_units": 10 if paint_state == "running" else 0, "shift": shift, "data_source": "simulated"
        })

    return rows

if __name__ == "__main__":
    import os
    for target_dir in [".", "Carbon-Accounting-and-smart-Manufacturing"]:
        data_dir = os.path.join(target_dir, "data")
        os.makedirs(data_dir, exist_ok=True)
        with open(os.path.join(data_dir, "machine_profiles.json"), "w", encoding="utf-8") as f:
            json.dump(generate_profiles(), f, indent=2)
        with open(os.path.join(data_dir, "tariff_config.json"), "w", encoding="utf-8") as f:
            json.dump(generate_tariff(), f, indent=2)
        with open(os.path.join(data_dir, "emission_factors.json"), "w", encoding="utf-8") as f:
            json.dump(generate_emission_factors(), f, indent=2)
        
        csv_rows = generate_csv()
        with open(os.path.join(data_dir, "machine_energy.csv"), "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=[
                "timestamp", "machine_id", "process", "power_kw", "energy_kwh",
                "machine_state", "production_units", "shift", "data_source"
            ])
            writer.writeheader()
            writer.writerows(csv_rows)
        print(f"Generated data files in {data_dir} ({len(csv_rows)} rows)")
