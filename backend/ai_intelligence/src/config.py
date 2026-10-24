"""
Central Configuration for Industrial AI Energy Intelligence.
Explicitly documents emission factors, tariffs, units, sources, and integration rules.
"""

from typing import Dict, Any

# ==============================================================================
# FINANCIAL & CARBON ACCOUNTING CONSTANTS
# ==============================================================================

# Central Electricity Authority of India (CEA) CO2 Baseline Database v18 (Table 1 - National Grid)
GRID_EMISSION_FACTOR_KG_PER_KWH: float = 0.82
GRID_EMISSION_FACTOR_UNIT: str = "kg CO2e / kWh"
GRID_EMISSION_FACTOR_SOURCE: str = "CEA India CO2 Baseline Database v18 (2023), User Guide Table 1"

# Industrial Electricity Tariff (PrecisionWorks Manufacturing baseline commercial agreement)
INDUSTRIAL_TARIFF_INR_PER_KWH: float = 8.00
INDUSTRIAL_TARIFF_UNIT: str = "INR / kWh"
INDUSTRIAL_TARIFF_SOURCE: str = "PrecisionWorks Manufacturing SCADA Baseline Contract (mockData.ts)"

# ==============================================================================
# TELEMETRY & ENERGY INTEGRATION RULES
# ==============================================================================

# Nominal telemetry interval (1 minute = 1/60 hr)
DEFAULT_SAMPLING_INTERVAL_HOURS: float = 1.0 / 60.0

# Maximum valid interval between telemetry points for trapezoidal/step energy integration.
# Telemetry gaps exceeding 15 minutes (0.25 hr) are capped to prevent unmetered phantom energy integration.
MAX_INTEGRATION_GAP_HOURS: float = 0.25

# ==============================================================================
# CONDITION-AWARE BASELINE THRESHOLDS
# ==============================================================================

# Energy anomaly thresholds
ENERGY_Z_SCORE_THRESHOLD: float = 2.5       # Statistical power deviation threshold
ENERGY_PCT_DEVIATION_THRESHOLD: float = 20.0 # Percentage power deviation threshold
PERSISTENT_EXCESS_STEPS_THRESHOLD: int = 3   # Consecutive 1-minute steps for persistent alert

# Disclaimer label for reports and API outputs
ESTIMATE_DISCLAIMER: str = (
    "Note: Avoidable excess energy, cost savings, and Scope 2 carbon footprint reductions are "
    "model estimates based on operating-condition power baselines and configured CEA India grid emission factors. "
    "Scope 1 direct fossil fuel emissions are excluded as this telemetry stream meters electrical power only."
)


def get_config_dict() -> Dict[str, Any]:
    """Return dictionary representation of the active configuration."""
    return {
        "grid_emission_factor": {
            "value": GRID_EMISSION_FACTOR_KG_PER_KWH,
            "unit": GRID_EMISSION_FACTOR_UNIT,
            "source": GRID_EMISSION_FACTOR_SOURCE,
        },
        "electricity_tariff": {
            "value": INDUSTRIAL_TARIFF_INR_PER_KWH,
            "unit": INDUSTRIAL_TARIFF_UNIT,
            "source": INDUSTRIAL_TARIFF_SOURCE,
        },
        "integration_rules": {
            "default_sampling_interval_hours": DEFAULT_SAMPLING_INTERVAL_HOURS,
            "max_integration_gap_hours": MAX_INTEGRATION_GAP_HOURS,
        },
        "energy_thresholds": {
            "z_score_threshold": ENERGY_Z_SCORE_THRESHOLD,
            "pct_deviation_threshold": ENERGY_PCT_DEVIATION_THRESHOLD,
            "persistent_steps_threshold": PERSISTENT_EXCESS_STEPS_THRESHOLD,
        },
        "disclaimer": ESTIMATE_DISCLAIMER,
    }
