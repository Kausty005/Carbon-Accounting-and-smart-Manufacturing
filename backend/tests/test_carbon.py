"""
WattWise AI — Carbon Accounting Automated Test Suite
Covers:
1. LPG calculations and unit conversions (g -> kg -> GWP).
2. Scope 2 CEA factor selection (Location-Based vs OM/BM/CM, Rows 13-17).
3. Unsupported reporting years rejection.
4. Period mismatch rejection (HTTP 422) and normalization.
5. Calendar month durations (Feb 28d, Leap Feb 29d, Oct 31d, Apr 30d).
6. Gross emissions vs. avoided emissions isolation.
7. Missing/invalid reference data handling.
8. FastAPI TestClient API integration.
"""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import (
    CarbonCalculateRequest,
    CeaMethodology,
    ProvenanceType,
    ReportingPeriodInput,
    ReportingPeriodType,
    ScenarioComparisonInput,
    Scope1Input,
    Scope2Input,
)
from backend.app.services.carbon_service import PeriodMismatchError, carbon_service
from backend.app.services.reference_data import ReferenceDataError, ReferenceDataService, reference_data_service


@pytest.fixture
def client():
    return TestClient(app)


# ─── 1. LPG Calculations & Unit Conversions ───────────────────────────────────

def test_lpg_unit_conversions_and_factors():
    """Verify exact IPCC 2006 (Vol 2 Ch 2 Table 2.3) calculations and unit conversions."""
    breakdown = reference_data_service.get_ipcc_lpg_parameters()

    # Direct CO2: 63,100 kg/TJ * 0.0000473 TJ/kg = 2.98463 kg CO2/kg LPG
    assert breakdown.direct_co2_kg_per_kg == pytest.approx(2.98463, rel=1e-4)

    # CH4: 1.0 kg/TJ * 0.0000473 TJ/kg = 0.0473 g/kg -> 0.0000473 kg/kg
    assert breakdown.ch4_emitted_g_per_kg == pytest.approx(0.0473, rel=1e-4)
    assert breakdown.ch4_converted_kg_per_kg == pytest.approx(0.0000473, rel=1e-6)
    assert breakdown.ch4_gwp_ar6 == 27.9
    expected_ch4_co2e = 0.0000473 * 27.9  # ~0.001320 kg CO2e/kg
    assert breakdown.ch4_co2e_kg_per_kg == pytest.approx(expected_ch4_co2e, abs=1e-5)

    # N2O: 0.1 kg/TJ * 0.0000473 TJ/kg = 0.00473 g/kg -> 0.00000473 kg/kg
    assert breakdown.n2o_emitted_g_per_kg == pytest.approx(0.00473, rel=1e-4)
    assert breakdown.n2o_converted_kg_per_kg == pytest.approx(0.00000473, rel=1e-6)
    assert breakdown.n2o_gwp_ar6 == 273.0
    expected_n2o_co2e = 0.00000473 * 273.0  # ~0.001291 kg CO2e/kg
    assert breakdown.n2o_co2e_kg_per_kg == pytest.approx(expected_n2o_co2e, abs=1e-5)

    # Total CO2e = Direct CO2 + CH4 CO2e + N2O CO2e = ~2.98724
    expected_total_co2e = 2.98463 + expected_ch4_co2e + expected_n2o_co2e
    assert breakdown.total_co2e_kg_per_kg == pytest.approx(expected_total_co2e, rel=1e-4)


