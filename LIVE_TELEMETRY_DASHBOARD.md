# WattWise AI — Real-Time Telemetry & SCADA Dashboard Architecture

## 1. Overview & Executive Summary

WattWise AI features a closed-loop **Real-Time SCADA Telemetry Stream and Dynamic Digital Twin Dashboard**. This system connects high-frequency industrial machine sensor readings directly to a unified, responsive manufacturing operations overview.

As physical or simulated shop-floor telemetry updates (every 2 seconds), the frontend seamlessly recalculates active electrical demand, operational load percentages, machine power factors, specific energy consumption metrics, and AI-detected anomaly episodes without full-page reloads.

```
┌─────────────────────────────────────────────────────────────┐
│                   SCADA Generator Engine                    │
│    (Physics models for Compressor, CNC, Furnace, Chiller)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ (1 Hz - 0.5 Hz Stream)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 FastAPI Telemetry Stream                    │
│            GET /api/anomalies/live-stream/tick              │
│       - Active Sequence Tick & Plant Draw (kW)              │
│       - Machine Array (AIR-COMP-01, CNC-01, etc.)           │
│       - Active AI Anomaly Episode & Recommendations         │
└──────────────────────────────┬──────────────────────────────┘
                               │ (Poll / WebSocket / SSE)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               React App State Synchronization               │
│               - simulatedAssets useMemo State               │
│               - Real-Time TeleBar & Status Pill             │
│               - Explainable Context Providers               │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  Row 1 KPIs  │       │ Row 2 Charts │       │  Row 4 Cards │
│ - Live kW    │       │ - Area Spline│       │ - 4 Machines │
│ - Energy Today│      │ - Power Donut│       │ - Sensor Bar │
│ - AI Savings │       │ - Alerts Col │       │ - Spec Table │
└──────────────┘       └──────────────┘       └──────────────┘
```

---

## 2. End-to-End Data Pipeline

### 2.1 Backend SCADA Stream Service
- **Endpoint**: `GET /api/anomalies/live-stream/tick`
- **Controller**: `backend/app/routers/anomalies.py` -> `backend/ai_intelligence/src/live_stream_generator.py`
- **Output Schema**:
  ```json
  {
    "tick": 865,
    "timestamp": "2026-10-24T15:50:00Z",
    "plant_power_kw": 144.72,
    "machines": [
      {
        "equipment_id": "AIR-COMP-01",
        "equipment_name": "Air Compressor (ELGi)",
        "current_kw": 22.4,
        "rated_kw": 55.0,
        "status": "OPTIMAL",
        "power_factor": 0.88,
        "discharge_pressure_bar": 6.8,
        "energy_kwh": 3140
      },
      {
        "equipment_id": "CNC-01",
        "equipment_name": "CNC Machining Center",
        "current_kw": 46.8,
        "rated_kw": 75.0,
        "status": "OPTIMAL",
        "power_factor": 0.94,
        "sec_kwh_per_part": 2.1,
        "energy_kwh": 4210
      },
      {
        "equipment_id": "FURNACE-01",
        "equipment_name": "Industrial Heat Furnace",
        "current_kw": 58.2,
        "rated_kw": 120.0,
        "status": "OPTIMAL",
        "power_factor": 0.91,
        "temp_c": 845,
        "energy_kwh": 3615
      },
      {
        "equipment_id": "CHILLER-01",
        "equipment_name": "Chilled Water Cooling System",
        "current_kw": 17.3,
        "rated_kw": 45.0,
        "status": "OPTIMAL",
        "power_factor": 0.92,
        "cop": 3.8,
        "energy_kwh": 1565
      }
    ],
    "active_anomaly": null
  }
  ```

### 2.2 Client-Side Subscription & Polling
In `src/App.tsx`, a persistent `useEffect` hook polls the live stream every 2,000 milliseconds:
```typescript
useEffect(() => {
  let isMounted = true;
  const pollTick = async () => {
    try {
      const data = await fetchLiveSimulationTick();
      if (isMounted && data) {
        setLiveTick(data);
      }
    } catch {
      // Offline fallback gracefully preserves mock state
    }
  };

  pollTick();
  const interval = setInterval(pollTick, 2000);
  return () => {
    isMounted = false;
    clearInterval(interval);
  };
}, []);
```

### 2.3 Simulated Asset Merge (`simulatedAssets`)
The incoming machine array is mapped into the frontend asset state using `useMemo`:
- `AIR-COMP-01` -> binds to `compressor` asset (extracts `currentKw`, `dischargePressureBar`, `pf`, `status`).
- `CNC-01` -> binds to `cnc` asset (extracts `currentKw`, `secKwhPerPart`, `pf`, `status`).
- `FURNACE-01` -> binds to `furnace` asset (extracts `currentKw`, `tempC`, `pf`, `status`).
- `CHILLER-01` -> binds to `cooling` asset (extracts `currentKw`, `cop`, `pf`, `status`).

---

## 3. Real-Time User Interface Components

