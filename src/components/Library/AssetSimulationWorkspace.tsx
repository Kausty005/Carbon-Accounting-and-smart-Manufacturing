import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Sliders,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Activity,
  Clock,
  Zap,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  Database,
  Info,
  TrendingDown,
  TrendingUp,
  ChevronRight,
  Layers,
  Sparkles,
  BarChart3,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';

import { FleetAsset, fetchFleetAssets } from '../../services/fleetApi';
import { Explainable } from '../AIExplain/Explainable';
import { get24HourBaseline } from '../../digitalTwin/baselineEngine';
import { runScenarioSimulation } from '../../digitalTwin/scenarioEngine';
import {
  DEFAULT_TARIFF_CONFIG,
  DEFAULT_EMISSION_FACTOR,
  MACHINE_PROFILES,
  resolveMachineId,
} from '../../digitalTwin/twinProfiles';
import type {
  ScenarioRequest,
  ScenarioAction,
  SimulationResult,
  TelemetryRecord,
} from '../../digitalTwin/types';
import { PlantWideFleetDashboard } from './PlantWideFleetDashboard';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export type SensorSource = 'live_telemetry' | 'manual_override' | 'estimated';
export type SensorValidationStatus =
  | 'valid'
  | 'missing'
  | 'out_of_range'
  | 'stale'
  | 'unsupported'
  | 'overridden';

export interface SensorRecord {
  sensor_id: string;
  sensor_name: string;
  measurement_type: string;
  unit: string;
  current_reading: number;
  source: SensorSource;
  timestamp: string;
  validation_status: SensorValidationStatus;
  is_required: boolean;
  min_range: number;
  max_range: number;
  model_consumption: 'Direct Model Input' | 'Supplementary Telemetry';
  description: string;
}

export interface SimulationRunRecord {
  run_id: string;
  asset_id: string;
  asset_name: string;
  timestamp: string;
  intervention_type: string;
  sensor_count: number;
  valid_sensor_count: number;
  result: SimulationResult;
  applied_sensor_overrides: Record<string, number>;
}

interface AssetSimulationWorkspaceProps {
  onSelectAsset?: (id: string) => void;
  onNavigateToTwin?: (machineId: string) => void;
}

// ─── Utility Cell Categories ──────────────────────────────────────────────────

const CELL_CATEGORIES = [
  { id: 'all', label: 'All Utility Cells', count: 50 },
  { id: 'utility_1', label: 'Compressed Air & Gas', count: 8 },
  { id: 'utility_2', label: 'Thermal & Steam', count: 10 },
  { id: 'utility_3', label: 'Power & Cogeneration', count: 6 },
  { id: 'utility_4', label: 'Machining & Forming', count: 10 },
  { id: 'utility_5', label: 'Cooling & HVAC', count: 8 },
  { id: 'utility_6', label: 'Chemical, Paint & ETP', count: 8 },
];

// Passive / static infrastructure machines that lack dynamic intervention models
const UNSUPPORTED_ASSET_IDS = new Set([
  'BURN-CTL-01',
  'APFC-CAP-01',
  'TANK-PICK-01',
  'TANK-DEGR-01',
]);

// Maps any 50-catalog asset to its corresponding physics digital twin benchmark archetype
export function getBenchmarkTwinArchetype(asset: FleetAsset): 'COMP-01' | 'CNC-01' | 'FURN-01' | 'PAINT-01' {
  if (asset.digitalTwinMachineId && ['COMP-01', 'CNC-01', 'FURN-01', 'PAINT-01'].includes(asset.digitalTwinMachineId)) {
    return asset.digitalTwinMachineId as any;
  }
  const idUpper = asset.id.toUpperCase();
  if (idUpper.startsWith('COMP') || asset.cellId === 'utility_1') return 'COMP-01';
  if (idUpper.startsWith('CNC') || idUpper.startsWith('MCH') || idUpper.startsWith('LAT') || idUpper.startsWith('PRS') || asset.cellId === 'utility_4') return 'CNC-01';
  if (idUpper.startsWith('FURN') || idUpper.startsWith('BLR') || idUpper.startsWith('OVEN') || asset.cellId === 'utility_2') return 'FURN-01';
  if (idUpper.startsWith('CHIL') || idUpper.startsWith('COOL') || idUpper.startsWith('PNT') || idUpper.startsWith('BOOT') || asset.cellId === 'utility_5' || asset.cellId === 'utility_6') return 'PAINT-01';
  if (asset.cellId === 'utility_3') return 'COMP-01';
  return 'COMP-01';
}

// ─── Domain-Specific Sensor Fleet Generator ───────────────────────────────────

