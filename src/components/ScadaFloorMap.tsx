import { useState } from 'react';
import { AlertTriangle, Zap, Thermometer, Wind, Droplets } from 'lucide-react';
import type { Asset } from '../data/mockData';

interface Props {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSimulate: (id: string) => void;
}

const ASSET_POS: Record<string, { x: number; y: number }> = {
  compressor: { x: 180, y: 200 },
  cnc:        { x: 480, y: 200 },
  furnace:    { x: 180, y: 400 },
  cooling:    { x: 480, y: 400 },
};

const BUS_X = 330;
const BUS_Y1 = 100;
const BUS_Y2 = 520;

const STATUS_COLOR: Record<string, string> = {
  OPTIMAL: '#10b981',
  WARNING: '#f59e0b',
  PEAK:    '#ef4444',
  IDLE:    '#64748b',
};

function LoadBar({ label, fill, color, pct }: { label: string; fill: string; color: string; pct: number }) {
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

function AssetIcon({ id }: { id: string }) {
  const sz = 14;
  const c = '#94a3b8';
  if (id === 'compressor') return <Wind size={sz} color={c} />;
  if (id === 'cnc')        return <Zap size={sz} color={c} />;
  if (id === 'furnace')    return <Thermometer size={sz} color={c} />;
  return <Droplets size={sz} color={c} />;
}

export default function ScadaFloorMap({ assets, selectedId, onSelect, onSimulate }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  const W = 660, H = 560;

  function busY(assetY: number) {
    return BUS_Y1 + (assetY - BUS_Y1) * 0.5 + 40;
  }

  return (
    <div className="scada-container">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%' }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.5" />
          </pattern>
          <marker id="arrow-ok" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#22d3ee" />
          </marker>
          <marker id="arrow-warn" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f59e0b" />
          </marker>
        </defs>
        <rect width={W} height={H} fill="url(#grid)" />

        {/* Main HT/LT Transformer */}
        <g transform={`translate(${BUS_X - 40}, 30)`}>
          <rect width={80} height={50} rx="4" fill="#1a2235" stroke="#334155" strokeWidth="1" />
          <text x={40} y={16} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="IBM Plex Mono">HT/LT</text>
          <text x={40} y={28} textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="IBM Plex Mono">TRANSFORMER</text>
          <text x={40} y={42} textAnchor="middle" fill="#22d3ee" fontSize="9" fontFamily="IBM Plex Mono" fontWeight="600">415V Busbar</text>
        </g>

        {/* Vertical busbar */}
        <line x1={BUS_X} y1={80} x2={BUS_X} y2={BUS_Y2}
          stroke="#22d3ee" strokeWidth="2" opacity="0.4"
          strokeDasharray="none"
        />

        {/* Tap lines + animated flows */}
        {assets.map((asset) => {
          const pos = ASSET_POS[asset.id];
          if (!pos) return null;
          const isWarn = asset.status === 'WARNING' || asset.status === 'PEAK';
          const color = STATUS_COLOR[asset.status];
          const cls = isWarn ? 'pline-warn' : 'pline-ok';
          const busJoin = { x: BUS_X, y: pos.y + 25 };

          return (
            <g key={asset.id}>
              {/* Bus tap */}
              <line
                x1={BUS_X} y1={busJoin.y}
                x2={pos.x + 110} y2={busJoin.y}
                stroke={color} strokeWidth="1.5"
                className={cls}
                markerEnd={isWarn ? 'url(#arrow-warn)' : 'url(#arrow-ok)'}
              />
            </g>
          );
        })}

        {/* Asset nodes */}
        {assets.map((asset) => {
          const pos = ASSET_POS[asset.id];
          if (!pos) return null;
          const isSelected = selectedId === asset.id;
          const isHov = hovered === asset.id;
          const color = STATUS_COLOR[asset.status];
          const loadPct = Math.round((asset.currentKw / asset.ratedKw) * 100);

          return (
            <g
              key={asset.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="asset-node"
              onClick={() => onSelect(asset.id)}
              onMouseEnter={() => setHovered(asset.id)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow */}
              {(isSelected || isHov) && (
                <rect x={-4} y={-4} width={228} height={118} rx="8"
                  fill="none" stroke={color} strokeWidth="1"
                  opacity="0.5"
                />
              )}
              {/* Card bg */}
              <rect className="asset-bg" x={0} y={0} width={220} height={110} rx="6"
                fill="#111827" stroke={isSelected ? color : '#1e293b'}
                strokeWidth={isSelected ? 1.5 : 1}
              />
              {/* Status bar */}
              <rect x={0} y={0} width={220} height={3} rx="2" fill={color} opacity="0.8" />

              {/* Header */}
              <text x={12} y={18} fill="#f8fafc" fontSize="11" fontFamily="IBM Plex Mono" fontWeight="600">
                {asset.name}
              </text>
              <text x={12} y={30} fill="#64748b" fontSize="8" fontFamily="IBM Plex Mono">
                {asset.model}
              </text>

              {/* Status badge */}
              <rect x={150} y={8} width={58} height={14} rx="3"
                fill={`${color}22`} stroke={color} strokeWidth="0.7" opacity="0.9"
              />
              <text x={179} y={19} textAnchor="middle" fill={color} fontSize="7.5"
                fontFamily="IBM Plex Mono" fontWeight="700"
              >
                {asset.status}
              </text>

              {/* Warning icon for WARNING */}
              {asset.status === 'WARNING' && (
                <g transform="translate(134, 8)">
                  <text fill="#f59e0b" fontSize="12">⚠</text>
                </g>
              )}

              {/* Stats */}
              <text x={12} y={50} fill="#64748b" fontSize="8" fontFamily="IBM Plex Mono">DRAW</text>
              <text x={12} y={62} fill="#22d3ee" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="700">
                {asset.currentKw} kW
              </text>

              <text x={90} y={50} fill="#64748b" fontSize="8" fontFamily="IBM Plex Mono">ENERGY</text>
              <text x={90} y={62} fill="#f8fafc" fontSize="11" fontFamily="IBM Plex Mono" fontWeight="600">
                {asset.energyKwh.toLocaleString()} kWh
              </text>

              <text x={170} y={50} fill="#64748b" fontSize="8" fontFamily="IBM Plex Mono">P.F.</text>
              <text x={170} y={62} fill={asset.pf < 0.85 ? '#f59e0b' : '#10b981'} fontSize="11" fontFamily="IBM Plex Mono" fontWeight="600">
                {asset.pf}
              </text>

              {/* Load bar */}
              <rect x={12} y={72} width={196} height={5} rx="2.5" fill="#0d1525" />
              <rect x={12} y={72} width={Math.round(196 * loadPct / 100)} height={5} rx="2.5" fill={color} opacity="0.8" />
              <text x={12} y={88} fill="#64748b" fontSize="8" fontFamily="IBM Plex Mono">
                {asset.idleKw ? `LOAD: ${loadPct}%  |  IDLE WASTE: ${asset.idleKw} kW × ${asset.idleHrsPerDay}h/day` :
                  `LOAD: ${loadPct}%`}
              </text>

              {/* Extra params */}
              {asset.dischargePressureBar && (
                <text x={12} y={100} fill="#94a3b8" fontSize="7.5" fontFamily="IBM Plex Mono">
                  {`DISCHARGE: ${asset.dischargePressureBar} bar`}
                </text>
              )}
              {asset.tempC && (
                <text x={12} y={100} fill="#94a3b8" fontSize="7.5" fontFamily="IBM Plex Mono">
                  {`TEMP: ${asset.tempC}°C`}
                </text>
              )}
              {asset.cop && (
                <text x={12} y={100} fill="#94a3b8" fontSize="7.5" fontFamily="IBM Plex Mono">
                  {`COP: ${asset.cop}`}
                </text>
              )}
              {asset.secKwhPerPart && (
                <text x={12} y={100} fill="#94a3b8" fontSize="7.5" fontFamily="IBM Plex Mono">
                  {`SEC: ${asset.secKwhPerPart} kWh/part`}
                </text>
              )}
            </g>
          );
        })}

        {/* Corner marks */}
        <g stroke="#334155" strokeWidth="1" fill="none">
          <path d="M 10,10 L 30,10 M 10,10 L 10,30" />
          <path d={`M ${W-10},10 L ${W-30},10 M ${W-10},10 L ${W-10},30`} />
          <path d={`M 10,${H-10} L 30,${H-10} M 10,${H-10} L 10,${H-30}`} />
          <path d={`M ${W-10},${H-10} L ${W-30},${H-10} M ${W-10},${H-10} L ${W-10},${H-30}`} />
        </g>

        {/* Labels */}
        <text x={12} y={H - 12} fill="#334155" fontSize="8" fontFamily="IBM Plex Mono" letterSpacing="2">
          PRECISIONWORKS MFG — SCADA FLOOR MAP — LIVE TELEMETRY
        </text>
      </svg>

      {/* Floating selected asset detail overlay */}
      {selectedId && (
        <div style={{
          position: 'absolute', bottom: 16, right: 16,
          background: '#111827', border: '1px solid #334155',
          borderRadius: 6, padding: '10px 14px', minWidth: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          {(() => {
            const a = assets.find(a => a.id === selectedId)!;
            const color = STATUS_COLOR[a.status];
            return (
              <>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: '#64748b', letterSpacing: 2, marginBottom: 6 }}>
                  SELECTED ASSET
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                  {a.name}
                </div>
                {a.status === 'WARNING' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#f59e0b', fontFamily: 'IBM Plex Mono', fontSize: 10 }}>
                    <AlertTriangle size={12} />
                    ANOMALY DETECTED — IDLE WASTE
                  </div>
                )}
                <button
                  className="btn btn-cyan btn-sm btn-full"
                  onClick={() => onSimulate(selectedId)}
                >
                  Simulate Fix in Digital Twin
                </button>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
