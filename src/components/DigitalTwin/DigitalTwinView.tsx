import React, { useState, useMemo } from 'react';
import {
  Sliders, Play, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert,
  Cpu, Zap, TrendingDown, Layers, FileText, ArrowRight, Gauge,
  Info, Activity, Clock, DollarSign, Leaf, Sparkles, AlertCircle,
  Award, BarChart3, BookmarkCheck, ChevronDown, ChevronUp, Check,
  Target, Compass, CheckSquare, XCircle, ArrowUpRight
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
    id: 'case-4-safety',
    caseNum: 'CASE 4',
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
    pitchScript: 'Explain Idea A: A submeter alone cannot tell if the 18 kW is an air leak or timer blow-off. Toggle "Simulate Adding Flowmeter" to resolve the ambiguity and justify the ₹37k Capex with a 6.9-month payback.',
  },
  {
    stepNum: 3,
    label: '3. Safe Interlocks',
    ideaTag: 'Idea C: Safe Trade-Offs',
    caseId: 'case-4-safety',
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

export default function DigitalTwinView({
  baselineRecords,
  tariffConfig,
  emissionFactor,
  activeSimulation,
  onApplySimulation,
  onSelectMachineIn3D,
}: DigitalTwinViewProps) {
  // Case & preset selection
  const [activeCaseId, setActiveCaseId] = useState<string>('case-1-idle');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('SCN-IDLE-FIX');

  // Custom action state
  const [selectedMachineId, setSelectedMachineId] = useState<string>('COMP-01');
  const [actionType, setActionType] = useState<ScenarioAction['type']>('reduce_idle_power');
  const [targetPowerKw, setTargetPowerKw] = useState<number>(8.0);
  const [durationHours, setDurationHours] = useState<number>(3.0);
  const [offsetHours, setOffsetHours] = useState<number>(2);
  const [targetPressureBar, setTargetPressureBar] = useState<number>(6.8);

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
  const [showFormulaDrawer, setShowFormulaDrawer] = useState<boolean>(false);

  // Right column tab: 'simulator' | 'tradeoff' | 'investment' | 'ledger'
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('simulator');

  // Guided Demo Pipeline State
  const [activeDemoStep, setActiveDemoStep] = useState<number | null>(null);
  const [showDemoPipeline, setShowDemoPipeline] = useState<boolean>(true);

  // Verified Savings Ledger State
  const [mvLedger, setMvLedger] = useState<MVLedgerEntry[]>(INITIAL_MV_LEDGER);
  const [committedFeedback, setCommittedFeedback] = useState<string | null>(null);

  const selectedProfile = MACHINE_PROFILES[selectedMachineId] || MACHINE_PROFILES['COMP-01'];

  // Handle Case Selection
  const handleSelectCase = (c: IndustrialCase) => {
    setActiveCaseId(c.id);
    setSelectedPresetId(c.presetId);
    setSelectedMachineId(c.machineId);

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

  // Chart data calculation
  const chartData = useMemo(() => {
    const baseHourly = currentResult.baseline.hourly_plant || [];
    const scenHourly = currentResult.scenario.hourly_plant || [];

    return baseHourly.map((b, i) => {
      const s = scenHourly[i] || b;
      const hour = b.hour ?? (i % 24);
      const label = b.label || `${String(hour).padStart(2, '0')}:00`;

      const compProfile = MACHINE_PROFILES['COMP-01'];
      const cncProfile = MACHINE_PROFILES['CNC-01'];
      const furnProfile = MACHINE_PROFILES['FURN-01'];
      const paintProfile = MACHINE_PROFILES['PAINT-01'];

      let compKw = s.machines?.['COMP-01'] ?? (compProfile ? compProfile.rated_power_kw * 0.75 : 22.5);
      let cncKw = s.machines?.['CNC-01'] ?? (cncProfile ? cncProfile.rated_power_kw * 0.70 : 17.5);
      let furnKw = s.machines?.['FURN-01'] ?? (furnProfile ? furnProfile.rated_power_kw * 0.85 : 51.0);
      let paintKw = s.machines?.['PAINT-01'] ?? (paintProfile ? paintProfile.rated_power_kw * 0.60 : 27.0);

      if (hour >= 11 && hour <= 13 && actionType === 'reduce_idle_power' && selectedMachineId === 'COMP-01') {
        compKw = targetPowerKw;
      }
      if (selectedMachineId === 'CNC-01' && actionType === 'shift_schedule') {
        const shiftedHour = (hour - offsetHours + 24) % 24;
        cncKw = shiftedHour >= 8 && shiftedHour <= 16 ? 17.5 : 3.0;
      }

      return {
        hour,
        label,
        baselineKw: Number((b.kw ?? 0).toFixed(1)),
        scenarioKw: Number((s.kw ?? 0).toFixed(1)),
        compressor: Number(compKw.toFixed(1)),
        cnc: Number(cncKw.toFixed(1)),
        furnace: Number(furnKw.toFixed(1)),
        paint: Number(paintKw.toFixed(1)),
      };
    });
  }, [currentResult, actionType, selectedMachineId, targetPowerKw, offsetHours]);

  const feasibilityClass =
    currentResult.feasibility === 'feasible'
      ? 'status-feasible'
      : currentResult.feasibility === 'review_required'
      ? 'status-review'
      : 'status-blocked';

  // Dynamic Investment Case based on Sensor Sufficiency toggle (Idea A)
  const inv = useMemo(() => {
    return calculateInvestmentCase(
      currentResult,
      { ...currentResult.action_executed, sensor_quality: sensorQuality },
      hasFlowMeter || sensorQuality === 'good'
    );
  }, [currentResult, hasFlowMeter, sensorQuality]);

  const activeCase = INDUSTRIAL_CASES.find(c => c.id === activeCaseId);

  return (
    <div className="digital-twin-view scroll-area">
      {/* ─── 1. Header Banner ────────────────────────────────────────────── */}
      <div className="dt-top-banner">
        <div>
          <div className="dt-title">
            <Sliders size={18} className="text-cyan" />
            <span>Operational Decision &amp; Counterfactual Twin</span>
            <span className="dt-badge-sub">KPCL Problem Statement 1 · PrecisionWorks</span>
          </div>
          <div className="dt-subtitle">
            <span>Deterministic Scenario Simulation</span>
            <span className="dt-pill-tag">Idea A: Sensor Sufficiency</span>
            <span className="dt-pill-tag">Idea C: Production-Safe Interlocks</span>
            <span className="dt-pill-tag">Idea B: Counterfactual M&amp;V</span>
          </div>
        </div>

        <div className="dt-banner-actions">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => setShowDemoPipeline(!showDemoPipeline)}
            title="Toggle step-by-step hackathon demo presentation guide"
          >
            <Compass size={12} />
            {showDemoPipeline ? 'Hide Demo Guide' : 'Show Demo Guide'}
          </button>

          <button
            className="btn btn-outline btn-sm"
            onClick={handleResetToBaseline}
            title="Reset scenario to un-modified factory baseline"
          >
            <RotateCcw size={12} />
            Reset Baseline
          </button>

          <button
            className={`btn btn-emerald btn-sm ${isOptimizing ? 'loading' : ''}`}
            onClick={handleRunOptimizer}
            title="Run algorithmic search across start-time offsets to minimize plant peak load"
          >
            <Sparkles size={12} />
            {isOptimizing ? 'Optimizing...' : 'Auto-Stagger Peak'}
          </button>

          <button
            className="btn btn-cyan btn-sm"
            onClick={() => onApplySimulation(currentResult)}
            disabled={currentResult.feasibility === 'blocked'}
            title={
              currentResult.feasibility === 'blocked'
                ? 'Cannot apply blocked scenario'
                : 'Commit scenario metrics to Dashboard, 3D Twin & Audit Report'
            }
          >
            <CheckCircle2 size={12} />
            Apply to Platform
          </button>
        </div>
      </div>

      {/* ─── 2. Guided Demo Pipeline Bar (Hackathon Walkthrough) ─────────────── */}
      {showDemoPipeline && (
        <div className="dt-pipeline-bar">
          <div className="dt-case-header-row">
            <div className="dt-case-section-title">
              <Compass size={14} className="text-cyan" />
              <span>3-Minute Judging Demo Pipeline</span>
            </div>
            <span className="dt-case-badge-guide">
              Click steps 1 → 4 sequentially for an airtight presentation pitch
            </span>
          </div>

          <div className="dt-pipeline-nav">
            {DEMO_PIPELINE.map(step => {
              const isStepActive = activeDemoStep === step.stepNum;
              return (
                <button
                  key={step.stepNum}
                  onClick={() => handleDemoStepClick(step)}
                  className={`dt-pipeline-btn ${isStepActive ? 'active' : ''}`}
                >
                  <div className="dt-pipeline-step-hdr">
                    <span>{step.label}</span>
                  </div>
                  <div className="dt-pipeline-tag">{step.ideaTag}</div>
                </button>
              );
            })}
          </div>

          {activeDemoStep !== null && (
            <div className="dt-pipeline-script-banner">
              <Sparkles size={14} className="text-amber" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Presenter Talking Point: </strong>
                <span>{DEMO_PIPELINE.find(s => s.stepNum === activeDemoStep)?.pitchScript}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── 3. Case-Specific Selector Grid ─────────────────────────────────── */}
      <div className="dt-case-selector-box">
        <div className="dt-case-header-row">
          <div className="dt-case-section-title">
            <Target size={14} className="text-cyan" />
            <span>Select Industrial Case Study:</span>
          </div>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            Pre-configured physical scenarios with verified plant constraints
          </span>
        </div>

        <div className="dt-case-cards-grid">
          {INDUSTRIAL_CASES.map(c => {
            const isSelected = activeCaseId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => handleSelectCase(c)}
                className={`dt-case-card ${isSelected ? 'active' : ''}`}
              >
                <div className="dt-case-card-top">
                  <span className={`dt-case-tag ${c.tagClass}`}>{c.caseNum}</span>
                  <span className="dt-case-asset-lbl">{c.machineId}</span>
                </div>
                <div className="dt-case-title">{c.title}</div>
                <div className="dt-case-desc">{c.summary}</div>
                <div className="dt-case-target-metric">
                  <span style={{ color: '#64748b' }}>Impact:</span>
                  <span className={`text-${c.tagClass}`}>{c.targetBenefit}</span>
                </div>
              </div>
            );
          })}

          {/* Custom Sandbox Tile */}
          <div
            onClick={() => setActiveCaseId('custom')}
            className={`dt-case-card ${activeCaseId === 'custom' ? 'active' : ''}`}
            style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}
          >
            <Sliders size={16} className="text-cyan" style={{ marginBottom: 4 }} />
            <div className="dt-case-title" style={{ fontSize: 11 }}>Custom Sandbox</div>
            <div style={{ fontSize: 9.5, color: '#64748b' }}>Free engineering setpoints</div>
          </div>
        </div>
      </div>

      {/* ─── 4. Sleek 5-Column KPI Metrics Overview ─────────────────────────── */}
      <div className="dt-kpi-grid-5">
        {/* Total Energy */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">24h Plant Energy</span>
            <Zap size={13} className="text-cyan" />
          </div>
          <div className="dt-kpi-main-val">
            <span className="dt-kpi-primary">{currentResult.scenario.total_energy_kwh.toLocaleString()}</span>
            <span className="dt-kpi-unit">kWh</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Base: {currentResult.baseline.total_energy_kwh.toLocaleString()}</span>
            <span className={`dt-kpi-delta-pill ${currentResult.deltas.energy_kwh <= 0 ? 'positive' : 'negative'}`}>
              {currentResult.deltas.energy_kwh <= 0 ? '▼ ' : '▲ '}
              {Math.abs(currentResult.deltas.energy_kwh).toFixed(1)} kWh
            </span>
          </div>
        </div>

        {/* SEC Intensity */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">Specific Energy (SEC)</span>
            <BarChart3 size={13} className="text-emerald" />
          </div>
          <div className="dt-kpi-main-val">
            <span className="dt-kpi-primary">{currentResult.scenario.sec_kwh_per_unit || '5.16'}</span>
            <span className="dt-kpi-unit">kWh/part</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Base: {currentResult.baseline.sec_kwh_per_unit || '5.24'}</span>
            <span className={`dt-kpi-delta-pill ${((currentResult.scenario.sec_kwh_per_unit || 5.16) <= (currentResult.baseline.sec_kwh_per_unit || 5.24)) ? 'positive' : 'negative'}`}>
              {((currentResult.scenario.sec_kwh_per_unit || 5.16) <= (currentResult.baseline.sec_kwh_per_unit || 5.24)) ? '▼ Optimized' : '▲ High'}
            </span>
          </div>
        </div>

        {/* Peak Demand */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">Peak Demand</span>
            <Gauge size={13} className="text-amber" />
          </div>
          <div className="dt-kpi-main-val">
            <span className={`dt-kpi-primary ${currentResult.scenario.peak_demand_kw > tariffConfig.contract_demand_limit_kw ? 'text-red' : ''}`}>
              {currentResult.scenario.peak_demand_kw}
            </span>
            <span className="dt-kpi-unit">kW</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Limit: {tariffConfig.contract_demand_limit_kw} kW</span>
            <span className={`dt-kpi-delta-pill ${currentResult.deltas.peak_kw <= 0 ? 'positive' : 'negative'}`}>
              {currentResult.deltas.peak_kw <= 0 ? 'Normal' : '▲ Exceeds'}
            </span>
          </div>
        </div>

        {/* Daily Energy Cost */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">Daily Energy Cost</span>
            <DollarSign size={13} className="text-emerald" />
          </div>
          <div className="dt-kpi-main-val">
            <span className="dt-kpi-primary">₹{currentResult.scenario.total_cost_inr.toLocaleString()}</span>
            <span className="dt-kpi-unit">/day</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Base: ₹{currentResult.baseline.total_cost_inr.toLocaleString()}</span>
            <span className={`dt-kpi-delta-pill ${currentResult.deltas.cost_inr <= 0 ? 'positive' : 'negative'}`}>
              {currentResult.deltas.cost_inr <= 0 ? '▼ -₹' : '▲ +₹'}
              {Math.abs(currentResult.deltas.cost_inr).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Scope 2 Grid Carbon */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">Scope 2 Grid Carbon</span>
            <Leaf size={13} className="text-violet" />
          </div>
          <div className="dt-kpi-main-val">
            <span className="dt-kpi-primary">{(currentResult.scenario.scope2_kg_co2e ?? 0).toFixed(1)}</span>
            <span className="dt-kpi-unit">kg CO₂e</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Base: {(currentResult.baseline.scope2_kg_co2e ?? 0).toFixed(1)} kg</span>
            <span className={`dt-kpi-delta-pill ${(currentResult.deltas.scope2_kg_co2e ?? 0) <= 0 ? 'positive' : 'negative'}`}>
              {(currentResult.deltas.scope2_kg_co2e ?? 0) <= 0 ? '▼ -' : '▲ +'}
              {Math.abs(currentResult.deltas.scope2_kg_co2e ?? 0).toFixed(1)} kg
            </span>
          </div>
        </div>
      </div>

      {/* ─── 5. Main 2-Column Responsive Workbench ──────────────────────────── */}
      <div className="dt-main-grid">
        {/* Left Column: Focused Controls & Immediate Feasibility (<500px total height) */}
        <div className="dt-left-col">
          {/* Target Asset Selector (Compact Pill Group) */}
          <div className="panel dt-panel">
            <div className="panel-hdr" style={{ padding: '8px 12px' }}>
              <Cpu size={12} className="text-cyan" />
              <span>1. Target Physical Asset</span>
            </div>
            <div style={{ padding: '8px 10px' }}>
              <div className="dt-asset-pill-row">
                {Object.values(MACHINE_PROFILES).map(profile => {
                  const isSelected = selectedMachineId === profile.machine_id;
                  return (
                    <button
                      key={profile.machine_id}
                      type="button"
                      onClick={() => {
                        setSelectedMachineId(profile.machine_id);
                        if (onSelectMachineIn3D && profile.model3DId) {
                          onSelectMachineIn3D(profile.model3DId);
                        }
                      }}
                      className={`dt-asset-pill ${isSelected ? 'active' : ''}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: profile.color }} />
                        <span className="pill-id">{profile.machine_id}</span>
                      </div>
                      <span className="pill-kw">{profile.rated_power_kw}kW</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Parameters Form (Compact & Clean) */}
          <div className="panel dt-panel">
            <div className="panel-hdr" style={{ padding: '8px 12px' }}>
              <Sliders size={12} />
              <span>2. Intervention Parameters</span>
            </div>
            <div className="dt-action-form" style={{ padding: '10px 12px', gap: 10 }}>
              {/* Action Type Dropdown */}
              <div className="form-group">
                <label className="form-label">Intervention Action</label>
                <select
                  className="dt-select"
                  value={actionType}
                  onChange={e => setActionType(e.target.value as ScenarioAction['type'])}
                >
                  <option value="reduce_idle_power">Reduce Avoidable Idle Power (Auto-Cutoff)</option>
                  <option value="shift_schedule">Load Shifting / Schedule Offset (Peak Shaving)</option>
                  <option value="pressure_optimization">Pneumatic Pressure Setpoint Tuning (bar)</option>
                  <option value="reduce_runtime">Reduce Operating Window (Runtime Reduction)</option>
                </select>
              </div>

              {/* Dynamic Action Fields */}
              {actionType === 'reduce_idle_power' && (
                <>
                  <div className="form-group">
                    <div className="form-label-row">
                      <span className="form-label">Target Idle Power</span>
                      <span className="form-val">{targetPowerKw.toFixed(1)} kW</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={selectedProfile.rated_power_kw * 1.5}
                      step={0.5}
                      value={targetPowerKw}
                      onChange={e => setTargetPowerKw(parseFloat(e.target.value))}
                      className="dt-range"
                    />
                    <div className="range-hints">
                      <span>0 kW (Off)</span>
                      <span>Idle: {selectedProfile.expected_idle_power_kw} kW</span>
                      <span className={targetPowerKw > selectedProfile.rated_power_kw ? 'text-red font-bold' : ''}>
                        Rated: {selectedProfile.rated_power_kw} kW
                      </span>
                    </div>
                    {targetPowerKw > selectedProfile.rated_power_kw && (
                      <div className="form-warning text-red" style={{ fontSize: 10, marginTop: 3 }}>
                        <AlertTriangle size={11} /> Exceeds rated {selectedProfile.rated_power_kw} kW! Will trigger interlock block.
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <div className="form-label-row">
                      <span className="form-label">Duration Applied</span>
                      <span className="form-val">{durationHours} hours</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={0.5}
                      value={durationHours}
                      onChange={e => setDurationHours(parseFloat(e.target.value))}
                      className="dt-range"
                    />
                    <div className="range-hints">
                      <span>1 hr</span>
                      <span>Break: 3 hrs</span>
                      <span>6 hrs</span>
                    </div>
                  </div>
                </>
              )}

              {actionType === 'shift_schedule' && (
                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">Schedule Offset</span>
                    <span className="form-val">
                      {offsetHours >= 0 ? `+${offsetHours} hrs` : `${offsetHours} hrs`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-3}
                    max={4}
                    step={1}
                    value={offsetHours}
                    onChange={e => setOffsetHours(parseInt(e.target.value))}
                    className="dt-range"
                  />
                  <div className="range-hints">
                    <span>-3 hrs</span>
                    <span>0 (No Shift)</span>
                    <span>+2 hrs (Optimal)</span>
                    <span>+4 hrs</span>
                  </div>
                </div>
              )}

              {actionType === 'pressure_optimization' && (
                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">Discharge Pressure</span>
                    <span className="form-val">{targetPressureBar.toFixed(1)} bar</span>
                  </div>
                  <input
                    type="range"
                    min={6.0}
                    max={7.5}
                    step={0.1}
                    value={targetPressureBar}
                    onChange={e => setTargetPressureBar(parseFloat(e.target.value))}
                    className="dt-range"
                  />
                  <div className="range-hints">
                    <span className={targetPressureBar < 6.5 ? 'text-red font-bold' : ''}>
                      Min: 6.0 (Floor: 6.5)
                    </span>
                    <span>Optimal: 6.8 bar</span>
                    <span>Set: 7.5 bar</span>
                  </div>
                  {targetPressureBar < 6.5 && (
                    <div className="form-warning text-red" style={{ fontSize: 10, marginTop: 3 }}>
                      <AlertCircle size={11} /> Below 6.5 bar ring main floor! Clamps may fail.
                    </div>
                  )}
                </div>
              )}

              {actionType === 'reduce_runtime' && (
                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">Hours Trimmed</span>
                    <span className="form-val">{durationHours} hrs</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={durationHours}
                    onChange={e => setDurationHours(parseFloat(e.target.value))}
                    className="dt-range"
                  />
                </div>
              )}

              {/* Operating State Readout */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', background: 'var(--bg-elevated)', borderRadius: 5, fontSize: 10.5 }}>
                <span style={{ color: '#64748b' }}>State &amp; Load Factor:</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {targetPowerKw === 0 ? 'State 0 (Off · 0.00 LF)' : targetPowerKw <= selectedProfile.expected_idle_power_kw ? `State 1 (Idle · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)` : `State 2 (Run · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)`}
                </span>
              </div>

              {/* Collapsible Advanced Climate & Telemetry (ISO 1217) */}
              <div className="dt-advanced-details">
                <div
                  className="dt-advanced-summary"
                  onClick={() => setShowAdvancedClimate(!showAdvancedClimate)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sliders size={11} className="text-cyan" />
                    <span>Advanced Telemetry &amp; Climate</span>
                  </div>
                  {showAdvancedClimate ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </div>

                {showAdvancedClimate && (
                  <div className="dt-advanced-content">
                    {/* Sensor Quality */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                        <span style={{ color: '#475569' }}>Sensor Quality (Idea A)</span>
                        <span style={{ fontWeight: 600, color: sensorQuality === 'good' ? '#059669' : sensorQuality === 'suspect' ? '#ea580c' : '#dc2626' }}>
                          {sensorQuality.toUpperCase()} {sensorQuality === 'good' ? '(±5%)' : sensorQuality === 'suspect' ? '(±20%)' : '(±35%)'}
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
                              padding: '3px 4px',
                              borderRadius: 4,
                              fontSize: 9.5,
                              fontWeight: 500,
                              border: '1px solid',
                              borderColor: sensorQuality === q ? 'var(--cyan)' : 'var(--border)',
                              background: sensorQuality === q ? 'rgba(2, 132, 199, 0.1)' : '#ffffff',
                              color: sensorQuality === q ? 'var(--cyan)' : '#64748b',
                              cursor: 'pointer',
                              textTransform: 'capitalize',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Ambient Temp */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                        <span style={{ color: '#475569' }}>Ambient Temp (ISO 1217)</span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{ambientTempC.toFixed(1)}°C</span>
                      </div>
                      <input
                        type="range"
                        min={15}
                        max={45}
                        step={0.5}
                        value={ambientTempC}
                        onChange={e => setAmbientTempC(parseFloat(e.target.value))}
                        className="dt-range"
                      />
                    </div>

                    {/* Shift Pattern */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                        <span style={{ color: '#475569' }}>Shift Pattern</span>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{shiftPattern}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(['3_shift', '2_shift', 'day_shift'] as const).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setShiftPattern(p)}
                            style={{
                              flex: 1,
                              padding: '3px 4px',
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 500,
                              border: '1px solid',
                              borderColor: shiftPattern === p ? 'var(--cyan)' : 'var(--border)',
                              background: shiftPattern === p ? 'rgba(2, 132, 199, 0.1)' : '#ffffff',
                              color: shiftPattern === p ? 'var(--cyan)' : '#64748b',
                              cursor: 'pointer',
                            }}
                          >
                            {p === '3_shift' ? '3-Shift' : p === '2_shift' ? '2-Shift' : 'Day'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button className="btn btn-cyan btn-full" onClick={handleRunSimulation} style={{ padding: '7px 12px' }}>
                <Play size={12} />
                Recalculate Dynamic Simulation
              </button>
            </div>
          </div>

          {/* Physical Constraint Interlocks Panel (Sits directly above fold!) */}
          <div className="panel dt-panel">
            <div className="panel-hdr" style={{ padding: '8px 12px' }}>
              <ShieldAlert size={12} />
              <span>3. Constraint Interlocks &amp; Feasibility</span>
            </div>
            <div className="dt-constraint-content" style={{ padding: '10px 12px', gap: 8 }}>
              {/* Feasibility Banner */}
              <div className={`dt-feasibility-badge ${feasibilityClass}`} style={{ padding: '8px 10px' }}>
                {currentResult.feasibility === 'feasible' && (
                  <>
                    <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                    <div>
                      <div className="status-title" style={{ fontSize: 11 }}>FEASIBLE SIMULATION</div>
                      <div className="status-desc" style={{ fontSize: 9.5 }}>All safety, pressure &amp; process constraints passed</div>
                    </div>
                  </>
                )}
                {currentResult.feasibility === 'review_required' && (
                  <>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <div>
                      <div className="status-title" style={{ fontSize: 11 }}>REVIEW REQUIRED</div>
                      <div className="status-desc" style={{ fontSize: 9.5 }}>Passed with advisory conditions for operator sign-off</div>
                    </div>
                  </>
                )}
                {currentResult.feasibility === 'blocked' && (
                  <>
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <div>
                      <div className="status-title" style={{ fontSize: 11 }}>BLOCKED BY SAFETY INTERLOCK</div>
                      <div className="status-desc" style={{ fontSize: 9.5 }}>Scenario violates equipment or process limits</div>
                    </div>
                  </>
                )}
              </div>

              {/* Violations / Diagnostic details */}
              {currentResult.constraint_violations.length > 0 && (
                <div className="dt-violations-list">
                  {currentResult.constraint_violations.map((v, i) => (
                    <div key={i} className={`dt-violation-item severity-${v.severity}`}>
                      <div className="viol-hdr">
                        <span className="viol-code">{v.code}</span>
                        <span className="viol-machine">{v.machine_id}</span>
                      </div>
                      <div className="viol-msg">{v.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Clean Analytics Tabs & Uncrowded Visualizations */}
        <div className="dt-right-col">
          {/* Active Case Context Briefing Strip */}
          {activeCase && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: '#1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`dt-case-tag ${activeCase.tagClass}`}>{activeCase.caseNum}</span>
                <span><strong>{activeCase.title}: </strong>{activeCase.summary}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan)' }}>
                {activeCase.machineId}
              </span>
            </div>
          )}

          {/* Crisp, Unclipped Tab Header */}
          <div className="dt-tabs-header">
            <button
              className={`dt-tab-btn ${analyticsTab === 'simulator' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('simulator')}
            >
              <Activity size={13} /> 24h Load Curve
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'tradeoff' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('tradeoff')}
            >
              <CheckSquare size={13} /> Trade-Offs (Idea C)
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'investment' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('investment')}
            >
              <Award size={13} /> Sensor VOI (Idea A)
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('ledger')}
            >
              <BookmarkCheck size={13} /> M&amp;V Ledger (Idea B)
              <span className="badge badge-emerald" style={{ fontSize: 8, padding: '1px 5px', marginLeft: 4 }}>
                {mvLedger.length} VERIFIED
              </span>
            </button>
          </div>

          {/* TAB 1: 24h Factory Demand Curves */}
          {analyticsTab === 'simulator' && (
            <>
              {/* Primary Dual Overlay Load Curve */}
              <div className="panel dt-panel dt-chart-panel">
                <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="hdr-left" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Activity size={13} className="text-cyan" />
                    <span style={{ fontWeight: 600 }}>24-Hour Factory Demand Curve: Baseline vs. Simulated Scenario</span>
                  </div>
                  <div className="hdr-badges" style={{ display: 'flex', gap: 6 }}>
                    <span className="badge badge-amber" style={{ textTransform: 'none', fontSize: 10 }}>Baseline (Dashed)</span>
                    <span className="badge badge-cyan" style={{ textTransform: 'none', fontSize: 10 }}>Simulated (Solid)</span>
                    <span className="badge badge-red" style={{ textTransform: 'none', fontSize: 10 }}>85 kW Limit</span>
                  </div>
                </div>

                <div style={{ height: 260, padding: '12px 6px 0 0' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scenGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(0, 0, 0, 0.06)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} fontFamily="var(--font-mono)" tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={10} fontFamily="var(--font-mono)" unit=" kW" tickLine={false} domain={[0, 110]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                          fontFamily: 'var(--font-ui)',
                          fontSize: 11,
                          color: '#0f172a',
                        }}
                      />
                      <ReferenceLine
                        y={tariffConfig.contract_demand_limit_kw}
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        label={{
                          value: `Contract Limit ${tariffConfig.contract_demand_limit_kw} kW`,
                          fill: '#ef4444',
                          fontSize: 9.5,
                          position: 'top',
                          fontFamily: 'var(--font-mono)',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="baselineKw"
                        name="Baseline Load"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="scenarioKw"
                        name="Simulated Scenario"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        fill="url(#scenGrad)"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Machine-Level Composition Bar Chart */}
              <div className="panel dt-panel dt-chart-panel" style={{ marginTop: 12 }}>
                <div className="panel-hdr" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={12} className="text-emerald" />
                  <span>Machine-Wise Load Composition across 24h (Simulated Outcome)</span>
                </div>
                <div style={{ height: 140, padding: '8px 6px 0 0' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 15, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(0, 0, 0, 0.06)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={9} fontFamily="var(--font-mono)" tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={9} fontFamily="var(--font-mono)" unit=" kW" tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#ffffff',
                          border: '1px solid rgba(0, 0, 0, 0.1)',
                          borderRadius: 8,
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                          fontFamily: 'var(--font-ui)',
                          fontSize: 11,
                          color: '#0f172a',
                        }}
                      />
                      <Bar dataKey="compressor" name="COMP-01 (Air)" fill="#f59e0b" stackId="a" />
                      <Bar dataKey="cnc" name="CNC-01 (Machining)" fill="#22d3ee" stackId="a" />
                      <Bar dataKey="furnace" name="FURN-01 (Furnace)" fill="#ef4444" stackId="a" />
                      <Bar dataKey="paint" name="PAINT-01 (Paint)" fill="#10b981" stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: Multi-Option Trade-Off Matrix (Idea C) */}
          {analyticsTab === 'tradeoff' && (
            <div className="panel dt-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>
                    Production-Safe Optimization: 3-Candidate Trade-Off Matrix
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Evaluates aggressive energy reduction vs. production schedules and physical equipment interlocks
                  </div>
                </div>
                <span className="badge badge-cyan" style={{ fontFamily: 'var(--font-mono)' }}>
                  GOAL: ELIMINATE 96 kW PEAK
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
                        background: isRecommended ? 'rgba(16,185,129,0.06)' : '#ffffff',
                        border: `1px solid ${isRecommended ? '#10b981' : isBlocked ? '#ef4444' : '#f59e0b'}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className={`badge ${isRecommended ? 'badge-emerald' : isBlocked ? 'badge-red' : 'badge-amber'}`}
                            style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}
                          >
                            {cand.statusLabel}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                            {cand.name}
                          </span>
                        </div>
                        <button
                          className={`btn btn-sm ${isRecommended ? 'btn-emerald' : 'btn-outline'}`}
                          onClick={() => handleApplyCandidate(cand.id)}
                        >
                          {isRecommended ? 'Load Recommended Plan' : 'Test This Scenario'}
                          <ArrowRight size={10} style={{ marginLeft: 4 }} />
                        </button>
                      </div>

                      <div style={{ fontSize: 11, color: '#475569', marginBottom: 8 }}>
                        {cand.strategy}
                      </div>

                      {/* Metrics bar */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: '#f8fafc', padding: '8px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        <div>
                          <span style={{ color: '#64748b' }}>Peak Demand: </span>
                          <strong style={{ color: cand.peakKw > 85 ? '#dc2626' : '#059669' }}>{cand.peakKw} kW</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Energy Saved: </span>
                          <strong style={{ color: '#0284c7' }}>{cand.energyKwhSaved} kWh/d</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Production: </span>
                          <strong style={{ color: cand.productionUnits < 140 ? '#dc2626' : '#059669' }}>{cand.productionUnits} pcs</strong>
                        </div>
                        <div>
                          <span style={{ color: '#64748b' }}>Pressure: </span>
                          <strong style={{ color: cand.pressureBar < 6.5 ? '#dc2626' : '#0f172a' }}>{cand.pressureBar} bar</strong>
                        </div>
                      </div>

                      {/* Diagnostics */}
                      <div style={{ fontSize: 10, color: isBlocked ? '#dc2626' : isInfeasible ? '#d97706' : '#64748b', marginTop: 8, lineHeight: 1.4 }}>
                        <strong>Diagnostic Assessment:</strong> {cand.diagnostics}
                      </div>
                      {cand.provenance && (
                        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#94a3b8', marginTop: 4 }}>
                          [{cand.provenance}]
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Sensor-ROI & Confidence (Idea A: Epistemic Humility) */}
          {analyticsTab === 'investment' && inv && (
            <div className="panel dt-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>
                    Sensor Sufficiency &amp; Value of Information (Idea A)
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Diagnostic Humility: Resolves physical ambiguity · Evaluates sensor Value of Information (VOI)
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, background: inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`, color: inv.evidence_grade === 'A' ? '#059669' : '#d97706', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
                  <Award size={13} />
                  TELEMETRY READINESS {inv.evidence_grade}
                </div>
              </div>

              {/* Physical Diagnostic Ambiguity Banner */}
              {inv.diagnostic_ambiguity && (
                <div style={{ background: hasFlowMeter ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${hasFlowMeter ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 11, lineHeight: 1.5, color: '#334155' }}>
                  <strong style={{ color: hasFlowMeter ? '#059669' : '#d97706' }}>Physical Hypothesis Resolution: </strong>
                  {inv.diagnostic_ambiguity}
                </div>
              )}

              {/* Interactive Value of Information (VOI) Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasFlowMeter ? '#10b981' : '#f59e0b' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a' }}>
                      {hasFlowMeter ? 'Simulating with Inline Ultrasonic Flowmeter Installed' : 'Current Plant Telemetry (Electrical Submeter Only)'}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {hasFlowMeter
                        ? 'Confirmed zero break airflow. 100% of 18 kW draw is recoverable timer blow-off.'
                        : 'Uncertainty present: 40%–65% of idle draw could be unmetered pipe leaks. VOI Ratio: 4.5x.'}
                    </div>
                  </div>
                </div>

                <button
                  className={`btn btn-sm ${hasFlowMeter ? 'btn-emerald' : 'btn-outline'}`}
                  onClick={() => setHasFlowMeter(!hasFlowMeter)}
                >
                  {hasFlowMeter ? <Check size={11} style={{ marginRight: 4 }} /> : null}
                  {hasFlowMeter ? 'Flowmeter Active (+₹12k)' : 'Simulate Adding Flowmeter'}
                </button>
              </div>

              {/* 3-Tier Payback Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                {/* Conservative */}
                <div style={{ background: '#fafaf9', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>
                    Conservative Case
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#d97706', margin: '6px 0 2px' }}>
                    ₹{inv.conservative_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#334155' }}>
                    Payback: <strong style={{ color: '#0f172a' }}>{inv.payback_months_conservative} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    {hasFlowMeter ? 'Flowmeter locks certainty at 92% minimum savings.' : 'Accounts for unmetered pipe leaks & -20% factory volume.'}
                  </div>
                </div>

                {/* Expected */}
                <div style={{ background: 'rgba(2, 132, 199, 0.05)', border: '1px solid var(--cyan)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Expected Nominal Case
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', margin: '6px 0 2px' }}>
                    ₹{inv.expected_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#334155' }}>
                    Payback: <strong style={{ color: '#0f172a' }}>{inv.payback_months_expected} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Capex ₹{inv.capex_inr.toLocaleString()} (Relay{hasFlowMeter ? ' + Flowmeter' : ''}), nominal 140 parts.
                  </div>
                </div>

                {/* Best Case */}
                <div style={{ background: '#fafaf9', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#059669', textTransform: 'uppercase' }}>
                    Best-Case (+35%)
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#059669', margin: '6px 0 2px' }}>
                    ₹{inv.best_case_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#334155' }}>
                    Payback: <strong style={{ color: '#0f172a' }}>{inv.payback_months_best} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, lineHeight: 1.4 }}>
                    Dual-shift capacity + elimination of coincident 85 kW peak penalty.
                  </div>
                </div>
              </div>

              {/* Sensitivity to Missing Instrumentation */}
              <div style={{ background: '#fafaf9', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                  NIST Gap Analysis &amp; Value of Information
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inv.missing_measurements_sensitivity.map((note, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155' }}>
                      <span style={{ color: 'var(--cyan)', fontSize: 14 }}>•</span>
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Counterfactual M&V Factory (Idea B: IPMVP Option B/C) */}
          {analyticsTab === 'ledger' && (
            <div className="panel dt-panel" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>
                    The Counterfactual Factory: Post-Implementation M&amp;V Ledger
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Solves the post-implementation blame game · Separates production drops from real energy efficiency
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {committedFeedback && (
                    <span style={{ fontSize: 11, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                      {committedFeedback}
                    </span>
                  )}
                  <button
                    className="btn btn-emerald btn-sm"
                    onClick={handleCommitToLedger}
                    disabled={currentResult.feasibility === 'blocked'}
                  >
                    <BookmarkCheck size={12} />
                    Commit Active Scenario to Ledger
                  </button>
                </div>
              </div>

              {/* Idea B Counterfactual Waterfall Comparison Card */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Case Study A: Shift Contraction Audit (IPMVP Option B/C Reconciled)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#059669', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 3 }}>
                    Reconciliation: 170.57 + 14.43 = 185.00 kWh (100% Match)
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: '#64748b' }}>1. Raw Submeter Drop</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '4px 0 2px' }}>-185.00 kWh (-14.01%)</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>1,320.0 → 1,135.0 kWh</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: '#64748b' }}>2. Shift Output Deficit</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#d97706', margin: '4px 0 2px' }}>122 vs 140 parts (-12.86%)</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>Material delay on CNC</div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 9, color: '#64748b' }}>3. Production Drop Effect</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', margin: '4px 0 2px' }}>-170.57 kWh (-12.92%)</div>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>Output loss, not efficiency!</div>
                  </div>
                  <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid #10b981', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: '#059669', fontWeight: 600 }}>4. True Verified Efficiency</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', margin: '4px 0 2px' }}>-14.43 kWh/day (-1.09%)</div>
                    <div style={{ fontSize: 9, color: '#64748b' }}>11.83 kg CO₂e (72.15 kWh/wk)</div>
                  </div>
                </div>
              </div>

              {/* M&V Historical Table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="compare-table" style={{ fontSize: 10 }}>
                  <thead>
                    <tr>
                      <th>Intervention</th>
                      <th>Target Asset</th>
                      <th>Baseline (kWh / Parts)</th>
                      <th>Actual Post-Mod</th>
                      <th>Adjusted Baseline</th>
                      <th>Realized Saving</th>
                      <th>Realization %</th>
                      <th>Audit Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mvLedger.map((row, idx) => (
                      <tr key={idx}>
                        <td className="td-label" style={{ fontWeight: 600 }}>{row.title}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>{row.target_asset}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          {row.baseline_kwh.toFixed(0)} kWh ({row.baseline_units} pcs)
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#0f172a' }}>
                          {row.actual_measured_kwh.toFixed(0)} kWh ({row.actual_units} pcs)
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#d97706' }}>
                          {row.adjusted_baseline_kwh.toFixed(0)} kWh
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: '#059669', fontWeight: 700 }}>
                          {row.realized_savings_kwh.toFixed(1)} kWh
                        </td>
                        <td>
                          <span className={`badge ${row.realization_rate_pct >= 90 ? 'badge-emerald' : 'badge-amber'}`}>
                            {row.realization_rate_pct.toFixed(1)}%
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-cyan">
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

          {/* Traceability & Formula Accordion */}
          <div className="panel dt-panel" style={{ marginTop: 12 }}>
            <div
              className="panel-hdr clickable"
              onClick={() => setShowFormulaDrawer(!showFormulaDrawer)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} className="text-cyan" />
                <span>Single Source of Truth &amp; Mathematical Contracts</span>
              </div>
              <span className="text-cyan" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                {showFormulaDrawer ? 'Hide Details ▲' : 'Show Details ▼'}
              </span>
            </div>

            {showFormulaDrawer && (
              <div style={{ padding: '12px 14px' }}>
                <div className="formula-box">
                  <span className="formula-comment">// Operational Decision Twin Engineering Math (Section 6)</span>{'\n'}
                  {'interval_energy_kwh = average_power_kw × interval_duration_hours'}{'\n'}
                  {'plant_power_kw[t]   = sum(machine_power_kw[t] for all machines)'}{'\n'}
                  {`peak_demand_kw      = max(plant_power_kw[t]) → ${currentResult.scenario.peak_demand_kw} kW`}{'\n'}
                  {`sec_intensity       = total_energy_kwh / total_good_units → ${currentResult.scenario.sec_kwh_per_unit} kWh/part`}{'\n'}
                  {`scope2_kg_co2e      = total_energy_kwh × 0.82 kg CO₂e/kWh (CEA India Baseline v19)`}{'\n'}
                  <span style={{ color: '#059669' }}>
                    {`Verified Delta: Saved ${Math.abs(currentResult.deltas.energy_kwh)} kWh | ₹${Math.abs(currentResult.deltas.cost_inr)} | ${Math.abs(currentResult.deltas.scope2_kg_co2e || 0)} kg CO₂e`}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, lineHeight: 1.6 }}>
                  <strong>Governance Protocol:</strong> ISO 50001:2018 EnMS Clause 6.3 &amp; IPMVP Option B. Advisory simulation only. Plant Energy Manager sign-off required prior to DCS execution.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
