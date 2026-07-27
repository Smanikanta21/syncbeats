import React, { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { useTheme } from "next-themes";
import { useSyncInfo } from "../context/SyncContext";
import { useSettings } from "../hooks/useSettings";

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG OVERLAY — toggle with the `showDebug` prop or via keyboard shortcut (Shift+D in dev)
// Shows per-band raw energy, normalized energy, threshold, and onset/masked state
// ─────────────────────────────────────────────────────────────────────────────
const BAND_LABELS = ["Sub", "Bass", "Lo-Mid", "Mid", "Hi-Mid", "High"];

function hexToHue(hex: string): number {
  if (!hex) return 0;
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return Math.round(h * 360);
}

function DebugOverlay({
  debugData,
}: {
  debugData: React.MutableRefObject<{
    rawEnergy: number[];
    normEnergy: number[];
    threshold: number[];
    onset: boolean[];
    masked: boolean[];
    sparseMode: boolean;
    dominantBand: number;
  }>;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const d = debugData.current;
  return (
    <div
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: 11,
        padding: "8px 12px",
        borderRadius: 8,
        pointerEvents: "none",
        lineHeight: 1.6,
      }}
    >
      <div style={{ fontWeight: "bold", marginBottom: 4, color: "#0ff" }}>
        🎵 Ambient Engine Debug {d.sparseMode ? "| SPARSE MODE 🌙" : "| BEAT MODE 🥁"}
        {" | Dominant: "}
        <span style={{ color: "#ff0" }}>{BAND_LABELS[d.dominantBand] ?? "—"}</span>
      </div>
      {BAND_LABELS.map((label, i) => {
        const isOnset = d.onset[i];
        const isMasked = d.masked[i];
        const color = isOnset ? "#0f0" : isMasked ? "#f80" : "#888";
        return (
          <div key={label} style={{ color }}>
            {label.padEnd(6)} raw:{(d.rawEnergy[i] ?? 0).toFixed(3)}{" "}
            norm:{(d.normEnergy[i] ?? 0).toFixed(3)}{" "}
            thr:{(d.threshold[i] ?? 0).toFixed(3)}{" "}
            {isOnset ? "ONSET" : isMasked ? "masked" : "idle  "}
          </div>
        );
      })}
    </div>
  );
}

