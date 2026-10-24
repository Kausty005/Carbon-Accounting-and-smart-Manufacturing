# WattWise AI — Machine-Level Energy Forecasting Pipeline

An end-to-end, machine-aware machine learning pipeline for forecasting 15-minute machine-level electrical energy consumption ($E_{t+1}$ in $\text{kWh}$) across industrial manufacturing assets.

> [!IMPORTANT]
> **Synthetic Data Designation & Limitation**  
> The dataset utilized (`industrial_energy_forecasting_synthetic.csv`) is a **verified synthetic industrial benchmark**. It was generated for algorithm validation, time-series benchmarking, and demo simulation. It does **NOT** represent physical factory measurements. This synthetic designation is preserved throughout all model metadata, serialized joblib artifacts, API responses (`data_provenance: "PREDICTED_HIST_GB_MODEL"` or `"SYNTHETIC_BENCHMARK_MODEL"`), and documentation.

---

## 1. Dataset Characteristics & Location

- **File Location**: `industrial_energy_forecasting_synthetic.csv` (Project Root)
- **File Size**: $112.8\text{ MB}$ ($112,782,269\text{ bytes}$)
- **SHA-256 Checksum (Prefix)**: `06229d9556da29c4`
- **Total Records**: $740,748$ rows $\times 21$ columns
- **Temporal Horizon**: `2025-01-01 00:00:00` to `2025-06-29 23:30:00` ($180$ consecutive calendar days)
- **Reporting Interval**: $15\text{ minutes}$ (nominal)
- **Fleet Composition**:
  - $43\text{ unique machines}$ across $3\text{ manufacturing facilities}$ (`SITE_01`, `SITE_02`, `SITE_03`)
  - $12\text{ distinct machine taxonomies}$:
    - `CONVEYOR` ($4\text{ assets}$)
    - `CNC_MILL` ($4\text{ assets}$)
    - `INJECTION_MOLDER` ($4\text{ assets}$)
    - `INDUSTRIAL_MIXER` ($4\text{ assets}$)
    - `HYDRAULIC_PRESS` ($4\text{ assets}$)
    - `AIR_COMPRESSOR` ($4\text{ assets}$)
    - `PUMP` ($4\text{ assets}$)
    - `FAN_BLOWER` ($3\text{ assets}$)
    - `PACKAGING_MACHINE` ($3\text{ assets}$)
    - `WELDING_STATION` ($3\text{ assets}$)
    - `OVEN_FURNACE` ($3\text{ assets}$)
    - `GRINDER` ($3\text{ assets}$)

---

## 2. Dataset Validation & Physical Integrity

