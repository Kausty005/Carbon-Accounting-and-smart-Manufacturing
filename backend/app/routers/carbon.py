"""
WattWise AI — Carbon Accounting API Router
Endpoints:
  GET  /api/v1/carbon/factors
  POST /api/v1/carbon/calculate
"""

from fastapi import APIRouter, HTTPException

from backend.app.models import (
    CarbonCalculateRequest,
    CarbonCalculateResponse,
    FactorQueryResponse,
)
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
    Calculates operational carbon emissions (Scope 1 direct combustion + Scope 2 indirect electricity)
    conforming to ISO 14064-1 and GHG Protocol Scope 2 Guidance.
    
    - Enforces matching activity periods.
    - Isolates direct CO2 from multi-gas CO2e.
    - Separates gross footprint from avoided carbon savings.
    """
    return carbon_service.calculate(request)
