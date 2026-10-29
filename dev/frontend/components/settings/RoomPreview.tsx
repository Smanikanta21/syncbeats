"use client";

import { useEffect, useRef } from "react";
import { useSettings, type AppSettings, type GradientNode } from "../../hooks/useSettings";
import { DEFAULT_NODE_POSITIONS, AUDIO_BAND_NAMES } from "./presets";

const PREVIEW_NODES: GradientNode[] = [
  { id: "1", color: "#8b5cf6", position: 0 },
  { id: "2", color: "#ec4899", position: 50 },
  { id: "3", color: "#3b82f6", position: 100 },
];

export function RoomPreview({
  onInteractionStateChange,
  onUpdateSettings,
}: {
  onInteractionStateChange?: (interacting: boolean) => void;
  onUpdateSettings?: (updates: Partial<AppSettings>) => void;
}) {
  const { settings, updateSettings: rawUpdateSettings } = useSettings();
  const updateSettings = onUpdateSettings || rawUpdateSettings;
  const containerRef = useRef<HTMLDivElement>(null);
  // refs for each blob element so we can animate them imperatively
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);

  const nodes = settings.gradientSettings?.nodes || PREVIEW_NODES;

  const count = nodes.length;
  const defaultLayout = DEFAULT_NODE_POSITIONS[count] || DEFAULT_NODE_POSITIONS[3];

  // ── Demo Beat Animation ────────────────────────────────────────────────
  // Drives each blob with a staggered synthetic beat so the modal preview
  // looks alive even when no audio is playing.
  useEffect(() => {
    const BPM = 118;          // synthetic BPM for the demo
    const BEAT_MS = 60000 / BPM;
    let rafId: number;
    let startTime: number | null = null;

    // Per-blob: beat hit time, decay value
    const peakHold = new Array(6).fill(0);
    const phases   = [0, 0.5, 1.0, 1.5, 0.25, 0.75]; // stagger beats across bands

    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;

      const bMult = (settings.ambientBrightness || 100) / 100;
      const cMult = (settings.ambientContrast  || 100) / 100;

      for (let i = 0; i < count; i++) {
        const el = blobRefs.current[i];
        if (!el) continue;

        const node = nodes[i];
        const phaseMs = phases[i] * BEAT_MS;
        const beatPos = ((elapsed + phaseMs) % BEAT_MS) / BEAT_MS; // 0..1 within beat

        // Sharp attack on beat 0, exponential decay
        const isHit = beatPos < 0.08;
        if (isHit) peakHold[i] = Math.min(1, peakHold[i] + 0.9);
        peakHold[i] *= 0.92; // decay

        const v = peakHold[i];
        // Quadratic scale: strong hits feel harder
        const scale = 1 + v * v * 0.4;
        const opacity = (0.65 + v * v * 0.35) * bMult;

        el.style.transform = `translate(-50%, -50%) scale(${scale})`;
        el.style.opacity = `${Math.min(0.98, opacity)}`;
        el.style.filter = `brightness(${bMult + v * 0.4}) contrast(${cMult}) saturate(${cMult + v * 0.4}) drop-shadow(0 0 25px ${node.color})`;
        el.style.background = `radial-gradient(circle, ${node.color} 0%, ${node.color} 30%, transparent 75%)`;
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [count, nodes, settings.ambientBrightness, settings.ambientContrast]);

  const startDrag = (nodeIdx: number) => (e: React.PointerEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const targetEl = e.currentTarget as HTMLElement;
    try {
      targetEl.setPointerCapture(e.pointerId);
    } catch {}

    onInteractionStateChange?.(true);

    const rect = containerRef.current.getBoundingClientRect();
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      const xPct = Math.max(5, Math.min(95, Math.round(((moveEvent.clientX - rect.left) / rect.width) * 100)));
      const yPct = Math.max(5, Math.min(95, Math.round(((moveEvent.clientY - rect.top) / rect.height) * 100)));

      const updatedNodes = nodes.map((n, idx) =>
        idx === nodeIdx ? { ...n, x: xPct, y: yPct, position: xPct } : n
      );

      const updatedAmbientPos = {
        sub: settings.ambientPositions?.sub || { x: 20, y: 25 },
        bass: settings.ambientPositions?.bass || { x: 80, y: 25 },
        lowMid: settings.ambientPositions?.lowMid || { x: 20, y: 75 },
        mid: settings.ambientPositions?.mid || { x: 80, y: 75 },
        upperMid: settings.ambientPositions?.upperMid || { x: 50, y: 20 },
        high: settings.ambientPositions?.high || { x: 50, y: 80 },
      };
      const bands: ('sub' | 'bass' | 'lowMid' | 'mid' | 'upperMid' | 'high')[] = ['sub', 'bass', 'lowMid', 'mid', 'upperMid', 'high'];
      if (bands[nodeIdx]) {
        updatedAmbientPos[bands[nodeIdx]] = { x: xPct, y: yPct };
      }

      updateSettings({
        gradientSettings: { ...settings.gradientSettings, nodes: updatedNodes },
        ambientPositions: updatedAmbientPos
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      try {
        targetEl.releasePointerCapture(upEvent.pointerId);
      } catch {}

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      onInteractionStateChange?.(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div ref={containerRef} className="w-full aspect-video max-h-85 rounded-3xl relative overflow-hidden bg-[#0A0D14] border border-white/8 shadow-[inset_0_2px_10px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.5)] flex flex-col justify-between p-3 select-none mb-6">

      {/* Glowing Ambient Background Blobs — animated by demo beat rAF loop */}
      {nodes.map((node, idx) => {
        const posX = node.x ?? defaultLayout[idx]?.x ?? (20 + idx * 25);
        const posY = node.y ?? defaultLayout[idx]?.y ?? (35 + (idx % 2) * 30);
        const bMult = (settings.ambientBrightness || 100) / 100;
        const baseOp = Math.min(0.95, Math.max(0.15, 0.38 * bMult));
        return (
          <div
            key={`blob-${node.id}-${idx}`}
            ref={(el) => { blobRefs.current[idx] = el; }}
            className="absolute rounded-full blur-[45px] w-[50%] aspect-square pointer-events-none will-change-transform"
            style={{
              left: `${posX}%`,
              top: `${posY}%`,
              transform: 'translate(-50%, -50%)',
              opacity: baseOp,
              background: `radial-gradient(circle, ${node.color} 0%, transparent 70%)`
            }}
          />
        );
      })}

      {/* Interactive Drag Handles for Lights matching EXACT NODE COLORS */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {/* Helper instruction text */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/15 rounded-full px-3 py-1 text-[8px] font-semibold text-white/80 backdrop-blur-md shadow-lg">
          ✦ Drag Nodes to Reposition Light Blobs ✦
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const resetNodes = nodes.map((n, idx) => ({
              ...n,
              x: defaultLayout[idx]?.x ?? (20 + idx * 25),
              y: defaultLayout[idx]?.y ?? (35 + (idx % 2) * 30),
            }));
            updateSettings({
              gradientSettings: { ...settings.gradientSettings, nodes: resetNodes }
            });
          }}
          className="absolute bottom-2 right-2 z-30 bg-black/85 hover:bg-black text-white/80 hover:text-white border border-white/20 px-2.5 py-1 rounded-xl text-[8px] font-bold transition-all pointer-events-auto shadow-md"
        >
          Reset Positions
        </button>

        {nodes.map((node, idx) => {
          const posX = node.x ?? defaultLayout[idx]?.x ?? (20 + idx * 25);
          const posY = node.y ?? defaultLayout[idx]?.y ?? (35 + (idx % 2) * 30);
          const bandNames = AUDIO_BAND_NAMES[count] || AUDIO_BAND_NAMES[3];
          const bandName = bandNames[idx] || `Band ${idx + 1}`;
          return (
            <div
              key={`handle-${node.id}-${idx}`}
              onPointerDown={startDrag(idx)}
              className="absolute w-7 h-7 -ml-3.5 -mt-3.5 rounded-full border bg-black/90 flex items-center justify-center pointer-events-auto cursor-grab active:cursor-grabbing shadow-2xl select-none touch-none z-30 group"
              style={{
                left: `${posX}%`,
                top: `${posY}%`,
                borderColor: node.color,
                boxShadow: `0 0 16px ${node.color}`
              }}
            >
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{
                  background: node.color,
                  boxShadow: `0 0 10px ${node.color}`
                }}
              />

              {/* Band Label Pill */}
              <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white/90 border border-white/20 rounded-lg px-2 py-0.5 text-[8px] font-semibold whitespace-nowrap shadow-xl pointer-events-none backdrop-blur-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: node.color }} />
                <span>{bandName} ({posX}%, {posY}%)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Overlay Line */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#090c13_95%)] pointer-events-none" />

      {/* Room UI Mockup */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between pointer-events-none opacity-90">

        {/* Center Spatial Room Grid Visual Mockup (Clean wireframe without dark backdrop blur box) */}
        <div className="flex-1 w-full flex items-center justify-center relative my-1">
          <div className="w-[85%] h-full border border-white/10 rounded-2xl relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-40 h-40 rounded-full border border-white/5 animate-ping opacity-20" />
              <div className="w-24 h-24 rounded-full border border-white/10" />
            </div>
          </div>
        </div>

        {/* Bottom Playbar Mockup */}
        <div className="w-full h-6 rounded-xl bg-black/80 border border-white/10 px-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-violet-500/40 border border-violet-500/60" />
            <div className="flex flex-col">
              <div className="w-12 h-1 rounded bg-white/40" />
              <div className="w-8 h-1 rounded bg-white/20 mt-0.5" />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <div className="w-3 h-3 rounded-full bg-white/80 flex items-center justify-center">
              <div className="w-1 h-1 bg-black rounded-sm" />
            </div>
            <div className="w-2 h-2 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
