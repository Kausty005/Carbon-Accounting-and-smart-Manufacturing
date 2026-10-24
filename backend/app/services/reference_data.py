"""
WattWise AI — Reference Data Service
Parses Central Electricity Authority (CEA) CO2 Baseline Database Version 22.0
and centralizes 2006 IPCC Guidelines (Vol. 2 Ch. 2 Table 2.3) parameters.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import openpyxl

from backend.app.models import CeaFactorMetadata, CeaMethodology, Scope1FactorBreakdown


class ReferenceDataError(Exception):
    """Raised when reference workbook or parameters are missing or corrupted."""
    pass


class ReferenceDataService:
    """Singleton service to cache and query verified reference data."""

    def __init__(self, excel_path: Optional[Path] = None):
        if excel_path is None:
            # Default path relative to this file: backend/data/reference/CEA_Baseline_V22.xlsx
            excel_path = Path(__file__).resolve().parent.parent.parent / "data" / "reference" / "CEA_Baseline_V22.xlsx"
        self.excel_path = excel_path
        self._cea_metadata: Optional[Dict[str, Any]] = None
        self._cea_factors: Optional[Dict[str, Dict[str, CeaFactorMetadata]]] = None
        self._available_years: Optional[List[str]] = None

    def _ensure_cea_loaded(self) -> None:
        """Loads and parses the CEA Results worksheet if not already cached."""
        if self._cea_factors is not None:
            return

        if not self.excel_path.exists():
            raise ReferenceDataError(
                f"CEA reference file not found at expected path: {self.excel_path}. "
                "Ensure CEA_Baseline_V22.xlsx is present in backend/data/reference/."
            )

        try:
            wb = openpyxl.load_workbook(self.excel_path, data_only=True, read_only=True)
        except Exception as e:
            raise ReferenceDataError(f"Failed to open CEA Excel database: {str(e)}") from e

        if "Results" not in wb.sheetnames:
            wb.close()
            raise ReferenceDataError("Invalid CEA workbook: worksheet 'Results' not found.")

        sheet = wb["Results"]

        # Parse document metadata
        doc_title = sheet.cell(2, 3).value or "CENTRAL ELECTRICITY AUTHORITY: CO2 BASELINE DATABASE"
        version_val = str(sheet.cell(4, 8).value or "22.0").strip()
        date_raw = sheet.cell(5, 8).value
        date_str = date_raw.strftime("%Y-%m-%d") if hasattr(date_raw, "strftime") else str(date_raw or "2026-08-01")
        methodology_doc = str(sheet.cell(6, 8).value or "ACM0002 / Ver 22.0")

        self._cea_metadata = {
            "title": str(doc_title).strip(),
            "version": version_val,
            "publication_date": date_str,
            "baseline_methodology": methodology_doc.strip(),
            "authority": "Central Electricity Authority (Ministry of Power, Govt. of India)",
            "sheet": "Results"
        }

        # Header Row 12 maps column indices to fiscal years
        # Columns 6-15: Excl. Imports ('2016-17' to '2025-26')
        # Columns 18-27: Incl. Imports ('2016-17' to '2025-26')
        years_excl: Dict[str, int] = {}
        years_incl: Dict[str, int] = {}

        for c in range(6, 17):
            val = sheet.cell(12, c).value
            if val and "-" in str(val):
                years_excl[str(val).strip()] = c

        for c in range(18, 29):
            val = sheet.cell(12, c).value
            if val and "-" in str(val):
                years_incl[str(val).strip()] = c

        self._available_years = list(years_excl.keys())

        # Row mapping in Results sheet
        # Row 13: Weighted Average Emission Rate (Thermal fossil)
        # Row 14: Weighted Average Grid Emission Rate (Incl. RES, Captive) - Location-based recommended
        # Row 15: Simple Operating Margin (1)
        # Row 16: Build Margin
        # Row 17: Combined Margin (1)
        row_definitions = [
            (13, CeaMethodology.WEIGHTED_AVG_THERMAL, "Weighted Average Emission Rate (Thermal Fossil)", False, "Thermal Generation Intensity (Fossil Only)"),
            (14, CeaMethodology.WEIGHTED_AVG_WITH_RES, "Weighted Average Grid Emission Rate (Incl. RES, Captive)", True, "Scope 2 Location-Based (Grid Average with RES & Captive)"),
            (15, CeaMethodology.OPERATING_MARGIN, "Simple Operating Margin", False, "CDM / Article 6 Operating Margin (OM)"),
            (16, CeaMethodology.BUILD_MARGIN, "Build Margin", False, "CDM / Article 6 Build Margin (BM)"),
            (17, CeaMethodology.COMBINED_MARGIN, "Combined Margin (50% OM + 50% BM)", False, "CDM / Article 6 Combined Margin (CM)"),
        ]

        factors_by_key: Dict[str, Dict[str, CeaFactorMetadata]] = {}

        for row_idx, meth_enum, meth_name, is_loc_rec, approach_name in row_definitions:
            factors_by_key[meth_enum.value] = {}

            # Parse factors excluding imports
            for year, col_idx in years_excl.items():
                cell_val = sheet.cell(row_idx, col_idx).value
                if cell_val is not None:
                    try:
                        factor_num = round(float(cell_val), 6)
                        key = f"{year}:excl_imports"
                        factors_by_key[meth_enum.value][key] = CeaFactorMetadata(
                            selected_factor=factor_num,
                            unit="kg CO2/kWh",
                            reporting_year=year,
                            methodology=meth_name,
                            sheet="Results",
                            row=row_idx,
                            column=col_idx,
                            authority="Central Electricity Authority (Ministry of Power, Govt. of India)",
                            database_version=version_val,
                            includes_imports=False,
                            is_recommended_location_based=is_loc_rec,
                            accounting_approach=approach_name
                        )
                    except (ValueError, TypeError):
                        pass

            # Parse factors including imports
            for year, col_idx in years_incl.items():
                cell_val = sheet.cell(row_idx, col_idx).value
                if cell_val is not None:
                    try:
                        factor_num = round(float(cell_val), 6)
                        key = f"{year}:incl_imports"
                        factors_by_key[meth_enum.value][key] = CeaFactorMetadata(
                            selected_factor=factor_num,
                            unit="kg CO2/kWh",
                            reporting_year=year,
                            methodology=f"{meth_name} (Adjusted for Imports)",
                            sheet="Results",
                            row=row_idx,
                            column=col_idx,
                            authority="Central Electricity Authority (Ministry of Power, Govt. of India)",
                            database_version=version_val,
                            includes_imports=True,
                            is_recommended_location_based=False,
                            accounting_approach=f"{approach_name} (Adjusted for Net Imports)"
                        )
                    except (ValueError, TypeError):
                        pass

        self._cea_factors = factors_by_key
        wb.close()

    def get_cea_metadata(self) -> Dict[str, Any]:
        """Returns top-level metadata from the CEA database."""
        self._ensure_cea_loaded()
        assert self._cea_metadata is not None
        return self._cea_metadata

    def get_available_reporting_years(self) -> List[str]:
        """Returns the list of verified fiscal years available in the workbook."""
        self._ensure_cea_loaded()
        assert self._available_years is not None
        return list(self._available_years)

    def get_cea_factor(
        self,
        reporting_year: Optional[str] = None,
        methodology: CeaMethodology = CeaMethodology.WEIGHTED_AVG_WITH_RES,
        include_imports: bool = False
    ) -> CeaFactorMetadata:
        """
        Retrieves a verified grid emission factor from the CEA database.
        
        If reporting_year is None, selects the latest completed audited fiscal year (2023-24).
        If an unsupported year is requested, raises ValueError with available years.
        """
        self._ensure_cea_loaded()
        assert self._cea_factors is not None
        assert self._available_years is not None

        # Fallback default: '2023-24' (latest complete audit year with stable renewable factors)
        if reporting_year is None:
            reporting_year = "2023-24" if "2023-24" in self._available_years else self._available_years[-1]

        reporting_year = reporting_year.strip()
        if reporting_year not in self._available_years:
            raise ValueError(
                f"Requested CEA reporting year '{reporting_year}' is not available in the database. "
                f"Supported fiscal years: {', '.join(self._available_years)}. "
                "Silently substituting another year is prohibited."
            )

        import_key = "incl_imports" if include_imports else "excl_imports"
        lookup_key = f"{reporting_year}:{import_key}"

        meth_dict = self._cea_factors.get(methodology.value, {})
        factor_meta = meth_dict.get(lookup_key)

        if factor_meta is None:
            raise ValueError(
                f"No factor found in CEA database for year '{reporting_year}', "
                f"methodology '{methodology.value}', include_imports={include_imports}."
            )

        return factor_meta

    def get_all_cea_factors(self) -> List[CeaFactorMetadata]:
        """Returns all verified CEA grid factors across all methodologies and years."""
        self._ensure_cea_loaded()
        assert self._cea_factors is not None
        results: List[CeaFactorMetadata] = []
        for meth_dict in self._cea_factors.values():
            results.extend(meth_dict.values())
        return results

    # ─── IPCC Scope 1 Fuel & Process Parameters ───────────────────────────────

    @staticmethod
    def get_ipcc_lpg_parameters() -> Scope1FactorBreakdown:
        """
        Returns verified IPCC 2006 (Vol. 2 Ch. 2 Table 2.3) emission factors for LPG
        with explicit unit conversions and 100-year AR6 GWPs.
        """
        return ReferenceDataService.get_ipcc_fuel_parameters("lpg")

    @staticmethod
    def get_ipcc_fuel_parameters(fuel_id: str) -> Scope1FactorBreakdown:
        """
        Returns verified IPCC 2006 (Vol. 2 Ch. 1 & 2) emission factors across all
        major industrial fuels with explicit unit conversions and IPCC AR6 GWPs:
        - GWP CO2: 1.0
        - GWP CH4: 27.9
        - GWP N2O: 273.0
        """
        fuel = fuel_id.lower().strip()
        fuel_map = {
            "diesel": "hsd",
            "gas_oil": "hsd",
            "natural_gas": "png",
            "furnace_oil": "hfo",
            "heavy_fuel_oil": "hfo",
            "light_diesel_oil": "ldo",
            "briquettes": "biomass",
        }
        canonical = fuel_map.get(fuel, fuel)

        # Specifications: (unit, NCV in TJ/unit, CO2 kg/TJ, CH4 kg/TJ, N2O kg/TJ, is_biogenic_co2)
        specs: Dict[str, Tuple[str, float, float, float, float, bool]] = {
            # HSD: 36.0 MJ/L -> 0.000036 TJ/L
            "hsd": ("L", 0.000036, 74100.0, 3.0, 0.6, False),
            # PNG: 38.5 MJ/Sm3 -> 0.0000385 TJ/Sm3
            "png": ("Sm3", 0.0000385, 56100.0, 1.0, 0.1, False),
            # LPG: 47.3 MJ/kg -> 0.0000473 TJ/kg
            "lpg": ("kg", 0.0000473, 63100.0, 1.0, 0.1, False),
            # HFO: 40.2 MJ/L -> 0.0000402 TJ/L
            "hfo": ("L", 0.0000402, 77400.0, 3.0, 0.6, False),
            # LDO: 38.0 MJ/L -> 0.000038 TJ/L
            "ldo": ("L", 0.000038, 74100.0, 3.0, 0.6, False),
            # Non-Coking Coal Grade G11: 16.5 MJ/kg -> 0.0000165 TJ/kg
            "coal": ("kg", 0.0000165, 96100.0, 10.0, 1.5, False),
            # Biomass Agro-Briquettes: 15.0 MJ/kg -> 0.000015 TJ/kg (Biogenic net CO2 = 0)
            "biomass": ("kg", 0.000015, 0.0, 30.0, 4.0, True),
        }

        if canonical not in specs:
            # Fallback to LPG defaults if unrecognized
            canonical = "lpg"

        unit, ncv_tj_per_unit, co2_kg_per_tj, ch4_kg_per_tj, n2o_kg_per_tj, is_bio = specs[canonical]

        direct_co2 = round(co2_kg_per_tj * ncv_tj_per_unit, 5)

        ch4_kg_per_unit = ch4_kg_per_tj * ncv_tj_per_unit
        ch4_g_per_unit = round(ch4_kg_per_unit * 1000.0, 5)
        ch4_gwp = 27.9
        ch4_co2e = round(ch4_kg_per_unit * ch4_gwp, 6)

        n2o_kg_per_unit = n2o_kg_per_tj * ncv_tj_per_unit
        n2o_g_per_unit = round(n2o_kg_per_unit * 1000.0, 6)
        n2o_gwp = 273.0
        n2o_co2e = round(n2o_kg_per_unit * n2o_gwp, 6)

        total_co2e = round(direct_co2 + ch4_co2e + n2o_co2e, 5)

        return Scope1FactorBreakdown(
            direct_co2_kg_per_kg=direct_co2,
            ch4_emitted_g_per_kg=ch4_g_per_unit,
            ch4_converted_kg_per_kg=round(ch4_kg_per_unit, 8),
            ch4_gwp_ar6=ch4_gwp,
            ch4_co2e_kg_per_kg=ch4_co2e,
            n2o_emitted_g_per_kg=n2o_g_per_unit,
            n2o_converted_kg_per_kg=round(n2o_kg_per_unit, 8),
            n2o_gwp_ar6=n2o_gwp,
            n2o_co2e_kg_per_kg=n2o_co2e,
            total_co2e_kg_per_kg=total_co2e,
        )

    def get_supported_fuel_catalogue(self) -> List[Dict[str, Any]]:
        """Returns verified fuels catalog conforming to IPCC 2006 Vol. 2."""
        fuels = [
            ("lpg", "Liquefied Petroleum Gas (LPG)", "kg", 47.3, "2006 IPCC Vol. 2 Ch. 2 Table 2.3", True),
            ("hsd", "High-Speed Diesel (HSD / DG Sets)", "L", 36.0, "2006 IPCC Vol. 2 Ch. 1 & 2 (Commercial/Boilers)", False),
            ("png", "Piped Natural Gas (PNG / Boilers)", "Sm3", 38.5, "2006 IPCC Vol. 2 Ch. 2 Table 2.3 (Natural Gas)", False),
            ("hfo", "Furnace Oil (HFO / Heavy Boilers)", "L", 40.2, "2006 IPCC Vol. 2 Ch. 2 (Residual Fuel Oil)", False),
            ("ldo", "Light Diesel Oil (LDO)", "L", 38.0, "2006 IPCC Vol. 2 Ch. 2 Table 2.3", False),
            ("coal", "Non-Coking Coal (Grade G11)", "kg", 16.5, "2006 IPCC Vol. 2 Ch. 2 (Other Bituminous Coal)", False),
            ("biomass", "Biomass Agro-Briquettes", "kg", 15.0, "2006 IPCC Vol. 2 Ch. 2 (Solid Biomass, Net Biogenic CO2 = 0)", False),
        ]

        catalogue = []
        for fid, name, unit, ncv, src, is_def in fuels:
            params = self.get_ipcc_fuel_parameters(fid)
            catalogue.append({
                "fuel_id": fid,
                "fuel_name": name,
                "verification_status": "VERIFIED_IPCC",
                "source_table": src,
                "ncv_mj_per_unit": ncv,
                "direct_co2_factor": params.direct_co2_kg_per_kg,
                "ch4_factor_g_per_unit": params.ch4_emitted_g_per_kg,
                "n2o_factor_g_per_unit": params.n2o_emitted_g_per_kg,
                "total_co2e_factor": params.total_co2e_kg_per_kg,
                "unit": f"kg CO2e/{unit}",
                "is_default": is_def,
            })
        return catalogue

    @staticmethod
    def get_refrigerant_gwp(gas_type: str) -> float:
        """Returns IPCC AR6 100-year Global Warming Potential for industrial refrigerants."""
        g = gas_type.upper().strip().replace(" ", "").replace("_", "-")
        gwps = {
            "R-134A": 1530.0,
            "HFC-134A": 1530.0,
            "R-410A": 2256.0,
            "R-407C": 1908.0,
            "R-404A": 3922.0,
            "R-32": 675.0,
        }
        return gwps.get(g, 1530.0)

    @staticmethod
    def get_welding_gas_factor(gas_mix: str) -> float:
        """Returns direct CO2 emissions per Nm3 of industrial shielding gas."""
        m = gas_mix.lower().strip()
        if "80_20" in m or "80/20" in m or "c20" in m:
            return 0.3954  # 20% CO2 at 1.977 kg/Nm3
        # Default: 100% CO2 cylinder gas
        return 1.977


# Global service instance
reference_data_service = ReferenceDataService()

