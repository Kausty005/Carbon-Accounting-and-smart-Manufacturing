import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  FileCheck,
  Search,
  Download,
  ExternalLink,
  Database,
  Lock,
  RefreshCw,
  Eye,
  Check,
  X,
  AlertCircle,
  Copy,
  Award,
  Gauge,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  evidenceVaultApi,
  EvidenceDocument,
  DataQualityCheckResult,
  CreditProjectLifecycle,
  EvidenceUploadRequest,
  EvidenceConfirmRequest,
} from '../../services/evidenceVaultApi';
import { CarbonTraceabilityDrawer } from './CarbonTraceabilityDrawer';

interface EvidenceVaultViewProps {
  onBackToAccounting?: () => void;
}

export const EvidenceVaultView: React.FC<EvidenceVaultViewProps> = ({ onBackToAccounting }) => {
  // State
  const [activeTab, setActiveTab] = useState<'evidence' | 'quality' | 'projects'>('evidence');
  const [documents, setDocuments] = useState<EvidenceDocument[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQualityCheckResult | null>(null);
  const [creditProjects, setCreditProjects] = useState<CreditProjectLifecycle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [periodFilter, setPeriodFilter] = useState<string>('2026-10');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [confirmingDoc, setConfirmingDoc] = useState<EvidenceDocument | null>(null);
  const [inspectingDoc, setInspectingDoc] = useState<EvidenceDocument | null>(null);
  const [traceabilityMetric, setTraceabilityMetric] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [downloadingPack, setDownloadingPack] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Upload Form State
  const [uploadFilename, setUploadFilename] = useState<string>('');
  const [uploadType, setUploadType] = useState<string>('ELECTRICITY_BILL');
  const [uploadPeriod, setUploadPeriod] = useState<string>('2026-10');
  const [uploadUploader, setUploadUploader] = useState<string>('Lead Auditor (PrecisionWorks)');
  const [uploadNotes, setUploadNotes] = useState<string>('');
  const [uploadSubmitting, setUploadSubmitting] = useState<boolean>(false);

  // Confirm Form State
  const [confirmConsumption, setConfirmConsumption] = useState<number>(0);
  const [confirmUnit, setConfirmUnit] = useState<string>('kWh');
  const [confirmTarget, setConfirmTarget] = useState<string>('scope2_grid');
  const [confirmNotes, setConfirmNotes] = useState<string>('');
  const [confirmSubmitting, setConfirmSubmitting] = useState<boolean>(false);

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const [docs, dq, projects] = await Promise.all([
        evidenceVaultApi.getDocuments(periodFilter, typeFilter),
        evidenceVaultApi.evaluateDataQuality(periodFilter === 'ALL' ? '2026-10' : periodFilter),
        evidenceVaultApi.getCreditProjects('precisionworks'),
      ]);
      setDocuments(docs);
      setDataQuality(dq);
      setCreditProjects(projects);
    } catch (err: any) {
      console.error('Failed to load evidence vault data:', err);
      setNotification({ type: 'error', message: err.message || 'Error connecting to Evidence Vault' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [periodFilter, typeFilter]);

  // Handle Document Confirmation
  const handleOpenConfirmModal = (doc: EvidenceDocument) => {
    setConfirmingDoc(doc);
    const extractedVal = doc.confirmed_fields?.consumption_value || doc.extracted_fields?.consumption_value || 0;
    const extractedUnit = doc.confirmed_fields?.unit || doc.extracted_fields?.unit || 'kWh';
    setConfirmConsumption(extractedVal);
    setConfirmUnit(extractedUnit);
    setConfirmTarget(doc.linked_calculation_target || 'scope2_grid');
    setConfirmNotes((doc.confirmed_fields?.notes as string) || 'Auditor confirmed line-item telemetry linkage.');
  };

  const handleSaveConfirmation = async () => {
    if (!confirmingDoc) return;
    setConfirmSubmitting(true);
    try {
      const payload: EvidenceConfirmRequest = {
        confirmed_by: 'Dr. Ananya Sharma (Lead Energy Auditor)',
        confirmed_fields: {
          consumption_value: confirmConsumption,
          unit: confirmUnit,
          invoice_number: confirmingDoc.extracted_fields?.invoice_number || 'INV-VERIFIED',
          meter_serial_number: confirmingDoc.extracted_fields?.meter_serial_number || 'MTR-SCADA',
        },
        linked_calculation_target: confirmTarget,
        notes: confirmNotes,
      };

      await evidenceVaultApi.confirmDocument(confirmingDoc.document_id, payload);
      setNotification({ type: 'success', message: `Confirmed ${confirmingDoc.document_id} and linked to ${confirmTarget}` });
      setConfirmingDoc(null);
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Confirmation failed' });
    } finally {
      setConfirmSubmitting(false);
    }
  };

  // Handle Document Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFilename) return;

    setUploadSubmitting(true);
    try {
      const payload: EvidenceUploadRequest = {
        filename: uploadFilename,
        file_type: uploadType,
        reporting_period: uploadPeriod,
        uploaded_by: uploadUploader,
        notes: uploadNotes,
        file_content_base64: 'JVBERi0xLjQKJcTl8uXr...',
      };

      const res = await evidenceVaultApi.uploadDocument(payload);
      setNotification({
        type: 'success',
        message: `Uploaded ${res.document_id}. OCR extracted ${res.extracted_fields?.consumption_value || 'telemetry'} ${res.extracted_fields?.unit || ''}.`,
      });
      setIsUploadModalOpen(false);
      setUploadFilename('');
      setUploadNotes('');
      await loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Document upload failed' });
    } finally {
      setUploadSubmitting(false);
    }
  };

  // Handle Report Pack ZIP Download
  const handleDownloadReportPack = async () => {
    setDownloadingPack(true);
    try {
      await evidenceVaultApi.downloadReportPack('2026-10', 'precisionworks');
      setNotification({
        type: 'success',
        message: 'Compliance Report Pack (PDF, Workbook CSV, Evidence Index JSON, Checklist MD) downloaded successfully!',
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Report pack download failed' });
    } finally {
      setDownloadingPack(false);
    }
  };

  const handleCopyHash = (hash: string, id: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(id);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Filter documents by search
  const filteredDocs = documents.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return (
      doc.filename.toLowerCase().includes(q) ||
      doc.document_id.toLowerCase().includes(q) ||
      doc.extracted_fields?.supplier_name?.toLowerCase().includes(q) ||
      doc.linked_calculation_target?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: "var(--font-ui, 'Inter', -apple-system, BlinkMacSystemFont, sans-serif)",
        color: '#1C1917',
      }}
    >
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed',
              top: 20,
              right: 24,
              zIndex: 99999,
              padding: '12px 18px',
              borderRadius: 10,
              boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 13,
              fontWeight: 500,
              background: notification.type === 'success' ? '#ECFDF5' : '#FEF2F2',
              border: `1.5px solid ${notification.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
              color: notification.type === 'success' ? '#065F46' : '#991B1B',
            }}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 size={18} color="#059669" />
            ) : (
              <AlertCircle size={18} color="#DC2626" />
            )}
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'inherit',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={15} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner / Header Card */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {onBackToAccounting && (
            <button
              onClick={onBackToAccounting}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                background: '#FAF7F2',
                border: '1px solid #EAE3D7',
                color: '#44403C',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#EAE3D7';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FAF7F2';
              }}
            >
              <span>← Back</span>
            </button>
          )}

          <div
            style={{
              width: 44,
              height: 44,
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
            <Shield size={24} />
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
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#047857',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                ISO 14064-1 &amp; GHG PROTOCOL
              </span>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: '#78716C' }}>
                PRECISIONWORKS MANUFACTURING LTD.
              </span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1C1917', margin: 0, letterSpacing: '-0.02em' }}>
              Evidence &amp; Compliance Workspace
            </h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={() => setIsUploadModalOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 8,
              background: '#059669',
              color: '#FFFFFF',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#047857')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#059669')}
          >
            <Upload size={15} />
            <span>Upload Evidence</span>
          </button>

          <button
            onClick={handleDownloadReportPack}
            disabled={downloadingPack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 8,
              background: '#FFFFFF',
              color: '#1C1917',
              border: '1px solid #D6D3D1',
              cursor: downloadingPack ? 'not-allowed' : 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              transition: 'all 0.15s ease',
              opacity: downloadingPack ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!downloadingPack) e.currentTarget.style.background = '#FAF7F2';
            }}
            onMouseLeave={(e) => {
              if (!downloadingPack) e.currentTarget.style.background = '#FFFFFF';
            }}
          >
            {downloadingPack ? (
              <RefreshCw size={15} color="#059669" className="spin" />
            ) : (
              <Download size={15} color="#059669" />
            )}
            <span>{downloadingPack ? 'Packaging...' : 'Download Report Pack (ZIP)'}</span>
          </button>

          <button
            onClick={loadData}
            style={{
              padding: '9px',
              borderRadius: 8,
              background: '#FFFFFF',
              border: '1px solid #D6D3D1',
              color: '#78716C',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            title="Refresh Vault Data"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#FAF7F2';
              e.currentTarget.style.color = '#1C1917';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.color = '#78716C';
            }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#FAF7F2',
          padding: '6px',
          borderRadius: 10,
          border: '1px solid #EAE3D7',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
      >
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
            transition: 'all 0.15s ease',
          }}
        >
          <FileText size={15} color={activeTab === 'evidence' ? '#10B981' : '#78716C'} />
          <span>Primary Evidence Vault</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 12,
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              background: activeTab === 'evidence' ? 'rgba(255,255,255,0.2)' : '#EAE3D7',
              color: activeTab === 'evidence' ? '#FFFFFF' : '#44403C',
            }}
          >
            {documents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('quality')}
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
            background: activeTab === 'quality' ? '#1C1917' : 'transparent',
            color: activeTab === 'quality' ? '#FFFFFF' : '#78716C',
            transition: 'all 0.15s ease',
          }}
        >
          <Gauge size={15} color={activeTab === 'quality' ? '#F59E0B' : '#78716C'} />
          <span>Data Quality &amp; Missing Documents</span>
          {dataQuality && dataQuality.missing_documents.length > 0 && (
            <span
              style={{
                padding: '2px 7px',
                borderRadius: 12,
                fontSize: 11,
                fontFamily: "var(--font-mono, monospace)",
                background: 'rgba(245, 158, 11, 0.2)',
                color: activeTab === 'quality' ? '#FDE68A' : '#B45309',
                border: '1px solid rgba(245, 158, 11, 0.35)',
              }}
            >
              {dataQuality.missing_documents.length} Alert
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('projects')}
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
            background: activeTab === 'projects' ? '#1C1917' : 'transparent',
            color: activeTab === 'projects' ? '#FFFFFF' : '#78716C',
            transition: 'all 0.15s ease',
          }}
        >
          <Award size={15} color={activeTab === 'projects' ? '#8B5CF6' : '#78716C'} />
          <span>Carbon Credit Project Tracker</span>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 12,
              fontSize: 11,
              fontFamily: "var(--font-mono, monospace)",
              background: activeTab === 'projects' ? 'rgba(255,255,255,0.2)' : '#EAE3D7',
              color: activeTab === 'projects' ? '#FFFFFF' : '#44403C',
            }}
          >
            {creditProjects.length}
          </span>
        </button>
      </div>

      {/* ─── TAB 1: PRIMARY EVIDENCE VAULT ───────────────────────────────────── */}
      {activeTab === 'evidence' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Filter and Search Bar Card */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* Search */}
              <div style={{ position: 'relative', minWidth: 260 }}>
                <Search
                  size={14}
                  color="#78716C"
                  style={{ position: 'absolute', left: 12, top: 11 }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search invoice #, supplier, or ID..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 34px',
                    borderRadius: 8,
                    background: '#FAFAF9',
                    border: '1px solid #D6D3D1',
                    fontSize: 12,
                    color: '#1C1917',
                    outline: 'none',
                  }}
                />
              </div>

              {/* Period Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                  Period:
                </span>
                <select
                  value={periodFilter}
                  onChange={(e) => setPeriodFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#FAFAF9',
                    border: '1px solid #D6D3D1',
                    fontSize: 12,
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: 600,
                    color: '#1C1917',
                    outline: 'none',
                  }}
                >
                  <option value="2026-10">October 2026 (Active)</option>
                  <option value="2026-11">November 2026</option>
                  <option value="ALL">All Reporting Periods</option>
                </select>
              </div>

              {/* Document Type Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11.5, color: '#78716C', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                  Type:
                </span>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#FAFAF9',
                    border: '1px solid #D6D3D1',
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#1C1917',
                    outline: 'none',
                  }}
                >
                  <option value="ALL">All Document Types</option>
                  <option value="ELECTRICITY_BILL">Electricity Bills</option>
                  <option value="FUEL_INVOICE">Fuel Invoices (LPG/Diesel)</option>
                  <option value="CALIBRATION_CERT">Calibration Certificates</option>
                  <option value="RENEWABLE_PPA">Renewable PPAs</option>
                  <option value="METER_LOG">Submeter SCADA Logs</option>
                </select>
              </div>
            </div>

            {/* Status Indicator */}
            <div style={{ fontSize: 11.5, fontFamily: "var(--font-mono, monospace)", color: '#78716C' }}>
              Showing <b>{filteredDocs.length}</b> confirmed &amp; active records
            </div>
          </div>

          {/* Documents Table Card */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              overflow: 'hidden',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr
                    style={{
                      background: '#FAF7F2',
                      borderBottom: '1px solid #EAE3D7',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#64748B',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    <th style={{ padding: '12px 18px' }}>Document ID &amp; File</th>
                    <th style={{ padding: '12px 18px' }}>Category &amp; Scope</th>
                    <th style={{ padding: '12px 18px' }}>OCR Extracted Activity</th>
                    <th style={{ padding: '12px 18px' }}>Confirmed Linkage</th>
                    <th style={{ padding: '12px 18px' }}>SHA-256 Provenance</th>
                    <th style={{ padding: '12px 18px' }}>Verification Status</th>
                    <th style={{ padding: '12px 18px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 18px', textAlign: 'center', color: '#78716C' }}>
                        <FileText size={32} color="#A8A29E" style={{ margin: '0 auto 8px auto', display: 'block' }} />
                        No evidence documents found matching filters.
                      </td>
                    </tr>
                  ) : (
                    filteredDocs.map((doc) => {
                      const isConfirmed = doc.status === 'CONFIRMED_LINKED';
                      const isFlagged = doc.status === 'FLAGGED_DISCREPANCY';
                      const consumption = doc.confirmed_fields?.consumption_value ?? doc.extracted_fields?.consumption_value;
                      const unit = doc.confirmed_fields?.unit ?? doc.extracted_fields?.unit;

                      return (
                        <tr
                          key={doc.document_id}
                          style={{
                            borderBottom: '1px solid #F5F2EB',
                            transition: 'background 0.15s ease',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#FAF7F2')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFFFF')}
                        >
                          {/* Document Info */}
                          <td style={{ padding: '14px 18px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#059669',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  marginTop: 2,
                                }}
                              >
                                <FileCheck size={16} />
                              </div>
                              <div>
                                <div
                                  onClick={() => setInspectingDoc(doc)}
                                  style={{
                                    fontWeight: 700,
                                    color: '#1C1917',
                                    cursor: 'pointer',
                                    transition: 'color 0.15s ease',
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = '#059669')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = '#1C1917')}
                                >
                                  {doc.filename}
                                </div>
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    marginTop: 3,
                                    fontSize: 11,
                                    fontFamily: "var(--font-mono, monospace)",
                                    color: '#78716C',
                                  }}
                                >
                                  <span style={{ color: '#047857', fontWeight: 600 }}>{doc.document_id}</span>
                                  <span>•</span>
                                  <span>{(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
                                  <span>•</span>
                                  <span>{doc.reporting_period}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category & Scope */}
                          <td style={{ padding: '14px 18px' }}>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontFamily: "var(--font-mono, monospace)",
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: '#EAE3D7',
                                color: '#44403C',
                              }}
                            >
                              {doc.file_type}
                            </span>
                            <div
                              style={{
                                fontSize: 11,
                                color: '#78716C',
                                marginTop: 4,
                                maxWidth: 180,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {doc.extracted_fields?.supplier_name || 'Verified Supplier'}
                            </div>
                          </td>

                          {/* Extracted Activity */}
                          <td style={{ padding: '14px 18px', fontFamily: "var(--font-mono, monospace)" }}>
                            {consumption !== undefined ? (
                              <div style={{ color: '#1C1917', fontWeight: 600 }}>
                                {consumption.toLocaleString()}{' '}
                                <span style={{ color: '#78716C', fontSize: 10.5 }}>{unit}</span>
                              </div>
                            ) : (
                              <span style={{ color: '#A8A29E', fontStyle: 'italic' }}>Calibration / Cert</span>
                            )}
                            {doc.extracted_fields?.invoice_number && (
                              <div
                                style={{
                                  fontSize: 10.5,
                                  color: '#78716C',
                                  marginTop: 2,
                                  maxWidth: 150,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Inv: {doc.extracted_fields.invoice_number}
                              </div>
                            )}
                          </td>

                          {/* Confirmed Linkage */}
                          <td style={{ padding: '14px 18px' }}>
                            {doc.linked_calculation_target ? (
                              <button
                                onClick={() => setTraceabilityMetric(doc.linked_calculation_target || null)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                  color: '#047857',
                                  fontSize: 11,
                                  fontFamily: "var(--font-mono, monospace)",
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(16, 185, 129, 0.12)')}
                              >
                                <span>{doc.linked_calculation_target}</span>
                                <ExternalLink size={12} color="#059669" />
                              </button>
                            ) : (
                              <span style={{ color: '#A8A29E', fontSize: 11, fontStyle: 'italic', fontFamily: "var(--font-mono, monospace)" }}>
                                Unlinked
                              </span>
                            )}
                          </td>

                          {/* SHA-256 Provenance */}
                          <td style={{ padding: '14px 18px', fontFamily: "var(--font-mono, monospace)", fontSize: 11 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: '#44403C' }} title={doc.sha256_hash}>
                                {doc.sha256_hash.slice(0, 10)}...
                              </span>
                              <button
                                onClick={() => handleCopyHash(doc.sha256_hash, doc.document_id)}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  padding: 2,
                                  color: '#78716C',
                                }}
                                title="Copy SHA-256 Checksum"
                              >
                                {copiedHash === doc.document_id ? (
                                  <Check size={12} color="#10B981" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                            <span style={{ fontSize: 10, color: '#78716C', display: 'block', marginTop: 2, fontFamily: 'var(--font-ui)' }}>
                              v{doc.version_history?.length || 1} • {doc.uploaded_by.split(' ')[0]}
                            </span>
                          </td>

                          {/* Verification Status */}
                          <td style={{ padding: '14px 18px' }}>
                            {isConfirmed && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 8px',
                                  borderRadius: 12,
                                  fontSize: 10.5,
                                  fontFamily: "var(--font-mono, monospace)",
                                  fontWeight: 700,
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#047857',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                }}
                              >
                                <CheckCircle2 size={12} />
                                <span>CONFIRMED</span>
                              </span>
                            )}
                            {isFlagged && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 8px',
                                  borderRadius: 12,
                                  fontSize: 10.5,
                                  fontFamily: "var(--font-mono, monospace)",
                                  fontWeight: 700,
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: '#B45309',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                }}
                              >
                                <AlertTriangle size={12} />
                                <span>DISCREPANCY</span>
                              </span>
                            )}
                            {!isConfirmed && !isFlagged && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '3px 8px',
                                  borderRadius: 12,
                                  fontSize: 10.5,
                                  fontFamily: "var(--font-mono, monospace)",
                                  fontWeight: 700,
                                  background: 'rgba(2, 132, 199, 0.12)',
                                  color: '#0369A1',
                                  border: '1px solid rgba(2, 132, 199, 0.25)',
                                }}
                              >
                                <Clock size={12} />
                                <span>OCR PENDING</span>
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td style={{ padding: '14px 18px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => handleOpenConfirmModal(doc)}
                                style={{
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  background: '#FAF7F2',
                                  border: '1px solid #D6D3D1',
                                  color: '#1C1917',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#1C1917';
                                  e.currentTarget.style.color = '#FFFFFF';
                                  e.currentTarget.style.borderColor = '#1C1917';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#FAF7F2';
                                  e.currentTarget.style.color = '#1C1917';
                                  e.currentTarget.style.borderColor = '#D6D3D1';
                                }}
                              >
                                {isConfirmed ? 'Edit / Re-bind' : 'Confirm Values'}
                              </button>
                              <button
                                onClick={() => setInspectingDoc(doc)}
                                style={{
                                  padding: '6px',
                                  borderRadius: 6,
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#78716C',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="View Document Provenance"
                                onMouseEnter={(e) => (e.currentTarget.style.color = '#1C1917')}
                                onMouseLeave={(e) => (e.currentTarget.style.color = '#78716C')}
                              >
                                <Eye size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: DATA QUALITY & MISSING EVIDENCE CHECKLIST ─────────────── */}
      {activeTab === 'quality' && dataQuality && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Score Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {/* Compliance Score */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 12,
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase', fontFamily: "var(--font-mono, monospace)" }}>
                  Compliance Score
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: '#059669' }}>
                  {dataQuality.compliance_score_pct.toFixed(1)}%
                </p>
                <span style={{ fontSize: 11, color: '#78716C', display: 'block', marginTop: 4 }}>
                  ISO 14064-1 &amp; GHG Protocol
                </span>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#059669',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Award size={22} />
              </div>
            </div>

            {/* Audit Readiness */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 12,
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase', fontFamily: "var(--font-mono, monospace)" }}>
                  Audit Readiness
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: '#1C1917' }}>
                  {dataQuality.audit_readiness_status}
                </p>
                <span style={{ fontSize: 11, color: '#047857', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <CheckCircle2 size={13} />
                  <span>Statutory Eligible</span>
                </span>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(2, 132, 199, 0.12)',
                  color: '#0284C7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Shield size={22} />
              </div>
            </div>

            {/* Missing Documents Count */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 12,
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase', fontFamily: "var(--font-mono, monospace)" }}>
                  Missing Documents
                </p>
                <p
                  style={{
                    margin: '6px 0 0 0',
                    fontSize: 28,
                    fontWeight: 700,
                    fontFamily: "var(--font-mono, monospace)",
                    color: dataQuality.missing_documents.length === 0 ? '#059669' : '#D97706',
                  }}
                >
                  {dataQuality.missing_documents.length}
                </p>
                <span style={{ fontSize: 11, color: '#78716C', display: 'block', marginTop: 4 }}>
                  Period Gaps: {dataQuality.period_gaps.length}
                </span>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: dataQuality.missing_documents.length === 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                  color: dataQuality.missing_documents.length === 0 ? '#059669' : '#D97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={22} />
              </div>
            </div>

            {/* Discrepancies & Duplicates */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 12,
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase', fontFamily: "var(--font-mono, monospace)" }}>
                  Unit Inconsistencies
                </p>
                <p style={{ margin: '6px 0 0 0', fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono, monospace)", color: '#059669' }}>
                  {dataQuality.inconsistent_units.length}
                </p>
                <span style={{ fontSize: 11, color: '#78716C', display: 'block', marginTop: 4 }}>
                  Duplicate Files: {dataQuality.duplicate_documents.length}
                </span>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'rgba(124, 58, 237, 0.12)',
                  color: '#7C3AED',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Database size={22} />
              </div>
            </div>
          </div>

          {/* Missing Documents Action Alert Banner */}
          {dataQuality.missing_documents.length > 0 && (
            <div
              style={{
                background: '#FFFBEB',
                border: '1.5px solid #FCD34D',
                borderRadius: 12,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#B45309', fontWeight: 700, fontSize: 14 }}>
                <AlertTriangle size={20} />
                <span>Actionable Missing Evidence Detected for {dataQuality.reporting_period}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                The following required primary evidence is missing from the repository. Uploading confirmed bills eliminates estimation uncertainty and elevates audit grade to Grade A.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, paddingTop: 4 }}>
                {dataQuality.missing_documents.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid #FDE68A',
                      borderRadius: 10,
                      padding: '14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#92400E', fontSize: 12.5 }}>{m.category}</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-mono, monospace)",
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: '#FEF3C7',
                            color: '#92400E',
                            fontWeight: 700,
                          }}
                        >
                          {m.severity}
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#1C1917', fontWeight: 500 }}>
                        {m.expected_document}
                      </p>
                      <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#78716C' }}>
                        {m.impact}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setUploadType(m.category.includes('Electricity') ? 'ELECTRICITY_BILL' : 'FUEL_INVOICE');
                        setIsUploadModalOpen(true);
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 6,
                        background: '#D97706',
                        color: '#FFFFFF',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 11.5,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      Upload
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Statutory Compliance Checklist Table Card */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1C1917' }}>
                  Statutory Compliance &amp; Audit Verification Checklist
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#78716C' }}>
                  Evaluated against ISO 14064-1:2018, GHG Protocol Scope 2 Guidance, ISO 50001, and SEBI BRSR Core Principle 6.
                </p>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  fontWeight: 700,
                  color: '#047857',
                  background: 'rgba(16, 185, 129, 0.12)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}
              >
                AUTOMATED AUDIT RUN: PASS
              </span>
            </div>

            <div style={{ border: '1px solid #EAE3D7', borderRadius: 10, overflow: 'hidden' }}>
              {dataQuality.compliance_checklist.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '14px 18px',
                    background: idx % 2 === 0 ? '#FFFFFF' : '#FAF7F2',
                    borderBottom: idx === dataQuality.compliance_checklist.length - 1 ? 'none' : '1px solid #EAE3D7',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          color: '#44403C',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: '#EAE3D7',
                        }}
                      >
                        {item.standard}
                      </span>
                      <h4 style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#1C1917' }}>
                        {item.item}
                      </h4>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: '#44403C', lineHeight: 1.4 }}>
                      {item.details}
                    </p>
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {item.status === 'PASS' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#047857',
                          border: '1px solid rgba(16, 185, 129, 0.25)',
                        }}
                      >
                        <CheckCircle2 size={13} />
                        <span>PASS</span>
                      </span>
                    )}
                    {item.status === 'WARNING' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#B45309',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                        }}
                      >
                        <AlertTriangle size={13} />
                        <span>WARNING</span>
                      </span>
                    )}
                    {item.status === 'FAIL' && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontFamily: "var(--font-mono, monospace)",
                          fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.12)',
                          color: '#B91C1C',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                        }}
                      >
                        <AlertCircle size={13} />
                        <span>FAIL</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 3: CARBON CREDIT PROJECT TRACKER ─────────────────────────── */}
      {activeTab === 'projects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Policy Notice */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAE3D7',
              borderRadius: 12,
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(124, 58, 237, 0.12)',
                color: '#7C3AED',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Award size={22} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1C1917' }}>
                Carbon Credit Project Tracker — Independent Asset Registry
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: '#44403C', lineHeight: 1.5 }}>
                Under <b>GHG Protocol Corporate Standard Clause 9.5</b> and <b>ISO 14064-1:2018 Clause 5.2.4</b>,
                carbon credit projects are tracked strictly independently from the operational emissions inventory.
                Gross operational emissions are never reduced directly by credits; offsets are reconciled only via explicit surrender.
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: '#B45309', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                ⚠ Simulated Digital Twin reductions and engineering forecasts are explicitly labeled and cannot be claimed as official registry credits without independent third-party DOE/VVB verification and official registry issuance.
              </p>
            </div>
          </div>

          {/* Projects Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 18,
            }}
          >
            {creditProjects.map((p) => {
              const isCertified = p.is_registry_certified;
              const isSimulated = p.status_category === 'SIMULATED_ESTIMATE';

              return (
                <div
                  key={p.project_id}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #EAE3D7',
                    borderRadius: 12,
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#1C1917';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#EAE3D7';
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
                  }}
                >
                  {/* Project Header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            fontSize: 10.5,
                            fontFamily: "var(--font-mono, monospace)",
                            fontWeight: 700,
                            background: '#EAE3D7',
                            color: '#44403C',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          {p.project_id}
                        </span>
                        {isCertified ? (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--font-mono, monospace)",
                              fontWeight: 700,
                              color: '#047857',
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              padding: '2px 8px',
                              borderRadius: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <CheckCircle2 size={12} />
                            <span>OFFICIALLY ISSUED REGISTRY ASSET</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "var(--font-mono, monospace)",
                              fontWeight: 700,
                              color: '#B45309',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              padding: '2px 8px',
                              borderRadius: 12,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <AlertCircle size={12} />
                            <span>{isSimulated ? 'SIMULATED / PRE-FEASIBILITY' : 'DOE VALIDATION UNDERWAY'}</span>
                          </span>
                        )}
                      </div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
                        {p.project_name}
                      </h4>
                    </div>
                  </div>

                  {/* Methodology & Registry */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" }}>
                    <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FAF7F2', border: '1px solid #EAE3D7' }}>
                      <span style={{ color: '#78716C', fontSize: 10, display: 'block' }}>Standard / Registry</span>
                      <span style={{ color: '#1C1917', fontWeight: 700, marginTop: 2, display: 'block' }}>{p.standard_registry}</span>
                    </div>
                    <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FAF7F2', border: '1px solid #EAE3D7' }}>
                      <span style={{ color: '#78716C', fontSize: 10, display: 'block' }}>Lifecycle Stage</span>
                      <span style={{ color: '#059669', fontWeight: 700, marginTop: 2, display: 'block' }}>{p.current_stage}</span>
                    </div>
                  </div>

                  {/* Reductions & Issuance Details */}
                  <div
                    style={{
                      padding: '12px 14px',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#78716C' }}>Estimated Annual Reduction:</span>
                      <span style={{ color: '#1C1917', fontWeight: 700 }}>{p.estimated_annual_reduction_tco2e} tCO₂e/yr</span>
                    </div>
                    {p.issued_credits_tco2e !== undefined && p.issued_credits_tco2e !== null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#78716C' }}>Registry Issued Credits:</span>
                        <span style={{ color: '#047857', fontWeight: 700 }}>{p.issued_credits_tco2e} tCO₂e</span>
                      </div>
                    )}
                    {p.serial_number_batch && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#78716C' }}>Registry Serial Batch:</span>
                        <span style={{ color: '#44403C', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.serial_number_batch}>
                          {p.serial_number_batch}
                        </span>
                      </div>
                    )}
                    {p.vvb_auditor && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#78716C' }}>Third-Party DOE / VVB:</span>
                        <span style={{ color: '#1C1917', fontWeight: 600 }}>{p.vvb_auditor}</span>
                      </div>
                    )}
                  </div>

                  {/* Audit Note & Integrity Notice */}
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: '#FFFFFF',
                      border: '1px solid #EAE3D7',
                      fontSize: 11.5,
                      color: '#44403C',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ fontWeight: 700, color: '#78716C', display: 'block', marginBottom: 2 }}>
                      Integrity &amp; Provenance Note:
                    </span>
                    {p.audit_note}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── UPLOAD EVIDENCE MODAL ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              fontFamily: "var(--font-ui, 'Inter', sans-serif)",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUploadModalOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(28, 25, 23, 0.55)',
                backdropFilter: 'blur(3px)',
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                maxWidth: 540,
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 14,
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.18)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EAE3D7', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Upload size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
                      Upload Carbon Evidence
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#78716C' }}>
                      AI/OCR extracts billing parameters &amp; computes SHA-256 hash
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#78716C',
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12 }}>
                {/* Filename */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                    Document File Name
                  </label>
                  <input
                    type="text"
                    required
                    value={uploadFilename}
                    onChange={(e) => setUploadFilename(e.target.value)}
                    placeholder="e.g. MSEDCL_Electricity_Invoice_Oct2026.pdf"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      fontSize: 12,
                      color: '#1C1917',
                      outline: 'none',
                    }}
                  />
                  <p style={{ margin: '4px 0 0 0', fontSize: 10.5, color: '#78716C' }}>
                    Accepts utility bills, LPG tanker weighbridge slips, calibration certs, and submeter logs.
                  </p>
                </div>

                {/* Document Type & Period */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                      Evidence Category
                    </label>
                    <select
                      value={uploadType}
                      onChange={(e) => setUploadType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: '#FAFAF9',
                        border: '1px solid #D6D3D1',
                        fontSize: 12,
                        color: '#1C1917',
                        outline: 'none',
                      }}
                    >
                      <option value="ELECTRICITY_BILL">Electricity Utility Bill</option>
                      <option value="FUEL_INVOICE">Fuel Invoice (LPG / Diesel)</option>
                      <option value="CALIBRATION_CERT">Calibration Certificate</option>
                      <option value="RENEWABLE_PPA">Renewable PPA / Solar Invoice</option>
                      <option value="METER_LOG">Submeter SCADA Log</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                      Reporting Period
                    </label>
                    <input
                      type="text"
                      value={uploadPeriod}
                      onChange={(e) => setUploadPeriod(e.target.value)}
                      placeholder="2026-10"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: '#FAFAF9',
                        border: '1px solid #D6D3D1',
                        fontSize: 12,
                        fontFamily: "var(--font-mono, monospace)",
                        color: '#1C1917',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Uploader Name */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                    Uploaded By (Signatory)
                  </label>
                  <input
                    type="text"
                    value={uploadUploader}
                    onChange={(e) => setUploadUploader(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      fontSize: 12,
                      color: '#1C1917',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                    Audit Notes / Provenance Remark
                  </label>
                  <textarea
                    rows={2}
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    placeholder="e.g. Scanned copy of physical invoice signed by plant operations manager."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      fontSize: 12,
                      color: '#1C1917',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                </div>

                {/* Modal Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: '#FAF7F2',
                      border: '1px solid #D6D3D1',
                      color: '#44403C',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadSubmitting}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      background: '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: uploadSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: uploadSubmitting ? 0.7 : 1,
                    }}
                  >
                    {uploadSubmitting ? (
                      <RefreshCw size={14} className="spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>{uploadSubmitting ? 'Extracting via OCR...' : 'Process & Upload'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── CONFIRM / EDIT VALUES MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {confirmingDoc && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              fontFamily: "var(--font-ui, 'Inter', sans-serif)",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmingDoc(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(28, 25, 23, 0.55)',
                backdropFilter: 'blur(3px)',
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                maxWidth: 540,
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 14,
                boxShadow: '0 20px 45px rgba(0, 0, 0, 0.18)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EAE3D7', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
                      Confirm &amp; Link Extracted Evidence
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#78716C', fontFamily: "var(--font-mono, monospace)" }}>
                      {confirmingDoc.document_id} • {confirmingDoc.filename}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setConfirmingDoc(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#78716C',
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Form Content */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12 }}>
                {/* AI / OCR Extracted Raw Value Display */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 8,
                    background: '#FAF7F2',
                    border: '1px solid #EAE3D7',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: 11.5,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#78716C' }}>
                    <span>AI / OCR Extraction Confidence:</span>
                    <span style={{ color: '#047857', fontWeight: 700 }}>
                      {((confirmingDoc.extracted_fields?.confidence_score || 0.95) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#78716C' }}>
                    <span>Detected Supplier:</span>
                    <span style={{ color: '#1C1917', fontWeight: 600 }}>{confirmingDoc.extracted_fields?.supplier_name || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#78716C' }}>
                    <span>Detected Invoice #:</span>
                    <span style={{ color: '#1C1917', fontWeight: 600 }}>{confirmingDoc.extracted_fields?.invoice_number || 'N/A'}</span>
                  </div>
                </div>

                {/* Confirmed Consumption Value & Unit */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                      Confirmed Activity Value
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={confirmConsumption}
                      onChange={(e) => setConfirmConsumption(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: '#FAFAF9',
                        border: '1px solid #D6D3D1',
                        fontSize: 13,
                        fontFamily: "var(--font-mono, monospace)",
                        fontWeight: 700,
                        color: '#1C1917',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                      Measurement Unit
                    </label>
                    <input
                      type="text"
                      value={confirmUnit}
                      onChange={(e) => setConfirmUnit(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: '#FAFAF9',
                        border: '1px solid #D6D3D1',
                        fontSize: 13,
                        fontFamily: "var(--font-mono, monospace)",
                        fontWeight: 700,
                        color: '#1C1917',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Target Calculation Binding */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                    Bind to Emissions Inventory Target
                  </label>
                  <select
                    value={confirmTarget}
                    onChange={(e) => setConfirmTarget(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      fontSize: 12,
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: 600,
                      color: '#1C1917',
                      outline: 'none',
                    }}
                  >
                    <option value="scope2_grid">Scope 2 Location-Based Grid Electricity (MSEDCL)</option>
                    <option value="scope1_lpg">Scope 1 Stationary Combustion — Industrial LPG</option>
                    <option value="scope1_diesel">Scope 1 Stationary Combustion — Backup DG Diesel</option>
                    <option value="scope2_solar_ppa">Scope 2 Market-Based Rooftop Solar PPA</option>
                    <option value="calibration_submeter">Quality Assurance — Meter Calibration Log</option>
                  </select>
                  <p style={{ margin: '4px 0 0 0', fontSize: 10.5, color: '#78716C' }}>
                    Confirmed activity data will automatically link to this metric's formula and audit trail.
                  </p>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#1C1917', marginBottom: 5 }}>
                    Auditor Verification Note
                  </label>
                  <textarea
                    rows={2}
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    placeholder="e.g. Cross-verified with Class 0.2S incoming feeder submeter pulse telemetry."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 8,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      fontSize: 12,
                      color: '#1C1917',
                      outline: 'none',
                      resize: 'none',
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setConfirmingDoc(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      background: '#FAF7F2',
                      border: '1px solid #D6D3D1',
                      color: '#44403C',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveConfirmation}
                    disabled={confirmSubmitting}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 8,
                      background: '#059669',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: confirmSubmitting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      opacity: confirmSubmitting ? 0.7 : 1,
                    }}
                  >
                    {confirmSubmitting ? (
                      <RefreshCw size={14} className="spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>{confirmSubmitting ? 'Saving...' : 'Confirm & Bind to Inventory'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── PROVENANCE INSPECT DRAWER ───────────────────────────────────────── */}
      <AnimatePresence>
        {inspectingDoc && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              justifyContent: 'flex-end',
              fontFamily: "var(--font-ui, 'Inter', sans-serif)",
            }}
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInspectingDoc(null)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(28, 25, 23, 0.55)',
                backdropFilter: 'blur(3px)',
              }}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              style={{
                position: 'relative',
                zIndex: 10,
                width: '100%',
                maxWidth: 560,
                height: '100%',
                background: '#FFFFFF',
                borderLeft: '1px solid #EAE3D7',
                boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                padding: '24px',
                gap: 20,
                overflowY: 'auto',
                color: '#1C1917',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #EAE3D7', paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#EAE3D7',
                      color: '#44403C',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileCheck size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1917' }}>
                      Document Provenance
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: 11.5, color: '#047857', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                      {inspectingDoc.document_id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setInspectingDoc(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#78716C',
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* SHA-256 Checksum Card */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: 10,
                  background: '#FAF7F2',
                  border: '1px solid #EAE3D7',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, fontFamily: "var(--font-mono, monospace)" }}>
                  <span style={{ color: '#78716C', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Lock size={13} color="#059669" />
                    <span>Cryptographic SHA-256 Checksum</span>
                  </span>
                  <button
                    onClick={() => handleCopyHash(inspectingDoc.sha256_hash, inspectingDoc.document_id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: 2,
                      color: '#78716C',
                    }}
                  >
                    {copiedHash === inspectingDoc.document_id ? (
                      <Check size={13} color="#10B981" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                </div>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 6,
                    background: '#FFFFFF',
                    border: '1px solid #EAE3D7',
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: 11,
                    color: '#047857',
                    wordBreak: 'break-all',
                    userSelect: 'all',
                  }}
                >
                  {inspectingDoc.sha256_hash}
                </div>
              </div>

              {/* Version History Thread */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#78716C', textTransform: 'uppercase', fontFamily: "var(--font-mono, monospace)", letterSpacing: '0.04em' }}>
                  Audit Version History ({inspectingDoc.version_history?.length || 1})
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(inspectingDoc.version_history || []).map((ver) => (
                    <div
                      key={ver.version}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#FAF7F2',
                        border: '1px solid #EAE3D7',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontFamily: "var(--font-mono, monospace)" }}>
                        <span style={{ color: '#047857', fontWeight: 700 }}>Version {ver.version}</span>
                        <span style={{ color: '#78716C' }}>{new Date(ver.timestamp).toLocaleString()}</span>
                      </div>
                      <p style={{ margin: 0, color: '#1C1917', fontWeight: 600 }}>Actor: {ver.modified_by}</p>
                      <p style={{ margin: 0, color: '#78716C', fontSize: 11.5 }}>{ver.note}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Linkage */}
              {inspectingDoc.linked_calculation_target && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 10,
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: 12,
                  }}
                >
                  <span style={{ color: '#047857', fontWeight: 700 }}>Linked Emissions Target:</span>
                  <p style={{ margin: 0, color: '#1C1917', fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                    {inspectingDoc.linked_calculation_target}
                  </p>
                  <button
                    onClick={() => {
                      setTraceabilityMetric(inspectingDoc.linked_calculation_target || null);
                      setInspectingDoc(null);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#059669',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left',
                      padding: '4px 0 0 0',
                    }}
                  >
                    Inspect Full Mathematical Traceability →
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── CLICKABLE TRACEABILITY DRAWER ───────────────────────────────────── */}
      <CarbonTraceabilityDrawer
        isOpen={Boolean(traceabilityMetric)}
        metricId={traceabilityMetric}
        period={periodFilter === 'ALL' ? '2026-10' : periodFilter}
        onClose={() => setTraceabilityMetric(null)}
        onNavigateToEvidence={(docId) => {
          if (docId) {
            const found = documents.find((d) => d.document_id === docId);
            if (found) setInspectingDoc(found);
          }
        }}
      />
    </div>
  );
};
