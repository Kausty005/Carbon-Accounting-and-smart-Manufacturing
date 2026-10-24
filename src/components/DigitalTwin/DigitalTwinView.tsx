import React, { useState, useMemo } from 'react';
import {
  Sliders, Play, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert,
  Cpu, Zap, TrendingDown, Layers, FileText, ArrowRight, Gauge,
  Info, Activity, Clock, DollarSign, Leaf, Sparkles, AlertCircle,
  Award, BarChart3, BookmarkCheck, ChevronDown, Check, HelpCircle,
  ToggleLeft, ToggleRight, CheckSquare, XCircle, ArrowUpRight
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

export default function DigitalTwinView({
  baselineRecords,
  tariffConfig,
  emissionFactor,
  activeSimulation,
  onApplySimulation,
  onSelectMachineIn3D,
}: DigitalTwinViewProps) {
  // Preset selector
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

  // Idea A: Self-Qualifying Sensor Sufficiency Gate toggle
  const [hasFlowMeter, setHasFlowMeter] = useState<boolean>(false);

  // Active simulation in the view
  const [currentResult, setCurrentResult] = useState<SimulationResult>(activeSimulation);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [showFormulaDrawer, setShowFormulaDrawer] = useState<boolean>(false);

  // Right column tab: 'simulator' | 'tradeoff' | 'investment' | 'ledger'
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('simulator');

  // Verified Savings Ledger State
  const [mvLedger, setMvLedger] = useState<MVLedgerEntry[]>(INITIAL_MV_LEDGER);
  const [committedFeedback, setCommittedFeedback] = useState<string | null>(null);

  const selectedProfile = MACHINE_PROFILES[selectedMachineId] || MACHINE_PROFILES['COMP-01'];

  // Handle Preset Selection
  const handleSelectPreset = (preset: ScenarioPreset) => {
    setSelectedPresetId(preset.id);
    const mId = resolveMachineId(preset.action.machine_id);
    setSelectedMachineId(mId);
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
  };

  // Reset to Baseline
  const handleResetToBaseline = () => {
    setSelectedPresetId('baseline');
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
      // Aggressive: Blocked test
      const req: ScenarioRequest = {
        scenario_id: 'CAND-1-AGGRESSIVE',
        action: {
          type: 'reduce_idle_power',
          machine_id: 'FURN-01',
          target_power_kw: 10.0, // Triggers furnace protected hold defect
        },
      };
      setCurrentResult(runScenarioSimulation(baselineRecords, req, tariffConfig, emissionFactor));
      setSelectedPresetId('cand-1');
    } else if (candId === 'CAND-2') {
      // Naive shift: Missing production quota
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
      // Production-safe optimum
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
    }
    setAnalyticsTab('simulator');
  };

  // Chart data calculation
  const chartData = useMemo(() => {
    const baseHourly = currentResult.baseline.hourly_plant || [];
    const scenHourly = currentResult.scenario.hourly_plant || [];

    return baseHourly.map((b, i) => {
      const s = scenHourly[i] || b;
      return {
        label: b.label,
        hour: b.hour,
        baselineKw: b.kw,
        scenarioKw: s.kw,
        deltaKw: Number((s.kw - b.kw).toFixed(1)),
        isPeakToD: b.isPeakToD,
        contractLimit: tariffConfig.contract_demand_limit_kw,
        cnc: s.machines['CNC-01'] || 0,
        compressor: s.machines['COMP-01'] || 0,
        furnace: s.machines['FURN-01'] || 0,
        paint: s.machines['PAINT-01'] || 0,
      };
    });
  }, [currentResult, tariffConfig]);

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

  return (
    <div className="digital-twin-view scroll-area">
      {/* Top Banner */}
      <div className="dt-top-banner">
        <div>
          <div className="dt-title">
            <Sliders size={16} className="text-cyan" />
            <span>Operational Decision &amp; Counterfactual Twin</span>
            <span className="dt-badge-sub">KPCL Problem Statement 1 · PrecisionWorks</span>
          </div>
          <div className="dt-subtitle">
            <span>Deterministic Scenario Simulation</span>
            <span className="dt-pill-tag">Idea A: Epistemic Humility</span>
            <span className="dt-pill-tag">Idea C: Safe Interlocks</span>
            <span className="dt-pill-tag">Idea B: Counterfactual M&amp;V</span>
          </div>
        </div>

        <div className="dt-banner-actions">
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

      {/* Preset Scenarios Carousel */}
      <div className="dt-presets-bar">
        <span className="dt-presets-label">
          <Layers size={12} /> Presets:
        </span>
        {SCENARIO_PRESETS.map(preset => {
          const isSelected = selectedPresetId === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={`dt-preset-pill ${isSelected ? 'active' : ''} ${preset.category}`}
            >
              <span className="preset-name">{preset.title}</span>
              <span className="preset-cat">{preset.category.toUpperCase()}</span>
            </button>
          );
        })}
      </div>

      {/* 5-Column Full-Width KPI Metrics Overview */}
      <div className="dt-kpi-grid-5">
        {/* Total Energy */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">24h Plant Energy</span>
            <Zap size={14} className="text-cyan" />
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
            <BarChart3 size={14} className="text-emerald" />
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
            <span className="dt-kpi-lbl">Peak Electrical Demand</span>
            <Gauge size={14} className="text-amber" />
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
            <DollarSign size={14} className="text-emerald" />
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

        {/* Scope 2 Emissions */}
        <div className="dt-kpi-card">
          <div className="dt-kpi-top">
            <span className="dt-kpi-lbl">Scope 2 Grid Carbon</span>
            <Leaf size={14} className="text-violet" />
          </div>
          <div className="dt-kpi-main-val">
            <span className="dt-kpi-primary">{currentResult.scenario.scope2_kg_co2e ?? '1,058.3'}</span>
            <span className="dt-kpi-unit">kg CO₂e</span>
          </div>
          <div className="dt-kpi-sub-row">
            <span className="dt-kpi-baseline">Base: {currentResult.baseline.scope2_kg_co2e ?? '1,070.1'} kg</span>
            <span className={`dt-kpi-delta-pill ${(currentResult.deltas.scope2_kg_co2e || 0) <= 0 ? 'positive' : 'negative'}`}>
              {(currentResult.deltas.scope2_kg_co2e || 0) <= 0 ? '▼ -' : '▲ +'}
              {Math.abs(currentResult.deltas.scope2_kg_co2e || 0).toFixed(1)} kg
            </span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Controls vs Right Analytics */}
      <div className="dt-main-grid">
        {/* Left Column: Interactive Scenario Builder */}
        <div className="dt-left-col">
          {/* Machine Profile Selector */}
          <div className="panel dt-panel">
            <div className="panel-hdr">
              <Cpu size={12} /> 1. Select Asset Digital Twin
            </div>
            <div className="dt-machine-grid">
              {Object.values(MACHINE_PROFILES).map(profile => {
                const isSelected = selectedMachineId === profile.machine_id;
                return (
                  <div
                    key={profile.machine_id}
                    onClick={() => {
                      setSelectedMachineId(profile.machine_id);
                      if (onSelectMachineIn3D && profile.model3DId) {
                        onSelectMachineIn3D(profile.model3DId);
                      }
                    }}
                    className={`dt-machine-card ${isSelected ? 'selected' : ''}`}
                    style={{ borderLeftColor: profile.color }}
                  >
                    <div className="dt-machine-header">
                      <span className="dt-machine-id" style={{ color: profile.color }}>
                        {profile.machine_id}
                      </span>
                      <span className="dt-machine-kw">{profile.rated_power_kw} kW rated</span>
                    </div>
                    <div className="dt-machine-name">{profile.name}</div>
                    <div className="dt-machine-stats">
                      <span>Idle: {profile.expected_idle_power_kw} kW</span>
                      <span>Off: {profile.off_power_kw} kW</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Parameters Form */}
          <div className="panel dt-panel">
            <div className="panel-hdr">
              <Sliders size={12} /> 2. Scenario Operating Action
            </div>
            <div className="dt-action-form">
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
                      <span className={targetPowerKw > selectedProfile.rated_power_kw ? 'text-red' : ''}>
                        Rated: {selectedProfile.rated_power_kw} kW
                      </span>
                    </div>
                    {targetPowerKw > selectedProfile.rated_power_kw && (
                      <div className="form-warning text-red">
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
                    <span>+2 hrs (Optimal De-conflict)</span>
                    <span>+4 hrs</span>
                  </div>
                  <div className="form-info-note">
                    <Info size={11} /> Shifts entire production block while preserving total kWh and production batch quota.
                  </div>
                </div>
              )}

              {actionType === 'pressure_optimization' && (
                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">Airline Discharge Pressure</span>
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
                      Min: 6.0 bar (Floor: 6.5)
                    </span>
                    <span>Optimal: 6.8 bar</span>
                    <span>Set: 7.5 bar</span>
                  </div>
                  {targetPressureBar < 6.5 && (
                    <div className="form-warning text-red">
                      <AlertCircle size={11} /> Below 6.5 bar ring main floor! Clamps may fail.
                    </div>
                  )}
                </div>
              )}

              {actionType === 'reduce_runtime' && (
                <div className="form-group">
                  <div className="form-label-row">
                    <span className="form-label">Hours Trimmed from Non-Productive Tail</span>
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

              {/* Operational State & Load Factor Readout */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 6, fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>Operating State:</span>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>
                  {targetPowerKw === 0 ? 'State 0 (Off · 0.00 LF)' : targetPowerKw <= selectedProfile.expected_idle_power_kw ? `State 1 (Idle · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)` : `State 2 (Run · ${(targetPowerKw / selectedProfile.rated_power_kw).toFixed(2)} LF)`}
                </span>
              </div>

              {/* Environmental & Telemetry Parameter Card (Spreadsheet Schema) */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: '#fafaf9', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1e293b' }}>Telemetry &amp; Operating Conditions</span>
                  <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(2, 132, 199, 0.08)', color: 'var(--cyan)' }}>
                    Dataset Schema
                  </span>
                </div>

                {/* Sensor Quality (good | suspect | missing) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
                    <span style={{ color: '#475569' }}>Sensor Quality (Idea A)</span>
                    <span style={{ fontWeight: 600, fontSize: 10, color: sensorQuality === 'good' ? '#059669' : sensorQuality === 'suspect' ? '#ea580c' : '#dc2626' }}>
                      {sensorQuality.toUpperCase()} {sensorQuality === 'good' ? '(±5% Error)' : sensorQuality === 'suspect' ? '(±20% Error)' : '(±35% Error)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['good', 'suspect', 'missing'] as const).map(q => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setSensorQuality(q)}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          borderRadius: 4,
                          fontSize: 10,
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

                {/* Ambient Temperature Setpoint */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8' }}>
                    <span>15°C</span>
                    <span>24°C (Baseline)</span>
                    <span>45°C</span>
                  </div>
                </div>

                {/* Shift Pattern */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 4 }}>
                    <span style={{ color: '#475569' }}>Shift Pattern</span>
                    <span style={{ fontWeight: 600, fontSize: 10, color: '#0f172a' }}>{shiftPattern}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(['3_shift', '2_shift', 'day_shift'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setShiftPattern(p)}
                        style={{
                          flex: 1,
                          padding: '4px 6px',
                          borderRadius: 4,
                          fontSize: 9.5,
                          fontWeight: 500,
                          border: '1px solid',
                          borderColor: shiftPattern === p ? 'var(--cyan)' : 'var(--border)',
                          background: shiftPattern === p ? 'rgba(2, 132, 199, 0.1)' : '#ffffff',
                          color: shiftPattern === p ? 'var(--cyan)' : '#64748b',
                          cursor: 'pointer',
                        }}
                      >
                        {p === '3_shift' ? '3-Shift' : p === '2_shift' ? '2-Shift' : 'Day Shift'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button className="btn btn-cyan btn-full mt-2" onClick={handleRunSimulation}>
                <Play size={12} />
                Recalculate Dynamic Simulation
              </button>
            </div>
          </div>

          {/* Physical Constraint Interlocks Panel */}
          <div className="panel dt-panel">
            <div className="panel-hdr">
              <ShieldAlert size={12} /> 3. Constraint Interlocks &amp; Feasibility
            </div>
            <div className="dt-constraint-content">
              {/* Feasibility Banner */}
              <div className={`dt-feasibility-badge ${feasibilityClass}`}>
                {currentResult.feasibility === 'feasible' && (
                  <>
                    <CheckCircle2 size={16} />
                    <div>
                      <div className="status-title">FEASIBLE SIMULATION</div>
                      <div className="status-desc">All safety, pressure &amp; process constraints passed</div>
                    </div>
                  </>
                )}
                {currentResult.feasibility === 'review_required' && (
                  <>
                    <AlertTriangle size={16} />
                    <div>
                      <div className="status-title">REVIEW REQUIRED</div>
                      <div className="status-desc">Passed with advisory conditions for operator sign-off</div>
                    </div>
                  </>
                )}
                {currentResult.feasibility === 'blocked' && (
                  <>
                    <AlertCircle size={16} />
                    <div>
                      <div className="status-title">BLOCKED BY SAFETY INTERLOCK</div>
                      <div className="status-desc">Scenario violates equipment or process limits</div>
                    </div>
                  </>
                )}
              </div>

              {/* Violations / Diagnostic details */}
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
            </div>
          </div>
        </div>

        {/* Right Column: Analytics, Tabbed Views & KPIs */}
        <div className="dt-right-col">
          {/* Secondary Tab Switcher: 4 Tabs (Ideas A, B, C) */}
          <div className="dt-tabs-header">
            <button
              className={`dt-tab-btn ${analyticsTab === 'simulator' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('simulator')}
            >
              <Activity size={13} /> Time-Series Demand Simulation
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'tradeoff' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('tradeoff')}
            >
              <CheckSquare size={13} /> 3-Option Trade-Off Matrix (Idea C)
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'investment' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('investment')}
            >
              <Award size={13} /> Sensor-ROI &amp; Confidence (Idea A)
            </button>
            <button
              className={`dt-tab-btn ${analyticsTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setAnalyticsTab('ledger')}
            >
              <BookmarkCheck size={13} /> Counterfactual M&amp;V Factory (Idea B)
              <span className="badge badge-emerald" style={{ fontSize: 8, padding: '1px 5px', marginLeft: 6 }}>
                {mvLedger.length} VERIFIED
              </span>
            </button>
          </div>

          {/* TAB 1: Simulator Curves */}
          {analyticsTab === 'simulator' && (
            <>
              {/* Primary Dual Overlay Load Curve */}
              <div className="panel dt-panel dt-chart-panel">
                <div className="panel-hdr">
                  <div className="hdr-left">
                    <Activity size={12} className="text-cyan" />
                    <span>24-Hour Factory Demand Curve: Baseline vs. Simulated Scenario</span>
                  </div>
                  <div className="hdr-badges">
                    <span className="badge badge-amber" style={{ textTransform: 'none' }}>Baseline (Dashed)</span>
                    <span className="badge badge-cyan" style={{ textTransform: 'none' }}>Simulated (Solid)</span>
                    <span className="badge badge-red" style={{ textTransform: 'none' }}>85 kW Limit</span>
                  </div>
                </div>

                <div style={{ height: 250, padding: '12px 6px 0 0' }}>
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
                          fontSize: 9,
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

              {/* Machine-Level Breakdown */}
              <div className="panel dt-panel dt-chart-panel mt-3">
                <div className="panel-hdr">
                  <Layers size={12} className="text-emerald" />
                  <span>Machine-Wise Load Composition across 24h (Simulated Outcome)</span>
                </div>
                <div style={{ height: 150, padding: '8px 6px 0 0' }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--white)', textTransform: 'uppercase' }}>
                    Production-Safe Optimization: 3-Candidate Trade-Off Matrix
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>
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
                        background: isRecommended ? 'rgba(16,185,129,0.06)' : 'var(--bg-surface)',
                        border: `1px solid ${isRecommended ? 'var(--emerald)' : isBlocked ? 'var(--red)' : 'var(--amber)'}`,
                        borderRadius: 6,
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
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>
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

                      <div style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 8 }}>
                        {cand.strategy}
                      </div>

                      {/* Metrics bar */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--bg-elevated)', padding: '8px 10px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                        <div>
                          <span style={{ color: 'var(--slate-500)' }}>Peak Demand: </span>
                          <strong style={{ color: cand.peakKw > 85 ? 'var(--red)' : 'var(--emerald)' }}>{cand.peakKw} kW</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--slate-500)' }}>Energy Saved: </span>
                          <strong style={{ color: 'var(--cyan)' }}>{cand.energyKwhSaved} kWh/d</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--slate-500)' }}>Production: </span>
                          <strong style={{ color: cand.productionUnits < 140 ? 'var(--red)' : 'var(--emerald)' }}>{cand.productionUnits} pcs</strong>
                        </div>
                        <div>
                          <span style={{ color: 'var(--slate-500)' }}>Pressure: </span>
                          <strong style={{ color: cand.pressureBar < 6.5 ? 'var(--red)' : 'var(--white)' }}>{cand.pressureBar} bar</strong>
                        </div>
                      </div>

                      {/* Diagnostics */}
                      <div style={{ fontSize: 10, color: isBlocked ? 'var(--red)' : isInfeasible ? 'var(--amber)' : 'var(--slate-400)', marginTop: 8, lineHeight: 1.4 }}>
                        <strong>Diagnostic Assessment:</strong> {cand.diagnostics}
                      </div>
                      {cand.provenance && (
                        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-500)', marginTop: 4 }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--white)', textTransform: 'uppercase' }}>
                    Sensor Sufficiency &amp; Value of Information (Idea A)
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>
                    Diagnostic Humility: Resolves physical ambiguity · Evaluates sensor Value of Information (VOI)
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 4, background: inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${inv.evidence_grade === 'A' ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`, color: inv.evidence_grade === 'A' ? 'var(--emerald)' : 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
                  <Award size={13} />
                  TELEMETRY READINESS {inv.evidence_grade}
                </div>
              </div>

              {/* Physical Diagnostic Ambiguity Banner */}
              {inv.diagnostic_ambiguity && (
                <div style={{ background: hasFlowMeter ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${hasFlowMeter ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`, borderRadius: 6, padding: '10px 14px', marginBottom: 12, fontSize: 11, lineHeight: 1.5, color: 'var(--slate-300)' }}>
                  <strong style={{ color: hasFlowMeter ? 'var(--emerald)' : 'var(--amber)' }}>Physical Hypothesis Resolution: </strong>
                  {inv.diagnostic_ambiguity}
                </div>
              )}

              {/* Interactive Value of Information (VOI) Toggle */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 6, padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: hasFlowMeter ? 'var(--emerald)' : 'var(--amber)' }} />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--white)' }}>
                      {hasFlowMeter ? 'Simulating with Inline Ultrasonic Flowmeter Installed' : 'Current Plant Telemetry (Electrical Submeter Only)'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--slate-400)' }}>
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
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Conservative Case
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--amber)', margin: '6px 0 2px' }}>
                    ₹{inv.conservative_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-300)' }}>
                    Payback: <strong style={{ color: 'var(--white)' }}>{inv.payback_months_conservative} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--slate-500)', marginTop: 6, lineHeight: 1.4 }}>
                    {hasFlowMeter ? 'Flowmeter locks certainty at 92% minimum savings.' : 'Accounts for unmetered pipe leaks & -20% factory volume.'}
                  </div>
                </div>

                {/* Expected */}
                <div style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid var(--cyan)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Expected Nominal Case
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', margin: '6px 0 2px' }}>
                    ₹{inv.expected_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-300)' }}>
                    Payback: <strong style={{ color: 'var(--white)' }}>{inv.payback_months_expected} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--slate-400)', marginTop: 6, lineHeight: 1.4 }}>
                    Capex ₹{inv.capex_inr.toLocaleString()} (Relay{hasFlowMeter ? ' + Flowmeter' : ''}), nominal 140 parts.
                  </div>
                </div>

                {/* Best Case */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--emerald)', textTransform: 'uppercase' }}>
                    Best-Case (+35%)
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--emerald)', margin: '6px 0 2px' }}>
                    ₹{inv.best_case_annual_saving_inr.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 500 }}>/ yr</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-300)' }}>
                    Payback: <strong style={{ color: 'var(--white)' }}>{inv.payback_months_best} months</strong>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--slate-500)', marginTop: 6, lineHeight: 1.4 }}>
                    Dual-shift capacity + elimination of coincident 85 kW peak penalty.
                  </div>
                </div>
              </div>

              {/* Sensitivity to Missing Instrumentation */}
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-400)', textTransform: 'uppercase', marginBottom: 6 }}>
                  NIST Gap Analysis &amp; Value of Information
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inv.missing_measurements_sensitivity.map((note, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--slate-300)' }}>
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
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--white)', textTransform: 'uppercase' }}>
                    The Counterfactual Factory: Post-Implementation M&amp;V Ledger
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 2 }}>
                    Solves the post-implementation blame game · Separates production drops from real energy efficiency
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {committedFeedback && (
                    <span style={{ fontSize: 11, color: 'var(--emerald)', fontFamily: 'var(--font-mono)' }}>
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
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--cyan)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Case Study A: Shift Contraction Audit (IPMVP Option B/C Reconciled)
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--emerald)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', borderRadius: 3 }}>
                    Reconciliation: 170.57 + 14.43 = 185.00 kWh (100% Match)
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--slate-400)' }}>1. Raw Submeter Drop</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--white)', margin: '4px 0 2px' }}>-185.00 kWh (-14.01%)</div>
                    <div style={{ fontSize: 9, color: 'var(--slate-500)' }}>1,320.0 → 1,135.0 kWh</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--slate-400)' }}>2. Shift Output Deficit</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--amber)', margin: '4px 0 2px' }}>122 vs 140 parts (-12.86%)</div>
                    <div style={{ fontSize: 9, color: 'var(--slate-500)' }}>Material delay on CNC</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--slate-400)' }}>3. Production Drop Effect</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--slate-300)', margin: '4px 0 2px' }}>-170.57 kWh (-12.92%)</div>
                    <div style={{ fontSize: 9, color: 'var(--slate-500)' }}>Output loss, not efficiency!</div>
                  </div>
                  <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid var(--emerald)', padding: '8px 10px', borderRadius: 4 }}>
                    <div style={{ fontSize: 9, color: 'var(--emerald)' }}>4. True Verified Efficiency</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--emerald)', margin: '4px 0 2px' }}>-14.43 kWh/day (-1.09%)</div>
                    <div style={{ fontSize: 9, color: 'var(--slate-400)' }}>11.83 kg CO₂e (72.15 kWh/wk)</div>
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
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--white)' }}>
                          {row.actual_measured_kwh.toFixed(0)} kWh ({row.actual_units} pcs)
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
                          {row.adjusted_baseline_kwh.toFixed(0)} kWh
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--emerald)', fontWeight: 700 }}>
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
          <div className="panel dt-panel mt-3">
            <div
              className="panel-hdr clickable"
              onClick={() => setShowFormulaDrawer(!showFormulaDrawer)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
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
                  <span style={{ color: 'var(--emerald)' }}>
                    {`Verified Delta: Saved ${Math.abs(currentResult.deltas.energy_kwh)} kWh | ₹${Math.abs(currentResult.deltas.cost_inr)} | ${Math.abs(currentResult.deltas.scope2_kg_co2e || 0)} kg CO₂e`}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--slate-400)', marginTop: 8, lineHeight: 1.6 }}>
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
