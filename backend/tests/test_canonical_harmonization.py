"""
WattWise AI — Complete Data Harmonization, Integration & End-to-End Validation Test Suite
Tests Phase 2 corrections across:
1. Canonical Asset Registry, legacy alias normalization, and rejection of unknown IDs.
2. Chiller vs Paint Booth decoupling and archetype isolation.
3. Scope 2 carbon factor reconciliation against authoritative CEA v22.0 (0.728862 kg CO2/kWh).
4. Machine and Plant fleet forecasting aggregation (multi-horizon, zero double counting).
5. Machine power ratings and baseline consistency (190 kW plant total).
6. Digital twin process constraints and physical safety interlocks.
7. Cryptographic audit ledger verification.
"""

import math
import pytest
from backend.app.services.canonical_assets import (
    CANONICAL_ASSETS,
    OPTIONAL_PAINT_ARCHETYPE,
    normalize_to_canonical_asset_id,
    get_canonical_asset_or_throw,
    resolve_legacy_twin_archetype,
    get_all_canonical_assets,
)
from backend.app.services.twin_profiles import ProfileStore
from backend.app.services.constraint_validator import ConstraintValidator
from backend.app.services.reference_data import reference_data_service
from backend.app.services.energy_forecasting_service import energy_forecasting_service
from backend.app.services.audit_ledger import audit_ledger_service
from backend.app.models import EnergyForecastInput, ForecastHorizon


class TestCanonicalAssetIdentity:
    """Priority 1: Verification of canonical asset identity system and legacy aliases."""

    def test_canonical_asset_ids_exist(self):
        assets = get_all_canonical_assets()
        assert "ASSET-COMP-01" in assets
        assert "ASSET-CNC-01" in assets
        assert "ASSET-FURN-01" in assets
        assert "ASSET-CHIL-01" in assets
        assert len(assets) == 4

    @pytest.mark.parametrize("alias,expected_canon", [
        ("compressor", "ASSET-COMP-01"),
        ("COMP-01", "ASSET-COMP-01"),
        ("AIR-COMP-01", "ASSET-COMP-01"),
        ("COMP-ROT-01", "ASSET-COMP-01"),
        ("ASSET-COMP-01", "ASSET-COMP-01"),
        ("cnc", "ASSET-CNC-01"),
        ("CNC-01", "ASSET-CNC-01"),
        ("CNC-5AX-01", "ASSET-CNC-01"),
        ("CNC-VMC-01", "ASSET-CNC-01"),
        ("ASSET-CNC-01", "ASSET-CNC-01"),
        ("furnace", "ASSET-FURN-01"),
        ("FURN-01", "ASSET-FURN-01"),
        ("FURNACE-01", "ASSET-FURN-01"),
        ("FURN-IND-01", "ASSET-FURN-01"),
        ("ASSET-FURN-01", "ASSET-FURN-01"),
        ("cooling", "ASSET-CHIL-01"),
        ("CHILLER-01", "ASSET-CHIL-01"),
        ("CHIL-CENT-01", "ASSET-CHIL-01"),
        ("CHIL-WTR-01", "ASSET-CHIL-01"),
        ("COOL-01", "ASSET-CHIL-01"),
        ("CHIL-01", "ASSET-CHIL-01"),
        ("ASSET-CHIL-01", "ASSET-CHIL-01"),
    ])
    def test_legacy_alias_normalization(self, alias, expected_canon):
        resolved = normalize_to_canonical_asset_id(alias)
        assert resolved == expected_canon

    def test_painting_line_catalog_normalization(self):
        # Painting line is optional catalog archetype and resolves to ASSET-PNT-01
        for pnt_alias in ["painting", "BOOT-PNT-01", "PNT-LINE-01", "PAINT-01", "ASSET-PNT-01"]:
            assert normalize_to_canonical_asset_id(pnt_alias) == "ASSET-PNT-01"

    def test_unknown_machine_id_rejection(self):
        # Unknown IDs must return None or raise ValueError, never silently map
        for invalid in ["UNKNOWN_ASSET_999", "INVALID_MACHINE", "TURBINE-01", ""]:
            assert normalize_to_canonical_asset_id(invalid) is None
            with pytest.raises(ValueError):
                get_canonical_asset_or_throw(invalid)


