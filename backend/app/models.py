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
    activity_unit: str = Field(default="kg", description="Unit of measure (e.g., 'kg', 'L', 't')")
    provenance: ProvenanceType = Field(default=ProvenanceType.ESTIMATED)
    include_non_co2_ghg: bool = Field(default=True, description="Include CH4 and N2O AR6 equivalents")
    custom_emission_factor: Optional[float] = Field(default=None, ge=0.0, description="Custom kg CO2e / unit factor (backward compatible)")
    custom_direct_co2_factor: Optional[float] = Field(default=None, ge=0.0, description="Separate direct kg CO2 / unit factor")
    custom_total_co2e_factor: Optional[float] = Field(default=None, ge=0.0, description="Separate total kg CO2e / unit factor")
    custom_factor_unit: Optional[str] = Field(default=None, description="Unit of measure for custom factor (e.g. 'kg CO2e/kg')")
    custom_factor_provenance: Optional[str] = Field(default=None, description="Source/provenance of custom factor (e.g. 'Supplier Lab Assay')")
    custom_ncv_mj_per_unit: Optional[float] = Field(default=None, ge=0.0, description="Net Calorific Value in MJ/unit")
    activity_period: Optional[ReportingPeriodInput] = Field(default=None, description="Temporal period if different from root")

    @model_validator(mode="after")
    def validate_custom_factors(self) -> "Scope1Input":
        total_ef = self.custom_total_co2e_factor if self.custom_total_co2e_factor is not None else self.custom_emission_factor
        if total_ef is not None and self.custom_direct_co2_factor is not None:
            if self.custom_direct_co2_factor > total_ef + 1e-6:
                raise ValueError(
                    f"Direct CO2 factor ({self.custom_direct_co2_factor}) cannot exceed total CO2e factor ({total_ef})"
                )
        return self


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
    direct_co2_kg_per_kg: Optional[float] = None
    ch4_emitted_g_per_kg: float = 0.0
    ch4_converted_kg_per_kg: float = 0.0
    ch4_gwp_ar6: float = 27.9
    ch4_co2e_kg_per_kg: float = 0.0
    n2o_emitted_g_per_kg: float = 0.0
    n2o_converted_kg_per_kg: float = 0.0
    n2o_gwp_ar6: float = 273.0
    n2o_co2e_kg_per_kg: float = 0.0
    total_co2e_kg_per_kg: float


class Scope1CalculationResult(BaseModel):
    """Calculation audit result for Scope 1 direct combustion."""
    fuel_id: str
    fuel_name: str
    activity: Dict[str, Any]
    factor_breakdown: Scope1FactorBreakdown
    emissions_direct_co2_t: Optional[float] = None
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
    accounting_approach: str = "Scope 2 Location-Based (Grid Average with RES & Captive)"


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
    direct_co2_only_total_t: Optional[float] = None


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
    scope1_t_co2e: Optional[float] = None
    proposed_scope2_t_co2e: Optional[float] = None
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


# ─── Machine-Level Energy Forecasting Schemas ─────────────────────────────────

class EnergyForecastInput(BaseModel):
    """Input payload for machine-level next 15-minute energy consumption forecasting."""
    machine_id: str = Field(description="Unique machine identifier (e.g., 'MACHINE_001')")
    machine_type: str = Field(description="Machine taxonomy (e.g., 'AIR_COMPRESSOR', 'CNC_MILL')")
    site_id: str = Field(default="SITE_01", description="Industrial site/facility identifier")
    shift_pattern: str = Field(default="3_shift", description="Active factory shift pattern")
    rated_power_kw: float = Field(ge=0.0, description="Nameplate rated electrical power in kW")
    power_kw: float = Field(ge=0.0, description="Current electrical power demand in kW")
    energy_kwh: Optional[float] = Field(default=None, ge=0.0, description="Energy consumed in current 15-min interval (if omitted, power*0.25 is used)")
    operating_state: int = Field(default=2, ge=0, le=3, description="0=Off, 1=Idle, 2=Running, 3=Maintenance")
    load_factor: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    operating_minutes: Optional[float] = Field(default=15.0, ge=0.0, le=15.0)
    production_units: Optional[float] = Field(default=1.0, ge=0.0)
    ambient_temp_c: Optional[float] = Field(default=27.5)
    process_temp_c: Optional[float] = Field(default=35.0)
    relative_humidity_pct: Optional[float] = Field(default=58.0, ge=0.0, le=100.0)
    hour: Optional[int] = Field(default=None, ge=0, le=23)
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    input_provenance: ProvenanceType = Field(default=ProvenanceType.SIMULATED, description="Activity data provenance classification")
    # Historical lags if available from SCADA telemetry buffer
    energy_kwh_lag1: Optional[float] = Field(default=None, ge=0.0)
    energy_kwh_lag2: Optional[float] = Field(default=None, ge=0.0)
    energy_kwh_lag3: Optional[float] = Field(default=None, ge=0.0)
    energy_kwh_lag4: Optional[float] = Field(default=None, ge=0.0)
    power_kw_lag1: Optional[float] = Field(default=None, ge=0.0)
    power_kw_lag2: Optional[float] = Field(default=None, ge=0.0)
    energy_same_hour_prev_day: Optional[float] = Field(default=None, ge=0.0)


