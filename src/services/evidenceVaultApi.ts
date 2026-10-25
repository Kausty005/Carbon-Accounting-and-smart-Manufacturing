/**
 * WattWise AI — Evidence Vault & Compliance Workspace API Client
 * Connects frontend with FastAPI Evidence Vault and Traceability Endpoints
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export interface ExtractedFields {
  supplier_name?: string;
  consumer_number?: string;
  invoice_number?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  activity_metric?: string;
  consumption_value?: number;
  unit?: string;
  contract_demand_kva?: number;
  recorded_max_demand_kva?: number;
  tariff_rate_inr?: number;
  total_cost_inr?: number;
  meter_serial_number?: string;
  detected_scope?: string;
  confidence_score?: number;
  [key: string]: any;
}

export interface DocumentVersion {
  version: number;
  timestamp: string;
  modified_by: string;
  note: string;
}

export interface EvidenceDocument {
  document_id: string;
  filename: string;
  file_type: 'ELECTRICITY_BILL' | 'FUEL_INVOICE' | 'METER_LOG' | 'CALIBRATION_CERT' | 'RENEWABLE_PPA' | 'WATER_LOG';
  file_size_bytes: number;
  sha256_hash: string;
  uploaded_at: string;
  uploaded_by: string;
  reporting_period: string;
  company_id: string;
  status: 'EXTRACTED_PENDING_CONFIRMATION' | 'CONFIRMED_LINKED' | 'FLAGGED_DISCREPANCY' | 'REJECTED';
  extracted_fields: ExtractedFields;
  confirmed_fields?: Record<string, any>;
  linked_calculation_target?: string;
  version_history: DocumentVersion[];
  provenance: string;
  discrepancy_flags: string[];
  preview_url: string;
}

export interface EvidenceUploadRequest {
  filename: string;
  file_type: string;
  reporting_period: string;
  uploaded_by: string;
  company_id?: string;
  file_content_base64?: string;
  notes?: string;
}

export interface EvidenceConfirmRequest {
  confirmed_by: string;
  confirmed_fields: Record<string, any>;
  linked_calculation_target: string;
  notes?: string;
}

export interface MissingDocumentAlert {
  category: string;
  expected_document: string;
  impact: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  remedy: string;
}

export interface ComplianceChecklistItem {
  standard: string;
  item: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  details: string;
}

export interface DataQualityCheckResult {
  reporting_period: string;
  compliance_score_pct: number;
  audit_readiness_status: 'AUDIT_READY' | 'ACTION_REQUIRED' | 'NON_COMPLIANT';
  missing_documents: MissingDocumentAlert[];
  duplicate_documents: Array<Record<string, any>>;
  inconsistent_units: Array<Record<string, any>>;
  invalid_values: Array<Record<string, any>>;
  period_gaps: string[];
  compliance_checklist: ComplianceChecklistItem[];
  last_evaluated_at: string;
}

export interface CalculationTraceabilityResponse {
  metric_id: string;
  metric_name: string;
  category: string;
  evaluated_emissions_tco2e: number;
  activity_amount: number;
  activity_unit: string;
  emission_factor: number;
  emission_factor_unit: string;
  emission_factor_provenance: Record<string, any>;
  formula_expression: string;
  reporting_period: string;
  operational_boundary: string;
  linked_evidence: EvidenceDocument[];
  cryptographic_audit_ref: Record<string, any>;
  verification_grade: string;
}

export interface ApprovalHistoryItem {
  action: string;
  actor_name: string;
  actor_role: string;
  timestamp: string;
  comments: string;
}

export interface ReviewerCommentItem {
  id: string;
  author_name: string;
  author_role: string;
  section_reference: string;
  comment_text: string;
  timestamp: string;
}

export interface ReportWorkflowState {
  report_id: string;
  status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'EXPORTED';
  version: string;
  company_id: string;
  reporting_period_desc: string;
  created_at: string;
  created_by: string;
  approval_history: ApprovalHistoryItem[];
  reviewer_comments: ReviewerCommentItem[];
  missing_evidence_count: number;
  can_approve: boolean;
  audit_pack_available: boolean;
}

export interface WorkflowTransitionRequest {
  report_id: string;
  target_status: 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'EXPORTED';
  actor_name: string;
  actor_role: string;
  comments?: string;
}

export interface ReviewerCommentRequest {
  report_id: string;
  author_name: string;
  author_role: string;
  comment_text: string;
  section_reference?: string;
}

export interface CreditProjectLifecycle {
  project_id: string;
  project_name: string;
  methodology: string;
  standard_registry: string;
  status_category: 'SIMULATED_ESTIMATE' | 'MONITORED_AND_VALIDATED' | 'OFFICIALLY_ISSUED_REGISTRY' | 'RETIRED';
  current_stage:
    | 'ELIGIBILITY_SCREENING'
    | 'METHODOLOGY_SELECTED'
    | 'BASELINE_ESTABLISHED'
    | 'ESTIMATED_REDUCTIONS'
    | 'MONITORING_UNDERWAY'
    | 'THIRD_PARTY_VALIDATION'
    | 'REGISTRY_VERIFICATION'
    | 'OFFICIAL_ISSUANCE'
    | 'RETIRED';
  estimated_annual_reduction_tco2e: number;
  validated_reduction_tco2e?: number;
  issued_credits_tco2e?: number;
  serial_number_batch?: string;
  vvb_auditor?: string;
  validation_report_hash?: string;
  crediting_period_start: string;
  crediting_period_end: string;
  linked_asset_id: string;
  is_registry_certified: boolean;
  audit_note: string;
}

export const evidenceVaultApi = {
  /**
   * Fetch all stored primary evidence documents
   */
  async getDocuments(period?: string, docType?: string): Promise<EvidenceDocument[]> {
    const params = new URLSearchParams();
    if (period && period !== 'ALL') params.append('period', period);
    if (docType && docType !== 'ALL') params.append('doc_type', docType);

    const res = await fetch(`${API_BASE}/api/v1/carbon/evidence/documents?${params.toString()}`);
    if (!res.ok) throw new Error(`Failed to load evidence documents: ${res.statusText}`);
    return res.json();
  },

  /**
   * Fetch a single document by ID
   */
  async getDocumentById(docId: string): Promise<EvidenceDocument> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/evidence/documents/${docId}`);
    if (!res.ok) throw new Error(`Evidence document ${docId} not found`);
    return res.json();
  },

  /**
   * Upload an evidence document with AI/OCR text extraction
   */
  async uploadDocument(req: EvidenceUploadRequest): Promise<EvidenceDocument> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/evidence/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },

  /**
   * Confirm or correct OCR-extracted fields and bind to calculation target
   */
  async confirmDocument(docId: string, req: EvidenceConfirmRequest): Promise<EvidenceDocument> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/evidence/${docId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Confirmation failed');
    }
    return res.json();
  },

  /**
   * Evaluate Data Quality and Missing Documents checklist
   */
  async evaluateDataQuality(period: string = '2026-10'): Promise<DataQualityCheckResult> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/evidence/data-quality?period=${period}`);
    if (!res.ok) throw new Error(`Data quality audit failed: ${res.statusText}`);
    return res.json();
  },

  /**
   * Fetch calculation traceability derivation for any emissions metric
   */
  async getTraceability(metricId: string, period: string = '2026-10'): Promise<CalculationTraceabilityResponse> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/traceability/${metricId}?period=${period}`);
    if (!res.ok) throw new Error(`Failed to resolve traceability for ${metricId}: ${res.statusText}`);
    return res.json();
  },

  /**
   * Get report workflow state
   */
  async getWorkflowStatus(reportId: string = 'REP-AUDIT-PW-2026-10'): Promise<ReportWorkflowState> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/audit/workflow/status?report_id=${reportId}`);
    if (!res.ok) throw new Error(`Workflow status failed: ${res.statusText}`);
    return res.json();
  },

  /**
   * Transition report workflow stage
   */
  async transitionWorkflow(req: WorkflowTransitionRequest): Promise<ReportWorkflowState> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/audit/workflow/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Workflow transition failed');
    }
    return res.json();
  },

  /**
   * Add a persistent reviewer comment
   */
  async addReviewerComment(req: ReviewerCommentRequest): Promise<ReportWorkflowState> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/audit/workflow/comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to submit comment');
    }
    return res.json();
  },

  /**
   * Download complete compliance report pack ZIP
   */
  async downloadReportPack(
    companyId: string = 'precisionworks',
    periodType: string = 'CALENDAR_MONTH',
    year: number = 2026,
    month: number = 10
  ): Promise<Blob> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/audit/download-pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        period_type: periodType,
        calendar_year: year,
        calendar_month: month,
      }),
    });
    if (!res.ok) throw new Error('Report pack packaging failed on server');
    return res.blob();
  },

  /**
   * Fetch credit projects separated by lifecycle stage
   */
  async getCreditProjects(facility?: string): Promise<CreditProjectLifecycle[]> {
    const params = new URLSearchParams();
    if (facility) params.append('facility', facility);
    const res = await fetch(`${API_BASE}/api/v1/carbon/credits/projects?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load carbon credit projects');
    return res.json();
  },

  /**
   * Add or update credit project
   */
  async saveCreditProject(project: CreditProjectLifecycle): Promise<CreditProjectLifecycle> {
    const res = await fetch(`${API_BASE}/api/v1/carbon/credits/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    if (!res.ok) throw new Error('Failed to save credit project');
    return res.json();
  },
};