def test_lpg_calculation_direct_vs_total_co2e():
    """Verify Scope 1 outputs for 1,800 kg LPG (30-day run at 60 kg/day)."""
    req_total = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="lpg",
            activity_value=1800.0,
            activity_unit="kg",
            include_non_co2_ghg=True
        )
    )
    res_total = carbon_service.calculate(req_total)
    s1 = res_total.gross_footprint.scope1
    assert s1 is not None
    # 1800 * 2.98463 / 1000 = 5.3723 t CO2
    assert s1.emissions_direct_co2_t == pytest.approx(5.3723, rel=1e-3)
    # 1800 * 2.98724 / 1000 = 5.3770 t CO2e
    assert s1.emissions_total_co2e_t == pytest.approx(5.3770, rel=1e-3)
    assert s1.emissions_evaluated_t_co2e == pytest.approx(5.3770, rel=1e-3)
    assert s1.verification_status == "VERIFIED_IPCC"

    # Direct CO2 only
    req_direct = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="lpg",
            activity_value=1800.0,
            activity_unit="kg",
            include_non_co2_ghg=False
        )
    )
    res_direct = carbon_service.calculate(req_direct)
    assert res_direct.gross_footprint.scope1.emissions_evaluated_t_co2e == pytest.approx(5.3723, rel=1e-3)


# ─── 2. Scope 2 Factor Selection ──────────────────────────────────────────────

def test_scope2_cea_factor_selection():
    """Verify CEA factor selection across methodologies and fiscal years."""
    # 1. Location-based default (Row 14, FY 2023-24)
    f_loc = reference_data_service.get_cea_factor(
        reporting_year="2023-24",
        methodology=CeaMethodology.WEIGHTED_AVG_WITH_RES
    )
    assert f_loc.row == 14
    assert f_loc.column == 13
    assert f_loc.selected_factor == pytest.approx(0.728862, rel=1e-4)
    assert f_loc.is_recommended_location_based is True
    assert f_loc.sheet == "Results"

    # 2. Thermal fossil only (Row 13, FY 2023-24)
    f_therm = reference_data_service.get_cea_factor(
        reporting_year="2023-24",
        methodology=CeaMethodology.WEIGHTED_AVG_THERMAL
    )
    assert f_therm.row == 13
    assert f_therm.selected_factor == pytest.approx(0.843514, rel=1e-4)
    assert f_therm.is_recommended_location_based is False

    # 3. Simple Operating Margin (Row 15, FY 2023-24)
    f_om = reference_data_service.get_cea_factor(
        reporting_year="2023-24",
        methodology=CeaMethodology.OPERATING_MARGIN
    )
    assert f_om.row == 15
    assert f_om.selected_factor == pytest.approx(0.964109, rel=1e-4)

    # 4. Build Margin (Row 16, FY 2023-24)
    f_bm = reference_data_service.get_cea_factor(
        reporting_year="2023-24",
        methodology=CeaMethodology.BUILD_MARGIN
    )
    assert f_bm.row == 16
    assert f_bm.selected_factor == pytest.approx(0.552152, rel=1e-4)

    # 5. Combined Margin (Row 17, FY 2023-24)
    f_cm = reference_data_service.get_cea_factor(
        reporting_year="2023-24",
        methodology=CeaMethodology.COMBINED_MARGIN
    )
    assert f_cm.row == 17
    assert f_cm.selected_factor == pytest.approx(0.758131, rel=1e-4)


def test_scope2_calculation():
    """Verify Scope 2 calculation: 12,480 kWh * 0.728862 kg/kWh / 1000 = 9.0962 tCO2e."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope2=Scope2Input(
            grid_consumption_kwh=12480.0,
            cea_reporting_year="2023-24",
            cea_methodology=CeaMethodology.WEIGHTED_AVG_WITH_RES
        )
    )
    res = carbon_service.calculate(req)
    s2 = res.gross_footprint.scope2
    assert s2 is not None
    assert s2.emissions_total_co2e_t == pytest.approx(9.0962, rel=1e-3)
    assert s2.factor_metadata.row == 14
    assert s2.factor_metadata.reporting_year == "2023-24"


# ─── 3. Unsupported Reporting Years ───────────────────────────────────────────

def test_unsupported_reporting_year_rejection():
    """Verify that unavailable reporting years raise clear errors and are never silently substituted."""
    with pytest.raises(ValueError) as excinfo:
        reference_data_service.get_cea_factor(reporting_year="1999-00")
    assert "Requested CEA reporting year '1999-00' is not available" in str(excinfo.value)
    assert "Silently substituting another year is prohibited" in str(excinfo.value)

    with pytest.raises(ValueError) as excinfo2:
        reference_data_service.get_cea_factor(reporting_year="2035-36")
    assert "2035-36" in str(excinfo2.value)


# ─── 4. Period Mismatch Rejection & Normalization ──────────────────────────────

def test_period_mismatch_rejection_without_normalization():
    """Scope 1 daily (1d) and Scope 2 monthly (30d) must raise PeriodMismatchError (HTTP 422)."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="lpg",
            activity_value=60.0,
            activity_period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY)
        ),
        scope2=Scope2Input(
            grid_consumption_kwh=12480.0
            # defaults to master period SIMULATED_DEMO_30D
        ),
        target_normalization_period=None  # Do not allow automated scaling
    )
    with pytest.raises(PeriodMismatchError) as excinfo:
        carbon_service.calculate(req)
    assert "Reporting period mismatch for Scope 1" in excinfo.value.detail
    assert "Silently combining disparate periods is prohibited" in excinfo.value.detail


