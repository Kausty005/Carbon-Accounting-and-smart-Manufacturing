"""
WattWise AI — Carbon Accounting Pydantic Data Models
Standards: ISO 14064-1, GHG Protocol Scope 2 Guidance, 2006 IPCC Guidelines
"""

from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator


class ProvenanceType(str, Enum):
    """Data provenance taxonomy for activity data and calculations."""
    MEASURED = "MEASURED"      # Sensor/SCADA physical meter reading (Class 0.5S)
    ESTIMATED = "ESTIMATED"    # Engineering sample / run-hour calculation
    SIMULATED = "SIMULATED"    # Digital twin scenario / what-if parameter
    PREDICTED = "PREDICTED"    # Machine learning / time-series forecast


class ReportingPeriodType(str, Enum):
    """Supported temporal boundaries for carbon accounting."""
    SIMULATED_DEMO_30D = "SIMULATED_DEMO_30D"  # Fixed 30-day (720h) simulation period
    CALENDAR_MONTH = "CALENDAR_MONTH"          # Exact calendar month days (28, 29, 30, 31)
    DATED_RANGE = "DATED_RANGE"                # Arbitrary date interval
    DAILY = "DAILY"                            # Single 24-hour operational cycle


class CeaMethodology(str, Enum):
    """Methodologies documented in CEA CO2 Baseline Database Version 22.0."""
    WEIGHTED_AVG_WITH_RES = "weighted_avg_with_res"  # Results!Row 14 (Scope 2 Location-Based recommended)
    WEIGHTED_AVG_THERMAL = "weighted_avg_thermal"    # Results!Row 13 (Fossil generation intensity)
    OPERATING_MARGIN = "operating_margin"            # Results!Row 15 (Simple OM)
    BUILD_MARGIN = "build_margin"                    # Results!Row 16 (BM)
    COMBINED_MARGIN = "combined_margin"              # Results!Row 17 (CM 50% OM + 50% BM)


class ReportingPeriodInput(BaseModel):
    """Specification of calculation reporting period."""
    period_type: ReportingPeriodType
    duration_days: Optional[float] = Field(default=None, gt=0, description="Override duration in days")
    calendar_year: Optional[int] = Field(default=None, ge=2000, le=2100)
    calendar_month: Optional[int] = Field(default=None, ge=1, le=12)
    start_date: Optional[date] = None
    end_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_period_fields(self) -> "ReportingPeriodInput":
        if self.period_type == ReportingPeriodType.CALENDAR_MONTH:
            if not self.calendar_year or not self.calendar_month:
                raise ValueError("calendar_year and calendar_month are required for CALENDAR_MONTH period_type")
        elif self.period_type == ReportingPeriodType.DATED_RANGE:
            if not self.start_date or not self.end_date:
                raise ValueError("start_date and end_date are required for DATED_RANGE period_type")
            if self.end_date < self.start_date:
                raise ValueError("end_date must be on or after start_date")
        return self


class Scope1Input(BaseModel):
    """Scope 1 direct combustion activity input."""
    fuel_id: str = Field(default="lpg", description="Fuel identifier (e.g., 'lpg' or custom)")
    activity_value: float = Field(ge=0.0, description="Fuel quantity consumed in reporting period")
    activity_unit: str = Field(default="kg", description="Unit of measure (e.g., 'kg', 'L', 'm3')")
    provenance: ProvenanceType = Field(default=ProvenanceType.ESTIMATED)
    include_non_co2_ghg: bool = Field(default=True, description="Include CH4 and N2O AR6 equivalents")
    custom_emission_factor: Optional[float] = Field(default=None, ge=0.0, description="Custom kg CO2e / unit factor")
    custom_ncv_mj_per_unit: Optional[float] = Field(default=None, ge=0.0, description="Net Calorific Value in MJ/unit")
    activity_period: Optional[ReportingPeriodInput] = Field(default=None, description="Temporal period if different from root")


class Scope2Input(BaseModel):
    """Scope 2 purchased electricity activity input."""
    grid_consumption_kwh: float = Field(ge=0.0, description="Purchased electricity in kWh")
    provenance: ProvenanceType = Field(default=ProvenanceType.MEASURED)
    cea_reporting_year: Optional[str] = Field(default=None, description="CEA fiscal year (e.g. '2023-24')")
    cea_methodology: CeaMethodology = Field(default=CeaMethodology.WEIGHTED_AVG_WITH_RES)
    include_imports: bool = Field(default=False, description="Use factors including grid imports")
    custom_grid_factor: Optional[float] = Field(default=None, ge=0.0, description="Custom kg CO2/kWh override")
    activity_period: Optional[ReportingPeriodInput] = Field(default=None, description="Temporal period if different from root")


