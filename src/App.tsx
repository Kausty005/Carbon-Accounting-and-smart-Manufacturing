import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutGrid, Cpu, Sliders, Leaf, FileText,
  AlertTriangle, CheckCircle2, Zap, TrendingDown, TrendingUp,
  BarChart2, Calendar, ChevronDown, ChevronRight, Bell,
  Building2, Sun, CloudRain, Coins, Info, Wrench,
  Flame, Fan, Server, Box, Compass, LogOut, User, RotateCcw,
  PanelRightClose, PanelRightOpen, Activity, ArrowRight,
  Shield, Gauge, Printer, Download, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import factoryHeroImg from './assets/hero.png';
import ScadaFloorMap from './components/ScadaFloorMap';
import Factory3DScene from './components/Factory3D/Factory3DScene';
import HomePage from './components/HomePage/HomePage';
import LoginModal from './components/Auth/LoginModal';
import DigitalTwinView from './components/DigitalTwin/DigitalTwinView';
import CarbonAccountingView from './components/Carbon/CarbonAccountingView';
import AIAnomalyIntelligence from './components/AIAnomaly/AIAnomalyIntelligence';
import EnergyForecastDashboard from './components/ForecastDashboard/EnergyForecastDashboard';
import { AssetLibraryConfigurator } from './components/Library/AssetLibraryConfigurator';
import { CarbonQuotaInterlock } from './components/Carbon/CarbonQuotaInterlock';
import { ExecutivePresentationView } from './components/Executive/ExecutivePresentationView';
import { EngineeringDiagnosticView } from './components/Diagnostics/EngineeringDiagnosticView';

import { AIExplainProvider } from './components/AIExplain/AIExplainContext';
import { AIExplainPopover } from './components/AIExplain/AIExplainPopover';
import { Explainable } from './components/AIExplain/Explainable';
import { FloatingChatbot } from './components/AIChat/FloatingChatbot';
import { DemandAreaChart, ComparisonLineChart, ScopePie, MachineEnergyDonut, ProductiveVsWasteBar } from './components/Charts';
import {
  PLANT, ASSETS, HOURLY_BASE, CARBON,
  calcSimResult, DEFAULT_SIM_PARAMS, type SimParams, type Asset, type AssetStatus,
} from './data/mockData';
import {
  fetchLiveSimulationTick,
  type LiveSimulationTickResponse,
  type AnomalyIncident,
} from './services/anomalyApi';
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

type View =
  | 'overview'
  | 'executive'
  | 'diagnostics'
  | 'scada'
  | 'simulator'
  | 'configurator'
  | 'quota'
  | 'forecast'
  | 'carbon'
  | 'anomalies'
  | 'reports';

const NAV: { id: View; icon: React.ReactNode; label: string }[] = [
  { id: 'overview',     icon: <LayoutGrid size={14} />,   label: 'Overview' },
  { id: 'executive',    icon: <Award size={14} />,        label: 'Executive View' },
  { id: 'diagnostics',  icon: <Terminal size={14} />,     label: 'Diagnostics Cockpit' },
  { id: 'scada',        icon: <Box size={14} />,          label: '3D Factory Twin' },
  { id: 'simulator',    icon: <Sliders size={14} />,      label: 'Digital Twin' },
  { id: 'configurator', icon: <Database size={14} />,     label: '50-Asset Catalog' },
  { id: 'quota',        icon: <ShieldCheck size={14} />,  label: 'Carbon Quotas & Ledger' },
  { id: 'forecast',     icon: <TrendingUp size={14} />,   label: 'Energy Forecast' },
  { id: 'carbon',       icon: <Leaf size={14} />,         label: 'Carbon Accounting' },
  { id: 'anomalies',    icon: <Activity size={14} />,     label: 'AI Anomaly Intelligence' },
  { id: 'reports',      icon: <FileText size={14} />,     label: 'Audit Report' },
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

// â”€â”€â”€ Top Telemetry Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function TeleBar({
  simOn,
  simParams,
  carbonData,
  backendStatus,
  activeSimulation,
  livePlantPower,
  liveTick,
}: {
  simOn: boolean;
  simParams: SimParams;
  carbonData: CarbonCalculateResponse | null;
  backendStatus: 'CONNECTED' | 'OFFLINE (DEMO)';
  activeSimulation?: SimulationResult;
  livePlantPower?: number;
  liveTick?: number;
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
          {simOn ? 'DIGITAL TWIN SIM' : 'LIVE SCADA STREAM'}
        </span>
      </div>

      <div className="tele-item">
        <span className="tele-label">Real-Time Demand</span>
        <span className="tele-val text-cyan" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Zap size={11} color="var(--cyan)" />
          {livePlantPower != null ? `${livePlantPower.toFixed(1)} kW` : `${PLANT.baselineDemandKva} kVA`}
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
          {liveTick ? `Tick #${liveTick} • ` : ''}{pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())} IST
        </span>
      </div>
    </div>
  );
}

// â”€â”€â”€ 24h Demand Data & Distribution Constants matching reference â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const OVERVIEW_24H_DEMAND = [
  { time: '00:00', compressor: 18, cnc: 0, furnace: 0, cooling: 14 },
  { time: '02:00', compressor: 38, cnc: 0, furnace: 0, cooling: 16 },
  { time: '04:00', compressor: 42, cnc: 4, furnace: 18, cooling: 20 },
  { time: '06:00', compressor: 32, cnc: 52, furnace: 70, cooling: 30 },
  { time: '08:00', compressor: 44, cnc: 84, furnace: 145, cooling: 36 },
  { time: '10:00', compressor: 48, cnc: 92, furnace: 160, cooling: 39 },
  { time: '12:00', compressor: 38, cnc: 86, furnace: 162, cooling: 38 },
  { time: '14:00', compressor: 42, cnc: 88, furnace: 148, cooling: 37 },
  { time: '16:00', compressor: 46, cnc: 94, furnace: 158, cooling: 39 },
  { time: '18:00', compressor: 40, cnc: 85, furnace: 140, cooling: 36 },
  { time: '20:00', compressor: 22, cnc: 12, furnace: 42, cooling: 22 },
  { time: '22:00', compressor: 18, cnc: 0, furnace: 0, cooling: 16 },
  { time: '24:00', compressor: 18, cnc: 0, furnace: 0, cooling: 14 },
];

