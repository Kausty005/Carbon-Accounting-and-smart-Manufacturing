export type MachineId = 'COMP-01' | 'CNC-01' | 'FURN-01' | 'PAINT-01' | 'compressor' | 'cnc' | 'furnace' | 'cooling';

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

export interface TelemetryRecord {
  timestamp: string;
  machine_id: string;
  process: string;
  power_kw: number;
  energy_kwh: number;
  machine_state: MachineState;
  production_units: number;
  shift: 'night' | 'day_a' | 'day_b';
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
}

export interface MVLedgerEntry {
  intervention_id: string;
  title: string;
  target_asset: string;
  implementation_date: string;
  baseline_kwh: number;
  baseline_units: number;
  baseline_sec: number;
  actual_measured_kwh: number;
  actual_units: number;
  actual_sec: number;
  adjusted_baseline_kwh: number;
  expected_savings_kwh: number;
  realized_savings_kwh: number;
  realization_rate_pct: number;
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