def test_period_mismatch_with_explicit_normalization():
    """Supplying target_normalization_period allows automated scaling with audit note."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="lpg",
            activity_value=60.0,
            activity_period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY)
        ),
        scope2=Scope2Input(
            grid_consumption_kwh=12480.0
        ),
        target_normalization_period=ReportingPeriodType.SIMULATED_DEMO_30D
    )
    res = carbon_service.calculate(req)
    s1 = res.gross_footprint.scope1
    # 60 kg/day normalized to 30 days = 1,800 kg
    assert s1.activity["value"] == pytest.approx(1800.0, rel=1e-2)
    assert "Normalized from 1.0d to 30.0d" in s1.activity["basis"]


# ─── 5. Calendar Month Durations ──────────────────────────────────────────────

def test_calendar_month_durations():
    """Verify exact days: Feb non-leap (28d), Feb leap (29d), Oct (31d), Apr (30d)."""
    # 1. February 2026 (non-leap: 28 days)
    days_feb26, hours_feb26, _ = carbon_service.resolve_period_duration(
        ReportingPeriodInput(period_type=ReportingPeriodType.CALENDAR_MONTH, calendar_year=2026, calendar_month=2)
    )
    assert days_feb26 == 28.0
    assert hours_feb26 == 672.0

    # 2. February 2024 (leap year: 29 days)
    days_feb24, hours_feb24, _ = carbon_service.resolve_period_duration(
        ReportingPeriodInput(period_type=ReportingPeriodType.CALENDAR_MONTH, calendar_year=2024, calendar_month=2)
    )
    assert days_feb24 == 29.0
    assert hours_feb24 == 696.0

    # 3. October 2026 (31 days)
    days_oct26, hours_oct26, desc_oct = carbon_service.resolve_period_duration(
        ReportingPeriodInput(period_type=ReportingPeriodType.CALENDAR_MONTH, calendar_year=2026, calendar_month=10)
    )
    assert days_oct26 == 31.0
    assert hours_oct26 == 744.0
    assert "31 calendar days" in desc_oct

    # 4. April 2026 (30 days)
    days_apr26, hours_apr26, _ = carbon_service.resolve_period_duration(
        ReportingPeriodInput(period_type=ReportingPeriodType.CALENDAR_MONTH, calendar_year=2026, calendar_month=4)
    )
    assert days_apr26 == 30.0
    assert hours_apr26 == 720.0


# ─── 6. Gross Emissions vs. Avoided Emissions ─────────────────────────────────

def test_gross_vs_avoided_emissions_isolation():
    """Verify that avoided emissions from energy savings are NEVER subtracted from the gross footprint."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, cea_reporting_year="2023-24"),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=998.4,
            savings_provenance=ProvenanceType.SIMULATED
        )
    )
    res = carbon_service.calculate(req)

    gross_s1 = res.gross_footprint.scope1.emissions_total_co2e_t  # 5.3770
    gross_s2 = res.gross_footprint.scope2.emissions_total_co2e_t  # 9.0962
    expected_gross = round(gross_s1 + gross_s2, 4)  # 14.4732

    # Gross footprint must remain unreduced
    assert res.gross_footprint.total_gross_co2e_t == pytest.approx(expected_gross, rel=1e-4)

    # Avoided emissions reported separately
    assert res.avoided_emissions is not None
    # 998.4 * 0.728862 / 1000 = 0.7277 tCO2e
    expected_avoided = round((998.4 * 0.728862) / 1000.0, 4)
    assert res.avoided_emissions.avoided_co2e_t == pytest.approx(expected_avoided, rel=1e-3)
    assert "NOT netted against the actual operational gross footprint" in res.avoided_emissions.accounting_treatment

    # Scenario comparison reflects baseline vs. proposed
    assert res.scenario_comparison is not None
    assert res.scenario_comparison.baseline_gross_t_co2e == pytest.approx(expected_gross, rel=1e-4)
    assert res.scenario_comparison.net_reduction_t_co2e == pytest.approx(expected_avoided, rel=1e-3)
    assert res.scenario_comparison.proposed_gross_t_co2e == pytest.approx(expected_gross - expected_avoided, rel=1e-3)