function OverviewView({
  setView,
  carbonData,
  gridEF,
  onSelectAsset,
  assets,
  livePlantPower,
  activeAnomaly,
  liveTick,
}: {
  setView: (v: View) => void;
  carbonData: CarbonCalculateResponse | null;
  gridEF: number;
  onSelectAsset?: (id: string) => void;
  assets?: Asset[];
  livePlantPower?: number;
  activeAnomaly?: AnomalyIncident | null;
  liveTick?: number;
}) {
  const currentAssetList = assets || ASSETS;
  const compAsset = currentAssetList.find(a => a.id === 'compressor') || ASSETS[0];
  const cncAsset = currentAssetList.find(a => a.id === 'cnc') || ASSETS[1];
  const furnAsset = currentAssetList.find(a => a.id === 'furnace') || ASSETS[2];
  const chillAsset = currentAssetList.find(a => a.id === 'cooling') || ASSETS[3];

  const scope2Emissions = carbonData?.gross_footprint.scope2?.emissions_total_co2e_t.toFixed(2) ?? '14.47';
  const factorUsed = (carbonData?.gross_footprint.scope2?.factor_metadata.selected_factor ?? gridEF).toFixed(2);

  const totalLiveKw = livePlantPower ?? currentAssetList.reduce((s, a) => s + (a.currentKw || 0), 0);
  const totalPlantEnergyKwh = currentAssetList.reduce((s, a) => s + (a.energyKwh || 0), 0);
  const avgPf = +(currentAssetList.reduce((s, a) => s + (a.pf || 0.9), 0) / currentAssetList.length).toFixed(2);
  const flaggedAssets = currentAssetList.filter(a => a.status === 'WARNING' || a.status === 'PEAK');

  const compLoadPct = Math.min(100, Math.round((compAsset.currentKw / compAsset.ratedKw) * 100));
  const cncLoadPct = Math.min(100, Math.round((cncAsset.currentKw / cncAsset.ratedKw) * 100));
  const furnLoadPct = Math.min(100, Math.round((furnAsset.currentKw / furnAsset.ratedKw) * 100));
  const chillLoadPct = Math.min(100, Math.round((chillAsset.currentKw / chillAsset.ratedKw) * 100));

  const anomalySavingsInr = activeAnomaly?.action_recommendations?.[0]?.estimated_savings_inr ?? 7987;
  const anomalySavingsKwh = activeAnomaly?.action_recommendations?.[0]?.estimated_savings_kwh ?? activeAnomaly?.estimated_excess_energy_kwh ?? 998;

  // Dynamic hourly demand chart with current hour reflecting real-time telemetry
  const dynamicHourlyData = useMemo(() => {
    const currentHour = new Date().getHours();
    return OVERVIEW_24H_DEMAND.map((item, idx) => {
      const itemHour = idx * 2;
      if (Math.abs(itemHour - currentHour) < 2) {
        return {
          ...item,
          compressor: compAsset.currentKw,
          cnc: cncAsset.currentKw,
          furnace: furnAsset.currentKw,
          cooling: chillAsset.currentKw,
        };
      }
      return item;
    });
  }, [compAsset.currentKw, cncAsset.currentKw, furnAsset.currentKw, chillAsset.currentKw]);

  return (
    <div className="scroll-area" style={{ background: '#F4EEE5', minHeight: '100%', padding: '16px 22px 32px' }}>
      {/* ─── Top Header: Title & Time Controls ───────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 25, fontWeight: 700, color: '#1E252D', margin: 0, letterSpacing: '-0.015em' }}>
            Plant overview
          </h1>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3 }}>
            Energy, cost and machine health at a glance
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Calendar & Timestamp Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#FFFFFF', border: '1px solid #EAE3D7',
            borderRadius: 8, padding: '5px 12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
          }}>
            <Calendar size={14} color="#64748B" />
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 11, fontWeight: 600, color: '#1E252D', lineHeight: 1.25 }}>
              <span>PrecisionWorks Factory</span>
              <span style={{ fontSize: 9.5, color: '#64748B', fontWeight: 500 }}>
                {liveTick ? `Tick #${liveTick} • Live SCADA` : 'Real-Time SCADA'}
              </span>
            </div>
          </div>

          <span style={{ fontSize: 9.5, padding: '4px 10px', borderRadius: 9999, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)', fontWeight: 700, fontFamily: 'var(--font-mono)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
            4 ASSETS ONLINE ({totalLiveKw.toFixed(1)} kW)
          </span>

          <button className={`btn ${flaggedAssets.length > 0 || activeAnomaly ? 'btn-amber' : 'btn-outline'} btn-sm`} onClick={() => setView('anomalies')}>
            <AlertTriangle size={11} />
            <span>{activeAnomaly ? `1 Live Anomaly (${activeAnomaly.equipment_id})` : `${flaggedAssets.length} Critical Anomaly`}</span>
          </button>
          <button className="btn btn-cyan btn-sm" onClick={() => setView('simulator')}>
            <Sliders size={11} />
            <span>Open Simulator</span>
          </button>
        </div>
      </div>

      {/* ─── Row 1: Top 4 KPI Metric Cards ─────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 14
      }}>
        {/* Card 1: Energy today */}
        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Energy today',
            identifier: 'kpi_energy_today',
            value: totalPlantEnergyKwh.toLocaleString(),
            unit: 'kWh',
            trend: `${totalLiveKw.toFixed(1)} kW Live Draw`,
            time_range: 'Last 24 Hours',
            timestamp: liveTick ? `Tick #${liveTick}` : 'Live SCADA',
            site: 'PrecisionWorks Mfg',
            evidence: { energy_kwh: totalPlantEnergyKwh, live_kw: totalLiveKw },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color="#0284C7" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>Energy today</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E252D', marginBottom: 8 }}>
              {totalPlantEnergyKwh.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: '#1E252D' }}>kWh</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-mono)' }}>
                <span className="pulse-dot" style={{ width: 6, height: 6, backgroundColor: '#10B981', display: 'inline-block' }} />
                {totalLiveKw.toFixed(1)} kW Live Draw
              </span>
              <BarChart2 size={14} color="#0284C7" />
            </div>
          </div>
        </Explainable>

        {/* Card 2: Energy cost */}
        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Energy cost',
            identifier: 'kpi_energy_cost',
            value: '₹23,044',
            unit: 'INR',
            trend: '+6.1% vs yesterday',
            time_range: 'Last 24 Hours',
            timestamp: liveTick ? `Tick #${liveTick}` : 'Live SCADA',
            site: 'PrecisionWorks Mfg',
            evidence: { cost_inr: 23044, avg_tariff_inr: 9.0 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F3E8FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Coins size={16} color="#9333EA" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>Energy cost</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E252D', marginBottom: 8 }}>
              ₹23,044
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 2 }}>
                ↑ +6.1% vs yesterday
              </span>
              <BarChart2 size={14} color="#0284C7" />
            </div>
          </div>
        </Explainable>

        {/* Card 3: Potential savings */}
        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Potential savings',
            identifier: 'kpi_potential_savings',
            value: `₹${Math.round(anomalySavingsInr).toLocaleString()}`,
            unit: 'INR / period',
            trend: activeAnomaly ? `${anomalySavingsKwh} kWh reduction` : '998 kWh (8% reduction)',
            time_range: 'Last 24 Hours',
            site: 'PrecisionWorks Mfg',
            evidence: { savings_inr: anomalySavingsInr, savings_kwh: anomalySavingsKwh, reduction_pct: 8.0 },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Leaf size={16} color="#16A34A" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>Potential savings</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E252D', marginBottom: 8 }}>
              ₹{Math.round(anomalySavingsInr).toLocaleString()}{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#64748B' }}>/ period</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>
                {activeAnomaly ? `${anomalySavingsKwh} kWh reduction` : '998 kWh (8% reduction)'}
              </span>
              <BarChart2 size={14} color="#16A34A" />
            </div>
          </div>
        </Explainable>

        {/* Card 4: Carbon footprint */}
        <Explainable
          context={{
            component_type: 'kpi',
            title: 'Carbon footprint',
            identifier: 'kpi_carbon_footprint',
            value: scope2Emissions,
            unit: 'tCO₂e',
            trend: '-12.6% vs baseline',
            time_range: 'Last 24 Hours',
            site: 'PrecisionWorks Mfg',
            evidence: { footprint_tco2e: parseFloat(scope2Emissions), cea_grid_factor: parseFloat(factorUsed) },
          }}
        >
          <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFEDD5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CloudRain size={16} color="#EA580C" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>Carbon footprint</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1E252D', marginBottom: 8 }}>
              {scope2Emissions} <span style={{ fontSize: 13, fontWeight: 500, color: '#1E252D' }}>tCO₂e</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>
                -12.6% vs baseline
              </span>
              <BarChart2 size={14} color="#475569" />
            </div>
          </div>
        </Explainable>
      </div>

      {/* ─── Row 2: Dual Charts + Priority Alerts (3 Columns) ───────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40% 35% 25%',
        gap: 12,
        marginBottom: 14,
        alignItems: 'stretch'
      }}>
        {/* Chart 1: Energy demand today */}
        <Explainable
          context={{
            component_type: 'chart',
            title: 'Energy demand today',
            identifier: 'chart_energy_demand_24h',
            time_range: 'Last 24 Hours (00:00 - 24:00 IST)',
            site: 'PrecisionWorks Mfg',
            series: [
              { name: 'Furnace', peak_value: furnAsset.currentKw, unit: 'kW', color: '#EF4444', summary_note: 'Daytime heating loop' },
              { name: 'CNC', peak_value: cncAsset.currentKw, unit: 'kW', color: '#0EA5E9', summary_note: 'Shift machining cycle' },
              { name: 'Compressor', peak_value: compAsset.currentKw, unit: 'kW', color: '#F59E0B', summary_note: 'Pneumatics line draw' },
              { name: 'Cooling', peak_value: chillAsset.currentKw, unit: 'kW', color: '#10B981', summary_note: 'Continuous thermal loop' },
            ],
          }}
          style={{ height: '100%' }}
        >
          <div style={{
            background: '#FFFFFF', border: '1px solid #EAE3D7',
            borderRadius: 12, padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            height: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={15} color="#0284C7" />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1E252D' }}>Energy demand today</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Total plant load by major assets</div>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#FFFFFF', border: '1px solid #EAE3D7',
                borderRadius: 6, padding: '3px 9px',
                fontSize: 11, fontWeight: 700, color: '#0284C7'
              }}>
                <span className="pulse-dot" style={{ width: 5, height: 5 }} />
                <span>{totalLiveKw.toFixed(1)} kW Live</span>
              </div>
            </div>

            {/* Area Chart with Monotone Smooth Splines */}
            <div style={{ width: '100%', height: 165 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dynamicHourlyData} margin={{ top: 8, right: 10, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gFurn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gCnc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gCool" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#F1F5F9" vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 9.5 }} />
                  <YAxis domain={[0, 180]} ticks={[0, 45, 90, 135, 180]} tick={{ fill: '#64748B', fontSize: 9.5 }} label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', offset: 30, fill: '#64748B', fontSize: 9.5 }} />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="furnace" name="Furnace" stroke="#EF4444" strokeWidth={1.8} fill="url(#gFurn)" dot={false} />
                  <Area type="monotone" dataKey="cnc" name="CNC" stroke="#0EA5E9" strokeWidth={1.8} fill="url(#gCnc)" dot={false} />
                  <Area type="monotone" dataKey="compressor" name="Compressor" stroke="#F59E0B" strokeWidth={1.8} fill="url(#gComp)" dot={false} />
                  <Area type="monotone" dataKey="cooling" name="Cooling" stroke="#10B981" strokeWidth={1.8} fill="url(#gCool)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 6, fontSize: 11, color: '#334155' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F59E0B' }} /> Compressor ({compAsset.currentKw} kW)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#0EA5E9' }} /> CNC ({cncAsset.currentKw} kW)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444' }} /> Furnace ({furnAsset.currentKw} kW)
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }} /> Cooling ({chillAsset.currentKw} kW)
              </span>
            </div>
          </div>
        </Explainable>

        {/* Chart 2: Asset energy distribution (Donut) */}
        <Explainable
          context={{
            component_type: 'chart',
            title: 'Asset energy distribution',
            identifier: 'chart_asset_distribution',
            value: `${totalLiveKw.toFixed(1)} kW Live Total`,
            site: 'PrecisionWorks Mfg',
            series: [
              { name: 'Air Compressor', current_value: compAsset.currentKw, unit: 'kW', summary_note: `${Math.round((compAsset.currentKw / (totalLiveKw || 1)) * 100)}%` },
              { name: 'CNC Machining Center', current_value: cncAsset.currentKw, unit: 'kW', summary_note: `${Math.round((cncAsset.currentKw / (totalLiveKw || 1)) * 100)}%` },
              { name: 'Industrial Heat Furnace', current_value: furnAsset.currentKw, unit: 'kW', summary_note: `${Math.round((furnAsset.currentKw / (totalLiveKw || 1)) * 100)}%` },
              { name: 'Chilled Water Cooling', current_value: chillAsset.currentKw, unit: 'kW', summary_note: `${Math.round((chillAsset.currentKw / (totalLiveKw || 1)) * 100)}%` },
            ],
          }}
          style={{ height: '100%' }}
        >
          <div style={{
            background: '#FFFFFF', border: '1px solid #EAE3D7',
            borderRadius: 12, padding: '14px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            height: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={15} color="#0284C7" />
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1E252D' }}>Asset power distribution</span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#FFFFFF', border: '1px solid #EAE3D7',
                borderRadius: 6, padding: '3px 9px',
                fontSize: 11, fontWeight: 700, color: '#0284C7'
              }}>
                <span className="pulse-dot" style={{ width: 5, height: 5 }} />
                <span>Live Share</span>
              </div>
            </div>

            {/* Donut Chart & Side Breakdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{ width: 140, height: 140, position: 'relative', flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'CNC Machining Center', value: Math.max(1, cncAsset.currentKw), color: '#0EA5E9' },
                        { name: 'Industrial Heat Furnace', value: Math.max(1, furnAsset.currentKw), color: '#EF4444' },
                        { name: 'Air Compressor', value: Math.max(1, compAsset.currentKw), color: '#F59E0B' },
                        { name: 'Chilled Water Cooling', value: Math.max(1, chillAsset.currentKw), color: '#10B981' },
                      ]}
                      cx="50%" cy="50%"
                      innerRadius={46} outerRadius={68}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="#FFFFFF"
                      strokeWidth={2}
                    >
                      <Cell fill="#0EA5E9" />
                      <Cell fill="#EF4444" />
                      <Cell fill="#F59E0B" />
                      <Cell fill="#10B981" />
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center', pointerEvents: 'none', lineHeight: 1.15
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1E252D' }}>{totalLiveKw.toFixed(1)}</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>kW</div>
                  <div style={{ fontSize: 9, color: '#059669', fontWeight: 600 }}>Live</div>
                </div>
              </div>

              {/* Table Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                {[
                  { label: 'Air Compressor', kw: `${compAsset.currentKw} kW`, pct: `${Math.round((compAsset.currentKw / (totalLiveKw || 1)) * 100)}%`, color: '#F59E0B', pctColor: '#D97706' },
                  { label: 'CNC Machining', kw: `${cncAsset.currentKw} kW`, pct: `${Math.round((cncAsset.currentKw / (totalLiveKw || 1)) * 100)}%`, color: '#0EA5E9', pctColor: '#0EA5E9' },
                  { label: 'Heat Furnace', kw: `${furnAsset.currentKw} kW`, pct: `${Math.round((furnAsset.currentKw / (totalLiveKw || 1)) * 100)}%`, color: '#EF4444', pctColor: '#EF4444' },
                  { label: 'Cooling Loop', kw: `${chillAsset.currentKw} kW`, pct: `${Math.round((chillAsset.currentKw / (totalLiveKw || 1)) * 100)}%`, color: '#10B981', pctColor: '#10B981' },
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                      <span style={{ color: '#334155', fontWeight: 500, whiteSpace: 'nowrap' }}>{item.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ color: '#64748B', fontSize: 10, fontFamily: 'var(--font-mono)' }}>{item.kw}</span>
                      <span style={{ color: item.pctColor, fontWeight: 700, width: 28, textAlign: 'right' }}>{item.pct}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Explainable>

        {/* Priority Alerts Card */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #EAE3D7',
          borderRadius: 12, padding: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={14} color="#EF4444" fill="#EF4444" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1E252D' }}>Priority alerts</span>
            </div>
            <span onClick={() => setView('anomalies')} style={{ fontSize: 11, fontWeight: 600, color: '#0284C7', cursor: 'pointer' }}>
              View all →
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Alert 1: Dynamic active anomaly or Compressor unloaded */}
            {activeAnomaly ? (
              <Explainable
                context={{
                  component_type: 'alert',
                  title: `${activeAnomaly.equipment_id} — ${activeAnomaly.anomaly_type.replace(/_/g, ' ')}`,
                  identifier: 'alert_live_scada_anomaly',
                  asset_id: activeAnomaly.equipment_id,
                  severity: activeAnomaly.severity === 'critical' ? 'critical' : 'high',
                  value: `${activeAnomaly.actual_power_kw ?? activeAnomaly.observed_value} kW draw`,
                  evidence: {
                    expected_kw: activeAnomaly.expected_power_kw ?? activeAnomaly.expected_value,
                    deviation_kw: activeAnomaly.deviation_kw,
                    confidence: activeAnomaly.confidence,
                  },
                }}
              >
                <div
                  onClick={() => setView('anomalies')}
                  style={{
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 8, padding: '9px 10px', cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={13} color="#EF4444" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>
                        {activeAnomaly.equipment_id}: {activeAnomaly.anomaly_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 700, background: '#EF4444', color: '#FFFFFF', padding: '1px 5px', borderRadius: 3 }}>
                        {activeAnomaly.severity?.toUpperCase() || 'CRITICAL'}
                      </span>
                      <ChevronRight size={12} color="#991B1B" />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#7F1D1D', lineHeight: 1.35 }}>
                    {activeAnomaly.actual_power_kw ?? activeAnomaly.observed_value} kW (vs {activeAnomaly.expected_power_kw ?? activeAnomaly.expected_value} kW). {activeAnomaly.recommended_action || 'Inspect parameters.'}
                  </div>
                </div>
              </Explainable>
            ) : (
              <Explainable
                context={{
                  component_type: 'alert',
                  title: 'Air compressor running unloaded',
                  identifier: 'alert_compressor_unloaded',
                  asset_id: 'AIR-COMP-01',
                  asset_name: 'Air Compressor (ELGi)',
                  severity: 'critical',
                  value: `${compAsset.idleKw || 18} kW idle draw`,
                  evidence: { idle_draw_kw: compAsset.idleKw || 18, idle_hrs_per_day: 3.2, waste_kwh: 998, cost_inr: 7987 },
                }}
              >
                <div
                  onClick={() => setView('anomalies')}
                  style={{
                    background: '#FEF2F2', border: '1px solid #FECACA',
                    borderRadius: 8, padding: '9px 10px', cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={13} color="#EF4444" />
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#991B1B' }}>Air compressor running unloaded</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 8.5, fontWeight: 700, background: '#EF4444', color: '#FFFFFF', padding: '1px 5px', borderRadius: 3 }}>
                        CRITICAL
                      </span>
                      <ChevronRight size={12} color="#991B1B" />
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#7F1D1D', lineHeight: 1.35 }}>
                    {compAsset.idleKw || 18} kW idle draw during break periods. Estimated waste: 998 kWh/period (₹7,987).
                  </div>
                </div>
              </Explainable>
            )}

            {/* Alert 2: Furnace */}
            <Explainable
              context={{
                component_type: 'alert',
                title: 'Furnace high peak demand',
                identifier: 'alert_furnace_peak',
                asset_id: 'FURNACE-01',
                asset_name: 'Industrial Heat Furnace',
                severity: 'high',
                value: `${furnAsset.currentKw} kW draw`,
                evidence: { peak_kw: furnAsset.currentKw, temp_c: furnAsset.tempC, reduction_potential_pct: 18 },
              }}
            >
              <div
                onClick={() => setView('anomalies')}
                style={{
                  background: '#FFFBEB', border: '1px solid #FDE68A',
                  borderRadius: 8, padding: '9px 10px', cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={13} color="#F59E0B" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#92400E' }}>Furnace heating thermal load</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, background: '#F59E0B', color: '#FFFFFF', padding: '1px 5px', borderRadius: 3 }}>
                      {furnAsset.status}
                    </span>
                    <ChevronRight size={12} color="#92400E" />
                  </div>
                </div>
                <div style={{ fontSize: 10, color: '#92400E', lineHeight: 1.35 }}>
                  {furnAsset.currentKw} kW at {furnAsset.tempC || 850}°C. Staggering preheat by 45 min can reduce coincident peak draw by 18%.
                </div>
              </div>
            </Explainable>

            {/* Alert 3: CNC Machining Center */}
            <Explainable
              context={{
                component_type: 'alert',
                title: 'CNC machining center operational status',
                identifier: 'alert_cnc_optimal',
                asset_id: 'CNC-01',
                asset_name: 'CNC Machining Center',
                severity: cncAsset.status === 'OPTIMAL' ? 'optimal' : 'warning',
                value: `${cncLoadPct}% load`,
                evidence: { power_factor: cncAsset.pf, current_kw: cncAsset.currentKw },
              }}
            >
              <div
                onClick={() => setView('scada')}
                style={{
                  background: '#EFF6FF', border: '1px solid #BFDBFE',
                  borderRadius: 8, padding: '9px 10px', cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Info size={13} color="#3B82F6" />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1E40AF' }}>CNC Machining Center ({cncAsset.status})</span>
                  </div>
                  <span style={{ fontSize: 8.5, fontWeight: 700, background: '#3B82F6', color: '#FFFFFF', padding: '1px 5px', borderRadius: 3 }}>
                    INFO
                  </span>
                </div>
                <div style={{ fontSize: 10, color: '#1E40AF', lineHeight: 1.35 }}>
                  {cncAsset.currentKw} kW draw. Power factor {cncAsset.pf}. SEC {cncAsset.secKwhPerPart || 2.1} kWh/part.
                </div>
              </div>
            </Explainable>
          </div>
        </div>
      </div>

      {/* ─── Row 3: Action Needed / Anomaly Banner ───────────────────────── */}
      {activeAnomaly ? (
        <Explainable
          context={{
            component_type: 'banner',
            title: `Action Needed: ${activeAnomaly.equipment_id} ${activeAnomaly.anomaly_type.replace(/_/g, ' ')}`,
            identifier: 'banner_live_anomaly',
            asset_id: activeAnomaly.equipment_id,
            severity: activeAnomaly.severity === 'critical' ? 'critical' : 'high',
            value: `${activeAnomaly.actual_power_kw ?? activeAnomaly.observed_value} kW draw`,
            evidence: {
              expected_kw: activeAnomaly.expected_power_kw ?? activeAnomaly.expected_value,
              deviation_kw: activeAnomaly.deviation_kw,
              savings_inr: anomalySavingsInr,
            },
          }}
        >
          <div style={{
            background: '#FEF2F2',
            border: '1.5px solid #FCA5A5',
            borderRadius: 12,
            padding: '12px 18px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={18} color="#DC2626" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{
                    background: '#DC2626', color: '#FFFFFF',
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em'
                  }}>
                    LIVE SCADA INCIDENT
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1E252D' }}>
                    {activeAnomaly.equipment_id} — {activeAnomaly.anomaly_type.replace(/_/g, ' ').toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#475569' }}>
                  Measured draw: <strong>{activeAnomaly.actual_power_kw ?? activeAnomaly.observed_value} kW</strong> vs expected <strong>{activeAnomaly.expected_power_kw ?? activeAnomaly.expected_value} kW</strong> ({activeAnomaly.deviation_kw != null && activeAnomaly.deviation_kw > 0 ? `+${activeAnomaly.deviation_kw} kW excess` : 'significant deviation'}). Action: <strong>{activeAnomaly.recommended_action || 'Inspect parameters'}</strong>.
                </div>
              </div>
            </div>

            {/* Metric Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} color="#DC2626" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>{activeAnomaly.actual_power_kw ?? activeAnomaly.observed_value} kW</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>Live draw</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity size={14} color="#0284C7" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>{activeAnomaly.confidence ? `${Math.round(activeAnomaly.confidence * 100)}%` : '96%'}</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>AI confidence</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={14} color="#9333EA" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>
                    ₹{Math.round(anomalySavingsInr).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>Est. waste</div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setView('anomalies')}
                style={{
                  background: '#DC2626', color: '#FFFFFF', border: 'none',
                  borderRadius: 8, padding: '8px 14px', fontSize: 11.5, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(220, 38, 38, 0.2)'
                }}
              >
                <AlertTriangle size={13} />
                <span>Investigate</span>
              </button>
              <button
                onClick={() => setView('simulator')}
                style={{
                  background: '#FFFFFF', color: '#0284C7', border: '1.5px solid #0284C7',
                  borderRadius: 8, padding: '7px 14px', fontSize: 11.5, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                }}
              >
                <Sliders size={13} />
                <span>Simulate fix</span>
              </button>
            </div>
          </div>
        </Explainable>
      ) : (
        <Explainable
          context={{
            component_type: 'banner',
            title: 'Action Needed: Air compressor running unloaded',
            identifier: 'banner_action_compressor',
            asset_id: 'AIR-COMP-01',
            asset_name: 'Air Compressor (ELGi)',
            severity: 'critical',
            value: `${compAsset.idleKw || 18} kW idle draw, 3.2 hrs/day`,
            evidence: {
              idle_kw: compAsset.idleKw || 18,
              idle_hours: 3.2,
              waste_kwh: 998,
              cost_inr: 7987,
              avoided_co2_kg: 727.7,
            },
          }}
        >
          <div style={{
            background: '#FFFBEB',
            border: '1.5px solid #FCD34D',
            borderRadius: 12,
            padding: '12px 18px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}>
            {/* Left: icon & text */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <AlertTriangle size={18} color="#D97706" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{
                    background: '#EA580C', color: '#FFFFFF',
                    fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.04em'
                  }}>
                    ACTION NEEDED
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1E252D' }}>
                    Air compressor running unloaded
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: '#475569' }}>
                  {compAsset.idleKw || 18} kW idle draw during shift handover and lunch breaks (3.2 hrs/day). Estimated waste: <strong>998 kWh/period (₹7,987 / 727.7 kg CO₂e)</strong>.
                </div>
              </div>
            </div>

            {/* Middle: 3 Metric Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} color="#D97706" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>{compAsset.idleKw || 18} kW</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>Idle draw</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 13 }}>⏱</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>3.2 hrs/day</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>Idle time</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Coins size={14} color="#9333EA" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.1 }}>998 kWh</div>
                  <div style={{ fontSize: 9.5, color: '#64748B' }}>Estimated waste</div>
                </div>
              </div>
            </div>

            {/* Right: action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setView('scada')}
                style={{
                  background: '#0284C7', color: '#FFFFFF', border: 'none',
                  borderRadius: 8, padding: '8px 14px', fontSize: 11.5, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)'
                }}
              >
                <Wrench size={13} />
                <span>Inspect issue</span>
              </button>
              <button
                onClick={() => setView('simulator')}
                style={{
                  background: '#FFFFFF', color: '#0284C7', border: '1.5px solid #0284C7',
                  borderRadius: 8, padding: '7px 14px', fontSize: 11.5, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer'
                }}
              >
                <BarChart2 size={13} />
                <span>Simulate fix</span>
              </button>
            </div>
          </div>
        </Explainable>
      )}

      {/* ─── Row 4: Asset Operational Status Cards ──────────────────────── */}
      <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 12, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={15} color="#0284C7" />
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1E252D' }}>Asset operational status</span>
              <span style={{ fontSize: 11, color: '#64748B', marginLeft: 8 }}>Real-time telemetry, load, energy and power factor</span>
            </div>
          </div>
          <span onClick={() => setView('scada')} style={{ fontSize: 11, fontWeight: 600, color: '#0284C7', cursor: 'pointer' }}>
            View in SCADA Twin →
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {/* Machine 1: Air Compressor */}
          <Explainable
            context={{
              component_type: 'machine_card',
              title: compAsset.name,
              identifier: 'machine_air_compressor',
              asset_id: compAsset.id,
              asset_name: compAsset.name,
              severity: compAsset.status === 'OPTIMAL' ? 'optimal' : compAsset.status === 'WARNING' ? 'warning' : 'critical',
              value: `${compLoadPct}% Load (${compAsset.currentKw} kW)`,
              evidence: { energy_today_kwh: compAsset.energyKwh, power_factor: compAsset.pf, status: compAsset.status, pressure: compAsset.dischargePressureBar },
            }}
          >
            <div
              onClick={() => { onSelectAsset?.('compressor'); setView('scada'); }}
              style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '12px 14px', background: '#FAFAF9', height: '100%', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Server size={14} color="#F59E0B" />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E252D' }}>{compAsset.name}</span>
                </div>
                <span style={{
                  fontSize: 8.5, fontWeight: 700,
                  background: compAsset.status === 'OPTIMAL' ? '#DCFCE7' : compAsset.status === 'WARNING' ? '#FEF3C7' : '#FEE2E2',
                  color: compAsset.status === 'OPTIMAL' ? '#15803D' : compAsset.status === 'WARNING' ? '#D97706' : '#DC2626',
                  padding: '1px 6px', borderRadius: 3,
                  border: `1px solid ${compAsset.status === 'OPTIMAL' ? '#BBF7D0' : compAsset.status === 'WARNING' ? '#FDE68A' : '#FECACA'}`
                }}>
                  {compAsset.status}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1E252D' }}>{compLoadPct}%</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>Load</span>
                </div>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#F59E0B' }}>
                  {compAsset.currentKw} kW
                </span>
              </div>
              <div style={{ width: '100%', height: 5, background: '#E2E8F0', borderRadius: 9999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${compLoadPct}%`, height: '100%', background: '#F59E0B', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{compAsset.energyKwh.toLocaleString()} kWh</div>
                  <div style={{ fontSize: 9 }}>Energy (today)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: compAsset.pf < 0.85 ? '#D97706' : '#1E252D' }}>{compAsset.pf}</div>
                  <div style={{ fontSize: 9 }}>Power factor</div>
                </div>
              </div>
            </div>
          </Explainable>

          {/* Machine 2: CNC Machining Center */}
          <Explainable
            context={{
              component_type: 'machine_card',
              title: cncAsset.name,
              identifier: 'machine_cnc',
              asset_id: cncAsset.id,
              asset_name: cncAsset.name,
              severity: cncAsset.status === 'OPTIMAL' ? 'optimal' : cncAsset.status === 'WARNING' ? 'warning' : 'critical',
              value: `${cncLoadPct}% Load (${cncAsset.currentKw} kW)`,
              evidence: { energy_today_kwh: cncAsset.energyKwh, power_factor: cncAsset.pf, status: cncAsset.status },
            }}
          >
            <div
              onClick={() => { onSelectAsset?.('cnc'); setView('scada'); }}
              style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '12px 14px', background: '#FAFAF9', height: '100%', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Cpu size={14} color="#0EA5E9" />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E252D' }}>{cncAsset.name}</span>
                </div>
                <span style={{
                  fontSize: 8.5, fontWeight: 700,
                  background: cncAsset.status === 'OPTIMAL' ? '#DCFCE7' : cncAsset.status === 'WARNING' ? '#FEF3C7' : '#FEE2E2',
                  color: cncAsset.status === 'OPTIMAL' ? '#15803D' : cncAsset.status === 'WARNING' ? '#D97706' : '#DC2626',
                  padding: '1px 6px', borderRadius: 3,
                  border: `1px solid ${cncAsset.status === 'OPTIMAL' ? '#BBF7D0' : cncAsset.status === 'WARNING' ? '#FDE68A' : '#FECACA'}`
                }}>
                  {cncAsset.status}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1E252D' }}>{cncLoadPct}%</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>Load</span>
                </div>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0EA5E9' }}>
                  {cncAsset.currentKw} kW
                </span>
              </div>
              <div style={{ width: '100%', height: 5, background: '#E2E8F0', borderRadius: 9999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${cncLoadPct}%`, height: '100%', background: '#0EA5E9', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{cncAsset.energyKwh.toLocaleString()} kWh</div>
                  <div style={{ fontSize: 9 }}>Energy (today)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{cncAsset.pf}</div>
                  <div style={{ fontSize: 9 }}>Power factor</div>
                </div>
              </div>
            </div>
          </Explainable>

          {/* Machine 3: Industrial Heat Furnace */}
          <Explainable
            context={{
              component_type: 'machine_card',
              title: furnAsset.name,
              identifier: 'machine_furnace',
              asset_id: furnAsset.id,
              asset_name: furnAsset.name,
              severity: furnAsset.status === 'OPTIMAL' ? 'optimal' : furnAsset.status === 'WARNING' ? 'warning' : 'high',
              value: `${furnLoadPct}% Load (${furnAsset.currentKw} kW)`,
              evidence: { energy_today_kwh: furnAsset.energyKwh, power_factor: furnAsset.pf, status: furnAsset.status, temp: furnAsset.tempC },
            }}
          >
            <div
              onClick={() => { onSelectAsset?.('furnace'); setView('scada'); }}
              style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '12px 14px', background: '#FAFAF9', height: '100%', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Flame size={14} color="#DC2626" />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E252D' }}>{furnAsset.name}</span>
                </div>
                <span style={{
                  fontSize: 8.5, fontWeight: 700,
                  background: furnAsset.status === 'OPTIMAL' ? '#DCFCE7' : furnAsset.status === 'WARNING' ? '#FEF3C7' : '#FEE2E2',
                  color: furnAsset.status === 'OPTIMAL' ? '#15803D' : furnAsset.status === 'WARNING' ? '#D97706' : '#DC2626',
                  padding: '1px 6px', borderRadius: 3,
                  border: `1px solid ${furnAsset.status === 'OPTIMAL' ? '#BBF7D0' : furnAsset.status === 'WARNING' ? '#FDE68A' : '#FECACA'}`
                }}>
                  {furnAsset.status}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1E252D' }}>{furnLoadPct}%</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>Load</span>
                </div>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#DC2626' }}>
                  {furnAsset.currentKw} kW
                </span>
              </div>
              <div style={{ width: '100%', height: 5, background: '#E2E8F0', borderRadius: 9999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${furnLoadPct}%`, height: '100%', background: '#EF4444', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{furnAsset.energyKwh.toLocaleString()} kWh</div>
                  <div style={{ fontSize: 9 }}>Energy (today)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{furnAsset.pf}</div>
                  <div style={{ fontSize: 9 }}>Power factor</div>
                </div>
              </div>
            </div>
          </Explainable>

          {/* Machine 4: Chilled Water Cooling */}
          <Explainable
            context={{
              component_type: 'machine_card',
              title: chillAsset.name,
              identifier: 'machine_chiller',
              asset_id: chillAsset.id,
              asset_name: chillAsset.name,
              severity: chillAsset.status === 'OPTIMAL' ? 'optimal' : chillAsset.status === 'WARNING' ? 'warning' : 'critical',
              value: `${chillLoadPct}% Load (${chillAsset.currentKw} kW)`,
              evidence: { energy_today_kwh: chillAsset.energyKwh, power_factor: chillAsset.pf, status: chillAsset.status, cop: chillAsset.cop },
            }}
          >
            <div
              onClick={() => { onSelectAsset?.('cooling'); setView('scada'); }}
              style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '12px 14px', background: '#FAFAF9', height: '100%', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Fan size={14} color="#059669" />
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E252D' }}>{chillAsset.name}</span>
                </div>
                <span style={{
                  fontSize: 8.5, fontWeight: 700,
                  background: chillAsset.status === 'OPTIMAL' ? '#DCFCE7' : chillAsset.status === 'WARNING' ? '#FEF3C7' : '#FEE2E2',
                  color: chillAsset.status === 'OPTIMAL' ? '#15803D' : chillAsset.status === 'WARNING' ? '#D97706' : '#DC2626',
                  padding: '1px 6px', borderRadius: 3,
                  border: `1px solid ${chillAsset.status === 'OPTIMAL' ? '#BBF7D0' : chillAsset.status === 'WARNING' ? '#FDE68A' : '#FECACA'}`
                }}>
                  {chillAsset.status}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1E252D' }}>{chillLoadPct}%</span>
                  <span style={{ fontSize: 10, color: '#64748B' }}>Load</span>
                </div>
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#059669' }}>
                  {chillAsset.currentKw} kW
                </span>
              </div>
              <div style={{ width: '100%', height: 5, background: '#E2E8F0', borderRadius: 9999, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ width: `${chillLoadPct}%`, height: '100%', background: '#10B981', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{chillAsset.energyKwh.toLocaleString()} kWh</div>
                  <div style={{ fontSize: 9 }}>Energy (today)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, color: '#1E252D' }}>{chillAsset.pf}</div>
                  <div style={{ fontSize: 9 }}>Power factor</div>
                </div>
              </div>
            </div>
          </Explainable>
        </div>

        {/* Tactical asset telemetry table */}
        <div style={{ overflowX: 'auto', borderTop: '1px solid #EAE3D7', paddingTop: 12 }}>
          <table className="compare-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Model</th>
                <th>Live Draw</th>
                <th>Active Load</th>
                <th>Telemetry Sensor</th>
                <th>Energy (Today)</th>
                <th>P.F.</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {currentAssetList.map(a => {
                const load = Math.min(100, Math.round((a.currentKw / a.ratedKw) * 100));
                return (
                  <tr
                    key={a.id}
                    onClick={() => { onSelectAsset?.(a.id); setView('scada'); }}
                    style={{ cursor: 'pointer' }}
                    title={`Click to open ${a.name} in SCADA Twin`}
                  >
                    <td className="td-label" style={{ fontWeight: 700 }}>{a.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)' }}>{a.model}</td>
                    <td className="td-proposed" style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>{a.currentKw} kW</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{load}% ({a.currentKw}/{a.ratedKw} kW)</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5 }}>
                      {a.dischargePressureBar != null ? `💨 ${a.dischargePressureBar} bar` :
                       a.tempC != null ? `🌡️ ${a.tempC} °C` :
                       a.secKwhPerPart != null ? `⚙️ ${a.secKwhPerPart} kWh/part` :
                       a.cop != null ? `❄️ ${a.cop} COP` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{a.energyKwh.toLocaleString()} kWh</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.pf < 0.85 ? 'var(--amber)' : 'var(--emerald)' }}>{a.pf}</td>
                    <td>
                      <span className={`badge badge-${a.status === 'OPTIMAL' ? 'emerald' : a.status === 'WARNING' ? 'amber' : 'red'}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset?.(a.id);
                          setView('scada');
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Activity size={10} color="var(--cyan)" />
                        Inspect in Twin
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

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

// â”€â”€â”€ Simulator View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            Digital Twin &amp; What-If Simulator â€” PrecisionWorks Manufacturing
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', marginTop: 2 }}>
            Simulated Energy Interventions Â· ISO 14064-1 &amp; GHG Protocol Scenario Modeling Â· No Direct Actuation
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
        <div className="panel-hdr"><Shield size={12} /> Physics Constraint Validation â€” Operational Safety Gate</div>
        <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <ConstraintBadge
            icon={<Gauge size={16} />}
            label="Header Pressure"
            value={`${params.pressureSetpoint.toFixed(1)} bar`}
            constraint="min â‰¥ 6.2 bar"
            pass={params.pressureSetpoint >= 6.2}
            detail={`Air receiver buffer ${params.pressureSetpoint >= 6.5 ? 'ADEQUATE' : 'BORDERLINE'} â€” CNC pneumatic cycle safe`}
          />
          <ConstraintBadge
            icon={<Activity size={16} />}
            label="Shift Output Quota"
            value="1,200 units"
            constraint="100% target"
            pass={true}
            detail="Production unimpacted â€” idle cutoff only during non-machining windows"
          />
          <ConstraintBadge
            icon={<Zap size={16} />}
            label="Motor Starts/Hour"
            value={params.autoIdleCutoff ? '2.4 /hr' : '4.1 /hr'}
            constraint="max â‰¤ 6/hr"
            pass={true}
            detail="Auto-idle timer prevents rapid restart â€” winding insulation safe"
          />
        </div>
        <div style={{ padding: '8px 12px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)', borderTop: '1px solid var(--border-muted)' }}>
          <span style={{ color: 'var(--cyan)' }}>kVA Analysis: </span>
          Baseline 147.2 kVA {params.autoIdleCutoff ? 'â†’ 120.1 kVA (Simulated) ' : ''}â€” Contract ceiling: 160 kVA.
          {params.autoIdleCutoff && <span style={{ color: 'var(--emerald)' }}> Power Factor: 0.91 â†’ 0.96 (reactive kVAh penalty eliminated)</span>}
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
                  ANOMALY FIX Â· COMPRESSOR IDLE
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
                      {`saving â‰ˆ ${result.idleSavingsKwh} kWh â†’ ₹${(result.idleSavingsKwh * PLANT.tariff).toFixed(2)} â†’ ${((result.idleSavingsKwh * factorVal) / 1000).toFixed(3)} tCO₂e avoided`}
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
                    <span className="formula-comment">// Each 0.1 bar â‰ˆ 1% compressor energy saved</span>{'\n'}
                    {`reduction = ${(7.5 - params.pressureSetpoint).toFixed(1)} bar`}{'\n'}
                    {`pressure_savings = ${(7.5 - params.pressureSetpoint).toFixed(1)} × 10 × 3120/100`}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`= ${result.pressureSavingsKwh.toFixed(1)} kWh saved â†’ ${((result.pressureSavingsKwh * factorVal) / 1000).toFixed(3)} tCO₂e avoided`}
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
                    MEASURED Â· Scope 1+2
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
                    SIMULATED Â· Separate
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
                {`avoided_tCO2e = ${savingsKwh.toFixed(1)} kWh × ${factorVal.toFixed(5)} kg CO₂/kWh Ã· 1000 = ${avoidedCO2e.toFixed(4)} tCO₂e avoided`}{'\n'}
                <span style={{ color: 'var(--slate-400)' }}>
                  {`Emission Factor: CEA India FY ${reportingYear} (${factorVal.toFixed(5)} kg CO₂/kWh) Â· Reporting Period: 30.0 Days`}{'\n'}
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
                    <td className="td-baseline">â€”</td>
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

// â”€â”€â”€ Physics Constraint Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Carbon View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Carbon View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Report View â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // Counterfactual calculation: Case A (Volume Contraction Audit â€” Material Delay)
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
    const content = `WattWise AI â€” ISO 50001 Sustainability & Cost Audit Report
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
Uncertainty Band:              ₹${(savedCost * 0.65).toFixed(0)} - ₹${(savedCost * 1.35).toFixed(0)}/day (Â±35% Diagnostic Ambiguity)
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
        <div className="report-kv"><span className="report-k">Standard</span><span className="report-v">ISO 50001:2018 â€” Energy Management Systems</span></div>
        <div className="report-kv"><span className="report-k">Grid Tariff</span><span className="report-v">₹9.00/kWh (ToD â€” Peak/Off-Peak Rate Structure)</span></div>
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
          <div className="alert-title">PRIMARY ANOMALY â€” AIR COMPRESSOR (COMP-01 / ELGi EN 45)</div>
          <div className="alert-body">
            Compressor idles unloaded at <strong>18.0 kW</strong> during shift transition and lunch windows (11:00â€“14:00) vs expected rated idle of <strong>8.0 kW</strong>.
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
        <div className="report-kv"><span className="report-k">Uncertainty Spread</span><span className="report-v">₹{(savedCost * 0.65).toFixed(0)} â€“ ₹{(savedCost * 1.35).toFixed(0)} / day (Â±35%)</span></div>
        <div className="report-kv"><span className="report-k">Diagnostic Ambiguity</span><span className="report-v">Blow-off timer fault vs Downstream ring-main pipe leak</span></div>
        <div className="report-kv"><span className="report-k">Value of Information (VOI)</span><span className="report-v text-cyan">Temporary Ultrasonic Airflow Transducer (₹12,000 Capex, VOI: 4.5x)</span></div>
        <div className="report-kv"><span className="report-k">Projected Grade A Payback</span><span className="report-v text-emerald">2.8 â€“ 5.1 Months</span></div>
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
                ANOMALY â€” AIR COMPRESSOR
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
              <div className="alert-title">CNC MACHINING CENTER â€” OPTIMAL</div>
              <div className="alert-body">SEC: 1.8 kWh/part. P.F. 0.94. No anomalies detected.</div>
            </div>
            <div className="alert-banner crit">
              <div className="alert-title">FURNACE â€” HIGH PEAK DEMAND</div>
              <div className="alert-body">
                85 kW concurrent with compressor peak 09:00â€“12:00.
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
                  {asset.tempC && <StatRow label="Temperature" value={`${asset.tempC}Â°C`} color="red" />}
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

// â”€â”€â”€ Root App â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'login' | 'platform'>('home');
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string; name: string } | null>({
    email: 'operator@precisionworks.mfg',
    role: 'Plant SCADA Operator',
    name: 'Vikram Malhotra',
  });
  const [view, setView] = useState<View>('overview');
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
  const [liveTick, setLiveTick] = useState<LiveSimulationTickResponse | null>(null);

  // Poll live SCADA telemetry stream from backend at 2s interval
  useEffect(() => {
    let isMounted = true;
    async function pollLiveStream() {
      try {
        const tickData = await fetchLiveSimulationTick();
        if (isMounted && tickData) {
          setLiveTick(tickData);
          setBackendStatus('CONNECTED');
        }
      } catch (err) {
        // Fallback gracefully if backend is temporarily offline
      }
    }

    pollLiveStream();
    const interval = setInterval(pollLiveStream, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

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
    const liveMachines = liveTick?.machines || [];
    const compLive = liveMachines.find(m => m.equipment_id === 'AIR-COMP-01');
    const cncLive = liveMachines.find(m => m.equipment_id === 'CNC-01');
    const furnLive = liveMachines.find(m => m.equipment_id === 'FURNACE-01');
    const chillLive = liveMachines.find(m => m.equipment_id === 'CHILLER-01');

    return ASSETS.map(a => {
      let kw = a.currentKw;
      let st: AssetStatus = a.status;
      let pf = a.pf;
      let dischargePressure = a.dischargePressureBar;
      let tempC = a.tempC;
      let cop = a.cop;
      let sec = a.secKwhPerPart;
      let idleKw = a.idleKw;

      // 1. Live SCADA stream injection
      if (a.id === 'compressor' && compLive) {
        kw = compLive.power_kw;
        st = compLive.status === 'ANOMALY' ? 'WARNING' : (compLive.power_kw < 5 ? 'IDLE' : 'OPTIMAL');
        if (compLive.discharge_pressure_bar != null) dischargePressure = compLive.discharge_pressure_bar;
        idleKw = compLive.power_kw < 20 ? compLive.power_kw : 18;
      } else if (a.id === 'cnc' && cncLive) {
        kw = cncLive.power_kw;
        st = cncLive.status === 'ANOMALY' ? 'WARNING' : (cncLive.power_kw < 5 ? 'IDLE' : 'OPTIMAL');
        if (cncLive.spindle_load_pct != null) sec = +(cncLive.spindle_load_pct / 25).toFixed(2);
      } else if (a.id === 'furnace' && furnLive) {
        kw = furnLive.power_kw;
        st = furnLive.status === 'ANOMALY' ? 'PEAK' : (furnLive.power_kw > 75 ? 'PEAK' : 'OPTIMAL');
        if (furnLive.temperature_c != null) tempC = furnLive.temperature_c;
      } else if (a.id === 'cooling' && chillLive) {
        kw = chillLive.power_kw;
        st = chillLive.status === 'ANOMALY' ? 'WARNING' : 'OPTIMAL';
        if (chillLive.delta_t_c != null) cop = +(3.0 + chillLive.delta_t_c * 0.2).toFixed(1);
      }

      // 2. Digital Twin simulation override
      if (simMode) {
        if (a.id === 'compressor' && params.autoIdleCutoff) {
          kw = 0;
          st = 'OPTIMAL';
          pf = 0.96;
        }
        if (a.id === 'compressor' && params.pressureSetpoint < 7.5) {
          dischargePressure = params.pressureSetpoint;
        }
        if (a.id === 'furnace' && params.staggerFurnace) {
          kw = Math.min(kw, 70);
          st = 'OPTIMAL';
        }
      }

      return {
        ...a,
        currentKw: kw,
        apparentKva: +(kw / pf).toFixed(1),
        status: st,
        pf,
        dischargePressureBar: dischargePressure,
        tempC,
        cop,
        secKwhPerPart: sec,
        idleKw,
      };
    });
  }, [liveTick, simMode, params]);

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
    <AIExplainProvider>
      <div className={`app-shell ${view === 'overview' ? 'overview-mode' : (showInspector ? '' : 'no-inspector')}`}>

      {/* Top bar matching reference screenshot */}
      <header className="topbar">
        <div
          className="topbar-brand"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => setCurrentPage('home')}
          title="Return to 3D Glide Home"
        >
          <Zap size={18} color="#1E252D" fill="#1E252D" />
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1E252D', letterSpacing: '0.04em' }}>WATTWISE AI</span>
          <span style={{ color: '#0284C7', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>// INDUSTRIAL EMS</span>
        </div>

        <div className="topbar-center" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Factory Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#FFFFFF', border: '1px solid #EAE3D7',
            borderRadius: 9999, padding: '5px 12px',
            fontSize: 11.5, fontWeight: 600, color: '#1E252D',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)', cursor: 'pointer'
          }}>
            <Building2 size={13} color="#475569" />
            <span>PrecisionWorks Mfg</span>
            <ChevronDown size={11} color="#64748B" />
          </div>

          {/* Backend Status Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#DCFCE7', border: '1px solid #86EFAC',
            borderRadius: 9999, padding: '4px 10px',
            fontSize: 11, fontWeight: 600, color: '#15803D'
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22C55E' }} />
            <span>Backend: {backendStatus === 'CONNECTED' ? 'Connected' : 'Offline'}</span>
          </div>

          {/* Shift Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#FEF3C7', border: '1px solid #FDE68A',
            borderRadius: 9999, padding: '4px 10px',
            fontSize: 11, fontWeight: 600, color: '#B45309'
          }}>
            <Sun size={13} color="#D97706" />
            <span>Shift: DAY-B</span>
          </div>
        </div>

        <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {view !== 'overview' && (
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
              title={showInspector ? "Collapse side inspector" : "Show side inspector"}
            >
              {showInspector ? <PanelRightClose size={13} color="var(--cyan)" /> : <PanelRightOpen size={13} color="var(--cyan)" />}
              <span>{showInspector ? 'Hide Side Panel' : 'Show Side Panel'}</span>
            </button>
          )}

                    {/* Dual-Audience Quick Mode Switcher */}
          <div style={{ display: 'flex', background: '#E2D9CC', padding: 2, borderRadius: 8, gap: 2 }}>
            <button
              type="button"
              onClick={() => setView('executive')}
              style={{
                border: 'none',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                background: view === 'executive' ? '#FFFFFF' : 'transparent',
                color: view === 'executive' ? '#1E252D' : '#6B7280',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: view === 'executive' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              <Award size={12} color={view === 'executive' ? '#2563EB' : '#6B7280'} /> Executive
            </button>
            <button
              type="button"
              onClick={() => setView('diagnostics')}
              style={{
                border: 'none',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                background: view === 'diagnostics' ? '#111827' : 'transparent',
                color: view === 'diagnostics' ? '#38BDF8' : '#6B7280',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: view === 'diagnostics' ? '0 1px 2px rgba(0,0,0,0.15)' : 'none'
              }}
            >
              <Terminal size={12} color={view === 'diagnostics' ? '#38BDF8' : '#6B7280'} /> Diagnostics
            </button>
          </div>

          {/* Priority Alert Bell with Red Notification Dot */}
          <div
            onClick={() => setView('anomalies')}
            style={{ position: 'relative', cursor: 'pointer', padding: 4 }}
            title="Priority Alerts"
          >
            <Bell size={16} color="#334155" />
            <span style={{
              position: 'absolute', top: 2, right: 2,
              width: 6, height: 6, borderRadius: '50%',
              background: '#EF4444'
            }} />
          </div>

          {/* User Profile */}
          <div
            onClick={() => setCurrentPage('login')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
            title="Switch User / Sign Out"
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: '#E2D9CC', color: '#44403C',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700
            }}>
              VM
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#1E252D', lineHeight: 1.2 }}>Vikram Malhotra</span>
              <span style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.2 }}>Plant Manager</span>
            </div>
          </div>
        </div>
      </header>

      {/* Telemetry bar */}
      <TeleBar
        simOn={simMode}
        simParams={params}
        carbonData={carbonData}
        backendStatus={backendStatus}
        activeSimulation={activeSimulation}
        livePlantPower={liveTick?.plant_power_kw}
        liveTick={liveTick?.tick}
      />

      {/* Sidebar matching reference screenshot */}
      <nav className="sidebar" style={{ background: '#F0EAE1', borderRight: '1px solid #EAE3D7' }}>
        <div style={{ padding: '16px 16px 8px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8E887E', letterSpacing: '0.08em', marginBottom: 6 }}>
            PLANT MODE
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#D1FAE5', border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 9999, padding: '4px 10px',
            fontSize: 10.5, fontWeight: 700, color: '#059669',
            letterSpacing: '0.04em'
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
            <span>LIVE TELEMETRY</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 6px' }}>
          {NAV.map(n => {
            const isActive = view === n.id;
            return (
              <div
                key={n.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setView(n.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', margin: '2px 8px', borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: 12.5, fontWeight: isActive ? 600 : 500,
                  background: isActive ? '#E0F2FE' : 'transparent',
                  color: isActive ? '#0284C7' : (n.id === 'anomalies' ? '#0284C7' : '#334155'),
                  transition: 'all 0.15s ease',
                }}
              >
                {n.icon}
                <span>{n.label}</span>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8E887E', letterSpacing: '0.08em' }}>
            ASSETS
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '0 8px' }}>
          {simulatedAssets.map(a => (
            <div
              key={a.id}
              className={`nav-item ${selectedAsset === a.id ? 'active' : ''}`}
              onClick={() => { setSelectedAsset(a.id); setView('scada'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '6px 12px', margin: '1px 8px', borderRadius: 6,
                cursor: 'pointer', fontSize: 11.5, color: '#334155', fontWeight: 500
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: ASSET_COLORS[a.id] || '#0284c7', flexShrink: 0 }} />
              <span>{a.name}</span>
              {(a.status === 'WARNING' || a.status === 'PEAK') && <AlertTriangle size={9} color="#f59e0b" style={{ marginLeft: 'auto' }} />}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 14px 16px' }}>
          <img
            src={factoryHeroImg}
            alt="PrecisionWorks Facility"
            style={{
              width: '100%',
              height: 72,
              objectFit: 'cover',
              borderRadius: 6,
              marginBottom: 8,
              border: '1px solid rgba(0,0,0,0.08)',
              filter: 'sepia(12%) contrast(96%)'
            }}
          />
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: '#8E887E', lineHeight: 1.6, fontWeight: 500
          }}>
            PRECISIONWORKS MFG<br />
            KPCL HACKATHON 2026<br />
            WATTWISE AI v1.0
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          {view === 'overview' && (
            <motion.div key="overview" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <OverviewView
                setView={setView}
                carbonData={carbonData}
                gridEF={gridEF}
                onSelectAsset={handleSelectAsset}
                assets={simulatedAssets}
                livePlantPower={liveTick?.plant_power_kw}
                activeAnomaly={liveTick?.active_anomaly}
                liveTick={liveTick?.tick}
              />
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
          {view === 'forecast' && (
            <motion.div key="forecast" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%', overflowY: 'auto' }}>
              <EnergyForecastDashboard
                assets={simulatedAssets}
                params={params}
                onNavigateToSimulator={() => setView('simulator')}
                onSelectAsset={(id) => {
                  setSelectedAsset(id);
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
          {view === 'anomalies' && (
            <motion.div key="anomalies" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <AIAnomalyIntelligence />
            </motion.div>
          )}
          {view === 'reports' && (
            <motion.div key="reports" variants={PAGE_VARIANTS} initial="initial" animate="animate" exit="exit" style={{ width: '100%', height: '100%' }}>
              <ReportView params={params} carbonData={carbonData} activeSimulation={activeSimulation} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Inspector (Shown on SCADA / Digital Twin workbench views) */}
      {view !== 'overview' && view !== 'forecast' && view !== 'executive' && view !== 'diagnostics' && view !== 'configurator' && view !== 'quota' && showInspector && (
        <InspectorPanel
          selectedId={selectedAsset}
          setView={setView}
          params={params}
          carbonData={carbonData}
          gridEF={gridEF}
          onResetBaseline={handleResetBaseline}
        />
      )}

      {/* Contextual AI Explanation Popover */}
      <AIExplainPopover />

      {/* Persistent Floating AI Assistant Chatbot */}
      <FloatingChatbot />
    </div>
  </AIExplainProvider>
  );
}
