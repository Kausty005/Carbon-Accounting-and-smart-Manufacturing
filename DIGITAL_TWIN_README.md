# ⚡ WattWise AI — Operational Decision & Counterfactual Digital Twin

> **KPCL Problem Statement 1: AI-Powered Smart Manufacturing & Industrial Digital Twin**  
> **Team Module Documentation:** Operational Digital Twin, Deterministic Scenario Simulation, Epistemic Humility (Idea A), Counterfactual Verification (Idea B), and Production-Safe Optimization (Idea C).

---

## 1. Executive Summary & Thesis

Most hackathon digital twins simply build a 3D model or a Grafana-style dashboard that visualizes energy data that operators can already see. WattWise AI takes a fundamentally different, industrially grounded approach:

> **Do not build another digital twin that visualizes a factory. Build one that helps an industrial manager decide which operational change is worth making, predicts what will happen, explains the uncertainty, and verifies whether the expected savings actually occurred.**

By combining **Epistemic Humility (Idea A)**, **Counterfactual Normalization (Idea B)**, and **Production-Safe Physical Interlocks (Idea C)**, WattWise AI provides an operational decision system that plant managers and CFOs can actually trust.

---

## 2. Core Strategic Triad (Product Differentiation)

```
                       ┌─────────────────────────────────────────┐
                       │           WattWise Decision Twin        │
                       └────────────────────┬────────────────────┘
                                            │
         ┌──────────────────────────────────┼──────────────────────────────────┐
         │                                  │                                  │
         ▼                                  ▼                                  ▼
┌──────────────────┐              ┌──────────────────┐               ┌──────────────────┐
│      Idea A      │              │      Idea C      │               │      Idea B      │
│Epistemic Humility│              │ Production-Safe  │               │  Counterfactual  │
│   Sensor ROI     │              │Physical Interlock│               │   M&V Factory    │
└────────┬─────────┘              └────────┬─────────┘               └────────┬─────────┘
         │                                 │                                  │
   Knows what is                     Rejects actions                   Proves savings
   unmeasured &                      violating physics,                were real rather
   evaluates VOI                     pressure, or SLA                  than lower output
```

### Pillar 1: Epistemic Humility & Sensor Sufficiency (Idea A)
* **Industrial Problem:** Plant telemetry is imperfect. Electrical submeters measure power draw but cannot diagnose *why* power is drawn. On an air compressor, an 18 kW break-period idle draw could be **control blow-off timer waste** (recoverable via a ₹2,000 relay) or **downstream pipe leakage** (requiring physical pipe maintenance).
* **Our Solution:** The twin knows what it does not know. Instead of hallucinating certainty, it outputs a diagnostic ambiguity alert and calculates the **Value of Information (VOI)**:
  $$\text{VOI Ratio} = \frac{\text{Annual Uncertainty Span (₹)}}{\text{Temporary Sensor Capex (₹)}}$$
  Simulating the addition of a temporary clamp-on ultrasonic airflow meter (₹12,000) collapses uncertainty from $\pm 35\%$ down to $\pm 5\%$, proving payback in 56 days.

### Pillar 2: Production-Safe Physical Interlocks (Idea C)
* **Industrial Problem:** Energy managers ignore "black-box AI" advice because cutting power arbitrarily ruins furnace batches, collapses compressed air ring-main pressure, or breaches environmental ventilation mandates.
* **Our Solution:** Hard physics and process safety interlocks are evaluated *before* any scenario can be executed:
  - `ERR_POWER_EXCEEDS_RATED`: Rejects power setpoints above equipment nameplate capacity.
  - `ERR_PRESSURE_COLLAPSE`: Rejects pneumatic pressure setpoints below the 6.5 bar ring-main tool-holding floor.
  - `ERR_PROTECTED_PROCESS_VIOLATION`: Rejects curtailing `FURN-01` during active heat-treatment cycles.
  - Generates a **3-Option Trade-Off Matrix**: Compares Aggressive Cutoff vs. Production-Preserving Stagger vs. Baseline.

