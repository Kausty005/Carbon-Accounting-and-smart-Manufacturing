# WattWise AI — Industrial Energy Intelligence, 3D Factory Twin & Carbon Accounting

**KPCL Hackathon — Problem Statement 1: AI-Driven Carbon Accounting & Intelligent Energy Management for Sustainable Manufacturing**  
*Industry Partner: Kirloskar Pneumatic Company Limited (KPCL)*  
*Theme: Sustainable Manufacturing | Green Technology | AI & Data Analytics*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.3-61DAFB.svg?logo=react&logoColor=black)](https://reactjs.org)
[![Three.js](https://img.shields.io/badge/Three.js-r186-black.svg?logo=three.js&logoColor=white)](https://threejs.org)
[![Scikit-Learn](https://img.shields.io/badge/scikit--learn-1.8+-F7931E.svg?logo=scikit-learn&logoColor=white)](https://scikit-learn.org)
[![ISO 14064](https://img.shields.io/badge/Standards-ISO%2014064%20|%20GHG%20Protocol%20|%20IPMVP-059669.svg)](https://ghgprotocol.org)
[![Tests](https://img.shields.io/badge/Tests-66%20Passed-brightgreen.svg)]()

---

## 1. Executive Summary & Vision

**WattWise AI** is an end-to-end industrial software platform built for **PrecisionWorks Manufacturing** (a reference heavy engineering and precision machining facility). It unites **high-fidelity 3D SCADA telemetry**, **physics-constrained Digital Twin simulation**, **multi-horizon gradient-boosted machine learning forecasting**, **GHG Protocol corporate carbon accounting**, and **statutory ESG compliance dossiers** into a unified, single source of truth.

> **Core Platform Promise:**  
> *"Simulate and verify factory energy decisions in the Digital Twin before executing them on the factory floor — reducing peak demand penalties, abating operational carbon, and generating auditable ESG filings."*

---

## 2. Core Architectural Pillars

```
                                      ┌───────────────────────────────────────────────────────────────┐
                                      │                      WATTWISE AI PLATFORM                     │
                                      └───────────────────────────────┬───────────────────────────────┘
                                                                      │
                ┌─────────────────────────────┬───────────────────────┴───────────────────────┬─────────────────────────────┐
                ▼                             ▼                                               ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────┐                     ┌─────────────────────────┐   ┌─────────────────────────┐
   │    3D Factory Studio    │   │      Digital Twin       │                     │    Carbon Accounting    │   │  Statutory Compliance   │
   │      & SCADA Twin       │   │    Scenario Engine      │                     │    & CCTS Offsetting    │   │     & Audit Dossiers    │
   ├─────────────────────────┤   ├─────────────────────────┤                     ├─────────────────────────┤   ├─────────────────────────┤
   │ • Three.js R3F 3D Floor │   │ • Time-indexed baseline │                     │ • Scope 1 Fuel & ETP    │   │ • ISO 14064-1 Verif Log │
   │ • 12 Physical Sensors   │   │ • Coincident peak shift │                     │ • Scope 2 CEA Grid v22  │   │ • IPMVP Option B/C M&V  │
   │ • Real-time HUD Badges  │   │ • ToD Tariff Calculator │                     │ • Shadow Pricing ₹2k/t  │   │ • SEBI BRSR Core Princ6 │
   │ • Tamper-proof Ledger   │   │ • Process Interlocks    │                     │ • ISO 14064-2 Additions │   │ • EU CBAM Export Engine │
   │ • Buffer Outage Sim     │   │ • Savings vs Baseline   │                     │ • Carbon Credit Trading │   │ • Streaming PDF Reports │
   └────────────┬────────────┘   └────────────┬────────────┘                     └────────────┬────────────┘   └────────────┬────────────┘
                │                             │                                               │                             │
                └─────────────────────────────┴───────────────────────┬───────────────────────┴─────────────────────────────┘
                                                                      ▼
                                      ┌───────────────────────────────────────────────────────────────┐
                                      │             FASTAPI BACKEND & ML INFERENCE ENGINE             │
                                      │  • 15m / 1d / 1w HistGradientBoosting Energy Forecaster       │
                                      │  • SHA-256 Merkle-tree Hash-Chain Audit Ledger Service       │
                                      │  • Role-Based Access Control (RBAC) Security Layer           │
                                      └───────────────────────────────────────────────────────────────┘
```

### 1. Interactive 3D Factory Twin & SCADA Studio
* **Interactive Three.js & React Three Fiber Viewport**: Render the entire factory floor with physical spatial positioning, machine dimensions, status beacons, and active production particle streams.
* **4 Core Industrial Machines**:
  - `01 / COMP-01`: Air Compressor (ELGi EG-55, 30 kW rated, 8 kW idle baseline, flagged 18 kW unloaded anomaly).
  - `02 / CNC-01`: CNC Machining Center (NLX-2500, 25 kW rated, 140 parts/day quota).
  - `03 / FURN-01`: Industrial Heat Treatment Furnace (IF-85, 50 kW rated, protected continuous thermal hold).
  - `04 / PAINT-01`: Painting Line & Exhaust Booth (PL-20, 20 kW rated, mandatory VOC ventilation interlock).
* **12 Physical Industrial Sensor Models**:
  - Discharge pressure transducers, vibration spectral accelerometers, orifice flow meters, RTD temperature probes, and smart energy submeters.
  - Interactive HUD popups with click-to-inspect physical parameters and operational tolerances.
* **Store-and-Forward Buffer Outage Simulation**:
  - Simulates SCADA network communication link failure.
  - Local circular edge buffer preserves critical meter readings and resynchronizes telemetry blocks to the cryptographic ledger with zero data loss.
* **Cryptographic SHA-256 Audit Ledger Modal**:
  - Live inspection of hash-linked audit blocks (block height, previous block hash, timestamp, Merkle root, transaction arrays, cryptographic signatures).

### 2. Physics-Constrained Digital Twin Scenario Engine
* **Dynamic Time-Indexed Baseline**: 672-row continuous 15-minute telemetry stream (7 days × 24 hours × 4 assets).
* **Pre-Engineered Operational Optimization Scenarios**:
  1. `Compressor Idle Cutoff (SCN-IDLE-FIX)`: Automates unloader cutoffs during shift pauses; recovers **30 kWh/day (~₹270/day, ~24.6 kg CO₂e)**.
  2. `Peak Demand Shaving (SCN-PEAK-SHIFT)`: Staggers CNC machining cycle by +2 hours to prevent simultaneous overlap with Furnace preheating, shaving coincident peak from **96 kW to 74 kW** (under the 85 kW contract demand ceiling).
  3. `Pneumatic Pressure Optimization (SCN-PRESSURE-OPT)`: Lowers ring-main pressure setpoint from 7.5 to 6.8 bar while safeguarding the 6.5 bar tool operational threshold.
  4. `Algorithmic Multi-Asset Stagger Optimizer`: Automates schedule offset permutations to minimize plant demand charges.
* **Physical Process & Safety Interlocks**:
  - Immediate rejection (`BLOCKED`) of hazardous inputs: `ERR_POWER_EXCEEDS_RATED` (e.g. attempting 45 kW on 30 kW motor), `ERR_PROTECTED_PROCESS_VIOLATION` (cutting furnace temperature mid-quench), and `ERR_MIN_PRESSURE_VIOLATION`.

### 3. Multi-Horizon AI Energy Forecasting Engine
* **HistGradientBoosting ML Regressor** trained on historical machine telemetry, time-of-day features, and production setpoints.
* **3 Dedicated Prediction Horizons**:
  - **15-Minute Next-Step Horizon**: Real-time dispatch telemetry and anomaly response.
  - **24-Hour Next-Day Horizon**: Hourly load scheduling and Time-of-Day tariff cost arbitrage.
  - **7-Day Next-Week Horizon**: Multi-machine shift planning and contract capacity reservation.
* **Generalization Benchmarks**: Verified across unseen machine operating profiles with synthetic benchmark data attribution.
* **Scikit-Learn 1.8+ Compatibility**: Runtime dynamic patch layer for unpickled pipeline imputers.

### 4. Dual-Scope Carbon Accounting & GHG Protocol Engine
* **Scope 1 Direct Emissions**: Stationary combustion calculations for LPG (705 kg/period @ 2.98 kg CO₂e/kg), PNG, Diesel Gensets, process emissions, and on-site ETP.
* **Scope 2 Indirect Electricity Emissions**:
  - Central Electricity Authority (CEA) User Guide v22.0 official grid factors (0.716 kg CO₂e/kWh net weighted average; 0.82 legacy; solar PPA 0.45).
  - Configurable methodology margins: Weighted Average with RES, Thermal Only, Operating Margin (OM), Build Margin (BM), Combined Margin (CM).
* **Shadow Carbon Pricing Engine**: Simulates internal carbon pricing at ₹2,000 / tCO₂e, accelerating project IRR and demonstrating tangible ESG financial ROI.

### 5. Voluntary Carbon Credits & BEE CCTS Trading Engine
* **ISO 14064-2 Project Additionality Evaluator**:
  - Computes $\text{Credits (tCO}_2\text{e)} = \text{Baseline Emissions} - \text{Actual Emissions} - \text{Leakage}$.
  - Automated barrier analysis: Regulatory additionality check, financial hurdle benchmark, and technological adoption friction.
* **Certified Carbon Credit Retirement Engine**:
  - Real-time portfolio tracking across BEE CCTS, BEE PAT ESCerts, Verra VCS, Gold Standard, and Global Carbon Council (GCC).
  - Tamper-proof on-chain cancellation / retirement against plant statutory quota overages.
* **Digital Twin Intervention Minter**: Automatically mints verified voluntary credits and equivalent BEE ESCerts directly from validated digital twin efficiency savings.

### 6. Statutory ESG Compliance Filing Portal & Dossiers
* **Consolidated 5-in-1 Dossier with Cryptographic Hash Integrity**:
  1. **ISO 14064-1 & GHG Protocol Verification Log**: Line-item activity data, transparent IPCC/CEA emission factors, and uncertainty margins.
  2. **IPMVP Option B/C Measurement & Verification (M&V)**: 14-day submeter baseline vs post-intervention regression with $R^2 \ge 0.94$ statistical confidence.
  3. **SEBI BRSR Core Principle 6 Environmental Disclosure**: Mandatory Indian corporate sustainability disclosures (energy and GHG intensity per Rupee of turnover and per physical part).
  4. **EU CBAM Disclosure**: Specific direct and indirect embedded emissions per metric ton under EU Regulation 2023/956 for cross-border carbon border adjustment.
  5. **Offset Registry Lifecycle Pipeline**: Active tracking of project registration stages across CCTS, Verra, and Gold Standard.

### 7. Publication-Grade Corporate Carbon Audit Report & PDF Generator
* Server-side Python multi-page PDF generation engine with high-resolution vector typography.
* Complete with executive summary, line-item emission inventory, statutory allowance reconciliation, carbon credit holdings, and SHA-256 cryptographic audit trail.

### 8. Role-Based Access Control (RBAC) & Enterprise Personas
* 4 distinct enterprise personas with view-level security filters:
  - 🏭 **Plant SCADA Operator**: Real-time floor telemetry, 3D SCADA twin, anomaly alerts, buffer controls.
  - ⚡ **Energy Auditor / Manager**: Digital Twin simulation engine, load curve analysis, energy forecasting.
  - 🌿 **Sustainability / ESG Officer**: GHG Protocol inventories, carbon credits trading, compliance filing dossiers.
  - 👔 **Chief Sustainability Officer (CSO) / Executive**: High-level executive KPI dashboards, corporate audit reports, statutory PDF downloads.

### 9. WattWise AI Assistant & Contextual Explainer
* Glowing particle **AIOrb** assistant.
* Floating interactive AI chatbot contextualized with live factory telemetry.
* Contextual **Explainable** buttons on any metric or KPI card for instant AI root-cause explanations.

---

## 3. Technology Stack

### Frontend Architecture
* **Core**: React 19, TypeScript, Vite
* **3D Visualization**: Three.js, React Three Fiber (`@react-three/fiber`), Drei (`@react-three/drei`)
* **Styling & Motion**: Custom Industrial CSS Design System, Framer Motion
* **Data Visualization**: Recharts (dual-overlay load curves, donut charts, area trends)
* **Icons**: Lucide React

### Backend Architecture
* **Framework**: FastAPI, Uvicorn, Pydantic v2
* **Machine Learning**: Scikit-Learn (HistGradientBoostingRegressor), NumPy, Pandas, Joblib
* **PDF & Reporting Engine**: ReportLab vector graphics, io streaming
* **Security & Auditing**: Cryptographic SHA-256 Merkle-tree hash-chaining, Role-Based Access Control

---

## 4. Repository Structure

```
.
├── backend/                               # FastAPI Python Backend
│   ├── app/
│   │   ├── main.py                        # FastAPI application entrypoint & lifespan
│   │   ├── models.py                      # Pydantic schemas (telemetry, carbon, audit, compliance)
│   │   ├── routers/
│   │   │   ├── carbon.py                  # Carbon accounting, credits, compliance & PDF endpoints
│   │   │   ├── forecast.py                # Multi-horizon ML energy forecast routes
│   │   │   ├── sensors.py                 # 3D SCADA sensor simulation & buffer outage API
│   │   │   ├── anomalies.py               # Incident store & rule-based ML anomaly routes
│   │   │   └── ai.py                      # Streaming chatbot & contextual explainer API
│   │   └── services/
│   │       ├── carbon_service.py          # Scope 1 & 2 calculation engine
│   │       ├── carbon_credits_service.py  # Additionality & credit retirement engine
│   │       ├── compliance_filing_service.py # SEBI BRSR, ISO 14064, IPMVP, EU CBAM dossiers
│   │       ├── audit_report_service.py    # Multi-page publication PDF generator
│   │       ├── audit_ledger.py            # SHA-256 cryptographic hash-chain ledger
│   │       ├── energy_forecasting_service.py # 15m, 1d, 1w ML inference engine
│   │       ├── sensor_simulation_service.py  # 12-sensor physical telemetry generator
│   │       └── reference_data.py          # CEA grid factors & IPCC fuel catalogues
│   ├── data/
│   │   └── audit_ledger.json              # Persistent cryptographic audit block store
│   └── tests/                             # Pytest suite (66 tests covering all modules)
│
├── ml/                                    # Machine Learning Training & Models
│   └── energy_forecasting/
│       ├── models/                        # Serialized .joblib model artifacts (15m, 1d, 1w)
│       ├── reports/                       # Multi-horizon evaluation reports & metrics
│       └── src/                           # Model training scripts
│
├── src/                                   # Vite + React 19 Frontend
│   ├── App.tsx                            # Root application shell with RBAC & view router
│   ├── auth/
│   │   └── authTypes.ts                   # Role definitions, view security matrix & mock users
│   ├── components/
│   │   ├── Auth/                          # Login modal & Access Denied fallback views
│   │   ├── Factory3D/                     # Three.js factory floor, 3D sensor models, HUD badges
│   │   ├── DigitalTwin/                   # Scenario engine UI, load curve comparison, presets
│   │   ├── ForecastDashboard/             # Multi-horizon AI forecasting dashboard
│   │   ├── Carbon/                        # Carbon accounting view, credits engine, compliance portal, audit report
│   │   ├── AIAnomaly/                     # Anomaly intelligence & incident management
│   │   ├── AIChat/                        # Floating assistant chatbot with AIOrb
│   │   ├── AIExplain/                     # Contextual explanation popovers & explainable wrappers
│   │   └── HomePage/                      # Interactive landing overview & telemetry cards
│   ├── services/                          # Typed API client services
│   └── data/                              # Reference factory profiles & mock dataset
│
├── package.json                           # Node dependencies & build scripts
└── README.md                              # Complete platform documentation
```

---

## 5. Getting Started & Running the Platform

### Prerequisites
* **Node.js**: v18.0 or higher
* **Python**: v3.10, v3.11, or v3.14 (with `pip`)
* **Git**

---

### Step 1: Clone and Set Up the Repository

```bash
git clone https://github.com/Kausty005/Carbon-Accounting-and-smart-Manufacturing.git
cd Carbon-Accounting-and-smart-Manufacturing
```

---

### Step 2: Set Up and Run the Python Backend

Install the required Python packages:
```bash
pip install fastapi uvicorn pydantic scikit-learn numpy pandas joblib reportlab
```

Launch the FastAPI backend server:
```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

* **API Server**: `http://localhost:8000`
* **Interactive Swagger Documentation**: `http://localhost:8000/docs`
* **ReDoc Interactive Documentation**: `http://localhost:8000/redoc`

---

### Step 3: Set Up and Run the React Frontend

Open a new terminal in the project root:
```bash
npm install
npm run dev
```

* **Web Application**: `http://localhost:5173`

The frontend automatically connects to the live FastAPI backend on port 8000. If the backend is not running, the application seamlessly activates an **Offline Demo Mode** with full mathematical fidelity.

---

### Step 4: Run Automated Verification Tests

#### Backend Automated Test Suite (66 Tests)
```bash
python -m pytest backend/tests -v
```
Verifies:
* ISO 14064-1 & GHG Protocol Scope 1 and Scope 2 calculation accuracy.
* ISO 14064-2 additionality formulas and credit retirement transactions.
* SEBI BRSR Core, IPMVP M&V, and EU CBAM regulatory dossier schemas.
* Multi-horizon ML energy forecasting models (15-min, daily, weekly).
* Sensor simulation streams, anomaly detection rules, and buffer store-and-forward.
* Publication-grade PDF report byte generation.

#### Frontend Compilation & Typecheck
```bash
npm run build
```
Executes `tsc` and `vite build` to guarantee zero TypeScript or bundle warnings.

---

## 6. Three-Minute Live Demo Presentation Script

| Time | View / Feature | Action & Talking Points |
| :--- | :--- | :--- |
| **0:00 - 0:35** | **Overview & Landing Page** | • Introduce **PrecisionWorks Manufacturing** and the live power summary (125 kW coincident demand).<br>• Point out the active anomaly flag: Air Compressor `COMP-01` is drawing **18 kW unloaded idle power** during shift breaks instead of 8 kW rated.<br>• Click the role badge in the top navigation to show **Role-Based Access Control (RBAC)** across 4 enterprise personas. |
| **0:35 - 1:15** | **3D Factory Studio & Sensors** | • Navigate to **3D Factory Twin** (`SCADA`). Inspect the interactive Three.js floor layout.<br>• Click on `COMP-01` to view the 3D pressure and vibration sensor HUD cards.<br>• Click **"Simulate Network Outage"** to demonstrate edge buffer store-and-forward telemetry preservation.<br>• Open the **Audit Ledger Modal** to show cryptographic SHA-256 block hashes and tamper-evident signatures. |
| **1:15 - 1:55** | **Digital Twin Simulation** | • Navigate to **Digital Twin** (`Simulator`). Show the dual-trace load curve (dashed amber baseline vs solid cyan scenario).<br>• Click preset **"Compressor Idle Power Cutoff"**: observe instant recovery of **30 kWh/day, ₹270 avoided cost, and 24.6 kg CO₂e abated**.<br>• Click preset **"Stagger CNC Machining Schedule"**: show how coincident plant peak drops from 96 kW to 74 kW, eliminating demand penalties.<br>• Trigger **"Safety Interlock Test"**: show how the physics engine immediately blocks unsafe parameter combinations (`ERR_POWER_EXCEEDS_RATED`). |
| **1:55 - 2:30** | **AI Forecasting & Anomaly Intel** | • Navigate to **AI Forecast**. Show multi-horizon predictions: 15-minute operational demand, 24-hour next-day peak curve, and 7-day multi-asset planning.<br>• Navigate to **Anomalies** to inspect auto-generated root-cause incident reports and technician mitigation checklists. |
| **2:30 - 3:00** | **Carbon Accounting & Compliance** | • Navigate to **Carbon Accounting**.<br>• Switch between the 3 sub-tabs:<br>  1. 🌿 **GHG Accounting**: Scope 1 vs Scope 2 breakdown, CEA India v22 emission factor adjustments, and shadow carbon pricing (₹2,000/tCO₂e).<br>  2. 🪙 **Carbon Credits Engine**: ISO 14064-2 additionality test and one-click credit retirement with audit ledger tracking.<br>  3. 📑 **Compliance Filing Dossiers**: View consolidated SEBI BRSR, IPMVP Option B/C, and EU CBAM filing packets.<br>• Navigate to **Audit Report** and click **"Download Official PDF"** to stream the official multi-page audit report. |

---

## 7. Compliance & Standards Provenance

* **ISO 14064-1:2018**: Specification with guidance at the organization level for quantification and reporting of greenhouse gas emissions and removals.
* **ISO 14064-2:2019**: Specification with guidance at the project level for quantification, monitoring, and reporting of greenhouse gas emission reductions or removal enhancements (Additionality).
* **ISO 50001:2018**: Energy management systems — Requirements with guidance for use (EnPI baseline vs scenario verification).
* **IPMVP (EVO 10000-1:2022)**: International Performance Measurement and Verification Protocol (Option B Retrofit Isolation & Option C Whole Facility).
* **GHG Protocol Corporate Standard**: Revised Edition (World Resources Institute & WBCSD) with Scope 2 Guidance.
* **Central Electricity Authority (CEA) User Guide v22.0 (2024)**: Baseline Carbon Dioxide Emission Database for the Indian Power Sector, Ministry of Power, GoI.
* **SEBI BRSR Core**: Securities and Exchange Board of India Circular on Business Responsibility and Sustainability Reporting (Principle 6: Environment).
* **EU CBAM (Regulation EU 2023/956)**: European Union Carbon Border Adjustment Mechanism methodology for direct and indirect specific embedded emissions.

---

## 8. License & Acknowledgements

Developed for the **KPCL Hackathon 2026** by the **WattWise AI Engineering Team**.  
*Industry Partner:* **Kirloskar Pneumatic Company Limited (KPCL)**  
*Project Name:* **Carbon Accounting and Smart Manufacturing**
