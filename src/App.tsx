import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutGrid, Cpu, Sliders, Leaf, FileText,
  AlertTriangle, CheckCircle2, Zap, TrendingDown,
  Printer, Download, ChevronRight, Box, Compass,
  Home, LogOut, User, Gauge, Shield, Activity, ArrowRight, Globe,
  RefreshCw, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ScadaFloorMap from './components/ScadaFloorMap';
import Factory3DScene from './components/Factory3D/Factory3DScene';
import HomePage from './components/HomePage/HomePage';
import LoginModal from './components/Auth/LoginModal';
import { DemandAreaChart, ComparisonLineChart, ScopePie } from './components/Charts';
import {
  PLANT, ASSETS, HOURLY_BASE, CARBON,
  calcSimResult, DEFAULT_SIM_PARAMS, type SimParams, type Asset,
} from './data/mockData';
import {
  calculateCarbonFootprint,
  checkBackendHealth,
  fetchCarbonFactors,
  getOfflineFallbackCalculation,
  type CarbonCalculateResponse,
  type FactorQueryResponse,
  type CeaMethodology,
} from './services/carbonApi';
import './index.css';

// ─── Page Transition Animation Variants ────────────────────────────────────────
const PAGE_VARIANTS = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' as const } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2, ease: 'easeIn' as const } },
};

type View = 'overview' | 'scada' | 'simulator' | 'carbon' | 'reports';

const NAV: { id: View; icon: React.ReactNode; label: string }[] = [
  { id: 'overview',  icon: <LayoutGrid size={14} />,   label: 'Overview' },
  { id: 'scada',     icon: <Box size={14} />,          label: '3D Factory Twin' },
  { id: 'simulator', icon: <Sliders size={14} />,       label: 'Digital Twin' },
  { id: 'carbon',    icon: <Leaf size={14} />,          label: 'Carbon Accounting' },
  { id: 'reports',   icon: <FileText size={14} />,      label: 'Audit Report' },
];

