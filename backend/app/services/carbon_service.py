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
    CarbonQuotaRequest,
    CarbonQuotaResponse,
    CeaFactorMetadata,
    GrossFootprintResult,
    PeriodDetails,
    ProcessEmissionsInput,
    ProcessEmissionsResult,
    ProvenanceType,
    ReportingPeriodInput,
    ReportingPeriodType,
    ScenarioComparisonResult,
    Scope1CalculationResult,
    Scope1FactorBreakdown,
    Scope1Input,
    Scope2CalculationResult,
    Scope2Input,
    WastewaterInput,
    WastewaterResult,
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

        # 4b. Chemical & Process Emissions (Refrigerants, Welding Gas, Solvents)
        process_res: Optional[ProcessEmissionsResult] = None
        process_total_co2e = 0.0
        if request.process_emissions:
            process_res = self._compute_process_emissions(request.process_emissions)
            process_total_co2e = process_res.total_process_t_co2e

        # 4c. Wastewater Effluent Treatment (ETP Biological CH4)
        etp_res: Optional[WastewaterResult] = None
        etp_total_co2e = 0.0
        if request.wastewater and request.wastewater.cod_inflow_kg > 0:
            etp_res = self._compute_wastewater(request.wastewater)
            etp_total_co2e = etp_res.emissions_t_co2e

        # 5. Gross Operational Footprint (Scope 1 combustion + process + ETP + Scope 2 grid)
        total_gross_co2e = round(s1_total_co2e + s2_total_co2e + process_total_co2e + etp_total_co2e, 4)
        total_direct_co2 = (
            round((s1_direct_co2 if s1_direct_co2 is not None else 0.0) + s2_total_co2e + process_total_co2e + etp_total_co2e, 4)
            if (s1_direct_co2 is not None or s1_input is None)
            else None
        )

        gross_footprint = GrossFootprintResult(
            scope1=s1_result,
            scope2=s2_result,
            process_emissions=process_res,
            wastewater_emissions=etp_res,
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

        verified_fuels = {
            "lpg": ("Liquefied Petroleum Gases (LPG)", "kg", "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 47.3 MJ/kg, AR6 GWP)"),
            "hsd": ("High-Speed Diesel (HSD / DG Sets)", "L", "2006 IPCC Guidelines Vol. 2 Ch. 1 & 2 (NCV: 36.0 MJ/L, AR6 GWP)"),
            "diesel": ("High-Speed Diesel (HSD / DG Sets)", "L", "2006 IPCC Guidelines Vol. 2 Ch. 1 & 2 (NCV: 36.0 MJ/L, AR6 GWP)"),
            "png": ("Piped Natural Gas (PNG / Boilers)", "Sm3", "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 38.5 MJ/Sm3, AR6 GWP)"),
            "natural_gas": ("Piped Natural Gas (PNG / Boilers)", "Sm3", "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 38.5 MJ/Sm3, AR6 GWP)"),
            "hfo": ("Furnace Oil (HFO / Heavy Boilers)", "L", "2006 IPCC Guidelines Vol. 2 Ch. 2 (NCV: 40.2 MJ/L, AR6 GWP)"),
            "furnace_oil": ("Furnace Oil (HFO / Heavy Boilers)", "L", "2006 IPCC Guidelines Vol. 2 Ch. 2 (NCV: 40.2 MJ/L, AR6 GWP)"),
            "ldo": ("Light Diesel Oil (LDO)", "L", "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (NCV: 38.0 MJ/L, AR6 GWP)"),
            "coal": ("Non-Coking Coal (Grade G11)", "kg", "2006 IPCC Guidelines Vol. 2 Ch. 2 (NCV: 16.5 MJ/kg, AR6 GWP)"),
            "biomass": ("Biomass Agro-Briquettes", "kg", "2006 IPCC Guidelines Vol. 2 Ch. 2 (NCV: 15.0 MJ/kg, Net Biogenic CO2 = 0)"),
        }

        if fuel_id in verified_fuels and s1_input.custom_total_co2e_factor is None and s1_input.custom_emission_factor is None:
            fuel_name, std_unit, source_ref = verified_fuels[fuel_id]
            breakdown = reference_data_service.get_ipcc_fuel_parameters(fuel_id)
            verification = "VERIFIED_IPCC"

            # Unit safety & conversions
            conv_note = None
            effective_qty = activity_val

            if std_unit == "kg":
                if unit_lower in ["kg", "kilogram", "kilograms"]:
                    effective_qty = activity_val
                elif unit_lower in ["t", "tonne", "tonnes", "metric ton", "mt"]:
                    effective_qty = round(activity_val * 1000.0, 4)
                    conv_note = "Mass unit conversion: 1 tonne = 1,000 kg"
                elif fuel_id == "lpg" and unit_lower in ["l", "liter", "litre", "litres", "liters"]:
                    density_kg_per_l = 0.540
                    effective_qty = round(activity_val * density_kg_per_l, 4)
                    conv_note = "Volume-to-mass conversion: 0.540 kg/L (commercial LPG liquid density at 15°C per IS 4576)"
                else:
                    if fuel_id == "lpg":
                        detail_msg = (
                            f"Incompatible activity unit '{raw_unit}' for fuel 'lpg'. "
                            "The IPCC LPG emission factors are strictly defined per kilogram (mass). "
                            "Direct application to incompatible units is prohibited. "
                            "Supported units are 'kg', 't' (converted x1000 kg), or 'L'/'litres' (converted at 0.540 kg/L per IS 4576)."
                        )
                    else:
                        detail_msg = (
                            f"Incompatible activity unit '{raw_unit}' for fuel '{fuel_id}'. "
                            f"The IPCC emission factor is defined per {std_unit} (mass). "
                            "Supported units are 'kg' or 't' (converted x1000 kg)."
                        )
                    raise HTTPException(status_code=422, detail=detail_msg)
            elif std_unit == "L":
                if unit_lower in ["l", "liter", "litre", "litres", "liters"]:
                    effective_qty = activity_val
                elif unit_lower in ["kl", "kiloliter", "m3", "cubic meter"]:
                    effective_qty = round(activity_val * 1000.0, 4)
                    conv_note = "Volume unit conversion: 1 kL / m3 = 1,000 L"
                else:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Incompatible activity unit '{raw_unit}' for fuel '{fuel_id}'. Supported units are 'L' or 'kL'/'m3'."
                    )
            elif std_unit == "Sm3":
                if unit_lower in ["sm3", "m3", "nm3", "standard cubic meter", "cubic meter"]:
                    effective_qty = activity_val
                else:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Incompatible activity unit '{raw_unit}' for gas fuel '{fuel_id}'. Supported units are 'Sm3' or 'm3'."
                    )

            # Math: quantity * factor / 1000 = tonnes
            direct_co2_t = round((effective_qty * (breakdown.direct_co2_kg_per_kg or 0.0)) / 1000.0, 4)
            total_co2e_t = round((effective_qty * breakdown.total_co2e_kg_per_kg) / 1000.0, 4)
            eval_t = total_co2e_t if s1_input.include_non_co2_ghg else direct_co2_t
            eval_factor = breakdown.total_co2e_kg_per_kg if s1_input.include_non_co2_ghg else (breakdown.direct_co2_kg_per_kg or 0.0)

            if conv_note:
                formula = (
                    f"{activity_val:,.1f} {raw_unit} ({conv_note}) -> {effective_qty:,.1f} {std_unit} × "
                    f"{eval_factor:.5f} kg CO₂e/{std_unit} ÷ 1000 = {eval_t:.4f} tCO₂e"
                )
            else:
                formula = (
                    f"{effective_qty:,.1f} {std_unit} × {eval_factor:.5f} kg CO₂e/{std_unit} ÷ 1000 = "
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
                "effective_mass_kg": round(effective_qty, 2) if std_unit == "kg" else None,
                "effective_volume_l": round(effective_qty, 2) if std_unit == "L" else None,
                "effective_volume_sm3": round(effective_qty, 2) if std_unit == "Sm3" else None,
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

    def _compute_process_emissions(self, p_input: ProcessEmissionsInput) -> ProcessEmissionsResult:
        """Calculates Scope 1 process emissions from fugitive refrigerants, welding shielding gas, and solvents."""
        refrig_details = []
        refrig_total_t = 0.0

        for r in p_input.refrigerants:
            if r.leak_kg > 0:
                gwp = reference_data_service.get_refrigerant_gwp(r.gas_type)
                t_co2e = round((r.leak_kg * gwp) / 1000.0, 4)
                refrig_total_t += t_co2e
                refrig_details.append({
                    "gas_type": r.gas_type,
                    "leak_kg": r.leak_kg,
                    "gwp_ar6": gwp,
                    "emissions_t_co2e": t_co2e,
                })

        welding_t = 0.0
        welding_details = None
        if p_input.welding and p_input.welding.volume_nm3 > 0:
            ef = reference_data_service.get_welding_gas_factor(p_input.welding.gas_mix)
            welding_t = round((p_input.welding.volume_nm3 * ef) / 1000.0, 4)
            welding_details = {
                "gas_mix": p_input.welding.gas_mix,
                "volume_nm3": p_input.welding.volume_nm3,
                "factor_kg_per_nm3": ef,
                "emissions_t_co2e": welding_t,
            }

        # Solvent VOC thermal oxidation stoichiometry (~3.14 kg CO2e / kg VOC oxidized)
        solvent_t = round((p_input.solvent_voc_kg * 3.14) / 1000.0, 4) if p_input.solvent_voc_kg > 0 else 0.0

        total_process = round(refrig_total_t + welding_t + solvent_t, 4)

        return ProcessEmissionsResult(
            refrigerant_leaks_t_co2e=round(refrig_total_t, 4),
            refrigerant_details=refrig_details,
            welding_shield_t_co2e=welding_t,
            welding_details=welding_details,
            solvent_voc_t_co2e=solvent_t,
            total_process_t_co2e=total_process,
        )

    def _compute_wastewater(self, w_input: WastewaterInput) -> WastewaterResult:
        """
        Calculates ETP biological methane emissions according to IPCC 2006 Vol. 5 Ch. 6:
        CH4 (kg) = COD_inflow (kg) * B0 (0.25) * MCF (0.30) - Methane_Recovered
        tCO2e = (CH4 * 27.9 AR6 GWP) / 1000
        """
        b0 = 0.25
        mcf = w_input.mcf
        methane_gen_kg = round(w_input.cod_inflow_kg * b0 * mcf, 4)
        net_methane_kg = max(0.0, round(methane_gen_kg - w_input.methane_recovered_kg, 4))
        emissions_t = round((net_methane_kg * 27.9) / 1000.0, 4)

        return WastewaterResult(
            cod_inflow_kg=w_input.cod_inflow_kg,
            methane_generated_kg=methane_gen_kg,
            methane_recovered_kg=w_input.methane_recovered_kg,
            net_methane_emitted_kg=net_methane_kg,
            emissions_t_co2e=emissions_t,
            mcf=mcf,
            b0=b0,
        )

    def evaluate_carbon_quota(self, request: CarbonQuotaRequest) -> CarbonQuotaResponse:
        """
        Evaluates dynamic Carbon Burn Rate Index (BRI) against permitted compliance quotas:
        BRI = Actual Cumulative Emissions / (Permitted Budget * Elapsed Fraction)
        - Normal: BRI <= 0.90 (Green)
        - Advisory: 0.90 < BRI <= 1.00 (Amber)
        - Lockout: BRI > 1.00 (Red, Enforced operational guardrails)
        """
        budget = request.permitted_budget_tco2e or request.quota_limit_t_co2e or 18.0
        if request.actual_emissions_tco2e is not None:
            actual = request.actual_emissions_tco2e
        elif request.current_emissions_t_co2e is not None:
            actual = request.current_emissions_t_co2e
        else:
            actual = 14.47

        elapsed = max(0.01, min(1.0, request.elapsed_fraction if request.elapsed_fraction is not None else 0.75))
        if request.current_hour_of_month and request.total_hours_in_month:
            elapsed = max(0.01, min(1.0, request.current_hour_of_month / request.total_hours_in_month))

        pro_rata_budget = max(0.01, budget * elapsed)
        bri = round(actual / pro_rata_budget, 3)
        util_pct = round((actual / budget) * 100.0, 2)

        # Estimate hours remaining before hard breach at current burn rate
        hourly_burn = actual / max(0.1, elapsed * 720.0)
        remaining_budget = budget - actual
        hours_to_breach = round(remaining_budget / max(0.01, hourly_burn), 1) if remaining_budget > 0 else 0.0

        if bri <= 0.90:
            tier = "NORMAL"
            color = "green"
            interlock_state = "DISENGAGED"
            msg = f"Normal Operational State: Emissions are running {round((1.0 - bri) * 100, 1)}% below pro-rata statutory cap."
            interlocks = []
            actions = ["Maintain standard DCS setpoints", "Continue background counterfactual optimization"]
            override = False
            compliance = "COMPLIANT_WITHIN_CAP"
        elif bri <= 1.00:
            tier = "ADVISORY"
            color = "amber"
            interlock_state = "WARNING"
            msg = f"Advisory Warning: Burn rate index is {bri}x. Projected to breach quota in {hours_to_breach} hours if current trajectory continues."
            interlocks = ["ADVISORY: Peak production throttling recommended"]
            actions = [
                "Stagger non-critical furnace pre-heating and batch cycles by 45 minutes",
                "Switch utility chillers to night ice-storage thermal discharge",
                "Verify air compressor unload blowdown timers",
            ]
            override = False
            compliance = "APPROACHING_THRESHOLD_WARNING"
        else:
            tier = "LOCKOUT"
            color = "red"
            interlock_state = "ACTIVE_LOCKOUT"
            msg = f"Statutory Quota Breach Warning: Current burn rate index is {bri}x (overrun threshold exceeded). Active operational guardrails engaged."
            interlocks = [
                "[INTERLOCK-01] Dual-Fuel Burner Auto-Switching: Command dispatched to switch Furnace from HFO to PNG/Electric (-31% carbon intensity)",
                "[INTERLOCK-02] Non-Emergency DG Set Lockout: Peak-shaving via diesel generator locked out; battery BESS discharge enforced",
                "[INTERLOCK-03] Compressed Air Standby Throttle: Unloaded timeout reduced from 15m to 3m across all utility lines",
            ]
            actions = [
                "Acknowledge statutory deviation log with cryptographic Plant Head sign-off",
                "Confirm active fuel-switch to low-emission fuel vector",
                "Dispatch utility maintenance technician for audit check",
            ]
            override = True
            compliance = "ENFORCED_REGULATORY_INTERLOCK"

        fuel_switching = {
            "recommended_action": "IMMEDIATE_FUEL_SWITCH_AND_DG_LOCKOUT" if tier == "LOCKOUT" else "READY_PNG_TO_BIOMASS_STANDBY",
            "target_asset": "BOIL-PNG-01",
            "primary_fuel": "png",
            "alternate_fuel": "biomass",
            "emission_reduction_pct": 84.5,
            "hourly_saving_t_co2e": 0.062,
            "dg_lockout_armed": tier == "LOCKOUT",
        }

        return CarbonQuotaResponse(
            burn_rate_index=bri,
            permitted_budget_tco2e=budget,
            actual_emissions_tco2e=actual,
            status_tier=tier,
            status_color=color,
            message=msg,
            countdown_hours_to_breach=hours_to_breach if hours_to_breach > 0 else 0.0,
            active_interlocks=interlocks,
            recommended_actions=actions,
            override_permitted=override,
            audit_compliance_status=compliance,
            # Compatibility fields for frontend
            statutory_monthly_quota_t=budget,
            cumulative_emissions_t=actual,
            quota_utilization_pct=util_pct,
            pro_rata_expected_emissions_t=round(pro_rata_budget, 2),
            burn_rate_status=tier if tier != "LOCKOUT" else "CRITICAL",
            hours_to_quota_breach=hours_to_breach if hours_to_breach > 0 else None,
            interlock_state=interlock_state,
            recommended_fuel_switching=fuel_switching,
        )


carbon_service = CarbonService()

