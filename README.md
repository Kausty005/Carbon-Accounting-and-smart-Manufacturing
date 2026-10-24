# WattWise AI — Digital Twin & Energy Optimisation Module
**KPCL Hackathon — Problem Statement 1: AI-Driven Carbon Accounting & Intelligent Energy Management for Sustainable Manufacturing**
*Industry Partner: Kirloskar Pneumatic Company Limited (KPCL)*
*Theme: Sustainable Manufacturing | Green Technology | AI & Data Analytics*

---

## 1. Executive Summary & Objective

The **Digital Twin Module** inside **WattWise AI** is a time-indexed, physical energy system scenario engine designed for the fictional reference plant **PrecisionWorks Manufacturing**.

It allows plant managers and energy auditors to test operational modifications (such as reducing compressor idle power, shifting flexible machine schedules, or tuning pneumatic pressure setpoints) and dynamically computes their exact impact on:
- **Interval & Cumulative Energy Consumption (kWh)**
- **Peak Electrical Demand & Contract Exceedance (kW)**
- **Electricity & Demand Charges (₹ INR)**
- **Scope 2 Indirect Greenhouse Gas Emissions (kg / t CO₂e)**
- **Physical Safety & Metallurgical Process Interlocks**

> **Core Product Promise:**
> *"Test a factory energy decision in the Digital Twin before trying it on the factory floor."*

---

## 2. Reference Factory & Demo Assets

As specified in Section 3.1 of the Implementation Documentation:

| Machine ID | Asset Name | Process | Rated Power | Expected Idle | Standby / Off | Process Constraints & Physical Interlocks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **COMP-01** | Air Compressor (ELGi EN 45) | Compressed Air | **30.0 kW** | **8.0 kW** | 1.0 kW | Minimum ring main pressure ≥ 6.5 bar; auto-idle timer requires operator sign-off; **Flagged Anomaly: 18 kW unloaded idle**. |
| **CNC-01** | CNC Machining Center (NLX-2500) | Machining | **25.0 kW** | **3.0 kW** | 0.8 kW | Daily production target required (≥ 140 parts); maximum continuous runtime 8 hrs. |
| **FURN-01** | Industrial Furnace (IF-85) | Heat Treatment | **50.0 kW** | **15.0 kW** | 2.0 kW | **Protected process block**: minimum continuous batch holding cycle ≥ 4 hrs; thermal cutting below 15 kW causes metallurgy quench defects. |
| **PAINT-01** | Painting Line & Exhaust (PL-20) | Painting | **20.0 kW** | **5.0 kW** | 0.5 kW | **Mandatory exhaust ventilation** (≥ 5 kW) active whenever painting line runs to prevent hazardous VOC accumulation. |

---

## 3. Mathematical Engine & Single Source of Truth

All calculations follow Section 6 of the implementation standard without hardcoded savings:

1. **Interval Energy:**
   $$\text{interval\_energy\_kwh} = \text{average\_power\_kw} \times \text{interval\_duration\_hours}$$
2. **Plant Power & Demand Peak:**
   $$\text{plant\_power\_kw}[t] = \sum_{m} \text{machine\_power\_kw}[m, t]$$
   $$\text{peak\_demand\_kw} = \max_t (\text{plant\_power\_kw}[t])$$
3. **Time of Day (ToD) Tariff & Demand Penalties:**
   $$\text{energy\_cost\_inr} = \sum_t (\text{interval\_energy\_kwh}[t] \times \text{tariff\_rate}[t])$$
   - *Peak Zone (09:00–12:00, 18:00–21:00):* ₹10.80/kWh (+20%)
   - *Normal Zone (06:00–09:00, 13:00–18:00):* ₹9.00/kWh
   - *Off-Peak Zone (22:00–06:00):* ₹7.65/kWh (-15%)
   - *Contract Demand Limit:* 85.0 kW (penalty: ₹350.00 / kW exceedance)
4. **Scope 2 Indirect Carbon Accounting:**
   $$\text{scope2\_kg\_co2e} = \text{purchased\_electricity\_kwh} \times \text{grid\_emission\_factor}$$
   - *Grid Baseline Factor:* 0.82 kg CO₂e/kWh (*Central Electricity Authority (CEA) Baseline Database v19, 2023-24*).
5. **Delta Sign Convention:**
   $$\text{delta} = \text{scenario} - \text{baseline}$$
   *(Negative deltas represent reductions/savings; displayed clearly in UI as positive savings).*

---

## 4. Supported Scenarios & Presets

1. **Compressor Idle Power Reduction (`SCN-IDLE-FIX`)**:
   - Detects COMP-01 running unloaded at 18.0 kW (instead of rated 8.0 kW) during break windows.
   - Recalculates affected slots dynamically.
   - Result: **~30 kWh/day saved, ₹270/day avoided cost, ~24.6 kg CO₂e abated**.
2. **Coincident Peak Demand Shaving (`SCN-PEAK-SHIFT`)**:
   - Shifts CNC-01 production start by +2 hours to prevent simultaneous overlap with the morning Furnace heating cycle.
   - Result: Shaves coincident plant peak from **96.0 kW to 74.0 kW**, completely eliminating demand penalty charges!
