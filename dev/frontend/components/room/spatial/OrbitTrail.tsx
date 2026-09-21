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
  // Current orbit radius (for the floor ring) — smoothed
  const orbitRadius = useRef(0);
  const dotRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const engine = SpatialAudioEngine.getInstance();
    const source = engine.getSourcePosition();
    const wp = polarToWorld(source);
    
    // Smooth the orbit radius for the floor ring
    const r = source.radius * WORLD_SCALE;
    orbitRadius.current = THREE.MathUtils.lerp(orbitRadius.current, r, 0.04);
    
    // Update the colored dot representing the sound source on the ring
    if (dotRef.current) {
      dotRef.current.position.set(wp.x, 0.003, wp.z);
      const mat = dotRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isPlaying ? 0.9 : 0.2;
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
      
      {/* Moving color dot on the ring */}
      <mesh ref={dotRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.07, 24]} />
        <meshBasicMaterial 
          color="#7c3aed"
          transparent 
          opacity={0.9} 
          depthWrite={false} 
        />
      </mesh>
    </group>
  );
}