# ─── 7. Missing or Invalid Reference Data ──────────────────────────────────────

def test_missing_reference_file_handling():
    """Verify ReferenceDataError is raised when workbook is missing."""
    service_bad = ReferenceDataService(excel_path=Path("nonexistent/path/CEA_Baseline.xlsx"))
    with pytest.raises(ReferenceDataError) as excinfo:
        service_bad.get_cea_metadata()
    assert "CEA reference file not found at expected path" in str(excinfo.value)


def test_unverified_custom_fuel_handling():
    """Unverified fuels must supply custom_emission_factor or be rejected with HTTP 422."""
    # Missing factor -> 422
    req_invalid = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="diesel", activity_value=500.0, custom_emission_factor=None)
    )
    with pytest.raises(Exception):
        carbon_service.calculate(req_invalid)

    # With factor -> status PENDING_VERIFICATION
    req_valid_custom = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="diesel", activity_value=500.0, custom_emission_factor=2.68)
    )
    res_custom = carbon_service.calculate(req_valid_custom)
    s1 = res_custom.gross_footprint.scope1
    assert s1.verification_status == "PENDING_VERIFICATION"
    assert s1.emissions_total_co2e_t == pytest.approx((500.0 * 2.68) / 1000.0, rel=1e-3)


# ─── 8. API Integration Tests (FastAPI TestClient) ────────────────────────────

def test_api_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_get_factors_endpoint(client):
    response = client.get("/api/v1/carbon/factors")
    assert response.status_code == 200
    data = response.json()
    assert "CENTRAL ELECTRICITY AUTHORITY" in data["database_metadata"]["title"]
    assert "2023-24" in data["available_years"]
    assert len(data["scope2_grid_factors"]) > 0
    assert any(f["fuel_id"] == "lpg" and f["verification_status"] == "VERIFIED_IPCC" for f in data["scope1_fuel_factors"])


