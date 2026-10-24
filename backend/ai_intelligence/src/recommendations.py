"""
Evidence-Based Energy Optimization & Actionable Recommendations Engine.

Translates observed physical and residual evidence into prioritized, industrial
investigation actions. Adheres strictly to honest boundaries:
  - Does NOT diagnose mechanical causes (e.g. bearing failure, mechanical wear) from energy alone.
  - Labels unconfirmed explanations as 'possible causes requiring inspection'.
  - Computes defensible estimated savings without promising guaranteed outcomes.
  - Supports configurable equipment registry with fallback for general machinery.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

# Constants from industrial manufacturing baseline (CEA Grid & Time-of-Day Tariff)
DEFAULT_TARIFF_INR_PER_KWH = 9.00
DEFAULT_GRID_EMISSION_FACTOR_KG = 0.82


class ActionRecommendation(BaseModel):
    """Structured, evidence-grounded optimization recommendation."""
    observed_evidence: str
    recommended_action: str
    why_relevant: str
    suggested_priority: str  # "immediate", "next_shift", "scheduled_maintenance"
    suggested_verification: str
    estimated_savings_kwh: Optional[float] = None
    estimated_savings_inr: Optional[float] = None
    avoidable_co2e_kg: Optional[float] = None
    assumptions_and_disclaimer: str = (
        "Estimated savings reflect difference between actual consumption and condition-calibrated baseline. "
        "Savings require field verification and depend on operational schedule; not a guaranteed outcome."
    )


class RecommendationEngine:
    """
    Produces actionable checklists tailored to equipment category and observed telemetry signals.
    """

    @classmethod
    def generate_recommendations(
        cls,
        machine_type: str,
        evidence_list: List[str],
        residual_kwh: Optional[float] = None,
        power_kw: Optional[float] = None,
        operating_state: Optional[str] = None,
        tariff_inr_per_kwh: float = DEFAULT_TARIFF_INR_PER_KWH,
        emission_factor_kg: float = DEFAULT_GRID_EMISSION_FACTOR_KG,
    ) -> List[ActionRecommendation]:
        """
        Generate recommendations linked strictly to observed evidence.
        """
        mt = str(machine_type).upper()
        state = str(operating_state).lower() if operating_state else "running"
        recommendations: List[ActionRecommendation] = []

        # Calculate defensible savings if excess energy was recorded
        excess_kwh = None
        excess_inr = None
        co2_kg = None
        if residual_kwh is not None and residual_kwh > 0.05:
            excess_kwh = round(residual_kwh, 3)
            excess_inr = round(excess_kwh * tariff_inr_per_kwh, 2)
            co2_kg = round(excess_kwh * emission_factor_kg, 3)

        # -------------------------------------------------------------
        # 1. AIR COMPRESSOR / PNEUMATICS
        # -------------------------------------------------------------
        if "COMP" in mt:
            if excess_kwh:
                recommendations.append(ActionRecommendation(
                    observed_evidence=f"Residual excess of {excess_kwh:.2f} kWh detected during {state} state.",
                    recommended_action="Inspect compressor unloading cycle timers and check minimum system pressure setpoint.",
                    why_relevant="Compressors operating at elevated idle power or short-cycling consume near-full motor load without producing useful CFM.",
                    suggested_priority="next_shift",
                    suggested_verification="Record discharge pressure (bar) vs motor current over 3 consecutive cycles.",
                    estimated_savings_kwh=excess_kwh,
                    estimated_savings_inr=excess_inr,
                    avoidable_co2e_kg=co2_kg,
                ))
            recommendations.append(ActionRecommendation(
                observed_evidence="Pneumatic distribution load profile anomaly flagged.",
                recommended_action="Conduct ultrasonic leak survey on main shop-floor distribution headers and drop legs.",
                why_relevant="Pneumatic distribution leaks typically represent 20-30% of total compressor electrical load in manufacturing.",
                suggested_priority="scheduled_maintenance",
                suggested_verification="Perform 15-minute weekend pressure decay test on closed manifold (target decay < 0.1 bar/min).",
            ))

        # -------------------------------------------------------------
        # 2. HEAT-TREATMENT FURNACE
        # -------------------------------------------------------------
        elif "FURN" in mt:
            if excess_kwh:
                recommendations.append(ActionRecommendation(
                    observed_evidence=f"Thermal holding excess of {excess_kwh:.2f} kWh above baseline forecast.",
                    recommended_action="Verify door seal integrity, limit switch alignment, and insulation surface temperature.",
                    why_relevant="Heat losses through compromised seals or open doors force heating elements to run continuous high-duty cycles.",
                    suggested_priority="immediate" if (residual_kwh and residual_kwh > 2.0) else "next_shift",
                    suggested_verification="Perform thermal imaging scan of vestibule perimeter and check thermocouple calibration curve.",
                    estimated_savings_kwh=excess_kwh,
                    estimated_savings_inr=excess_inr,
                    avoidable_co2e_kg=co2_kg,
                ))
            recommendations.append(ActionRecommendation(
                observed_evidence="Furnace operating profile inspection requested.",
                recommended_action="Review batch scheduling to consolidate heating runs and avoid prolonged holding at high setpoints.",
                why_relevant="Consecutive batch loading minimizes warm-up cycles and reduces idle thermal radiation losses.",
                suggested_priority="next_shift",
                suggested_verification="Compare kWh per kilogram of treated steel across single vs back-to-back batches.",
            ))

        # -------------------------------------------------------------
        # 3. CNC MACHINING CENTER
        # -------------------------------------------------------------
        elif "CNC" in mt:
            recommendations.append(ActionRecommendation(
                observed_evidence=f"Spindle / auxiliary electrical draw recorded during '{state}' state.",
                recommended_action="Review automatic standby timeout settings on high-pressure coolant pumps and chip conveyor.",
                why_relevant="Auxiliary systems left active during setup or operator breaks accumulate significant off-cutting energy waste.",
                suggested_priority="next_shift",
                suggested_verification="Verify coolant pump auto-stop activates within 3 minutes of M30 program completion.",
                estimated_savings_kwh=excess_kwh,
                estimated_savings_inr=excess_inr,
                avoidable_co2e_kg=co2_kg,
            ))
            recommendations.append(ActionRecommendation(
                observed_evidence="Spindle drive loading deviation from expected cutting envelope.",
                recommended_action="Review tool wear offsets, feed rates, and depth of cut on current active part program.",
                why_relevant="Dull cutting inserts increase tool pressure, spindle motor kW draw, and part dimensional chatter.",
                suggested_priority="immediate",
                suggested_verification="Inspect tool insert rake angle and check motor load % during finishing pass.",
            ))

        # -------------------------------------------------------------
        # 4. PAINTING LINE / FINISHING
        # -------------------------------------------------------------
        elif "PAINT" in mt:
            recommendations.append(ActionRecommendation(
                observed_evidence="Ventilation and curing oven energy profile deviation flagged.",
                recommended_action="Audit spray booth makeup air damper modulation and interlock with spray gun triggers.",
                why_relevant="Conditioning 100% fresh makeup air during spray lulls accounts for up to 60% of paint line thermal load.",
                suggested_priority="next_shift",
                suggested_verification="Verify ventilation fan VFD ramps down to 50% flow when no parts trigger photo-eye sensors.",
                estimated_savings_kwh=excess_kwh,
                estimated_savings_inr=excess_inr,
                avoidable_co2e_kg=co2_kg,
            ))

        # -------------------------------------------------------------
        # 5. INDUSTRIAL CHILLER / HVAC
        # -------------------------------------------------------------
        elif "CHILLER" in mt or "HVAC" in mt:
            recommendations.append(ActionRecommendation(
                observed_evidence="Chilled water loop energy/thermal deviation detected.",
                recommended_action="Verify chilled water supply setpoint, check delta-T across evaporator, and inspect condenser tubes.",
                why_relevant="Low delta-T syndrome and scaling on tube walls severely penalize chiller COP, increasing compressor kW per ton.",
                suggested_priority="scheduled_maintenance",
                suggested_verification="Verify approach temperature is < 1.5 °C and chilled water Delta-T >= 5.0 °C under full load.",
                estimated_savings_kwh=excess_kwh,
                estimated_savings_inr=excess_inr,
                avoidable_co2e_kg=co2_kg,
            ))

        # -------------------------------------------------------------
        # 6. GENERIC INDUSTRIAL MACHINERY (FALLBACK)
        # -------------------------------------------------------------
        else:
            recommendations.append(ActionRecommendation(
                observed_evidence=f"Unusual electrical demand recorded on {mt} asset during {state} state.",
                recommended_action="Inspect machine idling schedule, verify motor drive efficiency, and audit off-shift shutoff compliance.",
                why_relevant="Equipment running unladen or left energized outside active production shifts creates avoidable baseload cost.",
                suggested_priority="next_shift",
                suggested_verification="Measure power draw (kW) during true stop vs idling condition.",
                estimated_savings_kwh=excess_kwh,
                estimated_savings_inr=excess_inr,
                avoidable_co2e_kg=co2_kg,
            ))

        return recommendations