3. **Pneumatic Pressure Optimization (`SCN-PRESSURE-OPT`)**:
   - Lowers compressor discharge pressure setpoint from 7.5 to 6.8 bar (1% energy saving per 0.1 bar).
   - Validates that pressure remains strictly above the 6.5 bar ring main floor.
4. **Algorithmic Multi-Asset Stagger Optimizer**:
   - Sweeps candidate offsets across flexible assets to find the schedule that minimizes plant peak demand kW.
5. **Safety Interlock & Constraint Interlock Demo (`SCN-VIOLATION-TEST`)**:
   - Simulates an operator erroneously requesting 45 kW on the 30 kW compressor or cutting furnace holding power below 15 kW.
   - Engine rejects the scenario, sets status to `BLOCKED`, and outputs structured diagnostic codes (`ERR_POWER_EXCEEDS_RATED`, `ERR_PROTECTED_PROCESS_VIOLATION`).

---

## 5. Repository Structure

```
├── data/
│   ├── machine_energy.csv       # 672-row time-series telemetry (7 days × 24h × 4 assets)
│   ├── machine_profiles.json    # Machine ratings, expected idle, and physical constraints
│   ├── tariff_config.json       # ToD tariff tiers, 85 kW contract limit, and penalties
│   └── emission_factors.json    # CEA India 0.82 kg CO2e/kWh provenance metadata
│
├── backend/app/
│   ├── services/
│   │   ├── twin_profiles.py     # Profile store & asset metadata loader
│   │   ├── baseline_engine.py   # Immutable baseline telemetry management
│   │   ├── scenario_engine.py   # Dynamic transformation & recalculation engine
│   │   ├── constraint_validator.py # Real-time physical & process interlock checks
│   │   └── twin_metrics.py      # Energy, ToD tariff, peak demand, and Scope 2 equations
│   └── routes/
│       └── simulation.py        # FastAPI API endpoints (POST /api/simulate, POST /api/optimize)
│
├── tests/
│   ├── test_digital_twin.py     # Unit tests T-01 to T-12 from Implementation Doc
│   └── test_simulate_api.py     # FastAPI integration & route test suite
│
└── Carbon-Accounting-and-smart-Manufacturing/
    └── src/
        ├── digitalTwin/         # Client-side zero-latency TypeScript simulation engine
        │   ├── types.ts
        │   ├── twinProfiles.ts
        │   ├── baselineEngine.ts
        │   ├── calculationEngine.ts
        │   ├── constraintValidator.ts
        │   ├── scenarioEngine.ts
        │   ├── optimizer.ts
        │   └── presets.ts
        ├── components/
        │   ├── DigitalTwin/
        │   │   └── DigitalTwinView.tsx # Interactive Digital Twin UI with live Recharts overlay
        │   ├── Factory3D/              # 3D interactive Three.js factory twin
        │   └── ScadaFloorMap.tsx       # 2.5D SCADA floor mimic
        └── App.tsx                     # Single Source of Truth linking all platform views
```

---

## 6. How to Run & Verify

### A. Python Backend & Unit Test Suite
To run all 16 automated tests covering the calculation engine, constraint rules, and FastAPI routes:
```bash
python -m pytest tests -v
```
To launch the FastAPI Digital Twin backend server:
```bash
python -m uvicorn backend.app.routes.simulation:app --reload --port 8000
```
Interactive Swagger API documentation will be available at: `http://localhost:8000/docs`

### B. Interactive Web Dashboard (Vite + React)
To start the frontend application:
```bash
cd Carbon-Accounting-and-smart-Manufacturing
npm install
npm run dev
```
Open `http://localhost:5173/` in your browser.

---

## 7. 90-Second Demo Presentation Script

1. **Step 1 — Show the Baseline & Anomaly (0:00 - 0:20):**
   - Open the **Digital Twin** tab.
   - Point to the active anomaly alert: **COMP-01 (Air Compressor)** is idling unloaded at **18.0 kW** (instead of expected 8.0 kW) during break windows.
2. **Step 2 — Apply Preset 1: Compressor Idle Cutoff (0:20 - 0:40):**
   - Click the preset pill **"Compressor Idle Power Cutoff"**.
   - Watch the load curve update dynamically: notice the dual overlay chart showing baseline (dashed amber) vs scenario (solid cyan).
   - Point to the KPI card: **30 kWh/day saved, ₹270 avoided daily, 24.6 kg CO₂e abated**. Status: `FEASIBLE SIMULATION`.
3. **Step 3 — Run Peak Demand Shifting (0:40 - 0:60):**
   - Click **"Stagger CNC Machining Schedule"** (+2h offset).
   - Show how the coincident morning spike is eliminated, dropping plant peak demand below the **85 kW contract limit line**.
4. **Step 4 — Trigger Safety Interlock (0:60 - 0:75):**
   - Click **"Safety Interlock & Constraint Test"** (attempting 45 kW on 30 kW compressor).
   - Point to the red **BLOCKED BY SAFETY INTERLOCK** banner and diagnostic code `ERR_POWER_EXCEEDS_RATED`. Explain that the Digital Twin protects the physical plant from unfeasible operator assumptions.
5. **Step 5 — Single Source of Truth & Audit Report (0:75 - 0:90):**
   - Click **"Apply to Platform"**.
   - Navigate to **Overview**, **Carbon Accounting**, and **Audit Report**: show that the exact scenario ID, recalculations, and ISO 50001 verification data carry over seamlessly across every view.
