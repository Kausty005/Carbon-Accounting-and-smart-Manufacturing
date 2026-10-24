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
const SCOPE_COLORS = ['#DC2626', '#0284C7'];
export function ScopePie({ scope1, scope2 }: { scope1: number; scope2: number }) {
  const data = [
    { name: 'Scope 1 (LPG)', value: scope1 },
    { name: 'Scope 2 (Grid)', value: scope2 },
  ];
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={65}
          paddingAngle={3}
          dataKey="value"
          label={({ name, percent }: { name?: string; percent?: number }) =>
            `${(name || '').split(' ')[0]} ${((percent || 0) * 100).toFixed(0)}%`
          }
          labelLine={{ stroke: '#78716C', strokeWidth: 0.8 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SCOPE_COLORS[i]} opacity={0.9} />
          ))}
        </Pie>
        <Tooltip content={<ScadaTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Machine Energy & Cost Share Donut Chart ────────────────────────────────
export function MachineEnergyDonut({
  assets,
}: {
  assets: { id: string; name: string; energyKwh: number; currentKw: number; color: string }[];
}) {
  const totalKwh = assets.reduce((s, a) => s + a.energyKwh, 0);
  const data = assets.map(a => ({
    name: a.name.split(' (')[0],
    fullName: a.name,
    value: a.energyKwh,
    percent: totalKwh > 0 ? (a.energyKwh / totalKwh) * 100 : 0,
    color: a.color,
    kw: a.currentKw,
  }));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%' }}>
      <div style={{ width: 170, height: 170, position: 'relative', flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={74}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.96)',
                      border: '1px solid rgba(0,0,0,0.12)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      fontFamily: MONO,
                      fontSize: 11,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: d.color, marginBottom: 4 }}>{d.fullName}</div>
                    <div style={{ color: '#334155' }}>
                      Energy: <strong>{d.value.toLocaleString()} kWh</strong> ({d.percent.toFixed(1)}%)
                    </div>
                    <div style={{ color: '#64748b', fontSize: 10 }}>Current Draw: {d.kw} kW</div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center Readout */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: MONO, color: 'var(--charcoal-900, #1c1917)' }}>
            {(totalKwh / 1000).toFixed(1)}k
          </div>
          <div style={{ fontSize: 8.5, letterSpacing: '0.08em', color: '#78716c', textTransform: 'uppercase', fontWeight: 600 }}>
            kWh Total
          </div>
        </div>
      </div>

      {/* Legend & Stat Breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 }}>
        {data.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '4px 8px',
              borderRadius: 6,
              background: 'rgba(0,0,0,0.025)',
              border: '1px solid rgba(0,0,0,0.04)',
              fontSize: 11,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: item.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--charcoal-800, #292524)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: MONO, flexShrink: 0 }}>
              <span style={{ color: '#78716c', fontSize: 10 }}>{item.value.toLocaleString()} kWh</span>
              <span style={{ fontWeight: 700, color: item.color, minWidth: 38, textAlign: 'right' }}>
                {item.percent.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Productive vs Idle Waste Horizontal Progress Bar ───────────────────────
export function ProductiveVsWasteBar({
  productiveKwh = 11481.6,
  wasteKwh = 998.4,
}: {
  productiveKwh?: number;
  wasteKwh?: number;
}) {
  const total = productiveKwh + wasteKwh;
  const prodPct = total > 0 ? (productiveKwh / total) * 100 : 92;
  const wastePct = total > 0 ? (wasteKwh / total) * 100 : 8;

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
          <span style={{ fontWeight: 700, color: '#166534' }}>Productive Base</span>
          <span style={{ fontFamily: MONO, color: '#4b5563' }}>({productiveKwh.toLocaleString(undefined, { maximumFractionDigits: 0 })} kWh — {prodPct.toFixed(1)}%)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
          <span style={{ fontWeight: 700, color: '#991b1b' }}>Avoidable Idle Waste</span>
          <span style={{ fontFamily: MONO, color: '#ef4444', fontWeight: 800 }}>({wasteKwh.toFixed(1)} kWh — {wastePct.toFixed(1)}%)</span>
        </div>
      </div>

      {/* Visual Stacked Bar */}
      <div
        style={{
          height: 14,
          borderRadius: 9999,
          display: 'flex',
          overflow: 'hidden',
          backgroundColor: '#e2e8f0',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)',
        }}
      >
        <div
          style={{
            width: `${prodPct}%`,
            background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
            transition: 'width 0.4s ease',
          }}
          title={`Productive Load: ${prodPct.toFixed(1)}%`}
        />
        <div
          style={{
            width: `${wastePct}%`,
            background: 'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
            transition: 'width 0.4s ease',
            position: 'relative',
          }}
          title={`Avoidable Idle Waste: ${wastePct.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}
