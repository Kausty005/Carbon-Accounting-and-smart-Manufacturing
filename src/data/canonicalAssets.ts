/**
 * WattWise AI — Centralized Canonical Asset Identity Registry
 * 
 * Formalizes a single source of truth for the 4 core industrial machines:
 * - ASSET-COMP-01: Rotary Screw Air Compressor
 * - ASSET-CNC-01: Precision 5-Axis CNC Milling Center
 * - ASSET-FURN-01: High-Temperature Induction Furnace
 * - ASSET-CHIL-01: Industrial Process Water Chiller
 *
 * Plus optional catalog archetypes (e.g., ASSET-PNT-01 for Painting Line).
 * 
 * Provides typed metadata, legacy alias normalization, equipment specifications,
 * primary sensor associations, project linkages, and simulation archetypes.
 */

export type CanonicalAssetId =
  | 'ASSET-COMP-01'
  | 'ASSET-CNC-01'
  | 'ASSET-FURN-01'
  | 'ASSET-CHIL-01';

export type ExtendedAssetId = CanonicalAssetId | 'ASSET-PNT-01';

export interface CanonicalSensorRef {
  sensorId: string;
  tag: string;
  instrumentType: string;
  measurementType: string;
  unit: string;
  modbusHoldingRegister?: number;
}

export interface CanonicalAssetDefinition {
  canonicalId: CanonicalAssetId;
  name: string;
  equipmentType: 'compressor' | 'cnc' | 'furnace' | 'chiller';
  model: string;
  bay: string;
  utilityCellId: string;
  utilityCellName: string;
  ratedPowerKw: number;
  nominalOperatingKw: number;
  expectedIdleKw: number;
  apparentKva: number;
  powerFactor: number;
  cop?: number;
  secKwhPerUnit?: number;
  tempC?: number;
  dischargePressureBar?: number;
  taxonomies: {
    mlForecasting: 'AIR_COMPRESSOR' | 'CNC_MILL' | 'OVEN_FURNACE' | 'PUMP';
    twinArchetype: 'COMP-01' | 'CNC-01' | 'FURN-01' | 'CHIL-01';
    equipmentRegistryId: string;
  };
  primarySensors: CanonicalSensorRef[];
  associatedProjects: string[];
  legacyAliases: string[];
  simulationCapabilities: {
    canSimulate: boolean;
    archetype: 'COMP-01' | 'CNC-01' | 'FURN-01' | 'CHIL-01';
    constraints: Record<string, any>;
  };
}

