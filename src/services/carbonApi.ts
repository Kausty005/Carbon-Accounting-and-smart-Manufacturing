/**
 * WattWise AI — Carbon Accounting API Client
 * Strictly mirrors FastAPI backend models in backend/app/models.py
 */

export type ProvenanceType = 'MEASURED' | 'ESTIMATED' | 'SIMULATED' | 'PREDICTED';

export type ReportingPeriodType =
  | 'SIMULATED_DEMO_30D'
  | 'CALENDAR_MONTH'
  | 'DATED_RANGE'
  | 'DAILY';

export type CeaMethodology =
  | 'weighted_avg_with_res'
  | 'weighted_avg_thermal'
  | 'operating_margin'
  | 'build_margin'
  | 'combined_margin';

export interface ReportingPeriodInput {
  period_type: ReportingPeriodType;
  duration_days?: number;
  calendar_year?: number;
  calendar_month?: number;
  start_date?: string;
  end_date?: string;
}

export interface Scope1Input {
  fuel_id?: string;
  activity_value: number;
  activity_unit?: string;
  provenance?: ProvenanceType;
  include_non_co2_ghg?: boolean;
  custom_emission_factor?: number;
  custom_ncv_mj_per_unit?: number;
  activity_period?: ReportingPeriodInput;
}

export interface Scope2Input {
  grid_consumption_kwh: number;
  provenance?: ProvenanceType;
  cea_reporting_year?: string;
  cea_methodology?: CeaMethodology;
  include_imports?: boolean;
  custom_grid_factor?: number;
  activity_period?: ReportingPeriodInput;
}

export interface ScenarioComparisonInput {
  enabled: boolean;
  proposed_savings_kwh?: number;
  proposed_consumption_kwh?: number;
  savings_provenance?: ProvenanceType;
}

export interface CarbonCalculateRequest {
  period: ReportingPeriodInput;
  scope1?: Scope1Input;
  scope2?: Scope2Input;
  target_normalization_period?: ReportingPeriodType;
  scenario_comparison?: ScenarioComparisonInput;
}

// ─── Response Interfaces ───────────────────────────────────────────────────────

export interface Scope1FactorBreakdown {
  direct_co2_kg_per_kg: number;
  ch4_emitted_g_per_kg: number;
  ch4_converted_kg_per_kg: number;
  ch4_gwp_ar6: number;
  ch4_co2e_kg_per_kg: number;
  n2o_emitted_g_per_kg: number;
  n2o_converted_kg_per_kg: number;
  n2o_gwp_ar6: number;
  n2o_co2e_kg_per_kg: number;
  total_co2e_kg_per_kg: number;
}

export interface Scope1CalculationResult {
  fuel_id: string;
  fuel_name: string;
  activity: {
    value: number;
    unit: string;
    provenance: string;
    basis: string;
  };
  factor_breakdown: Scope1FactorBreakdown;
  emissions_direct_co2_t: number;
  emissions_total_co2e_t: number;
  emissions_evaluated_t_co2e: number;
  formula: string;
  source_reference: string;
  verification_status: string;
}

export interface CeaFactorMetadata {
  selected_factor: number;
  unit: string;
  reporting_year: string;
  methodology: string;
  sheet: string;
  row: number;
  column: number;
  authority: string;
  database_version: string;
  includes_imports: boolean;
  is_recommended_location_based: boolean;
}

export interface Scope2CalculationResult {
  activity: {
    value: number;
    unit: string;
    provenance: string;
    basis: string;
  };
  factor_metadata: CeaFactorMetadata;
  emissions_total_co2e_t: number;
  formula: string;
  source_reference: string;
}

export interface AvoidedEmissionsResult {
  savings_kwh: number;
  provenance: ProvenanceType;
  avoided_co2e_t: number;
  formula: string;
  accounting_treatment: string;
}

export interface GrossFootprintResult {
  scope1?: Scope1CalculationResult;
  scope2?: Scope2CalculationResult;
  total_gross_co2e_t: number;
  direct_co2_only_total_t: number;
}

export interface ScenarioComparisonResult {
  baseline_gross_t_co2e: number;
  proposed_gross_t_co2e: number;
  net_reduction_t_co2e: number;
  reduction_percentage: number;
  baseline_electricity_kwh?: number;
  proposed_electricity_kwh?: number;
  electricity_savings_kwh?: number;
  avoided_emissions_t_co2e?: number;
  provenance?: ProvenanceType;
  accounting_note?: string;
}