### Pillar 3: The Counterfactual Factory (Idea B — IPMVP Option B)
* **Industrial Problem:** Post-intervention blame game. If energy drops next month, CFOs wonder if it was genuine efficiency or just lower production / fewer shifts.
* **Our Solution:** Establishes an immutable baseline and computes the **Counterfactual Factory** adjusted for actual parts produced:
  $$\text{Adjusted Baseline kWh} = \text{Baseline kWh} \times \left( \frac{\text{Actual Production Units}}{\text{Baseline Production Units}} \right)$$
  $$\text{Realized Savings} = \text{Adjusted Baseline kWh} - \text{Actual Measured kWh}$$
  Records verified savings into an immutable M&V (Measurement & Verification) ledger.

---

## 3. Dataset Integration & Finalized Schema

The digital twin natively maps and ingests features from the finalized **`industrial_energy_forecasting_synthetic.csv`** dataset (740,748 rows, 6-month historical telemetry across 3 sites and 43 machines):

| Feature Column | Machine / Value Range | Physical & Operational Meaning in Digital Twin |
| :--- | :--- | :--- |
| `operating_state` | `0, 1, 2, 3` | Discrete state: `State 0` (Off: 0 kW), `State 1` (Idle: ~7% rated kW), `State 2` (Run: 70–85% rated kW), `State 3` (Standby/Maint). |
| `load_factor` | `0.00` to `1.00` | Continuous ratio: $\text{power\_kw} / \text{rated\_power\_kw}$. Allows direct load factor tuning in scenario simulations. |
| `ambient_temp_c` | `15.0°C` to `45.0°C` | Ambient weather temperature. Evaluates **ISO 1217 thermodynamic gas law**: compressor power draw shifts by $+0.35\% / ^\circ\text{C}$ due to air density changes. |
| `process_temp_c` | `19.0°C` to `850.0°C` | Internal thermal equipment / furnace holding temperature for `FURN-01` heat-treatment cycles. |
| `relative_humidity_pct` | `30.0%` to `95.0%` | Ambient humidity influencing moisture separator and pneumatic cooling demand. |
| `sensor_quality` | `good`, `suspect`, `missing` | Directly feeds **Idea A**: `good` ($\pm 5\%$ error, Grade A), `suspect` ($\pm 20\%$, Grade B), `missing` ($\pm 35\%$, Grade C + VOI recommendation). |
| `shift_pattern` | `day_shift`, `2_shift`, `3_shift` | Shift schedule determining break windows and idle run-hours. |
| `production_units` | integer count | Parts produced per interval (used for Specific Energy Consumption $\text{SEC} = \text{kWh}/\text{unit}$). |
| `target_next_15min_energy_kwh` | float (kWh) | 15-minute ahead forecasting regression target. |

### Machine Profile & ID Mapping
The 4 primary assets of **PrecisionWorks Manufacturing** map directly to the dataset's industrial machine taxonomy:
- `COMP-01` (30 kW Rated) $\leftrightarrow$ `AIR_COMPRESSOR` (`MACHINE_011`, `MACHINE_012`, `MACHINE_013`, `MACHINE_017`)
- `CNC-01` (25 kW Rated) $\leftrightarrow$ `CNC_MILL` (`MACHINE_008`, `MACHINE_010`, `MACHINE_034`, `MACHINE_038`)
- `FURN-01` (50 kW Rated) $\leftrightarrow$ `OVEN_FURNACE` (`MACHINE_004`, `MACHINE_015`, `MACHINE_031`)
- `PAINT-01` (20 kW Rated) $\leftrightarrow$ `FAN_BLOWER` / Exhaust (`MACHINE_023`, `MACHINE_024`, `MACHINE_025`)

---

## 4. Engineering Mathematics & Formulas

All calculations in the twin follow strict engineering standards (ISO 50001, IPMVP, ISO 1217, and CEA Baseline Database V22.0):

1. **Interval Energy Consumption:**
   $$E_t = \bar{P}_t \times \Delta t \quad (\text{for hourly interval } \Delta t = 1.0\text{ h})$$

2. **Factory Aggregate Demand:**
   $$P_{\text{plant}}(t) = \sum_{m \in \text{Machines}} P_m(t)$$

3. **Peak Electrical Demand:**
   $$P_{\text{peak}} = \max_{t \in [0, 24)} P_{\text{plant}}(t)$$