const ASSET_COLORS: Record<string, string> = {
  compressor: '#f59e0b',
  cnc:        '#22d3ee',
  furnace:    '#ef4444',
  cooling:    '#10b981',
};

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div className={`toggle ${on ? 'on' : ''}`} onClick={onChange} />
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${color || ''}`}>{value}</span>
    </div>
  );
}

function LoadBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="load-bar-wrap">
      <div className="load-bar-lbl">
        <span>{label}</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div className="load-bar-bg">
        <div className="load-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ─── Top Telemetry Bar ─────────────────────────────────────────────────────────
function TeleBar({
  simOn,
  simParams,
  carbonData,
  backendStatus,
}: {
  simOn: boolean;
  simParams: SimParams;
  carbonData: CarbonCalculateResponse | null;
  backendStatus: 'CONNECTED' | 'OFFLINE (DEMO)';
}) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const now = time;
  const h = now.getHours();
  const isPeak = (h >= 9 && h <= 12) || (h >= 18 && h <= 21);
  const shift = h < 8 ? 'SHIFT-NIGHT' : h < 16 ? 'SHIFT-DAY-A' : 'SHIFT-DAY-B';

  const result = calcSimResult(simParams);
  const pf = simParams.autoIdleCutoff ? '0.96' : '0.91';
  const energy = simOn ? result.optimizedEnergy : PLANT.baselineEnergy;
  const cost   = simOn ? result.optimizedCost   : PLANT.baselineCost;
  const totalCarbon = carbonData?.gross_footprint.total_gross_co2e_t.toFixed(2) ?? '14.47';
  const avoidedCarbon = carbonData?.avoided_emissions?.avoided_co2e_t.toFixed(2) ?? (result.savingsCarbon).toFixed(2);

  return (
    <div className="telebar">
      <div className="tele-item">
        <span className="tele-label">Plant</span>
        <span className={`live-badge ${simOn ? 'sim' : ''}`}>
          <span className="pulse-dot" />
          {simOn ? 'SCENARIO SIMULATED' : 'DEMO TELEMETRY'}
        </span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Engine</span>
        <span className={`live-badge ${backendStatus === 'CONNECTED' ? '' : 'sim'}`} style={{ borderColor: backendStatus === 'CONNECTED' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)' }}>
          <span className="pulse-dot" style={{ background: backendStatus === 'CONNECTED' ? 'var(--emerald)' : 'var(--amber)' }} />
          {backendStatus === 'CONNECTED' ? 'API LIVE' : 'OFFLINE DEMO'}
        </span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Shift</span>
        <span className="tele-value white">{shift}</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">ToD Zone</span>
        <span className={`tod-badge ${isPeak ? 'peak' : 'offpeak'}`}>
          {isPeak ? 'PEAK' : 'OFF-PEAK'}
        </span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Tariff</span>
        <span className="tele-value cyan">₹{PLANT.tariff}/kWh</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Plant P.F.</span>
        <span className={`tele-value ${parseFloat(pf) >= 0.9 ? 'emerald' : 'amber'}`}>{pf}</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Total Energy</span>
        <span className="tele-value white">{energy.toLocaleString()} kWh</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Cost</span>
        <span className="tele-value amber">₹{cost.toLocaleString()}</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Pot. Savings</span>
        <span className="tele-value emerald">
          8% / 998.4 kWh / ₹7,987 / -{avoidedCarbon} tCO₂e
        </span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Total Carbon</span>
        <span className="tele-value violet">
          {totalCarbon} tCO₂e
        </span>
      </div>
      <div className="tele-item" style={{ marginLeft: 'auto' }}>
        <span className="topbar-clock">
          {now.toTimeString().slice(0,8)}
        </span>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewView({
  setView,
  carbonData,
  gridEF,
}: {
  setView: (v: View) => void;
  carbonData: CarbonCalculateResponse | null;
  gridEF: number;
}) {
  const scope2Emissions = carbonData?.gross_footprint.scope2?.emissions_total_co2e_t.toFixed(2) ?? '9.10';
  const factorUsed = (carbonData?.gross_footprint.scope2?.factor_metadata.selected_factor ?? gridEF).toFixed(2);
  const kpis = [
    { label: 'Baseline Energy', value: '12,480', unit: 'kWh/period', color: '#22d3ee', change: '' },
    { label: 'Baseline Cost',   value: '₹99,840', unit: '/period',   color: '#f59e0b', change: '' },
    { label: 'Potential Savings', value: '998.4', unit: 'kWh (8%)', color: '#10b981', change: '+8% reducible' },
    { label: 'Scope 2 Carbon', value: scope2Emissions, unit: 'tCO₂e', color: '#8b5cf6', change: '30d period' },
    { label: 'Active Assets',   value: '4',     unit: 'of 4',        color: '#22d3ee', change: '' },
    { label: 'Active Anomalies', value: '1',    unit: 'CRITICAL',    color: '#ef4444', change: 'AIR COMPRESSOR' },
    { label: 'Grid Emission Factor', value: factorUsed, unit: 'kg CO₂e/kWh', color: '#8b5cf6', change: 'CEA India' },
    { label: 'Plant Power Factor', value: '0.91', unit: '',          color: '#f59e0b', change: 'below 0.95 target' },
  ];

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase' }}>
          PrecisionWorks Manufacturing — Plant Dashboard
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-amber btn-sm" onClick={() => setView('scada')}>
            <AlertTriangle size={10} />
            1 Anomaly Active
          </button>
          <button className="btn btn-cyan btn-sm" onClick={() => setView('simulator')}>
            <Sliders size={10} />
            Open Simulator
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((k, i) => (
          <div key={i} className="kpi-card" style={{ ['--kpi-color' as any]: k.color }}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>
              {k.value}
              {k.unit && <span className="kpi-unit">{k.unit}</span>}
            </div>
            {k.change && (
              <div className="kpi-change warn">{k.change}</div>
            )}
          </div>
        ))}
      </div>

      {/* Anomaly alert */}
      <div className="alert-banner warn" style={{ marginBottom: 14 }}>
        <div className="alert-title">
          <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4 }} />
          ANOMALY DETECTED — AIR COMPRESSOR (ELGi EN 45)
        </div>
        <div className="alert-body">
          Running unloaded at 18 kW during shift-change &amp; lunch breaks (3.2 hrs/day idle waste = <strong>998.4 kWh/period</strong>).
          Discharge pressure locked at 7.2 bar vs recommended 6.8 bar. Power Factor: 0.78 (below 0.85 threshold).
        </div>
        <div className="alert-rec">
          AI Recommendation: Install Auto-Idle Cutoff relay (5-min timer) + reduce pressure setpoint to 6.8 bar.
          Saves ₹7,987.20/period (8% of total cost) and 727.7 kg CO₂e avoided.
        </div>
      </div>

      {/* 24h demand */}
      <div className="panel">
        <div className="panel-hdr">
          <Zap size={12} />
          24-Hour Demand Profile — All Assets (Baseline)
        </div>
        <div style={{ padding: '10px 4px' }}>
          <DemandAreaChart data={HOURLY_BASE} />
        </div>
      </div>

      {/* Asset summary table */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-hdr">Asset Energy Summary</div>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Model</th>
              <th>Current kW</th>
              <th>Energy kWh</th>
              <th>P.F.</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ASSETS.map(a => (
              <tr key={a.id}>
                <td className="td-label">{a.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)' }}>{a.model}</td>
                <td className="td-proposed">{a.currentKw} kW</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white)' }}>{a.energyKwh.toLocaleString()}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.pf < 0.85 ? 'var(--amber)' : 'var(--emerald)' }}>{a.pf}</td>
                <td>
                  <span className={`badge badge-${a.status === 'OPTIMAL' ? 'emerald' : a.status === 'WARNING' ? 'amber' : 'red'}`}>
                    {a.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── SCADA & 3D Factory View ──────────────────────────────────────────────────
function ScadaView({
  assets,
  selectedId,
  onSelect,
  onSimulate,
  mapMode,
  setMapMode,
}: {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSimulate: (id: string) => void;
  mapMode: '3d' | '2d';
  setMapMode: (m: '3d' | '2d') => void;
}) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Mode Switcher Toggle Bar */}
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 20,
          zIndex: 40,
          display: 'flex',
          background: 'rgba(17, 24, 39, 0.92)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          padding: 3,
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          onClick={() => setMapMode('3d')}
          style={{
            background: mapMode === '3d' ? 'var(--cyan)' : 'transparent',
            color: mapMode === '3d' ? '#090d16' : 'var(--slate-400)',
            border: 'none',
            borderRadius: 4,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <Box size={13} /> 3D Digital Twin
        </button>
        <button
          onClick={() => setMapMode('2d')}
          style={{
            background: mapMode === '2d' ? 'var(--cyan)' : 'transparent',
            color: mapMode === '2d' ? '#090d16' : 'var(--slate-400)',
            border: 'none',
            borderRadius: 4,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
          }}
        >
          <Cpu size={13} /> 2.5D SCADA Mimic
        </button>
      </div>

      {mapMode === '3d' ? (
        <Factory3DScene
          assets={assets}
          selectedId={selectedId}
          onSelect={onSelect}
          onSimulate={onSimulate}
        />
      ) : (
        <ScadaFloorMap
          assets={assets}
          selectedId={selectedId}
          onSelect={onSelect}
          onSimulate={onSimulate}
        />
      )}
    </div>
  );
}

// ─── Simulator View ───────────────────────────────────────────────────────────
function SimulatorView({
  params,
  setParams,
  onResetBaseline,
  carbonData,
  gridEF,
  reportingYear,
}: {
  params: SimParams;
  setParams: (p: SimParams) => void;
  onResetBaseline: () => void;
  carbonData: CarbonCalculateResponse | null;
  gridEF: number;
  reportingYear: string;
}) {
  const result = useMemo(() => calcSimResult(params, gridEF), [params, gridEF]);
  const anyFix = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;

  const baselineGross = carbonData?.gross_footprint.total_gross_co2e_t ?? 14.473;
  const baselineScope2 = carbonData?.gross_footprint.scope2?.emissions_total_co2e_t ?? 9.096;
  const baselineScope1 = carbonData?.gross_footprint.scope1?.emissions_total_co2e_t ?? 5.377;
  const factorVal = carbonData?.gross_footprint.scope2?.factor_metadata.selected_factor ?? gridEF;

  const avoidedRes = carbonData?.avoided_emissions;
  const savingsKwh = anyFix ? (avoidedRes?.savings_kwh ?? result.savingsKwh) : 0;
  const avoidedCO2e = anyFix ? (avoidedRes?.avoided_co2e_t ?? result.savingsCarbon) : 0;
  const proposedScope2 = Math.max(0, +(baselineScope2 - avoidedCO2e).toFixed(3));
  const proposedGross = Math.max(0, +(baselineGross - avoidedCO2e).toFixed(3));
  const reductionPct = baselineGross > 0 ? +((avoidedCO2e / baselineGross) * 100).toFixed(2) : 0;

  const toggle = (k: keyof SimParams) =>
    setParams({ ...params, [k]: !params[k] });

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase' }}>
            Digital Twin &amp; What-If Simulator — PrecisionWorks Manufacturing
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', marginTop: 2 }}>
            Simulated Energy Interventions · ISO 14064-1 &amp; GHG Protocol Scenario Modeling · No Direct Actuation
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {anyFix ? (
            <span className="badge badge-cyan" title="Simulation active with modified operating setpoints">
              <Sliders size={9} />
              SIMULATED SCENARIO ACTIVE
            </span>
          ) : (
            <span className="badge badge-emerald" title="Operating at historical baseline conditions">
              <CheckCircle2 size={9} />
              BASELINE OPERATIONAL STATE
            </span>
          )}

          <button
            className="btn btn-sm btn-outline"
            onClick={onResetBaseline}
            disabled={!anyFix}
            title="Reset all what-if controls to historical baseline"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={10} />
            Reset to Baseline
          </button>
        </div>
      </div>

      {/* Physics Operational Constraint Panel */}
      <div className="panel" style={{ marginBottom: 12 }}>
        <div className="panel-hdr"><Shield size={12} /> Physics Constraint Validation — Operational Safety Gate</div>
        <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <ConstraintBadge
            icon={<Gauge size={16} />}
            label="Header Pressure"
            value={`${params.pressureSetpoint.toFixed(1)} bar`}
            constraint="min ≥ 6.2 bar"
            pass={params.pressureSetpoint >= 6.2}
            detail={`Air receiver buffer ${params.pressureSetpoint >= 6.5 ? 'ADEQUATE' : 'BORDERLINE'} — CNC pneumatic cycle safe`}
          />
          <ConstraintBadge
            icon={<Activity size={16} />}
            label="Shift Output Quota"
            value="1,200 units"
            constraint="100% target"
            pass={true}
            detail="Production unimpacted — idle cutoff only during non-machining windows"
          />
          <ConstraintBadge
            icon={<Zap size={16} />}
            label="Motor Starts/Hour"
            value={params.autoIdleCutoff ? '2.4 /hr' : '4.1 /hr'}
            constraint="max ≤ 6/hr"
            pass={true}
            detail="Auto-idle timer prevents rapid restart — winding insulation safe"
          />
        </div>
        <div style={{ padding: '8px 12px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)', borderTop: '1px solid var(--border-muted)' }}>
          <span style={{ color: 'var(--cyan)' }}>kVA Analysis: </span>
          Baseline 147.2 kVA {params.autoIdleCutoff ? '→ 120.1 kVA (Simulated) ' : ''}— Contract ceiling: 160 kVA.
          {params.autoIdleCutoff && <span style={{ color: 'var(--emerald)' }}> Power Factor: 0.91 → 0.96 (reactive kVAh penalty eliminated)</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12 }}>
        {/* Controls */}
        <div>
          <div className="panel">
            <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={12} /> Control Parameters
              </div>
              {anyFix && (
                <button
                  onClick={onResetBaseline}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--cyan)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Reset all
                </button>
              )}
            </div>
            <div style={{ padding: '10px 14px' }}>

              {/* Toggle 1 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--amber)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                  ANOMALY FIX · COMPRESSOR IDLE
                </div>
                <div className="toggle-wrap" onClick={() => toggle('autoIdleCutoff')}>
                  <Toggle on={params.autoIdleCutoff} onChange={() => toggle('autoIdleCutoff')} />
                  <span className="toggle-label">Auto-Idle Cutoff (5-min timer)</span>
                </div>
                {params.autoIdleCutoff && (
                  <div className="formula-box" style={{ marginTop: 8 }}>
                    <span className="formula-comment">// Compressor idle optimization (Simulated)</span>{'\n'}
                    {'idle_kW = 18, idle_hrs = 3.2'}{'\n'}
                    {'savings = 18 × 3.2 = 57.6 kWh/day'}{'\n'}
                    {'period = 57.6 × 30 = 1,728 kWh'}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`saving ≈ ${result.idleSavingsKwh} kWh → ₹${(result.idleSavingsKwh * PLANT.tariff).toFixed(2)} → ${((result.idleSavingsKwh * factorVal) / 1000).toFixed(3)} tCO₂e avoided`}
                    </span>
                  </div>
                )}
              </div>

              {/* Slider 2 */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--cyan)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                  PRESSURE SETPOINT REDUCTION
                </div>
                <div className="slider-wrap">
                  <div className="slider-header">
                    <span className="slider-title">Airline Pressure (bar)</span>
                    <span className="slider-val">{params.pressureSetpoint.toFixed(1)} bar</span>
                  </div>
                  <input type="range" min={6.5} max={7.5} step={0.1}
                    value={params.pressureSetpoint}
                    onChange={e => setParams({ ...params, pressureSetpoint: +e.target.value })}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--slate-500)', marginTop: 2 }}>
                    <span>6.5 (optimal)</span>
                    <span>7.5 (baseline)</span>
                  </div>
                </div>
                {params.pressureSetpoint < 7.5 && (
                  <div className="formula-box">
                    <span className="formula-comment">// Each 0.1 bar ≈ 1% compressor energy saved</span>{'\n'}
                    {`reduction = ${(7.5 - params.pressureSetpoint).toFixed(1)} bar`}{'\n'}
                    {`pressure_savings = ${(7.5 - params.pressureSetpoint).toFixed(1)} × 10 × 3120/100`}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`= ${result.pressureSavingsKwh.toFixed(1)} kWh saved → ${((result.pressureSavingsKwh * factorVal) / 1000).toFixed(3)} tCO₂e avoided`}
                    </span>
                  </div>
                )}
              </div>

              {/* Toggle 3 */}
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--red)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
                  PEAK DEMAND MANAGEMENT
                </div>
                <div className="toggle-wrap" onClick={() => toggle('staggerFurnace')}>
                  <Toggle on={params.staggerFurnace} onChange={() => toggle('staggerFurnace')} />
                  <span className="toggle-label">Stagger Furnace Pre-heat +45 min</span>
                </div>
                {params.staggerFurnace && (
                  <div className="formula-box" style={{ marginTop: 8 }}>
                    <span className="formula-comment">// Demand management formula (Peak clipping)</span>{'\n'}
                    {'furnace_rated = 85 kW'}{'\n'}
                    {'peak_reduction = 85 × 0.18 = 15.3 kW'}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`MD reduction = ${result.peakReductionKva} kVA (18%)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {/* Carbon Accounting Impact Panel */}
          <div className="panel" style={{ marginBottom: 10 }}>
            <div className="panel-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Leaf size={12} style={{ color: 'var(--emerald)' }} />
                Digital Twin Carbon Accounting Impact
              </div>
              <span className={`badge ${anyFix ? 'badge-cyan' : 'badge-emerald'}`} style={{ fontSize: 9 }}>
                {anyFix ? 'SIMULATED INTERVENTION' : 'HISTORICAL BASELINE'}
              </span>
            </div>

            <div style={{ padding: '12px 14px' }}>
              {/* 4 Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                {/* 1. Baseline Gross */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Baseline Gross
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--violet)', margin: '4px 0 2px' }}>
                    {baselineGross.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400 }}>tCO₂e</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    MEASURED · Scope 1+2
                  </div>
                </div>

                {/* 2. Electricity Savings */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Energy Savings
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--cyan)', margin: '4px 0 2px' }}>
                    {savingsKwh.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 400 }}>kWh</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    {anyFix ? `${((savingsKwh / PLANT.baselineEnergy) * 100).toFixed(1)}% of baseline` : '0.0% savings'}
                  </div>
                </div>

                {/* 3. Avoided Emissions */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Avoided Scope 2
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--emerald)', margin: '4px 0 2px' }}>
                    {avoidedCO2e.toFixed(3)} <span style={{ fontSize: 10, fontWeight: 400 }}>tCO₂e</span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    SIMULATED · Separate
                  </div>
                </div>

                {/* 4. Proposed Gross */}
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', textTransform: 'uppercase' }}>
                    Proposed Gross
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: anyFix ? 'var(--cyan)' : 'var(--slate-300)', margin: '4px 0 2px' }}>
                    {proposedGross.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400 }}>tCO₂e</span>
                  </div>
                  <div style={{ fontSize: 9, color: anyFix ? 'var(--emerald)' : 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
                    {anyFix ? `-${reductionPct.toFixed(1)}% reduction` : 'Identical to baseline'}
                  </div>
                </div>
              </div>

              {/* Formula & Rule Box */}
              <div className="formula-box">
                <span className="formula-comment">// Avoided Emissions Formula (GHG Protocol Corporate Standard)</span>{'\n'}
                {`avoided_tCO2e = ${savingsKwh.toFixed(1)} kWh × ${factorVal.toFixed(5)} kg CO₂/kWh ÷ 1000 = ${avoidedCO2e.toFixed(4)} tCO₂e avoided`}{'\n'}
                <span style={{ color: 'var(--slate-400)' }}>
                  {`Emission Factor: CEA India FY ${reportingYear} (${factorVal.toFixed(5)} kg CO₂/kWh) · Reporting Period: 30.0 Days`}{'\n'}
                </span>
                <span style={{ color: 'var(--emerald)' }}>
                  ACCOUNTING CORRECTNESS: Avoided emissions are reported separately. Gross baseline emissions ({baselineGross.toFixed(3)} tCO₂e) remain unchanged. Scope 1 fuel emissions ({baselineScope1.toFixed(3)} tCO₂e) are not altered by electricity savings.
                </span>
              </div>
            </div>
          </div>

          {/* Scenario Comparison Table */}
          <div className="panel" style={{ marginBottom: 10 }}>
            <div className="panel-hdr"><TrendingDown size={12} /> Scenario Comparison (Baseline vs Proposed)</div>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Baseline</th>
                  <th>Proposed</th>
                  <th>Delta / Avoided</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-label">Electricity Consumption</td>
                  <td className="td-baseline">{PLANT.baselineEnergy.toLocaleString()} kWh</td>
                  <td className="td-proposed">{result.optimizedEnergy.toLocaleString()} kWh</td>
                  <td className="td-delta">-{result.savingsKwh} kWh</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: anyFix ? 'var(--cyan)' : 'var(--slate-500)' }}>
                    {anyFix ? 'SIMULATED' : 'BASELINE'}
                  </td>
                </tr>
                <tr>
                  <td className="td-label">Scope 2 Grid Carbon</td>
                  <td className="td-baseline">{baselineScope2.toFixed(3)} tCO₂e</td>
                  <td className="td-proposed">{proposedScope2.toFixed(3)} tCO₂e</td>
                  <td className="td-delta">-{avoidedCO2e.toFixed(3)} tCO₂e</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--emerald)' }}>AVOIDED</td>
                </tr>
                <tr>
                  <td className="td-label">Scope 1 Fuel Carbon (LPG)</td>
                  <td className="td-baseline">{baselineScope1.toFixed(3)} tCO₂e</td>
                  <td className="td-proposed">{baselineScope1.toFixed(3)} tCO₂e</td>
                  <td className="td-delta" style={{ color: 'var(--slate-400)' }}>0.000 tCO₂e</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-400)' }}>UNAFFECTED</td>
                </tr>
                <tr>
                  <td className="td-label">Gross Operational Footprint</td>
                  <td className="td-baseline">{baselineGross.toFixed(3)} tCO₂e</td>
                  <td className="td-proposed">{proposedGross.toFixed(3)} tCO₂e</td>
                  <td className="td-delta">-{avoidedCO2e.toFixed(3)} tCO₂e ({reductionPct.toFixed(1)}%)</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--violet)' }}>ISOLATED</td>
                </tr>
                <tr>
                  <td className="td-label">Electricity Cost (₹8/kWh)</td>
                  <td className="td-baseline">₹{PLANT.baselineCost.toLocaleString()}</td>
                  <td className="td-proposed">₹{result.optimizedCost.toLocaleString()}</td>
                  <td className="td-delta">-₹{result.savingsCost.toLocaleString()}</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>ESTIMATED</td>
                </tr>
                <tr>
                  <td className="td-label">Peak Demand Reduction</td>
                  <td className="td-baseline">0 kVA</td>
                  <td className="td-proposed">{result.peakReductionKva} kVA</td>
                  <td className="td-delta">-{result.peakReductionKva} kVA</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-500)' }}>SIMULATED</td>
                </tr>
                <tr>
                  <td className="td-label">Compressor Idle Savings</td>
                  <td className="td-baseline">0 kWh</td>
                  <td className="td-proposed">{result.idleSavingsKwh} kWh</td>
                  <td className="td-delta">-{result.idleSavingsKwh} kWh</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-500)' }}>SIMULATED</td>
                </tr>
                <tr>
                  <td className="td-label">Pressure Optimization Savings</td>
                  <td className="td-baseline">0 kWh</td>
                  <td className="td-proposed">{result.pressureSavingsKwh.toFixed(1)} kWh</td>
                  <td className="td-delta">-{result.pressureSavingsKwh.toFixed(1)} kWh</td>
                  <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--slate-500)' }}>SIMULATED</td>
                </tr>
                {result.roi && (
                  <tr>
                    <td className="td-label">Est. Payback (Auto-Cutoff relay ₹2L)</td>
                    <td className="td-baseline">—</td>
                    <td className="td-proposed" style={{ color: 'var(--cyan)' }}>{result.roi} months</td>
                    <td className="td-delta">ROI</td>
                    <td style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>FINANCIAL</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Dual line chart */}
          <div className="panel">
            <div className="panel-hdr">24-Hour Demand Curve: Baseline vs Proposed</div>
            <div style={{ padding: '10px 4px' }}>
              <ComparisonLineChart base={result.hourlyBase} opt={result.hourlyOpt} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Physics Constraint Badge ──────────────────────────────────────────────────
function ConstraintBadge({
  icon, label, value, constraint, pass, detail
}: {
  icon: React.ReactNode; label: string; value: string;
  constraint: string; pass: boolean; detail: string;
}) {
  return (
    <div style={{
      background: 'var(--panel)',
      border: `1px solid ${pass ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 8,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      boxShadow: `0 0 0 1px ${pass ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)'}`,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 6,
        background: pass ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: pass ? 'var(--emerald)' : 'var(--red)', flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: pass ? 'var(--emerald)' : 'var(--red)' }}>{value}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', letterSpacing: 0.5 }}>{constraint}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', letterSpacing: 0.5 }}>{detail}</div>
      </div>
      <span className={`badge ${pass ? 'badge-emerald' : 'badge-red'}`} style={{ flexShrink: 0 }}>
        {pass ? <><CheckCircle2 size={8} /> PASS</> : <><AlertTriangle size={8} /> FAIL</>}
      </span>
    </div>
  );
}

