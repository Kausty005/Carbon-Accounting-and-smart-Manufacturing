import type { MVLedgerEntry, SimulationResult } from './types';

export const INITIAL_MV_LEDGER: MVLedgerEntry[] = [
  {
    intervention_id: 'MV-2026-001A',
    title: 'COMP-01 Idle Reduction (Volume Contraction Audit)',
    target_asset: 'Air Compressor (ELGi EN 45)',
    implementation_date: '2026-10-17',
    case_type: 'contraction',
    baseline_kwh: 1320.0,
    baseline_units: 140,
    baseline_sec: 9.43,
    actual_measured_kwh: 1135.0,
    actual_units: 122,
    actual_sec: 9.30,
    adjusted_baseline_kwh: 1149.43, // 1320.0 * (122 / 140)
    raw_submeter_drop_kwh: 185.0,
    production_volume_effect_kwh: 170.57, // 1320.0 - 1149.43
    expected_savings_kwh: 15.0,
    realized_savings_kwh: 14.43,   // 1149.43 - 1135.0
    realization_rate_pct: 96.2,
    verified_scope2_kg_co2e: 11.83, // 14.43 * 0.82
    status: 'verified',
    variance_notes:
      'Raw submeter dropped 185.0 kWh (-14.01%). A naive twin would claim 14% savings. IPMVP normalization proved 170.57 kWh was output reduction (122 vs 140 parts), while 14.43 kWh/day (72.15 kWh/wk) was true verified operational efficiency.',
  },
  {
    intervention_id: 'MV-2026-001B',
    title: 'COMP-01 Auto-Idle Cutoff (Volume Expansion Audit)',
    target_asset: 'Air Compressor (ELGi EN 45)',
    implementation_date: '2026-10-18',
    case_type: 'expansion',
    baseline_kwh: 1180.0,
    baseline_units: 140,
    baseline_sec: 8.43,
    actual_measured_kwh: 1170.0,
    actual_units: 156,
    actual_sec: 7.50,
    adjusted_baseline_kwh: 1314.9, // 1180 * (156 / 140)
    raw_submeter_drop_kwh: 10.0,
    production_volume_effect_kwh: -134.9, // volume expansion required 134.9 kWh more
    expected_savings_kwh: 150.0,
    realized_savings_kwh: 144.9,   // 1314.9 - 1170.0
    realization_rate_pct: 96.6,
    verified_scope2_kg_co2e: 118.82,
    status: 'verified',
    variance_notes:
      'Raw sub-meter showed only 10.0 kWh drop. Management assumed failure. IPMVP production adjustment (+11.4% parts) proved true thermodynamic gain was 144.9 kWh (96.6% realization rate).',
  },
  {
    intervention_id: 'MV-2026-002',
    title: 'Pneumatic Header Pressure Tuning (7.5 → 6.8 bar)',
    target_asset: 'Pneumatic Ring Main (COMP-01 / Valves)',
    implementation_date: '2026-10-20',
    case_type: 'expansion',
    baseline_kwh: 960.0,
    baseline_units: 140,
    baseline_sec: 6.86,
    actual_measured_kwh: 895.0,
    actual_units: 142,
    actual_sec: 6.30,
    adjusted_baseline_kwh: 973.7,
    raw_submeter_drop_kwh: 65.0,
    production_volume_effect_kwh: -13.7,
    expected_savings_kwh: 85.0,
    realized_savings_kwh: 78.7,
    realization_rate_pct: 92.6,
    verified_scope2_kg_co2e: 64.53,
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
    raw_submeter_drop_kwh: 5.0,
    production_volume_effect_kwh: 0.0,
    expected_savings_kwh: 0.0,
    realized_savings_kwh: 5.0,
    realization_rate_pct: 100.0,
    verified_scope2_kg_co2e: 4.10,
    status: 'verified',
    variance_notes:
      'Total kWh preserved as expected. Coincident plant peak shaved by 22 kW; eliminated monthly maximum demand penalty.',
  },
];

export function createMVEntryFromSimulation(
  sim: SimulationResult,
  actualMeasuredReductionPct: number = 0.962,
  simulatedOutputRatio: number = 0.8714 // 122 / 140 contraction default
): MVLedgerEntry {
  const baseKwh = sim.baseline.total_energy_kwh;
  const baseUnits = sim.baseline.total_production_units || 140;
  const expectedSaving = Math.abs(sim.deltas.energy_kwh);

  const actualUnits = Math.round(baseUnits * simulatedOutputRatio);
  const adjustedBase = Number((baseKwh * (actualUnits / baseUnits)).toFixed(2));
  const realizedSaving = Number((expectedSaving * actualMeasuredReductionPct * (actualUnits / baseUnits)).toFixed(2));
  const actualKwh = Number((adjustedBase - realizedSaving).toFixed(2));
  const rawSubmeterDrop = Number((baseKwh - actualKwh).toFixed(2));
  const volumeEffect = Number((baseKwh - adjustedBase).toFixed(2));

  return {
    intervention_id: `MV-${Date.now().toString().slice(-4)}`,
    title: `Simulated: ${sim.action_executed.type} on ${sim.action_executed.machine_id}`,
    target_asset: sim.action_executed.machine_id,
    implementation_date: new Date().toISOString().slice(0, 10),
    case_type: actualUnits < baseUnits ? 'contraction' : 'expansion',
    baseline_kwh: baseKwh,
    baseline_units: baseUnits,
    baseline_sec: Number((baseKwh / baseUnits).toFixed(2)),
    actual_measured_kwh: actualKwh,
    actual_units: actualUnits,
    actual_sec: Number((actualKwh / actualUnits).toFixed(2)),
    adjusted_baseline_kwh: adjustedBase,
    raw_submeter_drop_kwh: rawSubmeterDrop,
    production_volume_effect_kwh: volumeEffect,
    expected_savings_kwh: expectedSaving,
    realized_savings_kwh: realizedSaving,
    realization_rate_pct: Number(((realizedSaving / (expectedSaving || 1)) * 100).toFixed(1)),
    verified_scope2_kg_co2e: Number((realizedSaving * 0.82).toFixed(2)),
    status: 'verified',
    variance_notes: `Production volume shifted from ${baseUnits} to ${actualUnits} units. IPMVP adjustment verified ${realizedSaving} kWh operational savings, isolating ${volumeEffect} kWh volume effect.`,
  };
}
