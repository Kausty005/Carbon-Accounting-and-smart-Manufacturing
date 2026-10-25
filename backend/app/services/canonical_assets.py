"""
WattWise AI — Canonical Asset Identity Registry & Legacy Alias Normalizer (Backend)

Provides a centralized single source of truth for the 4 core industrial machines:
- ASSET-COMP-01: Rotary Screw Air Compressor (ELGi EN 45)
- ASSET-CNC-01: Precision 5-Axis CNC Milling Center (DMG MORI NLX-2500)
- ASSET-FURN-01: High-Temperature Induction Furnace (Thermic IF-85)
- ASSET-CHIL-01: Industrial Process Water Chiller (Carrier AquaForce 30XW)

Plus distinct optional catalog archetype:
- ASSET-PNT-01: Automated Liquid Spray Paint Booth (PL-20)

Guarantees deterministic normalization, alias mapping, and rejection of unknown IDs.
"""

from typing import Dict, Any, List, Optional

CANONICAL_ASSETS: Dict[str, Dict[str, Any]] = {
    "ASSET-COMP-01": {
        "canonical_id": "ASSET-COMP-01",
        "name": "Air Compressor (ELGi EN 45)",
        "equipment_type": "compressor",
        "model": "ELGi EN 45 Screw Compressor",
        "bay": "Bay A-1 (Pneumatics)",
        "utility_cell_id": "utility_1",
        "utility_cell_name": "Compressed Air & Industrial Gas Systems",
        "rated_power_kw": 45.0,
        "nominal_operating_kw": 18.0,
        "expected_idle_kw": 8.0,
        "apparent_kva": 23.1,
        "power_factor": 0.78,
        "discharge_pressure_bar": 7.2,
        "taxonomies": {
            "ml_forecasting": "AIR_COMPRESSOR",
            "twin_archetype": "COMP-01",
            "equipment_registry_id": "AIR-COMP-01",
        },
        "primary_sensors": [
            {
                "sensor_id": "EM-102",
                "tag": "COMPRESSOR-FEEDER-METER",
                "instrument_type": "Class 0.5S Multi-Function Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
                "modbus_holding_register": 30001,
            },
            {
                "sensor_id": "SEN-COMP-ROT-01-PWR",
                "tag": "SEN-COMP-ROT-01-PWR",
                "instrument_type": "Feeder Active Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
            },
            {
                "sensor_id": "SEN-COMP-ROT-01-IDLE-PWR",
                "tag": "SEN-COMP-ROT-01-IDLE-PWR",
                "instrument_type": "Unloaded Idle Power Sensor",
                "measurement_type": "Idle Power",
                "unit": "kW",
            },
            {
                "sensor_id": "SEN-COMP-ROT-01-DIS-PRS",
                "tag": "SEN-COMP-ROT-01-DIS-PRS",
                "instrument_type": "Discharge Header Pressure Transmitter",
                "measurement_type": "Pressure",
                "unit": "bar",
            },
        ],
        "associated_projects": ["PRJ-COMP-2026-01"],
        "legacy_aliases": [
            "compressor",
            "COMP-01",
            "AIR-COMP-01",
            "COMP-ROT-01",
            "COMP-ROT-02",
            "MACHINE_011",
            "MACHINE_012",
            "MACHINE_013",
            "MACHINE_017",
            "AIR_COMPRESSOR",
            "ASSET-COMP-01",
        ],
        "simulation_capabilities": {
            "can_simulate": True,
            "archetype": "COMP-01",
            "constraints": {
                "min_service_required": True,
                "idle_shutdown_requires_operator_approval": True,
                "min_pressure_bar": 6.5,
                "rated_pressure_bar": 7.5,
            },
        },
    },

    "ASSET-CNC-01": {
        "canonical_id": "ASSET-CNC-01",
        "name": "CNC Machining Center (NLX-2500)",
        "equipment_type": "cnc",
        "model": "DMG MORI NLX-2500 5-Axis",
        "bay": "Bay B-2 (Machining)",
        "utility_cell_id": "utility_4",
        "utility_cell_name": "Precision Machining & Forming",
        "rated_power_kw": 32.0,
        "nominal_operating_kw": 28.0,
        "expected_idle_kw": 3.0,
        "apparent_kva": 29.8,
        "power_factor": 0.94,
        "sec_kwh_per_unit": 1.8,
        "taxonomies": {
            "ml_forecasting": "CNC_MILL",
            "twin_archetype": "CNC-01",
            "equipment_registry_id": "CNC-01",
        },
        "primary_sensors": [
            {
                "sensor_id": "EM-101",
                "tag": "SUBSTATION-MAIN-METER",
                "instrument_type": "Class 0.5S Multi-Function Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
                "modbus_holding_register": 30002,
            },
            {
                "sensor_id": "SEN-CNC-5AX-01-PWR",
                "tag": "SEN-CNC-5AX-01-PWR",
                "instrument_type": "Total Machine Active Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
            },
            {
                "sensor_id": "SEN-CNC-5AX-01-SPD-PWR",
                "tag": "SEN-CNC-5AX-01-SPD-PWR",
                "instrument_type": "Spindle Drive Power Sub-Meter",
                "measurement_type": "Spindle Power",
                "unit": "kW",
            },
        ],
        "associated_projects": ["Precision Machining Shift Target (1200 parts/shift)"],
        "legacy_aliases": [
            "cnc",
            "CNC-01",
            "CNC-5AX-01",
            "CNC-VMC-01",
            "MACHINE_008",
            "MACHINE_010",
            "MACHINE_034",
            "MACHINE_038",
            "CNC_MILL",
            "ASSET-CNC-01",
        ],
        "simulation_capabilities": {
            "can_simulate": True,
            "archetype": "CNC-01",
            "constraints": {
                "production_target_required": True,
                "min_daily_production_units": 140,
                "max_continuous_run_hours": 8,
            },
        },
    },

    "ASSET-FURN-01": {
        "canonical_id": "ASSET-FURN-01",
        "name": "Industrial Heat Furnace (Thermic IF-85)",
        "equipment_type": "furnace",
        "model": "Thermic Intl IF-85 (840°C)",
        "bay": "Bay C-1 (Thermal)",
        "utility_cell_id": "utility_2",
        "utility_cell_name": "Thermal Systems & Industrial Steam",
        "rated_power_kw": 85.0,
        "nominal_operating_kw": 85.0,
        "expected_idle_kw": 15.0,
        "apparent_kva": 96.6,
        "power_factor": 0.88,
        "temp_c": 840,
        "taxonomies": {
            "ml_forecasting": "OVEN_FURNACE",
            "twin_archetype": "FURN-01",
            "equipment_registry_id": "FURNACE-01",
        },
        "primary_sensors": [
            {
                "sensor_id": "FM-201",
                "tag": "FURNACE-FUEL-CORIOLIS",
                "instrument_type": "Dual U-Tube Coriolis Mass Flow Meter",
                "measurement_type": "Fuel Mass Flow",
                "unit": "kg/h",
                "modbus_holding_register": 30003,
            },
            {
                "sensor_id": "GA-301",
                "tag": "STACK-NDIR-CEMS",
                "instrument_type": "Continuous Flue Gas NDIR Analyzer",
                "measurement_type": "Emissions Concentration",
                "unit": "ppm",
                "modbus_holding_register": 30004,
            },
            {
                "sensor_id": "SEN-FURN-IND-01-PWR",
                "tag": "SEN-FURN-IND-01-PWR",
                "instrument_type": "Induction Coil Electrical Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
            },
        ],
        "associated_projects": ["PRJ-FURNACE-2026-08"],
        "legacy_aliases": [
            "furnace",
            "FURN-01",
            "FURNACE-01",
            "FURN-IND-01",
            "MACHINE_004",
            "MACHINE_015",
            "MACHINE_031",
            "OVEN_FURNACE",
            "ASSET-FURN-01",
        ],
        "simulation_capabilities": {
            "can_simulate": True,
            "archetype": "FURN-01",
            "constraints": {
                "protected_process_block": True,
                "min_continuous_cycle_hours": 4,
                "cannot_interrupt_holding_cycle": True,
            },
        },
    },

    "ASSET-CHIL-01": {
        "canonical_id": "ASSET-CHIL-01",
        "name": "Industrial Process Water Chiller (Carrier AquaForce 30XW)",
        "equipment_type": "chiller",
        "model": "Carrier AquaForce 30XW",
        "bay": "Bay D-3 (Hydronics)",
        "utility_cell_id": "utility_5",
        "utility_cell_name": "Chilled Water, HVAC & Environment",
        "rated_power_kw": 28.0,
        "nominal_operating_kw": 22.0,
        "expected_idle_kw": 4.0,
        "apparent_kva": 23.9,
        "power_factor": 0.92,
        "cop": 4.1,
        "taxonomies": {
            "ml_forecasting": "PUMP",
            "twin_archetype": "CHIL-01",
            "equipment_registry_id": "CHILLER-01",
        },
        "primary_sensors": [
            {
                "sensor_id": "WQ-401",
                "tag": "EFFLUENT-OPTICAL-COD",
                "instrument_type": "UV-Vis Submersible COD / TSS Spectrometer",
                "measurement_type": "Water Quality",
                "unit": "mg/L COD",
                "modbus_holding_register": 30005,
            },
            {
                "sensor_id": "SEN-CHIL-CENT-01-PWR",
                "tag": "SEN-CHIL-CENT-01-PWR",
                "instrument_type": "Compressor Feeder Power Meter",
                "measurement_type": "Active Power",
                "unit": "kW",
            },
            {
                "sensor_id": "SEN-CHIL-CENT-01-COP",
                "tag": "SEN-CHIL-CENT-01-COP",
                "instrument_type": "Real-Time Coefficient of Performance Meter",
                "measurement_type": "COP",
                "unit": "ratio",
            },
        ],
        "associated_projects": ["Process Cooling Loop Header Monitoring"],
        "legacy_aliases": [
            "cooling",
            "CHILLER-01",
            "CHIL-CENT-01",
            "CHIL-WTR-01",
            "COOL-01",
            "CHIL-01",
            "COOLING",
            "MACHINE_023",
            "MACHINE_024",
            "ASSET-CHIL-01",
        ],
        "simulation_capabilities": {
            "can_simulate": True,
            "archetype": "CHIL-01",
            "constraints": {
                "min_chw_supply_temp_c": 6.0,
                "max_chw_supply_temp_c": 12.0,
                "min_cop": 3.5,
                "min_flow_required": True,
            },
        },
    },
}

