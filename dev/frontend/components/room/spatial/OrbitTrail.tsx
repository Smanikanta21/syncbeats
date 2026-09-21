"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";
import { SpatialAudioEngine } from "../../../audio/SpatialAudioEngine";
import { polarToWorld, WORLD_SCALE } from "./DeviceOrb";

// Number of trail ghost positions to keep
const TRAIL_LEN = 28;

interface OrbitTrailProps {
  isPlaying: boolean;
}

/**
 * Reads the virtual sound-source position directly from the engine every frame
 * (no React state — runs entirely inside the R3F render loop) and draws:
 *   - A bright orbiting sphere at the current source position
 *   - A fading particle trail behind it
 *   - A thin ring showing the orbit path on the floor
 */
export function OrbitTrail({ isPlaying }: OrbitTrailProps) {
  const sourceMeshRef = useRef<THREE.Mesh>(null!);
  const sourceMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const trailGroupRef = useRef<THREE.Group>(null!);

  // Circular buffer of past world positions
  const trailPositions = useRef<THREE.Vector3[]>(
    Array.from({ length: TRAIL_LEN }, () => new THREE.Vector3()),
  );
  const trailPtr = useRef(0);
  const frameCount = useRef(0);

  // Pre-built trail spheres (reused, positions updated in useFrame)
  const trailMeshRefs = useRef<(THREE.Mesh | null)[]>(
    Array.from({ length: TRAIL_LEN }, () => null),
  );

  // Current orbit radius (for the floor ring) — smoothed
  const orbitRadius = useRef(0);

  useFrame(() => {
    const engine = SpatialAudioEngine.getInstance();
    const source = engine.getSourcePosition();
    const wp = polarToWorld(source);

    // Smooth the orbit radius for the floor ring
    const r = source.radius * WORLD_SCALE;
    orbitRadius.current = THREE.MathUtils.lerp(orbitRadius.current, r, 0.04);

    // Move source orb
    if (sourceMeshRef.current) {
      sourceMeshRef.current.position.lerp(wp, 0.15);
      if (sourceMatRef.current) {
        // Pulse: brighter when playing
        const targetIntensity = isPlaying ? 2.2 : 0.3;
        sourceMatRef.current.emissiveIntensity = THREE.MathUtils.lerp(
          sourceMatRef.current.emissiveIntensity,
          targetIntensity,
          0.08,
        );
      }
    }

    // Record trail position every other frame (every ~33 ms)
    frameCount.current++;
    if (frameCount.current % 2 === 0) {
      trailPositions.current[trailPtr.current].copy(wp);
      trailPtr.current = (trailPtr.current + 1) % TRAIL_LEN;
    }

    // Update trail mesh positions
    for (let i = 0; i < TRAIL_LEN; i++) {
      const mesh = trailMeshRefs.current[i];
      if (!mesh) continue;
      // Age: 0 = newest, 1 = oldest
      const age = ((trailPtr.current - 1 - i + TRAIL_LEN) % TRAIL_LEN) / TRAIL_LEN;
      const pos = trailPositions.current[(trailPtr.current - 1 - i + TRAIL_LEN) % TRAIL_LEN];
      mesh.position.copy(pos);
      mesh.visible = isPlaying;
      const scale = Math.max(0.01, (1 - age) * 0.9);
      mesh.scale.setScalar(scale);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = (1 - age) * 1.4;
      mat.opacity = (1 - age) * 0.6;
    }
  });

  // Floor orbit ring geometry — updated in useFrame via a ref
  const ringRef = useRef<THREE.Mesh>(null!);
  const ringPrevRadius = useRef(-1);

  useFrame(() => {
    if (!ringRef.current) return;
    const r = orbitRadius.current;
    if (Math.abs(r - ringPrevRadius.current) > 0.01) {
      ringPrevRadius.current = r;
      const geo = new THREE.RingGeometry(r - 0.015, r + 0.015, 80);
      ringRef.current.geometry.dispose();
      ringRef.current.geometry = geo;
    }
    const mat = ringRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = isPlaying ? 0.18 : 0.05;
  });

  return (
    <group>
      {/* Floor orbit ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <ringGeometry args={[0, 0, 80]} />
        <meshBasicMaterial
          color="#a78bfa"
          transparent
          opacity={0.18}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Trail ghosts */}
      <group ref={trailGroupRef}>
        {Array.from({ length: TRAIL_LEN }).map((_, i) => (
          <mesh
            key={i}
            ref={(el) => { trailMeshRefs.current[i] = el; }}
            visible={false}
          >
            <sphereGeometry args={[0.07, 8, 8]} />
            <meshStandardMaterial
              color="#c4b5fd"
              emissive="#a78bfa"
              emissiveIntensity={0}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Virtual sound-source orb */}
      <Sphere ref={sourceMeshRef} args={[0.11, 24, 24]}>
        <meshStandardMaterial
          ref={sourceMatRef}
          color="#ddd6fe"
          emissive="#7c3aed"
          emissiveIntensity={0.3}
          metalness={0.1}
          roughness={0.2}
          transparent
          opacity={0.92}
        />
      </Sphere>
    </group>
  );
}
