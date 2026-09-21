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

export function DeviceOrbV2({
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
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const isDragging = useRef(false);
  const { camera, raycaster, gl, get } = useThree();
  const _hmrDummy = useMemo(() => null, []); // HMR dummy hook to match previous state
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
    }
  });

  // ── Drag ─────────────────────────────────────────────────────────────────
  const dragPoint = useRef(new THREE.Vector3());

  const onPointerDown = useCallback(
    (e: any) => {
      if (!isOwnedByMe) return;
      e.stopPropagation();
      isDragging.current = true;
      const controls = get().controls as any;
      if (controls) controls.enabled = false;
      e.target.setPointerCapture(e.pointerId);
      gl.domElement.style.cursor = "grabbing";
    },
    [isOwnedByMe, gl, get],
  );

  const onPointerMove = useCallback(
    (e: any) => {
      if (!isDragging.current || !meshRef.current) return;
      e.stopPropagation();
      const rect = gl.domElement.getBoundingClientRect();
      const ndcCoords = new THREE.Vector2(
        ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndcCoords, camera);
      if (raycaster.ray.intersectPlane(DRAG_PLANE, dragPoint.current)) {
        // Constrain to the exact orbit ring (radius of the virtual audio source)
        const orbitRadiusWorld = SpatialAudioEngine.getInstance().getSourcePosition().radius * WORLD_SCALE;
        const currentRadius = Math.sqrt(dragPoint.current.x ** 2 + dragPoint.current.z ** 2);
        
        if (currentRadius > 0.0001) {
          dragPoint.current.x = (dragPoint.current.x / currentRadius) * orbitRadiusWorld;
          dragPoint.current.z = (dragPoint.current.z / currentRadius) * orbitRadiusWorld;
        }

        meshRef.current.position.set(dragPoint.current.x, 0, dragPoint.current.z);
      }
    },
    [camera, raycaster, gl],
  );

  const onPointerUp = useCallback((e: any) => {
    const controls = get().controls as any;
    if (controls) controls.enabled = true;
    if (!isDragging.current || !meshRef.current) return;
    isDragging.current = false;
    if (e.pointerId) e.target.releasePointerCapture(e.pointerId);
    gl.domElement.style.cursor = isOwnedByMe ? "grab" : "default";
    const { x, z } = meshRef.current.position;
    const newPos = cartesianToPolar(x / WORLD_SCALE, z / WORLD_SCALE, position.elevation);
    
    // Explicitly clamp radius in final state just to be safe
    newPos.radius = SpatialAudioEngine.getInstance().getSourcePosition().radius;
    
    onUpdatePosition(deviceId, newPos);
  }, [deviceId, position.elevation, onUpdatePosition, gl, isOwnedByMe, get]);

  const orbRadius = isMe ? 0.21 : 0.155;

  return (
    <group>
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

        {/* HTML billboard label */}
        <Html
          position={[0, 0, 0]}
          center
          style={{ pointerEvents: "none", userSelect: "none", zIndex: 10 }}
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
              fontSize: "10px", fontWeight: 700,
              color: "white", textShadow: "0 0 8px rgba(0,0,0,1)",
              whiteSpace: "nowrap",
            }}>
              {label.length > 15 ? label.slice(0, 15) + "..." : label}
            </span>
          </div>
        </Html>
      </Sphere>
    </group>
  );
}
