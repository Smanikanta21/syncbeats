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

import { useEffect, useMemo, useRef } from "react";
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
  /** Speaker angles, origin-relative — sizes the Ping-pong arc */
  speakerAngles: number[];
  /** Latest bass intensity, written from outside the Canvas */
  beatRef?: React.RefObject<number>;
}

export function OrbitTrail({ isPlaying, mode, speakerAngles, beatRef }: OrbitTrailProps) {
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
    <group>
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
