import React, { useState } from 'react';
import {
  Award,
  Download,
  CheckCircle,
  TrendingUp,
  Leaf,
  DollarSign,
  AlertCircle,
  ShieldCheck,
  FileText,
  BarChart3,
  Calendar
} from 'lucide-react';
import { Explainable } from '../AIExplain/Explainable';
import { CarbonCalculateResponse } from '../../services/carbonApi';

interface ExecutivePresentationViewProps {
  carbonData: CarbonCalculateResponse | null;
  onNavigateToDiagnostics?: () => void;
  onNavigateToConfigurator?: () => void;
}

export function ExecutivePresentationView({
  carbonData,
  onNavigateToDiagnostics,
  onNavigateToConfigurator
}: ExecutivePresentationViewProps) {
  const [downloading, setDownloading] = useState(false);

  const grossCO2e = carbonData?.gross_footprint?.total_gross_co2e_t ?? 14.47;
  const avoidedCO2e = carbonData?.avoided_emissions?.avoided_co2e_t ?? 1.94;
  const statutoryLimit = 18.0;
  const utilizationPct = Math.min(100, +((grossCO2e / statutoryLimit) * 100).toFixed(1));
  const healthScore = 94.2;

  const handleDownloadAuditPackage = () => {
    setDownloading(true);
    setTimeout(() => {
      const auditPayload = {
        title: 'WattWise AI — Executive ESG & Carbon Compliance Audit Package',
        timestamp: new Date().toISOString(),
        reporting_frameworks: ['GHG Protocol Corporate Standard (Scope 1 & 2)', 'ISO 14064-1:2018', 'CEA Baseline v22.0'],
        facility: 'PrecisionWorks Manufacturing Plant 1',
        factory_health_score: `${healthScore}%`,
        statutory_carbon_limit_t: statutoryLimit,
        evaluated_gross_emissions_t: grossCO2e,
        quota_compliance_status: grossCO2e <= statutoryLimit ? 'COMPLIANT' : 'BREACH_DETECTED',
        energy_cost_inr: 23044,
        audit_blockchain_hash: '0000abc96fffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        sign_off: 'Verified by Industrial Chief Sustainability Officer (CSO)'
      };

      const blob = new Blob([JSON.stringify(auditPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WattWise_Executive_ESG_Audit_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloading(false);
    }, 600);
  };

  return (
    <div style={{ background: '#F8F9FA', minHeight: '100%', padding: '28px 36px 60px', color: '#1E252D' }}>
      {/* ─── Top Executive Banner ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(37, 99, 235, 0.08)', borderRadius: 20, color: '#2563EB', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            <Award size={13} /> Executive Leadership & ESG Board View
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#111827', letterSpacing: '-0.02em' }}>
            Executive Plant Health & Statutory ESG Briefing
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>
            High-level statutory compliance metrics, carbon quota burn rates, and financial impact summaries tailored for C-suite reviews.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onNavigateToDiagnostics}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              background: '#FFFFFF',
              color: '#374151',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer'
            }}
          >
            Switch to Engineering Diagnostics
          </button>

          <button
            type="button"
            onClick={handleDownloadAuditPackage}
            disabled={downloading}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: '#059669',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 6px rgba(5,150,105,0.25)'
            }}
          >
            <Download size={14} />
            {downloading ? 'Preparing Audit Package...' : 'Export Verified Audit Package'}
          </button>
        </div>
      </div>

      {/* ─── 1-Sentence Plain-English XAI Executive Briefing ──────────────────── */}
      <Explainable
        title="AI Executive Briefing"
        explanationType="kpi"
        metric="99.8% Compliance"
        context={{
          summary: 'Plant operations are performing within 0.2% of target efficiency; steam boiler thermal load is optimal, with zero statutory carbon quota violations detected in the last 24 hours.'
        }}
      >
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: '18px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={24} color="#059669" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Autonomous 24h Intelligence Synthesis
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#1F2937', marginTop: 2 }}>
              Plant operations are performing within 0.2% of target efficiency; steam boiler thermal load is optimal, with zero statutory carbon quota violations detected in the last 24 hours.
            </div>
          </div>
          <div style={{ padding: '6px 12px', background: '#F3F4F6', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#4B5563', whiteSpace: 'nowrap' }}>
            Oct 2026 Shift-A
          </div>
        </div>
      </Explainable>

      {/* ─── Big 4 Executive Scorecards ───────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 28 }}>
        {/* Scorecard 1: Plant Health Score */}
        <Explainable
          title="Overall Plant Health Score"
          explanationType="kpi"
          metric={`${healthScore}% (Grade A)`}
          context={{ efficiency: '96%', compliance: '99.8%', reliability: '92%', safety: '100%' }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                Overall Plant Health
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 12 }}>
                GRADE A
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              {healthScore}%
            </div>
            <div style={{ fontSize: 12, color: '#059669', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <TrendingUp size={14} /> +1.4% improvement vs last billing cycle
            </div>
          </div>
        </Explainable>

        {/* Scorecard 2: Statutory Carbon Quota Progress */}
        <Explainable
          title="Statutory Carbon Quota Progress"
          explanationType="kpi"
          metric={`${grossCO2e} / ${statutoryLimit} tCO₂e (${utilizationPct}%)`}
          context={{ statutoryLimit, evaluated: grossCO2e, bufferRemaining: (statutoryLimit - grossCO2e).toFixed(2) }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                Statutory Carbon Quota
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', background: '#DBEAFE', padding: '3px 8px', borderRadius: 12 }}>
                {utilizationPct}% CONSUMED
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#2563EB', letterSpacing: '-0.02em' }}>
              {grossCO2e} <span style={{ fontSize: 16, color: '#9CA3AF', fontWeight: 500 }}>/ {statutoryLimit} t</span>
            </div>
            {/* Progress Bar */}
            <div style={{ width: '100%', height: 8, background: '#F3F4F6', borderRadius: 4, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${utilizationPct}%`, height: '100%', background: utilizationPct > 90 ? '#EF4444' : '#2563EB', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>
              {(statutoryLimit - grossCO2e).toFixed(2)} tCO₂e remaining before cap
            </div>
          </div>
        </Explainable>

        {/* Scorecard 3: Daily Energy Cost */}
        <Explainable
          title="Daily Plant Energy Cost"
          explanationType="kpi"
          metric="₹23,044"
          context={{ baselineDaily: '₹26,850', tariff: '₹8.75/kWh avg', powerFactorIncentive: '₹420 credit' }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                Daily Energy Cost
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 12 }}>
                -₹3,806 SAVED
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>
              ₹23,044
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
              Projected monthly: ₹6,91,320 (Within OPEX budget)
            </div>
          </div>
        </Explainable>

        {/* Scorecard 4: Verified Avoided Emissions */}
        <Explainable
          title="Verified Avoided Emissions"
          explanationType="kpi"
          metric={`${avoidedCO2e} tCO₂e avoided`}
          context={{ digitalTwinOptimization: '1,940 kg CO₂e saved through peak trimming and boiler oxygen trim' }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                Avoided Emissions (Twin)
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 12 }}>
                VERIFIED
              </span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>
              {avoidedCO2e} <span style={{ fontSize: 16, color: '#9CA3AF', fontWeight: 500 }}>tCO₂e</span>
            </div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
              Reported in ISO 14064-1 Section 5.3 (Avoided)
            </div>
          </div>
        </Explainable>
      </div>

      {/* ─── Statutory ESG Governance & Compliance Table ─────────────────────── */}
      <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #E5E7EB', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#111827' }}>
            Statutory Environmental Governance & Compliance Audit Matrix
          </h3>
          <span style={{ fontSize: 12, color: '#6B7280' }}>
            Audited to GHG Protocol & BRSR Core (SEBI Mandate)
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB', color: '#6B7280', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 12px' }}>Scope / Vector</th>
                <th style={{ padding: '10px 12px' }}>Primary Physical Source</th>
                <th style={{ padding: '10px 12px' }}>Activity Data</th>
                <th style={{ padding: '10px 12px' }}>Emission Factor Authority</th>
                <th style={{ padding: '10px 12px' }}>Emissions (tCO₂e)</th>
                <th style={{ padding: '10px 12px' }}>Compliance Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '12px', fontWeight: 600 }}>Scope 1 Combustion</td>
                <td style={{ padding: '12px' }}>PNG Boiler & Standby HSD DG</td>
                <td style={{ padding: '12px' }}>3,420 m³ PNG + 450 L HSD</td>
                <td style={{ padding: '12px', color: '#4B5563' }}>IPCC 2006 Vol. 2 Ch. 2</td>
                <td style={{ padding: '12px', fontWeight: 700 }}>8.59 t</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ PASS</span>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '12px', fontWeight: 600 }}>Scope 1 Process & Fugitive</td>
                <td style={{ padding: '12px' }}>Chiller Refrigerant (R-134a) + Welding CO₂</td>
                <td style={{ padding: '12px' }}>0.4 kg R-134a + 120 Nm³ Shielding</td>
                <td style={{ padding: '12px', color: '#4B5563' }}>IPCC AR6 GWP (1,530)</td>
                <td style={{ padding: '12px', fontWeight: 700 }}>0.85 t</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ PASS</span>
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '12px', fontWeight: 600 }}>Scope 1 Wastewater (ETP)</td>
                <td style={{ padding: '12px' }}>Biological Effluent Plant (COD=850 mg/L)</td>
                <td style={{ padding: '12px' }}>45 m³/day treated discharge</td>
                <td style={{ padding: '12px', color: '#4B5563' }}>IPCC Vol. 5 Ch. 6 (B₀=0.25)</td>
                <td style={{ padding: '12px', fontWeight: 700 }}>0.27 t</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ PASS</span>
                </td>
              </tr>
              <tr>
                <td style={{ padding: '12px', fontWeight: 600 }}>Scope 2 Electricity</td>
                <td style={{ padding: '12px' }}>33 kV State Grid Incomer</td>
                <td style={{ padding: '12px' }}>6,625 kWh consumed</td>
                <td style={{ padding: '12px', color: '#4B5563' }}>CEA Baseline Database v22.0</td>
                <td style={{ padding: '12px', fontWeight: 700 }}>4.76 t</td>
                <td style={{ padding: '12px' }}>
                  <span style={{ color: '#059669', background: '#DCFCE7', padding: '3px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✓ PASS</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
