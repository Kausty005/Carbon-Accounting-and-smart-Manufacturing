import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, X, Printer, Download, CheckCircle2,
  AlertTriangle, Sliders, Leaf, Activity, Sparkles,
  ChevronLeft, ChevronRight, Zap, ShieldCheck, Gauge, TrendingDown
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { PLANT, SimParams, calcSimResult } from '../../data/mockData';

// ─── WARM EDITORIAL BEIGE PALETTE (Exact Match to Reference Aesthetic) ─────────
const BG_COLOR = '#E4D9C8'; // Rich, unmistakable warm architectural beige
const NEUMORPHIC_BG = 'rgba(232, 222, 207, 0.90)';
const CARD_SHADOW = '8px 8px 24px #BCB09E, -8px -8px 24px #FFFFFF';
const PILL_SHADOW = '4px 4px 12px #BCB09E, -4px -4px 12px #FFFFFF';
const BORDER_WHITE = '1px solid rgba(255, 255, 255, 0.85)';

export interface BenefitCard {
  icon: 'zap' | 'activity' | 'trending-down' | 'gauge' | 'alert';
  title: string;
  desc: string;
}

export interface MachineStation {
  id: string;
  code: string;
  name: string;
  shortName: string;
  subTitle: string;
  adEyebrow: string;
  adHeadline: [string, string];
  adHook: string;
  benefits: BenefitCard[];
  adMetrics: { label: string; value: string; hint: string }[];
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
    name: 'AIR COMPRESSOR (ELGi EG-55)',
    shortName: '01 / Compressor',
    subTitle: 'Pneumatics Telemetry & Leak Shield',
    adEyebrow: 'INTELLIGENT PNEUMATIC OPTIMIZATION // UNLOADED LEAK DETECTION',
    adHeadline: ['STOP LEAKING POWER.', 'RECLAIM LOST ENERGY.'],
    adHook:
      'WattWise AI detects idle energy waste, identifies equipment inefficiencies, and helps manufacturing plants reduce operating costs without compromising production.',
    benefits: [
      { icon: 'zap', title: 'ENERGY MONITORING', desc: 'Identify unnecessary power consumption.' },
      { icon: 'activity', title: 'WASTE DETECTION', desc: 'Spot inefficient operating patterns.' },
      { icon: 'trending-down', title: 'COST OPTIMIZATION', desc: 'Find opportunities to reduce energy costs.' },
    ],
    adMetrics: [
      { label: 'IDLE POWER', value: '18 kW', hint: 'Unloaded compressor draw' },
      { label: 'ESTIMATED WASTE', value: '₹7,987', hint: 'Potential periodic cost' },
      { label: 'POWER FACTOR', value: '0.78', hint: 'Below target 0.95' },
    ],
    tag: '01 / AIR COMPRESSOR (ELGi EG-55)',
    tagWarning: '— Warning: High Idle Detected (45 kW)',
    pos: [-3.5, 0.42, 2.5],
    cameraPos: [-0.2, 3.8, 6.4], // Elevated front-right zoomed-out angle (~5.6 units distance)
    targetPos: [-3.5, 0.6, 2.5], // Points directly to compressor center
    glowColor: '#F59E0B',
    activeLabel: '01: COMPRESSOR (45 kW LOAD)',
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
    name: 'CNC MACHINING (5-AXIS)',
    shortName: '02 / CNC Spindle',
    subTitle: 'Spindle Load & Specific Energy (SEC)',
    adEyebrow: 'PHYSICS-INFORMED TELEMETRY // SPINDLE CYCLE EFFICIENCY',
    adHeadline: ['PRECISION MACHINING.', 'ZERO UNPRODUCTIVE WATTS.'],
    adHook:
      'Eliminate the gap between machine uptime and wasted energy. WattWise synchronizes CNC G-code cycle telemetry with high-frequency power draw, maintaining optimal Specific Energy Consumption (1.82 kWh/part) while cutting baseload draw 14%.',
    benefits: [
      { icon: 'gauge', title: 'MACHINE LOAD', desc: 'Monitor spindle draw during active cycles.' },
      { icon: 'activity', title: 'CYCLE EFFICIENCY', desc: 'Spot energy waste across machining runs.' },
      { icon: 'trending-down', title: 'ENERGY PER PART', desc: 'Optimize specific energy consumption.' },
    ],
    adMetrics: [
      { label: 'SPINDLE LOAD', value: '32 kW', hint: 'Synced high-speed cutting' },
      { label: 'SPECIFIC ENERGY', value: '1.82 kWh', hint: 'Per verified finished part' },
      { label: 'POWER FACTOR', value: '0.94', hint: 'Near-unity grid efficiency' },
    ],
    tag: '02 / CNC MACHINING (5-AXIS)',
    tagWarning: '— Optimal: SEC 1.82 kWh/part',
    pos: [2.2, 0.42, -1.8],
    cameraPos: [-1.6, 2.6, 2.2], // Low dynamic front-left zoomed-out angle (~5.8 units distance)
    targetPos: [2.2, 0.65, -1.8], // Points directly to CNC spindle
    glowColor: '#10B981',
    activeLabel: '02: CNC MACHINING (32 kW ACTIVE)',
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
    name: 'INDUSTRIAL INDUCTION FURNACE',
    shortName: '03 / Furnace',
    subTitle: 'Thermal Demand & ToD Arbitrage',
    adEyebrow: 'PEAK DEMAND ARBITRAGE // TOD TARIFF PREEMPTION',
    adHeadline: ['PREEMPT GRID SPIKES.', 'CRUSH kVA SURCHARGES.'],
    adHook:
      'Heavy 840°C metallurgical ramp-ups during evening peak ToD hours trigger severe maximum demand penalties. WattWise predicts thermal draw 45 minutes ahead, automatically staggering batch heating cycles to shave 18% off peak kVA.',
    benefits: [
      { icon: 'zap', title: 'THERMAL EFFICIENCY', desc: 'Track heat retention and batch demand.' },
      { icon: 'alert', title: 'PEAK DEMAND', desc: 'Preempt peak ToD tariff surcharges.' },
      { icon: 'trending-down', title: 'HEAT OPTIMIZATION', desc: 'Stagger heating cycles to cut kVA costs.' },
    ],
    adMetrics: [
      { label: 'THERMAL RATING', value: '85 kW', hint: '840°C continuous heat batch' },
      { label: 'PEAK DEMAND', value: '147.2 kVA', hint: 'Preemptively managed limit' },
      { label: 'BILLING SHAVED', value: '₹41,040', hint: 'Per monthly billing cycle' },
    ],
    tag: '03 / INDUSTRIAL FURNACE',
    tagWarning: '— Peak Alert: 840°C Batch Heating',
    pos: [4.2, 0.42, -8.6],
    cameraPos: [7.2, 4.8, -4.6], // High-angle top-down dramatic view (~5.8 units distance)
    targetPos: [4.2, 0.7, -8.6], // Points directly to furnace body & hatch
    glowColor: '#F97316',
    activeLabel: '03: INDUCTION FURNACE (85 kW)',
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
    name: 'CHILLER LOOP & COOLING TOWER',
    shortName: '04 / Chiller Loop',
    subTitle: 'COP Efficiency & Scope 2 Auditing',
    adEyebrow: 'REAL-TIME CARBON ACCOUNTING // ISO 50001 READY',
    adHeadline: ['AUTOMATED NET-ZERO.', 'CEA BASELINE V22 AUDIT.'],
    adHook:
      'Replace retrospective spreadsheets and static emission estimates with sub-second accuracy. WattWise links variable chiller COP (4.1) directly with official CEA Baseline v22 emission factors, delivering certified Scope 1 & 2 audit reports in seconds.',
    benefits: [
      { icon: 'zap', title: 'COOLING EFFICIENCY', desc: 'Track continuous thermal COP performance.' },
      { icon: 'activity', title: 'COOLING DEMAND', desc: 'Balance variable loads with plant needs.' },
      { icon: 'trending-down', title: 'CHILLER OPTIMIZATION', desc: 'Improve loop efficiency and baseload use.' },
    ],
    adMetrics: [
      { label: 'BASELOAD DRAW', value: '28 kW', hint: 'Continuous variable chiller loop' },
      { label: 'LOOP EFFICIENCY', value: '4.1 COP', hint: 'Verified thermal coefficient' },
      { label: 'EMISSION FACTOR', value: '0.716', hint: 'tCO2e/MWh CEA Certified Grid' },
    ],
    tag: '04 / COOLING SYSTEM (CHILLER)',
    tagWarning: '— Optimal: COP 4.1 Chiller Loop',
    pos: [10.2, 0.42, -15.8],
    cameraPos: [14.2, 3.8, -11.6], // Wide 3/4 side profile zoomed-out angle (~5.8 units distance)
    targetPos: [10.2, 0.65, -15.8], // Points directly to chiller & fan deck
    glowColor: '#06B6D4',
    activeLabel: '04: CHILLER COOLING (28 kW)',
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

// ─── S-CURVE INDUSTRIAL BUSWAY SPLINE (Extended Grand Spacing) ─────────────────
const SPLINE_POINTS = [
  new THREE.Vector3(-6.2, 0, 4.8),
  new THREE.Vector3(-3.5, 0, 2.5),   // 01 Compressor
  new THREE.Vector3(-0.6, 0, 0.6),
  new THREE.Vector3(2.2, 0, -1.8),    // 02 CNC Spindle
  new THREE.Vector3(2.8, 0, -5.2),
  new THREE.Vector3(4.2, 0, -8.6),    // 03 Industrial Furnace
  new THREE.Vector3(7.2, 0, -12.2),
  new THREE.Vector3(10.2, 0, -15.8),  // 04 Cooling System
  new THREE.Vector3(13.5, 0, -19.5),
];

const SPLINE_CURVE = new THREE.CatmullRomCurve3(SPLINE_POINTS, false, 'catmullrom', 0.22);

// Standard Materials for Warm Beige Alabaster Industrial Look
const MAT_PATH = new THREE.MeshStandardMaterial({ color: '#D4C9B7', roughness: 0.68, metalness: 0.08 });
const MAT_PATH_BORDER = new THREE.MeshStandardMaterial({ color: '#C6BAA7', roughness: 0.55, metalness: 0.18 });
const MAT_CONDUIT = new THREE.MeshStandardMaterial({ color: '#B2A591', roughness: 0.42, metalness: 0.5 });
const MAT_MACHINE_WHITE = new THREE.MeshStandardMaterial({ color: '#FAF7F0', roughness: 0.38, metalness: 0.12 });
const MAT_MACHINE_DARK = new THREE.MeshStandardMaterial({ color: '#2B2F36', roughness: 0.65, metalness: 0.35 });
const MAT_CHROME = new THREE.MeshStandardMaterial({ color: '#D6D3CB', roughness: 0.18, metalness: 0.88 });

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

// ─── Circular Station Platform with High-Luminance Glowing Neon Ring ──────────
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
  const upwardLightRef = useRef<THREE.PointLight>(null);
  const coreLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 3.0;
    const breath = Math.sin(t) * 2.2;