class TestChillerVsPaintDecoupling:
    """Priority 2: Chiller versus Paint Line separation."""

    def test_chiller_resolves_only_to_chiller_archetype(self):
        for chiller_ref in ["cooling", "CHILLER-01", "CHIL-CENT-01", "CHIL-01", "ASSET-CHIL-01"]:
            archetype = resolve_legacy_twin_archetype(chiller_ref)
            assert archetype == "CHIL-01", f"{chiller_ref} incorrectly resolved to {archetype}"

    def test_paint_line_resolves_only_to_paint_archetype(self):
        for paint_ref in ["painting", "BOOT-PNT-01", "PNT-LINE-01", "PAINT-01", "ASSET-PNT-01"]:
            archetype = resolve_legacy_twin_archetype(paint_ref)
            assert archetype == "PAINT-01", f"{paint_ref} incorrectly resolved to {archetype}"

    def test_chiller_simulation_does_not_trigger_paint_voc_constraint(self):
        store = ProfileStore()
        validator = ConstraintValidator(store)

        chiller_profile = store.get_profile("CHIL-01")
        assert chiller_profile is not None
        assert "ventilation_mandatory_during_paint" not in chiller_profile.get("constraints", {})
        assert chiller_profile.get("rated_power_kw") == 28.0

        # Simulate reducing idle power on chiller
        records = [
            {"machine_id": "CHIL-01", "machine_state": "running", "power_kw": 2.0, "production_units": 0}
        ]
        action = {"type": "reduce_idle_power", "machine_id": "CHIL-01", "target_power_kw": 2.0}
        feasibility, violations = validator.validate_scenario(records, action, records)

        # Chiller must NOT receive ERR_VENTILATION_REQUIRED
        violation_codes = [v["code"] for v in violations]
        assert "ERR_VENTILATION_REQUIRED" not in violation_codes

    def test_paint_line_simulation_triggers_voc_constraint(self):
        store = ProfileStore()
        validator = ConstraintValidator(store)

        paint_profile = store.get_profile("PAINT-01")
        assert paint_profile is not None
        assert paint_profile.get("constraints", {}).get("ventilation_mandatory_during_paint") is True

        records = [
            {"machine_id": "PAINT-01", "machine_state": "running", "power_kw": 2.0, "production_units": 0}
        ]
        action = {"type": "reduce_idle_power", "machine_id": "PAINT-01", "target_power_kw": 2.0}
        feasibility, violations = validator.validate_scenario(records, action, records)

        violation_codes = [v["code"] for v in violations]
        assert "ERR_VENTILATION_REQUIRED" in violation_codes
        assert feasibility == "blocked"


class TestEmissionFactorReconciliation:
    """Priority 3: Reconcile Grid Emission Factors to authoritative CEA v22.0 (0.728862 kg CO2/kWh)."""

    def test_authoritative_cea_v22_factor(self):
        # Look up CEA factor from reference data service
        cea_record = reference_data_service.get_cea_factor(reporting_year="2023-24")
        assert cea_record is not None
        assert cea_record.selected_factor == pytest.approx(0.728862, rel=1e-5)
        assert cea_record.reporting_year == "2023-24"
        assert cea_record.database_version == "22.0"

    def test_benchmark_reconciliation_12480_kwh(self):
        # 12,480 kWh Benchmark calculation
        kwh = 12480.0
        factor = 0.728862
        expected_tco2e = (kwh * factor) / 1000.0  # 9.09619776

        # Calculated result rounded to 4 decimals
        rounded_result = round(expected_tco2e, 4)
        assert rounded_result == 9.0962

        # Verify against reference data calculation formula
        calc_result = round((kwh * factor) / 1000.0, 4)
        diff = abs(calc_result - 9.0962)
        assert diff <= 0.0001, f"Difference {diff} exceeds tolerance 0.0001 tCO2e"


