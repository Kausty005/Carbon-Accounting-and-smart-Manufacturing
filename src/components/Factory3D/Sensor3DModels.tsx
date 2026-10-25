import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─── Materials ─────────────────────────────────────────────────────────────
const MAT_STAINLESS = new THREE.MeshStandardMaterial({
  color: '#94a3b8',
  metalness: 0.85,
  roughness: 0.2,
});
const MAT_SENSOR_BODY = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  metalness: 0.7,
  roughness: 0.35,
});
const MAT_ORANGE_INSTRUMENT = new THREE.MeshStandardMaterial({
  color: '#ea580c',
  metalness: 0.4,
  roughness: 0.3,
});
const MAT_BLUE_EMERSON = new THREE.MeshStandardMaterial({
  color: '#0284c7',
  metalness: 0.6,
  roughness: 0.3,
});
const MAT_BRASS = new THREE.MeshStandardMaterial({
  color: '#d97706',
  metalness: 0.8,
  roughness: 0.25,
});

export interface Sensor3DProps {
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
  isSelected?: boolean;
  isBuffering?: boolean;
  onClick?: () => void;
}

// ─── 1. Class 0.5S Modbus RTU Multi-Function Power Meter ───────────────────
// (DIN-Rail mounted, LCD display, amber Modbus polling LED)
export function ModbusEnergyMeter3D({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  isSelected = false,
  isBuffering = false,
  onClick,
}: Sensor3DProps) {
  const ledRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (ledRef.current) {
      // Modbus RS-485 activity blink (fast 4Hz flicker)
      const blink = Math.sin(clock.getElapsedTime() * 12) > 0.2;
      ledRef.current.color.set(blink ? (isBuffering ? '#f59e0b' : '#10b981') : '#1e293b');
    }
  });

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {/* Selection highlight ring */}
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.36, 0.46, 0.28]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}

      {/* DIN Rail base bracket */}
      <mesh position={[0, 0, -0.09]}>
        <boxGeometry args={[0.26, 0.36, 0.04]} />
        <meshStandardMaterial color="#334155" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Polycarbonate Meter Enclosure */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.28, 0.38, 0.18]} />
        <primitive object={MAT_SENSOR_BODY} />
      </mesh>

      {/* High-Contrast LCD Glass Screen */}
      <mesh position={[0, 0.04, 0.095]}>
        <boxGeometry args={[0.2, 0.14, 0.01]} />
        <meshStandardMaterial color="#0284c7" emissive="#0284c7" emissiveIntensity={0.35} />
      </mesh>

      {/* Modbus RX/TX Indicator LED */}
      <mesh position={[0.08, -0.1, 0.095]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.01, 16]} />
        <meshBasicMaterial ref={ledRef} color="#10b981" />
      </mesh>

      {/* RS-485 Shielded Terminal Block (Bottom) */}
      <mesh position={[0, -0.18, 0.02]}>
        <boxGeometry args={[0.22, 0.06, 0.1]} />
        <primitive object={MAT_ORANGE_INSTRUMENT} />
      </mesh>

      {/* Terminal screws */}
      {[-0.07, 0, 0.07].map((x, i) => (
        <mesh key={i} position={[x, -0.21, 0.02]}>
          <cylinderGeometry args={[0.01, 0.01, 0.02, 8]} />
          <primitive object={MAT_BRASS} />
        </mesh>
      ))}
    </group>
  );
}

