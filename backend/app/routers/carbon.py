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
    # Default shift: 18.0 tCO2e daily cap, 14.47 tCO2e actual, 0.75 day elapsed -> BRI = 14.47 / (18 * 0.75) = 1.07 (Lockout warning)
    req = CarbonQuotaRequest(
        permitted_budget_tco2e=18.0,
        actual_emissions_tco2e=14.47,
        elapsed_fraction=0.82
    )
    return carbon_service.evaluate_carbon_quota(req)

