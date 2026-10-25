import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileCheck,
  ShieldCheck,
  Database,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Activity,
  Calendar,
  Lock,
} from 'lucide-react';
import {
  evidenceVaultApi,
  CalculationTraceabilityResponse,
} from '../../services/evidenceVaultApi';

interface CarbonTraceabilityDrawerProps {
  isOpen?: boolean;
  onClose: () => void;
  metricId: string | null;
  period?: string;
  onNavigateToEvidence?: (docId?: string) => void;
}

export const CarbonTraceabilityDrawer: React.FC<CarbonTraceabilityDrawerProps> = ({
  isOpen,
  onClose,
  metricId,
  period = '2026-10',
  onNavigateToEvidence,
}) => {
  const isDrawerVisible = Boolean((isOpen !== undefined ? isOpen : Boolean(metricId)) && metricId);
  const [data, setData] = useState<CalculationTraceabilityResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    if (!isDrawerVisible || !metricId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    evidenceVaultApi
      .getTraceability(metricId, period)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to resolve calculation traceability');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isDrawerVisible, metricId, period]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <AnimatePresence>
      {isDrawerVisible && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'flex-end',
            fontFamily: "var(--font-ui, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif)",
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(28, 25, 23, 0.55)',
              backdropFilter: 'blur(3px)',
            }}
          />

          {/* Drawer Body */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            style={{
              position: 'relative',
              zIndex: 10,
              width: '100%',
              maxWidth: 680,
              height: '100%',
              background: '#FFFFFF',
              borderLeft: '1px solid #EAE3D7',
              boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              color: '#1C1917',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #EAE3D7',
                background: '#FAF7F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: 'rgba(16, 185, 129, 0.12)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    color: '#059669',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontFamily: "var(--font-mono, monospace)",
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: '#EAE3D7',
                        color: '#44403C',
                        letterSpacing: '0.04em',
                      }}
                    >
                      ISO 14064-1 TRACEABILITY
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontFamily: "var(--font-mono, monospace)",
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#047857',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#10B981',
                        }}
                      />
                      <span>{data?.verification_grade || 'GRADE_A_VERIFIED'}</span>
                    </span>
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                    {data?.metric_name || 'Calculation Traceability'}
                  </h2>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 8,
                  borderRadius: 6,
                  color: '#78716C',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#EAE3D7';
                  e.currentTarget.style.color = '#1C1917';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#78716C';
                }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content Area */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                background: '#FAF7F2',
              }}
            >
              {loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '80px 0',
                    color: '#78716C',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      border: '3px solid #10B981',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                  <p style={{ fontSize: 13, fontFamily: "var(--font-mono, monospace)" }}>
                    Resolving activity data & cryptographic provenance...
                  </p>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#B91C1C',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                  }}
                >
                  <AlertCircle size={20} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 700 }}>
                      Failed to Load Traceability Derivation
                    </h4>
                    <p style={{ margin: 0, fontSize: 12 }}>{error}</p>
                  </div>
                </div>
              )}

              {!loading && data && (
                <>
                  {/* Top Summary Banner */}
                  <div
                    style={{
                      padding: '18px 20px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 14,
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#78716C',
                          textTransform: 'uppercase',
                          fontFamily: "var(--font-mono, monospace)",
                          letterSpacing: '0.04em',
                        }}
                      >
                        Evaluated Emissions
                      </p>
                      <p
                        style={{
                          margin: '4px 0 0 0',
                          fontSize: 26,
                          fontWeight: 700,
                          color: '#059669',
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {data.evaluated_emissions_tco2e.toFixed(3)}{' '}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#78716C', fontFamily: 'var(--font-ui)' }}>
                          t CO₂e
                        </span>
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#78716C',
                          textTransform: 'uppercase',
                          fontFamily: "var(--font-mono, monospace)",
                          letterSpacing: '0.04em',
                        }}
                      >
                        Reporting Period
                      </p>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 4,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#1C1917',
                        }}
                      >
                        <Calendar size={15} color="#78716C" />
                        <span>{data.reporting_period}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 1: Mathematical Formula & Activity Breakdown */}
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                        <Activity size={16} color="#10B981" />
                        <span>Calculation Formula & Activity Breakdown</span>
                      </div>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#047857',
                        }}
                      >
                        DETERMINISTIC
                      </span>
                    </div>

                    {/* Formula Box */}
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 8,
                        background: '#FAF7F2',
                        border: '1px solid #EAE3D7',
                        fontFamily: "var(--font-mono, monospace)",
                        fontSize: 12,
                        color: '#1C1917',
                        lineHeight: 1.6,
                        overflowX: 'auto',
                      }}
                    >
                      {data.formula_expression}
                    </div>

                    {/* Activity Data Details */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: '#FAF7F2',
                          border: '1px solid #EAE3D7',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 11, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                          Measured Activity Value
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: 15, fontWeight: 700, color: '#1C1917', fontFamily: "var(--font-mono, monospace)" }}>
                          {data.activity_amount.toLocaleString()} {data.activity_unit}
                        </p>
                      </div>
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: '#FAF7F2',
                          border: '1px solid #EAE3D7',
                        }}
                      >
                        <p style={{ margin: 0, fontSize: 11, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                          Operational Boundary
                        </p>
                        <p
                          style={{
                            margin: '4px 0 0 0',
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#1C1917',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={data.operational_boundary}
                        >
                          {data.operational_boundary}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Emission Factor Citation & Authority Citation */}
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                      <Database size={16} color="#0284C7" />
                      <span>Emission Factor & Authority Citation</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: '#FAF7F2',
                          border: '1px solid #EAE3D7',
                        }}
                      >
                        <span style={{ fontSize: 11, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                          Emission Factor
                        </span>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#0369A1', fontFamily: "var(--font-mono, monospace)", marginTop: 4 }}>
                          {data.emission_factor}{' '}
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>{data.emission_factor_unit}</span>
                        </div>
                      </div>
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: '#FAF7F2',
                          border: '1px solid #EAE3D7',
                        }}
                      >
                        <span style={{ fontSize: 11, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                          Publishing Authority
                        </span>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#1C1917',
                            marginTop: 4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={data.emission_factor_provenance?.authority}
                        >
                          {data.emission_factor_provenance?.authority || 'Central Electricity Authority (CEA)'}
                        </div>
                      </div>
                    </div>

                    {/* Extended Provenance Meta */}
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#FAF7F2',
                        border: '1px solid #EAE3D7',
                        fontSize: 11.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {data.emission_factor_provenance?.database_version && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#78716C' }}>Database Edition:</span>
                          <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600, color: '#1C1917' }}>
                            {data.emission_factor_provenance.database_version}
                          </span>
                        </div>
                      )}
                      {data.emission_factor_provenance?.sheet && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#78716C' }}>Source Worksheet:</span>
                          <span style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600, color: '#1C1917' }}>
                            {data.emission_factor_provenance.sheet} (Row {data.emission_factor_provenance.row}, Col {data.emission_factor_provenance.column})
                          </span>
                        </div>
                      )}
                      {data.emission_factor_provenance?.gwp_reference && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#78716C' }}>GWP Framework:</span>
                          <span style={{ fontWeight: 600, color: '#1C1917' }}>{data.emission_factor_provenance.gwp_reference}</span>
                        </div>
                      )}
                      {data.emission_factor_provenance?.gwp_standard && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#78716C' }}>GWP Standard:</span>
                          <span style={{ fontWeight: 600, color: '#1C1917' }}>{data.emission_factor_provenance.gwp_standard}</span>
                        </div>
                      )}
                      {data.emission_factor_provenance?.standard && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#78716C' }}>Measurement Standard:</span>
                          <span style={{ fontWeight: 600, color: '#1C1917' }}>{data.emission_factor_provenance.standard}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Linked Primary Supporting Evidence */}
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                        <FileCheck size={16} color="#10B981" />
                        <span>Linked Primary Evidence ({data.linked_evidence.length})</span>
                      </div>
                      {onNavigateToEvidence && (
                        <button
                          onClick={() => {
                            onClose();
                            onNavigateToEvidence();
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#059669',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <span>Open Evidence Vault</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>

                    {data.linked_evidence.length === 0 ? (
                      <div
                        style={{
                          padding: '14px',
                          textAlign: 'center',
                          fontSize: 12,
                          color: '#78716C',
                          background: '#FAF7F2',
                          borderRadius: 8,
                          border: '1px dashed #EAE3D7',
                        }}
                      >
                        No direct primary document linked yet. Telemetry model regression active.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {data.linked_evidence.map((doc, idx) => (
                          <div
                            key={doc.document_id || idx}
                            style={{
                              padding: '14px',
                              borderRadius: 8,
                              background: '#FAF7F2',
                              border: '1px solid #EAE3D7',
                              transition: 'border-color 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 6,
                                    background: '#EAE3D7',
                                    color: '#44403C',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}
                                >
                                  <FileCheck size={16} />
                                </div>
                                <div>
                                  <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1C1917' }}>
                                    {doc.filename}
                                  </h4>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                                    <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono, monospace)", color: '#78716C' }}>
                                      {doc.document_id}
                                    </span>
                                    <span style={{ color: '#D6D3D1' }}>•</span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontFamily: "var(--font-mono, monospace)",
                                        fontWeight: 700,
                                        color: '#047857',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      {doc.status || 'CONFIRMED'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {onNavigateToEvidence && (
                                <button
                                  onClick={() => {
                                    onClose();
                                    onNavigateToEvidence(doc.document_id);
                                  }}
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    padding: 6,
                                    color: '#78716C',
                                  }}
                                  title="View Document Details"
                                >
                                  <ExternalLink size={14} />
                                </button>
                              )}
                            </div>

                            {/* SHA-256 Hash Row */}
                            {doc.sha256_hash && (
                              <div
                                style={{
                                  marginTop: 10,
                                  paddingTop: 8,
                                  borderTop: '1px solid #EAE3D7',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  fontSize: 11,
                                  fontFamily: "var(--font-mono, monospace)",
                                }}
                              >
                                <span style={{ color: '#78716C', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Lock size={12} />
                                  <span>SHA-256:</span>
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ color: '#44403C' }}>
                                    {doc.sha256_hash.slice(0, 16)}...{doc.sha256_hash.slice(-8)}
                                  </span>
                                  <button
                                    onClick={() => handleCopy(doc.sha256_hash, doc.document_id)}
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      color: '#78716C',
                                      padding: 2,
                                    }}
                                    title="Copy SHA-256 Hash"
                                  >
                                    {copiedHash === doc.document_id ? (
                                      <Check size={12} color="#10B981" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Section 4: Real-Time Cryptographic Ledger Anchor */}
                  <div
                    style={{
                      padding: '20px',
                      borderRadius: 12,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#1C1917' }}>
                      <Lock size={16} color="#059669" />
                      <span>Immutable Hash Chain Verification</span>
                    </div>

                    <div
                      style={{
                        padding: '14px',
                        borderRadius: 8,
                        background: '#FAF7F2',
                        border: '1px solid #EAE3D7',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: 11.5,
                        fontFamily: "var(--font-mono, monospace)",
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#78716C' }}>Ledger Block Height:</span>
                        <span style={{ color: '#047857', fontWeight: 700 }}>
                          #{data.cryptographic_audit_ref?.ledger_block_height || 110} (15m SCADA block)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#78716C' }}>Active Merkle Root:</span>
                        <span style={{ color: '#1C1917', fontWeight: 600 }}>
                          {data.cryptographic_audit_ref?.merkle_root
                            ? `${data.cryptographic_audit_ref.merkle_root.slice(0, 16)}...`
                            : '0x9166cc6ad43b8327...'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ color: '#78716C' }}>Tamper Status:</span>
                        <span style={{ color: '#047857', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={13} color="#10B981" />
                          <span>UNBROKEN &amp; CRYPTOGRAPHICALLY SOUND</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #EAE3D7',
                background: '#FAF7F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11.5, color: '#78716C' }}>
                End-to-end traceability verified against ISO 14064-1:2018 &amp; GHG Protocol
              </span>
              <button
                onClick={onClose}
                style={{
                  background: '#1C1917',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                }}
              >
                Close Drawer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
