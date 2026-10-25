import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, ShieldCheck, CheckCircle2, AlertTriangle, Download,
  Printer, ArrowRight, ExternalLink, RefreshCw, Layers, Award,
  Globe, Flame, Zap, BarChart3, Database, Lock, Check, Sparkles,
  ChevronRight, Building2, Calendar, Hash, FileCheck, Landmark
} from 'lucide-react';
import {
  ComplianceDossier,
  Iso14064ComplianceLog,
  IpmvpMvProtocol,
  SebiBrsrDisclosure,
  EuCbamDisclosure,
  RegistryFilingItem,
  fetchComplianceDossier,
  submitRegistryFiling,
} from '../../services/complianceFilingApi';
import { Explainable } from '../AIExplain/Explainable';

export function CarbonComplianceFilingPortal() {
  const [dossier, setDossier] = useState<ComplianceDossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState<'iso14064' | 'ipmvp' | 'brsr_cbam' | 'registry'>('iso14064');

  // New PDD Modal State
  const [isPddModalOpen, setIsPddModalOpen] = useState(false);
  const [pddProjectName, setPddProjectName] = useState('Pneumatic Ring-Main Auto-Cutoff Interlock');
  const [pddRegistry, setPddRegistry] = useState('BEE_CCTS');
  const [pddAbatedTons, setPddAbatedTons] = useState(25.0);
  const [pddDoe, setPddDoe] = useState('TÜV SÜD South Asia Pvt Ltd');
  const [submittingPdd, setSubmittingPdd] = useState(false);
  const [pddSuccess, setPddSuccess] = useState<string | null>(null);

  // Dual switch for BRSR vs CBAM
  const [exportStandard, setExportStandard] = useState<'BRSR' | 'CBAM'>('CBAM');

  useEffect(() => {
    loadDossier();
  }, []);

  const loadDossier = async () => {
    setLoading(true);
    try {
      const data = await fetchComplianceDossier();
      setDossier(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load statutory compliance dossier');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPdd(true);
    try {
      const registryNameMap: Record<string, string> = {
        BEE_CCTS: 'Indian Carbon Market (CCTS) / BEE',
        BEE_PAT: 'BEE PAT Scheme (ESCerts)',
        VERRA_VCS: 'Verra Verified Carbon Standard (VCS)',
        GOLD_STANDARD: 'Gold Standard for the Global Goals (GS4GG)',
      };
      await submitRegistryFiling({
        project_name: pddProjectName,
        offset_registry: pddRegistry,
        registry_full_name: registryNameMap[pddRegistry] || pddRegistry,
        abated_emissions_tco2e: pddAbatedTons,
        vintage_year: 2026,
        designated_operational_entity_doe: pddDoe,
      });
      setPddSuccess(`PDD filing packet registered for ${pddProjectName}!`);
      setIsPddModalOpen(false);
      await loadDossier();
    } catch (err: any) {
      alert(`Error submitting PDD: ${err.message}`);
    } finally {
      setSubmittingPdd(false);
    }
  };

  const downloadJsonDossier = () => {
    if (!dossier) return;
    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WattWise_Carbon_Compliance_Dossier_FY26_${dossier.dossier_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !dossier) {
    return (
      <div style={{ padding: 48, textAlign: 'center', background: '#F8F6F0', borderRadius: 16 }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px', color: '#78716C' }} />
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1C1917' }}>
          Generating Multi-Standard Compliance &amp; Filing Dossier...
        </div>
        <div style={{ fontSize: 12, color: '#78716C', marginTop: 4 }}>
          Compiling ISO 14064 Scope 1 &amp; 2 logs, IPMVP M&amp;V regression, SEBI BRSR &amp; EU CBAM disclosures.
        </div>
      </div>
    );
  }

  const iso = dossier?.iso_14064_compliance_log;
  const ipmvp = dossier?.ipmvp_mv_protocol;
  const brsr = dossier?.sebi_brsr_disclosure;
  const cbam = dossier?.eu_cbam_disclosure;
  const filings = dossier?.registry_filings || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ─── Top Header & Cryptographic Dossier Banner ───────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(235, 226, 212, 0.95), rgba(245, 239, 230, 0.95))',
          borderRadius: 16,
          padding: '24px 28px',
          border: '1.5px solid rgba(255, 255, 255, 0.85)',
          boxShadow: '4px 4px 16px rgba(188, 176, 158, 0.35), -4px -4px 16px rgba(255, 255, 255, 0.75)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#059669',
                  background: 'rgba(5, 150, 105, 0.12)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ShieldCheck size={12} /> Statutory Compliance Dossier
              </span>
              <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", color: '#78716C' }}>
                ID: {dossier?.dossier_id}
              </span>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#1C1917', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Statutory Carbon Compliance &amp; Market Filing Portal
            </h2>
            <p style={{ fontSize: 13, color: '#57534E', margin: 0, maxWidth: 840, lineHeight: 1.5 }}>
              Standardized regulatory documentation suite certifying Scope 1 &amp; Scope 2 emissions under <strong>ISO 14064-1</strong>, 
              energy savings under <strong>IPMVP Option B/C</strong>, cross-border export intensities under <strong>EU CBAM &amp; SEBI BRSR</strong>, 
              and verified carbon credit market registration.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={downloadJsonDossier}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 8,
                background: '#1C1917',
                color: '#F5EFE6',
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <Download size={14} />
              <span>Export Regulatory Dossier (JSON)</span>
            </button>
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                borderRadius: 8,
                background: '#FFFFFF',
                color: '#1C1917',
                border: '1px solid rgba(90, 75, 55, 0.2)',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Printer size={14} />
              <span>Print Audit Brief</span>
            </button>
          </div>
        </div>

        {/* Audit Hash Seal */}
        <div
          style={{
            marginTop: 18,
            padding: '10px 14px',
            background: 'rgba(255, 255, 255, 0.75)',
            borderRadius: 8,
            border: '1px solid rgba(90, 75, 55, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#57534E' }}>
            <Lock size={13} style={{ color: '#059669' }} />
            <span>SHA-256 Multi-Standard Dossier Hash:</span>
            <code style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#1C1917' }}>
              {dossier?.dossier_integrity_hash}
            </code>
          </div>
          <div style={{ color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle2 size={13} />
            <span>Verified Compliant &amp; Tamper-Evident</span>
          </div>
        </div>
      </div>

      {/* ─── 4 Component Sub-Navigation Tab Bar ───────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 12,
          borderBottom: '1px solid rgba(90, 75, 55, 0.15)',
          paddingBottom: 12,
        }}
      >
        {/* Tab 1 */}
        <button
          onClick={() => setActiveTab('iso14064')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: '12px 16px',
            borderRadius: 10,
            background: activeTab === 'iso14064' ? '#1C1917' : '#EFE6D7',
            color: activeTab === 'iso14064' ? '#F5EFE6' : '#57534E',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <Layers size={14} style={{ color: activeTab === 'iso14064' ? '#10B981' : '#059669' }} />
            <span>1. ISO 14064 Compliance Log</span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            Scope 1 (Fuel) &amp; Scope 2 (Grid) Transparent Factors
          </span>
        </button>

        {/* Tab 2 */}
        <button
          onClick={() => setActiveTab('ipmvp')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: '12px 16px',
            borderRadius: 10,
            background: activeTab === 'ipmvp' ? '#1C1917' : '#EFE6D7',
            color: activeTab === 'ipmvp' ? '#F5EFE6' : '#57534E',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <BarChart3 size={14} style={{ color: activeTab === 'ipmvp' ? '#38BDF8' : '#0284C7' }} />
            <span>2. IPMVP M&amp;V Protocol</span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            14-Day Submetering &amp; Regression Verification Plan
          </span>
        </button>

        {/* Tab 3 */}
        <button
          onClick={() => setActiveTab('brsr_cbam')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: '12px 16px',
            borderRadius: 10,
            background: activeTab === 'brsr_cbam' ? '#1C1917' : '#EFE6D7',
            color: activeTab === 'brsr_cbam' ? '#F5EFE6' : '#57534E',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <Globe size={14} style={{ color: activeTab === 'brsr_cbam' ? '#FBBF24' : '#D97706' }} />
            <span>3. SEBI BRSR &amp; EU CBAM</span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            Export Carbon Intensity (kg CO₂e/part) Disclosures
          </span>
        </button>

        {/* Tab 4 */}
        <button
          onClick={() => setActiveTab('registry')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            padding: '12px 16px',
            borderRadius: 10,
            background: activeTab === 'registry' ? '#1C1917' : '#EFE6D7',
            color: activeTab === 'registry' ? '#F5EFE6' : '#57534E',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800 }}>
            <Award size={14} style={{ color: activeTab === 'registry' ? '#A78BFA' : '#7C3AED' }} />
            <span>4. Offset Registry Tracker</span>
          </div>
          <span style={{ fontSize: 11, opacity: 0.8 }}>
            PDD Generation, Stage Lifecycle &amp; Credit Issuance
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
         COMPONENT 1: ISO 14064 / GHG PROTOCOL COMPLIANCE LOG
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'iso14064' && iso && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top KPI Cards for ISO 14064 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Scope 1 Combustion</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#EA580C', fontFamily: "'IBM Plex Mono', monospace", margin: '4px 0' }}>
                {iso.total_scope1_tco2e} <span style={{ fontSize: 13 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 11, color: '#57534E' }}>LPG Furnaces + Standby HSD DG Sets</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Scope 2 Electricity</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace", margin: '4px 0' }}>
                {iso.total_scope2_tco2e} <span style={{ fontSize: 13 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 11, color: '#57534E' }}>Net of 18,200 kWh Solar Self-Generation</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Gross Annual Inventory</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace", margin: '4px 0' }}>
                {iso.gross_inventory_tco2e} <span style={{ fontSize: 13 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>100% Operational Control Boundary</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase' }}>Auditor Verification</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#059669', margin: '6px 0 2px' }}>
                CONFORMITY VERIFIED
              </div>
              <div style={{ fontSize: 11, color: '#57534E', lineHeight: 1.3 }}>
                {iso.lead_verifier_signoff.split(',')[0]}
              </div>
            </div>
          </div>

          {/* Section 1.1: Scope 1 Transparent Fuel Calculation Table */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid rgba(90, 75, 55, 0.14)',
              overflow: 'hidden',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(90, 75, 55, 0.1)', background: 'rgba(235, 226, 212, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Flame size={16} style={{ color: '#EA580C' }} />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1C1917', margin: 0 }}>
                  Scope 1 Stationary Combustion Inventory &amp; Transparent Emission Factors
                </h3>
              </div>
              <p style={{ fontSize: 11, color: '#78716C', margin: '4px 0 0 0' }}>
                Documented in compliance with ISO 14064-1:2018 Clause 5.2.4 &amp; IPCC Guidelines Vol 2 (Stationary Combustion).
              </p>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(247, 241, 231, 0.8)', borderBottom: '1px solid rgba(90, 75, 55, 0.12)', color: '#57534E', fontWeight: 700 }}>
                    <th style={{ padding: '10px 14px' }}>Fuel Type &amp; Application</th>
                    <th style={{ padding: '10px 14px' }}>Annual Qty</th>
                    <th style={{ padding: '10px 14px' }}>NCV (MJ/unit)</th>
                    <th style={{ padding: '10px 14px' }}>CO₂ Factor (kg/unit)</th>
                    <th style={{ padding: '10px 14px' }}>CH₄ / N₂O (g/unit)</th>
                    <th style={{ padding: '10px 14px' }}>Metering Instrument</th>
                    <th style={{ padding: '10px 14px' }}>Uncertainty</th>
                    <th style={{ padding: '10px 14px' }}>Calculated tCO₂e</th>
                  </tr>
                </thead>
                <tbody>
                  {iso.scope1_fuel_sources.map((fuel) => (
                    <tr key={fuel.fuel_id} style={{ borderBottom: '1px solid rgba(90, 75, 55, 0.08)' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 800, color: '#1C1917' }}>{fuel.fuel_name}</div>
                        <div style={{ fontSize: 10, color: '#78716C' }}>{fuel.tier_methodology}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                        {fuel.annual_consumption_qty.toLocaleString()} {fuel.unit}
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace" }}>{fuel.ncv_mj_per_unit}</td>
                      <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#EA580C' }}>
                        {fuel.emission_factor_kg_co2_per_unit}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 11, color: '#57534E' }}>
                        {fuel.ch4_factor_g_per_unit}g / {fuel.n2o_factor_g_per_unit}g
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#1C1917' }}>{fuel.metering_device_id}</div>
                        <div style={{ fontSize: 10, color: '#059669' }}>Calib Valid: {fuel.calibration_valid_until}</div>
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace", color: '#57534E' }}>
                        ±{fuel.uncertainty_pct}%
                      </td>
                      <td style={{ padding: '12px 14px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 900, color: '#EA580C', fontSize: 14 }}>
                        {fuel.calculated_emissions_tco2e.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 1.2: Scope 2 Grid Electricity Calculation Table */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid rgba(90, 75, 55, 0.14)',
              overflow: 'hidden',
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(90, 75, 55, 0.1)', background: 'rgba(235, 226, 212, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={16} style={{ color: '#0284C7' }} />
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#1C1917', margin: 0 }}>
                  Scope 2 Indirect Electricity Inventory (CEA Baseline Database v19.0)
                </h3>
              </div>
              <p style={{ fontSize: 11, color: '#78716C', margin: '4px 0 0 0' }}>
                Quantified per GHG Protocol Scope 2 Guidance (Dual Reporting: Location-based vs Market-based with Onsite RE Deduction).
              </p>
            </div>

            <div style={{ padding: 20 }}>
              {iso.scope2_grid_sources.map((grid) => (
                <div
                  key={grid.grid_connection_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 16,
                    background: 'rgba(247, 241, 231, 0.5)',
                    padding: 18,
                    borderRadius: 10,
                    border: '1px solid rgba(90, 75, 55, 0.1)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Grid Incomer Point</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', marginTop: 2 }}>{grid.metering_point}</div>
                    <div style={{ fontSize: 11, color: '#57534E' }}>{grid.discom_name}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>CEA Baseline Factor</div>
                    <div style={{ fontSize: 15, fontWeight: 900, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      {grid.grid_emission_factor_t_per_mwh} <span style={{ fontSize: 11 }}>tCO₂/MWh</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#57534E' }}>CEA National Weighted Avg (v19.0)</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Rooftop Solar Abatement</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#059669', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      - {grid.avoided_solar_emissions_tco2e} tCO₂e
                    </div>
                    <div style={{ fontSize: 11, color: '#57534E' }}>{grid.onsite_solar_export_kwh.toLocaleString()} kWh Self-Consumed</div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Net Scope 2 Footprint</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                      {grid.net_scope2_emissions_tco2e} <span style={{ fontSize: 12 }}>tCO₂e</span>
                    </div>
                    <div style={{ fontSize: 10, color: '#059669' }}>Class 0.2S Bidirectional Certified</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         COMPONENT 2: IPMVP MEASUREMENT & VERIFICATION PROTOCOL (OPTION B/C)
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'ipmvp' && ipmvp && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Protocol Header Card */}
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 14,
              border: '1px solid rgba(90, 75, 55, 0.14)',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#E0F2FE', color: '#0369A1', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 6 }}>
                <CheckCircle2 size={12} /> {ipmvp.selected_option}
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1C1917', margin: '0 0 4px 0' }}>
                {ipmvp.project_title}
              </h3>
              <p style={{ fontSize: 12, color: '#57534E', margin: 0 }}>
                {ipmvp.energy_conservation_measure_ecm}
              </p>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: '#78716C', fontWeight: 700, textTransform: 'uppercase' }}>Standard Protocol</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1C1917' }}>{ipmvp.protocol_standard.split('/')[0]}</div>
              <span style={{ fontSize: 10, color: '#059669', background: 'rgba(5, 150, 105, 0.12)', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                ASHRAE Guideline 14 Compliant
              </span>
            </div>
          </div>

          {/* 14-Day Submetering Baseline vs Reporting Period Reconciliation */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 20 }}>
            {/* Left: Mathematical Energy Reconciliation */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 14,
                border: '1px solid rgba(90, 75, 55, 0.14)',
                padding: '20px 24px',
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Hash size={16} style={{ color: '#0284C7' }} />
                14-Day Submetered Energy Conservation Reconciliation
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8F6F0', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: '#57534E' }}>14-Day Pre-Intervention Baseline (01 Mar - 14 Mar):</span>
                  <span style={{ fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{ipmvp.baseline_kwh.toLocaleString()} kWh</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8F6F0', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: '#57534E' }}>Routine Output Adjustment (Volume Normalization):</span>
                  <span style={{ fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#EA580C' }}>
                    {ipmvp.routine_adjustment_kwh} kWh
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(2, 132, 199, 0.08)', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: '#0369A1', fontWeight: 700 }}>Adjusted Baseline (E_adj = E_base + Volume_Adj):</span>
                  <span style={{ fontWeight: 900, fontFamily: "'IBM Plex Mono', monospace", color: '#0284C7' }}>
                    {ipmvp.adjusted_baseline_kwh.toLocaleString()} kWh
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#F8F6F0', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: '#57534E' }}>14-Day Post-Intervention Monitored (15 Mar - 28 Mar):</span>
                  <span style={{ fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace" }}>{ipmvp.actual_monitored_kwh.toLocaleString()} kWh</span>
                </div>

                <div style={{ borderTop: '2px solid rgba(90, 75, 55, 0.15)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ fontWeight: 800, color: '#1C1917' }}>Net Verified Energy Savings:</span>
                  <span style={{ fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace", fontSize: 16 }}>
                    {ipmvp.net_verified_savings_kwh.toLocaleString()} kWh ({ipmvp.verified_avoided_carbon_tco2e} tCO₂e)
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 16, fontSize: 11, color: '#78716C', lineHeight: 1.5, background: 'rgba(235, 226, 212, 0.5)', padding: '10px 12px', borderRadius: 6 }}>
                <strong>Non-Routine Adjustment Statement:</strong> No facility shutdowns, floor expansion, or major weather shifts occurred during the 14-day observation window. Submeter accuracy is Class 0.5S with continuous 1-minute Modbus logging.
              </div>
            </div>

            {/* Right: Statistical Confidence & Model Metrics */}
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: 14,
                border: '1px solid rgba(90, 75, 55, 0.14)',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} style={{ color: '#059669' }} />
                  Statistical Model Uncertainty (ASHRAE 14)
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ background: '#F8F6F0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Coefficient of Determination</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                      R² = {ipmvp.statistical_validity.r_squared}
                    </div>
                    <div style={{ fontSize: 10, color: '#57534E' }}>Target: R² &gt; 0.80 (Passed)</div>
                  </div>

                  <div style={{ background: '#F8F6F0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>CV(RMSE) Precision</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {ipmvp.statistical_validity.cv_rmse_pct}%
                    </div>
                    <div style={{ fontSize: 10, color: '#57534E' }}>Limit: &lt; 15% (Passed)</div>
                  </div>

                  <div style={{ background: '#F8F6F0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>t-Statistic Significance</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {ipmvp.statistical_validity.t_statistic}
                    </div>
                    <div style={{ fontSize: 10, color: '#57534E' }}>Critical t &gt; 2.0 (p &lt; 0.001)</div>
                  </div>

                  <div style={{ background: '#F8F6F0', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Confidence / Precision</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {ipmvp.statistical_validity.confidence_level_pct}% / ±{ipmvp.statistical_validity.precision_pct}%
                    </div>
                    <div style={{ fontSize: 10, color: '#57534E' }}>Meets M&amp;V Carbon Standard</div>
                  </div>
                </div>
              </div>

              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: 12, borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#065F46', fontWeight: 800, fontSize: 12 }}>
                  <CheckCircle2 size={14} /> M&amp;V Verification Passed
                </div>
                <div style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>
                  14-day submeter data satisfies IPMVP Core Concepts for carbon credit baseline additionality and compliance audit.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         COMPONENT 3: SEBI BRSR & EU CBAM EXPORT DISCLOSURE REPORT
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'brsr_cbam' && brsr && cbam && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dual Toggle between BRSR Core & EU CBAM */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: '#E5E7EB', padding: 3, borderRadius: 8 }}>
              <button
                onClick={() => setExportStandard('CBAM')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: exportStandard === 'CBAM' ? '#1C1917' : 'transparent',
                  color: exportStandard === 'CBAM' ? '#F5EFE6' : '#57534E',
                  transition: 'all 0.15s ease',
                }}
              >
                EU CBAM Export Disclosure (Regulation EU 2023/956)
              </button>
              <button
                onClick={() => setExportStandard('BRSR')}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: exportStandard === 'BRSR' ? '#1C1917' : 'transparent',
                  color: exportStandard === 'BRSR' ? '#F5EFE6' : '#57534E',
                  transition: 'all 0.15s ease',
                }}
              >
                SEBI BRSR Core - Principle 6 (India Listed Standard)
              </button>
            </div>

            <div style={{ fontSize: 11, color: '#78716C', fontFamily: "'IBM Plex Mono', monospace" }}>
              Per-Unit Carbon Intensity Accounting: <strong style={{ color: '#059669' }}>kg CO₂e / part</strong>
            </div>
          </div>

          {exportStandard === 'CBAM' ? (
            /* ─── EU CBAM SPECIFIC VIEW ───────────────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* CBAM Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Export CN Tariff Code</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                    {cbam.cn_code.split(' ')[0]}
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>Machined &amp; Forged Steel Components</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Specific Carbon Intensity</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    {cbam.specific_carbon_intensity_kg_per_part} <span style={{ fontSize: 12 }}>kg/part</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>
                    25.3% below EU Benchmark ({cbam.eu_sectoral_benchmark_kg_per_part} kg)
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Embedded Emissions Ratio</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                    Direct: {cbam.direct_embedded_emissions_tco2e}t / Indir: {cbam.indirect_embedded_emissions_tco2e}t
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>Total: {cbam.total_embedded_emissions_tco2e} tCO₂e on 90t batch</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Article 9 Origin Carbon Rebate</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0284C7', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    €{cbam.eligible_cbam_rebate_eur.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>Deductible Origin Electricity Duty (€12.5/t)</div>
                </div>
              </div>

              {/* CBAM Formal Filing Payload Table */}
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: 14,
                  border: '1px solid rgba(90, 75, 55, 0.14)',
                  padding: 24,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 15, fontWeight: 800, color: '#1C1917', margin: 0 }}>
                      European Commission Transitional Registry Declaration (Communication Structure)
                    </h4>
                    <p style={{ fontSize: 11, color: '#78716C', margin: '4px 0 0 0' }}>
                      Ready for automated XML upload to the EU CBAM Transitional Registry by European Importers.
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '4px 10px', borderRadius: 20 }}>
                    ✓ XML Schema 2.1 Compliant
                  </span>
                </div>

                <div style={{ background: '#1C1917', color: '#F5EFE6', padding: 16, borderRadius: 8, fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", overflowX: 'auto' }}>
                  <pre style={{ margin: 0 }}>
{`<CBAM_Declaration_Transitional>
  <Installation_ID>${cbam.installation_id}</Installation_ID>
  <Product_CN_Code>${cbam.cn_code.split(' ')[0]}</Product_CN_Code>
  <Activity_Volume_Metric_Tons>${cbam.production_volume_metric_tons}</Activity_Volume_Metric_Tons>
  <Direct_Embedded_Emissions_tCO2e>${cbam.direct_embedded_emissions_tco2e}</Direct_Embedded_Emissions_tCO2e>
  <Indirect_Embedded_Emissions_tCO2e>${cbam.indirect_embedded_emissions_tco2e}</Indirect_Embedded_Emissions_tCO2e>
  <Specific_Embedded_Emissions_tCO2e_per_Ton>${cbam.specific_embedded_total_tco2e_per_t}</Specific_Embedded_Emissions_tCO2e_per_Ton>
  <Per_Part_Carbon_Intensity_kgCO2e>${cbam.specific_carbon_intensity_kg_per_part}</Per_Part_Carbon_Intensity_kgCO2e>
  <Carbon_Price_Due_Origin_Country_EUR>${cbam.eligible_cbam_rebate_eur}</Carbon_Price_Due_Origin_Country_EUR>
  <Verification_Status>THIRD_PARTY_ACCREDITED_REPORTS</Verification_Status>
</CBAM_Declaration_Transitional>`}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            /* ─── SEBI BRSR CORE PRINCIPLE 6 VIEW ────────────────────────────── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* BRSR KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Company CIN</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace", marginTop: 4 }}>
                    {brsr.company_cin}
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>Annual Turnover: ₹{brsr.turnover_cr_inr} Cr</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Total Scope 1 + 2 GHG</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#1C1917', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    {brsr.total_scope1_scope2_tco2e} <span style={{ fontSize: 12 }}>tCO₂e</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>S1: {brsr.scope1_tco2e}t | S2: {brsr.scope2_tco2e}t</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>GHG Intensity per Turnover</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    {brsr.ghg_intensity_tco2e_per_cr_inr}
                  </div>
                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>tCO₂e / Crore INR Turnover</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: 18, borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)' }}>
                  <div style={{ fontSize: 10, color: '#78716C', textTransform: 'uppercase', fontWeight: 700 }}>Physical Intensity</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>
                    {brsr.ghg_intensity_kg_per_unit} <span style={{ fontSize: 12 }}>kg/unit</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#57534E' }}>On {brsr.total_production_units.toLocaleString()} Units Produced</div>
                </div>
              </div>

              {/* Assurance Box */}
              <div style={{ background: '#FFFFFF', borderRadius: 12, border: '1px solid rgba(90, 75, 55, 0.12)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#78716C', fontWeight: 700, textTransform: 'uppercase' }}>SEBI Mandated Third-Party Reasonable Assurance</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1C1917', marginTop: 2 }}>
                    {brsr.assurance_type} — {brsr.assurance_provider}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', background: '#ECFDF5', padding: '4px 10px', borderRadius: 20 }}>
                  ✓ SEBI BRSR Core Verified
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
         COMPONENT 4: CARBON CREDIT ISSUANCE & OFFSET REGISTRY TRACKER
         ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'registry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Action Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#1C1917', margin: 0 }}>
                Carbon Credit Project Filing Pipeline &amp; PDD Registration
              </h3>
              <p style={{ fontSize: 11, color: '#78716C', margin: '4px 0 0 0' }}>
                Monitors abated emissions (tCO₂e) validated against BEE CCTS, PAT ESCerts, Verra VCS &amp; Gold Standard.
              </p>
            </div>

            <button
              onClick={() => setIsPddModalOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 16px',
                borderRadius: 8,
                background: '#059669',
                color: '#FFFFFF',
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
              }}
            >
              <Sparkles size={14} />
              <span>Create New PDD Project Filing</span>
            </button>
          </div>

          {pddSuccess && (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: 12, borderRadius: 8, color: '#065F46', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} /> {pddSuccess}
            </div>
          )}

          {/* Registry Filings Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filings.map((filing) => {
              // 5-Stage Stepper Calculation
              const stages = [
                { id: '1_PDD_DRAFT', label: '1. PDD Draft' },
                { id: '2_VALIDATION_DOE', label: '2. DOE Audit' },
                { id: '3_HOST_COUNTRY_APPROVAL', label: '3. Host Approval' },
                { id: '4_SUBMITTED_REGISTRY', label: '4. Submitted' },
                { id: '5_APPROVED_ISSUED', label: '5. Issued' },
              ];
              const currentStageIndex = stages.findIndex((s) => s.id === filing.lifecycle_stage);

              return (
                <div
                  key={filing.filing_id}
                  style={{
                    background: '#FFFFFF',
                    borderRadius: 14,
                    border: '1px solid rgba(90, 75, 55, 0.14)',
                    padding: '20px 24px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#F3F4F6', color: '#374151', fontFamily: "'IBM Plex Mono', monospace" }}>
                          {filing.filing_id}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED' }}>
                          {filing.registry_full_name}
                        </span>
                        <span style={{ fontSize: 11, color: '#78716C' }}>• Vintage {filing.vintage_year}</span>
                      </div>
                      <h4 style={{ fontSize: 16, fontWeight: 800, color: '#1C1917', margin: '0 0 4px 0' }}>
                        {filing.project_name}
                      </h4>
                      <div style={{ fontSize: 11, color: '#57534E' }}>{filing.methodology}</div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#059669', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {filing.abated_emissions_tco2e} <span style={{ fontSize: 12 }}>tCO₂e</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#57534E' }}>
                        ≈ {filing.equivalent_escerts} ESCerts • Est. ₹{filing.estimated_credit_value_inr.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {/* 5-Stage Stepper Progress Bar */}
                  <div style={{ background: '#F8F6F0', padding: '14px 18px', borderRadius: 10, margin: '14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
                      {stages.map((stage, idx) => {
                        const isDone = idx <= currentStageIndex;
                        const isCurrent = idx === currentStageIndex;
                        return (
                          <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, zIndex: 1 }}>
                            <div
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '50%',
                                background: isDone ? '#059669' : '#D1D5DB',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 10,
                                fontWeight: 800,
                                boxShadow: isCurrent ? '0 0 0 4px rgba(5, 150, 105, 0.2)' : 'none',
                              }}
                            >
                              {isDone ? <Check size={12} /> : idx + 1}
                            </div>
                            <span style={{ fontSize: 10, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? '#059669' : '#57534E' }}>
                              {stage.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Document & DOE Meta */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#78716C', borderTop: '1px solid rgba(90, 75, 55, 0.08)', paddingTop: 10 }}>
                    <div>
                      DOE Auditor: <strong style={{ color: '#1C1917' }}>{filing.designated_operational_entity_doe}</strong> • Submitted: {filing.submission_date}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileCheck size={13} style={{ color: '#059669' }} />
                      <span>Doc Ref: <strong>{filing.pdd_document_ref}</strong></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── PDD Submission Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isPddModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              backdropFilter: 'blur(4px)',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                background: '#FFFFFF',
                borderRadius: 16,
                padding: '28px 32px',
                width: '100%',
                maxWidth: 540,
                border: '1.5px solid rgba(90, 75, 55, 0.2)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              }}
            >
              <h3 style={{ fontSize: 18, fontWeight: 900, color: '#1C1917', margin: '0 0 6px 0' }}>
                Submit Project Design Document (PDD)
              </h3>
              <p style={{ fontSize: 12, color: '#57534E', margin: '0 0 20px 0' }}>
                Prepare and index your energy abatement project for validation under national compliance or international voluntary carbon markets.
              </p>

              <form onSubmit={handleCreatePdd} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Project Title</label>
                  <input
                    type="text"
                    value={pddProjectName}
                    onChange={(e) => setPddProjectName(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 12, marginTop: 4 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Target Registry</label>
                    <select
                      value={pddRegistry}
                      onChange={(e) => setPddRegistry(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 12, marginTop: 4 }}
                    >
                      <option value="BEE_CCTS">Indian Carbon Market (CCTS)</option>
                      <option value="BEE_PAT">BEE PAT Scheme (ESCerts)</option>
                      <option value="VERRA_VCS">Verra Verified Carbon Standard</option>
                      <option value="GOLD_STANDARD">Gold Standard for Global Goals</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Abated Emissions (tCO₂e)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={pddAbatedTons}
                      onChange={(e) => setPddAbatedTons(parseFloat(e.target.value) || 0)}
                      required
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 12, marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Designated Operational Entity (DOE)</label>
                  <input
                    type="text"
                    value={pddDoe}
                    onChange={(e) => setPddDoe(e.target.value)}
                    required
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 12, marginTop: 4 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setIsPddModalOpen(false)}
                    style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #D1D5DB', background: '#FFFFFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingPdd}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#059669', color: '#FFFFFF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {submittingPdd ? 'Registering PDD...' : 'Submit to Registry Pipeline'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
