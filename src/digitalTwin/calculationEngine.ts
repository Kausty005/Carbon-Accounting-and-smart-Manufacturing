import type {
  TelemetryRecord,
  TariffConfig,
  EmissionFactorMetadata,
  MetricsSummary,
  Deltas,
} from './types';

export function extractHourFromTimestamp(timestampStr: string): number {
  if (timestampStr.includes('T')) {
    const timePart = timestampStr.split('T')[1];
    const hourPart = timePart.split(':')[0];
    const parsed = parseInt(hourPart, 10);
    if (!isNaN(parsed)) return parsed;
  }
  const dt = new Date(timestampStr);
  return !isNaN(dt.getTime()) ? dt.getHours() : 0;
}

export function getHourTariffRate(timestampStr: string, tariffConfig: TariffConfig): number {
  if (tariffConfig.tariff_type === 'flat') {
    return tariffConfig.energy_rate_inr_per_kwh;
  }
  try {
    const hour = extractHourFromTimestamp(timestampStr);
    for (const tier of tariffConfig.tou_rates) {
      if (tier.hours.includes(hour)) {
        return tier.rate_inr_per_kwh;
      }
    }
  } catch {
    // fallback
  }
  return tariffConfig.energy_rate_inr_per_kwh;
}

export function isPeakHour(timestampStr: string, tariffConfig: TariffConfig): boolean {
  try {
    const hour = extractHourFromTimestamp(timestampStr);
    const peakTier = tariffConfig.tou_rates.find(t => t.zone === 'PEAK');
    return peakTier ? peakTier.hours.includes(hour) : (hour >= 9 && hour <= 12) || (hour >= 18 && hour <= 21);
  } catch {
    return false;
  }
}

