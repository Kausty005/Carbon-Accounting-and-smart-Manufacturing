import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, X, Printer, Download, CheckCircle2,
  AlertTriangle, Sliders, Leaf, Activity, Sparkles
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { PLANT, SimParams, calcSimResult } from '../../data/mockData';

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const BG_COLOR = '#E5E6E1';

export interface MachineStation {
  id: string;
  code: string;
  name: string;
  shortName: string;
  subTitle: string;
  tag: string;
  tagWarning: string;
  pos: [number, number, number];
  cameraPos: [number, number, number];
  targetPos: [number, number, number];
  glowColor: string;
  activeLabel: string;
  powerKw: number;
  energyKwh: number;
  idleWasteKw: string;
  wasteCost: string;
  pf: string;
  status: 'WARNING' | 'OPTIMAL' | 'PEAK' | 'ECO';
  chartData: { time: string; kw: number }[];
  desc: string;
}

export const STATIONS: MachineStation[] = [
  {
    id: 'compressor',
    code: '01',
    name: 'AIR COMPRESSOR (ELGi)',
    shortName: '01 / Compressor',
    subTitle: 'Diagnostic telemetry card',
    tag: '01 / AIR COMPRESSOR (ELGi)',
    tagWarning: '— Warning: High Idle (45 kW)',
    pos: [-2.1, 0.42, 1.4],
    cameraPos: [1.8, 6.8, 9.2],
    targetPos: [-0.6, 0.2, 0.4],
    glowColor: '#F59E0B',
    activeLabel: '01: COMPRESSOR (45 kW)',
    powerKw: 45,
    energyKwh: 3120,
    idleWasteKw: '18 kW (3.2h/day)',
    wasteCost: '₹7,987',
    pf: '0.78 (Penalty Risk)',
    status: 'WARNING',
    chartData: [
      { time: '08:00', kw: 18 },
      { time: '10:00', kw: 44 },
      { time: '12:00', kw: 18 },
      { time: '14:00', kw: 45 },
      { time: '16:00', kw: 42 },
      { time: '18:00', kw: 18 },
      { time: '20:00', kw: 22 },
    ],
    desc: 'Unloaded idle operation during shift handovers & lunch breaks wastes 18 kW for 3.2 hours daily.',
  },
  {
    id: 'cnc',
    code: '02',
    name: 'CNC MACHINING',
    shortName: '02 / CNC',
    subTitle: 'Diagnostic telemetry card',
    tag: '02 / CNC MACHINING',
    tagWarning: '— Optimal: SEC 1.82 kWh/part',
    pos: [1.2, 0.42, -0.6],
    cameraPos: [3.8, 6.2, 7.8],
    targetPos: [1.2, 0.2, -0.6],
    glowColor: '#10B981',
    activeLabel: '02: CNC MACHINING (32 kW)',
    powerKw: 32,
    energyKwh: 4200,
    idleWasteKw: '1.2 kW (Standby)',
    wasteCost: '₹540',
    pf: '0.94 (Optimal)',
    status: 'OPTIMAL',
    chartData: [
      { time: '08:00', kw: 28 },
      { time: '10:00', kw: 31 },
      { time: '12:00', kw: 29 },
      { time: '14:00', kw: 32 },
      { time: '16:00', kw: 30 },
      { time: '18:00', kw: 28 },
      { time: '20:00', kw: 12 },
    ],
    desc: 'Optimal spindle load profile. Specific Energy Consumption maintained at 1.82 kWh/part.',
  },
  {
    id: 'furnace',
    code: '03',
    name: 'INDUSTRIAL FURNACE',
    shortName: '03 / Furnace',
    subTitle: 'Thermal telemetry card',
    tag: '03 / INDUSTRIAL FURNACE',
    tagWarning: '— Peak Alert: 840°C Batch',
    pos: [2.3, 0.42, -4.2],
    cameraPos: [4.9, 6.5, 4.5],
    targetPos: [2.3, 0.2, -4.2],
    glowColor: '#F97316',
    activeLabel: '03: INDUSTRIAL FURNACE (85 kW)',
    powerKw: 85,
    energyKwh: 3600,
    idleWasteKw: 'Peak Overlap (147.2 kVA)',
    wasteCost: '₹3,420',
    pf: '0.92 (Resistive)',
    status: 'PEAK',
    chartData: [
      { time: '08:00', kw: 82 },
      { time: '10:00', kw: 85 },
      { time: '12:00', kw: 84 },
      { time: '14:00', kw: 85 },
      { time: '16:00', kw: 85 },
      { time: '18:00', kw: 85 },
      { time: '20:00', kw: 40 },
    ],
    desc: '840°C batch coincides with Evening ToD Peak Tariff. Stagger start by +45m to cut kVA peak by 18%.',
  },
  {
    id: 'cooling',
    code: '04',
    name: 'COOLING SYSTEM',
    shortName: '04 / Cooling',
    subTitle: 'Chiller loop telemetry card',
    tag: '04 / COOLING SYSTEM',
    tagWarning: '— Optimal: COP 4.1 Chiller Loop',
    pos: [5.4, 0.42, -7.6],
    cameraPos: [7.2, 6.2, 1.2],
    targetPos: [5.4, 0.2, -7.6],
    glowColor: '#06B6D4',
    activeLabel: '04: COOLING SYSTEM (28 kW)',
    powerKw: 28,
    energyKwh: 1560,
    idleWasteKw: '0.8 kW (Baseload)',
    wasteCost: '₹380',
    pf: '0.91 (Optimal)',
    status: 'ECO',
    chartData: [
      { time: '08:00', kw: 22 },
      { time: '10:00', kw: 26 },
      { time: '12:00', kw: 28 },
      { time: '14:00', kw: 28 },
      { time: '16:00', kw: 27 },
      { time: '18:00', kw: 24 },
      { time: '20:00', kw: 18 },
    ],
    desc: 'Chilled water loop operating at 4.1 COP efficiency across factory Shifts A & B.',
  },
];