export const CANONICAL_ASSETS: Record<CanonicalAssetId, CanonicalAssetDefinition> = {
  'ASSET-COMP-01': {
    canonicalId: 'ASSET-COMP-01',
    name: 'Air Compressor (ELGi EN 45)',
    equipmentType: 'compressor',
    model: 'ELGi EN 45 Screw Compressor',
    bay: 'Bay A-1 (Pneumatics)',
    utilityCellId: 'utility_1',
    utilityCellName: 'Compressed Air & Industrial Gas Systems',
    ratedPowerKw: 45.0,
    nominalOperatingKw: 18.0,
    expectedIdleKw: 8.0,
    apparentKva: 23.1, // 18 kW / 0.78 PF
    powerFactor: 0.78,
    dischargePressureBar: 7.2,
    taxonomies: {
      mlForecasting: 'AIR_COMPRESSOR',
      twinArchetype: 'COMP-01',
      equipmentRegistryId: 'AIR-COMP-01',
    },
    primarySensors: [
      {
        sensorId: 'EM-102',
        tag: 'COMPRESSOR-FEEDER-METER',
        instrumentType: 'Class 0.5S Multi-Function Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
        modbusHoldingRegister: 30001,
      },
      {
        sensorId: 'SEN-COMP-ROT-01-PWR',
        tag: 'SEN-COMP-ROT-01-PWR',
        instrumentType: 'Feeder Active Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
      },
      {
        sensorId: 'SEN-COMP-ROT-01-IDLE-PWR',
        tag: 'SEN-COMP-ROT-01-IDLE-PWR',
        instrumentType: 'Unloaded Idle Power Sensor',
        measurementType: 'Idle Power',
        unit: 'kW',
      },
      {
        sensorId: 'SEN-COMP-ROT-01-DIS-PRS',
        tag: 'SEN-COMP-ROT-01-DIS-PRS',
        instrumentType: 'Discharge Header Pressure Transmitter',
        measurementType: 'Pressure',
        unit: 'bar',
      },
    ],
    associatedProjects: ['PRJ-COMP-2026-01'],
    legacyAliases: [
      'compressor',
      'COMP-01',
      'AIR-COMP-01',
      'COMP-ROT-01',
      'COMP-ROT-02',
      'MACHINE_011',
      'MACHINE_012',
      'MACHINE_013',
      'MACHINE_017',
      'AIR_COMPRESSOR',
      'ASSET-COMP-01',
    ],
    simulationCapabilities: {
      canSimulate: true,
      archetype: 'COMP-01',
      constraints: {
        min_service_required: true,
        idle_shutdown_requires_operator_approval: true,
        min_pressure_bar: 6.5,
        rated_pressure_bar: 7.5,
      },
    },
  },

  'ASSET-CNC-01': {
    canonicalId: 'ASSET-CNC-01',
    name: 'CNC Machining Center (NLX-2500)',
    equipmentType: 'cnc',
    model: 'DMG MORI NLX-2500 5-Axis',
    bay: 'Bay B-2 (Machining)',
    utilityCellId: 'utility_4',
    utilityCellName: 'Precision Machining & Forming',
    ratedPowerKw: 32.0,
    nominalOperatingKw: 28.0,
    expectedIdleKw: 3.0,
    apparentKva: 29.8, // 28 kW / 0.94 PF
    powerFactor: 0.94,
    secKwhPerUnit: 1.8,
    taxonomies: {
      mlForecasting: 'CNC_MILL',
      twinArchetype: 'CNC-01',
      equipmentRegistryId: 'CNC-01',
    },
    primarySensors: [
      {
        sensorId: 'EM-101',
        tag: 'SUBSTATION-MAIN-METER',
        instrumentType: 'Class 0.5S Multi-Function Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
        modbusHoldingRegister: 30002,
      },
      {
        sensorId: 'SEN-CNC-5AX-01-PWR',
        tag: 'SEN-CNC-5AX-01-PWR',
        instrumentType: 'Total Machine Active Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
      },
      {
        sensorId: 'SEN-CNC-5AX-01-SPD-PWR',
        tag: 'SEN-CNC-5AX-01-SPD-PWR',
        instrumentType: 'Spindle Drive Power Sub-Meter',
        measurementType: 'Spindle Power',
        unit: 'kW',
      },
    ],
    associatedProjects: ['Precision Machining Shift Target (1200 parts/shift)'],
    legacyAliases: [
      'cnc',
      'CNC-01',
      'CNC-5AX-01',
      'CNC-VMC-01',
      'MACHINE_008',
      'MACHINE_010',
      'MACHINE_034',
      'MACHINE_038',
      'CNC_MILL',
      'ASSET-CNC-01',
    ],
    simulationCapabilities: {
      canSimulate: true,
      archetype: 'CNC-01',
      constraints: {
        production_target_required: true,
        min_daily_production_units: 140,
        max_continuous_run_hours: 8,
      },
    },
  },

  'ASSET-FURN-01': {
    canonicalId: 'ASSET-FURN-01',
    name: 'Industrial Heat Furnace (Thermic IF-85)',
    equipmentType: 'furnace',
    model: 'Thermic Intl IF-85 (840°C)',
    bay: 'Bay C-1 (Thermal)',
    utilityCellId: 'utility_2',
    utilityCellName: 'Thermal Systems & Industrial Steam',
    ratedPowerKw: 85.0,
    nominalOperatingKw: 85.0,
    expectedIdleKw: 15.0,
    apparentKva: 96.6, // 85 kW / 0.88 PF
    powerFactor: 0.88,
    tempC: 840,
    taxonomies: {
      mlForecasting: 'OVEN_FURNACE',
      twinArchetype: 'FURN-01',
      equipmentRegistryId: 'FURNACE-01',
    },
    primarySensors: [
      {
        sensorId: 'FM-201',
        tag: 'FURNACE-FUEL-CORIOLIS',
        instrumentType: 'Dual U-Tube Coriolis Mass Flow Meter',
        measurementType: 'Fuel Mass Flow',
        unit: 'kg/h',
        modbusHoldingRegister: 30003,
      },
      {
        sensorId: 'GA-301',
        tag: 'STACK-NDIR-CEMS',
        instrumentType: 'Continuous Flue Gas NDIR Analyzer',
        measurementType: 'Emissions Concentration',
        unit: 'ppm',
        modbusHoldingRegister: 30004,
      },
      {
        sensorId: 'SEN-FURN-IND-01-PWR',
        tag: 'SEN-FURN-IND-01-PWR',
        instrumentType: 'Induction Coil Electrical Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
      },
    ],
    associatedProjects: ['PRJ-FURNACE-2026-08'],
    legacyAliases: [
      'furnace',
      'FURN-01',
      'FURNACE-01',
      'FURN-IND-01',
      'MACHINE_004',
      'MACHINE_015',
      'MACHINE_031',
      'OVEN_FURNACE',
      'ASSET-FURN-01',
    ],
    simulationCapabilities: {
      canSimulate: true,
      archetype: 'FURN-01',
      constraints: {
        protected_process_block: true,
        min_continuous_cycle_hours: 4,
        cannot_interrupt_holding_cycle: true,
      },
    },
  },

  'ASSET-CHIL-01': {
    canonicalId: 'ASSET-CHIL-01',
    name: 'Industrial Process Water Chiller (Carrier AquaForce 30XW)',
    equipmentType: 'chiller',
    model: 'Carrier AquaForce 30XW',
    bay: 'Bay D-3 (Hydronics)',
    utilityCellId: 'utility_5',
    utilityCellName: 'Chilled Water, HVAC & Environment',
    ratedPowerKw: 28.0,
    nominalOperatingKw: 22.0,
    expectedIdleKw: 4.0,
    apparentKva: 23.9, // 22 kW / 0.92 PF
    powerFactor: 0.92,
    cop: 4.1,
    taxonomies: {
      mlForecasting: 'PUMP',
      twinArchetype: 'CHIL-01',
      equipmentRegistryId: 'CHILLER-01',
    },
    primarySensors: [
      {
        sensorId: 'WQ-401',
        tag: 'EFFLUENT-OPTICAL-COD',
        instrumentType: 'UV-Vis Submersible COD / TSS Spectrometer',
        measurementType: 'Water Quality',
        unit: 'mg/L COD',
        modbusHoldingRegister: 30005,
      },
      {
        sensorId: 'SEN-CHIL-CENT-01-PWR',
        tag: 'SEN-CHIL-CENT-01-PWR',
        instrumentType: 'Compressor Feeder Power Meter',
        measurementType: 'Active Power',
        unit: 'kW',
      },
      {
        sensorId: 'SEN-CHIL-CENT-01-COP',
        tag: 'SEN-CHIL-CENT-01-COP',
        instrumentType: 'Real-Time Coefficient of Performance Meter',
        measurementType: 'COP',
        unit: 'ratio',
      },
    ],
    associatedProjects: ['Process Cooling Loop Header Monitoring'],
    legacyAliases: [
      'cooling',
      'CHILLER-01',
      'CHIL-CENT-01',
      'CHIL-WTR-01',
      'COOL-01',
      'CHIL-01',
      'COOLING',
      'MACHINE_023',
      'MACHINE_024',
      'ASSET-CHIL-01',
    ],
    simulationCapabilities: {
      canSimulate: true,
      archetype: 'CHIL-01',
      constraints: {
        min_chw_supply_temp_c: 6.0,
        max_chw_supply_temp_c: 12.0,
        min_cop: 3.5,
        min_flow_required: true,
      },
    },
  },
};

