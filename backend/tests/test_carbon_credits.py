import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_get_carbon_credits_portfolio():
    """Verify portfolio summary and seeded credits under CCTS & Voluntary markets."""
    response = client.get("/api/v1/carbon/credits/portfolio")
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "credits" in data
    summary = data["summary"]
    assert summary["active_balance_tco2e"] > 0
    assert summary["active_equivalent_escerts"] > 0
    assert summary["generated_active_tco2e"] > 0
    assert summary["purchased_active_tco2e"] > 0
    assert len(data["credits"]) >= 4

def test_calculate_additionality_iso_14064():
    """Verify ISO 14064-2 Additionality Calculation: Credits = Baseline - Monitored - Leakage."""
    payload = {
        "intervention_id": "INT-AIR-01",
        "intervention_name": "Compressor Auto-Cutoff Interlock",
        "baseline_power_kw": 37.0,
        "monitored_power_kw": 22.0,
        "operating_hours_per_day": 16.0,
        "duration_days": 30.0,
        "grid_emission_factor_t_per_mwh": 0.716,
        "leakage_pct": 2.0,
        "regulatory_mandated": False,
        "hurdle_rate_met": True,
        "barrier_identified": True
    }
    response = client.post("/api/v1/carbon/credits/additionality", json=payload)
    assert response.status_code == 200
    res = response.json()
    # Baseline: 37 kW * 16 h * 30 d = 17,760 kWh -> 12.72 tCO2e
    # Monitored: 22 kW * 16 h * 30 d = 10,560 kWh -> 7.56 tCO2e
    # Gross: 12.72 - 7.56 = 5.16 tCO2e
    # Leakage 2%: 0.103 tCO2e
    # Net: ~5.05 tCO2e
    assert res["is_additional"] is True
    assert res["net_credits_earned_tco2e"] > 4.5
    assert res["equivalent_escerts"] > 0.5
    assert "additionality_checks" in res
    assert res["additionality_checks"]["regulatory_additionality"] is True
    assert res["additionality_checks"]["financial_additionality"] is True
    assert res["additionality_checks"]["barrier_additionality"] is True

def test_issue_credits_from_savings():
    """Verify minting verified credits from verified digital twin intervention."""
    payload = {
        "project_name": "Furnace Induction Peak Shifting",
        "quantity_tco2e": 6.85,
        "intervention_type": "ToD Peak Demand Management",
        "vintage": 2026
    }
    response = client.post("/api/v1/carbon/credits/issue", json=payload)
    assert response.status_code == 200
    credit = response.json()
    assert credit["status"] == "ACTIVE"
    assert credit["category"] == "GENERATED_ISSUED"
    assert "BEE-IN-CCTS-" in credit["serial_number"]
    assert credit["quantity_tco2e"] == 6.85
    assert credit["equivalent_escerts"] > 0

def test_retire_credit_permanently():
    """Verify permanent retirement/surrender of a credit with cryptographic audit."""
    # First get portfolio to find an active credit
    portfolio_res = client.get("/api/v1/carbon/credits/portfolio").json()
    active_credits = [c for c in portfolio_res["credits"] if c["status"] == "ACTIVE"]
    assert len(active_credits) > 0
    target_credit = active_credits[0]

    retire_payload = {
        "serial_number": target_credit["serial_number"],
        "reason": "Statutory Monthly Quota Exceedance Offsetting",
        "beneficiary": "PrecisionWorks Manufacturing Plant - Unit 1"
    }
    response = client.post("/api/v1/carbon/credits/retire", json=retire_payload)
    assert response.status_code == 200
    res = response.json()
    assert res["success"] is True
    assert "retirement_certificate" in res
    assert res["credit"]["status"] == "SURRENDERED_RETIRED"
    assert "Statutory Monthly Quota Exceedance Offsetting" in res["credit"]["retired_against"]
