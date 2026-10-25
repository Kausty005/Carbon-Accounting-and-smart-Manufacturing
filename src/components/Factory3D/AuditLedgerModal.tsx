import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  HardDrive,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  FileText,
  Lock,
  ExternalLink,
  X,
  Layers,
  Activity,
  Cpu,
} from 'lucide-react';

interface AuditBlock {
  block_index: number;
  timestamp: string;
  sensor_id: string;
  sensor_tag: string;
  instrument_type: string;
  monitored_asset: string;
  calibration_cert_id: string;
  protocol: string;
  prev_hash: string;
  block_hash: string;
  payload: Record<string, any>;
  statutory_compliance: Record<string, any>;
}

interface AuditLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isBuffering: boolean;
  onToggleOutage: (isOffline: boolean) => void;
}

export default function AuditLedgerModal({
  isOpen,
  onClose,
  isBuffering,
  onToggleOutage,
}: AuditLedgerModalProps) {
  const [blocks, setBlocks] = useState<AuditBlock[]>([]);
  const [isChainValid, setIsChainValid] = useState<boolean>(true);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'chain' | 'buffer' | 'standards'>('chain');

  // Fetch latest ledger blocks
  const fetchLedger = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/sensors/audit-ledger?limit=25');
      if (res.ok) {
        const json = await res.json();
        if (json.ledger) {
          setBlocks(json.ledger.blocks || []);
          setIsChainValid(json.ledger.chain_valid);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch audit ledger:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLedger();
      const interval = setInterval(fetchLedger, 2500);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Run full cryptographic chain audit verification
  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/v1/sensors/audit-ledger/verify', {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        setVerificationResult(json.verification);
      }
    } catch (err) {
      console.error('Verification request failed:', err);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#0b1329',
          border: '1px solid #1e293b',
          borderRadius: 12,
          width: '100%',
          maxWidth: 960,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          color: '#f8fafc',
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(to right, #0f172a, #1e293b)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'rgba(2, 132, 199, 0.2)',
                border: '1px solid #0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#38bdf8',
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                Statutory Sensor Provenance & Cryptographic Audit Ledger
                <span
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: isChainValid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: isChainValid ? '#34d399' : '#f87171',
                    border: `1px solid ${isChainValid ? '#10b981' : '#ef4444'}`,
                    fontWeight: 700,
                  }}
                >
                  {isChainValid ? 'SHA-256 HASH CHAIN VALID' : 'CHAIN CORRUPTED'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                Continuous field data ingestion replacing manual spreadsheets for SEBI BRSR Core, EU CBAM & ISO 14064-1/3
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '10px 20px',
            background: '#090e1a',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <button
            onClick={() => setActiveTab('chain')}
            style={{
              background: activeTab === 'chain' ? '#0284c7' : 'transparent',
              color: activeTab === 'chain' ? '#ffffff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Lock size={12} /> Immutable Hash Chain ({blocks.length} Blocks)
          </button>
          <button
            onClick={() => setActiveTab('buffer')}
            style={{
              background: activeTab === 'buffer' ? '#0284c7' : 'transparent',
              color: activeTab === 'buffer' ? '#ffffff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <HardDrive size={12} /> Edge Gateway 72h Buffering {isBuffering && '⚠️ (OFFLINE)'}
          </button>
          <button
            onClick={() => setActiveTab('standards')}
            style={{
              background: activeTab === 'standards' ? '#0284c7' : 'transparent',
              color: activeTab === 'standards' ? '#ffffff' : '#94a3b8',
              border: 'none',
              padding: '6px 14px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FileText size={12} /> Statutory Standards Matrix (SEBI / CBAM)
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {activeTab === 'chain' && (
            <div>
              {/* Verification & Action Bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: 12,
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                  marginBottom: 16,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
                    Third-Party Auditor Verification Engine
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>
                    Traverses every continuous 15-minute / 1-second block hash from genesis to tip.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleVerifyChain}
                    disabled={isVerifying}
                    style={{
                      background: '#10b981',
                      color: '#ffffff',
                      border: 'none',
                      padding: '7px 14px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <RefreshCw size={12} className={isVerifying ? 'animate-spin' : ''} />
                    {isVerifying ? 'Verifying Hashes...' : 'Run Mathematical Verification'}
                  </button>
                </div>
              </div>

              {/* Verification Result Banner */}
              {verificationResult && (
                <div
                  style={{
                    background: verificationResult.verified ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${verificationResult.verified ? '#10b981' : '#ef4444'}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 16,
                    fontSize: 11,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {verificationResult.verified ? (
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                    ) : (
                      <ShieldAlert size={16} style={{ color: '#ef4444' }} />
                    )}
                    <div>
                      <strong style={{ color: verificationResult.verified ? '#34d399' : '#f87171' }}>
                        {verificationResult.message}
                      </strong>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                        Assurance Level: {verificationResult.assurance_level} • Blocks Checked: {verificationResult.blocks_checked}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9, color: '#64748b' }}>
                    {new Date(verificationResult.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              )}

              {/* Blocks Stream List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {blocks.map((block) => (
                  <div
                    key={`${block.block_index}-${block.sensor_id}`}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: 12,
                      fontSize: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            background: '#0284c7',
                            color: '#ffffff',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 9,
                          }}
                        >
                          BLOCK #{block.block_index}
                        </span>
                        <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                          {block.sensor_tag || block.sensor_id}
                        </span>
                        <span style={{ color: '#94a3b8', fontSize: 9 }}>
                          ({block.instrument_type})
                        </span>
                      </div>
                      <span style={{ color: '#64748b', fontSize: 9 }}>
                        {new Date(block.timestamp).toISOString()}
                      </span>
                    </div>

                    {/* Sensor Readings & Physical Values */}
                    <div
                      style={{
                        background: '#090e1a',
                        borderRadius: 6,
                        padding: '6px 10px',
                        marginBottom: 6,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                        gap: 6,
                        color: '#cbd5e1',
                      }}
                    >
                      {block.payload &&
                        Object.entries(block.payload)
                          .filter(([k]) => k !== 'modbus_holding_registers')
                          .slice(0, 4)
                          .map(([k, v]) => (
                            <div key={k}>
                              <span style={{ color: '#64748b', fontSize: 9 }}>{k.replace(/_/g, ' ').toUpperCase()}: </span>
                              <span style={{ fontWeight: 700, color: '#38bdf8' }}>{String(v)}</span>
                            </div>
                          ))}
                    </div>

                    {/* Cryptographic Hash Chain Proof */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 9 }}>
                      <div style={{ display: 'flex', gap: 6, color: '#64748b' }}>
                        <span style={{ width: 65, color: '#94a3b8' }}>PREV HASH:</span>
                        <span style={{ fontFamily: 'monospace', color: '#64748b' }}>{block.prev_hash}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, color: '#10b981' }}>
                        <span style={{ width: 65, color: '#34d399', fontWeight: 700 }}>BLOCK HASH:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#38bdf8' }}>{block.block_hash}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', marginTop: 2 }}>
                        <span>Cal Cert: <strong style={{ color: '#e2e8f0' }}>{block.calibration_cert_id}</strong></span>
                        <span style={{ color: '#10b981' }}>✓ Immutable Provenance Grounded</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'buffer' && (
            <div>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                  marginBottom: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                      Shop-Floor Edge IoT Gateway Resiliency (72-Hour Buffer)
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      Simulate network drops to demonstrate zero data loss and automated cryptographic backfill.
                    </div>
                  </div>

                  <button
                    onClick={() => onToggleOutage(!isBuffering)}
                    style={{
                      background: isBuffering ? '#10b981' : '#f59e0b',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {isBuffering ? (
                      <>
                        <Wifi size={14} /> Reconnect Gateway & Replay Buffer
                      </>
                    ) : (
                      <>
                        <WifiOff size={14} /> Simulate 72h Shop Floor Outage
                      </>
                    )}
                  </button>
                </div>

                {/* Status Bar */}
                <div
                  style={{
                    background: '#090e1a',
                    padding: 12,
                    borderRadius: 6,
                    border: `1px solid ${isBuffering ? '#f59e0b' : '#0284c7'}`,
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                    <span style={{ color: '#94a3b8' }}>Gateway State:</span>
                    <span style={{ fontWeight: 800, color: isBuffering ? '#fbbf24' : '#34d399' }}>
                      {isBuffering ? 'OFFLINE (BUFFERING LOCALLY IN WAL BUFFER)' : 'ONLINE (CONTINUOUS CLOUD TLS SYNC)'}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: isBuffering ? '28%' : '0.2%',
                        height: '100%',
                        background: isBuffering ? '#f59e0b' : '#10b981',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 4 }}>
                    <span>Max Buffer: 259,200 records (72 Hours @ 1Hz)</span>
                    <span>TPM 2.0 Edge Hashing: ACTIVE</span>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                  <strong>How Auditors Verify:</strong> When a factory network fails, physical Modbus energy meters, Coriolis meters, and NDIR analyzers keep streaming to the edge gateway. When internet restores, packets are transmitted with their original millisecond timestamps and hash digests, preventing backdated spreadsheet tampering.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'standards' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* SEBI BRSR Core Card */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShieldCheck size={16} style={{ color: '#10b981' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    SEBI BRSR Core (Mandatory Reasonable Assurance)
                  </span>
                  <span style={{ fontSize: 9, background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 6px', borderRadius: 4 }}>
                    COMPLIANT
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                  SEBI circular SEBI/HO/CFD/CFD-SEC-2/P/CIR/2023/122 mandates third-party reasonable assurance on Scope 1 and Scope 2 emissions for top listed entities. Replaces unaudited annual utility bills with sensor-signed continuous logs.
                </div>
              </div>

              {/* EU CBAM Card */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShieldCheck size={16} style={{ color: '#0284c7' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    EU CBAM Regulation (EU) 2023/956 Annex IV
                  </span>
                  <span style={{ fontSize: 9, background: 'rgba(2, 132, 199, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: 4 }}>
                    COMPLIANT
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                  Requires actual direct emission measurements using continuous flue gas monitoring (NDIR) and calibrated fuel mass meters (Coriolis) for heavy export categories (steel, aluminum, chemicals, fertilizers). Default values face heavy penalty multipliers.
                </div>
              </div>

              {/* ISO 14064-1/3 Card */}
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShieldCheck size={16} style={{ color: '#f59e0b' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    ISO 14064-1:2018 & ISO 14064-3:2019
                  </span>
                  <span style={{ fontSize: 9, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4 }}>
                    AUDIT READY
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                  Implements Category 1 (Direct GHG) and Category 2 (Imported Energy) quantified by continuous measurement (Tier 3), meeting the highest validation criteria for non-financial auditing bodies.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#090e1a',
            fontSize: 10,
            color: '#64748b',
          }}
        >
          <span>Cryptographic Hash Algorithm: SHA-256 (NIST FIPS 180-4)</span>
          <button
            onClick={onClose}
            style={{
              background: '#334155',
              border: 'none',
              color: '#ffffff',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
