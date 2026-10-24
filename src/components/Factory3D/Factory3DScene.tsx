import { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
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
  Maximize2, Eye, Zap, Shield, Tag, Compass,
  Layers, ChevronRight, Activity, AlertTriangle,
} from 'lucide-react';

interface Factory3DSceneProps {
  assets: Asset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onSimulate?: (id: string) => void;
}

// ─── Camera Controller with Smooth Transitions (Releases to OrbitControls on drag) ─
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

  // Trigger smooth flight only when a new preset or machine is selected
  useEffect(() => {
    const key = `${targetPos.x.toFixed(1)},${targetPos.y.toFixed(1)},${targetPos.z.toFixed(1)}`;
    if (key !== lastTarget.current) {
      lastTarget.current = key;
      isTransitioning.current = true;
    }
  }, [targetPos]);

  // When user begins dragging or zooming, immediately yield 100% control to OrbitControls
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
    // Complete transition when close enough so user has totally free control
    if (camera.position.distanceTo(targetPos) < 0.1) {
      isTransitioning.current = false;
    }
  });

  return null;
}

// ─── Floating 3D Machine Holographic Badge ──────────────────────────────────
function MachineHudBadge({
  asset,
  isSelected,
  onSelect,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const statusColors = {
    OPTIMAL: '#10b981',
    WARNING: '#f59e0b',
    PEAK:    '#ef4444',
    IDLE:    '#64748b',
  };
  const color = statusColors[asset.status] || '#38bdf8';

  const keyMetric = asset.id === 'compressor'
    ? `${asset.dischargePressureBar ?? 7.2} bar · P.F. ${asset.pf}`
    : asset.id === 'cnc'
    ? `${asset.secKwhPerPart ?? 1.8} kWh/part · P.F. ${asset.pf}`
    : asset.id === 'furnace'
    ? `${asset.tempC ?? 840}°C · P.F. ${asset.pf}`
    : `COP ${asset.cop ?? 4.1} · P.F. ${asset.pf}`;

  return (
    <Html
      position={[0, 2.4, 0]}
      center
      distanceFactor={11}
      style={{ pointerEvents: 'auto', userSelect: 'none' }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onSelect(asset.id);
        }}
        style={{
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(10px)',
          border: `1px solid ${isSelected ? '#0284c7' : 'rgba(0, 0, 0, 0.1)'}`,
          boxShadow: isSelected ? '0 0 16px rgba(2, 132, 199, 0.25)' : '0 4px 16px rgba(0,0,0,0.08)',
          borderRadius: 8,
          padding: '7px 14px',
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          cursor: 'pointer',
          minWidth: 170,
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: color,
                boxShadow: `0 0 8px ${color}`,
                display: 'inline-block',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', letterSpacing: 0.5 }}>
              {asset.name}
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: `${color}18`,
              color: color,
              border: `1px solid ${color}33`,
              fontWeight: 700,
            }}
          >
            {asset.status}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0284c7' }}>
            {asset.currentKw} <span style={{ fontSize: 10, color: '#64748b' }}>kW</span>
          </span>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            {keyMetric}
          </span>
        </div>
      </div>
    </Html>
  );
}

// ─── Machine Node Component ──────────────────────────────────────────────────
function MachineNode({
  asset,
  isSelected,
  onSelect,
  showHud,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: (id: string) => void;
  showHud: boolean;
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

      {/* Holographic Wireframe Selection Box */}
      {(isSelected || hovered) && (
        <mesh position={[0, 1.0, 0]}>
          <boxGeometry args={[2.8, 2.2, 2.2]} />
          <meshBasicMaterial
            color={isSelected ? '#38bdf8' : '#0ea5e9'}
            wireframe
            transparent
            opacity={isSelected ? 0.35 : 0.15}
          />
        </mesh>
      )}

      {/* Floating HUD Badge */}
      {showHud && (
        <MachineHudBadge
          asset={asset}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )}
    </group>
  );
}

