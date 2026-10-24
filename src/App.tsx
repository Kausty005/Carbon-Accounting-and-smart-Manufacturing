import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutGrid, Cpu, Sliders, Leaf, FileText,
  AlertTriangle, CheckCircle2, Zap, TrendingDown,
  Printer, Download, ChevronRight, Box, ShieldAlert,
} from 'lucide-react';
import ScadaFloorMap from './components/ScadaFloorMap';
import Factory3DScene from './components/Factory3D/Factory3DScene';
import { DemandAreaChart, ComparisonLineChart, ScopePie } from './components/Charts';
import DigitalTwinView from './components/DigitalTwin/DigitalTwinView';
import {
  PLANT, ASSETS, HOURLY_BASE, CARBON,
  calcSimResult, type SimParams, type Asset,
} from './data/mockData';
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
import type { SimulationResult, ScenarioRequest } from './digitalTwin/types';
import './index.css';

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
  activeSimulation,
}: {
  simOn: boolean;
  activeSimulation: SimulationResult;
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

  const energy = simOn
    ? activeSimulation.scenario.total_energy_kwh
    : activeSimulation.baseline.total_energy_kwh;
  const cost = simOn
    ? activeSimulation.scenario.total_cost_inr
    : activeSimulation.baseline.total_cost_inr;
  const savingsKwh = Math.abs(activeSimulation.deltas.energy_kwh);
  const savingsCost = Math.abs(activeSimulation.deltas.cost_inr);

  const scope2 = CARBON.scope2Calc(energy);
  const scope1 = CARBON.scope1Calc();
  const totalCarbon = +(scope1.kgCO2e + scope2.kgCO2e).toFixed(2);
  const pf = simOn && activeSimulation.deltas.energy_kwh < 0 ? '0.96' : '0.91';

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
        <span className="tele-value cyan">₹9.00/kWh (ToD)</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Plant P.F.</span>
        <span className={`tele-value ${parseFloat(pf) >= 0.95 ? 'emerald' : 'amber'}`}>{pf}</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Plant Energy</span>
        <span className="tele-value white">{energy.toLocaleString()} kWh</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Demand Cost</span>
        <span className="tele-value amber">₹{cost.toLocaleString()}</span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Sim. Savings</span>
        <span className="tele-value emerald">
          {savingsKwh > 0 ? `${savingsKwh} kWh / ₹${savingsCost.toLocaleString()}` : '0 kWh (Baseline)'}
        </span>
      </div>
      <div className="tele-item">
        <span className="tele-label">Total Carbon</span>
        <span className="tele-value violet">{totalCarbon} tCO₂e</span>
      </div>
      <div className="tele-item" style={{ marginLeft: 'auto' }}>
        <span className="topbar-clock">{now.toTimeString().slice(0, 8)}</span>
      </div>
    </div>
  );
}