    if (upwardLightRef.current) {
      // Powerful, bright colored light shining directly up on the underside of the component
      upwardLightRef.current.intensity = isSelected ? 19.0 + breath : 11.5 + Math.sin(t * 0.8) * 1.0;
    }
    if (coreLightRef.current) {
      coreLightRef.current.intensity = isSelected ? 8.0 : 4.5;
    }
  });

  return (
    <group position={[pos[0], 0.05, pos[2]]} onClick={onClick}>
      {/* Compact Circular stepped base disk */}
      <mesh receiveShadow castShadow>
        <cylinderGeometry args={[1.15, 1.25, 0.14, 48]} />
        <primitive object={MAT_PATH_BORDER} attach="material" />
      </mesh>

      {/* Recessed inner pad in clean beige path material */}
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <cylinderGeometry args={[1.05, 1.05, 0.04, 36]} />
        <primitive object={MAT_PATH} attach="material" />
      </mesh>

      {/* 1. PRIMARY HIGH-LUMINANCE NEON RING (Crisp, vivid, un-tonemapped color) */}
      <mesh position={[0, 0.106, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.96, 1.08, 64]} />
        <meshBasicMaterial
          color={glowColor}
          toneMapped={false}
          transparent
          opacity={isSelected ? 1.0 : 0.85}
        />
      </mesh>

      {/* 2. RADIANT ADDITIVE LIGHT AURA RING (Feathered pure photon light, NOT a solid disk or flat color) */}
      <mesh position={[0, 0.108, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.90, 1.16, 64]} />
        <meshBasicMaterial
          color={glowColor}
          toneMapped={false}
          transparent
          opacity={isSelected ? 0.65 : 0.38}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* 3. INNER CORE HIGHLIGHT THREAD */}
      <mesh position={[0, 0.109, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.00, 1.04, 64]} />
        <meshBasicMaterial
          color="#FFFFFF"
          toneMapped={false}
          transparent
          opacity={isSelected ? 0.95 : 0.65}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Intense upward light illuminating machine undercarriage and pipes with bright glow */}
      <pointLight
        ref={upwardLightRef}
        position={[0, 0.38, 0]}
        color={glowColor}
        distance={4.8}
        decay={1.4}
      />

      {/* Close-range component bottom rim wash */}
      <pointLight
        ref={coreLightRef}
        position={[0, 0.18, 0]}
        color={glowColor}
        distance={2.4}
        decay={1.8}
      />
    </group>
  );
}

