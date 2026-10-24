import { useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Float, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { Machine } from '../data/mockData';

// ---- Energy Pulse Line (animated) ----
function EnergyLine({
  start,
  end,
  power,
  maxPower,
  color = '#ffd166',
}: {
  start: [number, number, number];
  end: [number, number, number];
  power: number;
  maxPower: number;
  color?: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const pulseRef = useRef<THREE.Mesh>(null);

  const midY = 0.02;
  const s = new THREE.Vector3(...start);
  const e = new THREE.Vector3(...end);
  const dir = e.clone().sub(s);
  const len = dir.length();
  const center = s.clone().add(dir.multiplyScalar(0.5));

  useFrame(({ clock }) => {
    if (pulseRef.current) {
      const t = (clock.getElapsedTime() * (0.3 + (power / maxPower) * 0.7)) % 1;
      const px = start[0] + (end[0] - start[0]) * t;
      const pz = start[2] + (end[2] - start[2]) * t;
      pulseRef.current.position.set(px, midY + 0.15, pz);
      const scale = 0.06 + Math.sin(t * Math.PI) * 0.04;
      pulseRef.current.scale.setScalar(scale);
    }
  });

  const intensity = 0.3 + (power / maxPower) * 0.7;

  return (
    <group>
      {/* Cable line */}
      <mesh position={[center.x, midY, center.z]} rotation={[0, Math.atan2(end[0] - start[0], end[2] - start[2]), 0]}>
        <boxGeometry args={[0.04, 0.02, len]} />
        <meshBasicMaterial color={color} transparent opacity={intensity * 0.6} />
      </mesh>
      {/* Pulse */}
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={intensity} />
      </mesh>
    </group>
  );
}

// ---- Machine 3D Model ----
function MachineModel({
  machine,
  isSelected,
  onSelect,
}: {
  machine: Machine;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const statusColor = machine.status === 'warning' ? '#ffb020' 
    : machine.status === 'critical' ? '#ff4d6d' 
    : '#4ade80';

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const targetY = isSelected ? 0.15 : hovered ? 0.05 : 0;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.08;
    }
    if (glowRef.current) {
      const pulse = 0.5 + Math.sin(clock.getElapsedTime() * 2) * 0.3;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 
        machine.status === 'warning' ? pulse * 0.4 : 
        isSelected ? 0.15 : hovered ? 0.1 : 0.05;
    }
  });

  const getGeometry = () => {
    switch (machine.type) {
      case 'compressor':
        return (
          <group>
            {/* Main body - cylinder */}
            <mesh position={[0, 0.5, 0]}>
              <cylinderGeometry args={[0.6, 0.7, 1.0, 16]} />
              <meshStandardMaterial color="#1a3a5c" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Motor */}
            <mesh position={[0.5, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.25, 0.25, 0.5, 12]} />
              <meshStandardMaterial color="#2a4a6c" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* Top valve */}
            <mesh position={[0, 1.1, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.3, 8]} />
              <meshStandardMaterial color="#3a5a7c" metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Pipes */}
            <mesh position={[-0.7, 0.6, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.06, 0.06, 0.4, 8]} />
              <meshStandardMaterial color="#4a6a8c" metalness={0.6} roughness={0.3} />
            </mesh>
            {/* Base plate */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[1.8, 0.06, 1.2]} />
              <meshStandardMaterial color="#1a2a3c" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      case 'cnc':
        return (
          <group>
            {/* Main cabinet */}
            <mesh position={[0, 0.55, 0]}>
              <boxGeometry args={[1.4, 1.1, 1.0]} />
              <meshStandardMaterial color="#1a3a5c" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Work area (glass) */}
            <mesh position={[0, 0.6, 0.51]}>
              <boxGeometry args={[0.9, 0.6, 0.02]} />
              <meshStandardMaterial color="#7fd1ff" metalness={0.1} roughness={0.1} transparent opacity={0.15} />
            </mesh>
            {/* Spindle head */}
            <mesh position={[0, 1.15, 0]}>
              <boxGeometry args={[0.5, 0.12, 0.5]} />
              <meshStandardMaterial color="#2a4a6c" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Control panel */}
            <mesh position={[0.75, 0.7, 0]}>
              <boxGeometry args={[0.08, 0.5, 0.4]} />
              <meshStandardMaterial color="#0a2a4c" metalness={0.3} roughness={0.5} />
            </mesh>
            {/* Base */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[1.6, 0.06, 1.2]} />
              <meshStandardMaterial color="#1a2a3c" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      case 'furnace':
        return (
          <group>
            {/* Main body */}
            <mesh position={[0, 0.6, 0]}>
              <boxGeometry args={[1.6, 1.2, 1.2]} />
              <meshStandardMaterial color="#2a1a0a" metalness={0.6} roughness={0.5} />
            </mesh>
            {/* Door */}
            <mesh position={[0, 0.5, 0.61]}>
              <boxGeometry args={[0.8, 0.7, 0.04]} />
              <meshStandardMaterial color="#4a2a1a" metalness={0.8} roughness={0.3} />
            </mesh>
            {/* Chimney */}
            <mesh position={[0.4, 1.5, 0]}>
              <cylinderGeometry args={[0.12, 0.15, 0.8, 8]} />
              <meshStandardMaterial color="#3a2a1a" metalness={0.7} roughness={0.4} />
            </mesh>
            {/* Heat glow on door */}
            <mesh position={[0, 0.5, 0.62]}>
              <boxGeometry args={[0.7, 0.6, 0.01]} />
              <meshBasicMaterial color="#ff7a45" transparent opacity={0.2} />
            </mesh>
            {/* Base */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[1.8, 0.06, 1.4]} />
              <meshStandardMaterial color="#1a2a3c" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      case 'cooling':
        return (
          <group>
            {/* Main unit */}
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[1.2, 0.9, 0.8]} />
              <meshStandardMaterial color="#1a3a5c" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Fan grille */}
            <mesh position={[0, 0.45, 0.41]}>
              <cylinderGeometry args={[0.3, 0.3, 0.02, 24]} />
              <meshStandardMaterial color="#3a5a7c" metalness={0.5} roughness={0.3} wireframe />
            </mesh>
            {/* Pipes */}
            {[-0.3, 0.3].map((x, i) => (
              <mesh key={i} position={[x, 0.1, -0.45]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
                <meshStandardMaterial color={i === 0 ? '#38bdf8' : '#ff7a45'} metalness={0.6} roughness={0.3} />
              </mesh>
            ))}
            {/* Condenser fins */}
            {Array.from({ length: 8 }).map((_, i) => (
              <mesh key={`fin-${i}`} position={[0, 0.15 + i * 0.08, -0.35]}>
                <boxGeometry args={[1.0, 0.01, 0.08]} />
                <meshStandardMaterial color="#2a4a6c" metalness={0.8} roughness={0.2} />
              </mesh>
            ))}
            {/* Base */}
            <mesh position={[0, -0.02, 0]}>
              <boxGeometry args={[1.4, 0.06, 1.0]} />
              <meshStandardMaterial color="#1a2a3c" metalness={0.5} roughness={0.5} />
            </mesh>
          </group>
        );
      default:
        return (
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#1a3a5c" />
          </mesh>
        );
    }
  };

  return (
    <group
      ref={groupRef}
      position={machine.position}
      onClick={(e) => { e.stopPropagation(); onSelect(machine.id); }}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'default'; }}
    >
      {getGeometry()}

      {/* Selection/status glow */}
      <mesh ref={glowRef} position={[0, 0.5, 0]}>
        <boxGeometry args={[2, 1.6, 1.8]} />
        <meshBasicMaterial color={statusColor} transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>

      {/* Wireframe edges */}
      {(isSelected || hovered) && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[2, 1.6, 1.8]} />
          <meshBasicMaterial color={isSelected ? '#7fd1ff' : '#7fd1ff'} wireframe transparent opacity={isSelected ? 0.3 : 0.15} />
        </mesh>
      )}

      {/* Label */}
      <Html
        position={[0, 1.8, 0]}
        center
        distanceFactor={8}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div style={{
          background: 'rgba(6, 22, 46, 0.9)',
          border: `1px solid ${isSelected ? '#7fd1ff' : 'rgba(127, 209, 255, 0.3)'}`,
          borderRadius: '4px',
          padding: '4px 10px',
          whiteSpace: 'nowrap',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '11px',
          color: isSelected ? '#e8f7ff' : 'rgba(127, 209, 255, 0.7)',
          boxShadow: isSelected ? '0 0 12px rgba(127, 209, 255, 0.2)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
          }} />
          <span style={{ letterSpacing: '1px', textTransform: 'uppercase', fontSize: '10px' }}>
            {machine.name}
          </span>
          <span style={{ color: '#ffd166', fontWeight: 600 }}>{machine.powerKw} kW</span>
        </div>
      </Html>
    </group>
  );
}

