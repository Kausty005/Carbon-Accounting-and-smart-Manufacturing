import type {
  TelemetryRecord,
  SimulationResult,
  TariffConfig,
  EmissionFactorMetadata,
} from './types';
import { runScenarioSimulation } from './scenarioEngine';
import { calculateMetrics } from './calculationEngine';

export interface OptimizationResult {
  baselinePeakKw: number;
  optimizedPeakKw: number;
  peakReductionKw: number;
  bestScenario: SimulationResult;
  candidateComparisons: {
    label: string;
    machineId: string;
    offsetHours: number;
    peakDemandKw: number;
    feasibility: string;
    peakReductionKw: number;
  }[];
}

export function runPeakDemandOptimizer(
  baselineRecords: TelemetryRecord[],
  tariffConfig: TariffConfig,
  emissionFactor?: EmissionFactorMetadata | null
): OptimizationResult {
  const baseMetrics = calculateMetrics(baselineRecords, tariffConfig, emissionFactor);
  const baselinePeakKw = baseMetrics.peak_demand_kw;

  const candidateShifts = [
    { label: 'CNC Shift +1h', machine_id: 'CNC-01', offset_hours: 1 },
    { label: 'CNC Shift +2h (Optimal Stagger)', machine_id: 'CNC-01', offset_hours: 2 },
    { label: 'CNC Shift +3h', machine_id: 'CNC-01', offset_hours: 3 },
    { label: 'Furnace Shift +1h', machine_id: 'FURN-01', offset_hours: 1 },
    { label: 'Furnace Shift -1h', machine_id: 'FURN-01', offset_hours: -1 },
  ];

  const candidateComparisons = [];
  let bestScenario: SimulationResult | null = null;
  let lowestPeak = baselinePeakKw;

  for (const cand of candidateShifts) {
    const res = runScenarioSimulation(
      baselineRecords,
      {
        scenario_id: `OPT-${cand.machine_id}-${cand.offset_hours}`,
        action: {
          type: 'shift_schedule',
          machine_id: cand.machine_id,
          offset_hours: cand.offset_hours,
        },
        assumptions: {
          optimization_objective: 'Minimize Coincident Peak Demand (kW)',
          solver: 'Discrete Interval Offset Sweep with Industrial Constraint Interlocks',
        },
      },
      tariffConfig,
      emissionFactor
    );

    const peak = res.scenario.peak_demand_kw;
    const reduction = Number((baselinePeakKw - peak).toFixed(2));

    candidateComparisons.push({
      label: cand.label,
      machineId: cand.machine_id,
      offsetHours: cand.offset_hours,
      peakDemandKw: peak,
      feasibility: res.feasibility,
      peakReductionKw: reduction,
    });

    if (res.feasibility !== 'blocked' && peak < lowestPeak) {
      lowestPeak = peak;
      bestScenario = res;
    }
  }

  // Fallback if none lower
  if (!bestScenario) {
    bestScenario = runScenarioSimulation(
      baselineRecords,
      {
        scenario_id: 'OPT-CNC-01-2',
        action: {
          type: 'shift_schedule',
          machine_id: 'CNC-01',
          offset_hours: 2,
        },
      },
      tariffConfig,
      emissionFactor
    );
  }

  return {
    baselinePeakKw,
    optimizedPeakKw: lowestPeak,
    peakReductionKw: Number((baselinePeakKw - lowestPeak).toFixed(2)),
    bestScenario,
    candidateComparisons,
  };
}
