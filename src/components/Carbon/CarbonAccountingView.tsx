import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf, Flame, Zap, BarChart3, TrendingDown, RefreshCw,
  ChevronDown, ChevronRight, Info, AlertTriangle, CheckCircle2,
  Database, ArrowRight, Sliders, Download, Activity, ShieldCheck,
  FileText, Check, Layers, Award, Coins
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis,
  CartesianGrid, Tooltip, AreaChart, Area, LineChart, Line, Legend
} from 'recharts';
import { PLANT, type SimParams, calcSimResult } from '../../data/mockData';
import type { CarbonCalculateResponse, CeaMethodology } from '../../services/carbonApi';
import { CarbonCreditsEngine } from './CarbonCreditsEngine';
import { CarbonComplianceFilingPortal } from './CarbonComplianceFilingPortal';
import { CarbonTraceabilityDrawer } from './CarbonTraceabilityDrawer';
import { EvidenceVaultView } from './EvidenceVaultView';

export interface CarbonAccountingViewProps {
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

const METHODOLOGY_LABELS: Record<CeaMethodology, string> = {
  weighted_avg_with_res: 'Weighted Average (with Renewables)',
  weighted_avg_thermal: 'Weighted Average (Thermal Only)',
  operating_margin: 'Operating Margin (OM)',
  build_margin: 'Build Margin (BM)',
  combined_margin: 'Combined Margin (CM)',
};

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
  // Sub-tab navigation state
  const [activeTab, setActiveTab] = useState<'accounting' | 'credits' | 'filing' | 'evidence'>('accounting');
  const [traceabilityMetric, setTraceabilityMetric] = useState<string | null>(null);

