import { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { motion } from 'framer-motion';
import * as THREE from 'three';
import {
  AirCompressorModel,
  CncMachineModel,
  IndustrialFurnaceModel,
  ChillerCoolingModel,
  ElectricalSubstationModel,
  FactoryConveyor,
} from './IndustrialMachines';
import FactoryEnvironment, { ASSET_POSITIONS } from './FactoryEnvironment';
import EnergyConduits from './EnergyConduits';
import type { Asset } from '../../data/mockData';
import {
  Zap,
  Shield,
  Radio,
  FileCheck2,
  HardDrive,
  WifiOff,
  Cpu,
  Box,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Sliders,
  X,
} from 'lucide-react';
import {
  ModbusEnergyMeter3D,
  CoriolisFlowMeter3D,
  FlueGasAnalyzer3D,
  OpticalCODProbe3D,
  EdgeGatewayCabinet3D,
} from './Sensor3DModels';
import SensorDataConduits from './SensorDataConduits';
import type { SensorMetadata } from './SensorHudPopup';
import AuditLedgerModal from './AuditLedgerModal';

export interface PipelineStep {
  stepNum: number;
  label: string;
  tag: string;
  standard: string;
  targetComponent: 'compressor' | 'gateway' | 'anomaly' | 'simulator' | 'ledger';
  description: string;
  pitchScript: string;
}

export const END_TO_END_PIPELINE: PipelineStep[] = [
  {
    stepNum: 1,
    label: '1. Physical Sensor',
    tag: 'Shopfloor Hardware',
    standard: 'IEC 62053-22 Class 0.5S',
    targetComponent: 'compressor',
    description: 'Yokogawa Class 0.5S Multi-Function Meter (EM-102) & Coriolis Flow (FM-201)',
    pitchScript: 'Judges, look at the compressor feed: Yokogawa Class 0.5S meter EM-102 measures live line current, 37.0 kW active power, and 7.2 bar discharge pressure directly on the shop floor via physical CT clamps.',
  },
  {
    stepNum: 2,
    label: '2. Edge Gateway & Buffer',
    tag: '72h Outage Resilience',
    standard: 'IEC 61000-6-2/4 Heavy Industrial',
    targetComponent: 'gateway',
    description: 'Moxa UC-8100-LX with 72h Circular NVRAM & SHA-256 Chaining',
    pitchScript: 'Physical telemetry flows over RS-485 Modbus to our IP66 Edge Gateway. If factory internet cuts out, an on-chip 72-hour circular buffer queues every packet locally with zero data loss.',
  },
  {
    stepNum: 3,
    label: '3. SCADA & AI Anomaly',
    tag: 'Anomaly Intelligence',
    standard: 'Isolation Forest + CUSUM',
    targetComponent: 'anomaly',
    description: 'Isolation Forest detects 18 kW unloaded idle waste during break hours',
    pitchScript: 'Our AI engine processes the stream in real time and flags COMP-01 drawing 18 kW unloaded power while factory machines are paused for lunch. That is pure energy waste.',
  },
  {
    stepNum: 4,
    label: '4. Digital Twin Simulation',
    tag: 'Physics & Safety Interlocks',
    standard: 'IPMVP Option B / ISO 50001',
    targetComponent: 'simulator',
    description: 'Virtual what-if test: Auto-Idle Cutoff passes pneumatic pressure limits',
    pitchScript: 'Instead of blind automation, our Digital Twin tests the Auto-Idle Cutoff in software first, verifying line pressure never dips below 6.8 bar. Applying it cuts compressor power to 0 kW, saving 998 kWh daily.',
  },
  {
    stepNum: 5,
    label: '5. Cryptographic ESG Audit',
    tag: 'SEBI BRSR & CBAM Proof',
    standard: 'ISO 14064-1/3 Reasonable Assurance',
    targetComponent: 'ledger',
    description: 'Avoided Scope 2 emissions (727.7 kg CO₂e) cryptographically verified',
    pitchScript: 'Statutory auditors reject manual utility spreadsheets. Our system mathematically seals every baseline reduction into an unbroken SHA-256 Merkle chain compliant with SEBI BRSR Core and EU CBAM.',
  },
];

interface Factory3DSceneProps {
  assets: Asset[];
  selectedId: string | null;
  selectedSensorId?: string | null;
  onSelect: (id: string | null) => void;
  onSelectSensor?: (sensorId: string | null) => void;
  onSimulate?: (id: string) => void;
  onOpenLedger?: () => void;
  isBuffering?: boolean;
  onToggleOutage?: (isOffline: boolean) => void;
  simMode?: boolean;
  onToggleSimMode?: () => void;
  onResetBaseline?: () => void;
  mapMode?: '3d' | '2d';
  setMapMode?: (m: '3d' | '2d') => void;
}

// ─── Physical Sensor Fleet Metadata ──────────────────────────────────────────
export const PHYSICAL_SENSORS: SensorMetadata[] = [
  {
    sensor_id: 'EM-101',
    tag: 'SUBSTATION-MAIN-METER',
    instrument_type: 'Class 0.5S Multi-Function Power Meter',
    manufacturer: 'Schneider Electric / PM8000',
    standard: 'IEC 62053-22 (Class 0.5S)',
    monitored_asset: 'Main Plant Substation (Incomer-1)',
    protocol: 'Modbus RTU over RS-485',
    calibration_cert_id: 'NABL/CAL/EM/2026/0412',
    calibration_valid_until: 'Nov 2027',
    position_3d: [0.9, 1.4, -6.3],
  },
  {
    sensor_id: 'EM-102',
    tag: 'COMPRESSOR-FEEDER-METER',
    instrument_type: 'Class 0.5S Multi-Function Power Meter',
    manufacturer: 'Yokogawa / PR300',
    standard: 'IEC 62053-22 (Class 0.5S)',
    monitored_asset: 'ELGi Air Compressor (Bay 1)',
    protocol: 'Modbus RTU over RS-485',
    calibration_cert_id: 'NABL/CAL/EM/2026/0588',
    calibration_valid_until: 'Dec 2027',
    position_3d: [-3.6, 1.2, -2.5],
  },
  {
    sensor_id: 'FM-201',
    tag: 'FURNACE-FUEL-CORIOLIS',
    instrument_type: 'Dual U-Tube Coriolis Mass Flow Meter',
    manufacturer: 'Emerson Micro Motion / ELITE CMF100',
    standard: 'API MPMS Ch. 5.6 (0.05% Accuracy)',
    monitored_asset: 'Furnace PNG Fuel Burner Train',
    protocol: '4-20mA HART & Modbus RTU',
    calibration_cert_id: 'NABL/CAL/FM/2025/1198',
    calibration_valid_until: 'Apr 2027',
    position_3d: [3.3, 0.7, -2.5],
  },
  {
    sensor_id: 'GA-301',
    tag: 'STACK-NDIR-CEMS',
    instrument_type: 'Continuous Flue Gas NDIR Analyzer',
    manufacturer: 'SICK / GM32 Optical Spectrometry',
    standard: 'ISO 12039 / EPA 40 CFR 60 App B',
    monitored_asset: 'Furnace Exhaust Chimney Stack',
    protocol: 'Modbus TCP / Industrial Ethernet',
    calibration_cert_id: 'CPCB/CEMS/2026/0921',
    calibration_valid_until: 'Aug 2027',
    position_3d: [4.5, 3.8, -2.5],
  },
  {
    sensor_id: 'WQ-401',
    tag: 'EFFLUENT-OPTICAL-COD',
    instrument_type: 'UV-Vis Submersible COD / TSS Spectrometer',
    manufacturer: 'Endress+Hauser / Viomax CAS51D',
    standard: 'ISO 15839 (Continuous Water Quality)',
    monitored_asset: 'Process Cooling Loop Header',
    protocol: 'RS-485 Modbus ASCII',
    calibration_cert_id: 'SPCB/ENV/2026/0334',
    calibration_valid_until: 'Jun 2027',
    position_3d: [5.3, 0.6, 3.0],
  },
  {
    sensor_id: 'GW-EDGE-01',
    tag: 'SHOPFLOOR-EDGE-GATEWAY',
    instrument_type: 'Ruggedized Industrial IoT Edge Gateway',
    manufacturer: 'Moxa UC-8100-LX / Advantech',
    standard: 'IEC 61000-6-2/4 Heavy Industrial',
    monitored_asset: 'Plant SCADA & Physical Sensor Concentrator',
    protocol: 'Dual RS-485 + Dual GbE + TLS 1.3',
    calibration_cert_id: 'TPM-2.0-SECURE',
    calibration_valid_until: 'Jan 2030',
    position_3d: [-7.0, 1.8, -1.5],
  },
];

// ─── Camera Controller with Smooth Transitions ───────────────────────────────
function CameraController({
  targetPos,
  targetLookAt,
}: {
  targetPos: THREE.Vector3;
  targetLookAt: THREE.Vector3;
}) {
  const { camera, controls } = useThree();
  const isTransitioning = useRef(true);
  const lastTarget = useRef<string>('');

  useEffect(() => {
    const key = `${targetPos.x.toFixed(1)},${targetPos.y.toFixed(1)},${targetPos.z.toFixed(1)}`;
    if (key !== lastTarget.current) {
      lastTarget.current = key;
      isTransitioning.current = true;
    }
  }, [targetPos]);

  useEffect(() => {
    const ctrl = controls as any;
    if (!ctrl) return;
    const handleStart = () => {
      isTransitioning.current = false;
    };
    ctrl.addEventListener('start', handleStart);
    return () => {
      ctrl.removeEventListener('start', handleStart);
    };
  }, [controls]);

  useFrame(() => {
    if (!isTransitioning.current) return;
    const ctrl = controls as any;
    camera.position.lerp(targetPos, 0.06);
    if (ctrl && ctrl.target) {
      ctrl.target.lerp(targetLookAt, 0.06);
      ctrl.update();
    } else {
      camera.lookAt(targetLookAt);
    }
    if (camera.position.distanceTo(targetPos) < 0.1) {
      isTransitioning.current = false;
    }
  });

  return null;
}

// ─── Machine Node Component (No floating HTML white boxes) ───────────────────
function MachineNode({
  asset,
  isSelected,
  onSelect,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = ASSET_POSITIONS[asset.id] || [0, 0, 0];

  const renderModel = () => {
    switch (asset.id) {
      case 'compressor':
        return <AirCompressorModel asset={asset} isSelected={isSelected} />;
      case 'cnc':
        return <CncMachineModel asset={asset} isSelected={isSelected} />;
      case 'furnace':
        return <IndustrialFurnaceModel asset={asset} isSelected={isSelected} />;
      case 'cooling':
        return <ChillerCoolingModel asset={asset} isSelected={isSelected} />;
      default:
        return null;
    }
  };

  return (
    <group
      position={pos}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(asset.id);
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* 3D Mechanical Model */}
      {renderModel()}

      {/* Holographic Wireframe Selection Box (Clean 3D Highlight) */}
      {(isSelected || hovered) && (
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[2.8, 2.2, 2.2]} />
          <meshBasicMaterial
            color={isSelected ? '#38bdf8' : '#0ea5e9'}
            wireframe
            transparent
            opacity={isSelected ? 0.45 : 0.2}
          />
        </mesh>
      )}
    </group>
  );
}

