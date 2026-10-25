import React from 'react';
import { Html } from '@react-three/drei';
import {
  ShieldCheck,
  Cpu,
  Activity,
  FileCheck2,
  HardDrive,
  X,
  Radio,
  WifiOff,
} from 'lucide-react';

export interface SensorMetadata {
  sensor_id: string;
  tag: string;
  instrument_type: string;
  manufacturer: string;
  standard: string;
  monitored_asset: string;
  protocol: string;
  calibration_cert_id?: string;
  calibration_valid_until?: string;
  position_3d: [number, number, number];
  payload?: Record<string, any>;
  latest_hash?: string;
}

interface SensorHudPopupProps {
  sensor: SensorMetadata;
  isBuffering?: boolean;
  onClose: () => void;
  onOpenLedger?: () => void;
}

export default function SensorHudPopup({
  sensor,
  isBuffering = false,
  onClose,
  onOpenLedger,
}: SensorHudPopupProps) {
  const isGateway = sensor.sensor_id === 'GW-EDGE-01';

  return (
    <Html
      position={[sensor.position_3d[0], sensor.position_3d[1] + (isGateway ? 0.7 : 0.5), sensor.position_3d[2]]}
      center
      distanceFactor={11}
      style={{ pointerEvents: 'auto', userSelect: 'none' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(14px)',
          border: `1.5px solid ${isBuffering ? '#f59e0b' : '#0284c7'}`,
          boxShadow: isBuffering
            ? '0 0 24px rgba(245, 158, 11, 0.4)'
            : '0 8px 32px rgba(2, 132, 199, 0.35)',
          borderRadius: 10,
          padding: '12px 14px',
          width: 320,
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          color: '#f8fafc',
          fontSize: 11,
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            paddingBottom: 8,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isBuffering ? '#f59e0b' : '#10b981',
                boxShadow: `0 0 10px ${isBuffering ? '#f59e0b' : '#10b981'}`,
              }}
            />
            <span style={{ fontWeight: 800, color: '#38bdf8', letterSpacing: 0.5 }}>
              {sensor.sensor_id}
            </span>
            <span
              style={{
                fontSize: 9,
                padding: '1px 6px',
                borderRadius: 4,
                background: isBuffering ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: isBuffering ? '#fbbf24' : '#34d399',
                border: `1px solid ${isBuffering ? '#f59e0b44' : '#10b98144'}`,
                fontWeight: 700,
              }}
            >
              {isBuffering ? 'BUFFERING (OFFLINE)' : 'LIVE & SIGNED'}
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Tag & Instrument Description */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 12 }}>
            {sensor.tag}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 10 }}>
            {sensor.instrument_type} • {sensor.manufacturer}
          </div>
          <div style={{ color: '#38bdf8', fontSize: 9, marginTop: 2 }}>
            Standard: {sensor.standard}
          </div>
        </div>

        {/* Target Asset & Protocol */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            borderRadius: 6,
            padding: '6px 8px',
            marginBottom: 8,
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 10 }}>
            <span>Target:</span>
            <span style={{ fontWeight: 600, color: '#f1f5f9' }}>{sensor.monitored_asset}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: 10, marginTop: 2 }}>
            <span>Protocol:</span>
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>{sensor.protocol}</span>
          </div>
        </div>

        {/* Live Physical Variable Readings (If available) */}
        {sensor.payload && !isGateway && (
          <div
            style={{
              background: 'rgba(2, 132, 199, 0.1)',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              borderRadius: 6,
              padding: '6px 8px',
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: '#38bdf8', marginBottom: 4, textTransform: 'uppercase' }}>
              Shop-Floor Ingested Physical Variables
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 10 }}>
              {Object.entries(sensor.payload)
                .filter(([k]) => k !== 'modbus_holding_registers')
                .slice(0, 4)
                .map(([k, v]) => (
                  <div key={k} style={{ color: '#e2e8f0' }}>
                    <span style={{ color: '#94a3b8', fontSize: 9 }}>{k.split('_')[0].toUpperCase()}: </span>
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>{String(v)}</span>
                  </div>
                ))}
            </div>

            {/* Modbus Register Raw Dump */}
            {sensor.payload.modbus_holding_registers && (
              <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px dashed rgba(255,255,255,0.1)', fontSize: 9, color: '#64748b' }}>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Modbus Registers: </span>
                {Object.entries(sensor.payload.modbus_holding_registers).slice(0, 3).map(([r, val]) => (
                  <span key={r} style={{ marginRight: 6 }}>R{r}={String(val)}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edge Gateway Buffer HUD */}
        {isGateway && (
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: `1px solid ${isBuffering ? '#f59e0b' : '#0284c7'}`,
              borderRadius: 6,
              padding: '6px 8px',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>72-Hour Circular Buffer:</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: isBuffering ? '#fbbf24' : '#34d399' }}>
                {isBuffering ? 'ACTIVE (OFFLINE)' : 'READY (CLOUD SYNC)'}
              </span>
            </div>
            <div style={{ height: 4, background: '#334155', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: isBuffering ? '35%' : '0.1%', height: '100%', background: isBuffering ? '#f59e0b' : '#10b981' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 3 }}>
              <span>Capacity: 259,200 records</span>
              <span>Hardware TPM 2.0</span>
            </div>
          </div>
        )}

        {/* Provenance & Calibration Metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8, fontSize: 9, color: '#94a3b8' }}>
          {sensor.calibration_cert_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileCheck2 size={11} style={{ color: '#10b981' }} />
              <span>Cal Cert: <strong style={{ color: '#e2e8f0' }}>{sensor.calibration_cert_id}</strong> (Valid: {sensor.calibration_valid_until})</span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck size={11} style={{ color: '#38bdf8' }} />
            <span>Assurance: <strong style={{ color: '#38bdf8' }}>SEBI BRSR Core & EU CBAM Tier 3</strong></span>
          </div>
        </div>

        {/* SHA-256 Digest & Ledger Button */}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            onClick={() => onOpenLedger?.()}
            style={{
              flex: 1,
              background: '#0284c7',
              border: 'none',
              borderRadius: 5,
              padding: '6px 8px',
              color: '#ffffff',
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <ShieldCheck size={12} /> Inspect Audit Chain
          </button>
        </div>
      </div>
    </Html>
  );
}
