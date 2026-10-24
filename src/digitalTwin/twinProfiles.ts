import type { MachineProfile, TariffConfig, EmissionFactorMetadata } from './types';

export const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'COMP-01': {
    machine_id: 'COMP-01',
    name: 'Air Compressor (ELGi EN 45)',
    process: 'compressed_air',
    rated_power_kw: 30.0,
    expected_idle_power_kw: 8.0,
    off_power_kw: 1.0,
    permitted_states: ['running', 'idle', 'off', 'maintenance'],
    constraints: {
      min_service_required: true,
      idle_shutdown_requires_operator_approval: true,
      min_pressure_bar: 6.5,
      rated_pressure_bar: 7.5,
    },
    data_source: 'simulated_profile',
    color: '#f59e0b', // amber
    model3DId: 'compressor',
  },
  'CNC-01': {
    machine_id: 'CNC-01',
    name: 'CNC Machining Center (NLX-2500)',
    process: 'machining',
    rated_power_kw: 25.0,
    expected_idle_power_kw: 3.0,
    off_power_kw: 0.8,
    permitted_states: ['running', 'idle', 'off', 'maintenance'],
    constraints: {
      production_target_required: true,
      min_daily_production_units: 140,
      max_continuous_run_hours: 8,
    },
    data_source: 'simulated_profile',
    color: '#22d3ee', // cyan
    model3DId: 'cnc',
  },
  'FURN-01': {
    machine_id: 'FURN-01',
    name: 'Heat-Treatment Furnace (IF-85)',
    process: 'heat_treatment',
    rated_power_kw: 50.0,
    expected_idle_power_kw: 15.0,
    off_power_kw: 2.0,
    permitted_states: ['running', 'idle', 'off', 'maintenance'],
    constraints: {
      protected_process_block: true,
      min_continuous_cycle_hours: 4,
      cannot_interrupt_holding_cycle: true,
    },
    data_source: 'simulated_profile',
    color: '#ef4444', // red
    model3DId: 'furnace',
  },
  'PAINT-01': {
    machine_id: 'PAINT-01',
    name: 'Painting Line & Exhaust (PL-20)',
    process: 'painting',
    rated_power_kw: 20.0,
    expected_idle_power_kw: 5.0,
    off_power_kw: 0.5,
    permitted_states: ['running', 'idle', 'off', 'maintenance'],
    constraints: {
      ventilation_mandatory_during_paint: true,
      voc_compliance_active: true,
    },
    data_source: 'simulated_profile',
    color: '#10b981', // emerald
    model3DId: 'cooling', // maps to 4th asset in 3D scene
  },
};

export const ID_ALIASES: Record<string, string> = {
  compressor: 'COMP-01',
  cnc: 'CNC-01',
  furnace: 'FURN-01',
  cooling: 'PAINT-01',
  'COMP-01': 'COMP-01',
  'CNC-01': 'CNC-01',
  'FURN-01': 'FURN-01',
  'PAINT-01': 'PAINT-01',
};

export function resolveMachineId(id: string): string {
  return ID_ALIASES[id] || id;
}

export const DEFAULT_TARIFF_CONFIG: TariffConfig = {
  currency: 'INR',
  energy_rate_inr_per_kwh: 9.00,
  tariff_type: 'time_of_day',
  tou_rates: [
    { zone: 'OFF_PEAK', hours: [22, 23, 0, 1, 2, 3, 4, 5], multiplier: 0.85, rate_inr_per_kwh: 7.65 },
    { zone: 'NORMAL', hours: [6, 7, 8, 13, 14, 15, 16, 17], multiplier: 1.0, rate_inr_per_kwh: 9.00 },
    { zone: 'PEAK', hours: [9, 10, 11, 12, 18, 19, 20, 21], multiplier: 1.20, rate_inr_per_kwh: 10.80 },
  ],
  contract_demand_limit_kw: 85.0,
  demand_penalty_charge_inr_per_kw: 350.0,
};

export const DEFAULT_EMISSION_FACTOR: EmissionFactorMetadata = {
  factor_id: 'EF-GRID-IN-2023',
  name: 'India National Grid Baseline Emission Factor',
  kg_co2e_per_kwh: 0.82,
  unit: 'kg CO2e/kWh',
  geography: 'National Grid (CEA India)',
  source: 'Central Electricity Authority (CEA) Baseline Database v19 (2023-24)',
  reporting_period: '2023-2024',
  methodology: 'GHG Protocol Location-based Scope 2',
  version: '1.0.0',
};
