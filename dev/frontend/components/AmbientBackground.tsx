import React, { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { useTheme } from "next-themes";
import { useSyncInfo } from "../context/SyncContext";
import { useSettings } from "../hooks/useSettings";

export function AmbientBackground({ syncWithAudio = false }: { syncWithAudio?: boolean }) {
  const blobSubRef = useRef<HTMLDivElement>(null);
  const blobBassRef = useRef<HTMLDivElement>(null);
  const blobLowMidRef = useRef<HTMLDivElement>(null);
  const blobMidRef = useRef<HTMLDivElement>(null);
  const blobUpperMidRef = useRef<HTMLDivElement>(null);
  const blobHighRef = useRef<HTMLDivElement>(null);

  const { resolvedTheme } = useTheme();
  const { settings } = useSettings();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
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

  const isPlaying = isRoomPlaying || (audioContext?.isPlaying ?? false);

  // Theme-adaptive values
  const blendMode = isDark ? "screen" : "multiply";
  const bMult = (settings.ambientBrightness || 100) / 100;
  const cMult = (settings.ambientContrast || 100) / 100;

  // Light mode needs much higher base opacity to be visible on white
  const baseOpacity = (isDark ? [0.06, 0.05, 0.05] : [0.15, 0.12, 0.12]).map(v => v * bMult);
  const peakOpacity = (isDark ? [0.45, 0.38, 0.35] : [0.55, 0.48, 0.45]).map(v => v * bMult);
  
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

  const lightCount = settings.activeLightCount || 3;
  const activeBands: ('sub' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'high')[] = 
    lightCount === 3 
      ? ['bass', 'mid', 'high']
      : lightCount === 4
      ? ['sub', 'bass', 'mid', 'high']
      : lightCount === 5
      ? ['sub', 'bass', 'mid', 'upperMid', 'high']
      : ['sub', 'bass', 'lowMid', 'mid', 'upperMid', 'high'];

  useEffect(() => {
    if (!syncWithAudio || !audioContext) return;

    let rafId: number;
    const { getRawAudioData } = audioContext;

    const positions = {
      sub: settings.ambientPositions?.sub || { x: 50, y: 15 },
      bass: settings.ambientPositions?.bass || { x: 18, y: 38 },
      lowMid: settings.ambientPositions?.lowMid || { x: 18, y: 68 },
      mid: settings.ambientPositions?.mid || { x: 82, y: 38 },
      upperMid: settings.ambientPositions?.upperMid || { x: 82, y: 68 },
      high: settings.ambientPositions?.high || { x: 50, y: 85 },
    };

    // ── Two-layer hybrid state ──
    // Layer 1: Ambient glow — slow-tracking energy for gentle breathing during vocals/melody
    // Layer 2: Onset punch — spectral flux for sharp beat-reactive pulses
    const smoothed = [0, 0, 0, 0, 0, 0];    // final brightness sent to blobs
    const ambientLevel = [0, 0, 0, 0, 0, 0]; // slow-following energy envelope (Layer 1)
    const prevEnergy = [0, 0, 0, 0, 0, 0];   // smoothed energy from previous frame (for flux)
    const fluxAvg = [0, 0, 0, 0, 0, 0];      // running average of spectral flux (adaptive threshold)
    const peakHold = [0, 0, 0, 0, 0, 0];     // onset brightness that decays between beats (Layer 2)
    
    // Position offsets for gentle wandering
    const posX = [positions.sub.x, positions.bass.x, positions.lowMid.x, positions.mid.x, positions.upperMid.x, positions.high.x];
    const posY = [positions.sub.y, positions.bass.y, positions.lowMid.y, positions.mid.y, positions.upperMid.y, positions.high.y];
    const targetPosX = [positions.sub.x, positions.bass.x, positions.lowMid.x, positions.mid.x, positions.upperMid.x, positions.high.x];
    const targetPosY = [positions.sub.y, positions.bass.y, positions.lowMid.y, positions.mid.y, positions.upperMid.y, positions.high.y];
    let lastWanderTime = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);

      const blobSub = blobSubRef.current;
      const blobBass = blobBassRef.current;
      const blobLowMid = blobLowMidRef.current;
      const blobMid = blobMidRef.current;
      const blobUpperMid = blobUpperMidRef.current;
      const blobHigh = blobHighRef.current;

      const data = getRawAudioData();
      const now = performance.now();

      // ── Extract 6 frequency bands (FFT 512 → 256 bins) ──
      let sub = 0, bass = 0, lowMids = 0, mids = 0, upperMids = 0, highs = 0;

      if (data && data.length > 60) {
        // Sub-bass: bins 0-4 (~0-86 Hz)
        let subSum = 0;
        for (let i = 0; i <= 4; i++) subSum += data[i];
        sub = subSum / 5 / 255;

        // Bass: bins 5-12 (~86-516 Hz)
        let bassSum = 0;
        for (let i = 5; i <= 12; i++) bassSum += data[i];
        bass = bassSum / 8 / 255;

        // Low-Mids: bins 13-24 (~516-1032 Hz)
        let lowMidSum = 0;
        for (let i = 13; i <= 24; i++) lowMidSum += data[i];
        lowMids = lowMidSum / 12 / 255;

        // Mids: bins 25-48 (~1032-2064 Hz)
        let midSum = 0;
        for (let i = 25; i <= 48; i++) midSum += data[i];
        mids = midSum / 24 / 255;

        // Upper-Mids: bins 49-80 (~2064-3440 Hz)
        let upperMidSum = 0;
        for (let i = 49; i <= 80; i++) upperMidSum += data[i];
        upperMids = upperMidSum / 32 / 255;

        // Highs: bins 81-180 (~3440-7740 Hz)
        let highSum = 0;
        for (let i = 81; i <= Math.min(180, data.length - 1); i++) highSum += data[i];
        highs = highSum / Math.min(100, data.length - 81) / 255;
      }

      // ══════════════════════════════════════════════════════════════
      // FREQUENCY-ISOLATED VISUALIZATION
      //
      // Problem: a kick drum fires energy across ALL frequency bands.
      // Old approach: each band thresholds independently → all blink at once.
      // Fix: two-phase processing with cross-band isolation.
      //
      //   Phase 1 — Compute raw flux & onset for all 6 bands
      //   Phase 2 — Cross-band isolation: only the DOMINANT band(s)
      //             fire at full brightness; bands that are just
      //             "riding" a kick's spread get suppressed.
      //
      // Psychoacoustic basis: in audio masking, a loud low-freq tone
      // suppresses the perception of quieter high-freq tones that
      // occur simultaneously. We apply the same principle visually.
      // ══════════════════════════════════════════════════════════════
      const rawValues = [sub, bass, lowMids, mids, upperMids, highs];

      //                            [sub,   bass,  lowMid, mid,   upMid, high ]
      // Ambient layer config
      const ambSmooth   =          [0.005, 0.006, 0.018,  0.022, 0.032, 0.038];
      const ambCeiling  =          [0.07,  0.09,  0.38,   0.42,  0.18,  0.14 ];
      const ambExp      =          [3.2,   3.0,   1.5,    1.4,   1.9,   2.1  ];

      // Onset layer config
      const onsetGain   =          [18,    16,    8,      7,     13,    11   ];
      const onsetDecay  =          [0.89,  0.90,  0.95,   0.95,  0.85,  0.82 ];
      const fluxSmooth  =          [0.38,  0.36,  0.48,   0.48,  0.24,  0.20 ];
      const threshScale =          [1.8,   1.8,   3.2,    3.2,   2.0,   1.8  ];
      const threshFloor =          [0.005, 0.005, 0.012,  0.012, 0.005, 0.004];

      // ── PHASE 1: Compute ambient & raw onset for all bands ──
      const rawOnset = [0, 0, 0, 0, 0, 0];

      for (let i = 0; i < 6; i++) {
        const raw = rawValues[i];

        // Ambient glow — slow breathing envelope
        ambientLevel[i] += (raw - ambientLevel[i]) * ambSmooth[i];

        // Spectral flux (half-wave rectified)
        const flux = Math.max(0, raw - prevEnergy[i]);
        prevEnergy[i] += (raw - prevEnergy[i]) * fluxSmooth[i];

        // Adaptive threshold per band
        fluxAvg[i] += (flux - fluxAvg[i]) * 0.018;
        const threshold = fluxAvg[i] * threshScale[i] + threshFloor[i];

        // Raw onset signal (not yet cross-band corrected)
        const onset = Math.max(0, flux - threshold);
        rawOnset[i] = Math.min(1, Math.sqrt(onset * onsetGain[i]));
      }

      // ── PHASE 2: Cross-band isolation ──
      // Find the maximum onset across all bands this frame
      let maxOnset = 0;
      for (let i = 0; i < 6; i++) if (rawOnset[i] > maxOnset) maxOnset = rawOnset[i];

      // Compute bass dominance: how strongly is the bass band leading?
      const bassDominance  = Math.max(rawOnset[0], rawOnset[1]);        // 0-1
      const trebleDominance = Math.max(rawOnset[4], rawOnset[5]);       // 0-1
      const midDominance   = Math.max(rawOnset[2], rawOnset[3]);        // 0-1

      for (let i = 0; i < 6; i++) {
        // Relative strength: how uniquely prominent is this band vs the global max?
        const relStrength = maxOnset > 0.001 ? rawOnset[i] / maxOnset : 0;

        // "Winner-takes-more" isolation:
        // If this band is clearly dominant (relStrength > 0.55) → full signal.
        // If it's a weak echo of another dominant band → suppressed.
        let isolationScale: number;
        if (relStrength >= 0.55) {
          isolationScale = 1.0;                                // dominant — fire at full
        } else if (relStrength >= 0.30) {
          isolationScale = (relStrength - 0.30) / 0.25;       // partial — linear fade
        } else {
          isolationScale = 0;                                  // too weak — silence
        }

        // Additional cross-band masking:
        // When BASS is dominant, suppress upper-mids & highs (kick bleed prevention)
        if (i >= 4 && bassDominance > 0.5) {
          isolationScale *= Math.max(0, 1 - bassDominance * 1.2);
        }
        // When TREBLE is dominant, suppress sub/bass (hi-hat bleed prevention)
        if (i <= 1 && trebleDominance > 0.6 && bassDominance < 0.3) {
          isolationScale *= Math.max(0, 1 - trebleDominance * 0.8);
        }
        // When MID is dominant, only lightly suppress other bands
        // (snare has genuine energy in bass + treble, so don't over-suppress)
        if ((i <= 1 || i >= 4) && midDominance > 0.7 && bassDominance < 0.2) {
          isolationScale *= Math.max(0.2, 1 - midDominance * 0.5);
        }

        const isolated = rawOnset[i] * Math.max(0, isolationScale);

        // ── Peak hold & decay ──
        if (isolated > peakHold[i]) {
          peakHold[i] += (isolated - peakHold[i]) * 0.85;
        } else {
          peakHold[i] *= onsetDecay[i];
        }
        if (peakHold[i] < 0.008) peakHold[i] = 0;

        // ── Ambient layer ──
        const ambient = Math.pow(ambientLevel[i], ambExp[i]) * ambCeiling[i];

        // ── Combine: ambient breathes gently, onset punches on beats ──
        smoothed[i] = Math.max(ambient, peakHold[i]);
      }

      // ── Wandering positions (with beat-reactive kicks) ──
      if (now - lastWanderTime > 2500) {
        lastWanderTime = now;
        const wanderRadius = 15;
        for (let i = 0; i < 6; i++) {
          const baseX = [positions.sub.x, positions.bass.x, positions.lowMid.x, positions.mid.x, positions.upperMid.x, positions.high.x][i];
          const baseY = [positions.sub.y, positions.bass.y, positions.lowMid.y, positions.mid.y, positions.upperMid.y, positions.high.y][i];
          // Beat-reactive: stronger wandering when the band is loud
          const energy = smoothed[i];
          const r = wanderRadius * (0.5 + energy * 1.5);
          targetPosX[i] = Math.max(5, Math.min(95, baseX + (Math.random() * r * 2 - r)));
          targetPosY[i] = Math.max(5, Math.min(95, baseY + (Math.random() * r * 2 - r)));
        }
      }

      // Faster position interpolation for more alive movement
      for (let i = 0; i < 6; i++) {
        const lerpSpeed = 0.012 + smoothed[i] * 0.008; // faster when loud
        posX[i] += (targetPosX[i] - posX[i]) * lerpSpeed;
        posY[i] += (targetPosY[i] - posY[i]) * lerpSpeed;
      }

      // ── Apply styles to each active blob ──
      // Scale, opacity, and blur size all react to the beat energy
      if (blobSub) {
        const v = smoothed[0];
        const scale = 1 + v * 1.0;
        const opacityVal = baseOpacity[0] + v * (peakOpacity[0] - baseOpacity[0]);
        const hue = (settings.ambientColors.subHue ?? 320) + v * 30;
        blobSub.style.transform = `translate3d(${posX[0]}vw, ${posY[0]}vh, 0) scale(${scale})`;
        blobSub.style.opacity = `${opacityVal}`;
        blobSub.style.background = `radial-gradient(circle, hsla(${hue}, ${bassSat}%, ${bassLight}%, 0.9) 0%, hsla(${hue}, ${bassSat}%, ${bassLight}%, 0) 70%)`;
      }
      if (blobBass) {
        const v = smoothed[1];
        const scale = 1 + v * 1.0;
        const opacityVal = baseOpacity[0] + v * (peakOpacity[0] - baseOpacity[0]);
        const hue = (settings.ambientColors.bassHue ?? 0) + v * 30;
        blobBass.style.transform = `translate3d(${posX[1]}vw, ${posY[1]}vh, 0) scale(${scale})`;
        blobBass.style.opacity = `${opacityVal}`;
        blobBass.style.background = `radial-gradient(circle, hsla(${hue}, ${bassSat}%, ${bassLight}%, 0.9) 0%, hsla(${hue}, ${bassSat}%, ${bassLight}%, 0) 70%)`;
      }
      if (blobLowMid) {
        const v = smoothed[2];
        const scale = 1 + v * 0.85;
        const opacityVal = baseOpacity[1] + v * (peakOpacity[1] - baseOpacity[1]);
        const hue = (settings.ambientColors.lowMidHue ?? 40) + v * 35;
        blobLowMid.style.transform = `translate3d(${posX[2]}vw, ${posY[2]}vh, 0) scale(${scale})`;
        blobLowMid.style.opacity = `${opacityVal}`;
        blobLowMid.style.background = `radial-gradient(circle, hsla(${hue}, ${midSat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${midSat}%, ${midLight}%, 0) 70%)`;
      }
      if (blobMid) {
        const v = smoothed[3];
        const scale = 1 + v * 0.75;
        const opacityVal = baseOpacity[1] + v * (peakOpacity[1] - baseOpacity[1]);
        const hue = (settings.ambientColors.midHue ?? 120) + v * 35;
        blobMid.style.transform = `translate3d(${posX[3]}vw, ${posY[3]}vh, 0) scale(${scale})`;
        blobMid.style.opacity = `${opacityVal}`;
        blobMid.style.background = `radial-gradient(circle, hsla(${hue}, ${midSat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${midSat}%, ${midLight}%, 0) 70%)`;
      }
      if (blobUpperMid) {
        const v = smoothed[4];
        const scale = 1 + v * 0.7;
        const opacityVal = baseOpacity[1] + v * (peakOpacity[1] - baseOpacity[1]);
        const hue = (settings.ambientColors.upperMidHue ?? 200) + v * 40;
        blobUpperMid.style.transform = `translate3d(${posX[4]}vw, ${posY[4]}vh, 0) scale(${scale})`;
        blobUpperMid.style.opacity = `${opacityVal}`;
        blobUpperMid.style.background = `radial-gradient(circle, hsla(${hue}, ${midSat}%, ${midLight}%, 0.9) 0%, hsla(${hue}, ${midSat}%, ${midLight}%, 0) 70%)`;
      }
      if (blobHigh) {
        const v = smoothed[5];
        const scale = 1 + v * 0.6;
        const opacityVal = baseOpacity[2] + v * (peakOpacity[2] - baseOpacity[2]);
        const hue = (settings.ambientColors.highHue ?? 280) + v * 45;
        blobHigh.style.transform = `translate3d(${posX[5]}vw, ${posY[5]}vh, 0) scale(${scale})`;
        blobHigh.style.opacity = `${opacityVal}`;
        blobHigh.style.background = `radial-gradient(circle, hsla(${hue}, ${highSat}%, ${highLight}%, 0.9) 0%, hsla(${hue}, ${highSat}%, ${highLight}%, 0) 70%)`;
      }
    };

    animate();
    return () => cancelAnimationFrame(rafId);
  }, [syncWithAudio, audioContext, isDark, settings.ambientColors, settings.ambientBrightness, settings.ambientContrast, settings.ambientPositions, settings.activeLightCount]);

  if (!mounted) return null;
  if (settings.ambientEnabled === false) return null;

  const positions = {
    sub: settings.ambientPositions?.sub || { x: 50, y: 15 },
    bass: settings.ambientPositions?.bass || { x: 18, y: 38 },
    lowMid: settings.ambientPositions?.lowMid || { x: 18, y: 68 },
    mid: settings.ambientPositions?.mid || { x: 82, y: 38 },
    upperMid: settings.ambientPositions?.upperMid || { x: 82, y: 68 },
    high: settings.ambientPositions?.high || { x: 50, y: 85 },
  };

  const showSub = activeBands.includes('sub');
  const showBass = activeBands.includes('bass');
  const showLowMid = activeBands.includes('lowMid');
  const showMid = activeBands.includes('mid');
  const showUpperMid = activeBands.includes('upperMid');
  const showHigh = activeBands.includes('high');

  return (
    <div 
      className={`fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-[3000ms] ease-in-out ${syncWithAudio && !isPlaying ? 'opacity-10' : 'opacity-100'}`}
    >
      {showSub && (
        <div
          ref={blobSubRef}
          className="absolute rounded-full blur-[40px] md:blur-[100px] w-[80vw] h-[80vw] -ml-[40vw] -mt-[40vw] md:w-[45vw] md:h-[45vw] md:-ml-[22.5vw] md:-mt-[22.5vw]"
          style={{
            maxWidth: "600px",
            maxHeight: "600px",
            willChange: "transform, opacity, background",
            transform: `translate3d(${positions.sub.x}vw, ${positions.sub.y}vh, 0)`,
            opacity: baseOpacity[0],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.subHue ?? 320}, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(${settings.ambientColors.subHue ?? 320}, ${bassSat}%, ${bassLight}%, 0) 70%)`,
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
            transform: `translate3d(${positions.bass.x}vw, ${positions.bass.y}vh, 0)`,
            opacity: baseOpacity[0],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.bassHue ?? 0}, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(${settings.ambientColors.bassHue ?? 0}, ${bassSat}%, ${bassLight}%, 0) 70%)`,
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
            transform: `translate3d(${positions.lowMid.x}vw, ${positions.lowMid.y}vh, 0)`,
            opacity: baseOpacity[1],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.lowMidHue ?? 40}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${settings.ambientColors.lowMidHue ?? 40}, ${midSat}%, ${midLight}%, 0) 70%)`,
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
            transform: `translate3d(${positions.mid.x}vw, ${positions.mid.y}vh, 0)`,
            opacity: baseOpacity[1],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.midHue ?? 120}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${settings.ambientColors.midHue ?? 120}, ${midSat}%, ${midLight}%, 0) 70%)`,
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
            transform: `translate3d(${positions.upperMid.x}vw, ${positions.upperMid.y}vh, 0)`,
            opacity: baseOpacity[1],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.upperMidHue ?? 200}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${settings.ambientColors.upperMidHue ?? 200}, ${midSat}%, ${midLight}%, 0) 70%)`,
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
            transform: `translate3d(${positions.high.x}vw, ${positions.high.y}vh, 0)`,
            opacity: baseOpacity[2],
            mixBlendMode: blendMode,
            background: `radial-gradient(circle, hsla(${settings.ambientColors.highHue ?? 280}, ${highSat}%, ${highLight}%, 0.8) 0%, hsla(${settings.ambientColors.highHue ?? 280}, ${highSat}%, ${highLight}%, 0) 70%)`,
          }}
        />
      )}
    </div>
  );
}
