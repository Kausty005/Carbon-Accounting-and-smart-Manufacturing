"""
Machine & Site Energy Optimization Summary Engine.

Aggregates incident intelligence across machines and manufacturing sites:
  - Incident episode counts and recurrence metrics (avoids double-counting repeated 15-min intervals).
  - Machine repeat offenders (persistent excess energy waste).
  - Breakdown by alert category and severity.
  - Sensor data-quality warnings that compromise model confidence.
  - Actionable inspection priorities checklist.
  - Financial (INR) and Carbon (Scope 2 CO2e) impacts grounded in CEA baseline.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from .config import GRID_EMISSION_FACTOR_KG_PER_KWH, INDUSTRIAL_TARIFF_INR_PER_KWH


class OptimizationSummaryEngine:
    """
    Computes site and machine level optimization summaries for industrial plant managers.
    """

    @classmethod
    def compute_summary(
        cls,
        incidents: List[Dict[str, Any]],
        site_id: Optional[str] = None,
        machine_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Produce a comprehensive machine/site optimization summary.
        """
        filtered = incidents
        if site_id:
            s_up = site_id.upper()
            filtered = [i for i in filtered if str(i.get("site_id", "SITE-01")).upper() == s_up]
        if machine_id:
            m_up = machine_id.upper()
            filtered = [
                i for i in filtered
                if str(i.get("machine_id", i.get("equipment_id", ""))).upper() == m_up
            ]

        total_incidents = len(filtered)

        # 1. Episode and recurrence calculation
        # Sum of recurrence_count across episodes
        total_intervals_flagged = sum(int(i.get("recurrence_count", 1)) for i in filtered)
        recurring_episodes = sum(1 for i in filtered if int(i.get("recurrence_count", 1)) > 1)

        # 2. Category & Severity breakdown
        categories: Dict[str, int] = {
            "forecast_residual_anomaly": 0,
            "energy_waste_event": 0,
            "sensor_pattern_anomaly": 0,
            "equipment_health_concern": 0,
            "sensor_data_quality_warning": 0,
            "other": 0,
        }
        severities: Dict[str, int] = {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "informational": 0,
        }

        for inc in filtered:
            cat = inc.get("alert_category") or ("energy_waste_event" if inc.get("is_energy_waste") else "sensor_pattern_anomaly")
            if cat in categories:
                categories[cat] += 1
            else:
                categories["other"] += 1

            sev = str(inc.get("severity", "medium")).lower()
            if sev in severities:
                severities[sev] += 1
            else:
                severities["medium"] += 1

        # 3. Machine repeat offenders analysis
        machine_stats: Dict[str, Dict[str, Any]] = {}
        for inc in filtered:
            mid = str(inc.get("machine_id", inc.get("equipment_id", "UNKNOWN"))).upper()
            mtype = str(inc.get("machine_type", inc.get("equipment_type", "GENERAL"))).upper()
            if mid not in machine_stats:
                machine_stats[mid] = {
                    "machine_id": mid,
                    "machine_type": mtype,
                    "incident_episodes": 0,
                    "total_intervals": 0,
                    "excess_energy_kwh": 0.0,
                    "data_quality_warnings": 0,
                    "severities": {"critical": 0, "high": 0, "medium": 0, "low": 0},
                }

            ms = machine_stats[mid]
            ms["incident_episodes"] += 1
            ms["total_intervals"] += int(inc.get("recurrence_count", 1))

            # Sum avoidable excess kWh without double counting
            ex_kwh = inc.get("residual_kwh") or inc.get("estimated_excess_energy_kwh") or 0.0
            if ex_kwh and float(ex_kwh) > 0:
                ms["excess_energy_kwh"] += float(ex_kwh)

            if inc.get("alert_category") == "sensor_data_quality_warning":
                ms["data_quality_warnings"] += 1

            s = str(inc.get("severity", "medium")).lower()
            if s in ms["severities"]:
                ms["severities"][s] += 1

        # Sort repeat offenders by excess energy and episode count
        repeat_offenders = sorted(
            machine_stats.values(),
            key=lambda x: (x["excess_energy_kwh"], x["incident_episodes"]),
            reverse=True,
        )

        for ro in repeat_offenders:
            ro["excess_energy_kwh"] = round(ro["excess_energy_kwh"], 3)
            ro["estimated_cost_inr"] = round(ro["excess_energy_kwh"] * INDUSTRIAL_TARIFF_INR_PER_KWH, 2)
            ro["avoidable_carbon_kg"] = round(ro["excess_energy_kwh"] * GRID_EMISSION_FACTOR_KG_PER_KWH, 3)

        # 4. Total Energy and Carbon Impact
        total_excess_kwh = round(sum(ro["excess_energy_kwh"] for ro in repeat_offenders), 3)
        total_cost_inr = round(total_excess_kwh * INDUSTRIAL_TARIFF_INR_PER_KWH, 2)
        total_carbon_kg = round(total_excess_kwh * GRID_EMISSION_FACTOR_KG_PER_KWH, 3)

        # 5. Data Quality Warnings count
        dq_warnings_count = categories.get("sensor_data_quality_warning", 0)

        # 6. Prioritized Inspection Priorities
        inspection_priorities = []
        if repeat_offenders:
            top_m = repeat_offenders[0]
            if top_m["excess_energy_kwh"] > 0:
                inspection_priorities.append({
                    "priority": "HIGH",
                    "machine_id": top_m["machine_id"],
                    "focus": "Idle energy waste & pressure/setpoint deviation",
                    "action": f"Audit {top_m['machine_id']} ({top_m['machine_type']}) for off-shift baseload and unloading parameters. Responsible for {top_m['excess_energy_kwh']:.2f} kWh avoidable excess.",
                })

        if dq_warnings_count > 0:
            inspection_priorities.append({
                "priority": "MEDIUM",
                "machine_id": "MULTIPLE",
                "focus": "Sensor calibration & telemetry I/O health",
                "action": f"{dq_warnings_count} sensor quality warnings detected. Calibrate field transmitters and inspect gateway communication before taking mechanical equipment offline.",
            })

        inspection_priorities.append({
            "priority": "ROUTINE",
            "machine_id": "ALL",
            "focus": "Weekly peak tariff demand alignment",
            "action": "Ensure high-load heating and compressor cycles are scheduled outside 09:00-12:00 and 18:00-21:00 peak tariff windows.",
        })

        return {
            "site_id": site_id or "SITE-01",
            "machine_id": machine_id or "ALL",
            "summary_metrics": {
                "unique_incident_episodes": total_incidents,
                "total_flagged_15min_intervals": total_intervals_flagged,
                "recurring_episodes_count": recurring_episodes,
                "total_avoidable_excess_kwh": total_excess_kwh,
                "total_financial_loss_inr": total_cost_inr,
                "total_avoidable_co2e_kg": total_carbon_kg,
                "data_quality_warnings": dq_warnings_count,
            },
            "category_distribution": categories,
            "severity_distribution": severities,
            "repeat_offenders": repeat_offenders[:5],
            "inspection_priorities": inspection_priorities,
            "assumptions": {
                "electricity_tariff": f"INR {INDUSTRIAL_TARIFF_INR_PER_KWH:.2f} / kWh (Time-of-day baseline)",
                "grid_emission_factor": f"{GRID_EMISSION_FACTOR_KG_PER_KWH:.2f} kg CO2e / kWh (CEA India Database v19)",
                "methodology": "Residual difference against condition-calibrated HistGradientBoostingRegressor forecast",
                "disclaimer": "Savings and carbon reductions reflect modeled avoidable excess; not measured field reductions until verified.",
            },
        }