class ScenarioComparisonInput(BaseModel):
    """Digital twin what-if scenario comparison parameters."""
    enabled: bool = Field(default=False)
    proposed_savings_kwh: float = Field(default=0.0, ge=0.0)
    proposed_consumption_kwh: Optional[float] = Field(default=None, ge=0.0, description="Proposed scenario grid consumption in kWh")
    savings_provenance: ProvenanceType = Field(default=ProvenanceType.SIMULATED)


class CarbonCalculateRequest(BaseModel):
    """Payload for POST /api/v1/carbon/calculate."""
    period: ReportingPeriodInput
    scope1: Optional[Scope1Input] = None
    scope2: Optional[Scope2Input] = None
    target_normalization_period: Optional[ReportingPeriodType] = Field(
        default=None,
        description="Explicit target period type to automatically normalize mismatched activity periods"
    )
    scenario_comparison: Optional[ScenarioComparisonInput] = None


# ─── Response Models ──────────────────────────────────────────────────────────

class Scope1FactorBreakdown(BaseModel):
    """Detailed IPCC emission factor breakdown with verified unit conversions."""
    direct_co2_kg_per_kg: float
    ch4_emitted_g_per_kg: float
    ch4_converted_kg_per_kg: float
    ch4_gwp_ar6: float
    ch4_co2e_kg_per_kg: float
    n2o_emitted_g_per_kg: float
    n2o_converted_kg_per_kg: float
    n2o_gwp_ar6: float
    n2o_co2e_kg_per_kg: float
    total_co2e_kg_per_kg: float


class Scope1CalculationResult(BaseModel):
    """Calculation audit result for Scope 1 direct combustion."""
    fuel_id: str
    fuel_name: str
    activity: Dict[str, Any]
    factor_breakdown: Scope1FactorBreakdown
    emissions_direct_co2_t: float
    emissions_total_co2e_t: float
    emissions_evaluated_t_co2e: float
    formula: str
    source_reference: str
    verification_status: str


class CeaFactorMetadata(BaseModel):
    """Detailed provenance metadata for a CEA grid factor."""
    selected_factor: float
    unit: str
    reporting_year: str
    methodology: str
    sheet: str
    row: int
    column: int
    authority: str
    database_version: str
    includes_imports: bool
    is_recommended_location_based: bool


class Scope2CalculationResult(BaseModel):
    """Calculation audit result for Scope 2 indirect electricity."""
    activity: Dict[str, Any]
    factor_metadata: CeaFactorMetadata
    emissions_total_co2e_t: float
    formula: str
    source_reference: str


class AvoidedEmissionsResult(BaseModel):
    """Avoided carbon emissions from energy efficiency interventions."""
    savings_kwh: float
    provenance: ProvenanceType
    avoided_co2e_t: float
    formula: str
    accounting_treatment: str


class GrossFootprintResult(BaseModel):
    """Gross operational emissions (Scope 1 + Scope 2 actuals)."""
    scope1: Optional[Scope1CalculationResult] = None
    scope2: Optional[Scope2CalculationResult] = None
    total_gross_co2e_t: float
    direct_co2_only_total_t: float


class ScenarioComparisonResult(BaseModel):
    """Baseline vs. Proposed scenario analysis."""
    baseline_gross_t_co2e: float
    proposed_gross_t_co2e: float
    net_reduction_t_co2e: float
    reduction_percentage: float
    baseline_electricity_kwh: Optional[float] = None
    proposed_electricity_kwh: Optional[float] = None
    electricity_savings_kwh: Optional[float] = None
    avoided_emissions_t_co2e: Optional[float] = None
    provenance: ProvenanceType = ProvenanceType.SIMULATED
    accounting_note: Optional[str] = None


class PeriodDetails(BaseModel):
    """Resolved temporal parameters for the calculation."""
    period_type: ReportingPeriodType
    duration_days: float
    duration_hours: float
    description: str


class CarbonCalculateResponse(BaseModel):
    """Response schema for POST /api/v1/carbon/calculate."""
    calculation_metadata: Dict[str, Any]
    period: PeriodDetails
    gross_footprint: GrossFootprintResult
    avoided_emissions: Optional[AvoidedEmissionsResult] = None
    scenario_comparison: Optional[ScenarioComparisonResult] = None


class FactorQueryResponse(BaseModel):
    """Response schema for GET /api/v1/carbon/factors."""
    database_metadata: Dict[str, Any]
    available_years: List[str]
    scope2_grid_factors: List[CeaFactorMetadata]
    scope1_fuel_factors: List[Dict[str, Any]]


# Re-export AI schemas for unified access
from backend.app.schemas.ai import (
    ExplainContext,
    ExplainRequest,
    ExplainResponse,
    ChatMessage,
    ChatRequest,
    ChatResponse,
    AIStatusResponse,
    ChartSeriesInfo,
)

