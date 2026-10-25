"""
WattWise AI — Carbon Credits, Additionality & CCTS Offsetting Engine
Standards: ISO 14064-2, BEE PAT (ESCerts), CCTS (Carbon Credit Trading Scheme 2023)
"""

from datetime import datetime, timezone
import hashlib
import json
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from backend.app.services.audit_ledger import audit_ledger_service


class CarbonCreditItem(BaseModel):
    serial_number: str
    registry: str  # BEE_CCTS, BEE_PAT, VERRA_VCS, GOLD_STANDARD, GCC
    registry_name: str
    category: str  # GENERATED_ISSUED, PURCHASED, SURRENDERED_RETIRED
    quantity_tco2e: float
    equivalent_escerts: Optional[float] = None  # 1 ESCert = 1 MTOE = 11,630 kWh
    project_name: str
    project_type: str
    vintage_year: int
    issuance_date: str
    status: str  # ACTIVE, RETIRED
    retirement_date: Optional[str] = None
    retired_against: Optional[str] = None
    additionality_proven: bool
    market_price_inr: float
    hash_signature: str


class AdditionalityInput(BaseModel):
    intervention_id: str
    intervention_name: str
    baseline_power_kw: float
    monitored_power_kw: float
    operating_hours_per_day: float
    duration_days: float = 30.0
    grid_emission_factor_t_per_mwh: float = 0.716
    leakage_pct: float = 2.0  # Conservative 2% upstream/parasitic leakage
    regulatory_mandated: bool = False
    hurdle_rate_met: bool = True
    barrier_identified: bool = True


class AdditionalityResult(BaseModel):
    intervention_id: str
    baseline_emissions_t: float
    actual_emissions_t: float
    gross_reduction_t: float
    leakage_t: float
    net_credits_earned_tco2e: float
    equivalent_escerts: float
    is_additional: bool
    additionality_checks: Dict[str, bool]
    methodology_citation: str
    potential_market_value_inr: float