// ─── 01 / Air Compressor (ELGi) 3D Model ──────────────────────────────────────
function AirCompressorModel({
  pos,
  isSelected,
  onClick,
}: {
  pos: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      // Subtle industrial machine vibration when selected/running
      const shake = isSelected ? Math.sin(clock.getElapsedTime() * 28) * 0.003 : 0;
      groupRef.current.position.y = pos[1] + shake;
    }
  });

  return (
    <group
      ref={groupRef}
      position={pos}
      rotation={[0, -Math.PI / 3.2, 0]}
      onClick={onClick}
    >
      {/* Horizontal Pressure Tank */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.54, 0.54, 1.65, 32]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Hemispherical tank endcaps */}
      <mesh position={[-0.82, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <sphereGeometry args={[0.54, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>
      <mesh position={[0.82, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
        <sphereGeometry args={[0.54, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Front Circular Endcap Fan Grill */}
      <mesh position={[0.91, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 0.06, 24]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Support Feet */}
      <mesh position={[-0.45, -0.38, 0]} castShadow>
        <boxGeometry args={[0.16, 0.22, 0.88]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
      <mesh position={[0.45, -0.38, 0]} castShadow>
        <boxGeometry args={[0.16, 0.22, 0.88]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Top Compressor Pump Housing */}
      <mesh position={[0, 0.64, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.08, 0.48, 0.65]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Heat Sink Cooling Fins across top pump */}
      {[-0.32, -0.16, 0, 0.16, 0.32].map((x, idx) => (
        <mesh key={idx} position={[x, 0.9, 0]} castShadow>
          <boxGeometry args={[0.04, 0.1, 0.58]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
      ))}

      {/* Top Circular Air Intake Bell */}
      <mesh position={[0.2, 0.64, 0.38]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.1, 20]} />
        <primitive object={MAT_CHROME} attach="material" />
      </mesh>

      {/* Analog Pressure Gauge with Amber Rim */}
      <group position={[-0.2, 0.92, 0.35]} rotation={[0.2, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.05, 24]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
        <mesh position={[0, 0.03, 0]}>
          <cylinderGeometry args={[0.095, 0.095, 0.02, 24]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
        {/* Needle */}
        <mesh position={[0, 0.045, 0]} rotation={[0, 0, -0.7]}>
          <boxGeometry args={[0.015, 0.06, 0.005]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
      </group>

      {/* Curved U-pipe connecting pump to receiver */}
      <mesh position={[-0.34, 0.42, 0.36]} castShadow>
        <torusGeometry args={[0.18, 0.038, 12, 24, Math.PI]} />
        <primitive object={MAT_CHROME} attach="material" />
      </mesh>
    </group>
  );
}

// ─── 02 / CNC Machining Center 3D Model ────────────────────────────────────────
function CncMachiningModel({
  pos,
  isSelected,
  onClick,
}: {
  pos: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const spindleRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (spindleRef.current && isSelected) {
      spindleRef.current.position.y = 0.5 + Math.sin(clock.getElapsedTime() * 8) * 0.06;
    }
  });

  return (
    <group
      position={pos}
      rotation={[0, -0.35, 0]}
      onClick={onClick}
    >
      {/* Sculpted enclosure */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.3, 1.25, 1.15]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Dark tinted front inspection glass window */}
      <mesh position={[0, 0.48, 0.59]} castShadow>
        <boxGeometry args={[0.78, 0.74, 0.04]} />
        <meshStandardMaterial color="#1E232A" metalness={0.7} roughness={0.15} />
      </mesh>

      {/* Interior Illuminated Spindle Toolhead */}
      <group ref={spindleRef} position={[0, 0.5, 0.35]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.06, 0.09, 0.3, 18]} />
          <primitive object={MAT_CHROME} attach="material" />
        </mesh>
        {/* Tool chuck */}
        <mesh position={[0, -0.18, 0]} castShadow>
          <coneGeometry args={[0.04, 0.1, 16]} />
          <primitive object={MAT_CHROME} attach="material" />
        </mesh>
      </group>

      {/* Interior Cyan/Green Chamber Illumination */}
      <pointLight position={[0, 0.8, 0.3]} color="#10B981" intensity={isSelected ? 3.0 : 1.2} distance={1.8} />

      {/* Operator side console */}
      <mesh position={[0.52, 0.48, 0.48]} rotation={[0, -0.35, 0]} castShadow>
        <boxGeometry args={[0.32, 0.56, 0.18]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* CNC HMI Touchscreen Display */}
      <mesh position={[0.55, 0.54, 0.57]} rotation={[0, -0.35, 0]}>
        <planeGeometry args={[0.22, 0.18]} />
        <meshBasicMaterial color="#0284C7" toneMapped={false} />
      </mesh>

      {/* Status 3-Tier Tower Light */}
      <group position={[0.5, 1.15, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 12]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
        {/* Green optimal lamp */}
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.038, 0.038, 0.06, 16]} />
          <meshBasicMaterial color="#10B981" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ─── 03 / Industrial Furnace 3D Model ──────────────────────────────────────────
function IndustrialFurnaceModel({
  pos,
  isSelected,
  onClick,
}: {
  pos: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const glowLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (glowLightRef.current) {
      // Heat shimmer pulsation from 840°C refractory chamber
      glowLightRef.current.intensity = 5.0 + Math.sin(clock.getElapsedTime() * 7) * 1.5;
    }
  });

  return (
    <group
      position={pos}
      rotation={[0, -0.25, 0]}
      onClick={onClick}
    >
      {/* Horizontal Cylindrical Body */}
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.7, 1.5, 32]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Heat containment bands */}
      {[-0.42, 0, 0.42].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.73, 0.73, 0.09, 32]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
      ))}

      {/* Rear Terminal Cube & Transformer Box */}
      <mesh position={[0.9, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 1.1, 1.1]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Exhaust Chimney Stack */}
      <mesh position={[0.75, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.16, 0.6, 20]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>

      {/* Front Glowing Inspection Hatch Port (840°C Heat Core) */}
      <mesh position={[-0.76, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.06, 24]} />
        <meshBasicMaterial color="#F97316" toneMapped={false} />
      </mesh>

      {/* Inner hatch refractory glow point light */}
      <pointLight ref={glowLightRef} position={[-0.9, 0, 0]} color="#FF6B00" distance={3.2} />

      {/* Base Cradles */}
      <mesh position={[-0.32, -0.54, 0]} castShadow>
        <boxGeometry args={[0.22, 0.34, 1.18]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
      <mesh position={[0.32, -0.54, 0]} castShadow>
        <boxGeometry args={[0.22, 0.34, 1.18]} />
        <primitive object={MAT_MACHINE_DARK} attach="material" />
      </mesh>
    </group>
  );
}

// ─── 04 / Cooling System 3D Model ─────────────────────────────────────────────
function CoolingSystemModel({
  pos,
  isSelected,
  onClick,
}: {
  pos: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const fan1Ref = useRef<THREE.Group>(null);
  const fan2Ref = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const rotSpeed = isSelected ? 18.0 : 8.0;
    if (fan1Ref.current) fan1Ref.current.rotation.y = clock.getElapsedTime() * rotSpeed;
    if (fan2Ref.current) fan2Ref.current.rotation.y = -clock.getElapsedTime() * rotSpeed;
  });

  return (
    <group position={pos} onClick={onClick}>
      {/* Main Chiller Enclosure */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.45, 0.95, 1.15]} />
        <primitive object={MAT_MACHINE_WHITE} attach="material" />
      </mesh>

      {/* Side Radiator Slats */}
      {[-0.25, -0.1, 0.05, 0.2].map((y, idx) => (
        <mesh key={idx} position={[0, y + 0.4, 0.59]} castShadow>
          <boxGeometry args={[1.15, 0.05, 0.03]} />
          <primitive object={MAT_MACHINE_DARK} attach="material" />
        </mesh>
      ))}

      {/* Dual top circular cooling fans with spinning blades */}
      {[-0.4, 0.4].map((x, i) => (
        <group key={i} position={[x, 0.9, 0]}>
          {/* Fan Housing Shroud */}
          <mesh castShadow>
            <cylinderGeometry args={[0.33, 0.36, 0.12, 28]} />
            <primitive object={MAT_MACHINE_DARK} attach="material" />
          </mesh>

          {/* Rotating Aerofoil Blades */}
          <group ref={i === 0 ? fan1Ref : fan2Ref} position={[0, 0.05, 0]}>
            <mesh>
              <cylinderGeometry args={[0.08, 0.08, 0.04, 16]} />
              <primitive object={MAT_MACHINE_DARK} attach="material" />
            </mesh>
            {[0, 1, 2, 3].map((bladeIdx) => (
              <mesh key={bladeIdx} rotation={[0, (bladeIdx * Math.PI) / 2, 0.25]} position={[0.14, 0, 0]}>
                <boxGeometry args={[0.18, 0.015, 0.07]} />
                <meshStandardMaterial color="#06B6D4" roughness={0.3} metalness={0.6} />
              </mesh>
            ))}
          </group>
        </group>
      ))}

      {/* Chiller Loop Digital Controller Panel */}
      <mesh position={[-0.55, 0.55, 0.59]}>
        <planeGeometry args={[0.22, 0.16]} />
        <meshBasicMaterial color="#06B6D4" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ─── Flowing Energy Particles Along Spline ─────────────────────────────────────
function EnergyFlowParticles() {
  const count = 18;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const time = clock.getElapsedTime() * 0.085;

    for (let i = 0; i < count; i++) {
      const u = (time + i / count) % 1;
      const pt = SPLINE_CURVE.getPoint(u);
      dummy.position.set(pt.x, 0.32, pt.z);
      dummy.scale.setScalar(0.7 + Math.sin(time * 6 + i) * 0.25);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.068, 12, 12]} />
      <meshBasicMaterial color="#38BDF8" toneMapped={false} />
    </instancedMesh>
  );
}

// ─── Dynamic Camera Glider with Organic Zigzag Traversal & Left/Right/Up/Down Angle Sway ───
function CameraRig({
  activeIndex,
  controlsRef,
}: {
  activeIndex: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const current = STATIONS[activeIndex];

  // Zigzag transition burst state
  const prevIndexRef = useRef(activeIndex);
  const transitionTimeRef = useRef(1.0); // 1.0 = settled, 0.0 = just triggered
  const zigzagDirRef = useRef(1); // Alternates zigzag sweep direction

  useEffect(() => {
    if (prevIndexRef.current !== activeIndex) {
      const stepDir = activeIndex > prevIndexRef.current ? 1 : -1;
      zigzagDirRef.current = (activeIndex % 2 === 0 ? 1 : -1) * stepDir;
      prevIndexRef.current = activeIndex;
      transitionTimeRef.current = 0.0; // Trigger dynamic zigzag swoop
    }
  }, [activeIndex]);

  useFrame(({ clock }, delta) => {
    const time = clock.getElapsedTime();

    // Advance zigzag transition swoop gradually (smooth, cinematic pacing)
    if (transitionTimeRef.current < 1.0) {
      transitionTimeRef.current = Math.min(1.0, transitionTimeRef.current + delta * 0.85);
    }
    const t = transitionTimeRef.current;
    // Cubic smoothstep easing for gradual acceleration and deceleration
    const tSmooth = t * t * (3 - 2 * t);

    // 1. DYNAMIC TRAVERSAL ZIGZAG SWOOP (sweeps out along conduit perpendiculars)
    const swoopIntensity = Math.sin(tSmooth * Math.PI) * (1.0 - tSmooth * 0.3);
    const traversalZigzagX = Math.sin(tSmooth * Math.PI * 2) * 2.2 * zigzagDirRef.current * swoopIntensity;
    const traversalZigzagZ = Math.cos(tSmooth * Math.PI * 2.5) * 1.6 * swoopIntensity;
    const traversalZigzagY = Math.sin(tSmooth * Math.PI) * 0.75 * swoopIntensity;

    // 2. ORGANIC CAMERA ANGLE SWAY: Shifts Left, Right, Up, and Down smoothly around the component
    const angleShiftLeftRight = Math.sin(time * 1.4) * 0.52 + Math.cos(time * 2.7) * 0.22;
    const angleShiftUpDown = Math.sin(time * 1.1) * 0.38 + Math.cos(time * 2.3) * 0.14;
    const angleShiftDepth = Math.cos(time * 1.3) * 0.38;

    const baseCam = new THREE.Vector3(...current.cameraPos);
    const targetCam = baseCam.clone().add(
      new THREE.Vector3(
        angleShiftLeftRight + traversalZigzagX,
        angleShiftUpDown + traversalZigzagY,
        angleShiftDepth + traversalZigzagZ
      )
    );

    // 3. TARGET ALWAYS POINTS STRICTLY & PRECISELY TO THE COMPONENT CENTER
    const componentTarget = new THREE.Vector3(...current.targetPos);

    // Gradual, cinematic damping (smooth rotation without snapping)
    const step = Math.min(1, delta * 1.65);
    camera.position.lerp(targetCam, step);

    if (controlsRef.current) {
      controlsRef.current.target.lerp(componentTarget, step);
      controlsRef.current.update();
    } else {
      camera.lookAt(componentTarget);
    }
  });

  return null;
}

// ─── 3D to 2D Label Projector Synchronizer (60 FPS, No React Render overhead) ──
function StationLabelSynchronizer({
  labelRefs,
}: {
  labelRefs: React.RefObject<(HTMLDivElement | null)[]>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!labelRefs.current) return;

    STATIONS.forEach((s, idx) => {
      const el = labelRefs.current[idx];
      if (!el) return;

      // Position slightly above machine geometry
      const yOffset = idx === 0 ? 1.48 : idx === 1 ? 1.35 : idx === 2 ? 1.55 : 1.35;
      v.set(s.pos[0], s.pos[1] + yOffset, s.pos[2]);
      v.project(camera);

      // Check if station is in front of camera
      const isVisible = v.z < 1.0;
      if (!isVisible) {
        el.style.display = 'none';
        return;
      }

      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;

      // Off-screen culling
      if (x < -100 || x > size.width + 100 || y < -100 || y > size.height + 100) {
        el.style.display = 'none';
        return;
      }

      el.style.display = 'flex';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    });
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
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Wheel traversal accumulator & debounce
  const scrollDeltaRef = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isThrottledRef = useRef(false);

  // What-If Simulation Controls
  const [simParams, setSimParams] = useState<SimParams>({
    autoIdleCutoff: false,
    pressureSetpoint: 7.5,
    staggerFurnace: false,
  });

  const simResult = useMemo(() => calcSimResult(simParams), [simParams]);
  const currentStation = STATIONS[activeIndex];

  // Silky Smooth Mouse Wheel & Trackpad Traversal Between Machines
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isWhatIfOpen || isReportsOpen) return;

      // Accumulate scroll
      scrollDeltaRef.current += e.deltaY;

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        scrollDeltaRef.current = 0;
      }, 250);

      // Trigger gradual machine transition once threshold is passed
      if (Math.abs(scrollDeltaRef.current) > 65 && !isThrottledRef.current) {
        isThrottledRef.current = true;
        const dir = scrollDeltaRef.current > 0 ? 1 : -1;
        scrollDeltaRef.current = 0;

        setActiveIndex((prev) => {
          const next = prev + dir;
          return THREE.MathUtils.clamp(next, 0, STATIONS.length - 1);
        });

        setTimeout(() => {
          isThrottledRef.current = false;
        }, 750);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isWhatIfOpen || isReportsOpen) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        setActiveIndex((prev) => THREE.MathUtils.clamp(prev + 1, 0, STATIONS.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        setActiveIndex((prev) => THREE.MathUtils.clamp(prev - 1, 0, STATIONS.length - 1));
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
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
        camera={{ position: [-0.2, 3.8, 6.4], fov: 36 }}
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        <color attach="background" args={[BG_COLOR]} />
        <fog attach="fog" args={[BG_COLOR, 18, 56]} />

        {/* Studio Lighting - Warm Editorial Beige Ambient & Key Lighting */}
        <ambientLight intensity={0.68} color="#FFF8EE" />
        <directionalLight
          position={[-8, 16, 10]}
          intensity={2.0}
          color="#FFF6EB"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-bias={-0.0001}
          shadow-camera-near={0.5}
          shadow-camera-far={65}
          shadow-camera-left={-22}
          shadow-camera-right={22}
          shadow-camera-top={22}
          shadow-camera-bottom={-22}
        />
        <directionalLight position={[10, 8, -8]} intensity={0.85} color="#ECDDC7" />
        <hemisphereLight args={['#FFFDF8', '#D6CBB8', 0.58]} />

        {/* Real Ground Plane in Rich Warm Beige */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
          <planeGeometry args={[180, 180]} />
          <meshStandardMaterial color={BG_COLOR} roughness={0.88} metalness={0.03} />
        </mesh>
        <ContactShadows
          position={[0, 0.01, 0]}
          opacity={0.42}
          scale={55}
          blur={1.8}
          far={14}
          color="#22201D"
        />

        {/* Industrial Pathway & Particles */}
        <WindingEnergyPathway />
        <EnergyFlowParticles />

        {/* 4 Station Platforms with Bright Bottom Constant Glow */}
        {STATIONS.map((s, idx) => (
          <StationPlatform
            key={s.id}
            pos={s.pos}
            glowColor={s.glowColor}
            isSelected={idx === activeIndex}
            onClick={() => setActiveIndex(idx)}
          />
        ))}

        {/* 4 Machine Models with Custom Placements */}
        <AirCompressorModel
          pos={STATIONS[0].pos}
          isSelected={activeIndex === 0}
          onClick={() => setActiveIndex(0)}
        />
        <CncMachiningModel
          pos={STATIONS[1].pos}
          isSelected={activeIndex === 1}
          onClick={() => setActiveIndex(1)}
        />
        <IndustrialFurnaceModel
          pos={STATIONS[2].pos}
          isSelected={activeIndex === 2}
          onClick={() => setActiveIndex(2)}
        />
        <CoolingSystemModel
          pos={STATIONS[3].pos}
          isSelected={activeIndex === 3}
          onClick={() => setActiveIndex(3)}
        />

        {/* High-Performance 60FPS Label Synchronizer */}
        <StationLabelSynchronizer labelRefs={labelRefs} />


        {/* Dynamic Camera Traversal Rig with OrbitControls Sync */}
        <CameraRig activeIndex={activeIndex} controlsRef={controlsRef} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={1.8}
          maxDistance={12}
          dampingFactor={0.06}
        />
      </Canvas>

      {/* ─── 3D PINNED COMPACT MACHINE LABELS (Rendered at 60fps in DOM) ─────── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 18,
          overflow: 'hidden',
        }}
      >
        {STATIONS.map((s, idx) => {
          const isPointed = idx === activeIndex;
          const machineCleanName = s.shortName.split('/')[1]?.trim() || s.name;

          return (
            <div
              key={s.id}
              ref={(el) => {
                labelRefs.current[idx] = el;
              }}
              onClick={() => setActiveIndex(idx)}
              style={{
                position: 'absolute',
                display: 'none',
                transform: 'translate(-50%, -100%)',
                pointerEvents: 'auto',
                cursor: isPointed ? 'default' : 'pointer',
                flexDirection: 'column',
                alignItems: 'center',
                transition: 'opacity 0.25s, transform 0.25s',
                opacity: isPointed ? 1 : 0.65,
                transformOrigin: 'bottom center',
              }}
            >
              <div
                style={{
                  padding: isPointed ? '3px 8px' : '2px 6px',
                  borderRadius: '9999px',
                  backgroundColor: isPointed ? 'rgba(247, 241, 231, 0.95)' : 'rgba(235, 226, 212, 0.82)',
                  backdropFilter: 'blur(8px)',
                  border: isPointed ? `1px solid ${s.glowColor}` : '1px solid rgba(255, 255, 255, 0.75)',
                  boxShadow: isPointed
                    ? `0 2px 8px rgba(0, 0, 0, 0.1), 0 0 8px ${s.glowColor}40`
                    : '0 1px 4px rgba(0, 0, 0, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                }}
              >
                {/* Status Dot */}
                <span
                  style={{
                    width: isPointed ? '5px' : '4px',
                    height: isPointed ? '5px' : '4px',
                    borderRadius: '50%',
                    backgroundColor: s.glowColor,
                    boxShadow: isPointed ? `0 0 6px ${s.glowColor}` : 'none',
                  }}
                />
                <span
                  style={{
                    fontSize: isPointed ? '8.5px' : '7.5px',
                    fontWeight: 700,
                    fontFamily: "'IBM Plex Mono', monospace",
                    color: '#1C1917',
                    letterSpacing: '0.04em',
                  }}
                >
                  {s.code} · {machineCleanName}
                </span>
                {isPointed && (
                  <span
                    style={{
                      fontSize: '7px',
                      fontWeight: 600,
                      padding: '1px 3.5px',
                      borderRadius: '3px',
                      backgroundColor:
                        s.status === 'OPTIMAL' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.18)',
                      color: s.status === 'OPTIMAL' ? '#047857' : '#B45309',
                      fontFamily: "'IBM Plex Mono', monospace",
                    }}
                  >
                    {s.powerKw} kW
                  </span>
                )}
              </div>

              {/* Tiny downward stem */}
              {isPointed && (
                <div
                  style={{
                    width: '1px',
                    height: '5px',
                    background: `linear-gradient(to bottom, ${s.glowColor}, transparent)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>


      {/* ─── TOP NAVIGATION BAR ────────────────────────────────────────────── */}
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
          pointerEvents: 'none',
        }}
      >
        {/* Left Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              backgroundColor: '#18191B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EDE7DC',
              boxShadow: PILL_SHADOW,
            }}
          >
            <Zap size={18} />
          </div>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '15px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: '#18191B',
            }}
          >
            WATTWISE AI
          </span>
        </div>

        {/* Right Navigation Pills */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '12px', pointerEvents: 'auto' }}>
          <button
            onClick={() => setActiveIndex((prev) => (prev + 1) % STATIONS.length)}
            style={{
              padding: '10px 22px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#18191B',
              backgroundColor: NEUMORPHIC_BG,
              backdropFilter: 'blur(12px)',
              border: BORDER_WHITE,
              boxShadow: PILL_SHADOW,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Explore Grid
          </button>

          <button
            onClick={onOpenLogin}
            style={{
              padding: '10px 22px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#18191B',
              backgroundColor: NEUMORPHIC_BG,
              backdropFilter: 'blur(12px)',
              border: BORDER_WHITE,
              boxShadow: PILL_SHADOW,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Sign In
          </button>

          <button
            onClick={onLaunchPlatform}
            style={{
              padding: '11px 28px',
              borderRadius: '9999px',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#EDE7DC',
              backgroundColor: '#18191B',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '4px 4px 14px rgba(0,0,0,0.25), -2px -2px 8px #ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginLeft: '4px',
            }}
          >
            LAUNCH PLATFORM
          </button>
        </nav>
      </header>

      {/* ─── LEFT EDITORIAL COLUMN: CLEAN EDITORIAL HERO CONTENT ───────────── */}
      <div
        style={{
          position: 'fixed',
          left: 'clamp(28px, 3.5vw, 44px)',
          top: 'clamp(110px, 18vh, 160px)',
          zIndex: 20,
          maxWidth: '470px',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStation.id}
            initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Category Domain Badge with Glowing Dot */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 14px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(237, 231, 220, 0.95)',
                border: BORDER_WHITE,
                boxShadow: PILL_SHADOW,
                marginBottom: '14px',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: currentStation.glowColor,
                  boxShadow: `0 0 8px ${currentStation.glowColor}`,
                }}
              />
              <span
                style={{
                  fontSize: '9.5px',
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  color: '#26282C',
                }}
              >
                {currentStation.adEyebrow}
              </span>
            </div>

            {/* Editorial Serif Advertising Headline */}
            <h1
              style={{
                fontFamily: "'Cinzel', 'Playfair Display', Georgia, serif",
                fontSize: 'clamp(32px, 3.4vw, 40px)',
                lineHeight: 1.1,
                letterSpacing: '-0.02em',
                color: '#18191B',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              {currentStation.adHeadline[0]}
              <br />
              {currentStation.adHeadline[1]}
            </h1>

            {/* Concise Value Pitch */}
            <p
              style={{
                fontSize: '13px',
                color: '#4A463F',
                lineHeight: 1.6,
                margin: 0,
                maxWidth: '430px',
              }}
            >
              {currentStation.adHook}
            </p>

            {/* Three Compact Informational Benefit Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
                marginTop: '22px',
                maxWidth: '470px',
                pointerEvents: 'auto',
              }}
            >
              {currentStation.benefits.map((card, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '12px 11px',
                    borderRadius: '16px',
                    backgroundColor: NEUMORPHIC_BG,
                    backdropFilter: 'blur(12px)',
                    border: BORDER_WHITE,
                    boxShadow: PILL_SHADOW,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(24, 25, 27, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: currentStation.glowColor === '#F59E0B' ? '#B45309' : currentStation.glowColor,
                        flexShrink: 0,
                      }}
                    >
                      {card.icon === 'zap' && <Zap size={11} />}
                      {card.icon === 'activity' && <Activity size={11} />}
                      {card.icon === 'trending-down' && <TrendingDown size={11} />}
                      {card.icon === 'gauge' && <Gauge size={11} />}
                      {card.icon === 'alert' && <AlertTriangle size={11} />}
                    </div>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                        color: '#18191B',
                        textTransform: 'uppercase',
                        lineHeight: 1.2,
                      }}
                    >
                      {card.title}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: '11px',
                      lineHeight: 1.45,
                      color: '#4A463F',
                      margin: 0,
                      fontWeight: 500,
                    }}
                  >
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Left Minimal Active Machine Indicator */}
      <div
        style={{
          position: 'fixed',
          left: '44px',
          bottom: '28px',
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '9999px',
            backgroundColor: 'rgba(235, 226, 212, 0.88)',
            border: BORDER_WHITE,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: currentStation.glowColor,
              boxShadow: `0 0 6px ${currentStation.glowColor}`,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: '0.1em',
              color: '#3B3730',
              fontWeight: 700,
            }}
          >
            {currentStation.activeLabel}
          </span>
        </div>
      </div>

      {/* ─── RIGHT FLOATING DIAGNOSTIC TELEMETRY CARD ──────────────────────── */}
      <aside
        style={{
          position: 'fixed',
          right: '40px',
          top: '52%',
          transform: 'translateY(-50%)',
          zIndex: 25,
          width: '290px',
          padding: '20px',
          borderRadius: '24px',
          backgroundColor: NEUMORPHIC_BG,
          backdropFilter: 'blur(16px)',
          border: BORDER_WHITE,
          boxShadow: CARD_SHADOW,
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStation.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.35 }}
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
                  {currentStation.code} / {currentStation.shortName.split('/')[1] || currentStation.name}
                </h3>
                <p
                  style={{
                    fontSize: '11px',
                    color: '#68645C',
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
                  fontWeight: 700,
                  backgroundColor: currentStation.status === 'OPTIMAL' ? '#D1FAE5' : '#FEF3C7',
                  color: currentStation.status === 'OPTIMAL' ? '#065F46' : '#92400E',
                  boxShadow: '1px 1px 4px rgba(0,0,0,0.06)',
                }}
              >
                {currentStation.status}
              </span>
            </div>

            <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#68645C' }}>Idle Draw:</span>
                <span style={{ fontWeight: 600, color: '#18191B', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {currentStation.idleWasteKw}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#68645C' }}>Waste Cost:</span>
                <span style={{ fontWeight: 800, color: '#D97706', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {currentStation.wasteCost}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: '#68645C' }}>Power Factor:</span>
                <span style={{ fontWeight: 600, color: '#18191B', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {currentStation.pf}
                </span>
              </div>
            </div>

            {/* Diagnostic Energy Sparkline Curve */}
            <div style={{ height: '70px', width: '100%', margin: '14px 0 16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={currentStation.chartData}>
                  <defs>
                    <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={currentStation.glowColor} stopOpacity={0.45} />
                      <stop offset="95%" stopColor={currentStation.glowColor} stopOpacity={0.0} />
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
                    stroke={currentStation.glowColor}
                    strokeWidth={2.2}
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
                padding: '11px 16px',
                borderRadius: '14px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#18191B',
                backgroundColor: '#DCD6C9',
                border: BORDER_WHITE,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span>Inspect {currentStation.shortName}</span>
              <ArrowRight size={14} />
            </button>
          </motion.div>
        </AnimatePresence>
      </aside>

      {/* ─── BOTTOM FLOATING SCRUBBER & MACHINE TRAVERSAL BAR ────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: '22px',
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
            padding: '10px 24px',
            borderRadius: '9999px',
            backgroundColor: NEUMORPHIC_BG,
            backdropFilter: 'blur(16px)',
            border: BORDER_WHITE,
            boxShadow: CARD_SHADOW,
            display: 'flex',
            alignItems: 'center',
            gap: '18px',
          }}
        >
          {/* Previous Machine Arrow */}
          <button
            onClick={() => setActiveIndex((prev) => THREE.MathUtils.clamp(prev - 1, 0, STATIONS.length - 1))}
            disabled={activeIndex === 0}
            style={{
              background: 'none',
              border: 'none',
              cursor: activeIndex === 0 ? 'default' : 'pointer',
              color: activeIndex === 0 ? '#C2BCB0' : '#18191B',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <ChevronLeft size={16} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                fontSize: '10px',
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: '0.14em',
                color: '#68645C',
                fontWeight: 700,
              }}
            >
              SCROLL TO TRAVEL
            </span>
            <div
              style={{
                width: '36px',
                height: '3px',
                borderRadius: '2px',
                backgroundColor: '#CEC6B6',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-3.5px',
                  left: `${(activeIndex / (STATIONS.length - 1)) * 28}px`,
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: '#18191B',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  transition: 'left 0.35s ease-out',
                }}
              />
            </div>
          </div>

          <div style={{ width: '1px', height: '18px', backgroundColor: '#CEC6B6' }} />

          {/* Machine Station Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
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
                  fontWeight: idx === activeIndex ? 800 : 500,
                  color: idx === activeIndex ? '#18191B' : '#7E796E',
                  cursor: 'pointer',
                  transition: 'color 0.2s',
                }}
              >
                <span
                  style={{
                    width: idx === activeIndex ? '8px' : '6px',
                    height: idx === activeIndex ? '8px' : '6px',
                    borderRadius: '50%',
                    backgroundColor: idx === activeIndex ? s.glowColor : '#CEC6B6',
                    boxShadow: idx === activeIndex ? `0 0 8px ${s.glowColor}` : 'none',
                    transition: 'all 0.25s',
                  }}
                />
                {s.shortName}
              </button>
            ))}
          </div>

          {/* Next Machine Arrow */}
          <button
            onClick={() => setActiveIndex((prev) => THREE.MathUtils.clamp(prev + 1, 0, STATIONS.length - 1))}
            disabled={activeIndex === STATIONS.length - 1}
            style={{
              background: 'none',
              border: 'none',
              cursor: activeIndex === STATIONS.length - 1 ? 'default' : 'pointer',
              color: activeIndex === STATIONS.length - 1 ? '#C2BCB0' : '#18191B',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span
          style={{
            fontSize: '9px',
            fontFamily: "'IBM Plex Mono', monospace",
            letterSpacing: '0.18em',
            color: '#7E796E',
            fontWeight: 600,
          }}
        >
          &#8744; SCROLL OR ARROWS TO GLIDE CLOSER TO EACH COMPONENT &#8744;
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
                backgroundColor: '#E4D9C8',
                border: BORDER_WHITE,
                boxShadow: '12px 12px 36px rgba(0, 0, 0, 0.25)',
                padding: '32px',
                color: '#18191B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.04em' }}>
                    What-If Energy Optimization Lab
                  </h2>
                  <p style={{ fontSize: '12px', color: '#68645C' }}>
                    Interactive mathematical simulator for PrecisionWorks Manufacturing baseline (12,480 kWh)
                  </p>
                </div>
                <button
                  onClick={() => setIsWhatIfOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#68645C',
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
                    backgroundColor: '#DDD0BC',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>5-min Auto Idle Cutoff</span>
                    <button
                      onClick={() => setSimParams((p) => ({ ...p, autoIdleCutoff: !p.autoIdleCutoff }))}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: simParams.autoIdleCutoff ? '#10B981' : '#CEC6B6',
                        color: simParams.autoIdleCutoff ? '#fff' : '#18191B',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {simParams.autoIdleCutoff ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#68645C', marginTop: '6px' }}>
                    Eliminates 18 kW unloaded compressor waste across 3.2 hours daily.
                  </p>
                </div>

                {/* Control 2: Stagger Furnace */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '16px',
                    backgroundColor: '#DDD0BC',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700 }}>+45m Furnace Stagger</span>
                    <button
                      onClick={() => setSimParams((p) => ({ ...p, staggerFurnace: !p.staggerFurnace }))}
                      style={{
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '11px',
                        fontWeight: 700,
                        backgroundColor: simParams.staggerFurnace ? '#10B981' : '#CEC6B6',
                        color: simParams.staggerFurnace ? '#fff' : '#18191B',
                        border: 'none',
                        cursor: 'pointer',
                      }}
                    >
                      {simParams.staggerFurnace ? 'ACTIVE' : 'OFF'}
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#68645C', marginTop: '6px' }}>
                    Avoids evening ToD peak tariff coincidence, cutting peak demand 18%.
                  </p>
                </div>
              </div>

              {/* Slider: Pressure Setpoint */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: '#DDD0BC',
                  border: '1px solid rgba(255, 255, 255, 0.6)',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Air Pressure Setpoint</span>
                  <span style={{ fontSize: '12px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 800 }}>
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
                <p style={{ fontSize: '10px', color: '#68645C', marginTop: '4px' }}>
                  Rule of thumb: Each 0.1 bar reduction saves ~1% compressor energy without violating 6.2 bar CNC threshold.
                </p>
              </div>

              {/* Calculated Real Deterministic Results */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  padding: '18px',
                  borderRadius: '16px',
                  backgroundColor: '#18191B',
                  color: '#EDE7DC',
                }}
              >
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9E9A90' }}>
                    SAVINGS (kWh)
                  </span>
                  <p style={{ fontSize: '20px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#10B981' }}>
                    {simResult.savingsKwh} kWh
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9E9A90' }}>
                    FINANCIAL GAIN
                  </span>
                  <p style={{ fontSize: '20px', fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, color: '#F59E0B' }}>
                    ₹{simResult.savingsCost.toLocaleString()}
                  </p>
                </div>
                <div>
                  <span style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9E9A90' }}>
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
                    padding: '10px 22px',
                    borderRadius: '12px',
                    backgroundColor: '#18191B',
                    color: '#EDE7DC',
                    fontSize: '12px',
                    fontWeight: 700,
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
                backgroundColor: '#E4D9C8',
                border: BORDER_WHITE,
                boxShadow: '12px 12px 36px rgba(0, 0, 0, 0.25)',
                padding: '32px',
                color: '#18191B',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.04em' }}>
                    ISO 50001 Energy &amp; Carbon Audit Dossier
                  </h2>
                  <p style={{ fontSize: '11px', color: '#68645C' }}>
                    Prepared for PrecisionWorks Manufacturing Plant · KPCL Standards
                  </p>
                </div>
                <button
                  onClick={() => setIsReportsOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#68645C',
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Dossier Preview Document */}
              <div
                style={{
                  backgroundColor: '#FAF6EE',
                  borderRadius: '12px',
                  padding: '20px',
                  border: '1px solid rgba(90, 75, 55, 0.12)',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  fontFamily: "'IBM Plex Mono', monospace",
                  marginBottom: '20px',
                }}
              >
                <div style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '12px' }}>
                  <p style={{ fontWeight: 700 }}>FACILITY: PrecisionWorks Manufacturing (VIT Pune)</p>
                  <p style={{ color: '#68645C', fontSize: '11px' }}>AUDIT PERIOD: October 2026 · CEA Emission Factor 0.82 kg/kWh</p>
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
                    backgroundColor: '#DCD6C9',
                    border: '1px solid #bbb',
                    fontSize: '12px',
                    fontWeight: 600,
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
                    color: '#EDE7DC',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
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
