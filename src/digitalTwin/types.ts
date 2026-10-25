export type MachineId =
  | 'COMP-01'
  | 'CNC-01'
  | 'FURN-01'
  | 'CHIL-01'
  | 'PAINT-01'
  | 'ASSET-COMP-01'
  | 'ASSET-CNC-01'
  | 'ASSET-FURN-01'
  | 'ASSET-CHIL-01'
  | 'ASSET-PNT-01'
  | 'compressor'
  | 'cnc'
  | 'furnace'
  | 'cooling'
  | 'painting';

export type MachineState = 'running' | 'idle' | 'off' | 'maintenance';

export interface MachineConstraints {
  production_target_required?: boolean;
  min_daily_production_units?: number;
  max_continuous_run_hours?: number;
  min_service_required?: boolean;
  idle_shutdown_requires_operator_approval?: boolean;
  min_pressure_bar?: number;
  rated_pressure_bar?: number;
  protected_process_block?: boolean;
  min_continuous_cycle_hours?: number;
  cannot_interrupt_holding_cycle?: boolean;
  ventilation_mandatory_during_paint?: boolean;
  voc_compliance_active?: boolean;
  min_chw_supply_temp_c?: number;
  max_chw_supply_temp_c?: number;
  min_cop?: number;
  min_flow_required?: boolean;
}


export interface MachineProfile {
  machine_id: string;
  name: string;
  process: string;
  rated_power_kw: number;
  expected_idle_power_kw: number;
  off_power_kw: number;
  permitted_states: MachineState[];
  constraints: MachineConstraints;
  data_source: string;
  color: string;
  iconName?: string;
  model3DId?: string;
}

export type SensorQuality = 'good' | 'missing' | 'suspect';
export type ShiftPattern = 'day_shift' | '2_shift' | '3_shift';

export interface TelemetryRecord {
  timestamp: string;
  site_id?: string;
  machine_id: string;
  machine_type?: string;
  process: string;
  rated_power_kw?: number;
  power_kw: number;
  energy_kwh: number;
  machine_state: MachineState;
  operating_state?: number; // 0: Off, 1: Idle, 2: Run, 3: Standby
  load_factor?: number; // 0.00 to 1.00
  operating_minutes?: number; // 0 to 15
  ambient_temp_c?: number;
  process_temp_c?: number;
  relative_humidity_pct?: number;
  sensor_quality?: SensorQuality;
  target_next_15min_energy_kwh?: number;
  production_units: number;
  shift: 'night' | 'day_a' | 'day_b';
  shift_pattern?: ShiftPattern;
  data_source: string;
}

export interface ToDRate {
  zone: 'OFF_PEAK' | 'NORMAL' | 'PEAK';
  hours: number[];
  multiplier: number;
  rate_inr_per_kwh: number;
}

export interface TariffConfig {
  currency: string;
  energy_rate_inr_per_kwh: number;
  tariff_type: 'flat' | 'time_of_day';
  tou_rates: ToDRate[];
  contract_demand_limit_kw: number;
  demand_penalty_charge_inr_per_kw: number;
}

export interface EmissionFactorMetadata {
  factor_id: string;
  name: string;
  kg_co2e_per_kwh: number;
  unit: string;
  geography: string;
  source: string;
  reporting_period: string;
  methodology: string;
  version: string;
}

export type ActionType =
  | 'reduce_idle_power'
  | 'shift_schedule'
  | 'reduce_runtime'
  | 'pressure_optimization';

export interface ScenarioAction {
  type: ActionType;
  machine_id: string;
  start?: string;
  duration_hours?: number;
  target_power_kw?: number;
  target_state?: MachineState;
  target_load_factor?: number;      // load_factor (0.0 to 1.0)
  ambient_temp_c?: number;          // ambient_temp_c (15.0 to 45.0)
  process_temp_c?: number;          // process_temp_c (20.0 to 850.0)
  relative_humidity_pct?: number;   // relative_humidity_pct (30.0 to 95.0)
  sensor_quality?: SensorQuality;   // sensor_quality ('good' | 'missing' | 'suspect')
  shift_pattern?: ShiftPattern;     // shift_pattern ('day_shift' | '2_shift' | '3_shift')
  offset_hours?: number;
  target_pressure_bar?: number;
  baseline_pressure_bar?: number;
}

export interface ReportingWindow {
  start?: string;
  end?: string;
  interval_minutes: number;
  total_slots?: number;
}

export interface ScenarioRequest {
  scenario_id: string;
  reporting_window?: ReportingWindow;
  action: ScenarioAction;
  assumptions?: Record<string, any>;
}

export type FeasibilityStatus = 'feasible' | 'review_required' | 'blocked';

export interface ConstraintViolation {
  code: string;
  severity: 'error' | 'warning' | 'info';
  machine_id: string;
  message: string;
  limit_value?: number;
  simulated_value?: number;
  provenance?: string;
}

export interface MachineMetrics {
  energy_kwh: number;
  max_power_kw: number;
  production_units: number;
  sec_kwh_per_unit: number;
}

export interface MetricsSummary {
  total_energy_kwh: number;
  total_production_units: number;
  sec_kwh_per_unit: number; // Specific Energy Consumption (kWh/unit)
  peak_demand_kw: number;
  peak_timestamp: string | null;
  contract_demand_limit_kw: number;
  peak_exceedance_kw: number;
  energy_cost_inr: number;
  demand_penalty_inr: number;
  total_cost_inr: number;
  scope2_kg_co2e: number | null;
  by_machine: Record<string, MachineMetrics>;
  time_slot_power: Record<string, number>;
  hourly_plant: {
    hour: number;
    label: string;
    kw: number;
    kwh: number;
    production_units: number;
    isPeakToD: boolean;
    exceedsContract: boolean;
    machines: Record<string, number>;
  }[];
}