// ─── S-CURVE INDUSTRIAL BUSWAY SPLINE ──────────────────────────────────────────
const SPLINE_POINTS = [
  new THREE.Vector3(-4.0, 0, 2.8),
  new THREE.Vector3(-2.1, 0, 1.4),   // 01 Compressor
  new THREE.Vector3(-0.3, 0, 0.3),
  new THREE.Vector3(1.2, 0, -0.6),    // 02 CNC
  new THREE.Vector3(1.5, 0, -2.4),
  new THREE.Vector3(2.3, 0, -4.2),    // 03 Furnace
  new THREE.Vector3(3.8, 0, -5.9),
  new THREE.Vector3(5.4, 0, -7.6),    // 04 Cooling
  new THREE.Vector3(7.2, 0, -9.2),
];

const SPLINE_CURVE = new THREE.CatmullRomCurve3(SPLINE_POINTS, false, 'catmullrom', 0.22);

// Standard Materials for Clean Industrial Alabaster Look
const MAT_PATH = new THREE.MeshStandardMaterial({ color: '#D6D8D2', roughness: 0.65, metalness: 0.1 });
const MAT_PATH_BORDER = new THREE.MeshStandardMaterial({ color: '#C8CAC3', roughness: 0.55, metalness: 0.2 });
const MAT_CONDUIT = new THREE.MeshStandardMaterial({ color: '#B2B5AC', roughness: 0.45, metalness: 0.5 });
const MAT_MACHINE_WHITE = new THREE.MeshStandardMaterial({ color: '#EDEDE8', roughness: 0.48, metalness: 0.12 });
const MAT_MACHINE_DARK = new THREE.MeshStandardMaterial({ color: '#3A3E45', roughness: 0.65, metalness: 0.3 });
const MAT_CHROME = new THREE.MeshStandardMaterial({ color: '#D2D5CE', roughness: 0.2, metalness: 0.85 });

