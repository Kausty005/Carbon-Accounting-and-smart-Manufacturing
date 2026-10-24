# AI-Driven Carbon Accounting & Intelligent Energy Management Report
**PrecisionWorks Manufacturing — Industrial Energy Anomaly Intelligence**
*Report Generated:* 2026-10-24 09:59:21 UTC  
*Dataset Evaluated:* 34,560 records (2024-01-01 00:00:00 to 2024-01-30 23:55:00)  
*Model Version:* 1.1.0 | *Selected Prototype:* Supervised Random Forest Classifier

---

## 1. Executive Summary & Energy KPIs

| Metric | Measured Value | Unit / Benchmark |
|---|---|---|
| **Total Measured Electricity** | 19,684.20 | kWh (trapezoidal integration per equipment) |
| **Plant Average Power** | 45.64 | kW |
| **Plant Peak Power** | 268.65 | kW |
| **Total Readings Evaluated** | 5,184 | 1-min telemetry points |
| **Equipment Health Anomalies** | 48 | (0.93% health anomaly rate) |
| **Excess Energy Anomalies** | 552 | (10.65% power excess rate) |
| **Estimated Excess Energy Waste** | 1,176.70 | kWh (Model estimate) |
| **Estimated Financial Loss (₹8/kWh)** | ₹9,413.61 | INR (INR 8.0 / kWh) |
| **Scope 2 Carbon Footprint** | 16,141.04 | kg CO2e (0.82 kg CO2e / kWh (CEA India CO2 Baseline Database v18 (2023), User Guide Table 1)) |
| **Avoidable Excess Emissions** | 964.89 | kg CO2e (Model estimate) |

> **Accounting Boundary & Estimation Note:** Note: Avoidable excess energy, cost savings, and Scope 2 carbon footprint reductions are model estimates based on operating-condition power baselines and configured CEA India grid emission factors. Scope 1 direct fossil fuel emissions are excluded as this telemetry stream meters electrical power only.

---

## 2. Equipment-Level Breakdown & Priority Ranking

The equipment units are prioritized based on detected equipment health anomaly frequency and excess energy consumption:
**Inspection Priority:** `FURNACE-01 -> CHILLER-01 -> AIR-COMP-01 -> CNC-01`

| Equipment ID | Total Energy (kWh) | Energy Share (%) | Avg Power (kW) | Peak Power (kW) | Health Anomalies | Health Anom Rate (%) | Excess Energy Alerts | Excess Energy (kWh) | Financial Waste (₹) |
|---|---|---|---|---|---|---|---|---|---|
| **AIR-COMP-01** | 2,625.3 | 13.3% | 24.4 | 79.4 | 0 | 0.00% | 79 | 65.8 | ₹526.73 |
| **CHILLER-01** | 12,967.3 | 65.9% | 120.2 | 268.6 | 0 | 0.00% | 37 | 469.4 | ₹3,754.88 |
| **CNC-01** | 817.9 | 4.2% | 7.6 | 33.8 | 0 | 0.00% | 119 | 28.9 | ₹230.83 |
| **FURNACE-01** | 3,273.7 | 16.6% | 30.4 | 244.7 | 48 | 3.70% | 317 | 612.6 | ₹4,901.17 |

---

## 3. Model Benchmark & Held-Out Test Evaluation

Models were evaluated on a strict **chronological held-out test period** (the final 15% of timestamped readings, never seen during training or threshold tuning):

| Model Architecture | Precision | Recall | F1-Score | False Positive Rate | ROC-AUC | PR-AUC |
|---|---|---|---|---|---|---|
| **Dummy Baseline (Most Frequent)** | 0.0000 | 0.0000 | 0.0000 | 0.0000 | N/A | N/A |
| **Model A: Supervised Random Forest** | **0.6087** | **0.2917** | **0.3944** | **0.0018** | **0.998** | **0.6278** |
| **Model B: Unsupervised Isolation Forest** | 0.1765 | 1.0000 | 0.3000 | 0.0436 | 0.9681 | 0.1213 |
| **Model C: Energy Baseline Detector** | 0.0000 | 0.0000 | 0.0000 | 0.1075 | N/A | N/A |

