"use client";

/**
 * AmbientField
 *
 * The landing page's background: a full-bleed WebGL interference field plus the
 * writer for the `--accent-*` custom properties.
 *
 * Both jobs live here because they are the same clock. The palette walk is a
 * pure function of elapsed time (`accentAt`), so the shader uniforms and the CSS
 * properties are always the same colour — the previous arrangement had the
 * palette private to MouseGradient and the accent properties written by nobody,
 * which is why every `var(--accent-color)` on the page sat frozen on its
 * emerald fallback.
 *
 * What the shader draws: five wave sources with scattered phases. As `alignment`
 * goes 0 -> 1 the sources draw in and their phase offsets collapse to a shared
 * one, so smeared moire resolves into clean concentric bands. That is the
 * product's actual mechanism, not a decorative loop — see `useRoom.ts`.
 *
 * Replaces MouseGradient: three 55vw divs under `blur(80px)` cost more on a
 * mid-range phone than one fragment shader, and none of them meant anything.
 */

import { useEffect, useMemo, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useReducedMotion } from "framer-motion";
import * as THREE from "three";

import { accentAt, accentClock, startAccentVars, toRgb01 } from "../../lib/accent";
import { useDevicePerf } from "../../hooks/useDevicePerf";
import { useAlignment } from "../../context/SyncScrollContext";
import { AccentEngine } from "./AccentEngine";

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uAlign;   // 0 = clocks adrift, 1 = locked
  uniform float uAspect;
  uniform vec3  uA;       // accent primary
  uniform vec3  uB;       // accent far stop
  uniform float uDark;    // 0 light theme, 1 dark

  #define SOURCES 5
  #define GOLDEN 2.39996

  void main() {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

    float field = 0.0;
    for (int i = 0; i < SOURCES; i++) {
      float fi = float(i);
      // Sources ring the frame while adrift and draw toward the centre as the
      // room locks, so convergence reads spatially as well as in the phase.
      float a = fi * GOLDEN;
      vec2  c = vec2(cos(a), sin(a)) * mix(0.66, 0.18, uAlign);
      // The golden angle keeps the five offsets maximally unlike each other,
      // which is what makes the adrift state look genuinely uncorrelated
      // rather than like one wave with a wobble.
      float phase = mix(fi * GOLDEN, 0.0, uAlign);
      float d = length(p - c);
      field += sin(d * mix(15.0, 27.0, uAlign) - uTime * 0.85 + phase);
    }
    field /= float(SOURCES);

    // Locked, crests are allowed their full contrast; adrift, they stay muddy.
    float band = smoothstep(-0.3, 0.9, field);
    band *= mix(0.6, 1.0, uAlign);

    float vign = 1.0 - smoothstep(0.12, 0.8, length(p));
    vec3 col = mix(uB, uA, band);

    gl_FragColor = vec4(col, band * vign * mix(0.26, 0.42, uDark));
  }
`;

function Field({ dark }: { dark: boolean }) {
  const { viewport } = useThree();
  const alignment = useAlignment();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAlign: { value: alignment.get() },
      uAspect: { value: 1 },
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3() },
      uDark: { value: dark ? 1 : 0 },
    }),
    // Built once; every field below is mutated in place from useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    uniforms.uDark.value = dark ? 1 : 0;
  }, [dark, uniforms]);

  useFrame(({ size }) => {
    const u = uniforms;
    // Shared clock, not this canvas's own — see accentClock().
    const t = accentClock();
    const accent = accentAt(t);

    u.uTime.value = t;
    u.uAlign.value = alignment.get();
    u.uAspect.value = size.width / size.height;
    u.uA.value.fromArray(toRgb01(accent.hsl));
    u.uB.value.fromArray(toRgb01(accent.hslB));
  });

  return (
    <mesh scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/** One probe, cached: R3F throws rather than degrades if WebGL is unavailable. */
let webglOk: boolean | null = null;
function hasWebGL() {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    webglOk = !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

/**
 * The no-WebGL / reduced-motion / low-tier path is AccentEngine's fluid blobs:
 * transform-only framer work reading the same accent properties, so the page
 * stays on palette with no per-frame shader.
 */
export function AmbientField() {
  const reduced = useReducedMotion();
  const { tier } = useDevicePerf();
  const [mounted, setMounted] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => setMounted(true), []);

  // Theme lives on a data attribute (see the `dark` custom variant in
  // globals.css), so read it rather than duplicating next-themes' state.
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.theme === "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const useGL = mounted && !reduced && tier !== "low" && hasWebGL();

  // One writer for the accent properties, regardless of which path renders.
  // The shader reads the same clock for its uniforms rather than writing them.
  useEffect(() => startAccentVars(!!reduced), [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {useGL ? (
        <Canvas
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
          dpr={[1, tier === "high" ? 1.75 : 1.25]}
          style={{ background: "transparent" }}
        >
          <Field dark={dark} />
        </Canvas>
      ) : (
        <AccentEngine reduced={!!reduced} />
      )}
    </div>
  );
}
