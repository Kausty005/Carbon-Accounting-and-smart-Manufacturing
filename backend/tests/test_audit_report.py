"""
WattWise AI — Corporate Carbon Audit Report & Credit Ledger Unit Tests
Covers:
1. Corporate report generation adhering to ISO 14064-1 & GHG Protocol Corporate Standard.
2. Statutory carbon allowance reconciliation (Net Available = Initial + Additions + Transfers In - Transfers Out; Remaining = Net - Counted; Utilization %).
3. Certified carbon credit reconciliation and isolation (Credits NEVER netted against gross emissions).
4. Multi-tenant company isolation (PrecisionWorks vs Apex Engineering vs SolarFab).
5. Zero and missing credit balance handling ("Not configured / Data unavailable").
6. Quota breach and over-limit status handling (Negative remaining allowance, EXCEEDED status).
7. Full publication-grade PDF generation test (Valid binary %PDF- stream).
8. FastAPI TestClient HTTP endpoint validation.
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import (
    AuditReportGenerateRequest,
    ReportingPeriodType,
)
from backend.app.services.audit_report_service import audit_report_service


@pytest.fixture
def client():
    return TestClient(app)


# ─── 1. Corporate Carbon Inventory & Allowance Reconciliation ──────────────────

def test_corporate_audit_report_generation():
    """Verify ISO 14064-1 & GHG Protocol corporate report generation with line-item inventory."""
    req = AuditReportGenerateRequest(
        company_id="precisionworks",
        period_type=ReportingPeriodType.CALENDAR_MONTH,
        calendar_year=2026,
        calendar_month=10,
    )
    report = audit_report_service.generate_report(req)

    assert report.metadata.report_id.startswith("WW-AUD-")
    assert report.metadata.company.company_name == "PrecisionWorks Manufacturing Ltd."
    assert report.gross_emissions_tco2e > 0.0
    assert report.scope1_total_tco2e > 0.0
    assert report.scope2_total_tco2e > 0.0
    assert len(report.inventory_breakdown) >= 4

    # Verify inventory line items sum to gross
    calc_sum = sum(item.emissions_t_co2e for item in report.inventory_breakdown)
    assert report.gross_emissions_tco2e == pytest.approx(calc_sum, rel=1e-3)


def test_statutory_allowance_reconciliation_math():
    """Verify exact allowance reconciliation formulas: Net = Initial + Net Transfers; Remaining = Net - Counted."""
    req = AuditReportGenerateRequest(
        company_id="precisionworks",
        period_type=ReportingPeriodType.CALENDAR_MONTH,
        calendar_year=2026,
        calendar_month=10,
    )
    report = audit_report_service.generate_report(req)
    recon = report.allowance_reconciliation

    assert recon.net_available_allowance_tco2e == pytest.approx(
        recon.initial_allocation_tco2e + recon.additional_allocation_tco2e + recon.transfers_received_tco2e - recon.transfers_sent_tco2e,
        abs=1e-4
    )
    assert recon.remaining_allowance_tco2e == pytest.approx(
        recon.net_available_allowance_tco2e - recon.gross_emissions_counted_tco2e,
        abs=1e-4
    )
    expected_util = (recon.gross_emissions_counted_tco2e / recon.net_available_allowance_tco2e) * 100.0
    assert recon.utilization_pct == pytest.approx(expected_util, abs=0.2)
    expected_rem = (recon.remaining_allowance_tco2e / recon.net_available_allowance_tco2e) * 100.0
    assert recon.remaining_pct == pytest.approx(expected_rem, abs=0.2)


def test_allowance_over_limit_and_negative_balance_handling():
    """Verify that when emissions exceed allowance, remaining is negative and status is EXCEEDED."""
    req = AuditReportGenerateRequest(
        company_id="precisionworks",
        period_type=ReportingPeriodType.DAILY,
        duration_days=35.0,  # Long simulated window with daily baseline to force breach
    )
    report = audit_report_service.generate_report(req)
    recon = report.allowance_reconciliation

    # When counted emissions exceed net available allowance
    if recon.gross_emissions_counted_tco2e > recon.net_available_allowance_tco2e:
        assert recon.remaining_allowance_tco2e < 0.0
        assert recon.status == "EXCEEDED"
        assert recon.status_color == "red"


# ─── 2. Carbon Credit Reconciliation & Gross Emissions Isolation ──────────────

def test_carbon_credit_reconciliation_and_transactions():
    """Verify certified credit reconciliation: Closing = Opening + Acquired - Transferred - Retired."""
    req = AuditReportGenerateRequest(company_id="precisionworks")
    report = audit_report_service.generate_report(req)
    cred = report.credit_reconciliation

    assert cred.is_configured is True
    assert len(cred.transactions) == 3
    assert cred.credits_acquired_tco2e == 8.00  # 5.0 VCS + 3.0 GS
    assert cred.credits_retired_tco2e == 2.00   # 2.0 VCS retired
    assert cred.closing_available_balance_tco2e == 6.00  # 8.0 - 2.0 = 6.0
    assert any("Verra" in t.registry_program for t in cred.transactions)
    assert any("Gold Standard" in t.registry_program for t in cred.transactions)


def test_gross_emissions_never_netted_against_credits():
    """Strictly verify that holding or retiring credits NEVER reduces gross emissions reported."""
    req = AuditReportGenerateRequest(company_id="precisionworks")
    report = audit_report_service.generate_report(req)

    # Gross emissions must reflect physical unreduced operations
    assert report.gross_emissions_tco2e == report.allowance_reconciliation.gross_emissions_counted_tco2e
    # Must NOT subtract 2.0 tCO2e of retired credits or 6.0 tCO2e of held credits
    assert report.gross_emissions_tco2e > 10.0


def test_company_without_credits_displays_data_unavailable():
    """Verify that companies without credit holdings show clean 'Not configured / Data unavailable'."""
    req = AuditReportGenerateRequest(company_id="apex_eng")
    report = audit_report_service.generate_report(req)
    cred = report.credit_reconciliation

    assert cred.is_configured is False
    assert cred.closing_available_balance_tco2e == 0.0
    assert len(cred.transactions) == 0
    assert "No carbon credit holdings" in cred.accounting_note


# ─── 3. Multi-Tenant Company Isolation ────────────────────────────────────────

def test_multi_tenant_isolation():
    """Confirm balances and facility parameters do not leak between enterprise tenants."""
    rep_pw = audit_report_service.generate_report(AuditReportGenerateRequest(company_id="precisionworks"))
    rep_apex = audit_report_service.generate_report(AuditReportGenerateRequest(company_id="apex_eng"))
    rep_solar = audit_report_service.generate_report(AuditReportGenerateRequest(company_id="solarfab"))

    # Different legal entities and statutory limits
    assert rep_pw.metadata.company.company_id == "precisionworks"
    assert rep_apex.metadata.company.company_id == "apex_eng"
    assert rep_solar.metadata.company.company_id == "solarfab"

    assert rep_pw.allowance_reconciliation.initial_allocation_tco2e != rep_apex.allowance_reconciliation.initial_allocation_tco2e
    assert rep_pw.credit_reconciliation.is_configured is True
    assert rep_apex.credit_reconciliation.is_configured is False
    assert rep_solar.credit_reconciliation.is_configured is False


# ─── 4. PDF Generation & Cryptographic Integrity ──────────────────────────────

def test_pdf_report_binary_generation():
    """Verify ReportLab compiles an official A4 multi-page document starting with %PDF-."""
    req = AuditReportGenerateRequest(company_id="precisionworks")
    report = audit_report_service.generate_report(req)
    pdf_bytes = audit_report_service.generate_pdf_bytes(report)

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 5000  # Multi-page PDF
    assert pdf_bytes.startswith(b"%PDF-")  # Valid PDF header


def test_cryptographic_audit_trail_in_report():
    """Verify unbroken SHA-256 hash-chain verification is included in audit report metadata."""
    req = AuditReportGenerateRequest(company_id="precisionworks")
    report = audit_report_service.generate_report(req)

    assert report.metadata.hash_chain_verified is True
    assert report.metadata.total_audit_blocks > 0
    assert len(report.metadata.latest_merkle_root) == 64
    assert report.cryptographic_audit_trail["hash_chain_valid"] is True


# ─── 5. FastAPI HTTP Endpoints Integration ────────────────────────────────────

def test_api_audit_companies_endpoint(client):
    """Verify GET /api/v1/carbon/audit/companies returns all registered enterprises."""
    res = client.get("/api/v1/carbon/audit/companies")
    assert res.status_code == 200
    companies = res.json()
    assert len(companies) >= 3
    ids = [c["company_id"] for c in companies]
    assert "precisionworks" in ids
    assert "apex_eng" in ids
    assert "solarfab" in ids


def test_api_audit_credits_endpoint(client):
    """Verify GET /api/v1/carbon/audit/credits returns credit transactions."""
    res = client.get("/api/v1/carbon/audit/credits?company_id=precisionworks")
    assert res.status_code == 200
    credits_data = res.json()
    assert len(credits_data) == 3

    # Empty for apex
    res2 = client.get("/api/v1/carbon/audit/credits?company_id=apex_eng")
    assert res2.status_code == 200
    assert len(res2.json()) == 0


def test_api_audit_generate_endpoint(client):
    """Verify POST /api/v1/carbon/audit/generate returns structured JSON audit report."""
    res = client.post("/api/v1/carbon/audit/generate", json={"company_id": "precisionworks"})
    assert res.status_code == 200
    report_json = res.json()
    assert "metadata" in report_json
    assert "inventory_breakdown" in report_json
    assert "allowance_reconciliation" in report_json
    assert "credit_reconciliation" in report_json
    assert report_json["gross_emissions_tco2e"] > 0.0


def test_api_audit_download_pdf_endpoint(client):
    """Verify POST /api/v1/carbon/audit/download-pdf streams application/pdf with Content-Disposition."""
    res = client.post("/api/v1/carbon/audit/download-pdf", json={"company_id": "precisionworks"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in res.headers.get("content-disposition", "")
    assert res.content.startswith(b"%PDF-")