OPTIONAL_PAINT_ARCHETYPE: Dict[str, Any] = {
    "canonical_id": "ASSET-PNT-01",
    "name": "Automated Liquid Spray Paint Booth (PL-20)",
    "equipment_type": "painting",
    "model": "SprayTech PL-20 Industrial Booth",
    "bay": "Bay E-2 (Finishing)",
    "utility_cell_id": "utility_6",
    "utility_cell_name": "Chemical Processing, Paint & Waste Treatment",
    "rated_power_kw": 20.0,
    "nominal_operating_kw": 18.0,
    "expected_idle_kw": 5.0,
    "apparent_kva": 21.0,
    "power_factor": 0.90,
    "taxonomies": {
        "ml_forecasting": "PUMP",
        "twin_archetype": "PAINT-01",
        "equipment_registry_id": "BOOT-PNT-01",
    },
    "legacy_aliases": ["PAINT-01", "BOOT-PNT-01", "PNT-LINE-01", "painting", "ASSET-PNT-01"],
    "simulation_capabilities": {
        "can_simulate": True,
        "archetype": "PAINT-01",
        "constraints": {
            "ventilation_mandatory_during_paint": True,
            "voc_compliance_active": True,
        },
    },
}


def normalize_to_canonical_asset_id(raw_id: Optional[str]) -> Optional[str]:
    """
    Normalizes any legacy string, alias, catalog ID, or sensor reference
    into the canonical asset ID ('ASSET-COMP-01', 'ASSET-CNC-01', 'ASSET-FURN-01', 'ASSET-CHIL-01').
    Returns None if unknown.
    """
    if not raw_id:
        return None
    trimmed = raw_id.strip()
    if trimmed in CANONICAL_ASSETS:
        return trimmed

    lower = trimmed.lower()
    upper = trimmed.upper()

    for canon_id, asset in CANONICAL_ASSETS.items():
        for alias in asset.get("legacy_aliases", []):
            if alias.lower() == lower or alias.upper() == upper:
                return canon_id

    # Check optional painting line archetype
    if any(alias.lower() == lower or alias.upper() == upper for alias in OPTIONAL_PAINT_ARCHETYPE["legacy_aliases"]):
        return OPTIONAL_PAINT_ARCHETYPE["canonical_id"]

    return None