export function AmbientBackground({
  syncWithAudio = false,
  isRoomPlaying: isRoomPlayingProp = false,
  showDebug = false,
}: {
  syncWithAudio?: boolean;
  isRoomPlaying?: boolean;
  showDebug?: boolean;
}) {
  const blobSubRef = useRef<HTMLDivElement>(null);
  const blobBassRef = useRef<HTMLDivElement>(null);
  const blobLowMidRef = useRef<HTMLDivElement>(null);
  const blobMidRef = useRef<HTMLDivElement>(null);
  const blobUpperMidRef = useRef<HTMLDivElement>(null);
  const blobHighRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme } = useTheme();
  const { settings } = useSettings();
  const [mounted, setMounted] = useState(false);
  const [keyDebug, setKeyDebug] = useState(false);

  // Keyboard shortcut listener: Press Shift+D in development mode to toggle debug HUD on the fly
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
        e.preventDefault();
        setKeyDebug((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDev = process.env.NODE_ENV === "development";
  const isDebugActive = isDev && (showDebug || !!settings.showDebugAudio || keyDebug);

  // Debug state written every frame, read by DebugOverlay at 10fps
  const debugDataRef = useRef({
    rawEnergy: [0, 0, 0, 0, 0, 0],
    normEnergy: [0, 0, 0, 0, 0, 0],
    threshold: [0, 0, 0, 0, 0, 0],
    onset: [false, false, false, false, false, false],
    masked: [false, false, false, false, false, false],
    sparseMode: false,
    dominantBand: 0,
  });

  const burstMultiplierRef = useRef(1.0);
  const smoothAutoBrightnessRef = useRef(1.0);
  const smoothAutoContrastRef = useRef(1.0);

  // Listen for welcome burst event on room join or user entry
  useEffect(() => {
    const handleBurst = () => {
      burstMultiplierRef.current = 2.4; // Welcoming surge of higher beats!
    };
    window.addEventListener("syncbeats:welcome-burst", handleBurst);
    return () => window.removeEventListener("syncbeats:welcome-burst", handleBurst);
  }, []);

  const isDark = mounted ? resolvedTheme !== "light" : true;

  // Conditionally get audio context
  let audioContext: ReturnType<typeof useAudio> | null = null;
  let isRoomPlaying = false;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    if (syncWithAudio) {
      audioContext = useAudio();
      // eslint-disable-next-line react-hooks/rules-of-hooks
      isRoomPlaying = useSyncInfo().isRoomPlaying;
    }
  } catch {
    // Ignore error if not wrapped in AudioProvider/SyncProvider
  }

  const isPlaying = isRoomPlayingProp || isRoomPlaying || (audioContext?.isPlaying ?? false);

  // Theme-adaptive values
  const blendMode = isDark ? "screen" : "multiply";
  const bMult = (settings.ambientBrightness || 100) / 100;
  const cMult = (settings.ambientContrast || 100) / 100;

  const baseOpacity = (isDark ? [0.25, 0.22, 0.22] : [0.35, 0.30, 0.30]).map((v) => v * bMult);
  const peakOpacity = (isDark ? [0.85, 0.80, 0.80] : [0.95, 0.90, 0.90]).map((v) => v * bMult);

  const adjustSat = (base: number) => Math.min(100, base * Math.pow(cMult, 1.2));
  const adjustLight = (base: number) => {
    if (cMult === 1) return base;
    return base + (50 - base) * (1 - 1 / cMult);
  };

  const bassSat = adjustSat(isDark ? 85 : 75);
  const bassLight = adjustLight(isDark ? 55 : 50);
  const midSat = adjustSat(isDark ? 80 : 70);
  const midLight = adjustLight(isDark ? 50 : 42);
  const highSat = adjustSat(isDark ? 75 : 70);
  const highLight = adjustLight(isDark ? 55 : 48);

  // ─────────────────────────────────────────────────────────────────────────
  // DIRECT 1:1 NODE RESOLUTION
  // Read exact node count, exact hex colors, and exact 2D positions from settings.gradientSettings.nodes
  // ─────────────────────────────────────────────────────────────────────────
  const nodes = settings.gradientSettings?.nodes || [
    { id: "1", color: "#8b5cf6", position: 0, x: 20, y: 35 },
    { id: "2", color: "#ec4899", position: 50, x: 80, y: 35 },
    { id: "3", color: "#3b82f6", position: 100, x: 50, y: 75 }
  ];
  const lightCount = nodes.length;

  const bandMappings: Record<number, { bandIndex: number; name: "sub" | "bass" | "lowMid" | "mid" | "upperMid" | "high" }[]> = {
    2: [
      { bandIndex: 1, name: "bass" },
      { bandIndex: 5, name: "high" }
    ],
    3: [
      { bandIndex: 1, name: "bass" },
      { bandIndex: 3, name: "mid" },
      { bandIndex: 5, name: "high" }
    ],
    4: [
      { bandIndex: 0, name: "sub" },
      { bandIndex: 1, name: "bass" },
      { bandIndex: 3, name: "mid" },
      { bandIndex: 5, name: "high" }
    ],
    5: [
      { bandIndex: 0, name: "sub" },
      { bandIndex: 1, name: "bass" },
      { bandIndex: 3, name: "mid" },
      { bandIndex: 4, name: "upperMid" },
      { bandIndex: 5, name: "high" }
    ],
    6: [
      { bandIndex: 0, name: "sub" },
      { bandIndex: 1, name: "bass" },
      { bandIndex: 2, name: "lowMid" },
      { bandIndex: 3, name: "mid" },
      { bandIndex: 4, name: "upperMid" },
      { bandIndex: 5, name: "high" }
    ]
  };

  const currentMapping = bandMappings[lightCount] || bandMappings[3];
  const activeBands = currentMapping.map((m) => m.name);

  // Derive node hues and 2D positions directly from settings.gradientSettings.nodes
  const nodeHues: Record<string, number> = {
    sub: 320,
    bass: 0,
    lowMid: 40,
    mid: 120,
    upperMid: 200,
    high: 280,
  };
  const nodePositions: Record<string, { x: number; y: number }> = {
    sub: { x: 50, y: 15 },
    bass: { x: 18, y: 38 },
    lowMid: { x: 18, y: 68 },
    mid: { x: 82, y: 38 },
    upperMid: { x: 82, y: 68 },
    high: { x: 50, y: 85 },
  };

  currentMapping.forEach((m, idx) => {
    const node = nodes[idx] || nodes[0];
    nodeHues[m.name] = hexToHue(node.color);
    nodePositions[m.name] = {
      x: node.x ?? nodePositions[m.name].x,
      y: node.y ?? nodePositions[m.name].y,
    };
  });

  useEffect(() => {
    if (!syncWithAudio && !isRoomPlayingProp) return;

    let rafId: number;
    const getRawAudioData = audioContext?.getRawAudioData;

    // ═══════════════════════════════════════════════════════════════════════
    // PER-BAND STATE
    // ═══════════════════════════════════════════════════════════════════════
    const smoothed = [0, 0, 0, 0, 0, 0];
    const ambientLevel = [0, 0, 0, 0, 0, 0];
    const prevEnergy = [0, 0, 0, 0, 0, 0];
    const peakHold = [0, 0, 0, 0, 0, 0];

    const rollingMin = [1, 1, 1, 1, 1, 1];
    const rollingMax = [0, 0, 0, 0, 0, 0];
    const NORM_MIN_DECAY = 0.9998;
    const NORM_MAX_DECAY = 0.9990;

    const fluxAvg = [0.02, 0.02, 0.02, 0.02, 0.02, 0.02];
    const FLUX_AVG_DECAY = 0.95;
    const FLUX_AVG_RISE  = 0.05;

    const maskEngageThreshold  = 0.55;
    const maskReleaseThreshold = 0.40;
    const maskActive = [false, false, false, false, false, false];

    const bandOnsetAccum = [0, 0, 0, 0, 0, 0];
    const DOMINANT_DECAY = 0.9985;
    let dominantBand = 1;

    let lastOnsetTime = performance.now();
    let sparseMode = false;
    const SPARSE_THRESHOLD_MS = 2000;

    const ambSmooth   = [0.005, 0.006, 0.018, 0.022, 0.032, 0.038];
    const ambCeiling  = [0.07,  0.09,  0.38,  0.42,  0.18,  0.14 ];
    const ambExp      = [3.2,   3.0,   1.5,   1.4,   1.9,   2.1  ];

    const onsetGain   = [18,    16,    8,     7,     13,    11   ];
    const decayPerSecond = [0.12, 0.15, 0.28, 0.30, 0.20, 0.18 ];
    const threshScale  = [1.8,   1.8,   3.2,   3.2,   2.0,   1.8  ];

    const posX = [nodePositions.sub.x, nodePositions.bass.x, nodePositions.lowMid.x, nodePositions.mid.x, nodePositions.upperMid.x, nodePositions.high.x];
    const posY = [nodePositions.sub.y, nodePositions.bass.y, nodePositions.lowMid.y, nodePositions.mid.y, nodePositions.upperMid.y, nodePositions.high.y];
    const targetPosX = [...posX];
    const targetPosY = [...posY];
    let lastWanderTime = performance.now();

    let prevTimestamp = performance.now();

    const animate = (timestamp: number) => {
      rafId = requestAnimationFrame(animate);

      const deltaMs = Math.min(100, timestamp - prevTimestamp);
      prevTimestamp = timestamp;

      const blobSub = blobSubRef.current;
      const blobBass = blobBassRef.current;
      const blobLowMid = blobLowMidRef.current;
      const blobMid = blobMidRef.current;
      const blobUpperMid = blobUpperMidRef.current;
      const blobHigh = blobHighRef.current;

      const data = getRawAudioData ? getRawAudioData() : null;
      const now = timestamp;

      let sub = 0, bass = 0, lowMids = 0, mids = 0, upperMids = 0, highs = 0;

      if (data && data.length > 60) {
        let subSum = 0;
        for (let i = 0; i <= 4; i++) subSum += data[i];
        sub = subSum / 5 / 255;

        let bassSum = 0;
        for (let i = 5; i <= 12; i++) bassSum += data[i];
        bass = bassSum / 8 / 255;

        let lowMidSum = 0;
        for (let i = 13; i <= 24; i++) lowMidSum += data[i];
        lowMids = lowMidSum / 12 / 255;

        let midSum = 0;
        for (let i = 25; i <= 48; i++) midSum += data[i];
        mids = midSum / 24 / 255;

        let upperMidSum = 0;
        for (let i = 49; i <= 80; i++) upperMidSum += data[i];
        upperMids = upperMidSum / 32 / 255;

        let highSum = 0;
        for (let i = 81; i <= Math.min(180, data.length - 1); i++) highSum += data[i];
        highs = highSum / Math.min(100, data.length - 81) / 255;
      }

      const rawValues = [sub, bass, lowMids, mids, upperMids, highs];

      // Synthetic beat pulse when room is playing but no local audio element is playing (e.g. landing page)
      if (isPlaying && rawValues.every((v) => v < 0.01)) {
        const bpm = 124;
        const msPerBeat = 60000 / bpm;
        const phase = (timestamp % msPerBeat) / msPerBeat;

        const kickPulse = Math.pow(Math.max(0, 1 - phase * 2.2), 3);
        const offPhase = ((timestamp + msPerBeat / 2) % msPerBeat) / msPerBeat;
        const hatPulse = Math.pow(Math.max(0, 1 - offPhase * 3), 2.5);

        rawValues[0] = kickPulse * 0.85 + Math.sin(timestamp * 0.003) * 0.12;
        rawValues[1] = kickPulse * 0.90 + Math.cos(timestamp * 0.004) * 0.10;
        rawValues[2] = hatPulse * 0.50 + Math.sin(timestamp * 0.005) * 0.15;
        rawValues[3] = hatPulse * 0.60 + Math.sin(timestamp * 0.002) * 0.20;
        rawValues[4] = hatPulse * 0.70 + Math.cos(timestamp * 0.006) * 0.18;
        rawValues[5] = hatPulse * 0.65 + Math.sin(timestamp * 0.007) * 0.15;
      }

      // Smooth decay of welcome burst multiplier back down to 1.0 over ~2.5 seconds
      if (burstMultiplierRef.current > 1.0) {
        burstMultiplierRef.current = Math.max(1.0, burstMultiplierRef.current - deltaMs * 0.0006);
      }
      const burst = burstMultiplierRef.current;
      for (let i = 0; i < 6; i++) {
        rawValues[i] *= (0.7 + burst * 0.3);
      }

      const rawOnset = [0, 0, 0, 0, 0, 0];
      const normValues = [0, 0, 0, 0, 0, 0];
      const thresholdValues = [0, 0, 0, 0, 0, 0];
      const onsetState = [false, false, false, false, false, false];

      for (let i = 0; i < 6; i++) {
        const raw = rawValues[i];

        rollingMin[i] = Math.min(rollingMin[i] * NORM_MIN_DECAY + raw * (1 - NORM_MIN_DECAY), raw * 0.95);
        rollingMax[i] = Math.max(rollingMax[i] * NORM_MAX_DECAY, raw);
        const range = rollingMax[i] - rollingMin[i];
        const epsilon = 0.001;
        const normRaw = range > epsilon ? (raw - rollingMin[i]) / (range + epsilon) : 0;
        normValues[i] = Math.max(0, Math.min(1, normRaw));

        ambientLevel[i] += (normValues[i] - ambientLevel[i]) * ambSmooth[i];

        const flux = Math.max(0, normValues[i] - prevEnergy[i]);

        const threshold = fluxAvg[i] * threshScale[i] + 0.004;
        thresholdValues[i] = threshold;
        const isOnset = flux > threshold;
        onsetState[i] = isOnset;

        if (isOnset) {
          const onsetSignal = Math.min(1, Math.sqrt(flux * onsetGain[i]));
          peakHold[i] += (onsetSignal - peakHold[i]) * 0.85;
          lastOnsetTime = now;
          bandOnsetAccum[i] += onsetSignal;
        }

        const decayThisFrame = Math.pow(decayPerSecond[i], deltaMs / 1000);
        peakHold[i] *= decayThisFrame;
        if (peakHold[i] < 0.005) peakHold[i] = 0;

        fluxAvg[i] = fluxAvg[i] * FLUX_AVG_DECAY + flux * FLUX_AVG_RISE;
        prevEnergy[i] = prevEnergy[i] * 0.5 + normValues[i] * 0.5;
      }

      let maxOnset = 0;
      for (let i = 0; i < 6; i++) if (rawOnset[i] > maxOnset) maxOnset = rawOnset[i];

      for (let i = 0; i < 6; i++) bandOnsetAccum[i] *= DOMINANT_DECAY;
      let maxAccum = 0;
      for (let i = 0; i < 6; i++) if (bandOnsetAccum[i] > maxAccum) { maxAccum = bandOnsetAccum[i]; dominantBand = i; }

      const bandDominance = bandOnsetAccum.map((v) => maxAccum > 0.001 ? v / maxAccum : 0);
      const bassDominance   = Math.max(bandDominance[0], bandDominance[1]);
      const trebleDominance = Math.max(bandDominance[4], bandDominance[5]);

      const maskedState = [false, false, false, false, false, false];

      for (let i = 0; i < 6; i++) {
        const onset = peakHold[i];
        const ambient = Math.pow(ambientLevel[i], ambExp[i]) * ambCeiling[i];

        const dominanceOfThisBand = bandDominance[i];

        if (dominanceOfThisBand < maskReleaseThreshold && bassDominance > maskEngageThreshold && (i >= 4)) {
          maskActive[i] = true;
        }
        if (dominanceOfThisBand < maskReleaseThreshold && trebleDominance > maskEngageThreshold && bassDominance < 0.3 && (i <= 1)) {
          maskActive[i] = true;
        }
        if (dominanceOfThisBand >= maskReleaseThreshold || bassDominance < maskReleaseThreshold) {
          maskActive[i] = false;
        }

        maskedState[i] = maskActive[i];
        const suppressionFactor = maskActive[i] ? 0.08 : 1.0;

        smoothed[i] = isPlaying ? Math.max(ambient, onset * suppressionFactor) : 0;
      }

      if (!isPlaying) {
        for (let i = 0; i < 6; i++) {
          smoothed[i] = 0;
        }
      }

      const timeSinceOnset = now - lastOnsetTime;
      sparseMode = timeSinceOnset > SPARSE_THRESHOLD_MS;

      if (sparseMode) {
        const rms = Math.sqrt(rawValues.reduce((s, v) => s + v * v, 0) / 6);
        for (let i = 0; i < 6; i++) {
          smoothed[i] = Math.pow(rms, 2.0) * ambCeiling[i] * 0.8;
        }
      }

      debugDataRef.current = {
        rawEnergy: [...rawValues],
        normEnergy: [...normValues],
        threshold: [...thresholdValues],
        onset: [...onsetState],
        masked: [...maskedState],
        sparseMode,
        dominantBand,
      };

      if (now - lastWanderTime > 2500) {
        lastWanderTime = now;
        const wanderRadius = 15;
        for (let i = 0; i < 6; i++) {
          const baseX = [nodePositions.sub.x, nodePositions.bass.x, nodePositions.lowMid.x, nodePositions.mid.x, nodePositions.upperMid.x, nodePositions.high.x][i];
          const baseY = [nodePositions.sub.y, nodePositions.bass.y, nodePositions.lowMid.y, nodePositions.mid.y, nodePositions.upperMid.y, nodePositions.high.y][i];
          const energy = smoothed[i];
          const r = wanderRadius * (0.5 + energy * 1.5);
          targetPosX[i] = Math.max(5, Math.min(95, baseX + (Math.random() * r * 2 - r)));
          targetPosY[i] = Math.max(5, Math.min(95, baseY + (Math.random() * r * 2 - r)));
        }
      }

      for (let i = 0; i < 6; i++) {
        const lerpSpeed = 0.012 + smoothed[i] * 0.008;
        posX[i] += (targetPosX[i] - posX[i]) * lerpSpeed;
        posY[i] += (targetPosY[i] - posY[i]) * lerpSpeed;
      }

      // ── Real-Time Auto Brightness & Contrast Engine (Bass Glow & Treble Contrast Flow) ──
      const bassPunch = Math.pow(Math.max(smoothed[0], smoothed[1]), 1.3);
      const trebleFlow = Math.pow(Math.max(smoothed[4], smoothed[5]), 1.2);

      const targetAutoBrightness = isPlaying ? 1.0 + bassPunch * 1.35 : 1.0;
      const targetAutoContrast = isPlaying ? 1.0 + trebleFlow * 0.85 : 1.0;

      // Viscous exponential low-pass filter for silky liquid transitions
      smoothAutoBrightnessRef.current += (targetAutoBrightness - smoothAutoBrightnessRef.current) * 0.08;
      smoothAutoContrastRef.current += (targetAutoContrast - smoothAutoContrastRef.current) * 0.08;

      const autoBright = smoothAutoBrightnessRef.current;
      const autoContrast = smoothAutoContrastRef.current;

      // ── Liquid Turbulence Displacement Modulation ─────────────────
      const turbEl = typeof document !== "undefined" ? document.getElementById("syncbeats-liquid-turb") : null;
      const dispEl = typeof document !== "undefined" ? document.getElementById("syncbeats-liquid-disp") : null;
      if (turbEl && dispEl) {
        const overallEnergy = (smoothed[0] + smoothed[1] + smoothed[2] + smoothed[3] + smoothed[4] + smoothed[5]) / 6;
        const freqX = 0.008 + Math.sin(timestamp * 0.0006) * 0.004 + overallEnergy * 0.005;
        const freqY = 0.012 + Math.cos(timestamp * 0.0005) * 0.004 + overallEnergy * 0.005;
        const dispScale = isPlaying ? 32 + overallEnergy * 55 + smoothed[0] * 50 : 16;

        turbEl.setAttribute("baseFrequency", `${freqX.toFixed(4)} ${freqY.toFixed(4)}`);
        dispEl.setAttribute("scale", dispScale.toFixed(1));
      }

      // ── Beat-reactive intensity: v² makes light hits soft, heavy hits slam ──
      // Sub: biggest physical space, hardest punch on deep bass
      if (blobSub) {
        const v = smoothed[0];
        const v2 = v * v;
        const scale = (1 + v2 * 1.4 + v * 0.3) * (0.9 + (autoBright - 1) * 0.3);
        const opacityVal = Math.min(1, (baseOpacity[0] + v2 * (peakOpacity[0] - baseOpacity[0]) * 1.15) * autoBright);
        const sat = Math.min(100, (bassSat + v2 * 15) * autoContrast);
        const hue = nodeHues.sub;
        blobSub.style.transform = `translate3d(${posX[0]}vw, ${posY[0]}vh, 0) scale(${scale})`;
        blobSub.style.opacity = `${opacityVal}`;
        blobSub.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${bassLight}%, ${0.85 + v2 * 0.15}) 0%, hsla(${hue}, ${sat}%, ${bassLight}%, 0) 70%)`;
      }
      // Bass: primary kick/punch driver
      if (blobBass) {
        const v = smoothed[1];
        const v2 = v * v;
        const scale = (1 + v2 * 1.2 + v * 0.25) * (0.9 + (autoBright - 1) * 0.3);
        const opacityVal = Math.min(1, (baseOpacity[0] + v2 * (peakOpacity[0] - baseOpacity[0]) * 1.1) * autoBright);
        const sat = Math.min(100, (bassSat + v2 * 15) * autoContrast);
        const hue = nodeHues.bass;
        blobBass.style.transform = `translate3d(${posX[1]}vw, ${posY[1]}vh, 0) scale(${scale})`;
        blobBass.style.opacity = `${opacityVal}`;
        blobBass.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${bassLight}%, ${0.85 + v2 * 0.15}) 0%, hsla(${hue}, ${sat}%, ${bassLight}%, 0) 70%)`;
      }
      // Low-mid: warmth layer, moderate reactivity
      if (blobLowMid) {
        const v = smoothed[2];
        const v2 = v * v;
        const scale = 1 + v2 * 0.9 + v * 0.2;
        const opacityVal = Math.min(1, (baseOpacity[1] + v2 * (peakOpacity[1] - baseOpacity[1])) * autoBright);
        const sat = Math.min(100, (midSat + v2 * 12) * autoContrast);
        const hue = nodeHues.lowMid;
        blobLowMid.style.transform = `translate3d(${posX[2]}vw, ${posY[2]}vh, 0) scale(${scale})`;
        blobLowMid.style.opacity = `${opacityVal}`;
        blobLowMid.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${sat}%, ${midLight}%, 0) 70%)`;
      }
      // Mid: vocal presence layer
      if (blobMid) {
        const v = smoothed[3];
        const v2 = v * v;
        const scale = 1 + v2 * 0.75 + v * 0.15;
        const opacityVal = Math.min(1, (baseOpacity[1] + v2 * (peakOpacity[1] - baseOpacity[1])) * autoBright);
        const sat = Math.min(100, (midSat + v2 * 10) * autoContrast);
        const hue = nodeHues.mid;
        blobMid.style.transform = `translate3d(${posX[3]}vw, ${posY[3]}vh, 0) scale(${scale})`;
        blobMid.style.opacity = `${opacityVal}`;
        blobMid.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${sat}%, ${midLight}%, 0) 70%)`;
      }
      // Upper-mid: presence/air layer
      if (blobUpperMid) {
        const v = smoothed[4];
        const v2 = v * v;
        const scale = 1 + v2 * 0.65 + v * 0.15;
        const opacityVal = Math.min(1, (baseOpacity[1] + v2 * (peakOpacity[1] - baseOpacity[1])) * autoBright);
        const sat = Math.min(100, (midSat + v2 * 10) * autoContrast);
        const hue = nodeHues.upperMid;
        blobUpperMid.style.transform = `translate3d(${posX[4]}vw, ${posY[4]}vh, 0) scale(${scale})`;
        blobUpperMid.style.opacity = `${opacityVal}`;
        blobUpperMid.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${sat}%, ${midLight}%, 0) 70%)`;
      }
      // High: shimmer/sparkle, fastest reactivity but smallest punch
      if (blobHigh) {
        const v = smoothed[5];
        const v2 = v * v;
        const scale = 1 + v2 * 0.55 + v * 0.1;
        const opacityVal = Math.min(1, (baseOpacity[2] + v2 * (peakOpacity[2] - baseOpacity[2])) * autoBright);
        const sat = Math.min(100, (highSat + v2 * 10) * autoContrast);
        const hue = nodeHues.high;
        blobHigh.style.transform = `translate3d(${posX[5]}vw, ${posY[5]}vh, 0) scale(${scale})`;
        blobHigh.style.opacity = `${opacityVal}`;
        blobHigh.style.background = `radial-gradient(circle, hsla(${hue}, ${sat}%, ${highLight}%, 0.9) 0%, hsla(${hue}, ${sat}%, ${highLight}%, 0) 70%)`;
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [
    syncWithAudio,
    isRoomPlayingProp,
    audioContext,
    isDark,
    settings.gradientSettings,
    settings.ambientBrightness,
    settings.ambientContrast,
    settings.activeLightCount,
  ]);

  if (!mounted) return null;
  if (settings.ambientEnabled === false) return null;

  const showSub = activeBands.includes("sub");
  const showBass = activeBands.includes("bass");
  const showLowMid = activeBands.includes("lowMid");
  const showMid = activeBands.includes("mid");
  const showUpperMid = activeBands.includes("upperMid");
  const showHigh = activeBands.includes("high");

  return (
    <>
      {isDebugActive && syncWithAudio && <DebugOverlay debugData={debugDataRef} />}

      {/* SVG Filter for silky liquid fluid morphing */}
      <svg className="hidden">
        <defs>
          <filter id="syncbeats-liquid-fluid" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              id="syncbeats-liquid-turb"
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="3"
              result="noise"
            />
            <feDisplacementMap
              id="syncbeats-liquid-disp"
              in="SourceGraphic"
              in2="noise"
              scale="35"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div
        className={`fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-700 ease-in-out ${syncWithAudio && !isPlaying && !isRoomPlayingProp ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        style={{ filter: "url(#syncbeats-liquid-fluid)" }}
      >
        {showSub && (
          <div
            ref={blobSubRef}
            className="absolute rounded-full blur-[40px] md:blur-[100px] w-[80vw] h-[80vw] -ml-[40vw] -mt-[40vw] md:w-[45vw] md:h-[45vw] md:-ml-[22.5vw] md:-mt-[22.5vw]"
            style={{
              maxWidth: "600px",
              maxHeight: "600px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.sub.x}vw, ${nodePositions.sub.y}vh, 0)`,
              opacity: baseOpacity[0],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.sub}, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(${nodeHues.sub}, ${bassSat}%, ${bassLight}%, 0) 70%)`,
            }}
          />
        )}
        {showBass && (
          <div
            ref={blobBassRef}
            className="absolute rounded-full blur-[40px] md:blur-[100px] w-[80vw] h-[80vw] -ml-[40vw] -mt-[40vw] md:w-[45vw] md:h-[45vw] md:-ml-[22.5vw] md:-mt-[22.5vw]"
            style={{
              maxWidth: "600px",
              maxHeight: "600px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.bass.x}vw, ${nodePositions.bass.y}vh, 0)`,
              opacity: baseOpacity[0],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.bass}, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(${nodeHues.bass}, ${bassSat}%, ${bassLight}%, 0) 70%)`,
            }}
          />
        )}
        {showLowMid && (
          <div
            ref={blobLowMidRef}
            className="absolute rounded-full blur-[35px] md:blur-[90px] w-[70vw] h-[70vw] -ml-[35vw] -mt-[35vw] md:w-[40vw] md:h-[40vw] md:-ml-[20vw] md:-mt-[20vw]"
            style={{
              maxWidth: "500px",
              maxHeight: "500px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.lowMid.x}vw, ${nodePositions.lowMid.y}vh, 0)`,
              opacity: baseOpacity[1],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.lowMid}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${nodeHues.lowMid}, ${midSat}%, ${midLight}%, 0) 70%)`,
            }}
          />
        )}
        {showMid && (
          <div
            ref={blobMidRef}
            className="absolute rounded-full blur-[35px] md:blur-[90px] w-[70vw] h-[70vw] -ml-[35vw] -mt-[35vw] md:w-[40vw] md:h-[40vw] md:-ml-[20vw] md:-mt-[20vw]"
            style={{
              maxWidth: "500px",
              maxHeight: "500px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.mid.x}vw, ${nodePositions.mid.y}vh, 0)`,
              opacity: baseOpacity[1],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.mid}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${nodeHues.mid}, ${midSat}%, ${midLight}%, 0) 70%)`,
            }}
          />
        )}
        {showUpperMid && (
          <div
            ref={blobUpperMidRef}
            className="absolute rounded-full blur-[35px] md:blur-[90px] w-[70vw] h-[70vw] -ml-[35vw] -mt-[35vw] md:w-[40vw] md:h-[40vw] md:-ml-[20vw] md:-mt-[20vw]"
            style={{
              maxWidth: "500px",
              maxHeight: "500px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.upperMid.x}vw, ${nodePositions.upperMid.y}vh, 0)`,
              opacity: baseOpacity[1],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.upperMid}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${nodeHues.upperMid}, ${midSat}%, ${midLight}%, 0) 70%)`,
            }}
          />
        )}
        {showHigh && (
          <div
            ref={blobHighRef}
            className="absolute rounded-full blur-[45px] md:blur-[120px] w-[90vw] h-[90vw] -ml-[45vw] -mt-[45vw] md:w-[50vw] md:h-[50vw] md:-ml-[25vw] md:-mt-[25vw]"
            style={{
              maxWidth: "650px",
              maxHeight: "650px",
              willChange: "transform, opacity, background",
              transform: `translate3d(${nodePositions.high.x}vw, ${nodePositions.high.y}vh, 0)`,
              opacity: baseOpacity[2],
              mixBlendMode: blendMode,
              background: `radial-gradient(circle, hsla(${nodeHues.high}, ${highSat}%, ${highLight}%, 0.8) 0%, hsla(${nodeHues.high}, ${highSat}%, ${highLight}%, 0) 70%)`,
            }}
          />
        )}
      </div>
    </>
  );
}