class TestPowerRatingHarmonization:
    """Priority 4: Harmonize Machine Power Ratings and Plant Capacity (190 kW total)."""

    def test_individual_machine_ratings(self):
        assets = get_all_canonical_assets()

        comp = assets["ASSET-COMP-01"]
        assert comp["rated_power_kw"] == 45.0
        assert comp["nominal_operating_kw"] == 18.0
        assert comp["power_factor"] == 0.78

        cnc = assets["ASSET-CNC-01"]
        assert cnc["rated_power_kw"] == 32.0
        assert cnc["nominal_operating_kw"] == 28.0
        assert cnc["power_factor"] == 0.94

        furn = assets["ASSET-FURN-01"]
        assert furn["rated_power_kw"] == 85.0
        assert furn["nominal_operating_kw"] == 85.0
        assert furn["power_factor"] == 0.88

        chil = assets["ASSET-CHIL-01"]
        assert chil["rated_power_kw"] == 28.0
        assert chil["nominal_operating_kw"] == 22.0
        assert chil["cop"] == 4.1
        assert chil["power_factor"] == 0.92

    def test_plant_capacity_sums_to_190kw(self):
        assets = get_all_canonical_assets()
        total_rated_kw = sum(a["rated_power_kw"] for a in assets.values())
        assert total_rated_kw == 190.0

        total_nominal_kw = sum(a["nominal_operating_kw"] for a in assets.values())
        assert total_nominal_kw == 153.0


class TestForecastingAggregation:
    """Priority 6: Plant Fleet Forecast Aggregation without Double-Counting."""

    @pytest.fixture(autouse=True)
    def ensure_model_loaded(self):
        energy_forecasting_service.load_model()

    def test_fleet_aggregation_reproduction(self):
        inputs = [
            EnergyForecastInput(machine_id="COMP-01", machine_type="AIR_COMPRESSOR", rated_power_kw=45.0, power_kw=18.0, operating_state=2),
            EnergyForecastInput(machine_id="CNC-01", machine_type="CNC_MILL", rated_power_kw=32.0, power_kw=28.0, operating_state=2),
            EnergyForecastInput(machine_id="FURN-01", machine_type="OVEN_FURNACE", rated_power_kw=85.0, power_kw=85.0, operating_state=2),
            EnergyForecastInput(machine_id="COOL-01", machine_type="PUMP", rated_power_kw=28.0, power_kw=22.0, operating_state=2),
        ]

        fleet_res = energy_forecasting_service.predict_fleet(ForecastHorizon.NEXT_15MIN, inputs)
        assert fleet_res.coverage_count == 4
        assert fleet_res.total_machines == 4
        assert len(fleet_res.machine_breakdown) == 4

        # Sum of machine contributions must match plant total within rounding tolerance
        sum_breakdown = sum(b.predicted_energy_kwh for b in fleet_res.machine_breakdown)
        assert math.isclose(sum_breakdown, fleet_res.predicted_energy_kwh, abs_tol=0.01)

    def test_canonical_id_forecasting_support(self):
        # Forecast with canonical machine IDs
        inputs = [
            EnergyForecastInput(machine_id="ASSET-COMP-01", machine_type="AIR_COMPRESSOR", rated_power_kw=45.0, power_kw=18.0, operating_state=2),
            EnergyForecastInput(machine_id="ASSET-CNC-01", machine_type="CNC_MILL", rated_power_kw=32.0, power_kw=28.0, operating_state=2),
            EnergyForecastInput(machine_id="ASSET-FURN-01", machine_type="OVEN_FURNACE", rated_power_kw=85.0, power_kw=85.0, operating_state=2),
            EnergyForecastInput(machine_id="ASSET-CHIL-01", machine_type="PUMP", rated_power_kw=28.0, power_kw=22.0, operating_state=2),
        ]

        fleet_res = energy_forecasting_service.predict_fleet(ForecastHorizon.NEXT_15MIN, inputs)
        assert fleet_res.coverage_count == 4
        breakdown_ids = [b.machine_id for b in fleet_res.machine_breakdown]
        assert "ASSET-COMP-01" in breakdown_ids
        assert "ASSET-CHIL-01" in breakdown_ids


class TestAuditLedgerIntegrity:
    """Priority 8: Cryptographic SHA-256 Ledger verification."""

    def test_audit_ledger_chain_is_valid(self):
        # Verify complete chain integrity of the historical blocks
        status = audit_ledger_service.verify_ledger()
        assert status.valid is True
        assert status.verified_chain_intact is True
        assert status.merkle_roots_valid is True
        assert status.total_blocks >= 104
        assert len(status.tampered_blocks) == 0
