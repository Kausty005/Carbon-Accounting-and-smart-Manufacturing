# 🏭 WattWise AI — Enterprise Expansion & Multi-Vector Industrial Digital Twin
## Comprehensive Architecture & Implementation Plan: Scope 1-2-3 Multi-Fuel Accounting, Edge IoT Ingestion, Local On-Premise XAI with RAG, 50-Asset Library, and Live Carbon Quota Interlocks

> **Document Version:** 3.1 (Enterprise Roadmap & Industrial Field Research Edition)  
> **Status:** Architecture, Field Research & Implementation Plan  
> **Origin:** Post-Review Feedback Integration (KPCL Problem Statement 1 & Enterprise Manufacturing Adoption)  
> **Target Audience:** Hackathon Reviewers, Industrial Plant Managers, CFOs, Lead ESG Auditors, and Technical Development Team  

---

## 1. Executive Synthesis & Architectural Vision

During our technical progress review, industrial judges and plant automation experts raised fundamental realities of real-world manufacturing that conventional digital twins ignore:

1. **Energy Is Not Just Electricity:** Heavy manufacturing facilities depend heavily on fossil combustion (diesel generators, natural gas boilers, heavy fuel oil, LPG furnaces), chemical processes (solvents, refrigerants, welding gases), and waste effluent degradation. Restricting a digital twin to electric submeters blinds the enterprise to **40% to 70% of its real-world carbon footprint**.
2. **Auditability Demands Real-Time Continuous Ingestion:** Statutory disclosures (**SEBI BRSR Core**, **EU CBAM**, **ISO 14064-1/3**) reject manual monthly utility spreadsheets in favor of immutable, sensor-grounded continuous audit logs with cryptographic provenance.
3. **Field Data Must Come from Physical Sensors:** Telemetry must bridge real shop-floor instrumentation—Class 0.5S Modbus RTU energy meters, Coriolis fuel mass flow meters, NDIR flue gas analyzers, and optical COD effluent probes—with 72-hour edge gateway buffering.
4. **Explainable AI Must Run Locally with Inbuilt RAG:** Industrial data sovereignty and air-gapped security prohibit streaming telemetry to public cloud LLMs. An on-premise lightweight quantized model backed by standards-based RAG (IPCC 2006, ISO 50001, CEA Baseline v22.0, BEE benchmarks) is essential.
5. **A 50-Asset Hybrid Library Is Required:** Plants require an extensible catalog of both electric and non-electric/thermal/chemical machinery to configure their exact physical floor.
6. **Live Carbon Quotas Require Active Guardrails:** Companies face statutory carbon caps; the twin must enforce operational throttling and automated fuel-switching interlocks when emissions approach compliance thresholds.
7. **Dual-Audience UX:** The system must present executive clarity for non-technical leadership (Plant Head/CFO) while offering deep-dive diagnostics for utility and maintenance engineers.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       WATTWISE AI ENTERPRISE SYSTEM ARCHITECTURE                                  │
└────────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴───────────────────────────────────────┐
 │                       LEVEL 0 & 1: PHYSICAL SENSOR INGESTION                  │
 │   Physical Sensors (RS-485 Modbus, 4-20mA, NDIR Flue Gas, Coriolis Fuel Meters, Optical COD)                    │
 │                                       │ (Modbus RTU/TCP, OPC-UA, MQTT Sparkplug B)                              │
 │   Edge Gateway Buffer (DuckDB / SQLite 72h offline resilience + NTP millisecond timestamps)                     │
 └───────────────────────────────────────┬─────────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────┐
 │                               LEVEL 2: CALCULATION & AUDIT LEDGER                                               │
 │   ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐                 │
 │   │  Scope 1 Multi-Fuel Engine│   │ Scope 2 Grid CEA Engine   │   │  Scope 1 & 3 Process/Waste│                 │
 │   │  Diesel, PNG, LPG, FO, Coal│   │ CEA v22.0 Database Results │   │  Refrigerants, Solvents,  │                 │
 │   │  IPCC 2006 Vol 2 Ch 2     │   │ 5 Methodologies (OM/BM/CM)│   │  Wastewater COD/BOD       │                 │
 │   └─────────────┬─────────────┘   └─────────────┬─────────────┘   └─────────────┬─────────────┘                 │
 │                 │                               │                               │                               │
 │                 └───────────────────────┬───────┴───────────────────────────────┘                               │
 │                                         ▼                                                                       │
 │                  Immutable Real-Time Hash-Chain Audit Ledger (SHA-256 Block Logs)                               │
 └─────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────┐
 │                               LEVEL 3: DECISION INTELLIGENCE & CONTROL                                          │
 │   ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐                 │
 │   │ 50-Asset Machine Library  │   │ Live Carbon Quota Interlock│   │ On-Premise XAI Engine     │                 │
 │   │ 6 Utility/Production Cells│   │ Dynamic Burn Rate Index   │   │ Local Llama-3.2-3B / Phi  │                 │
 │   │ Electric & Non-Electric   │   │ Operational Throttle/Switch│   │ Inbuilt RAG Standards     │                 │
 │   └───────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘                 │
 └─────────────────────────────────────────┬───────────────────────────────────────────────────────────────────────┘
                                         │
 ┌───────────────────────────────────────┴─────────────────────────────────────────────────────────────────────────┐
 │                                   LEVEL 4: DUAL-AUDIENCE INTERFACE                                              │
 │   ┌───────────────────────────────────────────────┐   ┌─────────────────────────────────────────────────────┐   │
 │   │           EXECUTIVE PRESENTATION MODE         │   │            ENGINEERING DIAGNOSTIC MODE              │   │
 │   │  Plant Health Score · Statutory Carbon Gauge  │   │  Sub-second Waveforms · Combustion Air/Fuel Curves  │   │
 │   │  1-Sentence XAI Briefings · 1-Click BRSR/CBAM │   │  Mass-Energy Balances · Modbus Register Telemetry   │   │
 │   └───────────────────────────────────────────────┘   └─────────────────────────────────────────────────────┘   │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Factory Floor Field Research: The 5 Non-Electric Carbon Centers

