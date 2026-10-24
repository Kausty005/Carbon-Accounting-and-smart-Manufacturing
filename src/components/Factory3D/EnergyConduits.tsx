import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ASSET_POSITIONS } from './FactoryEnvironment';
import type { Asset } from '../../data/mockData';

interface ConduitProps {
  assets: Asset[];
  showConduits?: boolean;
}

// ─── Single Animated Energy Conduit Line ─────────────────────────────────────
function SingleConduit({
  start,
  end,
  powerKw,
  color,
}: {
  start: [number, number, number];
  end: [number, number, number];
  powerKw: number;
  color: string;
}) {
  const pulseGroupRef = useRef<THREE.Group>(null);

  // Conduit path with intermediate right-angle bend for realistic industrial routing
  const midZ = (start[2] + end[2]) * 0.5;
  const p1 = new THREE.Vector3(...start);
  const p2 = new THREE.Vector3(start[0], 0.05, midZ);
  const p3 = new THREE.Vector3(end[0], 0.05, midZ);
  const p4 = new THREE.Vector3(end[0], 0.05, end[2]);

  // Points along the dogleg path
  const points = [p1, p2, p3, p4];
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);

  useFrame(({ clock }) => {
    if (pulseGroupRef.current && powerKw > 0) {
      // Speed proportional to load
      const speed = 0.2 + (powerKw / 85) * 0.8;
      const t = clock.getElapsedTime() * speed;

      pulseGroupRef.current.children.forEach((child, idx) => {
        const u = ((t + idx * 0.2) % 1 + 1) % 1;
        const pt = curve.getPointAt(u);
        child.position.copy(pt);
        child.position.y += 0.06;
      });
    }
  });

  return (
    <group>
      {/* Heavy Armored Cable Tray on Floor */}
      <mesh position={[(start[0] + end[0]) * 0.5, 0.03, midZ]}>
        <boxGeometry args={[Math.abs(end[0] - start[0]) + 0.1, 0.04, 0.12]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[start[0], 0.03, (start[2] + midZ) * 0.5]}>
        <boxGeometry args={[0.12, 0.04, Math.abs(midZ - start[2])]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[end[0], 0.03, (midZ + end[2]) * 0.5]}>
        <boxGeometry args={[0.12, 0.04, Math.abs(end[2] - midZ)]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Glowing Neon Core Line */}
      <mesh position={[(start[0] + end[0]) * 0.5, 0.06, midZ]}>
        <boxGeometry args={[Math.abs(end[0] - start[0]), 0.015, 0.03]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} />
      </mesh>

      {/* Pulsing Energy Particle Packets */}
      {powerKw > 0 && (
        <group ref={pulseGroupRef}>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={`pulse-${i}`}>
              <sphereGeometry args={[0.07, 8, 8]} />
              <meshBasicMaterial color={color} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

// ─── All Plant Energy Conduits ───────────────────────────────────────────────
export default function EnergyConduits({ assets, showConduits = true }: ConduitProps) {
  if (!showConduits) return null;

  const SUBSTATION_POS: [number, number, number] = [0, 0.2, -6.2];

  const colors: Record<string, string> = {
    compressor: '#f59e0b',
    cnc:        '#22d3ee',
    furnace:    '#ef4444',
    cooling:    '#10b981',
  };

  return (
    <group>
      {assets.map((asset) => {
        const targetPos = ASSET_POSITIONS[asset.id];
        if (!targetPos) return null;
        return (
          <SingleConduit
            key={`conduit-${asset.id}`}
            start={SUBSTATION_POS}
            end={targetPos}
            powerKw={asset.currentKw}
            color={colors[asset.id] || '#38bdf8'}
          />
        );
      })}
    </group>
  );
}
