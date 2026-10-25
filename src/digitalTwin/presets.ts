import type { ScenarioPreset } from './types';

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'SCN-IDLE-FIX',
    title: 'Compressor Idle Power Cutoff',
    subtitle: 'Resolve 18 kW Unloaded Idle Anomaly (COMP-01)',
    category: 'anomaly',
    action: {
      type: 'reduce_idle_power',
      machine_id: 'COMP-01',
      target_power_kw: 8.0,
      duration_hours: 3.0,
      target_state: 'idle',
    },
    assumptions: {
      hardware_required: '5-minute auto-cutoff timer relay or unloading solenoid tune',
      capex_inr: 25000,
      payback_period_months: 2.1,
      operator_approval: 'Required before setting DCS timer',
    },
    description:
      'Eliminates 10 kW excess idle draw during the shift transition and lunch break (11:00–14:00). Returns COMP-01 to rated 8.0 kW idle level.',
    expectedOutcome:
      'Saves ~30 kWh/day, avoids ₹270/day direct electricity charges, and reduces Scope 2 carbon by ~24.6 kg CO₂e.',
  },
  {
    id: 'SCN-PEAK-SHIFT',
    title: 'Stagger CNC Machining Schedule',
    subtitle: 'Shave Coincident Peak Demand (+2h Shift)',
    category: 'peak',
    action: {
      type: 'shift_schedule',
      machine_id: 'CNC-01',
      offset_hours: 2,
    },
    assumptions: {
      process_flexibility: 'CNC batch buffer allows 2-hour schedule offset without customer delivery delay',
      tariff_model: 'Time of Day (ToD) peak demand mitigation',
      contract_demand_limit: '85 kW threshold',
    },
    description:
      'Shifts CNC-01 production start by +2 hours, de-conflicting with the morning Heat-Treatment Furnace pre-heating cycle.',
    expectedOutcome:
      'Eliminates simultaneous morning power spike, bringing plant peak demand below the 85 kW contract penalty limit.',
  },
  {
    id: 'SCN-PRESSURE-OPT',
    title: 'Pneumatic Pressure Setpoint Tuning',
    subtitle: 'Reduce Header Pressure from 7.5 to 6.8 bar',
    category: 'opt',
    action: {
      type: 'pressure_optimization',
      machine_id: 'COMP-01',
      baseline_pressure_bar: 7.5,
      target_pressure_bar: 6.8,
    },
    assumptions: {
      physics_basis: '1% motor energy reduction per 0.1 bar drop in line pressure (CAGI standard)',
      min_tool_pressure: '6.5 bar ring main floor threshold',
      safety_margin: '0.3 bar margin maintained',
    },
    description:
      'Lowers compressor discharge pressure setpoint from 7.5 bar to 6.8 bar. Verified to meet machine tool pneumatic clamping needs.',
    expectedOutcome:
      'Yields continuous 7.0% power reduction across all active compression hours (~18 kWh/day continuous savings).',
  },
  {
    id: 'SCN-MULTI-OVERHAUL',
    title: 'Combined Sustainable Factory Overhaul',
    subtitle: 'Idle Fix + Pressure Setpoint + Peak Stagger',
    category: 'opt',
    action: {
      type: 'reduce_idle_power',
      machine_id: 'COMP-01',
      target_power_kw: 8.0,
      duration_hours: 3.0,
      target_state: 'idle',
    },
    assumptions: {
      scope: 'Multi-lever efficiency package with zero impact on production throughput',
      governance: 'ISO 50001:2018 Energy Management Plan',
    },
    description:
      'Comprehensive plant optimization: repairs compressor idle blow-down, tunes pressure to 6.8 bar, and applies schedule coordination.',
    expectedOutcome:
      'Achieves up to 12.5% plant-wide energy savings, ₹9,500+ cost reduction per period, and substantial carbon reduction.',
  },
  {
    id: 'SCN-FURNACE-OPT',
    title: 'Furnace Soaking Standby Setback',
    subtitle: 'Maintain 15 kW Quench Floor & Eliminate Drift (FURN-01)',
    category: 'opt',
    action: {
      type: 'reduce_idle_power',
      machine_id: 'FURN-01',
      target_power_kw: 15.0,
      duration_hours: 2.0,
      target_state: 'idle',
    },
    assumptions: {
      metallurgy_compliance: '15.0 kW minimum quench holding threshold maintained strictly',
      process_integrity: 'Zero impact on heating cycle or billet metallurgy',
    },
    description:
      'Eliminates idle holding drift on FURN-01, returning soaking cycle to exactly rated 15.0 kW baseline while respecting thermal safety interlocks.',
    expectedOutcome:
      'Saves ~24 kWh/day, avoids ₹216/day in electricity charges, and reduces Scope 2 emissions by ~17.2 kg CO₂e.',
  },
  {
    id: 'SCN-PAINT-OPT',
    title: 'Paint Shop Exhaust VFD Optimization',
    subtitle: 'Tune Idle Exhaust Power to 5.0 kW (PAINT-01)',
    category: 'opt',
    action: {
      type: 'reduce_idle_power',
      machine_id: 'PAINT-01',
      target_power_kw: 5.0,
      duration_hours: 2.0,
      target_state: 'idle',
    },
    assumptions: {
      voc_compliance: 'Mandatory 5.0 kW ventilation floor maintained during all shift hours',
      safety_standard: 'OSHA & CPCB industrial VOC exhaust compliance',
    },
    description:
      'Controls spray booth exhaust fan VFD speed during non-painting lunch transitions, reducing idle ventilation power to 5.0 kW while enforcing VOC interlock.',
    expectedOutcome:
      'Saves ~18 kWh/day, avoids ₹162/day electricity charges, and eliminates waste with zero VOC compliance risk.',
  },
  {
    id: 'SCN-VIOLATION-TEST',
    title: 'Safety Interlock & Constraint Test',
    subtitle: 'Attempt Over-Capacity Load (45 kW on 30 kW Asset)',
    category: 'safety',
    action: {
      type: 'reduce_idle_power',
      machine_id: 'COMP-01',
      target_power_kw: 45.0, // EXCEEDS RATED 30 kW!
      duration_hours: 1.0,
    },
    assumptions: {
      test_purpose: 'Verifies Digital Twin interlock blocks unfeasible operator requests before floor damage',
    },
    description:
      'Simulates an erroneous operator input requesting 45 kW on the 30 kW compressor. Tests automated physical safety interlock.',
    expectedOutcome:
      'BLOCKED: Engine rejects the scenario, generates code ERR_POWER_EXCEEDS_RATED, and prevents false savings claims.',
  },
];

