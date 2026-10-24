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
            (13, CeaMethodology.WEIGHTED_AVG_THERMAL, "Weighted Average Emission Rate (Thermal Fossil)", False),
            (14, CeaMethodology.WEIGHTED_AVG_WITH_RES, "Weighted Average Grid Emission Rate (Incl. RES, Captive)", True),
            (15, CeaMethodology.OPERATING_MARGIN, "Simple Operating Margin", False),
            (16, CeaMethodology.BUILD_MARGIN, "Build Margin", False),
            (17, CeaMethodology.COMBINED_MARGIN, "Combined Margin (50% OM + 50% BM)", False),
        ]

        factors_by_key: Dict[str, Dict[str, CeaFactorMetadata]] = {}

        for row_idx, meth_enum, meth_name, is_loc_rec in row_definitions:
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
                            is_recommended_location_based=is_loc_rec
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
                            is_recommended_location_based=False
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

    # ─── IPCC Scope 1 Fuel Parameters ──────────────────────────────────────────

    @staticmethod
    def get_ipcc_lpg_parameters() -> Scope1FactorBreakdown:
        """
        Returns verified IPCC 2006 (Vol. 2 Ch. 2 Table 2.3) emission factors for LPG
        with explicit unit conversions and 100-year AR6 GWPs.
        
        Calculations:
        - LPG NCV: 47.3 TJ/Gg = 0.0000473 TJ/kg (IPCC Vol. 2 Ch. 1 Table 1.2)
        - CO2 Factor: 63,100 kg CO2/TJ -> 63,100 * 0.0000473 = 2.98463 kg CO2/kg LPG
        - CH4 Factor: 1.0 kg CH4/TJ -> 1.0 * 0.0000473 = 0.0473 g CH4/kg LPG = 0.0000473 kg CH4/kg LPG
          GWP AR6: 27.9 -> 0.0000473 * 27.9 = 0.001320 kg CO2e/kg LPG
        - N2O Factor: 0.1 kg N2O/TJ -> 0.1 * 0.0000473 = 0.00473 g N2O/kg LPG = 0.00000473 kg N2O/kg LPG
          GWP AR6: 273.0 -> 0.00000473 * 273.0 = 0.001291 kg CO2e/kg LPG
        - Total CO2e: 2.98463 + 0.001320 + 0.001291 = 2.987241 kg CO2e/kg LPG
        """
        ncv_tj_per_kg = 0.0000473  # 47.3 TJ/Gg

        # Direct CO2
        co2_kg_per_tj = 63100.0
        direct_co2 = round(co2_kg_per_tj * ncv_tj_per_kg, 5)  # 2.98463 kg CO2/kg

        # CH4
        ch4_kg_per_tj = 1.0
        ch4_kg_per_kg = ch4_kg_per_tj * ncv_tj_per_kg  # 0.0000473 kg CH4/kg
        ch4_g_per_kg = round(ch4_kg_per_kg * 1000.0, 4)  # 0.0473 g CH4/kg
        ch4_gwp = 27.9  # IPCC AR6 100-year GWP
        ch4_co2e = round(ch4_kg_per_kg * ch4_gwp, 6)  # 0.001320 kg CO2e/kg

        # N2O
        n2o_kg_per_tj = 0.1
        n2o_kg_per_kg = n2o_kg_per_tj * ncv_tj_per_kg  # 0.00000473 kg N2O/kg
        n2o_g_per_kg = round(n2o_kg_per_kg * 1000.0, 5)  # 0.00473 g N2O/kg
        n2o_gwp = 273.0  # IPCC AR6 100-year GWP
        n2o_co2e = round(n2o_kg_per_kg * n2o_gwp, 6)  # 0.001291 kg CO2e/kg

        total_co2e = round(direct_co2 + ch4_co2e + n2o_co2e, 5)  # 2.98724 kg CO2e/kg

        return Scope1FactorBreakdown(
            direct_co2_kg_per_kg=direct_co2,
            ch4_emitted_g_per_kg=ch4_g_per_kg,
            ch4_converted_kg_per_kg=round(ch4_kg_per_kg, 8),
            ch4_gwp_ar6=ch4_gwp,
            ch4_co2e_kg_per_kg=ch4_co2e,
            n2o_emitted_g_per_kg=n2o_g_per_kg,
            n2o_converted_kg_per_kg=round(n2o_kg_per_kg, 8),
            n2o_gwp_ar6=n2o_gwp,
            n2o_co2e_kg_per_kg=n2o_co2e,
            total_co2e_kg_per_kg=total_co2e
        )

    def get_supported_fuel_catalogue(self) -> List[Dict[str, Any]]:
        """Returns verified fuels and unverified custom placeholders."""
        lpg = self.get_ipcc_lpg_parameters()
        return [
            {
                "fuel_id": "lpg",
                "fuel_name": "Liquefied Petroleum Gases (LPG)",
                "verification_status": "VERIFIED_IPCC",
                "source_table": "2006 IPCC Guidelines Vol. 2 Ch. 2 Table 2.3 (Manufacturing Industries)",
                "ncv_mj_per_kg": 47.3,
                "direct_co2_factor": lpg.direct_co2_kg_per_kg,
                "ch4_factor_g_per_kg": lpg.ch4_emitted_g_per_kg,
                "n2o_factor_g_per_kg": lpg.n2o_emitted_g_per_kg,
                "total_co2e_factor": lpg.total_co2e_kg_per_kg,
                "unit": "kg CO2e/kg fuel",
                "is_default": True
            },
            {
                "fuel_id": "diesel",
                "fuel_name": "Gas/Diesel Oil (Placeholder)",
                "verification_status": "PENDING_VERIFICATION",
                "note": "Unverified default. Requires user-supplied custom_emission_factor or lab assay.",
                "is_default": False
            },
            {
                "fuel_id": "natural_gas",
                "fuel_name": "Natural Gas (Placeholder)",
                "verification_status": "PENDING_VERIFICATION",
                "note": "Unverified default. Requires pipeline gas composition certificate.",
                "is_default": False
            }
        ]


# Global service instance
reference_data_service = ReferenceDataService()