export function generateSensorsForAsset(asset: FleetAsset): SensorRecord[] {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const rated = asset.ratedPowerKw || 25.0;
  const nom = asset.nominalLoadKw || rated * 0.8;
  const standby = asset.standbyDrawKw || rated * 0.15;
  const cellId = asset.cellId;

  // 1. Compressed Air & Gas Systems
  if (cellId === 'utility_1') {
    return [
      {
        sensor_id: `SEN-${asset.id}-PWR`,
        sensor_name: 'Feeder Active Power Meter',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.98 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: Math.round(rated * 1.3),
        model_consumption: 'Direct Model Input',
        description: 'Class 0.5S Modbus register measuring active instantaneous electrical draw.',
      },
      {
        sensor_id: `SEN-${asset.id}-IDLE-PWR`,
        sensor_name: 'Unloaded Idle Power Draw',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(standby * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: rated,
        model_consumption: 'Direct Model Input',
        description: 'Power drawn during unloaded blow-off / bypass mode.',
      },
      {
        sensor_id: `SEN-${asset.id}-PRES-DISCH`,
        sensor_name: 'Discharge Header Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 7.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 4.0,
        max_range: 10.5,
        model_consumption: 'Direct Model Input',
        description: 'Compressor discharge manifold pressure transmitter (4-20mA).',
      },
      {
        sensor_id: `SEN-${asset.id}-TEMP-AMB`,
        sensor_name: 'Intake Air Ambient Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 24.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 10.0,
        max_range: 48.0,
        model_consumption: 'Direct Model Input',
        description: 'Ambient compressor house intake air temp (governs ISO 1217 thermodynamic density).',
      },
      {
        sensor_id: `SEN-${asset.id}-FLOW`,
        sensor_name: 'Delivered Volumetric Airflow',
        measurement_type: 'Flow Rate',
        unit: 'Nm³/min',
        current_reading: Math.round((rated / 6.0) * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: Math.round(rated / 3.5),
        model_consumption: 'Supplementary Telemetry',
        description: 'Thermal mass flow sensor mounted on dry receiver discharge.',
      },
      {
        sensor_id: `SEN-${asset.id}-NRG-24H`,
        sensor_name: 'Cumulative Daily Energy',
        measurement_type: 'Energy',
        unit: 'kWh',
        current_reading: Math.round(nom * 16.0),
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: rated * 24,
        model_consumption: 'Supplementary Telemetry',
        description: 'Fiscal energy meter register accumulated over last 24 hours.',
      },
      {
        sensor_id: `SEN-${asset.id}-PRES-SUMP`,
        sensor_name: 'Internal Oil Sump Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 7.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 1.0,
        max_range: 11.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Internal separator tank pressure for unloader blowdown verification.',
      },
      {
        sensor_id: `SEN-${asset.id}-TEMP-DISCH`,
        sensor_name: 'Airend Discharge Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 82.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 50.0,
        max_range: 115.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Direct airend screw outlet temperature probe.',
      },
      {
        sensor_id: `SEN-${asset.id}-TEMP-OIL`,
        sensor_name: 'Lube Oil Sump Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 68.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 45.0,
        max_range: 95.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Oil circuit temp (safety interlock: requires >= 65°C to avoid condensation).',
      },
      {
        sensor_id: `SEN-${asset.id}-DP-FILT`,
        sensor_name: 'Air Intake Filter Differential Pressure',
        measurement_type: 'Differential Pressure',
        unit: 'mbar',
        current_reading: 18.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 60.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Differential pressure drop across heavy-duty suction filter canister.',
      },
      {
        sensor_id: `SEN-${asset.id}-VIB-MOTOR`,
        sensor_name: 'Motor Drive-End Bearing Vibration',
        measurement_type: 'Vibration',
        unit: 'mm/s RMS',
        current_reading: 2.1,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0.2,
        max_range: 7.5,
        model_consumption: 'Supplementary Telemetry',
        description: 'Tri-axial piezoelectric vibration accelerometer on motor DE shield.',
      },
      {
        sensor_id: `SEN-${asset.id}-VIB-AIREND`,
        sensor_name: 'Airend Female Rotor Vibration',
        measurement_type: 'Vibration',
        unit: 'mm/s RMS',
        current_reading: 2.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0.2,
        max_range: 8.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'High-frequency accelerometer tracking screw mesh harmonic vibration.',
      },
      {
        sensor_id: `SEN-${asset.id}-STATE`,
        sensor_name: 'Machine Execution State',
        measurement_type: 'Operating State',
        unit: 'enum',
        current_reading: 1, // 1: Idle
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 3,
        model_consumption: 'Direct Model Input',
        description: 'PLC operational status (0: Off, 1: Unloaded Idle, 2: Loaded Run, 3: Maintenance).',
      },
    ];
  }

  // 2. Machining, Forming & Heavy Fabrication
  if (cellId === 'utility_4') {
    return [
      {
        sensor_id: `SEN-${asset.id}-PWR`,
        sensor_name: 'Main Incomer Active Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.95 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: Math.round(rated * 1.3),
        model_consumption: 'Direct Model Input',
        description: 'Overall CNC feeder electrical draw including spindle, drives, and auxiliaries.',
      },
      {
        sensor_id: `SEN-${asset.id}-SPINDLE-PWR`,
        sensor_name: 'Spindle Motor Cutting Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.7 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: rated,
        model_consumption: 'Direct Model Input',
        description: 'Direct inverter power draw on the primary machining spindle motor.',
      },
      {
        sensor_id: `SEN-${asset.id}-IDLE-PWR`,
        sensor_name: 'Unloaded Spindle Standby Draw',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(standby * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: rated,
        model_consumption: 'Direct Model Input',
        description: 'Standby baseline draw when CNC is waiting for part loading or cycle start.',
      },
      {
        sensor_id: `SEN-${asset.id}-PART-COUNT`,
        sensor_name: 'Daily Shift Production Count',
        measurement_type: 'Throughput',
        unit: 'units',
        current_reading: 140,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 500,
        model_consumption: 'Direct Model Input',
        description: 'Daily completed machined components (governs production throughput constraints).',
      },
      {
        sensor_id: `SEN-${asset.id}-SPINDLE-RPM`,
        sensor_name: 'Spindle Rotational Speed',
        measurement_type: 'Rotational Speed',
        unit: 'RPM',
        current_reading: 4200,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 12000,
        model_consumption: 'Supplementary Telemetry',
        description: 'Encoder feedback measuring spindle cutting revolutions per minute.',
      },
      {
        sensor_id: `SEN-${asset.id}-FEED-RATE`,
        sensor_name: 'Cutting Axis Feed Rate',
        measurement_type: 'Velocity',
        unit: 'mm/min',
        current_reading: 850,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 5000,
        model_consumption: 'Supplementary Telemetry',
        description: 'Interpolated linear feed speed during active chip-cutting passes.',
      },
      {
        sensor_id: `SEN-${asset.id}-COOL-PRES`,
        sensor_name: 'Through-Spindle Coolant Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 20.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 70.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'High-pressure coolant delivery to carbide tool cutting edges.',
      },
      {
        sensor_id: `SEN-${asset.id}-BEAR-TEMP`,
        sensor_name: 'Spindle Front Bearing Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 38.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 15.0,
        max_range: 75.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Embedded PT100 RTD monitoring ceramic hybrid bearing heat rise.',
      },
      {
        sensor_id: `SEN-${asset.id}-VIB-SPINDLE`,
        sensor_name: 'Spindle Cartridge Vibration',
        measurement_type: 'Vibration',
        unit: 'mm/s',
        current_reading: 1.4,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0.1,
        max_range: 6.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Broadband vibration tracking chatter and bearing raceway degradation.',
      },
      {
        sensor_id: `SEN-${asset.id}-SERVO-X`,
        sensor_name: 'X-Axis Servo Drive Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: 2.4,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 8.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Ball-screw drive servo draw during table traversals.',
      },
      {
        sensor_id: `SEN-${asset.id}-IDLE-MIN`,
        sensor_name: 'Non-Productive Idle Duration',
        measurement_type: 'Duration',
        unit: 'min',
        current_reading: 65,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 480,
        model_consumption: 'Supplementary Telemetry',
        description: 'Accumulated shift time spent in unmachined standby.',
      },
      {
        sensor_id: `SEN-${asset.id}-STATE`,
        sensor_name: 'CNC Mode State',
        measurement_type: 'Operating State',
        unit: 'enum',
        current_reading: 2, // 2: Running
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 3,
        model_consumption: 'Direct Model Input',
        description: 'Controller state: 0: Off, 1: Standby/Wait, 2: Auto Machining, 3: Tool Setup.',
      },
    ];
  }

  // 3. Thermal, Combustion & Steam Utilities
  if (cellId === 'utility_2') {
    return [
      {
        sensor_id: `SEN-${asset.id}-PWR`,
        sensor_name: 'Main Thermal / Blower Power Input',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.95 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: Math.round(rated * 1.3),
        model_consumption: 'Direct Model Input',
        description: 'Total induction / burner combustion blower electrical demand.',
      },
      {
        sensor_id: `SEN-${asset.id}-TEMP-CHAMBER`,
        sensor_name: 'Primary Furnace Chamber Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 850.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 150.0,
        max_range: 1250.0,
        model_consumption: 'Direct Model Input',
        description: 'Type-K duplex thermocouple monitoring hot zone process metallurgy.',
      },
      {
        sensor_id: `SEN-${asset.id}-HOLD-PWR`,
        sensor_name: 'Thermal Holding Standby Draw',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.max(15.0, Math.round(standby * 10) / 10),
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 12.0,
        max_range: rated,
        model_consumption: 'Direct Model Input',
        description: 'Minimum thermal holding threshold required to prevent metallurgy quench cracking.',
      },
      {
        sensor_id: `SEN-${asset.id}-FUEL-FLOW`,
        sensor_name: 'Combustion Fuel Flow Rate',
        measurement_type: 'Flow Rate',
        unit: 'Nm³/h',
        current_reading: Math.round((rated * 0.12) * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: rated * 0.5,
        model_consumption: 'Supplementary Telemetry',
        description: 'Coriolis / vortex fuel mass meter on natural gas burner train.',
      },
      {
        sensor_id: `SEN-${asset.id}-FLUE-TEMP`,
        sensor_name: 'Chimney Flue Gas Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 215.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 80.0,
        max_range: 350.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Exhaust stack temperature indicating heat exchanger recovery performance.',
      },
      {
        sensor_id: `SEN-${asset.id}-FLUE-O2`,
        sensor_name: 'Flue Gas Excess Oxygen',
        measurement_type: 'Concentration',
        unit: '%',
        current_reading: 3.2,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0.5,
        max_range: 8.5,
        model_consumption: 'Supplementary Telemetry',
        description: 'Zirconia oxygen probe measuring air-fuel combustion stoichiometric balance.',
      },
      {
        sensor_id: `SEN-${asset.id}-SKIN-TEMP`,
        sensor_name: 'Furnace Refractory Outer Skin Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 58.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 25.0,
        max_range: 120.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Surface contact RTD evaluating ceramic refractory thermal insulation leakage.',
      },
      {
        sensor_id: `SEN-${asset.id}-HOLD-STATE`,
        sensor_name: 'Protected Soaking Cycle Interlock',
        measurement_type: 'Binary State',
        unit: 'flag',
        current_reading: 1, // 1: Active holding
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 1,
        model_consumption: 'Direct Model Input',
        description: 'Process safety flag: 1 indicates holding cycle is active and cannot be shut down.',
      },
      {
        sensor_id: `SEN-${asset.id}-STEAM-PRES`,
        sensor_name: 'Header Steam Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 8.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 2.0,
        max_range: 16.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Main steam manifold output delivery pressure.',
      },
      {
        sensor_id: `SEN-${asset.id}-CO-FLUE`,
        sensor_name: 'Flue Gas Carbon Monoxide',
        measurement_type: 'Concentration',
        unit: 'ppm',
        current_reading: 18.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 250.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'NDIR optical analyzer checking incomplete combustion loss.',
      },
    ];
  }

  // 4. Chemical Processing, Paint & Waste Treatment
  if (cellId === 'utility_6') {
    return [
      {
        sensor_id: `SEN-${asset.id}-PWR`,
        sensor_name: 'Exhaust Blower Motor Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.95 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: Math.round(rated * 1.3),
        model_consumption: 'Direct Model Input',
        description: 'VFD active electrical demand on the primary paint booth / ETP exhaust fan.',
      },
      {
        sensor_id: `SEN-${asset.id}-VENT-MIN-PWR`,
        sensor_name: 'Mandatory Safety Ventilation Threshold',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: 5.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 4.0,
        max_range: rated,
        model_consumption: 'Direct Model Input',
        description: 'Statutory minimum blower power required to satisfy factory VOC health codes.',
      },
      {
        sensor_id: `SEN-${asset.id}-VOC-PPM`,
        sensor_name: 'VOC Solvent Air Concentration',
        measurement_type: 'Concentration',
        unit: 'ppm',
        current_reading: 14.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 100.0,
        model_consumption: 'Direct Model Input',
        description: 'Photoionization detector (PID) monitoring explosive solvent concentration.',
      },
      {
        sensor_id: `SEN-${asset.id}-EXH-FLOW`,
        sensor_name: 'Booth Exhaust Volumetric Airflow',
        measurement_type: 'Flow Rate',
        unit: 'm³/h',
        current_reading: 8500,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 2000,
        max_range: 25000,
        model_consumption: 'Direct Model Input',
        description: 'Pitot tube airflow transmitter ensuring negative pressure envelope.',
      },
      {
        sensor_id: `SEN-${asset.id}-PAINT-ACTIVE`,
        sensor_name: 'Spraying Process Active Interlock',
        measurement_type: 'Binary State',
        unit: 'flag',
        current_reading: 1, // 1: Active
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: 1,
        model_consumption: 'Direct Model Input',
        description: 'Robotic spray atomization interlock (requires continuous ventilation when 1).',
      },
      {
        sensor_id: `SEN-${asset.id}-BOOTH-TEMP`,
        sensor_name: 'Application Zone Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 22.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 15.0,
        max_range: 35.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Climate-controlled spray chamber dry-bulb temperature.',
      },
      {
        sensor_id: `SEN-${asset.id}-BOOTH-RH`,
        sensor_name: 'Spray Booth Relative Humidity',
        measurement_type: 'Humidity',
        unit: '%',
        current_reading: 62.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 30.0,
        max_range: 85.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Thinning solvent evaporation and paint finish humidity sensor.',
      },
      {
        sensor_id: `SEN-${asset.id}-FILT-DP`,
        sensor_name: 'Paint Overspray Filter Delta-P',
        measurement_type: 'Differential Pressure',
        unit: 'Pa',
        current_reading: 210.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 50.0,
        max_range: 650.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Differential pressure gauge tracking paint booth baffle filter saturation.',
      },
      {
        sensor_id: `SEN-${asset.id}-PUMP-PWR`,
        sensor_name: 'Water Wash Recirculation Pump Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: 4.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0,
        max_range: 11.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Pump delivering scrubber water curtain to capture overspray particulates.',
      },
      {
        sensor_id: `SEN-${asset.id}-ETP-COD`,
        sensor_name: 'Effluent COD Optical Absorption',
        measurement_type: 'Water Quality',
        unit: 'mg/L',
        current_reading: 185.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 20.0,
        max_range: 800.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Submersible UV-Vis spectrometer measuring chemical oxygen demand before discharge.',
      },
    ];
  }

  // 5. Industrial Cooling, Pumping & HVAC
  if (cellId === 'utility_5') {
    return [
      {
        sensor_id: `SEN-${asset.id}-PWR`,
        sensor_name: 'Chiller / Pump Motor Active Power',
        measurement_type: 'Active Power',
        unit: 'kW',
        current_reading: Math.round(nom * 0.95 * 10) / 10,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 0,
        max_range: Math.round(rated * 1.3),
        model_consumption: 'Direct Model Input',
        description: 'Main electrical demand on the compressor or variable primary pump.',
      },
      {
        sensor_id: `SEN-${asset.id}-CHW-SUP-TEMP`,
        sensor_name: 'Chilled Water Supply Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 7.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 4.0,
        max_range: 14.0,
        model_consumption: 'Direct Model Input',
        description: 'Leaving evaporator water temp delivered to shopfloor cooling loops.',
      },
      {
        sensor_id: `SEN-${asset.id}-SETPOINT`,
        sensor_name: 'Target Chilled Water Setpoint',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 7.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 5.0,
        max_range: 12.0,
        model_consumption: 'Direct Model Input',
        description: 'Chilled water supply setpoint (each +1°C reset reduces compressor lift power by ~3%).',
      },
      {
        sensor_id: `SEN-${asset.id}-CHW-RET-TEMP`,
        sensor_name: 'Chilled Water Return Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 12.5,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 7.0,
        max_range: 20.0,
        model_consumption: 'Direct Model Input',
        description: 'Return header temp from manufacturing process cooling jackets.',
      },
      {
        sensor_id: `SEN-${asset.id}-CHW-FLOW`,
        sensor_name: 'Chilled Water Volumetric Flow',
        measurement_type: 'Flow Rate',
        unit: 'm³/h',
        current_reading: Math.round(rated * 1.2),
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: true,
        min_range: 10.0,
        max_range: rated * 3.0,
        model_consumption: 'Direct Model Input',
        description: 'Electromagnetic flow meter on the primary chilled water evaporator loop.',
      },
      {
        sensor_id: `SEN-${asset.id}-COND-IN`,
        sensor_name: 'Condenser Water Inlet Temperature',
        measurement_type: 'Temperature',
        unit: '°C',
        current_reading: 29.0,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 20.0,
        max_range: 38.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Water returning from cooling tower to chiller condenser shell.',
      },
      {
        sensor_id: `SEN-${asset.id}-COP`,
        sensor_name: 'Instantaneous Coefficient of Performance',
        measurement_type: 'Efficiency Ratio',
        unit: 'COP',
        current_reading: 4.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 2.0,
        max_range: 7.5,
        model_consumption: 'Supplementary Telemetry',
        description: 'Thermodynamic refrigeration efficiency calculated from kWth / kWe.',
      },
      {
        sensor_id: `SEN-${asset.id}-SUCT-PRES`,
        sensor_name: 'Refrigerant Suction Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 3.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 2.0,
        max_range: 6.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'Low-side refrigerant pressure entering compressor screw lobes.',
      },
      {
        sensor_id: `SEN-${asset.id}-DISCH-PRES`,
        sensor_name: 'Refrigerant Discharge Pressure',
        measurement_type: 'Pressure',
        unit: 'bar',
        current_reading: 13.2,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 8.0,
        max_range: 22.0,
        model_consumption: 'Supplementary Telemetry',
        description: 'High-side refrigerant pressure delivered to condenser tubes.',
      },
      {
        sensor_id: `SEN-${asset.id}-VIB-MOTOR`,
        sensor_name: 'Compressor Bearing Vibration',
        measurement_type: 'Vibration',
        unit: 'mm/s',
        current_reading: 1.8,
        source: 'live_telemetry',
        timestamp: now,
        validation_status: 'valid',
        is_required: false,
        min_range: 0.1,
        max_range: 6.5,
        model_consumption: 'Supplementary Telemetry',
        description: 'Shaft accelerometer monitoring rotor unbalance and cavitation.',
      },
    ];
  }

  // 6. Power Generation, Cogeneration & Energy Storage (Default generic)
  return [
    {
      sensor_id: `SEN-${asset.id}-PWR`,
      sensor_name: 'Active Generation / Incomer Power',
      measurement_type: 'Active Power',
      unit: 'kW',
      current_reading: Math.round(nom * 0.95 * 10) / 10,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: true,
      min_range: 0,
      max_range: Math.round(rated * 1.3),
      model_consumption: 'Direct Model Input',
      description: 'Main active electrical power delivered to or drawn from the plant 11kV bus.',
    },
    {
      sensor_id: `SEN-${asset.id}-GRID-INCOMER`,
      sensor_name: 'Main Factory Grid Incomer Load',
      measurement_type: 'Active Power',
      unit: 'kW',
      current_reading: 85.0,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: true,
      min_range: 0,
      max_range: 1250.0,
      model_consumption: 'Direct Model Input',
      description: 'Total factory coincident demand tracked against sanctioned contract limit.',
    },
    {
      sensor_id: `SEN-${asset.id}-FREQ`,
      sensor_name: 'Busbar Frequency',
      measurement_type: 'Frequency',
      unit: 'Hz',
      current_reading: 50.02,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 48.5,
      max_range: 51.5,
      model_consumption: 'Supplementary Telemetry',
      description: 'Grid synchronization frequency transducer.',
    },
    {
      sensor_id: `SEN-${asset.id}-VOLT`,
      sensor_name: 'Line-to-Line Voltage L1-L2',
      measurement_type: 'Voltage',
      unit: 'V',
      current_reading: 415.0,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 360.0,
      max_range: 460.0,
      model_consumption: 'Supplementary Telemetry',
      description: 'Feeder RMS voltage from Class 0.5S power transducer.',
    },
    {
      sensor_id: `SEN-${asset.id}-PF`,
      sensor_name: 'System Power Factor',
      measurement_type: 'Power Factor',
      unit: 'cos φ',
      current_reading: 0.96,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 0.7,
      max_range: 1.0,
      model_consumption: 'Supplementary Telemetry',
      description: 'Displacement power factor monitored for utility penalty avoidance.',
    },
    {
      sensor_id: `SEN-${asset.id}-BESS-SOC`,
      sensor_name: 'Battery State of Charge',
      measurement_type: 'Energy Storage',
      unit: '%',
      current_reading: 78.0,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 10.0,
      max_range: 100.0,
      model_consumption: 'Direct Model Input',
      description: 'BESS battery management system (BMS) available capacity percentage.',
    },
    {
      sensor_id: `SEN-${asset.id}-FUEL-RATE`,
      sensor_name: 'Fuel Consumption Rate',
      measurement_type: 'Fuel Rate',
      unit: 'L/h',
      current_reading: Math.round(rated * 0.22),
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 0,
      max_range: rated * 0.45,
      model_consumption: 'Supplementary Telemetry',
      description: 'Differential fuel flow meter measuring diesel / gas intake.',
    },
    {
      sensor_id: `SEN-${asset.id}-HEAT-REC`,
      sensor_name: 'Cogeneration Waste Heat Output',
      measurement_type: 'Thermal Power',
      unit: 'kWth',
      current_reading: Math.round(rated * 0.8),
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 0,
      max_range: rated * 1.5,
      model_consumption: 'Supplementary Telemetry',
      description: 'Heat recovery exchanger thermal output delivered to process hot water loop.',
    },
    {
      sensor_id: `SEN-${asset.id}-TEMP-EXH`,
      sensor_name: 'Exhaust Gas Manifold Temperature',
      measurement_type: 'Temperature',
      unit: '°C',
      current_reading: 420.0,
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: false,
      min_range: 100.0,
      max_range: 580.0,
      model_consumption: 'Supplementary Telemetry',
      description: 'Turbocharger / microturbine exhaust gas manifold thermocouple.',
    },
    {
      sensor_id: `SEN-${asset.id}-TARIFF-ZONE`,
      sensor_name: 'Active Tariff Time-of-Day Zone',
      measurement_type: 'Tariff Rate',
      unit: 'enum',
      current_reading: 2, // 2: PEAK (₹10.80/kWh)
      source: 'live_telemetry',
      timestamp: now,
      validation_status: 'valid',
      is_required: true,
      min_range: 0,
      max_range: 2,
      model_consumption: 'Direct Model Input',
      description: 'Current Time-of-Day electricity pricing zone (0: Off-Peak, 1: Normal, 2: Peak).',
    },
  ];
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AssetSimulationWorkspace({
  onSelectAsset,
  onNavigateToTwin,
}: AssetSimulationWorkspaceProps) {
  // Navigation / View state
  const [workspaceView, setWorkspaceView] = useState<'workspace' | 'fleet'>('workspace');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Asset Catalog state
  const [assets, setAssets] = useState<FleetAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<string>('all');
  const [compatFilter, setCompatFilter] = useState<'all' | 'compatible_only' | 'unsupported'>('all');
  const [sortField, setSortField] = useState<'ratedPowerKw' | 'name' | 'id'>('ratedPowerKw');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Selected Machine & Configured Sensors
  const [selectedAsset, setSelectedAsset] = useState<FleetAsset | null>(null);
  const [sensors, setSensors] = useState<SensorRecord[]>([]);
  const [sensorSearch, setSensorSearch] = useState<string>('');
  const [sensorFilter, setSensorFilter] = useState<'all' | 'required' | 'overridden' | 'direct_input'>('all');

  // Intervention Scenario Parameters
  const [selectedIntervention, setSelectedIntervention] = useState<ScenarioAction['type']>('reduce_idle_power');
  const [paramTargetPowerKw, setParamTargetPowerKw] = useState<number>(8.0);
  const [paramTargetPressureBar, setParamTargetPressureBar] = useState<number>(6.8);
  const [paramDurationHours, setParamDurationHours] = useState<number>(2.0);
  const [paramOffsetHours, setParamOffsetHours] = useState<number>(2);
  const [paramAmbientTempC, setParamAmbientTempC] = useState<number>(24.0);

  // Simulation Results & History
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [activeRunRecord, setActiveRunRecord] = useState<SimulationRunRecord | null>(null);
  const [simulationHistory, setSimulationHistory] = useState<SimulationRunRecord[]>([]);

  // Modals & UI helpers
  const [isAddSensorModalOpen, setIsAddSensorModalOpen] = useState<boolean>(false);
  const [editingSensor, setEditingSensor] = useState<SensorRecord | null>(null);
  const [validationBanner, setValidationBanner] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  // New Sensor Form state
  const [newSensorId, setNewSensorId] = useState<string>('');
  const [newSensorName, setNewSensorName] = useState<string>('');
  const [newSensorType, setNewSensorType] = useState<string>('Active Power');
  const [newSensorUnit, setNewSensorUnit] = useState<string>('kW');
  const [newSensorReading, setNewSensorReading] = useState<number>(10.0);
  const [newSensorMin, setNewSensorMin] = useState<number>(0);
  const [newSensorMax, setNewSensorMax] = useState<number>(50);
  const [newSensorRequired, setNewSensorRequired] = useState<boolean>(false);

  // 1. Load initial assets
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      setLoadingAssets(true);
      try {
        const res = await fetchFleetAssets();
        if (isMounted) {
          setAssets(res.assets);
          if (res.assets.length > 0 && !selectedAsset) {
            // Default select first compressor as initial benchmark
            const defaultAsset = res.assets.find(a => a.id === 'COMP-ROT-01') || res.assets[0];
            handleSelectAsset(defaultAsset, false);
          }
        }
      } catch (err) {
        console.error('Failed to load fleet assets:', err);
      } finally {
        if (isMounted) setLoadingAssets(false);
      }
    }
    loadCatalog();
    return () => { isMounted = false; };
  }, []);

  // 2. Asset selection handler
  const handleSelectAsset = useCallback((asset: FleetAsset, advanceToStep2: boolean = true) => {
    setSelectedAsset(asset);
    if (onSelectAsset) onSelectAsset(asset.id);

    // Generate tailored sensors
    const defaultSensors = generateSensorsForAsset(asset);
    setSensors(defaultSensors);

    // Set default intervention and parameters based on machine category
    const isComp = asset.cellId === 'utility_1';
    const isCnc = asset.cellId === 'utility_4';
    const isFurnace = asset.cellId === 'utility_2';
    const isCooling = asset.cellId === 'utility_5';

    if (isComp) {
      setSelectedIntervention('reduce_idle_power');
      setParamTargetPowerKw(8.0);
      setParamTargetPressureBar(6.8);
      setParamDurationHours(2.0);
      setParamAmbientTempC(24.0);
    } else if (isCnc) {
      setSelectedIntervention('reduce_idle_power');
      setParamTargetPowerKw(3.0);
      setParamDurationHours(1.5);
    } else if (isFurnace) {
      setSelectedIntervention('reduce_idle_power');
      setParamTargetPowerKw(15.0);
      setParamDurationHours(2.0);
    } else if (isCooling) {
      setSelectedIntervention('pressure_optimization'); // used for setpoint reset
      setParamTargetPressureBar(8.5); // setpoint °C
    } else {
      setSelectedIntervention('reduce_idle_power');
      setParamTargetPowerKw(asset.standbyDrawKw || 5.0);
    }

    setValidationBanner(null);
    setSimulationResult(null);
    setActiveRunRecord(null);

    if (advanceToStep2) {
      setCurrentStep(2);
    }
  }, [onSelectAsset]);

  // 3. Sensor validation function
  const validateSensors = useCallback((records: SensorRecord[]): {
    isValid: boolean;
    configuredCount: number;
    validCount: number;
    missingCount: number;
    outOfRangeCount: number;
    overriddenCount: number;
    errors: string[];
    warnings: string[];
  } => {
    let validCount = 0;
    let missingCount = 0;
    let outOfRangeCount = 0;
    let overriddenCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check duplicate IDs
    const seenIds = new Set<string>();
    for (const s of records) {
      if (seenIds.has(s.sensor_id)) {
        errors.push(`Duplicate Sensor ID detected: '${s.sensor_id}'. Sensor IDs must be unique.`);
      }
      seenIds.add(s.sensor_id);

      if (s.source === 'manual_override') {
        overriddenCount++;
      }

      if (s.current_reading === undefined || s.current_reading === null || isNaN(s.current_reading)) {
        if (s.is_required) {
          missingCount++;
          errors.push(`Required sensor '${s.sensor_name}' (${s.sensor_id}) has a missing reading.`);
        } else {
          warnings.push(`Optional sensor '${s.sensor_name}' has no reading.`);
        }
        continue;
      }

      if (s.current_reading < s.min_range || s.current_reading > s.max_range) {
        outOfRangeCount++;
        const msg = `Sensor '${s.sensor_name}' value ${s.current_reading} ${s.unit} is outside configured operating limits [${s.min_range}–${s.max_range} ${s.unit}].`;
        if (s.is_required) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      } else {
        validCount++;
      }
    }

    return {
      isValid: errors.length === 0,
      configuredCount: records.length,
      validCount,
      missingCount,
      outOfRangeCount,
      overriddenCount,
      errors,
      warnings,
    };
  }, []);

  // Update sensor reading
  const handleUpdateSensorReading = useCallback((sensorId: string, newReading: number) => {
    setSensors(prev =>
      prev.map(s => {
        if (s.sensor_id !== sensorId) return s;
        const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
        const isOutOfRange = newReading < s.min_range || newReading > s.max_range;
        return {
          ...s,
          current_reading: newReading,
          source: 'manual_override',
          timestamp: now,
          validation_status: isOutOfRange ? 'out_of_range' : 'overridden',
        };
      })
    );

    // If updating ambient temperature boundary condition, sync ambient parameter
    if (sensorId.includes('TEMP-AMB')) {
      setParamAmbientTempC(newReading);
    }
  }, []);

  // Restore defaults
  const handleRestoreDefaultSensors = useCallback(() => {
    if (!selectedAsset) return;
    const defaults = generateSensorsForAsset(selectedAsset);
    setSensors(defaults);
    setValidationBanner({
      type: 'success',
      message: `Restored default sensor set (${defaults.length} sensors) from catalog specification.`,
    });
  }, [selectedAsset]);

  // Clear manual overrides
  const handleClearOverrides = useCallback(() => {
    if (!selectedAsset) return;
    const defaults = generateSensorsForAsset(selectedAsset);
    setSensors(prev =>
      prev.map(s => {
        const def = defaults.find(d => d.sensor_id === s.sensor_id);
        if (def) {
          return {
            ...s,
            current_reading: def.current_reading,
            source: 'live_telemetry',
            validation_status: 'valid',
          };
        }
        return s;
      })
    );
    setValidationBanner({
      type: 'success',
      message: 'Cleared all manual overrides. Telemetry reset to live Modbus streaming readings.',
    });
  }, [selectedAsset]);

  // Remove sensor
  const handleRemoveSensor = useCallback((sensorId: string) => {
    setSensors(prev => prev.filter(s => s.sensor_id !== sensorId));
  }, []);

  // Add custom sensor
  const handleAddCustomSensor = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!newSensorId || !newSensorName) return;

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const isOut = newSensorReading < newSensorMin || newSensorReading > newSensorMax;

    const sensor: SensorRecord = {
      sensor_id: newSensorId.trim().toUpperCase(),
      sensor_name: newSensorName.trim(),
      measurement_type: newSensorType,
      unit: newSensorUnit,
      current_reading: Number(newSensorReading),
      source: 'manual_override',
      timestamp: now,
      validation_status: isOut ? 'out_of_range' : 'overridden',
      is_required: newSensorRequired,
      min_range: Number(newSensorMin),
      max_range: Number(newSensorMax),
      model_consumption: 'Supplementary Telemetry',
      description: 'Operator configured instrumentation input.',
    };

    setSensors(prev => [sensor, ...prev]);
    setIsAddSensorModalOpen(false);
    // Reset form
    setNewSensorId('');
    setNewSensorName('');
    setValidationBanner({
      type: 'success',
      message: `Added custom sensor '${sensor.sensor_name}' (${sensor.sensor_id}).`,
    });
  }, [newSensorId, newSensorName, newSensorType, newSensorUnit, newSensorReading, newSensorMin, newSensorMax, newSensorRequired]);

  // 4. Run Simulation Engine with Selected Asset & Validated Sensors
  const handleRunSimulation = useCallback(() => {
    if (!selectedAsset) return;

    // Check compatibility
    if (UNSUPPORTED_ASSET_IDS.has(selectedAsset.id)) {
      setValidationBanner({
        type: 'error',
        message: `Simulation Blocked: '${selectedAsset.name}' is a static/passive infrastructure asset without a dynamic mechanical drive or variable operational model. Parameter mappings are not available.`,
      });
      return;
    }

    // Validate sensors
    const valResult = validateSensors(sensors);
    if (!valResult.isValid) {
      setValidationBanner({
        type: 'error',
        message: `Simulation Blocked: ${valResult.errors[0]} Please correct all input errors before running simulation.`,
      });
      return;
    }

    setIsSimulating(true);

    try {
      // 1. Resolve benchmark twin archetype (COMP-01, CNC-01, FURN-01, PAINT-01)
      const benchmarkMachineId = getBenchmarkTwinArchetype(selectedAsset);
      const isDirectTwin = Boolean(MACHINE_PROFILES[selectedAsset.id]);

      // 2. Fetch baseline records (24-hour representative profile with Day 7 active anomaly)
      const rawBaseline = get24HourBaseline(6);

      // 3. Map asset rated power scaling if not direct core twin
      const archetypeRatedKw = benchmarkMachineId === 'COMP-01' ? 30.0 : benchmarkMachineId === 'CNC-01' ? 25.0 : benchmarkMachineId === 'FURN-01' ? 50.0 : 20.0;
      const scaleFactor = isDirectTwin
        ? 1.0
        : (selectedAsset.ratedPowerKw || 25.0) / archetypeRatedKw;

      // Extract user sensor readings for direct model inputs
      const idleSensor = sensors.find(s => s.sensor_id.includes('IDLE-PWR') || s.sensor_id.includes('HOLD-PWR'));
      const presSensor = sensors.find(s => s.sensor_id.includes('PRES-DISCH') || s.sensor_id.includes('SETPOINT'));
      const ambSensor = sensors.find(s => s.sensor_id.includes('TEMP-AMB'));

      // If user provided a specific idle/standby power reading, incorporate into baseline idle draw
      const observedIdleKw = idleSensor && typeof idleSensor.current_reading === 'number'
        ? idleSensor.current_reading
        : null;

      // Deep copy and apply scaled machine baseline for the matched archetype
      const baselineRecords: TelemetryRecord[] = rawBaseline.map(r => {
        if (r.machine_id === benchmarkMachineId) {
          let pKw = Math.round(r.power_kw * scaleFactor * 10) / 10;
          if (r.machine_state === 'idle' && observedIdleKw !== null) {
            pKw = observedIdleKw;
          }
          return {
            ...r,
            power_kw: pKw,
            energy_kwh: pKw,
          };
        }
        return { ...r };
      });

      // 4. Construct scenario action with mapped sensor readings
      const action: ScenarioAction = {
        type: selectedIntervention,
        machine_id: benchmarkMachineId, // Ensure scenarioEngine matches against the benchmark machine ID
        duration_hours: Number(paramDurationHours),
      };

      if (selectedIntervention === 'reduce_idle_power') {
        action.target_power_kw = Number(paramTargetPowerKw);
        action.target_state = 'idle';
      } else if (selectedIntervention === 'pressure_optimization') {
        action.baseline_pressure_bar = presSensor ? presSensor.current_reading : 7.5;
        action.target_pressure_bar = Number(paramTargetPressureBar);
      } else if (selectedIntervention === 'shift_schedule') {
        action.offset_hours = Number(paramOffsetHours);
      }

      // Map ambient temperature sensor if present
      if (ambSensor && typeof ambSensor.current_reading === 'number') {
        action.ambient_temp_c = ambSensor.current_reading;
      }

      const req: ScenarioRequest = {
        scenario_id: `SCN-${selectedAsset.id}-${Date.now().toString().slice(-4)}`,
        action,
        assumptions: {
          asset_id: selectedAsset.id,
          asset_name: selectedAsset.name,
          utility_cell: selectedAsset.cell,
          configured_sensors: sensors.length,
          overridden_sensors: valResult.overriddenCount,
          model_archetype: benchmarkMachineId,
          tariff_standard: 'Maharashtra Industrial HT ToD 2026',
          grid_emission_standard: 'CEA India Baseline v22 (0.82 kg CO2/kWh)',
        },
      };

      // 5. Execute simulation engine
      const simRes = runScenarioSimulation(
        baselineRecords,
        req,
        DEFAULT_TARIFF_CONFIG,
        DEFAULT_EMISSION_FACTOR
      );

      // Collect overrides map
      const overridesMap: Record<string, number> = {};
      sensors.filter(s => s.source === 'manual_override').forEach(s => {
        overridesMap[s.sensor_name] = s.current_reading;
      });

      const runRecord: SimulationRunRecord = {
        run_id: `SIM-${selectedAsset.id}-${Math.floor(1000 + Math.random() * 9000)}`,
        asset_id: selectedAsset.id,
        asset_name: selectedAsset.name,
        timestamp: new Date().toLocaleTimeString(),
        intervention_type: selectedIntervention.replace(/_/g, ' ').toUpperCase(),
        sensor_count: sensors.length,
        valid_sensor_count: valResult.validCount,
        result: simRes,
        applied_sensor_overrides: overridesMap,
      };

      setSimulationResult(simRes);
      setActiveRunRecord(runRecord);
      setSimulationHistory(prev => [runRecord, ...prev.slice(0, 9)]); // keep 10 latest runs

      // Advance to Step 3
      setCurrentStep(3);
      setValidationBanner(null);
    } catch (err: any) {
      console.error('Simulation execution failed:', err);
      setValidationBanner({
        type: 'error',
        message: `Simulation execution failed: ${err.message || 'Unknown internal error'}`,
      });
    } finally {
      setIsSimulating(false);
    }
  }, [selectedAsset, sensors, selectedIntervention, paramTargetPowerKw, paramTargetPressureBar, paramDurationHours, paramOffsetHours, paramAmbientTempC, validateSensors]);

  // Filtered asset catalog list
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      const matchSearch =
        a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.cell.toLowerCase().includes(searchTerm.toLowerCase());

      const matchCell = selectedCell === 'all' || a.cellId === selectedCell;

      const isCompat = !UNSUPPORTED_ASSET_IDS.has(a.id);
      const matchCompat =
        compatFilter === 'all' ||
        (compatFilter === 'compatible_only' && isCompat) ||
        (compatFilter === 'unsupported' && !isCompat);

      return matchSearch && matchCell && matchCompat;
    });
  }, [assets, searchTerm, selectedCell, compatFilter]);

  // Sorted and paginated assets
  const sortedAssets = useMemo(() => {
    return [...filteredAssets].sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredAssets, sortField, sortAsc]);

  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedAssets.slice(start, start + pageSize);
  }, [sortedAssets, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedAssets.length / pageSize) || 1;

  // Filtered sensors in Step 2
  const filteredSensors = useMemo(() => {
    return sensors.filter(s => {
      const matchesSearch =
        s.sensor_name.toLowerCase().includes(sensorSearch.toLowerCase()) ||
        s.sensor_id.toLowerCase().includes(sensorSearch.toLowerCase()) ||
        s.measurement_type.toLowerCase().includes(sensorSearch.toLowerCase());

      const matchesFilter =
        sensorFilter === 'all' ||
        (sensorFilter === 'required' && s.is_required) ||
        (sensorFilter === 'overridden' && s.source === 'manual_override') ||
        (sensorFilter === 'direct_input' && s.model_consumption === 'Direct Model Input');

      return matchesSearch && matchesFilter;
    });
  }, [sensors, sensorSearch, sensorFilter]);

  // Sensor stats
  const sensorStats = useMemo(() => {
    return validateSensors(sensors);
  }, [sensors, validateSensors]);

  // Render secondary full fleet dashboard tab if toggled
  if (workspaceView === 'fleet') {
    return (
      <div style={{ padding: '24px 32px', background: '#FAF7F2', minHeight: '100vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#0F172A' }}>
              Plant-Wide Asset Fleet Matrix
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
              High-level supervisory overview across all 50 industrial assets.
            </p>
          </div>
          <button
            onClick={() => setWorkspaceView('workspace')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              color: '#1E293B',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Sliders size={15} color="#2563EB" />
            Switch to Simulation Workspace
          </button>
        </div>
        <PlantWideFleetDashboard onSelectAsset={onSelectAsset} onNavigateToTwin={onNavigateToTwin} />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', background: '#FAF7F2', minHeight: '100vh', color: '#0F172A' }}>
      {/* ─── Top Header & Summary ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: '#0F172A', letterSpacing: '-0.02em' }}>
              Asset Selection & Simulation
            </h1>
            <span style={{
              background: '#EFF6FF',
              color: '#1D4ED8',
              border: '1px solid #BFDBFE',
              fontSize: 12,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 12,
            }}>
              Configurable Sensor Workspace
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            Select an industrial asset, configure its sensor inputs, and evaluate operational scenarios.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => setWorkspaceView('fleet')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              background: '#FFFFFF',
              color: '#475569',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="View plant-wide supervisory fleet matrices and demand curves"
          >
            <Database size={14} color="#64748B" />
            Full Fleet Matrix (50 Assets)
          </button>
        </div>
      </div>

      {/* ─── Compact Summary Metrics Cards ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Catalog Assets</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>50 Machines</div>
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>6 Unified Utility Cells</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Asset Categories</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>6 Cells</div>
          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>Air, Heat, Power, CNC, HVAC, Chem</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Simulation Compatibility</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB', marginTop: 4 }}>46 Compatible</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>4 Core Twins + 42 Parametric</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Currently Selected</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: selectedAsset ? '#0F172A' : '#94A3B8', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selectedAsset ? selectedAsset.name : 'None Selected'}
          </div>
          <div style={{ fontSize: 11, color: selectedAsset ? '#2563EB' : '#94A3B8', fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 2 }}>
            {selectedAsset ? `${selectedAsset.id} (${selectedAsset.ratedPowerKw} kW)` : 'Select an asset below'}
          </div>
        </div>
      </div>

      {/* ─── Three-Step Workflow Navigation Strip ──────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: 12,
        padding: '6px',
        marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        <button
          onClick={() => setCurrentStep(1)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: currentStep === 1 ? '#1E293B' : 'transparent',
            color: currentStep === 1 ? '#FFFFFF' : '#475569',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: currentStep === 1 ? '#3B82F6' : '#E2E8F0',
            color: currentStep === 1 ? '#FFFFFF' : '#64748B',
            fontSize: 11,
            fontWeight: 700,
          }}>
            {selectedAsset ? <Check size={13} strokeWidth={3} /> : '1'}
          </span>
          <span>1. Select Asset</span>
          {selectedAsset && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: currentStep === 1 ? '#334155' : '#EFF6FF', color: currentStep === 1 ? '#93C5FD' : '#1D4ED8' }}>
              {selectedAsset.id}
            </span>
          )}
        </button>

        <ChevronRight size={16} color="#CBD5E1" style={{ margin: '0 4px' }} />

        <button
          onClick={() => {
            if (selectedAsset) setCurrentStep(2);
          }}
          disabled={!selectedAsset}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: currentStep === 2 ? '#1E293B' : 'transparent',
            color: currentStep === 2 ? '#FFFFFF' : selectedAsset ? '#475569' : '#94A3B8',
            fontSize: 13,
            fontWeight: 600,
            cursor: selectedAsset ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: currentStep === 2 ? '#3B82F6' : '#E2E8F0',
            color: currentStep === 2 ? '#FFFFFF' : '#64748B',
            fontSize: 11,
            fontWeight: 700,
          }}>
            2
          </span>
          <span>2. Configure Sensors</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: currentStep === 2 ? '#334155' : '#F1F5F9', color: currentStep === 2 ? '#93C5FD' : '#64748B' }}>
            {sensors.length} Inputs
          </span>
        </button>

        <ChevronRight size={16} color="#CBD5E1" style={{ margin: '0 4px' }} />

        <button
          onClick={() => {
            if (simulationResult) setCurrentStep(3);
          }}
          disabled={!simulationResult}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            background: currentStep === 3 ? '#1E293B' : 'transparent',
            color: currentStep === 3 ? '#FFFFFF' : simulationResult ? '#475569' : '#94A3B8',
            fontSize: 13,
            fontWeight: 600,
            cursor: simulationResult ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s ease',
          }}
        >
          <span style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: currentStep === 3 ? '#10B981' : '#E2E8F0',
            color: currentStep === 3 ? '#FFFFFF' : '#64748B',
            fontSize: 11,
            fontWeight: 700,
          }}>
            3
          </span>
          <span>3. Run & Review Simulation</span>
          {simulationResult && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: currentStep === 3 ? '#065F46' : '#ECFDF5', color: currentStep === 3 ? '#A7F3D0' : '#059669', fontWeight: 700 }}>
              Results Ready
            </span>
          )}
        </button>
      </div>

      {/* Global Validation / Feedback Banner */}
      {validationBanner && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderRadius: 8,
          marginBottom: 20,
          background: validationBanner.type === 'success' ? '#ECFDF5' : validationBanner.type === 'warning' ? '#FFFBEB' : '#FEF2F2',
          border: `1px solid ${validationBanner.type === 'success' ? '#A7F3D0' : validationBanner.type === 'warning' ? '#FDE68A' : '#FECACA'}`,
          color: validationBanner.type === 'success' ? '#065F46' : validationBanner.type === 'warning' ? '#B45309' : '#991B1B',
          fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {validationBanner.type === 'success' && <CheckCircle2 size={17} color="#10B981" />}
            {validationBanner.type === 'warning' && <AlertTriangle size={17} color="#D97706" />}
            {validationBanner.type === 'error' && <ShieldAlert size={17} color="#DC2626" />}
            <span>{validationBanner.message}</span>
          </div>
          <button
            onClick={() => setValidationBanner(null)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 4 }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ─── STEP 1: ASSET SELECTION INTERFACE ─────────────────────────────────── */}
      {currentStep === 1 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '22px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                Select an Industrial Machine to Configure ({filteredAssets.length} of {assets.length})
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748B' }}>
                Pick any eligible asset to inspect its specifications, customize its physical sensors, and run a digital twin intervention.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Simulation Filter:</span>
              <select
                value={compatFilter}
                onChange={(e) => {
                  setCompatFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF', color: '#1E293B' }}
              >
                <option value="all">All Assets (50)</option>
                <option value="compatible_only">Compatible with Engine (46)</option>
                <option value="unsupported">Passive / Unsupported (4)</option>
              </select>
            </div>
          </div>

          {/* Quick Utility Cell Category Pills */}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: 2 }}>
              Cell:
            </span>
            {CELL_CATEGORIES.map(c => {
              const isSelected = selectedCell === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedCell(c.id);
                    setCurrentPage(1);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 11px',
                    borderRadius: 16,
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 500,
                    border: isSelected ? '1px solid #1E293B' : '1px solid #E2E8F0',
                    background: isSelected ? '#1E293B' : '#F8FAFC',
                    color: isSelected ? '#FFFFFF' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{c.label}</span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: isSelected ? '#334155' : '#E2E8F0',
                    color: isSelected ? '#93C5FD' : '#64748B',
                    fontWeight: 600,
                  }}>
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search bar */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              type="text"
              placeholder="Search catalog by asset ID, name, or utility cell..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                width: '100%',
                padding: '8px 12px 8px 34px',
                borderRadius: 8,
                border: '1px solid #CBD5E1',
                fontSize: 13,
                outline: 'none',
                background: '#FFFFFF',
              }}
            />
          </div>

          {/* Compact Asset Selection Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '10px 12px', width: 130 }}>Asset ID</th>
                  <th style={{ padding: '10px 12px' }}>Equipment Name</th>
                  <th style={{ padding: '10px 12px' }}>Utility Cell</th>
                  <th
                    style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none', width: 100 }}
                    onClick={() => {
                      if (sortField === 'ratedPowerKw') setSortAsc(!sortAsc);
                      else { setSortField('ratedPowerKw'); setSortAsc(false); }
                    }}
                  >
                    Rated kW {sortField === 'ratedPowerKw' ? (sortAsc ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ padding: '10px 12px', width: 100 }}>Status</th>
                  <th style={{ padding: '10px 12px', width: 180 }}>Simulation Compatibility</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', width: 130 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAssets.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: '#94A3B8' }}>
                      No industrial assets match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedAssets.map(asset => {
                    const isSelected = selectedAsset?.id === asset.id;
                    const isUnsupported = UNSUPPORTED_ASSET_IDS.has(asset.id);
                    const isCoreTwin = Boolean(MACHINE_PROFILES[asset.id]);

                    return (
                      <tr
                        key={asset.id}
                        onClick={() => handleSelectAsset(asset, true)}
                        style={{
                          borderBottom: '1px solid #F1F5F9',
                          cursor: 'pointer',
                          background: isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#FAF5EE';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>
                          {asset.id}
                        </td>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#0F172A' }}>
                          {asset.name}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>
                          {asset.cell}
                        </td>
                        <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', color: '#334155' }}>
                          {asset.ratedPowerKw.toFixed(1)} kW
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 10,
                            fontSize: 10,
                            fontWeight: 700,
                            background: asset.operationalStatus === 'WARNING' ? '#FFFBEB' : '#ECFDF5',
                            color: asset.operationalStatus === 'WARNING' ? '#B45309' : '#065F46',
                            border: `1px solid ${asset.operationalStatus === 'WARNING' ? '#FDE68A' : '#A7F3D0'}`,
                          }}>
                            {asset.operationalStatus}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {isUnsupported ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94A3B8' }}>
                              <Info size={12} /> Passive / Unsupported
                            </span>
                          ) : isCoreTwin ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: '#EFF6FF',
                              color: '#1D4ED8',
                              fontSize: 11,
                              fontWeight: 700,
                            }}>
                              <Sliders size={11} /> Core Physics Twin ({asset.id})
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 8px',
                              borderRadius: 10,
                              background: '#F8FAFC',
                              color: '#334155',
                              border: '1px solid #E2E8F0',
                              fontSize: 11,
                              fontWeight: 500,
                            }}>
                              Parametric Scaled Model
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAsset(asset, true);
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '5px 11px',
                              borderRadius: 6,
                              border: isSelected ? '1px solid #2563EB' : '1px solid #CBD5E1',
                              background: isSelected ? '#2563EB' : '#FFFFFF',
                              color: isSelected ? '#FFFFFF' : '#1E293B',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <span>Configure</span>
                            <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 10, borderTop: '1px solid #E2E8F0', fontSize: 12, color: '#64748B' }}>
            <div>
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, sortedAssets.length)} of {sortedAssets.length} machines
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #CBD5E1', background: currentPage === 1 ? '#F1F5F9' : '#FFFFFF', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Prev
              </button>
              <span style={{ padding: '0 8px', fontWeight: 600 }}>Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #CBD5E1', background: currentPage === totalPages ? '#F1F5F9' : '#FFFFFF', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 2: CONFIGURE SENSORS & TELEMETRY ────────────────────────────── */}
      {currentStep === 2 && selectedAsset && (
        <div>
          {/* Selected Asset Header Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderTop: '3px solid #2563EB', borderRadius: 12, padding: '18px 22px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                    {selectedAsset.id}
                  </span>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    {selectedAsset.name}
                  </h2>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#F1F5F9', color: '#475569', fontWeight: 600 }}>
                    {selectedAsset.cell}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: '#475569', flexWrap: 'wrap' }}>
                  <div><strong>Rated Capacity:</strong> {selectedAsset.ratedPowerKw} kW</div>
                  <div><strong>Nominal Load:</strong> {selectedAsset.nominalLoadKw} kW</div>
                  <div><strong>Standby Draw:</strong> {selectedAsset.standbyDrawKw} kW</div>
                  <div><strong>Energy Vector:</strong> {selectedAsset.energyVector}</div>
                  <div><strong>SEC Metric:</strong> {selectedAsset.secMetric}</div>
                </div>

                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748B' }}>
                  <strong>Safety Interlocks:</strong> {selectedAsset.safetyConstraints}
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCurrentStep(1)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <ArrowLeft size={13} />
                  Change Asset
                </button>
              </div>
            </div>

            {/* Compatibility Badge explanation */}
            {UNSUPPORTED_ASSET_IDS.has(selectedAsset.id) ? (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} color="#DC2626" />
                <span>
                  <strong>Simulation Not Supported:</strong> This asset is a passive vessel or electrical busway with no dynamic mechanical or thermodynamic drive. Parameter mappings for dynamic intervention are not available.
                </span>
              </div>
            ) : (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={16} color="#10B981" />
                <span>
                  <strong>Simulation Engine Active:</strong> Mapped to <strong>{resolveMachineId(selectedAsset.id)}</strong> physics profile. Configured sensor values will feed into the operational intervention model.
                </span>
              </div>
            )}
          </div>

          {/* Intervention Configuration Panel */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  Select Operational Intervention to Simulate
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                  Choose which physical parameter adjustment the digital twin will evaluate against safety interlocks.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '3px 8px', borderRadius: 6 }}>
                Physics & Tariff Aware
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
              {/* Option 1: Idle Cutoff */}
              <div
                onClick={() => setSelectedIntervention('reduce_idle_power')}
                style={{
                  border: `2px solid ${selectedIntervention === 'reduce_idle_power' ? '#2563EB' : '#E2E8F0'}`,
                  background: selectedIntervention === 'reduce_idle_power' ? '#F8FAFC' : '#FFFFFF',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Idle-Power Auto-Cutoff</span>
                  <input type="radio" checked={selectedIntervention === 'reduce_idle_power'} readOnly />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
                  Reduces unloaded standby draw during shift breaks or line idle periods down to target setting.
                </p>
              </div>

              {/* Option 2: Pressure / Temp Optimization */}
              <div
                onClick={() => setSelectedIntervention('pressure_optimization')}
                style={{
                  border: `2px solid ${selectedIntervention === 'pressure_optimization' ? '#2563EB' : '#E2E8F0'}`,
                  background: selectedIntervention === 'pressure_optimization' ? '#F8FAFC' : '#FFFFFF',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Header Pressure / Temp Optimization</span>
                  <input type="radio" checked={selectedIntervention === 'pressure_optimization'} readOnly />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
                  Trims delivery setpoint (e.g. 7.5 to 6.8 bar on air; +1.5°C on chilled water) to reduce lift power.
                </p>
              </div>

              {/* Option 3: Schedule Shift */}
              <div
                onClick={() => setSelectedIntervention('shift_schedule')}
                style={{
                  border: `2px solid ${selectedIntervention === 'shift_schedule' ? '#2563EB' : '#E2E8F0'}`,
                  background: selectedIntervention === 'shift_schedule' ? '#F8FAFC' : '#FFFFFF',
                  borderRadius: 10,
                  padding: '12px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Coincident Peak Shaving</span>
                  <input type="radio" checked={selectedIntervention === 'shift_schedule'} readOnly />
                </div>
                <p style={{ margin: 0, fontSize: 11, color: '#64748B' }}>
                  Reschedules high-draw production cycles away from peak tariff windows into lower off-peak hours.
                </p>
              </div>
            </div>

            {/* Dynamic Controls based on selected intervention */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', alignItems: 'center' }}>
              {selectedIntervention === 'reduce_idle_power' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Target Idle Power:</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max={selectedAsset.ratedPowerKw}
                    value={paramTargetPowerKw}
                    onChange={(e) => setParamTargetPowerKw(Number(e.target.value))}
                    style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 12, color: '#64748B' }}>kW</span>
                </div>
              )}

              {selectedIntervention === 'pressure_optimization' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Optimized Setpoint:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="5.0"
                    max="10.0"
                    value={paramTargetPressureBar}
                    onChange={(e) => setParamTargetPressureBar(Number(e.target.value))}
                    style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, textAlign: 'right' }}
                  />
                  <span style={{ fontSize: 12, color: '#64748B' }}>bar / °C</span>
                </div>
              )}

              {selectedIntervention === 'shift_schedule' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Shift Offset:</span>
                  <select
                    value={paramOffsetHours}
                    onChange={(e) => setParamOffsetHours(Number(e.target.value))}
                    style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                  >
                    <option value={1}>1 hour forward</option>
                    <option value={2}>2 hours forward (Into Off-Peak)</option>
                    <option value={4}>4 hours forward</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>Intervention Duration:</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="8.0"
                  value={paramDurationHours}
                  onChange={(e) => setParamDurationHours(Number(e.target.value))}
                  style={{ width: 65, padding: '5px 8px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, textAlign: 'right' }}
                />
                <span style={{ fontSize: 12, color: '#64748B' }}>hours</span>
              </div>
            </div>

            {/* Live Delta Preview Strip */}
            {(() => {
              const idleSensor = sensors.find(s => s.sensor_id.includes('IDLE-PWR') || s.sensor_id.includes('HOLD-PWR'));
              const presSensor = sensors.find(s => s.sensor_id.includes('PRES-DISCH') || s.sensor_id.includes('SETPOINT'));
              const currentIdle = idleSensor ? idleSensor.current_reading : (selectedAsset.standbyDrawKw || 18.0);
              const currentPres = presSensor ? presSensor.current_reading : 7.5;

              return (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12, color: '#166534', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} color="#15803D" />
                    <span>
                      {selectedIntervention === 'reduce_idle_power' ? (
                        <>
                          <strong>Measured Baseline Idle Sensor:</strong> {currentIdle.toFixed(1)} kW → <strong>Intervention Target:</strong> {paramTargetPowerKw.toFixed(1)} kW (Expected Relief: <strong>-{(currentIdle - paramTargetPowerKw).toFixed(1)} kW</strong> over {paramDurationHours}h)
                        </>
                      ) : selectedIntervention === 'pressure_optimization' ? (
                        <>
                          <strong>Measured Baseline Pressure:</strong> {currentPres.toFixed(1)} bar → <strong>Target Setpoint:</strong> {paramTargetPressureBar.toFixed(1)} bar (Expected Delta: <strong>-{(currentPres - paramTargetPressureBar).toFixed(1)} bar</strong>)
                        </>
                      ) : (
                        <>
                          <strong>Production Shift:</strong> Rescheduling high load {paramOffsetHours}h forward into lower tariff window (₹6.50/kWh off-peak).
                        </>
                      )}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: 12 }}>
                    Telemetry Linked
                  </span>
                </div>
              );
            })()}
          </div>

          {/* ─── Configurable Sensor Management Interface ───────────────────────── */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                    Sensor Configuration & Telemetry
                  </h3>
                  <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#EFF6FF', color: '#1D4ED8' }}>
                    {sensorStats.validCount} of {sensorStats.configuredCount} Valid Readings
                  </span>
                  {sensorStats.overriddenCount > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                      {sensorStats.overriddenCount} Manual Override{sensorStats.overriddenCount > 1 ? 's' : ''} Active
                    </span>
                  )}
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                  Configure physical Modbus instrument inputs. Values marked <strong>Direct Model Input</strong> will be consumed by the simulation equations.
                </p>
              </div>

              {/* Sensor Management Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setIsAddSensorModalOpen(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #2563EB',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={14} /> Add Sensor
                </button>
                <button
                  onClick={handleClearOverrides}
                  disabled={sensorStats.overriddenCount === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: sensorStats.overriddenCount === 0 ? '#94A3B8' : '#475569',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: sensorStats.overriddenCount === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Clear Overrides
                </button>
                <button
                  onClick={handleRestoreDefaultSensors}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    color: '#475569',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={13} /> Restore Defaults
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                <input
                  type="text"
                  placeholder="Filter sensors by ID or name..."
                  value={sensorSearch}
                  onChange={(e) => setSensorSearch(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                />
              </div>

              <select
                value={sensorFilter}
                onChange={(e) => setSensorFilter(e.target.value as any)}
                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF' }}
              >
                <option value="all">All Configured Sensors ({sensors.length})</option>
                <option value="required">Required Model Inputs Only</option>
                <option value="overridden">Manually Overridden Only</option>
                <option value="direct_input">Direct Physics Model Inputs</option>
              </select>
            </div>

            {/* Sensor Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '8px 10px', width: 140 }}>Sensor ID</th>
                    <th style={{ padding: '8px 10px' }}>Instrument Name</th>
                    <th style={{ padding: '8px 10px', width: 110 }}>Type</th>
                    <th style={{ padding: '8px 10px', width: 160 }}>Current Reading</th>
                    <th style={{ padding: '8px 10px', width: 90 }}>Limits</th>
                    <th style={{ padding: '8px 10px', width: 110 }}>Source</th>
                    <th style={{ padding: '8px 10px', width: 120 }}>Model Role</th>
                    <th style={{ padding: '8px 10px', width: 90 }}>Status</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', width: 80 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSensors.map(s => {
                    const isDirect = s.model_consumption === 'Direct Model Input';
                    const isOut = s.validation_status === 'out_of_range';

                    return (
                      <tr key={s.sensor_id} style={{ borderBottom: '1px solid #F1F5F9', background: s.source === 'manual_override' ? '#FDFBF7' : 'transparent' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#2563EB' }}>
                          {s.sensor_id}
                          {s.is_required && (
                            <span style={{ color: '#DC2626', marginLeft: 3 }} title="Required input for simulation">*</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0F172A' }}>
                          <div>{s.sensor_name}</div>
                          <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 400 }}>{s.description}</div>
                        </td>
                        <td style={{ padding: '8px 10px', color: '#475569' }}>
                          {s.measurement_type}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              step={s.unit === 'bar' || s.unit === 'COP' ? '0.1' : '1'}
                              value={s.current_reading}
                              onChange={(e) => handleUpdateSensorReading(s.sensor_id, Number(e.target.value))}
                              style={{
                                width: 85,
                                padding: '4px 6px',
                                borderRadius: 4,
                                border: `1px solid ${isOut ? '#EF4444' : s.source === 'manual_override' ? '#2563EB' : '#CBD5E1'}`,
                                background: isOut ? '#FEF2F2' : s.source === 'manual_override' ? '#EFF6FF' : '#FFFFFF',
                                fontWeight: 600,
                                fontSize: 12,
                                textAlign: 'right',
                              }}
                            />
                            <span style={{ fontSize: 11, color: '#64748B', width: 40 }}>{s.unit}</span>
                          </div>
                        </td>
                        <td style={{ padding: '8px 10px', fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)' }}>
                          {s.min_range}–{s.max_range}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {s.source === 'manual_override' ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
                              Manual
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: '#F1F5F9', color: '#475569' }}>
                              Live Modbus
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {isDirect ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                              Direct Input
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#F8FAFC', color: '#64748B' }}>
                              Supervisory
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px' }}>
                          {isOut ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>Out of Range</span>
                          ) : s.source === 'manual_override' ? (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#2563EB' }}>Overridden</span>
                          ) : (
                            <span style={{ fontSize: 10, fontWeight: 600, color: '#059669' }}>Valid</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {!s.is_required && (
                            <button
                              onClick={() => handleRemoveSensor(s.sensor_id)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: 2 }}
                              title="Remove optional sensor"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── Bottom Actions Strip: Trigger Simulation ──────────────────────── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '16px 24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            flexWrap: 'wrap',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#475569' }}>
                Ready to simulate <strong>{selectedAsset.name}</strong> with <strong>{sensorStats.validCount}</strong> validated sensor inputs.
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setCurrentStep(1)}
                style={{
                  padding: '9px 16px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#334155',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Back to Catalog
              </button>

              <button
                onClick={handleRunSimulation}
                disabled={isSimulating || !sensorStats.isValid || UNSUPPORTED_ASSET_IDS.has(selectedAsset.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 22px',
                  borderRadius: 8,
                  border: 'none',
                  background: (!sensorStats.isValid || UNSUPPORTED_ASSET_IDS.has(selectedAsset.id))
                    ? '#CBD5E1'
                    : isSimulating
                    ? '#93C5FD'
                    : '#2563EB',
                  color: '#FFFFFF',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: (!sensorStats.isValid || UNSUPPORTED_ASSET_IDS.has(selectedAsset.id) || isSimulating)
                    ? 'not-allowed'
                    : 'pointer',
                  boxShadow: '0 2px 4px rgba(37,99,235,0.2)',
                  transition: 'all 0.15s ease',
                }}
              >
                {isSimulating ? (
                  <>
                    <RotateCcw size={15} className="animate-spin" />
                    Running Simulation Physics Engine...
                  </>
                ) : (
                  <>
                    <Play size={15} fill="#FFFFFF" />
                    Run Simulation ({selectedAsset.id})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── STEP 3: SIMULATION RESULTS VIEW ──────────────────────────────────── */}
      {currentStep === 3 && simulationResult && selectedAsset && (
        <div>
          {/* Header Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  Simulation Results: {selectedAsset.name}
                </h2>
                <span style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 700,
                  background: simulationResult.feasibility === 'feasible' ? '#ECFDF5' : '#FFFBEB',
                  color: simulationResult.feasibility === 'feasible' ? '#065F46' : '#B45309',
                  border: `1px solid ${simulationResult.feasibility === 'feasible' ? '#A7F3D0' : '#FDE68A'}`,
                }}>
                  {simulationResult.feasibility.toUpperCase().replace('_', ' ')}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>
                Scenario ID: <strong style={{ fontFamily: 'var(--font-mono)' }}>{simulationResult.scenario_id}</strong> · Evaluated with {sensors.length} configured sensor inputs.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setCurrentStep(2)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid #CBD5E1',
                  background: '#FFFFFF',
                  color: '#1E293B',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <ArrowLeft size={14} /> Adjust Sensor Inputs
              </button>

              <button
                onClick={handleRunSimulation}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#2563EB',
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={14} /> Re-Simulate
              </button>
            </div>
          </div>

          {/* KPI Delta Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
            {/* Energy Savings */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Daily Energy Saved</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                {Math.abs(simulationResult.deltas.energy_kwh).toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>kWh / day</span>
              </div>
              <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                ↓ {(simulationResult.baseline.total_energy_kwh > 0 ? (simulationResult.deltas.savings_positive.energy_kwh / simulationResult.baseline.total_energy_kwh) * 100 : 0).toFixed(1)}% vs Machine Baseline
              </div>
            </div>

            {/* Demand Impact */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Peak Demand Relief</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#2563EB', display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                {Math.abs(simulationResult.deltas.peak_kw).toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>kW</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                Peak: {simulationResult.baseline.peak_demand_kw.toFixed(1)} → {simulationResult.scenario.peak_demand_kw.toFixed(1)} kW
              </div>
            </div>

            {/* Cost Savings */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Estimated Cost Savings</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                ₹{Math.abs(simulationResult.deltas.cost_inr).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>/ day</span>
              </div>
              <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 4 }}>
                ₹{Math.round(Math.abs(simulationResult.deltas.cost_inr) * 300).toLocaleString()} projected / year
              </div>
            </div>

            {/* Carbon Avoided */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Scope 2 Avoided</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                {Math.abs(simulationResult.deltas.scope2_kg_co2e ?? 0).toFixed(1)}
                <span style={{ fontSize: 12, fontWeight: 500, color: '#64748B' }}>kg CO₂e</span>
              </div>
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>
                {(Math.abs(simulationResult.deltas.scope2_kg_co2e ?? 0) * 0.3 / 1000).toFixed(2)} tCO₂e / year (CEA v22)
              </div>
            </div>
          </div>

          {/* 24-Hour Comparison Demand Chart */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  24-Hour Operational Load Curve: Baseline vs Simulated
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                  Comparing measured telemetry baseline against the proposed sensor intervention over 24 hourly intervals.
                </p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#475569', background: '#F1F5F9', padding: '3px 8px', borderRadius: 6 }}>
                Contract Limit: 85.0 kW
              </span>
            </div>

            <div style={{ height: 260, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={simulationResult.baseline.hourly_plant.map((bHour, i) => {
                    const sHour = simulationResult.scenario.hourly_plant[i] || bHour;
                    const benchId = getBenchmarkTwinArchetype(selectedAsset);
                    const bMachineKw = bHour.machines[benchId] ?? bHour.kw;
                    const sMachineKw = sHour.machines[benchId] ?? sHour.kw;

                    return {
                      hour: bHour.label,
                      baseline_kw: Number(bMachineKw.toFixed(1)),
                      simulated_kw: Number(sMachineKw.toFixed(1)),
                      plant_baseline_kw: Number(bHour.kw.toFixed(1)),
                      plant_simulated_kw: Number(sHour.kw.toFixed(1)),
                    };
                  })}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="baseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94A3B8" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#94A3B8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis unit=" kW" domain={[0, Math.round(selectedAsset.ratedPowerKw * 1.2)]} tick={{ fontSize: 11, fill: '#64748B' }} width={50} />
                  <Tooltip
                    formatter={(val: any, name: any) => [`${val} kW`, name === 'baseline_kw' ? 'Baseline Telemetry' : 'Simulated Scenario']}
                    contentStyle={{ background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: 8, fontSize: 12 }}
                  />
                  <ReferenceLine y={85} stroke="#EF4444" strokeDasharray="4 4" label={{ value: 'Contract Peak 85 kW', fill: '#EF4444', fontSize: 10 }} />
                  <Area type="monotone" dataKey="baseline_kw" stroke="#94A3B8" strokeWidth={2} fillOpacity={1} fill="url(#baseGrad)" name="baseline_kw" />
                  <Area type="monotone" dataKey="simulated_kw" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#simGrad)" name="simulated_kw" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Process Constraints & Interlock Outcomes */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: '#0F172A' }}>
              Safety Interlocks & Statutory Feasibility Analysis
            </h3>

            {simulationResult.constraint_violations && simulationResult.constraint_violations.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {simulationResult.constraint_violations.map((v, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, fontSize: 12, color: '#991B1B' }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={15} color="#DC2626" />
                      [{v.code}] {v.severity.toUpperCase()}
                    </div>
                    <div style={{ marginTop: 2 }}>{v.message}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <div style={{ padding: '12px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <CheckCircle2 size={16} color="#10B981" />
                    Pneumatic / Mechanical Envelope Preserved
                  </div>
                  <div>Pressure delivery remains safely above minimum system threshold (6.5 bar). No pneumatic starvation risk.</div>
                </div>

                <div style={{ padding: '12px 14px', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <CheckCircle2 size={16} color="#10B981" />
                    Production Throughput Target Satisfied
                  </div>
                  <div>Shift schedule shift does not breach continuous manufacturing cycle constraints or parts target.</div>
                </div>

                <div style={{ padding: '12px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 12, color: '#334155' }}>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ShieldCheck size={16} color="#2563EB" />
                    Operator Approval Workflow Enforced
                  </div>
                  <div>Scenario generated in advisory mode under ISO 50001:2018. Requires floor supervisor sign-off before PLC dispatch.</div>
                </div>
              </div>
            )}
          </div>

          {/* Session Simulation Run History */}
          {simulationHistory.length > 1 && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '18px 22px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px', color: '#0F172A' }}>
                Session Scenario Comparison History
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                      <th style={{ padding: '6px 10px' }}>Run ID</th>
                      <th style={{ padding: '6px 10px' }}>Machine</th>
                      <th style={{ padding: '6px 10px' }}>Intervention</th>
                      <th style={{ padding: '6px 10px' }}>Energy Saved</th>
                      <th style={{ padding: '6px 10px' }}>Cost Savings</th>
                      <th style={{ padding: '6px 10px' }}>Carbon Relief</th>
                      <th style={{ padding: '6px 10px' }}>Feasibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulationHistory.map(h => (
                      <tr key={h.run_id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '6px 10px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{h.run_id}</td>
                        <td style={{ padding: '6px 10px' }}>{h.asset_name}</td>
                        <td style={{ padding: '6px 10px', color: '#64748B' }}>{h.intervention_type}</td>
                        <td style={{ padding: '6px 10px', color: '#059669', fontWeight: 600 }}>{Math.abs(h.result.deltas.energy_kwh).toFixed(1)} kWh</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>₹{Math.abs(h.result.deltas.cost_inr).toFixed(0)}</td>
                        <td style={{ padding: '6px 10px', color: '#059669' }}>{Math.abs(h.result.deltas.scope2_kg_co2e ?? 0).toFixed(1)} kg</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: h.result.feasibility === 'feasible' ? '#059669' : '#B45309' }}>
                            {h.result.feasibility.toUpperCase()}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── ADD SENSOR MODAL ─────────────────────────────────────────────────── */}
      {isAddSensorModalOpen && selectedAsset && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 20,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: 12,
            width: '100%',
            maxWidth: 480,
            padding: '22px 26px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0F172A' }}>
                Add Custom Sensor to {selectedAsset.id}
              </h3>
              <button
                onClick={() => setIsAddSensorModalOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddCustomSensor}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Sensor Tag / ID:
                </label>
                <input
                  type="text"
                  placeholder={`e.g. SEN-${selectedAsset.id}-FLOW-02`}
                  value={newSensorId}
                  onChange={(e) => setNewSensorId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  Instrument Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Compressed Air Flow Transmitter"
                  value={newSensorName}
                  onChange={(e) => setNewSensorName(e.target.value)}
                  required
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Measurement Type:
                  </label>
                  <select
                    value={newSensorType}
                    onChange={(e) => setNewSensorType(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12, background: '#FFFFFF' }}
                  >
                    <option value="Active Power">Active Power</option>
                    <option value="Pressure">Pressure</option>
                    <option value="Temperature">Temperature</option>
                    <option value="Flow Rate">Flow Rate</option>
                    <option value="Vibration">Vibration</option>
                    <option value="Voltage">Voltage</option>
                    <option value="Current">Current</option>
                    <option value="Throughput">Throughput</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Unit of Measurement:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. kW, bar, °C"
                    value={newSensorUnit}
                    onChange={(e) => setNewSensorUnit(e.target.value)}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Reading:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newSensorReading}
                    onChange={(e) => setNewSensorReading(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Min Limit:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newSensorMin}
                    onChange={(e) => setNewSensorMin(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Max Limit:
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={newSensorMax}
                    onChange={(e) => setNewSensorMax(Number(e.target.value))}
                    required
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #CBD5E1', fontSize: 12 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <input
                  type="checkbox"
                  id="reqCheckbox"
                  checked={newSensorRequired}
                  onChange={(e) => setNewSensorRequired(e.target.checked)}
                />
                <label htmlFor="reqCheckbox" style={{ fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                  Mark as Required Input for Simulation
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setIsAddSensorModalOpen(false)}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', fontSize: 12, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#FFFFFF', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Add to Fleet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AssetSimulationWorkspace;
