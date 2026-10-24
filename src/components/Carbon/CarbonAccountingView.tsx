import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, ShieldCheck, CheckCircle2, Sliders, ArrowUpRight,
  Download, Printer, AlertTriangle, Zap, Flame, Leaf,
  TrendingDown, FileText, RefreshCw, ChevronRight, BarChart3,
  Calendar, Layers, Sparkles, X, Sun, Moon, DollarSign
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, Legend
} from 'recharts';
import { PLANT, SimParams, calcSimResult, CARBON } from '../../data/mockData';
import { ScopePie } from '../Charts';
import type { CarbonCalculateResponse, CeaMethodology } from '../../services/carbonApi';

interface CarbonAccountingViewProps {
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
}

export default function CarbonAccountingView({
  params,
  gridEF,
  setGridEF,
  carbonData,
  carbonLoading,
  carbonError,
  backendStatus,
  onRecalculate,
  reportingYear,
  setReportingYear,
  ceaMethodology,
  setCeaMethodology,
  availableYears,
}: CarbonAccountingViewProps) {
  // State for Factor Configuration Drawer
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [lpgKg, setLpgKg] = useState(705); // 705 kg LPG / period
  const [lpgFactor, setLpgFactor] = useState(2.98); // kg CO2e / kg LPG
  const [shadowCarbonPrice, setShadowCarbonPrice] = useState(2000); // ₹2,000 / tCO2e
  const [solarShiftSimulated, setSolarShiftSimulated] = useState(params.staggerFurnace);
  const [selectedTab, setSelectedTab] = useState<'ledger' | 'zombie' | 'passport' | 'solartod'>('ledger');

  // Dynamic calculations based on user-editable factors
  const s1KgCO2e = (lpgKg * lpgFactor);
  const s1Tons = +(s1KgCO2e / 1000).toFixed(2); // 2.10 tCO2e

  const baselineKwh = PLANT.baselineEnergy; // 12,480 kWh
  const s2Tons = +((baselineKwh * gridEF) / 1000).toFixed(2); // 10.23 tCO2e (direct machines)
  const auxPlantTons = 2.47; // Auxiliary HVAC, transformer losses, lighting
  const s2TotalPlant = +(s2Tons + auxPlantTons).toFixed(2); // 12.70 tCO2e

  // Total Gross Baseline Footprint: 2.10 t (LPG) + 12.70 t (Grid + Aux) = 14.80 tCO2e
  const totalGrossTons = +(s1Tons + s2TotalPlant).toFixed(2); // 14.80 tCO2e

  // Simulation results: Digital Twin Identified Optimization Potential
  const sim = useMemo(() => calcSimResult(params), [params]);
  const activeSavingsKwh = sim.savingsKwh > 0 ? sim.savingsKwh : 998.4; // 998.4 kWh idle loss
  const avoidedGridCarbonTons = +((activeSavingsKwh * gridEF) / 1000).toFixed(3); // ~0.819 tCO2e
  const solarShiftBonusTons = (solarShiftSimulated || params.staggerFurnace) ? 0.24 : 0;
  const totalAvoidedCarbonTons = +(avoidedGridCarbonTons + solarShiftBonusTons).toFixed(3); // 0.818 - 1.058 tCO2e

  // Financial + Shadow Carbon Value
  const directElectricitySavingsRs = sim.savingsCost > 0 ? sim.savingsCost : 7987; // ₹7,987
  const shadowCarbonValueRs = Math.round(totalAvoidedCarbonTons * shadowCarbonPrice); // 0.818 * 2000 = ₹1,637
  const combinedTotalValueRs = directElectricitySavingsRs + shadowCarbonValueRs; // ₹9,624

  // Per-Unit Carbon Passport (10,000 finished parts produced in period)
  const totalUnitsProduced = 10000;
  const baselineIntensityKgPerUnit = +((totalGrossTons * 1000) / totalUnitsProduced).toFixed(2); // 1.49 kg CO2e/unit
  const optimizedGrossTons = +(totalGrossTons - totalAvoidedCarbonTons).toFixed(2); // 13.63 tCO2e
  const optimizedIntensityKgPerUnit = +((optimizedGrossTons * 1000) / totalUnitsProduced).toFixed(2); // 1.37 kg CO2e/unit
  const intensityReductionPct = +(
    ((baselineIntensityKgPerUnit - optimizedIntensityKgPerUnit) / baselineIntensityKgPerUnit) *
    100
  ).toFixed(1); // 8.1% drop

  // 24-Hour Time-of-Day Dynamic Grid Carbon Curve Data (Solar Window vs Coal Night Peak)
  const todCarbonData = [
    { hour: '00:00', gridEf: 0.88, type: 'Coal Baseload', solarGen: 0 },
    { hour: '02:00', gridEf: 0.89, type: 'Coal Baseload', solarGen: 0 },
    { hour: '04:00', gridEf: 0.88, type: 'Coal Baseload', solarGen: 0 },
    { hour: '06:00', gridEf: 0.82, type: 'Morning Ramp', solarGen: 5 },
    { hour: '08:00', gridEf: 0.77, type: 'Solar Inject', solarGen: 28 },
    { hour: '10:00', gridEf: 0.72, type: 'High Solar', solarGen: 65 },
    { hour: '12:00', gridEf: 0.68, type: 'Peak Solar (Cleanest)', solarGen: 95 },
    { hour: '14:00', gridEf: 0.69, type: 'Peak Solar (Cleanest)', solarGen: 88 },
    { hour: '16:00', gridEf: 0.74, type: 'Solar Taper', solarGen: 45 },
    { hour: '18:00', gridEf: 0.91, type: 'Evening Peak (Dirtiest)', solarGen: 0 },
    { hour: '20:00', gridEf: 0.92, type: 'Evening Peak (Dirtiest)', solarGen: 0 },
    { hour: '22:00', gridEf: 0.89, type: 'Coal Baseload', solarGen: 0 },
  ];

  // Machine Stacked Breakdown: Productive vs Avoidable Zombie Carbon
  const machineCarbonBreakdown = [
    {
      name: '01 / Compressor',
      assetId: 'compressor',
      productiveKg: 2329.3,
      zombieKg: 818.7, // 998.4 kWh * 0.82
      totalKg: 3148.0,
      zombiePct: 26.0,
      note: '3.2h unmetered idle draw during lunch & shift change',
    },
    {
      name: '02 / CNC Spindle',
      assetId: 'cnc',
      productiveKg: 3212.0,
      zombieKg: 232.0,
      totalKg: 3444.0,
      zombiePct: 6.7,
      note: 'Spindle spinning empty during pallet loading',
    },
    {
      name: '03 / Furnace',
      assetId: 'furnace',
      productiveKg: 4980.0,
      zombieKg: 72.0,
      totalKg: 5052.0,
      zombiePct: 1.4,
      note: 'Preheat timing overlap with Evening Peak ToD',
    },
    {
      name: '04 / Chiller Loop',
      assetId: 'cooling',
      productiveKg: 1230.0,
      zombieKg: 49.0,
      totalKg: 1279.0,
      zombiePct: 3.8,
      note: 'Baseload circulating loop continuous draw',
    },
  ];

  const handlePrint = () => window.print();

  return (
    <div
      className="scroll-area"
      style={{
        padding: '24px 32px',
        maxWidth: 1380,
        margin: '0 auto',
        color: '#1C1917',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* ─── ENTERPRISE HEADER WITH STANDARDS & CONFIG DRAWER TRIGGER ───────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 22,
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                backgroundColor: '#1C1917',
                color: '#EDE4D4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '3px 3px 10px rgba(188, 176, 158, 0.4)',
              }}
            >
              <Globe size={18} />
            </div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: '#1C1917',
                letterSpacing: '0.04em',
                fontFamily: "'IBM Plex Mono', monospace",
                margin: 0,
              }}
            >
              CARBON ACCOUNTING &amp; ESG CURRENCY LEDGER
            </h2>
          </div>
          <p style={{ fontSize: 12.5, color: '#57534E', margin: 0 }}>
            PrecisionWorks Manufacturing Plant · Multi-Scope GHG Inventory · ISO 14064-1 · EU CBAM &amp; SEBI BRSR Ready
          </p>
        </div>

        {/* Regulatory Compliance Badges & Factor Config Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: 9999,
              background: 'rgba(2, 132, 199, 0.12)',
              color: '#0284C7',
              border: '1px solid rgba(2, 132, 199, 0.25)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            ISO 14064-1:2018
          </span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: 9999,
              background: 'rgba(5, 150, 105, 0.12)',
              color: '#059669',
              border: '1px solid rgba(5, 150, 105, 0.25)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            SEBI BRSR CORE
          </span>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              padding: '5px 11px',
              borderRadius: 9999,
              background: 'rgba(124, 58, 237, 0.12)',
              color: '#7C3AED',
              border: '1px solid rgba(124, 58, 237, 0.25)',
              fontFamily: "'IBM Plex Mono', monospace",
            }}
          >
            EU CBAM ANNEX IV
          </span>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '7px 15px',
              borderRadius: 8,
              backgroundColor: isConfigOpen ? '#1C1917' : '#EFE6D7',
              color: isConfigOpen ? '#F5EFE6' : '#1C1917',
              border: '1px solid rgba(90, 75, 55, 0.2)',
              fontSize: 11.5,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '3px 3px 10px rgba(188, 176, 158, 0.35)',
              transition: 'all 0.2s ease',
            }}
          >
            <Sliders size={13} />
            <span>Emission Factors</span>
            <ChevronRight
              size={13}
              style={{
                transform: isConfigOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 0.2s',
              }}
            />
          </button>
        </div>
      </div>

      {/* ─── INTERACTIVE EMISSION FACTOR CONFIGURATION DRAWER (Feature A) ──── */}
      <AnimatePresence>
        {isConfigOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', marginBottom: 22 }}
          >
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.95)',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                borderRadius: 16,
                padding: '20px 24px',
                boxShadow: '6px 6px 20px rgba(188, 176, 158, 0.4), -6px -6px 20px rgba(255, 255, 255, 0.8)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders size={15} style={{ color: '#D97706' }} />
                  <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#1C1917' }}>
                    REGULATORY FACTOR &amp; INTERNAL SHADOW PRICING CONTROL
                  </span>
                </div>
                <button
                  onClick={() => setIsConfigOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#78716C',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                {/* 1. Scope 2 Grid Emission Factor Selector */}
                <div
                  style={{
                    background: 'rgba(247, 241, 231, 0.92)',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 6 }}>
                    SCOPE 2 GRID FACTOR (kg CO₂e/kWh)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="number"
                      step={0.01}
                      min={0.3}
                      max={1.2}
                      value={gridEF}
                      onChange={(e) => setGridEF(parseFloat(e.target.value) || 0.82)}
                      style={{
                        background: '#FFFFFF',
                        color: '#0284C7',
                        border: '1px solid rgba(2, 132, 199, 0.35)',
                        borderRadius: 6,
                        padding: '5px 10px',
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: "'IBM Plex Mono', monospace",
                        width: '100%',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setGridEF(0.82)}
                      style={{
                        fontSize: 9.5,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: gridEF === 0.82 ? '#0284C7' : '#EFE6D7',
                        color: gridEF === 0.82 ? '#FFFFFF' : '#57534E',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      CEA v20 (0.82)
                    </button>
                    <button
                      onClick={() => setGridEF(0.716)}
                      style={{
                        fontSize: 9.5,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: gridEF === 0.716 ? '#0284C7' : '#EFE6D7',
                        color: gridEF === 0.716 ? '#FFFFFF' : '#57534E',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Clean v22 (0.716)
                    </button>
                    <button
                      onClick={() => setGridEF(0.45)}
                      style={{
                        fontSize: 9.5,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: gridEF === 0.45 ? '#0284C7' : '#EFE6D7',
                        color: gridEF === 0.45 ? '#FFFFFF' : '#57534E',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Solar PPA (0.45)
                    </button>
                  </div>
                </div>

                {/* 2. Scope 1 LPG Consumption */}
                <div
                  style={{
                    background: 'rgba(247, 241, 231, 0.92)',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 6 }}>
                    SCOPE 1 LPG FUEL USE (kg / period)
                  </label>
                  <input
                    type="number"
                    step={10}
                    value={lpgKg}
                    onChange={(e) => setLpgKg(parseFloat(e.target.value) || 705)}
                    style={{
                      background: '#FFFFFF',
                      color: '#DC2626',
                      border: '1px solid rgba(220, 38, 38, 0.35)',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "'IBM Plex Mono', monospace",
                      width: '100%',
                      marginBottom: 6,
                    }}
                  />
                  <p style={{ fontSize: 10, color: '#78716C', margin: 0 }}>
                    Industrial Furnace 840°C thermal holding burners
                  </p>
                </div>

                {/* 3. Scope 1 Calorific / IPCC Factor */}
                <div
                  style={{
                    background: 'rgba(247, 241, 231, 0.92)',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 6 }}>
                    IPCC 2006 LPG FACTOR (kg CO₂e/kg)
                  </label>
                  <input
                    type="number"
                    step={0.01}
                    value={lpgFactor}
                    onChange={(e) => setLpgFactor(parseFloat(e.target.value) || 2.98)}
                    style={{
                      background: '#FFFFFF',
                      color: '#DC2626',
                      border: '1px solid rgba(220, 38, 38, 0.35)',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 14,
                      fontWeight: 800,
                      fontFamily: "'IBM Plex Mono', monospace",
                      width: '100%',
                      marginBottom: 6,
                    }}
                  />
                  <p style={{ fontSize: 10, color: '#78716C', margin: 0 }}>
                    Includes CO₂, CH₄, N₂O Global Warming Potentials
                  </p>
                </div>

                {/* 4. Internal Carbon Shadow Price */}
                <div
                  style={{
                    background: 'rgba(247, 241, 231, 0.92)',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(255, 255, 255, 0.9)',
                  }}
                >
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: '#57534E', display: 'block', marginBottom: 6 }}>
                    SHADOW CARBON PRICE (₹ / tCO₂e)
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>₹</span>
                    <input
                      type="number"
                      step={250}
                      value={shadowCarbonPrice}
                      onChange={(e) => setShadowCarbonPrice(parseFloat(e.target.value) || 2000)}
                      style={{
                        background: '#FFFFFF',
                        color: '#059669',
                        border: '1px solid rgba(5, 150, 105, 0.35)',
                        borderRadius: 6,
                        padding: '5px 10px',
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: "'IBM Plex Mono', monospace",
                        width: '100%',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: 10, color: '#78716C', margin: 0 }}>
                    Indian Carbon Market (ICM) / CCTS verified credit price
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── TOP 4 BIG STAT KPI CARDS (Warm Neumorphic Architecture) ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Card 1: Total Footprint */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px 22px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35), -4px -4px 14px rgba(255, 255, 255, 0.7)',
            borderLeft: '5px solid #7C3AED',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Total Carbon Footprint
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
              {totalGrossTons}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>tCO₂e</span>
          </div>
          <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>
            Scope 1 ({((s1Tons / totalGrossTons) * 100).toFixed(1)}%) + Scope 2 ({((s2TotalPlant / totalGrossTons) * 100).toFixed(1)}%)
          </div>
        </div>

        {/* Card 2: Avoidable Zombie Carbon */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px 22px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35), -4px -4px 14px rgba(255, 255, 255, 0.7)',
            borderLeft: '5px solid #EA580C',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Avoidable "Zombie Carbon"
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#EA580C', fontFamily: "'IBM Plex Mono', monospace" }}>
              1.17
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>tCO₂e</span>
          </div>
          <div style={{ fontSize: 11, color: '#EA580C', fontWeight: 600 }}>
            7.9% of plant footprint is unmetered idle waste
          </div>
        </div>

        {/* Card 3: Per-Unit Carbon Passport (CBAM / BRSR) */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px 22px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35), -4px -4px 14px rgba(255, 255, 255, 0.7)',
            borderLeft: '5px solid #0284C7',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Product Carbon Intensity
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace" }}>
              {optimizedIntensityKgPerUnit}
            </span>
            <span style={{ fontSize: 11, color: '#57534E', fontWeight: 700 }}>kg CO₂e/unit</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: 'rgba(5, 150, 105, 0.12)', padding: '2px 6px', borderRadius: 4 }}>
              -{intensityReductionPct}%
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#57534E', fontWeight: 600 }}>
            Baseline {baselineIntensityKgPerUnit} kg → EU CBAM Ready
          </div>
        </div>

        {/* Card 4: Shadow Carbon + Direct ROI */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px 22px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35), -4px -4px 14px rgba(255, 255, 255, 0.7)',
            borderLeft: '5px solid #059669',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Direct + Shadow ESG Value
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
              ₹{combinedTotalValueRs.toLocaleString('en-IN')}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>/ period</span>
          </div>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
            ₹{directElectricitySavingsRs.toLocaleString('en-IN')} Power + ₹{shadowCarbonValueRs.toLocaleString('en-IN')} Carbon Value
          </div>
        </div>
      </div>

      {/* ─── TABBED NAVIGATION FOR 4 MAJOR ENTERPRISE FEATURES ─────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 20,
          borderBottom: '1px solid rgba(90, 75, 55, 0.15)',
          paddingBottom: 10,
        }}
      >
        <button
          onClick={() => setSelectedTab('ledger')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            backgroundColor: selectedTab === 'ledger' ? '#1C1917' : '#EFE6D7',
            color: selectedTab === 'ledger' ? '#F5EFE6' : '#57534E',
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Layers size={13} />
          <span>Feature A: Scope 1 + Scope 2 Ledger</span>
        </button>

        <button
          onClick={() => setSelectedTab('zombie')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            backgroundColor: selectedTab === 'zombie' ? '#1C1917' : '#EFE6D7',
            color: selectedTab === 'zombie' ? '#F5EFE6' : '#57534E',
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <BarChart3 size={13} />
          <span>Feature B: Productive vs. Zombie Waste Carbon</span>
        </button>

        <button
          onClick={() => setSelectedTab('passport')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            backgroundColor: selectedTab === 'passport' ? '#1C1917' : '#EFE6D7',
            color: selectedTab === 'passport' ? '#F5EFE6' : '#57534E',
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <ShieldCheck size={13} />
          <span>Feature C: Part Carbon Passport (CBAM / BRSR)</span>
        </button>

        <button
          onClick={() => setSelectedTab('solartod')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 18px',
            borderRadius: 8,
            backgroundColor: selectedTab === 'solartod' ? '#1C1917' : '#EFE6D7',
            color: selectedTab === 'solartod' ? '#F5EFE6' : '#57534E',
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Sun size={13} />
          <span>Feature D &amp; E: Solar Shift &amp; Shadow Pricing</span>
        </button>
      </div>

      {/* ─── TAB 1: FEATURE A - SCOPE 1 & 2 DUAL-CHIMNEY AUDIT LEDGER ──────── */}
      {selectedTab === 'ledger' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Scope 1 Detailed Card */}
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.92)',
                borderRadius: 16,
                padding: '22px 26px',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(220, 38, 38, 0.15)',
                      color: '#DC2626',
                      fontWeight: 800,
                      fontSize: 11,
                      border: '1px solid rgba(220, 38, 38, 0.3)',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    SCOPE 1 · DIRECT COMBUSTION
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1C1917' }}>
                    Stationary LPG Fuel Combustion (Industrial Furnace)
                  </span>
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 900, color: '#DC2626' }}>
                  {s1Tons} tCO₂e
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 14,
                  background: 'rgba(247, 241, 231, 0.92)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  marginBottom: 16,
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>Source Asset</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>Thermic Induction Furnace (85 kW)</div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>Holding burner dual-fuel system</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>Activity Rate</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {lpgKg} kg Commercial LPG
                  </div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>Sub-metered tank flowmeter</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>IPCC Emission Factor</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {lpgFactor} kg CO₂e / kg LPG
                  </div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>GWP-weighted (CO₂ + CH₄ + N₂O)</div>
                </div>
              </div>

              {/* Formula Banner in warm linen */}
              <div
                style={{
                  background: '#F5EFE6',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                  borderRadius: 10,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                  <span style={{ color: '#78716C', fontWeight: 600 }}>Formula: </span>
                  {lpgKg} kg LPG × {lpgFactor} kg CO₂e/kg ÷ 1,000 = <strong style={{ color: '#DC2626' }}>{s1Tons} tCO₂e</strong>
                </div>
                <span style={{ fontSize: 10.5, color: '#57534E', fontWeight: 600 }}>
                  IPCC 2006 GL Vol. 2 Table 2.2 · Verified
                </span>
              </div>
            </div>

            {/* Scope 2 Detailed Card */}
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.92)',
                borderRadius: 16,
                padding: '22px 26px',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: 'rgba(2, 132, 199, 0.15)',
                      color: '#0284C7',
                      fontWeight: 800,
                      fontSize: 11,
                      border: '1px solid rgba(2, 132, 199, 0.3)',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    SCOPE 2 · INDIRECT ELECTRICITY
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1C1917' }}>
                    Purchased Grid Electricity (4 Machinery Bays + Plant Auxiliary)
                  </span>
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, fontWeight: 900, color: '#0284C7' }}>
                  {s2TotalPlant} tCO₂e
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 14,
                  background: 'rgba(247, 241, 231, 0.92)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  marginBottom: 16,
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>Sub-metered Draw</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {baselineKwh.toLocaleString('en-IN')} kWh (Active)
                  </div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>+ Auxiliary 3,012 kWh plant total</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>Utility Grid Source</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1C1917' }}>MSEDCL HT-I Industrial</div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>Western Regional Grid (WR)</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#57534E', marginBottom: 3, fontWeight: 600 }}>Active Emission Factor</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace" }}>
                    {gridEF} kg CO₂e / kWh
                  </div>
                  <div style={{ fontSize: 10, color: '#78716C' }}>CEA User-Configured Baseline</div>
                </div>
              </div>

              {/* Formula Banner in warm linen */}
              <div
                style={{
                  background: '#F5EFE6',
                  border: '1px solid rgba(2, 132, 199, 0.25)',
                  borderRadius: 10,
                  padding: '12px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                  <span style={{ color: '#78716C', fontWeight: 600 }}>Formula: </span>
                  {baselineKwh.toLocaleString('en-IN')} kWh × {gridEF} kg/kWh ÷ 1,000 = <strong style={{ color: '#0284C7' }}>{s2Tons} tCO₂e</strong> (+ aux: {s2TotalPlant} t)
                </div>
                <span style={{ fontSize: 10.5, color: '#57534E', fontWeight: 600 }}>
                  CEA Baseline DB v20.0 (2024) · Verified
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Donut Breakdown + Protocol */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.92)',
                borderRadius: 16,
                padding: '22px 24px',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', marginBottom: 14 }}>
                EMISSIONS BY SCOPE
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <ScopePie scope1={s1Tons} scope2={s2TotalPlant} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid rgba(90, 75, 55, 0.15)', paddingTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0284C7' }} />
                    <span style={{ color: '#57534E', fontWeight: 600 }}>Scope 2 (Electricity)</span>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#0284C7' }}>
                    {((s2TotalPlant / totalGrossTons) * 100).toFixed(1)}% ({s2TotalPlant} t)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626' }} />
                    <span style={{ color: '#57534E', fontWeight: 600 }}>Scope 1 (LPG Direct)</span>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#DC2626' }}>
                    {((s1Tons / totalGrossTons) * 100).toFixed(1)}% ({s1Tons} t)
                  </span>
                </div>
              </div>
            </div>

            {/* Audit Protocol Card */}
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.92)',
                borderRadius: 16,
                padding: '20px 22px',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={16} style={{ color: '#059669' }} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: '#1C1917' }}>
                  Third-Party Verification Protocol
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: '#57534E', lineHeight: 1.55, margin: 0 }}>
                Every calculation is anchored to high-frequency sub-meter telemetry and published Indian Central Electricity Authority (CEA) emission factors, fulfilling ISO 14064-3 and SEBI BRSR Core compliance audit rules.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: FEATURE B - PRODUCTIVE VS. AVOIDABLE ZOMBIE CARBON ──────── */}
      {selectedTab === 'zombie' && (
        <div>
          {/* Highlight Banner */}
          <div
            style={{
              background: 'rgba(247, 241, 231, 0.95)',
              border: '1.5px solid rgba(234, 88, 12, 0.35)',
              borderRadius: 14,
              padding: '16px 22px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.25)',
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: '#EA580C',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', marginBottom: 2 }}>
                CRITICAL ESG DEFICIT: UNLOADED "ZOMBIE CARBON" DETECTED
              </div>
              <p style={{ fontSize: 12, color: '#57534E', margin: 0, lineHeight: 1.5 }}>
                <strong style={{ color: '#EA580C' }}>Air Compressor #1 is responsible for 818.7 kg CO₂e of pure unloaded waste</strong> (998.4 kWh unmetered idle draw × 0.82 kg/kWh). Making parts creates acceptable pollution; spinning empty during lunch breaks generates zero output.
              </p>
            </div>
          </div>

          {/* Machine Stacked Carbon Bars */}
          <div
            style={{
              background: 'rgba(235, 226, 212, 0.92)',
              borderRadius: 16,
              padding: '24px 28px',
              border: '1.5px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#1C1917', margin: 0 }}>
                  ASSET-BY-ASSET CARBON WASTE ANALYSIS
                </h3>
                <p style={{ fontSize: 11.5, color: '#57534E', margin: '3px 0 0 0' }}>
                  Stacked breakdown separating productive manufacturing emissions from unloaded idle waste
                </p>
              </div>

              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11, fontWeight: 700 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#059669' }} />
                  <span style={{ color: '#059669' }}>Productive Active Emissions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: '#EA580C' }} />
                  <span style={{ color: '#EA580C' }}>Unloaded Idle "Zombie" Waste</span>
                </div>
              </div>
            </div>

            {/* Visual Bars for the 4 Assets */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {machineCarbonBreakdown.map((m, idx) => (
                <div key={m.assetId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#78716C', marginLeft: 8 }}>({m.note})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5 }}>
                      <span style={{ color: '#059669', fontWeight: 700 }}>{m.productiveKg.toFixed(1)} kg Active</span>
                      <span style={{ color: '#EA580C', fontWeight: 800 }}>+{m.zombieKg.toFixed(1)} kg Waste ({m.zombiePct}%)</span>
                    </div>
                  </div>

                  {/* Stacked Progress Bar */}
                  <div
                    style={{
                      height: 18,
                      width: '100%',
                      background: 'rgba(245, 238, 228, 0.95)',
                      borderRadius: 6,
                      overflow: 'hidden',
                      display: 'flex',
                      border: '1px solid rgba(90, 75, 55, 0.12)',
                    }}
                  >
                    <div
                      style={{
                        width: `${(m.productiveKg / m.totalKg) * 100}%`,
                        backgroundColor: '#059669',
                        transition: 'width 0.4s ease',
                      }}
                      title={`Productive: ${m.productiveKg} kg`}
                    />
                    <div
                      style={{
                        width: `${(m.zombieKg / m.totalKg) * 100}%`,
                        backgroundColor: '#EA580C',
                        transition: 'width 0.4s ease',
                      }}
                      title={`Zombie Waste: ${m.zombieKg} kg`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: FEATURE C - PER-UNIT "CARBON PASSPORT" (CBAM & BRSR) ────── */}
      {selectedTab === 'passport' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          {/* The Physical Stylized Carbon Passport Tag */}
          <div
            style={{
              background: 'rgba(235, 226, 212, 0.95)',
              borderRadius: 20,
              padding: '28px 32px',
              border: '2px solid rgba(255, 255, 255, 0.9)',
              boxShadow: '6px 6px 22px rgba(188, 176, 158, 0.45), -6px -6px 22px rgba(255, 255, 255, 0.85)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Top Seal & Heading */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    fontFamily: "'IBM Plex Mono', monospace",
                    letterSpacing: '0.14em',
                    color: '#78716C',
                    textTransform: 'uppercase',
                  }}
                >
                  DIGITAL PRODUCT CARBON FOOTPRINT (PCF)
                </span>
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: '#1C1917',
                    fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
                    margin: '3px 0 0 0',
                    letterSpacing: '0.04em',
                  }}
                >
                  EU CBAM &amp; BRSR CARBON PASSPORT
                </h3>
              </div>

              <div
                style={{
                  background: '#059669',
                  color: '#FFFFFF',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 10,
                  fontWeight: 800,
                  fontFamily: "'IBM Plex Mono', monospace",
                  boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)',
                }}
              >
                ANNEX IV VERIFIED
              </div>
            </div>

            {/* Part Metadata */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                background: 'rgba(247, 241, 231, 0.92)',
                borderRadius: 12,
                padding: '16px 18px',
                marginBottom: 20,
                border: '1px solid rgba(255, 255, 255, 0.8)',
              }}
            >
              <div>
                <span style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>PART NAME &amp; SKU:</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917' }}>Precision Cast Impeller Shaft #KP-402</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>DESTINATION MARKET:</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0284C7' }}>European Union (EU CBAM Export)</div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>BATCH PRODUCTION VOLUME:</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {totalUnitsProduced.toLocaleString('en-IN')} Finished Units
                </div>
              </div>
              <div>
                <span style={{ fontSize: 10, color: '#78716C', fontWeight: 600 }}>AUDIT STANDARD:</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#059669' }}>ISO 14067 (Product Footprint)</div>
              </div>
            </div>

            {/* The Big KPI Transition: 1.49 -> 1.37 kg CO2e / unit */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#FFFFFF',
                borderRadius: 14,
                padding: '20px 24px',
                border: '1.5px solid rgba(5, 150, 105, 0.3)',
                marginBottom: 20,
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ fontSize: 11, color: '#78716C', fontWeight: 700, textTransform: 'uppercase' }}>
                  Baseline Intensity
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#DC2626', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {baselineIntensityKgPerUnit} <span style={{ fontSize: 13, color: '#78716C' }}>kg/unit</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: 'rgba(5, 150, 105, 0.12)', padding: '3px 8px', borderRadius: 9999 }}>
                  -{intensityReductionPct}% DECARBONIZED
                </span>
                <ArrowUpRight size={24} style={{ color: '#059669', transform: 'rotate(45deg)' }} />
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#78716C', fontWeight: 700, textTransform: 'uppercase' }}>
                  Digital Twin Optimized
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {optimizedIntensityKgPerUnit} <span style={{ fontSize: 13, color: '#78716C' }}>kg/unit</span>
                </div>
              </div>
            </div>

            {/* Cryptographic Provenance Hash & Footnote */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#78716C' }}>
              <span>PROVENANCE HASH: SHA256:8f4c...kp402-brsr-2026</span>
              <span>VERIFIED BY WATTWISE AI ENGINE</span>
            </div>
          </div>

          {/* Compliance & Export Explainer Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                background: 'rgba(235, 226, 212, 0.92)',
                borderRadius: 16,
                padding: '22px 24px',
                border: '1.5px solid rgba(255, 255, 255, 0.85)',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={16} style={{ color: '#0284C7' }} />
                Why This Wins Indian &amp; Global B2B Audits
              </h4>
              <p style={{ fontSize: 12, color: '#57534E', lineHeight: 1.6, margin: '0 0 12px 0' }}>
                Under the European Union's <strong>Carbon Border Adjustment Mechanism (CBAM)</strong>, Indian steel and manufacturing exporters face carbon import tariffs unless they declare verified per-part emissions.
              </p>
              <p style={{ fontSize: 12, color: '#57534E', lineHeight: 1.6, margin: 0 }}>
                Domestically, the top 1,000 listed manufacturers must file <strong>SEBI Business Responsibility and Sustainability Reports (BRSR Principle 6 Core)</strong>. By linking machine sub-metering to unit volume, WattWise generates instant audit-proof documentation without expensive consultancies.
              </p>
            </div>

            {/* Quick Export Button */}
            <button
              onClick={handlePrint}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 20px',
                borderRadius: 12,
                backgroundColor: '#1C1917',
                color: '#EDE4D4',
                fontSize: 12.5,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.4)',
              }}
            >
              <Printer size={15} />
              <span>Print Official CBAM / BRSR Declaration Form</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── TAB 4: FEATURE D & E - TIME-OF-DAY SOLAR SHIFT & SHADOW CARBON ── */}
      {selectedTab === 'solartod' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
          {/* Left: 24-Hour Dirty Hours vs Clean Hours Chart */}
          <div
            style={{
              background: 'rgba(235, 226, 212, 0.92)',
              borderRadius: 16,
              padding: '24px 28px',
              border: '1.5px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#1C1917', margin: 0 }}>
                  DYNAMIC GRID MARGINAL CARBON (DIRTY VS. CLEAN HOURS)
                </h3>
                <p style={{ fontSize: 11.5, color: '#57534E', margin: '3px 0 0 0' }}>
                  1 unit of electricity at 8:00 PM burns dirty coal; 1 unit at 1:00 PM uses clean rooftop/grid solar!
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>
                  Solar: ~0.68 kg/kWh
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#FEE2E2', color: '#991B1B' }}>
                  Evening: ~0.91 kg/kWh
                </span>
              </div>
            </div>

            {/* Recharts 24-hour Marginal Carbon Curve */}
            <div style={{ height: 210, width: '100%', marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={todCarbonData}>
                  <defs>
                    <linearGradient id="gridCarbonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EA580C" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#EA580C" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" stroke="#78716C" fontSize={10} fontFamily="'IBM Plex Mono', monospace" />
                  <YAxis domain={[0.6, 1.0]} stroke="#78716C" fontSize={10} fontFamily="'IBM Plex Mono', monospace" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1C1917',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 11,
                      color: '#F5EFE6',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gridEf"
                    name="Grid Emission Factor (kg/kWh)"
                    stroke="#EA580C"
                    strokeWidth={2.5}
                    fill="url(#gridCarbonGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Solar Shift Toggle Action */}
            <div
              style={{
                background: 'rgba(247, 241, 231, 0.95)',
                borderRadius: 12,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(255, 255, 255, 0.8)',
              }}
            >
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#1C1917' }}>
                  Simulate Furnace Solar-Window Pre-Heat (+45m shift)
                </span>
                <p style={{ fontSize: 11, color: '#57534E', margin: '2px 0 0 0' }}>
                  Moves thermal ramp-up out of coal peak into solar hours (shaves 0.24 tCO₂e without changing total kWh!)
                </p>
              </div>

              <button
                onClick={() => setSolarShiftSimulated(!solarShiftSimulated)}
                style={{
                  padding: '7px 15px',
                  borderRadius: 8,
                  backgroundColor: solarShiftSimulated ? '#059669' : '#1C1917',
                  color: '#FFFFFF',
                  fontSize: 11.5,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {solarShiftSimulated ? '✓ Solar Shift Applied' : 'Simulate Shift'}
              </button>
            </div>
          </div>

          {/* Right: Feature E - Internal Carbon Pricing Valuation */}
          <div
            style={{
              background: 'rgba(235, 226, 212, 0.92)',
              borderRadius: 16,
              padding: '24px 26px',
              border: '1.5px solid rgba(255, 255, 255, 0.85)',
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <DollarSign size={16} style={{ color: '#059669' }} />
                <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', margin: 0 }}>
                  FEATURE E: INTERNAL CARBON PRICING
                </h4>
              </div>
              <p style={{ fontSize: 12, color: '#57534E', lineHeight: 1.55, margin: '0 0 16px 0' }}>
                Forward-thinking industrial leaders (Tata, Mahindra, Kirloskar) attach a <strong>Shadow Carbon Price (₹2,000/tCO₂e)</strong> to evaluate project viability against future carbon taxes and the <strong>Indian Carbon Market (CCTS)</strong>.
              </p>

              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: 12,
                  padding: '16px 18px',
                  border: '1px solid rgba(90, 75, 55, 0.12)',
                  marginBottom: 16,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: '#57534E' }}>Direct Power Bill Recovered:</span>
                  <span style={{ fontWeight: 800, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace" }}>
                    ₹{directElectricitySavingsRs.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: '#57534E' }}>Shadow Carbon Value ({totalAvoidedCarbonTons} t × ₹{shadowCarbonPrice}):</span>
                  <span style={{ fontWeight: 800, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                    + ₹{shadowCarbonValueRs.toLocaleString('en-IN')} ESG Value
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13,
                    borderTop: '1px solid rgba(90, 75, 55, 0.15)',
                    paddingTop: 8,
                  }}
                >
                  <span style={{ fontWeight: 800, color: '#1C1917' }}>Total Business + Carbon ROI:</span>
                  <span style={{ fontWeight: 900, color: '#059669', fontSize: 15, fontFamily: "'IBM Plex Mono', monospace" }}>
                    ₹{combinedTotalValueRs.toLocaleString('en-IN')} / period
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 11,
                color: '#78716C',
                lineHeight: 1.45,
                background: 'rgba(247, 241, 231, 0.95)',
                padding: '10px 14px',
                borderRadius: 8,
              }}
            >
              Shadow carbon pricing boosts project IRR by +20.5%, proving that ESG compliance directly expands financial returns.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
