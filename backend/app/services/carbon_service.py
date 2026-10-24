"""
WattWise AI — Carbon Accounting Engine
Implements ISO 14064-1 & GHG Protocol Scope 2 Calculation Rules
"""

import calendar
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import HTTPException

from backend.app.models import (
    AvoidedEmissionsResult,
    CarbonCalculateRequest,
    CarbonCalculateResponse,
    CeaFactorMetadata,
    GrossFootprintResult,
    PeriodDetails,
    ProvenanceType,
    ReportingPeriodInput,
    ReportingPeriodType,
    ScenarioComparisonResult,
    Scope1CalculationResult,
    Scope1FactorBreakdown,
    Scope1Input,
    Scope2CalculationResult,
    Scope2Input,
)
from backend.app.services.reference_data import reference_data_service


class PeriodMismatchError(HTTPException):
    """Raised when Scope 1 and Scope 2 activity data span incompatible timeframes."""
    def __init__(self, detail: str):
        super().__init__(status_code=422, detail=detail)


class CarbonService:
    """Core calculation service for industrial carbon accounting."""

    @staticmethod
    def resolve_period_duration(period_input: ReportingPeriodInput) -> Tuple[float, float, str]:
        """
        Resolves duration in days, duration in hours, and a human-readable description.
        Accounts for exact calendar days in month (including leap years).
        """
        ptype = period_input.period_type

        if ptype == ReportingPeriodType.SIMULATED_DEMO_30D:
            days = period_input.duration_days if period_input.duration_days is not None else 30.0
            return days, days * 24.0, f"Simulated Demo Window ({days:.1f} days / {days * 24:.0f}h)"

        elif ptype == ReportingPeriodType.DAILY:
            days = period_input.duration_days if period_input.duration_days is not None else 1.0
            return days, days * 24.0, f"Daily Operational Cycle ({days:.1f} day / {days * 24:.0f}h)"

        elif ptype == ReportingPeriodType.CALENDAR_MONTH:
            assert period_input.calendar_year is not None
            assert period_input.calendar_month is not None
            _, days_in_month = calendar.monthrange(period_input.calendar_year, period_input.calendar_month)
            month_name = calendar.month_name[period_input.calendar_month]
            desc = f"Calendar Month: {month_name} {period_input.calendar_year} ({days_in_month} calendar days)"
            return float(days_in_month), float(days_in_month * 24.0), desc

        elif ptype == ReportingPeriodType.DATED_RANGE:
            assert period_input.start_date is not None
            assert period_input.end_date is not None
            # Inclusive calendar day count: start to end inclusive
            delta_days = (period_input.end_date - period_input.start_date).days + 1
            if delta_days <= 0:
                delta_days = 1
            desc = f"Dated Range: {period_input.start_date} to {period_input.end_date} ({delta_days} days)"
            return float(delta_days), float(delta_days * 24.0), desc

        raise ValueError(f"Unsupported period type: {ptype}")

    def calculate(self, request: CarbonCalculateRequest) -> CarbonCalculateResponse:
        """
        Executes a rigorous carbon accounting audit calculation.
        Validates periods, isolates Scope 1 & 2, and separates avoided emissions from gross.
        """
        # 1. Resolve master calculation period
        master_days, master_hours, master_desc = self.resolve_period_duration(request.period)
        period_details = PeriodDetails(
            period_type=request.period.period_type,
            duration_days=round(master_days, 2),
            duration_hours=round(master_hours, 2),
            description=master_desc
        )

        # 2. Synchronize and validate activity periods
        s1_input = request.scope1
        s2_input = request.scope2

        s1_val, s1_norm_details = self._normalize_activity(
            s1_input.activity_value if s1_input else 0.0,
            s1_input.activity_period if s1_input else None,
            master_days,
            request.target_normalization_period,
            scope_name="Scope 1"
        )

        s2_val, s2_norm_details = self._normalize_activity(
            s2_input.grid_consumption_kwh if s2_input else 0.0,
            s2_input.activity_period if s2_input else None,
            master_days,
            request.target_normalization_period,
            scope_name="Scope 2"
        )

        # 3. Calculate Scope 1 (Direct Combustion)
        s1_result: Optional[Scope1CalculationResult] = None
        s1_direct_co2: Optional[float] = None
        s1_total_co2e = 0.0

        if s1_input and s1_val > 0:
            s1_result, s1_direct_co2, s1_total_co2e = self._compute_scope1(
                s1_input, s1_val, master_days, s1_norm_details
            )

        # 4. Calculate Scope 2 (Purchased Electricity)
        s2_result: Optional[Scope2CalculationResult] = None
        s2_total_co2e = 0.0
        factor_used_val = 0.72886  # default fallback

        if s2_input and s2_val > 0:
            s2_result, s2_total_co2e, factor_used_val = self._compute_scope2(
                s2_input, s2_val, master_days, s2_norm_details
            )

        # 5. Gross Operational Footprint (Scope 1 + Scope 2)
        total_gross_co2e = round(s1_total_co2e + s2_total_co2e, 4)
        total_direct_co2 = (
            round((s1_direct_co2 if s1_direct_co2 is not None else 0.0) + s2_total_co2e, 4)
            if (s1_direct_co2 is not None or s1_input is None)
            else None
        )

        gross_footprint = GrossFootprintResult(
            scope1=s1_result,
            scope2=s2_result,
            total_gross_co2e_t=total_gross_co2e,
            direct_co2_only_total_t=total_direct_co2
        )

        # 6. Avoided Emissions & Digital Twin Scenario Comparison
        avoided_res: Optional[AvoidedEmissionsResult] = None
        scenario_res: Optional[ScenarioComparisonResult] = None

        if request.scenario_comparison and request.scenario_comparison.enabled:
            sc = request.scenario_comparison
            baseline_kwh = s2_input.grid_consumption_kwh if s2_input else 0.0

            # Validate non-negativity
            if sc.proposed_savings_kwh < 0.0:
                raise HTTPException(status_code=422, detail="proposed_savings_kwh must be non-negative.")
            if sc.proposed_consumption_kwh is not None and sc.proposed_consumption_kwh < 0.0:
                raise HTTPException(status_code=422, detail="proposed_consumption_kwh must be non-negative.")

            # Validate consistency between baseline, proposed, and savings
            if sc.proposed_consumption_kwh is not None:
                if abs((sc.proposed_consumption_kwh + sc.proposed_savings_kwh) - baseline_kwh) > 0.1:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            f"Scenario inputs inconsistent with baseline: proposed consumption ({sc.proposed_consumption_kwh} kWh) "
                            f"+ savings ({sc.proposed_savings_kwh} kWh) = {round(sc.proposed_consumption_kwh + sc.proposed_savings_kwh, 2)} kWh, "
                            f"which does not match baseline electricity ({baseline_kwh} kWh)."
                        )
                    )
                savings_kwh = sc.proposed_savings_kwh
                proposed_kwh = sc.proposed_consumption_kwh
            else:
                if sc.proposed_savings_kwh > baseline_kwh:
                    raise HTTPException(
                        status_code=422,
                        detail=f"proposed_savings_kwh ({sc.proposed_savings_kwh} kWh) cannot exceed baseline consumption ({baseline_kwh} kWh)."
                    )
                savings_kwh = sc.proposed_savings_kwh
                proposed_kwh = max(0.0, round(baseline_kwh - savings_kwh, 2))

            # Avoided carbon = savings_kwh * grid_factor / 1000
            avoided_t = round((savings_kwh * factor_used_val) / 1000.0, 4) if factor_used_val > 0 else 0.0
            avoided_res = AvoidedEmissionsResult(
                savings_kwh=savings_kwh,
                provenance=sc.savings_provenance,
                avoided_co2e_t=avoided_t,
                formula=(
                    f"{savings_kwh:,.1f} kWh saved × {factor_used_val:.5f} kg CO₂/kWh ÷ 1000 = "
                    f"{avoided_t:.4f} tCO₂e avoided"
                ),
                accounting_treatment=(
                    "Reported separately under GHG Protocol Corporate Standard; "
                    "avoided emissions are NOT netted against the actual operational gross footprint."
                )
            )

            # Proposed Scope 2 = proposed_consumption_kwh * grid_factor / 1000
            proposed_scope2_t = round((proposed_kwh * factor_used_val) / 1000.0, 4) if factor_used_val > 0 else 0.0

            # Scope 1 actual emissions remain completely untouched
            scope1_t = s1_total_co2e

            # Proposed gross emissions = Scope 1 + proposed Scope 2
            proposed_gross = round(scope1_t + proposed_scope2_t, 4)

            pct_reduction = (
                round((avoided_t / total_gross_co2e) * 100.0, 2)
                if total_gross_co2e > 0 else 0.0
            )

            scenario_res = ScenarioComparisonResult(
                baseline_gross_t_co2e=total_gross_co2e,
                proposed_gross_t_co2e=proposed_gross,
                net_reduction_t_co2e=avoided_t,
                reduction_percentage=pct_reduction,
                baseline_electricity_kwh=baseline_kwh,
                proposed_electricity_kwh=proposed_kwh,
                electricity_savings_kwh=savings_kwh,
                avoided_emissions_t_co2e=avoided_t,
                scope1_t_co2e=scope1_t,
                proposed_scope2_t_co2e=proposed_scope2_t,
                provenance=sc.savings_provenance,
                accounting_note=(
                    "Digital twin simulation. Avoided emissions are tracked separately and "
                    "never subtracted from baseline gross operational emissions. Scope 1 fuel "
                    "emissions remain unchanged. Proposed gross = Scope 1 + proposed Scope 2."
                )
            )

        # 7. Overall Audit and Provenance Status
        provenances = []
        if s1_input:
            provenances.append(s1_input.provenance.value)
        if s2_input:
            provenances.append(s2_input.provenance.value)

        is_purely_measured = all(p == ProvenanceType.MEASURED.value for p in provenances) if provenances else False
        audit_status = (
            "MEASURED_INTERNAL_TELEMETRY"
            if is_purely_measured
            else "CALCULATION_UNVERIFIED_DEMO"
        )

        calc_meta = {
            "audit_status": audit_status,
            "is_purely_measured": is_purely_measured,
            "provenance_breakdown": {
                "scope1": s1_input.provenance.value if s1_input else None,
                "scope2": s2_input.provenance.value if s2_input else None,
                "scenario": request.scenario_comparison.savings_provenance.value if (request.scenario_comparison and request.scenario_comparison.enabled) else None
            },
            "methodological_references": [
                "ISO 14064-1:2018 (Specification for Quantification and Reporting of GHG)",
                "GHG Protocol Scope 2 Guidance (Location-Based Accounting)"
            ],
            "standards_compliance": ["Methodology aligned with ISO 14064-1:2018 calculation guidelines"],
            "calculated_at": datetime.now(timezone.utc).isoformat(),
            "note": (
                "Official factor source does NOT constitute a certified third-party plant audit. "
                f"Data quality is evaluated as {audit_status}."
            )
        }

        return CarbonCalculateResponse(
            calculation_metadata=calc_meta,
            period=period_details,
            gross_footprint=gross_footprint,
            avoided_emissions=avoided_res,
            scenario_comparison=scenario_res
        )

    def _normalize_activity(
        self,
        value: float,
        act_period: Optional[ReportingPeriodInput],
        master_days: float,
        target_norm: Optional[ReportingPeriodType],
        scope_name: str
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Validates activity timeframe against master period duration.
        Rejects mismatched durations unless target_normalization_period is given.
        Records original and normalized periods and scaling factor.
        """
        if act_period is None:
            return value, {
                "normalized_value": value,
                "original_value": value,
                "normalization_applied": False,
                "norm_note": None
            }

        act_days, _, act_desc = self.resolve_period_duration(act_period)

        if abs(act_days - master_days) < 0.01:
            return value, {
                "normalized_value": value,
                "original_value": value,
                "original_duration_days": act_days,
                "normalized_duration_days": master_days,
                "normalization_applied": False,
                "norm_note": None
            }

        # Period mismatch detected
        if target_norm is None:
            raise PeriodMismatchError(
                f"Reporting period mismatch for {scope_name}: activity period is '{act_desc}' ({act_days:.1f} days), "
                f"but master calculation period is {master_days:.1f} days. "
                "Silently combining disparate periods is prohibited. "
                "Supply 'target_normalization_period' to permit proportional scaling, or align activity periods."
            )

        # Apply proportional temporal scaling
        scale_ratio = master_days / act_days
        normalized_value = value * scale_ratio
        norm_note = (
            f"Normalized from {act_days:.1f}d to {master_days:.1f}d "
            f"(scale factor: {scale_ratio:.4f})"
        )
        return normalized_value, {
            "normalized_value": round(normalized_value, 4),
            "original_value": value,
            "original_duration_days": act_days,
            "normalized_duration_days": master_days,
            "scale_factor": round(scale_ratio, 6),
            "normalization_applied": True,
            "norm_note": norm_note
        }

    def _compute_scope1(
        self,
        s1_input: Scope1Input,
        activity_val: float,
        duration_days: float,
        norm_details: Dict[str, Any]
    ) -> Tuple[Scope1CalculationResult, Optional[float], float]:
        """Calculates Scope 1 direct combustion emissions with fuel unit safety and CO2 vs CO2e split."""
        fuel_id = s1_input.fuel_id.lower().strip()
        raw_unit = (s1_input.activity_unit or "kg").strip()
        unit_lower = raw_unit.lower()

        if fuel_id == "lpg":
            breakdown = reference_data_service.get_ipcc_lpg_parameters()
            fuel_name = "Liquefied Petroleum Gases (LPG)"
            source_ref = "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 47.3 MJ/kg, AR6 GWP)"
            verification = "VERIFIED_IPCC"

            # Fuel unit safety for LPG: Factor is strictly per kg of LPG.
            # Handle supported mass and volume conversions; reject incompatible units.
            if unit_lower in ["kg", "kilogram", "kilograms"]:
                mass_kg = activity_val
                conv_note = None
            elif unit_lower in ["t", "tonne", "tonnes", "metric ton", "mt"]:
                mass_kg = round(activity_val * 1000.0, 4)
                conv_note = "Mass unit conversion: 1 tonne = 1,000 kg"
            elif unit_lower in ["l", "liter", "litre", "litres", "liters"]:
                # Commercial LPG liquid density at 15°C per Indian Standard IS 4576 (nominal 0.540 kg/L)
                density_kg_per_l = 0.540
                mass_kg = round(activity_val * density_kg_per_l, 4)
                conv_note = "Volume-to-mass conversion: 0.540 kg/L (commercial LPG liquid density at 15°C per IS 4576)"
            else:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Incompatible activity unit '{raw_unit}' for fuel 'lpg'. "
                        "The IPCC LPG emission factors are strictly defined per kilogram (mass). "
                        "Direct application to incompatible units is prohibited. "
                        "Supported units are 'kg', 't' (converted x1000 kg), or 'L'/'litres' (converted at 0.540 kg/L per IS 4576)."
                    )
                )

            # Math: mass (kg) * factor (kg/kg) / 1000 = tonnes
            direct_co2_t = round((mass_kg * breakdown.direct_co2_kg_per_kg) / 1000.0, 4)
            total_co2e_t = round((mass_kg * breakdown.total_co2e_kg_per_kg) / 1000.0, 4)
            eval_t = total_co2e_t if s1_input.include_non_co2_ghg else direct_co2_t
            eval_factor = breakdown.total_co2e_kg_per_kg if s1_input.include_non_co2_ghg else breakdown.direct_co2_kg_per_kg

            if conv_note:
                formula = (
                    f"{activity_val:,.1f} {raw_unit} ({conv_note}) -> {mass_kg:,.1f} kg LPG × "
                    f"{eval_factor:.5f} kg CO₂e/kg ÷ 1000 = {eval_t:.4f} tCO₂e"
                )
            else:
                formula = (
                    f"{mass_kg:,.1f} kg LPG × {eval_factor:.5f} kg CO₂e/kg ÷ 1000 = "
                    f"{eval_t:.4f} tCO₂e"
                )

            act_basis = f"{activity_val:,.1f} {raw_unit} consumed over {duration_days:.1f} days"
            if norm_details.get("norm_note"):
                act_basis += f" ({norm_details['norm_note']})"
            if conv_note:
                act_basis += f" [{conv_note}]"

            activity_dict = {
                "value": round(activity_val, 2),
                "unit": raw_unit,
                "effective_mass_kg": round(mass_kg, 2),
                "conversion_applied": conv_note,
                "provenance": s1_input.provenance.value,
                "basis": act_basis,
                "normalization": norm_details
            }

        else:
            # Custom fuel handling
            total_ef = (
                s1_input.custom_total_co2e_factor
                if s1_input.custom_total_co2e_factor is not None
                else s1_input.custom_emission_factor
            )
            if total_ef is None:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Fuel '{s1_input.fuel_id}' is not an IPCC verified default in this project. "
                        "You must provide 'custom_total_co2e_factor' (or 'custom_emission_factor') (kg CO2e/unit) for unverified fuels."
                    )
                )

            direct_ef = s1_input.custom_direct_co2_factor
            fuel_name = f"Custom Fuel ({s1_input.fuel_id})"
            source_ref = s1_input.custom_factor_provenance or "User-supplied parameter (Unverified)"
            verification = "PENDING_VERIFICATION"

            total_co2e_t = round((activity_val * total_ef) / 1000.0, 4)

            if direct_ef is not None:
                direct_co2_t = round((activity_val * direct_ef) / 1000.0, 4)
                eval_t = total_co2e_t if s1_input.include_non_co2_ghg else direct_co2_t
                eval_factor = total_ef if s1_input.include_non_co2_ghg else direct_ef
                breakdown = Scope1FactorBreakdown(
                    direct_co2_kg_per_kg=direct_ef,
                    ch4_emitted_g_per_kg=0.0,
                    ch4_converted_kg_per_kg=0.0,
                    ch4_gwp_ar6=27.9,
                    ch4_co2e_kg_per_kg=0.0,
                    n2o_emitted_g_per_kg=0.0,
                    n2o_converted_kg_per_kg=0.0,
                    n2o_gwp_ar6=273.0,
                    n2o_co2e_kg_per_kg=0.0,
                    total_co2e_kg_per_kg=total_ef
                )
                formula = (
                    f"{activity_val:,.1f} {raw_unit} × {eval_factor:.5f} kg CO₂e/{raw_unit} ÷ 1000 = "
                    f"{eval_t:.4f} tCO₂e"
                )
            else:
                # Do NOT equate direct CO2 to total CO2e when user only supplies total CO2e!
                direct_co2_t = None
                eval_t = total_co2e_t
                eval_factor = total_ef
                breakdown = Scope1FactorBreakdown(
                    direct_co2_kg_per_kg=None,
                    ch4_emitted_g_per_kg=0.0,
                    ch4_converted_kg_per_kg=0.0,
                    ch4_gwp_ar6=27.9,
                    ch4_co2e_kg_per_kg=0.0,
                    n2o_emitted_g_per_kg=0.0,
                    n2o_converted_kg_per_kg=0.0,
                    n2o_gwp_ar6=273.0,
                    n2o_co2e_kg_per_kg=0.0,
                    total_co2e_kg_per_kg=total_ef
                )
                formula = (
                    f"{activity_val:,.1f} {raw_unit} × {total_ef:.5f} kg CO₂e/{raw_unit} ÷ 1000 = "
                    f"{total_co2e_t:.4f} tCO₂e (Total CO₂e only; direct CO₂ factor not supplied)"
                )

            act_basis = f"{activity_val:,.1f} {raw_unit} consumed over {duration_days:.1f} days"
            if norm_details.get("norm_note"):
                act_basis += f" ({norm_details['norm_note']})"

            activity_dict = {
                "value": round(activity_val, 2),
                "unit": raw_unit,
                "effective_mass_kg": None,
                "conversion_applied": None,
                "provenance": s1_input.provenance.value,
                "basis": act_basis,
                "normalization": norm_details
            }

        result = Scope1CalculationResult(
            fuel_id=fuel_id,
            fuel_name=fuel_name,
            activity=activity_dict,
            factor_breakdown=breakdown,
            emissions_direct_co2_t=direct_co2_t,
            emissions_total_co2e_t=total_co2e_t,
            emissions_evaluated_t_co2e=eval_t,
            formula=formula,
            source_reference=source_ref,
            verification_status=verification
        )
        return result, direct_co2_t, eval_t

    def _compute_scope2(
        self,
        s2_input: Scope2Input,
        grid_kwh: float,
        duration_days: float,
        norm_details: Dict[str, Any]
    ) -> Tuple[Scope2CalculationResult, float, float]:
        """Calculates Scope 2 indirect electricity emissions from CEA factors."""
        if s2_input.custom_grid_factor is not None:
            factor_val = s2_input.custom_grid_factor
            meta = CeaFactorMetadata(
                selected_factor=factor_val,
                unit="kg CO2/kWh",
                reporting_year="CUSTOM_OVERRIDE",
                methodology="User-Defined Grid Factor Override",
                sheet="N/A",
                row=0,
                column=0,
                authority="User Specification",
                database_version="Custom",
                includes_imports=False,
                is_recommended_location_based=False,
                accounting_approach="User-Defined Grid Factor Override"
            )
            source_ref = "User Override (Custom Grid Factor)"
        else:
            try:
                meta = reference_data_service.get_cea_factor(
                    reporting_year=s2_input.cea_reporting_year,
                    methodology=s2_input.cea_methodology,
                    include_imports=s2_input.include_imports
                )
            except ValueError as e:
                raise HTTPException(status_code=422, detail=str(e))

            factor_val = meta.selected_factor
            source_ref = (
                f"CEA India CO2 Baseline Database Ver {meta.database_version}, "
                f"Sheet '{meta.sheet}', Row {meta.row}, Column {meta.column} ({meta.reporting_year})"
            )

        # Math: kWh * (kg CO2/kWh) / 1000 = tonnes CO2
        scope2_t = round((grid_kwh * factor_val) / 1000.0, 4)

        formula = (
            f"{grid_kwh:,.1f} kWh × {factor_val:.5f} kg CO₂/kWh ÷ 1000 = "
            f"{scope2_t:.4f} tCO₂e ({meta.accounting_approach})"
        )

        act_basis = f"{grid_kwh:,.1f} kWh consumed over {duration_days:.1f} days"
        if norm_details.get("norm_note"):
            act_basis += f" ({norm_details['norm_note']})"

        result = Scope2CalculationResult(
            activity={
                "value": round(grid_kwh, 2),
                "unit": "kWh",
                "provenance": s2_input.provenance.value,
                "basis": act_basis,
                "normalization": norm_details
            },
            factor_metadata=meta,
            emissions_total_co2e_t=scope2_t,
            formula=formula,
            source_reference=source_ref
        )
        return result, scope2_t, factor_val


carbon_service = CarbonService()
