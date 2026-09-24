"use client";
import { useEffect, useRef } from "react";
import { useAudio } from "../../context/AudioContext";
import { useVisualizer } from "../../context/VisualizerContext";

export const AudioBars = ({
  isPlaying,
  isSmall,
  isVisible = true,
}: {
  isPlaying: boolean;
  isSmall?: boolean;
  isVisible?: boolean;
}) => {
  const audio = useAudio();
  const { dataRef } = useVisualizer();
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || !isVisible) {
      if (barsRef.current) {
        const children = barsRef.current.children;
        for (let i = 0; i < children.length; i++) {
          const el = children[i] as HTMLElement;
          el.style.height = "15%";
          el.style.opacity = "0.5";
        }
      }
      return;
    }

    let rafId: number;
    const displayHeights = [15, 15, 15, 15];
    const beatHistory: number[] = [];
    const HISTORY_SIZE = 6;

    const tick = () => {
      const data = dataRef.current.rawAudioData;
      let bass = 0, sub = 0, mids = 0, highs = 0;

      if (data && data.length > 40) {
        let bassSum = 0;
        for (let i = 1; i <= 5; i++) bassSum += data[i];
        bass = bassSum / 5;
        let subSum = 0;
        for (let i = 0; i <= 2; i++) subSum += data[i];
        sub = subSum / 3;
        let midSum = 0;
        for (let i = 6; i <= 14; i++) midSum += data[i];
        mids = midSum / 9;
        let highSum = 0;
        for (let i = 15; i <= 30; i++) highSum += data[i];
        highs = highSum / 16;
      }

      const expScale = (val: number) => Math.pow(val / 255, 2.5) * 100;
      const innerIntensity = expScale(bass * 0.7 + sub * 0.3);
      const outerIntensity = expScale(mids * 0.6 + highs * 0.4);
      const innerTarget = Math.max(15, Math.min(15 + innerIntensity, 100));

      beatHistory.push(innerTarget);
      if (beatHistory.length > HISTORY_SIZE) beatHistory.shift();

      const outerTarget = Math.max(15, Math.min(15 + outerIntensity, 88));
      const trailSlice = beatHistory.slice(0, Math.max(1, Math.floor(beatHistory.length * 0.5)));
      const trailedOuter = trailSlice.reduce((a, b) => a + b, 0) / trailSlice.length * 0.7;

      const targets = [
        Math.max(outerTarget, trailedOuter * 0.6),
        innerTarget,
        innerTarget * 0.92,
        Math.max(outerTarget * 0.9, trailedOuter * 0.5),
      ];

      for (let i = 0; i < 4; i++) {
        const target = targets[i];
        const current = displayHeights[i];
        if (target > current) {
          const attackSpeed = (i === 1 || i === 2) ? 0.55 : 0.40;
          displayHeights[i] += (target - current) * attackSpeed;
        } else {
          const decaySpeed = (i === 1 || i === 2) ? 0.10 : 0.07;
          displayHeights[i] += (target - current) * decaySpeed;
        }
        displayHeights[i] = Math.max(15, Math.min(100, displayHeights[i]));
        if (barsRef.current) {
          const el = barsRef.current.children[i] as HTMLElement;
          if (el) {
            el.style.height = `${displayHeights[i]}%`;
            const brightness = 0.5 + (displayHeights[i] - 15) / 170;
            el.style.opacity = `${Math.min(1, brightness)}`;
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, isVisible, dataRef]);

  const hClass = isSmall ? "h-3.5" : "h-5";
  const barW = isSmall ? "w-[2.5px]" : "w-[3px]";
  const gapClass = isSmall ? "gap-[1.5px]" : "gap-[2px]";

  return (
    <div ref={barsRef} className={`flex items-center ${gapClass} ${hClass}`}>
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
      <div className={`${barW} bg-white rounded-full`} style={{ height: "15%", opacity: 0.5, willChange: "height, opacity", transition: "none" }} />
    </div>
  );
};
