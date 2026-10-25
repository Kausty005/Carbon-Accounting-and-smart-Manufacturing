import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_get_full_compliance_dossier():
    """Verify consolidated compliance filing dossier with integrity hash."""
    response = client.get("/api/v1/carbon/compliance/dossier")
    assert response.status_code == 200
    data = response.json()
    assert "dossier_id" in data
    assert "dossier_integrity_hash" in data
    assert "iso_14064_compliance_log" in data
    assert "ipmvp_mv_protocol" in data
    assert "sebi_brsr_disclosure" in data
    assert "eu_cbam_disclosure" in data
    assert "registry_filings" in data
    assert len(data["registry_filings"]) >= 4

def test_get_iso_14064_compliance_log():
    """Verify ISO 14064-1 & GHG Protocol Scope 1 & Scope 2 calculation transparency."""
    response = client.get("/api/v1/carbon/compliance/iso14064?year=2025-26")
    assert response.status_code == 200
    data = response.json()
    assert data["total_scope1_tco2e"] > 0
    assert data["total_scope2_tco2e"] > 0
    assert data["gross_inventory_tco2e"] == round(data["total_scope1_tco2e"] + data["total_scope2_tco2e"], 2)
    assert len(data["scope1_fuel_sources"]) >= 2
    assert len(data["scope2_grid_sources"]) >= 1
    # Check LPG details
    lpg = data["scope1_fuel_sources"][0]
    assert lpg["emission_factor_kg_co2_per_unit"] > 0
    assert lpg["uncertainty_pct"] > 0
    assert "metering_device_id" in lpg

def test_get_ipmvp_protocol():
    """Verify IPMVP Option B/C 14-day submeter verification plan and regression metrics."""
    response = client.get("/api/v1/carbon/compliance/ipmvp")
    assert response.status_code == 200
    data = response.json()
    assert data["selected_option"].startswith("Option B")
    assert data["duration_days"] == 14
    assert data["baseline_kwh"] > data["actual_monitored_kwh"]
    assert data["net_verified_savings_kwh"] > 0
    assert data["verified_avoided_carbon_tco2e"] > 0
    # Check statistical validity
    stats = data["statistical_validity"]
    assert stats["r_squared"] > 0.85
    assert stats["cv_rmse_pct"] < 15.0
    assert stats["t_statistic"] > 2.0
    assert stats["meets_ashrae_criteria"] is True

def test_get_sebi_brsr_disclosure():
    """Verify SEBI BRSR Core Principle 6 Environmental Disclosure metrics."""
    response = client.get("/api/v1/carbon/compliance/sebi-brsr")
    assert response.status_code == 200
    data = response.json()
    assert data["turnover_cr_inr"] > 0
    assert data["total_production_units"] > 0
    assert data["ghg_intensity_tco2e_per_cr_inr"] > 0
    assert data["ghg_intensity_kg_per_unit"] > 0
    assert "Reasonable Assurance" in data["assurance_type"]

def test_get_eu_cbam_disclosure():
    """Verify EU CBAM direct/indirect embedded emissions and per-part intensity."""
    response = client.get("/api/v1/carbon/compliance/eu-cbam")
    assert response.status_code == 200
    data = response.json()
    assert data["cn_code"].startswith("7326")
    assert data["direct_embedded_emissions_tco2e"] > 0
    assert data["indirect_embedded_emissions_tco2e"] > 0
    assert data["specific_carbon_intensity_kg_per_part"] > 0
    assert data["eu_registry_submission_ready"] is True

def test_registry_filings_lifecycle_and_submission():
    """Verify registry filing pipeline and submission of new PDD."""
    # List filings
    res = client.get("/api/v1/carbon/compliance/registry-filings")
    assert res.status_code == 200
    filings = res.json()
    assert len(filings) >= 4
    
    # Submit new filing
    new_filing_payload = {
        "project_name": "VFD Retrofit on Cooling Tower Fan",
        "offset_registry": "BEE_CCTS",
        "registry_full_name": "Indian Carbon Market (CCTS)",
        "abated_emissions_tco2e": 18.5,
        "vintage_year": 2026,
        "designated_operational_entity_doe": "TÜV Rheinland India"
    }
    post_res = client.post("/api/v1/carbon/compliance/registry-filings", json=new_filing_payload)
    assert post_res.status_code == 200
    created = post_res.json()
    assert created["abated_emissions_tco2e"] == 18.5
    assert created["lifecycle_stage"] == "1_PDD_DRAFT"
    assert created["equivalent_escerts"] > 0