### 3.1 Header & Top TeleBar
- **Tick Counter**: Displays `Tick #865 • Live SCADA` with real-time status.
- **Online Pill**: Displays `4 ASSETS ONLINE (144.7 kW)` with a pulsating green indicator dot.
- **Dynamic Anomaly Pill**: When an anomaly is detected by the AI pipeline, the badge switches to amber/red with the equipment ID (e.g. `1 Live Anomaly (AIR-COMP-01)`).

### 3.2 Top KPI Metric Cards (Row 1)
1. **Energy Today**:
   - Total energy accumulated in kWh.
   - Live badge: `<span className="pulse-dot" /> {totalLiveKw.toFixed(1)} kW Live Draw`.
2. **Energy Cost**:
   - Total expenditure computed from ToD tariff zones.
   - Cost trend vs. baseline.
3. **Potential Savings**:
   - Dynamically updates based on active anomaly recommendations: `₹{anomalySavingsInr} / period`.
   - Displays estimated avoidable kWh: `{anomalySavingsKwh} kWh reduction`.
4. **Carbon Footprint**:
   - Dynamically computed from Scope 2 CEA emission factors (`0.716 tCO₂e/MWh`).

### 3.3 Dynamic 24-Hour Demand & Donut Distribution (Row 2)
1. **24-Hour Demand Profile**:
   - Monotone smooth spline area chart.
   - Dynamically replaces the current hour's power points with live readings from the 4 machines.
   - Header badge indicates live aggregate power draw in real time.
2. **Asset Power Distribution (Donut Chart)**:
   - Dynamic Recharts `PieChart` using live kW values for all 4 machines.
   - Center text shows `{totalLiveKw} kW Live Total`.
   - Side breakdown table displays individual live kW, share percentage, and machine legend.
3. **Priority Alerts Column**:
   - **Dynamic Live Anomaly Card**: If `active_anomaly` is present, Alert 1 highlights the affected equipment, measured draw, expected draw, model confidence, and click-to-investigate button.
   - **Nominal State**: Displays baseline idle compressor draw, furnace preheat scheduling, and CNC status.

### 3.4 Live SCADA Incident / Action Needed Banner (Row 3)
- When `activeAnomaly` is triggered:
  - Turns into a high-visibility incident banner with red accenting.
  - Highlights actual vs. expected kW with deviation delta.
  - 3 metric chips: Live Draw (kW), AI Confidence (%), and Estimated Financial Waste (INR).
  - Quick action buttons: **Investigate Incident**, **Simulate Fix in Digital Twin**, **Locate in 3D Factory**.

### 3.5 Asset Operational Status Cards & Telemetry Table (Row 4)
- **4 Dedicated Machine Cards**:
  1. **Air Compressor (ELGi)**: Real-time load %, progress bar, power factor, and discharge pressure (`💨 bar`).
  2. **CNC Machining Center**: Real-time load %, progress bar, power factor, and specific energy (`⚙️ kWh/part`).
  3. **Industrial Heat Furnace**: Real-time load %, progress bar, power factor, and temperature (`🌡️ °C`).
  4. **Chilled Water Cooling**: Real-time load %, progress bar, power factor, and coefficient of performance (`❄️ COP`).
- **Tactical Telemetry Table**:
  - Full tabular breakdown of model, live draw, active load %, telemetry sensor value, today's energy, power factor, and status badge.
  - Clicking any row or card immediately opens the asset in the **3D Digital Twin & 15-min Forecast View**.

---

## 4. Anomaly Scenarios & AI Detection Models

| Scenario | Affected Machine | Signature | Detection Method | Recommended Fix |
|:---|:---|:---|:---|:---|
| **Unloaded Idle Run** | `AIR-COMP-01` | 18–24 kW draw with 0 CFM demand during break periods | Supervised Random Forest + Idle Rule | 5-minute automatic cutoff relay; lower setpoint to 6.8 bar |
| **Pneumatic Leakage** | `AIR-COMP-01` | Pressure drops below 6.5 bar despite 100% load | Residual Threshold + Pressure Decay | Ultrasonic air leak audit & valve reseating |
| **Coincident Heating Peak** | `FURNACE-01` | 100% heating cycle during factory tariff peak window | Peak Window Monitor | Stagger preheating cycle by 45 minutes |
| **Tool Spindle Friction** | `CNC-01` | Baseline draw jumps from 38 kW to 54 kW per part | Isolation Forest Multi-Variate | Spindle lubrication & tool offset recalibration |
| **Chiller Heat Exchanger Fouling** | `CHILLER-01` | COP degrades from 3.8 to 2.4 under nominal thermal load | Thermal COP Delta Model | Descaling condenser coils & coolant top-up |

---

## 5. Verification & Testing

### 5.1 Frontend Verification
- TypeScript type checking: `npx tsc --noEmit` -> **0 errors**
- Production bundle: `npm run build` -> **3,503 modules transformed, 0 errors**

### 5.2 Backend Verification
- Unit & integration tests: `python -m pytest backend/tests/` -> **95 passed, 0 failures**
- API health check:
  ```bash
  curl -X GET http://localhost:8000/api/anomalies/live-stream/tick
  ```

---

## 6. How to Run Locally

```bash
# 1. Start the FastAPI Backend
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

# 2. Start the Vite Frontend
npm run dev

# 3. Access in Browser
http://localhost:5173/
```
