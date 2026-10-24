import type { TelemetryRecord, MachineState } from './types';

// Deterministic generator for 7 days (168 hours × 4 assets = 672 rows)
export function generateSyntheticBaseline(
  startDateStr: string = '2026-10-17T00:00:00',
  days: number = 7
): TelemetryRecord[] {
  const records: TelemetryRecord[] = [];
  const baseDate = new Date(startDateStr);

  for (let h = 0; h < days * 24; h++) {
    const curTime = new Date(baseDate.getTime() + h * 3600 * 1000);
    const isoStr = curTime.toISOString().slice(0, 19);
    const hourOfDay = curTime.getUTCHours();
    const shift: 'night' | 'day_a' | 'day_b' =
      hourOfDay < 8 ? 'night' : hourOfDay < 16 ? 'day_a' : 'day_b';

    // 1. CNC-01 (machining)
    let cncState: MachineState = 'off';
    let cncKw = 0.8;
    let cncProd = 0;
    if (hourOfDay >= 8 && hourOfDay < 20) {
      if (hourOfDay === 13) {
        cncState = 'idle';
        cncKw = 3.0;
        cncProd = 0;
      } else {
        cncState = 'running';
        cncKw = 22.0;
        cncProd = 15;
      }
    }

    // 2. COMP-01 (compressed air)
    // Anomaly: idling at 18.0 kW instead of expected 8.0 kW during lunch / shift transitions (11:00-13:00)
    let compState: MachineState = 'running';
    let compKw = 28.0;
    if (hourOfDay >= 7 && hourOfDay < 21) {
      if (hourOfDay >= 11 && hourOfDay <= 13) {
        compState = 'idle';
        compKw = 18.0; // ANOMALY: expected 8 kW, observed 18 kW!
      } else {
        compState = 'running';
        compKw = 28.0;
      }
    } else {
      compState = 'idle';
      compKw = 8.0; // Normal night pressure hold
    }

    // 3. FURN-01 (heat-treatment furnace)
    // Protected cycle: 4-hour preheat & batch run (48 kW), idle holding (15 kW)
    let furnState: MachineState = 'off';
    let furnKw = 2.0;
    if ((hourOfDay >= 6 && hourOfDay < 10) || (hourOfDay >= 14 && hourOfDay < 18)) {
      furnState = 'running';
      furnKw = 48.0;
    } else if (hourOfDay >= 10 && hourOfDay < 14) {
      furnState = 'idle';
      furnKw = 15.0;
    }

    // 4. PAINT-01 (painting line & ventilation)
    let paintState: MachineState = 'off';
    let paintKw = 0.5;
    let paintProd = 0;
    if (hourOfDay >= 9 && hourOfDay < 17) {
      paintState = 'running';
      paintKw = 18.0;
      paintProd = 10;
    } else if (hourOfDay >= 17 && hourOfDay < 19) {
      paintState = 'idle';
      paintKw = 5.0;
    }

    records.push({
      timestamp: isoStr,
      machine_id: 'CNC-01',
      process: 'machining',
      power_kw: cncKw,
      energy_kwh: cncKw,
      machine_state: cncState,
      production_units: cncProd,
      shift,
      data_source: 'simulated',
    });

    records.push({
      timestamp: isoStr,
      machine_id: 'COMP-01',
      process: 'compressed_air',
      power_kw: compKw,
      energy_kwh: compKw,
      machine_state: compState,
      production_units: 0,
      shift,
      data_source: 'simulated',
    });

    records.push({
      timestamp: isoStr,
      machine_id: 'FURN-01',
      process: 'heat_treatment',
      power_kw: furnKw,
      energy_kwh: furnKw,
      machine_state: furnState,
      production_units: furnState === 'running' ? 1 : 0,
      shift,
      data_source: 'simulated',
    });

    records.push({
      timestamp: isoStr,
      machine_id: 'PAINT-01',
      process: 'painting',
      power_kw: paintKw,
      energy_kwh: paintKw,
      machine_state: paintState,
      production_units: paintProd,
      shift,
      data_source: 'simulated',
    });
  }

  return records;
}

// Global immutable master dataset (672 records)
export const MASTER_BASELINE_DATA = generateSyntheticBaseline();

// Helper to get 24-hour representative slice (e.g. Day 7 with the active anomaly)
export function get24HourBaseline(dayIndex: number = 6): TelemetryRecord[] {
  const startSlot = dayIndex * 24 * 4;
  const endSlot = startSlot + 24 * 4;
  return MASTER_BASELINE_DATA.slice(startSlot, endSlot).map(r => ({ ...r }));
}

// Slice arbitrary window
export function getBaselineSlice(
  startTime?: string,
  endTime?: string,
  machineId?: string
): TelemetryRecord[] {
  return MASTER_BASELINE_DATA.filter(r => {
    if (startTime && r.timestamp < startTime) return false;
    if (endTime && r.timestamp > endTime) return false;
    if (machineId && r.machine_id !== machineId) return false;
    return true;
  }).map(r => ({ ...r }));
}