export interface PeriodDetails {
  period_type: ReportingPeriodType;
  duration_days: number;
  duration_hours: number;
  description: string;
}

export interface CarbonCalculateResponse {
  calculation_metadata: {
    audit_status: string;
    standards_compliance?: string[];
    calculated_at: string;
    note: string;
    backend_status?: 'CONNECTED' | 'OFFLINE (DEMO)';
  };
  period: PeriodDetails;
  gross_footprint: GrossFootprintResult;
  avoided_emissions?: AvoidedEmissionsResult;
  scenario_comparison?: ScenarioComparisonResult;
}

export interface FactorQueryResponse {
  database_metadata: {
    title: string;
    version: string;
    publication_date: string;
    baseline_methodology: string;
    authority: string;
    sheet: string;
  };
  available_years: string[];
  scope2_grid_factors: CeaFactorMetadata[];
  scope1_fuel_factors: Array<{
    fuel_id: string;
    fuel_name: string;
    verification_status: string;
    source_table?: string;
    ncv_mj_per_kg?: number;
    direct_co2_factor?: number;
    ch4_factor_g_per_kg?: number;
    n2o_factor_g_per_kg?: number;
    total_co2e_factor?: number;
    unit?: string;
    note?: string;
    is_default: boolean;
  }>;
}

// ─── Client Implementation ────────────────────────────────────────────────────

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string) || 'http://127.0.0.1:8000';

const FETCH_TIMEOUT_MS = 3500;

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      return data.status === 'healthy';
    }
    return false;
  } catch {
    return false;
  }
}

export async function fetchCarbonFactors(): Promise<FactorQueryResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/carbon/factors`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to fetch factors (HTTP ${res.status})`);
  }
  return res.json();
}

export async function calculateCarbonFootprint(
  request: CarbonCalculateRequest
): Promise<CarbonCalculateResponse> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/carbon/calculate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const detail = typeof errData.detail === 'string' ? errData.detail : JSON.stringify(errData.detail);
    throw new Error(detail || `Carbon calculation failed (HTTP ${res.status})`);
  }

  const data: CarbonCalculateResponse = await res.json();
  data.calculation_metadata.backend_status = 'CONNECTED';
  return data;
}

/**
 * Robust offline client-side fallback calculation.
 * Preserves the exact backend response contract, but clearly labels outputs
 * as FALLBACK_OFFLINE_DEMO and NEVER presents them as verified live results.
 */
