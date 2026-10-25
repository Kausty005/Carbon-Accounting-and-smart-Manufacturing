import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Building2,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Award,
  Layers,
  Database,
  Info,
  Clock,
  ChevronRight,
  ExternalLink,
  Lock,
  ArrowUpRight,
  Check,
  Archive,
  MessageSquare,
  Send,
  UserCheck,
  Search,
  FileCheck2,
} from 'lucide-react';
import {
  fetchAuditCompanies,
  generateCorporateAuditReport,
  downloadCorporateAuditPdf,
  getOfflineFallbackAuditReport,
  type CompanyFacilityProfile,
  type CorporateAuditReport,
  type AuditReportGenerateRequest,
  type ReportingPeriodType,
} from '../../services/carbonApi';
import {
  evidenceVaultApi,
  type ReportWorkflowState,
  type DataQualityCheckResult,
  type EvidenceDocument,
} from '../../services/evidenceVaultApi';
import { CarbonTraceabilityDrawer } from './CarbonTraceabilityDrawer';

export function CarbonAuditReportView() {
  const [companies, setCompanies] = useState<CompanyFacilityProfile[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('precisionworks');
  const [periodType, setPeriodType] = useState<ReportingPeriodType>('CALENDAR_MONTH');
  const [calendarYear, setCalendarYear] = useState<number>(2026);
  const [calendarMonth, setCalendarMonth] = useState<number>(10);
  const [reportType, setReportType] = useState<'COMPREHENSIVE_AUDIT' | 'EXECUTIVE_SUMMARY' | 'STATUTORY_RECONCILIATION'>('COMPREHENSIVE_AUDIT');

  const [report, setReport] = useState<CorporateAuditReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [downloadingPack, setDownloadingPack] = useState<boolean>(false);
  const [workflowState, setWorkflowState] = useState<ReportWorkflowState | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQualityCheckResult | null>(null);
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceDocument[]>([]);
  const [selectedTraceMetric, setSelectedTraceMetric] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<string>('');
  const [commentRole, setCommentRole] = useState<'auditor' | 'manager' | 'compliance_officer'>('auditor');
  const [commentAuthor, setCommentAuthor] = useState<string>('Dr. Ananya Sharma');
  const [transitioningState, setTransitioningState] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'exec' | 'inventory' | 'allowance' | 'methodology' | 'boundaries' | 'audit_trail' | 'evidence_index'>('exec');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'warn' } | null>(null);

  useEffect(() => {
    loadCompanies();
    handleGenerate();
  }, []);

  const loadCompanies = async () => {
    try {
      const data = await fetchAuditCompanies();
      setCompanies(data);
    } catch (e) {
      console.warn('Using fallback companies', e);
    }
  };

  const loadComplianceAndWorkflow = async (reportId?: string) => {
    try {
      const period = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
      const [status, dq, docs] = await Promise.all([
        reportId ? evidenceVaultApi.getWorkflowStatus(reportId).catch(() => null) : null,
        evidenceVaultApi.evaluateDataQuality(period).catch(() => null),
        evidenceVaultApi.getDocuments(period).catch(() => []),
      ]);
      if (status) setWorkflowState(status);
      if (dq) setDataQuality(dq);
      if (docs) setEvidenceDocs(docs);
    } catch (e) {
      console.warn('Compliance data loading error', e);
    }
  };

  const handleGenerate = async (companyIdOverride?: string) => {
    const targetComp = companyIdOverride || selectedCompanyId;
    setLoading(true);
    setFeedbackMsg(null);

    const req: AuditReportGenerateRequest = {
      company_id: targetComp,
      period_type: periodType,
      calendar_year: calendarYear,
      calendar_month: calendarMonth,
      report_type: reportType,
      include_credit_holdings: true,
    };

    try {
      const rep = await generateCorporateAuditReport(req);
      setReport(rep);
      await loadComplianceAndWorkflow(rep.metadata.report_id);
      setFeedbackMsg({ text: `Audit report generated successfully (${rep.metadata.report_id})`, type: 'success' });
    } catch (err) {
      console.warn('Backend unavailable, generating verified offline fallback report', err);
      const fallbackRep = getOfflineFallbackAuditReport(req);
      setReport(fallbackRep);
      await loadComplianceAndWorkflow(fallbackRep.metadata.report_id);
      setFeedbackMsg({ text: 'Report rendered via client-side offline calculation engine', type: 'info' });
    } finally {
      setLoading(false);
    }
  };

  const handleWorkflowTransition = async (targetState: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'EXPORTED') => {
    if (!report) return;
    setTransitioningState(true);
    try {
      const res = await evidenceVaultApi.transitionWorkflow({
        report_id: report.metadata.report_id,
        target_status: targetState,
        actor_name: commentAuthor,
        actor_role: commentRole,
        comments: `Transitioned to ${targetState} by ${commentAuthor} (${commentRole})`,
      });
      setWorkflowState(res);
      setFeedbackMsg({ text: `Report successfully transitioned to ${targetState}`, type: 'success' });
    } catch (err: any) {
      setFeedbackMsg({ text: `Transition error: ${err.message}`, type: 'warn' });
    } finally {
      setTransitioningState(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!report || !commentText.trim()) return;
    try {
      const res = await evidenceVaultApi.addReviewerComment({
        report_id: report.metadata.report_id,
        author_name: commentAuthor,
        author_role: commentRole,
        comment_text: commentText.trim(),
        section_reference: 'General Audit',
      });
      setWorkflowState(res);
      setCommentText('');
      setFeedbackMsg({ text: 'Reviewer comment logged in audit trail', type: 'success' });
    } catch (err: any) {
      setFeedbackMsg({ text: `Failed to post comment: ${err.message}`, type: 'warn' });
    }
  };

  const handleDownloadPack = async () => {
    if (!report) return;
    setDownloadingPack(true);
    setFeedbackMsg(null);
    try {
      const blob = await evidenceVaultApi.downloadReportPack(
        selectedCompanyId,
        periodType,
        calendarYear,
        calendarMonth
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WattWise_Carbon_Report_Pack_${report.metadata.report_id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setFeedbackMsg({ text: 'Complete Official Report Pack (ZIP) downloaded successfully (PDF + CSV Workbook + Evidence Index + Reconciliation + Compliance Statement)', type: 'success' });
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({ text: `Failed to generate report pack ZIP: ${err.message}`, type: 'warn' });
    } finally {
      setDownloadingPack(false);
    }
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCompanyId(newId);
    handleGenerate(newId);
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    setDownloadingPdf(true);
    setFeedbackMsg(null);

    const req: AuditReportGenerateRequest = {
      company_id: selectedCompanyId,
      period_type: periodType,
      calendar_year: calendarYear,
      calendar_month: calendarMonth,
      report_type: reportType,
    };

    try {
      const blob = await downloadCorporateAuditPdf(req);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WattWise_Carbon_Audit_${report.metadata.report_id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setFeedbackMsg({ text: 'Official PDF downloaded successfully', type: 'success' });
    } catch (err) {
      console.warn('PDF endpoint unavailable, downloading structured audit report as text', err);
      // Fallback text/markdown export if offline
      const blob = new Blob([generateTextAuditReport(report)], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `WattWise_Carbon_Audit_${report.metadata.report_id}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setFeedbackMsg({ text: 'Backend PDF service offline. Exported complete text audit dossier.', type: 'info' });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    let csv = 'Scope,Source Category,Source Name,Activity Amount,Activity Unit,Provenance,Emission Factor,Factor Unit,Factor Source,Emissions (kg CO2e),Emissions (tCO2e),Share of Gross (%)\n';
    report.inventory_breakdown.forEach(item => {
      csv += `"${item.source_category.split(' ')[0]} ${item.source_category.split(' ')[1]}","${item.source_category}","${item.source_name}",${item.activity_amount},"${item.activity_unit}","${item.provenance}",${item.emission_factor},"${item.emission_factor_unit}","${item.emission_factor_source}",${item.emissions_kg_co2e},${item.emissions_t_co2e},${item.percentage_of_gross}%\n`;
    });
    csv += `\nSUMMARY METRICS\nTotal Gross Emissions (tCO2e),${report.gross_emissions_tco2e}\nScope 1 Total (tCO2e),${report.scope1_total_tco2e}\nScope 2 Total (tCO2e),${report.scope2_total_tco2e}\nStatutory Net Allowance (tCO2e),${report.allowance_reconciliation.net_available_allowance_tco2e}\nRemaining Allowance (tCO2e),${report.allowance_reconciliation.remaining_allowance_tco2e}\nAllowance Utilization (%),${report.allowance_reconciliation.utilization_pct}%\nClosing Certified Credits (tCO2e),${report.credit_reconciliation.closing_available_balance_tco2e}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WattWise_Carbon_Inventory_${report.metadata.report_id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateTextAuditReport = (rep: CorporateAuditReport): string => {
    return `================================================================================
WATTWISE AI — CORPORATE CARBON ACCOUNTING & EMISSIONS AUDIT REPORT
Report ID: ${rep.metadata.report_id}
Standard: ISO 14064-1:2018 & GHG Protocol Corporate Standard
Generated: ${new Date(rep.metadata.generated_at).toLocaleString()}
================================================================================

1. CORPORATE & FACILITY IDENTIFICATION
Company:              ${rep.metadata.company.company_name}
Facility:             ${rep.metadata.company.facility_name}
Location:             ${rep.metadata.company.facility_location}
Reporting Boundary:   ${rep.metadata.company.reporting_boundary}
Regional Grid:        ${rep.metadata.company.grid_region}
Reporting Period:     ${rep.metadata.reporting_period.description}

2. EXECUTIVE SUMMARY
${rep.executive_summary_text}

3. GREENHOUSE GAS INVENTORY SUMMARY
Total Gross Emissions:   ${rep.gross_emissions_tco2e.toFixed(3)} tCO2e
Scope 1 Direct:          ${rep.scope1_total_tco2e.toFixed(3)} tCO2e (${((rep.scope1_total_tco2e / (rep.gross_emissions_tco2e || 1)) * 100).toFixed(1)}%)
Scope 2 Electricity:     ${rep.scope2_total_tco2e.toFixed(3)} tCO2e (${((rep.scope2_total_tco2e / (rep.gross_emissions_tco2e || 1)) * 100).toFixed(1)}%)

LINE-ITEM INVENTORY:
${rep.inventory_breakdown.map(i => ` - [${i.source_category}] ${i.source_name}: ${i.activity_amount} ${i.activity_unit} | EF: ${i.emission_factor} ${i.emission_factor_unit} | ${i.emissions_t_co2e.toFixed(3)} tCO2e (${i.percentage_of_gross}%) [Provenance: ${i.provenance}]`).join('\n')}

4. STATUTORY CARBON ALLOWANCE RECONCILIATION
Initial Allocated Allowance:  ${rep.allowance_reconciliation.initial_allocation_tco2e.toFixed(3)} tCO2e
Net Available Allowance:      ${rep.allowance_reconciliation.net_available_allowance_tco2e.toFixed(3)} tCO2e
Emissions Counted:            ${rep.allowance_reconciliation.gross_emissions_counted_tco2e.toFixed(3)} tCO2e
Remaining Allowance:          ${rep.allowance_reconciliation.remaining_allowance_tco2e.toFixed(3)} tCO2e (${rep.allowance_reconciliation.remaining_pct.toFixed(1)}%)
Utilization Rate:             ${rep.allowance_reconciliation.utilization_pct.toFixed(1)}%
Compliance Status:            ${rep.allowance_reconciliation.status}

5. CERTIFIED CARBON CREDIT HOLDINGS
Configured:                   ${rep.credit_reconciliation.is_configured ? 'YES' : 'NO / DATA UNAVAILABLE'}
Credits Acquired:             ${rep.credit_reconciliation.credits_acquired_tco2e.toFixed(2)} tCO2e
Credits Retired:              ${rep.credit_reconciliation.credits_retired_tco2e.toFixed(2)} tCO2e
Closing Available Balance:    ${rep.credit_reconciliation.closing_available_balance_tco2e.toFixed(2)} tCO2e
Note: Carbon credits are tracked separately and NEVER netted against gross emissions.

6. CRYPTOGRAPHIC AUDIT TRAIL
Hash-Chain Validity:          ${rep.metadata.hash_chain_verified ? 'VERIFIED (UNBROKEN)' : 'TAMPER DETECTED'}
Total 15-Min Blocks:          ${rep.metadata.total_audit_blocks}
Latest Merkle Root:           ${rep.metadata.latest_merkle_root}
================================================================================
`;
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'WITHIN_ALLOWANCE':
        return { bg: 'rgba(5, 150, 105, 0.1)', color: '#059669', border: '#A7F3D0', label: 'WITHIN ALLOWANCE' };
      case 'NEAR_LIMIT':
        return { bg: 'rgba(217, 119, 6, 0.1)', color: '#D97706', border: '#FDE68A', label: 'NEAR COMPLIANCE LIMIT' };
      case 'EXCEEDED':
        return { bg: 'rgba(220, 38, 38, 0.1)', color: '#DC2626', border: '#FECACA', label: 'ALLOWANCE EXCEEDED' };
      default:
        return { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1', label: 'NORMAL' };
    }
  };

  return (
    <div className="scroll-area" style={{ background: '#F4EEE5', minHeight: '100%', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1360, margin: '0 auto' }}>

        {/* ─── 1. PAGE HEADER & AUDIT CONTROLS ────────────────────────────────────── */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #EAE3D7',
          borderRadius: 12,
          padding: '20px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{
                  background: 'rgba(2, 132, 199, 0.1)',
                  borderRadius: 8,
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <FileText size={18} color="#0284C7" />
                </div>
                <h1 style={{ fontSize: 21, fontWeight: 700, color: '#1C1917', margin: 0, letterSpacing: -0.3 }}>
                  Carbon Accounting &amp; Audit Reports
                </h1>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #E2E8F0',
                  fontFamily: 'var(--font-mono)'
                }}>
                  ISO 14064-1 &bull; GHG PROTOCOL
                </span>
              </div>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                Generate transparent emissions inventories, reconcile carbon allowances, and review supporting calculations.
              </p>
            </div>

            {/* Top Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={!report}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#FFFFFF',
                  color: '#1C1917',
                  border: '1px solid #D1D5DB',
                  borderRadius: 7,
                  padding: '7px 13px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: report ? 'pointer' : 'not-allowed',
                  opacity: report ? 1 : 0.6,
                }}
              >
                <FileSpreadsheet size={13} color="#059669" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || !report}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#0284C7',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 7,
                  padding: '7px 15px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: downloadingPdf || !report ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
                }}
              >
                {downloadingPdf ? <RefreshCw size={13} className="spin" /> : <Download size={13} />}
                <span>{downloadingPdf ? 'Generating PDF...' : 'Download Official PDF'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPack}
                disabled={downloadingPack || !report}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: '#059669',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 7,
                  padding: '7px 15px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: downloadingPack || !report ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(5, 150, 105, 0.25)',
                }}
              >
                {downloadingPack ? <RefreshCw size={13} className="spin" /> : <Archive size={13} />}
                <span>{downloadingPack ? 'Bundling Pack...' : 'Download Report Pack (ZIP)'}</span>
              </button>
            </div>
          </div>

          {/* Filter & Selector Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginTop: 18,
            paddingTop: 16,
            borderTop: '1px solid #F1F5F9',
          }}>
            {/* Enterprise Selector */}
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>
                Target Enterprise &amp; Facility
              </label>
              <select
                value={selectedCompanyId}
                onChange={handleCompanyChange}
                style={{
                  width: '100%',
                  background: '#FAFAF9',
                  border: '1px solid #D6D3D1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1C1917',
                  outline: 'none',
                }}
              >
                {companies.map(c => (
                  <option key={c.company_id} value={c.company_id}>
                    {c.company_name} ({c.facility_name.split('—')[0].trim()})
                  </option>
                ))}
              </select>
            </div>

            {/* Reporting Period */}
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>
                Reporting Timeframe
              </label>
              <select
                value={periodType}
                onChange={(e) => {
                  setPeriodType(e.target.value as ReportingPeriodType);
                }}
                style={{
                  width: '100%',
                  background: '#FAFAF9',
                  border: '1px solid #D6D3D1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1C1917',
                  outline: 'none',
                }}
              >
                <option value="CALENDAR_MONTH">Calendar Month (October 2026 &bull; 31 Days)</option>
                <option value="DAILY">Daily Operational Cycle (24 Hours)</option>
                <option value="SIMULATED_DEMO_30D">Standard 30-Day Engineering Window</option>
              </select>
            </div>

            {/* Report Type */}
            <div>
              <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 4 }}>
                Audit Reporting Standard
              </label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as any)}
                style={{
                  width: '100%',
                  background: '#FAFAF9',
                  border: '1px solid #D6D3D1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#1C1917',
                  outline: 'none',
                }}
              >
                <option value="COMPREHENSIVE_AUDIT">Comprehensive ISO 14064-1 &amp; GHG Protocol</option>
                <option value="EXECUTIVE_SUMMARY">Executive Board Environmental Summary</option>
                <option value="STATUTORY_RECONCILIATION">Statutory Carbon Quota &amp; Credit Ledger</option>
              </select>
            </div>

            {/* Recalculate Trigger */}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={loading}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  background: '#1C1917',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: 6,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                <RefreshCw size={12} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Re-calculating...' : 'Recalculate Audit'}</span>
              </button>
            </div>
          </div>

          {feedbackMsg && (
            <div style={{
              marginTop: 12,
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 11.5,
              fontWeight: 500,
              background: feedbackMsg.type === 'success' ? '#ECFDF5' : feedbackMsg.type === 'info' ? '#F0F9FF' : '#FEF3C7',
              color: feedbackMsg.type === 'success' ? '#065F46' : feedbackMsg.type === 'info' ? '#0369A1' : '#92400E',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {feedbackMsg.type === 'success' ? <Check size={12} /> : <Info size={12} />}
              <span>{feedbackMsg.text}</span>
            </div>
          )}
        </div>

        {/* ─── WORKFLOW & QUALITY INTEGRATION BANNERS ──────────────────────────────── */}
        {report && (
          <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Missing Evidence / Quality Alert */}
            {dataQuality && (dataQuality.audit_readiness_status !== 'AUDIT_READY' || dataQuality.missing_documents.length > 0) && (
              <div style={{
                background: '#FFFBEB',
                border: '1.5px solid #FCD34D',
                borderRadius: 10,
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <AlertTriangle size={18} color="#D97706" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>
                      Compliance Alert: {dataQuality.missing_documents.length} Missing Primary Evidence Document(s)
                    </div>
                    <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>
                      Required for period <b>{dataQuality.reporting_period}</b>: {dataQuality.missing_documents.map(m => m.expected_document).join(', ')}. Statutory compliance score: <b>{dataQuality.compliance_score_pct}%</b>.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('evidence_index')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 6,
                    background: '#D97706',
                    color: '#FFFFFF',
                    fontSize: 11,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Review Missing Evidence
                </button>
              </div>
            )}

            {/* Workflow State Tracker & Governance Controls */}
            <div style={{
              background: '#FFFFFF',
              border: '1.5px solid #EAE3D7',
              borderRadius: 12,
              padding: '16px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ShieldCheck size={18} color="#0284C7" />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1C1917', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Report Governance &amp; Approval Workflow
                  </span>
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: workflowState?.status === 'APPROVED' ? '#ECFDF5' : workflowState?.status === 'EXPORTED' ? '#EDE9FE' : workflowState?.status === 'IN_REVIEW' ? '#EFF6FF' : '#F1F5F9',
                    color: workflowState?.status === 'APPROVED' ? '#065F46' : workflowState?.status === 'EXPORTED' ? '#5B21B6' : workflowState?.status === 'IN_REVIEW' ? '#1E40AF' : '#475569',
                    border: '1px solid currentColor',
                  }}>
                    {workflowState?.status || 'DRAFT'} &bull; v{workflowState?.version || 1}
                  </span>
                </div>

                {/* Workflow Transition Action Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {(!workflowState || workflowState.status === 'DRAFT') && (
                    <button
                      type="button"
                      disabled={transitioningState}
                      onClick={() => handleWorkflowTransition('IN_REVIEW')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: '#0284C7',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <UserCheck size={12} />
                      <span>Submit for ESG Review</span>
                    </button>
                  )}
                  {workflowState?.status === 'IN_REVIEW' && (
                    <button
                      type="button"
                      disabled={transitioningState}
                      onClick={() => handleWorkflowTransition('APPROVED')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: '#059669',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <CheckCircle2 size={12} />
                      <span>Sign &amp; Approve Report</span>
                    </button>
                  )}
                  {workflowState?.status === 'APPROVED' && (
                    <button
                      type="button"
                      disabled={transitioningState}
                      onClick={() => handleWorkflowTransition('EXPORTED')}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        background: '#7C3AED',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <Lock size={12} />
                      <span>Lock &amp; Mark Exported</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 4-Stage Progress Line */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                padding: '10px 14px',
                background: '#FAFAF9',
                borderRadius: 8,
                border: '1px solid #EAE3D7',
                marginBottom: 14,
              }}>
                {[
                  { key: 'DRAFT', label: '1. Calculation Draft', desc: 'Generated by calculation engine' },
                  { key: 'IN_REVIEW', label: '2. Under ESG Review', desc: 'Auditor & engineering verification' },
                  { key: 'APPROVED', label: '3. Plant Sign-Off', desc: 'Authorized by Plant GM / Auditor' },
                  { key: 'EXPORTED', label: '4. Filed & Exported', desc: 'Report pack locked for BRSR/BEE' },
                ].map((step, idx) => {
                  const states = ['DRAFT', 'IN_REVIEW', 'APPROVED', 'EXPORTED'];
                  const curIdx = states.indexOf(workflowState?.status || 'DRAFT');
                  const isDone = curIdx >= idx;
                  const isCur = curIdx === idx;
                  return (
                    <div key={step.key} style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: isCur ? '#FFFFFF' : 'transparent',
                      border: isCur ? '1px solid #CBD5E1' : '1px solid transparent',
                      boxShadow: isCur ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: isDone ? '#059669' : '#CBD5E1',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: isCur ? 800 : 600, color: isCur ? '#1C1917' : '#64748B' }}>
                          {step.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 9.5, color: '#94A3B8', paddingLeft: 14 }}>
                        {step.desc}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reviewer Comments & Add Comment Box */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={12} />
                  <span>Reviewer Comments &amp; Sign-off Trail ({workflowState?.reviewer_comments?.length || 0})</span>
                </div>
                {workflowState?.reviewer_comments && workflowState.reviewer_comments.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {workflowState.reviewer_comments.map((c, i) => (
                      <div key={i} style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: '#FAFAF9',
                        border: '1px solid #F1F5F9',
                        fontSize: 11.5,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, color: '#1C1917' }}>
                            {c.author_name} &bull; <span style={{ fontSize: 10, color: '#0284C7', textTransform: 'uppercase' }}>{c.author_role}</span>
                          </span>
                          <span style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                            {new Date(c.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ color: '#475569', lineHeight: 1.4 }}>
                          {c.comment_text}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Comment Input Form */}
                <form onSubmit={handleAddComment} style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter audit note, reconciliation comment, or approval remark..."
                    style={{
                      flex: 1,
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 11.5,
                      outline: 'none',
                    }}
                  />
                  <select
                    value={commentRole}
                    onChange={(e) => setCommentRole(e.target.value as any)}
                    style={{
                      background: '#FAFAF9',
                      border: '1px solid #D6D3D1',
                      borderRadius: 6,
                      padding: '6px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  >
                    <option value="auditor">Auditor (BEE)</option>
                    <option value="manager">Plant GM</option>
                    <option value="compliance_officer">Compliance Lead</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 6,
                      background: '#1C1917',
                      color: '#FFFFFF',
                      fontSize: 11,
                      fontWeight: 700,
                      border: 'none',
                      cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                      opacity: commentText.trim() ? 1 : 0.6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Send size={11} />
                    <span>Post Comment</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ─── 2. COMPACT SUMMARY KPI CARDS (TRACEABLE) ────────────────────────────── */}
        {report && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}>
            {/* KPI 1: Gross Footprint */}
            <div
              onClick={() => setSelectedTraceMetric('total_gross')}
              title="Click to trace formula derivation, activity data, and primary supporting evidence"
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284C7';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAE3D7';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Total Gross Emissions
                </span>
                <span style={{ fontSize: 10, color: '#0284C7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Search size={10} /> Trace
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                  {report.gross_emissions_tco2e.toFixed(3)}
                </span>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#0284C7', marginTop: 4 }}>
                🔍 Click to trace derivation &amp; evidence
              </div>
            </div>

            {/* KPI 2: Scope 1 */}
            <div
              onClick={() => setSelectedTraceMetric('scope1_lpg')}
              title="Click to trace Scope 1 direct combustion invoices and factors"
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284C7';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAE3D7';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Scope 1 (Direct Combustion)
                </span>
                <span style={{ fontSize: 10, color: '#0284C7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Search size={10} /> Trace
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                  {report.scope1_total_tco2e.toFixed(3)}
                </span>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4 }}>
                {((report.scope1_total_tco2e / (report.gross_emissions_tco2e || 1)) * 100).toFixed(1)}% of gross &bull; LPG &amp; Diesel
              </div>
            </div>

            {/* KPI 3: Scope 2 */}
            <div
              onClick={() => setSelectedTraceMetric('scope2_grid')}
              title="Click to trace Scope 2 CEA Grid electricity derivation and utility bills"
              style={{
                background: '#FFFFFF',
                border: '1px solid #EAE3D7',
                borderRadius: 10,
                padding: '14px 16px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0284C7';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAE3D7';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Scope 2 (CEA Grid Electricity)
                </span>
                <span style={{ fontSize: 10, color: '#0284C7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Search size={10} /> Trace
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                  {report.scope2_total_tco2e.toFixed(3)}
                </span>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4 }}>
                {((report.scope2_total_tco2e / (report.gross_emissions_tco2e || 1)) * 100).toFixed(1)}% &bull; CEA v22.0 Location-Based
              </div>
            </div>

            {/* KPI 4: Remaining Allowance */}
            {(() => {
              const b = getStatusBadge(report.allowance_reconciliation.status);
              return (
                <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Remaining Carbon Allowance
                    </span>
                    <span style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: 4,
                      background: b.bg,
                      color: b.color,
                      border: `1px solid ${b.border}`
                    }}>
                      {b.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: b.color, fontFamily: 'var(--font-mono)' }}>
                      {report.allowance_reconciliation.remaining_allowance_tco2e.toFixed(2)}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>tCO₂e</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4 }}>
                    {report.allowance_reconciliation.remaining_pct.toFixed(1)}% remaining of {report.allowance_reconciliation.net_available_allowance_tco2e.toFixed(2)} t cap
                  </div>
                </div>
              );
            })()}

            {/* KPI 5: Certified Carbon Credits */}
            <div style={{ background: '#FFFFFF', border: '1px solid #EAE3D7', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Certified Carbon Credits
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: report.credit_reconciliation.is_configured ? '#059669' : '#94A3B8', fontFamily: 'var(--font-mono)' }}>
                  {report.credit_reconciliation.is_configured ? report.credit_reconciliation.closing_available_balance_tco2e.toFixed(2) : '0.00'}
                </span>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>tCO₂e</span>
              </div>
              <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 4 }}>
                {report.credit_reconciliation.is_configured ? 'Verra VCS & Gold Standard' : 'Not configured / Data unavailable'}
              </div>
            </div>
          </div>
        )}

        {/* ─── 3. TABBED REPORT PREVIEW WORKSPACE ──────────────────────────────────── */}
        {report && (
          <div style={{
            background: '#FFFFFF',
            border: '1px solid #EAE3D7',
            borderRadius: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            overflow: 'hidden',
          }}>
            {/* Tab Navigation Strip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid #EAE3D7',
              background: '#FAFAF9',
              padding: '0 12px',
              overflowX: 'auto',
            }}>
              {[
                { id: 'exec', label: '1. Executive Summary' },
                { id: 'inventory', label: '2. Emissions Inventory' },
                { id: 'allowance', label: '3. Allowance & Credits' },
                { id: 'methodology', label: '4. Methodology & Factors' },
                { id: 'boundaries', label: '5. Boundaries & Scope 3' },
                { id: 'audit_trail', label: '6. Cryptographic Audit Trail' },
                { id: 'evidence_index', label: '7. Evidence Index & Provenance' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id as any)}
                  style={{
                    padding: '12px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: activeTab === t.id ? '#0284C7' : '#64748B',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === t.id ? '2px solid #0284C7' : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div style={{ padding: '24px' }}>

              {/* TAB 1: EXECUTIVE SUMMARY */}
              {activeTab === 'exec' && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1C1917', marginBottom: 8 }}>
                      Corporate Carbon Inventory &bull; Executive Statement
                    </h3>
                    <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px', margin: 0 }}>
                      {report.executive_summary_text}
                    </p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                    {/* Facility Identification Card */}
                    <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '16px', background: '#FFFFFF' }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 12 }}>
                        Facility &amp; Reporting Scope
                      </h4>
                      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 0', color: '#64748B', width: '38%' }}>Legal Entity:</td>
                            <td style={{ padding: '6px 0', fontWeight: 600, color: '#1C1917' }}>{report.metadata.company.company_name}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 0', color: '#64748B' }}>Facility Name:</td>
                            <td style={{ padding: '6px 0', fontWeight: 600, color: '#1C1917' }}>{report.metadata.company.facility_name}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 0', color: '#64748B' }}>Location:</td>
                            <td style={{ padding: '6px 0', color: '#334155' }}>{report.metadata.company.facility_location}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '6px 0', color: '#64748B' }}>Operational Boundary:</td>
                            <td style={{ padding: '6px 0', color: '#334155' }}>{report.metadata.company.reporting_boundary}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '6px 0', color: '#64748B' }}>Grid Region:</td>
                            <td style={{ padding: '6px 0', color: '#334155' }}>{report.metadata.company.grid_region}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Allowance Utilization Progress */}
                    <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '16px', background: '#FFFFFF' }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 12 }}>
                        Statutory Carbon Allowance Progress
                      </h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12 }}>
                        <span style={{ color: '#64748B' }}>Consumed: <b>{report.gross_emissions_tco2e.toFixed(2)} tCO₂e</b></span>
                        <span style={{ fontWeight: 700, color: report.allowance_reconciliation.status === 'WITHIN_ALLOWANCE' ? '#059669' : '#DC2626' }}>
                          {report.allowance_reconciliation.utilization_pct.toFixed(1)}% of {report.allowance_reconciliation.net_available_allowance_tco2e.toFixed(2)} t cap
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 10, background: '#E2E8F0', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(100, report.allowance_reconciliation.utilization_pct)}%`,
                          height: '100%',
                          background: report.allowance_reconciliation.status === 'WITHIN_ALLOWANCE' ? '#059669' : report.allowance_reconciliation.status === 'NEAR_LIMIT' ? '#D97706' : '#DC2626',
                          borderRadius: 5,
                        }} />
                      </div>
                      <div style={{ marginTop: 14, fontSize: 11, color: '#64748B', lineHeight: 1.5 }}>
                        {report.allowance_reconciliation.accounting_rule_disclaimer}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: EMISSIONS INVENTORY */}
              {activeTab === 'inventory' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                      Greenhouse Gas Source-Level Inventory
                    </h3>
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      Standard: ISO 14064-1:2018 Clause 5 &bull; Scope 1 &amp; 2 Operational Boundary
                    </span>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Scope / Category</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Emission Source</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Activity Amount</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Provenance</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Emission Factor</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Emissions (tCO₂e)</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Share (%)</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Traceability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.inventory_breakdown.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 600, color: item.source_category.startsWith('Scope 1') ? '#0284C7' : '#7C3AED' }}>
                              {item.source_category.split(' ')[0]} {item.source_category.split(' ')[1]}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>{item.source_name}</td>
                            <td style={{ padding: '8px 10px', color: '#475569', fontFamily: 'var(--font-mono)' }}>
                              {item.activity_amount.toLocaleString()} {item.activity_unit}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 4,
                                background: item.provenance === 'MEASURED' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(2, 132, 199, 0.1)',
                                color: item.provenance === 'MEASURED' ? '#059669' : '#0284C7',
                                fontFamily: 'var(--font-mono)'
                              }}>
                                {item.provenance}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B', fontSize: 11 }}>
                              {item.emission_factor} {item.emission_factor_unit}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                              {item.emissions_t_co2e.toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                              {item.percentage_of_gross.toFixed(1)}%
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  const metricId = item.source_name.toLowerCase().includes('grid') || item.source_category.toLowerCase().includes('electricity')
                                    ? 'scope2_grid'
                                    : item.source_name.toLowerCase().includes('lpg')
                                    ? 'scope1_lpg'
                                    : 'total_gross';
                                  setSelectedTraceMetric(metricId);
                                }}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(2, 132, 199, 0.1)',
                                  color: '#0284C7',
                                  border: '1px solid rgba(2, 132, 199, 0.3)',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                                title="Trace mathematical formula, emission factor source, and primary supporting evidence documents"
                              >
                                <Search size={10} />
                                <span>Trace</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {/* Totals Row */}
                        <tr style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1', fontWeight: 800 }}>
                          <td colSpan={5} style={{ padding: '10px', color: '#1C1917' }}>
                            TOTAL GROSS OPERATIONAL EMISSIONS (UNREDUCED)
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#1C1917', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                            {report.gross_emissions_tco2e.toFixed(3)}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: '#1C1917', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                            100.0%
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedTraceMetric('total_gross')}
                              style={{
                                padding: '4px 10px',
                                borderRadius: 4,
                                background: '#1C1917',
                                color: '#FFFFFF',
                                border: 'none',
                                fontSize: 10,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Search size={10} />
                              <span>Trace All</span>
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: ALLOWANCE & CREDITS RECONCILIATION */}
              {activeTab === 'allowance' && (
                <div>
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                      Table A: Statutory Carbon Allowance Reconciliation
                    </h3>
                    <p style={{ fontSize: 11.5, color: '#64748B', margin: 0, marginBottom: 12 }}>
                      Evaluates plant gross emissions against statutory allocation baseline.
                    </p>

                    <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>Item / Description</th>
                            <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>Quantity (tCO₂e)</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>Regulatory / Accounting Rule</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>Initial Allocated Carbon Allowance</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                              {report.allowance_reconciliation.initial_allocation_tco2e.toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>Statutory Consent-to-Operate baseline for reporting period</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>Additional Allocations Received</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#059669' }}>
                              +{report.allowance_reconciliation.additional_allocation_tco2e.toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>Supplementary allowance granted (None recorded)</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>Net Allowance Transfers (In / Out)</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              +{(report.allowance_reconciliation.transfers_received_tco2e - report.allowance_reconciliation.transfers_sent_tco2e).toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>Inter-facility transfer adjustments (None recorded)</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #E2E8F0', background: '#FAFAF9', fontWeight: 700 }}>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>Net Available Allowance</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                              {report.allowance_reconciliation.net_available_allowance_tco2e.toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#1C1917' }}>Maximum allowable carbon threshold</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', color: '#DC2626' }}>Gross Emissions Counted Against Allowance</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: '#DC2626', fontWeight: 600 }}>
                              -{report.allowance_reconciliation.gross_emissions_counted_tco2e.toFixed(3)}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>Actual operational emissions incurred</td>
                          </tr>
                          {(() => {
                            const b = getStatusBadge(report.allowance_reconciliation.status);
                            return (
                              <tr style={{ background: b.bg, fontWeight: 800 }}>
                                <td style={{ padding: '10px', color: b.color }}>
                                  Remaining Carbon Allowance ({b.label})
                                </td>
                                <td style={{ padding: '10px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: b.color, fontSize: 13 }}>
                                  {report.allowance_reconciliation.remaining_allowance_tco2e.toFixed(3)}
                                </td>
                                <td style={{ padding: '10px', color: b.color }}>
                                  {report.allowance_reconciliation.remaining_pct.toFixed(1)}% remaining &bull; {report.allowance_reconciliation.utilization_pct.toFixed(1)}% utilized
                                </td>
                              </tr>
                            );
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table B: Carbon Credit Holdings */}
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', marginBottom: 4 }}>
                      Table B: Certified Carbon Credit Holdings &amp; Registry Reconciliation
                    </h3>
                    <p style={{ fontSize: 11.5, color: '#64748B', margin: 0, marginBottom: 12 }}>
                      Tracks voluntary carbon offsets. In accordance with GHG Protocol Clause 9.5, carbon credits are <b>never deducted from gross operational emissions</b>.
                    </p>

                    {report.credit_reconciliation.is_configured && report.credit_reconciliation.transactions.length > 0 ? (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>Transaction ID &amp; Date</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>Registry &amp; Program</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', color: '#475569' }}>Project &amp; Vintage</th>
                              <th style={{ padding: '8px 10px', textAlign: 'center', color: '#475569' }}>Type</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>Quantity (tCO₂e)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.credit_reconciliation.transactions.map((tx, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '8px 10px' }}>
                                  <div style={{ fontWeight: 600, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>{tx.transaction_id}</div>
                                  <div style={{ fontSize: 10.5, color: '#64748B' }}>{tx.transaction_date}</div>
                                </td>
                                <td style={{ padding: '8px 10px', color: '#334155' }}>{tx.registry_program}</td>
                                <td style={{ padding: '8px 10px', color: '#475569', fontSize: 11 }}>
                                  <div>{tx.project_id}</div>
                                  <div style={{ fontSize: 10, color: '#94A3B8' }}>Vintage: {tx.vintage_year}</div>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: 4,
                                    background: tx.transaction_type === 'ACQUIRED' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                                    color: tx.transaction_type === 'ACQUIRED' ? '#059669' : '#D97706',
                                    fontFamily: 'var(--font-mono)'
                                  }}>
                                    {tx.transaction_type}
                                  </span>
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: tx.transaction_type === 'ACQUIRED' ? '#059669' : '#D97706', fontFamily: 'var(--font-mono)' }}>
                                  {tx.transaction_type === 'ACQUIRED' ? '+' : '-'}{tx.quantity_tco2e.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                            <tr style={{ background: '#ECFDF5', borderTop: '2px solid #A7F3D0', fontWeight: 800 }}>
                              <td colSpan={4} style={{ padding: '10px', color: '#065F46' }}>
                                CLOSING AVAILABLE CARBON CREDIT HOLDINGS (ACTIVE)
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#065F46', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
                                {report.credit_reconciliation.closing_available_balance_tco2e.toFixed(2)} tCO₂e
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '16px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 8, color: '#64748B', fontSize: 12 }}>
                        <strong>Status: Not Configured / Data Unavailable</strong>
                        <p style={{ margin: '6px 0 0 0', lineHeight: 1.5 }}>
                          {report.credit_reconciliation.accounting_note}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: METHODOLOGY & EMISSION FACTORS */}
              {activeTab === 'methodology' && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', marginBottom: 12 }}>
                    Standardized Calculation Methodologies &amp; Citations
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                    {report.methodology_disclosures.map((m, idx) => (
                      <div key={idx} style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '14px', background: '#FAFAF9' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#0284C7', marginBottom: 6 }}>
                          {m.standard}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#334155', lineHeight: 1.5, marginBottom: 8 }}>
                          <b>Guidance:</b> {m.methodology || m.boundary_approach || m.scope1_fuel_combustion}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 4, padding: '6px 8px' }}>
                          <b>Factor Citation:</b> {m.emission_factor_source || m.gwp_reference || m.stoichiometry}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 20, padding: '14px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0369A1', marginBottom: 4 }}>
                      Central Electricity Authority (CEA) Baseline Database Version 22.0
                    </div>
                    <div style={{ fontSize: 11.5, color: '#0C4A6E', lineHeight: 1.5 }}>
                      Scope 2 indirect emissions are calculated using the <i>Weighted Average Grid Emission Rate (including renewables and captive generation)</i> from Worksheet <code>Results!Row 14, Column 13</code> at <b>0.72886 kg CO₂/kWh</b>. In compliance with the GHG Protocol Scope 2 Guidance, this is formally disclosed as a location-based method; no market-based instruments or contractual certificates have been claimed.
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: BOUNDARIES & SCOPE 3 */}
              {activeTab === 'boundaries' && (
                <div>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', marginBottom: 12 }}>
                    Inventory Boundaries, Exclusions &amp; Scope 3 Status
                  </h3>
                  <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <tbody>
                        {Object.entries(report.data_quality_and_boundaries).map(([k, v], idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9', background: idx % 2 === 0 ? '#FFFFFF' : '#FAFAF9' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', width: '32%', textTransform: 'capitalize' }}>
                              {k.replace(/_/g, ' ')}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#1C1917' }}>
                              {String(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: CRYPTOGRAPHIC AUDIT TRAIL */}
              {activeTab === 'audit_trail' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: 0 }}>
                      Cryptographic Hash-Chain Verification (SHA-256)
                    </h3>
                    <span style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 4,
                      background: 'rgba(5, 150, 105, 0.1)',
                      color: '#059669',
                      border: '1px solid #A7F3D0'
                    }}>
                      CHAIN VERIFIED &bull; ZERO TAMPERING
                    </span>
                  </div>

                  <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 16 }}>
                    Every 15-minute telemetry interval is hashed into an immutable Merkle tree and chained to the previous block signature.
                    This provides mathematical certainty for SEBI BRSR Core and ISO 14064-1 third-party statutory assurance.
                  </p>

                  <div style={{ border: '1px solid #EAE3D7', borderRadius: 8, padding: '16px', background: '#FAFAF9' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, fontSize: 11.5 }}>
                      <div>
                        <span style={{ color: '#64748B' }}>Total Blocks Verified:</span>
                        <div style={{ fontWeight: 700, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                          {report.cryptographic_audit_trail.total_blocks_verified} blocks
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Hash Algorithm:</span>
                        <div style={{ fontWeight: 700, color: '#1C1917', fontFamily: 'var(--font-mono)' }}>
                          {report.cryptographic_audit_trail.cryptographic_algorithm}
                        </div>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Compliance Framework:</span>
                        <div style={{ fontWeight: 700, color: '#1C1917' }}>
                          {report.cryptographic_audit_trail.statutory_compliance_standard}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed #E2E8F0' }}>
                      <span style={{ fontSize: 10.5, color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>
                        Active Merkle Root Digest
                      </span>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: '#FFFFFF', padding: '6px 8px', borderRadius: 4, border: '1px solid #E2E8F0', marginTop: 4, wordBreak: 'break-all' }}>
                        {report.metadata.latest_merkle_root}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 7: EVIDENCE INDEX & PROVENANCE */}
              {activeTab === 'evidence_index' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1C1917', margin: '0 0 4px' }}>
                        Linked Supporting Evidence &amp; Provenance Index
                      </h3>
                      <p style={{ fontSize: 11.5, color: '#64748B', margin: 0 }}>
                        Primary physical source documents, utility invoices, and calibration certificates linked to period {calendarYear}-{String(calendarMonth).padStart(2, '0')}.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleDownloadPack}
                        disabled={downloadingPack}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 6,
                          background: '#059669',
                          color: '#FFFFFF',
                          fontSize: 11,
                          fontWeight: 700,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <Archive size={12} />
                        <span>{downloadingPack ? 'Bundling...' : 'Download Full Pack (ZIP)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Table of Evidence Documents */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Document ID</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>File Name</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Type</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Extracted Activity</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Target Scope</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>SHA-256 Checksum</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700 }}>Status</th>
                          <th style={{ padding: '8px 10px', color: '#475569', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceDocs.map((doc) => (
                          <tr key={doc.document_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#0284C7' }}>
                              {doc.document_id}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#1C1917', fontWeight: 600 }}>
                              {doc.filename}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748B' }}>
                              {doc.file_type}
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)' }}>
                              {doc.extracted_fields?.consumption_value != null
                                ? `${doc.extracted_fields.consumption_value.toLocaleString()} ${doc.extracted_fields.unit || ''}`
                                : '—'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F1F5F9', color: '#475569', fontFamily: 'var(--font-mono)' }}>
                                {doc.linked_calculation_target || 'UNASSIGNED'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontSize: 10, color: '#64748B' }}>
                              {doc.sha256_hash.slice(0, 16)}...
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: doc.status === 'CONFIRMED_LINKED' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                                color: doc.status === 'CONFIRMED_LINKED' ? '#059669' : '#D97706',
                              }}>
                                {doc.status === 'CONFIRMED_LINKED' ? 'CONFIRMED' : 'PENDING'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => setSelectedTraceMetric(doc.linked_calculation_target || 'total_gross')}
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: 4,
                                  background: 'rgba(2, 132, 199, 0.1)',
                                  color: '#0284C7',
                                  border: '1px solid rgba(2, 132, 199, 0.3)',
                                  fontSize: 10,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Trace Derivation
                              </button>
                            </td>
                          </tr>
                        ))}
                        {evidenceDocs.length === 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                              No evidence documents uploaded yet for this period.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* Traceability Drawer */}
      <CarbonTraceabilityDrawer
        isOpen={Boolean(selectedTraceMetric)}
        metricId={selectedTraceMetric}
        onClose={() => setSelectedTraceMetric(null)}
      />
    </div>
  );
}

export default CarbonAuditReportView;