// ─── Carbon View ──────────────────────────────────────────────────────────────
function CarbonView({
  params,
  gridEF,
  setGridEF,
  carbonData,
  carbonLoading,
  carbonError,
  backendStatus,
  onRecalculate,
  reportingYear,
  setReportingYear,
  ceaMethodology,
  setCeaMethodology,
  availableYears,
}: {
  params: SimParams;
  gridEF: number;
  setGridEF: (v: number) => void;
  carbonData: CarbonCalculateResponse | null;
  carbonLoading: boolean;
  carbonError: string | null;
  backendStatus: 'CONNECTED' | 'OFFLINE (DEMO)';
  onRecalculate: () => void;
  reportingYear: string;
  setReportingYear: (y: string) => void;
  ceaMethodology: CeaMethodology;
  setCeaMethodology: (m: CeaMethodology) => void;
  availableYears: string[];
}) {
  const s1 = CARBON.scope1Calc();
  const s2 = CARBON.scope2Calc(PLANT.baselineEnergy, gridEF);
  const total = +(s1.kgCO2e + s2.kgCO2e).toFixed(3);
  const sim = calcSimResult(params);
  const reductionPotential = sim.savingsCarbon;
  const scope1Percent = ((s1.kgCO2e / total) * 100).toFixed(1);
  const scope2Percent = ((s2.kgCO2e / total) * 100).toFixed(1);

  return (
    <div className="scroll-area" style={{ padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header with Standards Badges */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Globe size={18} style={{ color: 'var(--cyan)' }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--slate-100)', letterSpacing: 0.5, margin: 0 }}>
              CARBON ACCOUNTING & ESG INVENTORY
            </h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--slate-400)', margin: 0 }}>
            PrecisionWorks Manufacturing • Location-based Scope 1 & Scope 2 Emissions Inventory
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', border: '1px solid rgba(2, 132, 199, 0.3)' }}>
            ISO 14064-1:2018
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            GHG PROTOCOL
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 6, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
            CEA INDIA v2024
          </span>
        </div>
      </div>

      {/* Top 4 Big Stat KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '16px 18px', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
            Total Carbon Footprint
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>{total}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>tCO₂e/day</span>
          </div>
          <div style={{ fontSize: 11, color: '#a78bfa' }}>
            Scope 1 (1.7%) + Scope 2 (98.3%)
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '16px 18px', borderLeft: '4px solid #ef4444' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
            Scope 1 (Direct Fuel)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#f87171', fontFamily: 'var(--font-mono)' }}>{s1.kgCO2e}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>tCO₂e/day</span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            LPG Heat Treatment Furnace
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '16px 18px', borderLeft: '4px solid #0284c7' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
            Scope 2 (Indirect Grid)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>{s2.kgCO2e}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>tCO₂e/day</span>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            Purchased MSEDCL Electricity
          </div>
        </div>

        <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 10, padding: '16px 18px', borderLeft: '4px solid #10b981' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, marginBottom: 6 }}>
            Abatement Potential
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>{reductionPotential}</span>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>tCO₂e/day</span>
          </div>
          <div style={{ fontSize: 11, color: '#34d399' }}>
            -7.9% via Idle Cutoff & ToD Shift
          </div>
        </div>
      </div>

      {/* Main Grid: Calculation Details & Scope Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        {/* Left Column: Scope 1 & Scope 2 Calculation Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Scope 1 Detailed Card */}
          <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontWeight: 700, fontSize: 11, border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  SCOPE 1
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                  Direct Fuel Combustion (Stationary)
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: '#f87171' }}>
                {s1.kgCO2e} tCO₂e/day
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 12, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Source Asset</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>Thermic Intl 85 kW Furnace</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Activity Rate</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>60 kg LPG / day</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Emission Factor</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>2.98 kg CO₂e / kg LPG</div>
              </div>
            </div>

            {/* Formula Banner */}
            <div style={{ background: '#0b0f17', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: '#94a3b8' }}>Formula: </span>
                60 kg LPG/day × 2.98 kg CO₂e/kg ÷ 1,000 = <strong style={{ color: '#f87171' }}>0.179 tCO₂e/day</strong>
              </div>
              <span style={{ fontSize: 10, color: '#64748b' }}>IPCC 2006 GL Vol. 2 Table 2.2</span>
            </div>
          </div>

          {/* Scope 2 Detailed Card */}
          <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', fontWeight: 700, fontSize: 11, border: '1px solid rgba(2, 132, 199, 0.3)' }}>
                  SCOPE 2
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                  Indirect Emissions (Purchased Electricity)
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>
                {s2.kgCO2e} tCO₂e/day
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, background: 'rgba(255, 255, 255, 0.03)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Sub-metered Baseline</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
                  {PLANT.baselineEnergy.toLocaleString()} kWh/period
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Grid Utility</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>MSEDCL HT-I (Maharashtra)</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>Grid Emission Factor</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    step={0.01}
                    min={0.5}
                    max={1.2}
                    value={gridEF}
                    onChange={(e) => setGridEF(parseFloat(e.target.value) || 0.82)}
                    style={{
                      background: '#0b0f17',
                      color: '#38bdf8',
                      border: '1px solid rgba(2, 132, 199, 0.4)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      width: 65,
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>kg/kWh</span>
                </div>
              </div>
            </div>

            {/* Formula Banner */}
            <div style={{ background: '#0b0f17', border: '1px solid rgba(2, 132, 199, 0.2)', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: '#cbd5e1', fontFamily: 'var(--font-mono)' }}>
                <span style={{ color: '#94a3b8' }}>Formula: </span>
                {PLANT.baselineEnergy.toLocaleString()} kWh × {gridEF} kg/kWh ÷ 1,000 = <strong style={{ color: '#38bdf8' }}>{s2.kgCO2e} tCO₂e/day</strong>
              </div>
              <span style={{ fontSize: 10, color: '#64748b' }}>CEA Baseline DB v20.0 (2024)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Scope Split Donut Chart & Verification Dossier */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Scope Split Donut Panel */}
          <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: '20px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 12 }}>
              Emissions By Scope
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <ScopePie scope1={s1.kgCO2e} scope2={s2.kgCO2e} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8' }} />
                  <span style={{ color: '#94a3b8' }}>Scope 2 (Electricity)</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                  {scope2Percent}% ({s2.kgCO2e} t)
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                  <span style={{ color: '#94a3b8' }}>Scope 1 (LPG Gas)</span>
                </div>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#f87171' }}>
                  {scope1Percent}% ({s1.kgCO2e} t)
                </span>
              </div>
            </div>
          </div>

          {/* Audit Verification Protocol Box */}
          <div style={{ background: '#111827', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} style={{ color: '#10b981' }} />
              <span>Third-Party Verification Ready</span>
            </div>
            <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Every calculation is anchored to sub-meter interval telemetry and published CEA/IPCC emission factors, fulfilling ISO 14064-3 and ISO 50001:2018 certification audit standards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({
  params,
  carbonData,
}: {
  params: SimParams;
  carbonData: CarbonCalculateResponse | null;
}) {
  const result = calcSimResult(params);
  const anyFix = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;

  const s1Total = carbonData?.gross_footprint.scope1?.emissions_total_co2e_t ?? 5.377;
  const s1Direct = carbonData?.gross_footprint.scope1?.emissions_direct_co2_t ?? 5.372;
  const s2Total = carbonData?.gross_footprint.scope2?.emissions_total_co2e_t ?? 9.096;
  const grossTotal = carbonData?.gross_footprint.total_gross_co2e_t ?? 14.473;
  const avoidedCarbon = carbonData?.avoided_emissions?.avoided_co2e_t ?? 0.728;
  const s1Formula = carbonData?.gross_footprint.scope1?.formula ?? '1,800.0 kg LPG × 2.9872 kg CO₂e/kg ÷ 1000 = 5.377 tCO₂e';
  const s2Formula = carbonData?.gross_footprint.scope2?.formula ?? '12,480 kWh × 0.72886 kg CO₂/kWh ÷ 1000 = 9.096 tCO₂e';
  const factorMeta = carbonData?.gross_footprint.scope2?.factor_metadata;
  const auditStatus = carbonData?.calculation_metadata.audit_status ?? 'CALCULATION_UNVERIFIED_DEMO';
  const backendStatus = carbonData?.calculation_metadata.backend_status ?? 'OFFLINE (DEMO)';
  const selectedYear = factorMeta?.reporting_year ?? '2023-24';
  const factorVal = factorMeta?.selected_factor ?? 0.72886;

  const handlePrint = () => window.print();
  const handleExport = () => {
    const content = `WattWise AI — Energy and Emissions Assessment — Demo Calculation Report
PrecisionWorks Manufacturing
Date: ${new Date().toLocaleDateString('en-IN')}
Engine Status: ${backendStatus}
Data Provenance: ${auditStatus}
--------------------------------------------------

EXECUTIVE SUMMARY
Baseline Energy:    ${result.baseEnergy.toLocaleString()} kWh
Baseline Cost:      ₹${result.baselineCost.toLocaleString()}
Proposed Energy:    ${result.optimizedEnergy.toLocaleString()} kWh
Proposed Cost:      ₹${result.optimizedCost.toLocaleString()}
Energy Savings:     ${result.savingsKwh} kWh (${((result.savingsKwh/result.baseEnergy)*100).toFixed(1)}%)
Cost Savings:       ₹${result.savingsCost.toLocaleString()}
Carbon Avoided:     ${avoidedCarbon} tCO₂e (Reported separately; not subtracted from operational gross footprint)

ANOMALY DETECTED
Asset:              Air Compressor (ELGi EN 45)
Issue:              Running unloaded 18 kW × 3.2 hrs/day = 57.6 kWh/day idle waste
Root Cause:         No auto-idle cutoff configured; pressure setpoint at 7.5 bar vs 6.8 bar optimal

RECOMMENDED ACTIONS
1. Install Auto-Idle Cutoff relay (5-min unloaded timer) — Cost: ₹2,00,000, Payback: ${result.roi} months
2. Reduce airline pressure setpoint from 7.5 to ${params.pressureSetpoint} bar
3. Stagger Furnace pre-heat by 45 min to reduce peak demand by ${result.peakReductionKva} kVA

CARBON ACCOUNTING (ISO 14064-1 / GHG Protocol Scope 2)
Scope 1 (LPG):      ${s1Total} tCO₂e/30d (${s1Direct} tCO₂ direct) [${s1Formula}]
Scope 2 (Grid):     ${s2Total} tCO₂e/30d [${s2Formula}]
Gross Total GHG:    ${grossTotal} tCO₂e/30d
Carbon Intensity:   ${((grossTotal) / (result.baseEnergy/1000)).toFixed(2)} tCO₂e/MWh

SOURCE REFERENCES
Scope 1 Standard:   2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 47.3 MJ/kg, AR6 GWP)
Scope 2 Database:   Central Electricity Authority (India) CO₂ Baseline Database Ver 22.0
Methodology:        ${factorMeta?.methodology ?? 'Weighted Average Grid Emission Rate (Incl. RES, Captive)'}
Reporting Year:     FY ${selectedYear} (Factor: ${factorVal} kg CO₂/kWh, Results!Row ${factorMeta?.row ?? 14})

VERIFICATION PROTOCOL
Methodology:        Aligned with ISO 50001:2018 (EnMS) & ISO 14064-1:2018 calculation frameworks
Monitoring:         Digital twin simulated telemetry and sub-metering
Verification:       Internal engineering review (Not third-party audited)
Audit Status:       ${auditStatus} (Note: Official emission factor reference does NOT constitute certified plant audit)
Reporting:          Energy Performance Indicator (EnPI) assessment report
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'WattWise_Audit_Report.txt'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase' }}>
          Energy &amp; Emissions Assessment — Demo Calculation Report
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handlePrint}>
            <Printer size={10} />
            Print
          </button>
          <button className="btn btn-emerald btn-sm" onClick={handleExport}>
            <Download size={10} />
            Export TXT
          </button>
        </div>
      </div>

      {/* Cover */}
      <div className="report-page">
        <div className="report-heading">Energy &amp; Emissions Assessment — Demo Calculation Report</div>
        <div className="report-kv"><span className="report-k">Facility</span><span className="report-v">PrecisionWorks Manufacturing</span></div>
        <div className="report-kv"><span className="report-k">Report Date</span><span className="report-v">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
        <div className="report-kv"><span className="report-k">Methodology Context</span><span className="report-v">Aligned with ISO 50001:2018 &amp; ISO 14064-1:2018 calculation frameworks</span></div>
        <div className="report-kv"><span className="report-k">Grid Tariff</span><span className="report-v">₹{PLANT.tariff}/kWh (ToD — Peak/Off-Peak)</span></div>
        <div className="report-kv">
          <span className="report-k">Grid Emission Factor</span>
          <span className="report-v">{factorVal} kg CO₂/kWh (CEA India FY {selectedYear}, Results!Row {factorMeta?.row ?? 14})</span>
        </div>
        <div className="report-kv"><span className="report-k">Audit Classification</span><span className="report-v" style={{ color: 'var(--cyan)' }}>{auditStatus}</span></div>
        <div className="report-kv"><span className="report-k">Scenario Active</span><span className="report-v">{anyFix ? 'Optimized (Digital Twin Applied)' : 'Baseline Only'}</span></div>
      </div>

      {/* Problem */}
      <div className="report-page">
        <div className="report-heading">
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6 }} />
          Problem Detected
        </div>
        <div className="alert-banner warn" style={{ marginBottom: 10 }}>
          <div className="alert-title">PRIMARY ANOMALY — AIR COMPRESSOR</div>
          <div className="alert-body">
            ELGi EN 45 (45 kW rated) operates unloaded at <strong>18 kW</strong> during shift-changes &amp; lunch breaks totalling <strong>3.2 hrs/day</strong>.
            No auto-idle cutoff is configured. Airline pressure set to 7.5 bar vs. process requirement of 6.8–7.0 bar.
            Plant Power Factor: 0.78 on compressor (target ≥ 0.85).
          </div>
        </div>
        <div className="report-kv"><span className="report-k">Idle Waste Energy</span><span className="report-v" style={{ color: 'var(--amber)' }}>18 kW × 3.2 h/day × 30 days = 1,728 kWh (≈ 998.4 kWh adj. for run time)</span></div>
        <div className="report-kv"><span className="report-k">Idle Cost Impact</span><span className="report-v" style={{ color: 'var(--amber)' }}>₹7,987.20/period</span></div>
        <div className="report-kv"><span className="report-k">Carbon Impact</span><span className="report-v" style={{ color: 'var(--amber)' }}>{avoidedCarbon} tCO₂e avoided potential</span></div>
        <div className="formula-box" style={{ marginTop: 10 }}>
          <span className="formula-comment">// Root-cause engineering math</span>{'\n'}
          {'idle_energy   = 18 kW × 3.2 hr/day × 30 days = 1,728 kWh'}{'\n'}
          {'idle_cost     = 1,728 kWh × ₹8/kWh         = ₹13,824'}{'\n'}
          {'adj_savings   = 998.4 kWh × ₹8              = ₹7,987.20'}{'\n'}
          {`carbon_saving = 998.4 kWh × ${factorVal} kg CO₂e = ${avoidedCarbon} tCO₂e`}
        </div>
      </div>

      {/* Action taken */}
      <div className="report-page">
        <div className="report-heading">
          <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 6 }} />
          Action Taken (Digital Twin Scenario)
        </div>
        <div className="report-kv"><span className="report-k">Intervention 1</span>
          <span className="report-v">{params.autoIdleCutoff ? 'APPLIED' : 'PENDING'} — Auto-Idle Cutoff Relay (5-min unloaded timer)</span>
        </div>
        <div className="report-kv"><span className="report-k">Intervention 2</span>
          <span className="report-v">{params.pressureSetpoint < 7.5 ? `APPLIED — Pressure reduced to ${params.pressureSetpoint} bar` : 'PENDING — Pressure at 7.5 bar'}</span>
        </div>
        <div className="report-kv"><span className="report-k">Intervention 3</span>
          <span className="report-v">{params.staggerFurnace ? 'APPLIED — Furnace pre-heat staggered +45 min' : 'PENDING — Furnace schedule unchanged'}</span>
        </div>
      </div>

      {/* ROI */}
      <div className="report-page">
        <div className="report-heading">
          <TrendingDown size={12} style={{ display: 'inline', marginRight: 6 }} />
          Financial ROI
        </div>
        <div className="report-kv"><span className="report-k">Baseline Energy</span><span className="report-v">{result.baseEnergy.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Optimized Energy</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{result.optimizedEnergy.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Energy Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{result.savingsKwh} kWh ({((result.savingsKwh/result.baseEnergy)*100).toFixed(1)}%)</span></div>
        <div className="report-kv"><span className="report-k">Cost Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>₹{result.savingsCost.toLocaleString()}</span></div>
        <div className="report-kv"><span className="report-k">Capex (Auto-Cutoff Relay)</span><span className="report-v">₹2,00,000 (one-time)</span></div>
        {result.roi && <div className="report-kv"><span className="report-k">Simple Payback</span><span className="report-v" style={{ color: 'var(--cyan)' }}>{result.roi} months</span></div>}
        <div className="report-kv"><span className="report-k">5-Year Net Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>₹{(result.savingsCost * 12 * 5 - 200000).toLocaleString()}</span></div>
      </div>

      {/* Carbon */}
      <div className="report-page">
        <div className="report-heading">
          <Leaf size={12} style={{ display: 'inline', marginRight: 6 }} />
          Carbon Impact (30-Day Operational Control)
        </div>
        <div className="report-kv">
          <span className="report-k">Scope 1 (LPG Combustion)</span>
          <span className="report-v">{s1Total} tCO₂e/30d <span style={{ color: 'var(--slate-400)', fontSize: 11 }}>({s1Direct} tCO₂ direct)</span></span>
        </div>
        <div className="report-kv"><span className="report-k">Scope 2 (Grid Electricity)</span><span className="report-v">{s2Total} tCO₂e/30d</span></div>
        <div className="report-kv"><span className="report-k">Total Gross Footprint</span><span className="report-v" style={{ color: 'var(--violet)' }}>{grossTotal} tCO₂e/30d</span></div>
        <div className="report-kv">
          <span className="report-k">Avoided Emissions (Digital Twin)</span>
          <span className="report-v" style={{ color: 'var(--emerald)' }}>{avoidedCarbon} tCO₂e avoided (isolated)</span>
        </div>
        <div className="formula-box" style={{ marginTop: 10 }}>
          <span className="formula-comment">// Scope 1: LPG Combustion (IPCC 2006 Vol 2 Table 2.3, AR6 GWP)</span>{'\n'}
          {s1Formula}{'\n\n'}
          <span className="formula-comment">// Scope 2: Location-Based (CEA India Baseline Ver 22.0)</span>{'\n'}
          {s2Formula}
        </div>
      </div>

      {/* Verification */}
      <div className="report-page">
        <div className="report-heading">Methodology &amp; Verification Protocol</div>
        <div className="report-kv"><span className="report-k">Methodology Context</span><span className="report-v">ISO 50001:2018 &amp; ISO 14064-1:2018 guidance</span></div>
        <div className="report-kv"><span className="report-k">Monitoring Method</span><span className="report-v">Simulated sub-metering at each asset breaker panel</span></div>
        <div className="report-kv"><span className="report-k">Baseline Period</span><span className="report-v">30-day rolling average (current period)</span></div>
        <div className="report-kv"><span className="report-k">Verification Frequency</span><span className="report-v">Internal engineering review</span></div>
        <div className="report-kv"><span className="report-k">Reporting</span><span className="report-v">Energy Performance Indicator (EnPI) assessment</span></div>
        <div className="report-kv"><span className="report-k">Audit Classification</span><span className="report-v">Uncertified Demo Assessment (Third-party verification required for official compliance)</span></div>
        <div className="report-kv"><span className="report-k">Generated by</span><span className="report-v">WattWise AI — Industrial Energy Intelligence v1.0 (FastAPI Engine)</span></div>
      </div>
    </div>
  );
}

// ─── Inspector Panel ──────────────────────────────────────────────────────────
function InspectorPanel({
  selectedId,
  setView,
  params,
  carbonData,
  gridEF,
  onResetBaseline,
}: {
  selectedId: string | null;
  setView: (v: View) => void;
  params: SimParams;
  carbonData: CarbonCalculateResponse | null;
  gridEF: number;
  onResetBaseline?: () => void;
}) {
  const [tab, setTab] = useState<'asset' | 'alerts' | 'kpis'>('alerts');
  const asset = ASSETS.find(a => a.id === selectedId);

  useEffect(() => {
    if (selectedId) setTab('asset');
  }, [selectedId]);

  const s2Total = (carbonData?.gross_footprint.scope2?.emissions_total_co2e_t ?? 9.096).toFixed(2);
  const s1Total = (carbonData?.gross_footprint.scope1?.emissions_total_co2e_t ?? 5.377).toFixed(2);
  const anyFix = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;
  const avoidedCarbon = (carbonData?.avoided_emissions?.avoided_co2e_t ?? (anyFix ? 0.728 : 0.0)).toFixed(3);
  const factorVal = (carbonData?.gross_footprint.scope2?.factor_metadata.selected_factor ?? gridEF).toFixed(3);

  return (
    <aside className="inspector-panel">
      <div className="inspector-tabs">
        <button className={`inspector-tab ${tab === 'alerts' ? 'active' : ''}`} onClick={() => setTab('alerts')}>
          Alerts
        </button>
        <button className={`inspector-tab ${tab === 'asset' ? 'active' : ''}`} onClick={() => setTab('asset')}>
          Asset
        </button>
        <button className={`inspector-tab ${tab === 'kpis' ? 'active' : ''}`} onClick={() => setTab('kpis')}>
          Plant KPIs
        </button>
      </div>

      <div className="inspector-body">
        {/* Alerts tab */}
        {tab === 'alerts' && (
          <>
            <div className="section-title">Active Alerts</div>
            <div className="alert-banner warn">
              <div className="alert-title">
                <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4 }} />
                ANOMALY — AIR COMPRESSOR
              </div>
              <div className="alert-body">
                18 kW idle draw during 3.2 hrs/day break periods. Discharge pressure 7.2 bar (set: 7.5, optimal: 6.8).
                Power Factor 0.78.
              </div>
              <div className="alert-rec">
                Auto-Idle Cutoff: saves 998.4 kWh / ₹7,987 / 727.7 kg CO₂e avoided
              </div>
              <button className="btn btn-amber btn-sm btn-full" style={{ marginTop: 8 }}
                onClick={() => setView('simulator')}
              >
                <ChevronRight size={10} />
                Simulate Fix in Digital Twin
              </button>
            </div>
            <div className="alert-banner ok">
              <div className="alert-title">CNC MACHINING CENTER — OPTIMAL</div>
              <div className="alert-body">SEC: 1.8 kWh/part. P.F. 0.94. No anomalies detected.</div>
            </div>
            <div className="alert-banner crit">
              <div className="alert-title">FURNACE — HIGH PEAK DEMAND</div>
              <div className="alert-body">
                85 kW concurrent with compressor peak 09:00–12:00.
                Staggering preheat by 45 min reduces peak demand 18%.
              </div>
            </div>
          </>
        )}

        {/* Asset tab */}
        {tab === 'asset' && (
          <>
            <div className="section-title">
              {asset ? asset.name : 'Select an asset on the SCADA map'}
            </div>
            {asset ? (
              <>
                <div className="panel" style={{ marginBottom: 10 }}>
                  <div className="panel-hdr">{asset.model}</div>
                  <StatRow label="Current Draw" value={`${asset.currentKw} kW`} color="cyan" />
                  <StatRow label="Rated Capacity" value={`${asset.ratedKw} kW`} />
                  <StatRow label="Energy (Period)" value={`${asset.energyKwh.toLocaleString()} kWh`} />
                  <StatRow label="Power Factor" value={String(asset.pf)} color={asset.pf < 0.85 ? 'amber' : 'emerald'} />
                  <StatRow label="Load %" value={`${Math.round((asset.currentKw / asset.ratedKw) * 100)}%`} />
                  {asset.dischargePressureBar && <StatRow label="Discharge Pressure" value={`${asset.dischargePressureBar} bar`} color="amber" />}
                  {asset.tempC && <StatRow label="Temperature" value={`${asset.tempC}°C`} color="red" />}
                  {asset.cop && <StatRow label="COP" value={String(asset.cop)} color="emerald" />}
                  {asset.secKwhPerPart && <StatRow label="SEC" value={`${asset.secKwhPerPart} kWh/part`} />}
                  {asset.idleKw && <StatRow label="Idle Waste" value={`${asset.idleKw} kW × ${asset.idleHrsPerDay}h`} color="amber" />}
                </div>

                <LoadBar
                  label="Productive Load"
                  pct={Math.round((asset.currentKw / asset.ratedKw) * 100)}
                  color={ASSET_COLORS[asset.id] || '#22d3ee'}
                />
                {asset.idleKw && (
                  <LoadBar
                    label="Idle Waste %"
                    pct={Math.round((asset.idleKw / asset.ratedKw) * 100)}
                    color="#ef4444"
                  />
                )}

                {asset.status !== 'OPTIMAL' && (
                  <button className="btn btn-cyan btn-full" style={{ marginTop: 10 }}
                    onClick={() => setView('simulator')}
                  >
                    <Sliders size={10} />
                    Simulate Fix in Digital Twin
                  </button>
                )}
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)', lineHeight: 1.8, marginTop: 20 }}>
                Click any asset node on the SCADA Floor Map to inspect its live telemetry, load profile, and AI diagnostic.
                {'\n\n'}Assets: {ASSETS.map(a => a.name).join(', ')}.
              </div>
            )}
          </>
        )}

        {/* Plant KPIs tab */}
        {tab === 'kpis' && (
          <>
            <div className="section-title">Plant KPIs</div>
            <div className="panel">
              <div className="panel-hdr">Energy</div>
              <StatRow label="Baseline Energy" value="12,480 kWh" color="white" />
              <StatRow label="Potential Savings" value="998.4 kWh (8%)" color="emerald" />
              <StatRow label="Cost at ₹8/kWh" value="₹99,840" color="amber" />
              <StatRow label="Max Savings" value="₹7,987.20" color="emerald" />
            </div>
            <div className="panel">
              <div className="panel-hdr">Carbon</div>
              <StatRow label="Grid EF (CEA)" value={`${factorVal} kg CO₂/kWh`} color="violet" />
              <StatRow label="Scope 2 (Elec)" value={`${s2Total} tCO₂e/30d`} color="violet" />
              <StatRow label="Scope 1 (LPG)" value={`${s1Total} tCO₂e/30d`} color="red" />
              <StatRow label="Avoided Carbon" value={anyFix ? `-${avoidedCarbon} tCO₂e (SIMULATED)` : '0.000 tCO₂e'} color="emerald" />
            </div>
            <div className="panel">
              <div className="panel-hdr">Power Quality</div>
              <StatRow label="Plant PF (baseline)" value="0.91" color="amber" />
              <StatRow label="Plant PF (optimized)" value="0.96" color="emerald" />
              <StatRow label="Compressor PF" value="0.78" color="red" />
              <StatRow label="CNC PF" value="0.94" color="emerald" />
            </div>
            {anyFix && onResetBaseline && (
              <button
                className="btn btn-outline btn-sm btn-full"
                style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                onClick={onResetBaseline}
              >
                <RotateCcw size={10} />
                Reset Simulator to Baseline
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'login' | 'platform'>('home');
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; name: string } | null>({
    email: 'operator@precisionworks.mfg',
    role: 'Plant SCADA Operator',
    name: 'Vikram Malhotra',
  });
  const [view, setView] = useState<View>('scada');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<'3d' | '2d'>('3d');
  const [simMode, setSimMode] = useState(false);
  const [gridEF, setGridEF] = useState(0.72886);
  const [reportingYear, setReportingYear] = useState('2023-24');
  const [ceaMethodology, setCeaMethodology] = useState<CeaMethodology>('weighted_avg_with_res');
  const [availableYears, setAvailableYears] = useState<string[]>([
    '2022-23', '2023-24', '2024-25', '2025-26',
  ]);
  const [backendStatus, setBackendStatus] = useState<'CONNECTED' | 'OFFLINE (DEMO)'>('OFFLINE (DEMO)');
  const [carbonData, setCarbonData] = useState<CarbonCalculateResponse | null>(null);
  const [carbonLoading, setCarbonLoading] = useState(false);
  const [carbonError, setCarbonError] = useState<string | null>(null);

  const [params, setParams] = useState<SimParams>(DEFAULT_SIM_PARAMS);

  const handleResetBaseline = useCallback(() => {
    setParams(DEFAULT_SIM_PARAMS);
    setSimMode(false);
  }, []);

  // Discover backend factors & check initial connectivity
  useEffect(() => {
    async function initBackend() {
      const isHealthy = await checkBackendHealth();
      if (isHealthy) {
        setBackendStatus('CONNECTED');
        try {
          const factors = await fetchCarbonFactors();
          if (factors.available_years?.length) {
            setAvailableYears(factors.available_years);
          }
        } catch (e) {
          console.warn('Could not fetch CEA factor catalogue:', e);
        }
      } else {
        setBackendStatus('OFFLINE (DEMO)');
      }
    }
    initBackend();
  }, []);

  // Recalculate carbon footprint whenever inputs or scenario changes
  const triggerCalculation = useCallback(async () => {
    setCarbonLoading(true);
    setCarbonError(null);

    const simRes = calcSimResult(params, gridEF);
    const savingsKwh = simRes.savingsKwh;
    const proposedConsumption = Math.max(0, +(PLANT.baselineEnergy - savingsKwh).toFixed(2));

    const req = {
      period: {
        period_type: 'SIMULATED_DEMO_30D' as const,
        duration_days: 30.0,
      },
      scope1: {
        fuel_id: 'lpg',
        activity_value: 1800.0,
        activity_unit: 'kg',
        provenance: 'ESTIMATED' as const,
        include_non_co2_ghg: true,
      },
      scope2: {
        grid_consumption_kwh: PLANT.baselineEnergy,
        provenance: 'SIMULATED' as const,
        cea_reporting_year: reportingYear,
        cea_methodology: ceaMethodology,
        custom_grid_factor: gridEF !== 0.72886 ? gridEF : undefined,
      },
      scenario_comparison: {
        enabled: true,
        proposed_savings_kwh: savingsKwh,
        proposed_consumption_kwh: proposedConsumption,
        savings_provenance: 'SIMULATED' as const,
      },
    };

    try {
      const liveData = await calculateCarbonFootprint(req);
      setCarbonData(liveData);
      setBackendStatus('CONNECTED');
    } catch (err: any) {
      console.warn('FastAPI backend offline or calculation error, applying fallback demo model:', err);
      const fallback = getOfflineFallbackCalculation(req);
      setCarbonData(fallback);
      setBackendStatus('OFFLINE (DEMO)');
      if (err.message && !err.message.includes('fetch') && !err.message.includes('Failed to fetch') && !err.message.includes('abort')) {
        setCarbonError(err.message);
      }
    } finally {
      setCarbonLoading(false);
    }
  }, [params, gridEF, reportingYear, ceaMethodology]);

  useEffect(() => {
    triggerCalculation();
  }, [triggerCalculation]);

  const simulatedAssets = useMemo(() => {
    return ASSETS.map(a => {
      if (a.id === 'compressor' && params.autoIdleCutoff) {
        return { ...a, currentKw: 0, status: 'OPTIMAL' as const, pf: 0.96 };
      }
      if (a.id === 'compressor' && params.pressureSetpoint < 7.5) {
        return { ...a, dischargePressureBar: params.pressureSetpoint };
      }
      if (a.id === 'furnace' && params.staggerFurnace) {
        return { ...a, currentKw: 70, status: 'OPTIMAL' as const };
      }
      return a;
    });
  }, [params]);

  const handleSelectAsset = useCallback((id: string | null) => {
    setSelectedAsset(id);
  }, []);

  const handleSimulate = useCallback((id: string) => {
    setSelectedAsset(id);
    setView('simulator');
    if (id === 'compressor') setParams(p => ({ ...p, autoIdleCutoff: true }));
    if (id === 'furnace') setParams(p => ({ ...p, staggerFurnace: true }));
    setSimMode(true);
  }, []);

  const anyFix = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;

  if (currentPage === 'home') {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="home" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <HomePage
            onLaunchPlatform={() => setCurrentPage('platform')}
            onOpenLogin={() => setCurrentPage('login')}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  if (currentPage === 'login') {
    return (
      <AnimatePresence mode="wait">
        <motion.div key="login" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
          <LoginModal
            onLogin={(user) => {
              setCurrentUser(user);
              setCurrentPage('platform');
            }}
            onBackToHome={() => setCurrentPage('home')}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="topbar">
        <div
          className="topbar-brand"
          style={{ cursor: 'pointer' }}
          onClick={() => setCurrentPage('home')}
          title="Return to 3D Glide Home"
        >
          <Zap size={16} />
          WattWise AI
          <span className="sub">// INDUSTRIAL EMS</span>
        </div>
        <div className="topbar-center">
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(0, 0, 0, 0.05)',
              border: '1px solid var(--border)',
              borderRadius: 9999,
              padding: '4px 12px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: '#0f172a',
              cursor: 'pointer',
            }}
          >
            <Compass size={12} color="var(--cyan)" /> 3D Glide Home
          </button>
          <div className="topbar-divider" />
          <span className="shift-badge">PrecisionWorks Mfg</span>
          <div className="topbar-divider" />
          <span className={`tod-badge ${(() => { const h = new Date().getHours(); return (h>=9&&h<=12)||(h>=18&&h<=21)?'peak':'offpeak'; })()}`}>
            {(() => { const h = new Date().getHours(); return (h>=9&&h<=12)||(h>=18&&h<=21)?'PEAK TARIFF':'OFF-PEAK'; })()}
          </span>
          {backendStatus === 'CONNECTED' ? (
            <span className="badge badge-emerald" title="FastAPI Carbon Engine Active at http://127.0.0.1:8000">
              <CheckCircle2 size={9} />
              BACKEND: CONNECTED
            </span>
          ) : (
            <span className="badge badge-amber" title="FastAPI server offline. Using verified fallback demo simulator.">
              <AlertTriangle size={9} />
              BACKEND: OFFLINE (DEMO)
            </span>
          )}
          {anyFix && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="badge badge-cyan" title="Simulation setpoints active">
                <Sliders size={9} />
                SCENARIO ACTIVE
              </span>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleResetBaseline}
                style={{ padding: '2px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}
                title="Reset simulation parameters to historical baseline"
              >
                <RotateCcw size={9} />
                Reset
              </button>
            </div>
          )}
        </div>
        <div className="topbar-right">
          <span className="topbar-clock">
            {new Date().toTimeString().slice(0,8)}
          </span>
          <div className="topbar-divider" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#334155' }}>
            <User size={13} color="var(--cyan)" />
            <span style={{ fontWeight: 600 }}>{currentUser?.name || 'Operator'}</span>
          </div>
          <button
            onClick={() => setCurrentPage('login')}
            title="Switch User / Sign Out"
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              color: 'var(--slate-500)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <LogOut size={11} /> Exit
          </button>
        </div>
      </header>

      {/* Telemetry bar */}
      <TeleBar
        simOn={simMode && anyFix}
        simParams={params}
        carbonData={carbonData}
        backendStatus={backendStatus}
      />

      {/* Sidebar */}
      <nav className="sidebar">
        <div style={{ padding: '12px 14px 6px' }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#0f172a',
              color: '#ffffff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
            }}
          >
            <Compass size={12} /> 3D Glide Home
          </button>
        </div>

        <div className="sidebar-section-label">Views</div>
        {NAV.map(n => (
          <div
            key={n.id}
            className={`nav-item ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}
          >
            {n.icon}
            {n.label}
          </div>
        ))}

        <div className="sidebar-divider" />
        <div className="sidebar-section-label">Assets</div>
        {ASSETS.map(a => (
          <div
            key={a.id}
            className={`nav-item ${selectedAsset === a.id ? 'active' : ''}`}
            onClick={() => { setSelectedAsset(a.id); setView('scada'); }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ASSET_COLORS[a.id], flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: 11 }}>{a.name}</span>
            {a.status === 'WARNING' && <AlertTriangle size={9} color="#f59e0b" style={{ marginLeft: 'auto' }} />}
          </div>
        ))}

        <div className="sidebar-footer">
          PRECISIONWORKS MFG{'\n'}
          KPCL HACKATHON 2026{'\n'}
          WATTWIS AI v1.0
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {view === 'overview' && (
            <motion.div key="overview" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <OverviewView setView={setView} carbonData={carbonData} gridEF={gridEF} />
            </motion.div>
          )}
          {view === 'scada' && (
            <motion.div key="scada" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
              <ScadaView
                assets={simulatedAssets}
                selectedId={selectedAsset}
                onSelect={handleSelectAsset}
                onSimulate={handleSimulate}
                mapMode={mapMode}
                setMapMode={setMapMode}
              />
            </motion.div>
          )}
          {view === 'simulator' && (
            <motion.div key="simulator" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <SimulatorView
                params={params}
                setParams={(p) => { setParams(p); setSimMode(true); }}
                onResetBaseline={handleResetBaseline}
                carbonData={carbonData}
                gridEF={gridEF}
                reportingYear={reportingYear}
              />
            </motion.div>
          )}
          {view === 'carbon' && (
            <motion.div key="carbon" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <CarbonView
                params={params}
                gridEF={gridEF}
                setGridEF={setGridEF}
                carbonData={carbonData}
                carbonLoading={carbonLoading}
                carbonError={carbonError}
                backendStatus={backendStatus}
                onRecalculate={triggerCalculation}
                reportingYear={reportingYear}
                setReportingYear={setReportingYear}
                ceaMethodology={ceaMethodology}
                setCeaMethodology={setCeaMethodology}
                availableYears={availableYears}
              />
            </motion.div>
          )}
          {view === 'reports' && (
            <motion.div key="reports" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <ReportView params={params} carbonData={carbonData} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Inspector */}
      <InspectorPanel
        selectedId={selectedAsset}
        setView={setView}
        params={params}
        carbonData={carbonData}
        gridEF={gridEF}
        onResetBaseline={handleResetBaseline}
      />
    </div>
  );
}