export function getOfflineFallbackCalculation(
  request: CarbonCalculateRequest
): CarbonCalculateResponse {
  const periodDays = request.period.duration_days || 30.0;
  const s1Val = request.scope1?.activity_value ?? 1800.0;
  const s2Val = request.scope2?.grid_consumption_kwh ?? 12480.0;
  const customEf = request.scope2?.custom_grid_factor ?? 0.72886; // CEA FY 2023-24 location-based default
  const savingsKwh = request.scenario_comparison?.enabled
    ? (request.scenario_comparison.proposed_consumption_kwh != null
        ? Math.max(0, +(s2Val - request.scenario_comparison.proposed_consumption_kwh).toFixed(2))
        : (request.scenario_comparison.proposed_savings_kwh ?? 0))
    : 0;

  // LPG factors: 2.98463 direct CO2, 2.98724 total CO2e
  const directCO2Factor = 2.98463;
  const totalCO2eFactor = 2.98724;

  const s1DirectCO2 = +((s1Val * directCO2Factor) / 1000).toFixed(4);
  const s1TotalCO2e = +((s1Val * totalCO2eFactor) / 1000).toFixed(4);
  const s2CO2e = +((s2Val * customEf) / 1000).toFixed(4);
  const grossTotal = +(s1TotalCO2e + s2CO2e).toFixed(4);
  const avoidedCO2e = +((savingsKwh * customEf) / 1000).toFixed(4);
  const proposedGross = +(grossTotal - avoidedCO2e).toFixed(4);

  return {
    calculation_metadata: {
      audit_status: 'FALLBACK_OFFLINE_DEMO',
      backend_status: 'OFFLINE (DEMO)',
      calculated_at: new Date().toISOString(),
      standards_compliance: ['Methodology aligned with ISO 14064-1 & GHG Protocol (Offline Fallback)'],
      note: 'Backend service offline. Calculation rendered via client-side demo simulator. Not a verified factory audit.',
    },
    period: {
      period_type: request.period.period_type,
      duration_days: periodDays,
      duration_hours: periodDays * 24.0,
      description: `Simulated Demo Window (${periodDays.toFixed(0)} days / ${(periodDays * 24).toFixed(0)}h) [Offline Mode]`,
    },
    gross_footprint: {
      scope1: {
        fuel_id: request.scope1?.fuel_id || 'lpg',
        fuel_name: 'Liquefied Petroleum Gases (LPG)',
        activity: {
          value: s1Val,
          unit: request.scope1?.activity_unit || 'kg',
          provenance: request.scope1?.provenance || 'ESTIMATED',
          basis: `${s1Val.toLocaleString()} kg consumed over ${periodDays} days (Demo Sample)`,
        },
        factor_breakdown: {
          direct_co2_kg_per_kg: directCO2Factor,
          ch4_emitted_g_per_kg: 0.0473,
          ch4_converted_kg_per_kg: 0.0000473,
          ch4_gwp_ar6: 27.9,
          ch4_co2e_kg_per_kg: 0.00132,
          n2o_emitted_g_per_kg: 0.00473,
          n2o_converted_kg_per_kg: 0.00000473,
          n2o_gwp_ar6: 273.0,
          n2o_co2e_kg_per_kg: 0.001291,
          total_co2e_kg_per_kg: totalCO2eFactor,
        },
        emissions_direct_co2_t: s1DirectCO2,
        emissions_total_co2e_t: s1TotalCO2e,
        emissions_evaluated_t_co2e: s1TotalCO2e,
        formula: `${s1Val.toLocaleString()} kg LPG × ${totalCO2eFactor} kg CO₂e/kg ÷ 1000 = ${s1TotalCO2e} tCO₂e`,
        source_reference: 'IPCC 2006 Vol. 2 Ch. 2 Table 2.3 (Demo Cache)',
        verification_status: 'SIMULATED_CLIENT_DEMO',
      },
      scope2: {
        activity: {
          value: s2Val,
          unit: 'kWh',
          provenance: 'SIMULATED',
          basis: `${s2Val.toLocaleString()} kWh aggregated over ${periodDays} days (SCADA Simulation)`,
        },
        factor_metadata: {
          selected_factor: customEf,
          unit: 'kg CO2/kWh',
          reporting_year: request.scope2?.cea_reporting_year || '2023-24',
          methodology: 'Weighted Average Grid Emission Rate (Incl. RES, Captive)',
          sheet: 'Results',
          row: 14,
          column: 13,
          authority: 'Central Electricity Authority (India) [Cached]',
          database_version: '22.0',
          includes_imports: false,
          is_recommended_location_based: true,
        },
        emissions_total_co2e_t: s2CO2e,
        formula: `${s2Val.toLocaleString()} kWh × ${customEf} kg CO₂/kWh ÷ 1000 = ${s2CO2e} tCO₂e`,
        source_reference: 'CEA India CO2 Baseline Database Ver 22.0 [Offline Demo]',
      },
      total_gross_co2e_t: grossTotal,
      direct_co2_only_total_t: +(s1DirectCO2 + s2CO2e).toFixed(4),
    },
    avoided_emissions: {
      savings_kwh: savingsKwh,
      provenance: 'SIMULATED',
      avoided_co2e_t: avoidedCO2e,
      formula: `${savingsKwh.toLocaleString()} kWh saved × ${customEf} kg CO₂/kWh ÷ 1000 = ${avoidedCO2e} tCO₂e avoided`,
      accounting_treatment: 'Reported separately under GHG Protocol; not subtracted from operational gross emissions.',
    },
    scenario_comparison: {
      baseline_gross_t_co2e: grossTotal,
      proposed_gross_t_co2e: proposedGross,
      net_reduction_t_co2e: avoidedCO2e,
      reduction_percentage: grossTotal > 0 ? +((avoidedCO2e / grossTotal) * 100).toFixed(2) : 0,
      baseline_electricity_kwh: s2Val,
      proposed_electricity_kwh: +(s2Val - savingsKwh).toFixed(2),
      electricity_savings_kwh: savingsKwh,
      avoided_emissions_t_co2e: avoidedCO2e,
      provenance: 'SIMULATED',
      accounting_note: 'Digital twin simulation. Avoided emissions are tracked separately and never subtracted from baseline gross operational emissions. Scope 1 fuel emissions remain unchanged.',
    },
  };
}