export function calculateMetrics(
  records: TelemetryRecord[],
  tariffConfig: TariffConfig,
  emissionFactor?: EmissionFactorMetadata | null,
  intervalHours: number = 1.0
): MetricsSummary {
  if (!records || records.length === 0) {
    return {
      total_energy_kwh: 0,
      total_production_units: 0,
      sec_kwh_per_unit: 0,
      peak_demand_kw: 0,
      peak_timestamp: null,
      contract_demand_limit_kw: tariffConfig.contract_demand_limit_kw,
      peak_exceedance_kw: 0,
      energy_cost_inr: 0,
      demand_penalty_inr: 0,
      total_cost_inr: 0,
      scope2_kg_co2e: null,
      by_machine: {},
      time_slot_power: {},
      hourly_plant: [],
    };
  }

  let total_energy_kwh = 0;
  let total_production_units = 0;
  let energy_cost_inr = 0;
  const time_slot_power: Record<string, number> = {};
  const time_slot_prod: Record<string, number> = {};
  const time_slot_breakdown: Record<string, Record<string, number>> = {};
  const by_machine: Record<string, { energy_kwh: number; max_power_kw: number; production_units: number; sec_kwh_per_unit: number }> = {};

  for (const r of records) {
    const mid = r.machine_id;
    const ts = r.timestamp;
    const p_kw = r.power_kw;
    const e_kwh = r.energy_kwh ?? p_kw * intervalHours;
    const prod = r.production_units || 0;

    total_energy_kwh += e_kwh;
    total_production_units += prod;
    const rate = getHourTariffRate(ts, tariffConfig);
    energy_cost_inr += e_kwh * rate;

    time_slot_power[ts] = (time_slot_power[ts] || 0) + p_kw;
    time_slot_prod[ts] = (time_slot_prod[ts] || 0) + prod;

    if (!time_slot_breakdown[ts]) {
      time_slot_breakdown[ts] = {};
    }
    time_slot_breakdown[ts][mid] = p_kw;

    if (!by_machine[mid]) {
      by_machine[mid] = { energy_kwh: 0, max_power_kw: 0, production_units: 0, sec_kwh_per_unit: 0 };
    }
    by_machine[mid].energy_kwh += e_kwh;
    by_machine[mid].production_units += prod;
    if (p_kw > by_machine[mid].max_power_kw) {
      by_machine[mid].max_power_kw = p_kw;
    }
  }

  // Calculate machine level SEC
  for (const mid of Object.keys(by_machine)) {
    const m = by_machine[mid];
    m.sec_kwh_per_unit = m.production_units > 0 ? Number((m.energy_kwh / m.production_units).toFixed(2)) : 0;
  }

  // Plant overall SEC (Specific Energy Consumption)
  const sec_kwh_per_unit = total_production_units > 0
    ? Number((total_energy_kwh / total_production_units).toFixed(2))
    : 0;

  // Find peak demand and peak timestamp
  let peak_demand_kw = 0;
  let peak_timestamp: string | null = null;
  for (const [ts, kw] of Object.entries(time_slot_power)) {
    if (kw > peak_demand_kw) {
      peak_demand_kw = kw;
      peak_timestamp = ts;
    }
  }

  // Demand penalty calculation
  const limit = tariffConfig.contract_demand_limit_kw;
  const exceedance = Math.max(0, peak_demand_kw - limit);
  const demand_penalty_inr = exceedance > 0
    ? Number((exceedance * tariffConfig.demand_penalty_charge_inr_per_kw).toFixed(2))
    : 0;
  const total_cost_inr = Number((energy_cost_inr + demand_penalty_inr).toFixed(2));

  // Scope 2 emissions
  let scope2_kg_co2e: number | null = null;
  if (emissionFactor && typeof emissionFactor.kg_co2e_per_kwh === 'number') {
    scope2_kg_co2e = Number((total_energy_kwh * emissionFactor.kg_co2e_per_kwh).toFixed(3));
  }

  // Build hourly array for charts
  const uniqueTimestamps = Object.keys(time_slot_power).sort();
  const hourly_plant = uniqueTimestamps.slice(0, 24).map((ts, idx) => {
    let hour = idx;
    try {
      hour = extractHourFromTimestamp(ts);
    } catch {}
    const kw = Number(time_slot_power[ts].toFixed(1));
    return {
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      kw,
      kwh: kw,
      production_units: time_slot_prod[ts] || 0,
      isPeakToD: isPeakHour(ts, tariffConfig),
      exceedsContract: kw > limit,
      machines: time_slot_breakdown[ts] || {},
    };
  });

  return {
    total_energy_kwh: Number(total_energy_kwh.toFixed(2)),
    total_production_units,
    sec_kwh_per_unit,
    peak_demand_kw: Number(peak_demand_kw.toFixed(2)),
    peak_timestamp,
    contract_demand_limit_kw: limit,
    peak_exceedance_kw: Number(exceedance.toFixed(2)),
    energy_cost_inr: Number(energy_cost_inr.toFixed(2)),
    demand_penalty_inr,
    total_cost_inr,
    scope2_kg_co2e,
    by_machine,
    time_slot_power,
    hourly_plant,
  };
}

export function calculateDeltas(baseline: MetricsSummary, scenario: MetricsSummary): Deltas {
  // Sign convention: scenario - baseline (negative = reduction)
  const energy_kwh = Number((scenario.total_energy_kwh - baseline.total_energy_kwh).toFixed(2));
  const cost_inr = Number((scenario.total_cost_inr - baseline.total_cost_inr).toFixed(2));
  const peak_kw = Number((scenario.peak_demand_kw - baseline.peak_demand_kw).toFixed(2));
  const sec_kwh_per_unit = Number((scenario.sec_kwh_per_unit - baseline.sec_kwh_per_unit).toFixed(2));

  let scope2_kg_co2e: number | null = null;
  if (scenario.scope2_kg_co2e !== null && baseline.scope2_kg_co2e !== null) {
    scope2_kg_co2e = Number((scenario.scope2_kg_co2e - baseline.scope2_kg_co2e).toFixed(3));
  }

  const savings_positive = {
    energy_kwh: Number((-energy_kwh).toFixed(2)),
    cost_inr: Number((-cost_inr).toFixed(2)),
    peak_kw: Number((-peak_kw).toFixed(2)),
    scope2_kg_co2e: scope2_kg_co2e !== null ? Number((-scope2_kg_co2e).toFixed(3)) : null,
    sec_reduction: Number((-sec_kwh_per_unit).toFixed(2)),
  };

  return {
    energy_kwh,
    cost_inr,
    peak_kw,
    scope2_kg_co2e,
    sec_kwh_per_unit,
    savings_positive,
  };
}
