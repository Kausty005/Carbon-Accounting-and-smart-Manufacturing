import React, { useState, useMemo, useEffect } from 'react';
import {
  Sliders, Play, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert,
  Cpu, Zap, TrendingDown, Layers, FileText, ArrowRight, Gauge,
  Info, Activity, Clock, DollarSign, Leaf, Sparkles, AlertCircle,
  Award, BarChart3, BookmarkCheck, ChevronDown, ChevronUp, Check,
  Target, Compass, CheckSquare, XCircle, ArrowUpRight, HelpCircle,
  Filter, Eye, ShieldCheck
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts';
import type {
  ScenarioRequest,
  SimulationResult,
  ScenarioAction,
  TariffConfig,
  EmissionFactorMetadata,
  TelemetryRecord,
  ScenarioPreset,
  MVLedgerEntry,
} from '../../digitalTwin/types';
import { MACHINE_PROFILES, resolveMachineId } from '../../digitalTwin/twinProfiles';
import { SCENARIO_PRESETS, TRADE_OFF_CANDIDATES } from '../../digitalTwin/presets';
import { runScenarioSimulation } from '../../digitalTwin/scenarioEngine';
import { runPeakDemandOptimizer } from '../../digitalTwin/optimizer';
import { INITIAL_MV_LEDGER, createMVEntryFromSimulation } from '../../digitalTwin/mvLedger';
import { calculateInvestmentCase } from '../../digitalTwin/confidenceEngine';

interface DigitalTwinViewProps {
  baselineRecords: TelemetryRecord[];
  tariffConfig: TariffConfig;
  emissionFactor: EmissionFactorMetadata;
  activeSimulation: SimulationResult;
  onApplySimulation: (result: SimulationResult) => void;
  onSelectMachineIn3D?: (id: string) => void;
  initialMachineId?: string;
}

type AnalyticsTab = 'simulator' | 'tradeoff' | 'investment' | 'ledger';

// ─── Industrial Demo Cases Specification ─────────────────────────────────────
interface IndustrialCase {
  id: string;
  caseNum: string;
  title: string;
  machineId: string;
  machineName: string;
  badge: string;
  tagClass: 'emerald' | 'cyan' | 'amber' | 'red' | 'neutral';
  summary: string;
  targetBenefit: string;
  presetId: string;
  defaultTab: AnalyticsTab;
}

const INDUSTRIAL_CASES: IndustrialCase[] = [
  {
    id: 'case-1-idle',
    caseNum: 'CASE 1',
    title: 'Compressor Idle Bleed',
    machineId: 'COMP-01',
    machineName: 'Air Compressor (ELGi)',
    badge: 'ANOMALY REPAIR',
    tagClass: 'emerald',
    summary: 'Auto-cutoff 18 kW unloaded draw during 3-hour shift transition and lunch break',
    targetBenefit: 'Saves 30 kWh/d · ₹270/d',
    presetId: 'SCN-IDLE-FIX',
    defaultTab: 'simulator',
  },
  {
    id: 'case-2-peak',
    caseNum: 'CASE 2',
    title: 'Coincident Peak Shaving',
    machineId: 'CNC-01',
    machineName: 'CNC Machining Center',
    badge: 'PEAK DECONFLICT',
    tagClass: 'cyan',
    summary: 'Stagger CNC start by +2 hours to eliminate coincident morning furnace spike',
    targetBenefit: 'Shaves 22 kW · Below 85 kW',
    presetId: 'SCN-PEAK-SHIFT',
    defaultTab: 'simulator',
  },
  {
    id: 'case-3-pressure',
    caseNum: 'CASE 3',
    title: 'Pneumatic Header Setpoint',
    machineId: 'COMP-01',
    machineName: 'Air Compressor (ELGi)',
    badge: 'EFFICIENCY',
    tagClass: 'emerald',
    summary: 'Tune discharge pressure from 7.5 to 6.8 bar while respecting 6.5 bar clamp floor',
    targetBenefit: '-7.0% Air Power',
    presetId: 'SCN-PRESSURE-OPT',
    defaultTab: 'tradeoff',
  },
  {
    id: 'case-4-furnace',
    caseNum: 'CASE 4',
    title: 'Furnace Soaking Standby Setback',
    machineId: 'FURN-01',
    machineName: 'Heat-Treatment Furnace',
    badge: 'THERMAL OPT',
    tagClass: 'amber',
    summary: 'Maintain 15 kW quench holding floor while eliminating thermal drift during standby',
    targetBenefit: 'Saves 24 kWh/d · ₹216/d',
    presetId: 'SCN-FURNACE-OPT',
    defaultTab: 'simulator',
  },
  {
    id: 'case-5-paint',
    caseNum: 'CASE 5',
    title: 'Paint Shop Exhaust VFD',
    machineId: 'PAINT-01',
    machineName: 'Paint Booth & Exhaust Fan',
    badge: 'AIRFLOW VFD',
    tagClass: 'cyan',
    summary: 'Modulate ventilation exhaust VFD during non-spraying intervals while keeping 5 kW VOC safety minimum',
    targetBenefit: 'Saves 18 kWh/d · ₹162/d',
    presetId: 'SCN-PAINT-OPT',
    defaultTab: 'simulator',
  },
  {
    id: 'case-6-safety',
    caseNum: 'CASE 6',
    title: 'Production Safety Interlock',
    machineId: 'FURN-01',
    machineName: 'Heat-Treatment Furnace',
    badge: 'SAFETY GUARDRAIL',
    tagClass: 'red',
    summary: 'Demonstrates active interlock blocking an unsafe 10 kW cut violating 15 kW quench',
    targetBenefit: 'BLOCKED BY INTERLOCK',
    presetId: 'SCN-VIOLATION-TEST',
    defaultTab: 'tradeoff',
  },
];

// ─── 4-Step Hackathon Demo Pipeline ──────────────────────────────────────────
interface DemoStep {
  stepNum: number;
  label: string;
  ideaTag: string;
  caseId: string;
  tab: AnalyticsTab;
  pitchScript: string;
}

const DEMO_PIPELINE: DemoStep[] = [
  {
    stepNum: 1,
    label: '1. Anomaly Baseline',
    ideaTag: 'Problem Discovery',
    caseId: 'case-1-idle',
    tab: 'simulator',
    pitchScript: 'Point out to Judges: Look at the orange dashed line between 11:00 and 14:00. Compressor COMP-01 draws 18 kW unloaded power while machines are idle for lunch. That is pure waste costing ₹270 daily.',
  },
  {
    stepNum: 2,
    label: '2. Epistemic Humility',
    ideaTag: 'Idea A: Sensor VOI',
    caseId: 'case-1-idle',
    tab: 'investment',
    pitchScript: 'Explain Idea A: A submeter alone cannot tell if the 18 kW is an air leak or timer blow-off. Toggle "Simulate Adding Flowmeter" to resolve ambiguity and justify ₹37k Capex with a 6.9-month payback.',
  },
  {
    stepNum: 3,
    label: '3. Safe Interlocks',
    ideaTag: 'Idea C: Safe Trade-Offs',
    caseId: 'case-6-safety',
    tab: 'tradeoff',
    pitchScript: 'Explain Idea C: Traditional AI blindly suggests cutting furnace power to 10 kW. Our Digital Twin BLOCKS Candidate 1 to protect the furnace from metallurgical quench failure, recommending Candidate 3 instead.',
  },
  {
    stepNum: 4,
    label: '4. Counterfactual M&V',
    ideaTag: 'Idea B: IPMVP Ledger',
    caseId: 'case-1-idle',
    tab: 'ledger',
    pitchScript: 'Explain Idea B: Solves the post-mod blame game! Out of -185 kWh measured drop, the twin proves -170.57 kWh was just lower production (122 vs 140 parts), and -14.43 kWh was genuine verified efficiency (100% matched!).',
  },
];

// ─── Machine Intelligence & Dynamic Recommendation Matrix ───────────────────
interface MachineIntelligenceData {
  machineId: string;
  name: string;
  category: string;
  color: string;
  anomalyTitle: string;
  severity: 'anomaly' | 'peak' | 'thermal' | 'airflow' | 'safety' | 'plant';
  telemetryObservation: string;
  rootCausePhysics: string;
  recommendedAction: string;
  targetKwhSavingsDay: number;
  targetCostSavingsDay: number;
  targetCarbonKgDay: number;
  capexEstimateInr: number;
  paybackPeriodMonths: number;
  safetyInterlockContract: string;
  complianceStandard: string;
  quickPresets: {
    label: string;
    description: string;
    actionType: ScenarioAction['type'];
    targetPowerKw?: number;
    offsetHours?: number;
    targetPressureBar?: number;
    durationHours?: number;
    isPrimary?: boolean;
    isSafetyTest?: boolean;
  }[];
}

const MACHINE_INTELLIGENCE: Record<string, MachineIntelligenceData> = {
  'COMP-01': {
    machineId: 'COMP-01',
    name: 'Air Compressor (ELGi EN 45)',
    category: 'PNEUMATIC & UTILITY INFRASTRUCTURE',
    color: '#F59E0B',
    anomalyTitle: '18.0 kW Unloaded Idle Bleed (Hours 11:00–14:00)',
    severity: 'anomaly',
    telemetryObservation:
      'Sensor telemetry captures 18.0 kW continuous draw during shift transitions (11:00–14:00) with 0.0 CFM plant air consumption. Compressor idles unloaded rather than auto-cutting off.',
    rootCausePhysics:
      'Missing 5-minute auto-cutoff timer relay or sticking blow-down unloader solenoid valve. Motor continues consuming power against unloader backpressure.',
    recommendedAction:
      'Install 5-min timer auto-cutoff relay or tune unloader solenoid to restore 8.0 kW idle level. In parallel, tune header pressure from 7.5 to 6.8 bar (1% kW saving per 0.1 bar drop).',
    targetKwhSavingsDay: 30.0,
    targetCostSavingsDay: 270.0,
    targetCarbonKgDay: 24.6,
    capexEstimateInr: 25000,
    paybackPeriodMonths: 2.1,
    safetyInterlockContract:
      'Pneumatic ring main clamp floor >= 6.5 bar strictly enforced by Digital Twin. Pressure requests below 6.5 bar are rejected.',
    complianceStandard: 'ISO 1217 Annex C & CAGI Compressed Air Standard',
    quickPresets: [
      {
        label: 'Auto-Cutoff Relay (8.0 kW)',
        description: 'Eliminate 10 kW unloaded idle bleed during lunch break (Saves 30 kWh/d)',
        actionType: 'reduce_idle_power',
        targetPowerKw: 8.0,
        durationHours: 3.0,
        isPrimary: true,
      },
      {
        label: 'Header Pressure (6.8 bar)',
        description: 'Lower discharge pressure setpoint while retaining 0.3 bar safety margin',
        actionType: 'pressure_optimization',
        targetPressureBar: 6.8,
      },
      {
        label: 'Test Low Pressure (5.8 bar)',
        description: 'Simulate unsafe pressure drop (triggers clamp failure warning)',
        actionType: 'pressure_optimization',
        targetPressureBar: 5.8,
        isSafetyTest: true,
      },
    ],
  },
  'CNC-01': {
    machineId: 'CNC-01',
    name: 'CNC Machining Center (NLX-2500)',
    category: 'PRECISION SUBTRACTIVE MACHINING',
    color: '#0284C7',
    anomalyTitle: 'Coincident Morning Peak Demand Spike (98.0 kW Over-Limit)',
    severity: 'peak',
    telemetryObservation:
      'Spindle & servo power ramp (22.0 kW) at 08:00 directly overlaps with morning furnace preheating (48.0 kW) and compressor base load, spiking plant demand to 98.0 kW (exceeding 85 kW contract limit).',
    rootCausePhysics:
      'Rigid simultaneous start-up schedules without cross-cell coordination, causing simultaneous peak coincidence penalties under ToD tariffs.',
    recommendedAction:
      'Stagger CNC production shift start by +2 hours (from 08:00 to 10:00). Existing CNC batch buffer inventory absorbs the schedule offset with zero delivery delay.',
    targetKwhSavingsDay: 22.0,
    targetCostSavingsDay: 400.0,
    targetCarbonKgDay: 18.0,
    capexEstimateInr: 0,
    paybackPeriodMonths: 0.0,
    safetyInterlockContract:
      'Daily production quota of >= 140 parts enforced. The +2h shift produces 148 parts (compliant), while +4h shifts trigger production warnings.',
    complianceStandard: 'ISO 50001:2018 Clause 6.3 & Peak Shaving Standard',
    quickPresets: [
      {
        label: '+2h Schedule Stagger (Optimal)',
        description: 'De-conflict from furnace ramp-up; shaves peak to 74 kW (below 85 kW limit)',
        actionType: 'shift_schedule',
        offsetHours: 2,
        isPrimary: true,
      },
      {
        label: '+4h Night Shift (Test Quota)',
        description: 'Simulates excessive shift triggering WARN_PRODUCTION_DEFICIT (110 < 140 units)',
        actionType: 'shift_schedule',
        offsetHours: 4,
        isSafetyTest: true,
      },
      {
        label: '0h Baseline (Coincident 98 kW)',
        description: 'Restore uncoordinated 08:00 start (causes contract penalty exceedance)',
        actionType: 'shift_schedule',
        offsetHours: 0,
      },
    ],
  },
  'FURN-01': {
    machineId: 'FURN-01',
    name: 'Heat-Treatment Furnace (IF-85)',
    category: 'THERMAL METALLURGY & HEAT TREATMENT',
    color: '#EF4444',
    anomalyTitle: 'Standby Soaking Setback Drift (18.5 kW vs 15.0 kW Floor)',
    severity: 'thermal',
    telemetryObservation:
      'During 10:00–14:00 billet wait times, furnace holding power creeps to 18.5 kW (3.5 kW above 15.0 kW rated holding floor). High thermal mass creates steady energy drain.',
    rootCausePhysics:
      'Standby temperature controller deadband drift and lack of optimized soaking setback schedule during non-melting intervals.',
    recommendedAction:
      'Regulate standby element holding power to exactly 15.0 kW quench floor. CRITICAL INTERLOCK: Digital Twin strictly rejects any cut below 15.0 kW to prevent billet metallurgical quench failure.',
    targetKwhSavingsDay: 24.0,
    targetCostSavingsDay: 216.0,
    targetCarbonKgDay: 17.2,
    capexEstimateInr: 12000,
    paybackPeriodMonths: 1.8,
    safetyInterlockContract:
      'CRITICAL SAFETY INTERLOCK: Minimum holding threshold strictly >= 15.0 kW. Any cut below 15 kW triggers ERR_PROTECTED_PROCESS_VIOLATION and is blocked.',
    complianceStandard: 'CQI-9 Heat Treat Assessment & Metallurgical Standards',
    quickPresets: [
      {
        label: '15.0 kW Quench Floor (Safe Setback)',
        description: 'Eliminate 3.5 kW drift while strictly respecting metallurgical quench floor',
        actionType: 'reduce_idle_power',
        targetPowerKw: 15.0,
        durationHours: 2.0,
        isPrimary: true,
      },
      {
        label: 'Test 10.0 kW Cut (Safety Interlock)',
        description: 'Simulate unsafe power cut rejected by Digital Twin interlock (metallurgy protection)',
        actionType: 'reduce_idle_power',
        targetPowerKw: 10.0,
        durationHours: 2.0,
        isSafetyTest: true,
      },
      {
        label: '18.5 kW Drift (Baseline)',
        description: 'Reset to un-optimized standby holding with thermal drift',
        actionType: 'reduce_idle_power',
        targetPowerKw: 18.5,
        durationHours: 2.0,
      },
    ],
  },
  'PAINT-01': {
    machineId: 'PAINT-01',
    name: 'Paint Booth & Exhaust Fan (PL-20)',
    category: 'FINISHING & ENVIRONMENTAL VENTILATION',
    color: '#10B981',
    anomalyTitle: 'Unmodulated Exhaust Fan Overdraw (18.0 kW Constant)',
    severity: 'airflow',
    telemetryObservation:
      'Ventilation exhaust fan runs continuously at 100% capacity (18.0 kW) during the entire 09:00–17:00 shift, including operator lunch (12:00–14:00) when spray guns are idle.',
    rootCausePhysics:
      'Fixed-speed exhaust fan without VFD frequency modulation or spray-gun air pressure sensing interlock.',
    recommendedAction:
      'Modulate exhaust fan VFD speed during non-spraying intervals (12:00–14:00), reducing power to 5.0 kW while enforcing VOC dilution safety floor.',
    targetKwhSavingsDay: 18.0,
    targetCostSavingsDay: 162.0,
    targetCarbonKgDay: 14.4,
    capexEstimateInr: 18000,
    paybackPeriodMonths: 3.7,
    safetyInterlockContract:
      'Mandatory minimum exhaust ventilation floor: >= 5.0 kW during all production hours (CPCB & OSHA 1910.107 VOC dilution interlock).',
    complianceStandard: 'OSHA 1910.107 Spray Finishing & CPCB Environmental Norms',
    quickPresets: [
      {
        label: '5.0 kW VFD Modulated Idle (Safe)',
        description: 'Trim ventilation power during lunch while preserving VOC dilution compliance',
        actionType: 'reduce_idle_power',
        targetPowerKw: 5.0,
        durationHours: 2.0,
        isPrimary: true,
      },
      {
        label: 'Test 3.0 kW Cut (VOC Alarm)',
        description: 'Simulate unsafe exhaust cut below 5 kW minimum (triggers VOC safety violation)',
        actionType: 'reduce_idle_power',
        targetPowerKw: 3.0,
        durationHours: 2.0,
        isSafetyTest: true,
      },
      {
        label: '18.0 kW Continuous (Baseline)',
        description: 'Reset to unmodulated 100% exhaust fan draw',
        actionType: 'reduce_idle_power',
        targetPowerKw: 18.0,
        durationHours: 2.0,
      },
    ],
  },
  'ALL': {
    machineId: 'ALL',
    name: 'Entire Plant (PrecisionWorks Mfg)',
    category: 'FACILITY-WIDE DEMAND & TARIFF OPTIMIZATION',
    color: '#0284C7',
    anomalyTitle: 'Plant-Wide Coordinated Multi-Asset Optimization',
    severity: 'plant',
    telemetryObservation:
      'Morning peak at 08:00 reaches 98.0 kW (violating 85 kW limit). Cumulative idle losses across Compressor (18 kW bleed) and Paint Exhaust (18 kW continuous) add 48 kWh/d avoidable waste.',
    rootCausePhysics:
      'Unsynchronized cell operations without centralized energy supervision and interlock coordination.',
    recommendedAction:
      'Apply comprehensive multi-lever dispatch: +2h CNC schedule stagger, 8.0 kW compressor cutoff relay, 6.8 bar pressure tuning, 15.0 kW furnace quench hold, and 5.0 kW paint VFD modulation.',
    targetKwhSavingsDay: 72.0,
    targetCostSavingsDay: 648.0,
    targetCarbonKgDay: 57.6,
    capexEstimateInr: 55000,
    paybackPeriodMonths: 2.8,
    safetyInterlockContract:
      'All equipment guardrails simultaneously active: >= 6.5 bar pressure floor, >= 15 kW quench, >= 5 kW VOC, >= 140 parts quota.',
    complianceStandard: 'ISO 50001:2018 Energy Management Systems & IPMVP Option B',
    quickPresets: [
      {
        label: 'Multi-Asset Overhaul (Optimal)',
        description: 'Idle cutoffs + +2h CNC shift + 6.8 bar pressure tuning (Plant peak 74 kW)',
        actionType: 'reduce_idle_power',
        targetPowerKw: 8.0,
        durationHours: 3.0,
        isPrimary: true,
      },
      {
        label: 'Auto-Stagger Peak Optimizer',
        description: 'Run algorithmic scheduling search across start-time offsets',
        actionType: 'shift_schedule',
        offsetHours: 2,
      },
      {
        label: 'Reset Entire Plant to Baseline',
        description: 'Restore un-modified factory baseline conditions',
        actionType: 'shift_schedule',
        offsetHours: 0,
      },
    ],
  },
};

export default function DigitalTwinView({
  baselineRecords,
  tariffConfig,
  emissionFactor,
  activeSimulation,
  onApplySimulation,
  onSelectMachineIn3D,
  initialMachineId,
}: DigitalTwinViewProps) {
  // Case & preset selection
  const [activeCaseId, setActiveCaseId] = useState<string>('case-1-idle');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('SCN-IDLE-FIX');

  // Custom action state & View Scope Filter
  const [selectedMachineId, setSelectedMachineId] = useState<string>('COMP-01');
  const [chartScope, setChartScope] = useState<'ALL' | 'COMP-01' | 'CNC-01' | 'FURN-01' | 'PAINT-01'>('ALL');
  const [actionType, setActionType] = useState<ScenarioAction['type']>('reduce_idle_power');
  const [targetPowerKw, setTargetPowerKw] = useState<number>(8.0);
  const [durationHours, setDurationHours] = useState<number>(3.0);
  const [offsetHours, setOffsetHours] = useState<number>(2);
  const [targetPressureBar, setTargetPressureBar] = useState<number>(6.8);

  // Switch target machine asset and auto-configure relevant scenario & chart view
  const handleSwitchMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    setChartScope(machineId as any);

    let newActionType: ScenarioAction['type'] = 'reduce_idle_power';
    let newTargetPower = 8.0;
    let newDuration = 3.0;
    let newOffset = 2;
    let newPressure = 6.8;
    let newCaseId = 'case-1-idle';
    let newPresetId = 'SCN-IDLE-FIX';

    if (machineId === 'COMP-01') {
      newActionType = 'reduce_idle_power';
      newTargetPower = 8.0;
      newDuration = 3.0;
      newPressure = 6.8;
      newCaseId = 'case-1-idle';
      newPresetId = 'SCN-IDLE-FIX';
    } else if (machineId === 'CNC-01') {
      newActionType = 'shift_schedule';
      newOffset = 2;
      newTargetPower = 3.0;
      newDuration = 2.0;
      newCaseId = 'case-2-peak';
      newPresetId = 'SCN-PEAK-SHIFT';
    } else if (machineId === 'FURN-01') {
      newActionType = 'reduce_idle_power';
      newTargetPower = 15.0; // quench holding floor
      newDuration = 2.0;
      newCaseId = 'case-4-furnace';
      newPresetId = 'SCN-FURNACE-OPT';
    } else if (machineId === 'PAINT-01') {
      newActionType = 'reduce_idle_power';
      newTargetPower = 5.0; // VFD floor
      newDuration = 2.0;
      newCaseId = 'case-5-paint';
      newPresetId = 'SCN-PAINT-OPT';
    }

    setActionType(newActionType);
    setTargetPowerKw(newTargetPower);
    setDurationHours(newDuration);
    setOffsetHours(newOffset);
    setTargetPressureBar(newPressure);
    setActiveCaseId(newCaseId);
    setSelectedPresetId(newPresetId);

    const preset = SCENARIO_PRESETS.find(p => p.id === newPresetId);
    if (preset) {
      const req: ScenarioRequest = {
        scenario_id: preset.id,
        action: preset.action,
        assumptions: preset.assumptions,
      };
      const res = runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor);
      setCurrentResult(res);
    }
  };

  // Live interactive simulation runner on slider changes
  const runInteractiveSimulation = (overrides?: Partial<ScenarioAction>) => {
    const finalActionType = overrides?.type ?? actionType;
    const finalTargetPower = overrides?.target_power_kw ?? targetPowerKw;
    const finalDuration = overrides?.duration_hours ?? durationHours;
    const finalOffset = overrides?.offset_hours ?? offsetHours;
    const finalPressure = overrides?.target_pressure_bar ?? targetPressureBar;
    const targetMid = overrides?.machine_id ?? selectedMachineId;

    const currentAction: ScenarioAction = {
      type: finalActionType,
      machine_id: targetMid,
      ambient_temp_c: ambientTempC,
      relative_humidity_pct: relativeHumidityPct,
      sensor_quality: sensorQuality,
      shift_pattern: shiftPattern,
      ...overrides,
    };

    if (finalActionType === 'reduce_idle_power') {
      currentAction.type = 'reduce_idle_power';
      currentAction.target_power_kw = finalTargetPower;
      currentAction.duration_hours = finalDuration;
      currentAction.target_state = 'idle';
      const prof = MACHINE_PROFILES[targetMid];
      const rated = prof?.rated_power_kw || 30;
      currentAction.target_load_factor = Number((finalTargetPower / rated).toFixed(3));
    } else if (finalActionType === 'shift_schedule') {
      currentAction.type = 'shift_schedule';
      currentAction.offset_hours = finalOffset;
    } else if (finalActionType === 'pressure_optimization') {
      currentAction.type = 'pressure_optimization';
      currentAction.baseline_pressure_bar = 7.5;
      currentAction.target_pressure_bar = finalPressure;
    } else if (finalActionType === 'reduce_runtime') {
      currentAction.type = 'reduce_runtime';
      currentAction.duration_hours = finalDuration;
    }

    const req: ScenarioRequest = {
      scenario_id: `LIVE-${targetMid}-${Date.now().toString().slice(-4)}`,
      action: currentAction,
      assumptions: {
        source: 'interactive_what_if_slider',
        requires_operator_approval: true,
      },
    };

    const res = runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor);
    setCurrentResult(res);
    setSelectedPresetId('custom');
    setActiveCaseId('custom');
  };

  // Quick preset runner
  const handleApplyQuickPreset = (preset: MachineIntelligenceData['quickPresets'][0], machineId?: string) => {
    const targetMid = machineId || selectedMachineId;
    setSelectedMachineId(targetMid);
    setChartScope(targetMid as any);
    setActionType(preset.actionType);

    if (typeof preset.targetPowerKw === 'number') {
      setTargetPowerKw(preset.targetPowerKw);
    }
    if (typeof preset.durationHours === 'number') {
      setDurationHours(preset.durationHours);
    }
    if (typeof preset.offsetHours === 'number') {
      setOffsetHours(preset.offsetHours);
    }
    if (typeof preset.targetPressureBar === 'number') {
      setTargetPressureBar(preset.targetPressureBar);
    }

    runInteractiveSimulation({
      machine_id: targetMid,
      type: preset.actionType,
      target_power_kw: preset.targetPowerKw,
      duration_hours: preset.durationHours,
      offset_hours: preset.offsetHours,
      target_pressure_bar: preset.targetPressureBar,
    });
  };

  // Spreadsheet Finalized Input Parameters
  const [ambientTempC, setAmbientTempC] = useState<number>(24.0);
  const [relativeHumidityPct, setRelativeHumidityPct] = useState<number>(60.0);
  const [sensorQuality, setSensorQuality] = useState<'good' | 'missing' | 'suspect'>('good');
  const [shiftPattern, setShiftPattern] = useState<'day_shift' | '2_shift' | '3_shift'>('3_shift');
  const [showAdvancedClimate, setShowAdvancedClimate] = useState<boolean>(false);

  // Idea A: Self-Qualifying Sensor Sufficiency Gate toggle
  const [hasFlowMeter, setHasFlowMeter] = useState<boolean>(false);

  // Active simulation in the view
  const [currentResult, setCurrentResult] = useState<SimulationResult>(activeSimulation);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [showMethodologyDrawer, setShowMethodologyDrawer] = useState<boolean>(false);

  // Right column tab: 'simulator' | 'tradeoff' | 'investment' | 'ledger'
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('simulator');

  // Guided Demo Pipeline State
  const [activeDemoStep, setActiveDemoStep] = useState<number | null>(null);
  const [showDemoPipeline, setShowDemoPipeline] = useState<boolean>(false);
  const [showCaseSelector, setShowCaseSelector] = useState<boolean>(true);

  // Verified Savings Ledger State
  const [mvLedger, setMvLedger] = useState<MVLedgerEntry[]>(INITIAL_MV_LEDGER);
  const [committedFeedback, setCommittedFeedback] = useState<string | null>(null);

  const selectedProfile = MACHINE_PROFILES[selectedMachineId] || MACHINE_PROFILES['COMP-01'];

  // Handle Case Selection
  const handleSelectCase = (c: IndustrialCase) => {
    setActiveCaseId(c.id);
    setSelectedPresetId(c.presetId);
    setSelectedMachineId(c.machineId);
    setChartScope(c.machineId as any);

    const preset = SCENARIO_PRESETS.find(p => p.id === c.presetId);
    if (preset) {
      setActionType(preset.action.type);
      if (typeof preset.action.target_power_kw === 'number') {
        setTargetPowerKw(preset.action.target_power_kw);
      }
      if (typeof preset.action.duration_hours === 'number') {
        setDurationHours(preset.action.duration_hours);
      }
      if (typeof preset.action.offset_hours === 'number') {
        setOffsetHours(preset.action.offset_hours);
      }
      if (typeof preset.action.target_pressure_bar === 'number') {
        setTargetPressureBar(preset.action.target_pressure_bar);
      }

      const req: ScenarioRequest = {
        scenario_id: preset.id,
        action: preset.action,
        assumptions: preset.assumptions,
      };
      const res = runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor);
      setCurrentResult(res);
    }
    setAnalyticsTab(c.defaultTab);
  };

  useEffect(() => {
    if (initialMachineId) {
      const resolved = resolveMachineId(initialMachineId);
      if (MACHINE_PROFILES[resolved]) {
        setSelectedMachineId(resolved);
        const matchedCase = INDUSTRIAL_CASES.find(c => c.machineId === resolved);
        if (matchedCase) {
          handleSelectCase(matchedCase);
        }
      }
    }
  }, [initialMachineId]);

  // Handle Demo Pipeline Step Click
  const handleDemoStepClick = (step: DemoStep) => {
    setActiveDemoStep(step.stepNum);
    const targetCase = INDUSTRIAL_CASES.find(c => c.id === step.caseId);
    if (targetCase) {
      handleSelectCase(targetCase);
    }
    setAnalyticsTab(step.tab);
  };

  // Run custom simulation
  const handleRunSimulation = () => {
    let action: ScenarioAction = {
      type: actionType,
      machine_id: selectedMachineId,
    };

    if (actionType === 'reduce_idle_power') {
      action = {
        type: 'reduce_idle_power',
        machine_id: selectedMachineId,
        target_power_kw: targetPowerKw,
        duration_hours: durationHours,
        target_state: 'idle',
        target_load_factor: Number((targetPowerKw / selectedProfile.rated_power_kw).toFixed(3)),
      };
    } else if (actionType === 'shift_schedule') {
      action = {
        type: 'shift_schedule',
        machine_id: selectedMachineId,
        offset_hours: offsetHours,
      };
    } else if (actionType === 'pressure_optimization') {
      action = {
        type: 'pressure_optimization',
        machine_id: selectedMachineId,
        baseline_pressure_bar: 7.5,
        target_pressure_bar: targetPressureBar,
      };
    } else if (actionType === 'reduce_runtime') {
      action = {
        type: 'reduce_runtime',
        machine_id: selectedMachineId,
        duration_hours: durationHours,
      };
    }

    action.ambient_temp_c = ambientTempC;
    action.relative_humidity_pct = relativeHumidityPct;
    action.sensor_quality = sensorQuality;
    action.shift_pattern = shiftPattern;

    const req: ScenarioRequest = {
      scenario_id: `CUSTOM-${selectedMachineId}-${Date.now().toString().slice(-4)}`,
      action,
      assumptions: {
        source: 'user_configured_simulation',
        requires_operator_approval: true,
      },
    };

    const res = runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor);
    setCurrentResult(res);
    setSelectedPresetId('custom');
    setActiveCaseId('custom');
  };

  // Reset to Baseline
  const handleResetToBaseline = () => {
    setSelectedPresetId('baseline');
    setActiveCaseId('custom');
    setActiveDemoStep(null);
    const req: ScenarioRequest = {
      scenario_id: 'BASELINE-RESET',
      action: {
        type: 'shift_schedule',
        machine_id: 'COMP-01',
        offset_hours: 0,
      },
    };
    const res = runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor);
    setCurrentResult(res);
  };

  // Run Peak Demand Optimizer
  const handleRunOptimizer = () => {
    setIsOptimizing(true);
    setTimeout(() => {
      const opt = runPeakDemandOptimizer(baselineRecords, tariffConfig, emissionFactor);
      setCurrentResult(opt.bestScenario);
      setSelectedPresetId('opt-algo');
      setActiveCaseId('case-2-peak');
      setAnalyticsTab('simulator');
      setIsOptimizing(false);
    }, 250);
  };

  // Commit current scenario to IPMVP Verified Savings Ledger
  const handleCommitToLedger = () => {
    if (currentResult.feasibility === 'blocked') return;
    const newEntry = createMVEntryFromSimulation(currentResult);
    setMvLedger(prev => [newEntry, ...prev]);
    setCommittedFeedback(`Scenario ${currentResult.scenario_id} committed to IPMVP Ledger!`);
    setTimeout(() => setCommittedFeedback(null), 3000);
    setAnalyticsTab('ledger');
  };

  // Apply candidate from Trade-off Matrix
  const handleApplyCandidate = (candId: string) => {
    if (candId === 'CAND-1') {
      const req: ScenarioRequest = {
        scenario_id: 'CAND-1-AGGRESSIVE',
        action: {
          type: 'reduce_idle_power',
          machine_id: 'FURN-01',
          target_power_kw: 10.0,
        },
      };
      setCurrentResult(runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor));
      setSelectedPresetId('cand-1');
      setActiveCaseId('case-4-safety');
    } else if (candId === 'CAND-2') {
      const req: ScenarioRequest = {
        scenario_id: 'CAND-2-NAIVE-SHIFT',
        action: {
          type: 'shift_schedule',
          machine_id: 'CNC-01',
          offset_hours: 4,
        },
      };
      setCurrentResult(runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor));
      setSelectedPresetId('cand-2');
    } else if (candId === 'CAND-3') {
      const req: ScenarioRequest = {
        scenario_id: 'CAND-3-SAFE-OPTIMUM',
        action: {
          type: 'shift_schedule',
          machine_id: 'CNC-01',
          offset_hours: 2,
        },
      };
      setCurrentResult(runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor));
      setSelectedPresetId('cand-3');
      setActiveCaseId('case-2-peak');
    }
  };

  // Chart data calculation with machine-isolated baseline & simulated profiles
  const chartData = useMemo(() => {
    const baseHourly = currentResult.baseline.hourly_plant || [];
    const scenHourly = currentResult.scenario.hourly_plant || [];

    return baseHourly.map((b, i) => {
      const s = scenHourly[i] || b;
      const hour = b.hour ?? (i % 24);
      const label = b.label || `${String(hour).padStart(2, '0')}:00`;

      // Machine baseline curves
      const compBase = b.machines?.['COMP-01'] ?? (hour >= 7 && hour < 21 ? (hour >= 11 && hour <= 13 ? 18.0 : 28.0) : 8.0);
      const cncBase = b.machines?.['CNC-01'] ?? (hour >= 8 && hour < 20 ? (hour === 13 ? 3.0 : 22.0) : 0.8);
      const furnBase = b.machines?.['FURN-01'] ?? ((hour >= 6 && hour < 10) || (hour >= 14 && hour < 18) ? 48.0 : (hour >= 10 && hour < 14 ? 18.5 : 2.0));
      const paintBase = b.machines?.['PAINT-01'] ?? (hour >= 9 && hour < 17 ? 18.0 : (hour >= 17 && hour < 19 ? 5.0 : 0.5));

      // Machine simulated curves from simulation result
      let compScen = s.machines?.['COMP-01'] ?? compBase;
      let cncScen = s.machines?.['CNC-01'] ?? cncBase;
      let furnScen = s.machines?.['FURN-01'] ?? furnBase;
      let paintScen = s.machines?.['PAINT-01'] ?? paintBase;

      // Select active curve depending on chartScope
      let activeBaselineKw = Number((b.kw ?? 0).toFixed(1));
      let activeScenarioKw = Number((s.kw ?? 0).toFixed(1));

      if (chartScope === 'COMP-01') {
        activeBaselineKw = Number(compBase.toFixed(1));
        activeScenarioKw = Number(compScen.toFixed(1));
      } else if (chartScope === 'CNC-01') {
        activeBaselineKw = Number(cncBase.toFixed(1));
        activeScenarioKw = Number(cncScen.toFixed(1));
      } else if (chartScope === 'FURN-01') {
        activeBaselineKw = Number(furnBase.toFixed(1));
        activeScenarioKw = Number(furnScen.toFixed(1));
      } else if (chartScope === 'PAINT-01') {
        activeBaselineKw = Number(paintBase.toFixed(1));
        activeScenarioKw = Number(paintScen.toFixed(1));
      }

      return {
        hour,
        label,
        baselineKw: activeBaselineKw,
        scenarioKw: activeScenarioKw,
        plantBaselineKw: Number((b.kw ?? 0).toFixed(1)),
        plantScenarioKw: Number((s.kw ?? 0).toFixed(1)),
        compBase: Number(compBase.toFixed(1)),
        compScen: Number(compScen.toFixed(1)),
        cncBase: Number(cncBase.toFixed(1)),
        cncScen: Number(cncScen.toFixed(1)),
        furnBase: Number(furnBase.toFixed(1)),
        furnScen: Number(furnScen.toFixed(1)),
        paintBase: Number(paintBase.toFixed(1)),
        paintScen: Number(paintScen.toFixed(1)),
        compressor: Number(compScen.toFixed(1)),
        cnc: Number(cncScen.toFixed(1)),
        furnace: Number(furnScen.toFixed(1)),
        paint: Number(paintScen.toFixed(1)),
      };
    });
  }, [currentResult, chartScope]);

  // Contextual Scope Metrics for the selected scope filter
  const scopeMetrics = useMemo(() => {
    let baseKwh = 0;
    let scenKwh = 0;
    let maxKw = 0;

    for (const d of chartData) {
      baseKwh += d.baselineKw;
      scenKwh += d.scenarioKw;
      if (d.scenarioKw > maxKw) maxKw = d.scenarioKw;
    }

    const deltaKwh = scenKwh - baseKwh;
    const pctReduction = baseKwh > 0 ? (Math.abs(deltaKwh) / baseKwh) * 100 : 0;
    const rate = tariffConfig.energy_rate_inr_per_kwh || 9.0;
    const costSavedInr = Math.abs(deltaKwh) * rate;
    const ef = emissionFactor?.kg_co2e_per_kwh || 0.82;
    const carbonSavedKg = Math.abs(deltaKwh) * ef;

    return {
      baseKwh: Number(baseKwh.toFixed(1)),
      scenKwh: Number(scenKwh.toFixed(1)),
      deltaKwh: Number(deltaKwh.toFixed(1)),
      pctReduction: Number(pctReduction.toFixed(1)),
      costSavedInr: Number(costSavedInr.toFixed(0)),
      carbonSavedKg: Number(carbonSavedKg.toFixed(1)),
      maxKw: Number(maxKw.toFixed(1)),
    };
  }, [chartData, tariffConfig, emissionFactor]);

  // Active intelligence data for recommendation cards
  const activeIntel = MACHINE_INTELLIGENCE[chartScope !== 'ALL' ? chartScope : selectedMachineId] || MACHINE_INTELLIGENCE['ALL'];
  const activeMachineIntel = MACHINE_INTELLIGENCE[selectedMachineId] || MACHINE_INTELLIGENCE['COMP-01'];

  // Dynamic Investment Case based on Sensor Sufficiency toggle (Idea A)
  const inv = useMemo(() => {
    return calculateInvestmentCase(
      currentResult,
      { ...currentResult.action_executed, sensor_quality: sensorQuality },
      hasFlowMeter || sensorQuality === 'good'
    );
  }, [currentResult, hasFlowMeter, sensorQuality]);

  const activeCase = INDUSTRIAL_CASES.find(c => c.id === activeCaseId);
  const isBaselineState = selectedPresetId === 'baseline' || (currentResult.deltas.energy_kwh === 0 && currentResult.deltas.cost_inr === 0);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 28px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ─── 1. Calm, Premium Digital Twin Header ───────────────────────── */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(2, 132, 199, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sliders size={18} color="#0284C7" />
              </div>
              <h1 style={{
                fontSize: 20,
                fontWeight: 700,
                color: '#1C1917',
                letterSpacing: '-0.02em',
                margin: 0
              }}>
                Digital Twin
              </h1>

              {/* Status Badge */}
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 9px',
                borderRadius: 9999,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isBaselineState
                  ? '#F5F5F4'
                  : currentResult.feasibility === 'feasible'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : currentResult.feasibility === 'review_required'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(239, 68, 68, 0.12)',
                color: isBaselineState
                  ? '#57534E'
                  : currentResult.feasibility === 'feasible'
                  ? '#059669'
                  : currentResult.feasibility === 'review_required'
                  ? '#D97706'
                  : '#DC2626',
                border: isBaselineState
                  ? '1px solid #EAE3D7'
                  : currentResult.feasibility === 'feasible'
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : currentResult.feasibility === 'review_required'
                  ? '1px solid rgba(245, 158, 11, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: isBaselineState
                    ? '#A8A29E'
                    : currentResult.feasibility === 'feasible'
                    ? '#10B981'
                    : currentResult.feasibility === 'review_required'
                    ? '#F59E0B'
                    : '#EF4444'
                }} />
                {isBaselineState
                  ? 'BASELINE ACTIVE'
                  : currentResult.feasibility === 'feasible'
                  ? 'FEASIBLE SCENARIO'
                  : currentResult.feasibility === 'review_required'
                  ? 'APPROVAL REQUIRED'
                  : 'BLOCKED BY INTERLOCK'}
              </span>

              <span style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: '#78716C',
                padding: '2px 8px',
                borderRadius: 4,
                background: '#FAF7F2',
                border: '1px solid #EAE3D7'
              }}>
                PrecisionWorks Mfg · 24h Baseline
              </span>
            </div>
            <p style={{ fontSize: 12.5, color: '#78716C', margin: 0 }}>
              Simulate operational changes, evaluate energy savings, and verify production constraints before implementation.
            </p>
          </div>

          {/* Action Controls Row */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {/* Methodology Drawer Toggle */}
            <button
              onClick={() => setShowMethodologyDrawer(!showMethodologyDrawer)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: showMethodologyDrawer ? '#FAF7F2' : '#FFFFFF',
                color: '#475569',
                border: '1px solid #D9D0C1',
                borderRadius: 8,
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="View deterministic calculation methodology and safety contracts"
            >
              <Info size={13} color="#64748B" />
              <span>Methodology</span>
            </button>

            {/* Demo Pipeline Stepper Toggle */}
            <button
              onClick={() => setShowDemoPipeline(!showDemoPipeline)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: showDemoPipeline ? 'rgba(2, 132, 199, 0.08)' : '#FFFFFF',
                color: showDemoPipeline ? '#0284C7' : '#475569',
                border: showDemoPipeline ? '1px solid rgba(2, 132, 199, 0.3)' : '1px solid #D9D0C1',
                borderRadius: 8,
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Toggle hackathon 4-step judging presentation walkthrough"
            >
              <Compass size={13} />
              <span>{showDemoPipeline ? 'Hide Demo Guide' : 'Demo Guide'}</span>
            </button>

            {/* Reset to Baseline */}
            <button
              onClick={handleResetToBaseline}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#FFFFFF',
                color: '#475569',
                border: '1px solid #D9D0C1',
                borderRadius: 8,
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Reset scenario to un-modified factory baseline"
            >
              <RotateCcw size={13} />
              <span>Reset Baseline</span>
            </button>

            {/* Auto-Stagger Optimizer */}
            <button
              onClick={handleRunOptimizer}
              disabled={isOptimizing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#FAF7F2',
                color: '#059669',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: isOptimizing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              title="Run algorithmic search across start-time offsets to minimize plant peak load"
            >
              <Sparkles size={13} color="#059669" />
              <span>{isOptimizing ? 'Optimizing...' : 'Auto-Stagger Peak'}</span>
            </button>

            {/* Apply to Platform */}
            <button
              onClick={() => onApplySimulation(currentResult)}
              disabled={currentResult.feasibility === 'blocked'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: currentResult.feasibility === 'blocked' ? '#F5F5F4' : '#FFFFFF',
                color: currentResult.feasibility === 'blocked' ? '#A8A29E' : '#1C1917',
                border: '1px solid #D9D0C1',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: currentResult.feasibility === 'blocked' ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={currentResult.feasibility === 'blocked' ? 'Cannot apply blocked scenario' : 'Sync scenario to 3D Twin & Audit reports'}
            >
              <CheckCircle2 size={13} color={currentResult.feasibility === 'blocked' ? '#A8A29E' : '#059669'} />
              <span>Apply to Platform</span>
            </button>

            {/* Primary Run Simulation */}
            <button
              onClick={handleRunSimulation}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#0284C7',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(2, 132, 199, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <Play size={13} />
              <span>Recalculate</span>
            </button>
          </div>
        </div>

        {/* ─── Collapsible Simulation Methodology Drawer ──────────────────── */}
        {showMethodologyDrawer && (
          <div style={{
            background: '#FAF7F2',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '16px 20px',
            fontSize: 12,
            color: '#475569',
            lineHeight: 1.6
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ color: '#1C1917', fontSize: 13 }}>Digital Twin Architecture & Scientific Methodology</strong>
              <span style={{ fontSize: 11, color: '#78716C' }}>ISO 50001:2018 Clause 6.3 & IPMVP Option B Compliant</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 8, border: '1px solid #EAE3D7' }}>
                <span style={{ fontWeight: 600, color: '#0284C7' }}>Idea A: Sensor Sufficiency Gate</span>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748B' }}>
                  Quantifies diagnostic ambiguity before capital expenditure. Evaluates Value of Information (VOI) of adding inline ultrasonic flowmeters to separate pneumatic leaks from timer blow-offs.
                </p>
              </div>
              <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 8, border: '1px solid #EAE3D7' }}>
                <span style={{ fontWeight: 600, color: '#DC2626' }}>Idea C: Production-Safe Interlocks</span>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748B' }}>
                  Enforces non-negotiable physical constraints. Clamps pneumatic pressure to ≥6.5 bar ring main floor and prevents furnace power cuts that would violate metallurgical quench minimums.
                </p>
              </div>
              <div style={{ background: '#FFFFFF', padding: '10px 14px', borderRadius: 8, border: '1px solid #EAE3D7' }}>
                <span style={{ fontWeight: 600, color: '#059669' }}>Idea B: Counterfactual M&V Ledger</span>
                <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#64748B' }}>
                  Reconciles post-mod telemetry to separate genuine energy efficiency from production volume drops (e.g. 122 vs 140 parts) using routine baseline adjustments.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ─── 2. Compact 4-Step Judging Presentation Stepper (Collapsible) ── */}
        {showDemoPipeline && (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Compass size={14} color="#0284C7" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>3-Minute Judging Presentation Pipeline</span>
              </div>
              <span style={{ fontSize: 11, color: '#78716C' }}>
                Click steps sequentially for an airtight presentation pitch
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {DEMO_PIPELINE.map(step => {
                const isStepActive = activeDemoStep === step.stepNum;
                const isPassed = activeDemoStep !== null && step.stepNum < activeDemoStep;
                return (
                  <button
                    key={step.stepNum}
                    onClick={() => handleDemoStepClick(step)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '8px 12px',
                      background: isStepActive ? '#F0F9FF' : '#FFFFFF',
                      border: isStepActive ? '1.5px solid #0284C7' : '1px solid #EAE3D7',
                      borderRadius: 8,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                      <span style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: isStepActive ? '#0284C7' : isPassed ? '#10B981' : '#F5F5F4',
                        color: isStepActive || isPassed ? '#FFFFFF' : '#78716C',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {isPassed ? '✓' : step.stepNum}
                      </span>
                      <span style={{
                        fontSize: 12,
                        fontWeight: isStepActive ? 700 : 600,
                        color: isStepActive ? '#0284C7' : '#1C1917'
                      }}>
                        {step.label.slice(3)}
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: '#78716C', marginTop: 3, paddingLeft: 24 }}>
                      {step.ideaTag}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Presenter Talking Point */}
            {activeDemoStep !== null && (
              <div style={{
                marginTop: 10,
                background: '#FAF7F2',
                border: '1px solid #EAE3D7',
                borderLeft: '4px solid #0284C7',
                borderRadius: 6,
                padding: '9px 14px',
                fontSize: 11.5,
                color: '#1E252D',
                lineHeight: 1.5,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8
              }}>
                <Sparkles size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <strong style={{ color: '#0284C7' }}>Presenter Talking Point: </strong>
                  <span>{DEMO_PIPELINE.find(s => s.stepNum === activeDemoStep)?.pitchScript}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── 3. Industrial Case-Study Selection Grid ────────────────────── */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={15} color="#0284C7" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1917' }}>Industrial Case Studies</span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>
                Pre-configured physical scenarios with verified plant constraints
              </span>
            </div>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#78716C' }}>
              Select to load verified inputs
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {INDUSTRIAL_CASES.map(c => {
              const isSelected = activeCaseId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectCase(c)}
                  style={{
                    background: isSelected ? '#F0F9FF' : '#FAF7F2',
                    border: isSelected ? '1.5px solid #0284C7' : '1px solid #EAE3D7',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: c.tagClass === 'emerald' ? 'rgba(16,185,129,0.12)' : c.tagClass === 'cyan' ? 'rgba(2,132,199,0.12)' : 'rgba(239,68,68,0.12)',
                        color: c.tagClass === 'emerald' ? '#059669' : c.tagClass === 'cyan' ? '#0284C7' : '#DC2626',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        {c.caseNum}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: '#78716C' }}>
                        {c.machineId}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSelected ? '#0284C7' : '#1C1917', marginBottom: 3 }}>
                      {c.title}
                    </div>
                    <div style={{ fontSize: 10.5, color: '#78716C', lineHeight: 1.35, marginBottom: 8 }}>
                      {c.summary}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 10.5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    paddingTop: 6,
                    borderTop: '1px dashed #EAE3D7',
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: c.tagClass === 'emerald' ? '#059669' : c.tagClass === 'cyan' ? '#0284C7' : '#DC2626'
                  }}>
                    <span style={{ color: '#78716C', fontWeight: 400 }}>Impact:</span>
                    <span>{c.targetBenefit}</span>
                  </div>
                </div>
              );
            })}

            {/* Custom Sandbox Tile */}
            <div
              onClick={() => setActiveCaseId('custom')}
              style={{
                background: activeCaseId === 'custom' ? '#F0F9FF' : '#FAF7F2',
                border: activeCaseId === 'custom' ? '1.5px solid #0284C7' : '1px solid #EAE3D7',
                borderRadius: 8,
                padding: '10px 12px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center'
              }}
            >
              <Sliders size={16} color="#0284C7" style={{ marginBottom: 4 }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: activeCaseId === 'custom' ? '#0284C7' : '#1C1917' }}>
                Custom Sandbox
              </div>
              <div style={{ fontSize: 10.5, color: '#78716C', marginTop: 2 }}>
                Free manual setpoints
              </div>
            </div>
          </div>
        </div>

        {/* ─── 4. Stage B: Simulation Results (5 Clean KPI Cards) ─────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12
        }}>
          {/* KPI 1: 24h Plant Energy */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.04em' }}>
                24H PLANT ENERGY
              </span>
              <Zap size={14} color="#0284C7" />
            </div>
            <div style={{ margin: '6px 0 2px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#1C1917' }}>
                {currentResult.scenario.total_energy_kwh.toLocaleString()}
              </span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>kWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F5F5F4', paddingTop: 6, fontSize: 11 }}>
              <span style={{ color: '#78716C', fontFamily: 'var(--font-mono)' }}>
                Base: {currentResult.baseline.total_energy_kwh.toLocaleString()}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: currentResult.deltas.energy_kwh <= 0 ? '#059669' : '#DC2626'
              }}>
                {currentResult.deltas.energy_kwh <= 0 ? '▼ -' : '▲ +'}
                {Math.abs(currentResult.deltas.energy_kwh).toFixed(1)} kWh
              </span>
            </div>
          </div>

          {/* KPI 2: Energy Saved */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.04em' }}>
                ENERGY SAVED
              </span>
              <TrendingDown size={14} color="#059669" />
            </div>
            <div style={{ margin: '6px 0 2px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 700,
                color: currentResult.deltas.energy_kwh <= 0 ? '#059669' : '#57534E'
              }}>
                {Math.abs(currentResult.deltas.energy_kwh).toFixed(1)}
              </span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>kWh/day</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F5F5F4', paddingTop: 6, fontSize: 11 }}>
              <span style={{ color: '#78716C' }}>
                {((Math.abs(currentResult.deltas.energy_kwh) / (currentResult.baseline.total_energy_kwh || 1)) * 100).toFixed(1)}% reduction
              </span>
              <span style={{
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 3,
                background: currentResult.deltas.energy_kwh <= 0 ? 'rgba(16,185,129,0.1)' : '#F5F5F4',
                color: currentResult.deltas.energy_kwh <= 0 ? '#059669' : '#78716C',
                fontWeight: 600
              }}>
                Simulated
              </span>
            </div>
          </div>

          {/* KPI 3: Operating Cost Savings */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.04em' }}>
                OPERATING COST
              </span>
              <DollarSign size={14} color="#059669" />
            </div>
            <div style={{ margin: '6px 0 2px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#1C1917' }}>
                ₹{currentResult.scenario.total_cost_inr.toLocaleString()}
              </span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>/day</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F5F5F4', paddingTop: 6, fontSize: 11 }}>
              <span style={{ color: '#78716C', fontFamily: 'var(--font-mono)' }}>
                Base: ₹{currentResult.baseline.total_cost_inr.toLocaleString()}
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: currentResult.deltas.cost_inr <= 0 ? '#059669' : '#DC2626'
              }}>
                {currentResult.deltas.cost_inr <= 0 ? '▼ -₹' : '▲ +₹'}
                {Math.abs(currentResult.deltas.cost_inr).toLocaleString()}
              </span>
            </div>
          </div>

          {/* KPI 4: Peak Demand Impact */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.04em' }}>
                PEAK DEMAND
              </span>
              <Gauge size={14} color={currentResult.scenario.peak_demand_kw > tariffConfig.contract_demand_limit_kw ? '#DC2626' : '#D97706'} />
            </div>
            <div style={{ margin: '6px 0 2px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 700,
                color: currentResult.scenario.peak_demand_kw > tariffConfig.contract_demand_limit_kw ? '#DC2626' : '#1C1917'
              }}>
                {currentResult.scenario.peak_demand_kw}
              </span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>kW</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F5F5F4', paddingTop: 6, fontSize: 11 }}>
              <span style={{ color: '#78716C', fontFamily: 'var(--font-mono)' }}>
                Limit: {tariffConfig.contract_demand_limit_kw} kW
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: currentResult.scenario.peak_demand_kw <= tariffConfig.contract_demand_limit_kw ? '#059669' : '#DC2626'
              }}>
                {currentResult.scenario.peak_demand_kw <= tariffConfig.contract_demand_limit_kw ? 'Within Limit' : 'Exceeds Limit'}
              </span>
            </div>
          </div>

          {/* KPI 5: Scope 2 Carbon Impact */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 10,
            padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.04em' }}>
                SCOPE 2 CARBON
              </span>
              <Leaf size={14} color="#059669" />
            </div>
            <div style={{ margin: '6px 0 2px', display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: '#1C1917' }}>
                {(currentResult.scenario.scope2_kg_co2e ?? 0).toFixed(1)}
              </span>
              <span style={{ fontSize: 11.5, color: '#78716C' }}>kg CO₂e</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #F5F5F4', paddingTop: 6, fontSize: 11 }}>
              <span style={{ color: '#78716C', fontFamily: 'var(--font-mono)' }}>
                Base: {(currentResult.baseline.scope2_kg_co2e ?? 0).toFixed(1)} kg
              </span>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: (currentResult.deltas.scope2_kg_co2e ?? 0) <= 0 ? '#059669' : '#DC2626'
              }}>
                {(currentResult.deltas.scope2_kg_co2e ?? 0) <= 0 ? '▼ -' : '▲ +'}
                {Math.abs(currentResult.deltas.scope2_kg_co2e ?? 0).toFixed(1)} kg
              </span>
            </div>
          </div>
        </div>

        {/* ─── 5. Main Workbench: Setup (Stage A) & Constraints (Stage C) vs Analytics ─── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '340px minmax(0, 1fr)',
          gap: 16,
          alignItems: 'start'
        }}>
          {/* LEFT COLUMN: Stage A (Setup) + Stage C (Constraints) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Stage A — Setup & Intervention Card */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 10,
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Cpu size={14} color="#0284C7" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Stage A: Simulation Setup</span>
              </div>

              {/* Target Asset Selector (Safe Switching Without Unwanted 3D Redirection) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>
                    Target Machine Asset
                  </label>
                  <span style={{ fontSize: 10, color: '#0284C7', fontWeight: 600 }}>Click to Focus Twin</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {Object.values(MACHINE_PROFILES).map(profile => {
                    const isSelected = selectedMachineId === profile.machine_id;
                    return (
                      <button
                        key={profile.machine_id}
                        type="button"
                        onClick={() => {
                          handleSwitchMachine(profile.machine_id);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 9px',
                          borderRadius: 6,
                          background: isSelected ? '#F0F9FF' : '#FAF7F2',
                          border: isSelected ? '1.5px solid #0284C7' : '1px solid #EAE3D7',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          textAlign: 'left'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: profile.color }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: isSelected ? '#0284C7' : '#1C1917' }}>
                            {profile.machine_id}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#78716C' }}>
                            {profile.rated_power_kw}kW
                          </span>
                          {onSelectMachineIn3D && profile.model3DId && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectMachineIn3D(profile.model3DId!);
                              }}
                              title={`Inspect ${profile.machine_id} in 3D Factory Twin`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                padding: '1px 4px',
                                borderRadius: 3,
                                background: isSelected ? '#E0F2FE' : '#F5F5F4',
                                color: isSelected ? '#0284C7' : '#78716C',
                                fontSize: 9,
                                fontWeight: 700,
                              }}
                            >
                              3D ↗
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Machine-Specific Quick Scenarios Levers */}
              {activeMachineIntel && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: '#78716C' }}>
                      Quick Scenarios ({selectedMachineId})
                    </span>
                    <span style={{ fontSize: 9.5, color: '#0284C7', fontWeight: 600 }}>1-Click Apply</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {activeMachineIntel.quickPresets.map((qp, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleApplyQuickPreset(qp, selectedMachineId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '5px 8px',
                          borderRadius: 5,
                          fontSize: 10.5,
                          background: qp.isPrimary ? '#F0F9FF' : qp.isSafetyTest ? 'rgba(239, 68, 68, 0.05)' : '#FAF7F2',
                          border: qp.isPrimary ? '1px solid #0284C7' : qp.isSafetyTest ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #EAE3D7',
                          color: qp.isPrimary ? '#0284C7' : qp.isSafetyTest ? '#DC2626' : '#1C1917',
                          cursor: 'pointer',
                          textAlign: 'left'
                        }}
                      >
                        <span style={{ fontWeight: qp.isPrimary ? 700 : 500 }}>{qp.label}</span>
                        {qp.isPrimary && <Sparkles size={11} color="#0284C7" />}
                        {qp.isSafetyTest && <ShieldAlert size={11} color="#DC2626" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Intervention Action Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#78716C', marginBottom: 5 }}>
                    Intervention Action
                  </label>
                  <select
                    value={actionType}
                    onChange={e => { const v = e.target.value as ScenarioAction['type']; setActionType(v); runInteractiveSimulation({ type: v }); }}
                    style={{
                      width: '100%',
                      background: '#FFFFFF',
                      border: '1px solid #D9D0C1',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 12,
                      color: '#1C1917',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="reduce_idle_power">Reduce Avoidable Idle Power (Auto-Cutoff)</option>
                    <option value="shift_schedule">Load Shifting / Schedule Offset (Peak Shaving)</option>
                    <option value="pressure_optimization">Pneumatic Pressure Setpoint Tuning (bar)</option>
                    <option value="reduce_runtime">Reduce Operating Window (Runtime Reduction)</option>
                  </select>
                </div>

                {/* Dynamic Parameter Sliders */}
                {actionType === 'reduce_idle_power' && (
                  <>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: '#475569', fontWeight: 500 }}>Target Idle Power</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>
                          {targetPowerKw.toFixed(1)} kW
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={selectedProfile.rated_power_kw * 1.5}
                        step={0.5}
                        value={targetPowerKw}
                        onChange={e => { const v = parseFloat(e.target.value); setTargetPowerKw(v); runInteractiveSimulation({ target_power_kw: v }); }}
                        style={{ width: '100%', accentColor: '#0284C7', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#78716C', marginTop: 2 }}>
                        <span>0 kW (Off)</span>
                        <span>Idle: {selectedProfile.expected_idle_power_kw} kW</span>
                        <span>Rated: {selectedProfile.rated_power_kw} kW</span>
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: '#475569', fontWeight: 500 }}>Intervention Duration</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>
                          {durationHours} hrs
                        </span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        step={0.5}
                        value={durationHours}
                        onChange={e => { const v = parseFloat(e.target.value); setDurationHours(v); runInteractiveSimulation({ duration_hours: v }); }}
                        style={{ width: '100%', accentColor: '#0284C7', cursor: 'pointer' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#78716C', marginTop: 2 }}>
                        <span>1 hr</span>
                        <span>Break: 3 hrs</span>
                        <span>6 hrs</span>
                      </div>
                    </div>
                  </>
                )}

                {actionType === 'shift_schedule' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: '#475569', fontWeight: 500 }}>Schedule Offset</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>
                        {offsetHours >= 0 ? `+${offsetHours} hrs` : `${offsetHours} hrs`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-3}
                      max={4}
                      step={1}
                      value={offsetHours}
                      onChange={e => { const v = parseInt(e.target.value); setOffsetHours(v); runInteractiveSimulation({ offset_hours: v }); }}
                      style={{ width: '100%', accentColor: '#0284C7', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#78716C', marginTop: 2 }}>
                      <span>-3 hrs</span>
                      <span>0 (Base)</span>
                      <span>+2 hrs (Optimal)</span>
                      <span>+4 hrs</span>
                    </div>
                  </div>
                )}

                {actionType === 'pressure_optimization' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: '#475569', fontWeight: 500 }}>Discharge Pressure</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: targetPressureBar < 6.5 ? '#DC2626' : '#0284C7' }}>
                        {targetPressureBar.toFixed(1)} bar
                      </span>
                    </div>
                    <input
                      type="range"
                      min={6.0}
                      max={7.5}
                      step={0.1}
                      value={targetPressureBar}
                      onChange={e => { const v = parseFloat(e.target.value); setTargetPressureBar(v); runInteractiveSimulation({ target_pressure_bar: v }); }}
                      style={{ width: '100%', accentColor: targetPressureBar < 6.5 ? '#DC2626' : '#0284C7', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#78716C', marginTop: 2 }}>
                      <span style={{ color: targetPressureBar < 6.5 ? '#DC2626' : undefined }}>Floor: 6.5 bar</span>
                      <span>Optimal: 6.8 bar</span>
                      <span>Set: 7.5 bar</span>
                    </div>
                  </div>
                )}

                {actionType === 'reduce_runtime' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: '#475569', fontWeight: 500 }}>Runtime Trimmed</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>
                        {durationHours} hrs
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={1}
                      value={durationHours}
                      onChange={e => setDurationHours(parseFloat(e.target.value))}
                      style={{ width: '100%', accentColor: '#0284C7', cursor: 'pointer' }}
                    />
                  </div>
                )}

                {/* Operating State Readout */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: '#FAF7F2',
                  border: '1px solid #EAE3D7',
                  borderRadius: 6,
                  fontSize: 11
                }}>
                  <span style={{ color: '#78716C' }}>Target State:</span>
                  <span style={{ fontWeight: 600, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                    {targetPowerKw === 0 ? 'State 0 (Off · 0.0 LF)' : targetPowerKw <= selectedProfile.expected_idle_power_kw ? `State 1 (Idle · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)` : `State 2 (Run · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)`}
                  </span>
                </div>

                {/* Collapsible Advanced Parameters */}
                <div style={{ border: '1px solid #EAE3D7', borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvancedClimate(!showAdvancedClimate)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '7px 10px',
                      background: '#FAF7F2',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#475569'
                    }}
                  >
                    <span>Advanced Telemetry & Climate</span>
                    {showAdvancedClimate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>

                  {showAdvancedClimate && (
                    <div style={{ padding: '10px', background: '#FFFFFF', borderTop: '1px solid #EAE3D7', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
                          <span style={{ color: '#78716C' }}>Sensor Quality (Idea A)</span>
                          <span style={{ fontWeight: 600, color: sensorQuality === 'good' ? '#059669' : '#D97706' }}>
                            {sensorQuality.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(['good', 'suspect', 'missing'] as const).map(q => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setSensorQuality(q)}
                              style={{
                                flex: 1,
                                padding: '4px',
                                borderRadius: 4,
                                fontSize: 10,
                                border: '1px solid',
                                borderColor: sensorQuality === q ? '#0284C7' : '#D9D0C1',
                                background: sensorQuality === q ? '#F0F9FF' : '#FFFFFF',
                                color: sensorQuality === q ? '#0284C7' : '#57534E',
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                              }}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
                          <span style={{ color: '#78716C' }}>Ambient Temperature (ISO 1217)</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1C1917' }}>
                            {ambientTempC.toFixed(1)}°C
                          </span>
                        </div>
                        <input
                          type="range"
                          min={15}
                          max={45}
                          step={0.5}
                          value={ambientTempC}
                          onChange={e => setAmbientTempC(parseFloat(e.target.value))}
                          style={{ width: '100%', accentColor: '#0284C7' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRunSimulation}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    background: '#1C1917',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Play size={12} />
                  <span>Recalculate Dynamic Simulation</span>
                </button>
              </div>
            </div>

            {/* Stage C — Safety & Operational Constraints Card */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 10,
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <ShieldAlert size={14} color={currentResult.feasibility === 'blocked' ? '#DC2626' : currentResult.feasibility === 'review_required' ? '#D97706' : '#059669'} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Stage C: Operational Feasibility</span>
              </div>

              {/* Feasibility Status Banner */}
              <div style={{
                borderRadius: 8,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: currentResult.feasibility === 'feasible'
                  ? 'rgba(16, 185, 129, 0.08)'
                  : currentResult.feasibility === 'review_required'
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'rgba(239, 68, 68, 0.08)',
                border: currentResult.feasibility === 'feasible'
                  ? '1px solid rgba(16, 185, 129, 0.3)'
                  : currentResult.feasibility === 'review_required'
                  ? '1px solid rgba(245, 158, 11, 0.3)'
                  : '1px solid rgba(239, 68, 68, 0.3)',
                marginBottom: 10
              }}>
                {currentResult.feasibility === 'feasible' && <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />}
                {currentResult.feasibility === 'review_required' && <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0 }} />}
                {currentResult.feasibility === 'blocked' && <XCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />}
                <div>
                  <div style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: currentResult.feasibility === 'feasible' ? '#059669' : currentResult.feasibility === 'review_required' ? '#D97706' : '#DC2626'
                  }}>
                    {currentResult.feasibility === 'feasible' ? 'FEASIBLE SCENARIO' : currentResult.feasibility === 'review_required' ? 'OPERATOR APPROVAL REQUIRED' : 'BLOCKED BY SAFETY INTERLOCK'}
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>
                    {currentResult.feasibility === 'feasible' ? 'All safety, pressure & process constraints passed' : currentResult.feasibility === 'review_required' ? 'Advisory conditions need plant operator sign-off' : 'Scenario violates equipment or process limits'}
                  </div>
                </div>
              </div>

              {/* Constraint Diagnostic Violations */}
              {currentResult.constraint_violations.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {currentResult.constraint_violations.map((v, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: '#FAF7F2',
                        borderLeft: `3px solid ${v.severity === 'error' ? '#DC2626' : '#D97706'}`,
                        fontSize: 11
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: '#78716C', marginBottom: 2 }}>
                        <span>{v.code}</span>
                        <span>{v.machine_id}</span>
                      </div>
                      <div style={{ color: '#1C1917', lineHeight: 1.35 }}>{v.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Analytics Tabs & Visualizations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            {/* Active Case Context Briefing Strip */}
            {activeCase && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 8,
                fontSize: 11.5,
                color: '#1E252D'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: activeCase.tagClass === 'emerald' ? 'rgba(16,185,129,0.12)' : activeCase.tagClass === 'cyan' ? 'rgba(2,132,199,0.12)' : 'rgba(239,68,68,0.12)',
                    color: activeCase.tagClass === 'emerald' ? '#059669' : activeCase.tagClass === 'cyan' ? '#0284C7' : '#DC2626'
                  }}>
                    {activeCase.caseNum}
                  </span>
                  <span><strong>{activeCase.title}: </strong>{activeCase.summary}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0284C7' }}>
                  {activeCase.machineId}
                </span>
              </div>
            )}

            {/* Clean Segmented Tab Navigation Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#EFE9E0',
              padding: 4,
              borderRadius: 8
            }}>
              <button
                type="button"
                onClick={() => setAnalyticsTab('simulator')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: analyticsTab === 'simulator' ? 700 : 500,
                  border: 'none',
                  background: analyticsTab === 'simulator' ? '#FFFFFF' : 'transparent',
                  color: analyticsTab === 'simulator' ? '#1C1917' : '#64748B',
                  boxShadow: analyticsTab === 'simulator' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Activity size={13} color={analyticsTab === 'simulator' ? '#0284C7' : '#64748B'} />
                <span>24h Load Curve</span>
              </button>

              <button
                type="button"
                onClick={() => setAnalyticsTab('tradeoff')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: analyticsTab === 'tradeoff' ? 700 : 500,
                  border: 'none',
                  background: analyticsTab === 'tradeoff' ? '#FFFFFF' : 'transparent',
                  color: analyticsTab === 'tradeoff' ? '#1C1917' : '#64748B',
                  boxShadow: analyticsTab === 'tradeoff' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <CheckSquare size={13} color={analyticsTab === 'tradeoff' ? '#0284C7' : '#64748B'} />
                <span>Trade-Offs (Idea C)</span>
              </button>

              <button
                type="button"
                onClick={() => setAnalyticsTab('investment')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: analyticsTab === 'investment' ? 700 : 500,
                  border: 'none',
                  background: analyticsTab === 'investment' ? '#FFFFFF' : 'transparent',
                  color: analyticsTab === 'investment' ? '#1C1917' : '#64748B',
                  boxShadow: analyticsTab === 'investment' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Award size={13} color={analyticsTab === 'investment' ? '#0284C7' : '#64748B'} />
                <span>Sensor VOI (Idea A)</span>
              </button>

              <button
                type="button"
                onClick={() => setAnalyticsTab('ledger')}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: analyticsTab === 'ledger' ? 700 : 500,
                  border: 'none',
                  background: analyticsTab === 'ledger' ? '#FFFFFF' : 'transparent',
                  color: analyticsTab === 'ledger' ? '#1C1917' : '#64748B',
                  boxShadow: analyticsTab === 'ledger' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <BookmarkCheck size={13} color={analyticsTab === 'ledger' ? '#059669' : '#64748B'} />
                <span>M&V Ledger (Idea B)</span>
                <span style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 9999,
                  background: '#DCFCE7',
                  color: '#15803D'
                }}>
                  {mvLedger.length}
                </span>
              </button>
            </div>

            {/* TAB 1: Dynamic Machine Intelligence & 24h Factory Demand Curves */}
            {analyticsTab === 'simulator' && (
              <>
                {/* 1. Dynamic Machine Intelligence & Actionable Recommendation Card */}
                {activeIntel && (
                  <div style={{
                    background: '#FFFFFF',
                    border: '1.5px solid #EAE3D7',
                    borderRadius: 10,
                    padding: '16px 18px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12
                  }}>
                    {/* Card Header with Machine Identity & Health Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: `${activeIntel.color}15`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Sparkles size={15} color={activeIntel.color} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1917' }}>
                              {activeIntel.name}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: '#F5F5F4',
                              color: '#57534E'
                            }}>
                              {activeIntel.machineId}
                            </span>
                          </div>
                          <span style={{ fontSize: 10.5, color: '#78716C' }}>
                            {activeIntel.category}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: 9999,
                          background: activeIntel.severity === 'anomaly' ? 'rgba(245, 158, 11, 0.12)' : activeIntel.severity === 'peak' ? 'rgba(2, 132, 199, 0.12)' : activeIntel.severity === 'thermal' ? 'rgba(239, 68, 68, 0.12)' : activeIntel.severity === 'airflow' ? 'rgba(16, 185, 129, 0.12)' : '#F0F9FF',
                          color: activeIntel.severity === 'anomaly' ? '#D97706' : activeIntel.severity === 'peak' ? '#0284C7' : activeIntel.severity === 'thermal' ? '#DC2626' : activeIntel.severity === 'airflow' ? '#059669' : '#0284C7',
                          border: `1px solid ${activeIntel.color}40`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <AlertCircle size={11} />
                          {activeIntel.anomalyTitle}
                        </span>

                        {onSelectMachineIn3D && activeIntel.machineId !== 'ALL' && MACHINE_PROFILES[activeIntel.machineId]?.model3DId && (
                          <button
                            type="button"
                            onClick={() => onSelectMachineIn3D(MACHINE_PROFILES[activeIntel.machineId].model3DId!)}
                            title="Inspect in 3D Factory Twin"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: '#FAF7F2',
                              border: '1px solid #D9D0C1',
                              color: '#475569',
                              fontSize: 10.5,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            <span>Inspect 3D</span>
                            <ArrowUpRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dual Insights Grid: Telemetry Diagnostic vs Recommended Intervention */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                      {/* Telemetry Observation */}
                      <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <Activity size={12} color="#D97706" />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1C1917' }}>Telemetry Diagnostic & Root Cause</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#57534E', lineHeight: 1.45, margin: 0 }}>
                          {activeIntel.telemetryObservation}
                        </p>
                        <div style={{ marginTop: 6, fontSize: 10.5, color: '#78716C', borderTop: '1px dashed #EAE3D7', paddingTop: 5 }}>
                          <strong>Physics Basis: </strong>{activeIntel.rootCausePhysics}
                        </div>
                      </div>

                      {/* Recommended Digital Twin Intervention */}
                      <div style={{ background: '#F0F9FF', border: '1px solid rgba(2, 132, 199, 0.3)', borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                          <Target size={12} color="#0284C7" />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0284C7' }}>Recommended Digital Twin Action</span>
                        </div>
                        <p style={{ fontSize: 11, color: '#1E293B', lineHeight: 1.45, margin: 0 }}>
                          {activeIntel.recommendedAction}
                        </p>
                        <div style={{ marginTop: 6, fontSize: 10.5, color: '#0369A1', borderTop: '1px dashed rgba(2, 132, 199, 0.25)', paddingTop: 5 }}>
                          <strong>Safety Contract (Idea C): </strong>{activeIntel.safetyInterlockContract}
                        </div>
                      </div>
                    </div>

                    {/* Financial, Energy & Carbon Impact Ribbon */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 8,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      borderRadius: 8,
                      padding: '8px 12px'
                    }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>ENERGY SAVINGS</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                          {activeIntel.targetKwhSavingsDay > 0 ? `-${activeIntel.targetKwhSavingsDay} kWh/d` : `${activeIntel.targetKwhSavingsDay} kW Shaved`}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>COST BENEFIT</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                          +₹{activeIntel.targetCostSavingsDay.toLocaleString()}/d
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>SCOPE 2 CARBON</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                          -{activeIntel.targetCarbonKgDay} kg CO₂e
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>CAPEX / PAYBACK</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                          {activeIntel.capexEstimateInr === 0 ? '₹0 Capex (Pure ToD)' : `₹${activeIntel.capexEstimateInr.toLocaleString()} · ${activeIntel.paybackPeriodMonths} mo`}
                        </div>
                      </div>
                    </div>

                    {/* Quick Presets / What-If Testing Levers */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#78716C', marginRight: 4 }}>
                        Test Actions:
                      </span>
                      {activeIntel.quickPresets.map((qp, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleApplyQuickPreset(qp, activeIntel.machineId === 'ALL' ? undefined : activeIntel.machineId)}
                          title={qp.description}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: qp.isPrimary ? 700 : 500,
                            background: qp.isPrimary ? '#0284C7' : qp.isSafetyTest ? 'rgba(239, 68, 68, 0.08)' : '#FAF7F2',
                            color: qp.isPrimary ? '#FFFFFF' : qp.isSafetyTest ? '#DC2626' : '#1C1917',
                            border: qp.isPrimary ? 'none' : qp.isSafetyTest ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid #D9D0C1',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {qp.isPrimary && <Sparkles size={11} />}
                          {qp.isSafetyTest && <ShieldAlert size={11} />}
                          <span>{qp.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 2. 24-Hour Demand Curve with Machine/Plant View Scope Filter */}
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #EAE3D7',
                  borderRadius: 10,
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  {/* Category / Scope Filter Buttons */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    marginBottom: 12,
                    paddingBottom: 10,
                    borderBottom: '1px solid #F1F5F9'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Filter size={13} color="#64748B" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', letterSpacing: '0.04em' }}>
                        24-HOUR VIEW SCOPE:
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {[
                        { id: 'ALL', label: '🏭 Entire Plant', color: '#0284C7' },
                        { id: 'COMP-01', label: '💨 COMP-01 (Air)', color: '#F59E0B' },
                        { id: 'CNC-01', label: '⚙️ CNC-01 (Machining)', color: '#0284C7' },
                        { id: 'FURN-01', label: '🔥 FURN-01 (Furnace)', color: '#EF4444' },
                        { id: 'PAINT-01', label: '🎨 PAINT-01 (Paint)', color: '#10B981' },
                      ].map(scope => {
                        const isScopeActive = chartScope === scope.id;
                        return (
                          <button
                            key={scope.id}
                            type="button"
                            onClick={() => {
                              setChartScope(scope.id as any);
                              if (scope.id !== 'ALL' && scope.id !== selectedMachineId) {
                                handleSwitchMachine(scope.id);
                              }
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 9px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: isScopeActive ? 700 : 500,
                              background: isScopeActive ? '#F0F9FF' : '#FFFFFF',
                              border: isScopeActive ? `1.5px solid ${scope.color}` : '1px solid #D9D0C1',
                              color: isScopeActive ? '#1C1917' : '#57534E',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{scope.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Contextual Header & Legend */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div>
                      <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                        {chartScope === 'ALL'
                          ? '24-Hour Plant Demand: Baseline vs. Simulated Scenario'
                          : `24-Hour Machine Load Curve: ${chartScope} (${MACHINE_PROFILES[chartScope]?.name || chartScope})`}
                      </h3>
                      <p style={{ fontSize: 11, color: '#78716C', margin: '2px 0 0' }}>
                        {chartScope === 'ALL'
                          ? 'Simulated power curve overlay with 85 kW contract demand limit & peak shaving'
                          : chartScope === 'COMP-01'
                          ? 'Visualizing 18 kW unloaded idle anomaly repair (11:00–14:00) vs. 30 kW rated limit'
                          : chartScope === 'CNC-01'
                          ? 'Visualizing +2h schedule shift de-conflicting spindle power from furnace morning surge'
                          : chartScope === 'FURN-01'
                          ? 'Visualizing 15.0 kW soaking standby setback while enforcing metallurgical quench floor'
                          : 'Visualizing VFD exhaust ventilation modulation during non-spraying intervals'}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10.5 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#57534E' }}>
                        <span style={{ width: 10, height: 2, background: '#F59E0B' }} />
                        Baseline (Dashed)
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#57534E' }}>
                        <span style={{ width: 10, height: 2, background: '#0284C7' }} />
                        Simulated (Solid)
                      </span>
                      {chartScope === 'ALL' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#DC2626' }}>
                          <span style={{ width: 10, height: 2, borderBottom: '2px dashed #DC2626' }} />
                          {tariffConfig.contract_demand_limit_kw} kW Limit
                        </span>
                      )}
                      {chartScope === 'FURN-01' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#DC2626' }}>
                          <span style={{ width: 10, height: 2, borderBottom: '2px dashed #DC2626' }} />
                          15 kW Quench Floor
                        </span>
                      )}
                      {chartScope === 'COMP-01' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#10B981' }}>
                          <span style={{ width: 10, height: 2, borderBottom: '2px dashed #10B981' }} />
                          8 kW Rated Idle
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Scope Summary Strip */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    background: '#FAF7F2',
                    border: '1px solid #EAE3D7',
                    borderRadius: 6,
                    padding: '6px 12px',
                    marginBottom: 10,
                    fontSize: 10.5
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: '#78716C' }}>
                        24h Base: <strong style={{ color: '#1C1917', fontFamily: 'var(--font-mono)' }}>{scopeMetrics.baseKwh} kWh</strong>
                      </span>
                      <span style={{ color: '#78716C' }}>
                        Simulated: <strong style={{ color: '#0284C7', fontFamily: 'var(--font-mono)' }}>{scopeMetrics.scenKwh} kWh</strong>
                      </span>
                      <span style={{
                        color: scopeMetrics.deltaKwh <= 0 ? '#059669' : '#DC2626',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 600
                      }}>
                        {scopeMetrics.deltaKwh <= 0 ? '▼ -' : '▲ +'}{Math.abs(scopeMetrics.deltaKwh)} kWh ({scopeMetrics.pctReduction}% cut)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ color: '#78716C' }}>
                        Daily Cost Saved: <strong style={{ color: '#059669', fontFamily: 'var(--font-mono)' }}>₹{scopeMetrics.costSavedInr}</strong>
                      </span>
                      <span style={{ color: '#78716C' }}>
                        Scope Peak: <strong style={{ color: '#1C1917', fontFamily: 'var(--font-mono)' }}>{scopeMetrics.maxKw} kW</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ height: 240, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0284C7" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" stroke="#A8A29E" fontSize={10.5} fontFamily="var(--font-mono)" tickLine={false} />
                        <YAxis
                          stroke="#A8A29E"
                          fontSize={10.5}
                          fontFamily="var(--font-mono)"
                          unit=" kW"
                          tickLine={false}
                          domain={chartScope === 'ALL' ? [0, 110] : chartScope === 'FURN-01' ? [0, 60] : chartScope === 'COMP-01' ? [0, 36] : chartScope === 'CNC-01' ? [0, 30] : [0, 26]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1C1917',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 11,
                            color: '#FFFFFF',
                          }}
                        />

                        {chartScope === 'ALL' && (
                          <ReferenceLine
                            y={tariffConfig.contract_demand_limit_kw}
                            stroke="#EF4444"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            label={{
                              value: `Contract Limit ${tariffConfig.contract_demand_limit_kw} kW`,
                              fill: '#EF4444',
                              fontSize: 9.5,
                              position: 'top',
                              fontFamily: 'var(--font-mono)',
                            }}
                          />
                        )}

                        {chartScope === 'COMP-01' && (
                          <>
                            <ReferenceLine
                              y={30.0}
                              stroke="#F59E0B"
                              strokeWidth={1.2}
                              strokeDasharray="4 4"
                              label={{
                                value: 'Rated Motor: 30 kW',
                                fill: '#F59E0B',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                            <ReferenceLine
                              y={8.0}
                              stroke="#10B981"
                              strokeWidth={1.2}
                              strokeDasharray="3 3"
                              label={{
                                value: 'Rated Idle: 8 kW (vs 18 kW bleed)',
                                fill: '#10B981',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                          </>
                        )}

                        {chartScope === 'CNC-01' && (
                          <ReferenceLine
                            y={25.0}
                            stroke="#0284C7"
                            strokeWidth={1.2}
                            strokeDasharray="4 4"
                            label={{
                              value: 'Rated Spindle: 25 kW',
                              fill: '#0284C7',
                              fontSize: 9.5,
                              position: 'top',
                              fontFamily: 'var(--font-mono)',
                            }}
                          />
                        )}

                        {chartScope === 'FURN-01' && (
                          <>
                            <ReferenceLine
                              y={50.0}
                              stroke="#EF4444"
                              strokeWidth={1.2}
                              strokeDasharray="4 4"
                              label={{
                                value: 'Rated Thermal: 50 kW',
                                fill: '#EF4444',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                            <ReferenceLine
                              y={15.0}
                              stroke="#DC2626"
                              strokeWidth={1.5}
                              strokeDasharray="3 3"
                              label={{
                                value: 'Quench Safety Floor: 15 kW',
                                fill: '#DC2626',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                          </>
                        )}

                        {chartScope === 'PAINT-01' && (
                          <>
                            <ReferenceLine
                              y={20.0}
                              stroke="#10B981"
                              strokeWidth={1.2}
                              strokeDasharray="4 4"
                              label={{
                                value: 'Rated Fan: 20 kW',
                                fill: '#10B981',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                            <ReferenceLine
                              y={5.0}
                              stroke="#06B6D4"
                              strokeWidth={1.2}
                              strokeDasharray="3 3"
                              label={{
                                value: 'VOC Safety Floor: 5 kW',
                                fill: '#06B6D4',
                                fontSize: 9.5,
                                position: 'top',
                                fontFamily: 'var(--font-mono)',
                              }}
                            />
                          </>
                        )}

                        <Line
                          type="monotone"
                          dataKey="baselineKw"
                          name={chartScope === 'ALL' ? 'Plant Baseline' : `${chartScope} Baseline`}
                          stroke="#F59E0B"
                          strokeWidth={1.8}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Area
                          type="monotone"
                          dataKey="scenarioKw"
                          name={chartScope === 'ALL' ? 'Plant Simulated' : `${chartScope} Simulated`}
                          stroke="#0284C7"
                          strokeWidth={2.2}
                          fill="url(#scenGrad)"
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Machine-Wise Load Composition */}
                <div style={{
                  background: '#FFFFFF',
                  border: '1px solid #EAE3D7',
                  borderRadius: 10,
                  padding: '16px 18px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={13} color="#059669" />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Machine-Wise Load Profile (24-Hour Outcome)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10.5, color: '#78716C' }}>
                      <span><strong style={{ color: '#F59E0B' }}>■</strong> COMP-01</span>
                      <span><strong style={{ color: '#0284C7' }}>■</strong> CNC-01</span>
                      <span><strong style={{ color: '#EF4444' }}>■</strong> FURN-01</span>
                      <span><strong style={{ color: '#10B981' }}>■</strong> PAINT-01</span>
                    </div>
                  </div>

                  <div style={{ height: 130, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 15, left: -10, bottom: 0 }}>
                        <CartesianGrid stroke="#F1F5F9" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" stroke="#A8A29E" fontSize={9.5} fontFamily="var(--font-mono)" tickLine={false} />
                        <YAxis stroke="#A8A29E" fontSize={9.5} fontFamily="var(--font-mono)" unit=" kW" tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1C1917',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 11,
                            color: '#FFFFFF',
                          }}
                        />
                        <Bar dataKey="compressor" name="COMP-01 (Air)" fill="#F59E0B" stackId="a" />
                        <Bar dataKey="cnc" name="CNC-01 (Machining)" fill="#0284C7" stackId="a" />
                        <Bar dataKey="furnace" name="FURN-01 (Furnace)" fill="#EF4444" stackId="a" />
                        <Bar dataKey="paint" name="PAINT-01 (Paint)" fill="#10B981" stackId="a" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}

            {/* TAB 2: Multi-Option Trade-Off Matrix (Idea C) */}
            {analyticsTab === 'tradeoff' && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                      Production-Safe Optimization: 3-Candidate Trade-Off Matrix
                    </h3>
                    <p style={{ fontSize: 11.5, color: '#78716C', margin: '2px 0 0' }}>
                      Balances aggressive energy reduction against physical safety, pressure floors, and production output
                    </p>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: '#F0F9FF',
                    color: '#0284C7',
                    border: '1px solid rgba(2,132,199,0.2)'
                  }}>
                    TARGET: &lt;85 kW PEAK
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {TRADE_OFF_CANDIDATES.map(cand => {
                    const isBlocked = cand.status === 'BLOCKED';
                    const isInfeasible = cand.status === 'INFEASIBLE';
                    const isRecommended = cand.status === 'RECOMMENDED';

                    return (
                      <div
                        key={cand.id}
                        style={{
                          background: isRecommended ? '#F0FDF4' : '#FFFFFF',
                          border: `1px solid ${isRecommended ? '#86EFAC' : isBlocked ? '#FECACA' : '#FDE68A'}`,
                          borderRadius: 8,
                          padding: '12px 14px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono)',
                              padding: '2px 7px',
                              borderRadius: 4,
                              background: isRecommended ? 'rgba(16,185,129,0.15)' : isBlocked ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                              color: isRecommended ? '#059669' : isBlocked ? '#DC2626' : '#D97706'
                            }}>
                              {cand.statusLabel}
                            </span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917' }}>
                              {cand.name}
                            </span>
                          </div>
                          <button
                            onClick={() => handleApplyCandidate(cand.id)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: isRecommended ? '#059669' : '#FFFFFF',
                              color: isRecommended ? '#FFFFFF' : '#1C1917',
                              border: isRecommended ? 'none' : '1px solid #D9D0C1',
                              borderRadius: 6,
                              padding: '5px 10px',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <span>{isRecommended ? 'Load Recommended Plan' : 'Test This Scenario'}</span>
                            <ArrowRight size={10} />
                          </button>
                        </div>

                        <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 8 }}>
                          {cand.strategy}
                        </div>

                        {/* Metrics Bar */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: 8,
                          background: isRecommended ? '#FFFFFF' : '#FAF7F2',
                          padding: '8px 10px',
                          borderRadius: 6,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 10.5,
                          border: '1px solid #EAE3D7'
                        }}>
                          <div>
                            <span style={{ color: '#78716C' }}>Peak Demand: </span>
                            <strong style={{ color: cand.peakKw > 85 ? '#DC2626' : '#059669' }}>{cand.peakKw} kW</strong>
                          </div>
                          <div>
                            <span style={{ color: '#78716C' }}>Energy Saved: </span>
                            <strong style={{ color: '#0284C7' }}>{cand.energyKwhSaved} kWh/d</strong>
                          </div>
                          <div>
                            <span style={{ color: '#78716C' }}>Production: </span>
                            <strong style={{ color: cand.productionUnits < 140 ? '#DC2626' : '#059669' }}>{cand.productionUnits} pcs</strong>
                          </div>
                          <div>
                            <span style={{ color: '#78716C' }}>Pressure: </span>
                            <strong style={{ color: cand.pressureBar < 6.5 ? '#DC2626' : '#1C1917' }}>{cand.pressureBar} bar</strong>
                          </div>
                        </div>

                        <div style={{ fontSize: 11, color: isBlocked ? '#DC2626' : isInfeasible ? '#D97706' : '#64748B', marginTop: 8, lineHeight: 1.4 }}>
                          <strong>Diagnostic Assessment: </strong>{cand.diagnostics}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: Sensor-ROI & Epistemic Humility (Idea A) */}
            {analyticsTab === 'investment' && inv && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                      Sensor Sufficiency & Value of Information (Idea A)
                    </h3>
                    <p style={{ fontSize: 11.5, color: '#78716C', margin: '2px 0 0' }}>
                      Diagnostic Humility: Resolves physical telemetry ambiguity before recommending capital expenditure
                    </p>
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    background: inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
                    color: inv.evidence_grade === 'A' ? '#059669' : '#D97706',
                    border: `1px solid ${inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`
                  }}>
                    TELEMETRY READINESS {inv.evidence_grade}
                  </span>
                </div>

                {/* Ambiguity Resolution Banner */}
                {inv.diagnostic_ambiguity && (
                  <div style={{
                    background: hasFlowMeter ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
                    border: `1px solid ${hasFlowMeter ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                    borderRadius: 6,
                    padding: '10px 14px',
                    marginBottom: 12,
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: '#334155'
                  }}>
                    <strong style={{ color: hasFlowMeter ? '#059669' : '#D97706' }}>Physical Hypothesis Resolution: </strong>
                    {inv.diagnostic_ambiguity}
                  </div>
                )}

                {/* Flowmeter Simulation Toggle */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#FAF7F2',
                  border: '1px solid #EAE3D7',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 14
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasFlowMeter ? '#10B981' : '#F59E0B' }} />
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1C1917' }}>
                        {hasFlowMeter ? 'Simulating with Inline Ultrasonic Flowmeter Installed' : 'Current Plant Telemetry (Electrical Submeter Only)'}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#78716C' }}>
                        {hasFlowMeter
                          ? 'Zero break airflow confirmed. 100% of 18 kW draw is recoverable timer blow-off.'
                          : 'Uncertainty present: 40%–65% of idle draw could be unmetered pipe leaks. VOI Ratio: 4.5x.'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setHasFlowMeter(!hasFlowMeter)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      background: hasFlowMeter ? '#059669' : '#FFFFFF',
                      color: hasFlowMeter ? '#FFFFFF' : '#1C1917',
                      border: hasFlowMeter ? 'none' : '1px solid #D9D0C1',
                      borderRadius: 6,
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {hasFlowMeter ? '✓ Flowmeter Active (+₹12k)' : 'Simulate Adding Flowmeter'}
                  </button>
                </div>

                {/* 3-Tier Payback Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                  <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 6, padding: '12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#78716C', fontFamily: 'var(--font-mono)' }}>
                      CONSERVATIVE CASE
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#D97706', margin: '4px 0 2px' }}>
                      ₹{inv.conservative_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>/yr</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#1C1917' }}>
                      Payback: <strong>{inv.payback_months_conservative} months</strong>
                    </div>
                  </div>

                  <div style={{ background: '#F0F9FF', border: '1px solid rgba(2,132,199,0.3)', borderRadius: 6, padding: '12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#0284C7', fontFamily: 'var(--font-mono)' }}>
                      EXPECTED NOMINAL CASE
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0284C7', margin: '4px 0 2px' }}>
                      ₹{inv.expected_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>/yr</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#1C1917' }}>
                      Payback: <strong>{inv.payback_months_expected} months</strong>
                    </div>
                  </div>

                  <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 6, padding: '12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                      BEST-CASE (+35%)
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#059669', margin: '4px 0 2px' }}>
                      ₹{inv.best_case_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400 }}>/yr</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#1C1917' }}>
                      Payback: <strong>{inv.payback_months_best} months</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Counterfactual M&V Ledger (Idea B: IPMVP Option B/C) */}
            {analyticsTab === 'ledger' && (
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '18px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                      The Counterfactual Factory: Post-Implementation M&V Ledger
                    </h3>
                    <p style={{ fontSize: 11.5, color: '#78716C', margin: '2px 0 0' }}>
                      Separates production volume drops from true verified energy efficiency (IPMVP Option B/C)
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {committedFeedback && (
                      <span style={{ fontSize: 11, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                        {committedFeedback}
                      </span>
                    )}
                    <button
                      onClick={handleCommitToLedger}
                      disabled={currentResult.feasibility === 'blocked'}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: currentResult.feasibility === 'blocked' ? '#F5F5F4' : '#059669',
                        color: currentResult.feasibility === 'blocked' ? '#A8A29E' : '#FFFFFF',
                        border: 'none',
                        borderRadius: 6,
                        padding: '6px 12px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: currentResult.feasibility === 'blocked' ? 'not-allowed' : 'pointer'
                      }}
                    >
                      <BookmarkCheck size={12} />
                      <span>Commit Active Scenario to Ledger</span>
                    </button>
                  </div>
                </div>

                {/* Waterfall Card */}
                <div style={{
                  background: '#FAF7F2',
                  border: '1px solid #EAE3D7',
                  borderRadius: 6,
                  padding: '12px 14px',
                  marginBottom: 14
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0284C7', fontFamily: 'var(--font-mono)' }}>
                      CASE STUDY A: SHIFT CONTRACTION AUDIT
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: '#059669',
                      background: 'rgba(16,185,129,0.1)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      padding: '2px 8px',
                      borderRadius: 4
                    }}>
                      Reconciliation: 170.57 + 14.43 = 185.00 kWh (100% Match)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                    <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: 6, border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 9.5, color: '#78716C' }}>1. Raw Submeter Drop</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1C1917', margin: '4px 0 2px' }}>-185.00 kWh (-14.0%)</div>
                      <div style={{ fontSize: 9.5, color: '#A8A29E' }}>1,320 → 1,135 kWh</div>
                    </div>
                    <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: 6, border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 9.5, color: '#78716C' }}>2. Output Deficit</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#D97706', margin: '4px 0 2px' }}>122 vs 140 parts (-12.9%)</div>
                      <div style={{ fontSize: 9.5, color: '#A8A29E' }}>Material delay on CNC</div>
                    </div>
                    <div style={{ background: '#FFFFFF', padding: '8px 10px', borderRadius: 6, border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 9.5, color: '#78716C' }}>3. Production Drop Effect</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#57534E', margin: '4px 0 2px' }}>-170.57 kWh (-12.9%)</div>
                      <div style={{ fontSize: 9.5, color: '#A8A29E' }}>Volume loss, not efficiency</div>
                    </div>
                    <div style={{ background: '#F0FDF4', padding: '8px 10px', borderRadius: 6, border: '1px solid #86EFAC' }}>
                      <div style={{ fontSize: 9.5, color: '#059669', fontWeight: 600 }}>4. True Verified Efficiency</div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#059669', margin: '4px 0 2px' }}>-14.43 kWh/d (-1.09%)</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>11.83 kg CO₂e verified</div>
                    </div>
                  </div>
                </div>

                {/* Ledger Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #EAE3D7' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Intervention</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Target Asset</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Baseline</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Actual Measured</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Adjusted Base</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Realized Saving</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Realization %</th>
                        <th style={{ padding: '8px 10px', fontWeight: 600, color: '#57534E' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mvLedger.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1C1917' }}>{row.title}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#0284C7' }}>{row.target_asset}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{row.baseline_kwh.toFixed(0)} kWh</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>{row.actual_measured_kwh.toFixed(0)} kWh</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#D97706' }}>{row.adjusted_baseline_kwh.toFixed(0)} kWh</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 700 }}>{row.realized_savings_kwh.toFixed(1)} kWh</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: row.realization_rate_pct >= 90 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              color: row.realization_rate_pct >= 90 ? '#059669' : '#D97706'
                            }}>
                              {row.realization_rate_pct.toFixed(1)}%
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#0284C7', background: '#F0F9FF', padding: '2px 6px', borderRadius: 4 }}>
                              VERIFIED
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
