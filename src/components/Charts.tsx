import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const MONO = "'IBM Plex Mono','Courier New',monospace";
const TICK = { fill: '#64748b', fontSize: 9, fontFamily: MONO };

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function ScadaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.08)',
      borderRadius: 8, padding: '8px 12px',
      fontFamily: MONO, fontSize: 10,
    }}>
      <div style={{ color: '#475569', marginBottom: 6, letterSpacing: 1, fontWeight: 600 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 2 }}>
          <span style={{ color: '#334155' }}>{p.name}</span>
          <span style={{ fontWeight: 700 }}>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {p.unit || 'kW'}</span>
        </div>
      ))}
    </div>
  );
}

// ─── 24h Stacked Area (baseline) ─────────────────────────────────────────────
export function DemandAreaChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="gComp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCnc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gFurn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gCool" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(0, 0, 0, 0.08)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={TICK} interval={3} />
        <YAxis tick={TICK} unit=" kW" />
        <Tooltip content={<ScadaTooltip />} />
        <Legend iconType="square" iconSize={8}
          wrapperStyle={{ fontFamily: MONO, fontSize: 9, color: '#64748b' }}
        />
        <Area type="monotone" dataKey="compressor" name="Compressor" stackId="1"
          stroke="#f59e0b" fill="url(#gComp)" strokeWidth={1.5} />
        <Area type="monotone" dataKey="cnc" name="CNC" stackId="1"
          stroke="#22d3ee" fill="url(#gCnc)" strokeWidth={1.5} />
        <Area type="monotone" dataKey="furnace" name="Furnace" stackId="1"
          stroke="#ef4444" fill="url(#gFurn)" strokeWidth={1.5} />
        <Area type="monotone" dataKey="cooling" name="Cooling" stackId="1"
          stroke="#10b981" fill="url(#gCool)" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Dual 24h Comparison (baseline vs optimized) ──────────────────────────────
export function ComparisonLineChart({ base, opt }: { base: any[]; opt: any[] }) {
  const merged = base.map((b, i) => ({
    label: b.label,
    baseline: b.total,
    optimized: opt[i]?.total || 0,
    tariff: b.tariff,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={merged} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="rgba(0, 0, 0, 0.08)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={TICK} interval={3} />
        <YAxis tick={TICK} unit=" kW" />
        <Tooltip content={<ScadaTooltip />} />
        <Legend iconType="square" iconSize={8}
          wrapperStyle={{ fontFamily: MONO, fontSize: 9, color: '#64748b' }}
        />
        <Line type="monotone" dataKey="baseline" name="Baseline" stroke="#f59e0b"
          strokeWidth={1.5} dot={false} />
        <Line type="monotone" dataKey="optimized" name="Proposed" stroke="#10b981"
          strokeWidth={1.5} dot={false} strokeDasharray="5 3" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Asset Energy Bar ─────────────────────────────────────────────────────────
export function AssetEnergyBar({ assets }: { assets: { name: string; energyKwh: number; color: string }[] }) {
  const data = assets.map(a => ({ name: a.name.split(' ').slice(0,2).join(' '), energy: a.energyKwh, fill: a.color }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="rgba(0, 0, 0, 0.08)" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ ...TICK, fontSize: 8 }} />
        <YAxis tick={TICK} unit=" kWh" />
        <Tooltip content={<ScadaTooltip />} />
        {data.map((d, i) => (
          <Bar key={i} dataKey="energy" name="Energy" fill={d.fill} radius={[3,3,0,0]}>
            <Cell key={i} fill={d.fill} />
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Scope Pie ────────────────────────────────────────────────────────────────
const SCOPE_COLORS = ['#ef4444', '#22d3ee'];
export function ScopePie({ scope1, scope2 }: { scope1: number; scope2: number }) {
  const data = [
    { name: 'Scope 1 (LPG)', value: scope1 },
    { name: 'Scope 2 (Grid)', value: scope2 },
  ];
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={65}
          paddingAngle={3} dataKey="value"
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${(name || '').split(' ')[0]} ${((percent || 0) * 100).toFixed(0)}%`
          }
          labelLine={{ stroke: '#334155', strokeWidth: 0.7 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SCOPE_COLORS[i]} opacity={0.85} />
          ))}
        </Pie>
        <Tooltip content={<ScadaTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Machine Tactical Energy Forecast Interval Chart ──────────────────────────
export interface ForecastIntervalPoint {
  label: string; // e.g. "Current Interval", "Target Interval (+15m)"
  timeWindow: string; // e.g. "10:00-10:15", "10:15-10:30"
  energyKwh: number;
  equivalentKw: number;
  isForecast: boolean;
  statusLabel: string; // e.g. "SIMULATED TELEMETRY" or "ML MODEL FORECAST"
}

function ForecastTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: ForecastIntervalPoint = payload[0]?.payload;
  if (!d) return null;

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.98)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(0, 0, 0, 0.12)',
      boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12)',
      borderRadius: 8, padding: '8px 12px',
      fontFamily: MONO, fontSize: 10,
      minWidth: 160,
    }}>
      <div style={{ color: '#0f172a', fontWeight: 700, marginBottom: 4 }}>
        {d.label}
      </div>
      <div style={{ color: '#64748b', fontSize: 9, marginBottom: 6 }}>
        Window: {d.timeWindow}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 3 }}>
        <span style={{ color: '#475569' }}>Energy:</span>
        <span style={{ fontWeight: 700, color: d.isForecast ? '#7c3aed' : '#0284c7' }}>
          {d.energyKwh.toFixed(3)} kWh
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 4 }}>
        <span style={{ color: '#475569' }}>Equiv. Power:</span>
        <span style={{ fontWeight: 600, color: '#0f172a' }}>
          {d.equivalentKw.toFixed(2)} kW
        </span>
      </div>
      <div style={{
        marginTop: 6, paddingTop: 4, borderTop: '1px solid rgba(0, 0, 0, 0.08)',
        fontSize: 8.5, color: d.isForecast ? '#7c3aed' : '#0284c7', fontWeight: 700,
        letterSpacing: 0.5, textTransform: 'uppercase',
      }}>
        {d.statusLabel}
      </div>
    </div>
  );
}

export function MachineForecastIntervalChart({
  points,
}: {
  points: ForecastIntervalPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="rgba(0, 0, 0, 0.06)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ ...TICK, fontSize: 8.5 }} />
        <YAxis tick={TICK} unit=" kWh" />
        <Tooltip content={<ForecastTooltip />} />
        <Bar dataKey="energyKwh" radius={[4, 4, 0, 0]}>
          {points.map((p, i) => (
            <Cell
              key={i}
              fill={p.isForecast ? 'rgba(124, 58, 237, 0.85)' : 'rgba(2, 132, 199, 0.85)'}
              stroke={p.isForecast ? '#6d28d9' : '#0284c7'}
              strokeWidth={1.5}
              strokeDasharray={p.isForecast ? '3 2' : undefined}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

