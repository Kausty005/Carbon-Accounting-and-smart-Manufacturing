import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SensorConduitProps {
  showTelemetryConduits?: boolean;
  isBuffering?: boolean;
}

// ─── Single Telemetry Conduit Line with Animated Data Pulses ───────────────
function SingleDataConduit({
  start,
  end,
  color,
  isBuffering = false,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  isBuffering?: boolean;
}) {
  const pulsesRef = useRef<THREE.Group>(null);

  // Industrial routing: Rise from sensor probe up to overhead raceway (Y = 3.2),
  // route along bay cross-ties, then drop into the Edge Gateway.
  const overheadY = 3.2;
  const p1 = new THREE.Vector3(...start);
  const p2 = new THREE.Vector3(start[0], overheadY, start[2]);
  const p3 = new THREE.Vector3(end[0] + 0.2, overheadY, start[2]);
  const p4 = new THREE.Vector3(end[0] + 0.2, overheadY, end[2]);
  const p5 = new THREE.Vector3(...end);

  const curve = new THREE.CatmullRomCurve3([p1, p2, p3, p4, p5], false, 'centripetal', 0.1);

  useFrame(({ clock }) => {
    if (pulsesRef.current) {
      // Speed of packet transmission: slower and pulsating when buffering
      const speed = isBuffering ? 0.3 : 1.2;
      const t = clock.getElapsedTime() * speed;

      pulsesRef.current.children.forEach((child, idx) => {
        const u = ((t + idx * 0.25) % 1 + 1) % 1;
        const pt = curve.getPointAt(u);
        child.position.copy(pt);
      });
    }
  });

  return (
    <group>
      {/* Overhead Orange Modbus/RS-485 Conduit Tube */}
      <mesh>
        <tubeGeometry args={[curve, 48, 0.02, 8, false]} />
        <meshStandardMaterial
          color={isBuffering ? '#d97706' : '#ea580c'}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>

      {/* Animated Light Pulses (High-speed telemetry packets) */}
      <group ref={pulsesRef}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshBasicMaterial
              color={isBuffering ? '#f59e0b' : color}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Holographic Cloud Uplink Beam (SHA-256 Provenance Stream) ─────────────
function CloudUplinkBeam({
  gatewayPos,
  isBuffering = false,
}: {
  gatewayPos: [number, number, number];
  isBuffering?: boolean;
}) {
  const beamRef = useRef<THREE.Mesh>(null);
  const ringGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (beamRef.current) {
      const mat = beamRef.current.material as THREE.MeshStandardMaterial;
      if (isBuffering) {
        mat.emissive.set('#f59e0b');
        mat.emissiveIntensity = 0.4 + Math.sin(t * 6) * 0.3;
      } else {
        mat.emissive.set('#38bdf8');
        mat.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.25;
      }
    }

    if (ringGroupRef.current && !isBuffering) {
      ringGroupRef.current.children.forEach((ring, idx) => {
        const u = ((t * 0.8 + idx * 0.33) % 1 + 1) % 1;
        ring.position.y = gatewayPos[1] + u * 3.5;
        const scale = 1.0 + Math.sin(u * Math.PI) * 0.3;
        ring.scale.set(scale, scale, scale);
      });
    }
  });

  return (
    <group position={[gatewayPos[0], gatewayPos[1], gatewayPos[2]]}>
      {/* Translucent Uplink Cylinder */}
      <mesh ref={beamRef} position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 3.6, 24]} />
        <meshStandardMaterial
          color={isBuffering ? '#78350f' : '#0369a1'}
          emissive={isBuffering ? '#f59e0b' : '#38bdf8'}
          emissiveIntensity={0.8}
          transparent
          opacity={isBuffering ? 0.25 : 0.45}
          roughness={0.2}
        />
      </mesh>

      {/* Floating Cryptographic Ring Particles */}
      <group ref={ringGroupRef}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.22, 0.015, 12, 24]} />
            <meshBasicMaterial
              color={isBuffering ? '#f59e0b' : '#38bdf8'}
              transparent
              opacity={0.7}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Main Sensor Telemetry Network ─────────────────────────────────────────
export default function SensorDataConduits({
  showTelemetryConduits = true,
  isBuffering = false,
}: SensorConduitProps) {
  if (!showTelemetryConduits) return null;

  // Sensor origin positions
  const SENSOR_COORDINATES: { id: string; pos: [number, number, number]; color: string }[] = [
    { id: 'EM-101', pos: [1.1, 1.4, -6.3], color: '#38bdf8' },  // Substation Power Meter
    { id: 'EM-102', pos: [-3.6, 1.2, -2.5], color: '#38bdf8' }, // Compressor Feeder Meter
    { id: 'FM-201', pos: [3.3, 0.7, -2.5], color: '#06b6d4' },  // Coriolis Mass Flow Meter
    { id: 'GA-301', pos: [4.5, 3.8, -2.5], color: '#10b981' },  // NDIR Flue Gas Analyzer
    { id: 'WQ-401', pos: [5.3, 0.6, 3.0], color: '#60a5fa' },   // Optical COD Probe
  ];

  // Edge Gateway Cabinet coordinates
  const GATEWAY_POS: [number, number, number] = [-7.0, 1.8, -1.5];

  return (
    <group>
      {/* Telemetry data lines from each sensor into Edge Gateway */}
      {SENSOR_COORDINATES.map((sensor) => (
        <SingleDataConduit
          key={sensor.id}
          start={sensor.pos}
          end={GATEWAY_POS}
          color={sensor.color}
          isBuffering={isBuffering}
        />
      ))}

      {/* Cloud Uplink Beam (SHA-256 continuous streaming to statutory audit cloud) */}
      <CloudUplinkBeam
        gatewayPos={GATEWAY_POS}
        isBuffering={isBuffering}
      />
    </group>
  );
}