export const TRADE_OFF_CANDIDATES = [
  {
    id: 'CAND-1',
    name: 'Candidate 1: Aggressive Minimization',
    strategy: 'Cut FURN-01 to 10 kW holding, reduce COMP-01 pressure to 5.8 bar',
    status: 'BLOCKED' as const,
    statusLabel: 'BLOCKED BY INTERLOCK',
    peakKw: 68.0,
    energyKwhSaved: 68.0,
    costSavedInr: 612.0,
    productionUnits: 140,
    pressureBar: 5.8,
    furnaceKw: 10.0,
    interlocks_triggered: ['ERR_PROTECTED_PROCESS_VIOLATION', 'ERR_PRESSURE_BELOW_MINIMUM'],
    provenance: 'Simulated Engineering Assumption: PrecisionWorks SOP #402',
    diagnostics:
      'Violates furnace metallurgical quench holding floor (≥ 15.0 kW) and drops below CNC-01 / PAINT-01 pneumatic clamp floor (6.5 bar). Part slippage and batch defect risk.',
  },
  {
    id: 'CAND-2',
    name: 'Candidate 2: Naive Night Shift',
    strategy: 'Shift CNC-01 machining by +4 hours into night tariff zone',
    status: 'INFEASIBLE' as const,
    statusLabel: 'INFEASIBLE PRODUCTION',
    peakKw: 74.0,
    energyKwhSaved: 12.0,
    costSavedInr: 340.0,
    productionUnits: 110,
    pressureBar: 7.5,
    furnaceKw: 48.0,
    interlocks_triggered: ['WARN_PRODUCTION_DEFICIT'],
    provenance: 'Simulated Engineering Assumption: PrecisionWorks Shift Quota',
    diagnostics:
      'Achieves low electricity cost, but CNC production output drops to 110 parts (violates daily minimum delivery quota of ≥ 140 parts before morning shift handover).',
  },
  {
    id: 'CAND-3',
    name: 'Candidate 3: Production-Safe Optimum',
    strategy: 'Shift CNC-01 start by +2 hours + 5-min auto-idle cutoff relay on COMP-01',
    status: 'RECOMMENDED' as const,
    statusLabel: 'RECOMMENDED OPTIMUM',
    peakKw: 74.0,
    energyKwhSaved: 30.0,
    costSavedInr: 270.0,
    productionUnits: 148,
    pressureBar: 6.8,
    furnaceKw: 48.0,
    interlocks_triggered: [],
    provenance: 'Simulated Engineering Assumption: PrecisionWorks Benchmark',
    diagnostics:
      'Eliminates 96 kW morning peak spike (shaves to 74 kW, zero penalty). Preserves 148 parts production. Pressure maintained at 6.8 bar (≥ 6.5 bar floor). Saves ₹270/day.',
  },
];