def get_canonical_asset_or_throw(raw_id: str) -> Dict[str, Any]:
    """
    Strict resolution: returns canonical asset dict or raises ValueError.
    """
    canon_id = normalize_to_canonical_asset_id(raw_id)
    if not canon_id:
        valid_ids = list(CANONICAL_ASSETS.keys())
        raise ValueError(
            f"Unknown machine identifier '{raw_id}'. Valid canonical IDs: {valid_ids}."
        )
    if canon_id in CANONICAL_ASSETS:
        return CANONICAL_ASSETS[canon_id]
    if canon_id == OPTIONAL_PAINT_ARCHETYPE["canonical_id"]:
        return OPTIONAL_PAINT_ARCHETYPE
    raise ValueError(f"Asset ID '{canon_id}' resolved but definition missing.")


def resolve_legacy_twin_archetype(raw_id: str) -> str:
    """
    Resolves legacy twin archetype ('COMP-01', 'CNC-01', 'FURN-01', 'CHIL-01', 'PAINT-01').
    Decouples chillers strictly to 'CHIL-01' and painting lines strictly to 'PAINT-01'.
    """
    canon_id = normalize_to_canonical_asset_id(raw_id)
    if canon_id and canon_id in CANONICAL_ASSETS:
        return CANONICAL_ASSETS[canon_id]["taxonomies"]["twin_archetype"]
    if canon_id == "ASSET-PNT-01":
        return "PAINT-01"

    upper = (raw_id or "").upper().strip()
    if any(k in upper for k in ["PNT", "PAINT", "BOOT"]):
        return "PAINT-01"
    if any(k in upper for k in ["CHIL", "COOL"]):
        return "CHIL-01"
    if any(k in upper for k in ["FURN", "OVEN", "BLR"]):
        return "FURN-01"
    if any(k in upper for k in ["CNC", "MILL", "MCH"]):
        return "CNC-01"
    return "COMP-01"


def get_all_canonical_assets() -> Dict[str, Dict[str, Any]]:
    """Returns all 4 canonical assets."""
    return CANONICAL_ASSETS
