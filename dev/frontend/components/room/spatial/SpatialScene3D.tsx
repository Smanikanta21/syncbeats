"use client";

/**
 * SpatialScene3D.tsx
 *
 * The Three.js canvas that replaces the 2D CSS/SVG SpatialPanel map.
 *
 * Architecture:
 *  - <Canvas> from @react-three/fiber owns the WebGL renderer
 *  - OrbitControls (drei) lets users rotate/zoom the view
 *  - DeviceOrb per device — live gain-reactive glow, drag-to-reposition
 *  - OrbitTrail — animated virtual sound-source + particle trail
 *  - Bloom post-processing from @react-three/postprocessing
 *
 * Everything that reads the audio engine does so inside useFrame (no React
 * state), so dragging and music playback never cause a React re-render.
 */

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

import type { DeviceSpatialState } from "../../../lib/types";
import type { Participant } from "../../../lib/types";
import type { SpatialPosition } from "../../../lib/spatial/geometry";

import { DeviceOrb } from "./DeviceOrb";
import { OrbitTrail } from "./OrbitTrail";

// ── Scene content (inside Canvas) ────────────────────────────────────────────

interface SceneProps {
  deviceRows: DeviceRow[];
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
}

/** Enriched device entry computed outside the canvas (memo-friendly). */
interface DeviceRow {
  deviceId: string;
  userId: string;
  label: string;
  position: SpatialPosition;
  isMe: boolean;
  isOwnedByMe: boolean;
}

function Scene({ deviceRows, isPlaying, onUpdatePosition }: SceneProps) {
  return (
    <>
      {/* Ambient + directional fill lights */}
      <ambientLight intensity={0.3} />
      <directionalLight position={[0, 6, 4]} intensity={0.6} color="#ffffff" />

      {/* Floor grid */}
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

      {/* Listener marker — small ring at origin representing "the room centre" */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.09, 0.13, 48]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.55} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.22, 0.26, 48]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Orbit arc + virtual source */}
      <OrbitTrail isPlaying={isPlaying} />

      {/* Device orbs */}
      {deviceRows.map((d) => (
        <DeviceOrb
          key={d.deviceId}
          deviceId={d.deviceId}
          userId={d.userId}
          label={d.label}
          position={d.position}
          isMe={d.isMe}
          isOwnedByMe={d.isOwnedByMe}
          isPlaying={isPlaying}
          onUpdatePosition={onUpdatePosition}
        />
      ))}

      {/* Camera controller */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2.5}
        maxDistance={9}
        minPolarAngle={Math.PI / 8}  // don't go fully overhead
        maxPolarAngle={Math.PI / 2.1} // don't go below floor
        target={[0, 0, 0]}
        makeDefault
      />

      {/* Post-processing: Bloom for the glowing orbs */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.35}
          luminanceSmoothing={0.7}
          intensity={1.4}
          radius={0.7}
        />
      </EffectComposer>
    </>
  );
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface SpatialScene3DProps {
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  myDeviceId: string;
  myUserId?: string;
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
  className?: string;
}

export function SpatialScene3D({
  spatialDevices,
  participants,
  myDeviceId,
  myUserId,
  isPlaying,
  onUpdatePosition,
  className,
}: SpatialScene3DProps) {
  // Build enriched device rows from spatialDevices + participants (stable memo)
  const deviceRows: DeviceRow[] = useMemo(() => {
    return spatialDevices.map((sd) => {
      const p = participants.find((pp) => pp.socketId === sd.deviceId);
      const displayName = (p?.displayName ?? "").split("::")[0].trim() || "Device";
      const userId = p?.userId ?? sd.deviceId;
      const isMe = sd.deviceId === myDeviceId;
      const isOwnedByMe = p?.userId ? p.userId === myUserId : isMe;
      // Friendly short label (device name part after "::", or fallback)
      const devicePart = (p?.displayName ?? "").split("::")[1]?.trim();
      const label = devicePart && devicePart.length > 0 ? devicePart : displayName;
      return { deviceId: sd.deviceId, userId, label, position: sd.position, isMe, isOwnedByMe };
    });
  }, [spatialDevices, participants, myDeviceId, myUserId]);

  return (
    <Canvas
      className={className}
      camera={{ position: [0, 4.5, 5.5], fov: 45, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.5]}
      style={{ background: "transparent" }}
    >
      <Suspense fallback={null}>
        <Scene
          deviceRows={deviceRows}
          isPlaying={isPlaying}
          onUpdatePosition={onUpdatePosition}
        />
      </Suspense>
    </Canvas>
  );
}
