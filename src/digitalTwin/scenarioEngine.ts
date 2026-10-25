import type {
  TelemetryRecord,
  ScenarioRequest,
  SimulationResult,
  TariffConfig,
  EmissionFactorMetadata,
} from './types';
import { calculateMetrics, calculateDeltas, extractHourFromTimestamp } from './calculationEngine';
import { validateScenarioConstraints } from './constraintValidator';
import { resolveMachineId, MACHINE_PROFILES } from './twinProfiles';
import { calculateInvestmentCase } from './confidenceEngine';

export function runScenarioSimulation(
  baselineRecords: TelemetryRecord[],
  request: ScenarioRequest,
  tariffConfig: TariffConfig,
  emissionFactor?: EmissionFactorMetadata | null
): SimulationResult {
  // Deep clone baseline to protect immutability
  const scenarioRecords: TelemetryRecord[] = baselineRecords.map(r => ({ ...r }));
  const action = request.action;
  const rawId = action.machine_id;
  const machineId = resolveMachineId(rawId);

  // Apply action
  if (action.type === 'reduce_idle_power') {
    let targetKw = action.target_power_kw ?? 8.0;
    if (typeof action.target_load_factor === 'number' && typeof action.target_power_kw !== 'number') {
      const rated = MACHINE_PROFILES[machineId]?.rated_power_kw ?? (machineId === 'CHIL-01' ? 28.0 : 20.0);
      targetKw = Number((rated * action.target_load_factor).toFixed(2));
    }

    const targetState = action.target_state ?? 'idle';
    const durationHours = action.duration_hours ?? 2.0;

    // Filter candidate slots
    // If start is given, match timestamp; otherwise look for idle records or specified hours
    if (action.start) {
      const startDt = new Date(action.start).getTime();
      const endDt = startDt + durationHours * 3600 * 1000;
      for (const r of scenarioRecords) {
        if (r.machine_id === machineId) {
          const t = new Date(r.timestamp).getTime();
          if (t >= startDt && t < endDt) {
            r.power_kw = targetKw;
            r.energy_kwh = targetKw;
            r.machine_state = targetState;
          }
        }
      }
    } else {
      // Default: target idle anomaly window (hours 11-13 for COMP-01, or machine's idle records)
      let modifiedSlots = 0;
      const maxSlotsToModify = durationHours * (scenarioRecords.length > 96 ? Math.floor(scenarioRecords.length / 96) : 1);
      for (const r of scenarioRecords) {
        if (r.machine_id === machineId) {
          const h = extractHourFromTimestamp(r.timestamp);
          const isTargetSlot = machineId === 'COMP-01'
            ? (h >= 11 && h <= 11 + Math.max(0, durationHours - 1))
            : machineId === 'PAINT-01'
            ? (h >= 12 && h <= 12 + Math.max(0, durationHours - 1))
            : machineId === 'FURN-01'
            ? (h >= 10 && h <= 10 + Math.max(0, durationHours - 1))
            : (r.machine_state === 'idle' || (h >= 10 && h <= 10 + Math.max(0, durationHours - 1)));

          if (isTargetSlot && modifiedSlots < maxSlotsToModify) {
            r.power_kw = targetKw;
            r.energy_kwh = targetKw;
            r.machine_state = targetState;
            modifiedSlots++;
          }
        }
      }
    }
  } else if (action.type === 'shift_schedule') {
    const offsetHours = action.offset_hours ?? 0;
    if (offsetHours !== 0) {
      // Shift machine records across timeline
      const machineRecs = scenarioRecords.filter(r => r.machine_id === machineId);
      machineRecs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      const n = machineRecs.length;
      const originalSnapshots = machineRecs.map(r => ({
        power_kw: r.power_kw,
        energy_kwh: r.energy_kwh,
        machine_state: r.machine_state,
        production_units: r.production_units,
      }));

      const defaultOff = { power_kw: 0.8, energy_kwh: 0.8, machine_state: 'off' as const, production_units: 0 };

      for (let i = 0; i < n; i++) {
        const srcIdx = i - offsetHours;
        const src = srcIdx >= 0 && srcIdx < n ? originalSnapshots[srcIdx] : defaultOff;
        machineRecs[i].power_kw = src.power_kw;
        machineRecs[i].energy_kwh = src.energy_kwh;
        machineRecs[i].machine_state = src.machine_state;
        machineRecs[i].production_units = src.production_units;
      }
    }
  } else if (action.type === 'reduce_runtime') {
    const cutHours = action.duration_hours ?? 1;
    const runningRecs = scenarioRecords.filter(
      r => r.machine_id === machineId && r.machine_state === 'running'
    );
    const toCut = runningRecs.slice(-cutHours);
    for (const r of toCut) {
      r.power_kw = 0.8;
      r.energy_kwh = 0.8;
      r.machine_state = 'off';
      r.production_units = 0;
    }
  } else if (action.type === 'pressure_optimization') {
    const baseBar = action.baseline_pressure_bar ?? 7.5;
    const targetBar = action.target_pressure_bar ?? 6.8;
    const deltaBar = Math.max(0, baseBar - targetBar);
    // 1% energy saving per 0.1 bar reduction -> (deltaBar * 10)%
    const savingPct = Math.min(0.15, (deltaBar * 10) / 100);

    for (const r of scenarioRecords) {
      if (r.machine_id === machineId && r.machine_state === 'running') {
        r.power_kw = Number((r.power_kw * (1 - savingPct)).toFixed(2));
        r.energy_kwh = r.power_kw;
      }
    }
  }

  // Apply ambient temperature thermodynamic sensitivity (ISO 1217) for air compression
  if (typeof action.ambient_temp_c === 'number' && machineId === 'COMP-01') {
    const deltaT = action.ambient_temp_c - 24.0;
    // ~0.35% power change per °C deviation from 24°C nominal
    const tempFactor = 1 + (deltaT * 0.0035);
    for (const r of scenarioRecords) {
      if (r.machine_id === machineId && r.machine_state === 'running') {
        r.power_kw = Number((r.power_kw * tempFactor).toFixed(2));
        r.energy_kwh = r.power_kw;
      }
    }
  }

  // Validate constraints
  const { feasibility, violations } = validateScenarioConstraints(
    scenarioRecords,
    action,
    baselineRecords
  );

  // Compute metrics
  const baselineMetrics = calculateMetrics(baselineRecords, tariffConfig, emissionFactor);
  const scenarioMetrics = calculateMetrics(scenarioRecords, tariffConfig, emissionFactor);
  const deltas = calculateDeltas(baselineMetrics, scenarioMetrics);

  const timestamps = Array.from(new Set(baselineRecords.map(r => r.timestamp))).sort();
  const window = {
    start: timestamps[0] || '',
    end: timestamps[timestamps.length - 1] || '',
    interval_minutes: 60,
    total_slots: timestamps.length,
  };

  const simResult: SimulationResult = {
    scenario_id: request.scenario_id,
    status: 'simulation_only',
    feasibility,
    data_source: 'simulated',
    window,
    baseline: baselineMetrics,
    scenario: scenarioMetrics,
    deltas,
    constraint_violations: violations,
    assumptions: request.assumptions || {
      source: 'simulated_demo',
      requires_operator_approval: true,
      governance: 'ISO 50001:2018 Energy Management advisory',
    },
    requires_operator_approval: true,
    action_executed: action,
  };

  simResult.investment_case = calculateInvestmentCase(simResult, action);
  return simResult;
}
