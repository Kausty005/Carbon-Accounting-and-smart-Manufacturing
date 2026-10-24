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
  Layers, ChevronRight, Activity, AlertTriangle, X,
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

// ─── Floating 3D Machine Inspection Card (Compact ~25% Smaller) ─────────────
function MachineHudBadge({
  asset,
  isSelected,
  onSelect,
}: {
  asset: Asset;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const statusColors: Record<string, string> = {
    OPTIMAL: '#10b981',
    WARNING: '#f59e0b',
    PEAK:    '#ef4444',
    IDLE:    '#64748b',
  };
  const statusColor = statusColors[asset.status] || '#10b981';

  const machineAccents: Record<string, string> = {
    compressor: '#d97706',
    cnc:        '#0284c7',
    furnace:    '#dc2626',
    cooling:    '#059669',
  };
  const accent = machineAccents[asset.id] || '#0284c7';

  const bayLabels: Record<string, string> = {
    compressor: 'BAY 01 · COMP-01',
    cnc:        'BAY 02 · CNC-01',
    furnace:    'BAY 03 · FURN-01',
    cooling:    'BAY 04 · CHILL-01',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.5px 0',
    fontSize: 8.5,
    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    lineHeight: 1.25,
  };

  const labelStyle: React.CSSProperties = {
    color: '#64748b',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  const valueStyle: React.CSSProperties = {
    fontWeight: 700,
    color: '#0f172a',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  };

  const renderMetrics = () => {
    const pfNum = Number(asset.pf ?? 0.78);
    const currKw = Number(asset.currentKw ?? 0);

    switch (asset.id) {
      case 'compressor':
        return (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Power Draw</span>
              <span style={valueStyle}>
                <span style={{ color: accent }}>{asset.currentKw != null ? `${currKw.toFixed(1)} kW` : '—'}</span>
                {' '}<span style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 400 }}>({Math.round((currKw / (asset.ratedKw || 45)) * 100)}%)</span>
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Discharge</span>
              <span style={valueStyle}>
                {asset.dischargePressureBar != null ? `${Number(asset.dischargePressureBar).toFixed(1)} bar` : '7.2 bar'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Operating State</span>
              <span style={{ ...valueStyle, color: statusColor }}>
                {asset.status || 'OPTIMAL'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Power Factor</span>
              <span style={{ ...valueStyle, color: pfNum < 0.85 ? '#f59e0b' : '#10b981' }}>
                {pfNum.toFixed(2)}
              </span>
            </div>
          </>
        );
      case 'cnc':
        return (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Machining Load</span>
              <span style={valueStyle}>
                <span style={{ color: accent }}>{asset.currentKw != null ? `${currKw.toFixed(1)} kW` : '—'}</span>
                {' '}<span style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 400 }}>({Math.round((currKw / (asset.ratedKw || 32)) * 100)}%)</span>
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Specific Energy</span>
              <span style={valueStyle}>
                {asset.secKwhPerPart != null ? `${asset.secKwhPerPart} kWh/p` : '1.80 kWh/p'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Operating State</span>
              <span style={{ ...valueStyle, color: statusColor }}>
                {asset.status}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Power Factor</span>
              <span style={{ ...valueStyle, color: pfNum < 0.85 ? '#f59e0b' : '#10b981' }}>
                {pfNum.toFixed(2)}
              </span>
            </div>
          </>
        );
      case 'furnace':
        return (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Thermal Draw</span>
              <span style={valueStyle}>
                <span style={{ color: accent }}>{asset.currentKw != null ? `${currKw.toFixed(1)} kW` : '—'}</span>
                {' '}<span style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 400 }}>({Math.round((currKw / (asset.ratedKw || 85)) * 100)}%)</span>
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Chamber Temp</span>
              <span style={{ ...valueStyle, color: '#dc2626' }}>
                {asset.tempC != null ? `${asset.tempC} °C` : '840 °C'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Operating State</span>
              <span style={{ ...valueStyle, color: statusColor }}>
                {asset.status}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Power Factor</span>
              <span style={{ ...valueStyle, color: pfNum < 0.85 ? '#f59e0b' : '#10b981' }}>
                {pfNum.toFixed(2)}
              </span>
            </div>
          </>
        );
      case 'cooling':
        return (
          <>
            <div style={rowStyle}>
              <span style={labelStyle}>Chiller Power</span>
              <span style={valueStyle}>
                <span style={{ color: accent }}>{asset.currentKw != null ? `${currKw.toFixed(1)} kW` : '—'}</span>
                {' '}<span style={{ fontSize: 7.5, color: '#94a3b8', fontWeight: 400 }}>({Math.round((currKw / (asset.ratedKw || 28)) * 100)}%)</span>
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Performance</span>
              <span style={{ ...valueStyle, color: '#059669' }}>
                {asset.cop != null ? `COP ${asset.cop}` : 'COP 4.1'}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Operating State</span>
              <span style={{ ...valueStyle, color: statusColor }}>
                {asset.status}
              </span>
            </div>
            <div style={rowStyle}>
              <span style={labelStyle}>Power Factor</span>
              <span style={{ ...valueStyle, color: pfNum < 0.85 ? '#f59e0b' : '#10b981' }}>
                {pfNum.toFixed(2)}
              </span>
            </div>
          </>
        );
      default:
        return (
          <div style={{ fontSize: 8.5, color: '#64748b', padding: '2px 0' }}>
            Telemetry offline
          </div>
        );
    }
  };

  const badgeY = asset.id === 'compressor' ? 2.65 : 2.45;

  return (
    <Html
      position={[0, badgeY, 0]}
      center
      distanceFactor={11}
      style={{ pointerEvents: 'auto', userSelect: 'none' }}
    >
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        style={{
          background: isSelected ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.91)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: isSelected ? `1.5px solid ${accent}` : `1px solid rgba(0, 0, 0, 0.12)`,
          boxShadow: isSelected
            ? `0 0 16px ${accent}40, 0 6px 18px rgba(0, 0, 0, 0.12)`
            : `0 2px 10px rgba(0, 0, 0, 0.06)`,
          borderRadius: 6,
          padding: '6px 9px',
          fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
          cursor: 'pointer',
          width: 172,
          transition: 'all 0.18s ease',
          transform: isSelected ? 'scale(1.03)' : 'scale(1)',
        }}
      >
        {/* Header: Machine Name & Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: statusColor,
                boxShadow: isSelected ? `0 0 8px ${statusColor}` : `0 0 4px ${statusColor}`,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 9.5,
                fontWeight: isSelected ? 800 : 700,
                color: isSelected ? '#0f172a' : '#1e293b',
                letterSpacing: 0.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={asset.name}
            >
              {asset.name}
            </span>
          </div>

          <span
            style={{
              fontSize: 7.5,
              padding: '1px 4px',
              borderRadius: 2.5,
              background: `${statusColor}18`,
              color: statusColor,
              border: `1px solid ${statusColor}33`,
              fontWeight: 700,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            {asset.status}
          </span>
        </div>

        {/* Subtitle / Bay ID */}
        <div style={{ fontSize: 7.5, color: '#64748b', paddingLeft: 10, marginBottom: 4, letterSpacing: 0.2 }}>
          {bayLabels[asset.id] || asset.id.toUpperCase()}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(0, 0, 0, 0.06)', margin: '3px 0 4px' }} />

        {/* Machine-Specific Live Telemetry Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {renderMetrics()}
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
  onSelect: (id: string | null) => void;
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

      {/* Invisible Interactive Hit Box to guarantee 100% reliable click/hover detection */}
      <mesh
        position={[0, 1.1, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(asset.id);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[3.2, 2.6, 2.6]} />
        <meshBasicMaterial visible={false} />
      </mesh>

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

      {/* Floating HUD Inspection Card - Visible all the time */}
      {showHud && (
        <MachineHudBadge
          key={`hud-${asset.id}`}
          asset={asset}
          isSelected={isSelected}
          onSelect={() => onSelect(asset.id)}
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

  // Sync camera target when selectedId changes externally (e.g. from left sidebar asset list)
  useEffect(() => {
    if (selectedId && ASSET_POSITIONS[selectedId]) {
      const p = ASSET_POSITIONS[selectedId];
      setCamTarget({
        pos: new THREE.Vector3(p[0] + 3.8, 3.2, p[2] + 4.5),
        look: new THREE.Vector3(p[0], 0.8, p[2]),
      });
    }
  }, [selectedId]);

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
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#E4D9C8', overflow: 'hidden' }}>
      {/* 3D WebGL Canvas */}
      <Canvas
        shadows
        camera={{ position: [12, 11, 15], fov: 38, near: 0.1, far: 350 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={() => onSelect(null)}
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
        </div>

        {/* Right: Layer Toggles */}
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
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowHud(!showHud)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: showHud ? 'rgba(5, 150, 105, 0.15)' : 'transparent',
              border: `1px solid ${showHud ? '#059669' : 'transparent'}`,
              color: showHud ? '#059669' : 'var(--slate-500)',
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
        <span>DRAG TO ROTATE · SCROLL TO ZOOM · CLICK ASSET TO INSPECT</span>
        <span style={{ color: 'rgba(90, 75, 55, 0.2)' }}>|</span>
        <span style={{ color: '#059669', fontWeight: 700 }}>● 60 FPS WEBGL</span>
      </div>
    </div>
  );
}
