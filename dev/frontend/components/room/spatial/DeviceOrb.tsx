"use client";

/**
 * DeviceOrb.tsx
 *
 * One physical device, drawn as a speaker you can pick up and move.
 *
 * Two things matter here:
 *  - The puck sits at **its own** position. An earlier version overrode every
 *    device's radius with the sound source's orbit radius, which pinned them all
 *    to one ring and — because pointer-up wrote that back — permanently erased
 *    whatever distance you had chosen.
 *  - Everything per-frame mutates the object3D directly. Dragging talks to the
 *    audio engine and the socket via `onPreview`, never React, so moving a puck
 *    cannot re-render the room.
 */

import { memo, useRef, useMemo, useState, useCallback } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { SpatialAudioEngine } from "../../../audio/SpatialAudioEngine";
import { cartesianToPolar, GAIN_FLOOR, samePosition } from "../../../lib/spatial/geometry";
import type { SpatialPosition } from "../../../lib/spatial/geometry";
import { FLOOR_PLANE, polarToWorld, userHue, WORLD_SCALE } from "./world";

export interface DeviceOrbProps {
  deviceId: string;
  userId: string;
  label: string;
  /** Origin-relative position — the scene treats the listener as the centre */
  position: SpatialPosition;
  isMe: boolean;
  isOwnedByMe: boolean;
  isPlaying: boolean;
  /** Mid-drag, at pointer rate. Audio + socket only, no React state. */
  onPreview: (deviceId: string, pos: SpatialPosition) => void;
  /** Pointer-up. Commits to React state. */
  onCommit: (deviceId: string, pos: SpatialPosition) => void;
}