def test_api_post_calculate_endpoint(client):
    payload = {
        "period": {
            "period_type": "SIMULATED_DEMO_30D",
            "duration_days": 30.0
        },
        "scope1": {
            "fuel_id": "lpg",
            "activity_value": 1800.0,
            "activity_unit": "kg",
            "provenance": "ESTIMATED",
            "include_non_co2_ghg": True
        },
        "scope2": {
            "grid_consumption_kwh": 12480.0,
            "provenance": "MEASURED",
            "cea_reporting_year": "2023-24",
            "cea_methodology": "weighted_avg_with_res"
        },
        "scenario_comparison": {
            "enabled": True,
            "proposed_savings_kwh": 998.4,
            "savings_provenance": "SIMULATED"
        }
    }
    response = client.post("/api/v1/carbon/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["gross_footprint"]["total_gross_co2e_t"] == pytest.approx(14.473, rel=1e-3)
    assert data["avoided_emissions"]["avoided_co2e_t"] == pytest.approx(0.728, rel=1e-2)
    assert data["calculation_metadata"]["audit_status"] == "CALCULATION_UNVERIFIED_DEMO"


# ─── 9. Digital Twin & Scenario Comparison Tests ──────────────────────────────

def test_digital_twin_scenario_changes_affect_proposed_not_baseline():
    """Verify that altering what-if scenario savings alters proposed results but strictly preserves baseline values."""
    base_req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0, provenance=ProvenanceType.ESTIMATED),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, provenance=ProvenanceType.MEASURED, cea_reporting_year="2023-24"),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=500.0,
            savings_provenance=ProvenanceType.SIMULATED
        )
    )
    res1 = carbon_service.calculate(base_req)

    # Scenario 2: increase savings to 1200 kWh
    scenario2_req = base_req.model_copy(deep=True)
    scenario2_req.scenario_comparison.proposed_savings_kwh = 1200.0
    res2 = carbon_service.calculate(scenario2_req)

    # 1. Baseline emissions are IDENTICAL across both runs
    assert res1.gross_footprint.total_gross_co2e_t == pytest.approx(res2.gross_footprint.total_gross_co2e_t, rel=1e-5)
    assert res1.gross_footprint.scope2.emissions_total_co2e_t == pytest.approx(res2.gross_footprint.scope2.emissions_total_co2e_t, rel=1e-5)
    assert res1.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(res2.gross_footprint.scope1.emissions_total_co2e_t, rel=1e-5)
    assert res1.scenario_comparison.baseline_gross_t_co2e == pytest.approx(res2.scenario_comparison.baseline_gross_t_co2e, rel=1e-5)

    # 2. Avoided emissions and proposed gross emissions change strictly reflecting the scenario
    # Factor = 0.728862
    expected_avoided_1 = round((500.0 * 0.728862) / 1000.0, 4)
    expected_avoided_2 = round((1200.0 * 0.728862) / 1000.0, 4)

    assert res1.avoided_emissions.avoided_co2e_t == pytest.approx(expected_avoided_1, rel=1e-3)
    assert res2.avoided_emissions.avoided_co2e_t == pytest.approx(expected_avoided_2, rel=1e-3)
    assert res1.scenario_comparison.proposed_gross_t_co2e > res2.scenario_comparison.proposed_gross_t_co2e
    assert res2.scenario_comparison.net_reduction_t_co2e > res1.scenario_comparison.net_reduction_t_co2e


def test_digital_twin_zero_savings_produce_zero_avoided_emissions():
    """Verify that zero scenario savings produce exactly 0.0 avoided emissions and proposed equals baseline."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, cea_reporting_year="2023-24"),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=0.0,
            savings_provenance=ProvenanceType.SIMULATED
        )
    )
    res = carbon_service.calculate(req)

    # Zero savings -> Zero avoided emissions
    assert res.avoided_emissions is not None
    assert res.avoided_emissions.savings_kwh == 0.0
    assert res.avoided_emissions.avoided_co2e_t == 0.0

    # Proposed gross equals baseline gross
    assert res.scenario_comparison is not None
    assert res.scenario_comparison.baseline_gross_t_co2e == pytest.approx(14.4732, rel=1e-3)
    assert res.scenario_comparison.proposed_gross_t_co2e == pytest.approx(14.4732, rel=1e-3)
    assert res.scenario_comparison.net_reduction_t_co2e == 0.0
    assert res.scenario_comparison.reduction_percentage == 0.0

    # Baseline gross remains unchanged
    assert res.gross_footprint.total_gross_co2e_t == pytest.approx(14.4732, rel=1e-3)


def test_digital_twin_electricity_savings_never_affect_scope1():
    """Verify that digital twin electricity optimizations never modify Scope 1 fuel emissions."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, cea_reporting_year="2023-24"),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=10000.0,  # massive electricity savings
            savings_provenance=ProvenanceType.SIMULATED
        )
    )
    res = carbon_service.calculate(req)
    # Scope 1 direct and total CO2e must remain untouched
    assert res.gross_footprint.scope1.emissions_direct_co2_t == pytest.approx(5.3723, rel=1e-3)
    assert res.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(5.3770, rel=1e-3)
    assert res.scenario_comparison.scope1_t_co2e == pytest.approx(5.3770, rel=1e-3)


