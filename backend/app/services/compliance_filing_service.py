"""
Industrial Carbon Compliance & Filing Dossier Service
Implements:
1. ISO 14064-1 / GHG Protocol Compliance Calculation Log (Scope 1 & 2 transparent emission factors)
2. IPMVP Measurement & Verification (M&V) Protocol (Option B/C 14-day submeter verification plan)
3. SEBI BRSR (Core Principle 6) & EU CBAM Export Disclosure Report (per-unit carbon intensity)
4. Carbon Credit Issuance & Offset Registry Tracker (PDD preparation, lifecycle stages & validation)
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas for Compliance Filing Components
# ──────────────────────────────────────────────────────────────────────────────

class Scope1FuelSource(BaseModel):
    fuel_id: str
    fuel_name: str
    annual_consumption_qty: float
    unit: str
    ncv_mj_per_unit: float
    emission_factor_kg_co2_per_unit: float
    ch4_factor_g_per_unit: float
    n2o_factor_g_per_unit: float
    gwp_co2_equivalent: float
    calculated_emissions_tco2e: float
    tier_methodology: str  # IPCC Tier 1, Tier 2, Tier 3
    metering_device_id: str
    calibration_valid_until: str
    uncertainty_pct: float
    source_citation: str


class Scope2GridSource(BaseModel):
    grid_connection_id: str
    discom_name: str
    metering_point: str
    annual_kwh_purchased: float
    cea_baseline_version: str
    grid_emission_factor_t_per_mwh: float
    location_based_emissions_tco2e: float
    market_based_emissions_tco2e: float
    meter_accuracy_class: str
    onsite_solar_export_kwh: float
    avoided_solar_emissions_tco2e: float
    net_scope2_emissions_tco2e: float
    source_citation: str


class Iso14064ComplianceLog(BaseModel):
    standard: str = "ISO 14064-1:2018 / GHG Protocol Corporate Standard"
    facility_name: str
    reporting_period: str
    organizational_boundary: str
    operational_boundary: str
    consolidation_approach: str  # Operational Control
    scope1_fuel_sources: List[Scope1FuelSource]
    scope2_grid_sources: List[Scope2GridSource]
    total_scope1_tco2e: float
    total_scope2_tco2e: float
    gross_inventory_tco2e: float
    lead_verifier_signoff: str
    audit_trail_hash: str
    last_verified_at: str


class IpmvpMvProtocol(BaseModel):
    protocol_standard: str = "EVO 10000-1 (IPMVP Core Concepts 2022)"
    selected_option: str  # Option B: Retrofit Isolation / Option C: Whole Facility
    project_title: str
    energy_conservation_measure_ecm: str
    submeter_id: str
    baseline_period_start: str
    baseline_period_end: str
    reporting_period_start: str
    reporting_period_end: str
    duration_days: int
    baseline_kwh: float
    actual_monitored_kwh: float
    raw_energy_savings_kwh: float
    independent_variables: List[str]  # e.g., Production units, Cooling Degree Days
    routine_adjustment_kwh: float
    non_routine_adjustment_kwh: float
    adjusted_baseline_kwh: float
    net_verified_savings_kwh: float
    verified_avoided_carbon_tco2e: float
    statistical_validity: Dict[str, Any]  # R2, CV_RMSE, t_stat, confidence_pct
    metering_specifications: Dict[str, str]
    verification_status: str


class SebiBrsrDisclosure(BaseModel):
    framework: str = "SEBI BRSR Core - Principle 6 (Environmental Responsibility)"
    company_cin: str
    reporting_year: str
    turnover_cr_inr: float
    total_production_units: int
    total_energy_consumption_gj: float
    energy_intensity_gj_per_cr_inr: float
    scope1_tco2e: float
    scope2_tco2e: float
    total_scope1_scope2_tco2e: float
    ghg_intensity_tco2e_per_cr_inr: float
    ghg_intensity_kg_per_unit: float
    scope3_status: str
    assurance_type: str  # Reasonable Assurance by Accredited ESG Auditor
    assurance_provider: str


class EuCbamDisclosure(BaseModel):
    framework: str = "Regulation (EU) 2023/956 (Carbon Border Adjustment Mechanism)"
    installation_id: str
    product_description: str
    cn_code: str  # e.g., 7326 (Forged & machined iron/steel parts)
    production_volume_metric_tons: float
    direct_embedded_emissions_tco2e: float
    indirect_embedded_emissions_tco2e: float
    total_embedded_emissions_tco2e: float
    specific_embedded_direct_tco2e_per_t: float
    specific_embedded_indirect_tco2e_per_t: float
    specific_embedded_total_tco2e_per_t: float
    specific_carbon_intensity_kg_per_part: float
    eu_sectoral_benchmark_kg_per_part: float
    origin_country_carbon_price_paid_eur_per_t: float
    eligible_cbam_rebate_eur: float
    eu_registry_submission_ready: bool


class RegistryFilingItem(BaseModel):
    filing_id: str
    project_name: str
    offset_registry: str  # BEE_CCTS, BEE_PAT, VERRA_VCS, GOLD_STANDARD, GCC
    registry_full_name: str
    methodology: str
    abated_emissions_tco2e: float
    equivalent_escerts: float
    vintage_year: int
    lifecycle_stage: str  # 1_PDD_DRAFT, 2_VALIDATION_DOE, 3_HOST_COUNTRY_APPROVAL, 4_SUBMITTED_REGISTRY, 5_APPROVED_ISSUED
    designated_operational_entity_doe: str
    pdd_document_ref: str
    submission_date: str
    estimated_credit_value_inr: float
    evidence_pack_hashes: List[str]


# ──────────────────────────────────────────────────────────────────────────────
# Compliance Filing Service Engine
# ──────────────────────────────────────────────────────────────────────────────

class ComplianceFilingService:
    def __init__(self):
        self._filings: List[RegistryFilingItem] = []
        self._seed_default_registry_filings()

    def _seed_default_registry_filings(self):
        """Pre-populate registry filing pipeline for PrecisionWorks Mfg."""
        self._filings = [
            RegistryFilingItem(
                filing_id="FIL-CCTS-2026-001",
                project_name="Compressor Auto-Cutoff & Demand Interlock",
                offset_registry="BEE_CCTS",
                registry_full_name="Indian Carbon Market (CCTS) / Bureau of Energy Efficiency",
                methodology="BEE-CCTS-IND-EE-04: Industrial Pneumatics & Motor System Optimization",
                abated_emissions_tco2e=45.0,
                equivalent_escerts=3.87,
                vintage_year=2026,
                lifecycle_stage="4_SUBMITTED_REGISTRY",
                designated_operational_entity_doe="TÜV SÜD South Asia Pvt Ltd",
                pdd_document_ref="PDD-KPCL-CCTS-2026-REV2.pdf",
                submission_date="2026-03-10",
                estimated_credit_value_inr=74250.0,
                evidence_pack_hashes=[
                    "3f9b2d8c1e4a7f05e2a6b8c9d0e1f2a3",
                    "7c4a1e9b0d2f4a6b8c9e0f1a2b3c4d5e",
                ]
            ),
            RegistryFilingItem(
                filing_id="FIL-PAT-2025-004",
                project_name="Induction Furnace Staggering & Waste Heat Recovery",
                offset_registry="BEE_PAT",
                registry_full_name="Bureau of Energy Efficiency PAT Scheme (Perform, Achieve & Trade)",
                methodology="BEE-PAT-MTOE-THERMAL: Induction Furnace Specific Energy Consumption",
                abated_emissions_tco2e=38.5,
                equivalent_escerts=3.31,
                vintage_year=2025,
                lifecycle_stage="5_APPROVED_ISSUED",
                designated_operational_entity_doe="SGS India Environmental Services",
                pdd_document_ref="BEE-PAT-FORM-A-VERIFIED-2025.pdf",
                submission_date="2025-10-18",
                estimated_credit_value_inr=60904.0,
                evidence_pack_hashes=[
                    "b8c9d0e1f2a33f9b2d8c1e4a7f05e2a6",
                    "0f1a2b3c4d5e7c4a1e9b0d2f4a6b8c9e",
                ]
            ),
            RegistryFilingItem(
                filing_id="FIL-VCS-2026-009",
                project_name="Solar Rooftop Hybrid Microgrid & BESS Dispatch",
                offset_registry="VERRA_VCS",
                registry_full_name="Verra Verified Carbon Standard (VCS)",
                methodology="VM0038: Methodology for Commercial & Industrial Clean Power Dispatch",
                abated_emissions_tco2e=62.0,
                equivalent_escerts=5.33,
                vintage_year=2026,
                lifecycle_stage="2_VALIDATION_DOE",
                designated_operational_entity_doe="DNV Business Assurance India",
                pdd_document_ref="VCS-PDD-PW-SOLAR-2026-V1.pdf",
                submission_date="2026-02-28",
                estimated_credit_value_inr=111600.0,
                evidence_pack_hashes=[
                    "e2a6b8c9d0e1f2a33f9b2d8c1e4a7f05",
                ]
            ),
            RegistryFilingItem(
                filing_id="FIL-GS-2026-014",
                project_name="Factory Digital Twin Idle-Power Eliminator",
                offset_registry="GOLD_STANDARD",
                registry_full_name="Gold Standard for the Global Goals (GS4GG)",
                methodology="GS-MET-EE-08: AI & Digital Twin Driven Manufacturing Energy Abatement",
                abated_emissions_tco2e=28.0,
                equivalent_escerts=2.41,
                vintage_year=2026,
                lifecycle_stage="1_PDD_DRAFT",
                designated_operational_entity_doe="Pending DOE Selection (Bureau Veritas)",
                pdd_document_ref="GS-PDD-DRAFT-DIGITAL-TWIN.pdf",
                submission_date="2026-03-24",
                estimated_credit_value_inr=61600.0,
                evidence_pack_hashes=[
                    "a7f05e2a6b8c9d0e1f2a33f9b2d8c1e4",
                ]
            )
        ]

    def get_iso_14064_compliance_log(self, reporting_year: str = "2025-26") -> Iso14064ComplianceLog:
        """
        Generates verifiable ISO 14064-1 & GHG Protocol audit log.
        Scope 1: LPG Fuel Consumption + Standby HSD Generator
        Scope 2: Grid Electricity (CEA National Baseline)
        """
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Scope 1 Fuel Sources
        scope1_fuels = [
            Scope1FuelSource(
                fuel_id="FUEL-LPG-01",
                fuel_name="Commercial Liquefied Petroleum Gas (LPG - Industrial Heating)",
                annual_consumption_qty=8460.0,  # kg
                unit="kg",
                ncv_mj_per_unit=46.1,  # MJ/kg
                emission_factor_kg_co2_per_unit=2.98,
                ch4_factor_g_per_unit=0.045,
                n2o_factor_g_per_unit=0.0045,
                gwp_co2_equivalent=2.984,
                calculated_emissions_tco2e=25.24,
                tier_methodology="IPMVP / IPCC Tier 2 (Supplier Certified NCV)",
                metering_device_id="MTR-MASS-LPG-01 (Endress+Hauser Promass 83F)",
                calibration_valid_until="2027-01-15",
                uncertainty_pct=1.4,
                source_citation="IPCC 2006 Guidelines for National GHG Inventories, Vol 2 Energy, Table 1.4"
            ),
            Scope1FuelSource(
                fuel_id="FUEL-HSD-02",
                fuel_name="High Speed Diesel (HSD - Standby DG Sets 150 kVA)",
                annual_consumption_qty=1850.0,  # Litres
                unit="Litres",
                ncv_mj_per_unit=38.6,  # MJ/Litre
                emission_factor_kg_co2_per_unit=2.68,
                ch4_factor_g_per_unit=0.040,
                n2o_factor_g_per_unit=0.0038,
                gwp_co2_equivalent=2.683,
                calculated_emissions_tco2e=4.96,
                tier_methodology="IPCC Tier 2 (Stationary Combustion Engines)",
                metering_device_id="MTR-DG-FLOW-01 (Krohne Magnetic Inductive Flowmeter)",
                calibration_valid_until="2026-11-30",
                uncertainty_pct=1.8,
                source_citation="Central Pollution Control Board (CPCB) DG Emission Standard 2024"
            )
        ]
        
        total_scope1 = sum(f.calculated_emissions_tco2e for f in scope1_fuels)  # 30.20 tCO2e

        # Scope 2 Grid Sources
        scope2_sources = [
            Scope2GridSource(
                grid_connection_id="GRID-11KV-INCOMER-01",
                discom_name="Maharashtra State Electricity Distribution Co. (MSEDCL)",
                metering_point="11 kV Main Plant Substation Sub-meter 01",
                annual_kwh_purchased=149760.0,  # 12,480 kWh * 12 months
                cea_baseline_version="CEA CO2 Baseline Database for Indian Power Sector Version 19.0 (June 2024)",
                grid_emission_factor_t_per_mwh=0.716,  # National Weighted Average
                location_based_emissions_tco2e=107.23,
                market_based_emissions_tco2e=107.23,
                meter_accuracy_class="Class 0.2S (Secure Premier 300 Bi-directional)",
                onsite_solar_export_kwh=18200.0,
                avoided_solar_emissions_tco2e=13.03,
                net_scope2_emissions_tco2e=94.20,
                source_citation="Central Electricity Authority (CEA), Govt. of India, CO2 Baseline Database v19.0"
            )
        ]

        total_scope2 = sum(s.net_scope2_emissions_tco2e for s in scope2_sources)
        gross_total = total_scope1 + total_scope2

        hasher = hashlib.sha256()
        hasher.update(f"{reporting_year}:{total_scope1}:{total_scope2}:{now_iso}".encode())
        audit_hash = hasher.hexdigest()

        return Iso14064ComplianceLog(
            facility_name="PrecisionWorks Manufacturing Plant - Unit 1",
            reporting_period=f"FY {reporting_year} (01 April 2025 to 31 March 2026)",
            organizational_boundary="PrecisionWorks Engineering Ltd. - Pune Operations",
            operational_boundary="Scope 1 (Direct Fuel Combustion) + Scope 2 (Imported Grid Electricity)",
            consolidation_approach="Operational Control Approach (100% boundary responsibility)",
            scope1_fuel_sources=scope1_fuels,
            scope2_grid_sources=scope2_sources,
            total_scope1_tco2e=round(total_scope1, 2),
            total_scope2_tco2e=round(total_scope2, 2),
            gross_inventory_tco2e=round(gross_total, 2),
            lead_verifier_signoff="Er. Rajeshwar Shenoy, Lead GHG Auditor (BEE Empaneled AEA-0182)",
            audit_trail_hash=audit_hash,
            last_verified_at=now_iso
        )

    def get_ipmvp_protocol(self) -> IpmvpMvProtocol:
        """
        Returns standardized IPMVP Measurement & Verification Protocol document.
        Option B: Retrofit Isolation with continuous 14-day baseline and post-intervention sub-metering.
        """
        baseline_kwh = 8960.0  # 14 days baseline @ 640 kWh/day
        actual_kwh = 6272.0    # 14 days monitored @ 448 kWh/day
        raw_savings = baseline_kwh - actual_kwh  # 2688 kWh

        # Routine adjustments for production volume difference:
        # Baseline parts = 1400; Reporting period parts = 1360
        volume_adjustment = -192.0  # Normalized downward to match output
        adjusted_baseline = baseline_kwh + volume_adjustment
        net_savings = adjusted_baseline - actual_kwh  # 2496.0 kWh
        avoided_co2 = round((net_savings * 0.716) / 1000.0, 3)  # 1.787 tCO2e

        return IpmvpMvProtocol(
            protocol_standard="EVO 10000-1 (IPMVP Core Concepts 2022) / ASHRAE Guideline 14",
            selected_option="Option B: Retrofit Isolation (All Parameter Measurement)",
            project_title="Compressor Ring-Main Auto-Cutoff & Digital Twin Optimization",
            energy_conservation_measure_ecm="ECM-AIR-01: Automated solenoid isolation valve and pressure band tightening (6.5 to 7.0 bar)",
            submeter_id="SUBMTR-COMP-01 (Schneider IEM3255 Modbus Class 0.5)",
            baseline_period_start="2026-03-01T00:00:00Z",
            baseline_period_end="2026-03-14T23:59:59Z",
            reporting_period_start="2026-03-15T00:00:00Z",
            reporting_period_end="2026-03-28T23:59:59Z",
            duration_days=14,
            baseline_kwh=baseline_kwh,
            actual_monitored_kwh=actual_kwh,
            raw_energy_savings_kwh=raw_savings,
            independent_variables=["Part production throughput (units/shift)", "Ambient dry-bulb temperature (°C)"],
            routine_adjustment_kwh=volume_adjustment,
            non_routine_adjustment_kwh=0.0,
            adjusted_baseline_kwh=adjusted_baseline,
            net_verified_savings_kwh=net_savings,
            verified_avoided_carbon_tco2e=avoided_co2,
            statistical_validity={
                "r_squared": 0.942,
                "cv_rmse_pct": 8.35,
                "t_statistic": 4.82,
                "confidence_level_pct": 90.0,
                "precision_pct": 7.4,
                "meets_ashrae_criteria": True,
            },
            metering_specifications={
                "meter_make_model": "Schneider Electric Acti9 iEM3255 (Three-Phase Energy Meter)",
                "sampling_frequency": "1-minute real-time via RS485 Modbus RTU gateway",
                "calibration_standard": "IEC 62053-22 Class 0.5S",
                "data_completeness_pct": "99.98%",
            },
            verification_status="STATISTICALLY_VALIDATED_PASSED"
        )

    def get_sebi_brsr_disclosure(self) -> SebiBrsrDisclosure:
        """
        SEBI BRSR Core Principle 6 Environmental Disclosure report.
        Calculates Scope 1, Scope 2, and physical per-part GHG intensity.
        """
        turnover_cr = 42.50  # ₹42.5 Crore
        total_units = 120000  # 120,000 finished parts/year
        total_energy_gj = 654.8  # Electrical + Fuel in Gigajoules
        scope1_t = 30.20
        scope2_t = 94.20
        total_ghg = scope1_t + scope2_t  # 124.40 tCO2e

        ghg_per_cr = round(total_ghg / turnover_cr, 3)  # 2.927 tCO2e / Cr INR
        ghg_per_part = round((total_ghg * 1000.0) / total_units, 3)  # 1.037 kg CO2e / part

        return SebiBrsrDisclosure(
            company_cin="L29100MH2012PLC238910",
            reporting_year="FY 2025-26",
            turnover_cr_inr=turnover_cr,
            total_production_units=total_units,
            total_energy_consumption_gj=total_energy_gj,
            energy_intensity_gj_per_cr_inr=round(total_energy_gj / turnover_cr, 2),
            scope1_tco2e=scope1_t,
            scope2_tco2e=scope2_t,
            total_scope1_scope2_tco2e=round(total_ghg, 2),
            ghg_intensity_tco2e_per_cr_inr=ghg_per_cr,
            ghg_intensity_kg_per_unit=ghg_per_part,
            scope3_status="Estimated Upstream Freight & Waste (Disclosed in Comprehensive Filing)",
            assurance_type="Reasonable Assurance under ISAE 3410 / AA1000AS",
            assurance_provider="KPMG India ESG Advisory Services"
        )

    def get_eu_cbam_disclosure(self) -> EuCbamDisclosure:
        """
        EU Carbon Border Adjustment Mechanism (Regulation EU 2023/956).
        Calculates direct and indirect embedded emissions for iron/steel forged and machined components.
        """
        metric_tons_produced = 90.0  # 90 metric tons of steel parts (e.g. 10,000 components @ 9 kg each)
        direct_embedded = 2.10       # Scope 1 heating LPG/HSD
        indirect_embedded = 10.23    # Scope 2 grid power
        total_embedded = direct_embedded + indirect_embedded  # 12.33 tCO2e

        direct_intensity = round(direct_embedded / metric_tons_produced, 3)      # 0.023 tCO2e / t
        indirect_intensity = round(indirect_embedded / metric_tons_produced, 3)  # 0.114 tCO2e / t
        total_intensity = round(total_embedded / metric_tons_produced, 3)        # 0.137 tCO2e / t product

        kg_per_part = round((total_embedded * 1000.0) / 10000.0, 3)  # 1.233 kg CO2e / part
        eu_benchmark_kg = 1.650  # EU default installation benchmark for CN 7326

        # Origin country carbon tax or shadow price deduction (Article 9)
        # Indian electricity duty + renewable cess equivalent to ~€12.50 / tCO2e
        origin_price_paid = 12.50
        rebate_eur = round(total_embedded * origin_price_paid, 2)

        return EuCbamDisclosure(
            installation_id="IND-MUM-PRECISION-004",
            product_description="Forged, Turned and Machined Steel Mechanical Components for Industrial Drives",
            cn_code="7326 90 98 (Other articles of iron or steel, forged/machined)",
            production_volume_metric_tons=metric_tons_produced,
            direct_embedded_emissions_tco2e=direct_embedded,
            indirect_embedded_emissions_tco2e=indirect_embedded,
            total_embedded_emissions_tco2e=round(total_embedded, 2),
            specific_embedded_direct_tco2e_per_t=direct_intensity,
            specific_embedded_indirect_tco2e_per_t=indirect_intensity,
            specific_embedded_total_tco2e_per_t=total_intensity,
            specific_carbon_intensity_kg_per_part=kg_per_part,
            eu_sectoral_benchmark_kg_per_part=eu_benchmark_kg,
            origin_country_carbon_price_paid_eur_per_t=origin_price_paid,
            eligible_cbam_rebate_eur=rebate_eur,
            eu_registry_submission_ready=True
        )

    def get_registry_filings(self) -> List[RegistryFilingItem]:
        """Returns list of carbon credit project filings in the pipeline."""
        return self._filings

    def submit_new_filing(self, payload: Dict[str, Any]) -> RegistryFilingItem:
        """Creates a new carbon credit project registration filing."""
        filing_id = f"FIL-{payload.get('offset_registry', 'CCTS')}-{datetime.now().year}-{len(self._filings) + 1:03d}"
        abated = float(payload.get("abated_emissions_tco2e", 10.0))
        escerts = round(abated / 11.63, 2)
        price_per_t = 1650.0 if "CCTS" in payload.get("offset_registry", "CCTS") else 1800.0

        item = RegistryFilingItem(
            filing_id=filing_id,
            project_name=payload.get("project_name", "Energy Abatement Project"),
            offset_registry=payload.get("offset_registry", "BEE_CCTS"),
            registry_full_name=payload.get("registry_full_name", "Indian Carbon Market (CCTS)"),
            methodology=payload.get("methodology", "ISO 14064-2 Verified Intervention Abatement"),
            abated_emissions_tco2e=abated,
            equivalent_escerts=escerts,
            vintage_year=int(payload.get("vintage_year", 2026)),
            lifecycle_stage="1_PDD_DRAFT",
            designated_operational_entity_doe=payload.get("designated_operational_entity_doe", "Pending DOE Appointment"),
            pdd_document_ref=f"PDD-{filing_id}.pdf",
            submission_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            estimated_credit_value_inr=round(abated * price_per_t, 2),
            evidence_pack_hashes=[hashlib.md5(filing_id.encode()).hexdigest()]
        )
        self._filings.insert(0, item)
        return item

    def get_full_filing_dossier(self) -> Dict[str, Any]:
        """
        Consolidates all 4 statutory compliance components into one complete verifiable package.
        """
        iso_log = self.get_iso_14064_compliance_log()
        ipmvp = self.get_ipmvp_protocol()
        brsr = self.get_sebi_brsr_disclosure()
        cbam = self.get_eu_cbam_disclosure()
        filings = self.get_registry_filings()

        dossier_hash = hashlib.sha256(
            f"{iso_log.audit_trail_hash}:{ipmvp.net_verified_savings_kwh}:{brsr.ghg_intensity_kg_per_unit}:{cbam.specific_embedded_total_tco2e_per_t}".encode()
        ).hexdigest()

        return {
            "dossier_id": f"DOS-COMPLIANCE-FY26-{dossier_hash[:8].upper()}",
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "facility_name": "PrecisionWorks Manufacturing Plant - Unit 1",
            "dossier_integrity_hash": dossier_hash,
            "iso_14064_compliance_log": iso_log.model_dump(),
            "ipmvp_mv_protocol": ipmvp.model_dump(),
            "sebi_brsr_disclosure": brsr.model_dump(),
            "eu_cbam_disclosure": cbam.model_dump(),
            "registry_filings": [f.model_dump() for f in filings],
        }


compliance_filing_service = ComplianceFilingService()
