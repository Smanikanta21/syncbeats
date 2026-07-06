"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { Activity } from "lucide-react";
import { useVisualizer } from "../../context/VisualizerContext";

interface RoomVisualizerProps {
  isPlaying: boolean;
  hasTrack: boolean;
}

export function RoomVisualizer({ isPlaying, hasTrack }: RoomVisualizerProps) {
  const { dataRef } = useVisualizer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const smoothedRef = useRef<Float32Array>(new Float32Array(128).fill(0));
  const phaseRef = useRef(0);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    const to = setTimeout(handleResize, 100);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(to);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const data = dataRef.current.rawAudioData;
    const smoothed = smoothedRef.current;

    // Smooth the audio data for flowing feel
    for (let i = 0; i < 128; i++) {
      const raw = data ? (data[i] ?? 0) / 255 : 0;
      const target = hasTrack ? raw : 0;
      if (target > smoothed[i]) {
        smoothed[i] += (target - smoothed[i]) * 0.4; // snappy attack
      } else {
        smoothed[i] += (target - smoothed[i]) * 0.06; // slow decay
      }
    }

    // Advance phase for flowing wave motion
    phaseRef.current += 0.015;
    const phase = phaseRef.current;

    const centerY = h * 0.5;
    const maxAmp = h * 0.38;

    // Draw 3 flowing wave layers (like Samsung)
    const layers = [
      { bins: [0, 8], color: "rgba(139, 92, 246, 0.6)", width: 2.5, phaseOff: 0, ampScale: 1.0 },     // violet - bass
      { bins: [8, 32], color: "rgba(56, 189, 248, 0.45)", width: 2, phaseOff: 1.2, ampScale: 0.75 },    // cyan - mids
      { bins: [32, 80], color: "rgba(232, 121, 249, 0.35)", width: 1.5, phaseOff: 2.4, ampScale: 0.55 }, // pink - highs
    ];

    // Draw glow layer behind all waves
    for (const layer of layers) {
      const { bins, phaseOff, ampScale } = layer;
      let bandAvg = 0;
      for (let i = bins[0]; i < bins[1]; i++) bandAvg += smoothed[i];
      bandAvg /= (bins[1] - bins[0]);

      // Gentle glow underneath
      const glowGrad = ctx.createRadialGradient(w / 2, centerY, 0, w / 2, centerY, w * 0.5);
      glowGrad.addColorStop(0, layer.color.replace(/[\d.]+\)$/, `${bandAvg * 0.15})`));
      glowGrad.addColorStop(1, "transparent");
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);
    }

    // Draw each wave layer
    for (const layer of layers) {
      const { bins, color, width, phaseOff, ampScale } = layer;

      // Average amplitude for this frequency band
      let bandAvg = 0;
      for (let i = bins[0]; i < bins[1]; i++) bandAvg += smoothed[i];
      bandAvg /= (bins[1] - bins[0]);

      // Number of sample points along the wave
      const points = 80;

      // Build the wave path using cubic interpolation
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const x = t * w;

        // Map t to a bin index within this band's range
        const binFloat = bins[0] + t * (bins[1] - bins[0]);
        const binLow = Math.floor(binFloat);
        const binHigh = Math.min(binLow + 1, bins[1] - 1);
        const frac = binFloat - binLow;
        const localAmp = smoothed[binLow] * (1 - frac) + smoothed[binHigh] * frac;

        // Combine local amplitude with flowing sine waves for organic movement
        const flow1 = Math.sin(t * Math.PI * 3 + phase + phaseOff) * 0.4;
        const flow2 = Math.sin(t * Math.PI * 5 - phase * 0.7 + phaseOff) * 0.25;
        const flow3 = Math.sin(t * Math.PI * 1.5 + phase * 0.4 + phaseOff) * 0.35;

        // Edge fade: taper at both ends for smooth entry/exit
        const edgeFade = Math.sin(t * Math.PI);

        const amp = (localAmp * 0.6 + bandAvg * 0.4) * ampScale;
        const y = centerY + (flow1 + flow2 + flow3) * amp * maxAmp * edgeFade;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      // Draw mirrored wave below (subtle reflection)
      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        const x = t * w;

        const binFloat = bins[0] + t * (bins[1] - bins[0]);
        const binLow = Math.floor(binFloat);
        const binHigh = Math.min(binLow + 1, bins[1] - 1);
        const frac = binFloat - binLow;
        const localAmp = smoothed[binLow] * (1 - frac) + smoothed[binHigh] * frac;

        const flow1 = Math.sin(t * Math.PI * 3 + phase + phaseOff) * 0.4;
        const flow2 = Math.sin(t * Math.PI * 5 - phase * 0.7 + phaseOff) * 0.25;
        const flow3 = Math.sin(t * Math.PI * 1.5 + phase * 0.4 + phaseOff) * 0.35;

        const edgeFade = Math.sin(t * Math.PI);
        const amp = (localAmp * 0.6 + bandAvg * 0.4) * ampScale;
        const y = centerY - (flow1 + flow2 + flow3) * amp * maxAmp * edgeFade;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${parseFloat(color.match(/[\d.]+\)$/)?.[0] ?? "0.3") * 0.4})`);
      ctx.lineWidth = width * 0.7;
      ctx.stroke();
    }

    // Idle breathing animation when not playing
    if (!hasTrack) {
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = i / 80;
        const x = t * w;
        const breath = Math.sin(t * Math.PI * 2 + phase) * 3 + Math.sin(t * Math.PI * 4 - phase * 0.5) * 1.5;
        const edgeFade = Math.sin(t * Math.PI);
        const y = centerY + breath * edgeFade;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(139, 92, 246, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [hasTrack, dataRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Activity className="w-3.5 h-3.5 text-foreground/40" />
        <h3 className="text-[10px] font-black tracking-widest uppercase text-foreground/40">Visualizer</h3>
      </div>
      
      <div className="flex-1 min-h-0 w-full relative rounded-xl overflow-hidden">
        {!hasTrack && (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/20 text-[9px] font-black uppercase tracking-widest z-10">
            Waiting for audio
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}