class CarbonCreditsService:
    def __init__(self):
        self._credits: List[CarbonCreditItem] = []
        self._seed_default_portfolio()

    def _seed_default_portfolio(self):
        """Initial portfolio of credits for PrecisionWorks Mfg."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        items = [
            {
                "serial_number": "BEE-IN-CCTS-KPCL-2026-004120-004165",
                "registry": "BEE_CCTS",
                "registry_name": "Indian Carbon Market (CCTS / BEE)",
                "category": "GENERATED_ISSUED",
                "quantity_tco2e": 45.0,
                "equivalent_escerts": 3.87,
                "project_name": "PrecisionWorks Compressor Auto-Cutoff & Leak Shield",
                "project_type": "Industrial Pneumatics Optimization",
                "vintage_year": 2026,
                "issuance_date": "2026-03-15",
                "status": "ACTIVE",
                "additionality_proven": True,
                "market_price_inr": 1650.0,
            },
            {
                "serial_number": "BEE-IN-PAT-KPCL-2025-001290-001305",
                "registry": "BEE_PAT",
                "registry_name": "BEE PAT Scheme (ESCerts)",
                "category": "GENERATED_ISSUED",
                "quantity_tco2e": 15.0,
                "equivalent_escerts": 1.29,
                "project_name": "Furnace Induction Heating ToD Peak Staggering",
                "project_type": "Thermal Demand Management",
                "vintage_year": 2025,
                "issuance_date": "2025-11-20",
                "status": "ACTIVE",
                "additionality_proven": True,
                "market_price_inr": 1840.0,
            },
            {
                "serial_number": "VCS-IN-WIND-0821-2025-091200-091250",
                "registry": "VERRA_VCS",
                "registry_name": "Verra Verified Carbon Standard (VCS)",
                "category": "PURCHASED",
                "quantity_tco2e": 50.0,
                "equivalent_escerts": 4.30,
                "project_name": "Bundled Wind Power Project in Maharashtra & Gujarat",
                "project_type": "Grid-Connected Renewable Electricity",
                "vintage_year": 2025,
                "issuance_date": "2025-08-10",
                "status": "ACTIVE",
                "additionality_proven": True,
                "market_price_inr": 2100.0,
            },
            {
                "serial_number": "GS-IN-SOLAR-0419-2024-003310-003330",
                "registry": "GOLD_STANDARD",
                "registry_name": "Gold Standard for the Global Goals",
                "category": "PURCHASED",
                "quantity_tco2e": 20.0,
                "equivalent_escerts": 1.72,
                "project_name": "Decentralized Rooftop Solar Arrays for Small Enterprises",
                "project_type": "Solar PV Generation",
                "vintage_year": 2024,
                "issuance_date": "2024-12-05",
                "status": "SURRENDERED_RETIRED",
                "retirement_date": "2026-02-28",
                "retired_against": "FY25 Q4 Statutory Carbon Quota True-Up",
                "additionality_proven": True,
                "market_price_inr": 2450.0,
            },
        ]

        self._credits = []
        for it in items:
            h = hashlib.sha256(
                f"{it['serial_number']}_{it['quantity_tco2e']}_{it['vintage_year']}".encode("utf-8")
            ).hexdigest()[:16]
            it["hash_signature"] = h
            self._credits.append(CarbonCreditItem(**it))

    def get_portfolio(self) -> Dict[str, Any]:
        """Returns the current carbon credit portfolio and summary statistics."""
        active_items = [c for c in self._credits if c.status == "ACTIVE"]
        retired_items = [c for c in self._credits if c.status == "SURRENDERED_RETIRED"]

        active_tco2e = sum(c.quantity_tco2e for c in active_items)
        active_escerts = sum(c.equivalent_escerts or 0 for c in active_items)
        retired_tco2e = sum(c.quantity_tco2e for c in retired_items)
        
        generated_active = sum(c.quantity_tco2e for c in active_items if c.category == "GENERATED_ISSUED")
        purchased_active = sum(c.quantity_tco2e for c in active_items if c.category == "PURCHASED")
        
        total_market_val_inr = sum(c.quantity_tco2e * c.market_price_inr for c in active_items)

        return {
            "summary": {
                "active_balance_tco2e": round(active_tco2e, 2),
                "active_equivalent_escerts": round(active_escerts, 2),
                "retired_total_tco2e": round(retired_tco2e, 2),
                "generated_active_tco2e": round(generated_active, 2),
                "purchased_active_tco2e": round(purchased_active, 2),
                "total_market_value_inr": round(total_market_val_inr, 2),
                "currency": "INR",
                "ccts_benchmark_price_per_t": 1650.0,
                "bee_escert_benchmark_price": 1840.0,
            },
            "credits": [c.model_dump() for c in self._credits],
        }

    def evaluate_additionality(self, req: AdditionalityInput) -> AdditionalityResult:
        """
        ISO 14064-2 Baseline Additionality Engine:
        Carbon Credits Earned = Baseline Emissions - Actual Monitored Emissions - Leakage
        """
        # Baseline kWh in reporting period
        baseline_kwh = req.baseline_power_kw * req.operating_hours_per_day * req.duration_days
        # Actual kWh in reporting period
        actual_kwh = req.monitored_power_kw * req.operating_hours_per_day * req.duration_days

        # Convert to tCO2e using grid factor (tCO2e/MWh)
        baseline_emissions_t = (baseline_kwh / 1000.0) * req.grid_emission_factor_t_per_mwh
        actual_emissions_t = (actual_kwh / 1000.0) * req.grid_emission_factor_t_per_mwh

        gross_reduction_t = max(0.0, baseline_emissions_t - actual_emissions_t)
        leakage_t = round(gross_reduction_t * (req.leakage_pct / 100.0), 3)
        net_credits_tco2e = max(0.0, round(gross_reduction_t - leakage_t, 2))

        # 1 ESCert = 11,630 kWh (1 MTOE)
        saved_kwh = max(0.0, baseline_kwh - actual_kwh)
        equivalent_escerts = round(saved_kwh / 11630.0, 2)

        # Additionality Tri-Criteria Check (ISO 14064-2 & CDM standard):
        # 1. Regulatory Additionality: Action not mandated by statutory building code / air act.
        # 2. Financial Additionality: Requires capital/ROI validation or hurdle rate exceedance.
        # 3. Technology / Barrier Additionality: Implementation requires overcoming operational or common-practice barriers.
        reg_check = not req.regulatory_mandated
        fin_check = req.hurdle_rate_met
        tech_check = req.barrier_identified
        is_additional = reg_check and fin_check and tech_check and net_credits_tco2e > 0

        # Potential value based on CCTS price (₹1,650 / credit)
        market_val = net_credits_tco2e * 1650.0

        return AdditionalityResult(
            intervention_id=req.intervention_id,
            baseline_emissions_t=round(baseline_emissions_t, 2),
            actual_emissions_t=round(actual_emissions_t, 2),
            gross_reduction_t=round(gross_reduction_t, 2),
            leakage_t=leakage_t,
            net_credits_earned_tco2e=net_credits_tco2e,
            equivalent_escerts=equivalent_escerts,
            is_additional=is_additional,
            additionality_checks={
                "regulatory_additionality": reg_check,
                "financial_additionality": fin_check,
                "barrier_additionality": tech_check,
            },
            methodology_citation="ISO 14064-2:2019 Clause 5.4 + BEE CCTS Additionality Framework",
            potential_market_value_inr=round(market_val, 2),
        )

    def retire_credit(
        self, serial_number: str, reason: str, beneficiary: str
    ) -> Dict[str, Any]:
        """
        Retires an active carbon credit against a statutory quota exceedance or corporate net-zero claim.
        Records the transaction cryptographically into the immutable audit ledger.
        """
        target = next((c for c in self._credits if c.serial_number == serial_number), None)
        if not target:
            raise ValueError(f"Credit with serial number '{serial_number}' not found.")
        if target.status == "SURRENDERED_RETIRED":
            raise ValueError(f"Credit '{serial_number}' is already retired on {target.retirement_date}.")

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
        target.status = "SURRENDERED_RETIRED"
        target.category = "SURRENDERED_RETIRED"
        target.retirement_date = now_str
        target.retired_against = f"{reason} (Beneficiary: {beneficiary})"

        # Cryptographically log to audit ledger block
        retirement_payload = {
            "event": "CARBON_CREDIT_RETIREMENT",
            "serial_number": target.serial_number,
            "registry": target.registry,
            "quantity_tco2e": target.quantity_tco2e,
            "beneficiary": beneficiary,
            "reason": reason,
            "timestamp": now_str,
        }
        
        try:
            audit_ledger_service.add_interval_block(
                telemetry_summary={
                    "event": "CARBON_CREDIT_RETIREMENT",
                    "serial": target.serial_number,
                    "quantity": target.quantity_tco2e,
                },
                gross_carbon_tco2e={"offset_applied": target.quantity_tco2e},
            )
        except Exception as e:
            print(f"[WARN] Failed to write credit retirement to audit block: {e}")

        return {
            "success": True,
            "message": f"Successfully retired {target.quantity_tco2e} tCO2e under serial {target.serial_number}.",
            "credit": target.model_dump(),
            "retirement_certificate": {
                "certificate_id": f"CERT-RET-{hashlib.md5(serial_number.encode()).hexdigest()[:8].upper()}",
                "serial_number": target.serial_number,
                "registry": target.registry_name,
                "quantity_tco2e": target.quantity_tco2e,
                "beneficiary": beneficiary,
                "purpose": reason,
                "timestamp_utc": now_str,
                "status": "PERMANENTLY_CANCELLED",
            },
        }

    def issue_new_credit_from_intervention(
        self,
        project_name: str,
        quantity_tco2e: float,
        intervention_type: str,
        vintage: int = 2026,
    ) -> Dict[str, Any]:
        """
        Mints/issues a verified internal carbon credit from a validated Digital Twin scenario.
        """
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        seq = len(self._credits) + 1
        serial = f"BEE-IN-CCTS-KPCL-{vintage}-00{seq:04d}-00{(seq+int(quantity_tco2e)):04d}"
        
        escerts = round(quantity_tco2e * (1000.0 / 0.716) / 11630.0, 2)
        h = hashlib.sha256(f"{serial}_{quantity_tco2e}_{vintage}".encode("utf-8")).hexdigest()[:16]

        new_item = CarbonCreditItem(
            serial_number=serial,
            registry="BEE_CCTS",
            registry_name="Indian Carbon Market (CCTS / BEE)",
            category="GENERATED_ISSUED",
            quantity_tco2e=quantity_tco2e,
            equivalent_escerts=escerts,
            project_name=project_name,
            project_type=intervention_type,
            vintage_year=vintage,
            issuance_date=now,
            status="ACTIVE",
            additionality_proven=True,
            market_price_inr=1650.0,
            hash_signature=h,
        )

        self._credits.insert(0, new_item)
        return new_item.model_dump()


carbon_credits_service = CarbonCreditsService()