Walking onto a physical heavy engineering plant floor (e.g. Kirloskar compressor/pump manufacturing, automotive forging, precision casting), carbon emissions originate across five distinct physical zones outside the electrical substation:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   PHYSICAL FACTORY FLOOR WALKTHROUGH                            │
├─────────────────────────┬─────────────────────────┬─────────────────────────────────────────────┤
│ Zone                    │ Physical Equipment      │ Emission Mechanism & Global Factor          │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────────────┤
│ 1. DG & Power Yard      │ 750–1500 kVA DG Sets    │ Scope 1: Diesel combustion (HSD).           │
│                         │ (Cummins / Kirloskar)   │ Factor: 2.682 kg CO₂e / Liter               │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────────────┤
│ 2. Boiler & Thermic     │ Steam Boilers, Thermic  │ Scope 1: Natural gas (PNG) or Furnace Oil.  │
│    Utility Block        │ Fluid Heaters           │ PNG: 2.162 kg CO₂e / Sm³; HFO: 3.125 kg / L │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────────────┤
│ 3. Thermal Processing   │ Annealing, Hardening &  │ Scope 1: LPG combustion & shield gas.       │
│    & Paint Curing       │ Carburizing Furnaces    │ LPG: 2.987 kg CO₂e / kg; CO₂ welding gas    │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────────────┤
│ 4. Chiller & Air Drying │ Screw Chillers, Recip.  │ Scope 1 Fugitive: HFC refrigerant leaks.    │
│    Refrigeration Plant  │ Dryers (R-134a, R-410A) │ R-134a GWP = 1,530; R-410A GWP = 2,088      │
├─────────────────────────┼─────────────────────────┼─────────────────────────────────────────────┤
│ 5. Effluent Treatment   │ Equalization, Aeration  │ Scope 1 & 3: Anaerobic/aerobic COD/BOD.     │
│    Plant (ETP / STP)    │ & Sludge Digestion      │ 0.25 kg CH₄ / kg COD (IPCC Waste Model)     │
└─────────────────────────┴─────────────────────────┴─────────────────────────────────────────────┘
```

### 1. The DG Yard & Fuel Storage (Backup Power & Peak Shaving)
* **Operational Reality:** Facilities operate diesel generators during grid outages, brownouts, or intentionally during peak tariff hours to shave demand charges.
* **Emission Physics:** Burning High-Speed Diesel (HSD) emits **$2.682\text{ kg CO}_2\text{e}$ per liter**. At an industry-average specific fuel consumption of $3.5\text{ kWh/L}$, DG electricity has an emission factor of **$0.766\text{ kg CO}_2\text{e/kWh}$**, significantly dirtier than the regional grid during off-peak hours, alongside substantial unburned hydrocarbons and toxic $\text{NO}_x$.
* **The Audit Trap:** Plants frequently log diesel by paper invoices at month-end. ESG auditors reject this because it fails to capture *when* the diesel was burned (peak vs off-peak grid hours) and masks generator degradation (poor kWh/L ratio).

### 2. The Boiler House & Steam Network
* **Operational Reality:** Fire-tube boilers generate process steam for metal degreasing, paint pretreatment baths, and heating jackets, burning Piped Natural Gas (PNG) or heavy Furnace Oil (HFO).
* **Emission Physics:** PNG emits **$2.162\text{ kg CO}_2\text{e/Sm}^3$**. When combustion air dampers drift out of calibration, unburned carbon and CO exit the chimney, dropping combustion thermal efficiency from $86\%$ to $72\%$ and causing severe carbon waste.

### 3. Thermal Processing, Paint Curing & Welding
* **Operational Reality:** LPG-fired furnaces running at $850^\circ\text{C}-950^\circ\text{C}$ for stress relief and carburizing.
* **Emission Physics:** Emits **$2.987\text{ kg CO}_2\text{e/kg}$**. Furthermore, fabrication shops consume industrial $\text{CO}_2$ shielding gas in MIG/MAG welding ($100\%\text{ CO}_2$ or $80\%\text{ Ar} / 20\%\text{ CO}_2$). Every $30\text{ kg}$ cylinder emptied into the weld shop is a direct $30\text{ kg}$ Scope 1 emission ($1.977\text{ kg CO}_2/\text{Nm}^3$).

### 4. Chillers & Refrigeration Circuits (Fugitive Halocarbon Emissions)
* **Operational Reality:** Central HVAC chillers and compressed air refrigerated dryers operate closed circuits charged with 50–200 kg of R-134a or R-410A.
* **Emission Physics:** Mechanical vibration and thermal cycling cause chronic micro-leaks ($5\%-15\%$ annual charge loss). A single unmonitored leak of $20\text{ kg}$ R-134a ($\text{GWP} = 1,530$) releases **$30,600\text{ kg CO}_2\text{e}$** ($30.6\text{ tonnes CO}_2\text{e}$)—equivalent to driving a commercial vehicle for 120,000 kilometers.

### 5. Effluent Treatment Plant (ETP & Biological Digestion)
* **Operational Reality:** Oily wastewater from machine cutting fluid coolant emulsion and phosphating wash is drained into equalization tanks and bio-reactors.
* **Emission Physics (IPCC 2006 Vol. 5 Ch. 6):** Organic chemical waste quantified by Chemical Oxygen Demand (COD) biodegrades into methane ($\text{CH}_4$, $\text{GWP} = 27.9$):
  $$\text{Emissions}_{\text{ETP}} = \text{Wastewater Volume } (m^3) \times \text{COD } (\text{kg/m}^3) \times B_0 \times \text{MCF} \times 27.9$$
  Where $B_0 = 0.25\text{ kg CH}_4/\text{kg COD}$ and $\text{MCF} = 0.30$ (partially anaerobic industrial aeration basins).

---

## 3. Pillar 1: Multi-Vector Real-Time Carbon Accounting & Global Standards

Conventional software restricts accounting to utility bills and electricity grids. Industrial reality requires monitoring **three simultaneous emission vectors** grounded in the GHG Protocol, IPCC 2006 Guidelines, and ISO 14064:

### A. Scope 1: Multi-Fuel Stationary Combustion
Direct combustion across backup generators, steam boilers, annealing furnaces, and drying kilns:

$$\text{Emissions}_{\text{fuel}} = \text{Fuel Activity } (V \text{ or } m) \times \text{Net Calorific Value (NCV)} \times \text{Emission Factor (EF)} \times \text{Oxidation Factor}$$

$$\text{Total CO}_2\text{e} = \text{Direct CO}_2 + \left(\text{CH}_4 \times \text{GWP}_{\text{CH}_4}\right) + \left(\text{N}_2\text{O} \times \text{GWP}_{\text{N}_2\text{O}}\right)$$

Where Global Warming Potentials follow **IPCC Sixth Assessment Report (AR6)**:
- $\text{GWP}_{\text{CO}_2} = 1.0$
- $\text{GWP}_{\text{CH}_4} = 27.9$
- $\text{GWP}_{\text{N}_2\text{O}} = 273.0$

#### Supported Fuel Taxonomy (2006 IPCC Vol. 2 Ch. 1 & 2):
| Fuel Identifier | Physical Unit | Default NCV | $\text{CO}_2$ Factor | $\text{CH}_4$ Factor | $\text{N}_2\text{O}$ Factor | Total EF ($\text{kg CO}_2\text{e}$ / Unit) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **High-Speed Diesel (HSD / DG Sets)** | Liters | $36.0 \text{ MJ/L}$ | $74,100 \text{ kg/TJ}$ | $3.0 \text{ kg/TJ}$ | $0.6 \text{ kg/TJ}$ | **$2.682 \text{ kg/L}$** |
| **Piped Natural Gas (PNG / Boilers)** | $\text{Sm}^3$ | $38.5 \text{ MJ/m}^3$ | $56,100 \text{ kg/TJ}$ | $1.0 \text{ kg/TJ}$ | $0.1 \text{ kg/TJ}$ | **$2.162 \text{ kg/m}^3$** |
| **Liquefied Petroleum Gas (LPG)** | kg | $47.3 \text{ MJ/kg}$ | $63,100 \text{ kg/TJ}$ | $1.0 \text{ kg/TJ}$ | $0.1 \text{ kg/TJ}$ | **$2.987 \text{ kg/kg}$** |
| **Furnace Oil (HFO / Heavy Boilers)** | Liters | $40.2 \text{ MJ/L}$ | $77,400 \text{ kg/TJ}$ | $3.0 \text{ kg/TJ}$ | $0.6 \text{ kg/TJ}$ | **$3.125 \text{ kg/L}$** |
| **Light Diesel Oil (LDO)** | Liters | $38.0 \text{ MJ/L}$ | $74,100 \text{ kg/TJ}$ | $3.0 \text{ kg/TJ}$ | $0.6 \text{ kg/TJ}$ | **$2.831 \text{ kg/L}$** |
| **Non-Coking Coal (Grade G11)** | kg | $16.5 \text{ MJ/kg}$ | $96,100 \text{ kg/TJ}$ | $10.0 \text{ kg/TJ}$ | $1.5 \text{ kg/TJ}$ | **$1.592 \text{ kg/kg}$** |
| **Biomass Briquettes (Agricultural)** | kg | $15.0 \text{ MJ/kg}$ | *Biogenic ($0.0$ net)* | $30.0 \text{ kg/TJ}$ | $4.0 \text{ kg/TJ}$ | **$0.029 \text{ kg/kg}$ non-$\text{CO}_2$** |

### B. Scope 1: Chemical & Process Emissions
Manufacturing processes emit potent greenhouse gases that do not originate from fuel combustion:
1. **Fugitive Refrigerant Losses:** HVAC chillers and refrigerated dryers leak hydrofluorocarbons (HFCs).
   $$\text{Emissions}_{\text{refrig}} = \Delta M_{\text{refrigerant}} (\text{kg}) \times \text{GWP}_{\text{gas}}$$
   - **HFC-134a (R-134a):** $\text{GWP} = 1,530$ (1 kg leaked = 1.53 tonnes $\text{CO}_2\text{e}$)
   - **R-410A:** $\text{GWP} = 2,088$
   - **R-407C:** $\text{GWP} = 1,908$
2. **Welding Shielding Gas Losses:** Metal fabrication lines consume bulk shielding cylinders ($80\% \text{ Ar} / 20\% \text{ CO}_2$ or $100\% \text{ CO}_2$). Direct fugitive release equals $1.977 \text{ kg CO}_2 / \text{Nm}^3$.
3. **Solvent Degreasing & Paint Booth VOCs:** Volatile Organic Compound evaporation converted through carbon black thermal oxidation stoichiometry.

### C. Scope 1 & 3: Wastewater & Effluent Discharge
Industrial Effluent Treatment Plants (ETP) generate biological greenhouse gases during anaerobic and aerobic digestion:

$$\text{CH}_4 \text{ Emissions} = \left[ \text{COD}_{\text{inflow}} (\text{kg/day}) \times B_0 \times \text{MCF} - R_{\text{recovered}} \right] \times \text{GWP}_{\text{CH}_4}$$

Where:
- $B_0 = 0.25 \text{ kg CH}_4 / \text{kg COD}$ (Maximum methane producing capacity, IPCC 2006 Vol. 5 Ch. 6)
- $\text{MCF} = 0.30$ (Methane Correction Factor for semi-aerobic industrial lagoon systems)
- Submersible optical UV-Vis probes measure influent and effluent Chemical Oxygen Demand (COD) in real time.

### D. Scope 2: CEA Baseline Database Version 22.0 Grid Accounting
Dual-reporting capability complying with GHG Protocol Scope 2 Guidance:
- **Location-Based Method:** Uses official CEA v22.0 weighted average emission factors including renewables ($0.72886 \text{ kg CO}_2\text{e/kWh}$ for 2023-24).
- **Market-Based / Contractual Method:** Supports Indian Green Energy Open Access (GEOA), Renewable Energy Certificates (RECs), and captive rooftop solar PV ($0.000 \text{ kg CO}_2\text{e/kWh}$).

### E. Worldwide Carbon Auditing Frameworks & Auditor Mindset
To ensure reports pass statutory verification without qualification, WattWise AI implements the exact rules used by third-party auditors (PwC, EY, TÜV SÜD):

1. **IPCC Hierarchy of Tiers:**
   * **Tier 1 (Generic):** National default factors applied to rough invoice quantities.
   * **Tier 2 (Country/Plant Specific):** Lab-tested fuel Net Calorific Values (NCVs) from supplier test certificates and regional grid factors (CEA Baseline).
   * **Tier 3 (Gold Standard — WattWise Target):** Continuous direct measurement: Coriolis fuel mass meters + NDIR stack flue gas analyzers + Class 0.5S revenue electricity meters.
2. **ISO 14064-1:2018 & ISO 14064-3:2019 Compliance:**
   * Enforces explicit **Uncertainty Quantification** for every emission stream.
   * Enforces a **$5\%$ Materiality Threshold** check: any unmetered energy stream exceeding $5\%$ of total site carbon triggers an immediate sensor addition recommendation (**Idea A: Sensor Sufficiency**).
3. **SEBI BRSR Core (India Mandate):**
   * Pre-formats output for Key Performance Indicators: Specific Greenhouse Gas Intensity per unit of production, Scope 1 and Scope 2 breakdowns, and verification trail for mandatory *reasonable assurance*.
4. **EU Carbon Border Adjustment Mechanism (CBAM):**
   * Computes embedded specific carbon intensity ($\text{tCO}_2\text{e}$ per tonne of manufactured steel/aluminum/machinery) separating direct heat/combustion from grid electricity.

### F. The "Dual Reconciliation" Mass Balance Audit Test
Auditors never accept flow meter totalizers at face value. They demand cross-verification using **Mass Balance**:

$$\Delta \text{Storage Tank Stock} + \text{Inward Delivery Invoices} - \text{Total Metered Consumption} = \text{Unaccounted Loss (Target } < 1.5\%)$$

* **WattWise Automated Audit Guardrail:** The system compares metered consumption against fuel storage tank level transmitters. If the difference exceeds $2.0\%$, the twin flags a **"Mass-Balance Discrepancy"** alerting the Plant Manager to underground pipe leaks, flowmeter calibration drift, or fuel pilferage.

### G. Real-Time Immutable Hash-Chain Audit Ledger
Every 15-minute operational interval computes a cryptographically signed audit block:

```json
{
  "block_height": 14208,
  "timestamp": "2026-10-24T18:30:00+05:30",
  "prev_hash": "a8f3b20e1762c9...",
  "merkle_root": "e4d9c71a3205b1...",
  "telemetry_summary": {
    "grid_electricity_kwh": 1305.0,
    "diesel_liters": 42.5,
    "png_sm3": 112.4,
    "lpg_kg": 18.0,
    "refrigerant_leak_kg": 0.0,
    "etp_cod_mass_kg": 14.2
  },
  "gross_carbon_tco2e": {
    "scope1_stationary_combustion": 0.411,
    "scope1_chemical_process": 0.000,
    "scope1_effluent_etp": 0.029,
    "scope2_location_based": 0.951,
    "total_gross_interval": 1.391
  },
  "audit_signature": "SHA256:7f3a8b9c4d2e1..."
}
```
This guarantees mathematical immutability for statutory audits (SEBI BRSR Core, ISO 14064-1 verification).

---

## 4. Pillar 2: Physical Sensor Instrumentation & Edge Ingestion Topology

A digital twin is useless without a proven ingestion pipeline from real industrial instrumentation.

```
 [ FIELD INSTRUMENTS ]
  ├── Energy Meters: Class 0.5S Multi-function (V, I, kW, PF, THD) ───[RS-485 Modbus RTU]───┐
  ├── Fuel Lines: Coriolis Mass Flow Meters (Mass, Temp, Density) ─────[RS-485 Modbus RTU]───┤
  ├── Gas Lines: Thermal Mass / Diaphragm PTZ Flow Meters ────────────[Pulse / 4-20mA]───────┼──► [ EDGE GATEWAY ]
  ├── Stacks: NDIR Flue Gas Analyzers (%O₂, CO₂, CO, Stack Temp) ──────[Modbus TCP / 4-20mA]─┤    (Moxa / Advantech)
  ├── Refrigeration: Pressure Transducers & Area Sniffers ─────────────[4-20mA Loop]─────────┤    │ Local SQLite/DuckDB
  └── ETP: Optical UV-Vis COD Probes & Electromagnetic Flow Meters ────[4-20mA / Modbus]─────┘    │ 72h Ring Buffer
                                                                                                  │ NTP Timestamp Sync
                                                                                                  ▼ [TLS / MQTT Sparkplug B]
                                                                                       [ WATTWISE AI CLOUD / ON-PREM ]
