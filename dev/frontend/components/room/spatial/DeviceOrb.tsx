"use client";

import { useRef, useMemo, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { SpatialAudioEngine } from "../../../audio/SpatialAudioEngine";
import { polarToCartesian, cartesianToPolar } from "../../../lib/spatial/geometry";
import type { SpatialPosition } from "../../../lib/spatial/geometry";

// World-space scale: 1 polar radius unit = SCALE three.js units
export const WORLD_SCALE = 1.4;

/** Stable, deterministic HSL hue derived from a user ID string. */
export function userHue(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360);
}

/** Convert polar position → Three.js world coords on the floor plane (y = 0). */
export function polarToWorld(pos: SpatialPosition): THREE.Vector3 {
  const c = polarToCartesian(pos, WORLD_SCALE);
  return new THREE.Vector3(c.x, 0, c.z);
}

export interface DeviceOrbProps {
  deviceId: string;
  userId: string;
  label: string;
  position: SpatialPosition;
  isMe: boolean;
  isOwnedByMe: boolean;
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
}

/** Invisible horizontal plane used as the drag surface. */
const DRAG_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export function DeviceOrb({
  deviceId,
  userId,
  label,
  position,
  isMe,
  isOwnedByMe,
  isPlaying,
  onUpdatePosition,
}: DeviceOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const isDragging = useRef(false);
  const { camera, raycaster, gl } = useThree();

  const hue = useMemo(() => userHue(userId), [userId]);
  const color = useMemo(() => new THREE.Color(`hsl(${hue}, 70%, 62%)`), [hue]);
  const emissiveColor = useMemo(() => new THREE.Color(`hsl(${hue}, 90%, 45%)`), [hue]);

  const worldPos = useMemo(() => polarToWorld(position), [position]);

  // Animate emissive intensity from live VBAP gain every frame
  useFrame(() => {
    if (!matRef.current || !meshRef.current) return;

    const gain = SpatialAudioEngine.getInstance().getGain(deviceId);
    // Map gain floor…1.0 → gentle pulse range
    const targetIntensity = isPlaying ? 0.2 + (gain - 0.15) / 0.85 * 2.4 : 0.12;
    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
      matRef.current.emissiveIntensity,
      targetIntensity,
      0.1,
    );

    // Smoothly track target position while not dragging
    if (!isDragging.current) {
      meshRef.current.position.lerp(worldPos, 0.08);
      if (glowRef.current) glowRef.current.position.copy(meshRef.current.position);
    }
  });

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragPoint = useRef(new THREE.Vector3());

  const onPointerDown = useCallback(
    (e: any) => {
      if (!isOwnedByMe) return;
      e.stopPropagation();
      isDragging.current = true;
      gl.domElement.style.cursor = "grabbing";
    },
    [isOwnedByMe, gl],
  );

  const onPointerMove = useCallback(
    (e: any) => {
      if (!isDragging.current || !meshRef.current) return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndcCoords = new THREE.Vector2(
        ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndcCoords, camera);
      if (raycaster.ray.intersectPlane(DRAG_PLANE, dragPoint.current)) {
        meshRef.current.position.set(dragPoint.current.x, 0, dragPoint.current.z);
        if (glowRef.current) glowRef.current.position.copy(meshRef.current.position);
      }
    },
    [camera, raycaster, gl],
  );

  const onPointerUp = useCallback(() => {
    if (!isDragging.current || !meshRef.current) return;
    isDragging.current = false;
    gl.domElement.style.cursor = isOwnedByMe ? "grab" : "default";
    const { x, z } = meshRef.current.position;
    const newPos = cartesianToPolar(x / WORLD_SCALE, z / WORLD_SCALE, position.elevation);
    onUpdatePosition(deviceId, newPos);
  }, [deviceId, position.elevation, onUpdatePosition, gl, isOwnedByMe]);

  const orbRadius = isMe ? 0.21 : 0.155;

  return (
    <group>
      {/* Glow halo */}
      <Sphere ref={glowRef} position={worldPos} args={[orbRadius * 1.6, 16, 16]}>
        <meshStandardMaterial
          color={emissiveColor}
          emissive={emissiveColor}
          emissiveIntensity={0.06}
          transparent
          opacity={0.14}
          depthWrite={false}
        />
      </Sphere>

      {/* Main orb */}
      <Sphere
        ref={meshRef}
        position={worldPos}
        args={[orbRadius, 28, 28]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={0.2}
          metalness={0.15}
          roughness={0.28}
        />
      </Sphere>

      {/* Point light to illuminate nearby floor */}
      <pointLight position={[worldPos.x, 0.3, worldPos.z]} color={emissiveColor} intensity={0.5} distance={1.5} decay={2} />

      {/* HTML billboard label */}
      <Html
        position={[worldPos.x, orbRadius + 0.18, worldPos.z]}
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
          {isMe && (
            <span style={{
              fontSize: "8px", fontWeight: 900, letterSpacing: "0.14em",
              color: `hsl(${hue}, 85%, 72%)`,
              textTransform: "uppercase",
              textShadow: "0 0 6px rgba(0,0,0,0.9)",
              whiteSpace: "nowrap",
            }}>
              YOU
            </span>
          )}
          <span style={{
            fontSize: "9px", fontWeight: 700,
            color: "rgba(255,255,255,0.88)",
            textShadow: "0 1px 5px rgba(0,0,0,0.95)",
            whiteSpace: "nowrap",
            maxWidth: "68px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {label}
          </span>
        </div>
      </Html>
    </group>
  );
}
