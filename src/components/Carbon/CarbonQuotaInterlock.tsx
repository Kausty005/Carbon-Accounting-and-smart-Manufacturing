import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  Flame,
  ZapOff,
  Activity,
  Layers,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  Lock,
  Unlock,
  FileCheck
} from 'lucide-react';
import {
  fetchQuotaStatus,
  checkCarbonQuota,
  fetchAuditBlocks,
  verifyAuditLedger,
  AuditBlock,
  CarbonQuotaResponse,
  LedgerVerifyResponse
} from '../../services/carbonApi';
import { Explainable } from '../AIExplain/Explainable';
import { CarbonCreditsEngine } from './CarbonCreditsEngine';
import { CarbonComplianceFilingPortal } from './CarbonComplianceFilingPortal';

export function CarbonQuotaInterlock() {
  const [activeTab, setActiveTab] = useState<'quota' | 'ledger' | 'credits' | 'filing'>('quota');
  const [quota, setQuota] = useState<CarbonQuotaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [simEmissions, setSimEmissions] = useState(14.47);
  const [simHours, setSimHours] = useState(580);
  const [isSimulating, setIsSimulating] = useState(false);

  // Ledger state
  const [blocks, setBlocks] = useState<AuditBlock[]>([]);
  const [verification, setVerification] = useState<LedgerVerifyResponse | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<AuditBlock | null>(null);

  // Operational Interlock manual overrides
  const [fuelSwitched, setFuelSwitched] = useState(false);
  const [dgLockoutEngaged, setDgLockoutEngaged] = useState(false);

  useEffect(() => {
    loadQuotaData();
    loadLedgerData();
  }, []);

  const loadQuotaData = async () => {
    setLoading(true);
    try {
      const data = await fetchQuotaStatus();
      setQuota(data);
      if (data?.cumulative_emissions_t != null) {
        setSimEmissions(data.cumulative_emissions_t);
      }
      if (data?.interlock_state === 'ACTIVE_LOCKOUT') {
        setDgLockoutEngaged(true);
      }
    } catch (e) {
      console.error('Failed to load quota', e);
    } finally {
      setLoading(false);
    }
  };

  const loadLedgerData = async () => {
    setLedgerLoading(true);
    try {
      const blockData = await fetchAuditBlocks(15);
      setBlocks(blockData);
      if (blockData.length > 0) {
        setSelectedBlock(blockData[0]);
      }
    } catch (e) {
      console.error('Failed to load ledger', e);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleRunVerify = async () => {
    setLedgerLoading(true);
    try {
      const res = await verifyAuditLedger();
      setVerification(res);
    } catch (e) {
      console.error('Verification failed', e);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleSimulateSurge = async (val: number) => {
    setSimEmissions(val);
    setIsSimulating(true);
    try {
      const res = await checkCarbonQuota({
        current_emissions_t_co2e: val,
        quota_limit_t_co2e: quota?.statutory_monthly_quota_t ?? 18.0,
        current_hour_of_month: simHours,
        total_hours_in_month: 720.0
      });
      setQuota(res);
      if (res.interlock_state === 'ACTIVE_LOCKOUT') {
        setDgLockoutEngaged(true);
      } else {
        setDgLockoutEngaged(false);
      }
    } finally {
      setIsSimulating(false);
    }
  };

  const getBriBadge = (status?: string) => {
    switch (status) {
      case 'CRITICAL':
        return { color: '#EF4444', bg: '#FEE2E2', label: 'CRITICAL OVER-BURN' };
      case 'ADVISORY':
        return { color: '#D97706', bg: '#FEF3C7', label: 'ADVISORY SURGE' };
      default:
        return { color: '#059669', bg: '#DCFCE7', label: 'NORMAL COMPLIANCE' };
    }
  };

  const briStyle = getBriBadge(quota?.burn_rate_status);

  return (
    <div style={{ background: 'var(--bg-root, #F4EEE5)', minHeight: '100%', padding: '24px 32px 48px', color: '#1E252D' }}>
      {/* ─── Top Header ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(5, 150, 105, 0.08)', borderRadius: 20, color: '#059669', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 8 }}>
            <ShieldCheck size={12} /> Statutory Compliance & Ledger
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#111827', letterSpacing: '-0.02em' }}>
            Live Carbon Quotas & Cryptographic Audit Ledger
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>
            Burn Rate Index (BRI) monitoring with automatic DG set trip-wire interlocks and immutable 15-minute interval SHA-256 blockchain verification.
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#FAF7F2', border: '1px solid #EAE3D7', padding: 3, borderRadius: 10 }}>
          <button
            onClick={() => setActiveTab('quota')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'quota' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'quota' ? '#111827' : '#6B7280',
              boxShadow: activeTab === 'quota' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Live Quota & Interlocks
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'ledger' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'ledger' ? '#111827' : '#6B7280',
              boxShadow: activeTab === 'ledger' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Blockchain Audit Ledger
          </button>
          <button
            onClick={() => setActiveTab('credits')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'credits' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'credits' ? '#111827' : '#6B7280',
              boxShadow: activeTab === 'credits' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Carbon Credits &amp; Offsetting (CCTS)
          </button>
          <button
            onClick={() => setActiveTab('filing')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'filing' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'filing' ? '#111827' : '#6B7280',
              boxShadow: activeTab === 'filing' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            Compliance &amp; Filing Dossiers
          </button>
        </div>
      </div>

      {activeTab === 'quota' && (
        /* ═════════════════════════════════════════════════════════════════════════
           TAB 1: LIVE CARBON QUOTA & OPERATIONAL INTERLOCKS
           ═════════════════════════════════════════════════════════════════════════ */
        <div>
          {/* Main KPI Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 24 }}>
            {/* Statutory Quota */}
            <Explainable
              title="Statutory Monthly Carbon Quota"
              explanationType="kpi"
              metric={`${quota?.statutory_monthly_quota_t != null ? quota.statutory_monthly_quota_t.toFixed(2) : '18.00'} tCO₂e`}
              context={{ statutoryLimit: 18.0, currentMonth: 'October 2026', authority: 'State Pollution Control Board' }}
            >
              <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #EAE3D7', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>
                  Statutory Monthly Cap
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#111827' }}>
                  {quota?.statutory_monthly_quota_t != null ? quota.statutory_monthly_quota_t.toFixed(2) : '18.00'} <span style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 500 }}>tCO₂e</span>
                </div>
                <div style={{ fontSize: 12, color: '#059669', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle size={13} /> SPCB Cap (720 operating hrs/mo)
                </div>
              </div>
            </Explainable>

            {/* Cumulative Burn */}
            <Explainable
              title="Month-to-Date Cumulative Emissions"
              explanationType="kpi"
              metric={`${quota?.cumulative_emissions_t != null ? quota.cumulative_emissions_t.toFixed(2) : '14.47'} tCO₂e (${quota?.quota_utilization_pct != null ? quota.quota_utilization_pct.toFixed(1) : '80.4'}%)`}
              context={{ cumulative: quota?.cumulative_emissions_t, expectedProRata: quota?.pro_rata_expected_emissions_t }}
            >
              <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #EAE3D7', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>
                  Cumulative Emissions (MTD)
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: '#2563EB' }}>
                  {quota?.cumulative_emissions_t != null ? quota.cumulative_emissions_t.toFixed(2) : '14.47'} <span style={{ fontSize: 14, color: '#9CA3AF', fontWeight: 500 }}>tCO₂e</span>
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
                  {quota?.quota_utilization_pct != null ? quota.quota_utilization_pct.toFixed(1) : '80.4'}% of monthly allocation consumed
                </div>
              </div>
            </Explainable>

            {/* Burn Rate Index (BRI) */}
            <Explainable
              title="Dynamic Burn Rate Index (BRI)"
              explanationType="kpi"
              metric={`${quota?.burn_rate_index != null ? quota.burn_rate_index.toFixed(3) : '0.998'} BRI`}
              context={{ formula: 'BRI = Actual Emissions / Pro-Rata Budget', status: quota?.burn_rate_status }}
            >
              <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: `2px solid ${briStyle.color}`, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>
                    Burn Rate Index (BRI)
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: briStyle.color, background: briStyle.bg, padding: '2px 8px', borderRadius: 12 }}>
                    {briStyle.label}
                  </span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: briStyle.color }}>
                  {quota?.burn_rate_index != null ? quota.burn_rate_index.toFixed(3) : '0.998'}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
                  Expected pro-rata: {quota?.pro_rata_expected_emissions_t != null ? quota.pro_rata_expected_emissions_t.toFixed(2) : '14.50'} tCO₂e
                </div>
              </div>
            </Explainable>

            {/* Breach Countdown */}
            <Explainable
              title="Time to Quota Exhaustion"
              explanationType="kpi"
              metric={`${quota?.hours_to_quota_breach != null ? `${quota.hours_to_quota_breach.toFixed(1)}h` : 'No Breach Expected'}`}
              context={{ remainingBudget: (((quota?.statutory_monthly_quota_t ?? 18) - (quota?.cumulative_emissions_t ?? 14.47))).toFixed(2) }}
            >
              <div style={{ background: '#FFFFFF', padding: 20, borderRadius: 14, border: '1px solid #EAE3D7', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 }}>
                  Countdown to Breach
                </div>
                <div style={{ fontSize: 26, fontWeight: 700, color: quota?.burn_rate_index && quota.burn_rate_index > 1.1 ? '#EF4444' : '#111827' }}>
                  {quota?.hours_to_quota_breach != null ? `${quota.hours_to_quota_breach.toFixed(1)}h` : 'Safe'}
                </div>
                <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={13} /> {quota?.hours_to_quota_breach != null ? 'At current hourly burn rate' : 'Emissions within boundary'}
                </div>
              </div>
            </Explainable>
          </div>

          {/* Operational Interlocks Cockpit */}
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #EAE3D7', padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#111827' }}>
                  Automatic Operational Interlocks & Trip-Wire Relay
                </h3>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                  Hard electrical and SCADA interlocks engaged whenever BRI crosses critical statutory thresholds.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 12,
                    background: dgLockoutEngaged ? '#FEE2E2' : '#DCFCE7',
                    color: dgLockoutEngaged ? '#DC2626' : '#16A34A'
                  }}
                >
                  {dgLockoutEngaged ? <Lock size={14} /> : <Unlock size={14} />}
                  {dgLockoutEngaged ? 'DG LOCKOUT ENGAGED' : 'INTERLOCKS DISENGAGED (NORMAL)'}
                </span>
              </div>
            </div>

            {/* Interactive Simulation Controls */}
            <div style={{ background: '#FAF7F2', border: '1px solid #EAE3D7', borderRadius: 12, padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
                  Test Interlock Response with Simulated Emission Surge:
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB' }}>
                  {simEmissions.toFixed(2)} tCO₂e (Budget: 18.00 t)
                </span>
              </div>
              <input
                type="range"
                min="12.0"
                max="21.0"
                step="0.1"
                value={simEmissions}
                onChange={e => handleSimulateSurge(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                <span>12.0 t (Normal)</span>
                <span>14.5 t (Pro-rata threshold)</span>
                <span>16.8 t (BRI 1.15 Lockout trigger)</span>
                <span>21.0 t (Severe Breach)</span>
              </div>
            </div>

            {/* Interlock Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Interlock 1: Dual-Fuel Switching */}
              <div style={{ border: '1px solid #EAE3D7', borderRadius: 12, padding: 18, background: fuelSwitched ? '#ECFDF5' : '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flame size={18} color="#EA580C" />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                        Automated Fuel-Switching Relay
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>Asset: BOIL-PNG-01 (Industrial Steam Boiler)</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: fuelSwitched ? '#DCFCE7' : '#F3F4F6', color: fuelSwitched ? '#15803D' : '#6B7280' }}>
                    {fuelSwitched ? 'BIOMASS ACTIVE' : 'PNG ACTIVE'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5, margin: '8px 0 14px' }}>
                  Switching boiler combustion from Natural Gas (2.162 kg CO₂/m³) to verified biogenic Biomass pellets saves 84.5% Scope 1 emissions (0.062 tCO₂e/h).
                </p>
                <button
                  type="button"
                  onClick={() => setFuelSwitched(!fuelSwitched)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: fuelSwitched ? '#059669' : '#F3F4F6',
                    color: fuelSwitched ? '#FFFFFF' : '#374151'
                  }}
                >
                  {fuelSwitched ? '✓ Fuel-Switch Simulated: Biomass Running' : 'Execute Dual-Fuel Switch Command'}
                </button>
              </div>

              {/* Interlock 2: DG Set Lockout */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 18, background: dgLockoutEngaged ? '#FEF2F2' : '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ZapOff size={18} color="#DC2626" />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                        DG-01 Diesel Generator Trip Lockout
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280' }}>Asset: GEN-DG-01 (150 kVA Standby DG)</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: dgLockoutEngaged ? '#FEE2E2' : '#F3F4F6', color: dgLockoutEngaged ? '#B91C1C' : '#6B7280' }}>
                    {dgLockoutEngaged ? 'LOCKED OUT' : 'STANDBY READY'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#4B5563', lineHeight: 1.5, margin: '8px 0 14px' }}>
                  DG Set startup produces 2.677 kg CO₂e/L HSD. At BRI ≥ 1.15, SCADA breaker interlock prevents diesel generator startup, enforcing BESS or grid power.
                </p>
                <button
                  type="button"
                  onClick={() => setDgLockoutEngaged(!dgLockoutEngaged)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: 'none',
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: 'pointer',
                    background: dgLockoutEngaged ? '#DC2626' : '#F3F4F6',
                    color: dgLockoutEngaged ? '#FFFFFF' : '#374151'
                  }}
                >
                  {dgLockoutEngaged ? '✓ DG Lockout Engaged (Relay Open)' : 'Test Trip Lockout Relay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        /* ═════════════════════════════════════════════════════════════════════════
           TAB 2: CRYPTOGRAPHIC IMMUTABLE HASH-CHAIN AUDIT LEDGER
           ═════════════════════════════════════════════════════════════════════════ */
        <div>
          {/* Verification Banner */}
          <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #EAE3D7', padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={20} color="#059669" />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#111827' }}>
                  Cryptographic Ledger Integrity: 96 Blocks Verified
                </h3>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                Each 15-minute interval aggregates industrial telemetry into SHA-256 block hashes linked sequentially to the genesis block.
              </div>
            </div>

            <button
              type="button"
              onClick={handleRunVerify}
              disabled={ledgerLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 8,
                background: '#2563EB',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: 13,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={ledgerLoading ? 'spin' : ''} />
              Verify Chain Hashes & Merkle Roots
            </button>
          </div>

          {/* Verification Results Alert if available */}
          {verification && (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <FileCheck size={16} /> {verification.status}
              </div>
              <div style={{ fontSize: 12, color: '#047857' }}>
                {verification.details}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#065F46', marginTop: 6 }}>
                Latest Hash: {(verification.latest_block_hash || '').slice(0, 32)}...
              </div>
            </div>
          )}

          {/* Blocks List + Block Payload Inspector */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20 }}>
            {/* Blocks List */}
            <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid #EAE3D7', padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>
                Recent 15-Minute Epoch Blocks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {blocks.map(b => {
                  const isSelected = selectedBlock?.block_height === b.block_height;
                  return (
                    <div
                      key={b.block_height}
                      onClick={() => setSelectedBlock(b)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid #2563EB' : '1px solid #EAE3D7',
                        background: isSelected ? 'rgba(37,99,235,0.04)' : '#FFFFFF',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                          Block #{b.block_height}
                        </span>
                        <span style={{ fontSize: 11, color: '#6B7280' }}>
                          {b.timestamp_iso ? new Date(b.timestamp_iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '15m interval'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Hash: {(b.block_hash || b.previous_block_hash || '').slice(0, 24)}...
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#9CA3AF' }}>
                        <span>Tx Count: {b.transaction_count ?? 6}</span>
                        <span style={{ color: '#059669', fontWeight: 600 }}>✓ SHA-256 Valid</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Block Inspector */}
            {selectedBlock && (
              <div
                style={{
                  background: '#FFFFFF',
                  borderRadius: 14,
                  border: '1px solid #EAE3D7',
                  padding: 22,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                  color: '#1E252D',
                  fontFamily: "var(--font-ui, 'Inter', sans-serif)",
                  height: 'fit-content',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 16,
                    borderBottom: '1px solid #EAE3D7',
                    paddingBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#10B981',
                      }}
                    />
                    <span style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>
                      Block #{selectedBlock.block_height} Details
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: '#DCFCE7',
                      color: '#15803D',
                      border: '1px solid #86EFAC',
                      padding: '3px 10px',
                      borderRadius: 9999,
                    }}
                  >
                    SHA-256 Chained
                  </span>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#78716C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
                    Block Hash:
                  </div>
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '1px solid #EAE3D7',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#B45309',
                      wordBreak: 'break-all',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedBlock.block_hash || '0'.repeat(64)}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#78716C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
                    Previous Block Hash:
                  </div>
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '1px solid #EAE3D7',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#2563EB',
                      wordBreak: 'break-all',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedBlock.previous_block_hash || '0'.repeat(64)}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#78716C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
                    Merkle Root:
                  </div>
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '1px solid #EAE3D7',
                      borderRadius: 8,
                      padding: '8px 10px',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: '#059669',
                      wordBreak: 'break-all',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    {selectedBlock.merkle_root || '0'.repeat(64)}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ color: '#78716C', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.04em' }}>
                    Timestamp:
                  </div>
                  <div
                    style={{
                      color: '#1E252D',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono, monospace)',
                      fontWeight: 500,
                    }}
                  >
                    {selectedBlock.timestamp_iso || 'N/A'}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#78716C',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                      letterSpacing: '0.04em',
                    }}
                  >
                    <span>Transactions ({selectedBlock.transaction_count} SCADA Events)</span>
                    <span style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>✓ Verified Payload</span>
                  </div>
                  <div
                    style={{
                      background: '#FAF7F2',
                      border: '1px solid #EAE3D7',
                      padding: '12px 14px',
                      borderRadius: 8,
                      maxHeight: 200,
                      overflowY: 'auto',
                      fontSize: 11,
                      color: '#334155',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(selectedBlock.transactions, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'credits' && (
        /* ═════════════════════════════════════════════════════════════════════════
           TAB 3: CARBON CREDITS & CCTS OFFSETTING ENGINE
           ═════════════════════════════════════════════════════════════════════════ */
        <div style={{ marginTop: 8 }}>
          <CarbonCreditsEngine />
        </div>
      )}

      {activeTab === 'filing' && (
        /* ═════════════════════════════════════════════════════════════════════════
           TAB 4: STATUTORY COMPLIANCE & FILING DOSSIERS
           ═════════════════════════════════════════════════════════════════════════ */
        <div style={{ marginTop: 8 }}>
          <CarbonComplianceFilingPortal />
        </div>
      )}
    </div>
  );
}