# ─── 10. Scope 1 Fuel-Unit Safety Tests ────────────────────────────────────────

def test_lpg_fuel_unit_safety_and_conversion():
    """Verify that LPG calculations enforce unit safety: kg, tonnes, and IS 4576 litres."""
    # 1. Standard kg
    req_kg = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0, activity_unit="kg")
    )
    res_kg = carbon_service.calculate(req_kg)
    s1_kg = res_kg.gross_footprint.scope1
    assert s1_kg.activity["effective_mass_kg"] == 1800.0
    assert s1_kg.activity["conversion_applied"] is None
    assert s1_kg.emissions_total_co2e_t == pytest.approx(5.3770, rel=1e-3)

    # 2. Metric tonnes (1.8 t = 1,800 kg)
    req_t = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1.8, activity_unit="t")
    )
    res_t = carbon_service.calculate(req_t)
    s1_t = res_t.gross_footprint.scope1
    assert s1_t.activity["effective_mass_kg"] == 1800.0
    assert "1 tonne = 1,000 kg" in s1_t.activity["conversion_applied"]
    assert s1_t.emissions_total_co2e_t == pytest.approx(5.3770, rel=1e-3)

    # 3. Litres via IS 4576 LPG liquid density (1,000 L * 0.540 kg/L = 540 kg)
    req_l = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1000.0, activity_unit="litres")
    )
    res_l = carbon_service.calculate(req_l)
    s1_l = res_l.gross_footprint.scope1
    assert s1_l.activity["effective_mass_kg"] == 540.0
    assert "0.540 kg/L" in s1_l.activity["conversion_applied"]
    assert "IS 4576" in s1_l.activity["conversion_applied"]
    # 540 kg * 2.98724 / 1000 = 1.6131 tCO2e
    assert s1_l.emissions_total_co2e_t == pytest.approx(1.6131, rel=1e-3)
    # 540 kg * 2.98463 / 1000 = 1.6117 tCO2 direct
    assert s1_l.emissions_direct_co2_t == pytest.approx(1.6117, rel=1e-3)

    # 4. Incompatible units rejection (m3, kWh, gallons)
    for bad_unit in ["m3", "kWh", "gallons", "unknown_unit"]:
        req_bad = CarbonCalculateRequest(
            period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
            scope1=Scope1Input(fuel_id="lpg", activity_value=1000.0, activity_unit=bad_unit)
        )
        with pytest.raises(Exception) as excinfo:
            carbon_service.calculate(req_bad)
        assert "Incompatible activity unit" in str(excinfo.value)
        assert "IPCC LPG emission factors are strictly defined per kilogram" in str(excinfo.value)


# ─── 11. Scope 1 Custom Factors & CO2 / CO2e Distinction ──────────────────────

