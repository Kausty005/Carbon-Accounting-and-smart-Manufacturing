import type { MachineProfile, TariffConfig, EmissionFactorMetadata } from './types';
import { resolveLegacyTwinArchetype, normalizeToCanonicalAssetId } from '../data/canonicalAssets';

export const MACHINE_PROFILES: Record<string, MachineProfile> = {
  'COMP-01': {
    machine_id: 'COMP-01',
    name: 'Air Compressor (ELGi EN 45)',
    process: 'compressed_air',
    rated_power_kw: 45.0,
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
    rated_power_kw: 32.0,
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
    rated_power_kw: 85.0,
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
  'CHIL-01': {
    machine_id: 'CHIL-01',
    name: 'Industrial Process Water Chiller (Carrier AquaForce 30XW)',
    process: 'chilled_water',
    rated_power_kw: 28.0,
    expected_idle_power_kw: 4.0,
    off_power_kw: 1.0,
    permitted_states: ['running', 'idle', 'off', 'maintenance'],
    constraints: {
      min_chw_supply_temp_c: 6.0,
      max_chw_supply_temp_c: 12.0,
      min_cop: 3.5,
      min_flow_required: true,
    },
    data_source: 'simulated_profile',
    color: '#10b981', // emerald
    model3DId: 'cooling', // maps to 4th asset in 3D scene
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
    color: '#a855f7', // purple
    model3DId: 'paint_booth',
  },
};

// Aliases for Canonical Asset IDs
MACHINE_PROFILES['ASSET-COMP-01'] = MACHINE_PROFILES['COMP-01'];
MACHINE_PROFILES['ASSET-CNC-01'] = MACHINE_PROFILES['CNC-01'];
MACHINE_PROFILES['ASSET-FURN-01'] = MACHINE_PROFILES['FURN-01'];
MACHINE_PROFILES['ASSET-CHIL-01'] = MACHINE_PROFILES['CHIL-01'];
MACHINE_PROFILES['ASSET-PNT-01'] = MACHINE_PROFILES['PAINT-01'];

export const ID_ALIASES: Record<string, string> = {
  // Core Asset Names & Display IDs
  compressor: 'COMP-01',
  cnc: 'CNC-01',
  furnace: 'FURN-01',
  cooling: 'CHIL-01',
  painting: 'PAINT-01',
  'COMP-01': 'COMP-01',
  'CNC-01': 'CNC-01',
  'FURN-01': 'FURN-01',
  'CHIL-01': 'CHIL-01',
  'PAINT-01': 'PAINT-01',

  // Canonical IDs
  'ASSET-COMP-01': 'COMP-01',
  'ASSET-CNC-01': 'CNC-01',
  'ASSET-FURN-01': 'FURN-01',
  'ASSET-CHIL-01': 'CHIL-01',
  'ASSET-PNT-01': 'PAINT-01',

  // Chiller Aliases (Decoupled from Painting Line)
  'CHILLER-01': 'CHIL-01',
  'CHIL-CENT-01': 'CHIL-01',
  'CHIL-WTR-01': 'CHIL-01',
  'COOL-01': 'CHIL-01',
  'COOLING': 'CHIL-01',

  // Painting Line Aliases
  'BOOT-PNT-01': 'PAINT-01',
  'PNT-LINE-01': 'PAINT-01',

  // Machine aliases from industrial dataset
  'MACHINE_011': 'COMP-01',
  'MACHINE_012': 'COMP-01',
  'MACHINE_013': 'COMP-01',
  'MACHINE_017': 'COMP-01',
  'AIR_COMPRESSOR': 'COMP-01',
  'MACHINE_008': 'CNC-01',
  'MACHINE_010': 'CNC-01',
  'MACHINE_034': 'CNC-01',
  'MACHINE_038': 'CNC-01',
  'CNC_MILL': 'CNC-01',
  'MACHINE_004': 'FURN-01',
  'MACHINE_015': 'FURN-01',
  'MACHINE_031': 'FURN-01',
  'OVEN_FURNACE': 'FURN-01',
  'MACHINE_023': 'CHIL-01',
  'MACHINE_024': 'CHIL-01',
  'MACHINE_025': 'CHIL-01',
  'FAN_BLOWER': 'CHIL-01',
};

export function resolveMachineId(id: string): string {
  if (!id) return 'COMP-01';
  if (ID_ALIASES[id]) return ID_ALIASES[id];
  const canon = normalizeToCanonicalAssetId(id);
  if (canon && MACHINE_PROFILES[canon]) {
    return MACHINE_PROFILES[canon].machine_id;
  }
  return resolveLegacyTwinArchetype(id);
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
  contract_demand_limit_kw: 160.0,
  demand_penalty_charge_inr_per_kw: 350.0,
};

export const DEFAULT_EMISSION_FACTOR: EmissionFactorMetadata = {
  factor_id: 'EF-GRID-IN-2023-24-V22',
  name: 'India National Grid Baseline Emission Factor (Weighted Avg with RES)',
  kg_co2e_per_kwh: 0.728862,
  unit: 'kg CO2/kWh',
  geography: 'National Grid (CEA India)',
  source: 'Central Electricity Authority (CEA) Baseline Database v22.0 (2023-24)',
  reporting_period: '2023-2024',
  methodology: 'GHG Protocol Location-based Scope 2 (Weighted Average with RES)',
  version: '22.0',
};
