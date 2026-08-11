"use client";

import { useEffect, useRef } from "react";
import { useBeatEngine } from "../context/BeatContext";
import { useOptionalAudio } from "../context/AudioContext";
import { useSyncInfo } from "../context/SyncContext";

export function useRealtimeBeatDetector(enabled: boolean = true) {
  const { emitBeat } = useBeatEngine();
  const audioContext = useOptionalAudio();
  const { isRoomPlaying } = useSyncInfo();

  const rafRef = useRef<number>(0);
  const stateRef = useRef({
    prevEnergy: [0, 0, 0, 0, 0, 0],
    rollingMin: [1, 1, 1, 1, 1, 1],
    rollingMax: [0, 0, 0, 0, 0, 0],
    fluxAvg: [0.02, 0.02, 0.02, 0.02, 0.02, 0.02],
    peakHold: [0, 0, 0, 0, 0, 0],
    lastFrameTime: 0,
    prevTimestamp: 0,
    lastSyntheticBeatTime: 0,
    syntheticBeatCount: 0,
  });

  useEffect(() => {
    if (!enabled || !audioContext) return;

    const NORM_MIN_DECAY = 0.9998;
    const NORM_MAX_DECAY = 0.9990;
    const FLUX_AVG_DECAY = 0.95;
    const FLUX_AVG_RISE  = 0.05;
    const onsetGain      = [18,    16,    8,     7,     13,    11   ];
    const decayPerSecond = [0.12, 0.15, 0.28, 0.30, 0.20, 0.18 ];
    const threshScale    = [1.8,   1.8,   3.2,   3.2,   2.0,   1.8  ];

    const s = stateRef.current;
    
    // Groups:
    // Bass: sub (0), bass (1)
    // Mid: lowMid (2), mid (3)
    // Treble: upperMid (4), high (5)

    const animate = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(animate);

      if (timestamp - s.lastFrameTime < 16) return; // limit to ~60fps
      s.lastFrameTime = timestamp;

      const deltaMs = Math.min(100, timestamp - s.prevTimestamp);
      s.prevTimestamp = timestamp;

      const isPlaying = isRoomPlaying && (audioContext ? audioContext.isPlaying : true);
      if (!isPlaying) return;

      const data = audioContext.getRawAudioData ? audioContext.getRawAudioData() : null;
      let isDataActive = false;

      if (data && data.length >= 60) {
        let sum = 0;
        for (let i = 0; i < 30; i++) sum += data[i];
        if (sum > 5) isDataActive = true;
      }

      const isDev = process.env.NEXT_PUBLIC_ENV !== "production" && (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENV === "development");

      // Fallback: If WebAudio FFT data is unavailable or zero (e.g. YouTube stream or CORS limitation),
      // run a smooth rhythmic beat pulse clock so ambient lighting and spatial nodes dance to the music!
      if (!isDataActive || !data) {
        if (!s.lastSyntheticBeatTime) s.lastSyntheticBeatTime = timestamp;
        const targetInterval = isDev ? 480 : 500; // ~120-125 BPM
        if (timestamp - s.lastSyntheticBeatTime > targetInterval) {
          s.lastSyntheticBeatTime = timestamp;
          s.syntheticBeatCount = (s.syntheticBeatCount || 0) + 1;

          const pattern: Array<"bass" | "mid" | "treble"> = ["bass", "mid", "bass", "treble"];
          const beatType = pattern[s.syntheticBeatCount % pattern.length];
          const intensity = isDev ? 0.7 + Math.random() * 0.3 : 0.8; // Constant smooth intensity in prod

          emitBeat({
            timestamp,
            beatType,
            intensity,
            source: "realtime-fft",
          });
        }
        return;
      }

      const scale = (data ? data.length : 256) / 256;
      let sub = 0, bass = 0, lowMids = 0, mids = 0, upperMids = 0, highs = 0;
      const getAvg = (start: number, end: number) => {
        const sIdx = Math.floor(start * scale);
        const eIdx = Math.min(data.length - 1, Math.ceil(end * scale));
        let sum = 0, count = 0;
        for (let i = sIdx; i <= eIdx; i++) { sum += data[i] || 0; count++; }
        return count > 0 ? (sum / count) / 255 : 0;
      };
      sub       = getAvg(0, 4);
      bass      = getAvg(5, 12);
      lowMids   = getAvg(13, 24);
      mids      = getAvg(25, 48);
      upperMids = getAvg(49, 80);
      highs     = getAvg(81, Math.min(180, Math.floor(data.length * 0.9)));

      const rawValues = [sub, bass, lowMids, mids, upperMids, highs];
      const normValues = [0, 0, 0, 0, 0, 0];
      const fluxValues = [0, 0, 0, 0, 0, 0];
      const onsetStates = [false, false, false, false, false, false];
      const fluxRatio = [0, 0, 0, 0, 0, 0];

      for (let i = 0; i < 6; i++) {
        const raw = rawValues[i];

        s.rollingMin[i] = Math.min(s.rollingMin[i] * NORM_MIN_DECAY + raw * (1 - NORM_MIN_DECAY), raw * 0.95);
        s.rollingMax[i] = Math.max(s.rollingMax[i] * NORM_MAX_DECAY, raw);
        const range = s.rollingMax[i] - s.rollingMin[i];
        const epsilon = 0.001;
        normValues[i] = Math.max(0, Math.min(1, range > epsilon ? (raw - s.rollingMin[i]) / (range + epsilon) : 0));

        const flux = Math.max(0, normValues[i] - s.prevEnergy[i]);
        fluxValues[i] = flux;
        
        const threshold = s.fluxAvg[i] * threshScale[i] + 0.004;
        const isOnset = flux > threshold;
        onsetStates[i] = isOnset;

        if (isOnset) {
          const onsetSignal = Math.min(1, Math.sqrt(flux * onsetGain[i]));
          s.peakHold[i] += (onsetSignal - s.peakHold[i]) * 0.85;
          fluxRatio[i] = flux / Math.max(0.001, s.fluxAvg[i]); // How surprising is this onset?
        }

        const decayThisFrame = Math.pow(decayPerSecond[i], deltaMs / 1000);
        s.peakHold[i] *= decayThisFrame;
        if (s.peakHold[i] < 0.005) s.peakHold[i] = 0;

        s.fluxAvg[i] = s.fluxAvg[i] * FLUX_AVG_DECAY + flux * FLUX_AVG_RISE;
        s.prevEnergy[i] = normValues[i];
      }

      // Group into Bass, Mid, Treble
      const groups: Array<{ type: 'bass' | 'mid' | 'treble'; bands: number[] }> = [
        { type: 'bass', bands: [0, 1] },
        { type: 'mid', bands: [2, 3] },
        { type: 'treble', bands: [4, 5] }
      ];

      const triggeredGroups: Array<{ type: 'bass' | 'mid' | 'treble'; maxRatio: number; intensity: number }> = [];

      groups.forEach(group => {
        let maxRatioForGroup = 0;
        let intensity = 0;
        let triggered = false;

        group.bands.forEach(bandIdx => {
          if (onsetStates[bandIdx]) {
            triggered = true;
            if (fluxRatio[bandIdx] > maxRatioForGroup) {
              maxRatioForGroup = fluxRatio[bandIdx];
              intensity = s.peakHold[bandIdx];
            }
          }
        });

        if (triggered) {
          triggeredGroups.push({ type: group.type, maxRatio: maxRatioForGroup, intensity });
        }
      });

      if (triggeredGroups.length > 0) {
        // If multiple groups fire within this 16ms frame, pick the most dominant acoustic onset
        triggeredGroups.sort((a, b) => b.maxRatio - a.maxRatio);
        const winner = triggeredGroups[0];
        
        // Smooth intensity clamping in production mode for silky visual transitions
        const finalIntensity = isDev 
          ? winner.intensity 
          : Math.min(1, Math.max(0.35, winner.intensity));

        emitBeat({
          timestamp: audioContext.audioCtx?.currentTime ? audioContext.audioCtx.currentTime * 1000 : performance.now(),
          beatType: winner.type,
          intensity: finalIntensity,
          source: 'realtime-fft'
        });
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, audioContext, emitBeat]);
}