// ─── Winding Pathway with Outer Parallel Conduits ──────────────────────────────
function WindingEnergyPathway() {
  const { pathGeo, conduit1Geo, conduit2Geo } = useMemo(() => {
    const samples = 150;
    const pts = SPLINE_CURVE.getPoints(samples);
    const pGeo = new THREE.TubeGeometry(SPLINE_CURVE, samples, 0.52, 12, false);

    const c1: THREE.Vector3[] = [];
    const c2: THREE.Vector3[] = [];
    pts.forEach((p, idx) => {
      const tangent = SPLINE_CURVE.getTangent(idx / samples);
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      c1.push(p.clone().add(normal.clone().multiplyScalar(0.72)).add(new THREE.Vector3(0, 0.1, 0)));
      c2.push(p.clone().add(normal.clone().multiplyScalar(0.88)).add(new THREE.Vector3(0, 0.1, 0)));
    });

    return {
      pathGeo: pGeo,
      conduit1Geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c1), samples, 0.04, 8, false),
      conduit2Geo: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c2), samples, 0.035, 8, false),
    };
  }, []);

  return (
    <group position={[0, 0.12, 0]}>
      {/* Central Pathway */}
      <mesh geometry={pathGeo} material={MAT_PATH} receiveShadow castShadow scale={[1, 0.28, 1]} />
      {/* Parallel Power Conduits */}
      <mesh geometry={conduit1Geo} material={MAT_CONDUIT} castShadow />
      <mesh geometry={conduit2Geo} material={MAT_CONDUIT} castShadow />
    </group>
  );
}

// ─── Circular Station Platform with Glowing Neon Ring ─────────────────────────
function StationPlatform({
  pos,
  glowColor,
  isSelected,
  onClick,
}: {
  pos: [number, number, number];
  glowColor: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (lightRef.current) {
      const t = clock.getElapsedTime() * 3.5;
      lightRef.current.intensity = isSelected ? 4.2 + Math.sin(t) * 1.0 : 0.8;
    }
  });

  return (
    <group position={[pos[0], 0.06, pos[2]]} onClick={onClick}>
      {/* Circular stepped base disk */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[1.42, 1.54, 0.18, 48]} />
        <primitive object={MAT_PATH_BORDER} attach="material" />
      </mesh>

      {/* Recessed inner pad */}
      <mesh position={[0, 0.1, 0]} receiveShadow>
        <cylinderGeometry args={[1.28, 1.28, 0.05, 36]} />
        <primitive object={MAT_PATH} attach="material" />
      </mesh>

      {/* Circular Glowing Ring */}
      <mesh position={[0, 0.115, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.12, 1.26, 48]} />
        <meshBasicMaterial
          color={glowColor}
          toneMapped={false}
          transparent
          opacity={isSelected ? 0.95 : 0.4}
        />
      </mesh>

      {/* Point light shining upward on machine undercarriage */}
      <pointLight ref={lightRef} position={[0, 0.35, 0]} color={glowColor} distance={3.5} decay={2} />
    </group>
  );
}

