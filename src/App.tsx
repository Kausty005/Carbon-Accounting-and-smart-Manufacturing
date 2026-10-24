import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  LayoutGrid, Cpu, Sliders, Leaf, FileText,
  AlertTriangle, CheckCircle2, Zap, TrendingDown,
  Printer, Download, ChevronRight, Box,
} from 'lucide-react';
import ScadaFloorMap from './components/ScadaFloorMap';
import Factory3DScene from './components/Factory3D/Factory3DScene';
import { DemandAreaChart, ComparisonLineChart, ScopePie } from './components/Charts';
import {
  PLANT, ASSETS, HOURLY_BASE, CARBON,
  calcSimResult, type SimParams, type Asset,
} from './data/mockData';
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
function TeleBar({ simOn, simParams }: { simOn: boolean; simParams: SimParams }) {
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
  const scope2 = CARBON.scope2Calc(energy);
  const scope1 = CARBON.scope1Calc();
  const totalCarbon = +(scope1.kgCO2e + scope2.kgCO2e).toFixed(2);

  return (
    <div className="telebar">
      <div className="tele-item">
        <span className="tele-label">Plant</span>
        <span className={`live-badge ${simOn ? 'sim' : ''}`}>
          <span className="pulse-dot" />
          {simOn ? 'SIMULATED' : 'LIVE TELEMETRY'}
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
          8% / 998.4 kWh / ₹7,987
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
function OverviewView({ setView }: { setView: (v: View) => void }) {
  const kpis = [
    { label: 'Baseline Energy', value: '12,480', unit: 'kWh/period', color: '#22d3ee', change: '' },
    { label: 'Baseline Cost',   value: '₹99,840', unit: '/period',   color: '#f59e0b', change: '' },
    { label: 'Potential Savings', value: '998.4', unit: 'kWh (8%)', color: '#10b981', change: '+8% reducible' },
    { label: 'Scope 2 Carbon', value: '10.23', unit: 'tCO₂e',       color: '#8b5cf6', change: '' },
    { label: 'Active Assets',   value: '4',     unit: 'of 4',        color: '#22d3ee', change: '' },
    { label: 'Active Anomalies', value: '1',    unit: 'CRITICAL',    color: '#ef4444', change: 'AIR COMPRESSOR' },
    { label: 'Grid Emission Factor', value: '0.82', unit: 'kg CO₂e/kWh', color: '#8b5cf6', change: 'CEA India' },
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
          Saves ₹7,987.20/period (8% of total cost) and 818.7 kg CO₂e.
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
  params, setParams,
}: {
  params: SimParams;
  setParams: (p: SimParams) => void;
}) {
  const result = useMemo(() => calcSimResult(params), [params]);

  const toggle = (k: keyof SimParams) =>
    setParams({ ...params, [k]: !params[k] });

  return (
    <div className="scroll-area">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
        Digital Twin &amp; What-If Simulator — PrecisionWorks Manufacturing
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 12 }}>
        {/* Controls */}
        <div>
          <div className="panel">
            <div className="panel-hdr"><Sliders size={12} /> Control Parameters</div>
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
                    <span className="formula-comment">// Savings calculation</span>{'\n'}
                    {'idle_kW = 18, idle_hrs = 3.2'}{'\n'}
                    {'savings = 18 × 3.2 = 57.6 kWh/day'}{'\n'}
                    {'period = 57.6 × 30 = 1,728 kWh'}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {'saving ≈ 998.4 kWh → ₹7,987.20 → 818.7 kg CO₂e'}
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
                    <span>7.5 (current)</span>
                  </div>
                </div>
                {params.pressureSetpoint < 7.5 && (
                  <div className="formula-box">
                    <span className="formula-comment">// Each 0.1 bar ≈ 1% compressor energy saved</span>{'\n'}
                    {`reduction = ${(7.5 - params.pressureSetpoint).toFixed(1)} bar`}{'\n'}
                    {`pressure_savings = ${(7.5 - params.pressureSetpoint).toFixed(1)} × 10 × 3120/100`}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`= ${result.pressureSavingsKwh.toFixed(1)} kWh saved`}
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
                    <span className="formula-comment">// Demand management formula</span>{'\n'}
                    {'furnace_rated = 85 kW'}{'\n'}
                    {'peak_reduction = 85 × 0.18 = 15.3 kW'}{'\n'}
                    <span style={{ color: 'var(--emerald)' }}>
                      {`MD reduction = ${result.furnacePeakReductionKw} kW (18%)`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div>
          {/* KPI comparison */}
          <div className="panel" style={{ marginBottom: 10 }}>
            <div className="panel-hdr"><TrendingDown size={12} /> Scenario Comparison</div>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Baseline</th>
                  <th>Proposed</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-label">Energy Consumption</td>
                  <td className="td-baseline">{result.baseEnergy.toLocaleString()} kWh</td>
                  <td className="td-proposed">{result.optimizedEnergy.toLocaleString()} kWh</td>
                  <td className="td-delta">-{result.savingsKwh} kWh</td>
                </tr>
                <tr>
                  <td className="td-label">Total Cost</td>
                  <td className="td-baseline">₹{result.baselineCost.toLocaleString()}</td>
                  <td className="td-proposed">₹{result.optimizedCost.toLocaleString()}</td>
                  <td className="td-delta">-₹{result.savingsCost.toLocaleString()}</td>
                </tr>
                <tr>
                  <td className="td-label">Scope 2 Carbon</td>
                  <td className="td-baseline">{result.baseCarbon} tCO₂e</td>
                  <td className="td-proposed">{result.optCarbon} tCO₂e</td>
                  <td className="td-delta">-{result.savingsCarbon} tCO₂e</td>
                </tr>
                <tr>
                  <td className="td-label">Peak Demand Reduction</td>
                  <td className="td-baseline">0 kW</td>
                  <td className="td-proposed">{result.furnacePeakReductionKw} kW</td>
                  <td className="td-delta">-{result.furnacePeakReductionKw} kW</td>
                </tr>
                <tr>
                  <td className="td-label">Compressor Idle Savings</td>
                  <td className="td-baseline">0 kWh</td>
                  <td className="td-proposed">{result.idleSavingsKwh} kWh</td>
                  <td className="td-delta">-{result.idleSavingsKwh} kWh</td>
                </tr>
                <tr>
                  <td className="td-label">Pressure Savings</td>
                  <td className="td-baseline">0 kWh</td>
                  <td className="td-proposed">{result.pressureSavingsKwh.toFixed(1)} kWh</td>
                  <td className="td-delta">-{result.pressureSavingsKwh.toFixed(1)} kWh</td>
                </tr>
                {result.roi && (
                  <tr>
                    <td className="td-label">Est. Payback (Auto-Cutoff relay ₹2L)</td>
                    <td className="td-baseline">—</td>
                    <td className="td-proposed" style={{ color: 'var(--cyan)' }}>{result.roi} months</td>
                    <td className="td-delta">ROI</td>
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

// ─── Carbon View ──────────────────────────────────────────────────────────────
function CarbonView({
  params, gridEF, setGridEF,
}: {
  params: SimParams;
  gridEF: number;
  setGridEF: (v: number) => void;
}) {
  const s1 = CARBON.scope1Calc();
  const s2 = CARBON.scope2Calc(PLANT.baselineEnergy, gridEF);
  const total = +(s1.kgCO2e + s2.kgCO2e).toFixed(3);
  const reductionPotential = calcSimResult(params).savingsCarbon;

  return (
    <div className="scroll-area">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--slate-400)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 }}>
        Carbon Accounting — ISO 14064 / GHG Protocol
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--violet)' }}>
          <div className="kpi-label">Total Emissions</div>
          <div className="kpi-value" style={{ color: 'var(--violet)' }}>{total}<span className="kpi-unit">tCO₂e/day</span></div>
          <div className="kpi-change warn">Scope 1 + Scope 2</div>
        </div>
        <div className="kpi-card" style={{ ['--kpi-color' as any]: 'var(--emerald)' }}>
          <div className="kpi-label">Reduction Potential</div>
          <div className="kpi-value" style={{ color: 'var(--emerald)' }}>{reductionPotential}<span className="kpi-unit">tCO₂e</span></div>
          <div className="kpi-change pos">via Digital Twin scenario</div>
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
              Indirect — Purchased Electricity
            </div>
            <div className="scope-value" style={{ color: 'var(--cyan)' }}>
              {s2.kgCO2e} tCO₂e/day
            </div>
            <StatRow label="Grid consumption" value={`${PLANT.baselineEnergy.toLocaleString()} kWh/period`} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--border-muted)' }}>
              <span className="stat-label">Emission factor (editable)</span>
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
            <StatRow label="Authority" value="CEA India Grid EF 2023-24" />
            <div className="scope-formula">
              <span style={{ color: 'var(--slate-500)' }}>// Scope 2 — Location-based Method (GHG Protocol)</span>{'\n'}
              {s2.formula}{'\n'}
              EF Source: Central Electricity Authority, India (CEA) Grid Emission Factor.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ params }: { params: SimParams }) {
  const result = calcSimResult(params);
  const s1 = CARBON.scope1Calc();
  const s2 = CARBON.scope2Calc(PLANT.baselineEnergy);
  const anyFix = params.autoIdleCutoff || params.pressureSetpoint < 7.5 || params.staggerFurnace;

  const handlePrint = () => window.print();
  const handleExport = () => {
    const content = `WattWise AI — ISO 50001 Sustainability & Cost Audit Report
PrecisionWorks Manufacturing
Date: ${new Date().toLocaleDateString('en-IN')}
--------------------------------------------------

EXECUTIVE SUMMARY
Baseline Energy:    ${result.baseEnergy.toLocaleString()} kWh
Baseline Cost:      ₹${result.baselineCost.toLocaleString()}
Proposed Energy:    ${result.optimizedEnergy.toLocaleString()} kWh
Proposed Cost:      ₹${result.optimizedCost.toLocaleString()}
Energy Savings:     ${result.savingsKwh} kWh (${((result.savingsKwh/result.baseEnergy)*100).toFixed(1)}%)
Cost Savings:       ₹${result.savingsCost.toLocaleString()}
Carbon Avoided:     ${result.savingsCarbon} tCO₂e

ANOMALY DETECTED
Asset:              Air Compressor (ELGi EN 45)
Issue:              Running unloaded 18 kW × 3.2 hrs/day = 57.6 kWh/day idle waste
Root Cause:         No auto-idle cutoff configured; pressure setpoint at 7.5 bar vs 6.8 bar optimal

RECOMMENDED ACTIONS
1. Install Auto-Idle Cutoff relay (5-min unloaded timer) — Cost: ₹2,00,000, Payback: ${result.roi} months
2. Reduce airline pressure setpoint from 7.5 to ${params.pressureSetpoint} bar
3. Stagger Furnace pre-heat by 45 min to reduce peak demand by ${result.furnacePeakReductionKw} kW

CARBON ACCOUNTING (ISO 14064 / GHG Protocol)
Scope 1 (LPG):      ${s1.kgCO2e} tCO₂e/day  [${s1.formula}]
Scope 2 (Grid):     ${s2.kgCO2e} tCO₂e/day  [${s2.formula}]
Carbon Intensity:   ${((s1.kgCO2e + s2.kgCO2e) / (result.baseEnergy/1000)).toFixed(2)} tCO₂e/MWh

VERIFICATION PROTOCOL
Standard:           ISO 50001:2018 EnMS
Monitoring:         SCADA sub-metering at each asset breaker panel
Verification:       Monthly data review by Energy Management Team
Reporting:          Annual Energy Performance Indicator (EnPI) report
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
        <div className="report-kv"><span className="report-k">Grid Tariff</span><span className="report-v">₹{PLANT.tariff}/kWh (ToD — Peak/Off-Peak)</span></div>
        <div className="report-kv"><span className="report-k">Grid Emission Factor</span><span className="report-v">{PLANT.gridEF} kg CO₂e/kWh (CEA India 2023-24)</span></div>
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
        <div className="report-kv"><span className="report-k">Carbon Impact</span><span className="report-v" style={{ color: 'var(--amber)' }}>818.7 kg CO₂e/period</span></div>
        <div className="formula-box" style={{ marginTop: 10 }}>
          <span className="formula-comment">// Root-cause engineering math</span>{'\n'}
          {'idle_energy   = 18 kW × 3.2 hr/day × 30 days = 1,728 kWh'}{'\n'}
          {'idle_cost     = 1,728 kWh × ₹8/kWh         = ₹13,824'}{'\n'}
          {'adj_savings   = 998.4 kWh × ₹8              = ₹7,987.20'}{'\n'}
          {'carbon_saving = 998.4 kWh × 0.82 kg CO₂e   = 818.7 kg CO₂e'}
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
          Carbon Impact
        </div>
        <div className="report-kv"><span className="report-k">Scope 1 (LPG Combustion)</span><span className="report-v">{s1.kgCO2e} tCO₂e/day</span></div>
        <div className="report-kv"><span className="report-k">Scope 2 (Grid Electricity)</span><span className="report-v">{s2.kgCO2e} tCO₂e/day</span></div>
        <div className="report-kv"><span className="report-k">Total GHG Footprint</span><span className="report-v">{+(s1.kgCO2e + s2.kgCO2e).toFixed(3)} tCO₂e/day</span></div>
        <div className="report-kv"><span className="report-k">Avoided Emissions (scenario)</span><span className="report-v" style={{ color: 'var(--emerald)' }}>{result.savingsCarbon} tCO₂e saved</span></div>
        <div className="formula-box" style={{ marginTop: 10 }}>
          <span className="formula-comment">// Scope 1: LPG Combustion (IPCC AR6, GWP100)</span>{'\n'}
          {s1.formula}{'\n\n'}
          <span className="formula-comment">// Scope 2: Location-based (CEA India)</span>{'\n'}
          {s2.formula}
        </div>
      </div>

      {/* Verification */}
      <div className="report-page">
        <div className="report-heading">Verification Protocol</div>
        <div className="report-kv"><span className="report-k">EnMS Standard</span><span className="report-v">ISO 50001:2018</span></div>
        <div className="report-kv"><span className="report-k">Monitoring Method</span><span className="report-v">SCADA sub-metering at each asset breaker panel (kWh meter class 0.5S)</span></div>
        <div className="report-kv"><span className="report-k">Baseline Period</span><span className="report-v">30-day rolling average (current period)</span></div>
        <div className="report-kv"><span className="report-k">Verification Frequency</span><span className="report-v">Monthly data review by Energy Management Representative</span></div>
        <div className="report-kv"><span className="report-k">Reporting</span><span className="report-v">Annual Energy Performance Indicator (EnPI) report to top management</span></div>
        <div className="report-kv"><span className="report-k">Third-Party Audit</span><span className="report-v">Bureau Veritas / DNV GL recommended — biennial</span></div>
        <div className="report-kv"><span className="report-k">Generated by</span><span className="report-v">WattWise AI — Industrial Energy Intelligence v1.0 (KPCL Hackathon 2026)</span></div>
      </div>
    </div>
  );
}

// ─── Inspector Panel ──────────────────────────────────────────────────────────
function InspectorPanel({
  selectedId, setView, params,
}: {
  selectedId: string | null;
  setView: (v: View) => void;
  params: SimParams;
}) {
  const [tab, setTab] = useState<'asset' | 'alerts' | 'kpis'>('alerts');
  const asset = ASSETS.find(a => a.id === selectedId);

  useEffect(() => {
    if (selectedId) setTab('asset');
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
                Auto-Idle Cutoff: saves 998.4 kWh / ₹7,987 / 818.7 kg CO₂e
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
              <StatRow label="Grid EF (CEA)" value="0.82 kg CO₂e/kWh" color="violet" />
              <StatRow label="Scope 2 (Elec)" value="10.23 tCO₂e/day" color="violet" />
              <StatRow label="Scope 1 (LPG)" value={`${CARBON.scope1Calc().kgCO2e} tCO₂e/day`} color="red" />
              <StatRow label="Carbon Reduction" value={`${calcSimResult(params).savingsCarbon} tCO₂e`} color="emerald" />
            </div>
            <div className="panel">
              <div className="panel-hdr">Power Quality</div>
              <StatRow label="Plant PF (baseline)" value="0.91" color="amber" />
              <StatRow label="Plant PF (optimized)" value="0.96" color="emerald" />
              <StatRow label="Compressor PF" value="0.78" color="red" />
              <StatRow label="CNC PF" value="0.94" color="emerald" />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('scada');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<'3d' | '2d'>('3d');
  const [simMode, setSimMode] = useState(false);
  const [gridEF, setGridEF] = useState(PLANT.gridEF);
  const [params, setParams] = useState<SimParams>({
    autoIdleCutoff: false,
    pressureSetpoint: 7.5,
    staggerFurnace: false,
  });

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

  return (
    <div className="app-shell">
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-brand">
          <Zap size={16} />
          WattWise AI
          <span className="sub">// INDUSTRIAL EMS</span>
        </div>
        <div className="topbar-center">
          <span className="shift-badge">PrecisionWorks Mfg</span>
          <div className="topbar-divider" />
          <span className={`tod-badge ${(() => { const h = new Date().getHours(); return (h>=9&&h<=12)||(h>=18&&h<=21)?'peak':'offpeak'; })()}`}>
            {(() => { const h = new Date().getHours(); return (h>=9&&h<=12)||(h>=18&&h<=21)?'PEAK TARIFF':'OFF-PEAK'; })()}
          </span>
          {anyFix && (
            <span className="badge badge-emerald">
              <CheckCircle2 size={9} />
              SCENARIO ACTIVE
            </span>
          )}
        </div>
        <div className="topbar-right">
          <span className="topbar-clock">
            {new Date().toTimeString().slice(0,8)}
          </span>
        </div>
      </header>

      {/* Telemetry bar */}
      <TeleBar simOn={simMode && anyFix} simParams={params} />

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
        {view === 'overview' && <OverviewView setView={setView} />}
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
          <SimulatorView params={params} setParams={(p) => { setParams(p); setSimMode(true); }} />
        )}
        {view === 'carbon' && (
          <CarbonView params={params} gridEF={gridEF} setGridEF={setGridEF} />
        )}
        {view === 'reports' && <ReportView params={params} />}
      </main>

      {/* Inspector */}
      <InspectorPanel selectedId={selectedAsset} setView={setView} params={params} />
    </div>
  );
}