// ─── Overview ─────────────────────────────────────────────────────────────────
function OverviewView({
  setView,
  activeSimulation,
}: {
  setView: (v: View) => void;
  activeSimulation: SimulationResult;
}) {
  const baseKwh = activeSimulation.baseline.total_energy_kwh;
  const scenKwh = activeSimulation.scenario.total_energy_kwh;
  const savedKwh = Math.abs(activeSimulation.deltas.energy_kwh);
  const savedCost = Math.abs(activeSimulation.deltas.cost_inr);
  const pctSaved = ((savedKwh / (baseKwh || 1)) * 100).toFixed(1);

  const kpis = [
    { label: 'Baseline Energy', value: `${baseKwh.toLocaleString()}`, unit: 'kWh/day', color: '#22d3ee', change: '' },
    { label: 'Baseline Cost', value: `₹${activeSimulation.baseline.total_cost_inr.toLocaleString()}`, unit: '/day', color: '#f59e0b', change: '' },
    { label: 'Potential Savings', value: `${savedKwh}`, unit: `kWh (${pctSaved}%)`, color: '#10b981', change: `Save ₹${savedCost.toLocaleString()}` },
    { label: 'Scope 2 Carbon', value: `${(scenKwh * 0.82 / 1000).toFixed(2)}`, unit: 'tCO₂e', color: '#8b5cf6', change: 'CEA Factor 0.82' },
    { label: 'Active Assets', value: '4', unit: 'of 4 modeled', color: '#22d3ee', change: '' },
    { label: 'Peak Demand', value: `${activeSimulation.scenario.peak_demand_kw}`, unit: 'kW', color: activeSimulation.scenario.peak_demand_kw > 85 ? '#ef4444' : '#10b981', change: activeSimulation.scenario.peak_demand_kw > 85 ? 'Exceeds 85 kW limit' : 'Within contract limit' },
    { label: 'Contract Limit', value: '85', unit: 'kW', color: '#f59e0b', change: '₹350/kW penalty' },
    { label: 'Twin Status', value: activeSimulation.feasibility.toUpperCase().replace('_', ' '), unit: '', color: activeSimulation.feasibility === 'feasible' ? '#10b981' : '#f59e0b', change: 'Advisory Mode' },
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
            Open Digital Twin
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
            {k.change && <div className="kpi-change warn">{k.change}</div>}
          </div>
        ))}
      </div>

      {/* Anomaly alert */}
      <div className="alert-banner warn" style={{ marginBottom: 14 }}>
        <div className="alert-title">
          <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4 }} />
          PRIMARY ANOMALY DETECTED — AIR COMPRESSOR (ELGi EN 45)
        </div>
        <div className="alert-body">
          Telemetry exhibits 18.0 kW unloaded idle draw during shift change &amp; lunch periods (expected baseline idle: 8.0 kW).
          Discharge pressure configured at 7.5 bar vs recommended 6.8 bar. Unmitigated excess draw waste: ~30 kWh/day.
        </div>
        <div className="alert-rec">
          Digital Twin Action: Apply 5-minute auto-cutoff timer or reduce idle power to 8.0 kW.
          Estimated Savings: {savedKwh} kWh/day (₹{savedCost.toLocaleString()}) and avoid Scope 2 emissions.
        </div>
      </div>

      {/* 24h demand chart */}
      <div className="panel">
        <div className="panel-hdr">
          <Zap size={12} />
          24-Hour Demand Profile — PrecisionWorks Baseline (All Assets)
        </div>
        <div style={{ padding: '10px 4px' }}>
          <DemandAreaChart data={HOURLY_BASE} />
        </div>
      </div>

      {/* Asset summary table */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-hdr">Asset Energy Summary &amp; Status</div>
        <table className="compare-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Process</th>
              <th>Rated Power</th>
              <th>Expected Idle</th>
              <th>Standby Off</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(MACHINE_PROFILES).map(p => (
              <tr key={p.machine_id}>
                <td className="td-label" style={{ color: p.color }}>{p.machine_id} — {p.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-400)' }}>{p.process}</td>
                <td className="td-proposed">{p.rated_power_kw} kW</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--white)' }}>{p.expected_idle_power_kw} kW</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)' }}>{p.off_power_kw} kW</td>
                <td>
                  <span className={`badge badge-${p.machine_id === 'COMP-01' ? 'amber' : p.machine_id === 'FURN-01' ? 'red' : 'emerald'}`}>
                    {p.machine_id === 'COMP-01' ? 'IDLE ANOMALY' : p.machine_id === 'FURN-01' ? 'PEAK PROTECTED' : 'OPTIMAL'}
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Mode toggle button */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 100,
          display: 'flex',
          gap: 6,
          background: 'rgba(15, 23, 42, 0.75)',
          padding: 4,
          borderRadius: 6,
          border: '1px solid var(--border)',
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
          <Box size={13} /> 3D Factory Scene
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