  // Collapsible accordion states
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isDataQualityOpen, setIsDataQualityOpen] = useState(false);

  // Extract API data
  const metadata = carbonData?.calculation_metadata;
  const period = carbonData?.period;
  const gross = carbonData?.gross_footprint;
  const s1 = gross?.scope1;
  const s2 = gross?.scope2;
  const avoided = carbonData?.avoided_emissions;
  const scenario = carbonData?.scenario_comparison;

  // Digital twin simulation calculation for verification & fallback
  const sim = useMemo(() => calcSimResult(params, gridEF), [params, gridEF]);
  const fallbackPeriodDays = period?.duration_days ?? 30;

  // Primary Metrics
  const totalGrossTons = gross?.total_gross_co2e_t ?? +(5.364 + (PLANT.baselineEnergy * gridEF) / 1000).toFixed(3);
  const scope1Tons = s1?.emissions_total_co2e_t ?? 5.364;
  const scope2Tons = s2?.emissions_total_co2e_t ?? +((PLANT.baselineEnergy * gridEF) / 1000).toFixed(3);

  const s1Percent = totalGrossTons > 0 ? +((scope1Tons / totalGrossTons) * 100).toFixed(1) : 0;
  const s2Percent = totalGrossTons > 0 ? +((scope2Tons / totalGrossTons) * 100).toFixed(1) : 0;

  // Avoided carbon & energy savings
  const netReductionTons = scenario?.net_reduction_t_co2e
    ?? avoided?.avoided_co2e_t
    ?? (sim.savingsKwh > 0 ? +((sim.savingsKwh * gridEF) / 1000).toFixed(3) : 0);

  const energySavingsKwh = scenario?.electricity_savings_kwh
    ?? avoided?.savings_kwh
    ?? sim.savingsKwh;

  const reductionPct = scenario?.reduction_percentage
    ?? (totalGrossTons > 0 && netReductionTons > 0 ? +((netReductionTons / totalGrossTons) * 100).toFixed(1) : 0);

  const isScenarioActive = netReductionTons > 0 || sim.savingsKwh > 0;

  // Donut chart data
  const donutData = useMemo(() => [
    { name: 'Scope 2 (Electricity)', value: +scope2Tons.toFixed(3), color: '#0284C7' },
    { name: 'Scope 1 (Direct Fuel)', value: +scope1Tons.toFixed(3), color: '#DC2626' },
  ], [scope2Tons, scope1Tons]);

  // 30-Day Trend Data derived from period and totals
  const trendData = useMemo(() => {
    const days = Math.round(fallbackPeriodDays);
    const avgS1Daily = scope1Tons / days;
    const avgS2Daily = scope2Tons / days;
    const curve = [
      0.96, 1.02, 1.04, 0.98, 1.01, 0.72, 0.65,
      1.03, 1.05, 0.99, 1.02, 1.01, 0.75, 0.68,
      1.01, 1.04, 1.02, 0.99, 1.03, 0.74, 0.66,
      1.02, 1.01, 1.03, 0.98, 1.02, 0.76, 0.70,
      1.01, 1.02
    ];
    return Array.from({ length: Math.min(days, 30) }, (_, i) => {
      const mult = curve[i % curve.length];
      const dS1 = +(avgS1Daily * mult).toFixed(3);
      const dS2 = +(avgS2Daily * mult).toFixed(3);
      const dTotal = +(dS1 + dS2).toFixed(3);
      return {
        day: `D${i + 1}`,
        fullDay: `Day ${i + 1}`,
        scope1: dS1,
        scope2: dS2,
        total: dTotal,
      };
    });
  }, [fallbackPeriodDays, scope1Tons, scope2Tons]);

  // Plain-text Export Report Handler
  const handleExportReport = useCallback(() => {
    const reportText = [
      `================================================================================`,
      `                    WATTWISE AI — CARBON EMISSIONS ACCOUNTING REPORT           `,
      `================================================================================`,
      `Report Generated:    ${new Date().toLocaleString()} (Local Time)`,
      `Facility / Site:     PrecisionWorks Industrial Facility (KPCL Digital Twin)`,
      `Audit Status:        ${metadata?.audit_status || 'SIMULATED DEMO'}`,
      `Reporting Window:    ${period?.description || 'Simulated 30-Day Period (720 hrs)'}`,
      `Calculation Engine:  CEA Baseline Database v22.0 + IPCC AR6 Stoichiometry`,
      `Standards Alignment: GHG Protocol Corporate Standard | ISO 14064-1:2018`,
      ``,
      `--------------------------------------------------------------------------------`,
      `1. GROSS GHG FOOTPRINT SUMMARY`,
      `--------------------------------------------------------------------------------`,
      `Total Gross Emissions:      ${totalGrossTons.toFixed(3)} t CO₂e (100.0%)`,
      `  • Scope 1 (Direct Fuel):   ${scope1Tons.toFixed(3)} t CO₂e (${s1Percent}%)`,
      `  • Scope 2 (Electricity):   ${scope2Tons.toFixed(3)} t CO₂e (${s2Percent}%)`,
      ``,
      `--------------------------------------------------------------------------------`,
      `2. ACTIVITY DATA & EMISSION FACTORS`,
      `--------------------------------------------------------------------------------`,
      `SCOPE 1: DIRECT FUEL COMBUSTION`,
      `  - Primary Fuel:            ${s1?.fuel_name || 'Liquefied Petroleum Gas (LPG)'}`,
      `  - Fuel Consumption:        ${(s1?.activity.value || 1800).toLocaleString()} ${s1?.activity.unit || 'kg'}`,
      `  - Data Provenance:         ${s1?.activity.provenance || 'ESTIMATED'}`,
      `  - Direct CO₂ Factor:       ${s1?.factor_breakdown?.direct_co2_kg_per_kg ?? 2.978} kg CO₂/kg fuel`,
      `  - CH₄ Emission & GWP:      ${s1?.factor_breakdown?.ch4_emitted_g_per_kg ?? 0.0473} g/kg (GWP AR6: 27.9)`,
      `  - N₂O Emission & GWP:      ${s1?.factor_breakdown?.n2o_emitted_g_per_kg ?? 0.00473} g/kg (GWP AR6: 273.0)`,
      `  - Total Evaluation Factor: ${s1?.factor_breakdown?.total_co2e_kg_per_kg ?? 2.98} kg CO₂e/kg`,
      `  - Applied Formula:         ${s1?.formula || 'Activity (kg) × Total Factor ÷ 1,000'}`,
      `  - Verification Source:     ${s1?.source_reference || 'IPCC 2006 Vol. 2 Ch. 2 Table 2.3'}`,
      ``,
      `SCOPE 2: PURCHASED ELECTRICITY`,
      `  - Grid Consumption:        ${(s2?.activity.value || PLANT.baselineEnergy).toLocaleString()} kWh`,
      `  - Data Provenance:         ${s2?.activity.provenance || 'SIMULATED / SCADA'}`,
      `  - Grid Emission Factor:    ${(s2?.factor_metadata.selected_factor ?? gridEF).toFixed(5)} kg CO₂/kWh`,
      `  - Reporting Period / Year: ${reportingYear}`,
      `  - CEA Methodology:         ${METHODOLOGY_LABELS[ceaMethodology]}`,
      `  - Regulatory Authority:    ${s2?.factor_metadata.authority || 'Central Electricity Authority, Ministry of Power, Govt of India'}`,
      `  - Registry Version:        ${s2?.factor_metadata.database_version || '22.0'}`,
      `  - Accounting Treatment:    Scope 2 Location-Based (Grid Average)`,
      ``,
      `--------------------------------------------------------------------------------`,
      `3. DIGITAL TWIN CARBON REDUCTION SCENARIO`,
      `--------------------------------------------------------------------------------`,
      `Optimization Active:         ${isScenarioActive ? 'YES' : 'NO (BASELINE OPERATIONAL)'}`,
      `Electricity Energy Savings:  ${energySavingsKwh.toLocaleString()} kWh`,
      `Avoided Scope 2 Carbon:      ${netReductionTons.toFixed(3)} t CO₂e (${reductionPct}%)`,
      `Energy Cost Avoidance:       ₹${sim.savingsCost.toLocaleString()}`,
      ``,
      `================================================================================`,
      `End of WattWise AI Carbon Accounting Audit Summary`,
      `================================================================================`,
    ].join('\n');

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `WattWise_Carbon_Report_${reportingYear}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [metadata, period, totalGrossTons, scope1Tons, scope2Tons, s1Percent, s2Percent, s1, s2, reportingYear, ceaMethodology, gridEF, isScenarioActive, energySavingsKwh, netReductionTons, reductionPct, sim.savingsCost]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 32px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ─── A. Page Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid #EAE3D7'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Leaf size={18} color="#059669" />
              </div>
              <h1 style={{
                fontSize: 22,
                fontWeight: 700,
                color: '#1C1917',
                letterSpacing: '-0.02em',
                margin: 0
              }}>
                Carbon Accounting
              </h1>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 9999,
                background: backendStatus === 'CONNECTED' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                color: backendStatus === 'CONNECTED' ? '#059669' : '#D97706',
                border: backendStatus === 'CONNECTED' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <span style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: backendStatus === 'CONNECTED' ? '#10B981' : '#F59E0B'
                }} />
                {backendStatus === 'CONNECTED' ? 'LIVE CEA API' : 'OFFLINE DEMO'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: '#78716C', margin: 0 }}>
              Official GHG Protocol & CEA Scope 1 and Scope 2 Emissions Intelligence
            </p>
          </div>

          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            {/* CEA Reporting Year */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="cea-year-select" style={{ fontSize: 12, fontWeight: 500, color: '#78716C' }}>
                Period:
              </label>
              <select
                id="cea-year-select"
                value={reportingYear}
                onChange={(e) => setReportingYear(e.target.value)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #D9D0C1',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: '#1C1917',
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    CEA FY {yr}
                  </option>
                ))}
              </select>
            </div>

            {/* CEA Methodology */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <label htmlFor="cea-meth-select" style={{ fontSize: 12, fontWeight: 500, color: '#78716C' }}>
                Methodology:
              </label>
              <select
                id="cea-meth-select"
                value={ceaMethodology}
                onChange={(e) => setCeaMethodology(e.target.value as CeaMethodology)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #D9D0C1',
                  borderRadius: 8,
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  color: '#1C1917',
                  cursor: 'pointer',
                  outline: 'none',
                  maxWidth: 220,
                  textOverflow: 'ellipsis'
                }}
              >
                {Object.entries(METHODOLOGY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Recalculate Button */}
            <button
              id="recalculate-carbon-btn"
              onClick={onRecalculate}
              disabled={carbonLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#1C1917',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: carbonLoading ? 'not-allowed' : 'pointer',
                opacity: carbonLoading ? 0.7 : 1,
                transition: 'all 0.15s ease'
              }}
            >
              <RefreshCw
                size={13}
                style={{
                  animation: carbonLoading ? 'spin 1s linear infinite' : 'none',
                }}
              />
              <span>{carbonLoading ? 'Calculating...' : 'Recalculate'}</span>
            </button>

            {/* Export Button */}
            <button
              id="export-carbon-report-btn"
              onClick={handleExportReport}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: '#FFFFFF',
                color: '#1C1917',
                border: '1px solid #D9D0C1',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Download size={13} />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        {/* ─── Top Sub-Tab Navigation Bar ─────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#FAF7F2',
          padding: '6px',
          borderRadius: 10,
          border: '1px solid #EAE3D7',
          width: 'fit-content',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setActiveTab('accounting')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === 'accounting' ? '#1C1917' : 'transparent',
              color: activeTab === 'accounting' ? '#FFFFFF' : '#78716C',
              transition: 'all 0.15s ease'
            }}
          >
            <Leaf size={14} color={activeTab === 'accounting' ? '#10B981' : '#78716C'} />
            <span>GHG Accounting & Inventory</span>
          </button>

          <button
            onClick={() => setActiveTab('credits')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === 'credits' ? '#1C1917' : 'transparent',
              color: activeTab === 'credits' ? '#FFFFFF' : '#78716C',
              transition: 'all 0.15s ease'
            }}
          >
            <Award size={14} color={activeTab === 'credits' ? '#F59E0B' : '#78716C'} />
            <span>Carbon Credits & CCTS Marketplace</span>
          </button>

          <button
            onClick={() => setActiveTab('filing')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === 'filing' ? '#1C1917' : 'transparent',
              color: activeTab === 'filing' ? '#FFFFFF' : '#78716C',
              transition: 'all 0.15s ease'
            }}
          >
            <FileText size={14} color={activeTab === 'filing' ? '#3B82F6' : '#78716C'} />
            <span>Statutory Compliance & Filings</span>
          </button>

          <button
            onClick={() => setActiveTab('evidence')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              background: activeTab === 'evidence' ? '#1C1917' : 'transparent',
              color: activeTab === 'evidence' ? '#FFFFFF' : '#78716C',
              transition: 'all 0.15s ease'
            }}
          >
            <ShieldCheck size={14} color={activeTab === 'evidence' ? '#10B981' : '#78716C'} />
            <span>Evidence & Compliance Vault</span>
          </button>
        </div>

        {activeTab === 'credits' && (
          <div style={{ marginTop: 8 }}>
            <CarbonCreditsEngine />
          </div>
        )}

        {activeTab === 'filing' && (
          <div style={{ marginTop: 8 }}>
            <CarbonComplianceFilingPortal />
          </div>
        )}

        {activeTab === 'evidence' && (
          <div style={{ marginTop: 8 }}>
            <EvidenceVaultView onBackToAccounting={() => setActiveTab('accounting')} />
          </div>
        )}

        {activeTab === 'accounting' && (
          <>
            {/* ─── Error Alert Banner (if applicable) ─────────────────────────────────── */}
        {carbonError && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: 10,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#B91C1C',
            fontSize: 12.5
          }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Calculation Notice:</strong> {carbonError}. Fallback parameters applied.
            </div>
          </div>
        )}

        {/* ─── B. Top KPI Cards Grid (4 Cards Maximum) ─────────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16
        }}>
          {/* KPI 1: Total Gross Emissions */}
          <div
            onClick={() => setTraceabilityMetric('total_gross')}
            title="Click to view full mathematical derivation, emission factor citation, and primary evidence"
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#10B981';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#EAE3D7';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.05em' }}>
                TOTAL GROSS EMISSIONS
              </span>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Leaf size={15} color="#059669" />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#1C1917' }}>
                  {totalGrossTons.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C' }}>
                  t CO₂e
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: '#78716C' }}>
                  {fallbackPeriodDays} Days Reporting Window
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: '#F5F5F4',
                  color: '#57534E'
                }}>
                  Scope 1 + 2
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px dashed #F5F5F4',
                fontSize: 10.5,
                fontWeight: 600,
                color: '#059669'
              }}>
                <span>🔍 Click to trace derivation & evidence</span>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Scope 1 Direct Emissions */}
          <div
            onClick={() => setTraceabilityMetric('scope1_lpg')}
            title="Click to view fuel stoichiometry, delivery slips, and IPCC factors"
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#EF4444';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#EAE3D7';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.05em' }}>
                SCOPE 1 (DIRECT FUELS)
              </span>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(239, 68, 68, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Flame size={15} color="#DC2626" />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#1C1917' }}>
                  {scope1Tons.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C' }}>
                  t CO₂e
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: '#78716C' }}>
                  {(s1?.activity.value ?? 1800).toLocaleString()} {s1?.activity.unit ?? 'kg'} LPG
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#DC2626'
                }}>
                  {s1Percent}% of total
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px dashed #F5F5F4',
                fontSize: 10.5,
                fontWeight: 600,
                color: '#DC2626'
              }}>
                <span>🔍 Click to trace derivation & evidence</span>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* KPI 3: Scope 2 Electricity Emissions */}
          <div
            onClick={() => setTraceabilityMetric('scope2_grid')}
            title="Click to view CEA grid factor provenance, utility invoices, and submeter logs"
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#0284C7';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(2, 132, 199, 0.12)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#EAE3D7';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.05em' }}>
                SCOPE 2 (ELECTRICITY)
              </span>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(2, 132, 199, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Zap size={15} color="#0284C7" />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: '#1C1917' }}>
                  {scope2Tons.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C' }}>
                  t CO₂e
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: '#78716C' }}>
                  EF: {(s2?.factor_metadata.selected_factor ?? gridEF).toFixed(4)} kg/kWh
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(2, 132, 199, 0.1)',
                  color: '#0284C7'
                }}>
                  {s2Percent}% of total
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px dashed #F5F5F4',
                fontSize: 10.5,
                fontWeight: 600,
                color: '#0284C7'
              }}>
                <span>🔍 Click to trace derivation & evidence</span>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Avoided Carbon / Net Reduction */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 12,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#78716C', letterSpacing: '0.05em' }}>
                CARBON REDUCTION
              </span>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <TrendingDown size={15} color="#059669" />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: netReductionTons > 0 ? '#059669' : '#57534E'
                }}>
                  {netReductionTons > 0 ? `-${netReductionTons.toFixed(2)}` : '0.00'}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C' }}>
                  t CO₂e
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11.5, color: '#78716C' }}>
                  {netReductionTons > 0 ? `${energySavingsKwh.toLocaleString()} kWh saved` : 'Unoptimized Baseline'}
                </span>
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: netReductionTons > 0 ? 'rgba(16, 185, 129, 0.12)' : '#F5F5F4',
                  color: netReductionTons > 0 ? '#059669' : '#78716C'
                }}>
                  {netReductionTons > 0 ? `-${reductionPct}% avoided` : 'Baseline Active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── C + D. Emissions Breakdown & Trend (Two-Column Layout) ─────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.5fr)',
          gap: 20
        }}>
          {/* C. Emissions Breakdown */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 12,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                  Emissions Breakdown
                </h3>
                <p style={{ fontSize: 12, color: '#78716C', margin: '2px 0 0' }}>
                  Scope 1 (Direct) vs Scope 2 (Grid Electricity)
                </p>
              </div>
              <span style={{
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: '#57534E',
                background: '#FAF7F2',
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid #EAE3D7'
              }}>
                100% Gross
              </span>
            </div>

            {/* Donut Chart with Center Total */}
            <div style={{ position: 'relative', width: '100%', height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toFixed(2)} t CO₂e`, 'Emissions']}
                    contentStyle={{
                      background: '#1C1917',
                      color: '#FFFFFF',
                      borderRadius: 6,
                      fontSize: 12,
                      border: 'none'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: '#1C1917', lineHeight: 1 }}>
                  {totalGrossTons.toFixed(1)}
                </div>
                <div style={{ fontSize: 10, color: '#78716C', marginTop: 2 }}>
                  t CO₂e
                </div>
              </div>
            </div>

            {/* Ranked Source Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
              {/* Scope 2 Bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0284C7' }} />
                    <span style={{ fontWeight: 600, color: '#1C1917' }}>Scope 2: Purchased Electricity</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1C1917' }}>
                    {scope2Tons.toFixed(2)} t <span style={{ color: '#78716C', fontWeight: 400 }}>({s2Percent}%)</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 6, background: '#F1F5F9', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${s2Percent}%`, height: '100%', background: '#0284C7', borderRadius: 9999 }} />
                </div>
                <div style={{ fontSize: 11, color: '#78716C', marginTop: 3 }}>
                  {(s2?.activity.value || PLANT.baselineEnergy).toLocaleString()} kWh consumed • Central Electricity Authority (India)
                </div>
              </div>

              {/* Scope 1 Bar */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626' }} />
                    <span style={{ fontWeight: 600, color: '#1C1917' }}>Scope 1: Fuel Combustion (LPG)</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1C1917' }}>
                    {scope1Tons.toFixed(2)} t <span style={{ color: '#78716C', fontWeight: 400 }}>({s1Percent}%)</span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 6, background: '#F1F5F9', borderRadius: 9999, overflow: 'hidden' }}>
                  <div style={{ width: `${s1Percent}%`, height: '100%', background: '#DC2626', borderRadius: 9999 }} />
                </div>
                <div style={{ fontSize: 11, color: '#78716C', marginTop: 3 }}>
                  {(s1?.activity.value || 1800).toLocaleString()} kg LPG consumed • Industrial Heat Furnace + Hot Water Loop
                </div>
              </div>
            </div>
          </div>

          {/* D. Emissions Trend Chart */}
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 12,
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                  Emissions Trend Across Period
                </h3>
                <p style={{ fontSize: 12, color: '#78716C', margin: '2px 0 0' }}>
                  Daily emission distribution across 30-day reporting window
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#57534E' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0284C7' }} />
                  Scope 2
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#57534E' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#DC2626' }} />
                  Scope 1
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#57534E' }}>
                  <span style={{ width: 8, height: 2, background: '#10B981' }} />
                  Total Gross
                </span>
              </div>
            </div>

            <div style={{ width: '100%', height: 210 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scope2Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0284C7" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#0284C7" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="scope1Grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#DC2626" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#DC2626" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="#A8A29E"
                    fontSize={11}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    stroke="#A8A29E"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => `${v.toFixed(1)}t`}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [
                      `${Number(val).toFixed(3)} t CO₂e`,
                      name === 'scope2' ? 'Scope 2 (Electricity)' : name === 'scope1' ? 'Scope 1 (Fuel)' : 'Total Gross'
                    ]}
                    labelFormatter={(label) => `Day ${label}`}
                    contentStyle={{
                      background: '#1C1917',
                      color: '#FFFFFF',
                      borderRadius: 6,
                      fontSize: 12,
                      border: 'none'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="scope2"
                    stroke="#0284C7"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#scope2Grad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="scope1"
                    stroke="#DC2626"
                    strokeWidth={1.5}
                    fillOpacity={1}
                    fill="url(#scope1Grad)"
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid #F1F5F9',
              fontSize: 11.5,
              color: '#78716C'
            }}>
              <span>Average Daily Footprint: <strong style={{ color: '#1C1917', fontFamily: 'var(--font-mono)' }}>{(totalGrossTons / fallbackPeriodDays).toFixed(2)} t/day</strong></span>
              <span>Total Hours Analyzed: <strong style={{ color: '#1C1917', fontFamily: 'var(--font-mono)' }}>{fallbackPeriodDays * 24} hrs</strong></span>
              <span>Primary Driver: <strong style={{ color: '#0284C7' }}>Grid Electricity ({s2Percent}%)</strong></span>
            </div>
          </div>
        </div>

        {/* ─── E. Explore Carbon Reduction (Digital Twin Scenario Integration) ────── */}
        <div style={{
          background: '#FFFFFF',
          border: isScenarioActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid #EAE3D7',
          borderRadius: 12,
          padding: '24px',
          boxShadow: isScenarioActive ? '0 2px 10px rgba(16, 185, 129, 0.08)' : '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: isScenarioActive ? 'rgba(16, 185, 129, 0.15)' : '#F5F5F4',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Sliders size={16} color={isScenarioActive ? '#059669' : '#57534E'} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                  Explore Carbon Reduction
                </h3>
                <p style={{ fontSize: 12, color: '#78716C', margin: '2px 0 0' }}>
                  Real-time scenario simulation powered by factory digital twin operational controls
                </p>
              </div>
            </div>

            <span style={{
              fontSize: 11.5,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 9999,
              background: isScenarioActive ? 'rgba(16, 185, 129, 0.12)' : '#F5F5F4',
              color: isScenarioActive ? '#059669' : '#78716C',
              border: isScenarioActive ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #EAE3D7',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isScenarioActive ? '#10B981' : '#A8A29E'
              }} />
              {isScenarioActive ? 'ACTIVE SIMULATION APPLIED' : 'BASELINE REFERENCE (NO FIXES)'}
            </span>
          </div>

          {isScenarioActive ? (
            <div>
              {/* Side-by-side comparison cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
                marginBottom: 16
              }}>
                <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>BASELINE EMISSIONS</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#1C1917', marginTop: 4 }}>
                    {totalGrossTons.toFixed(2)} <span style={{ fontSize: 12, color: '#78716C' }}>t CO₂e</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                    {(PLANT.baselineEnergy).toLocaleString()} kWh full grid draw
                  </div>
                </div>

                <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>PROPOSED SCENARIO</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#0284C7', marginTop: 4 }}>
                    {Math.max(0, +(totalGrossTons - netReductionTons).toFixed(2))} <span style={{ fontSize: 12, color: '#78716C' }}>t CO₂e</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                    {Math.max(0, PLANT.baselineEnergy - energySavingsKwh).toLocaleString()} kWh target consumption
                  </div>
                </div>

                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: '14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>NET CARBON REDUCTION</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#059669', marginTop: 4 }}>
                    -{netReductionTons.toFixed(3)} <span style={{ fontSize: 12, color: '#059669' }}>t CO₂e</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#059669', marginTop: 2, fontWeight: 600 }}>
                    -{reductionPct}% reduction vs baseline
                  </div>
                </div>

                <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>ESTIMATED COST SAVINGS</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: '#1C1917', marginTop: 4 }}>
                    ₹{sim.savingsCost.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                    Based on ₹8.00/kWh tariff rate
                  </div>
                </div>
              </div>

              {/* Active Levers Summary */}
              <div style={{
                background: '#FAF7F2',
                borderRadius: 8,
                padding: '12px 16px',
                border: '1px solid #EAE3D7',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 12,
                fontSize: 12
              }}>
                <span style={{ fontWeight: 600, color: '#57534E' }}>Active Digital Twin Levers:</span>
                <span style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: params.autoIdleCutoff ? '#D1FAE5' : '#F1F5F9',
                  color: params.autoIdleCutoff ? '#065F46' : '#64748B',
                  fontWeight: 500
                }}>
                  Compressor Unloader: {params.autoIdleCutoff ? 'Auto-Cutoff Active (3.2h idle cut)' : 'Standard baseline run'}
                </span>
                <span style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: params.staggerFurnace ? '#D1FAE5' : '#F1F5F9',
                  color: params.staggerFurnace ? '#065F46' : '#64748B',
                  fontWeight: 500
                }}>
                  Furnace Pre-Heat: {params.staggerFurnace ? 'Solar Window Staggered (Dodges Peak)' : 'Evening Peak Overlap'}
                </span>
                <span style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: params.pressureSetpoint < 7.5 ? '#D1FAE5' : '#F1F5F9',
                  color: params.pressureSetpoint < 7.5 ? '#065F46' : '#64748B',
                  fontWeight: 500
                }}>
                  Pneumatic Pressure: {params.pressureSetpoint < 7.5 ? `${params.pressureSetpoint.toFixed(1)} bar (-${((7.5 - params.pressureSetpoint) * 10).toFixed(0)}% energy)` : '7.5 bar (Unoptimized)'}
                </span>
                <span style={{
                  padding: '3px 8px', borderRadius: 6,
                  background: params.autoIdleCutoff ? '#D1FAE5' : '#F1F5F9',
                  color: params.autoIdleCutoff ? '#065F46' : '#64748B',
                  fontWeight: 500
                }}>
                  Power Factor: {params.autoIdleCutoff ? '0.96 (Corrected)' : '0.91 (Uncompensated)'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{
              background: '#FAF7F2',
              borderRadius: 8,
              padding: '20px',
              border: '1px dashed #D9D0C1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 20
            }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1C1917', margin: 0 }}>
                  Baseline Footprint (No Operational Optimization Currently Applied)
                </h4>
                <p style={{ fontSize: 12.5, color: '#78716C', margin: '4px 0 0', maxWidth: 700, lineHeight: 1.5 }}>
                  The carbon figures shown represent your unoptimized factory operational baseline. You can simulate machine-level efficiency interventions (such as compressor unloader schedules or solar window shifting) in the <strong>Digital Twin Workbench</strong> to evaluate projected Scope 2 carbon avoidance.
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>Potential Scope 2 Reduction</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: '#059669', marginTop: 2 }}>
                  ~0.82 t CO₂e
                </div>
                <div style={{ fontSize: 11, color: '#78716C' }}>~998.4 kWh idle loss identified</div>
              </div>
            </div>
          )}
        </div>

        {/* ─── F. Collapsible Section: How Are Emissions Calculated? ─────────────────── */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <button
            onClick={() => setIsMethodologyOpen(!isMethodologyOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: '#FAF7F2', border: '1px solid #EAE3D7',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Info size={15} color="#57534E" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>
                  How Are Emissions Calculated?
                </div>
                <div style={{ fontSize: 12, color: '#78716C' }}>
                  Formulas, emission factor catalogue provenance, and GHG Protocol accounting rules
                </div>
              </div>
            </div>
            {isMethodologyOpen ? <ChevronDown size={18} color="#78716C" /> : <ChevronRight size={18} color="#78716C" />}
          </button>

          <AnimatePresence>
            {isMethodologyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 24px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* Plain English Summary */}
                  <div style={{
                    background: '#FAF7F2',
                    borderRadius: 8,
                    padding: '14px 18px',
                    fontSize: 12.5,
                    color: '#44403C',
                    lineHeight: 1.6,
                    marginTop: 16
                  }}>
                    <strong>Plain-English Methodology:</strong> Scope 1 measures direct greenhouse gas releases from fuel combustion at your facility using <em>IPCC AR6</em> stoichiometric emission factors. Scope 2 accounts for indirect emissions associated with purchased grid electricity using official <em>Central Electricity Authority (India)</em> location-based emission factors for the Indian National Grid.
                  </div>

                  {/* Formula Callout Boxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
                    {/* Scope 1 Formula */}
                    <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Flame size={14} color="#DC2626" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1C1917' }}>Scope 1 Combustion Formula</span>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        background: '#FAF7F2',
                        padding: '8px 10px',
                        borderRadius: 6,
                        color: '#1C1917',
                        lineHeight: 1.5
                      }}>
                        Emissions (t CO₂e) = [Fuel Mass (kg) × Total CO₂e Factor (kg CO₂e/kg)] ÷ 1,000
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C', marginTop: 6 }}>
                        Factored across CO₂ (2.978 kg/kg) + CH₄ (0.0473 g/kg × 27.9 GWP) + N₂O (0.00473 g/kg × 273.0 GWP).
                      </div>
                    </div>

                    {/* Scope 2 Formula */}
                    <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Zap size={14} color="#0284C7" />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#1C1917' }}>Scope 2 Electricity Formula</span>
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        background: '#FAF7F2',
                        padding: '8px 10px',
                        borderRadius: 6,
                        color: '#1C1917',
                        lineHeight: 1.5
                      }}>
                        Emissions (t CO₂e) = [Grid Consumption (kWh) × CEA Factor (kg CO₂/kWh)] ÷ 1,000
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C', marginTop: 6 }}>
                        Factor extracted directly from CEA Official CO₂ Baseline Database ({reportingYear}, {METHODOLOGY_LABELS[ceaMethodology]}).
                      </div>
                    </div>
                  </div>

                  {/* Factor Details Table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#FAF7F2', borderBottom: '1px solid #EAE3D7' }}>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E' }}>Scope</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E' }}>Source Name</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E' }}>Activity Volume</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E' }}>Emission Factor</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E' }}>Authority / Provenance</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#57534E', textAlign: 'right' }}>Calculated Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#DC2626' }}>Scope 1</td>
                          <td style={{ padding: '10px 12px', color: '#1C1917' }}>{s1?.fuel_name || 'Liquefied Petroleum Gas (LPG)'}</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                            {(s1?.activity.value || 1800).toLocaleString()} {s1?.activity.unit || 'kg'}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                            {s1?.factor_breakdown?.total_co2e_kg_per_kg ?? 2.98} kg CO₂e/kg
                          </td>
                          <td style={{ padding: '10px 12px', color: '#78716C' }}>
                            IPCC 2006 Vol 2 / {s1?.activity.provenance || 'ESTIMATED'}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1C1917', textAlign: 'right' }}>
                            {scope1Tons.toFixed(2)} t CO₂e
                          </td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0284C7' }}>Scope 2</td>
                          <td style={{ padding: '10px 12px', color: '#1C1917' }}>Purchased Indian National Grid Power</td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                            {(s2?.activity.value || PLANT.baselineEnergy).toLocaleString()} kWh
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                            {(s2?.factor_metadata.selected_factor ?? gridEF).toFixed(4)} kg CO₂/kWh
                          </td>
                          <td style={{ padding: '10px 12px', color: '#78716C' }}>
                            CEA Database v22.0 / {s2?.activity.provenance || 'SIMULATED'}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#1C1917', textAlign: 'right' }}>
                            {scope2Tons.toFixed(2)} t CO₂e
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ─── G. Collapsible Section: Data Governance & Calculation Audit ─────────── */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <button
            onClick={() => setIsDataQualityOpen(!isDataQualityOpen)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: '#FAF7F2', border: '1px solid #EAE3D7',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <ShieldCheck size={15} color="#57534E" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>
                  Data Governance & Calculation Audit
                </div>
                <div style={{ fontSize: 12, color: '#78716C' }}>
                  Audit verification level, compliance standards, and telemetry provenance
                </div>
              </div>
            </div>
            {isDataQualityOpen ? <ChevronDown size={18} color="#78716C" /> : <ChevronRight size={18} color="#78716C" />}
          </button>

          <AnimatePresence>
            {isDataQualityOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ padding: '0 24px 24px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    marginTop: 16
                  }}>
                    {/* Audit Status */}
                    <div style={{ background: '#FAF7F2', borderRadius: 8, padding: '14px', border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>AUDIT VERIFICATION LEVEL</div>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#059669'
                      }}>
                        <CheckCircle2 size={14} />
                        <span>{metadata?.audit_status || 'SIMULATED DEMO READY'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C', marginTop: 4 }}>
                        Calculated at {metadata?.calculated_at ? new Date(metadata.calculated_at).toLocaleTimeString() : 'Current Session'}
                      </div>
                    </div>

                    {/* Standards Compliance */}
                    <div style={{ background: '#FAF7F2', borderRadius: 8, padding: '14px', border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>STANDARDS COMPLIANCE</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', marginTop: 6 }}>
                        GHG Protocol Corporate Standard
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                        Aligned with ISO 14064-1:2018 Specification
                      </div>
                    </div>

                    {/* Registry Metadata */}
                    <div style={{ background: '#FAF7F2', borderRadius: 8, padding: '14px', border: '1px solid #EAE3D7' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#78716C' }}>REGISTRY METADATA</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#1C1917', marginTop: 6 }}>
                        CEA User Guide v22.0 (Table Results)
                      </div>
                      <div style={{ fontSize: 11, color: '#78716C', marginTop: 2 }}>
                        Ministry of Power, Government of India
                      </div>
                    </div>
                  </div>

                  {/* Auditor Notes Callout */}
                  <div style={{
                    fontSize: 11.5,
                    color: '#57534E',
                    background: '#FAF7F2',
                    borderRadius: 8,
                    padding: '12px 16px',
                    border: '1px solid #EAE3D7',
                    lineHeight: 1.5
                  }}>
                    <strong>Audit Trail Note:</strong> {metadata?.note || 'Emissions computed according to statutory location-based accounting principles. All activity inputs map to verified industrial SCADA data meters and fuel batch receipts.'}
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </>
        )}

        {/* ─── Clickable Traceability Drawer ─────────────────────────────────── */}
        <CarbonTraceabilityDrawer
          isOpen={Boolean(traceabilityMetric)}
          metricId={traceabilityMetric}
          onClose={() => setTraceabilityMetric(null)}
          onNavigateToEvidence={() => setActiveTab('evidence')}
        />

      </div>
    </div>
  );
}