// ---- Factory Floor ----
function FactoryFloor() {
  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[20, 16]} />
        <meshStandardMaterial color="#0a1a2e" metalness={0.3} roughness={0.8} />
      </mesh>

      {/* Blueprint grid */}
      <Grid
        args={[20, 16]}
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#7fd1ff"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#7fd1ff"
        fadeDistance={30}
        fadeStrength={1.5}
        infiniteGrid={false}
      />

      {/* Factory walls (transparent blueprint style) */}
      {/* Back wall */}
      <mesh position={[0, 1.5, -6]}>
        <boxGeometry args={[16, 3, 0.08]} />
        <meshBasicMaterial color="#7fd1ff" transparent opacity={0.04} />
      </mesh>
      <lineSegments position={[0, 1.5, -6]}>
        <edgesGeometry args={[new THREE.BoxGeometry(16, 3, 0.08)]} />
        <lineBasicMaterial color="#7fd1ff" transparent opacity={0.25} />
      </lineSegments>

      {/* Left wall */}
      <mesh position={[-8, 1.5, 0]}>
        <boxGeometry args={[0.08, 3, 12]} />
        <meshBasicMaterial color="#7fd1ff" transparent opacity={0.04} />
      </mesh>
      <lineSegments position={[-8, 1.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.08, 3, 12)]} />
        <lineBasicMaterial color="#7fd1ff" transparent opacity={0.25} />
      </lineSegments>

      {/* Right wall */}
      <mesh position={[8, 1.5, 0]}>
        <boxGeometry args={[0.08, 3, 12]} />
        <meshBasicMaterial color="#7fd1ff" transparent opacity={0.04} />
      </mesh>
      <lineSegments position={[8, 1.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.08, 3, 12)]} />
        <lineBasicMaterial color="#7fd1ff" transparent opacity={0.25} />
      </lineSegments>

      {/* Ceiling beams */}
      {[-4, 0, 4].map((x, i) => (
        <group key={`beam-${i}`}>
          <mesh position={[x, 3.0, 0]}>
            <boxGeometry args={[0.15, 0.2, 12]} />
            <meshStandardMaterial color="#1a2a3c" metalness={0.6} roughness={0.4} />
          </mesh>
          <lineSegments position={[x, 3.0, 0]}>
            <edgesGeometry args={[new THREE.BoxGeometry(0.15, 0.2, 12)]} />
            <lineBasicMaterial color="#7fd1ff" transparent opacity={0.15} />
          </lineSegments>
        </group>
      ))}

      {/* Roof trusses */}
      {[-5, -2.5, 0, 2.5, 5].map((z, i) => (
        <group key={`truss-${i}`}>
          <mesh position={[0, 3.0, z]}>
            <boxGeometry args={[16, 0.12, 0.08]} />
            <meshStandardMaterial color="#1a2a3c" metalness={0.6} roughness={0.4} />
          </mesh>
          <lineSegments position={[0, 3.0, z]}>
            <edgesGeometry args={[new THREE.BoxGeometry(16, 0.12, 0.08)]} />
            <lineBasicMaterial color="#7fd1ff" transparent opacity={0.1} />
          </lineSegments>
        </group>
      ))}

      {/* Main electrical panel */}
      <mesh position={[0, 1.0, -5.9]}>
        <boxGeometry args={[1.5, 1.8, 0.15]} />
        <meshStandardMaterial color="#1a2a3c" metalness={0.7} roughness={0.3} />
      </mesh>
      <lineSegments position={[0, 1.0, -5.9]}>
        <edgesGeometry args={[new THREE.BoxGeometry(1.5, 1.8, 0.15)]} />
        <lineBasicMaterial color="#ffd166" transparent opacity={0.4} />
      </lineSegments>
      <Html position={[0, 2.1, -5.9]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '9px',
          color: '#ffd166',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}>
          MAIN PANEL ⚡ 210 kW
        </div>
      </Html>

      {/* Column pillars */}
      {[[-6, -4], [-6, 4], [6, -4], [6, 4]].map(([x, z], i) => (
        <group key={`col-${i}`}>
          <mesh position={[x, 1.5, z]}>
            <cylinderGeometry args={[0.12, 0.14, 3, 8]} />
            <meshStandardMaterial color="#1a3040" metalness={0.7} roughness={0.3} />
          </mesh>
          <lineSegments position={[x, 1.5, z]}>
            <edgesGeometry args={[new THREE.CylinderGeometry(0.12, 0.14, 3, 8)]} />
            <lineBasicMaterial color="#7fd1ff" transparent opacity={0.2} />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

// ---- Floating Particles (ambient atmosphere) ----
function AmbientParticles() {
  const ref = useRef<THREE.Points>(null);
  const count = 100;
  const positions = useRef(new Float32Array(count * 3));

  useState(() => {
    for (let i = 0; i < count * 3; i += 3) {
      positions.current[i] = (Math.random() - 0.5) * 18;
      positions.current[i + 1] = Math.random() * 3.5;
      positions.current[i + 2] = (Math.random() - 0.5) * 14;
    }
  });

  useFrame(({ clock }) => {
    if (ref.current) {
      const geo = ref.current.geometry;
      const pos = geo.attributes.position;
      if (pos) {
        for (let i = 0; i < count; i++) {
          const idx = i * 3;
          (pos.array as Float32Array)[idx + 1] += Math.sin(clock.getElapsedTime() + i) * 0.001;
          if ((pos.array as Float32Array)[idx + 1] > 3.5) (pos.array as Float32Array)[idx + 1] = 0;
        }
        pos.needsUpdate = true;
      }
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions.current}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#7fd1ff" size={0.03} transparent opacity={0.3} sizeAttenuation />
    </points>
  );
}

// ---- Camera auto-position ----
function CameraController({ selectedMachine }: { selectedMachine: Machine | null }) {
  const { camera } = useThree();
  const targetPos = useRef(new THREE.Vector3(8, 8, 12));
  const targetLookAt = useRef(new THREE.Vector3(0, 0.5, 0));

  useFrame(() => {
    if (selectedMachine) {
      const mp = selectedMachine.position;
      targetPos.current.set(mp[0] + 3, 3, mp[2] + 4);
      targetLookAt.current.set(mp[0], 0.5, mp[2]);
    } else {
      targetPos.current.set(8, 8, 12);
      targetLookAt.current.set(0, 0.5, 0);
    }

    camera.position.lerp(targetPos.current, 0.03);
    const currentLookAt = new THREE.Vector3();
    camera.getWorldDirection(currentLookAt);
    // Smooth look-at by adjusting the controls target via a dummy
  });

  return null;
}

// ---- Main Scene Component ----
export default function FactoryScene({
  machines,
  selectedMachineId,
  onSelectMachine,
}: {
  machines: Machine[];
  selectedMachineId: string | null;
  onSelectMachine: (id: string | null) => void;
}) {
  const selectedMachine = machines.find((m) => m.id === selectedMachineId) || null;

  const handleCanvasClick = useCallback(() => {
    onSelectMachine(null);
  }, [onSelectMachine]);

  return (
    <div className="factory-canvas-container">
      <Canvas
        camera={{ position: [8, 8, 12], fov: 35, near: 0.1, far: 200 }}
        onPointerMissed={handleCanvasClick}
        gl={{ antialias: true, alpha: false }}
        style={{ background: 'transparent' }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} color="#7fd1ff" />
        <directionalLight position={[10, 15, 10]} intensity={0.5} color="#e8f7ff" />
        <directionalLight position={[-5, 8, -5]} intensity={0.2} color="#38bdf8" />
        <pointLight position={[0, 4, 0]} intensity={0.3} color="#7fd1ff" distance={20} />

        {/* Fog for depth */}
        <fog attach="fog" args={['#06162e', 15, 45]} />

        {/* Factory environment */}
        <FactoryFloor />
        <AmbientParticles />

        {/* Machines */}
        {machines.map((machine) => (
          <MachineModel
            key={machine.id}
            machine={machine}
            isSelected={selectedMachineId === machine.id}
            onSelect={onSelectMachine}
          />
        ))}

        {/* Energy flow lines from panel to machines */}
        {machines.map((machine) => (
          <EnergyLine
            key={`line-${machine.id}`}
            start={[0, 0, -5.5]}
            end={machine.position}
            power={machine.powerKw}
            maxPower={100}
            color={machine.status === 'warning' ? '#ffb020' : '#ffd166'}
          />
        ))}

        {/* Controls */}
        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate
          minDistance={4}
          maxDistance={25}
          maxPolarAngle={Math.PI / 2.2}
          target={selectedMachine ? new THREE.Vector3(...selectedMachine.position).add(new THREE.Vector3(0, 0.5, 0)) : new THREE.Vector3(0, 0.5, 0)}
          dampingFactor={0.08}
          enableDamping
        />
      </Canvas>

      {/* Blueprint overlay */}
      <div className="canvas-overlay">
        <div className="corner-marks">
          <div className="corner-mark tl" />
          <div className="corner-mark tr" />
          <div className="corner-mark bl" />
          <div className="corner-mark br" />
        </div>
        <div className="view-label">
          PrecisionWorks Factory • Digital Twin • Scale 1:100
        </div>
      </div>
    </div>
  );
}
