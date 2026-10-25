"""
Unit & Integration Tests for WattWise AI Evidence & Compliance Workspace
Covers:
1. Traceable Carbon Accounting & Formula Citations
2. Evidence Vault Upload, Simulated OCR Extraction & Provenance Hashing
3. User Confirmation & Emission Calculation Target Linking
4. Data Quality Audit, Missing Evidence Detection & Statutory Checklist
5. Report Approval Workflow State Machine & Reviewer Comments
6. Multi-Asset Report Pack ZIP Generation (PDF, CSV, JSON, Markdown)
7. Carbon Credit Project Tracker & Simulated vs Verified Asset Separation
"""

import io
import json
import zipfile
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import (
    AuditReportGenerateRequest,
    EvidenceConfirmRequest,
    EvidenceUploadRequest,
    ReportingPeriodType,
    ReviewerCommentRequest,
    WorkflowTransitionRequest,
)
from backend.app.services.audit_report_service import audit_report_service
from backend.app.services.evidence_vault_service import (
    DATA_DIR,
    DOCUMENTS_FILE,
    PROJECTS_FILE,
    SEED_CREDIT_PROJECTS,
    SEED_EVIDENCE_DOCUMENTS,
    WORKFLOW_FILE,
    evidence_vault_service,
)

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate_vault_data():
    """Restores clean seed files before each test to maintain strict test idempotency."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(DOCUMENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(SEED_EVIDENCE_DOCUMENTS, f, indent=2)
    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(SEED_CREDIT_PROJECTS, f, indent=2)
    if WORKFLOW_FILE.exists():
        WORKFLOW_FILE.unlink()
    yield
    with open(DOCUMENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(SEED_EVIDENCE_DOCUMENTS, f, indent=2)
    with open(PROJECTS_FILE, "w", encoding="utf-8") as f:
        json.dump(SEED_CREDIT_PROJECTS, f, indent=2)
    if WORKFLOW_FILE.exists():
        WORKFLOW_FILE.unlink()


# ─── 1. Evidence Document Management & Upload Tests ─────────────────────────────

def test_evidence_documents_retrieval():
    """Validates that seed primary documents are loaded with complete metadata and hashes."""
    docs = evidence_vault_service.get_documents(company_id="precisionworks", reporting_period="2026-10")
    assert len(docs) >= 3

    # Check for electricity bill
    elec_doc = next((d for d in docs if d.file_type == "ELECTRICITY_BILL"), None)
    assert elec_doc is not None
    assert elec_doc.sha256_hash is not None
    assert len(elec_doc.sha256_hash) == 64
    assert elec_doc.extracted_fields.get("unit") == "kWh"
    assert elec_doc.status == "CONFIRMED_LINKED"


def test_evidence_upload_and_simulated_ocr():
    """Uploads a fuel invoice, verifies SHA-256 calculation and AI/OCR field extraction."""
    payload = EvidenceUploadRequest(
        filename="HPCL_Bulk_LPG_Delivery_Challan_Nov2026.pdf",
        file_type="FUEL_INVOICE",
        reporting_period="2026-11",
        uploaded_by="Rajesh Patil (Boiler Incharge)",
        company_id="precisionworks",
        notes="Monthly bulk refill for manufacturing reheat furnace."
    )
    doc = evidence_vault_service.upload_and_extract(payload)
    assert doc.document_id.startswith("DOC-")
    assert doc.reporting_period == "2026-11"
    assert doc.status == "EXTRACTED_PENDING_CONFIRMATION"
    assert doc.extracted_fields is not None
    assert "consumption_value" in doc.extracted_fields
    assert len(doc.version_history) == 1


def test_duplicate_evidence_detection():
    """Ensures duplicate uploads with identical filenames and periods are flagged."""
    payload = EvidenceUploadRequest(
        filename="MSEDCL_HT_Bill_Oct2026_PrecisionWorks.pdf",
        file_type="ELECTRICITY_BILL",
        reporting_period="2026-10",
        uploaded_by="Duplicate Operator",
        company_id="precisionworks",
    )
    doc = evidence_vault_service.upload_and_extract(payload)
    # The duplicate should be flagged in discrepancy_flags or status
    assert len(doc.discrepancy_flags) > 0 or doc.status == "FLAGGED_DISCREPANCY"


def test_evidence_user_confirmation_and_linking():
    """Validates auditor correction/confirmation and binding to inventory target."""
    docs = evidence_vault_service.get_documents(company_id="precisionworks")
    target_doc = docs[0]

    confirm_req = EvidenceConfirmRequest(
        confirmed_by="Dr. Ananya Sharma (Lead Auditor)",
        confirmed_fields={"consumption_value": 16606.0, "unit": "kWh"},
        linked_calculation_target="scope2_grid",
        notes="Verified against utility smart meter API integration."
    )
    confirmed = evidence_vault_service.confirm_evidence(target_doc.document_id, confirm_req)
    assert confirmed.status == "CONFIRMED_LINKED"
    assert confirmed.linked_calculation_target == "scope2_grid"
    assert confirmed.confirmed_fields["consumption_value"] == 16606.0
    assert len(confirmed.version_history) >= 2


# ─── 2. Data Quality & Compliance Checklist Tests ──────────────────────────────

def test_data_quality_audit_clean_period():
    """Evaluates data quality audit for 2026-10 where seed documents are present."""
    dq = evidence_vault_service.evaluate_data_quality(company_id="precisionworks", reporting_period="2026-10")
    assert dq.compliance_score_pct >= 85.0
    assert dq.audit_readiness_status == "AUDIT_READY"
    assert len(dq.compliance_checklist) >= 4

    # Verify standards covered in checklist
    standards = [item["standard"] for item in dq.compliance_checklist]
    assert any("ISO 14064-1" in s for s in standards)
    assert any("GHG Protocol" in s for s in standards)


def test_data_quality_audit_missing_documents_detection():
    """Evaluates missing evidence detection in a period with no uploaded documents."""
    dq = evidence_vault_service.evaluate_data_quality(company_id="precisionworks", reporting_period="2027-05")
    assert len(dq.missing_documents) > 0
    missing_cats = [m["category"] for m in dq.missing_documents]
    assert "Scope 2 Grid Electricity" in missing_cats
    assert dq.compliance_score_pct < 85.0


# ─── 3. Traceable Carbon Accounting Tests ──────────────────────────────────────

def test_traceability_scope2_grid():
    """Validates end-to-end derivation and factor citation for Scope 2 electricity."""
    trace = evidence_vault_service.get_traceability("scope2_grid", reporting_period="2026-10")
    assert trace.metric_id == "scope2_grid"
    assert trace.emission_factor == 0.716
    assert trace.emission_factor_unit == "kg CO2e/kWh"
    assert "Central Electricity Authority" in trace.emission_factor_provenance.get("authority", "")
    assert trace.formula_expression is not None
    assert trace.verification_grade in ["GRADE_A", "GRADE_A_DIRECT_MEASUREMENT"]


def test_traceability_scope1_lpg():
    """Validates derivation, stoichiometry, and linked delivery receipts for Scope 1 LPG."""
    trace = evidence_vault_service.get_traceability("scope1_lpg", reporting_period="2026-10")
    assert trace.metric_id == "scope1_lpg"
    assert trace.emission_factor == 2.980
    assert "IPCC" in trace.emission_factor_provenance.get("authority", "")
    assert trace.formula_expression is not None


# ─── 4. Report Approval Workflow State Machine Tests ───────────────────────────

def test_workflow_initial_state():
    """Checks initial state of the October 2026 audit report."""
    wf = evidence_vault_service.get_workflow_state("REP-AUDIT-PW-2026-10")
    assert wf.status in ["APPROVED", "IN_REVIEW", "DRAFT"]
    assert wf.version is not None
    assert len(wf.approval_history) >= 1


def test_workflow_reviewer_comment():
    """Validates adding persistent reviewer comments to the audit report workflow."""
    comment_req = ReviewerCommentRequest(
        report_id="REP-AUDIT-PW-2026-10",
        author_name="Kavita Rao",
        author_role="ESG Director",
        section_reference="Scope 2 Electricity",
        comment_text="Verified dual reporting location vs market-based per 2015 Scope 2 guidance."
    )
    updated_wf = evidence_vault_service.add_reviewer_comment(comment_req)
    assert len(updated_wf.reviewer_comments) >= 1
    latest_comment = updated_wf.reviewer_comments[-1]
    assert latest_comment["comment_text"] == comment_req.comment_text
    assert latest_comment["author_role"] == "ESG Director"


def test_workflow_state_transition():
    """Validates transitioning workflow state (e.g., APPROVED -> EXPORTED)."""
    trans_req = WorkflowTransitionRequest(
        report_id="REP-AUDIT-PW-2026-10",
        target_status="EXPORTED",
        actor_name="Rajesh Nair",
        actor_role="manager",
        comments="Generated downloadable compliance report pack."
    )
    wf = evidence_vault_service.transition_workflow(trans_req)
    assert wf.status == "EXPORTED"


# ─── 5. Downloadable Report Pack ZIP Generation Tests ──────────────────────────

def test_report_pack_zip_generation_contents():
    """Validates that generate_report_pack_zip creates all required artifacts."""
    gen_req = AuditReportGenerateRequest(
        company_id="precisionworks",
        period_type=ReportingPeriodType.CALENDAR_MONTH,
        calendar_year=2026,
        calendar_month=10,
    )
    report = audit_report_service.generate_report(gen_req)
    docs = evidence_vault_service.get_documents(reporting_period="2026-10")
    dq = evidence_vault_service.evaluate_data_quality(reporting_period="2026-10")
    wf = evidence_vault_service.get_workflow_state(report.metadata.report_id)

    zip_bytes = audit_report_service.generate_report_pack_zip(
        report=report,
        evidence_docs=docs,
        data_quality=dq,
        workflow_state=wf,
    )
    assert len(zip_bytes) > 5000

    zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
    filenames = zf.namelist()

    # Verify all 5 essential pack artifacts are included
    assert any(f.startswith("reports/") and f.endswith(".pdf") for f in filenames)
    assert "workbooks/calculation_workbook.csv" in filenames
    assert "evidence/evidence_index.json" in filenames
    assert "reconciliation/reconciliation_summary.csv" in filenames
    assert "compliance/compliance_statement.md" in filenames

    # Verify calculation workbook CSV contains actual data
    csv_text = zf.read("workbooks/calculation_workbook.csv").decode("utf-8")
    assert "Central Electricity Authority" in csv_text or "CEA" in csv_text
    assert "Purchased Grid Electricity" in csv_text or "Electricity" in csv_text

    # Verify evidence index JSON has verified entries
    evidence_index = json.loads(zf.read("evidence/evidence_index.json").decode("utf-8"))
    assert evidence_index["total_documents_linked"] >= 3
    assert evidence_index["facility"] is not None


# ─── 6. Carbon Credit Project Tracker & Separation Tests ───────────────────────

def test_credit_projects_lifecycle_and_separation():
    """Ensures credit projects track lifecycle and strictly separate simulated vs verified credits."""
    projects = evidence_vault_service.get_credit_projects("precisionworks")
    assert len(projects) >= 2

    # Check that certified project has valid registry details
    cert_proj = next((p for p in projects if p.is_registry_certified), None)
    assert cert_proj is not None
    assert cert_proj.standard_registry is not None
    assert cert_proj.issued_credits_tco2e > 0
    assert cert_proj.serial_number_batch is not None

    # Check that simulated/digital-twin project is clearly uncertified
    sim_proj = next((p for p in projects if p.status_category == "SIMULATED_ESTIMATE"), None)
    assert sim_proj is not None
    assert not sim_proj.is_registry_certified
    assert sim_proj.issued_credits_tco2e is None or sim_proj.issued_credits_tco2e == 0.0
    assert "simulation" in sim_proj.audit_note.lower() or "estimate" in sim_proj.audit_note.lower()


# ─── 7. FastAPI Endpoint Integration Tests ─────────────────────────────────────

def test_api_evidence_endpoints():
    """Tests FastAPI router endpoints for evidence listing, quality check, and traceability."""
    # List documents
    r_docs = client.get("/api/v1/carbon/evidence/documents?period=2026-10")
    assert r_docs.status_code == 200
    assert len(r_docs.json()) >= 3

    # Quality check
    r_dq = client.get("/api/v1/carbon/evidence/data-quality?period=2026-10")
    assert r_dq.status_code == 200
    assert "compliance_score_pct" in r_dq.json()

    # Traceability
    r_tr = client.get("/api/v1/carbon/traceability/scope2_grid?period=2026-10")
    assert r_tr.status_code == 200
    assert r_tr.json()["emission_factor"] == 0.716

    # Credit projects
    r_cp = client.get("/api/v1/carbon/credits/projects")
    assert r_cp.status_code == 200
    assert len(r_cp.json()) >= 2
