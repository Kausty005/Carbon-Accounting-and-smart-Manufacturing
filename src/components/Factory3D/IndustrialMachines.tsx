import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Asset } from '../../data/mockData';

// ─── Shared Materials & Helpers ──────────────────────────────────────────────
const MAT_DARK_STEEL = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.85, roughness: 0.25 });
const MAT_INDUSTRIAL_BLUE = new THREE.MeshStandardMaterial({ color: '#0369a1', metalness: 0.6, roughness: 0.35 });
const MAT_MACHINE_GREY = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.7, roughness: 0.4 });
const MAT_CHROME = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.95, roughness: 0.1 });
const MAT_BRASS = new THREE.MeshStandardMaterial({ color: '#d97706', metalness: 0.8, roughness: 0.3 });
const MAT_GLASS = new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.1, roughness: 0.1, transparent: true, opacity: 0.25 });
const MAT_REFRACTORY_BRICK = new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.9, metalness: 0.1 });
const MAT_HAZARD_YELLOW = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.3, roughness: 0.5 });

// ─── 1. ELGi Screw Air Compressor (Bay 01) ───────────────────────────────────
export function AirCompressorModel({
  asset,
  isSelected,
}: {
  asset: Asset;
  isSelected: boolean;
}) {
  const fanRef = useRef<THREE.Group>(null);
  const vibRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    // Fan rotation
    if (fanRef.current) {
      const speed = asset.currentKw > 0 ? (asset.currentKw / 45) * 18 : 0;
      fanRef.current.rotation.z += speed * 0.05;
    }
    // Subtle motor vibration micro-jitter
    if (vibRef.current && asset.currentKw > 0) {
      const vib = Math.sin(clock.getElapsedTime() * 45) * 0.003;
      vibRef.current.position.y = vib;
    }
  });

  return (
    <group ref={vibRef}>
      {/* Heavy Steel Skid Base */}
      <mesh position={[0, 0.08, 0]}>
        <boxGeometry args={[2.4, 0.16, 1.4]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>
      {/* Vibration Dampener Feet */}
      {[[-1.0, -0.5], [1.0, -0.5], [-1.0, 0.5], [1.0, 0.5]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.03, z]}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
      ))}

      {/* Acoustic Compressor Canopy Enclosure */}
      <mesh position={[-0.3, 0.75, 0]}>
        <boxGeometry args={[1.5, 1.2, 1.2]} />
        <primitive object={MAT_INDUSTRIAL_BLUE} />
      </mesh>

      {/* Front Access Doors & Handle */}
      <mesh position={[-0.3, 0.75, 0.61]}>
        <boxGeometry args={[1.35, 1.05, 0.02]} />
        <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.3, 0.75, 0.63]}>
        <boxGeometry args={[0.04, 0.2, 0.02]} />
        <primitive object={MAT_CHROME} />
      </mesh>

      {/* Louvered Air Intake Grille */}
      <mesh position={[-0.8, 0.75, 0.61]}>
        <boxGeometry args={[0.3, 0.8, 0.02]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* Digital Control Panel & Dial Gauge */}
      <mesh position={[0.2, 1.0, 0.62]}>
        <boxGeometry args={[0.35, 0.28, 0.02]} />
        <meshStandardMaterial color="#090d16" />
      </mesh>
      <mesh position={[0.2, 1.0, 0.635]}>
        <circleGeometry args={[0.07, 16]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>

      {/* Air Receiver Tank (Horizontal Steel Pressure Vessel) */}
      <group position={[0.7, 0.85, 0]} rotation={[0, 0, Math.PI / 2]}>
        {/* Main Tank Cylinder */}
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.3, 24]} />
          <meshStandardMaterial color="#0369a1" metalness={0.75} roughness={0.25} />
        </mesh>
        {/* Domed Ends */}
        <mesh position={[0, 0.65, 0]}>
          <sphereGeometry args={[0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#0369a1" metalness={0.75} roughness={0.25} />
        </mesh>
        <mesh position={[0, -0.65, 0]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#0369a1" metalness={0.75} roughness={0.25} />
        </mesh>
      </group>

      {/* Tank Saddle Brackets */}
      <mesh position={[0.7, 0.28, 0]}>
        <boxGeometry args={[0.7, 0.4, 0.8]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>

      {/* Analog Brass Pressure Gauge on top of Tank */}
      <group position={[0.7, 1.45, 0]}>
        <mesh position={[0, -0.1, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.2, 8]} />
          <primitive object={MAT_BRASS} />
        </mesh>
        <mesh rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 0.04, 16]} />
          <primitive object={MAT_CHROME} />
        </mesh>
        {/* Dial Face */}
        <mesh position={[0, 0, 0.025]} rotation={[0, Math.PI / 4, 0]}>
          <circleGeometry args={[0.08, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>

      {/* Brass Safety Pressure Relief Valve */}
      <mesh position={[0.45, 1.38, 0.2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.18, 8]} />
        <primitive object={MAT_BRASS} />
      </mesh>

      {/* Electric Drive Motor with Cooling Fins (on top/back) */}
      <group position={[-0.3, 1.45, -0.1]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.6, 16]} />
          <primitive object={MAT_MACHINE_GREY} />
        </mesh>
        {/* Terminal Box */}
        <mesh position={[0, 0.25, 0]}>
          <boxGeometry args={[0.25, 0.15, 0.2]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Rotating Cooling Fan inside Guard */}
        <group ref={fanRef} position={[0.32, 0, 0]}>
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <mesh key={deg} rotation={[0, 0, (deg * Math.PI) / 180]}>
              <boxGeometry args={[0.03, 0.35, 0.01]} />
              <meshBasicMaterial color="#38bdf8" />
            </mesh>
          ))}
        </group>
      </group>

      {/* High-Pressure Discharge Pipe to Overhead Main */}
      <group position={[0.7, 1.35, -0.2]}>
        <mesh position={[0, 0.45, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.9, 12]} />
          <primitive object={MAT_CHROME} />
        </mesh>
        <mesh position={[0, 0.9, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.8, 12]} />
          <primitive object={MAT_CHROME} />
        </mesh>
        {/* Flanges */}
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.04, 12]} />
          <primitive object={MAT_BRASS} />
        </mesh>
      </group>
    </group>
  );
}