def test_custom_fuel_factors_direct_co2_vs_total_co2e_distinction():
    """Verify that custom factors do not conflate direct CO2 with total CO2e and are never labeled IPCC."""
    # Case A: Only total CO2e supplied -> direct CO2 must be None, NOT equal to total
    req_total_only = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="furnace_oil",
            activity_value=1000.0,
            activity_unit="kg",
            custom_total_co2e_factor=3.15,
            custom_factor_provenance="Refinery Assay Batch #88"
        )
    )
    res_total_only = carbon_service.calculate(req_total_only)
    s1_a = res_total_only.gross_footprint.scope1
    assert s1_a.emissions_total_co2e_t == pytest.approx((1000.0 * 3.15) / 1000.0, rel=1e-3)
    assert s1_a.emissions_direct_co2_t is None  # MUST NOT be 3.15!
    assert s1_a.factor_breakdown.direct_co2_kg_per_kg is None
    assert s1_a.factor_breakdown.total_co2e_kg_per_kg == 3.15
    assert s1_a.verification_status != "VERIFIED_IPCC"
    assert "Total CO₂e only; direct CO₂ factor not supplied" in s1_a.formula
    assert "Refinery Assay Batch #88" in s1_a.source_reference

    # Case B: Both direct CO2 and total CO2e supplied
    req_dual = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="bio_blend",
            activity_value=1000.0,
            activity_unit="kg",
            custom_direct_co2_factor=1.85,
            custom_total_co2e_factor=1.92,
            custom_factor_provenance="Biofuels Lab Assay Certificate"
        )
    )
    res_dual = carbon_service.calculate(req_dual)
    s1_b = res_dual.gross_footprint.scope1
    assert s1_b.emissions_direct_co2_t == pytest.approx(1.85, rel=1e-3)
    assert s1_b.emissions_total_co2e_t == pytest.approx(1.92, rel=1e-3)
    assert s1_b.factor_breakdown.direct_co2_kg_per_kg == 1.85
    assert s1_b.factor_breakdown.total_co2e_kg_per_kg == 1.92
    assert s1_b.verification_status != "VERIFIED_IPCC"

    # Case C: Rejection if direct CO2 factor exceeds total CO2e
    with pytest.raises(ValueError) as excinfo:
        Scope1Input(
            fuel_id="invalid_blend",
            activity_value=100.0,
            custom_direct_co2_factor=3.50,
            custom_total_co2e_factor=2.50
        )
    assert "Direct CO2 factor (3.5) cannot exceed total CO2e factor (2.5)" in str(excinfo.value)


# ─── 12. Scenario Accounting: Proposed Gross = Scope 1 + Proposed Scope 2 ─────

def test_scenario_proposed_gross_equals_scope1_plus_proposed_scope2():
    """Verify that proposed gross strictly equals Scope 1 plus proposed Scope 2."""
    baseline_kwh = 12480.0
    savings_kwh = 1480.0
    proposed_kwh = 11000.0
    grid_ef = 0.728862  # FY 2023-24 location-based factor

    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0),
        scope2=Scope2Input(grid_consumption_kwh=baseline_kwh, cea_reporting_year="2023-24"),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=savings_kwh,
            proposed_consumption_kwh=proposed_kwh,
            savings_provenance=ProvenanceType.SIMULATED
        )
    )
    res = carbon_service.calculate(req)
    sc = res.scenario_comparison

    # Baseline Scope 1 = 1800 * 2.98724 / 1000 = 5.3770 tCO2e
    s1_expected = 5.3770
    # Proposed Scope 2 = 11000 * 0.728862 / 1000 = 8.0175 tCO2e
    proposed_s2_expected = round((proposed_kwh * grid_ef) / 1000.0, 4)
    # Proposed Gross = Scope 1 + Proposed Scope 2 = 5.3770 + 8.0175 = 13.3945 tCO2e
    proposed_gross_expected = round(s1_expected + proposed_s2_expected, 4)

    assert sc.scope1_t_co2e == pytest.approx(s1_expected, rel=1e-3)
    assert sc.proposed_scope2_t_co2e == pytest.approx(proposed_s2_expected, rel=1e-3)
    assert sc.proposed_gross_t_co2e == pytest.approx(proposed_gross_expected, rel=1e-3)
    assert sc.proposed_gross_t_co2e == pytest.approx(sc.scope1_t_co2e + sc.proposed_scope2_t_co2e, rel=1e-5)

    # Avoided emissions reported separately (1480 * 0.728862 / 1000 = 1.0787 tCO2e)
    avoided_expected = round((savings_kwh * grid_ef) / 1000.0, 4)
    assert res.avoided_emissions.avoided_co2e_t == pytest.approx(avoided_expected, rel=1e-3)

    # Baseline gross remains un-netted
    baseline_s2 = round((baseline_kwh * grid_ef) / 1000.0, 4)
    assert res.gross_footprint.total_gross_co2e_t == pytest.approx(s1_expected + baseline_s2, rel=1e-3)


