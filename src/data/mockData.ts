
// PrecisionWorks Manufacturing — SCADA Data Model
export const PLANT = {
  name: 'PrecisionWorks Manufacturing',
  tariff: 8,            // ₹/kWh
  gridEF: 0.72886,      // kg CO2/kWh (CEA Baseline Database V22.0, FY 2023-24 location-based)
  baselineEnergy: 12480, // kWh/period
  baselineCost: 99840,   // ₹
};

export type AssetStatus = 'OPTIMAL' | 'WARNING' | 'PEAK' | 'IDLE';

export interface Asset {
  id: string;
  name: string;
  model: string;
  ratedKw: number;
  currentKw: number;
  energyKwh: number;
  status: AssetStatus;
  pf: number;
  // extras
  idleKw?: number;
  idleHrsPerDay?: number;
  dischargePressureBar?: number;
  tempC?: number;
  cop?: number;
  secKwhPerPart?: number;
}

export interface Machine {
  id: string;
  name: string;
  type?: string;
  position: [number, number, number];
  powerKw: number;
  status: string;
  model?: string;
  ratedKw?: number;
  currentKw?: number;
  energyKwh?: number;
  pf?: number;
}

export const ASSETS: Asset[] = [
  {
    id: 'compressor',
    name: 'Air Compressor',
    model: 'ELGi EN 45',
    ratedKw: 45,
    currentKw: 18,
    energyKwh: 3120,
    status: 'WARNING',
    pf: 0.78,
    idleKw: 18,
    idleHrsPerDay: 3.2,
    dischargePressureBar: 7.2,
  },
  {
    id: 'cnc',
    name: 'CNC Machining Center',
    model: 'DMG MORI NLX-2500',
    ratedKw: 32,
    currentKw: 28,
    energyKwh: 4200,
    status: 'OPTIMAL',
    pf: 0.94,
    secKwhPerPart: 1.8,
  },
  {
    id: 'furnace',
    name: 'Industrial Furnace',
    model: 'Thermic Intl IF-85',
    ratedKw: 85,
    currentKw: 85,
    energyKwh: 3600,
    status: 'PEAK',
    pf: 0.88,
    tempC: 840,
  },
  {
    id: 'cooling',
    name: 'Chilled Water Cooling',
    model: 'Carrier AquaForce 30XW',
    ratedKw: 28,
    currentKw: 22,
    energyKwh: 1560,
    status: 'OPTIMAL',
    pf: 0.92,
    cop: 4.1,
  },
];

export const HOURLY_BASE = Array.from({length: 24}, (_, h) => {
  const peak = (h >= 9 && h <= 12) || (h >= 18 && h <= 21);
  const idle = (h === 7) || (h >= 12 && h <= 13) || (h >= 17 && h <= 18);
  return {
    h,
    label: `${String(h).padStart(2,'0')}:00`,
    compressor: idle ? 18 : 40,
    cnc: h >= 7 && h <= 19 ? 28 : 0,
    furnace: h >= 6 && h <= 18 ? 82 : 0,
    cooling: h >= 8 && h <= 20 ? 22 : 0,
    tariff: peak ? 'PEAK' : 'OFF-PEAK',
    total: 0,
  };
}).map(d => ({...d, total: d.compressor + d.cnc + d.furnace + d.cooling}));

export function buildOptimizedHourly(params: SimParams) {
  return HOURLY_BASE.map(d => {
    let comp = d.compressor;
    if (params.autoIdleCutoff && (d.h === 7 || (d.h >= 12 && d.h <= 13) || (d.h >= 17 && d.h <= 18))) {
      comp = 0;
    }
    // stagger furnace preheat
    let furn = d.furnace;
    if (params.staggerFurnace && d.h === 6) furn = 0; // delay 45 min
    const total = comp + d.cnc + furn + d.cooling;
    return { ...d, compressor: comp, furnace: furn, total };
  });
}

export interface SimParams {
  autoIdleCutoff: boolean;
  pressureSetpoint: number;  // bar, default 7.5, range 6.5-7.5
  staggerFurnace: boolean;
}

export const DEFAULT_SIM_PARAMS: SimParams = {
  autoIdleCutoff: false,
  pressureSetpoint: 7.5,
  staggerFurnace: false,
};