// Distinct optional catalog archetype for painting line (never collides with chiller)
export const OPTIONAL_PAINT_ARCHETYPE = {
  canonicalId: 'ASSET-PNT-01',
  name: 'Automated Liquid Spray Paint Booth (PL-20)',
  equipmentType: 'painting' as const,
  model: 'SprayTech PL-20 Industrial Booth',
  bay: 'Bay E-2 (Finishing)',
  utilityCellId: 'utility_6',
  utilityCellName: 'Chemical Processing, Paint & Waste Treatment',
  ratedPowerKw: 20.0,
  nominalOperatingKw: 18.0,
  expectedIdleKw: 5.0,
  apparentKva: 21.0,
  powerFactor: 0.90,
  taxonomies: {
    mlForecasting: 'PUMP' as const,
    twinArchetype: 'PAINT-01' as const,
    equipmentRegistryId: 'BOOT-PNT-01',
  },
  legacyAliases: ['PAINT-01', 'BOOT-PNT-01', 'PNT-LINE-01', 'painting', 'ASSET-PNT-01'],
  simulationCapabilities: {
    canSimulate: true,
    archetype: 'PAINT-01' as const,
    constraints: {
      ventilation_mandatory_during_paint: true,
      voc_compliance_active: true,
    },
  },
};

