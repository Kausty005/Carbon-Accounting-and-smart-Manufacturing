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
}: Factory3DSceneProps) {
  // Visual layers toggles
  const [showConduits, setShowConduits] = useState(true);
  const [showSafetyZones, setShowSafetyZones] = useState(true);
  const [showSensors, setShowSensors] = useState(true);
  const [internalLedgerOpen, setInternalLedgerOpen] = useState(false);

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

      {/* ─── Top Control Ribbon (Camera Presets & View Layers) ──────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        {/* Left: View Presets Buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(235, 226, 212, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.85)',
            borderRadius: 8,
            padding: '5px 8px',
            pointerEvents: 'auto',
            boxShadow: '4px 4px 14px rgba(188, 176, 158, 0.35)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-500)', padding: '0 6px', letterSpacing: 1, fontWeight: 700 }}>
            CAMERA:
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Top-Down
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            CNC Cell
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
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
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <HardDrive size={11} /> Edge Gateway
          </motion.button>
        </div>

        {/* Right: Layer Toggles & Audit Ledger */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(235, 226, 212, 0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.85)',
            borderRadius: 8,
            padding: '5px 8px',
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
                padding: '2px 8px',
                borderRadius: 4,
                fontWeight: 800,
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontFamily: 'var(--font-mono)',
              }}
            >
              <WifiOff size={11} /> 72H EDGE BUFFERING
            </motion.div>
          )}

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSensors(!showSensors)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showSensors ? 'rgba(234, 88, 12, 0.15)' : 'transparent',
              border: `1px solid ${showSensors ? '#ea580c' : 'transparent'}`,
              color: showSensors ? '#ea580c' : 'var(--slate-500)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Radio size={11} /> Physical Sensors
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleOpenLedgerClick}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: '#0284c7',
              border: 'none',
              color: '#ffffff',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 5,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
            }}
          >
            <FileCheck2 size={12} /> Audit Ledger (SEBI/CBAM)
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowConduits(!showConduits)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showConduits ? 'rgba(2, 132, 199, 0.15)' : 'transparent',
              border: `1px solid ${showConduits ? '#0284c7' : 'transparent'}`,
              color: showConduits ? '#0284c7' : 'var(--slate-500)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Zap size={11} /> Power Grid
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowSafetyZones(!showSafetyZones)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showSafetyZones ? 'rgba(217, 119, 6, 0.15)' : 'transparent',
              border: `1px solid ${showSafetyZones ? '#d97706' : 'transparent'}`,
              color: showSafetyZones ? '#d97706' : 'var(--slate-500)',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Shield size={11} /> Safety Bays
          </motion.button>
        </div>
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
