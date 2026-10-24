import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Zap,
  Droplets,
  Layers,
  ArrowRight,
  Database,
  Info,
  ShieldAlert,
  Server
} from 'lucide-react';
import rawMachineData from '../../data/machineLibrary.json';
import { Explainable } from '../AIExplain/Explainable';

export interface MachineAsset {
  id: string;
  name: string;
  cell: string;
  cellId: string;
  energyVector: string;
  ratedPowerKw: number;
  nominalLoadKw: number;
  standbyDrawKw: number;
  secMetric: string;
  fuelType: string | null;
  modbusRegisters: Record<string, number>;
  safetyConstraints: string;
  status: 'OPTIMAL' | 'WARNING' | 'IDLE' | 'CRITICAL';
  description: string;
}

const MACHINE_DATA = rawMachineData as MachineAsset[];

const CELL_CATEGORIES = [
  { id: 'all', label: 'All Utility Cells', count: 50 },
  { id: 'utility_1', label: 'Compressed Air & Gas', count: 8 },
  { id: 'utility_2', label: 'Thermal & Steam', count: 10 },
  { id: 'utility_3', label: 'Power & Cogeneration', count: 6 },
  { id: 'utility_4', label: 'Machining & Forming', count: 10 },
  { id: 'utility_5', label: 'Cooling & HVAC', count: 8 },
  { id: 'utility_6', label: 'Chemical, Paint & ETP', count: 8 },
];

const ENERGY_VECTORS = ['All', 'Electricity', 'Diesel (HSD)', 'Natural Gas (PNG)', 'LPG', 'Furnace Oil (HFO)', 'Biomass', 'Steam', 'Solar PV'];

