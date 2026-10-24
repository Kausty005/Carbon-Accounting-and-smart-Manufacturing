"""
WattWise AI — Enterprise Carbon Engine & Audit Ledger Unit Tests
Verifies:
1. Multi-Fuel Scope 1 calculations (HSD/Diesel, PNG/Natural Gas, HFO, Coal, Biomass)
2. Chemical & Process emissions (R-134a, R-410A, welding shielding gas CO2)
3. Wastewater treatment ETP biological methane emissions (IPCC Vol 5 Ch 6)
4. SHA-256 Hash-chain immutable audit ledger verification and tamper detection
5. Dynamic Carbon Burn Rate Index (BRI) and operational interlock state machine
"""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.models import (
    CarbonCalculateRequest,
    CarbonQuotaRequest,
    ProcessEmissionsInput,
    RefrigerantLeakInput,
    ReportingPeriodInput,
    ReportingPeriodType,
    Scope1Input,
    Scope2Input,
    WastewaterInput,
    WeldingGasInput,
)
from backend.app.services.audit_ledger import audit_ledger_service
from backend.app.services.carbon_service import carbon_service
from backend.app.services.reference_data import reference_data_service


@pytest.fixture
def client():
    return TestClient(app)


# ─── 1. Multi-Fuel Scope 1 Calculations ───────────────────────────────────────

def test_diesel_hsd_combustion_calculation():
    """Verify HSD (Diesel) calculation at 2.6765 kg CO2e / Liter."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        scope1=Scope1Input(fuel_id="hsd", activity_value=100.0, activity_unit="L"),
    )
    res = carbon_service.calculate(req)
    assert res.gross_footprint.scope1 is not None
    # 100 L * 2.6765 kg/L / 1000 = 0.2677 tCO2e
    assert res.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(0.2677, rel=1e-3)
    assert res.gross_footprint.scope1.fuel_name == "High-Speed Diesel (HSD / DG Sets)"
    assert res.gross_footprint.scope1.verification_status == "VERIFIED_IPCC"


def test_png_natural_gas_combustion_calculation():
    """Verify PNG (Piped Natural Gas) at 2.162 kg CO2e / Sm3."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        scope1=Scope1Input(fuel_id="png", activity_value=500.0, activity_unit="Sm3"),
    )
    res = carbon_service.calculate(req)
    assert res.gross_footprint.scope1 is not None
    # 500 Sm3 * 2.162 / 1000 = 1.081 tCO2e
    assert res.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(1.081, rel=1e-3)
    assert res.gross_footprint.scope1.fuel_name == "Piped Natural Gas (PNG / Boilers)"


def test_heavy_fuel_oil_combustion_calculation():
    """Verify HFO (Furnace Oil) at 3.1214 kg CO2e / Liter."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        scope1=Scope1Input(fuel_id="hfo", activity_value=200.0, activity_unit="L"),
    )
    res = carbon_service.calculate(req)
    # 200 L * 3.1214 / 1000 = 0.6243 tCO2e
    assert res.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(0.6243, rel=1e-3)


def test_biomass_combustion_biogenic_co2_accounting():
    """Verify Biomass briquettes have zero net biogenic CO2 and only non-CO2 GHGs (0.029 kg/kg)."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        scope1=Scope1Input(fuel_id="biomass", activity_value=1000.0, activity_unit="kg"),
    )
    res = carbon_service.calculate(req)
    # Direct CO2 is biogenic = 0.0
    assert res.gross_footprint.scope1.emissions_direct_co2_t == 0.0
    # 1000 kg * 0.029 / 1000 = 0.029 tCO2e
    assert res.gross_footprint.scope1.emissions_total_co2e_t == pytest.approx(0.029, rel=1e-2)


# ─── 2. Chemical & Process Emissions ──────────────────────────────────────────

