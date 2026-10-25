/**
 * Compliance Filing & Documentation API Client
 * Provides integration for:
 * 1. ISO 14064-1 & GHG Protocol Scope 1/2 verifiable calculation log
 * 2. IPMVP Measurement & Verification (M&V) Option B/C protocol
 * 3. SEBI BRSR Core Principle 6 & EU CBAM Export Disclosures
 * 4. Carbon Credit Issuance & Offset Registry Pipeline
 */

const API_BASE = 'http://127.0.0.1:8000/api/v1/carbon/compliance';

export interface Scope1FuelSource {
  fuel_id: string;
  fuel_name: string;
  annual_consumption_qty: number;
  unit: string;
  ncv_mj_per_unit: number;
  emission_factor_kg_co2_per_unit: number;
  ch4_factor_g_per_unit: number;
  n2o_factor_g_per_unit: number;
  gwp_co2_equivalent: number;
  calculated_emissions_tco2e: number;
  tier_methodology: string;
  metering_device_id: string;
  calibration_valid_until: string;
  uncertainty_pct: number;
  source_citation: string;
}

export interface Scope2GridSource {
  grid_connection_id: string;
  discom_name: string;
  metering_point: string;
  annual_kwh_purchased: number;
  cea_baseline_version: string;
  grid_emission_factor_t_per_mwh: number;
  location_based_emissions_tco2e: number;
  market_based_emissions_tco2e: number;
  meter_accuracy_class: string;
  onsite_solar_export_kwh: number;
  avoided_solar_emissions_tco2e: number;
  net_scope2_emissions_tco2e: number;
  source_citation: string;
}

export interface Iso14064ComplianceLog {
  standard: string;
  facility_name: string;
  reporting_period: string;
  organizational_boundary: string;
  operational_boundary: string;
  consolidation_approach: string;
  scope1_fuel_sources: Scope1FuelSource[];
  scope2_grid_sources: Scope2GridSource[];
  total_scope1_tco2e: number;
  total_scope2_tco2e: number;
  gross_inventory_tco2e: number;
  lead_verifier_signoff: string;
  audit_trail_hash: string;
  last_verified_at: string;
}

export interface IpmvpMvProtocol {
  protocol_standard: string;
  selected_option: string;
  project_title: string;
  energy_conservation_measure_ecm: string;
  submeter_id: string;
  baseline_period_start: string;
  baseline_period_end: string;
  reporting_period_start: string;
  reporting_period_end: string;
  duration_days: number;
  baseline_kwh: number;
  actual_monitored_kwh: number;
  raw_energy_savings_kwh: number;
  independent_variables: string[];
  routine_adjustment_kwh: number;
  non_routine_adjustment_kwh: number;
  adjusted_baseline_kwh: number;
  net_verified_savings_kwh: number;
  verified_avoided_carbon_tco2e: number;
  statistical_validity: {
    r_squared: number;
    cv_rmse_pct: number;
    t_statistic: number;
    confidence_level_pct: number;
    precision_pct: number;
    meets_ashrae_criteria: boolean;
  };
  metering_specifications: Record<string, string>;
  verification_status: string;
}

export interface SebiBrsrDisclosure {
  framework: string;
  company_cin: string;
  reporting_year: string;
  turnover_cr_inr: number;
  total_production_units: number;
  total_energy_consumption_gj: number;
  energy_intensity_gj_per_cr_inr: number;
  scope1_tco2e: number;
  scope2_tco2e: number;
  total_scope1_scope2_tco2e: number;
  ghg_intensity_tco2e_per_cr_inr: number;
  ghg_intensity_kg_per_unit: number;
  scope3_status: string;
  assurance_type: string;
  assurance_provider: string;
}

export interface EuCbamDisclosure {
  framework: string;
  installation_id: string;
  product_description: string;
  cn_code: string;
  production_volume_metric_tons: number;
  direct_embedded_emissions_tco2e: number;
  indirect_embedded_emissions_tco2e: number;
  total_embedded_emissions_tco2e: number;
  specific_embedded_direct_tco2e_per_t: number;
  specific_embedded_indirect_tco2e_per_t: number;
  specific_embedded_total_tco2e_per_t: number;
  specific_carbon_intensity_kg_per_part: number;
  eu_sectoral_benchmark_kg_per_part: number;
  origin_country_carbon_price_paid_eur_per_t: number;
  eligible_cbam_rebate_eur: number;
  eu_registry_submission_ready: boolean;
}

export interface RegistryFilingItem {
  filing_id: string;
  project_name: string;
  offset_registry: string;
  registry_full_name: string;
  methodology: string;
  abated_emissions_tco2e: number;
  equivalent_escerts: number;
  vintage_year: number;
  lifecycle_stage: string;
  designated_operational_entity_doe: string;
  pdd_document_ref: string;
  submission_date: string;
  estimated_credit_value_inr: number;
  evidence_pack_hashes: string[];
}

export interface ComplianceDossier {
  dossier_id: string;
  generated_at_utc: string;
  facility_name: string;
  dossier_integrity_hash: string;
  iso_14064_compliance_log: Iso14064ComplianceLog;
  ipmvp_mv_protocol: IpmvpMvProtocol;
  sebi_brsr_disclosure: SebiBrsrDisclosure;
  eu_cbam_disclosure: EuCbamDisclosure;
  registry_filings: RegistryFilingItem[];
}

export async function fetchComplianceDossier(): Promise<ComplianceDossier> {
  const res = await fetch(`${API_BASE}/dossier`);
  if (!res.ok) throw new Error(`Failed to load compliance dossier: ${res.statusText}`);
  return res.json();
}

export async function fetchIso14064Log(year = '2025-26'): Promise<Iso14064ComplianceLog> {
  const res = await fetch(`${API_BASE}/iso14064?year=${encodeURIComponent(year)}`);
  if (!res.ok) throw new Error(`Failed to load ISO 14064 log: ${res.statusText}`);
  return res.json();
}

export async function fetchIpmvpProtocol(): Promise<IpmvpMvProtocol> {
  const res = await fetch(`${API_BASE}/ipmvp`);
  if (!res.ok) throw new Error(`Failed to load IPMVP protocol: ${res.statusText}`);
  return res.json();
}

export async function fetchSebiBrsrDisclosure(): Promise<SebiBrsrDisclosure> {
  const res = await fetch(`${API_BASE}/sebi-brsr`);
  if (!res.ok) throw new Error(`Failed to load SEBI BRSR disclosure: ${res.statusText}`);
  return res.json();
}

export async function fetchEuCbamDisclosure(): Promise<EuCbamDisclosure> {
  const res = await fetch(`${API_BASE}/eu-cbam`);
  if (!res.ok) throw new Error(`Failed to load EU CBAM disclosure: ${res.statusText}`);
  return res.json();
}

export async function fetchRegistryFilings(): Promise<RegistryFilingItem[]> {
  const res = await fetch(`${API_BASE}/registry-filings`);
  if (!res.ok) throw new Error(`Failed to load registry filings: ${res.statusText}`);
  return res.json();
}

export async function submitRegistryFiling(payload: Partial<RegistryFilingItem>): Promise<RegistryFilingItem> {
  const res = await fetch(`${API_BASE}/registry-filings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to submit registry filing: ${res.statusText}`);
  return res.json();
}
