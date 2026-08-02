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

      if (!audioContext || (!audioContext.isPlaying && !isRoomPlaying)) return;

      const data = audioContext.getRawAudioData ? audioContext.getRawAudioData() : null;
      let isDataActive = false;

      if (data && data.length >= 60) {
        let sum = 0;
        for (let i = 0; i < 30; i++) sum += data[i];
        if (sum > 5) isDataActive = true;
      }

      // Fallback: If WebAudio FFT data is unavailable or zero (e.g. YouTube stream or CORS limitation),
      // run a rhythmic beat pulse clock so ambient lighting and spatial nodes ALWAYS dance to the music!
      if (!isDataActive || !data) {
        if (!s.lastSyntheticBeatTime) s.lastSyntheticBeatTime = timestamp;
        if (timestamp - s.lastSyntheticBeatTime > 480) { // ~125 BPM beat pulse
          s.lastSyntheticBeatTime = timestamp;
          s.syntheticBeatCount = (s.syntheticBeatCount || 0) + 1;

          const pattern: Array<"bass" | "mid" | "treble"> = ["bass", "mid", "bass", "treble"];
          const beatType = pattern[s.syntheticBeatCount % pattern.length];

          emitBeat({
            timestamp,
            beatType,
            intensity: 0.7 + Math.random() * 0.3,
            source: "realtime-fft",
          });
        }
        return;
      }

      let sub = 0, bass = 0, lowMids = 0, mids = 0, upperMids = 0, highs = 0;
      let subSum = 0; for (let i = 0; i <= 4; i++) subSum += data[i]; sub = subSum / 5 / 255;
      let bassSum = 0; for (let i = 5; i <= 12; i++) bassSum += data[i]; bass = bassSum / 8 / 255;
      let lowMidSum = 0; for (let i = 13; i <= 24; i++) lowMidSum += data[i]; lowMids = lowMidSum / 12 / 255;
      let midSum = 0; for (let i = 25; i <= 48; i++) midSum += data[i]; mids = midSum / 24 / 255;
      let upperMidSum = 0; for (let i = 49; i <= 80; i++) upperMidSum += data[i]; upperMids = upperMidSum / 32 / 255;
      let highSum = 0; for (let i = 81; i <= Math.min(180, data.length - 1); i++) highSum += data[i]; highs = highSum / Math.min(100, data.length - 81) / 255;

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
        // If multiple groups fire within this 16ms frame (simultaneous hit), pick the most surprising one
        triggeredGroups.sort((a, b) => b.maxRatio - a.maxRatio);
        const winner = triggeredGroups[0];
        
        emitBeat({
          timestamp: audioContext.audioCtx?.currentTime ? audioContext.audioCtx.currentTime * 1000 : performance.now(),
          beatType: winner.type,
          intensity: winner.intensity,
          source: 'realtime-fft'
        });
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [enabled, audioContext, emitBeat]);
}
