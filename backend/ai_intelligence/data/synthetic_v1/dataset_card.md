# Synthetic Industrial Telemetry Dataset Card (v1.0)

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
- **Total Timestamps:** 8640
- **Total Telemetry Rows:** 34560 (8640 readings per machine)
- **Total Distinct Ground-Truth Anomaly Episodes:** 17
- **Sampling Interval:** 5 minutes
- **Chronological Span:** 2024-01-01 00:00:00 to 2024-01-30 23:55:00
- **Random Seed:** 42 (fully reproducible via `python scripts/generate_synthetic_telemetry.py --seed 42`)