4. **Specific Energy Consumption (SEC):**
   $$\text{SEC} = \frac{\sum_{t=0}^{23} E_{\text{plant}}(t)}{\text{Total Good Production Units}} \quad (\text{kWh/part})$$

5. **Time-of-Day (ToD) Electricity Tariffs (Maharashtra Industrial HT Tariff Model):**
   $$\text{Cost} = \sum_{t=0}^{23} \left( E_{\text{plant}}(t) \times R(t) \right) + \text{Demand Penalty}$$
   - **Off-Peak (22:00–06:00):** ₹7.65 / kWh ($0.85\times$)
   - **Normal (06:00–09:00, 12:00–18:00):** ₹9.00 / kWh ($1.00\times$)
   - **Peak (09:00–12:00, 18:00–22:00):** ₹10.80 / kWh ($1.20\times$)
   - **Contract Demand Surcharge:** ₹350 / kW for any coincident demand exceeding the 85.0 kW contract ceiling.

6. **Scope 2 Grid Carbon Emissions:**
   $$\text{Scope 2 CO}_2\text{e} = \text{Total Electricity (kWh)} \times \text{Grid Emission Factor} \quad (0.82\text{ kg CO}_2\text{e/kWh CEA v19 / } 0.72886\text{ CEA v22})$$

7. **Thermodynamic Ambient Temperature Correction (ISO 1217):**
   $$P_{\text{comp\_adjusted}} = P_{\text{comp\_nominal}} \times \left(1 + (T_{\text{ambient}} - 24.0) \times 0.0035\right)$$

---

## 5. Codebase Architecture & File Structure

```
Carbon-Accounting-and-smart-Manufacturing/
├── DIGITAL_TWIN_README.md            # This detailed module documentation
├── src/
│   ├── components/
│   │   └── DigitalTwin/
│   │       └── DigitalTwinView.tsx    # Interactive simulation workbench UI
│   └── digitalTwin/
│       ├── types.ts                  # Type definitions (Telemetry, Actions, Results, M&V)
│       ├── twinProfiles.ts           # Machine profiles, rated kW, safety constraints, aliases
│       ├── baselineEngine.ts         # Deterministic 24h baseline generator (Seed 42, ISO 50001)
│       ├── scenarioEngine.ts         # Action transformation engine & thermodynamic scaling
│       ├── calculationEngine.ts      # ToD tariffs, interval energy, SEC, deltas
│       ├── constraintValidator.ts    # Physical interlock & feasibility validation (Idea C)
│       ├── confidenceEngine.ts       # VOI calculation & sensor sufficiency gating (Idea A)
│       ├── mvLedger.ts               # IPMVP Option B counterfactual ledger (Idea B)
│       ├── optimizer.ts              # Algorithmic peak load search & stagger optimizer
│       └── presets.ts                # Scenario presets & 3-option trade-off matrix data
├── backend/
│   ├── app/
│   │   ├── routes/
│   │   │   └── simulation.py         # FastAPI REST endpoints (/api/simulation/*)
│   │   └── services/
│   │       ├── baseline_engine.py    # Python baseline generator
│   │       ├── scenario_engine.py    # Python scenario transformation engine
│   │       ├── twin_profiles.py      # Python asset profiles and tariff configs
│   │       ├── twin_metrics.py       # Python metric calculations
│   │       └── constraint_validator.py# Python physical constraint validator
└── tests/
    ├── test_digital_twin.py          # 10 unit tests (Interval energy, ToD, immutability, interlocks)
    └── test_simulate_api.py          # 7 API tests (Endpoints, trade-off matrix, peak optimization)
```

---

## 6. REST API Endpoints

The backend provides production-ready FastAPI endpoints for digital twin integration:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/simulation/machines` | Returns profiles, rated power, and safety constraints for all plant assets. |
| `GET` | `/api/simulation/baseline?day_index=6` | Returns immutable 24-hour baseline telemetry records. |
| `POST` | `/api/simulation/simulate` | Executes a what-if scenario simulation, verifies constraints, and returns deltas. |
| `POST` | `/api/simulation/optimize-peak` | Algorithmic search across schedule offsets to eliminate demand spikes. |
| `GET` | `/api/simulation/tradeoff-matrix` | Evaluates 3 candidate strategies (Aggressive, Balanced, Conservative) for Idea C. |

---

## 7. Automated Test Suite (34 / 34 Tests Passing)

The implementation includes comprehensive test coverage verifying mathematical determinism, immutability, and safety interlocks:

```bash
# Run Digital Twin tests (17 passed)
python -m pytest tests/ -v