// ─── 01 / Air Compressor (ELGi) 3D Model ──────────────────────────────────────
function AirCompressorModel({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current && isSelected) {
      groupRef.current.position.y = 0.42 + Math.sin(clock.getElapsedTime() * 4) * 0.012;
    }
  });

  return (
    <group
      ref={groupRef}
      position={[-2.1, 0.42, 1.4]}
      rotation={[0, -Math.PI / 3.2, 0]}
      onClick={onClick}
    >
      {/* Horizontal Pressure Tank */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.52, 1.6, 32]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Hemispherical tank endcaps */}
      <mesh position={[-0.8, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <sphereGeometry args={[0.52, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>
      <mesh position={[0.8, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <sphereGeometry args={[0.52, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Front Circular Endcap Fan Grill (matches reference image) */}
      <mesh position={[0.88, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.26, 0.05, 24]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Support Feet */}
      <mesh position={[-0.45, -0.38, 0]} castShadow>
        <boxGeometry args={[0.16, 0.2, 0.85]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
      <mesh position={[0.45, -0.38, 0]} castShadow>
        <boxGeometry args={[0.16, 0.2, 0.85]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Top Compressor Pump Housing */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.05, 0.45, 0.62]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Top Circular Air Intake Bell */}
      <mesh position={[0.2, 0.62, 0.35]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.1, 20]} />
        <primitive object={MAT_CHROME} attach="material" />
      </mesh>

      {/* Curved U-pipe connecting pump to receiver */}
      <mesh position={[-0.32, 0.42, 0.36]} castShadow>
        <torusGeometry args={[0.18, 0.035, 12, 24, Math.PI]} />
        <primitive object={MAT_CHROME} attach="material" />
      </mesh>
    </group>
  );
}

// ─── 02 / CNC Machining Center 3D Model ────────────────────────────────────────
function CncMachiningModel({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) {
  return (
    <group position={[1.2, 0.44, -0.6]} rotation={[0, -0.35, 0]} onClick={onClick}>
      {/* Sculpted enclosure */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.25, 1.2, 1.1]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Dark tinted front inspection glass */}
      <mesh position={[0, 0.45, 0.56]} castShadow>
        <boxGeometry args={[0.76, 0.72, 0.04]} />
        <meshStandardMaterial color="#1E232A" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Operator side console */}
      <mesh position={[0.5, 0.45, 0.46]} rotation={[0, -0.35, 0]} castShadow>
        <boxGeometry args={[0.3, 0.54, 0.16]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Status tower light */}
      <mesh position={[0.48, 1.08, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.2, 16]} />
        <meshBasicMaterial color="#10B981" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── 03 / Industrial Furnace 3D Model ──────────────────────────────────────────
function IndustrialFurnaceModel({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) {
  return (
    <group position={[2.3, 0.44, -4.2]} rotation={[0, -0.25, 0]} onClick={onClick}>
      {/* Horizontal Cylindrical Body */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.68, 1.45, 32]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Heat containment bands */}
      {[-0.4, 0, 0.4].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.7, 0.7, 0.08, 32]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
      ))}

      {/* Rear Terminal Cube */}
      <mesh position={[0.88, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 1.05, 1.05]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Front Glowing Inspection Port */}
      <mesh position={[-0.74, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.24, 0.24, 0.05, 24]} />
        <meshBasicMaterial color="#F97316" toneMapped={false} />
      </mesh>

      {/* Base Cradles */}
      <mesh position={[-0.32, -0.52, 0]} castShadow>
        <boxGeometry args={[0.2, 0.32, 1.15]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
      <mesh position={[0.32, -0.52, 0]} castShadow>
        <boxGeometry args={[0.2, 0.32, 1.15]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
    </group>
  );
}

// ─── 04 / Cooling System 3D Model ─────────────────────────────────────────────
function CoolingSystemModel({ isSelected, onClick }: { isSelected: boolean; onClick: () => void }) {
  return (
    <group position={[5.4, 0.44, -7.6]} onClick={onClick}>
      {/* Main Chiller Enclosure */}
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.4, 0.9, 1.1]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Dual top circular cooling fans */}
      {[-0.38, 0.38].map((x, i) => (
        <group key={i} position={[x, 0.85, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.32, 0.35, 0.1, 28]} />
            <primitive object={MAT_MACHINE_DARK} attach="material" />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.02, 28]} />
            <meshStandardMaterial color="#06B6D4" roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Flowing Energy Particles Along Spline ─────────────────────────────────────
function EnergyFlowParticles() {
  const count = 16;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.getElapsedTime() * 0.075;

    for (let i = 0; i < count; i++) {
      const u = (time + i / count) % 1;
      const pt = SPLINE_CURVE.getPoint(u);
      dummy.position.set(pt.x, 0.3, pt.z);
      dummy.scale.setScalar(0.65 + Math.sin(time * 6 + i) * 0.2);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.065, 12, 12]} />
      <meshBasicMaterial color="#38BDF8" toneMapped={false} />
    </instancedMesh>
  );
}

// ─── Dynamic Camera Glider ─────────────────────────────────────────────────────
function CameraRig({ activeIndex }: { activeIndex: number }) {
  const { camera } = useThree();
  const current = STATIONS[activeIndex];

  useFrame(() => {
    camera.position.lerp(new THREE.Vector3(...current.cameraPos), 0.045);
  });

  return null;
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
interface HomePageProps {
  onLaunchPlatform: () => void;
  onOpenLogin: () => void;
}

export default function HomePage({ onLaunchPlatform, onOpenLogin }: HomePageProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isWhatIfOpen, setIsWhatIfOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  // What-If Simulation Controls
  const [simParams, setSimParams] = useState<SimParams>({
    autoIdleCutoff: false,
    pressureSetpoint: 7.5,
    staggerFurnace: false,
  });

  const simResult = useMemo(() => calcSimResult(simParams), [simParams]);
  const currentStation = STATIONS[activeIndex];

  // Mouse wheel scroll to glide between stops smoothly
  useEffect(() => {
    let throttled = false;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 22 || throttled || isWhatIfOpen || isReportsOpen) return;
      throttled = true;
      const dir = e.deltaY > 0 ? 1 : -1;
      setActiveIndex((prev) => {
        const next = prev + dir;
        return THREE.MathUtils.clamp(next, 0, STATIONS.length - 1);
      });
      setTimeout(() => {
        throttled = false;
      }, 550);
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [isWhatIfOpen, isReportsOpen]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: BG_COLOR,
        userSelect: 'none',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* ─── 3D INDUSTRIAL ENERGY GRID CANVAS ───────────────────────────────── */}
      <Canvas
        shadows
        camera={{ position: [1.8, 6.8, 9.2], fov: 34 }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <fog attach="fog" args={[BG_COLOR, 16, 42]} />

        {/* Studio Lighting */}
        <ambientLight intensity={0.68} />
        <directionalLight
          position={[-6, 14, 8]}
          intensity={1.8}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0001}
          shadow-camera-near={0.5}
          shadow-camera-far={38}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <directionalLight position={[8, 6, -6]} intensity={0.65} color="#C4D4ED" />
        <hemisphereLight args={['#FFFFFF', '#D8DAD3', 0.5]} />

        {/* Real Ground Plane & Contact Shadows */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color={BG_COLOR} roughness={0.9} metalness={0.05} />
        </mesh>
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.38}
          scale={32}
          blur={1.6}
          far={9}
          color="#181A1E"
        />

        {/* Industrial Pathway & Particles */}
        <WindingEnergyPathway />
        <EnergyFlowParticles />

        {/* 4 Station Platforms */}
        {STATIONS.map((s, idx) => (
          <StationPlatform
            key={s.id}
            pos={s.pos}
            glowColor={s.glowColor}
            isSelected={idx === activeIndex}
            onClick={() => setActiveIndex(idx)}
          />
        ))}

        {/* 4 Machine Models */}
        <AirCompressorModel
          isSelected={activeIndex === 0}
          onClick={() => setActiveIndex(0)}
        />
        <CncMachiningModel
          isSelected={activeIndex === 1}
          onClick={() => setActiveIndex(1)}
        />
        <IndustrialFurnaceModel
          isSelected={activeIndex === 2}
          onClick={() => setActiveIndex(2)}
        />
        <CoolingSystemModel
          isSelected={activeIndex === 3}
          onClick={() => setActiveIndex(3)}
        />

        {/* In-Scene Floating 3D Tooltip for Active Machine (Matches Reference Image) */}
        <Html
          position={[currentStation.pos[0], currentStation.pos[1] + 1.25, currentStation.pos[2]]}
          center
          distanceFactor={10}
        >
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.88)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.9)',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              transform: 'translateY(-14px)',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#18191B', letterSpacing: '0.4px' }}>
              {currentStation.tag}
            </span>
            <span style={{ fontSize: '10px', color: '#6E7278', marginLeft: '6px' }}>
              {currentStation.tagWarning}
            </span>
          </div>
        </Html>

        {/* Dynamic Camera Animation & Controls */}
        <CameraRig activeIndex={activeIndex} />
        <OrbitControls
          enablePan={false}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={4}
          maxDistance={24}
          dampingFactor={0.05}
        />
      </Canvas>

      {/* ─── TOP NAVIGATION BAR (Exact Match to Reference Screenshot) ───────── */}
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 44px',
          pointerEvents: 'auto',
        }}
      >
        <span
          style={{
            fontSize: '17px',
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: '#18191B',
            textTransform: 'uppercase',
          }}
        >
          WATTWISE AI
        </span>

        <nav style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setActiveIndex(0)}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#18191B',
              backgroundColor: 'rgba(229, 230, 225, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              boxShadow: '4px 4px 10px #c5c6c1, -4px -4px 10px #ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Explore Grid
          </button>

          <button
            onClick={() => setIsWhatIfOpen(true)}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#18191B',
              backgroundColor: 'rgba(229, 230, 225, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              boxShadow: '4px 4px 10px #c5c6c1, -4px -4px 10px #ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            What-if Lab
          </button>

          <button
            onClick={() => setIsReportsOpen(true)}
            style={{
              padding: '8px 18px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#18191B',
              backgroundColor: 'rgba(229, 230, 225, 0.85)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.7)',
              boxShadow: '4px 4px 10px #c5c6c1, -4px -4px 10px #ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Reports
          </button>

          <button
            onClick={onLaunchPlatform}
            style={{
              padding: '9px 22px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#18191B',
              backgroundColor: '#B8BCB5',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              boxShadow: '4px 4px 12px #c5c6c1, -2px -2px 8px #ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginLeft: '4px',
            }}
          >
            LAUNCH PLATFORM
          </button>
        </nav>
      </header>

      {/* ─── LEFT EDITORIAL COLUMN (Exact Match to Reference Screenshot) ───── */}
      <div
        style={{
          position: 'fixed',
          left: '44px',
          top: '22%',
          zIndex: 20,
          maxWidth: '430px',
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
            fontSize: '48px',
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: '#18191B',
            fontWeight: 700,
            marginBottom: '18px',
          }}
        >
          GLIDE &amp; TRAVEL
          <br />
          THE ENERGY GRID
        </h1>

        <p
          style={{
            fontSize: '13px',
            color: '#4A4D52',
            lineHeight: 1.6,
            marginBottom: '32px',
            maxWidth: '340px',
          }}
        >
          Explore where power is lost. Scroll to travel from machine to machine along our interactive energy bus.
        </p>

        <div>
          <p
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              color: '#6E7278',
              fontWeight: 600,
              marginBottom: '4px',
            }}
          >
            ACTIVE POINT
          </p>
          <p
            style={{
              fontSize: '15px',
              fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
              fontWeight: 700,
              color: '#18191B',
            }}
          >
            {currentStation.activeLabel}
          </p>
        </div>
      </div>

      {/* Bottom Left Micro-Typography Annotation */}
      <div
        style={{
          position: 'fixed',
          left: '44px',
          bottom: '36px',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <p
          style={{
            fontSize: '11px',
            color: '#5A5D62',
            lineHeight: 1.5,
            marginBottom: '14px',
            maxWidth: '220px',
          }}
        >
          UI razor-sharp with natural shadow diffusion, matte-injected look, micro-typography
        </p>
        <p
          style={{
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            color: '#6E7278',
            marginBottom: '2px',
          }}
        >
          ACTIVE POINT
        </p>
        <p
          style={{
            fontSize: '12px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontWeight: 700,
            color: '#18191B',
          }}
        >
          {currentStation.activeLabel}
        </p>
      </div>

      {/* ─── RIGHT FLOATING DIAGNOSTIC CARD (Exact Match to Screenshot) ───────── */}
      <aside
        style={{
          position: 'fixed',
          right: '44px',
          top: '52%',
          transform: 'translateY(-50%)',
          zIndex: 25,
          width: '310px',
          padding: '24px',
          borderRadius: '26px',
          backgroundColor: 'rgba(229, 230, 225, 0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.75)',
          boxShadow: '8px 8px 24px #c5c6c1, -8px -8px 24px #ffffff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#18191B',
              }}
            >
              {currentStation.code} / {currentStation.name.split(' ')[0]} {currentStation.name.split(' ')[1] || ''}
            </h3>
            <p
              style={{
                fontSize: '11px',
                color: '#5A5D62',
                marginTop: '2px',
                marginBottom: '16px',
              }}
            >
              {currentStation.subTitle}
            </p>
          </div>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '9999px',
              fontSize: '10px',
              fontWeight: 600,
              backgroundColor: 'rgba(255, 255, 255, 0.8)',
              color: '#18191B',
              boxShadow: '2px 2px 6px #c5c6c1',
            }}
          >
            Vitals
          </span>
        </div>

        <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: '#5A5D62' }}>Idle waste:</span>
            <span style={{ fontWeight: 600, color: '#18191B', fontFamily: "'IBM Plex Mono', monospace" }}>
              {currentStation.idleWasteKw}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: '#5A5D62' }}>Waste cost:</span>
            <span style={{ fontWeight: 700, color: '#D97706', fontFamily: "'IBM Plex Mono', monospace" }}>
              {currentStation.wasteCost}
            </span>
          </div>
        </div>

        {/* Diagnostic Energy Sparkline Curve */}
        <div style={{ height: '70px', width: '100%', margin: '14px 0 16px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={currentStation.chartData}>
              <defs>
                <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18191B',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '10px',
                  color: '#fff',
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              />
              <Area
                type="monotone"
                dataKey="kw"
                stroke="#D97706"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#sparklineGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Inspect Component CTA */}
        <button
          onClick={onLaunchPlatform}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            borderRadius: '14px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#18191B',
            backgroundColor: '#D8DAD3',
            border: '1px solid rgba(255, 255, 255, 0.6)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <span>Inspect Component</span>
          <ArrowRight size={14} />
        </button>
      </aside>

      {/* ─── BOTTOM FLOATING SCRUBBER (Exact Match to Screenshot) ─────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div
          style={{
            padding: '12px 28px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(229, 230, 225, 0.92)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '6px 6px 18px #c5c6c1, -6px -6px 18px #ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: '0.14em',
                color: '#5A5D62',
                fontWeight: 600,
              }}
            >
              SCROLL TO TRAVEL
            </span>
            <div
              style={{
                width: '32px',
                height: '2px',
                backgroundColor: '#B8BCB5',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: `${(activeIndex / (STATIONS.length - 1)) * 26}px`,
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#18191B',
                  transition: 'left 0.3s ease-out',
                }}
              />
            </div>
          </div>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#C8CBC2' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {STATIONS.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setActiveIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: 'none',
                  fontSize: '11px',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: idx === activeIndex ? 700 : 500,
                  color: idx === activeIndex ? '#18191B' : '#7A7D82',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: idx === activeIndex ? '#18191B' : '#B8BCB5',
                  }}
                />
                {s.shortName}
              </button>
            ))}
          </div>
        </div>

        <span
          style={{
            fontSize: '9px',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.18em',
            color: '#6E7278',
            fontWeight: 600,
          }}
        >
          &#8744; SCROLL TO GLIDE PATH &#8744;
        </span>
      </div>

      {/* ─── INTERACTIVE WHAT-IF LAB MODAL ─────────────────────────────────────── */}
      <AnimatePresence>
        {isWhatIfOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              backgroundColor: 'rgba(24, 25, 27, 0.45)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              style={{
                width: '100%',
                maxWidth: '680px',
                borderRadius: '24px',
                backgroundColor: '#E5E6E1',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '12px 12px 36px rgba(0, 0, 0, 0.25)',
                padding: '32px',
                color: '#18191B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.04em' }}>
                    What-If Energy Optimization Lab
                  </h2>
                  <p style={{ fontSize: '12px', color: '#5A5D62' }}>
                    Interactive mathematical simulator for PrecisionWorks Manufacturing baseline (12,480 kWh)
                  </p>
                </div>
                <button
                  onClick={() => setIsWhatIfOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#5A5D62',
                    padding: '4px',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Toggles & Sliders */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                {/* Control 1: Auto Idle Cutoff */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    backgroundColor: '#D8DAD3',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>5-min Auto Idle Cutoff</span>
                    <button
                      onClick={() => setSimParams((p) => ({ ...p, autoIdleCutoff: !p.autoIdleCutoff }))}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: simParams.autoIdleCutoff ? '#10B981' : '#B8BCB5',
                        color: simParams.autoIdleCutoff ? '#fff' : '#18191B',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {simParams.autoIdleCutoff ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#5A5D62', marginTop: '6px' }}>
                    Eliminates 18 kW unloaded compressor waste across 3.2 hours daily.
                  </p>
                </div>

                {/* Control 2: Stagger Furnace */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    backgroundColor: '#D8DAD3',
                    border: '1px solid rgba(255, 255, 255, 0.5)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>+45m Furnace Stagger</span>
                    <button
                      onClick={() => setSimParams((p) => ({ ...p, staggerFurnace: !p.staggerFurnace }))}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: simParams.staggerFurnace ? '#10B981' : '#B8BCB5',
                        color: simParams.staggerFurnace ? '#fff' : '#18191B',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {simParams.staggerFurnace ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#5A5D62', marginTop: '6px' }}>
                    Avoids evening ToD peak tariff coincidence, cutting peak demand 18%.
                  </p>
                </div>
              </div>

              {/* Slider: Pressure Setpoint */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: '#D8DAD3',
                  border: '1px solid rgba(255, 255, 255, 0.5)',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Air Pressure Setpoint</span>
                  <span style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700 }}>
                    {simParams.pressureSetpoint.toFixed(1)} bar
                  </span>
                </div>
                <input
                  type="range"
                  min="6.5"
                  max="7.5"
                  step="0.1"
                  value={simParams.pressureSetpoint}
                  onChange={(e) => setSimParams((p) => ({ ...p, pressureSetpoint: parseFloat(e.target.value) }))}
                  style={{ width: '100%', accentColor: '#D97706', cursor: 'pointer' }}
                />
                <p style={{ fontSize: '10px', color: '#5A5D62', marginTop: '4px' }}>
                  Rule of thumb: Each 0.1 bar reduction saves ~1% compressor energy without violating 6.2 bar CNC threshold.
                </p>
              </div>

              {/* Calculated Real Deterministic Results */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: '#18191B',
                  color: '#F4F1EA',
                }}
              >
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#81848B' }}>
                    SAVINGS (kWh)
                  </span>
                  <p style={{ fontSize: '20px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#10B981' }}>
                    {simResult.savingsKwh} kWh
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#81848B' }}>
                    FINANCIAL GAIN
                  </span>
                  <p style={{ fontSize: '20px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#F59E0B' }}>
                    ₹{simResult.savingsCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#81848B' }}>
                    CARBON ABATEMENT
                  </span>
                  <p style={{ fontSize: '20px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#38BDF8' }}>
                    {simResult.savingsCarbon} tCO2e
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => {
                    setIsWhatIfOpen(false);
                    onLaunchPlatform();
                  }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '12px',
                    backgroundColor: '#18191B',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Apply to Factory Floor &rarr;
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ISO 50001 SUSTAINABILITY REPORTS PREVIEW MODAL ─────────────────── */}
      <AnimatePresence>
        {isReportsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              backgroundColor: 'rgba(24, 25, 27, 0.45)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 16 }}
              style={{
                width: '100%',
                maxWidth: '620px',
                borderRadius: '24px',
                backgroundColor: '#F4F3EE',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '12px 12px 36px rgba(0, 0, 0, 0.25)',
                padding: '32px',
                color: '#18191B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.04em' }}>
                    ISO 50001 Energy &amp; Carbon Audit Dossier
                  </h2>
                  <p style={{ fontSize: '11px', color: '#5A5D62' }}>
                    Prepared for PrecisionWorks Manufacturing Plant · KPCL Standards
                  </p>
                </div>
                <button
                  onClick={() => setIsReportsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#5A5D62',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Dossier Preview Document */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid rgba(0, 0, 0, 0.08)',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: '20px',
                }}
              >
                <div style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '12px' }}>
                  <p style={{ fontWeight: 700 }}>FACILITY: PrecisionWorks Manufacturing (VIT Pune)</p>
                  <p style={{ color: '#5A5D62', fontSize: '11px' }}>AUDIT PERIOD: October 2026 · CEA Emission Factor 0.82 kg/kWh</p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Baseline Electricity:</span>
                  <span style={{ fontWeight: 600 }}>12,480 kWh (₹99,840)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Scope 1 (LPG Thermal):</span>
                  <span style={{ fontWeight: 600 }}>178.8 kg CO2e</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span>Scope 2 (Grid Electricity):</span>
                  <span style={{ fontWeight: 600 }}>10,233.6 kg CO2e</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981', fontWeight: 700, borderTop: '1px dashed #ccc', paddingTop: '8px', marginTop: '8px' }}>
                  <span>Verified 8% Idle Saving:</span>
                  <span>-998.4 kWh (₹7,987.20 / -0.81 tCO2e)</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    backgroundColor: '#E5E6E1',
                    border: '1px solid #ccc',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Printer size={14} />
                  Print Dossier
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [
                        `ISO 50001 ENERGY AUDIT REPORT\nPlant: PrecisionWorks Manufacturing\nBaseline: 12,480 kWh (₹99,840)\nScope 1: 178.8 kg CO2e\nScope 2: 10,233.6 kg CO2e\nAudit Savings: 998.4 kWh (₹7,987.20 / -0.81 tCO2e)\n`,
                      ],
                      { type: 'text/plain' }
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'WattWise_ISO50001_Audit_Report.txt';
                    a.click();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#18191B',
                    color: '#fff',
                    border: 'none',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={14} />
                  Download PDF / Text
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
