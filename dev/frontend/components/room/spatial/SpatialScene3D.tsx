"use client";

/**
 * SpatialScene3D.tsx
 *
 * The three.js stage.
 *
 * Takes the already-resolved {@link SpatialLayout} rather than raw participants:
 * labels, ownership and origin-relative coordinates are all computed once in
 * `lib/spatial/layout.ts`, so the renderer never re-derives them (and can't
 * disagree with the audio engine about them).
 *
 * Everything that reads the audio engine does so inside `useFrame` and mutates
 * object3D directly, so playback and dragging never cause a React re-render.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Html } from "@react-three/drei";
import * as THREE from "three";

import type { SpatialPosition } from "../../../lib/spatial/geometry";
import type { SpatialLayout } from "../../../lib/spatial/layout";
import { seatKey } from "../../../lib/spatial/layout";
import type { MotionMode } from "../../../lib/spatial/motion";
import { useDevicePerf } from "../../../hooks/useDevicePerf";

import { DeviceOrb } from "./DeviceOrb";
import { SeatMarker } from "./SeatMarker";
import { OrbitTrail } from "./OrbitTrail";
import { WORLD_SCALE } from "./world";

/** Compass labels — the difference between "somewhere" and "on my left". */
const BEARINGS: Array<{ label: string; x: number; z: number }> = [
  { label: "FRONT", x: 0, z: -3.1 * WORLD_SCALE },
  { label: "BACK", x: 0, z: 3.1 * WORLD_SCALE },
  { label: "LEFT", x: -3.1 * WORLD_SCALE, z: 0 },
  { label: "RIGHT", x: 3.1 * WORLD_SCALE, z: 0 },
];

export interface SpatialScene3DProps {
  layout: SpatialLayout;
  mode: "solo" | "room";
  motionMode: MotionMode;
  isPlaying: boolean;
  onPreviewPosition: (key: string, pos: SpatialPosition) => void;
  onCommitPosition: (key: string, pos: SpatialPosition) => void;
  /** Latest bass intensity, written outside the Canvas (React context does not
   *  cross the R3F reconciler, but refs and props do). */
  beatRef?: React.RefObject<number>;
  className?: string;
}

interface SceneProps extends Omit<SpatialScene3DProps, "className"> {
  highQuality: boolean;
}

function Scene({
  layout,
  mode,
  motionMode,
  isPlaying,
  onPreviewPosition,
  onCommitPosition,
  beatRef,
  highQuality,
}: SceneProps) {
  // My Space shows only your own gear; Room shows the whole crowd.
  const devices = useMemo(
    () => (mode === "solo" ? (layout.me?.devices ?? []) : layout.devices),
    [mode, layout],
  );
  const seats = useMemo(
    () => (mode === "solo" ? (layout.me ? [layout.me] : []) : layout.users),
    [mode, layout],
  );
  const speakerAngles = useMemo(() => devices.map(d => d.local.angle), [devices]);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[0, 6, 4]} intensity={0.6} />
      {highQuality && <pointLight position={[0, 2.5, 0]} intensity={0.35} color="#a78bfa" />}

      <Grid
        position={[0, -0.01, 0]}
        args={[16, 16]}
        cellSize={0.7}
        cellThickness={0.4}
        cellColor="#334155"
        sectionSize={3.5}
        sectionThickness={0.8}
        sectionColor="#1e3a5f"
        fadeDistance={9}
        fadeStrength={1.2}
        infiniteGrid
      />

      {/* Listening origin — you, in My Space; the room centre otherwise */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.04, 0.06, 24]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.5} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {BEARINGS.map(b => (
        <Html key={b.label} position={[b.x, 0, b.z]} center style={{ pointerEvents: "none", userSelect: "none" }}>
          <span
            style={{
              fontSize: "8px",
              fontWeight: 900,
              letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.22)",
              whiteSpace: "nowrap",
            }}
          >
            {b.label}
          </span>
        </Html>
      ))}

      <OrbitTrail
        isPlaying={isPlaying}
        mode={motionMode}
        speakerAngles={speakerAngles}
        beatRef={beatRef}
      />

      {seats.map(u => (
        <SeatMarker
          key={u.userId}
          userId={u.userId}
          displayName={u.displayName}
          initials={u.initials}
          position={u.seatLocal}
          isMe={u.isMe}
          // In My Space you *are* the origin, so there is nothing to drag.
          draggable={mode === "room" && u.isMe}
          seatKey={seatKey(u.userId)}
          onPreview={onPreviewPosition}
          onCommit={onCommitPosition}
        />
      ))}

      {devices.map(d => (
        <DeviceOrb
          key={d.deviceId}
          deviceId={d.deviceId}
          userId={d.userId}
          label={d.label}
          position={d.local}
          isMe={d.isMe}
          isOwnedByMe={d.isOwnedByMe}
          isPlaying={isPlaying}
          onPreview={onPreviewPosition}
          onCommit={onCommitPosition}
        />
      ))}

      <OrbitControls
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        minDistance={2.5}
        maxDistance={9}
        minPolarAngle={Math.PI / 8}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
        makeDefault
      />
    </>
  );
}

export function SpatialScene3D({ className, ...scene }: SpatialScene3DProps) {
  const { tier } = useDevicePerf();
  const highQuality = tier === "high";

  return (
    <Canvas
      className={className}
      camera={{ position: [0, 4.5, 5.5], fov: 45, near: 0.1, far: 60 }}
      gl={{ antialias: highQuality, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, highQuality ? 2 : 1.5]}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Scene {...scene} highQuality={highQuality} />
      </Suspense>
    </Canvas>
  );
}
