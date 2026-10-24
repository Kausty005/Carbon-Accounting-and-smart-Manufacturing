import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Grid, Float } from '@react-three/drei';
import * as THREE from 'three';

// ─── Colors & Materials ──────────────────────────────────────────────────────
const MAT_CRANE_YELLOW = new THREE.MeshStandardMaterial({ color: '#f59e0b', metalness: 0.3, roughness: 0.4 });
const MAT_STEEL_BEAM = new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.6, roughness: 0.3 });
const MAT_PILLAR = new THREE.MeshStandardMaterial({ color: '#d8d5cb', roughness: 0.85 });
const MAT_VENT_DUCT = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.7, roughness: 0.3 });

// ─── Machine Bay Positions (matches mockData ASSETS) ─────────────────────────
export const ASSET_POSITIONS: Record<string, [number, number, number]> = {
  compressor: [-4.5, 0, -2.5],
  cnc:        [-4.5, 0, 3.0],
  furnace:    [4.5, 0, -2.5],
  cooling:    [4.5, 0, 3.0],
};

// ─── Overhead Gantry Crane (Traveling Bridge Crane) ──────────────────────────
export function OverheadGantryCrane() {
  const craneRef = useRef<THREE.Group>(null);
  const trolleyRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    // Gentle automated movement along the factory bay length (Z-axis)
    if (craneRef.current) {
      craneRef.current.position.z = Math.sin(clock.getElapsedTime() * 0.15) * 3.5;
    }
    // Trolley traversing across the span (X-axis)
    if (trolleyRef.current) {
      trolleyRef.current.position.x = Math.sin(clock.getElapsedTime() * 0.25) * 3.0;
    }
  });

  return (
    <group ref={craneRef} position={[0, 4.8, 0]}>
      {/* Main Double Box Girder Beam (Yellow 16m span) */}
      <mesh position={[0, 0, -0.25]}>
        <boxGeometry args={[18, 0.4, 0.2]} />
        <primitive object={MAT_CRANE_YELLOW} />
      </mesh>
      <mesh position={[0, 0, 0.25]}>
        <boxGeometry args={[18, 0.4, 0.2]} />
        <primitive object={MAT_CRANE_YELLOW} />
      </mesh>

      {/* End Carriages / Wheel Trucks on side runway rails */}
      {[-9, 9].map((x, i) => (
        <group key={`end-truck-${i}`} position={[x, 0, 0]}>
          <mesh>
            <boxGeometry args={[0.3, 0.35, 1.2]} />
            <primitive object={MAT_STEEL_BEAM} />
          </mesh>
          {/* Flanged Crane Wheels */}
          {[-0.45, 0.45].map((z, j) => (
            <mesh key={j} position={[0, -0.15, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} />
              <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Traversing Hoist Trolley Unit */}
      <group ref={trolleyRef} position={[0, 0.25, 0]}>
        <mesh>
          <boxGeometry args={[0.8, 0.25, 0.7]} />
          <primitive object={MAT_STEEL_BEAM} />
        </mesh>
        {/* Wire Rope Drum */}
        <mesh position={[0, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.15, 0.15, 0.6, 16]} />
          <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.2} />
        </mesh>
        {/* Wire Ropes Dropping Down */}
        {[-0.15, 0.15].map((x, i) => (
          <mesh key={i} position={[x, -1.2, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 2.2, 8]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} />
          </mesh>
        ))}
        {/* Bottom Hook Block & Crane Hook */}
        <group position={[0, -2.4, 0]}>
          <mesh>
            <boxGeometry args={[0.35, 0.25, 0.25]} />
            <primitive object={MAT_CRANE_YELLOW} />
          </mesh>
          {/* Heavy Forged Steel Hook */}
          <mesh position={[0, -0.22, 0]}>
            <torusGeometry args={[0.1, 0.03, 12, 24, Math.PI * 1.4]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.95} roughness={0.1} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

// ─── Perimeter Safety Bollards & Workbay Anchors ─────────────────────────────
function StructuralColumns() {
  const columnPositions: [number, number, string][] = [
    [-8, -5.5, 'C-01'],
    [-8, 0,    'C-02'],
    [-8, 5.5,  'C-03'],
    [8, -5.5,  'C-04'],
    [8, 0,     'C-05'],
    [8, 5.5,   'C-06'],
  ];

  return (
    <group>
      {columnPositions.map(([x, z], idx) => (
        <group key={`col-${idx}`} position={[x, 0, z]}>
          {/* Low Safety Foundation Bollard (Non-obstructive) */}
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.22, 0.25, 0.7, 16]} />
            <primitive object={MAT_PILLAR} />
          </mesh>
          {/* Yellow Safety Base Ring */}
          <mesh position={[0, 0.15, 0]}>
            <cylinderGeometry args={[0.26, 0.28, 0.3, 16]} />
            <primitive object={MAT_CRANE_YELLOW} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ─── Roof Trusses & Spiral Ventilation Ducts ──────────────────────────────────
function RoofArchitecture() {
  return (
    <group position={[0, 5.2, 0]}>
      {/* Transverse I-Beams */}
      {[-6, -3, 0, 3, 6].map((z) => (
        <group key={`truss-${z}`} position={[0, 0, z]}>
          <mesh>
            <boxGeometry args={[18, 0.15, 0.08]} />
            <primitive object={MAT_STEEL_BEAM} />
          </mesh>
          {/* Cross Braces (Web Trusses) */}
          {[-6, -3, 3, 6].map((x) => (
            <mesh key={`brace-${x}`} position={[x, -0.25, 0]} rotation={[0, 0, Math.PI / 4]}>
              <boxGeometry args={[0.7, 0.04, 0.04]} />
              <meshBasicMaterial color="#38bdf8" transparent opacity={0.3} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Main Longitudinal HVAC Spiral Ducts */}
      {[-3.5, 3.5].map((x, i) => (
        <group key={`duct-${i}`} position={[x, -0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[0.22, 0.22, 16, 16]} />
            <primitive object={MAT_VENT_DUCT} />
          </mesh>
          {/* Extraction Grille Drops */}
          {[-4, 0, 4].map((z) => (
            <mesh key={`grille-${z}`} position={[0, z, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
              <boxGeometry args={[0.3, 0.2, 0.3]} />
              <primitive object={MAT_STEEL_BEAM} />
            </mesh>
          ))}
        </group>
      ))}

      {/* High-Bay Industrial LED Downlights */}
      {[
        [-4.5, -2.5], [-4.5, 3.0],
        [4.5, -2.5],  [4.5, 3.0],
        [0, -4.5],    [0, 0], [0, 4.5],
      ].map(([x, z], i) => (
        <group key={`light-${i}`} position={[x, -0.2, z]}>
          <mesh>
            <cylinderGeometry args={[0.18, 0.26, 0.18, 16]} />
            <primitive object={MAT_STEEL_BEAM} />
          </mesh>
          {/* Emissive Light Disk */}
          <mesh position={[0, -0.1, 0]}>
            <circleGeometry args={[0.22, 16]} />
            <meshBasicMaterial color="#e0f2fe" />
          </mesh>
          {/* Spot Downlight */}
          <spotLight
            position={[0, -0.1, 0]}
            color="#bae6fd"
            intensity={1.8}
            angle={0.65}
            penumbra={0.6}
            distance={10}
          />
        </group>
      ))}
    </group>
  );
}

// ─── Machine Bay Safety Zones & Floor Graphics ───────────────────────────────
function MachineBayMarkings({ showSafetyZones }: { showSafetyZones: boolean }) {
  const bays = [
    { pos: ASSET_POSITIONS.compressor, size: [3.4, 2.6], color: '#f59e0b', name: 'BAY 01 · COMPRESSOR' },
    { pos: ASSET_POSITIONS.cnc,        size: [3.4, 3.0], color: '#22d3ee', name: 'BAY 02 · CNC CELL' },
    { pos: ASSET_POSITIONS.furnace,    size: [3.4, 3.0], color: '#ef4444', name: 'BAY 03 · THERMAL FURNACE' },
    { pos: ASSET_POSITIONS.cooling,    size: [3.4, 2.6], color: '#10b981', name: 'BAY 04 · CHILLED WATER' },
  ];

  return (
    <group>
      {bays.map((bay, idx) => (
        <group key={`bay-mark-${idx}`} position={[bay.pos[0], 0.01, bay.pos[2]]}>
          {/* Bay Perimeter Line */}
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[bay.size[0], bay.size[1]]} />
            <meshBasicMaterial color={bay.color} transparent opacity={0.06} />
          </mesh>

          {/* Yellow/Black Safety Border */}
          <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
            <edgesGeometry args={[new THREE.PlaneGeometry(bay.size[0], bay.size[1])]} />
            <lineBasicMaterial color={bay.color} transparent opacity={0.6} linewidth={2} />
          </lineSegments>

          {/* Volumetric OSHA Safety Barrier (Toggled) */}
          {showSafetyZones && (
            <mesh position={[0, 0.45, 0]}>
              <boxGeometry args={[bay.size[0] + 0.2, 0.9, bay.size[1] + 0.2]} />
              <meshBasicMaterial color={bay.color} transparent opacity={0.08} wireframe />
            </mesh>
          )}
        </group>
      ))}

      {/* Central Pedestrian Safety Crosswalk */}
      <group position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <planeGeometry args={[1.8, 12]} />
          <meshBasicMaterial color="#064e3b" transparent opacity={0.25} />
        </mesh>
        {/* White Zebra Walkway Stripes */}
        {[-5, -3.5, -2, -0.5, 1, 2.5, 4, 5.5].map((y) => (
          <mesh key={`stripe-${y}`} position={[0, y, 0.002]}>
            <planeGeometry args={[1.4, 0.35]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Main Factory Environment Component ──────────────────────────────────────
export default function FactoryEnvironment({
  showSafetyZones = true,
}: {
  showSafetyZones?: boolean;
}) {
  return (
    <group>
      {/* Expansive Architectural Warm Beige Ceramic Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#E4D9C8" metalness={0.03} roughness={0.88} />
      </mesh>

      {/* Primary Plant Floor Bay in Warm Sand Dune Ceramic */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
        <planeGeometry args={[26, 20]} />
        <meshStandardMaterial color="#D8CCBA" metalness={0.06} roughness={0.74} />
      </mesh>

      {/* Precision Blueprint Subgrid */}
      <Grid
        args={[36, 28]}
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#C4B7A3"
        sectionSize={4}
        sectionThickness={1.2}
        sectionColor="#A99B85"
        fadeDistance={38}
        fadeStrength={1.2}
        infiniteGrid={false}
      />

      {/* Architectural Walls with Clean Wireframe Framing */}
      {/* North Wall (Back) */}
      <mesh position={[0, 2.5, -9]}>
        <boxGeometry args={[22, 5, 0.1]} />
        <meshBasicMaterial color="#dedad0" transparent opacity={0.05} />
      </mesh>
      <lineSegments position={[0, 2.5, -9]}>
        <edgesGeometry args={[new THREE.BoxGeometry(22, 5, 0.1)]} />
        <lineBasicMaterial color="#b5b0a2" transparent opacity={0.4} />
      </lineSegments>

      {/* West Wall (Left) */}
      <mesh position={[-11, 2.5, 0]}>
        <boxGeometry args={[0.1, 5, 18]} />
        <meshBasicMaterial color="#0369a1" transparent opacity={0.03} />
      </mesh>
      <lineSegments position={[-11, 2.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.1, 5, 18)]} />
        <lineBasicMaterial color="#0284c7" transparent opacity={0.25} />
      </lineSegments>

      {/* East Wall (Right) */}
      <mesh position={[11, 2.5, 0]}>
        <boxGeometry args={[0.1, 5, 18]} />
        <meshBasicMaterial color="#0369a1" transparent opacity={0.03} />
      </mesh>
      <lineSegments position={[11, 2.5, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(0.1, 5, 18)]} />
        <lineBasicMaterial color="#0284c7" transparent opacity={0.25} />
      </lineSegments>

      {/* Bay Markings & Crosswalk */}
      <MachineBayMarkings showSafetyZones={showSafetyZones} />

      {/* Perimeter Foundation Bollards */}
      <StructuralColumns />
    </group>
  );
}