function DeviceOrbImpl({
  deviceId,
  userId,
  label,
  position,
  isMe,
  isOwnedByMe,
  isPlaying,
  onPreview,
  onCommit,
}: DeviceOrbProps) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const riserRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const isDragging = useRef(false);
  const { camera, raycaster, gl, get } = useThree();

  const hue = useMemo(() => userHue(userId), [userId]);
  const color = useMemo(() => new THREE.Color(`hsl(${hue}, 70%, 62%)`), [hue]);
  const emissiveColor = useMemo(() => new THREE.Color(`hsl(${hue}, 90%, 55%)`), [hue]);

  const homePos = useMemo(() => polarToWorld(position), [position]);

  // Scratch objects reused every frame — no per-frame allocation.
  const target = useRef(new THREE.Vector3());
  const dragPoint = useRef(new THREE.Vector3());
  const ndc = useRef(new THREE.Vector2());
  const placed = useRef(false);
  /** Elevation currently being rendered, so drags keep the height you set. */
  const liveElevation = useRef(position.elevation);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    const engine = SpatialAudioEngine.getInstance();

    // Glow tracks this device's live share of the mix — the payoff visual:
    // you watch the sound light up your Mac, then your phone.
    const gain = engine.getGain(deviceId);
    const normalised = (gain - GAIN_FLOOR) / (1 - GAIN_FLOOR);
    const targetIntensity = isPlaying ? 0.25 + Math.max(0, normalised) * 2.4 : 0.15;

    if (matRef.current) {
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(
        matRef.current.emissiveIntensity,
        targetIntensity,
        0.12,
      );
    }
    if (ringRef.current) {
      const mat = ringRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, isPlaying ? 0.2 + Math.max(0, normalised) * 0.6 : 0.15, 0.12);
      const s = 1 + Math.max(0, normalised) * 0.35;
      ringRef.current.scale.setScalar(THREE.MathUtils.lerp(ringRef.current.scale.x, s, 0.12));
    }

    // Ease toward the authoritative position, but never fight an active drag.
    // The position is *not* a JSX prop: a re-render would otherwise snap the
    // puck mid-ease, which is exactly the jitter this rewrite removes.
    if (!placed.current) {
      group.position.copy(homePos);
      placed.current = true;
    } else if (!isDragging.current) {
      group.position.lerp(homePos, 0.12);
    }

    // Riser line: from the floor up to wherever the puck currently is.
    if (riserRef.current) {
      const h = Math.max(0.001, group.position.y);
      riserRef.current.scale.y = h;
      riserRef.current.position.y = -h / 2;
    }
  });

  // ── Drag ───────────────────────────────────────────────────────────────────
  // Anyone can move any device. With two accounts in a room, gating on ownership
  // meant neither person could say where the *other* one was sitting — the whole
  // point of the map. `isOwnedByMe` now only affects how the orb looks.

  const setControlsEnabled = useCallback(
    (on: boolean) => {
      const controls = get().controls as { enabled?: boolean } | null;
      if (controls) controls.enabled = on;
    },
    [get],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      isDragging.current = true;
      liveElevation.current = position.elevation;
      setControlsEnabled(false);
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      gl.domElement.style.cursor = "grabbing";
    },
    [position.elevation, setControlsEnabled, gl],
  );

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const group = groupRef.current;
      if (!isDragging.current || !group) return;
      e.stopPropagation();

      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(
        ((e.nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc.current, camera);
      if (!raycaster.ray.intersectPlane(FLOOR_PLANE, dragPoint.current)) return;

      // Free placement on the floor; radius is clamped inside cartesianToPolar.
      const next = cartesianToPolar(
        dragPoint.current.x / WORLD_SCALE,
        dragPoint.current.z / WORLD_SCALE,
        liveElevation.current,
      );

      polarToWorld(next, target.current);
      group.position.copy(target.current);

      onPreview(deviceId, next);
    },
    [camera, raycaster, gl, deviceId, onPreview],
  );

  const endDrag = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      setControlsEnabled(true);
      const group = groupRef.current;
      if (!isDragging.current || !group) return;
      isDragging.current = false;

      if (e.pointerId !== undefined) {
        (e.target as Element)?.releasePointerCapture?.(e.pointerId);
      }
      gl.domElement.style.cursor = "grab";

      onCommit(
        deviceId,
        cartesianToPolar(
          group.position.x / WORLD_SCALE,
          group.position.z / WORLD_SCALE,
          liveElevation.current,
        ),
      );
    },
    [deviceId, onCommit, gl, setControlsEnabled],
  );

  const radius = isMe ? 0.2 : 0.15;

  return (
    <group ref={groupRef}>
      {/* Riser down to the floor — reads as height */}
      <mesh ref={riserRef} position={[0, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 1, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
      </mesh>

      {/* Gain ring — brightness and size follow this device's live level */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.5, radius * 1.85, 40]} />
        <meshBasicMaterial
          color={emissiveColor}
          transparent
          opacity={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerOver={() => {
          setHovered(true);
          if (!isDragging.current) gl.domElement.style.cursor = "grab";
        }}
        onPointerOut={() => {
          setHovered(false);
          if (!isDragging.current) gl.domElement.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[radius, 28, 28]} />
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={0.25}
          metalness={0.15}
          roughness={0.28}
        />
      </mesh>

      {/* Other people's device names show on hover only. `<Html>` labels don't
          depth-sort or occlude, so a room of four turned the stage into a wall of
          overlapping text drawn over whatever was in front of it. Your own gear
          stays labelled, and everyone else's orb is already colour-matched to
          their seat avatar. */}
      {(isOwnedByMe || hovered) && (
        <Html position={[0, radius + 0.13, 0]} center style={{ pointerEvents: "none", userSelect: "none" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1px" }}>
            {isMe && (
              <span
                style={{
                  fontSize: "8px",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  color: `hsl(${hue}, 85%, 72%)`,
                  textTransform: "uppercase",
                  textShadow: "0 0 6px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                This device
              </span>
            )}
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "white",
                textShadow: "0 0 8px rgba(0,0,0,1)",
                whiteSpace: "nowrap",
              }}
            >
              {label.length > 15 ? `${label.slice(0, 15)}…` : label}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/** Same reason as {@link SeatMarker}'s: a remote drag must not reconcile the room. */
export const DeviceOrb = memo(
  DeviceOrbImpl,
  (a, b) =>
    a.deviceId === b.deviceId &&
    a.userId === b.userId &&
    a.label === b.label &&
    a.isMe === b.isMe &&
    a.isOwnedByMe === b.isOwnedByMe &&
    a.isPlaying === b.isPlaying &&
    a.onPreview === b.onPreview &&
    a.onCommit === b.onCommit &&
    samePosition(a.position, b.position),
);
