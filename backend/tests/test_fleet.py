"""
WattWise AI — Fleet Scalability & Asset Catalog Test Suite
Tests for:
1. Fleet asset inventory retrieval (50 assets).
2. Category, status, twin eligibility filtering and search.
3. Fleet overview KPI calculations and 24h demand trend.
4. AI analytics & capability coverage matrix (4 Digital Twin vs 50 Fleet).
5. Attention queue ranking and recommended actions.
6. Scalable fleet execution orchestration endpoint (wall-clock measured runtime).
"""

import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)


def test_fleet_assets_count_and_schema():
    """Verify that fleet assets endpoint returns exactly 50 configured machines with enriched metadata."""
    res = client.get("/api/v1/fleet/assets")
    assert res.status_code == 200
    data = res.json()

    assert data["total_configured"] == 50
    assert data["total_returned"] == 50
    assert data["digital_twin_supported_count"] == 4
    assert data["data_mode"] == "Simulated Demonstration Data"

    assets = data["assets"]
    assert len(assets) == 50

    sample = assets[0]
    required_keys = [
        "id", "name", "cell", "cellId", "energyVector",
        "ratedPowerKw", "nominalLoadKw", "standbyDrawKw",
        "currentPowerKw", "energy24hKwh", "operationalStatus",
        "anomalyStatus", "forecastAvailable", "digitalTwinEligible",
        "modbusRegisters", "safetyConstraints"
    ]
    for key in required_keys:
        assert key in sample, f"Missing key '{key}' in asset record"


def test_fleet_digital_twin_filtering():
    """Verify that filtering for digital twin eligible machines returns exactly the 4 supported physics models."""
    res = client.get("/api/v1/fleet/assets?twin_only=true")
    assert res.status_code == 200
    data = res.json()

    assert data["total_returned"] == 4
    twin_ids = {a["digitalTwinMachineId"] for a in data["assets"]}
    assert twin_ids == {"COMP-01", "CNC-01", "FURN-01", "PAINT-01"}


def test_fleet_search_and_cell_filtering():
    """Verify search by ID/name and cell filtering."""
    # Search for compressor
    res_search = client.get("/api/v1/fleet/assets?search=compressor")
    assert res_search.status_code == 200
    search_assets = res_search.json()["assets"]
    assert len(search_assets) >= 3
    for a in search_assets:
        assert "compressor" in a["name"].lower() or "compressor" in a["description"].lower() or "comp" in a["id"].lower()

    # Filter by cell utility_1 (Compressed air)
    res_cell = client.get("/api/v1/fleet/assets?cell=utility_1")
    assert res_cell.status_code == 200
    assert len(res_cell.json()["assets"]) == 8


def test_fleet_overview_kpis_and_aggregates():
    """Verify fleet overview aggregates, categories, top consumers, and demand trend."""
    res = client.get("/api/v1/fleet/overview")
    assert res.status_code == 200
    data = res.json()

    kpis = data["kpis"]
    assert kpis["total_configured_assets"] == 50
    assert kpis["reporting_assets"] == 50
    assert kpis["digital_twin_coverage_count"] == 4
    assert kpis["digital_twin_coverage_pct"] == 8.0
    assert kpis["aggregate_instantaneous_demand_kw"] > 500.0
    assert kpis["aggregate_energy_consumption_24h_kwh"] > 5000.0
    assert kpis["grid_emission_factor_kg_per_kwh"] > 0.0

    # Verify category breakdown (6 utility cells)
    breakdown = data["category_breakdown"]
    assert len(breakdown) == 6
    total_pct = sum(c["pct_of_fleet_energy"] for c in breakdown)
    assert 99.0 <= total_pct <= 101.0  # Sums to ~100%

    # Verify top energy consumers
    top_consumers = data["top_energy_consumers"]
    assert len(top_consumers) == 5
    # Verify descending sort
    for i in range(len(top_consumers) - 1):
        assert top_consumers[i]["energy_24h_kwh"] >= top_consumers[i + 1]["energy_24h_kwh"]

    # Verify 24-hour demand trend
    trend = data["historical_demand_trend"]
    assert len(trend) == 24
    assert all("demand_kw" in pt and "hour" in pt for pt in trend)


def test_fleet_coverage_matrix():
    """Verify capability matrix accurately depicts fleet vs twin coverage."""
    res = client.get("/api/v1/fleet/coverage")
    assert res.status_code == 200
    data = res.json()

    assert data["fleet_size"] == 50
    caps = {c["id"]: c for c in data["capabilities"]}

    # Monitoring, Anomaly, Forecasting, Carbon, Optimization must cover all 50
    assert caps["monitoring"]["eligible_assets"] == 50
    assert caps["monitoring"]["coverage_pct"] == 100.0
    assert caps["anomaly"]["eligible_assets"] == 50
    assert caps["forecasting"]["eligible_assets"] == 50
    assert caps["carbon"]["eligible_assets"] == 50
    assert caps["optimization"]["eligible_assets"] == 50

    # Digital twin MUST explicitly show 4 assets (8.0%)
    twin_cap = caps["digital_twin"]
    assert twin_cap["eligible_assets"] == 4
    assert twin_cap["processed_assets"] == 4
    assert twin_cap["coverage_pct"] == 8.0
    assert "4 Core Physics Twins" in twin_cap["status"]


def test_fleet_attention_queue():
    """Verify ranked attention queue and digital twin links."""
    res = client.get("/api/v1/fleet/attention-queue")
    assert res.status_code == 200
    data = res.json()

    assert data["queue_count"] >= 4
    queue = data["queue"]

    # Compressor must link to COMP-01
    comp_item = next(q for q in queue if "COMP" in q["asset_id"])
    assert comp_item["digital_twin_supported"] is True
    assert comp_item["digital_twin_machine_id"] == "COMP-01"
    assert comp_item["action_type"] == "open_digital_twin"

    # Non-twin asset (e.g. BOIL-FO-01) must NOT link to fake twin
    boil_item = next(q for q in queue if "BOIL" in q["asset_id"])
    assert boil_item["digital_twin_supported"] is False
    assert boil_item["digital_twin_machine_id"] is None
    assert boil_item["action_type"] == "open_diagnostics"


def test_run_fleet_analytics_full():
    """Verify POST /api/v1/fleet/run-analytics runs across all 50 assets with real wall-clock timing."""
    res = client.post("/api/v1/fleet/run-analytics", json={})
    assert res.status_code == 200
    data = res.json()

    assert data["total_selected"] == 50
    assert data["processed_count"] == 50
    assert data["failed_count"] == 0
    assert data["skipped_count"] == 0
    assert data["duration_ms"] > 0.0
    assert data["execution_id"].startswith("FLEET-RUN-")
    assert data["anomalies_detected_count"] >= 4
    assert len(data["insights_summary"]) >= 3
    assert len(data["asset_results"]) == 50


def test_run_fleet_analytics_filtered_subset():
    """Verify POST /api/v1/fleet/run-analytics can process a targeted subset of assets."""
    target_ids = ["COMP-ROT-01", "CNC-VMC-01", "BOIL-PNG-01"]
    res = client.post("/api/v1/fleet/run-analytics", json={"asset_ids": target_ids})
    assert res.status_code == 200
    data = res.json()

    assert data["total_selected"] == 3
    assert data["processed_count"] == 3
    assert len(data["asset_results"]) == 3
    returned_ids = [r["asset_id"] for r in data["asset_results"]]
    assert set(returned_ids) == set(target_ids)