// ─── 2. Coriolis Mass Flow Meter (Dual U-Tube Geometry) ─────────────────────
// (In-line fuel pipe spool, flanged ends, transmitter head)
export function CoriolisFlowMeter3D({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  isSelected = false,
  isBuffering = false,
  onClick,
}: Sensor3DProps) {
  const transmitterLightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (transmitterLightRef.current) {
      transmitterLightRef.current.intensity = 0.5 + Math.sin(clock.getElapsedTime() * 4) * 0.2;
    }
  });

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isSelected && (
        <mesh position={[0, 0.25, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.8, 16]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}

      {/* Straight Pipe Spool Through-Section */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.9, 16]} />
        <primitive object={MAT_STAINLESS} />
      </mesh>

      {/* Flanged Mounting Collars (Inlet & Outlet) */}
      {[-0.42, 0.42].map((x, i) => (
        <mesh key={i} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.13, 0.13, 0.04, 16]} />
          <primitive object={MAT_STAINLESS} />
        </mesh>
      ))}

      {/* Dual Curved U-Tube Sensor Flow Geometry */}
      <mesh position={[0, -0.16, 0]} castShadow>
        <torusGeometry args={[0.16, 0.04, 12, 24, Math.PI]} />
        <primitive object={MAT_STAINLESS} />
      </mesh>

      {/* Sensor Neck Standpipe */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 0.3, 16]} />
        <primitive object={MAT_STAINLESS} />
      </mesh>

      {/* Emerson Blue Transmitter Housing */}
      <mesh position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.22, 24]} />
        <primitive object={MAT_BLUE_EMERSON} />
      </mesh>

      {/* Transmitter Glass Faceplate & Local OLED Display */}
      <mesh position={[0, 0.4, 0.14]}>
        <circleGeometry args={[0.1, 24]} />
        <meshStandardMaterial
          color="#06b6d4"
          emissive={isBuffering ? '#f59e0b' : '#06b6d4'}
          emissiveIntensity={0.6}
        />
      </mesh>

      <pointLight
        ref={transmitterLightRef}
        position={[0, 0.4, 0.2]}
        color={isBuffering ? '#f59e0b' : '#06b6d4'}
        distance={1.2}
      />
    </group>
  );
}

// ─── 3. Continuous NDIR Flue Gas Stack Analyzer ────────────────────────────
// (Cross-duct optical insertion probe, heated umbilical line, analyzer unit)
export function FlueGasAnalyzer3D({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  isSelected = false,
  isBuffering = false,
  onClick,
}: Sensor3DProps) {
  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isSelected && (
        <mesh position={[0.3, 0, 0]}>
          <boxGeometry args={[0.9, 0.5, 0.5]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}

      {/* Stack Duct Flange Mounting Ring */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.05, 16]} />
        <primitive object={MAT_STAINLESS} />
      </mesh>

      {/* High-Temp Inconel Insertion Probe Tube into stack duct */}
      <mesh position={[-0.35, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 16]} />
        <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.3} />
      </mesh>

      {/* SICK Optical Analyzer Enclosure (Weatherproof IP66) */}
      <mesh position={[0.25, 0, 0]} castShadow>
        <boxGeometry args={[0.32, 0.35, 0.28]} />
        <primitive object={MAT_SENSOR_BODY} />
      </mesh>

      {/* Front Optical Status Display Panel */}
      <mesh position={[0.415, 0.04, 0]}>
        <boxGeometry args={[0.01, 0.16, 0.2]} />
        <meshStandardMaterial
          color="#10b981"
          emissive={isBuffering ? '#f59e0b' : '#10b981'}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Heated Sampling Umbilical Tube (Orange PTFE) */}
      <mesh position={[0.25, -0.22, 0]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.15, 12]} />
        <primitive object={MAT_ORANGE_INSTRUMENT} />
      </mesh>
    </group>
  );
}

// ─── 4. Submersible Optical COD / Effluent Probe ────────────────────────────
// (Flow cell, UV-Vis optical window with blue fluorescence excitation glow)
export function OpticalCODProbe3D({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  isSelected = false,
  isBuffering = false,
  onClick,
}: Sensor3DProps) {
  const uvGlowRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (uvGlowRef.current) {
      uvGlowRef.current.intensity = 0.6 + Math.sin(clock.getElapsedTime() * 3.5) * 0.25;
    }
  });

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.65, 16]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}

      {/* Transparent Acrylic In-line Flow Chamber */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.14, 0.14, 0.45, 16]} />
        <meshPhysicalMaterial
          color="#38bdf8"
          transmission={0.85}
          opacity={1}
          transparent
          roughness={0.1}
          ior={1.4}
        />
      </mesh>

      {/* Stainless Steel Probe Body Inserted into Cell */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.5, 16]} />
        <primitive object={MAT_STAINLESS} />
      </mesh>

      {/* Optical UV Measurement Gap Window (254nm absorption path) */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.038, 0.038, 0.06, 16]} />
        <meshStandardMaterial
          color="#3b82f6"
          emissive="#60a5fa"
          emissiveIntensity={1.2}
        />
      </mesh>

      <pointLight
        ref={uvGlowRef}
        position={[0, -0.12, 0]}
        color="#3b82f6"
        distance={0.8}
      />

      {/* Top Cable Gland & Modbus Signal Wire */}
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.1, 12]} />
        <primitive object={MAT_ORANGE_INSTRUMENT} />
      </mesh>
    </group>
  );
}

