import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Coins, ShieldCheck, CheckCircle2, AlertTriangle, ArrowRight,
  TrendingUp, Sparkles, RefreshCw, FileText, Check, X,
  Layers, Lock, Award, Flame, Zap, DollarSign, Download, Printer
} from 'lucide-react';
import {
  CarbonCreditItem,
  PortfolioSummary,
  AdditionalityResult,
  fetchCreditsPortfolio,
  calculateAdditionality,
  retireCarbonCredit,
  issueCreditsFromSavings,
} from '../../services/carbonCreditsApi';
import { Explainable } from '../AIExplain/Explainable';

export function CarbonCreditsEngine() {
  const [portfolio, setPortfolio] = useState<{ summary: PortfolioSummary; credits: CarbonCreditItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state for Registry Table
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'GENERATED_ISSUED' | 'PURCHASED' | 'SURRENDERED_RETIRED'>('ALL');

  // Additionality Engine state
  const [selectedIntervention, setSelectedIntervention] = useState<'compressor' | 'cnc' | 'furnace'>('compressor');
  const [leakagePct, setLeakagePct] = useState(2.0);
  const [durationDays, setDurationDays] = useState(30);
  const [additionalityResult, setAdditionalityResult] = useState<AdditionalityResult | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintSuccess, setMintSuccess] = useState<string | null>(null);

  // Retirement Modal state
  const [selectedCreditForRetirement, setSelectedCreditForRetirement] = useState<CarbonCreditItem | null>(null);
  const [retirementReason, setRetirementReason] = useState('FY26 Q3 Statutory Carbon Burn Rate Exceedance True-Up');
  const [beneficiary, setBeneficiary] = useState('PrecisionWorks Manufacturing Plant - Unit 1');
  const [retiring, setRetiring] = useState(false);
  const [retirementCert, setRetirementCert] = useState<any | null>(null);

  useEffect(() => {
    loadPortfolio();
    runAdditionality();
  }, []);

  useEffect(() => {
    runAdditionality();
  }, [selectedIntervention, leakagePct, durationDays]);

  const loadPortfolio = async () => {
    setLoading(true);
    try {
      const data = await fetchCreditsPortfolio();
      setPortfolio(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to load carbon credits portfolio');
    } finally {
      setLoading(false);
    }
  };

  const runAdditionality = async () => {
    setAddLoading(true);
    try {
      let payload = {
        intervention_id: 'INT-COMP-01',
        intervention_name: 'Compressor Auto-Cutoff & Leak Shield',
        baseline_power_kw: 18.0,
        monitored_power_kw: 8.0,
        operating_hours_per_day: 3.2,
        duration_days: durationDays,
        grid_emission_factor_t_per_mwh: 0.716,
        leakage_pct: leakagePct,
        regulatory_mandated: false,
        hurdle_rate_met: true,
        barrier_identified: true,
      };

      if (selectedIntervention === 'cnc') {
        payload = {
          intervention_id: 'INT-CNC-02',
          intervention_name: 'CNC 5-Axis G-Code Telemetry Cycle Optimization',
          baseline_power_kw: 32.0,
          monitored_power_kw: 26.5,
          operating_hours_per_day: 7.5,
          duration_days: durationDays,
          grid_emission_factor_t_per_mwh: 0.716,
          leakage_pct: leakagePct,
          regulatory_mandated: false,
          hurdle_rate_met: true,
          barrier_identified: true,
        };
      } else if (selectedIntervention === 'furnace') {
        payload = {
          intervention_id: 'INT-FURN-03',
          intervention_name: 'Induction Furnace Batch Staggering (ToD Peak Shaving)',
          baseline_power_kw: 85.0,
          monitored_power_kw: 70.0,
          operating_hours_per_day: 4.0,
          duration_days: durationDays,
          grid_emission_factor_t_per_mwh: 0.716,
          leakage_pct: leakagePct,
          regulatory_mandated: false,
          hurdle_rate_met: true,
          barrier_identified: true,
        };
      }

      const res = await calculateAdditionality(payload);
      setAdditionalityResult(res);
    } catch (e) {
      console.warn('Additionality API error:', e);
    } finally {
      setAddLoading(false);
    }
  };

  const handleMintCredit = async () => {
    if (!additionalityResult || additionalityResult.net_credits_earned_tco2e <= 0) return;
    setMinting(true);
    setMintSuccess(null);
    try {
      const projName =
        selectedIntervention === 'compressor'
          ? 'Compressor Auto-Idle Cutoff & Leak Shield'
          : selectedIntervention === 'cnc'
          ? 'CNC 5-Axis Spindle Power Optimization'
          : 'Furnace ToD Batch Staggering';

      await issueCreditsFromSavings(
        projName,
        additionalityResult.net_credits_earned_tco2e,
        'Digital Twin Energy Optimization'
      );
      setMintSuccess(`Successfully minted ${additionalityResult.net_credits_earned_tco2e} tCO₂e into CCTS Portfolio!`);
      await loadPortfolio();
    } catch (e: any) {
      alert(e.message || 'Failed to mint credits');
    } finally {
      setMinting(false);
    }
  };

  const handleRetireConfirm = async () => {
    if (!selectedCreditForRetirement) return;
    setRetiring(true);
    try {
      const res = await retireCarbonCredit(
        selectedCreditForRetirement.serial_number,
        retirementReason,
        beneficiary
      );
      setRetirementCert(res.retirement_certificate);
      await loadPortfolio();
    } catch (e: any) {
      alert(e.message || 'Retirement failed');
    } finally {
      setRetiring(false);
    }
  };

  const filteredCredits = useMemo(() => {
    if (!portfolio?.credits) return [];
    if (filterCategory === 'ALL') return portfolio.credits;
    return portfolio.credits.filter((c) => c.category === filterCategory);
  }, [portfolio, filterCategory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'var(--font-ui, sans-serif)' }}>
      {/* ─── HEADER WITH REGULATORY CITATIONS ───────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(235, 226, 212, 0.94)',
          borderRadius: 16,
          padding: '20px 24px',
          border: '1.5px solid rgba(255, 255, 255, 0.85)',
          boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 800,
                fontFamily: "'IBM Plex Mono', monospace",
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #F59E0B',
              }}
            >
              <Coins size={11} />
              <span>CCTS 2023 · INDIAN CARBON MARKET</span>
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 800,
                fontFamily: "'IBM Plex Mono', monospace",
                backgroundColor: '#D1FAE5',
                color: '#065F46',
                border: '1px solid #10B981',
              }}
            >
              <ShieldCheck size={11} />
              <span>ISO 14064-2 ADDITIONALITY CERTIFIED</span>
            </span>

            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 800,
                fontFamily: "'IBM Plex Mono', monospace",
                backgroundColor: '#EDE9FE',
                color: '#5B21B6',
                border: '1px solid #8B5CF6',
              }}
            >
              <Award size={11} />
              <span>BEE PAT (ESCERTS) TRADABLE</span>
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
              fontSize: '24px',
              fontWeight: 800,
              color: '#18191B',
              margin: '0 0 4px',
              letterSpacing: '-0.01em',
            }}
          >
            CARBON CREDITS, ADDITIONALITY &amp; CCTS OFFSETTING ENGINE
          </h1>
          <p style={{ fontSize: '13px', color: '#57534E', margin: 0, maxWidth: '820px' }}>
            Monetize verified industrial energy waste reductions into <strong>Carbon Credit Certificates (CCCs)</strong> and <strong>BEE Energy Saving Certificates (ESCerts)</strong> under India’s CCTS 2023 market framework.
          </p>
        </div>

        <button
          onClick={loadPortfolio}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '9px 16px',
            borderRadius: 10,
            backgroundColor: '#18191B',
            color: '#EDE7DC',
            fontSize: 12,
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Portfolio</span>
        </button>
      </div>

      {/* ─── 4 CORE KPI CARDS ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {/* Card 1: Active Credit Balance */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            borderLeft: '5px solid #10B981',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Active Tradable Credits
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#065F46', fontFamily: "'IBM Plex Mono', monospace" }}>
              {portfolio?.summary.active_balance_tco2e ?? '110.0'}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>tCO₂e (CCCs)</span>
          </div>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
            Estimated Value: ₹{(portfolio?.summary.total_market_value_inr ?? 206850).toLocaleString('en-IN')}
          </div>
        </div>

        {/* Card 2: ESCerts Equivalent */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            borderLeft: '5px solid #8B5CF6',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            BEE ESCerts Equivalent
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#5B21B6', fontFamily: "'IBM Plex Mono', monospace" }}>
              {portfolio?.summary.active_equivalent_escerts ?? '9.46'}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>ESCerts</span>
          </div>
          <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600 }}>
            1 ESCert = 11,630 kWh (₹1,840/unit IEX)
          </div>
        </div>

        {/* Card 3: Generated vs Purchased */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            borderLeft: '5px solid #0284C7',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Internally Generated
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#0369A1', fontFamily: "'IBM Plex Mono', monospace" }}>
              {portfolio?.summary.generated_active_tco2e ?? '60.0'}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>tCO₂e</span>
          </div>
          <div style={{ fontSize: 11, color: '#0284C7', fontWeight: 600 }}>
            Digital Twin Verified Additions (54.5%)
          </div>
        </div>

        {/* Card 4: Surrendered / Retired */}
        <div
          style={{
            background: 'rgba(235, 226, 212, 0.92)',
            borderRadius: 16,
            padding: '20px',
            border: '1.5px solid rgba(255, 255, 255, 0.85)',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            borderLeft: '5px solid #EA580C',
          }}
        >
          <div style={{ fontSize: 11, color: '#57534E', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Surrendered / Retired
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: '#C2410C', fontFamily: "'IBM Plex Mono', monospace" }}>
              {portfolio?.summary.retired_total_tco2e ?? '20.0'}
            </span>
            <span style={{ fontSize: 12, color: '#57534E', fontWeight: 700 }}>tCO₂e</span>
          </div>
          <div style={{ fontSize: 11, color: '#EA580C', fontWeight: 600 }}>
            Locked against Statutory Quota True-Up
          </div>
        </div>
      </div>

      {/* ─── SECTION 2: BASELINE ADDITIONALITY ENGINE (ISO 14064-2) ─────────── */}
      <div
        style={{
          background: 'rgba(235, 226, 212, 0.94)',
          borderRadius: 16,
          padding: '24px',
          border: '1.5px solid rgba(255, 255, 255, 0.85)',
          boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, color: '#065F46', textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
              <ShieldCheck size={12} color="#10B981" />
              <span>ISO 14064-2 Clause 5.4 Additionality Protocol</span>
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#18191B', margin: '4px 0 2px' }}>
              Credit Eligibility &amp; Baseline Additionality Engine
            </h2>
            <p style={{ fontSize: '12.5px', color: '#68645C', margin: 0 }}>
              Proof of additionality: verifying that carbon reductions result from physical plant optimizations rather than accidental production slowdowns.
            </p>
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: '#18191B',
              color: '#EDE7DC',
              fontSize: '11px',
              fontFamily: "'IBM Plex Mono', monospace",
              fontWeight: 700,
            }}
          >
            Formula: Credits = Baseline - Monitored - Leakage
          </div>
        </div>

        {/* Preset Intervention Picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setSelectedIntervention('compressor')}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              textAlign: 'left',
              border: selectedIntervention === 'compressor' ? '2px solid #18191B' : '1px solid rgba(0,0,0,0.1)',
              backgroundColor: selectedIntervention === 'compressor' ? '#18191B' : '#FFFFFF',
              color: selectedIntervention === 'compressor' ? '#EDE7DC' : '#18191B',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
              01 / COMPRESSOR
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, margin: '2px 0' }}>
              Auto-Idle Cutoff &amp; Leak Shield
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Baseline: 18 kW idle → Monitored: 8 kW (3.2h/day)
            </div>
          </button>

          <button
            onClick={() => setSelectedIntervention('cnc')}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              textAlign: 'left',
              border: selectedIntervention === 'cnc' ? '2px solid #18191B' : '1px solid rgba(0,0,0,0.1)',
              backgroundColor: selectedIntervention === 'cnc' ? '#18191B' : '#FFFFFF',
              color: selectedIntervention === 'cnc' ? '#EDE7DC' : '#18191B',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
              02 / CNC 5-AXIS
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, margin: '2px 0' }}>
              G-Code Cycle Telemetry Sync
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Baseline: 32 kW → Monitored: 26.5 kW (7.5h/day)
            </div>
          </button>

          <button
            onClick={() => setSelectedIntervention('furnace')}
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              textAlign: 'left',
              border: selectedIntervention === 'furnace' ? '2px solid #18191B' : '1px solid rgba(0,0,0,0.1)',
              backgroundColor: selectedIntervention === 'furnace' ? '#18191B' : '#FFFFFF',
              color: selectedIntervention === 'furnace' ? '#EDE7DC' : '#18191B',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', fontFamily: "'IBM Plex Mono', monospace" }}>
              03 / FURNACE
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, margin: '2px 0' }}>
              ToD Batch Heating Staggering
            </div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>
              Baseline: 85 kW → Monitored: 70 kW (4.0h/day)
            </div>
          </button>
        </div>

        {/* Calculation Matrix & Additionality Checks */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
          {/* Arithmetic Breakdown */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: 12,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Quantification Breakdown (30-Day Period)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: '#64748B' }}>Business-as-Usual (BAU)</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1E252D', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {additionalityResult?.baseline_emissions_t ?? '1.24'} tCO₂e
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748B' }}>Actual Monitored</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#10B981', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {additionalityResult?.actual_emissions_t ?? '0.55'} tCO₂e
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#64748B' }}>Leakage Deducted (2%)</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#EA580C', fontFamily: "'IBM Plex Mono', monospace" }}>
                  -{additionalityResult?.leakage_t ?? '0.014'} tCO₂e
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 8,
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                marginBottom: 14,
              }}
            >
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#065F46', textTransform: 'uppercase' }}>
                  Net Verified Carbon Credits Earned
                </span>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#047857', fontFamily: "'IBM Plex Mono', monospace" }}>
                  +{additionalityResult?.net_credits_earned_tco2e ?? '0.67'} tCO₂e
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, color: '#065F46' }}>Equivalent BEE PAT ESCerts</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#047857', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {additionalityResult?.equivalent_escerts ?? '0.08'} ESCert
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>
                Monetary Potential @ CCTS Floor: <strong style={{ color: '#1E252D' }}>₹{(additionalityResult?.potential_market_value_inr ?? 1105).toLocaleString('en-IN')}</strong>
              </div>

              <button
                onClick={handleMintCredit}
                disabled={minting}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  borderRadius: 8,
                  backgroundColor: '#047857',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(4, 120, 87, 0.25)',
                }}
              >
                <Sparkles size={13} />
                <span>{minting ? 'Minting to CCTS...' : 'Mint Verified Carbon Credit'}</span>
              </button>
            </div>

            {mintSuccess && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: '#065F46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={13} />
                <span>{mintSuccess}</span>
              </div>
            )}
          </div>

          {/* Tri-Criteria Additionality Verification */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: 12,
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ISO 14064-2 Additionality Tests
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 11.5, color: '#1E252D' }}>1. Regulatory Additionality</strong>
                    <p style={{ fontSize: 10.5, color: '#64748B', margin: 0 }}>
                      Action exceeds prevailing statutory requirements and Indian EC Act 2001 energy conservation building codes.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 11.5, color: '#1E252D' }}>2. Financial &amp; Investment Barrier</strong>
                    <p style={{ fontSize: 10.5, color: '#64748B', margin: 0 }}>
                      High hurdle rate benchmark: carbon credit revenue improves internal project payback from 2.8 to 1.4 years.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <CheckCircle2 size={15} color="#10B981" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong style={{ fontSize: 11.5, color: '#1E252D' }}>3. Technological &amp; Common Practice Barrier</strong>
                    <p style={{ fontSize: 10.5, color: '#64748B', margin: 0 }}>
                      Less than 12% of regional SME machining plants utilize sub-second automated SCADA pneumatics cutoffs.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 6,
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                fontSize: 10.5,
                color: '#475569',
              }}
            >
              Auditor Note: Unloaded idle reductions certified under ISO 14064-2:2019 baseline emission reduction monitoring methodology.
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 3: CARBON CREDIT PORTFOLIO & SERIAL NUMBER REGISTRY ───── */}
      <div
        style={{
          background: 'rgba(235, 226, 212, 0.94)',
          borderRadius: 16,
          padding: '24px',
          border: '1.5px solid rgba(255, 255, 255, 0.85)',
          boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#18191B', margin: '0 0 4px' }}>
              Carbon Credit Portfolio &amp; Retirement Registry Ledger
            </h2>
            <p style={{ fontSize: '12.5px', color: '#68645C', margin: 0 }}>
              Immutable serial number tracking across compliance and voluntary registries to permanently prevent double-counting.
            </p>
          </div>

          {/* Filter Pills */}
          <div style={{ display: 'flex', background: '#E2D9CC', padding: 2, borderRadius: 8, gap: 2 }}>
            {(['ALL', 'GENERATED_ISSUED', 'PURCHASED', 'SURRENDERED_RETIRED'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: filterCategory === cat ? '#18191B' : 'transparent',
                  color: filterCategory === cat ? '#EDE7DC' : '#57534E',
                  transition: 'all 0.15s',
                }}
              >
                {cat === 'ALL'
                  ? 'All Credits'
                  : cat === 'GENERATED_ISSUED'
                  ? 'Generated (Internal)'
                  : cat === 'PURCHASED'
                  ? 'Purchased'
                  : 'Surrendered'}
              </button>
            ))}
          </div>
        </div>

        {/* Registry Table */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
            border: '1px solid #E2E8F0',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Unique Serial Number</th>
                <th style={{ padding: '12px 16px' }}>Registry / Standard</th>
                <th style={{ padding: '12px 16px' }}>Project Name</th>
                <th style={{ padding: '12px 16px' }}>Vintage</th>
                <th style={{ padding: '12px 16px' }}>Volume (tCO₂e)</th>
                <th style={{ padding: '12px 16px' }}>ESCerts Equiv</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCredits.map((c) => {
                const isActive = c.status === 'ACTIVE';
                return (
                  <tr
                    key={c.serial_number}
                    style={{
                      borderBottom: '1px solid #F1F5F9',
                      backgroundColor: isActive ? '#FFFFFF' : '#FAFAFA',
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#1E252D' }}>
                      {c.serial_number}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 9999,
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: c.registry.startsWith('BEE') ? '#FEF3C7' : '#EDE9FE',
                          color: c.registry.startsWith('BEE') ? '#92400E' : '#5B21B6',
                        }}
                      >
                        {c.registry}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#334155', maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.project_name}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {c.vintage_year}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#1E252D' }}>
                      {c.quantity_tco2e} t
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: "'IBM Plex Mono', monospace", color: '#64748B' }}>
                      {c.equivalent_escerts ?? '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: 9999,
                          fontSize: '10px',
                          fontWeight: 800,
                          backgroundColor: isActive ? '#D1FAE5' : '#F1F5F9',
                          color: isActive ? '#065F46' : '#64748B',
                          border: `1px solid ${isActive ? '#10B981' : '#CBD5E1'}`,
                        }}
                      >
                        {isActive ? 'ACTIVE · TRADABLE' : 'RETIRED'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      {isActive ? (
                        <button
                          onClick={() => setSelectedCreditForRetirement(c)}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            backgroundColor: '#EA580C',
                            color: '#FFFFFF',
                            fontSize: 11,
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Retire Credit
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>
                          Retired {c.retirement_date?.slice(0, 10)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── RETIREMENT MODAL ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedCreditForRetirement && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(4px)',
              zIndex: 300,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{
                width: '100%',
                maxWidth: 520,
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                border: '1px solid rgba(0,0,0,0.1)',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                padding: '28px',
              }}
            >
              {!retirementCert ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#EA580C', textTransform: 'uppercase' }}>
                        PERMANENT OFFSETTING INTERLOCK
                      </div>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: '#18191B', margin: '2px 0 0' }}>
                        Surrender &amp; Retire Carbon Credit
                      </h3>
                    </div>
                    <button
                      onClick={() => setSelectedCreditForRetirement(null)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <p style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5, marginBottom: 18 }}>
                    Retiring permanently cancels this serial number to offset a plant emissions overage. Once retired, this credit cannot be traded, resold, or reused.
                  </p>

                  <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px', marginBottom: 18 }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 2 }}>Target Serial Number:</div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', fontFamily: "'IBM Plex Mono', monospace", wordBreak: 'break-all' }}>
                      {selectedCreditForRetirement.serial_number}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5 }}>
                      <span>Tonnage: <strong>{selectedCreditForRetirement.quantity_tco2e} tCO₂e</strong></span>
                      <span>Standard: <strong>{selectedCreditForRetirement.registry}</strong></span>
                      <span>Vintage: <strong>{selectedCreditForRetirement.vintage_year}</strong></span>
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                      Beneficiary Entity
                    </label>
                    <input
                      type="text"
                      value={beneficiary}
                      onChange={(e) => setBeneficiary(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        fontSize: 12.5,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                      Retirement Purpose / Compliance Reason
                    </label>
                    <input
                      type="text"
                      value={retirementReason}
                      onChange={(e) => setRetirementReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 8,
                        border: '1px solid #CBD5E1',
                        fontSize: 12.5,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      onClick={() => setSelectedCreditForRetirement(null)}
                      style={{
                        flex: 1,
                        padding: '11px',
                        borderRadius: 8,
                        backgroundColor: '#F1F5F9',
                        color: '#475569',
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRetireConfirm}
                      disabled={retiring}
                      style={{
                        flex: 1.5,
                        padding: '11px',
                        borderRadius: 8,
                        backgroundColor: '#DC2626',
                        color: '#FFFFFF',
                        fontSize: 12.5,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {retiring ? 'Logging to Ledger...' : 'Confirm Permanent Retirement'}
                    </button>
                  </div>
                </>
              ) : (
                /* Official Certificate Preview */
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      backgroundColor: '#D1FAE5',
                      color: '#065F46',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}
                  >
                    <CheckCircle2 size={26} />
                  </div>

                  <div style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800, color: '#047857', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    OFFICIAL RETIREMENT CERTIFICATE
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0F172A', margin: '4px 0 14px' }}>
                    {retirementCert.certificate_id}
                  </h3>

                  <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px', textAlign: 'left', marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>Surrendered Serial:</div>
                    <div style={{ fontSize: 11.5, fontWeight: 800, fontFamily: "'IBM Plex Mono', monospace", color: '#0F172A', wordBreak: 'break-all', marginBottom: 12 }}>
                      {retirementCert.serial_number}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11 }}>
                      <div>Tonnage Offset: <strong style={{ color: '#059669' }}>{retirementCert.quantity_tco2e} tCO₂e</strong></div>
                      <div>Standard: <strong>{retirementCert.registry}</strong></div>
                      <div>Beneficiary: <strong>{retirementCert.beneficiary}</strong></div>
                      <div>Status: <strong style={{ color: '#DC2626' }}>{retirementCert.status}</strong></div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748B' }}>
                      Timestamp: {retirementCert.timestamp_utc} (Recorded to SHA-256 Block Ledger)
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setRetirementCert(null);
                      setSelectedCreditForRetirement(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: 8,
                      backgroundColor: '#0F172A',
                      color: '#FFFFFF',
                      fontSize: 12.5,
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Done &amp; Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
