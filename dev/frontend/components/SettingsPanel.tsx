import { useState, useEffect, useRef, useCallback } from "react";
import { X, Sliders, Palette, Zap, Save, RefreshCw, Check, Sun, Radio, Smartphone, Sparkles, Plus, Trash2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSettings, GradientNode, DEFAULT_SETTINGS, type AppSettings } from "../hooks/useSettings";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";

interface SettingsPanelProps {
  onClose?: () => void;
  onlyVisuals?: boolean;
  onInteractionStateChange?: (interacting: boolean) => void;
  isEmbedded?: boolean;
}

const DEFAULT_NODE_POSITIONS: Record<number, { x: number; y: number }[]> = {
  2: [
    { x: 25, y: 45 },
    { x: 75, y: 45 },
  ],
  3: [
    { x: 20, y: 35 },
    { x: 80, y: 35 },
    { x: 50, y: 75 },
  ],
  4: [
    { x: 20, y: 30 },
    { x: 80, y: 30 },
    { x: 20, y: 70 },
    { x: 80, y: 70 },
  ],
  5: [
    { x: 15, y: 25 },
    { x: 85, y: 25 },
    { x: 50, y: 50 },
    { x: 20, y: 75 },
    { x: 85, y: 75 },
  ],
  6: [
    { x: 50, y: 12 },
    { x: 18, y: 35 },
    { x: 18, y: 65 },
    { x: 82, y: 35 },
    { x: 82, y: 65 },
    { x: 50, y: 88 },
  ],
};

const AUDIO_BAND_NAMES: Record<number, string[]> = {
  2: ["Bass", "Treble"],
  3: ["Bass", "Mids", "Treble"],
  4: ["Sub Bass", "Low Mids", "Upper Mids", "Treble"],
  5: ["Sub Bass", "Punch Bass", "Warm Mids", "Vocal Lead", "Treble"],
  6: ["Sub Bass", "Bass", "Low Mids", "Mids", "Upper Mids", "Highs"],
};