export function calcSimResult(params: SimParams, ef: number = 0.72886) {
  const optimized = buildOptimizedHourly(params);
  const baseEnergy = PLANT.baselineEnergy;

  // Compressor idle savings: 18 kW × 3.2 h
  const idleSavingsKwh = params.autoIdleCutoff ? 18 * 3.2 : 0;
  // Pressure savings: each 0.1 bar reduction saves ~1% compressor energy
  const pressureReduction = 7.5 - params.pressureSetpoint;
  const pressureSavingsKwh = pressureReduction * 10 * 3120 / 100;
  // Stagger furnace: reduces peak demand 18%
  const furnacePeakReductionKw = params.staggerFurnace ? 85 * 0.18 : 0;

  const totalSavingsKwh = +(idleSavingsKwh + pressureSavingsKwh).toFixed(1);
  const optimizedEnergy = +(baseEnergy - totalSavingsKwh).toFixed(0);
  const savingsCost = +(totalSavingsKwh * PLANT.tariff).toFixed(2);
  const savingsCarbon = +(totalSavingsKwh * ef / 1000).toFixed(3);
  const baselineCost = PLANT.baselineCost;
  const optimizedCost = +(baselineCost - savingsCost).toFixed(2);
  const baseCarbon = +(baseEnergy * ef / 1000).toFixed(2);
  const optCarbon = +(optimizedEnergy * ef / 1000).toFixed(2);

  return {
    baseEnergy, optimizedEnergy, savingsKwh: totalSavingsKwh,
    baselineCost, optimizedCost, savingsCost,
    baseCarbon, optCarbon, savingsCarbon,
    furnacePeakReductionKw: +furnacePeakReductionKw.toFixed(1),
    hourlyBase: HOURLY_BASE,
    hourlyOpt: optimized,
    idleSavingsKwh: +idleSavingsKwh.toFixed(1),
    pressureSavingsKwh: +pressureSavingsKwh.toFixed(1),
    roi: savingsCost > 0 ? +(200000 / (savingsCost * 22 * 12)).toFixed(1) : null,
  };
}

// Carbon (Simulated Demo Fallback Model)
export const CARBON = {
  // Scope 1: LPG furnace – 2.9846 kg CO2/kg LPG, 2.9872 kg CO2e/kg LPG, ~5 kg LPG/hr, 12 hrs/day
  lpgKgPerHr: 5,
  lpgHrsPerDay: 12,
  lpgDirectCO2EF: 2.9846,
  lpgEF: 2.9872,  // kg CO2e / kg LPG (IPCC AR6)
  // Daily calculation (1 day = 60 kg)
  scope1Calc: () => {
    const kgLPG = 5 * 12;
    const kgCO2 = kgLPG * 2.9872;
    return {
      kgLPG,
      kgCO2e: +(kgCO2 / 1000).toFixed(3),
      formula: `${kgLPG} kg LPG/day × 2.9872 kg CO₂e/kg = ${(kgLPG * 2.9872).toFixed(1)} kg = ${(kgLPG * 2.9872 / 1000).toFixed(3)} tCO₂e/day`
    };
  },
  // Synchronized 30-day period calculation (30 days = 1,800 kg)
  scope1PeriodCalc: (days: number = 30) => {
    const kgLPG = 5 * 12 * days;
    const directCO2 = +(kgLPG * 2.9846 / 1000).toFixed(4);
    const totalCO2e = +(kgLPG * 2.9872 / 1000).toFixed(4);
    return {
      kgLPG,
      days,
      directCO2_t: directCO2,
      totalCO2e_t: totalCO2e,
      formula: `${kgLPG.toLocaleString()} kg LPG (${days}d) × 2.9872 kg CO₂e/kg ÷ 1000 = ${totalCO2e} tCO₂e`
    };
  },
  // Scope 2: CEA Location-based grid emission factor (FY 2023-24 default = 0.72886 kg CO2/kWh)
  scope2Calc: (kwh: number = 12480, ef: number = 0.72886) => {
    const kgCO2 = kwh * ef;
    return {
      kgCO2e: +(kgCO2 / 1000).toFixed(3),
      formula: `${kwh.toLocaleString()} kWh × ${ef} kg CO₂/kWh ÷ 1000 = ${(kgCO2 / 1000).toFixed(3)} tCO₂e`
    };
  },
};