### Confusion Matrix (Model A: Supervised Random Forest)
- **True Negatives (Normal correctly identified):** 5,127
- **False Positives (Normal falsely flagged):** 9
- **False Negatives (Anomalies missed):** 34
- **True Positives (Anomalies successfully detected):** 14

### Anomaly Type Detection Recall (Model A)
- **Normal:** 9 / 5136 detected (0.2% recall)
- **Slow Heating:** 14 / 48 detected (29.2% recall)

---

## 4. Evidence-Based Anomaly Records (Real Model Detections)

Below are representative sample records produced by the evidence generator on held-out test telemetry:

### Incident #1: AIR-COMP-01 — Bearing Degradation (HIGH)
- **Timestamp:** `2024-01-26T12:30:00`
- **Actual vs Expected Power:** 65.77 kW vs 68.56 kW (Deviation: -4.07%)
- **Model Confidence Score:** 0.1684
- **Evidence Trail:**
  - *Power consumption (65.77 kW) is within nominal limits for load mode (no excess energy waste).*
  - *Mechanical vibration level (1.585 mm/s) is elevated above baseline.*
- **Recommended Action:** Perform acoustic & vibration spectrum inspection.

### Incident #2: AIR-COMP-01 — Bearing Degradation (HIGH)
- **Timestamp:** `2024-01-26T20:30:00`
- **Actual vs Expected Power:** 68.3 kW vs 68.56 kW (Deviation: -0.38%)
- **Model Confidence Score:** 0.1684
- **Evidence Trail:**
  - *Power consumption (68.30 kW) is within nominal limits for load mode (no excess energy waste).*
  - *Mechanical vibration level (1.639 mm/s) is elevated above baseline.*
- **Recommended Action:** Perform acoustic & vibration spectrum inspection.

### Incident #3: AIR-COMP-01 — Bearing Degradation (HIGH)
- **Timestamp:** `2024-01-26T20:55:00`
- **Actual vs Expected Power:** 29.57 kW vs 25.98 kW (Deviation: 13.83%)
- **Model Confidence Score:** 0.1684
- **Evidence Trail:**
  - *Power consumption (29.57 kW) is within nominal limits for unload mode (no excess energy waste).*
  - *Mechanical vibration level (1.397 mm/s) is elevated above baseline.*
- **Recommended Action:** Perform acoustic & vibration spectrum inspection.

### Incident #4: AIR-COMP-01 — Bearing Degradation (HIGH)
- **Timestamp:** `2024-01-26T22:10:00`
- **Actual vs Expected Power:** 69.87 kW vs 68.56 kW (Deviation: 1.91%)
- **Model Confidence Score:** 0.1684
- **Evidence Trail:**
  - *Power consumption (69.87 kW) is within nominal limits for load mode (no excess energy waste).*
  - *Mechanical vibration level (1.425 mm/s) is elevated above baseline.*
- **Recommended Action:** Perform acoustic & vibration spectrum inspection.

### Incident #5: AIR-COMP-01 — Bearing Degradation (HIGH)
- **Timestamp:** `2024-01-26T22:20:00`
- **Actual vs Expected Power:** 27.41 kW vs 25.98 kW (Deviation: 5.52%)
- **Model Confidence Score:** 0.1684
- **Evidence Trail:**
  - *Power consumption (27.41 kW) is within nominal limits for unload mode (no excess energy waste).*
  - *Mechanical vibration level (1.346 mm/s) is elevated above baseline.*
- **Recommended Action:** Perform acoustic & vibration spectrum inspection.

---

## 5. Engineering Assumptions & Limitations

1. **Chronological Splitting:** Training on earlier 70% and testing on the latest 15% measures performance on this dataset and does not prove generalization to uncalibrated physical machines.
2. **Leakage Exclusion:** Prohibited columns (`is_anomaly`, `anomaly_type`, `rolling_anomaly_rate`, `maintenance_priority_score`, `alert_code`, `reading_id`) were strictly excluded from model feature sets.
3. **Power Baselines:** High-load operating states are treated as legitimate high-load regimes; power alerts are only generated when consumption statistically deviates within that operating regime.
4. **Scope 2 Carbon Accounting:** Relies strictly on the official CEA India National Grid Emission Factor (0.82 kg CO2e/kWh) without fabricated Scope 1 assumptions.
