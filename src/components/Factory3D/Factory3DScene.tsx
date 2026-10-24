import { useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
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

// ─── Camera Controller with Smooth Transitions ──────────────────────────────
function CameraController({
  targetPos,
  targetLookAt,
}: {
  targetPos: THREE.Vector3;
  targetLookAt: THREE.Vector3;
}) {
  const { camera } = useThree();
  const currentLookAt = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    camera.position.lerp(targetPos, 0.05);
    currentLookAt.current.lerp(targetLookAt, 0.05);
    camera.lookAt(currentLookAt.current);
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
          background: 'rgba(10, 15, 26, 0.92)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(56, 189, 248, 0.25)'}`,
          boxShadow: isSelected ? '0 0 16px rgba(56, 189, 248, 0.35)' : '0 4px 12px rgba(0,0,0,0.6)',
          borderRadius: 6,
          padding: '6px 12px',
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          cursor: 'pointer',
          minWidth: 160,
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
            <span style={{ fontSize: 11, fontWeight: 700, color: '#f8fafc', letterSpacing: 0.5 }}>
              {asset.name}
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: `${color}22`,
              color: color,
              border: `1px solid ${color}44`,
              fontWeight: 600,
            }}
          >
            {asset.status}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>
            {asset.currentKw} <span style={{ fontSize: 10, color: '#94a3b8' }}>kW</span>
          </span>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>
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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#070b14', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas */}
      <Canvas
        camera={{ position: [12, 11, 15], fov: 38, near: 0.1, far: 250 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        onPointerMissed={() => onSelect(null)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Cinematic Industrial Lighting */}
        <ambientLight intensity={0.5} color="#bae6fd" />
        <directionalLight position={[12, 18, 12]} intensity={0.9} color="#f8fafc" castShadow />
        <directionalLight position={[-10, 12, -8]} intensity={0.4} color="#38bdf8" />
        <pointLight position={[0, 4.5, -4]} intensity={0.6} color="#38bdf8" distance={20} />

        {/* Subtle Atmospheric Fog */}
        <fog attach="fog" args={['#070b14', 18, 55]} />

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

        {/* Smooth Orbit Controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.06}
          minDistance={3}
          maxDistance={35}
          maxPolarAngle={Math.PI / 2.1}
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
            background: 'rgba(11, 15, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: 6,
            padding: '4px 6px',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--slate-400)', padding: '0 6px', letterSpacing: 1 }}>
            CAMERA:
          </span>
          <button
            className="cam-btn"
            onClick={() => setPreset('isometric')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f8fafc',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Overview
          </button>
          <button
            className="cam-btn"
            onClick={() => setPreset('topdown')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Top-Down
          </button>
          <span style={{ color: 'var(--slate-700)' }}>|</span>
          <button
            className="cam-btn"
            onClick={() => setPreset('compressor')}
            style={{
              background: selectedId === 'compressor' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              border: 'none',
              color: '#f59e0b',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Compressor
          </button>
          <button
            className="cam-btn"
            onClick={() => setPreset('cnc')}
            style={{
              background: selectedId === 'cnc' ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
              border: 'none',
              color: '#22d3ee',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            CNC Cell
          </button>
          <button
            className="cam-btn"
            onClick={() => setPreset('furnace')}
            style={{
              background: selectedId === 'furnace' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
              border: 'none',
              color: '#ef4444',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Furnace
          </button>
          <button
            className="cam-btn"
            onClick={() => setPreset('cooling')}
            style={{
              background: selectedId === 'cooling' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              border: 'none',
              color: '#10b981',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Cooling
          </button>
        </div>

        {/* Right: Layer Toggles */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(11, 15, 23, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(51, 65, 85, 0.6)',
            borderRadius: 6,
            padding: '4px 6px',
            pointerEvents: 'auto',
          }}
        >
          <button
            onClick={() => setShowConduits(!showConduits)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showConduits ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              border: `1px solid ${showConduits ? '#38bdf8' : 'transparent'}`,
              color: showConduits ? '#38bdf8' : '#94a3b8',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Zap size={11} /> Power Grid
          </button>
          <button
            onClick={() => setShowSafetyZones(!showSafetyZones)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showSafetyZones ? 'rgba(234, 179, 8, 0.15)' : 'transparent',
              border: `1px solid ${showSafetyZones ? '#eab308' : 'transparent'}`,
              color: showSafetyZones ? '#eab308' : '#94a3b8',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Shield size={11} /> Safety Bays
          </button>
          <button
            onClick={() => setShowHud(!showHud)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showHud ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              border: `1px solid ${showHud ? '#10b981' : 'transparent'}`,
              color: showHud ? '#10b981' : '#94a3b8',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            <Tag size={11} /> 3D HUD
          </button>
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
          background: 'rgba(11, 15, 23, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          borderRadius: 6,
          padding: '4px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--slate-400)',
          pointerEvents: 'none',
        }}
      >
        <span>DIGITAL TWIN · PRECISIONWORKS</span>
        <span style={{ color: 'var(--slate-600)' }}>|</span>
        <span>DRAG TO ROTATE · SCROLL TO ZOOM · CLICK ASSET TO INSPECT</span>
        <span style={{ color: 'var(--slate-600)' }}>|</span>
        <span style={{ color: '#10b981' }}>● 60 FPS WEBGL</span>
      </div>
    </div>
  );
}