// ─── 5. Industrial IoT Shop-Floor Edge Gateway Cabinet ─────────────────────
// (Rittal IP66 wall enclosure, TPM 2.0 crypto chip, 72h circular buffer)
export function EdgeGatewayCabinet3D({
  position,
  rotation = [0, 0, 0],
  scale = 1,
  isSelected = false,
  isBuffering = false,
  bufferedCount = 0,
  onClick,
}: Sensor3DProps & { bufferedCount?: number }) {
  const pwrLedRef = useRef<THREE.MeshBasicMaterial>(null);
  const cloudLedRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (pwrLedRef.current) {
      pwrLedRef.current.color.set('#10b981');
    }
    if (cloudLedRef.current) {
      if (isBuffering) {
        const amberBlink = Math.sin(t * 8) > 0;
        cloudLedRef.current.color.set(amberBlink ? '#f59e0b' : '#334155');
      } else {
        const syncBlink = Math.sin(t * 2) > -0.5;
        cloudLedRef.current.color.set(syncBlink ? '#38bdf8' : '#0369a1');
      }
    }
  });

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {isSelected && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[0.6, 0.8, 0.35]} />
          <meshBasicMaterial color="#38bdf8" wireframe />
        </mesh>
      )}

      {/* Wall Mounting Plate & Isolators */}
      <mesh position={[0, 0, -0.13]}>
        <boxGeometry args={[0.54, 0.74, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Heavy IP66 Industrial Steel Enclosure (Light Gray) */}
      <mesh position={[0, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.7, 0.24]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.4} />
      </mesh>

      {/* Front Door Panel Recess with Rubber Seal Gasket */}
      <mesh position={[0, 0, 0.122]}>
        <boxGeometry args={[0.46, 0.66, 0.01]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Quarter-Turn Industrial Key Latches */}
      {[-0.2, 0.2].map((y, i) => (
        <mesh key={i} position={[0.2, y, 0.13]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.02, 12]} />
          <primitive object={MAT_STAINLESS} />
        </mesh>
      ))}

      {/* Edge Gateway Status OLED Screen */}
      <mesh position={[0, 0.12, 0.13]}>
        <boxGeometry args={[0.26, 0.14, 0.01]} />
        <meshStandardMaterial
          color={isBuffering ? '#78350f' : '#082f49'}
          emissive={isBuffering ? '#f59e0b' : '#0284c7'}
          emissiveIntensity={0.6}
        />
      </mesh>

      {/* Front Diagnostic LED Array (PWR, MODBUS, CLOUD, BUFFER) */}
      <group position={[-0.14, -0.06, 0.13]}>
        {/* Power LED */}
        <mesh position={[0, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.01, 12]} />
          <meshBasicMaterial ref={pwrLedRef} color="#10b981" />
        </mesh>
        {/* Cloud / Sync LED */}
        <mesh position={[0, 0.04, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.008, 0.008, 0.01, 12]} />
          <meshBasicMaterial ref={cloudLedRef} color="#38bdf8" />
        </mesh>
      </group>

      {/* External Dipole Antennas on Top (Cellular / LoRaWAN backup) */}
      {[-0.12, 0.12].map((x, i) => (
        <group key={i} position={[x, 0.38, 0]}>
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.01, 0.012, 0.16, 12]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.02, 12]} />
            <primitive object={MAT_BRASS} />
          </mesh>
        </group>
      ))}

      {/* Cable Glands & Modbus Feeders (Bottom) */}
      {[-0.14, -0.05, 0.05, 0.14].map((x, i) => (
        <mesh key={i} position={[x, -0.37, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.05, 12]} />
          <primitive object={MAT_ORANGE_INSTRUMENT} />
        </mesh>
      ))}
    </group>
  );
}
