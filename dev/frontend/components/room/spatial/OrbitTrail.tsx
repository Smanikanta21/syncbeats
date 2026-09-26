"use client";

/**
 * OrbitTrail.tsx
 *
 * The virtual sound source: a glowing orb, a fading trail behind it, and the
 * path it is travelling.
 *
 * Reads the source position straight off the engine every frame — no React state
 * — so this stays in exact agreement with the audio and with every other device
 * in the room (the engine derives position from the synced server clock).
 *
 * The path shape follows the motion mode: a full ring for Orbit, just the swept
 * arc for Ping-pong, nothing for Beat (where the sound teleports rather than
 * travels). Geometry is built once per mode change and *scaled* per frame — an
 * earlier version rebuilt a RingGeometry on almost every frame as the radius
 * eased.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SpatialAudioEngine } from "../../../audio/SpatialAudioEngine";
import { pingPongArc, type MotionMode } from "../../../lib/spatial/motion";
import { polarToWorld, WORLD_SCALE } from "./world";

const TRAIL_LEN = 26;
const SOURCE_COLOR = "#a78bfa";

interface OrbitTrailProps {
  isPlaying: boolean;
  mode: MotionMode;
  /** Speaker angles, field-relative — sizes the Ping-pong arc */
  speakerAngles: number[];
  /**
   * Where the field origin sits in the view, in world units. The sound orbits
   * the field origin; the scene is drawn from your seat. In Room mode those are
   * different points, so everything in here is offset by the gap rather than
   * each piece converting frames on its own.
   */
  centre: [number, number, number];
  /** Latest bass intensity, written from outside the Canvas */
  beatRef?: React.RefObject<number>;
}

function OrbitTrailImpl({ isPlaying, mode, speakerAngles, centre, beatRef }: OrbitTrailProps) {
  const orbRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const pathRef = useRef<THREE.Mesh>(null);

  const scratch = useRef(new THREE.Vector3());

  // ── Path geometry: rebuilt only when the arc changes ───────────────────────

  /**
   * three.js RingGeometry measures theta from +x counter-clockwise in its local
   * XY plane. Rotated -90° about X, local (u, v) lands at world (u, 0, -v), so
   * our angle `a` (0 = front = -z) corresponds to theta = π/2 - a.
   */
  const arc = useMemo(() => {
    if (mode === "pingpong") {
      const { start, span } = pingPongArc(speakerAngles);
      return { thetaStart: Math.PI / 2 - (start + span), thetaLength: span };
    }
    return { thetaStart: 0, thetaLength: Math.PI * 2 };
  }, [mode, speakerAngles]);

  // Unit-radius ring, scaled to the live orbit radius each frame.
  const pathGeometry = useMemo(
    () => new THREE.RingGeometry(0.988, 1.012, 96, 1, arc.thetaStart, arc.thetaLength),
    [arc.thetaStart, arc.thetaLength],
  );
  useEffect(() => () => pathGeometry.dispose(), [pathGeometry]);

  // ── Trail: one preallocated buffer, shifted each frame ─────────────────────

  const trail = useMemo(() => {
    const positions = new Float32Array(TRAIL_LEN * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: SOURCE_COLOR,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    return { line: new THREE.Line(geometry, material), positions, geometry, material, primed: false };
  }, []);

  useEffect(
    () => () => {
      trail.geometry.dispose();
      trail.material.dispose();
    },
    [trail],
  );

  useFrame(() => {
    const engine = SpatialAudioEngine.getInstance();
    const source = engine.getSourcePosition();
    polarToWorld(source, scratch.current);

    const beat = beatRef?.current ?? 0;

    if (orbRef.current) {
      orbRef.current.position.copy(scratch.current);
      const s = isPlaying ? 1 + beat * 0.7 : 0.7;
      orbRef.current.scale.setScalar(THREE.MathUtils.lerp(orbRef.current.scale.x, s, 0.18));
    }
    if (glowRef.current) {
      glowRef.current.position.copy(scratch.current);
      const mat = glowRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, isPlaying ? 0.18 + beat * 0.3 : 0.05, 0.15);
      const s = isPlaying ? 1 + beat * 1.1 : 0.8;
      glowRef.current.scale.setScalar(THREE.MathUtils.lerp(glowRef.current.scale.x, s, 0.15));
    }

    // Trail — shift back one slot, write the head.
    const p = trail.positions;
    if (!trail.primed) {
      for (let i = 0; i < TRAIL_LEN; i++) {
        p[i * 3] = scratch.current.x;
        p[i * 3 + 1] = scratch.current.y;
        p[i * 3 + 2] = scratch.current.z;
      }
      trail.primed = true;
    } else {
      p.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
      p[0] = scratch.current.x;
      p[1] = scratch.current.y;
      p[2] = scratch.current.z;
    }
    trail.geometry.attributes.position.needsUpdate = true;
    trail.material.opacity = isPlaying && mode !== "beat" ? 0.45 : 0;

    // Path ring follows the orbit radius.
    if (pathRef.current) {
      const r = source.radius * WORLD_SCALE;
      pathRef.current.scale.set(
        THREE.MathUtils.lerp(pathRef.current.scale.x, r, 0.08),
        THREE.MathUtils.lerp(pathRef.current.scale.y, r, 0.08),
        1,
      );
      const mat = pathRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, isPlaying ? 0.22 : 0.08, 0.1);
    }
  });

  return (
    <group position={centre}>
      {/* Path the source travels — hidden in Beat mode, where it jumps */}
      {mode !== "beat" && (
        <mesh
          ref={pathRef}
          geometry={pathGeometry}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.002, 0]}
          scale={[1, 1, 1]}
        >
          <meshBasicMaterial
            color={SOURCE_COLOR}
            transparent
            opacity={0.2}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      <primitive object={trail.line} />

      {/* Soft halo */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshBasicMaterial color={SOURCE_COLOR} transparent opacity={0.18} depthWrite={false} />
      </mesh>

      {/* The source itself */}
      <mesh ref={orbRef}>
        <sphereGeometry args={[0.085, 22, 22]} />
        <meshBasicMaterial color="#ede9fe" />
      </mesh>
    </group>
  );
}

/**
 * `speakerAngles` is rebuilt from the layout on every `spatial:update`, so by
 * reference it changes ~20×/s while anyone drags — which re-rendered the trail
 * and re-ran the Ping-pong arc memo for values that were usually identical.
 * Compared element-wise instead.
 */
export const OrbitTrail = memo(
  OrbitTrailImpl,
  (a, b) =>
    a.isPlaying === b.isPlaying &&
    a.mode === b.mode &&
    a.beatRef === b.beatRef &&
    a.centre[0] === b.centre[0] &&
    a.centre[1] === b.centre[1] &&
    a.centre[2] === b.centre[2] &&
    a.speakerAngles.length === b.speakerAngles.length &&
    a.speakerAngles.every((v, i) => v === b.speakerAngles[i]),
);
