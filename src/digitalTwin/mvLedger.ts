import type { MVLedgerEntry, SimulationResult } from './types';

export const INITIAL_MV_LEDGER: MVLedgerEntry[] = [
  {
    intervention_id: 'MV-2026-001',
    title: 'COMP-01 Auto-Idle Cutoff Timer Relay',
    target_asset: 'Air Compressor (ELGi EN 45)',
    implementation_date: '2026-10-18',
    baseline_kwh: 1180.0,
    baseline_units: 140,
    baseline_sec: 8.43,
    actual_measured_kwh: 1170.0,
    actual_units: 156,
    actual_sec: 7.50,
    adjusted_baseline_kwh: 1314.9, // 1180 * (156 / 140)
    expected_savings_kwh: 150.0,
    realized_savings_kwh: 144.9,   // 1314.9 - 1170.0
    realization_rate_pct: 96.6,
    status: 'verified',
    variance_notes:
      'Raw sub-meter showed only 10 kWh drop, but after IPMVP production adjustment (+11.4% parts produced), true efficiency gain was 144.9 kWh (96.6% realization rate).',
  },
  {
    intervention_id: 'MV-2026-002',
    title: 'Pneumatic Header Pressure Tuning (7.5 → 6.8 bar)',
    target_asset: 'Pneumatic Ring Main (COMP-01 / Valves)',
    implementation_date: '2026-10-20',
    baseline_kwh: 960.0,
    baseline_units: 140,
    baseline_sec: 6.86,
    actual_measured_kwh: 895.0,
    actual_units: 142,
    actual_sec: 6.30,
    adjusted_baseline_kwh: 973.7,
    expected_savings_kwh: 85.0,
    realized_savings_kwh: 78.7,
    realization_rate_pct: 92.6,
    status: 'verified',
    variance_notes:
      'Delivered 78.7 kWh verified savings. Ambient temperature (+3°C above baseline) slightly increased compression heat loss.',
  },
  {
    intervention_id: 'MV-2026-003',
    title: 'CNC-01 Staggered Production Schedule (+2h Offset)',
    target_asset: 'CNC Machining (NLX-2500)',
    implementation_date: '2026-10-22',
    baseline_kwh: 1220.0,
    baseline_units: 150,
    baseline_sec: 8.13,
    actual_measured_kwh: 1215.0,
    actual_units: 150,
    actual_sec: 8.10,
    adjusted_baseline_kwh: 1220.0,
    expected_savings_kwh: 0.0, // load shift preserves kWh
    realized_savings_kwh: 5.0,
    realization_rate_pct: 100.0,
    status: 'verified',
    variance_notes:
      'Total kWh preserved as expected. Coincident plant peak shaved by 22 kW; eliminated monthly maximum demand penalty.',
  },
];

export function createMVEntryFromSimulation(
  sim: SimulationResult,
  actualMeasuredReductionPct: number = 0.94
): MVLedgerEntry {
  const baseKwh = sim.baseline.total_energy_kwh;
  const baseUnits = sim.baseline.total_production_units || 140;
  const expectedSaving = Math.abs(sim.deltas.energy_kwh);

  // Simulate post-implementation with a slight production volume shift (+8% output)
  const actualUnits = Math.round(baseUnits * 1.08);
  const adjustedBase = Number((baseKwh * (actualUnits / baseUnits)).toFixed(1));
  const realizedSaving = Number((expectedSaving * actualMeasuredReductionPct).toFixed(1));
  const actualKwh = Number((adjustedBase - realizedSaving).toFixed(1));

  return {
    intervention_id: `MV-${Date.now().toString().slice(-4)}`,
    title: `Simulated: ${sim.action_executed.type} on ${sim.action_executed.machine_id}`,
    target_asset: sim.action_executed.machine_id,
    implementation_date: new Date().toISOString().slice(0, 10),
    baseline_kwh: baseKwh,
    baseline_units: baseUnits,
    baseline_sec: sim.baseline.sec_kwh_per_unit || 8.2,
    actual_measured_kwh: actualKwh,
    actual_units: actualUnits,
    actual_sec: Number((actualKwh / actualUnits).toFixed(2)),
    adjusted_baseline_kwh: adjustedBase,
    expected_savings_kwh: expectedSaving,
    realized_savings_kwh: realizedSaving,
    realization_rate_pct: Number(((realizedSaving / (expectedSaving || 1)) * 100).toFixed(1)),
    status: 'verified',
    variance_notes: `Production volume expanded from ${baseUnits} to ${actualUnits} units (+8.0%). IPMVP adjustment confirmed ${realizedSaving} kWh true savings.`,
  };
}