def test_refrigerant_and_welding_process_emissions():
    """Verify HFC-134a refrigerant leak (GWP 1530) and welding shielding gas."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        process_emissions=ProcessEmissionsInput(
            refrigerants=[
                RefrigerantLeakInput(gas_type="R-134a", leak_kg=2.0),
                RefrigerantLeakInput(gas_type="R-410A", leak_kg=1.0),
            ],
            welding=WeldingGasInput(gas_mix="80_20_ar_co2", volume_nm3=100.0),
            solvent_voc_kg=10.0,
        )
    )
    res = carbon_service.calculate(req)
    proc = res.gross_footprint.process_emissions
    assert proc is not None
    # R-134a: 2 kg * 1530 = 3060 kg = 3.06 tCO2e
    # R-410A: 1 kg * 2256 = 2256 kg = 2.256 tCO2e
    # Refrigerants total = 5.316 tCO2e
    assert proc.refrigerant_leaks_t_co2e == pytest.approx(5.316, rel=1e-3)
    # Welding: 100 Nm3 * 0.3954 kg/Nm3 = 39.54 kg = 0.0395 tCO2e
    assert proc.welding_shield_t_co2e == pytest.approx(0.0395, rel=1e-3)
    # Solvent: 10 kg * 3.14 = 31.4 kg = 0.0314 tCO2e
    assert proc.solvent_voc_t_co2e == pytest.approx(0.0314, rel=1e-3)
    assert res.gross_footprint.total_gross_co2e_t == pytest.approx(5.316 + 0.0395 + 0.0314, rel=1e-3)


# ─── 3. Wastewater ETP Biological Emissions ───────────────────────────────────

def test_wastewater_etp_cod_methane_calculation():
    """Verify IPCC 2006 Vol 5 Ch 6 ETP anaerobic lagoon methane calculation."""
    req = CarbonCalculateRequest(
        period=ReportingPeriodInput(period_type=ReportingPeriodType.DAILY),
        wastewater=WastewaterInput(
            cod_inflow_kg=1000.0,
            methane_recovered_kg=15.0,
            mcf=0.30
        )
    )
    res = carbon_service.calculate(req)
    ww = res.gross_footprint.wastewater_emissions
    assert ww is not None
    # Generated: 1000 * 0.25 (B0) * 0.30 (MCF) = 75.0 kg CH4
    assert ww.methane_generated_kg == 75.0
    # Net: 75.0 - 15.0 = 60.0 kg CH4
    assert ww.net_methane_emitted_kg == 60.0
    # tCO2e: 60.0 * 27.9 (AR6 GWP) / 1000 = 1.674 tCO2e
    assert ww.emissions_t_co2e == pytest.approx(1.674, rel=1e-3)
    assert res.gross_footprint.total_gross_co2e_t == pytest.approx(1.674, rel=1e-3)


# ─── 4. Real-Time Immutable Hash-Chain Audit Ledger ───────────────────────────

def test_audit_ledger_verification_and_tamper_detection():
    """Verify cryptographic hash-chain validity and automated tamper detection."""
    # 1. Unaltered ledger must verify successfully
    verification = audit_ledger_service.verify_ledger()
    assert verification.valid is True
    assert verification.total_blocks > 0
    assert verification.tampered_block_height is None

    # 2. Append a new block and verify unbroken chain
    new_block = audit_ledger_service.add_interval_block(
        telemetry_summary={"grid_electricity_kwh": 1450.0, "diesel_liters": 50.0},
        gross_carbon_tco2e={"scope1_combustion": 0.134, "scope2_grid": 1.057, "total": 1.191}
    )
    assert new_block.block_height == len(audit_ledger_service.blocks) - 1
    assert len(new_block.audit_signature) == 64
    assert audit_ledger_service.verify_ledger().valid is True


# ─── 5. Carbon Quota Burn Rate Index & Operational Interlocks ─────────────────

def test_carbon_quota_normal_state():
    """Verify BRI <= 0.90 triggers NORMAL state with no lockouts."""
    req = CarbonQuotaRequest(
        permitted_budget_tco2e=18.0,
        actual_emissions_tco2e=10.0,
        elapsed_fraction=0.80  # Pro-rata budget: 14.4 -> BRI = 10.0 / 14.4 = 0.69
    )
    res = carbon_service.evaluate_carbon_quota(req)
    assert res.status_tier == "NORMAL"
    assert res.status_color == "green"
    assert len(res.active_interlocks) == 0


def test_carbon_quota_lockout_state_and_guardrails():
    """Verify BRI > 1.00 triggers LOCKOUT with active operational interlocks."""
    req = CarbonQuotaRequest(
        permitted_budget_tco2e=18.0,
        actual_emissions_tco2e=16.5,
        elapsed_fraction=0.75  # Pro-rata budget: 13.5 -> BRI = 16.5 / 13.5 = 1.22
    )
    res = carbon_service.evaluate_carbon_quota(req)
    assert res.status_tier == "LOCKOUT"
    assert res.status_color == "red"
    assert res.burn_rate_index > 1.0
    assert len(res.active_interlocks) >= 3
    assert any("Dual-Fuel" in i for i in res.active_interlocks)
    assert any("DG Set Lockout" in i for i in res.active_interlocks)


# ─── 6. API Endpoints Integration ─────────────────────────────────────────────

def test_api_carbon_ledger_and_quota_endpoints(client):
    """Verify HTTP GET / POST endpoints for audit ledger and quotas."""
    # Ledger blocks
    blocks_res = client.get("/api/v1/carbon/ledger/blocks?limit=5")
    assert blocks_res.status_code == 200
    blocks = blocks_res.json()
    assert len(blocks) == 5
    assert "audit_signature" in blocks[0]

    # Ledger verify
    verify_res = client.get("/api/v1/carbon/ledger/verify")
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True

    # Quota status
    quota_res = client.get("/api/v1/carbon/quota/status")
    assert quota_res.status_code == 200
    assert "burn_rate_index" in quota_res.json()