```

### Exact Shop-Floor Sensor Instrumentation Specifications:

| Measurement Vector | Recommended Physical Sensor | Output Protocol | Audit Grade & Measurement Accuracy |
| :--- | :--- | :--- | :--- |
| **Grid Electricity** | Class 0.5S Multi-Function Meter (Schneider EM6400NG / Secure Elite 440) | RS-485 Modbus RTU (Baud 9600/19200) | $\pm 0.5\%$ revenue grade (IEC 62053-22) |
| **Diesel (HSD)** | Coriolis Mass Flow Meter (Micro Motion / Endress+Hauser Promass) on supply & return | Modbus RTU / 4-20mA HART | Measures mass directly ($\text{kg/h}$), eliminating temperature volume expansion errors ($\pm 0.1\%$) |
| **Natural Gas (PNG)** | Thermal Mass Flow Meter or Turbine Meter with PTZ (Pressure/Temp/Z-factor) corrector | Modbus RTU / High-speed pulse | Corrects volumetric flow to Standard Cubic Meters ($\text{Sm}^3$ at $15^\circ\text{C}, 1.013\text{ bar}$) |
| **LPG / Gases** | Vortex Shedding Meter or Coriolis Mass Meter | 4-20mA HART / RS-485 | True mass flow rate ($\text{kg/min}$) |
| **Flue Gas Stack** | Non-Dispersive Infrared (NDIR) Flue Gas Analyzer (Testo / Horiba) | Modbus TCP / 4-20mA | Direct stack measurement of $\% \text{O}_2, \text{CO}_2, \text{CO}$ to compute real-time stack loss |
| **Refrigerant Loss** | Piezo-resistive pressure transducers + fixed NDIR ambient leak sniffers | 4-20mA analog loop to PLC | Immediate trigger if circuit pressure drops below saturation threshold |
| **ETP Effluent** | Submersible Optical UV-Vis Spectrometer Probe + Electromagnetic Flow Meter | RS-485 Modbus / 4-20mA | Real-time continuous COD ($\text{mg/L}$) and effluent volume rate ($m^3/\text{h}$) |

### Offline Resilience Protocol (Edge Store-and-Forward):
* **The Reality of Factory WAN:** Industrial plants experience intermittent broadband dropouts, EMI interference, and router restarts. Streaming directly to a cloud API causes immediate data voids that fail ISO 14064 audits.
* **Our Edge Gateway Solution:** The edge gateway (Siemens IOT2050 / Moxa UC-8100) hosts a local **DuckDB / SQLite circular ring-buffer**.
* **Buffer Capacity:** Buffers up to **72 hours** of 1-second telemetry with millisecond NTP hardware timestamps.
* **Forwarding:** On network recovery, the gateway executes a non-destructive handshake via MQTT Sparkplug B, backfilling the ledger without duplicate counts or timestamp collisions.

---

## 5. Pillar 3: On-Premise Explainable AI (XAI) with Local LLM & Inbuilt RAG

### Why Cloud AI Fails in Manufacturing:
- **Data Sovereignty:** Plant layouts, machine setpoints, and production volumes are proprietary industrial secrets. Air-gapped defense or automotive plants prohibit cloud LLM API calls.
- **Latency & Cost:** Sending high-frequency 5-second telemetry streams to commercial cloud APIs causes cost explosions and latency timeouts.

### Our Solution: Local Quantized LLM + Domain-Specific RAG
A localized on-premise inference server running lightweight 4-bit quantized open-source models:
- **Primary LLM:** `Llama-3.2-3B-Instruct-Q4_K_M` or `Phi-3.5-mini-Instruct-Q4_K_M` running via `llama.cpp` / ONNX Runtime.
- **Inference Speed:** 35–50 tokens/second on a standard x86 workstation CPU (no dedicated GPU required).
- **Embedded Vector Database:** DuckDB Vector / ChromaDB embedded locally in the container.

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       LOCAL INBUILT INDUSTRIAL RAG STORE                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Central Electricity Authority (CEA) CO2 Baseline Database v22.0 (ACM0002)    │
│ 2. 2006 IPCC Guidelines for National GHG Inventories (Vol 2: Energy, Vol 5: Wst)│
│ 3. ISO 50001:2018 Energy Management Systems Implementation Standard             │
│ 4. ISO 14064-1:2018 Specification for Quantification & Reporting of GHG        │
│ 5. Bureau of Energy Efficiency (BEE) India Industrial Best Practice Benchmarks   │
│ 6. Compressed Air Challenge (CAC) Best Practices for Compressed Air Systems     │
│ 7. Equipment Manuals: ELGi Rotary Screw Compressors, Thermax Boilers, DMG MORI  │
└──────────────────────────────────────┬──────────────────────────────────────────┘
                                       │ Semantic Retrieval (Dense Embedding)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     REAL-TIME DYNAMIC INFOGRAPHIC SUMMARIES                     │
│  - Scheduled Cadence: Automatically updates every 30 seconds                    │
│  - Input Prompt: Current 15-minute telemetry delta + physical constraint alerts │
│  - Output: Structured Dual-Layer Narrative Card                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### Dual-Layer Narrative Card Format (Generated in Real-Time):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 💡 AI EXPLAINABILITY INSIGHT (Generated in 0.42s by Local Llama-3.2-3B)         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 👤 EXECUTIVE OVERVIEW (Plain English):                                          │
│ "Air Compressor COMP-01 is wasting ₹3,150 every shift by staying powered on at  │
│ 18 kW during lunch and tea breaks when machines are stopped. Switching to auto-  │
│ cutoff will save 14.4 kWh/day without slowing down factory production."         │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 🔧 ENGINEERING DEEP-DIVE (Technical & Standards Citation):                      │
│ - Diagnostic: Unload state draw is 18.0 kW (60.0% of 30 kW rated; normal <25%).│
│ - Root Cause: Control blow-off solenoid timer stuck in Continuous Mode.         │
│ - Thermodynamic Math: Air receiver discharge pressure holds steady at 7.2 bar;   │
│   zero downstream volumetric demand measured at CNC-01 ring main (0.0 Nm³/min). │
│ - Governance & Standards: Non-compliance with ISO 50001:2018 Clause 6.3 (SEU    │
│   Energy Performance Improvement).                                              │
│ - Recommended Fix: Install ₹2,500 timer auto-cutoff relay. Payback: 11.5 days.  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Pillar 4: 50-Asset Industrial Machine Library (Electric & Non-Electric)

To allow any manufacturing plant to model their exact physical factory floor, WattWise AI provides an out-of-the-box library of **50 industrial machines** categorized across 6 factory operational cells.

Each machine profile defines:
- Energy vector (Electricity, Diesel, Natural Gas, LPG, Furnace Oil, Steam, Compressed Air)
- Rated capacity & nominal operating power
- Specific Energy Consumption (SEC) metric
- Physical safety constraints & interlock rules
- Ingestion telemetry mapping (Modbus registers, pulse inputs, analog channels)

### Complete 50-Asset Industrial Catalog:

#### Utility 1: Compressed Air & Industrial Gas Systems (8 Assets)
1. **`COMP-ROT-01`**: Rotary Screw Air Compressor (30 kW, Modbus electrical meter + 4-20mA pressure transducer)
2. **`COMP-ROT-02`**: Variable Speed Drive (VSD) Screw Compressor (45 kW, inverter telemetry)
3. **`COMP-REC-01`**: High-Pressure Reciprocating Booster (15 kW, 40 bar PET bottle air)
4. **`COMP-CENT-01`**: Centrifugal Oil-Free Compressor (150 kW, baseline utility air)
5. **`DRY-REF-01`**: Refrigerated Compressed Air Dryer (4.5 kW, R-134a refrigerant monitor)
6. **`DRY-DES-01`**: Desiccant Twin-Tower Heatless Air Dryer (1.2 kW, purge air loss sensor)
7. **`PUMP-VAC-01`**: Liquid Ring Vacuum Pump (18.5 kW, process suction line)
8. **`GEN-N2-01`**: PSA Nitrogen Gas Generator (7.5 kW, $N_2$ purity & mass flow sensor)

#### Utility 2: Thermal, Combustion & Steam Utilities (10 Assets)
9. **`BOIL-PNG-01`**: Piped Natural Gas Steam Boiler (2.0 Ton/hr, PNG mass meter + flue gas $O_2$)
10. **`BOIL-FO-01`**: Furnace Oil (HFO) Fire-Tube Boiler (3.0 Ton/hr, fuel preheater + NDIR probe)
11. **`BOIL-BIO-01`**: Biomass Agro-Briquette Steam Boiler (1.5 Ton/hr, particulate sensor)
12. **`FURN-LPG-01`**: LPG Continuous Heat-Treatment Furnace (50 kW equiv, LPG Coriolis flow meter)
13. **`FURN-IND-01`**: Electrical Induction Billet Melting Furnace (120 kW, power factor monitor)
14. **`FURN-ANN-01`**: Natural Gas Annealing Cover Furnace (40 kW equiv, thermocouple array)
15. **`HEAT-THRM-01`**: Thermic Fluid Heater (LDO fired, 500,000 kcal/hr, circulation pump telemetry)
16. **`OVEN-DRY-01`**: Electric Convection Paint Curing Oven (35 kW, air recirculating blower)
17. **`WHR-HRSG-01`**: Waste Heat Recovery Steam Generator (Exhaust gas heat exchanger)
18. **`BURN-CTL-01`**: Digital Combustion Air-Fuel Ratio Controller (Stack damper actuator)

#### Utility 3: Power Generation, Cogeneration & Energy Storage (6 Assets)
19. **`GEN-DG-01`**: Prime-Power Diesel Generator Set (500 kVA / 400 kW, HSD fuel level + kWh meter)
20. **`GEN-DG-02`**: Emergency Standby Diesel Generator (1000 kVA, automatic transfer switch monitor)
21. **`GEN-GT-01`**: Natural Gas Microturbine (250 kW, combined heat and power unit)
22. **`SOL-INV-01`**: Rooftop Solar PV Inverter (100 kWp, solar irradiance + DC/AC power meter)
23. **`BESS-LFP-01`**: Battery Energy Storage System (200 kWh / 50 kW, state of charge $SoC$ telemetry)
24. **`APFC-CAP-01`**: Automatic Power Factor Correction Capacitor Bank (150 kVAR, reactive power $kVAR$)

#### Utility 4: Machining, Forming & Heavy Fabrication (10 Assets)
25. **`CNC-VMC-01`**: 5-Axis CNC Vertical Machining Center (25 kW, spindle load + parts counter)
26. **`CNC-LATHE-01`**: CNC Turning Center & Lathe (18.5 kW, tool wear telemetry)
27. **`PRESS-HYD-01`**: Heavy Hydraulic Deep-Drawing Press (500 Ton / 45 kW, hydraulic pressure sensor)
28. **`PRESS-MECH-01`**: Mechanical Stamping Crank Press (150 Ton / 22 kW, stroke counter)
29. **`MOLD-INJ-01`**: Electric Plastic Injection Molding Machine (45 kW, barrel heating zones)
30. **`MOLD-INJ-02`**: Hydraulic Injection Molder (60 kW, proportional valve telemetry)
31. **`EXT-PLAS-01`**: Twin-Screw Plastic Profile Extruder (55 kW, melt pressure sensor)
32. **`LAS-FIB-01`**: High-Power Fiber Laser Cutting Table (6 kW optical / 24 kW electrical)
33. **`WELD-ROB-01`**: Robotic MIG Welding Cell (15 kW, $CO_2 / \text{Ar}$ gas flow meter)
34. **`GRND-SRF-01`**: Heavy Precision Surface Grinding Machine (15 kW, coolant pump monitor)

#### Utility 5: Industrial Cooling, Pumping & HVAC (8 Assets)
35. **`CHIL-WTR-01`**: Water-Cooled Centrifugal Chiller (150 TR / 95 kW, chilled water $\Delta T$)
36. **`CHIL-AIR-01`**: Air-Cooled Screw Chiller (80 TR / 72 kW, ambient air condenser)
37. **`TOWR-COL-01`**: Induced-Draft Evaporative Cooling Tower (15 kW fan, wet-bulb psychrometer)
38. **`PUMP-PRI-01`**: Primary Chilled Water Circulation Pump (11 kW, differential pressure $\Delta P$)
39. **`PUMP-CND-01`**: Condenser Cooling Water Pump (18.5 kW, flow rate sensor)
40. **`AHU-HVAC-01`**: Clean Room Air Handling Unit (22 kW VFD supply air fan)
41. **`EXH-BLOW-01`**: Paint Shop Heavy VOC Exhaust Blower (30 kW, duct static pressure)
42. **`PUMP-RO-01`**: Reverse Osmosis High-Pressure Desalination Pump (22 kW, membrane permeate meter)

#### Utility 6: Chemical Processing, Paint & Waste Treatment (8 Assets)
43. **`ETP-BLOW-01`**: Effluent Treatment Plant Aeration Blower (37 kW, dissolved oxygen DO sensor)
44. **`ETP-CENT-01`**: Sludge Decanter Dewatering Centrifuge (15 kW, cake dryness sensor)
45. **`TANK-PICK-01`**: Chemical Acid Pickling & Passivation Bath (Steam heated, acid concentration probe)
46. **`TANK-DEGR-01`**: Hot Alkaline Spray Degreasing Tank (LPG heated, bath temperature probe)
47. **`BOOT-PNT-01`**: Automated Liquid Spray Paint Booth (Downdraft air balance controller)
48. **`SCRUB-WET-01`**: Wet Chemical Acid Gas Fume Scrubber (7.5 kW recirc pump, pH probe)
49. **`INCIN-WST-01`**: Hazardous Waste & Sludge Incinerator (Diesel auxiliary burner, stack monitor)
50. **`COMP-BAL-01`**: Hydraulic Scrap Metal & Packaging Baler (18.5 kW, bale weight sensor)

---

## 7. Pillar 5: Real-Time Live Carbon Quotas & Operational Interlocks

Traditional carbon systems only report compliance months after breaches occur. WattWise AI flips this into **proactive, real-time closed-loop control**.

### The Mathematical Model for Live Carbon Quotas:
Let a facility have a monthly statutory or corporate carbon quota $Q_{\text{month}}$ ($\text{kg CO}_2\text{e}$).

At any instantaneous time $t$ on day $d$ of the month ($D$ total days):

$$\text{Cumulative Carbon Emitted: } C_{\text{actual}}(t) = \int_0^t \left( \dot{E}_{\text{Scope1}}(\tau) + \dot{E}_{\text{Scope2}}(\tau) + \dot{E}_{\text{Scope3}}(\tau) \right) d\tau$$

$$\text{Remaining Carbon Allowance: } C_{\text{remaining}}(t) = Q_{\text{month}} - C_{\text{actual}}(t)$$

$$\text{Dynamic Target Emission Rate for current shift: } \dot{C}_{\text{budget}}(t) = \frac{C_{\text{remaining}}(t)}{\text{Remaining Operating Hours in Month}} \times W_{\text{shift}}$$

Where $W_{\text{shift}}$ is a planned production weighting factor (e.g., $1.2$ for peak day shift, $0.8$ for light night shift).

$$\text{Burn Rate Index: } \text{BRI}(t) = \frac{\dot{C}_{\text{actual}}(t)}{\dot{C}_{\text{budget}}(t)}$$

### Dynamic Operating States & Guardrail Actions:

```
  BRI Range            Operating Status       Digital Twin Action / Operational Interlock
 ──────────────────────────────────────────────────────────────────────────────────────────
  BRI < 0.85           SURPLUS (Green)        Normal operation. Pre-run thermal annealing batches.
  0.85 ≤ BRI ≤ 1.00    NOMINAL (Yellow)       Within budget envelope. Standard monitoring.
  1.00 < BRI ≤ 1.15    WARNING (Amber)        Tier 1: Shift non-critical loads; notify shift supervisor.
  1.15 < BRI ≤ 1.30    THROTTLING (Orange)    Tier 2: Interlock engages (compressor unload clamp, VFD limit).
  BRI > 1.30           CRITICAL (Red)         Tier 3: Hard lockout (DG set lockout, fuel-switch to PNG/Biomass).