export interface SavingsPositive {
  energy_kwh: number;
  cost_inr: number;
  peak_kw: number;
  scope2_kg_co2e: number | null;
  sec_reduction: number;
}

export interface Deltas {
  energy_kwh: number;
  cost_inr: number;
  peak_kw: number;
  scope2_kg_co2e: number | null;
  sec_kwh_per_unit: number;
  savings_positive: SavingsPositive;
}

export type EvidenceGrade = 'A' | 'B' | 'C';

export interface InvestmentCase {
  capex_inr: number;
  conservative_annual_saving_inr: number;
  expected_annual_saving_inr: number;
  best_case_annual_saving_inr: number;
  payback_months_conservative: number;
  payback_months_expected: number;
  payback_months_best: number;
  evidence_grade: EvidenceGrade;
  evidence_description: string;
  missing_measurements_sensitivity: string[];
  diagnostic_ambiguity?: string;
  recommended_instrument?: string;
  voi_ratio?: number;
  voi_annual_uncertainty_inr?: number;
}

export interface MVLedgerEntry {
  intervention_id: string;
  title: string;
  target_asset: string;
  implementation_date: string;
  case_type?: 'contraction' | 'expansion';
  baseline_kwh: number;
  baseline_units: number;
  baseline_sec: number;
  actual_measured_kwh: number;
  actual_units: number;
  actual_sec: number;
  adjusted_baseline_kwh: number;
  raw_submeter_drop_kwh?: number;
  production_volume_effect_kwh?: number;
  expected_savings_kwh: number;
  realized_savings_kwh: number;
  realization_rate_pct: number;
  verified_scope2_kg_co2e?: number;
  status: 'verified' | 'investigating';
  variance_notes: string;
}

export interface SimulationResult {
  scenario_id: string;
  status: 'simulation_only';
  feasibility: FeasibilityStatus;
  data_source: string;
  window: ReportingWindow;
  baseline: MetricsSummary;
  scenario: MetricsSummary;
  deltas: Deltas;
  constraint_violations: ConstraintViolation[];
  assumptions: Record<string, any>;
  requires_operator_approval: boolean;
  action_executed: ScenarioAction;
  investment_case?: InvestmentCase;
}

export interface TradeOffCandidate {
  id: string;
  name: string;
  strategy: string;
  status: 'BLOCKED' | 'INFEASIBLE' | 'RECOMMENDED';
  statusLabel: string;
  peakKw: number;
  energyKwhSaved: number;
  costSavedInr: number;
  productionUnits: number;
  pressureBar: number;
  furnaceKw: number;
  diagnostics: string;
  provenance?: string;
  interlocks_triggered?: string[];
}

export interface ScenarioPreset {
  id: string;
  title: string;
  subtitle: string;
  category: 'anomaly' | 'peak' | 'opt' | 'safety';
  action: ScenarioAction;
  assumptions: Record<string, any>;
  description: string;
  expectedOutcome: string;
}

/**
 * Unified Versioned Decision Record Schema (UVDR-v1)
 * Enforces a single source of truth across digital twin simulation,
 * uncertainty profiling, constraint checks, and ISO 50001 audit exports.
 */
export interface UnifiedDecisionRecord {
  record_id: string;
  timestamp: string;
  calculation_engine_version: string;
  verification_status: 'simulated' | 'estimated' | 'verified';
  input_data_window: {
    start_time: string;
    end_time: string;
    duration_hours: number;
    records_count: number;
    telemetry_status: 'validated_telemetry' | 'uncalibrated_heuristic';
  };
  intervention: {
    action_type: string;
    target_machine_id: string;
    parameters: Record<string, any>;
    assumptions_provenance: string;
  };
  constraint_evaluations: Array<{
    code: string;
    severity: 'error' | 'warning';
    limit_value: number;
    simulated_value: number;
    status: 'PASSED' | 'VIOLATED';
    provenance: string;
    diagnostic_message: string;
  }>;
  overall_feasibility: FeasibilityStatus;
  metrics: {
    baseline_energy_kwh: number;
    scenario_energy_kwh: number;
    energy_delta_kwh: number;
    baseline_cost_inr: number;
    scenario_cost_inr: number;
    cost_delta_inr: number;
    baseline_peak_kw: number;
    scenario_peak_kw: number;
    peak_delta_kw: number;
    scope1_kg_co2e_daily: number;
    scope2_kg_co2e_delta: number | null;
  };
  uncertainty_profile: {
    quantified: boolean;
    evidence_grade: EvidenceGrade;
    diagnostic_ambiguity: string;
    conservative_savings_inr_daily: number;
    expected_savings_inr_daily: number;
    value_of_information: {
      recommended_instrument: string;
      capex_inr: number;
      expected_variance_reduction_pct: number;
      voi_ratio: number;
    };
  };
  counterfactual_mv: {
    methodology: string;
    baseline_production_units: number;
    actual_production_units: number;
    adjusted_baseline_kwh: number;
    raw_submeter_savings_kwh: number;
    production_volume_effect_kwh: number;
    verified_operational_savings_kwh: number;
    realization_rate_pct: number;
  };
  governance: {
    emission_factor_provenance: {
      scope1_lpg: string;
      scope2_grid: string;
    };
    requires_human_signoff: boolean;
    plant_energy_manager_approval: 'pending' | 'approved' | 'rejected';
  };
}