class EnergyForecastResponse(BaseModel):
    """Prediction result for next 15-minute machine energy consumption."""
    machine_id: str
    machine_type: str
    forecast_target: str = Field(default="next_15min_energy_kwh", description="Forecasting target definition")
    forecast_horizon_minutes: int = Field(default=15, description="Prediction time horizon in minutes")
    predicted_next_15min_energy_kwh: float = Field(description="Expected electrical energy in kWh for next 15-min interval")
    energy_unit: str = Field(default="kWh", description="Energy metric unit")
    equivalent_average_power_kw: float = Field(description="Equivalent average electrical power demand in kW (predicted_energy / 0.25h)")
    power_unit: str = Field(default="kW", description="Power metric unit")
    current_power_kw: float
    current_energy_kwh: float
    delta_kwh: float = Field(description="Predicted energy delta relative to current interval (predicted - current)")
    delta_percentage: float = Field(description="Percentage change relative to current interval")
    input_provenance: ProvenanceType = Field(default=ProvenanceType.SIMULATED)
    prediction_timestamp: str = Field(description="ISO UTC timestamp when prediction was generated")
    target_interval_start: str = Field(description="ISO UTC start timestamp of forecasted 15-min window")
    target_interval_end: str = Field(description="ISO UTC end timestamp of forecasted 15-min window")
    target_interval: str = Field(description="Human-readable forecast interval window")
    physical_constraint_applied: bool = Field(default=False, description="True if negative or above-capacity forecast was clamped")
    model_metadata: Dict[str, Any]
    data_provenance: str = "PREDICTED_HIST_GB_MODEL"


class ForecastHorizon(str, Enum):
    """Supported forecasting horizons for machine and fleet energy intelligence."""
    NEXT_15MIN = "15m"
    NEXT_DAY = "1d"
    NEXT_WEEK = "1w"


class ForecastTimeSeriesPoint(BaseModel):
    """Single discrete interval projection in a multi-step forecast."""
    timestamp: str = Field(description="ISO 8601 start timestamp of interval")
    interval_label: str = Field(description="Display label (e.g., '14:00', 'Day 1 (Mon)')")
    predicted_energy_kwh: float = Field(description="Forecast electrical energy in kWh")
    equivalent_average_power_kw: float = Field(description="Equivalent average electrical power in kW")


class MachineForecastBreakdown(BaseModel):
    """Machine contribution item in fleet-level energy forecast."""
    machine_id: str
    machine_name: str
    machine_type: str
    predicted_energy_kwh: float
    equivalent_average_power_kw: float
    percentage_of_fleet: float
    is_fallback: bool = False


class HorizonForecastResponse(BaseModel):
    """Standardized response schema across all three forecasting horizons (15m, 1d, 1w)."""
    forecast_horizon: str = Field(description="'15m' (15 Minutes), '1d' (1 Day / 24 Hours), or '1w' (1 Week / 7 Days)")
    forecast_target: str = Field(description="Prediction target definition")
    forecast_start: str = Field(description="ISO 8601 start timestamp")
    forecast_end: str = Field(description="ISO 8601 end timestamp")
    forecast_duration_hours: float = Field(description="Total duration in hours (0.25, 24.0, 168.0)")
    machine_id: str = Field(description="'PLANT' or unique machine ID")
    machine_type: Optional[str] = None
    predicted_energy_kwh: float = Field(description="Total electrical energy in kWh expected over horizon")
    energy_unit: str = "kWh"
    equivalent_average_power_kw: float = Field(description="Equivalent average power demand in kW (kWh / duration_hours)")
    power_unit: str = "kW"
    granularity: str = Field(description="'15-minute', 'hourly', or 'daily'")
    time_series: List[ForecastTimeSeriesPoint] = Field(default_factory=list, description="Ordered time-series points for charts")
    machine_breakdown: List[MachineForecastBreakdown] = Field(default_factory=list, description="Fleet machine contributions when machine_id is 'PLANT'")
    model_metadata: Dict[str, Any] = Field(default_factory=dict)
    data_provenance: str = "PREDICTED_HIST_GB_MODEL"
    physical_constraint_applied: bool = False
    coverage_count: int = Field(default=1, description="Number of machines with valid predictions")
    total_machines: int = Field(default=1, description="Total machines queried")
    is_complete_coverage: bool = True
    assumptions: List[str] = Field(default_factory=list, description="Transparent operating schedule and shift assumptions")


class FleetForecastRequest(BaseModel):
    """Payload for multi-horizon plant fleet forecast."""
    horizon: ForecastHorizon = Field(default=ForecastHorizon.NEXT_15MIN)
    machines: List[EnergyForecastInput] = Field(description="Telemetry inputs for the fleet machines")


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

