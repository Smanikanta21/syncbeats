"use client";

/**
 * SeatMarker.tsx
 *
 * Where a person is sitting. In My Space that's you, fixed at the centre. In
 * Room it's one marker per participant, and you can drag your own to match where
 * you actually are — which is what makes everyone else's devices land in
 * sensible default spots around them.
 */

import { useCallback, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { cartesianToPolar } from "../../../lib/spatial/geometry";
import type { SpatialPosition } from "../../../lib/spatial/geometry";
import { FLOOR_PLANE, polarToWorld, userHue, WORLD_SCALE } from "./world";

export interface SeatMarkerProps {
  userId: string;
  displayName: string;
  initials: string;
  /** Origin-relative seat position */
  position: SpatialPosition;
  isMe: boolean;
  draggable: boolean;
  onPreview: (key: string, pos: SpatialPosition) => void;
  onCommit: (key: string, pos: SpatialPosition) => void;
  /** Wire key for this seat (`seat:<userId>`) */
  seatKey: string;
}

export function SeatMarker({
  userId,
  displayName,
  initials,
  position,
  isMe,
  draggable,
  onPreview,
  onCommit,
  seatKey,
}: SeatMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const isDragging = useRef(false);
  const { camera, raycaster, gl, get } = useThree();

  const hue = useMemo(() => userHue(userId), [userId]);
  const color = useMemo(() => new THREE.Color(`hsl(${hue}, 65%, 55%)`), [hue]);
  const homePos = useMemo(() => polarToWorld(position), [position]);

  const dragPoint = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const ndc = useRef(new THREE.Vector2());
  const placed = useRef(false);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || isDragging.current) return;
    // Imperative, not a JSX prop — see the note in DeviceOrb.
    if (!placed.current) {
      group.position.copy(homePos);
      placed.current = true;
    } else {
      group.position.lerp(homePos, 0.12);
    }
  });

  const setControlsEnabled = useCallback(
    (on: boolean) => {
      const controls = get().controls as { enabled?: boolean } | null;
      if (controls) controls.enabled = on;
    },
    [get],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (!draggable) return;
      e.stopPropagation();
      isDragging.current = true;
      setControlsEnabled(false);
      (e.target as Element)?.setPointerCapture?.(e.pointerId);
      gl.domElement.style.cursor = "grabbing";
    },
    [draggable, setControlsEnabled, gl],
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

      const next = cartesianToPolar(dragPoint.current.x / WORLD_SCALE, dragPoint.current.z / WORLD_SCALE, 0);
      polarToWorld(next, target.current);
      group.position.copy(target.current);
      onPreview(seatKey, next);
    },
    [camera, raycaster, gl, onPreview, seatKey],
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
      gl.domElement.style.cursor = "default";
      onCommit(seatKey, cartesianToPolar(group.position.x / WORLD_SCALE, group.position.z / WORLD_SCALE, 0));
    },
    [onCommit, seatKey, gl, setControlsEnabled],
  );

  return (
    <group ref={groupRef}>
      {/* Floor disc marking the seat */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.004, 0]}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <circleGeometry args={[0.28, 40]} />
        <meshBasicMaterial color={color} transparent opacity={isMe ? 0.22 : 0.12} depthWrite={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.28, 0.31, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isMe ? 0.7 : 0.3}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Html position={[0, 0.16, 0]} center style={{ pointerEvents: "none", userSelect: "none" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "9999px",
              background: `hsl(${hue}, 60%, 30%)`,
              border: `1.5px solid hsl(${hue}, 80%, 65%)`,
              color: "white",
              fontSize: "10px",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 14px hsla(${hue}, 90%, 60%, 0.45)`,
              backdropFilter: "blur(4px)",
            }}
          >
            {initials}
          </div>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              color: "white",
              textShadow: "0 0 8px rgba(0,0,0,1)",
              whiteSpace: "nowrap",
            }}
          >
            {isMe ? "You" : displayName.length > 12 ? `${displayName.slice(0, 12)}…` : displayName}
          </span>
        </div>
      </Html>
    </group>
  );
}
