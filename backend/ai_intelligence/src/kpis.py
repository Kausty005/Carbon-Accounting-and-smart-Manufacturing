"""
Energy KPIs & Carbon Accounting Analytics Module.
Calculates energy consumption, peak power, equipment & operating mode breakdowns,
estimated excess energy waste, financial impact, and Scope 2 carbon emissions.
Separates equipment-health counts from excess-energy anomaly counts.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from .config import (
    GRID_EMISSION_FACTOR_KG_PER_KWH,
    GRID_EMISSION_FACTOR_SOURCE,
    GRID_EMISSION_FACTOR_UNIT,
    INDUSTRIAL_TARIFF_INR_PER_KWH,
    INDUSTRIAL_TARIFF_UNIT,
    DEFAULT_SAMPLING_INTERVAL_HOURS,
    MAX_INTEGRATION_GAP_HOURS,
    ESTIMATE_DISCLAIMER,
)


def calculate_energy_kpis(
    df: pd.DataFrame,
    grid_emission_factor: float = GRID_EMISSION_FACTOR_KG_PER_KWH,
    electricity_tariff_inr: float = INDUSTRIAL_TARIFF_INR_PER_KWH,
    max_gap_hours: float = MAX_INTEGRATION_GAP_HOURS,
) -> Dict[str, Any]:
    """
    Calculate plant-wide and asset-level energy KPIs from sensor readings.
    Uses actual timestamp differences per equipment for rigorous interval integration.
    """
    data = df.copy()
    if "timestamp" in data.columns:
        data["timestamp"] = pd.to_datetime(data["timestamp"])
        data = data.sort_values(by=["equipment_id", "timestamp"]).reset_index(drop=True)
        # Compute exact elapsed hours between consecutive readings per equipment
        elapsed_hours = (
            data.groupby("equipment_id")["timestamp"].diff().dt.total_seconds() / 3600.0
        ).fillna(DEFAULT_SAMPLING_INTERVAL_HOURS)
        # Clamp gaps > max_gap_hours to avoid integrating across shutdown periods
        data["elapsed_hours"] = elapsed_hours.clip(lower=0.0, upper=max_gap_hours)
    else:
        data["elapsed_hours"] = DEFAULT_SAMPLING_INTERVAL_HOURS

    # Measured interval energy in kWh = Power (kW) * Hours
    data["interval_energy_kwh"] = data["power_consumption_kw"].fillna(0.0) * data["elapsed_hours"]

    total_energy_kwh = float(data["interval_energy_kwh"].sum())
    valid_power = data["power_consumption_kw"].dropna()
    avg_power_kw = float(valid_power.mean()) if len(valid_power) > 0 else 0.0
    peak_power_kw = float(valid_power.max()) if len(valid_power) > 0 else 0.0
    min_power_kw = float(valid_power.min()) if len(valid_power) > 0 else 0.0

    # Reading counts
    total_readings = len(data)
    
    # 1. Equipment Health Anomalies (Vibration, Thermal, Sensor, Pressure)
    health_col = "is_anomaly" if "is_anomaly" in data.columns else None
    health_anom_count = int(data[health_col].sum()) if health_col else 0
    health_rate_pct = round((health_anom_count / total_readings) * 100.0, 2) if total_readings > 0 else 0.0

    # 2. Excess Energy Anomalies (Power Significantly Exceeding Expected Baseline)
    energy_anom_col = "is_energy_anomaly" if "is_energy_anomaly" in data.columns else None
    energy_anom_count = int(data[energy_anom_col].sum()) if energy_anom_col else 0
    energy_anom_rate_pct = round((energy_anom_count / total_readings) * 100.0, 2) if total_readings > 0 else 0.0

    # Excess energy totals
    total_excess_kwh = (
        float(data["estimated_excess_energy_kwh"].sum())
        if "estimated_excess_energy_kwh" in data.columns
        else 0.0
    )
    total_excess_cost_inr = total_excess_kwh * electricity_tariff_inr

    # Equipment-wise breakdown
    equipment_summary = {}
    for eq, grp in data.groupby("equipment_id"):
        eq_energy = float(grp["interval_energy_kwh"].sum())
        eq_health_anoms = int(grp[health_col].sum()) if health_col and health_col in grp.columns else 0
        eq_energy_anoms = int(grp[energy_anom_col].sum()) if energy_anom_col and energy_anom_col in grp.columns else 0
        eq_excess = float(grp["estimated_excess_energy_kwh"].sum()) if "estimated_excess_energy_kwh" in grp.columns else 0.0
        equipment_summary[str(eq)] = {
            "total_energy_kwh": round(eq_energy, 2),
            "energy_share_pct": round((eq_energy / total_energy_kwh) * 100.0, 2) if total_energy_kwh > 0 else 0.0,
            "avg_power_kw": round(float(grp["power_consumption_kw"].mean()), 2),
            "peak_power_kw": round(float(grp["power_consumption_kw"].max()), 2),
            "total_readings": len(grp),
            "equipment_health_anomalies": eq_health_anoms,
            "health_anomaly_rate_pct": round((eq_health_anoms / len(grp)) * 100.0, 2),
            "energy_excess_anomalies": eq_energy_anoms,
            "estimated_excess_energy_kwh": round(eq_excess, 2),
            "estimated_excess_cost_inr": round(eq_excess * electricity_tariff_inr, 2),
        }

    # Operating-mode-wise breakdown
    mode_summary = {}
    for mode, grp in data.groupby("operating_mode"):
        mode_energy = float(grp["interval_energy_kwh"].sum())
        mode_summary[str(mode)] = {
            "total_energy_kwh": round(mode_energy, 2),
            "energy_share_pct": round((mode_energy / total_energy_kwh) * 100.0, 2) if total_energy_kwh > 0 else 0.0,
            "avg_power_kw": round(float(grp["power_consumption_kw"].mean()), 2),
            "reading_count": len(grp),
        }

    # Carbon emissions calculation (Scope 2 location-based)
    total_scope2_co2_kg = total_energy_kwh * grid_emission_factor
    excess_scope2_co2_kg = total_excess_kwh * grid_emission_factor

    # Highest priority equipment for inspection (ranked by equipment health anomalies and excess energy waste)
    priority_ranking = sorted(
        equipment_summary.keys(),
        key=lambda k: (
            equipment_summary[k]["equipment_health_anomalies"],
            equipment_summary[k]["estimated_excess_energy_kwh"],
        ),
        reverse=True,
    )

    return {
        "plant_kpis": {
            "total_measured_energy_kwh": round(total_energy_kwh, 2),
            "average_power_kw": round(avg_power_kw, 2),
            "peak_power_kw": round(peak_power_kw, 2),
            "min_power_kw": round(min_power_kw, 2),
            "total_readings": total_readings,
            "equipment_health_anomalies": health_anom_count,
            "equipment_health_anomaly_rate_pct": health_rate_pct,
            "excess_energy_anomalies": energy_anom_count,
            "excess_energy_anomaly_rate_pct": energy_anom_rate_pct,
            "estimated_excess_energy_kwh": round(total_excess_kwh, 2),
            "estimated_excess_energy_cost_inr": round(total_excess_cost_inr, 2),
        },
        "carbon_accounting": {
            "scope_2_electricity_emissions_kg_co2e": round(total_scope2_co2_kg, 2),
            "scope_2_avoidable_excess_emissions_kg_co2e": round(excess_scope2_co2_kg, 2),
            "grid_emission_factor_used": f"{grid_emission_factor} {GRID_EMISSION_FACTOR_UNIT} ({GRID_EMISSION_FACTOR_SOURCE})",
            "electricity_tariff_used": f"INR {electricity_tariff_inr} / kWh",
            "scope_1_note": "Scope 1 direct emissions are excluded as this dataset tracks electrical metering only.",
            "disclaimer": ESTIMATE_DISCLAIMER,
        },
        "equipment_breakdown": equipment_summary,
        "operating_mode_breakdown": mode_summary,
        "highest_priority_equipment": priority_ranking,
    }