/**
 * Normalizes any legacy string, alias, catalog ID, or sensor reference
 * into the canonical asset ID. Rejects unknown IDs with null.
 */
export function normalizeToCanonicalAssetId(rawId: string): CanonicalAssetId | null {
  if (!rawId) return null;
  const trimmed = rawId.trim();
  if (trimmed in CANONICAL_ASSETS) {
    return trimmed as CanonicalAssetId;
  }
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();

  for (const [canonId, asset] of Object.entries(CANONICAL_ASSETS)) {
    if (
      asset.legacyAliases.some(
        alias => alias.toLowerCase() === lower || alias.toUpperCase() === upper
      )
    ) {
      return canonId as CanonicalAssetId;
    }
  }

  return null;
}

/**
 * Strict resolution: returns CanonicalAsset or throws descriptive error.
 */
export function getCanonicalAssetOrThrow(rawId: string): CanonicalAssetDefinition {
  const canonId = normalizeToCanonicalAssetId(rawId);
  if (!canonId) {
    throw new Error(
      `Unknown machine identifier '${rawId}'. Valid canonical IDs: ${Object.keys(CANONICAL_ASSETS).join(', ')}.`
    );
  }
  return CANONICAL_ASSETS[canonId];
}

/**
 * Resolves legacy twin profile ID for backwards compatibility with digital twin engines.
 * Guaranteed to map chillers to 'CHIL-01' and painting lines to 'PAINT-01'.
 */
export function resolveLegacyTwinArchetype(rawId: string): 'COMP-01' | 'CNC-01' | 'FURN-01' | 'CHIL-01' | 'PAINT-01' {
  const canonId = normalizeToCanonicalAssetId(rawId);
  if (canonId) {
    return CANONICAL_ASSETS[canonId].taxonomies.twinArchetype;
  }
  const upper = (rawId || '').toUpperCase().trim();
  if (upper.includes('PNT') || upper.includes('PAINT') || upper.includes('BOOT')) {
    return 'PAINT-01';
  }
  if (upper.includes('CHIL') || upper.includes('COOL')) {
    return 'CHIL-01';
  }
  return 'COMP-01';
}
