from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query

from backend.app.models import (
    AuditBlock,
    CarbonCalculateRequest,
    CarbonCalculateResponse,
    CarbonQuotaRequest,
    CarbonQuotaResponse,
    FactorQueryResponse,
    LedgerVerifyResponse,
)
from backend.app.services.audit_ledger import audit_ledger_service
from backend.app.services.carbon_service import carbon_service
from backend.app.services.reference_data import reference_data_service
from backend.app.services.carbon_credits_service import (
    carbon_credits_service,
    AdditionalityInput,
)
from backend.app.services.compliance_filing_service import compliance_filing_service

router = APIRouter(prefix="/api/v1/carbon", tags=["Carbon Accounting"])


@router.get("/factors", response_model=FactorQueryResponse)
def get_carbon_factors():
    """
    Returns verified CEA Grid Emission Factors and IPCC Stationary Combustion fuel parameters.
    Includes worksheet name, row/column citations, reporting years, and GWP references.
    """
    try:
        cea_meta = reference_data_service.get_cea_metadata()
        years = reference_data_service.get_available_reporting_years()
        grid_factors = reference_data_service.get_all_cea_factors()
        fuel_factors = reference_data_service.get_supported_fuel_catalogue()

        return FactorQueryResponse(
            database_metadata=cea_meta,
            available_years=years,
            scope2_grid_factors=grid_factors,
            scope1_fuel_factors=fuel_factors
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load reference factors: {str(e)}")


@router.post("/calculate", response_model=CarbonCalculateResponse)
def calculate_carbon_footprint(request: CarbonCalculateRequest):
    """
    Calculates operational carbon emissions (Scope 1 direct combustion, process, ETP + Scope 2 grid electricity)
    conforming to ISO 14064-1 and GHG Protocol Scope 2 Guidance.
    
    - Enforces matching activity periods.
    - Isolates direct CO2 from multi-gas CO2e.
    - Separates gross footprint from avoided carbon savings.
    """
    return carbon_service.calculate(request)


# ─── Real-Time Hash-Chain Audit Ledger Endpoints ──────────────────────────────

@router.get("/ledger/blocks", response_model=List[AuditBlock])
def get_audit_ledger_blocks(limit: int = Query(default=20, ge=1, le=100)):
    """Returns the most recent N cryptographically signed audit blocks in reverse chronological order."""
    return audit_ledger_service.get_recent_blocks(limit=limit)


@router.get("/ledger/verify", response_model=LedgerVerifyResponse)
def verify_audit_ledger():
    """Cryptographically verifies the unbroken SHA-256 hash chain and Merkle roots across all blocks."""
    return audit_ledger_service.verify_ledger()


@router.post("/ledger/record", response_model=AuditBlock)
def record_audit_ledger_block(payload: Dict[str, Any]):
    """Appends a new interval audit block to the immutable hash chain."""
    telemetry = payload.get("telemetry_summary", {})
    gross_carbon = payload.get("gross_carbon_tco2e", {})
    return audit_ledger_service.add_interval_block(
        telemetry_summary=telemetry,
        gross_carbon_tco2e=gross_carbon
    )


# ─── Live Carbon Quota & Operational Interlock Endpoints ───────────────────────

@router.post("/quota/check", response_model=CarbonQuotaResponse)
def check_carbon_quota(request: CarbonQuotaRequest):
    """
    Evaluates plant Carbon Burn Rate Index (BRI) against permitted statutory cap.
    Dispatches automated operational interlocks (fuel-switching, DG lockout) if BRI > 1.0.
    """
    return carbon_service.evaluate_carbon_quota(request)


@router.get("/quota/status", response_model=CarbonQuotaResponse)
def get_current_quota_status():
    """Returns active operational carbon quota status and interlock guardrails for current shift."""
    req = CarbonQuotaRequest(
        permitted_budget_tco2e=18.0,
        actual_emissions_tco2e=14.47,
        elapsed_fraction=0.82
    )
    return carbon_service.evaluate_carbon_quota(req)


# ─── Carbon Credits, Additionality & CCTS Offsetting Endpoints ────────────────

@router.get("/credits/portfolio")
def get_carbon_credits_portfolio():
    """
    Returns full Carbon Credit portfolio (CCTS, ESCerts, Verra VCS, Gold Standard),
    including generated, purchased, and retired volumes with real-time market value.
    """
    return carbon_credits_service.get_portfolio()


@router.post("/credits/additionality")
def evaluate_additionality(input_data: AdditionalityInput):
    """
    Evaluates ISO 14064-2 additionality for an energy efficiency project:
    Carbon Credits = Baseline Emissions - Actual Monitored Emissions - Leakage
    Checks regulatory additionality, financial hurdle, and technological barriers.
    """
    return carbon_credits_service.evaluate_additionality(input_data)


@router.post("/credits/retire")
def retire_carbon_credit(payload: Dict[str, Any]):
    """
    Permanently cancels / retires a verified carbon credit against statutory quota overage.
    Appends the retirement event to the cryptographic audit ledger.
    """
    serial = payload.get("serial_number")
    reason = payload.get("reason", "Statutory Carbon Quota Compliance")
    beneficiary = payload.get("beneficiary", "PrecisionWorks Manufacturing Facility")
    if not serial:
        raise HTTPException(status_code=400, detail="serial_number is required.")
    try:
        return carbon_credits_service.retire_credit(serial_number=serial, reason=reason, beneficiary=beneficiary)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))