The dataset was independently inspected via [validate_dataset.py](file:///d:/OMKAR/OMKAR/Carbon-Accounting-and-smart-Manufacturing/ml/energy_forecasting/src/validate_dataset.py) with results exported to `reports/data_quality_report.json`:

| Check | Result | Explanation |
| :--- | :--- | :--- |
| **Chronological Monotonicity** | **PASS** | Timestamps are strictly monotonic increasing per machine ($0$ timestamp inversions). |
| **Duplicate Timestamps** | **PASS** | $0$ duplicate records found across all machines. |
| **Sensor Quality Distribution** | **PASS** | `good`: $729,608$ ($98.50\%$), `suspect`: $8,896$ ($1.20\%$), `missing`: $2,244$ ($0.30\%$). |
| **Physical Consistency ($E = P \times 0.25$)** | **PASS** | For all $729,608$ `good` quality records, energy consumed in $15\text{ min}$ matches average power demand $\times 0.25\text{ hours}$ within float precision ($\le 1.5 \times 10^{-5}\text{ kWh}$). Mismatches occur exclusively in `suspect` records ($8,896$ simulated calibration drift events). |
| **Target Alignment** | **PASS** | For all records with an observed subsequent row, `target_next_15min_energy_kwh` matches the subsequent interval's energy exactly ($0$ mismatches, max difference $= 0.0000$). |
| **Interval Continuity** | **DOCUMENTED** | $2,244$ single-interval telemetry dropouts ($30\text{-minute}$ steps instead of $15\text{ min}$) simulated across the $740,748$ rows. Missing `energy_kwh` values ($2,244$) correspond $1:1$ to `sensor_quality == 'missing'` and are repaired via physical power relation $P \times 0.25$. |

---

## 3. Forecasting Objective & Target

- **Predictive Objective**: Predict the expected electrical energy consumption of a specific machine during its upcoming 15-minute operational window ($t \to t+15\text{ min}$).
- **Target Variable**: `target_next_15min_energy_kwh` ($\text{kWh}$)
- **Equivalent Power Demand**: $\hat{P} = \hat{E} / 0.25\text{ h}$ ($\text{kW}$)

### Target Leakage Prevention
To prevent data leakage:
1. `target_next_15min_energy_kwh` is **strictly excluded** from input features.
2. `target_timestamp` is **strictly excluded** from input features.
3. Future operating states, future production counts, and future measurements are **not** made available.
4. All lag features look strictly backward in time from timestamp $t$.

---

## 4. Feature Engineering

The model takes $29$ features ($5$ categorical, $24$ numerical):

### Categoricals (One-Hot Encoded with `handle_unknown='ignore'`):
- `machine_id`: Asset identifier ($43$ classes)
- `machine_type`: Asset taxonomy ($12$ classes)
- `site_id`: Facility location ($3$ classes)
- `shift_pattern`: `day_shift`, `2_shift`, `3_shift`
- `operating_state`: `0` (Off), `1` (Idle), `2` (Running), `3` (Maintenance)

### Numericals (Imputed & Standardized):
- **Nameplate**: `rated_power_kw`
- **Temporal Cyclical**: `hour`, `day_of_week`, `is_weekend`, `hour_sin`, `hour_cos`, `day_sin`, `day_cos`
- **Environmental**: `ambient_temp_c`, `process_temp_c`, `relative_humidity_pct`
- **Operating Conditions**: `load_factor`, `operating_minutes`, `production_units`, `power_kw`
- **Historical Telemetry Lags (Backward Looking)**:
  - `energy_kwh_lag1`: Energy consumed in current completed interval $(t-15\text{m}, t]$
  - `energy_kwh_lag2`: Energy consumed in $(t-30\text{m}, t-15\text{m}]$
  - `energy_kwh_lag3`: Energy consumed in $(t-45\text{m}, t-30\text{m}]$
  - `energy_kwh_lag4`: Energy consumed in $(t-60\text{m}, t-45\text{m}]$
  - `power_kw_lag1`: Average power in $(t-15\text{m}, t]$
  - `power_kw_lag2`: Average power in $(t-30\text{m}, t-15\text{m}]$
  - `energy_rolling_mean_1h`: Rolling mean over past 4 intervals
  - `energy_rolling_std_1h`: Rolling standard deviation over past 4 intervals
  - `energy_same_hour_prev_day`: Same 15-minute slot 24 hours ago (lag 96 intervals)

---

## 5. Chronological Splitting Strategy

Data is partitioned strictly by unique calendar dates to prevent temporal leakage:

```
[2025-01-01 ────────── 2025-05-05]   [2025-05-06 ────── 2025-06-02]   [2025-06-03 ────── 2025-06-29]
       Training Set (70%)                  Validation Set (15%)                 Test Set (15%)
         125 calendar dates                  28 calendar dates                  27 calendar dates
          514,428 records                     115,222 records                    111,098 records
```

- **Validation Set**: Used exclusively for candidate model selection and hyperparameter tuning.
- **Test Set**: Evaluated once on the final selected model to produce unbiased reporting.

---

## 6. Model Comparison & Empirical Results

Four models were implemented and evaluated on the same training and validation splits:

### Validation Performance Comparison (Model Selection)

| Model | MAE (kWh) | RMSE (kWh) | $R^2$ Score | WAPE (%) | sMAPE (%) | Selection Decision |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Persistence Baseline** ($E_t$) | $1.0692$ | $2.0193$ | $0.3495$ | $48.10\%$ | $88.58\%$ | Baseline reference |
| **Same-Hour Previous-Day** ($E_{t-96}$) | $1.3675$ | $2.3706$ | $0.1035$ | $61.51\%$ | $104.22\%$ | Historical reference |
| **Random Forest Regressor** ($40\text{ trees}$) | $0.9704$ | $1.4971$ | $0.6425$ | $43.65\%$ | $84.28\%$ | Strong tree ensemble |
| **HistGradientBoosting Regressor** | **$0.9382$** | **$1.4675$** | **$0.6565$** | **$42.20\%$** | **$82.68\%$** | **SELECTED (Best Validation Metrics)** |

### Final Test Set Evaluation ($111,098$ Records, Unseen Dates)

| Model | MAE (kWh) | RMSE (kWh) | $R^2$ Score | WAPE (%) | sMAPE (%) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Persistence Baseline** | $1.0693$ | $2.0335$ | $0.3401$ | $48.41\%$ | $88.94\%$ |
| **Same-Hour Previous-Day** | $1.3350$ | $2.3404$ | $0.1259$ | $60.45\%$ | $103.54\%$ |
| **Random Forest Regressor** | $0.9843$ | $1.5067$ | $0.6377$ | $44.57\%$ | $84.77\%$ |
| **HistGradientBoosting (Final Model)** | **$0.9403$** | **$1.4763$** | **$0.6522$** | **$42.57\%$** | **$82.91\%$** |

*HistGradientBoosting delivers a **$12.1\%$ reduction in MAE** and **$27.4\%$ reduction in RMSE** over the persistence baseline, capturing non-linear thermal, operational, and shift interactions.*

---

## 7. Segmented Performance Breakdown (Test Set)

### By Machine Taxonomy (Ranked by Complexity)

| Machine Type | Test Count | Mean Actual (kWh) | MAE (kWh) | RMSE (kWh) | $R^2$ Score | WAPE (%) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CONVEYOR** | $10,340$ | $0.840$ | **$0.3708$** | $0.5702$ | $0.6545$ | $44.13\%$ |
| **PUMP** | $10,340$ | $1.047$ | **$0.4907$** | $0.7831$ | $0.6384$ | $46.85\%$ |
| **FAN_BLOWER** | $7,755$ | $1.306$ | **$0.5986$** | $0.9320$ | $0.6409$ | $45.83\%$ |
| **PACKAGING_MACHINE** | $7,755$ | $1.428$ | **$0.6693$** | $1.0601$ | $0.6277$ | $46.88\%$ |
| **GRINDER** | $7,755$ | $1.569$ | **$0.7302$** | $1.1578$ | $0.6401$ | $46.54\%$ |
| **WELDING_STATION** | $7,755$ | $1.761$ | **$0.8142$** | $1.2913$ | $0.6444$ | $46.24\%$ |
| **INDUSTRIAL_MIXER** | $10,340$ | $1.776$ | **$0.7936$** | $1.2589$ | $0.6442$ | $44.69\%$ |
| **CNC_MILL** | $10,340$ | $2.030$ | **$0.9168$** | $1.4443$ | $0.6346$ | $45.16\%$ |
| **AIR_COMPRESSOR** | $10,340$ | $2.361$ | **$1.0506$** | $1.6502$ | $0.6429$ | $44.50\%$ |
| **HYDRAULIC_PRESS** | $10,340$ | $3.292$ | **$1.4178$** | $2.2222$ | $0.6493$ | $43.07\%$ |
| **INJECTION_MOLDER** | $10,340$ | $3.469$ | **$1.5234$** | $2.4045$ | $0.6377$ | $43.91\%$ |
| **OVEN_FURNACE** | $7,755$ | $4.481$ | **$1.8542$** | $2.9238$ | $0.6558$ | $41.38\%$ |

### By Operational State

| State | Status | Test Samples | Mean Energy (kWh) | MAE (kWh) | WAPE (%) |
| :---: | :--- | :---: | :---: | :---: | :---: |
| `0` | Off / Stopped | $23,986$ | $0.036\text{ kWh}$ | **$0.024\text{ kWh}$** | $66.4\%$ |
| `1` | Idle / Standby | $24,198$ | $0.323\text{ kWh}$ | **$0.246\text{ kWh}$** | $76.2\%$ |
| `2` | Running / Production | $62,607$ | $3.774\text{ kWh}$ | **$1.558\text{ kWh}$** | $41.3\%$ |
| `3` | Maintenance / Anomaly | $307$ | $0.085\text{ kWh}$ | **$0.061\text{ kWh}$** | $71.8\%$ |

---

## 8. Unseen Machine Generalization Experiment

To test whether the single generalized model can transfer to completely new, unobserved machines, $6\text{ physical machines}$ ($103,353\text{ records}$) were entirely held out during training:

- **Held-Out Assets**: `MACHINE_001` (Conveyor), `MACHINE_011` (Compressor), `MACHINE_008` (CNC), `MACHINE_006` (Press), `MACHINE_007` (Molder), `MACHINE_003` (Pump)
- **Generalization Performance on Unseen Assets**:
  - **MAE**: $0.8975\text{ kWh}$
  - **RMSE**: $1.3178\text{ kWh}$
  - **$R^2$ Score**: $0.6174$
  - **WAPE**: $44.50\%$

*The model retains an $R^2 > 0.61$ on completely unseen machines by relying on physical features (`rated_power_kw`, `load_factor`, `machine_type`) rather than memorizing individual machine IDs.*

---

## 9. Visual Artifacts

Generated plots are located in [ml/energy_forecasting/plots/](file:///d:/OMKAR/OMKAR/Carbon-Accounting-and-smart-Manufacturing/ml/energy_forecasting/plots/):

1. `actual_vs_predicted.png`: Scatter plot comparing true vs. predicted 15-minute consumption with ideal 1:1 parity line.
2. `residual_distribution.png`: Histogram showing zero-centered, Gaussian-like error residuals ($\mu \approx -0.005\text{ kWh}$).
3. `metrics_by_machine_type.png`: Horizontal bar chart of MAE across all 12 machine types.

---

## 10. Model Artifact & Reproducibility

- **Artifact Path**: `ml/energy_forecasting/models/energy_forecasting_model.joblib`
- **File Contents**:
  - `model`: Fitted `sklearn.pipeline.Pipeline` (Preprocessor + `HistGradientBoostingRegressor`)
  - `feature_names`: Complete list of $29$ features in exact schema order
  - `categorical_features`: List of $5$ categorical variables
  - `numerical_features`: List of $24$ continuous variables
  - `metadata`: Version `1.0.0`, training timestamp, dataset hash, metrics dictionary
  - `is_synthetic`: `True`

---

## 11. Backend Integration Details

The model is integrated into the FastAPI backend via a dedicated service and REST router:

### Endpoints:
- `POST /api/v1/forecast/next-15min`
  - Accepts `EnergyForecastInput` payload:
    ```json
    {
      "machine_id": "MACHINE_011",
      "machine_type": "AIR_COMPRESSOR",
      "site_id": "SITE_02",
      "rated_power_kw": 18.425,
      "power_kw": 12.5,
      "operating_state": 2,
      "load_factor": 0.68,
      "operating_minutes": 15.0,
      "production_units": 0.0
    }
    ```
  - Returns `EnergyForecastResponse`:
    ```json
    {
      "machine_id": "MACHINE_011",
      "machine_type": "AIR_COMPRESSOR",
      "predicted_next_15min_energy_kwh": 2.5184,
      "equivalent_average_power_kw": 10.074,
      "current_power_kw": 12.5,
      "current_energy_kwh": 3.125,
      "delta_kwh": -0.6066,
      "delta_percentage": -19.41,
      "data_provenance": "PREDICTED_HIST_GB_MODEL",
      "model_metadata": {
        "model_class": "HistGradientBoostingRegressor",
        "is_synthetic": true
      }
    }
    ```
- `GET /api/v1/forecast/metadata`
  - Returns model architecture, training configuration, and validation/test metrics.

---

## 12. How to Reproduce Training & Verification

```bash
# 1. Run Dataset Validation
python ml/energy_forecasting/src/validate_dataset.py

# 2. Train and Evaluate Models
python ml/energy_forecasting/src/train.py

# 3. Run Automated Forecasting Test Suite
pytest -v backend/tests/test_forecasting.py

# 4. Run Full Backend Regression Suite (Carbon + Forecasting)
pytest -v backend/tests/
```
