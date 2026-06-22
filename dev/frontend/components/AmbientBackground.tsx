"use client";

import { useEffect, useRef, useState } from "react";
import { useAudio } from "../context/AudioContext";
import { useTheme } from "next-themes";
import { useSyncInfo } from "../context/SyncContext";

export function AmbientBackground({ syncWithAudio = false }: { syncWithAudio?: boolean }) {
  const blob1Ref = useRef<HTMLDivElement>(null);
  const blob2Ref = useRef<HTMLDivElement>(null);
  const blob3Ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
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
  // Light mode needs much higher base opacity to be visible on white
  const baseOpacity = isDark ? [0.04, 0.03, 0.03] : [0.15, 0.12, 0.12];
  const peakOpacity = isDark ? [0.18, 0.15, 0.13] : [0.45, 0.38, 0.35];
  // Light mode uses deeper, more saturated colors
  const bassSat = isDark ? 85 : 75;
  const bassLight = isDark ? 55 : 50;
  const midSat = isDark ? 80 : 70;
  const midLight = isDark ? 50 : 42;
  const highSat = isDark ? 75 : 70;
  const highLight = isDark ? 55 : 48;

  useEffect(() => {
    if (!syncWithAudio || !audioContext) return;

    let rafId: number;
    const { getRawAudioData } = audioContext;

    // Smoothed values per band — [bass, mids, highs]
    const smoothed = [0, 0, 0];
    // Position offsets for gentle wandering
    const posX = [30, 70, 50];
    const posY = [25, 65, 85];
    const targetPosX = [30, 70, 50];
    const targetPosY = [25, 65, 85];
    let lastWanderTime = performance.now();

    const animate = () => {
      rafId = requestAnimationFrame(animate);

      const blob1 = blob1Ref.current;
      const blob2 = blob2Ref.current;
      const blob3 = blob3Ref.current;
      if (!blob1 || !blob2 || !blob3) return;

      const data = getRawAudioData();
      const now = performance.now();

      // ── Extract 3 frequency bands ──
      let bass = 0, mids = 0, highs = 0;

      if (data && data.length > 40) {
        // Bass band (bins 0-6, ~0-516 Hz)
        let bassSum = 0;
        for (let i = 0; i <= 6; i++) bassSum += data[i];
        bass = Math.max(0, (bassSum / 7) - 60) / 195;

        // Mid band (bins 7-24, ~600-2000 Hz)
        let midSum = 0;
        for (let i = 7; i <= 24; i++) midSum += data[i];
        mids = Math.max(0, (midSum / 18) - 50) / 205;

        // High band (bins 25-60, ~2000-5000 Hz)
        let highSum = 0;
        for (let i = 25; i <= 60; i++) highSum += data[i];
        highs = Math.max(0, (highSum / 36) - 40) / 215;
      }

      bass = Math.min(1, bass);
      mids = Math.min(1, mids);
      highs = Math.min(1, highs);

      const targets = [bass, mids, highs];
      const blobs = [blob1, blob2, blob3];

      // ── iOS-style smoothing: fast attack, slow decay ──
      for (let i = 0; i < 3; i++) {
        if (targets[i] > smoothed[i]) {
          smoothed[i] += (targets[i] - smoothed[i]) * 0.35;
        } else {
          smoothed[i] += (targets[i] - smoothed[i]) * 0.06;
        }
        smoothed[i] = Math.max(0, Math.min(1, smoothed[i]));
      }

      // ── Wandering positions ──
      if (now - lastWanderTime > 3000) {
        lastWanderTime = now;
        targetPosX[0] = 15 + Math.random() * 35;
        targetPosY[0] = 10 + Math.random() * 35;
        targetPosX[1] = 55 + Math.random() * 35;
        targetPosY[1] = 30 + Math.random() * 40;
        targetPosX[2] = 25 + Math.random() * 50;
        targetPosY[2] = 60 + Math.random() * 30;
      }

      for (let i = 0; i < 3; i++) {
        posX[i] += (targetPosX[i] - posX[i]) * 0.008;
        posY[i] += (targetPosY[i] - posY[i]) * 0.008;
      }

      // ── Apply styles to each blob ──
      // Blob 1: Bass → warm red/orange
      const bassScale = 1 + smoothed[0] * 0.5;
      const bassOpacityVal = baseOpacity[0] + smoothed[0] * (peakOpacity[0] - baseOpacity[0]);
      const bassHue = 0 + smoothed[0] * 25;
      blob1.style.transform = `translate3d(${posX[0]}vw, ${posY[0]}vh, 0) scale(${bassScale})`;
      blob1.style.opacity = `${bassOpacityVal}`;
      blob1.style.background = `radial-gradient(circle, hsla(${bassHue}, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(${bassHue}, ${bassSat}%, ${bassLight}%, 0) 70%)`;

      // Blob 2: Mids → teal/cyan
      const midScale = 1 + smoothed[1] * 0.4;
      const midOpacityVal = baseOpacity[1] + smoothed[1] * (peakOpacity[1] - baseOpacity[1]);
      const midHue = 180 + smoothed[1] * 30;
      blob2.style.transform = `translate3d(${posX[1]}vw, ${posY[1]}vh, 0) scale(${midScale})`;
      blob2.style.opacity = `${midOpacityVal}`;
      blob2.style.background = `radial-gradient(circle, hsla(${midHue}, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(${midHue}, ${midSat}%, ${midLight}%, 0) 70%)`;

      // Blob 3: Highs → violet/purple
      const highScale = 1 + smoothed[2] * 0.35;
      const highOpacityVal = baseOpacity[2] + smoothed[2] * (peakOpacity[2] - baseOpacity[2]);
      const highHue = 270 + smoothed[2] * 20;
      blob3.style.transform = `translate3d(${posX[2]}vw, ${posY[2]}vh, 0) scale(${highScale})`;
      blob3.style.opacity = `${highOpacityVal}`;
      blob3.style.background = `radial-gradient(circle, hsla(${highHue}, ${highSat}%, ${highLight}%, 0.8) 0%, hsla(${highHue}, ${highSat}%, ${highLight}%, 0) 70%)`;
    };

    animate();
    return () => cancelAnimationFrame(rafId);
  }, [syncWithAudio, audioContext, isDark]);

  if (!mounted) return null;

  return (
    <div 
      className={`fixed inset-0 overflow-hidden pointer-events-none z-0 transition-opacity duration-[3000ms] ease-in-out ${syncWithAudio && !isPlaying ? 'opacity-10' : 'opacity-100'}`}
    >
      {/* Blob 1: Bass — warm red/orange */}
      <div
        ref={blob1Ref}
        className="absolute rounded-full blur-[40px] md:blur-[100px] w-[80vw] h-[80vw] -ml-[40vw] -mt-[40vw] md:w-[45vw] md:h-[45vw] md:-ml-[22.5vw] md:-mt-[22.5vw]"
        style={{
          maxWidth: "600px",
          maxHeight: "600px",
          willChange: "transform, opacity, background",
          transform: "translate3d(30vw, 25vh, 0)",
          opacity: baseOpacity[0],
          mixBlendMode: blendMode,
          background: `radial-gradient(circle, hsla(0, ${bassSat}%, ${bassLight}%, 0.8) 0%, hsla(0, ${bassSat}%, ${bassLight}%, 0) 70%)`,
        }}
      />
      {/* Blob 2: Mids — teal/cyan */}
      <div
        ref={blob2Ref}
        className="absolute rounded-full blur-[35px] md:blur-[90px] w-[70vw] h-[70vw] -ml-[35vw] -mt-[35vw] md:w-[40vw] md:h-[40vw] md:-ml-[20vw] md:-mt-[20vw]"
        style={{
          maxWidth: "500px",
          maxHeight: "500px",
          willChange: "transform, opacity, background",
          transform: "translate3d(70vw, 65vh, 0)",
          opacity: baseOpacity[1],
          mixBlendMode: blendMode,
          background: `radial-gradient(circle, hsla(180, ${midSat}%, ${midLight}%, 0.8) 0%, hsla(180, ${midSat}%, ${midLight}%, 0) 70%)`,
        }}
      />
      {/* Blob 3: Highs — violet/purple */}
      <div
        ref={blob3Ref}
        className="absolute rounded-full blur-[45px] md:blur-[120px] w-[90vw] h-[90vw] -ml-[45vw] -mt-[45vw] md:w-[50vw] md:h-[50vw] md:-ml-[25vw] md:-mt-[25vw]"
        style={{
          maxWidth: "650px",
          maxHeight: "650px",
          willChange: "transform, opacity, background",
          transform: "translate3d(50vw, 85vh, 0)",
          opacity: baseOpacity[2],
          mixBlendMode: blendMode,
          background: `radial-gradient(circle, hsla(270, ${highSat}%, ${highLight}%, 0.8) 0%, hsla(270, ${highSat}%, ${highLight}%, 0) 70%)`,
        }}
      />
    </div>
  );
}