// ─── 2. DMG MORI CNC Machining Center (Bay 02) ──────────────────────────────
export function CncMachineModel({
  asset,
  isSelected,
}: {
  asset: Asset;
  isSelected: boolean;
}) {
  const spindleRef = useRef<THREE.Group>(null);
  const beaconRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    // Spindle rapid rotation
    if (spindleRef.current && asset.currentKw > 5) {
      spindleRef.current.rotation.y += 0.4;
    }
    // Beacon strobe
    if (beaconRef.current) {
      beaconRef.current.intensity = 0.8 + Math.sin(clock.getElapsedTime() * 6) * 0.4;
    }
  });

  return (
    <group>
      {/* Heavy Machine Casting Base */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.2, 0.2, 1.8]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>

      {/* Main Enclosed CNC Body Frame */}
      <mesh position={[0, 1.0, 0]}>
        <boxGeometry args={[2.0, 1.6, 1.6]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Front Upper Enclosure Slope */}
      <mesh position={[0, 1.6, 0.3]} rotation={[-Math.PI / 6, 0, 0]}>
        <boxGeometry args={[1.9, 0.5, 0.1]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Work Chamber Large Sliding Glass Door */}
      <mesh position={[-0.2, 1.05, 0.81]}>
        <boxGeometry args={[1.2, 1.0, 0.02]} />
        <primitive object={MAT_GLASS} />
      </mesh>
      {/* Glass Frame Bezel */}
      <mesh position={[-0.2, 1.05, 0.82]}>
        <boxGeometry args={[1.25, 0.04, 0.03]} />
        <primitive object={MAT_HAZARD_YELLOW} />
      </mesh>

      {/* Illuminated Internal Work Chamber */}
      <pointLight position={[-0.2, 1.2, 0.3]} color="#ffffff" intensity={1.2} distance={2.5} />
      {/* T-Slot Machine Table */}
      <mesh position={[-0.2, 0.55, 0.2]}>
        <boxGeometry args={[0.9, 0.15, 0.7]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>

      {/* Machined Engine Block clamped on Table */}
      <mesh position={[-0.2, 0.72, 0.2]}>
        <boxGeometry args={[0.4, 0.2, 0.3]} />
        <primitive object={MAT_CHROME} />
      </mesh>

      {/* 5-Axis Spindle Head Assembly */}
      <group position={[-0.2, 1.35, 0.2]}>
        {/* Spindle Column Housing */}
        <mesh>
          <boxGeometry args={[0.3, 0.35, 0.3]} />
          <primitive object={MAT_MACHINE_GREY} />
        </mesh>
        {/* High-speed Rotating Tool Chuck */}
        <group ref={spindleRef} position={[0, -0.22, 0]}>
          <mesh>
            <cylinderGeometry args={[0.07, 0.05, 0.14, 16]} />
            <primitive object={MAT_CHROME} />
          </mesh>
          {/* Endmill Cutting Tool */}
          <mesh position={[0, -0.1, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
            <meshBasicMaterial color="#38bdf8" />
          </mesh>
        </group>
        {/* Flexible Coolant Nozzle */}
        <mesh position={[0.12, -0.12, 0]} rotation={[0, 0, Math.PI / 4]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 8]} />
          <primitive object={MAT_BRASS} />
        </mesh>
      </group>

      {/* Swivel Operator Control Console (Pendant Station) */}
      <group position={[0.95, 1.15, 0.7]} rotation={[0, -Math.PI / 6, 0]}>
        {/* Articulated Arm */}
        <mesh position={[-0.15, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.03, 0.03, 0.3, 8]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Screen Bezel */}
        <mesh position={[0.05, 0, 0]}>
          <boxGeometry args={[0.08, 0.45, 0.38]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Screen Display */}
        <mesh position={[0.095, 0, 0]}>
          <boxGeometry args={[0.01, 0.35, 0.3]} />
          <meshBasicMaterial color="#0284c7" />
        </mesh>
      </group>

      {/* Tricolor Andon Signal Tower Beacon */}
      <group position={[0.8, 1.9, -0.6]}>
        <mesh position={[0, 0.15, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Red, Amber, Green light segments */}
        <mesh position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.08, 12]} />
          <meshBasicMaterial color={asset.status === 'PEAK' ? '#ef4444' : '#450a0a'} />
        </mesh>
        <mesh position={[0, 0.44, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.08, 12]} />
          <meshBasicMaterial color={asset.status === 'WARNING' ? '#f59e0b' : '#451a03'} />
        </mesh>
        <mesh position={[0, 0.53, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.08, 12]} />
          <meshBasicMaterial color={asset.status === 'OPTIMAL' ? '#10b981' : '#022c22'} />
        </mesh>
        <pointLight
          ref={beaconRef}
          position={[0, 0.55, 0]}
          color={asset.status === 'OPTIMAL' ? '#10b981' : asset.status === 'WARNING' ? '#f59e0b' : '#ef4444'}
          distance={1.5}
        />
      </group>

      {/* Chip Conveyor & Discharge Chute on Right Side */}
      <group position={[1.15, 0.4, -0.2]} rotation={[0, 0, -Math.PI / 10]}>
        <mesh>
          <boxGeometry args={[0.6, 0.15, 0.4]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
      </group>
    </group>
  );
}

// ─── 3. Thermic Intl Industrial Heat Treatment Furnace (Bay 03 - 840°C) ─────
export function IndustrialFurnaceModel({
  asset,
  isSelected,
}: {
  asset: Asset;
  isSelected: boolean;
}) {
  const glowLightRef = useRef<THREE.PointLight>(null);
  const chimneyParticles = useRef<THREE.Points>(null);

  useFrame(({ clock }) => {
    // Dynamic flickering furnace radiant glow
    if (glowLightRef.current) {
      const flicker = Math.sin(clock.getElapsedTime() * 8) * 0.25 + Math.cos(clock.getElapsedTime() * 14) * 0.15;
      glowLightRef.current.intensity = 2.5 + flicker;
    }
  });

  return (
    <group>
      {/* Heavy Structural Base I-Beams */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.4, 0.2, 2.0]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>

      {/* Insulated Refractory Chamber Outer Shell */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[2.2, 1.8, 1.8]} />
        <primitive object={MAT_REFRACTORY_BRICK} />
      </mesh>

      {/* Steel Reinforcement Rib Channels & Corner Columns */}
      {[-1.05, 1.05].map((x, i) => (
        <group key={`corner-${i}`}>
          <mesh position={[x, 1.1, 0.85]}>
            <boxGeometry args={[0.08, 1.85, 0.08]} />
            <primitive object={MAT_DARK_STEEL} />
          </mesh>
          <mesh position={[x, 1.1, -0.85]}>
            <boxGeometry args={[0.08, 1.85, 0.08]} />
            <primitive object={MAT_DARK_STEEL} />
          </mesh>
        </group>
      ))}

      {/* Pneumatic Counter-Weighted Vertical Guillotine Door */}
      <group position={[0, 1.0, 0.92]}>
        <mesh>
          <boxGeometry args={[1.4, 1.2, 0.12]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Door Lifting Cables & Sheaves */}
        <mesh position={[0, 0.9, 0]}>
          <cylinderGeometry args={[0.015, 0.015, 0.6, 8]} />
          <primitive object={MAT_CHROME} />
        </mesh>
        {/* Quartz Glass Heated Inspection Port */}
        <mesh position={[0, 0.1, 0.07]}>
          <circleGeometry args={[0.14, 16]} />
          <meshBasicMaterial color="#ff5500" />
        </mesh>
      </group>

      {/* Fiery Heat Chamber Radiant Glow Light (casts on floor/front) */}
      <pointLight
        ref={glowLightRef}
        position={[0, 1.0, 1.2]}
        color="#ff6b00"
        distance={4.5}
        intensity={2.8}
      />

      {/* Stainless Steel Exhaust Stack / Chimney */}
      <group position={[0.6, 2.4, -0.3]}>
        <mesh>
          <cylinderGeometry args={[0.18, 0.22, 1.4, 16]} />
          <meshStandardMaterial color="#64748b" metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Rain Cap */}
        <mesh position={[0, 0.8, 0]}>
          <coneGeometry args={[0.3, 0.2, 16]} />
          <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>

      {/* Digital Eurotherm PID Temperature Controller Panel */}
      <group position={[-1.12, 1.2, 0.3]}>
        <mesh rotation={[0, -Math.PI / 2, 0]}>
          <boxGeometry args={[0.45, 0.35, 0.04]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Bright Glowing 840°C Display */}
        <mesh position={[-0.03, 0.05, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <boxGeometry args={[0.3, 0.12, 0.01]} />
          <meshBasicMaterial color="#ff2200" />
        </mesh>
      </group>

      {/* Fuel / Gas / Electric Burner Manifold Piping */}
      <group position={[-1.12, 0.5, -0.2]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
          <primitive object={MAT_BRASS} />
        </mesh>
        {/* Safety Solenoid Shutoff Valve */}
        <mesh position={[0, 0.18, 0]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <primitive object={MAT_HAZARD_YELLOW} />
        </mesh>
      </group>
    </group>
  );
}

// ─── 4. Carrier Chilled Water Cooling System (Bay 04) ───────────────────────
export function ChillerCoolingModel({
  asset,
  isSelected,
}: {
  asset: Asset;
  isSelected: boolean;
}) {
  const fan1Ref = useRef<THREE.Group>(null);
  const fan2Ref = useRef<THREE.Group>(null);

  useFrame(() => {
    // Twin condenser fan blade rotations
    if (fan1Ref.current) fan1Ref.current.rotation.y += 0.15;
    if (fan2Ref.current) fan2Ref.current.rotation.y += 0.17;
  });

  return (
    <group>
      {/* Structural Steel Frame & Pan Base */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[2.0, 0.2, 1.4]} />
        <primitive object={MAT_DARK_STEEL} />
      </mesh>

      {/* Condenser Coil Cabinet V-Bank Housing */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[1.8, 1.2, 1.2]} />
        <meshStandardMaterial color="#0284c7" metalness={0.65} roughness={0.35} />
      </mesh>

      {/* Fine Condenser Louvered Fins Side Grilles */}
      {[-0.61, 0.61].map((z, i) => (
        <mesh key={`grille-${i}`} position={[0, 0.8, z]}>
          <boxGeometry args={[1.7, 1.05, 0.02]} />
          <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} wireframe />
        </mesh>
      ))}

      {/* Dual Top-Mounted Axial Fan Cowlings */}
      {[-0.45, 0.45].map((x, i) => (
        <group key={`fan-cowl-${i}`} position={[x, 1.45, 0]}>
          {/* Circular Shroud Cowling */}
          <mesh>
            <cylinderGeometry args={[0.34, 0.36, 0.15, 24, 1, true]} />
            <primitive object={MAT_DARK_STEEL} />
          </mesh>
          {/* Wire Mesh Fan Guard */}
          <mesh position={[0, 0.08, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.02, 16]} />
            <meshBasicMaterial color="#64748b" wireframe />
          </mesh>
          {/* Rotating 4-Blade Fan */}
          <group ref={i === 0 ? fan1Ref : fan2Ref} position={[0, 0.02, 0]}>
            {[0, 90, 180, 270].map((deg) => (
              <mesh key={deg} rotation={[0, (deg * Math.PI) / 180, 0]}>
                <boxGeometry args={[0.04, 0.01, 0.3]} />
                <meshBasicMaterial color="#38bdf8" />
              </mesh>
            ))}
            <mesh>
              <cylinderGeometry args={[0.07, 0.07, 0.06, 12]} />
              <primitive object={MAT_CHROME} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Chilled Water Piping Network (Vibrant Blue Supply & Orange Return) */}
      <group position={[-1.0, 0.6, 0]}>
        {/* Supply Pipe (Cold Blue) */}
        <mesh position={[0, 0.3, 0.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
          <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Return Pipe (Warm Copper/Orange) */}
        <mesh position={[0, -0.1, -0.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
          <meshStandardMaterial color="#ea580c" metalness={0.7} roughness={0.3} />
        </mesh>
        {/* Flanges & Inline Dial Thermometers */}
        <mesh position={[-0.2, 0.3, 0.3]}>
          <cylinderGeometry args={[0.09, 0.09, 0.03, 12]} />
          <primitive object={MAT_BRASS} />
        </mesh>
        <mesh position={[-0.2, -0.1, -0.3]}>
          <cylinderGeometry args={[0.09, 0.09, 0.03, 12]} />
          <primitive object={MAT_BRASS} />
        </mesh>
      </group>
    </group>
  );
}

// ─── 5. Central Electrical Substation & High-Voltage Bus ────────────────────
export function ElectricalSubstationModel({
  totalKw = 153,
  pf = 0.91,
}: {
  totalKw?: number;
  pf?: number;
}) {
  return (
    <group position={[0, 0, -6.8]}>
      {/* Concrete Transformer Pad */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[3.2, 0.2, 1.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>

      {/* Main Switchgear Cabinets (3 Bay Enclosures) */}
      <mesh position={[0, 1.1, 0]}>
        <boxGeometry args={[2.8, 1.8, 0.9]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Yellow Caution Striping */}
      <mesh position={[0, 1.95, 0.46]}>
        <boxGeometry args={[2.7, 0.08, 0.02]} />
        <primitive object={MAT_HAZARD_YELLOW} />
      </mesh>

      {/* Ceramic High-Voltage Bushing Insulators on top */}
      {[-0.8, -0.2, 0.4, 1.0].map((x, i) => (
        <group key={`bushing-${i}`} position={[x, 2.2, 0]}>
          <mesh>
            <cylinderGeometry args={[0.05, 0.07, 0.4, 12]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.3} />
          </mesh>
          {/* Ceramic Ridges */}
          {[0.08, 0.0, -0.08].map((y, j) => (
            <mesh key={j} position={[0, y, 0]}>
              <cylinderGeometry args={[0.09, 0.09, 0.02, 12]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.2} />
            </mesh>
          ))}
          {/* Copper Busbar Top Clamp */}
          <mesh position={[0, 0.22, 0]}>
            <boxGeometry args={[0.08, 0.05, 0.08]} />
            <primitive object={MAT_BRASS} />
          </mesh>
        </group>
      ))}

      {/* Digital Energy Analyzer Multifunction Meter */}
      <group position={[0, 1.25, 0.46]}>
        <mesh>
          <boxGeometry args={[0.7, 0.4, 0.04]} />
          <primitive object={MAT_DARK_STEEL} />
        </mesh>
        {/* Green Backlit LCD Screen */}
        <mesh position={[0, 0.05, 0.025]}>
          <boxGeometry args={[0.55, 0.2, 0.01]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
        {/* Status LEDs */}
        <mesh position={[-0.2, -0.1, 0.025]}>
          <circleGeometry args={[0.02, 8]} />
          <meshBasicMaterial color="#38bdf8" />
        </mesh>
        <mesh position={[0, -0.1, 0.025]}>
          <circleGeometry args={[0.02, 8]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
        <mesh position={[0.2, -0.1, 0.025]}>
          <circleGeometry args={[0.02, 8]} />
          <meshBasicMaterial color="#f59e0b" />
        </mesh>
      </group>
    </group>
  );
}

// ─── 6. Automated Conveyor System (CNC to Furnace) ──────────────────────────
export function FactoryConveyor() {
  const partsGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (partsGroupRef.current) {
      // Move parts continuously along X axis from CNC (approx x=-4) towards Furnace (x=4)
      const t = clock.getElapsedTime() * 0.4;
      partsGroupRef.current.children.forEach((child, idx) => {
        const offset = (t + idx * 1.5) % 8;
        child.position.x = -4.0 + offset;
      });
    }
  });

  return (
    <group position={[0, 0.35, 1.2]}>
      {/* Heavy Steel Support Legs */}
      {[-4, -2, 0, 2, 4].map((x) => (
        <group key={`leg-${x}`} position={[x, -0.15, 0]}>
          <mesh position={[0, 0, -0.3]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
            <primitive object={MAT_DARK_STEEL} />
          </mesh>
          <mesh position={[0, 0, 0.3]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
            <primitive object={MAT_DARK_STEEL} />
          </mesh>
        </group>
      ))}

      {/* Conveyor Bed & Side Guide Rails */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[8.4, 0.08, 0.7]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.3} />
      </mesh>
      {/* Yellow Safety Edge Rails */}
      <mesh position={[0, 0.06, 0.36]}>
        <boxGeometry args={[8.4, 0.06, 0.03]} />
        <primitive object={MAT_HAZARD_YELLOW} />
      </mesh>
      <mesh position={[0, 0.06, -0.36]}>
        <boxGeometry args={[8.4, 0.06, 0.03]} />
        <primitive object={MAT_HAZARD_YELLOW} />
      </mesh>

      {/* Moving Metallic Engine Parts */}
      <group ref={partsGroupRef}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={`part-${i}`} position={[0, 0.1, 0]}>
            <boxGeometry args={[0.3, 0.16, 0.25]} />
            <primitive object={MAT_CHROME} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
