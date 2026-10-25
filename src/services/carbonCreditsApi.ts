/**
 * WattWise AI — Carbon Credits, Additionality & CCTS Offsetting API Service
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export interface CarbonCreditItem {
  serial_number: string;
  registry: 'BEE_CCTS' | 'BEE_PAT' | 'VERRA_VCS' | 'GOLD_STANDARD' | 'GCC';
  registry_name: string;
  category: 'GENERATED_ISSUED' | 'PURCHASED' | 'SURRENDERED_RETIRED';
  quantity_tco2e: number;
  equivalent_escerts?: number;
  project_name: string;
  project_type: string;
  vintage_year: number;
  issuance_date: string;
  status: 'ACTIVE' | 'SURRENDERED_RETIRED';
  retirement_date?: string;
  retired_against?: string;
  additionality_proven: boolean;
  market_price_inr: number;
  hash_signature: string;
}

export interface PortfolioSummary {
  active_balance_tco2e: number;
  active_equivalent_escerts: number;
  retired_total_tco2e: number;
  generated_active_tco2e: number;
  purchased_active_tco2e: number;
  total_market_value_inr: number;
  currency: string;
  ccts_benchmark_price_per_t: number;
  bee_escert_benchmark_price: number;
}

export interface CarbonCreditsPortfolioResponse {
  summary: PortfolioSummary;
  credits: CarbonCreditItem[];
}

export interface AdditionalityInput {
  intervention_id: string;
  intervention_name: string;
  baseline_power_kw: number;
  monitored_power_kw: number;
  operating_hours_per_day: number;
  duration_days?: number;
  grid_emission_factor_t_per_mwh?: number;
  leakage_pct?: number;
  regulatory_mandated?: boolean;
  hurdle_rate_met?: boolean;
  barrier_identified?: boolean;
}

export interface AdditionalityResult {
  intervention_id: string;
  baseline_emissions_t: number;
  actual_emissions_t: number;
  gross_reduction_t: number;
  leakage_t: number;
  net_credits_earned_tco2e: number;
  equivalent_escerts: number;
  is_additional: boolean;
  additionality_checks: {
    regulatory_additionality: boolean;
    financial_additionality: boolean;
    barrier_additionality: boolean;
  };
  methodology_citation: string;
  potential_market_value_inr: number;
}

export interface RetirementResponse {
  success: boolean;
  message: string;
  credit: CarbonCreditItem;
  retirement_certificate: {
    certificate_id: string;
    serial_number: string;
    registry: string;
    quantity_tco2e: number;
    beneficiary: string;
    purpose: string;
    timestamp_utc: string;
    status: string;
  };
}

export async function fetchCreditsPortfolio(): Promise<CarbonCreditsPortfolioResponse> {
  const res = await fetch(`${API_BASE}/api/v1/carbon/credits/portfolio`);
  if (!res.ok) {
    throw new Error(`Failed to fetch credits portfolio: ${res.statusText}`);
  }
  return res.json();
}

export async function calculateAdditionality(input: AdditionalityInput): Promise<AdditionalityResult> {
  const res = await fetch(`${API_BASE}/api/v1/carbon/credits/additionality`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Failed to evaluate additionality: ${res.statusText}`);
  }
  return res.json();
}

export async function retireCarbonCredit(
  serialNumber: string,
  reason: string,
  beneficiary: string = 'PrecisionWorks Manufacturing Plant'
): Promise<RetirementResponse> {
  const res = await fetch(`${API_BASE}/api/v1/carbon/credits/retire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serial_number: serialNumber, reason, beneficiary }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to retire credit (${res.status})`);
  }
  return res.json();
}

export async function issueCreditsFromSavings(
  projectName: string,
  quantityTco2e: number,
  interventionType: string
): Promise<CarbonCreditItem> {
  const res = await fetch(`${API_BASE}/api/v1/carbon/credits/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: projectName,
      quantity_tco2e: quantityTco2e,
      intervention_type: interventionType,
      vintage: 2026,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to issue credits: ${res.statusText}`);
  }
  return res.json();
}