@router.post("/credits/issue")
def issue_credit_from_intervention(payload: Dict[str, Any]):
    """
    Mints new verified carbon credits and equivalent BEE ESCerts from digital twin intervention savings.
    """
    project_name = payload.get("project_name", "Pneumatic Auto-Idle Cutoff")
    quantity_tco2e = float(payload.get("quantity_tco2e", 5.0))
    intervention_type = payload.get("intervention_type", "Digital Twin Optimization")
    vintage = int(payload.get("vintage", 2026))
    return carbon_credits_service.issue_new_credit_from_intervention(
        project_name=project_name,
        quantity_tco2e=quantity_tco2e,
        intervention_type=intervention_type,
        vintage=vintage,
    )


# ─── Statutory Compliance & Filing Dossier Endpoints ─────────────────────────

@router.get("/compliance/dossier")
def get_full_compliance_filing_dossier():
    """
    Consolidates the complete multi-standard filing packet (ISO 14064, IPMVP M&V,
    SEBI BRSR Core, EU CBAM, and Offset Registry Pipeline) with cryptographic integrity hash.
    """
    return compliance_filing_service.get_full_filing_dossier()


@router.get("/compliance/iso14064")
def get_iso_14064_compliance_log(year: str = Query("2025-26", description="Reporting fiscal year")):
    """
    Returns verifiable ISO 14064-1 & GHG Protocol audit log documenting Scope 1 & Scope 2
    calculations with transparent emission factors and uncertainty metrics.
    """
    return compliance_filing_service.get_iso_14064_compliance_log(reporting_year=year)


@router.get("/compliance/ipmvp")
def get_ipmvp_protocol():
    """
    Returns IPMVP Option B/C standardized measurement & verification documentation
    with 14-day submeter baseline vs reporting period regression and statistical confidence.
    """
    return compliance_filing_service.get_ipmvp_protocol()


@router.get("/compliance/sebi-brsr")
def get_sebi_brsr_disclosure():
    """
    Returns SEBI BRSR Core Principle 6 Environmental Disclosure report
    with energy/GHG intensities per rupee of turnover and per physical part.
    """
    return compliance_filing_service.get_sebi_brsr_disclosure()


@router.get("/compliance/eu-cbam")
def get_eu_cbam_disclosure():
    """
    Returns EU Carbon Border Adjustment Mechanism (Regulation EU 2023/956) disclosure
    calculating direct and indirect specific embedded emissions per unit for cross-border export.
    """
    return compliance_filing_service.get_eu_cbam_disclosure()


@router.get("/compliance/registry-filings")
def get_registry_filings():
    """
    Returns the lifecycle pipeline of carbon credit project filings across CCTS, BEE PAT,
    Verra VCS, Gold Standard, and GCC.
    """
    return compliance_filing_service.get_registry_filings()


@router.post("/compliance/registry-filings")
def submit_new_registry_filing(payload: Dict[str, Any]):
    """
    Submits a new carbon credit project registration filing into the registry pipeline.
    """
    return compliance_filing_service.submit_new_filing(payload)


# ─── International-Standard Corporate Carbon Audit & PDF Endpoints ───────────

from fastapi.responses import StreamingResponse
import io
from backend.app.models import (
    AuditReportGenerateRequest,
    CompanyFacilityProfile,
    CorporateAuditReport,
    CarbonCreditTransaction,
)
from backend.app.services.audit_report_service import audit_report_service


@router.get("/audit/companies", response_model=List[CompanyFacilityProfile])
def get_audit_companies():
    """Returns registered industrial enterprises and manufacturing facility boundaries."""
    return audit_report_service.get_supported_companies()


@router.get("/audit/credits", response_model=List[CarbonCreditTransaction])
def get_company_carbon_credits(company_id: str = Query(default="precisionworks")):
    """Returns verified carbon credit transactions for the specified company."""
    return audit_report_service.get_credit_transactions(company_id)


@router.post("/audit/generate", response_model=CorporateAuditReport)
def generate_corporate_audit_report(request: AuditReportGenerateRequest):
    """
    Generates a full-scope Corporate Carbon Accounting & Emissions Audit Report
    aligned with ISO 14064-1:2018 and GHG Protocol Corporate Standard.
    Reconciles statutory carbon allowances and certified carbon credit holdings.
    """
    return audit_report_service.generate_report(request)


@router.post("/audit/download-pdf")
def download_corporate_audit_pdf(request: AuditReportGenerateRequest):
    """
    Generates and streams an official, publication-grade multi-page PDF audit report
    complete with executive summary, line-item inventory, allowance reconciliation,
    credit holdings, and cryptographic SHA-256 audit trail.
    """
    report = audit_report_service.generate_report(request)
    pdf_bytes = audit_report_service.generate_pdf_bytes(report)
    filename = f"WattWise_Carbon_Audit_{report.metadata.report_id}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        }
    )