# Run Scope 1 & 2 Carbon tests (17 passed)
python -m pytest backend/tests/ -v
```

### Verified Test Cases:
- `test_t01_interval_energy_one_hour`: Validates $E = P \times \Delta t$ over 1 hour.
- `test_t02_interval_energy_half_hour`: Validates 30-minute interval math.
- `test_t03_plant_demand_sum`: Validates plant-wide sum across all 4 assets.
- `test_t04_compressor_reduction_delta`: Verifies compressor idle power reduction deltas.
- `test_t05_schedule_shift_flat_tariff`: Tests schedule shifting energy conservation.
- `test_t06_target_power_exceeds_rated`: Verifies interlock rejection when power exceeds nameplate rated kW.
- `test_t07_protected_furnace_cycle`: Verifies interlock rejection when curtailing active furnace heating cycle.
- `test_t08_missing_emission_factor`: Validates fallback behavior for emission factors.
- `test_t10_determinism`: Proves identical inputs yield bit-exact identical outputs.
- `test_t11_immutability`: Proves running scenarios never mutates the historical baseline.
- `test_api_simulate_idle_reduction`: Tests REST API scenario simulation.
- `test_api_simulate_blocked_violation`: Tests REST API rejection of unsafe scenarios.
- `test_api_tradeoff_matrix`: Validates the 3-option candidate matrix.

---

## 8. 5-Minute Live Judging Walkthrough

To demo the Digital Twin live to KPCL hackathon reviewers:

1. **Open the Digital Twin View:**
   - In the left sidebar, click **Digital Twin**.
   - *(Optional)*: Click **"Hide Side Panel"** in the top navbar to expand the workbench to full widescreen width.
2. **Execute Scenario 1 (The Core ROI):**
   - Click the preset pill: **`Compressor Idle Power Cutoff`**.
   - **Show the KPI Bar:** Daily energy drops by **-14.4 kWh (-1.1%)**, saving **₹216 / day** and **11.8 kg CO₂e**.
   - **Show the Load Curve:** The solid cyan curve dips below the dashed baseline during the 11:00–13:00 break period.
3. **Execute Scenario 2 (Production-Safe Interlocks — Idea C):**
   - Select **`FURN-01` (Heat-Treatment Furnace)**.
   - Set action to **Reduce Avoidable Idle Power**, or move power slider above 50 kW.
   - Click **Recalculate Dynamic Simulation**.
   - **Show the Red Banner:** **"BLOCKED BY SAFETY INTERLOCK"** (`ERR_PROTECTED_PROCESS_VIOLATION`). Explain how WattWise prevents equipment damage and spoiled batches.
4. **Show Epistemic Humility & Sensor ROI (Idea A):**
   - Click the tab: **`Sensor-ROI & Confidence (Idea A)`**.
   - Point out the physical ambiguity (timer waste vs pipe leakage, $\pm 35\%$ uncertainty).
   - Toggle **"Simulate Adding Flowmeter (+₹12,000)"** $\rightarrow$ uncertainty collapses to $\pm 5\%$, proving sensor ROI payback in 56 days.
5. **Show Counterfactual M&V Factory (Idea B):**
   - Click the tab: **`Counterfactual M&V Factory (Idea B)`**.
   - Explain IPMVP Option B production normalization and click **"Commit Active Scenario to Ledger"**.
6. **Commit to Platform:**
   - Click **"Apply to Platform"** in the top banner $\rightarrow$ metrics propagate to the Executive Dashboard and Audit Report.

---

## 9. Setup & Development Instructions

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+ with `pytest`, `fastapi`, `uvicorn`, `pydantic`

### Running Frontend
```bash
cd Carbon-Accounting-and-smart-Manufacturing
npm install
npm run dev
# Open http://localhost:5173
```

### Running Backend API
```bash
cd Carbon-Accounting-and-smart-Manufacturing
uvicorn backend.app.main:app --reload --port 8000
# OpenAPI Swagger docs at http://127.0.0.1:8000/docs
```
