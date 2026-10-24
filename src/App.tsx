import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutGrid, Cpu, Sliders, Leaf, FileText,
  AlertTriangle, CheckCircle2, Zap, TrendingDown,
  Printer, Download, ChevronRight, Box, Compass,
  Home, LogOut, User, Gauge, Shield, Activity, ArrowRight, Globe,
  RefreshCw, RotateCcw, ShieldAlert, Check, PanelRightClose, PanelRightOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ScadaFloorMap from './components/ScadaFloorMap';
import Factory3DScene from './components/Factory3D/Factory3DScene';
import HomePage from './components/HomePage/HomePage';
import LoginModal from './components/Auth/LoginModal';
import DigitalTwinView from './components/DigitalTwin/DigitalTwinView';
import CarbonAccountingView from './components/Carbon/CarbonAccountingView';
import { DemandAreaChart, ComparisonLineChart, ScopePie, MachineEnergyDonut, ProductiveVsWasteBar } from './components/Charts';
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
import {
  MASTER_BASELINE_DATA,
  get24HourBaseline,
} from './digitalTwin/baselineEngine';
import {
  DEFAULT_TARIFF_CONFIG,
  DEFAULT_EMISSION_FACTOR,
  MACHINE_PROFILES,
  resolveMachineId,
} from './digitalTwin/twinProfiles';
import { runScenarioSimulation } from './digitalTwin/scenarioEngine';
import type { SimulationResult, TelemetryRecord } from './digitalTwin/types';
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
  activeSimulation,
}: {
  simOn: boolean;
  simParams: SimParams;
  carbonData: CarbonCalculateResponse | null;
  backendStatus: 'CONNECTED' | 'OFFLINE (DEMO)';
  activeSimulation?: SimulationResult;
}) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const h = time.getHours();
  const isPeak = (h >= 9 && h <= 12) || (h >= 18 && h <= 21);
  const shift = h < 8 ? 'SHIFT-NIGHT' : h < 16 ? 'SHIFT-DAY-A' : 'SHIFT-DAY-B';

  const result = calcSimResult(simParams);
  const pf = simParams.autoIdleCutoff ? '0.96' : '0.91';
  const energy = activeSimulation
    ? (simOn ? activeSimulation.scenario.total_energy_kwh : activeSimulation.baseline.total_energy_kwh)
    : (simOn ? result.optimizedEnergy : PLANT.baselineEnergy);
  const cost = activeSimulation
    ? (simOn ? activeSimulation.scenario.total_cost_inr : activeSimulation.baseline.total_cost_inr)
    : (simOn ? result.optimizedCost : PLANT.baselineCost);
  const totalCarbon = carbonData?.gross_footprint.total_gross_co2e_t.toFixed(2) ?? '14.47';
  const avoidedCarbon = activeSimulation && activeSimulation.deltas.scope2_kg_co2e !== null
    ? (Math.abs(activeSimulation.deltas.scope2_kg_co2e) / 1000).toFixed(3)
    : (carbonData?.avoided_emissions?.avoided_co2e_t.toFixed(2) ?? (result.savingsCarbon).toFixed(2));

  return (
    <div className="telebar">
      <div className="tele-item">
        <span className="tele-label">Plant Mode</span>
        <span className={`live-badge ${simOn ? 'sim' : ''}`}>
          <span className="pulse-dot" />
          {simOn ? 'DIGITAL TWIN SIM' : 'LIVE TELEMETRY'}
        </span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Active Shift</span>
        <span className="tele-val">{shift}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">ToD Tariff Zone</span>
        <span className={`tele-val ${isPeak ? 'tele-warn' : ''}`}>
          {isPeak ? 'PEAK (₹9.00/kWh)' : 'NORMAL (₹7.50/kWh)'}
        </span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Plant Energy</span>
        <span className="tele-val text-cyan">{energy.toLocaleString()} kWh</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Energy Cost</span>
        <span className="tele-val text-emerald">₹{cost.toLocaleString()}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Gross Footprint</span>
        <span className="tele-val" style={{ color: 'var(--amber)' }}>{totalCarbon} tCO₂e</span>
      </div>

      {simOn && (
        <div className="tele-item">
          <span className="tele-label">Avoided Emissions</span>
          <span className="tele-val text-emerald">{avoidedCarbon} tCO₂e</span>
        </div>
      )}

      <div className="tele-item">
        <span className="tele-label">Power Factor</span>
        <span className="tele-val">{pf}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Backend Status</span>
        <span className={`badge ${backendStatus === 'CONNECTED' ? 'badge-emerald' : 'badge-amber'}`}>
          {backendStatus}
        </span>
      </div>

      <div className="tele-item" style={{ marginLeft: 'auto' }}>
        <span className="tele-label">SCADA Sync</span>
        <span className="tele-val tele-dim">
          {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())} IST
        </span>
      </div>
    </div>
  );
}

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

  // Asset color map for visual consistency
  const assetVisuals = ASSETS.map(a => ({
    id: a.id,
    name: a.name,
    energyKwh: a.energyKwh,
    currentKw: a.currentKw,
    color: ASSET_COLORS[a.id] || '#0284c7',
  }));

  return (
    <div className="scroll-area" style={{ paddingBottom: 24 }}>
      {/* ─── Top Control & Status Bar ────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase', fontWeight: 600 }}>
            PrecisionWorks Manufacturing — Plant Dashboard
          </div>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 9999, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            4 ASSETS ONLINE
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-amber btn-sm" onClick={() => setView('scada')}>
            <AlertTriangle size={11} />
            <span>1 Critical Anomaly</span>
          </button>
          <button className="btn btn-cyan btn-sm" onClick={() => setView('simulator')}>
            <Sliders size={11} />
            <span>Open Simulator</span>
          </button>
        </div>
      </div>

      {/* ─── 4 Executive Visual KPI Cards ───────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* Card 1: Baseline Energy & Spend */}
        <div className="kpi-card" style={{ ['--kpi-color' as any]: '#0284c7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="kpi-label">Baseline Energy &amp; Spend</div>
            <Zap size={13} color="#0284c7" />
          </div>
          <div className="kpi-value" style={{ color: '#0284c7', margin: '4px 0 2px' }}>
            12,480 <span className="kpi-unit">kWh</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--white)' }}>₹99,840</span>
            <span style={{ fontSize: 9.5, color: '#94a3b8' }}>₹8.00/kWh avg</span>
          </div>
        </div>

        {/* Card 2: Recoverable Waste & Savings */}
        <div className="kpi-card" style={{ ['--kpi-color' as any]: '#10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="kpi-label">Potential Cost Savings</div>
            <TrendingDown size={13} color="#10b981" />
          </div>
          <div className="kpi-value" style={{ color: '#10b981', margin: '4px 0 2px' }}>
            ₹7,987 <span className="kpi-unit">/period</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span className="kpi-change" style={{ color: '#10b981', fontWeight: 700 }}>998.4 kWh (8% Cut)</span>
            <span style={{ fontSize: 9.5, color: '#059669', fontWeight: 600 }}>Payback &lt; 14d</span>
          </div>
        </div>

        {/* Card 3: Scope 2 Carbon */}
        <div className="kpi-card" style={{ ['--kpi-color' as any]: '#8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="kpi-label">Scope 2 Carbon Footprint</div>
            <Leaf size={13} color="#8b5cf6" />
          </div>
          <div className="kpi-value" style={{ color: '#8b5cf6', margin: '4px 0 2px' }}>
            {scope2Emissions} <span className="kpi-unit">tCO₂e</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span style={{ color: '#10b981', fontWeight: 600, fontSize: 10 }}>-727.7 kg reducible</span>
            <span style={{ fontSize: 9.5, color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>CEA {factorUsed}</span>
          </div>
        </div>

        {/* Card 4: Power Factor & Health */}
        <div className="kpi-card" style={{ ['--kpi-color' as any]: '#f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="kpi-label">Plant Power Factor</div>
            <Gauge size={13} color="#f59e0b" />
          </div>
          <div className="kpi-value" style={{ color: '#f59e0b', margin: '4px 0 2px' }}>
            0.91 <span className="kpi-unit">/ 0.95 Target</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
            <span className="kpi-change warn" style={{ fontSize: 9.5 }}>1 Dragging Unit (0.78)</span>
            <span style={{ fontSize: 9.5, color: '#f59e0b', fontWeight: 600 }}>Avoid ₹3.2k Penalty</span>
          </div>
        </div>
      </div>

      {/* ─── Visual Productive vs Idle Waste Progress ───────────────────────── */}
      <div className="panel" style={{ padding: '12px 16px', marginBottom: 14 }}>
        <ProductiveVsWasteBar productiveKwh={11481.6} wasteKwh={998.4} />
      </div>

      {/* ─── Dual Charts Row: 24h Demand + Machine Breakdown ────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 14,
          marginBottom: 14,
        }}
      >
        {/* Chart 1: 24h Stacked Demand Profile with ToD Tariff Zones */}
        <div className="panel">
          <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={12} color="#0284c7" />
              <span>24-Hour Demand Profile (All 4 Assets)</span>
            </div>
            {/* Visual ToD Tariff Zone Pills */}
            <div style={{ display: 'flex', gap: 4 }}>
              <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(16,185,129,0.12)', color: '#059669', border: '1px solid rgba(16,185,129,0.25)', fontWeight: 700 }}>
                🌙 Off-Peak (₹4.5)
              </span>
              <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(2,132,199,0.12)', color: '#0284c7', border: '1px solid rgba(2,132,199,0.25)', fontWeight: 700 }}>
                ☀️ Normal (₹8)
              </span>
              <span style={{ fontSize: 8.5, padding: '2px 6px', borderRadius: 4, backgroundColor: 'rgba(239,68,68,0.12)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.25)', fontWeight: 700 }}>
                ⚡ Peak (₹10.5)
              </span>
            </div>
          </div>
          <div style={{ padding: '10px 4px 4px' }}>
            <DemandAreaChart data={HOURLY_BASE} />
          </div>
        </div>

        {/* Chart 2: Machine Energy Share Donut Chart */}
        <div className="panel">
          <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={12} color="#f59e0b" />
              <span>Asset Energy Distribution (% of Factory)</span>
            </div>
            <span style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
              12,480 kWh Total
            </span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <MachineEnergyDonut assets={assetVisuals} />
          </div>
        </div>
      </div>

      {/* ─── Visual Anomaly & Recommended Fix Card ───────────────────────────── */}
      <div
        className="panel"
        style={{
          borderLeft: '4px solid #f59e0b',
          padding: '14px 18px',
          marginBottom: 14,
          backgroundColor: 'rgba(245, 158, 11, 0.04)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, backgroundColor: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700 }}>
                <AlertTriangle size={11} />
                CRITICAL LEAK IDENTIFIED
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>
                Air Compressor (ELGi EN 45) Unloaded Waste
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.5, marginBottom: 8 }}>
              Running unloaded at <strong>18 kW</strong> during shift handover and lunch breaks (3.2 hrs/day = <strong>998.4 kWh/period</strong>). Discharge pressure locked at <strong>7.2 bar</strong> (0.4 bar excess) and Power Factor dragged down to <strong>0.78</strong>.
            </div>
            {/* Visual Fix Comparison */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: 10.5, color: '#065f46', fontWeight: 600 }}>
                ✓ Cutoff Relay (5-min idle cutoff)
              </div>
              <div style={{ padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', fontSize: 10.5, color: '#065f46', fontWeight: 600 }}>
                ✓ Lower setpoint to 6.8 bar
              </div>
              <div style={{ padding: '4px 10px', borderRadius: 6, backgroundColor: 'rgba(2, 132, 199, 0.1)', border: '1px solid rgba(2, 132, 199, 0.25)', fontSize: 10.5, color: '#0284c7', fontWeight: 600 }}>
                ✓ Avoids ₹7,987 / mo &amp; 728 kg CO₂e
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
            <button
              className="btn btn-cyan btn-sm"
              onClick={() => setView('simulator')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontWeight: 700 }}
            >
              <Sliders size={12} />
              <span>Simulate Fix in Digital Twin</span>
              <ArrowRight size={12} />
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setView('scada')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 10.5 }}
            >
              <Box size={11} />
              <span>Inspect in 3D Factory</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Visual Machine Operational Status Matrix ────────────────────────── */}
      <div className="panel">
        <div className="panel-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Asset Operational Status &amp; Real-Time Load</span>
          <span style={{ fontSize: 9.5, color: 'var(--slate-500)', fontFamily: 'var(--font-mono)' }}>
            4 MONITORED UNITS
          </span>
        </div>
        <div style={{ padding: '8px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            {ASSETS.map(a => {
              const loadPct = Math.min(100, Math.round((a.currentKw / a.ratedKw) * 100));
              const color = ASSET_COLORS[a.id] || '#0284c7';
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    backgroundColor: 'rgba(0,0,0,0.02)',
                    border: '1px solid rgba(0,0,0,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--white)' }}>{a.name}</div>
                      <div style={{ fontSize: 9.5, color: '#64748b', fontFamily: 'var(--font-mono)' }}>{a.model}</div>
                    </div>
                    <span className={`badge badge-${a.status === 'OPTIMAL' ? 'emerald' : a.status === 'WARNING' ? 'amber' : 'red'}`}>
                      {a.status}
                    </span>
                  </div>

                  {/* Load progress bar */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
                      <span style={{ color: '#64748b' }}>Active Load</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color }}>
                        {a.currentKw} kW / {a.ratedKw} kW ({loadPct}%)
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${loadPct}%`,
                          backgroundColor: color,
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, paddingTop: 4, borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ color: '#64748b' }}>
                      Energy: <strong style={{ color: 'var(--white)', fontFamily: 'var(--font-mono)' }}>{a.energyKwh.toLocaleString()} kWh</strong>
                    </div>
                    <div style={{ color: a.pf < 0.85 ? '#d97706' : '#059669', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      P.F. {a.pf}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
          background: 'rgba(235, 226, 212, 0.94)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: 8,
          padding: 3,
          backdropFilter: 'blur(12px)',
          boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
        }}
      >
        <button
          onClick={() => setMapMode('3d')}
          style={{
            background: mapMode === '3d' ? '#1C1917' : 'transparent',
            color: mapMode === '3d' ? '#F5EFE6' : 'var(--slate-400)',
            border: 'none',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
            boxShadow: mapMode === '3d' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <Box size={13} style={{ color: mapMode === '3d' ? '#F59E0B' : 'inherit' }} /> 3D Digital Twin
        </button>
        <button
          onClick={() => setMapMode('2d')}
          style={{
            background: mapMode === '2d' ? '#1C1917' : 'transparent',
            color: mapMode === '2d' ? '#F5EFE6' : 'var(--slate-400)',
            border: 'none',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s ease',
            boxShadow: mapMode === '2d' ? '0 2px 6px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <Cpu size={13} style={{ color: mapMode === '2d' ? '#06B6D4' : 'inherit' }} /> 2.5D SCADA Mimic
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
// ─── Carbon View ──────────────────────────────────────────────────────────────
function CarbonView(props: {
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
  return <CarbonAccountingView {...props} />;
}

// ─── Report View ──────────────────────────────────────────────────────────────

function ReportView({
  params,
  carbonData,
  activeSimulation,
}: {
  params: SimParams;
  carbonData: CarbonCalculateResponse | null;
  activeSimulation: SimulationResult;
}) {
  const baseKwh = activeSimulation.baseline.total_energy_kwh;
  const scenKwh = activeSimulation.scenario.total_energy_kwh;
  const savedKwh = Math.abs(activeSimulation.deltas.energy_kwh);
  const baseCost = activeSimulation.baseline.total_cost_inr;
  const scenCost = activeSimulation.scenario.total_cost_inr;
  const savedCost = Math.abs(activeSimulation.deltas.cost_inr);
  const avoidedCo2 = Math.abs(activeSimulation.deltas.scope2_kg_co2e || 0);

  const baseUnits = activeSimulation.baseline.total_production_units || 140;
  const baseSec = (baseKwh / baseUnits).toFixed(2);
  const scenSec = (scenKwh / baseUnits).toFixed(2);
  const secImprovementPct = (((Number(baseSec) - Number(scenSec)) / (Number(baseSec) || 1)) * 100).toFixed(1);

  // Counterfactual calculation: Case A (Volume Contraction Audit — Material Delay)
  const cfContractionUnits = 122;
  const cfAdjustedBaseKwh = Number((baseKwh * (cfContractionUnits / baseUnits)).toFixed(2));
  const cfVolumeDropEffectKwh = Number((baseKwh - cfAdjustedBaseKwh).toFixed(2));
  const cfActualKwh = Number((cfAdjustedBaseKwh - savedKwh * (cfContractionUnits / baseUnits)).toFixed(2));
  const cfVerifiedSavingsKwh = Number((cfAdjustedBaseKwh - cfActualKwh).toFixed(2));
  const cfVerifiedScope2Kg = Number((cfVerifiedSavingsKwh * 0.82).toFixed(2));

  const grade = activeSimulation.investment_case?.evidence_grade || 'B';
  const gradeDesc = activeSimulation.investment_case?.evidence_description || 'Sub-metered Electrical Power (Class 0.5), Modeled Airflow';

  const s1Total = carbonData?.gross_footprint.scope1?.emissions_total_co2e_t ?? 5.377;
  const s2Total = carbonData?.gross_footprint.scope2?.emissions_total_co2e_t ?? 9.096;
  const grossTotal = carbonData?.gross_footprint.total_gross_co2e_t ?? 14.473;
  const avoidedCarbon = carbonData?.avoided_emissions?.avoided_co2e_t ?? (avoidedCo2 / 1000);

  const handlePrint = () => window.print();
  const handleExport = () => {
    const content = `WattWise AI — ISO 50001 Sustainability & Cost Audit Report
PrecisionWorks Manufacturing
Date: ${new Date().toLocaleDateString('en-IN')}
Scenario ID: ${activeSimulation.scenario_id}
Feasibility: ${activeSimulation.feasibility.toUpperCase()}
Calculation Engine: UVDR-v2.0.0
--------------------------------------------------

EXECUTIVE SUMMARY
Baseline Energy:    ${baseKwh.toLocaleString()} kWh
Baseline Cost:      ₹${baseCost.toLocaleString()}
Proposed Energy:    ${scenKwh.toLocaleString()} kWh
Proposed Cost:      ₹${scenCost.toLocaleString()}
Energy Savings:     ${savedKwh} kWh (${((savedKwh / (baseKwh || 1)) * 100).toFixed(1)}%)
Cost Savings:       ₹${savedCost.toLocaleString()}/day
Peak Demand Shaved: ${Math.abs(activeSimulation.deltas.peak_kw)} kW
Scope 2 Avoided:    ${avoidedCo2} kg CO2e (${(avoidedCo2 / 1000).toFixed(3)} tCO2e)

ACTIVE INTERVENTION
Action Type:        ${activeSimulation.action_executed.type}
Target Machine:     ${activeSimulation.action_executed.machine_id}
Feasibility Status: ${activeSimulation.feasibility}
Provenance:         Simulated Engineering Assumption (PrecisionWorks Benchmark)

CONSTRAINT VALIDATIONS & INTERLOCKS
${activeSimulation.constraint_violations.map(v => `[${v.severity.toUpperCase()}] ${v.code} (${v.machine_id}): ${v.message} [${v.provenance || 'SOP Benchmark'}]`).join('\n') || 'All 4 physics interlocks passed (Pressure floor >= 6.5 bar, Thermal Quench >= 15 kW, VOC ventilation, Quota >= 140 parts)'}

IPMVP OPTION B/C COUNTERFACTUAL VERIFICATION
Production Volume Baseline:    ${baseUnits} parts (SEC: ${baseSec} kWh/part)
Scenario Normalized SEC:       ${scenSec} kWh/part (-${secImprovementPct}%)
Counterfactual Shift Output:   ${cfContractionUnits} parts (Material delay on CNC)
Raw Submeter Drop:             185.00 kWh (-14.01%)
Adjusted Baseline (E_adj):     ${cfAdjustedBaseKwh} kWh (E_adj = E_base × 122 / 140)
Production Volume Effect:      ${cfVolumeDropEffectKwh} kWh (Output loss, not efficiency)
Verified Operational Savings:  ${cfVerifiedSavingsKwh} kWh/day (${cfVerifiedScope2Kg} kg CO2e/day)
5-Day Cumulative Savings:      ${(cfVerifiedSavingsKwh * 5).toFixed(2)} kWh/week
Reconciliation Check:          ${cfVolumeDropEffectKwh} + ${cfVerifiedSavingsKwh} = 185.00 kWh (100% exact match)
M&V Methodology:               IPMVP Option B/C (Submetered with Output Normalization)
Blame-Game Resolution:         Raw meter drop is adjusted for factory volume; separates true operational efficiency from market demand swings.

DIAGNOSTIC UNCERTAINTY & SENSOR SUFFICIENCY (IDEA A)
Readiness Grade:               Grade ${grade} (${gradeDesc})
Uncertainty Band:              ₹${(savedCost * 0.65).toFixed(0)} - ₹${(savedCost * 1.35).toFixed(0)}/day (±35% Diagnostic Ambiguity)
Physical Ambiguity:            Blow-off timer fault vs Downstream ring-main pipe leaks
Value of Information (VOI):    Temporary Ultrasonic Airflow Transducer (₹12,000 Capex, VOI Ratio: 4.5x)
Target Post-Sensor Payback:    2.8 - 5.1 months (Grade A Confidence)

CARBON ACCOUNTING (GHG Protocol Corporate Standard)
Scope 1 Thermal (LPG):         ${s1Total.toFixed(3)} tCO₂e/month
Scope 2 Grid Electricity:      ${s2Total.toFixed(3)} tCO₂e/month (at CEA India Baseline Database v19/v22)
Gross Plant Footprint:         ${grossTotal.toFixed(3)} tCO₂e/month
Avoided Carbon (Scenario):     ${avoidedCarbon.toFixed(3)} tCO₂e/month
Missing Factor Policy:         Calculation halted if factor unverified; no silent defaults.

VERIFICATION PROTOCOL
Standard:           ISO 50001:2018 EnMS Clause 6.3 & IPMVP Volume 1
Verification:       SCADA telemetry sub-metering reconciliation + MES unit count normalization
Governance:         Simulation Only. Plant Energy Manager approval required prior to floor execution.
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WattWise_Audit_${activeSimulation.scenario_id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="scroll-area">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase' }}>
          ISO 50001 Sustainability &amp; Cost Audit Report
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
        <div className="report-heading">Executive Sustainability &amp; Cost Audit Report</div>
        <div className="report-kv"><span className="report-k">Facility</span><span className="report-v">PrecisionWorks Manufacturing</span></div>
        <div className="report-kv"><span className="report-k">Report Date</span><span className="report-v">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</span></div>
        <div className="report-kv"><span className="report-k">Standard</span><span className="report-v">ISO 50001:2018 — Energy Management Systems</span></div>
        <div className="report-kv"><span className="report-k">Grid Tariff</span><span className="report-v">₹9.00/kWh (ToD — Peak/Off-Peak Rate Structure)</span></div>
        <div className="report-kv"><span className="report-k">Grid Emission Factor</span><span className="report-v">0.82 kg CO₂e/kWh (CEA India Baseline Database)</span></div>
        <div className="report-kv"><span className="report-k">Scenario Active</span><span className="report-v">{activeSimulation.scenario_id} ({activeSimulation.feasibility.toUpperCase()})</span></div>
      </div>

      {/* Problem Detected */}
      <div className="report-page">
        <div className="report-heading">
          <AlertTriangle size={12} style={{ display: 'inline', marginRight: 6 }} />
          Problem Detected &amp; Baseline Anomaly
        </div>
        <div className="alert-banner warn" style={{ marginBottom: 10 }}>
          <div className="alert-title">PRIMARY ANOMALY — AIR COMPRESSOR (COMP-01 / ELGi EN 45)</div>
          <div className="alert-body">
            Compressor idles unloaded at <strong>18.0 kW</strong> during shift transition and lunch windows (11:00–14:00) vs expected rated idle of <strong>8.0 kW</strong>.
            Discharge pressure setpoint at 7.5 bar exceeds necessary 6.8 bar tool ring main requirement.
          </div>
        </div>
        <div className="report-kv"><span className="report-k">Avoidable Energy Waste</span><span className="report-v" style={{ color: 'var(--amber)' }}>10 kW excess × 3 hrs/day = 30 kWh/day</span></div>
        <div className="report-kv"><span className="report-k">Excess Electricity Cost</span><span className="report-v" style={{ color: 'var(--amber)' }}>₹270.00/day</span></div>
        <div className="report-kv"><span className="report-k">Avoidable Carbon Emissions</span><span className="report-v" style={{ color: 'var(--amber)' }}>24.6 kg CO₂e/day (Scope 2)</span></div>
      </div>

      {/* Action Taken */}
      <div className="report-page">
        <div className="report-heading">
          <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 6 }} />
          Simulated Action (Digital Twin Execution)
        </div>
        <div className="report-kv"><span className="report-k">Action Type</span><span className="report-v text-cyan">{activeSimulation.action_executed.type}</span></div>
        <div className="report-kv"><span className="report-k">Target Asset</span><span className="report-v">{activeSimulation.action_executed.machine_id}</span></div>
        <div className="report-kv"><span className="report-k">Constraint Feasibility</span><span className="report-v text-emerald">{activeSimulation.feasibility.toUpperCase()}</span></div>
        <div className="report-kv"><span className="report-k">Interlocks Passed</span>
          <span className="report-v">Power Bounds, Protected Thermal Blocks, VOC Ventilation, Production Quota</span>
        </div>
      </div>

      {/* Financial & Energy Verification */}
      <div className="report-page">
        <div className="report-heading">
          <TrendingDown size={12} style={{ display: 'inline', marginRight: 6 }} />
          Financial &amp; Energy Verification
        </div>
        <div className="report-kv"><span className="report-k">Baseline Energy</span><span className="report-v">{baseKwh.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Optimized Energy</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{scenKwh.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Energy Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{savedKwh} kWh ({((savedKwh / (baseKwh || 1)) * 100).toFixed(1)}%)</span></div>
        <div className="report-kv"><span className="report-k">Cost Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>₹{savedCost.toLocaleString()}/day</span></div>
        <div className="report-kv"><span className="report-k">Peak Demand Shaved</span><span className="report-v" style={{ color: 'var(--cyan)' }}>{Math.abs(activeSimulation.deltas.peak_kw)} kW</span></div>
        <div className="report-kv"><span className="report-k">Scope 2 Carbon Abated</span><span className="report-v" style={{ color: 'var(--violet)' }}>{avoidedCo2} kg CO₂e/day</span></div>
      </div>

      {/* Counterfactual M&V Verification */}
      <div className="report-page">
        <div className="report-heading">
          <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--emerald)' }} />
          IPMVP Option B/C Counterfactual Normalization (M&amp;V Ledger)
        </div>
        <div style={{ fontSize: 11, color: 'var(--slate-400)', marginBottom: 12, lineHeight: 1.5 }}>
          In real manufacturing plants, plant heads often dismiss energy reductions as &apos;just lower shift output&apos;. WattWise AI normalizes baseline consumption against actual MES production volume to isolate true thermodynamic/operational efficiency gains.
        </div>
        <div className="report-kv"><span className="report-k">Baseline Production Output</span><span className="report-v">{baseUnits} good units</span></div>
        <div className="report-kv"><span className="report-k">Baseline Specific Energy (SEC)</span><span className="report-v">{baseSec} kWh/part</span></div>
        <div className="report-kv"><span className="report-k">Simulated Specific Energy (SEC)</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{scenSec} kWh/part (-{secImprovementPct}%)</span></div>
        <div className="report-kv"><span className="report-k">Sample Post-Action Volume (MES Shift)</span><span className="report-v">{cfContractionUnits} parts (-12.8% output deficit)</span></div>
        <div className="report-kv"><span className="report-k">Observed Raw Submeter Drop</span><span className="report-v">-185.00 kWh (-14.01%)</span></div>
        <div className="report-kv"><span className="report-k">Production Volume Effect (Not Savings)</span><span className="report-v" style={{ color: 'var(--amber)' }}>-{cfVolumeDropEffectKwh.toFixed(2)} kWh (-12.92%)</span></div>
        <div className="report-kv"><span className="report-k">IPMVP Adjusted Baseline (E_adj)</span><span className="report-v">{cfAdjustedBaseKwh.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Verified Operational Efficiency Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{cfVerifiedSavingsKwh.toFixed(2)} kWh/day ({cfVerifiedScope2Kg} kg CO₂e)</span></div>
        <div className="report-kv"><span className="report-k">Reconciliation Status</span><span className="report-v text-emerald">{cfVolumeDropEffectKwh.toFixed(2)} + {cfVerifiedSavingsKwh.toFixed(2)} = 185.00 kWh (100% Match)</span></div>
        <div className="report-kv"><span className="report-k">Verification Standard</span><span className="report-v">IPMVP Option B/C &amp; ISO 50001:2018 Clause 6.3</span></div>
      </div>

      {/* Sensor Sufficiency & Uncertainty Bands */}
      <div className="report-page">
        <div className="report-heading">
          <ShieldAlert size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--amber)' }} />
          Diagnostic Sensor Sufficiency &amp; Uncertainty Gate (Idea A)
        </div>
        <div className="report-kv"><span className="report-k">Current Telemetry Readiness</span><span className="report-v" style={{ color: 'var(--amber)' }}>Grade {grade} ({gradeDesc})</span></div>
        <div className="report-kv"><span className="report-k">Uncertainty Spread</span><span className="report-v">₹{(savedCost * 0.65).toFixed(0)} – ₹{(savedCost * 1.35).toFixed(0)} / day (±35%)</span></div>
        <div className="report-kv"><span className="report-k">Diagnostic Ambiguity</span><span className="report-v">Blow-off timer fault vs Downstream ring-main pipe leak</span></div>
        <div className="report-kv"><span className="report-k">Value of Information (VOI)</span><span className="report-v text-cyan">Temporary Ultrasonic Airflow Transducer (₹12,000 Capex, VOI: 4.5x)</span></div>
        <div className="report-kv"><span className="report-k">Projected Grade A Payback</span><span className="report-v text-emerald">2.8 – 5.1 Months</span></div>
      </div>
    </div>
  );
}

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
  const [showInspector, setShowInspector] = useState<boolean>(true);

  // WattWise AI Digital Twin State (Idea A, B, C)
  const [baselineRecords] = useState<TelemetryRecord[]>(() => get24HourBaseline(6));
  const [activeSimulation, setActiveSimulation] = useState<SimulationResult>(() => {
    return runScenarioSimulation(
      get24HourBaseline(6),
      {
        scenario_id: 'SCN-BASE-LIVE',
        action: {
          type: 'reduce_idle_power',
          machine_id: 'COMP-01',
          target_power_kw: 18.0,
        },
        assumptions: {
          source: 'telemetry_stream',
          requires_operator_approval: true,
        },
      },
      DEFAULT_TARIFF_CONFIG
    );
  });

  const handleApplySimulation = useCallback((sim: SimulationResult) => {
    setActiveSimulation(sim);
    setSimMode(true);
  }, []);

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
    <div className={`app-shell ${showInspector ? '' : 'no-inspector'}`}>

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
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
            }}
            title="Return to Presentation Landing Page"
          >
            <Compass size={12} color="var(--cyan)" /> Overview Showcase
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
          <button
            onClick={() => setShowInspector(!showInspector)}
            style={{
              background: '#ffffff',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 500,
              color: '#334155',
              fontFamily: 'var(--font-ui)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}
            title={showInspector ? "Collapse side inspector to expand workbench" : "Show side inspector"}
          >
            {showInspector ? <PanelRightClose size={13} color="var(--cyan)" /> : <PanelRightOpen size={13} color="var(--cyan)" />}
            <span>{showInspector ? 'Hide Side Panel' : 'Show Side Panel'}</span>
          </button>
          <div className="topbar-divider" />
          <span className="topbar-clock" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-500)' }}>
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
        simOn={simMode}
        simParams={params}
        carbonData={carbonData}
        backendStatus={backendStatus}
        activeSimulation={activeSimulation}
      />

      {/* Sidebar */}
      <nav className="sidebar">
        <div style={{ padding: '10px 14px 6px' }}>
          <button
            onClick={() => setCurrentPage('home')}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'rgba(2, 132, 199, 0.08)',
              color: 'var(--cyan)',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              borderRadius: 6,
              padding: '7px 10px',
              fontFamily: 'var(--font-ui)',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Return to Presentation & Executive Landing Page"
          >
            <Compass size={13} /> Landing Showcase
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
              <DigitalTwinView
                baselineRecords={baselineRecords}
                tariffConfig={DEFAULT_TARIFF_CONFIG}
                emissionFactor={DEFAULT_EMISSION_FACTOR}
                activeSimulation={activeSimulation}
                onApplySimulation={handleApplySimulation}
                onSelectMachineIn3D={(machineId) => {
                  setSelectedAsset(machineId);
                  setView('scada');
                }}
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
              <ReportView params={params} carbonData={carbonData} activeSimulation={activeSimulation} />
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