```

### 3-Tier Operational Interlocks (Closing the Loop on the Floor):

1. **Tier 1: Advisory Shift Scheduling ($1.00 < \text{BRI} \le 1.15$ - Amber)**
   - Plant dashboard displays live countdown to quota overrun.
   - Prescriptive alerts recommend staggering non-critical batch processes (e.g. delaying electric furnace preheat or scrap baling by 45 minutes).
   - Prompts switching utility chillers to thermal storage discharge.

2. **Tier 2: Active Operational Throttling ($1.15 < \text{BRI} \le 1.30$ - Orange)**
   - **Interlock C — Compressed Air Unload Timeout Compression:** Air compressors in idle unload mode consume $25\%-35\%$ of full power without producing air. When $\text{BRI} > 1.15$, the twin dynamically rewrites Modbus holding register `40102` (Compressor Run-to-Unload Timeout) from the default 15 minutes down to 3 minutes, forcing idle motors to shut down completely.
   - Clamps secondary boiler modulation to $80\%$ and trims HVAC fan speeds.

3. **Tier 3: Statutory Quota Breach Guardrail ($\text{BRI} > 1.30$ - Red Enforced Interlock)**
   - **Interlock A — DG Set Peak Lockout (Scope 1 Avoidance):** If grid carbon intensity is lower than diesel ($0.716\text{ kg/kWh}$ CEA grid factor vs $0.766\text{ kg/kWh}$ diesel generator), the twin blocks automated DG dispatch for peak-shaving, forcing the facility to rely on battery storage (BESS) or demand curtailment.
   - **Interlock B — Automated Fuel-Switching Command:** On dual-fuel boilers or annealing furnaces, when the daily quota threshold is crossed, the twin dispatches a digital control signal to switch burner modulation from high-carbon diesel/HFO to low-carbon PNG or biomass, immediately cutting Scope 1 intensity by $31\%$.
   - **Compliance Deviation Log:** Records an immutable deviation record requiring the Plant Head's cryptographic sign-off before manual override is permitted.

---

## 8. Pillar 6: Prescriptive Action Plans & Decision Intelligence

Rather than presenting passive graphs, every diagnostic alert in WattWise AI culminates in an executable **WattWise Action Card**:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 WATTWISE PRESCRIPTIVE ACTION CARD #ACT-2026-084                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Target Asset: BOIL-PNG-01 (Natural Gas Steam Boiler)                           │
│ Detected Anomaly: Flue Gas O₂ is 8.2% (Excess Air Ratio 1.64 vs optimal 1.15). │
│ Stack thermal heat loss is 16.8% (Design baseline: 11.2%).                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 📋 ROOT CAUSE DIAGNOSIS:                                                        │
│ Combustion damper servo mechanical linkage is drifting open, pulling cold air  │
│ through the firebox and carrying unreacted heat out the exhaust chimney.        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 🛠️ PRESCRIPTIVE ACTION PROTOCOL:                                                │
│ 1. Trim air damper actuator by -14% via DCS Modbus register 40112.             │
│ 2. Re-establish target stack O₂ between 3.2% and 3.8%.                         │
│ 3. Verify flue gas exit temperature drops from 215°C to 182°C.                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 💰 VERIFIED FINANCIAL & ESG RETURN:                                             │
│ - Natural Gas Saved: 38.5 Sm³/day (-4.8% fuel consumption)                      │
│ - Financial Savings: ₹2,117 / day (₹635,100 / year)                             │
│ - Avoided Carbon: 83.2 kg CO₂e / day (24.96 tCO₂e / year)                       │
│ - Implementation Capex: ₹0 (Zero Capex — Modbus setpoint calibration)           │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [▶ EXECUTE PRESET IN DIGITAL TWIN]       [📄 DISPATCH DCS WORK ORDER TO SCADA]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Pillar 7: Dual-Audience UI/UX Architecture

Different factory stakeholders require completely different visual presentations of the same underlying data:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          EXECUTIVE PRESENTATION VIEW                            │
│                  Designed for: Plant Head, CFO, Chief Sustainability Officer    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ [ 94.2% ] Overall Factory Health Score (Ceramic Alabaster Card)                 │
│ [ 14.47 tCO₂e / 18.00 tCO₂e Cap ] Live Real-Time Statutory Carbon Gauge (Green) │
│                                                                                 │
│ 💡 AI EXECUTIVE BRIEFING (Plain English):                                        │
│ "Plant emissions are 19.6% below statutory SEBI BRSR limits today. Primary      │
│ opportunity is turning off idle air compressors during lunch breaks to save      │
│ ₹216 daily and avoid 11.8 kg CO₂e."                                             │
│                                                                                 │
│ [ 📥 Export One-Click Audit Package (PDF / Excel / BRSR Core Format) ]          │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ENGINEERING DIAGNOSTIC VIEW                             │
│                  Designed for: Energy Manager, Utility & Maintenance Engineers  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 📈 Real-Time 5-Second Telemetry Waveforms (V, I, kW, kVAR, THD%, PF)            │
│ ♨️ Combustion Flue Gas Siegert Heat Loss & Excess Air Ratio Curves              │
│ 🔄 Dual-Overlay 24h Baseline vs. Scenario Load Duration Curves                  │
│ ⚖️ 3-Option Pareto Trade-Off Matrix (Cost vs. Peak vs. Production SLA)           │
│ 📜 Raw Modbus RTU / TCP Register Hex Logs & Gateway Diagnostics                 │
│ 🔬 IPMVP Option B Counterfactual Regression Scatterplot (R² = 0.984, CV-RMSE)   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. 24-Hour Implementation Roadmap

To build and demonstrate these enterprise capabilities seamlessly, the work is sequenced across four 6-hour implementation phases:

| Phase | Hours | Core Deliverables | Target Files |
| :--- | :---: | :--- | :--- |
| **Phase 1: Multi-Fuel & Waste Carbon Engine** | H 0 – H 6 | - Extend `carbon_service.py` & `reference_data.py` with IPCC factors for Diesel, PNG, HFO, Coal, Refrigerants, and Wastewater COD.<br>- Implement SHA-256 hash-chain block logger.<br>- Add 15 unit tests. | `backend/app/services/carbon_service.py`<br>`backend/app/services/reference_data.py`<br>`backend/app/services/audit_ledger.py` |
| **Phase 2: 50-Asset Industrial Library** | H 6 – H 12 | - Implement `machine_library.json` defining 50 industrial assets across 6 utilities.<br>- Build interactive "Shop-Floor Configurator" UI in React.<br>- Link machine models to digital twin simulation engine. | `src/data/machineLibrary.json`<br>`src/components/Library/MachineConfigurator.tsx`<br>`src/digitalTwin/twinProfiles.ts` |
| **Phase 3: Local XAI & Inbuilt RAG Engine** | H 12 – H 18 | - Embed lightweight local ONNX/llama.cpp inference service.<br>- Ingest CEA v22, IPCC, and ISO 50001 into embedded DuckDB vector store.<br>- Connect real-time 30-second infographic auto-summaries to UI. | `backend/app/services/xai_engine.py`<br>`src/components/ExplainableAI/AiSummaryCard.tsx` |
| **Phase 4: Live Carbon Quotas & Dual-Audience UI** | H 18 – H 24 | - Implement dynamic Burn Rate Index (BRI) and operational interlocks (fuel-switching, DG lockout).<br>- Build Executive / Engineering mode toggle.<br>- End-to-end integration and 50/50 test verification. | `src/components/Carbon/CarbonQuotaBar.tsx`<br>`src/App.tsx`<br>`tests/test_enterprise_twin.py` |

---

## 11. Summary for Reviewers & Hackathon Judges

When presenting this roadmap to KPCL and hackathon leadership:

1. **WattWise AI is not a generic dashboard:** It is an **evidence-grounded operational decision twin** that knows what sensors are missing (**Idea A**), proves savings mathematically (**Idea B**), and protects physical machinery (**Idea C**).
2. **We address the full industrial carbon footprint:** Moving beyond electricity to encompass diesel, natural gas, furnace oil, chemical refrigerants, and industrial wastewater effluent.
3. **Data stays on the factory floor:** Our Explainable AI runs **locally on-premise with zero cloud dependence**, delivering instant plain-English executive briefings and engineering-grade ISO standard citations.
4. **Active Carbon Guardrails protect compliance:** The twin dynamically enforces operational throttling and fuel-switching *before* statutory carbon quotas are violated.