function hexToHue(hex: string): number {
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

function RoomPreview({ 
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

  const nodes = settings.gradientSettings?.nodes || [
    { id: "1", color: "#8b5cf6", position: 0 },
    { id: "2", color: "#ec4899", position: 50 },
    { id: "3", color: "#3b82f6", position: 100 }
  ];

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
    <div ref={containerRef} className={cn('w-full', 'aspect-[16/9]', 'max-h-[340px]', 'rounded-3xl', 'relative', 'overflow-hidden', 'bg-[#0A0D14]', 'border', 'border-white/[0.08]', 'shadow-[inset_0_2px_10px_rgba(0,0,0,0.8),0_10px_30px_rgba(0,0,0,0.5)]', 'flex', 'flex-col', 'justify-between', 'p-3', 'select-none', 'mb-6')}>
      
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
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/15 rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-widest text-white/80 backdrop-blur-md shadow-lg">
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
          className="absolute bottom-2 right-2 z-30 bg-black/85 hover:bg-black text-white/80 hover:text-white border border-white/20 px-2.5 py-1 rounded-xl text-[8px] font-bold uppercase tracking-wider transition-all pointer-events-auto shadow-md"
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
              <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-black/90 text-white/90 border border-white/20 rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-wider whitespace-nowrap shadow-xl pointer-events-none backdrop-blur-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: node.color }} />
                <span>{bandName} ({posX}%, {posY}%)</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Overlay Line */}
      <div className={cn('absolute', 'inset-0', 'bg-[radial-gradient(ellipse_at_center,transparent_20%,#090c13_95%)]', 'pointer-events-none')} />

      {/* Room UI Mockup */}
      <div className={cn('relative', 'z-10', 'w-full', 'h-full', 'flex', 'flex-col', 'justify-between', 'pointer-events-none', 'opacity-90')}>
        
        {/* Header Row */}
        <div className={cn('flex', 'items-center', 'justify-between', 'w-full', 'h-4', 'px-1', 'shrink-0')}>
          {/* Room Info */}
          <div className={cn('flex', 'items-center', 'gap-1')}>
            <div className={cn('w-1.5', 'h-1.5', 'rounded-full', 'bg-emerald-500', 'animate-pulse')} />
            <span className={cn('text-[6px]', 'font-black', 'text-white/50', 'tracking-wider')}>ROOM: 798591</span>
          </div>
          {/* Mini Dynamic Island */}
          <div className={cn('px-2', 'py-0.5', 'rounded-full', 'bg-black/85', 'border', 'border-white/10', 'flex', 'items-center', 'gap-1', 'scale-[0.85]', 'shrink-0')}>
            <div className={cn('w-1', 'h-1', 'rounded-full', 'bg-emerald-500')} />
            <div className={cn('w-2', 'h-1', 'flex', 'gap-[0.5px]', 'items-center')}>
              <div className={cn('w-[0.5px]', 'h-0.5', 'bg-white/60', 'animate-pulse')} />
              <div className={cn('w-[0.5px]', 'h-1', 'bg-white/80')} />
              <div className={cn('w-[0.5px]', 'h-0.5', 'bg-white/60', 'animate-pulse')} />
            </div>
            <span className={cn('text-[4px]', 'font-bold', 'text-white/90')}>Calling</span>
          </div>
          {/* Controls Placeholder */}
          <div className={cn('w-4', 'h-1.5', 'rounded', 'bg-white/10')} />
        </div>

        {/* Center Spatial Room Grid Visual Mockup (Clean wireframe without dark backdrop blur box) */}
        <div className={cn('flex-1', 'w-full', 'flex', 'items-center', 'justify-center', 'relative', 'my-1')}>
          <div className={cn('w-[85%]', 'h-full', 'border', 'border-white/10', 'rounded-2xl', 'relative', 'flex', 'items-center', 'justify-center')}>
            <div className={cn('absolute', 'inset-0', 'flex', 'items-center', 'justify-center', 'pointer-events-none')}>
              <div className={cn('w-40', 'h-40', 'rounded-full', 'border', 'border-white/5', 'animate-ping', 'opacity-20')} />
              <div className={cn('w-24', 'h-24', 'rounded-full', 'border', 'border-white/10')} />
            </div>
          </div>
        </div>

        {/* Bottom Playbar Mockup */}
        <div className={cn('w-full', 'h-6', 'rounded-xl', 'bg-black/80', 'border', 'border-white/10', 'px-2', 'flex', 'items-center', 'justify-between', 'shrink-0')}>
          <div className={cn('flex', 'items-center', 'gap-1.5')}>
            <div className={cn('w-3', 'h-3', 'rounded', 'bg-violet-500/40', 'border', 'border-violet-500/60')} />
            <div className={cn('flex', 'flex-col')}>
              <div className={cn('w-12', 'h-1', 'rounded', 'bg-white/40')} />
              <div className={cn('w-8', 'h-1', 'rounded', 'bg-white/20', 'mt-0.5')} />
            </div>
          </div>
          <div className={cn('flex', 'items-center', 'gap-1')}>
            <div className={cn('w-2', 'h-2', 'rounded-full', 'bg-white/20')} />
            <div className={cn('w-3', 'h-3', 'rounded-full', 'bg-white/80', 'flex', 'items-center', 'justify-center')}>
              <div className={cn('w-1', 'h-1', 'bg-black', 'rounded-sm')} />
            </div>
            <div className={cn('w-2', 'h-2', 'rounded-full', 'bg-white/20')} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPanel({
  onClose,
  onlyVisuals = false,
  onInteractionStateChange,
  isEmbedded = false,
}: SettingsPanelProps) {
  const { settings, updateSettings: rawUpdateSettings } = useSettings();
  const { user, updateSettings: saveDbSettings } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const baselineSettingsRef = useRef<string>(JSON.stringify(settings));

  const isDev = process.env.NEXT_PUBLIC_ENV !== "production" && (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENV === "development");
  const liquidMotion = settings.liquidMotion ?? true;
  const showSpatialCanvas = isDev || !liquidMotion;

  // If user hasn't edited anything yet, update baseline whenever settings sync from DB/auth
  useEffect(() => {
    if (!hasUserEdited) {
      baselineSettingsRef.current = JSON.stringify(settings);
    }
  }, [settings, hasUserEdited]);

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setHasUserEdited(true);
    rawUpdateSettings(updates);
  }, [rawUpdateSettings]);

  const isDirty = hasUserEdited && JSON.stringify(settings) !== baselineSettingsRef.current;

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedPrompt(true);
    } else if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    if (!isInteracting) return;
    const handleUp = () => {
      setIsInteracting(false);
      onInteractionStateChange?.(false);
    };
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [isInteracting, onInteractionStateChange]);

  const handleSaveToCloud = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await saveDbSettings(settings);
      baselineSettingsRef.current = JSON.stringify(settings);
      setHasUserEdited(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error("Failed to save settings to cloud", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    updateSettings(DEFAULT_SETTINGS);
  };
  
  const PALETTES_BY_COUNT: Record<number, { name: string; colors: any; brightness: number; contrast: number; }[]> = {
    3: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 240 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Miami Neon",
        colors: { subHue: 320, bassHue: 180, lowMidHue: 40, midHue: 320, upperMidHue: 200, highHue: 270 },
        brightness: 110,
        contrast: 130
      },
      {
        name: "Fire & Ice",
        colors: { subHue: 320, bassHue: 15, lowMidHue: 40, midHue: 190, upperMidHue: 200, highHue: 240 },
        brightness: 100,
        contrast: 120
      },
      {
        name: "Golden Hour",
        colors: { subHue: 320, bassHue: 25, lowMidHue: 40, midHue: 355, upperMidHue: 200, highHue: 280 },
        brightness: 115,
        contrast: 110
      },
      {
        name: "Organic Sage",
        colors: { subHue: 320, bassHue: 130, lowMidHue: 40, midHue: 160, upperMidHue: 200, highHue: 45 },
        brightness: 100,
        contrast: 100
      }
    ],
    4: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Retrowave Grid",
        colors: { subHue: 320, bassHue: 270, lowMidHue: 40, midHue: 210, upperMidHue: 200, highHue: 25 },
        brightness: 120,
        contrast: 140
      },
      {
        name: "Volcanic Dusk",
        colors: { subHue: 355, bassHue: 290, lowMidHue: 40, midHue: 20, upperMidHue: 200, highHue: 50 },
        brightness: 110,
        contrast: 115
      },
      {
        name: "Northern Lights",
        colors: { subHue: 190, bassHue: 280, lowMidHue: 40, midHue: 140, upperMidHue: 200, highHue: 230 },
        brightness: 100,
        contrast: 110
      },
      {
        name: "Cotton Candy",
        colors: { subHue: 200, bassHue: 270, lowMidHue: 40, midHue: 330, upperMidHue: 200, highHue: 20 },
        brightness: 120,
        contrast: 100
      }
    ],
    5: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Tokio Drift",
        colors: { subHue: 330, bassHue: 280, lowMidHue: 40, midHue: 180, upperMidHue: 250, highHue: 65 },
        brightness: 120,
        contrast: 140
      },
      {
        name: "Sherbet Sunrise",
        colors: { subHue: 25, bassHue: 350, lowMidHue: 40, midHue: 5, upperMidHue: 50, highHue: 335 },
        brightness: 115,
        contrast: 115
      },
      {
        name: "Cyber Forest",
        colors: { subHue: 140, bassHue: 90, lowMidHue: 40, midHue: 200, upperMidHue: 240, highHue: 310 },
        brightness: 100,
        contrast: 120
      },
      {
        name: "Midnight Mirage",
        colors: { subHue: 160, bassHue: 320, lowMidHue: 40, midHue: 220, upperMidHue: 250, highHue: 280 },
        brightness: 95,
        contrast: 125
      }
    ],
    6: [
      {
        name: "Default",
        colors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Rainbow Spectrum",
        colors: { subHue: 0, bassHue: 300, lowMidHue: 240, midHue: 35, upperMidHue: 120, highHue: 180 },
        brightness: 100,
        contrast: 100
      },
      {
        name: "Neon Oasis",
        colors: { subHue: 90, bassHue: 165, lowMidHue: 350, midHue: 200, upperMidHue: 250, highHue: 310 },
        brightness: 120,
        contrast: 135
      },
      {
        name: "Desert Horizon",
        colors: { subHue: 345, bassHue: 355, lowMidHue: 275, midHue: 45, upperMidHue: 30, highHue: 15 },
        brightness: 110,
        contrast: 115
      },
      {
        name: "Glacial Dream",
        colors: { subHue: 210, bassHue: 150, lowMidHue: 325, midHue: 175, upperMidHue: 230, highHue: 260 },
        brightness: 105,
        contrast: 110
      }
    ]
  };

  const activeLightCount = settings.activeLightCount || 3;
  const currentPalettes = PALETTES_BY_COUNT[activeLightCount] || PALETTES_BY_COUNT[3];

  return (
    <div className={cn('flex', 'flex-col', 'h-full', 'w-full', 'min-h-0', 'relative')}>
      {/* ── Sticky App Settings Header Bar with Floating Dialogue Box ── */}
      <div className={cn('sticky', 'top-0', 'z-40', 'w-full', 'bg-background/80', 'dark:bg-black/80', 'backdrop-blur-3xl', 'py-3', 'px-4', 'mb-3', 'rounded-3xl', 'border', 'border-foreground/15', 'shadow-2xl', 'flex', 'items-center', 'justify-between', 'transition-all')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <Sliders className="w-5 h-5 text-foreground/80 shrink-0" />
          <h2 className={cn('text-xl', 'sm:text-2xl', 'font-black', 'text-foreground', 'truncate')}>{onlyVisuals ? 'Room Visuals' : 'App Settings'}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* ── Conditional Unsaved Changes Floating Dialogue Capsule ── */}
          <AnimatePresence>
            {isDirty && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -8 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-foreground/10 dark:bg-white/10 backdrop-blur-3xl border border-foreground/20 dark:border-white/20 shadow-2xl shrink-0"
              >
                <span className="hidden md:inline-block text-[10px] font-black uppercase tracking-wider text-amber-400 animate-pulse mr-1">
                  Unsaved Changes
                </span>

                {/* Default Settings Button */}
                <button
                  onClick={handleRestoreDefaults}
                  className="px-2.5 py-1.5 rounded-xl bg-foreground/10 hover:bg-foreground/20 text-foreground font-bold text-xs transition-all active:scale-95 border border-foreground/15 flex items-center gap-1.5 shrink-0"
                  title="Reset to default system settings"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-foreground/70" />
                  <span className="hidden sm:inline">Default Settings</span>
                </button>

                {/* Save Changes Button */}
                <button
                  onClick={handleSaveToCloud}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-all active:scale-95 border border-emerald-400/30 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 shrink-0"
                >
                  {isSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>{isSaving ? "Saving..." : saveSuccess ? "Saved!" : "Save Changes"}</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {onClose && (
            <button
              type="button"
              onClick={handleCloseAttempt}
              className="p-2 rounded-full hover:bg-foreground/10 active:bg-foreground/20 text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div 
        className={cn(
          'space-y-6 mt-2',
          isEmbedded
            ? 'w-full'
            : 'flex-1 min-h-0 overflow-y-auto pr-2 custom-scrollbar pb-10 overscroll-contain'
        )} 
        {...(!isEmbedded && { 'data-lenis-prevent': 'true' })}
      >
        
        {/* Gradient & Lighting Theme Editor */}
        <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
          <div className={cn('flex', 'items-center', 'justify-between', 'mb-2')}>
            <div className={cn('flex', 'items-center', 'gap-2')}>
              <Palette className={cn('w-5', 'h-5', 'text-foreground/70')} />
              <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Theme & Gradient Editor</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-foreground/10 text-foreground/70 border border-foreground/10">
              {settings.gradientSettings?.presetName || "Custom Theme"}
            </span>
          </div>

          <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
            Select a pro palette preset or customize gradient color stops to dynamically style your room's ambient lighting and visualizer background.
          </p>

          {/* Interactive Demo Room Canvas with Draggable 2D Light Nodes (Development or Static Node Mode Only) */}
          {showSpatialCanvas && (
            <div className="mb-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1.5 flex items-center justify-between">
                <span>Interactive Demo Room Screen (Spatial Lighting)</span>
                <span className="text-[9px] text-foreground/50 font-bold uppercase">Drag Nodes to Reposition</span>
              </div>
              <RoomPreview
                onInteractionStateChange={onInteractionStateChange}
                onUpdateSettings={updateSettings}
              />
            </div>
          )}

          {/* Live Gradient Preview Bar */}
          <div className="mb-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-1.5 flex items-center justify-between">
              <span>Live Gradient Preview</span>
              <span className="font-mono text-foreground/50">
                {(settings.gradientSettings?.nodes || []).length} Color Stops
              </span>
            </div>
            <div 
              className="w-full h-14 rounded-2xl border border-foreground/15 shadow-inner transition-all duration-500 relative overflow-hidden"
              style={{
                background: `linear-gradient(90deg, ${(settings.gradientSettings?.nodes || [
                  { id: "1", color: "#8b5cf6", position: 0 },
                  { id: "2", color: "#ec4899", position: 50 },
                  { id: "3", color: "#3b82f6", position: 100 }
                ]).map(n => `${n.color} ${n.position}%`).join(', ')})`
              }}
            />
          </div>

          {/* Ambient Lighting Intensity & Contrast Controls */}
          <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-foreground/[0.03] border border-foreground/10">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-400" /> Ambient Light Brightness
                </span>
                <span className="font-mono text-[10px] text-foreground/50">{settings.ambientBrightness || 100}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                value={settings.ambientBrightness || 100}
                onChange={(e) => updateSettings({ ambientBrightness: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(to right, #34d399 0%, #34d399 ${((settings.ambientBrightness || 100) - 20) / 1.8}%, rgba(255, 255, 255, 0.15) ${((settings.ambientBrightness || 100) - 20) / 1.8}%, rgba(255, 255, 255, 0.15) 100%)`
                }}
                className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(52,211,153,0.9)]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" /> Color Contrast & Saturation
                </span>
                <span className="font-mono text-[10px] text-foreground/50">{settings.ambientContrast || 100}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={settings.ambientContrast || 100}
                onChange={(e) => updateSettings({ ambientContrast: Number(e.target.value) })}
                style={{
                  background: `linear-gradient(to right, #a855f7 0%, #a855f7 ${((settings.ambientContrast || 100) - 50) / 1.5}%, rgba(255, 255, 255, 0.15) ${((settings.ambientContrast || 100) - 50) / 1.5}%, rgba(255, 255, 255, 0.15) 100%)`
                }}
                className="w-full h-1.5 rounded-full appearance-none outline-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(168,85,247,0.9)]"
              />
            </div>
          </div>

          {/* Audio Visualizer Debug Overlay (HUD) Toggle Switch (Dev Only) */}
          {process.env.NEXT_PUBLIC_ENV !== "production" && process.env.NODE_ENV === "development" && (
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/10 mb-5">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="text-xs font-bold text-foreground">Audio Visualizer Debug HUD Overlay (Dev)</span>
                </div>
                <p className="text-[10px] text-foreground/50">
                  Live 6-band FFT energies, beat thresholds & onsets. (Hotkey: <kbd className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-[9px] text-foreground/80">Shift + D</kbd>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => updateSettings({ showDebugAudio: !settings.showDebugAudio })}
                className={cn(
                  "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5 shrink-0",
                  settings.showDebugAudio ? "bg-cyan-500 border-cyan-400" : "bg-foreground/10"
                )}
              >
                <div
                  className={cn(
                    "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                    settings.showDebugAudio ? "translate-x-6" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          )}

          {/* Auto Liquid Motion Drift Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/10 mb-5">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-foreground">Auto Liquid Motion Drift</span>
              </div>
              <span className="text-[10px] text-foreground/50 mt-0.5 max-w-[280px]">
                Nodes smoothly glide and flow across the room like liquid lava in sync with the track's beat.
              </span>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ liquidMotion: !(settings.liquidMotion ?? true) })}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5 shrink-0",
                (settings.liquidMotion ?? true) ? "bg-amber-500 border-amber-400" : "bg-foreground/10"
              )}
            >
              <div
                className={cn(
                  "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                  (settings.liquidMotion ?? true) ? "translate-x-6" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Quick Color Count Presets Switcher */}
          <div className="mb-5 p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/10">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-foreground/50 block">
                Select Theme Palette Size
              </label>
              <span className="text-[9px] font-bold text-foreground/40 uppercase">
                2 to 6 Colors
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                { count: 2, label: "2 Colors" },
                { count: 3, label: "3 Colors" },
                { count: 4, label: "4 Colors" },
                { count: 5, label: "5 Colors" },
                { count: 6, label: "6 Colors" },
              ].map(({ count, label }) => {
                const currentCount = (settings.gradientSettings?.nodes || []).length;
                const isActive = currentCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      const existingNodes = settings.gradientSettings?.nodes || [];
                      const countPresets: Record<number, { name: string; nodes: GradientNode[] }[]> = {
                        2: [
                          { name: "Electric Violet", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#3b82f6", position: 100 }] },
                          { name: "Solar Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 100 }] },
                          { name: "Emerald Mist", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 100 }] },
                          { name: "Synth Wave", nodes: [{ id: "n1", color: "#a855f7", position: 0 }, { id: "n2", color: "#ec4899", position: 100 }] },
                        ],
                        3: [
                          { name: "Cyber Neon", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#ec4899", position: 50 }, { id: "n3", color: "#3b82f6", position: 100 }] },
                          { name: "Aurora Borealis", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 50 }, { id: "n3", color: "#8b5cf6", position: 100 }] },
                          { name: "Sunset Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 50 }, { id: "n3", color: "#a855f7", position: 100 }] },
                          { name: "Deep Ocean", nodes: [{ id: "n1", color: "#0284c7", position: 0 }, { id: "n2", color: "#3b82f6", position: 50 }, { id: "n3", color: "#6366f1", position: 100 }] },
                        ],
                        4: [
                          { name: "Spectrum Prism", nodes: [{ id: "n1", color: "#ef4444", position: 0 }, { id: "n2", color: "#f59e0b", position: 33 }, { id: "n3", color: "#10b981", position: 66 }, { id: "n4", color: "#3b82f6", position: 100 }] },
                          { name: "Hyperdrive", nodes: [{ id: "n1", color: "#ec4899", position: 0 }, { id: "n2", color: "#8b5cf6", position: 33 }, { id: "n3", color: "#3b82f6", position: 66 }, { id: "n4", color: "#06b6d4", position: 100 }] },
                          { name: "Forest Glow", nodes: [{ id: "n1", color: "#059669", position: 0 }, { id: "n2", color: "#10b981", position: 33 }, { id: "n3", color: "#84cc16", position: 66 }, { id: "n4", color: "#eab308", position: 100 }] },
                          { name: "Magma Core", nodes: [{ id: "n1", color: "#991b1b", position: 0 }, { id: "n2", color: "#dc2626", position: 33 }, { id: "n3", color: "#f97316", position: 66 }, { id: "n4", color: "#fbbf24", position: 100 }] },
                        ],
                        5: [
                          { name: "Tokyo Neon", nodes: [{ id: "n1", color: "#f43f5e", position: 0 }, { id: "n2", color: "#d946ef", position: 25 }, { id: "n3", color: "#8b5cf6", position: 50 }, { id: "n4", color: "#06b6d4", position: 75 }, { id: "n5", color: "#10b981", position: 100 }] },
                          { name: "Galaxy Cosmos", nodes: [{ id: "n1", color: "#4c1d95", position: 0 }, { id: "n2", color: "#7c3aed", position: 25 }, { id: "n3", color: "#2563eb", position: 50 }, { id: "n4", color: "#0d9488", position: 75 }, { id: "n5", color: "#059669", position: 100 }] },
                          { name: "Golden Horizon", nodes: [{ id: "n1", color: "#7c2d12", position: 0 }, { id: "n2", color: "#c2410c", position: 25 }, { id: "n3", color: "#ea580c", position: 50 }, { id: "n4", color: "#f59e0b", position: 75 }, { id: "n5", color: "#fef08a", position: 100 }] },
                        ],
                        6: [
                          { name: "Full Spectrum", nodes: [{ id: "n1", color: "#ef4444", position: 0 }, { id: "n2", color: "#f97316", position: 20 }, { id: "n3", color: "#eab308", position: 40 }, { id: "n4", color: "#10b981", position: 60 }, { id: "n5", color: "#3b82f6", position: 80 }, { id: "n6", color: "#a855f7", position: 100 }] },
                          { name: "Neon Hex", nodes: [{ id: "n1", color: "#f43f5e", position: 0 }, { id: "n2", color: "#d946ef", position: 20 }, { id: "n3", color: "#8b5cf6", position: 40 }, { id: "n4", color: "#06b6d4", position: 60 }, { id: "n5", color: "#10b981", position: 80 }, { id: "n6", color: "#84cc16", position: 100 }] },
                          { name: "Cosmic Array", nodes: [{ id: "n1", color: "#1e1b4b", position: 0 }, { id: "n2", color: "#4c1d95", position: 20 }, { id: "n3", color: "#7c3aed", position: 40 }, { id: "n4", color: "#ec4899", position: 60 }, { id: "n5", color: "#f97316", position: 80 }, { id: "n6", color: "#fbbf24", position: 100 }] },
                        ],
                      };

                      const targetPreset = countPresets[count]?.[0];
                      if (targetPreset) {
                        const updatedNodes = targetPreset.nodes.map((n, idx) => ({
                          ...n,
                          x: existingNodes[idx]?.x ?? DEFAULT_NODE_POSITIONS[count]?.[idx]?.x ?? (20 + idx * 25),
                          y: existingNodes[idx]?.y ?? DEFAULT_NODE_POSITIONS[count]?.[idx]?.y ?? (35 + (idx % 2) * 30),
                        }));
                        updateSettings({
                          activeLightCount: count,
                          gradientSettings: { presetName: targetPreset.name, nodes: updatedNodes },
                        });
                      }
                    }}
                    className={cn(
                      'py-2 px-3 rounded-xl text-center transition-all border font-bold text-xs',
                      isActive
                        ? 'bg-foreground text-background border-foreground shadow-md scale-[1.02]'
                        : 'bg-foreground/[0.03] text-foreground/70 border-foreground/10 hover:bg-foreground/10'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic Tailored Presets Grid */}
          <div className="mb-6 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block">
              {(settings.gradientSettings?.nodes || []).length}-Color Presets
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(() => {
                const currentCount = (settings.gradientSettings?.nodes || []).length;
                const presetsByCount: Record<number, { name: string; nodes: GradientNode[] }[]> = {
                  2: [
                    { name: "Electric Violet", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#3b82f6", position: 100 }] },
                    { name: "Solar Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 100 }] },
                    { name: "Emerald Mist", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 100 }] },
                    { name: "Synth Wave", nodes: [{ id: "n1", color: "#a855f7", position: 0 }, { id: "n2", color: "#ec4899", position: 100 }] },
                  ],
                  3: [
                    { name: "Cyber Neon", nodes: [{ id: "n1", color: "#8b5cf6", position: 0 }, { id: "n2", color: "#ec4899", position: 50 }, { id: "n3", color: "#3b82f6", position: 100 }] },
                    { name: "Aurora Borealis", nodes: [{ id: "n1", color: "#10b981", position: 0 }, { id: "n2", color: "#06b6d4", position: 50 }, { id: "n3", color: "#8b5cf6", position: 100 }] },
                    { name: "Sunset Flare", nodes: [{ id: "n1", color: "#f97316", position: 0 }, { id: "n2", color: "#ef4444", position: 50 }, { id: "n3", color: "#a855f7", position: 100 }] },
                    { name: "Deep Ocean", nodes: [{ id: "n1", color: "#0284c7", position: 0 }, { id: "n2", color: "#3b82f6", position: 50 }, { id: "n3", color: "#6366f1", position: 100 }] },
                  ],
                  4: [
                    { name: "Spectrum Prism", nodes: [{ id: "n1", color: "#ef4444", position: 0 }, { id: "n2", color: "#f59e0b", position: 33 }, { id: "n3", color: "#10b981", position: 66 }, { id: "n4", color: "#3b82f6", position: 100 }] },
                    { name: "Hyperdrive", nodes: [{ id: "n1", color: "#ec4899", position: 0 }, { id: "n2", color: "#8b5cf6", position: 33 }, { id: "n3", color: "#3b82f6", position: 66 }, { id: "n4", color: "#06b6d4", position: 100 }] },
                    { name: "Forest Glow", nodes: [{ id: "n1", color: "#059669", position: 0 }, { id: "n2", color: "#10b981", position: 33 }, { id: "n3", color: "#84cc16", position: 66 }, { id: "n4", color: "#eab308", position: 100 }] },
                    { name: "Magma Core", nodes: [{ id: "n1", color: "#991b1b", position: 0 }, { id: "n2", color: "#dc2626", position: 33 }, { id: "n3", color: "#f97316", position: 66 }, { id: "n4", color: "#fbbf24", position: 100 }] },
                  ],
                  5: [
                    { name: "Tokyo Neon", nodes: [{ id: "n1", color: "#f43f5e", position: 0 }, { id: "n2", color: "#d946ef", position: 25 }, { id: "n3", color: "#8b5cf6", position: 50 }, { id: "n4", color: "#06b6d4", position: 75 }, { id: "n5", color: "#10b981", position: 100 }] },
                    { name: "Galaxy Cosmos", nodes: [{ id: "n1", color: "#4c1d95", position: 0 }, { id: "n2", color: "#7c3aed", position: 25 }, { id: "n3", color: "#2563eb", position: 50 }, { id: "n4", color: "#0d9488", position: 75 }, { id: "n5", color: "#059669", position: 100 }] },
                    { name: "Golden Horizon", nodes: [{ id: "n1", color: "#7c2d12", position: 0 }, { id: "n2", color: "#c2410c", position: 25 }, { id: "n3", color: "#ea580c", position: 50 }, { id: "n4", color: "#f59e0b", position: 75 }, { id: "n5", color: "#fef08a", position: 100 }] },
                  ],
                };

                const activePresets = presetsByCount[currentCount] || presetsByCount[3];

                return activePresets.map((preset) => {
                  const isActive = settings.gradientSettings?.presetName === preset.name;
                  const gradientStr = `linear-gradient(90deg, ${preset.nodes.map(n => `${n.color} ${n.position}%`).join(', ')})`;

                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        const existingNodes = settings.gradientSettings?.nodes || [];
                        const updatedNodes = preset.nodes.map((n, idx) => ({
                          ...n,
                          x: existingNodes[idx]?.x ?? DEFAULT_NODE_POSITIONS[preset.nodes.length]?.[idx]?.x ?? (20 + idx * 25),
                          y: existingNodes[idx]?.y ?? DEFAULT_NODE_POSITIONS[preset.nodes.length]?.[idx]?.y ?? (35 + (idx % 2) * 30),
                        }));
                        updateSettings({
                          gradientSettings: { presetName: preset.name, nodes: updatedNodes },
                        });
                      }}
                      className={cn(
                        'p-2.5 rounded-2xl border transition-all flex flex-col gap-2 text-left relative overflow-hidden group',
                        isActive ? 'bg-foreground/10 border-foreground shadow-md scale-[1.02]' : 'bg-foreground/5 border-foreground/10 hover:border-foreground/20'
                      )}
                    >
                      <div className="w-full h-5 rounded-lg border border-foreground/10 shadow-sm" style={{ background: gradientStr }} />
                      <span className="text-xs font-bold text-foreground truncate">{preset.name}</span>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Color Picker, Rainbow Spectrum & Position Editor */}
          <div className="space-y-4 mb-5">
            <label className="text-[10px] font-black uppercase tracking-widest text-foreground/40 block">Custom Frequency Band Colors, Spectrum & Spatial Positions</label>
            <div className="space-y-3">
              {(settings.gradientSettings?.nodes || [
                { id: "1", color: "#8b5cf6", position: 0 },
                { id: "2", color: "#ec4899", position: 50 },
                { id: "3", color: "#3b82f6", position: 100 }
              ]).map((node, idx, arr) => {
                const currentHue = hexToHue(node.color);
                const bandNames = AUDIO_BAND_NAMES[arr.length] || AUDIO_BAND_NAMES[3];
                const bandName = bandNames[idx] || `Band ${idx + 1}`;
                return (
                  <div key={node.id} className="p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/10 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <label className="relative w-7 h-7 rounded-xl shadow-sm border border-foreground/20 cursor-pointer overflow-hidden shrink-0" style={{ background: node.color }}>
                          <input
                            type="color"
                            value={node.color}
                            onChange={(e) => {
                              const updated = (settings.gradientSettings?.nodes || []).map((n) =>
                                n.id === node.id ? { ...n, color: e.target.value } : n
                              );
                              updateSettings({
                                gradientSettings: { presetName: "Custom", nodes: updated },
                              });
                            }}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                        </label>
                        <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          {bandName}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        {(settings.gradientSettings?.nodes || []).length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (settings.gradientSettings?.nodes || []).filter((n) => n.id !== node.id);
                              updateSettings({
                                gradientSettings: { presetName: "Custom", nodes: updated },
                              });
                            }}
                            className="p-1 rounded-lg text-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title={`Delete ${bandName} Color`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Rainbow Color Spectrum Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] text-foreground/40 font-bold uppercase">
                        <span>Color Spectrum (Hue)</span>
                        <span className="font-mono">{currentHue}°</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={currentHue}
                        onChange={(e) => {
                          const newHue = Number(e.target.value);
                          const s = 85 / 100, l = 60 / 100;
                          const k = (n: number) => (n + newHue / 30) % 12;
                          const a = s * Math.min(l, 1 - l);
                          const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
                          const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
                          const hexColor = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;

                          const updated = (settings.gradientSettings?.nodes || []).map((n) =>
                            n.id === node.id ? { ...n, color: hexColor } : n
                          );
                          updateSettings({
                            gradientSettings: { presetName: "Custom", nodes: updated },
                          });
                        }}
                        className="w-full h-2.5 rounded-lg cursor-pointer appearance-none bg-transparent"
                        style={{
                          background: `linear-gradient(to right, #ef4444, #f97316, #eab308, #10b981, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)`
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {(settings.gradientSettings?.nodes || []).length < 6 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentNodes = settings.gradientSettings?.nodes || [];
                    const newNode: GradientNode = {
                      id: `node-${Date.now()}`,
                      color: "#ec4899",
                      position: 50,
                    };
                    updateSettings({
                      gradientSettings: {
                        presetName: "Custom",
                        nodes: [...currentNodes, newNode].sort((a, b) => a.position - b.position),
                      },
                    });
                  }}
                  className="w-full py-2.5 rounded-2xl border border-dashed border-foreground/20 text-xs font-bold text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-all flex items-center justify-center gap-1.5 mt-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Frequency Color
                </button>
              )}
            </div>
          </div>
          <div className={cn('mt-6')}>
            <button 
              onClick={() => updateSettings({
                gradientSettings: {
                  presetName: "Cyber Neon",
                  nodes: [
                    { id: "node-1", color: "#8b5cf6", position: 0 },
                    { id: "node-2", color: "#ec4899", position: 50 },
                    { id: "node-3", color: "#3b82f6", position: 100 },
                  ],
                },
                ambientColors: { subHue: 320, bassHue: 0, lowMidHue: 40, midHue: 120, upperMidHue: 200, highHue: 280 },
                ambientBrightness: 100,
                ambientContrast: 100
              })}
              className={cn('w-full', 'py-2.5', 'rounded-xl', 'bg-foreground/5', 'text-foreground/70', 'text-sm', 'font-bold', 'flex', 'items-center', 'justify-center', 'gap-2', 'hover:bg-foreground/10', 'transition', 'border', 'border-foreground/10')}
            >
              <RefreshCw className={cn('w-4', 'h-4')} /> Reset Default Theme
            </button>
          </div>
        </section>


        {!onlyVisuals && (
          /* Sync Settings */
          <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
            <div className={cn('flex', 'items-center', 'gap-2', 'mb-4')}>
              <Zap className={cn('w-5', 'h-5', 'text-foreground/70')} />
              <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Synchronization</h3>
            </div>
            
            <div className="space-y-6">
              <div>
                <div className={cn('flex', 'justify-between', 'mb-1')}>
                  <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50')}>Audio Latency Offset (ms)</label>
                  <span className={cn('text-xs', 'font-medium')}>{settings.audioLatencyOffsetMs} ms</span>
                </div>
                <input 
                  type="range" min="-500" max="500" step="10" 
                  value={settings.audioLatencyOffsetMs} 
                  onChange={(e) => updateSettings({ audioLatencyOffsetMs: Number(e.target.value) })}
                  className={cn('w-full', 'accent-white')}
                />
                <p className={cn('text-[10px]', 'text-foreground/40', 'mt-1')}>
                  Adjust this if your Bluetooth headphones or speakers are out of sync. Negative values play audio earlier.
                </p>
              </div>

              <div>
                <label className={cn('text-xs', 'font-bold', 'uppercase', 'tracking-widest', 'text-foreground/50', 'block', 'mb-2')}>Sync Aggressiveness</label>
                <div className={cn('flex', 'gap-2')}>
                  <button 
                    onClick={() => updateSettings({ syncAggressiveness: 'high' })}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${settings.syncAggressiveness === 'high' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'}`}
                  >
                    High Accuracy
                  </button>
                  <button 
                    onClick={() => updateSettings({ syncAggressiveness: 'saver' })}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition ${settings.syncAggressiveness === 'saver' ? 'bg-foreground text-background' : 'bg-foreground/10 text-foreground/70 hover:bg-foreground/20'}`}
                  >
                    Battery Saver
                  </button>
                </div>
                <p className={cn('text-[10px]', 'text-foreground/40', 'mt-2')}>
                  High Accuracy pings the server more frequently to keep playback perfectly aligned. Battery Saver relaxes the sync interval.
                </p>
              </div>
            </div>
          </section>
        )}

        {!onlyVisuals && (
          <>
            {/* Screen Awake Feature */}
            <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
              <div className={cn('flex', 'items-center', 'justify-between', 'mb-3')}>
                <div className={cn('flex', 'items-center', 'gap-2')}>
                  <Sun className={cn('w-5', 'h-5', 'text-amber-400')} />
                  <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Screen & Display</h3>
                </div>
                {settings.keepScreenAwake && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Awake Active
                  </span>
                )}
              </div>
              <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
                Keep your device screen awake during room listening sessions to prevent browser audio throttling and tab sleep.
              </p>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-foreground/[0.03] border border-foreground/5">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-foreground">Keep Screen Awake</span>
                  <span className="text-[10px] text-foreground/40">Uses Web Screen Wake Lock API</span>
                </div>
                <button
                  type="button"
                  onClick={() => updateSettings({ keepScreenAwake: !settings.keepScreenAwake })}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5",
                    settings.keepScreenAwake ? "bg-amber-500 border-amber-400" : "bg-foreground/10"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                      settings.keepScreenAwake ? "translate-x-6" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </section>

            {/* Dynamic Island Customizer Section */}
            <section className={cn('p-5', 'rounded-3xl', 'bg-foreground/5', 'border', 'border-foreground/10', 'shadow-lg')}>
              <div className={cn('flex', 'items-center', 'gap-2', 'mb-3')}>
                <Radio className={cn('w-5', 'h-5', 'text-purple-400')} />
                <h3 className={cn('text-lg', 'font-bold', 'text-foreground')}>Dynamic Island Customizer</h3>
              </div>
              <p className={cn('text-xs', 'text-foreground/60', 'mb-4')}>
                Customize the glow theme, artwork display, and auto-shrink behavior of your Dynamic Island player.
              </p>

              <div className="space-y-4">
                {/* Glow Accent Theme */}
                <div>
                  <label className={cn('text-[10px]', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/40', 'block', 'mb-2')}>Glow Accent Theme</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {[
                      { id: "violet", label: "Violet", color: "bg-purple-500" },
                      { id: "cyan", label: "Cyan", color: "bg-cyan-500" },
                      { id: "emerald", label: "Emerald", color: "bg-emerald-500" },
                      { id: "amber", label: "Amber", color: "bg-amber-500" },
                      { id: "dark", label: "Dark", color: "bg-zinc-700" },
                      { id: "none", label: "None", color: "bg-black border border-white/20" },
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => updateSettings({
                          islandCustomizer: { ...settings.islandCustomizer, glowColor: theme.id as any }
                        })}
                        className={cn(
                          'py-2 px-1 rounded-xl text-[10px] font-bold flex flex-col items-center gap-1 transition-all border cursor-pointer',
                          settings.islandCustomizer?.glowColor === theme.id
                            ? 'bg-foreground text-background border-foreground shadow-sm scale-105'
                            : 'bg-foreground/[0.03] text-foreground/70 border-foreground/5 hover:bg-foreground/10'
                        )}
                      >
                        <div className={cn('w-3 h-3 rounded-full', theme.color)} />
                        {theme.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto-Shrink Delay */}
                <div>
                  <label className={cn('text-[10px]', 'font-black', 'uppercase', 'tracking-widest', 'text-foreground/40', 'block', 'mb-2')}>Auto-Shrink Delay</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { sec: 3, label: "3s Fast" },
                      { sec: 6, label: "6s Default" },
                      { sec: 10, label: "10s Relaxed" },
                      { sec: 0, label: "Never" },
                    ].map((option) => (
                      <button
                        key={option.sec}
                        type="button"
                        onClick={() => updateSettings({
                          islandCustomizer: { ...settings.islandCustomizer, autoShrinkDelaySec: option.sec }
                        })}
                        className={cn(
                          'py-2 rounded-xl text-xs font-bold transition-all border cursor-pointer',
                          settings.islandCustomizer?.autoShrinkDelaySec === option.sec
                            ? 'bg-foreground text-background border-foreground shadow-sm scale-105'
                            : 'bg-foreground/[0.03] text-foreground/70 border-foreground/5 hover:bg-foreground/10'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Show Album Art Toggle */}
                <div className="flex items-center justify-between p-3 rounded-2xl bg-foreground/[0.03] border border-foreground/5">
                  <span className="text-xs font-bold text-foreground">Show Album Artwork Thumbnail</span>
                  <button
                    type="button"
                    onClick={() => updateSettings({
                      islandCustomizer: { ...settings.islandCustomizer, showAlbumArt: !settings.islandCustomizer?.showAlbumArt }
                    })}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors duration-200 border border-foreground/10 cursor-pointer p-0.5",
                      settings.islandCustomizer?.showAlbumArt ? "bg-purple-500 border-purple-400" : "bg-foreground/10"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow-md",
                        settings.islandCustomizer?.showAlbumArt ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

      </div>
    </div>
  );
}