export function AssetLibraryConfigurator({ onSelectAsset }: { onSelectAsset?: (id: string) => void }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCell, setSelectedCell] = useState('all');
  const [selectedVector, setSelectedVector] = useState('All');
  const [selectedMachine, setSelectedMachine] = useState<MachineAsset | null>(MACHINE_DATA[0]);
  const [activeMachines, setActiveMachines] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    MACHINE_DATA.forEach(m => { map[m.id] = true; });
    return map;
  });

  const toggleMachine = (id: string) => {
    setActiveMachines(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredMachines = useMemo(() => {
    return MACHINE_DATA.filter(m => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.cell.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCell = selectedCell === 'all' || m.cellId === selectedCell;
      const matchesVector = selectedVector === 'All' || m.energyVector.toLowerCase().includes(selectedVector.toLowerCase().split(' ')[0]);
      return matchesSearch && matchesCell && matchesVector;
    });
  }, [searchTerm, selectedCell, selectedVector]);

  const totalConfigured = Object.values(activeMachines).filter(Boolean).length;
  const totalRatedKw = MACHINE_DATA
    .filter(m => activeMachines[m.id])
    .reduce((acc, m) => acc + m.ratedPowerKw, 0);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPTIMAL': return '#10B981';
      case 'WARNING': return '#F59E0B';
      case 'CRITICAL': return '#EF4444';
      default: return '#6B7280';
    }
  };

  return (
    <div style={{ background: '#F8F9FA', minHeight: '100%', padding: '24px 32px 48px', color: '#1E252D' }}>
      {/* ─── Header ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(37, 99, 235, 0.08)', borderRadius: 20, color: '#2563EB', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            <Database size={12} /> Industrial Shop-Floor Catalog (50 Assets)
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#111827', letterSpacing: '-0.02em' }}>
            50-Asset Machine Library & Configurator
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>
            Comprehensive digital twin catalog covering 6 core utility cells with direct Modbus RTU/TCP register mapping and safety interlocks.
          </p>
        </div>

        {/* Global Shop-Floor Summary */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 18px', textAlign: 'right', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>Active Fleet</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }}>
              {totalConfigured} <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>/ 50</span>
            </div>
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 18px', textAlign: 'right', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase' }}>Rated Fleet Power</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#10B981' }}>
              {totalRatedKw.toLocaleString(undefined, { maximumFractionDigits: 1 })} <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 500 }}>kW</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Search & Filters Bar ──────────────────────────────────────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: 14, padding: '16px 20px', border: '1px solid #E5E7EB', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input
            type="text"
            placeholder="Search by ID, machine name, cell or register..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              fontSize: 13,
              outline: 'none',
              background: '#F9FAFB'
            }}
          />
        </div>

        {/* Cell Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          {CELL_CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCell(c.id)}
              style={{
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                background: selectedCell === c.id ? '#2563EB' : '#F3F4F6',
                color: selectedCell === c.id ? '#FFFFFF' : '#4B5563'
              }}
            >
              {c.label} ({c.id === 'all' ? 50 : c.count})
            </button>
          ))}
        </div>
      </div>

      {/* ─── Vector Pill Filter ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, overflowX: 'auto' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Filter size={12} /> Energy Vector:
        </span>
        {ENERGY_VECTORS.map(v => (
          <button
            key={v}
            onClick={() => setSelectedVector(v)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              border: selectedVector === v ? '1px solid #2563EB' : '1px solid #E5E7EB',
              background: selectedVector === v ? 'rgba(37, 99, 235, 0.08)' : '#FFFFFF',
              color: selectedVector === v ? '#2563EB' : '#4B5563'
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {/* ─── Main Content Grid: Catalog (Left) + Detail Drawer (Right) ──────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedMachine ? '1fr 380px' : '1fr', gap: 20 }}>
        {/* Machine Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filteredMachines.map(m => {
            const isActive = activeMachines[m.id];
            const isSelected = selectedMachine?.id === m.id;
            return (
              <Explainable
                key={m.id}
                title={`${m.name} (${m.id})`}
                explanationType="machine"
                metric={`${m.nominalLoadKw} kW (${m.secMetric})`}
                context={{
                  cell: m.cell,
                  energyVector: m.energyVector,
                  ratedPowerKw: m.ratedPowerKw,
                  standbyDrawKw: m.standbyDrawKw,
                  safetyConstraints: m.safetyConstraints,
                  modbusRegisters: m.modbusRegisters,
                  status: m.status
                }}
              >
                <div
                  onClick={() => setSelectedMachine(m)}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 12,
                    border: isSelected ? '2px solid #2563EB' : '1px solid #E5E7EB',
                    padding: 16,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.12)' : '0 1px 3px rgba(0,0,0,0.03)',
                    opacity: isActive ? 1 : 0.6
                  }}
                >
                  {/* Top: Cell & Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {m.id}
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 10,
                        fontWeight: 700,
                        color: getStatusColor(m.status),
                        background: `${getStatusColor(m.status)}18`
                      }}
                    >
                      {m.status}
                    </span>
                  </div>

                  {/* Title */}
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4, lineHeight: 1.3 }}>
                    {m.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 12 }}>
                    {m.cell}
                  </div>

                  {/* Metrics Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#F9FAFB', padding: '8px 10px', borderRadius: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>Nominal Load</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E252D' }}>{m.nominalLoadKw} kW</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600 }}>SEC Metric</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>{m.secMetric}</div>
                    </div>
                  </div>

                  {/* Energy Vector & Active Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4B5563', fontWeight: 500 }}>
                      {m.energyVector.includes('Gas') || m.energyVector.includes('LPG') || m.energyVector.includes('Oil') ? (
                        <Flame size={12} color="#EF4444" />
                      ) : (
                        <Zap size={12} color="#3B82F6" />
                      )}
                      {m.energyVector}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMachine(m.id);
                      }}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        border: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: isActive ? '#DCFCE7' : '#F3F4F6',
                        color: isActive ? '#15803D' : '#9CA3AF'
                      }}
                    >
                      {isActive ? 'Active in Model' : 'Excluded'}
                    </button>
                  </div>
                </div>
              </Explainable>
            );
          })}
        </div>

        {/* ─── Detail Drawer (Modbus Registers & Specs) ────────────────────────── */}
        {selectedMachine && (
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 20, position: 'sticky', top: 20, height: 'fit-content', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', background: 'rgba(37,99,235,0.08)', padding: '2px 8px', borderRadius: 4 }}>
                  {selectedMachine.id}
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '8px 0 2px', color: '#111827' }}>
                  {selectedMachine.name}
                </h3>
                <div style={{ fontSize: 12, color: '#6B7280' }}>{selectedMachine.cell}</div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5, marginBottom: 16 }}>
              {selectedMachine.description}
            </p>

            {/* Technical Specifications */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Server size={13} color="#2563EB" /> Machine Specifications
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div style={{ background: '#F9FAFB', padding: 8, borderRadius: 6 }}>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>Rated Capacity</div>
                  <div style={{ fontWeight: 700 }}>{selectedMachine.ratedPowerKw} kW</div>
                </div>
                <div style={{ background: '#F9FAFB', padding: 8, borderRadius: 6 }}>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>Standby Unloaded Draw</div>
                  <div style={{ fontWeight: 700, color: '#D97706' }}>{selectedMachine.standbyDrawKw} kW</div>
                </div>
                <div style={{ background: '#F9FAFB', padding: 8, borderRadius: 6 }}>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>Energy Vector</div>
                  <div style={{ fontWeight: 700 }}>{selectedMachine.energyVector}</div>
                </div>
                <div style={{ background: '#F9FAFB', padding: 8, borderRadius: 6 }}>
                  <div style={{ color: '#9CA3AF', fontSize: 10 }}>Specific Metric</div>
                  <div style={{ fontWeight: 700, color: '#059669' }}>{selectedMachine.secMetric}</div>
                </div>
              </div>
            </div>

            {/* Modbus RTU / TCP Registers Mapping */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Layers size={13} color="#10B981" /> Industrial Modbus Telemetry Mapping
              </div>
              <div style={{ background: '#111827', borderRadius: 8, padding: 12, color: '#F3F4F6', fontFamily: 'monospace', fontSize: 11 }}>
                {Object.entries(selectedMachine.modbusRegisters).map(([regName, regAddr]) => (
                  <div key={regName} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #1F2937' }}>
                    <span style={{ color: '#9CA3AF' }}>{regName}</span>
                    <span style={{ color: '#38BDF8', fontWeight: 600 }}>0x{Number(regAddr).toString(16).toUpperCase()} ({regAddr})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Safety & Physical Constraints */}
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <ShieldAlert size={13} /> Safety & Operating Constraints
              </div>
              <div style={{ fontSize: 11, color: '#78350F' }}>
                {selectedMachine.safetyConstraints}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => onSelectAsset?.(selectedMachine.id)}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  fontSize: 12,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                Inspect in 3D Factory Twin <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