// ─── Main Factory 3D Scene ───────────────────────────────────────────────────
export default function Factory3DScene({
  assets,
  selectedId,
  onSelect,
  onSimulate,
}: Factory3DSceneProps) {
  // Visual layers toggles
  const [showConduits, setShowConduits] = useState(true);
  const [showSafetyZones, setShowSafetyZones] = useState(true);
  const [showHud, setShowHud] = useState(true);

  // Camera presets
  const [camTarget, setCamTarget] = useState({
    pos: new THREE.Vector3(12, 11, 15),
    look: new THREE.Vector3(0, 0.5, 0),
  });

  const selectedAsset = assets.find((a) => a.id === selectedId) || null;

  // Jump to specific machine view when selected
  const handleSelect = useCallback(
    (id: string | null) => {
      onSelect(id);
      if (id && ASSET_POSITIONS[id]) {
        const p = ASSET_POSITIONS[id];
        setCamTarget({
          pos: new THREE.Vector3(p[0] + 3.8, 3.2, p[2] + 4.5),
          look: new THREE.Vector3(p[0], 0.8, p[2]),
        });
      }
    },
    [onSelect]
  );

  // Preset Views
  const setPreset = (preset: 'isometric' | 'topdown' | 'compressor' | 'cnc' | 'furnace' | 'cooling') => {
    switch (preset) {
      case 'isometric':
        onSelect(null);
        setCamTarget({ pos: new THREE.Vector3(12, 11, 15), look: new THREE.Vector3(0, 0.5, 0) });
        break;
      case 'topdown':
        onSelect(null);
        setCamTarget({ pos: new THREE.Vector3(0, 22, 0.01), look: new THREE.Vector3(0, 0, 0) });
        break;
      case 'compressor':
        handleSelect('compressor');
        break;
      case 'cnc':
        handleSelect('cnc');
        break;
      case 'furnace':
        handleSelect('furnace');
        break;
      case 'cooling':
        handleSelect('cooling');
        break;
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#edeae4', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas */}
      <Canvas
        shadows
        camera={{ position: [12, 11, 15], fov: 38, near: 0.1, far: 350 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={() => onSelect(null)}
        style={{ width: '100%', height: '100%', background: '#edeae4' }}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color('#edeae4');
          scene.fog = new THREE.FogExp2('#edeae4', 0.018);
        }}
      >
        {/* Warm Sky Hemisphere Dome */}
        <hemisphereLight args={['#fdf8ef', '#e5e1d7', 0.5]} />
        {/* Primary Soft Architectural Lighting */}
        <ambientLight intensity={0.7} color="#faf7f2" />
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

        {/* Animated Energy Flow Conduits */}
        <EnergyConduits assets={assets} showConduits={showConduits} />

        {/* Industrial Machines */}
        {assets.map((asset) => (
          <MachineNode
            key={asset.id}
            asset={asset}
            isSelected={selectedId === asset.id}
            onSelect={handleSelect}
            showHud={showHud}
          />
        ))}

        {/* Free Orbit Controls - no restrictions */}
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
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 8,
            padding: '5px 8px',
            pointerEvents: 'auto',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', padding: '0 6px', letterSpacing: 1, fontWeight: 700 }}>
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
              color: '#0f172a',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
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
              color: '#64748b',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Top-Down
          </motion.button>
          <span style={{ color: 'rgba(0, 0, 0, 0.15)' }}>|</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="cam-btn"
            onClick={() => setPreset('compressor')}
            style={{
              background: selectedId === 'compressor' ? 'rgba(234, 88, 12, 0.12)' : 'transparent',
              border: 'none',
              color: '#ea580c',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
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
              background: selectedId === 'cnc' ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
              border: 'none',
              color: '#0284c7',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
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
              background: selectedId === 'furnace' ? 'rgba(220, 38, 38, 0.12)' : 'transparent',
              border: 'none',
              color: '#dc2626',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
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
              background: selectedId === 'cooling' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
              border: 'none',
              color: '#10b981',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cooling
          </motion.button>
        </div>

        {/* Right: Layer Toggles */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255, 255, 255, 0.88)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0, 0, 0, 0.08)',
            borderRadius: 8,
            padding: '5px 8px',
            pointerEvents: 'auto',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
          }}
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowConduits(!showConduits)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showConduits ? 'rgba(2, 132, 199, 0.12)' : 'transparent',
              border: `1px solid ${showConduits ? '#0284c7' : 'transparent'}`,
              color: showConduits ? '#0284c7' : '#64748b',
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
              background: showSafetyZones ? 'rgba(234, 88, 12, 0.12)' : 'transparent',
              border: `1px solid ${showSafetyZones ? '#ea580c' : 'transparent'}`,
              color: showSafetyZones ? '#ea580c' : '#64748b',
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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowHud(!showHud)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showHud ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
              border: `1px solid ${showHud ? '#10b981' : 'transparent'}`,
              color: showHud ? '#10b981' : '#64748b',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Tag size={11} /> 3D HUD
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
          background: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: 8,
          padding: '5px 12px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: '#475569',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
          pointerEvents: 'none',
        }}
      >
        <span style={{ fontWeight: 700, color: '#0f172a' }}>PRECISIONWORKS DIGITAL TWIN</span>
        <span style={{ color: 'rgba(0, 0, 0, 0.15)' }}>|</span>
        <span>DRAG TO ROTATE · SCROLL TO ZOOM · CLICK ASSET TO INSPECT</span>
        <span style={{ color: 'rgba(0, 0, 0, 0.15)' }}>|</span>
        <span style={{ color: '#10b981', fontWeight: 600 }}>● 60 FPS WEBGL</span>
      </div>
    </div>
  );
}
