import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Terminal,
  Zap,
  Flame,
  Layers,
  Radio,
  Sliders,
  AlertTriangle,
  Play,
  Pause,
  RefreshCw,
  Cpu
} from 'lucide-react';
import { Explainable } from '../AIExplain/Explainable';

export function EngineeringDiagnosticView({ onNavigateToExecutive }: { onNavigateToExecutive?: () => void }) {
  const [isRunning, setIsRunning] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState('BOIL-PNG-01');
  const [flueTemp, setFlueTemp] = useState(168); // °C
  const [oxygenPct, setOxygenPct] = useState(3.4); // % O2 in flue gas
  const [ambientTemp, setAmbientTemp] = useState(30); // °C
  const [fuelType, setFuelType] = useState<'png' | 'hsd' | 'biomass'>('png');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Raw Modbus packet inspector simulation
  const [modbusPackets, setModbusPackets] = useState<Array<{
    timestamp: string;
    slaveId: number;
    funcCode: string;
    address: string;
    rawHex: string;
    decodedValue: string;
  }>>([]);

  // ─── Siegert Formula Stack Loss Calculation ─────────────────────────────────
  // Siegert Formula: Stack Loss % = K * (T_flue - T_ambient) / CO2%
  // CO2% calculated from O2%: CO2% = CO2_max * (1 - (O2% / 20.9))
  const siegertK = fuelType === 'png' ? 0.38 : fuelType === 'hsd' ? 0.49 : 0.63;
  const co2Max = fuelType === 'png' ? 11.8 : fuelType === 'hsd' ? 15.4 : 20.2;
  const calculatedCO2 = Math.max(1, +(co2Max * (1 - (oxygenPct / 20.9))).toFixed(2));
  const stackLossPct = Math.min(35, Math.max(4, +(siegertK * (flueTemp - ambientTemp) / calculatedCO2).toFixed(2)));
  const thermalEfficiency = +(100 - stackLossPct - 2.5).toFixed(2); // 2.5% radiation & unaccounted losses
  const lambdaExcessAir = +(20.9 / (20.9 - oxygenPct)).toFixed(2);

  // ─── Sub-second High-Frequency Waveform Animation ────────────────────────────
  useEffect(() => {
    let animId: number;
    let t = 0;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const midY = h / 2;

      // Dark industrial oscilloscope background
      ctx.fillStyle = '#0B0F17';
      ctx.fillRect(0, 0, w, h);

      // Grid lines
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      if (isRunning) {
        t += 0.08;
      }

      // Phase A: Voltage (Cyan)
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = midY + Math.sin(x * 0.04 + t) * (h * 0.32) + (Math.sin(x * 0.12 + t * 3) * 3); // 3rd harmonic
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Phase B: Voltage (Amber, shifted 120 deg)
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = midY + Math.sin(x * 0.04 + t + (2 * Math.PI / 3)) * (h * 0.32);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Phase C: Voltage (Emerald, shifted 240 deg)
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = midY + Math.sin(x * 0.04 + t + (4 * Math.PI / 3)) * (h * 0.32);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Inverted Current trace (Purple dashed)
      ctx.strokeStyle = '#A855F7';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const y = midY + Math.sin(x * 0.04 + t - 0.4) * (h * 0.22); // Power factor lag ~0.92
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [isRunning]);

  // Periodic Modbus packet stream simulation
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const timeStr = `${now.toTimeString().slice(0, 8)}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      const kwVal = +(42.5 + Math.random() * 4).toFixed(2);
      const hexKw = (Math.round(kwVal * 10)).toString(16).toUpperCase().padStart(4, '0');
      
      const newPacket = {
        timestamp: timeStr,
        slaveId: 1,
        funcCode: '0x03 (Read Holding Reg)',
        address: '0x7531 (30001)',
        rawHex: `01 03 04 ${hexKw} 13 88 7F 2B`,
        decodedValue: `${kwVal} kW | PF: 0.96`
      };

      setModbusPackets(prev => [newPacket, ...prev.slice(0, 7)]);
    }, 1800);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ background: '#0B0F17', minHeight: '100%', padding: '24px 32px 60px', color: '#F3F4F6' }}>
      {/* ─── Top Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(6, 182, 212, 0.12)', borderRadius: 20, color: '#06B6D4', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            <Terminal size={12} /> SCADA Sub-Second Engineering Cockpit
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            Engineering Diagnostics & Combustion Thermodynamics
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#9CA3AF' }}>
            High-frequency power quality oscillography, combustion Siegert stack loss curves, and raw Modbus RTU/TCP register stream inspector.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onNavigateToExecutive}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #374151',
              background: '#1F2937',
              color: '#E5E7EB',
              fontWeight: 600,
              fontSize: 12,
              cursor: 'pointer'
            }}
          >
            Switch to Executive Mode
          </button>
        </div>
      </div>

      {/* ─── Row 1: High-Frequency Power Quality Waveform ───────────────────────── */}
      <div style={{ background: '#111827', borderRadius: 14, border: '1px solid #1F2937', padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Activity size={18} color="#06B6D4" />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
              Sub-Second 3-Phase Power Quality Waveform (V & I Oscilloscope)
            </h3>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(6, 182, 212, 0.15)', color: '#06B6D4', fontFamily: 'monospace' }}>
              50.0 Hz • 415V RMS
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06B6D4' }} /> L1
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} /> L2
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} /> L3
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#A855F7' }} /> Current I (Lag)
            </span>

            <button
              type="button"
              onClick={() => setIsRunning(!isRunning)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid #374151',
                background: '#1F2937',
                color: '#E5E7EB',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              {isRunning ? <Pause size={12} /> : <Play size={12} />}
              {isRunning ? 'Freeze' : 'Resume'}
            </button>
          </div>
        </div>

        {/* Waveform Canvas */}
        <canvas
          ref={canvasRef}
          width={900}
          height={180}
          style={{
            width: '100%',
            height: 180,
            borderRadius: 8,
            border: '1px solid #1F2937',
            display: 'block'
          }}
        />

        {/* Electrical Health Readout Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginTop: 14, fontFamily: 'monospace', fontSize: 12 }}>
          <div style={{ background: '#1F2937', padding: '10px 14px', borderRadius: 8 }}>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>Active Power (P)</div>
            <div style={{ color: '#06B6D4', fontWeight: 700, fontSize: 16 }}>142.8 kW</div>
          </div>
          <div style={{ background: '#1F2937', padding: '10px 14px', borderRadius: 8 }}>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>Reactive Power (Q)</div>
            <div style={{ color: '#F59E0B', fontWeight: 700, fontSize: 16 }}>32.4 kVAR</div>
          </div>
          <div style={{ background: '#1F2937', padding: '10px 14px', borderRadius: 8 }}>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>Power Factor (cos φ)</div>
            <div style={{ color: '#10B981', fontWeight: 700, fontSize: 16 }}>0.975 LAG</div>
          </div>
          <div style={{ background: '#1F2937', padding: '10px 14px', borderRadius: 8 }}>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>THD Current (IEEE 519)</div>
            <div style={{ color: '#A855F7', fontWeight: 700, fontSize: 16 }}>3.2% (PASS)</div>
          </div>
          <div style={{ background: '#1F2937', padding: '10px 14px', borderRadius: 8 }}>
            <div style={{ color: '#9CA3AF', fontSize: 10 }}>Voltage Unbalance</div>
            <div style={{ color: '#E5E7EB', fontWeight: 700, fontSize: 16 }}>0.4% (&lt; 1.0%)</div>
          </div>
        </div>
      </div>

      {/* ─── Row 2: Siegert Combustion Curve + Raw Modbus Stream ──────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Combustion Siegert Calculator */}
        <div style={{ background: '#111827', borderRadius: 14, border: '1px solid #1F2937', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={18} color="#EA580C" />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Combustion Siegert Stack Loss & Efficiency
              </h3>
            </div>
            <span style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>
              EN 12952-15 / ASME PTC 4
            </span>
          </div>

          <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5, marginBottom: 16 }}>
            Real-time boiler/furnace stack loss analysis based on flue gas temperature, excess oxygen, and Siegert fuel factors.
          </p>

          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#D1D5DB' }}>Flue Gas Exit Temperature (T_flue):</span>
                <span style={{ color: '#F59E0B', fontWeight: 700, fontFamily: 'monospace' }}>{flueTemp} °C</span>
              </div>
              <input
                type="range"
                min="110"
                max="260"
                value={flueTemp}
                onChange={e => setFlueTemp(parseInt(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#D1D5DB' }}>Excess Oxygen in Flue (O₂ %):</span>
                <span style={{ color: '#06B6D4', fontWeight: 700, fontFamily: 'monospace' }}>{oxygenPct.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="8.0"
                step="0.1"
                value={oxygenPct}
                onChange={e => setOxygenPct(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>

          {/* Efficiency Output Box */}
          <div style={{ background: '#1F2937', borderRadius: 10, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Excess Air (λ)</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#06B6D4', fontFamily: 'monospace' }}>
                {lambdaExcessAir}
              </div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>Ratio</div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Stack Heat Loss</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: stackLossPct > 15 ? '#EF4444' : '#F59E0B', fontFamily: 'monospace' }}>
                {stackLossPct}%
              </div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>Siegert Formula</div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase' }}>Net Thermal Eff.</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#10B981', fontFamily: 'monospace' }}>
                {thermalEfficiency}%
              </div>
              <div style={{ fontSize: 10, color: '#6B7280' }}>ASME Indirect</div>
            </div>
          </div>
        </div>

        {/* Raw Modbus Register Packet Stream */}
        <div style={{ background: '#111827', borderRadius: 14, border: '1px solid #1F2937', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Radio size={18} color="#10B981" />
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#FFFFFF' }}>
                Raw Modbus RTU / TCP Packet Stream
              </h3>
            </div>
            <span style={{ fontSize: 11, color: '#10B981', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} /> 9600 Baud RS-485
            </span>
          </div>

          <p style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5, marginBottom: 14 }}>
            Live frame-by-frame telemetry capture from edge gateway edge daemon:
          </p>

          <div style={{ background: '#0B0F17', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 11, maxHeight: 260, overflowY: 'auto' }}>
            {modbusPackets.map((pkt, idx) => (
              <div key={idx} style={{ padding: '6px 8px', borderBottom: '1px solid #1F2937', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9CA3AF' }}>
                  <span style={{ color: '#6B7280' }}>[{pkt.timestamp}]</span>
                  <span style={{ color: '#06B6D4' }}>Slave 0x0{pkt.slaveId}</span>
                  <span style={{ color: '#FCD34D' }}>{pkt.address}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#E5E7EB' }}>HEX: {pkt.rawHex}</span>
                  <span style={{ color: '#10B981', fontWeight: 600 }}>&gt;&gt; {pkt.decodedValue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