def test_scenario_input_validation_and_consistency():
    """Verify scenario inputs reject negative values and baseline inconsistency."""
    # 1. Inconsistent proposed + savings != baseline (10,000 + 1,000 != 12,480)
    req_inconsistent = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope2=Scope2Input(grid_consumption_kwh=12480.0),
        scenario_comparison=ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=1000.0,
            proposed_consumption_kwh=10000.0
        )
    )
    with pytest.raises(Exception) as excinfo1:
        carbon_service.calculate(req_inconsistent)
    assert "Scenario inputs inconsistent with baseline" in str(excinfo1.value)

    # 2. Negative savings rejected at model validation
    with pytest.raises(Exception):
        ScenarioComparisonInput(
            enabled=True,
            proposed_savings_kwh=-50.0
        )

    # 3. Negative proposed consumption rejected
    with pytest.raises(Exception):
        ScenarioComparisonInput(
            enabled=True,
            proposed_consumption_kwh=-100.0
        )


# ─── 13. Scope 2 Reporting Year Selection & Metadata Preservation ─────────────

def test_cea_reporting_year_selection_preserves_metadata():
    """Verify that selected CEA reporting years preserve year, factor, and methodology without silent substitution."""
    for yr in ["2021-22", "2022-23", "2023-24", "2024-25"]:
        req = CarbonCalculateRequest(
            period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
            scope2=Scope2Input(
                grid_consumption_kwh=10000.0,
                cea_reporting_year=yr,
                cea_methodology=CeaMethodology.WEIGHTED_AVG_WITH_RES
            )
        )
        res = carbon_service.calculate(req)
        meta = res.gross_footprint.scope2.factor_metadata
        assert meta.reporting_year == yr
        assert meta.row == 14
        assert meta.sheet == "Results"
        assert meta.unit == "kg CO2/kWh"
        assert "Scope 2 Location-Based" in meta.accounting_approach


# ─── 14. Activity Period Normalization Metadata ───────────────────────────────

def test_activity_period_normalization_records_complete_metadata():
    """Verify that period normalization records original value, normalized value, and scale factor."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(
            fuel_id="lpg",
            activity_value=60.0,
            activity_period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY)
        ),
        target_normalization_period=ReportingPeriodType.SIMULATED_DEMO_30D
    )
    res = carbon_service.calculate(req)
    norm = res.gross_footprint.scope1.activity["normalization"]
    assert norm["normalization_applied"] is True
    assert norm["original_value"] == 60.0
    assert norm["normalized_value"] == 1800.0
    assert norm["original_duration_days"] == 1.0
    assert norm["normalized_duration_days"] == 30.0
    assert norm["scale_factor"] == 30.0


# ─── 15. Provenance Tracking & Quality Labeling ────────────────────────────────

def test_provenance_tracking_and_labeling():
    """Verify that calculations distinguish purely measured telemetry from estimated or simulated data."""
    # 1. Hybrid: Scope 1 ESTIMATED + Scope 2 MEASURED -> not purely measured
    req_hybrid = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0, provenance=ProvenanceType.ESTIMATED),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, provenance=ProvenanceType.MEASURED)
    )
    res_hybrid = carbon_service.calculate(req_hybrid)
    meta_hybrid = res_hybrid.calculation_metadata
    assert meta_hybrid["is_purely_measured"] is False
    assert meta_hybrid["audit_status"] == "CALCULATION_UNVERIFIED_DEMO"
    assert meta_hybrid["provenance_breakdown"]["scope1"] == "ESTIMATED"
    assert meta_hybrid["provenance_breakdown"]["scope2"] == "MEASURED"

    # 2. Purely measured: Scope 1 MEASURED + Scope 2 MEASURED
    req_measured = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.SIMULATED_DEMO_30D),
        scope1=Scope1Input(fuel_id="lpg", activity_value=1800.0, provenance=ProvenanceType.MEASURED),
        scope2=Scope2Input(grid_consumption_kwh=12480.0, provenance=ProvenanceType.MEASURED)
    )
    res_measured = carbon_service.calculate(req_measured)
    meta_measured = res_measured.calculation_metadata
    assert meta_measured["is_purely_measured"] is True
    assert meta_measured["audit_status"] == "MEASURED_INTERNAL_TELEMETRY"