// ─── Carbon View ──────────────────────────────────────────────────────────────
function CarbonView({
  activeSimulation,
  gridEF,
  setGridEF,
}: {
  activeSimulation: SimulationResult;
  gridEF: number;
  setGridEF: (v: number) => void;
}) {
  const energyKwh = activeSimulation.scenario.total_energy_kwh;
  const s1 = CARBON.scope1Calc();
  const s2 = CARBON.scope2Calc(energyKwh, gridEF);
  const total = +(s1.kgCO2e + s2.kgCO2e).toFixed(3);
  const reductionPotential = (
    Math.abs(activeSimulation.deltas.scope2_kg_co2e || 0) / 1000
  ).toFixed(3);

  return (
    <div className="scroll-area">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
        Carbon Accounting — ISO 14064 / GHG Protocol Scope 1 &amp; Scope 2
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--violet)' }}>
          <div className="kpi-label">Total Emissions (Simulated)</div>
          <div className="kpi-value" style={{ color: 'var(--violet)' }}>{total}<span className="kpi-unit">tCO₂e/day</span></div>
          <div className="kpi-change warn">Scope 1 (LPG) + Scope 2 (Grid Electricity)</div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--emerald)' }}>
          <div className="kpi-label">Avoided Emissions (Digital Twin)</div>
          <div className="kpi-value" style={{ color: 'var(--emerald)' }}>{reductionPotential}<span className="kpi-unit">tCO₂e</span></div>
          <div className="kpi-change pos">via active {activeSimulation.scenario_id} scenario</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }}>
        <div>
          <div className="panel">
            <div className="panel-hdr">Scope Split</div>
            <div style={{ padding: '0 4px 4px' }}>
              <ScopePie scope1={s1.kgCO2e} scope2={s2.kgCO2e} />
            </div>
          </div>
        </div>
        <div>
          {/* Scope 1 */}
          <div className="scope-card">
            <div className="scope-hdr">
              <span className="badge badge-red">SCOPE 1</span>
              Direct Combustion — LPG Furnace
            </div>
            <div className="scope-value" style={{ color: 'var(--red)' }}>
              {s1.kgCO2e} tCO₂e/day
            </div>
            <StatRow label="Fuel type" value="LPG (Liquefied Petroleum Gas)" />
            <StatRow label="Consumption rate" value="5 kg/hr × 12 hrs/day = 60 kg/day" />
            <StatRow label="Emission factor" value="2.98 kg CO₂e/kg LPG (IPCC AR6)" />
            <div className="scope-formula">
              <span style={{ color: 'var(--slate-500)' }}>// Scope 1 — GHG Protocol Category: Stationary Combustion</span>{'\n'}
              {s1.formula}{'\n'}
              Note: Location-based method. Fuel EF from IPCC 2006 GL Vol. 2, Table 2.2.
            </div>
          </div>

          {/* Scope 2 */}
          <div className="scope-card">
            <div className="scope-hdr">
              <span className="badge badge-cyan">SCOPE 2</span>
              Indirect — Purchased Grid Electricity
            </div>
            <div className="scope-value" style={{ color: 'var(--cyan)' }}>
              {s2.kgCO2e} tCO₂e/day
            </div>
            <StatRow label="Purchased electricity" value={`${energyKwh.toLocaleString()} kWh/day`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--border-muted)' }}>
              <span className="stat-label">Grid Emission Factor (editable)</span>
              <input
                className="inline-input"
                type="number" step={0.01} min={0.5} max={1.2}
                value={gridEF}
                onChange={e => setGridEF(parseFloat(e.target.value) || 0.82)}
              />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)' }}>
                kg CO₂e/kWh
              </span>
            </div>
            <StatRow label="Authority" value="Central Electricity Authority (CEA) Baseline v19 (2023-24)" />
            <div className="scope-formula">
              <span style={{ color: 'var(--slate-500)' }}>// Scope 2 — Location-based Method (GHG Protocol Scope 2 Guidance)</span>{'\n'}
              {s2.formula}{'\n'}
              EF Source: CEA India CO2 Database v19. Baseline versus Scenario emission linkage recalculates dynamically.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ activeSimulation }: { activeSimulation: SimulationResult }) {
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

  // Counterfactual calculation (IPMVP Option B/C production volume normalization)
  const cfUnits = 156;
  const cfAdjustedBaseKwh = Number((baseKwh * (cfUnits / baseUnits)).toFixed(1));
  const cfActualKwh = Number((cfAdjustedBaseKwh - savedKwh * 0.966).toFixed(1));
  const cfVerifiedSavingsKwh = Number((cfAdjustedBaseKwh - cfActualKwh).toFixed(1));
  const cfRealizationPct = ((cfVerifiedSavingsKwh / (savedKwh || 1)) * 100).toFixed(1);

  const grade = activeSimulation.investment_case?.evidence_grade || 'B';
  const gradeDesc = activeSimulation.investment_case?.evidence_description || 'Sub-metered Electrical Power, Modeled Airflow';

  const s1 = CARBON.scope1Calc();
  const s2 = CARBON.scope2Calc(scenKwh);

  const handlePrint = () => window.print();
  const handleExport = () => {
    const content = `WattWise AI — ISO 50001 Sustainability & Cost Audit Report
PrecisionWorks Manufacturing
Date: ${new Date().toLocaleDateString('en-IN')}
Scenario ID: ${activeSimulation.scenario_id}
Feasibility: ${activeSimulation.feasibility.toUpperCase()}
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

CONSTRAINT VALIDATIONS & INTERLOCKS
${activeSimulation.constraint_violations.map(v => `[${v.severity.toUpperCase()}] ${v.code} (${v.machine_id}): ${v.message}`).join('\n') || 'All 4 physics interlocks passed (Pressure floor, Thermal Quench, VOC, Quota)'}

IPMVP OPTION B/C COUNTERFACTUAL VERIFICATION
Production Volume Baseline:    ${baseUnits} parts (SEC: ${baseSec} kWh/part)
Scenario Normalized SEC:       ${scenSec} kWh/part (-${secImprovementPct}%)
Counterfactual Shift Output:   ${cfUnits} parts (+11.4% expansion)
Adjusted Baseline Energy:      ${cfAdjustedBaseKwh} kWh (E_adj = E_base × P_act / P_base)
Verified Operational Savings:  ${cfVerifiedSavingsKwh} kWh (${cfRealizationPct}% Realization Rate)
M&V Methodology:               IPMVP Option B/C (Continuous Submetering with Regression Volume Normalization)
Blame-Game Resolution:         Raw meter drop is adjusted for factory volume; separates true operational efficiency from market demand swings.

EPISTEMIC UNCERTAINTY & SENSOR SUFFICIENCY (IDEA A)
Readiness Grade:               Grade ${grade} (${gradeDesc})
Uncertainty Band:              ₹${(savedCost * 0.65).toFixed(0)} - ₹${(savedCost * 1.35).toFixed(0)}/day (±35% Diagnostic Ambiguity)
Recommended Instrumentation:  Temporary Ultrasonic Airflow Meter (₹12,000 Capex)
Target Post-Sensor Payback:    4.2 - 5.1 months (Grade A Confidence)

CARBON ACCOUNTING (ISO 14064 / GHG Protocol)
Scope 1 (LPG):      ${s1.kgCO2e} tCO₂e/day
Scope 2 (Grid):     ${s2.kgCO2e} tCO₂e/day (at CEA Grid EF 0.82 kg CO2e/kWh)

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
        <div className="report-kv"><span className="report-k">Grid Emission Factor</span><span className="report-v">0.82 kg CO₂e/kWh (CEA India Baseline Database v19)</span></div>
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
        <div className="report-kv"><span className="report-k">Sample Post-Action Volume (MES Shift)</span><span className="report-v">{cfUnits} units (+11.4% expansion)</span></div>
        <div className="report-kv"><span className="report-k">IPMVP Adjusted Baseline (E_adj)</span><span className="report-v">{cfAdjustedBaseKwh.toLocaleString()} kWh</span></div>
        <div className="report-kv"><span className="report-k">Verified Operational Efficiency Savings</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{cfVerifiedSavingsKwh} kWh ({cfRealizationPct}% Realization)</span></div>
        <div className="report-kv"><span className="report-k">Verification Standard</span><span className="report-v">IPMVP Option B/C &amp; ISO 50001:2018 Clause 6.3</span></div>
      </div>

      {/* Sensor Sufficiency & Uncertainty Bands */}
      <div className="report-page">
        <div className="report-heading">
          <ShieldAlert size={12} style={{ display: 'inline', marginRight: 6, color: 'var(--amber)' }} />
          Epistemic Sensor Sufficiency &amp; Uncertainty Gate (Idea A)
        </div>
        <div className="report-kv"><span className="report-k">Current Telemetry Readiness</span><span className="report-v" style={{ color: 'var(--amber)' }}>Grade {grade} ({gradeDesc})</span></div>
        <div className="report-kv"><span className="report-k">Uncertainty Spread</span><span className="report-v">₹{(savedCost * 0.65).toFixed(0)} – ₹{(savedCost * 1.35).toFixed(0)} / day (±35%)</span></div>
        <div className="report-kv"><span className="report-k">Diagnostic Ambiguity</span><span className="report-v">Blow-off timer fault vs Downstream ring-main pipe leak</span></div>
        <div className="report-kv"><span className="report-k">Recommended Sensor (VOI)</span><span className="report-v text-cyan">Temporary Ultrasonic Airflow Meter (₹12,000 Capex)</span></div>
        <div className="report-kv"><span className="report-k">Projected Grade A Payback</span><span className="report-v text-emerald">4.2 – 5.1 Months</span></div>
      </div>
    </div>
  );
}

// ─── Inspector Panel ──────────────────────────────────────────────────────────
function InspectorPanel({
  selectedId,
  setView,
  activeSimulation,
}: {
  selectedId: string | null;
  setView: (v: View) => void;
  activeSimulation: SimulationResult;
}) {
  const [tab, setTab] = useState<'alerts' | 'asset' | 'kpis'>('alerts');

  const asset = useMemo(() => {
    return ASSETS.find(a => a.id === selectedId) || null;
  }, [selectedId]);

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
            <div className="section-title">Active AI Alerts &amp; Interlocks</div>
            <div className="alert-banner warn">
              <div className="alert-title">
                <AlertTriangle size={10} style={{ display: 'inline', marginRight: 4 }} />
                ANOMALY — AIR COMPRESSOR (COMP-01)
              </div>
              <div className="alert-body">
                18 kW unloaded idle draw during break periods. Pressure setpoint 7.5 bar vs 6.8 bar optimal.
              </div>
              <div className="alert-rec">
                Digital Twin: Auto-cutoff reduces idle to 8.0 kW, saving ₹270/day.
              </div>
              <button
                className="btn btn-amber btn-sm btn-full"
                style={{ marginTop: 8 }}
                onClick={() => setView('simulator')}
              >
                <ChevronRight size={10} />
                Simulate Fix in Digital Twin
              </button>
            </div>

            <div className="alert-banner ok">
              <div className="alert-title">CNC-01 — MACHINING OPTIMAL</div>
              <div className="alert-body">SEC: 1.8 kWh/part. Production quota: 150 parts/day maintained.</div>
            </div>

            <div className="alert-banner crit">
              <div className="alert-title">FURN-01 — PROTECTED PROCESS BLOCK</div>
              <div className="alert-body">
                Heat-treatment batch preheating concurrent with morning peak. Stagger schedule to shave peak demand.
              </div>
            </div>
          </>
        )}

        {/* Asset tab */}
        {tab === 'asset' && (
          <>
            <div className="section-title">
              {asset ? asset.name : 'Select an asset on SCADA map'}
            </div>
            {asset ? (
              <>
                <div className="panel" style={{ marginBottom: 10 }}>
                  <div className="panel-hdr">{asset.model}</div>
                  <StatRow label="Current Draw" value={`${asset.currentKw} kW`} color="cyan" />
                  <StatRow label="Rated Capacity" value={`${asset.ratedKw} kW`} />
                  <StatRow label="Energy (24h)" value={`${asset.energyKwh.toLocaleString()} kWh`} />
                  <StatRow label="Power Factor" value={String(asset.pf)} color={asset.pf < 0.85 ? 'amber' : 'emerald'} />
                  <StatRow label="Load %" value={`${Math.round((asset.currentKw / asset.ratedKw) * 100)}%`} />
                  {asset.dischargePressureBar && (
                    <StatRow label="Discharge Pressure" value={`${asset.dischargePressureBar} bar`} color="amber" />
                  )}
                  {asset.tempC && <StatRow label="Temperature" value={`${asset.tempC}°C`} color="red" />}
                  {asset.cop && <StatRow label="COP" value={String(asset.cop)} color="emerald" />}
                  {asset.secKwhPerPart && <StatRow label="SEC" value={`${asset.secKwhPerPart} kWh/part`} />}
                  {asset.idleKw && (
                    <StatRow label="Idle Waste" value={`${asset.idleKw} kW × ${asset.idleHrsPerDay}h`} color="amber" />
                  )}
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

                <button
                  className="btn btn-cyan btn-full"
                  style={{ marginTop: 10 }}
                  onClick={() => setView('simulator')}
                >
                  <Sliders size={10} />
                  Simulate in Digital Twin
                </button>
              </>
            ) : (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--slate-500)', lineHeight: 1.8, marginTop: 20 }}>
                Click any asset node on the SCADA Floor Map to inspect its live telemetry, load profile, and AI diagnostic.
                {'\n\n'}Assets: COMP-01, CNC-01, FURN-01, PAINT-01.
              </div>
            )}
          </>
        )}

        {/* Plant KPIs tab */}
        {tab === 'kpis' && (
          <>
            <div className="section-title">Plant KPIs (Digital Twin Linked)</div>
            <div className="panel">
              <div className="panel-hdr">Energy</div>
              <StatRow label="Baseline Energy" value={`${activeSimulation.baseline.total_energy_kwh.toLocaleString()} kWh`} color="white" />
              <StatRow label="Scenario Energy" value={`${activeSimulation.scenario.total_energy_kwh.toLocaleString()} kWh`} color="cyan" />
              <StatRow label="Energy Savings" value={`${Math.abs(activeSimulation.deltas.energy_kwh)} kWh`} color="emerald" />
              <StatRow label="Cost Savings" value={`₹${Math.abs(activeSimulation.deltas.cost_inr).toLocaleString()}`} color="emerald" />
            </div>
            <div className="panel">
              <div className="panel-hdr">Carbon (CEA India EF 0.82)</div>
              <StatRow label="Scope 2 Electricity" value={`${(activeSimulation.scenario.total_energy_kwh * 0.82 / 1000).toFixed(2)} tCO₂e`} color="violet" />
              <StatRow label="Scope 1 LPG" value={`${CARBON.scope1Calc().kgCO2e} tCO₂e`} color="red" />
              <StatRow label="Carbon Abated" value={`${Math.abs(activeSimulation.deltas.scope2_kg_co2e || 0)} kg CO₂e`} color="emerald" />
            </div>
            <div className="panel">
              <div className="panel-hdr">Demand &amp; Peak</div>
              <StatRow label="Contract Limit" value="85.0 kW" color="amber" />
              <StatRow label="Baseline Peak" value={`${activeSimulation.baseline.peak_demand_kw} kW`} color="amber" />
              <StatRow label="Scenario Peak" value={`${activeSimulation.scenario.peak_demand_kw} kW`} color={activeSimulation.scenario.peak_demand_kw > 85 ? 'red' : 'emerald'} />
              <StatRow label="Peak Shaved" value={`${Math.abs(activeSimulation.deltas.peak_kw)} kW`} color="emerald" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('simulator');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<'3d' | '2d'>('3d');
  const [gridEF, setGridEF] = useState(0.82);

  // 24h baseline slice for deterministic demo
  const baselineRecords = useMemo(() => get24HourBaseline(6), []);

  // Shared single-source-of-truth active simulation
  const [activeSimulation, setActiveSimulation] = useState<SimulationResult>(() => {
    const initialReq: ScenarioRequest = {
      scenario_id: 'SCN-IDLE-FIX',
      action: {
        type: 'reduce_idle_power',
        machine_id: 'COMP-01',
        target_power_kw: 8.0,
        duration_hours: 3.0,
        target_state: 'idle',
      },
      assumptions: {
        hardware_required: '5-minute auto-cutoff timer relay',
        operator_approval: 'Required before setting DCS timer',
      },
    };
    return runScenarioSimulation(
      baselineRecords,
      initialReq,
      DEFAULT_TARIFF_CONFIG,
      DEFAULT_EMISSION_FACTOR
    );
  });

  const [simMode, setSimMode] = useState(true);

  // Simulated assets for 3D factory & SCADA map
  const simulatedAssets = useMemo(() => {
    return ASSETS.map(a => {
      if (a.id === 'compressor' && activeSimulation.action_executed.machine_id === 'COMP-01') {
        const isIdleCut = activeSimulation.action_executed.type === 'reduce_idle_power';
        return {
          ...a,
          currentKw: isIdleCut ? 8 : a.currentKw,
          status: 'OPTIMAL' as const,
          pf: isIdleCut ? 0.96 : a.pf,
        };
      }
      if (a.id === 'furnace' && activeSimulation.action_executed.machine_id === 'FURN-01') {
        return { ...a, currentKw: 48, status: 'OPTIMAL' as const };
      }
      return a;
    });
  }, [activeSimulation]);

  const handleSelectAsset = useCallback((id: string | null) => {
    setSelectedAsset(id);
  }, []);

  const handleSimulate = useCallback((id: string) => {
    setSelectedAsset(id);
    setView('simulator');
    setSimMode(true);
  }, []);

  const handleApplySimulation = useCallback((result: SimulationResult) => {
    setActiveSimulation(result);
    setSimMode(true);
  }, []);

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <Zap size={16} />
          WattWise AI
          <span className="sub">// INDUSTRIAL EMS &amp; DIGITAL TWIN</span>
        </div>
        <div className="topbar-center">
          <span className="shift-badge">PrecisionWorks Mfg</span>
          <div className="topbar-divider" />
          <span
            className={`tod-badge ${(() => {
              const h = new Date().getHours();
              return (h >= 9 && h <= 12) || (h >= 18 && h <= 21) ? 'peak' : 'offpeak';
            })()}`}
          >
            {(() => {
              const h = new Date().getHours();
              return (h >= 9 && h <= 12) || (h >= 18 && h <= 21) ? 'PEAK TARIFF' : 'OFF-PEAK';
            })()}
          </span>
          <span className="badge badge-emerald">
            <CheckCircle2 size={9} />
            {activeSimulation.scenario_id}: {activeSimulation.feasibility.toUpperCase()}
          </span>
        </div>
        <div className="topbar-right">
          <span className="topbar-clock">
            {new Date().toTimeString().slice(0, 8)}
          </span>
        </div>
      </header>

      {/* Telemetry bar */}
      <TeleBar simOn={simMode} activeSimulation={activeSimulation} />

      {/* Sidebar */}
      <nav className="sidebar">
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
            onClick={() => {
              setSelectedAsset(a.id);
              setView('scada');
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: ASSET_COLORS[a.id],
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11 }}>{a.name}</span>
            {a.status === 'WARNING' && (
              <AlertTriangle size={9} color="#f59e0b" style={{ marginLeft: 'auto' }} />
            )}
          </div>
        ))}

        <div className="sidebar-footer">
          PRECISIONWORKS MFG{'\n'}
          KPCL HACKATHON 2026{'\n'}
          WATTWISE AI v1.0
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {view === 'overview' && (
          <OverviewView setView={setView} activeSimulation={activeSimulation} />
        )}
        {view === 'scada' && (
          <ScadaView
            assets={simulatedAssets}
            selectedId={selectedAsset}
            onSelect={handleSelectAsset}
            onSimulate={handleSimulate}
            mapMode={mapMode}
            setMapMode={setMapMode}
          />
        )}
        {view === 'simulator' && (
          <DigitalTwinView
            baselineRecords={baselineRecords}
            tariffConfig={DEFAULT_TARIFF_CONFIG}
            emissionFactor={DEFAULT_EMISSION_FACTOR}
            activeSimulation={activeSimulation}
            onApplySimulation={handleApplySimulation}
            onSelectMachineIn3D={handleSelectAsset}
          />
        )}
        {view === 'carbon' && (
          <CarbonView
            activeSimulation={activeSimulation}
            gridEF={gridEF}
            setGridEF={setGridEF}
          />
        )}
        {view === 'reports' && <ReportView activeSimulation={activeSimulation} />}
      </main>

      {/* Inspector Panel */}
      <InspectorPanel
        selectedId={selectedAsset}
        setView={setView}
        activeSimulation={activeSimulation}
      />
    </div>
  );
}