// ─── Main Factory 3D Scene ───────────────────────────────────────────────────
export default function Factory3DScene({
  assets,
  selectedId,
  selectedSensorId,
  onSelect,
  onSelectSensor,
  onSimulate,
  onOpenLedger,
  isBuffering = false,
  onToggleOutage,
  simMode = false,
  onToggleSimMode,
  onResetBaseline,
  mapMode = '3d',
  setMapMode,
}: Factory3DSceneProps) {
  // Visual layers toggles
  const [showConduits, setShowConduits] = useState(true);
  const [showSafetyZones, setShowSafetyZones] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [internalLedgerOpen, setInternalLedgerOpen] = useState(false);

  // Guided 5-Step End-to-End Pipeline Walkthrough State
  const [activePipelineStep, setActivePipelineStep] = useState<number | null>(1);
  const [isAutoDemoRunning, setIsAutoDemoRunning] = useState<boolean>(false);
  const [showPipelineGuide, setShowPipelineGuide] = useState<boolean>(true);

  // Camera presets
  const [camTarget, setCamTarget] = useState({
    pos: new THREE.Vector3(12, 11, 15),
    look: new THREE.Vector3(0, 0.5, 0),
  });

  // Smoothly fly camera when selected asset changes
  useEffect(() => {
    if (selectedId && ASSET_POSITIONS[selectedId]) {
      const p = ASSET_POSITIONS[selectedId];
      setCamTarget({
        pos: new THREE.Vector3(p[0] + 3.8, 3.2, p[2] + 4.5),
        look: new THREE.Vector3(p[0], 0.8, p[2]),
      });
    }
  }, [selectedId]);

  // Smoothly fly camera when selected sensor changes
  useEffect(() => {
    if (selectedSensorId) {
      const sensor = PHYSICAL_SENSORS.find((s) => s.sensor_id === selectedSensorId);
      if (sensor) {
        const p = sensor.position_3d;
        setCamTarget({
          pos: new THREE.Vector3(p[0] + (p[0] >= 0 ? 2.4 : -2.4), p[1] + 1.2, p[2] + 2.6),
          look: new THREE.Vector3(p[0], p[1], p[2]),
        });
      }
    }
  }, [selectedSensorId]);

  // Jump camera and open machine details in right sidebar
  const handleSelectMachine = useCallback(
    (id: string | null) => {
      onSelect(id);
      onSelectSensor?.(null);
    },
    [onSelect, onSelectSensor]
  );

  // Focus camera directly on a physical sensor and open in right sidebar
  const handleSelectSensor = useCallback(
    (sensorId: string) => {
      onSelectSensor?.(sensorId);
      onSelect(null);
    },
    [onSelect, onSelectSensor]
  );

  // Preset Views
  const setPreset = (preset: 'isometric' | 'topdown' | 'compressor' | 'cnc' | 'furnace' | 'cooling' | 'gateway') => {
    switch (preset) {
      case 'isometric':
        onSelect(null);
        onSelectSensor?.(null);
        setCamTarget({ pos: new THREE.Vector3(12, 11, 15), look: new THREE.Vector3(0, 0.5, 0) });
        break;
      case 'topdown':
        onSelect(null);
        onSelectSensor?.(null);
        setCamTarget({ pos: new THREE.Vector3(0, 22, 0.01), look: new THREE.Vector3(0, 0, 0) });
        break;
      case 'compressor':
        handleSelectMachine('compressor');
        break;
      case 'cnc':
        handleSelectMachine('cnc');
        break;
      case 'furnace':
        handleSelectMachine('furnace');
        break;
      case 'cooling':
        handleSelectMachine('cooling');
        break;
      case 'gateway':
        handleSelectSensor('GW-EDGE-01');
        break;
    }
  };

  // Handle Guided Pipeline Step Click
  const handlePipelineStepClick = useCallback(
    (stepNum: number) => {
      setActivePipelineStep(stepNum);
      const step = END_TO_END_PIPELINE.find((s) => s.stepNum === stepNum);
      if (!step) return;

      switch (step.targetComponent) {
        case 'compressor':
          handleSelectMachine('compressor');
          onSelectSensor?.('EM-102');
          break;
        case 'gateway':
          handleSelectSensor('GW-EDGE-01');
          break;
        case 'anomaly':
          handleSelectMachine('compressor');
          break;
        case 'simulator':
          if (!simMode && onToggleSimMode) {
            onToggleSimMode();
          }
          handleSelectMachine('compressor');
          break;
        case 'ledger':
          handleOpenLedgerClick();
          break;
      }
    },
    [handleSelectMachine, handleSelectSensor, onSelectSensor, simMode, onToggleSimMode]
  );

  // Auto-Demo Player: Walks through 1 -> 2 -> 3 -> 4 -> 5 smoothly
  useEffect(() => {
    if (!isAutoDemoRunning) return;

    const timer = setInterval(() => {
      setActivePipelineStep((prev) => {
        const nextStep = prev === null || prev >= 5 ? 1 : prev + 1;
        handlePipelineStepClick(nextStep);
        return nextStep;
      });
    }, 6500);

    return () => clearInterval(timer);
  }, [isAutoDemoRunning, handlePipelineStepClick]);

  const handleOpenLedgerClick = () => {
    if (onOpenLedger) {
      onOpenLedger();
    } else {
      setInternalLedgerOpen(true);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E4D9C8', overflow: 'hidden' }}>
      {/* ─── 3D WebGL Canvas (100% Clean Unobstructed Scene) ───────────────── */}
      <Canvas
        shadows
        camera={{ position: [12, 11, 15], fov: 38, near: 0.1, far: 350 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={() => {
          onSelect(null);
          onSelectSensor?.(null);
        }}
        style={{ width: '100%', height: '100%', background: '#E4D9C8' }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color('#E4D9C8');
          scene.fog = new THREE.FogExp2('#E4D9C8', 0.016);
        }}
      >
        {/* Warm Sky Hemisphere Dome */}
        <hemisphereLight args={['#FFFDF8', '#D6CBB8', 0.65]} />
        {/* Primary Soft Architectural Lighting */}
        <ambientLight intensity={0.75} color="#FFF8EE" />
        <directionalLight
          position={[14, 20, 14]}
          intensity={1.25}
          color="#fffdf7"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0001}
          shadow-camera-far={80}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <directionalLight position={[-10, 12, -8]} intensity={0.4} color="#dedad0" />
        <directionalLight position={[0, 8, -14]} intensity={0.2} color="#cfe2ff" />
        <pointLight position={[0, 5, -5]} intensity={0.6} color="#0284c7" distance={22} />

        {/* Camera Lerp Controller */}
        <CameraController targetPos={camTarget.pos} targetLookAt={camTarget.look} />

        {/* Factory Environment & Structural Architecture */}
        <FactoryEnvironment showSafetyZones={showSafetyZones} />

        {/* Central Electrical Substation */}
        <ElectricalSubstationModel />

        {/* Dynamic Conveyor System */}
        <FactoryConveyor />

        {/* Animated Energy Flow Conduits (Floor Cable Trays) */}
        <EnergyConduits assets={assets} showConduits={showConduits} />

        {/* Industrial Machines */}
        {assets.map((asset) => (
          <MachineNode
            key={asset.id}
            asset={asset}
            isSelected={selectedId === asset.id}
            onSelect={handleSelectMachine}
          />
        ))}

        {/* Animated Physical Sensor Telemetry Conduits & Cloud Uplink */}
        <SensorDataConduits
          showTelemetryConduits={showSensors}
          isBuffering={isBuffering}
        />

        {/* Physical Shop-Floor Sensors Mounted on Machines & Walls */}
        {showSensors && (
          <group>
            {/* EM-101: Substation Class 0.5S Modbus Meter */}
            <ModbusEnergyMeter3D
              position={[0.9, 1.4, -6.3]}
              rotation={[0, 0, 0]}
              isSelected={selectedSensorId === 'EM-101'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('EM-101')}
            />

            {/* EM-102: Air Compressor Feeder Class 0.5S Meter */}
            <ModbusEnergyMeter3D
              position={[-3.6, 1.2, -2.5]}
              rotation={[0, Math.PI / 2, 0]}
              isSelected={selectedSensorId === 'EM-102'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('EM-102')}
            />

            {/* FM-201: Coriolis Mass Flow Meter (Furnace PNG Fuel Line) */}
            <CoriolisFlowMeter3D
              position={[3.3, 0.7, -2.5]}
              rotation={[0, 0, 0]}
              isSelected={selectedSensorId === 'FM-201'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('FM-201')}
            />

            {/* GA-301: Continuous NDIR Flue Gas Stack Analyzer (Chimney) */}
            <FlueGasAnalyzer3D
              position={[4.5, 3.8, -2.5]}
              rotation={[0, 0, 0]}
              isSelected={selectedSensorId === 'GA-301'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('GA-301')}
            />

            {/* WQ-401: Optical COD / Effluent Probe (Cooling Loop Header) */}
            <OpticalCODProbe3D
              position={[5.3, 0.6, 3.0]}
              rotation={[0, 0, 0]}
              isSelected={selectedSensorId === 'WQ-401'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('WQ-401')}
            />

            {/* GW-EDGE-01: Shop-Floor Edge IoT Gateway (IP66 Wall Enclosure) */}
            <EdgeGatewayCabinet3D
              position={[-7.0, 1.8, -1.5]}
              rotation={[0, Math.PI / 2, 0]}
              isSelected={selectedSensorId === 'GW-EDGE-01'}
              isBuffering={isBuffering}
              onClick={() => handleSelectSensor('GW-EDGE-01')}
            />
          </group>
        )}

        {/* Free Orbit Controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.07}
          enableRotate={true}
          enablePan={true}
          enableZoom={true}
          minDistance={2}
          maxDistance={48}
          maxPolarAngle={Math.PI / 2.05}
          panSpeed={0.8}
          rotateSpeed={0.7}
        />
      </Canvas>

      {/* ─── Unified Top Header & Pipeline Overlay ───────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          zIndex: 35,
        }}
      >
        {/* Row 1: Primary Control Ribbon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            width: '100%',
          }}
        >
          {/* Left Pill: Mode Switcher & Camera Views */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(235, 226, 212, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              borderRadius: 8,
              padding: '4px 6px',
              pointerEvents: 'auto',
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            }}
          >
            {/* Integrated Mode Switcher */}
            {setMapMode && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(215, 204, 188, 0.55)', borderRadius: 6, padding: 2 }}>
                  <button
                    onClick={() => setMapMode('3d')}
                    style={{
                      background: (mapMode || '3d') === '3d' ? '#1C1917' : 'transparent',
                      color: (mapMode || '3d') === '3d' ? '#F5EFE6' : 'var(--slate-500)',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: (mapMode || '3d') === '3d' ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Box size={12} style={{ color: (mapMode || '3d') === '3d' ? '#F59E0B' : 'inherit' }} /> 3D Twin
                  </button>
                  <button
                    onClick={() => setMapMode('2d')}
                    style={{
                      background: mapMode === '2d' ? '#1C1917' : 'transparent',
                      color: mapMode === '2d' ? '#F5EFE6' : 'var(--slate-500)',
                      border: 'none',
                      borderRadius: 4,
                      padding: '3px 8px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      boxShadow: mapMode === '2d' ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Cpu size={12} style={{ color: mapMode === '2d' ? '#06B6D4' : 'inherit' }} /> 2.5D Mimic
                  </button>
                </div>
                <span style={{ color: 'rgba(90, 75, 55, 0.25)', margin: '0 2px' }}>|</span>
              </>
            )}

            {/* Camera Presets */}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', padding: '0 4px', letterSpacing: 0.5, fontWeight: 700 }}>
              CAM:
            </span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('isometric')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#1C1917',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Overview
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('topdown')}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--slate-400)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Top
            </motion.button>
            <span style={{ color: 'rgba(90, 75, 55, 0.2)' }}>|</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('compressor')}
              style={{
                background: selectedId === 'compressor' ? 'rgba(217, 119, 6, 0.16)' : 'transparent',
                border: 'none',
                color: '#d97706',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Compressor
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('cnc')}
              style={{
                background: selectedId === 'cnc' ? 'rgba(2, 132, 199, 0.16)' : 'transparent',
                border: 'none',
                color: '#0284c7',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              CNC
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('furnace')}
              style={{
                background: selectedId === 'furnace' ? 'rgba(220, 38, 38, 0.16)' : 'transparent',
                border: 'none',
                color: '#dc2626',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Furnace
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('cooling')}
              style={{
                background: selectedId === 'cooling' ? 'rgba(5, 150, 105, 0.16)' : 'transparent',
                border: 'none',
                color: '#059669',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Cooling
            </motion.button>
            <span style={{ color: 'rgba(90, 75, 55, 0.2)' }}>|</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="cam-btn"
              onClick={() => setPreset('gateway')}
              style={{
                background: selectedSensorId === 'GW-EDGE-01' ? 'rgba(2, 132, 199, 0.2)' : 'transparent',
                border: 'none',
                color: '#0284c7',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <HardDrive size={11} /> Gateway
            </motion.button>
          </div>

          {/* Right Pill: Layer Toggles, Audit Ledger & Demo Guide Button */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'rgba(235, 226, 212, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.85)',
              borderRadius: 8,
              padding: '4px 6px',
              pointerEvents: 'auto',
              boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
            }}
          >
            {/* Edge Buffer Active Indicator */}
            {isBuffering && (
              <motion.div
                animate={{ opacity: [1, 0.6, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                style={{
                  background: '#f59e0b',
                  color: '#000',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 800,
                  fontSize: 9.5,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <WifiOff size={10} /> 72H BUFFER
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowSensors(!showSensors)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: showSensors ? 'rgba(234, 88, 12, 0.15)' : 'transparent',
                border: `1px solid ${showSensors ? '#ea580c' : 'transparent'}`,
                color: showSensors ? '#ea580c' : 'var(--slate-500)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Toggle shop-floor physical sensor markers"
            >
              <Radio size={11} /> Sensors
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowConduits(!showConduits)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: showConduits ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
                border: `1px solid ${showConduits ? '#0284c7' : 'transparent'}`,
                color: showConduits ? '#0284c7' : 'var(--slate-500)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Toggle live animated power busbars"
            >
              <Zap size={11} /> Power
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowSafetyZones(!showSafetyZones)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: showSafetyZones ? 'rgba(217, 119, 6, 0.15)' : 'transparent',
                border: `1px solid ${showSafetyZones ? '#d97706' : 'transparent'}`,
                color: showSafetyZones ? '#d97706' : 'var(--slate-500)',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                padding: '3px 6px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Toggle OSHA safety perimeter zones"
            >
              <Shield size={11} /> Safety
            </motion.button>

            <span style={{ color: 'rgba(90, 75, 55, 0.25)', margin: '0 2px' }}>|</span>

            {/* Audit Ledger Trigger */}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleOpenLedgerClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                boxShadow: '0 1px 4px rgba(2, 132, 199, 0.35)',
              }}
              title="Open Cryptographic ESG Audit Ledger (SEBI BRSR / CBAM)"
            >
              <FileCheck2 size={11} /> Audit Ledger
            </motion.button>

            <span style={{ color: 'rgba(90, 75, 55, 0.25)', margin: '0 2px' }}>|</span>

            {/* Demo Pipeline Guide Button */}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowPipelineGuide(!showPipelineGuide)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: showPipelineGuide ? 'rgba(5, 150, 105, 0.15)' : 'rgba(255, 255, 255, 0.7)',
                border: `1px solid ${showPipelineGuide ? '#059669' : '#CBD5E1'}`,
                color: showPipelineGuide ? '#059669' : '#334155',
                fontSize: 10.5,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
              title={showPipelineGuide ? 'Hide Judging Pipeline Guide' : 'Show 5-Step Judging Walkthrough Pipeline'}
            >
              <Sparkles size={11} style={{ color: showPipelineGuide ? '#059669' : '#D97706' }} />
              <span>{showPipelineGuide ? 'Pipeline Guide' : 'Show Guide'}</span>
            </motion.button>
          </div>
        </div>

        {/* Row 2: Guided 5-Step Pipeline Bar (Judging Walkthrough) */}
        {showPipelineGuide && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{
              background: 'rgba(248, 245, 238, 0.97)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.95)',
              borderRadius: 10,
              padding: '8px 12px',
              boxShadow: '0 4px 20px rgba(60, 45, 25, 0.12)',
              pointerEvents: 'auto',
              width: '100%',
            }}
          >
            {/* Bar Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    color: '#1C1917',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Sparkles size={12} style={{ color: '#D97706' }} /> End-to-End Physical Sensor &amp; Digital Twin Pipeline
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8.5,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(2, 132, 199, 0.12)',
                    color: '#0284C7',
                  }}
                >
                  LIVE CLOSED-LOOP
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Auto-Demo Walkthrough Button */}
                <button
                  onClick={() => setIsAutoDemoRunning(!isAutoDemoRunning)}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: 5,
                    border: isAutoDemoRunning ? '1px solid #16A34A' : '1px solid #CBD5E1',
                    background: isAutoDemoRunning ? '#16A34A' : '#FFFFFF',
                    color: isAutoDemoRunning ? '#FFFFFF' : '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {isAutoDemoRunning ? <Pause size={10} /> : <Play size={10} />}
                  {isAutoDemoRunning ? 'Pause Auto-Demo' : '▶ 2-Min Judging Auto-Walkthrough'}
                </button>

                {/* Quick Closed-Loop Simulation Toggle */}
                {onToggleSimMode && (
                  <button
                    onClick={onToggleSimMode}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 5,
                      border: 'none',
                      background: simMode ? '#16A34A' : '#D97706',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {simMode ? <CheckCircle2 size={10} /> : <Zap size={10} />}
                    {simMode ? 'Simulated Fix: 0 kW (-998 kWh)' : 'Simulate Auto-Idle Fix'}
                  </button>
                )}

                {/* Hide bar toggle */}
                <button
                  onClick={() => setShowPipelineGuide(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Hide Pipeline Guide"
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Stepper Pills Navigation */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 6,
              }}
            >
              {END_TO_END_PIPELINE.map((step) => {
                const isStepActive = activePipelineStep === step.stepNum;
                return (
                  <button
                    key={step.stepNum}
                    onClick={() => handlePipelineStepClick(step.stepNum)}
                    style={{
                      background: isStepActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)',
                      border: isStepActive ? '1.5px solid #0284C7' : '1px solid rgba(226, 232, 240, 0.8)',
                      borderRadius: 6,
                      padding: '6px 8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: isStepActive ? '0 2px 8px rgba(2, 132, 199, 0.18)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, fontWeight: 800, color: isStepActive ? '#0284C7' : '#1C1917' }}>
                        {step.label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: '#64748B' }}>
                        Step {step.stepNum}/5
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: isStepActive ? '#334155' : '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                      {step.tag}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Pitch Callout Banner for Active Step */}
            {activePipelineStep !== null && (
              <div
                style={{
                  marginTop: 8,
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 6,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: '#0F172A' }}>
                      {END_TO_END_PIPELINE[activePipelineStep - 1]?.label} — {END_TO_END_PIPELINE[activePipelineStep - 1]?.description}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8.5, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(217, 119, 6, 0.12)', color: '#D97706' }}>
                      {END_TO_END_PIPELINE[activePipelineStep - 1]?.standard}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: '#334155', lineHeight: 1.45 }}>
                    <strong style={{ color: '#0284C7' }}>Pitch Script for Judges: </strong>
                    {END_TO_END_PIPELINE[activePipelineStep - 1]?.pitchScript}
                  </div>
                </div>

                {/* Step Navigation Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <button
                    disabled={activePipelineStep <= 1}
                    onClick={() => handlePipelineStepClick(activePipelineStep - 1)}
                    style={{
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: activePipelineStep <= 1 ? 'not-allowed' : 'pointer',
                      opacity: activePipelineStep <= 1 ? 0.4 : 1,
                    }}
                    title="Previous Step"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <button
                    disabled={activePipelineStep >= 5}
                    onClick={() => handlePipelineStepClick(activePipelineStep + 1)}
                    style={{
                      border: '1px solid #CBD5E1',
                      background: '#F8FAFC',
                      borderRadius: 4,
                      padding: '4px 6px',
                      cursor: activePipelineStep >= 5 ? 'not-allowed' : 'pointer',
                      opacity: activePipelineStep >= 5 ? 0.4 : 1,
                    }}
                    title="Next Step"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* ─── Bottom Status Legend ────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(235, 226, 212, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.85)',
          borderRadius: 8,
          padding: '6px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--slate-400)',
          boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontWeight: 800, color: '#1C1917' }}>PRECISIONWORKS DIGITAL TWIN</span>
        <span style={{ color: 'rgba(90, 75, 55, 0.2)' }}>|</span>
        <span>CLICK ANY MACHINE OR SENSOR TO INSPECT IN RIGHT SIDEBAR</span>
        <span style={{ color: 'rgba(90, 75, 55, 0.2)' }}>|</span>
        <span style={{ color: '#059669', fontWeight: 700 }}>● 60 FPS WEBGL</span>
      </div>

      {/* ─── Statutory Audit Ledger & Buffer Outage Modal ─────────────────── */}
      <AuditLedgerModal
        isOpen={internalLedgerOpen}
        onClose={() => setInternalLedgerOpen(false)}
        isBuffering={isBuffering}
        onToggleOutage={onToggleOutage || (() => {})}
      />
    </div>
  );
}
