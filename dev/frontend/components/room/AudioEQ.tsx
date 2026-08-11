"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import { SlidersHorizontal, RotateCcw, ChevronDown, Lightbulb, Settings } from "lucide-react";
import { useSettings, AppSettings } from "../../hooks/useSettings";
import { useVisualizer } from "../../context/VisualizerContext";
import { getSocket } from "../../lib/socket";
import { cn } from "../../lib/utils";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Apple AirPods-style EQ + Ambient Visualizer
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ─── EQ bands (7 filters, 3 visible anchors) ──────────────────────────── */
const BANDS = [
  { freq: 60,    label: "LOW",  group: 0 },
  { freq: 200,   label: "",     group: 0 },
  { freq: 500,   label: "",     group: 1 },
  { freq: 1000,  label: "MID",  group: 1 },
  { freq: 3000,  label: "",     group: 1 },
  { freq: 7000,  label: "",     group: 2 },
  { freq: 12000, label: "HIGH", group: 2 },
];
const ANCHOR_IDX = [0, 3, 6];

const PRESETS: Record<string, number[]> = {
  "Flat":         [0,  0,  0,  0,  0,  0,  0],
  "Bass Boost":   [7,  6,  3,  0,  0,  0,  0],
  "Treble Boost": [0,  0,  0,  0,  3,  6,  7],
  "Vocal":        [-2, 0,  4,  5,  4,  2, -1],
  "Electronic":   [6,  4,  0, -1,  2,  5,  6],
  "Acoustic":     [4,  3,  1,  0,  1,  3,  4],
  "Hip-Hop":      [6,  5,  2,  0, -1,  1,  3],
  "Rock":         [4,  2,  0, -1,  2,  4,  4],
  "Jazz":         [3,  2,  2,  0, -1,  2,  3],
  "Classical":    [4,  2,  0, -1, -1,  2,  4],
};

const DB_MAX = 12;
const DB_MIN = -12;

/* ─── Visualizer configuration ─────────────────────────────────────────── */
const VIS_BARS      = 48;    // number of visible bars
const BAR_GAP       = 3;     // px gap between bars
const BAR_RADIUS    = 2;     // rounded cap radius

interface AudioEQProps {
  eqGains: number[];
  setEqBand: (index: number, gain: number) => void;
  setAllEqBands?: (gains: number[]) => void;
  onOpenVisuals?: () => void;
}

/* ─── Build logarithmic bin-to-bar mapping table ─────────────────────────
   Maps VIS_BARS bars → ranges of FFT bins using continuous log bin ranges so
   all 48 bars are active from 30Hz up to 10kHz.                            */
function buildLogBinMap(numBars: number, fftBins: number, sampleRate: number): Array<[number, number]> {
  const nyquist   = sampleRate / 2;
  const minFreq   = 30;
  const maxFreq   = Math.min(10000, nyquist); // 10kHz max for 100% active FFT coverage across all 48 bars
  const logMin    = Math.log10(minFreq);
  const logMax    = Math.log10(maxFreq);
  const map: Array<[number, number]> = [];

  for (let i = 0; i < numBars; i++) {
    const fLo = Math.pow(10, logMin + (logMax - logMin) * (i / numBars));
    const fHi = Math.pow(10, logMin + (logMax - logMin) * ((i + 1) / numBars));
    const binLo = Math.max(0, Math.floor((fLo / nyquist) * fftBins));
    const binHi = Math.min(fftBins - 1, Math.max(binLo + 1, Math.ceil((fHi / nyquist) * fftBins)));
    map.push([binLo, binHi]);
  }
  return map;
}

/* ─── Parse Hex/RGB/HSL string to { r, g, b } ──────────────────────────── */
function parseColorToRgb(colorStr: string): { r: number; g: number; b: number } {
  if (!colorStr) return { r: 0, g: 229, b: 255 };

  if (colorStr.startsWith("hsl")) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      const h = Number(matches[0]) / 360;
      const s = Number(matches[1]) / 100;
      const l = Number(matches[2]) / 100;
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p: number, q: number, t: number) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }
  }

  if (colorStr.startsWith("rgb")) {
    const matches = colorStr.match(/\d+/g);
    if (matches && matches.length >= 3) {
      return { r: Number(matches[0]), g: Number(matches[1]), b: Number(matches[2]) };
    }
  }

  let hex = colorStr.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }
  if (hex.length === 6) {
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  return { r: 0, g: 229, b: 255 };
}

/* ─── Interpolate Ambient Colors across frequency spectrum ─────────────── */
function getAmbientHueForPosition(t: number, ambientColors?: AppSettings['ambientColors']): number {
  if (!ambientColors) {
    return (185 + t * 75) % 360;
  }
  const { subHue = 320, bassHue = 0, lowMidHue = 40, midHue = 120, upperMidHue = 200, highHue = 280 } = ambientColors;
  const hues = [subHue, bassHue, lowMidHue, midHue, upperMidHue, highHue];
  const pos = t * (hues.length - 1);
  const idx = Math.floor(pos);
  const frac = pos - idx;
  if (idx >= hues.length - 1) return hues[hues.length - 1];

  const h1 = hues[idx];
  const h2 = hues[idx + 1];
  let diff = (h2 - h1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (h1 + diff * frac + 360) % 360;
}

/* ─── Get exact RGB at bar position t (0.0 to 1.0) matching ambient theme settings ─── */
function getBarRgbAtPosition(t: number, settings: AppSettings): { r: number; g: number; b: number } {
  if (settings.ambientEnabled === false) {
    return { r: 0, g: 229, b: 255 }; // Default fallback cyan
  }

  const nodes = settings.gradientSettings?.nodes;
  if (nodes && nodes.length >= 2) {
    const pos = t * (nodes.length - 1);
    const idx = Math.floor(pos);
    const frac = pos - idx;
    if (idx >= nodes.length - 1) return parseColorToRgb(nodes[nodes.length - 1].color);
    
    const c1 = parseColorToRgb(nodes[idx].color);
    const c2 = parseColorToRgb(nodes[idx + 1].color);
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * frac),
      g: Math.round(c1.g + (c2.g - c1.g) * frac),
      b: Math.round(c1.b + (c2.b - c1.b) * frac),
    };
  }

  const hue = getAmbientHueForPosition(t, settings.ambientColors);
  return parseColorToRgb(`hsl(${hue}, 90%, 60%)`);
}

/* ─── Catmull-Rom spline for smooth EQ curve ─────────────────────────── */
function catmullRom(pts: [number, number][], tension = 0.38): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${p1[0] + (p2[0]-p0[0])*tension},${p1[1] + (p2[1]-p0[1])*tension} ${p2[0] - (p3[0]-p1[0])*tension},${p2[1] - (p3[1]-p1[1])*tension} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function AudioEQ({ eqGains, setEqBand, setAllEqBands, onOpenVisuals }: AudioEQProps) {
  const { settings, updateSettings } = useSettings();
  const { dataRef } = useVisualizer();

  const svgRef      = useRef<SVGSVGElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const rafRef      = useRef<number>(0);
  const smoothedRef = useRef<Float32Array>(new Float32Array(VIS_BARS).fill(0));
  const logMapRef   = useRef<Array<[number, number]> | null>(null);

  const [svgSize, setSvgSize] = useState({ w: 600, h: 180 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [hovering, setHovering] = useState<number | null>(null);

  /* Helper to broadcast EQ updates over socket for multi-device sync */
  const emitEqSync = useCallback((gains: number[]) => {
    try {
      const socket = getSocket();
      if (socket && socket.connected && typeof window !== 'undefined') {
        const roomId = window.location.pathname.split('/room/')[1];
        if (roomId) {
          socket.emit('room:eqUpdate', { roomId, gains });
        }
      }
    } catch (e) {
      // Ignore socket sync error if uninitialized
    }
  }, []);

  /* Resize observer */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(e => {
      for (const en of e) setSvgSize({ w: en.contentRect.width, h: en.contentRect.height });
    });
    ro.observe(svg);
    setSvgSize({ w: svg.clientWidth, h: svg.clientHeight });
    return () => ro.disconnect();
  }, []);

  const { w, h } = svgSize;
  const PAD_L = 12;
  const PAD_R = 12;
  const PAD_T = 8;
  const PAD_B = 26;
  const plotW = w - PAD_L - PAD_R;
  const plotH = h - PAD_T - PAD_B;

  const gainToY = useCallback((g: number) =>
    PAD_T + plotH * (1 - (g - DB_MIN) / (DB_MAX - DB_MIN)), [plotH]);

  const yToGain = useCallback((y: number) => {
    const raw = DB_MAX - ((y - PAD_T) / plotH) * (DB_MAX - DB_MIN);
    return Math.round(Math.max(DB_MIN, Math.min(DB_MAX, raw)));
  }, [plotH]);

  const bandX = useCallback((i: number) =>
    PAD_L + (i / (BANDS.length - 1)) * plotW, [plotW]);

  const zeroY = gainToY(0);

  /* EQ spline control points (all 7 bands) */
  const pts: [number, number][] = useMemo(() =>
    BANDS.map((_, i) => [bandX(i), gainToY(eqGains[i] ?? 0)]),
    [eqGains, bandX, gainToY]
  );
  const curvePath = catmullRom(pts);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Canvas: center-aligned logarithmic frequency bars reacting to song
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const dpr = window.devicePixelRatio || 1;
      const cw  = canvas.clientWidth;
      const ch  = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width  = cw * dpr;
        canvas.height = ch * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      const raw     = dataRef.current.rawAudioData;
      const playing = dataRef.current.isPlaying;
      const sm      = smoothedRef.current;

      // Build log-bin map lazily
      const fftBins = raw ? raw.length : 512;
      if (!logMapRef.current || logMapRef.current.length !== VIS_BARS) {
        logMapRef.current = buildLogBinMap(VIS_BARS, fftBins, 48000);
      }
      const logMap = logMapRef.current;

      // ── Aggregate FFT into 48 log bars + smooth ──────────────────────────
      for (let b = 0; b < VIS_BARS; b++) {
        const [lo, hi] = logMap[b];
        let maxVal = 0;
        let sum = 0;
        let count = 0;
        if (raw && playing) {
          for (let j = lo; j <= hi && j < raw.length; j++) {
            const v = raw[j] / 255;
            sum += v;
            if (v > maxVal) maxVal = v;
            count++;
          }
        }

        // Blend peak & average for snappy, responsive beat reaction
        const rawEnergy = count > 0 ? (sum / count) * 0.6 + maxVal * 0.4 : 0;

        // Exponential scaling: pushes down the "noise" and makes the loud beats pop.
        const target = rawEnergy > 0 ? Math.pow(rawEnergy, 1.8) * 0.95 : 0;

        // Tuned physics for the canvas now that API smoothing is turned down
        // Instant attack (0.65), smooth gravity decay (0.08)
        const speed = target > sm[b] ? 0.65 : 0.08;
        sm[b] += (target - sm[b]) * speed;
      }

      // ── Layout ────────────────────────────────────────────────────────
      const totalSlotW = (cw - PAD_L - PAD_R) / VIS_BARS;
      const barW       = Math.max(2, totalSlotW - BAR_GAP);
      const centerY    = PAD_T + (ch - PAD_T - PAD_B) * (1 - (0 - DB_MIN) / (DB_MAX - DB_MIN));
      const maxHalf    = (ch - PAD_T - PAD_B) * 0.46;

      // ── Draw bars ─────────────────────────────────────────────────────
      for (let b = 0; b < VIS_BARS; b++) {
        const energy = sm[b];
        if (energy < 0.001) continue;

        // EQ gain interpolated at this bar position
        const t       = b / (VIS_BARS - 1);
        const bandPos = t * (BANDS.length - 1);
        const bLo     = Math.floor(bandPos);
        const bHi     = Math.min(BANDS.length - 1, bLo + 1);
        const bFrac   = bandPos - bLo;
        const eqG     = (eqGains[bLo] ?? 0) * (1 - bFrac) + (eqGains[bHi] ?? 0) * bFrac;

        // EQ boost multiplier
        const eqMultiplier = 1 + (eqG / DB_MAX) * 0.5;
        const boosted = Math.min(0.9, Math.max(0, energy * eqMultiplier));
        const halfH   = boosted * maxHalf;

        if (halfH < 0.5) continue;

        const x = PAD_L + b * totalSlotW + (totalSlotW - barW) / 2;

        // Opacity alpha (no artificial edge-fade that kills the high frequency bars!)
        const alpha = Math.min(0.95, 0.45 + boosted * 0.5);

        // Color Adaptation: Lows -> Lows color, Mids -> Mids color, Highs -> Highs color
        const { r, g, b: bCol } = getBarRgbAtPosition(t, settings);

        // ── Upper half (above center) ──
        const topY = centerY - halfH;
        const gradUp = ctx.createLinearGradient(x, topY, x, centerY);
        gradUp.addColorStop(0,   `rgba(${r}, ${g}, ${bCol}, ${alpha})`);
        gradUp.addColorStop(0.7, `rgba(${Math.round(r * 0.8)}, ${Math.round(g * 0.8)}, ${Math.round(bCol * 0.8)}, ${alpha * 0.6})`);
        gradUp.addColorStop(1,   `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(bCol * 0.6)}, 0.05)`);
        ctx.beginPath();
        ctx.roundRect(x, topY, barW, halfH, [BAR_RADIUS, BAR_RADIUS, 0, 0]);
        ctx.fillStyle = gradUp;
        ctx.fill();

        // ── Lower half (below center, slightly varied for organic feel) ──
        const downH  = halfH * (0.82 + Math.sin(b * 0.9 + Date.now() * 0.0008) * 0.12);
        const gradDn = ctx.createLinearGradient(x, centerY, x, centerY + downH);
        gradDn.addColorStop(0,   `rgba(${Math.round(r * 0.6)}, ${Math.round(g * 0.6)}, ${Math.round(bCol * 0.6)}, 0.05)`);
        gradDn.addColorStop(0.3, `rgba(${Math.round(r * 0.8)}, ${Math.round(g * 0.8)}, ${Math.round(bCol * 0.8)}, ${alpha * 0.5})`);
        gradDn.addColorStop(1,   `rgba(${r}, ${g}, ${bCol}, ${alpha * 0.85})`);
        ctx.beginPath();
        ctx.roundRect(x, centerY, barW, downH, [0, 0, BAR_RADIUS, BAR_RADIUS]);
        ctx.fillStyle = gradDn;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [eqGains, dataRef, settings]);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Drag interaction & Socket sync
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  const onDown = useCallback((e: React.PointerEvent, i: number) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(i);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const gain = yToGain(e.clientY - rect.top);
    setEqBand(dragging, gain);

    // Sync over socket
    const newGains = [...eqGains];
    newGains[dragging] = gain;
    emitEqSync(newGains);
  }, [dragging, yToGain, setEqBand, eqGains, emitEqSync]);

  const onUp = useCallback(() => setDragging(null), []);

  /* Presets */
  const currentPreset = useMemo(() => {
    for (const [name, gains] of Object.entries(PRESETS)) {
      if (gains.every((g, i) => g === (eqGains[i] ?? 0))) return name;
    }
    return "Custom";
  }, [eqGains]);

  const applyPreset = useCallback((name: string) => {
    const p = PRESETS[name];
    if (!p) return;
    if (setAllEqBands) setAllEqBands(p);
    else p.forEach((g, i) => setEqBand(i, g));

    // Multi-device sync
    emitEqSync(p);
  }, [setEqBand, setAllEqBands, emitEqSync]);

  const resetFlat = useCallback(() => {
    const z = new Array(BANDS.length).fill(0);
    if (setAllEqBands) setAllEqBands(z);
    else z.forEach((_, i) => setEqBand(i, 0));

    // Multi-device sync
    emitEqSync(z);
  }, [setEqBand, setAllEqBands, emitEqSync]);

  const isModified = eqGains.some(g => g !== 0);

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     Render
     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  return (
    <div className="w-full h-full flex flex-col relative select-none">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1.5 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
          <span className="text-[10px] font-black tracking-widest uppercase text-foreground/40 hidden sm:block shrink-0">EQ</span>

          <div className="relative shrink-0">
            <select
              value={currentPreset}
              onChange={e => applyPreset(e.target.value)}
              className="appearance-none bg-foreground/10 border border-foreground/10 text-foreground/80 text-[9px] font-bold uppercase tracking-wider pl-3 pr-6 h-6 rounded-full outline-none cursor-pointer hover:bg-foreground/15 transition-colors"
            >
              <option value="Custom" disabled hidden>Custom</option>
              {Object.keys(PRESETS).map(p => (
                <option key={p} value={p} className="bg-background text-foreground text-xs">{p}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-foreground/40 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {isModified && (
            <button onClick={resetFlat} title="Reset to Flat"
              className="w-6 h-6 rounded-full bg-foreground/8 border border-foreground/10 hover:bg-foreground/20 text-foreground/50 hover:text-foreground transition-all flex items-center justify-center cursor-pointer shrink-0">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => updateSettings({ ambientEnabled: settings.ambientEnabled !== false ? false : true })}
            className={cn(
              "text-[9px] px-2.5 h-6 flex items-center gap-1 rounded-full font-bold uppercase transition-colors border cursor-pointer",
              settings.ambientEnabled !== false
                ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/25 hover:bg-yellow-500/25"
                : "bg-foreground/5 text-foreground/40 border-foreground/10 hover:bg-foreground/10"
            )}>
            <Lightbulb className="w-3 h-3" />
            Ambient
          </button>
          {onOpenVisuals && (
            <button onClick={onOpenVisuals}
              className="text-[9px] px-2.5 h-6 flex items-center gap-1 rounded-full font-bold uppercase transition-colors bg-foreground/8 border border-foreground/10 text-foreground/70 hover:bg-foreground/15 cursor-pointer">
              <Settings className="w-3 h-3" />
              Visuals
            </button>
          )}
        </div>
      </div>

      {/* ── EQ + Visualizer area ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative rounded-2xl overflow-hidden"
        style={{ background: "rgba(0,0,0,0.32)", border: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Canvas: center-aligned frequency bars */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 0 }}
        />

        {/* SVG: EQ curve + handles */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: dragging !== null ? "grabbing" : "default", touchAction: "none", zIndex: 1 }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <defs>
            {/* Yellow curve glow */}
            <filter id="eq-glow" x="-10%" y="-30%" width="120%" height="160%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {/* Handle glow */}
            <filter id="handle-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Subtle center line */}
          <line x1={PAD_L} y1={zeroY} x2={w - PAD_R} y2={zeroY}
            stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

          {/* Dashed vertical guide lines at LOW / MID / HIGH */}
          {ANCHOR_IDX.map(i => {
            const x = bandX(i);
            return (
              <line key={`guide-${i}`}
                x1={x} y1={PAD_T + 4}
                x2={x} y2={h - PAD_B}
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={1}
                strokeDasharray="4 5" />
            );
          })}

          {/* Yellow EQ curve — NO fill, just the stroke + glow */}
          {curvePath && (
            <path d={curvePath} fill="none"
              stroke="#f5c842"
              strokeWidth={2.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#eq-glow)"
              opacity={0.95} />
          )}

          {/* Handles: 3 large anchors (LOW/MID/HIGH) + 4 small intermediate */}
          {BANDS.map((band, i) => {
            const x      = bandX(i);
            const y      = pts[i]?.[1] ?? zeroY;
            const gain   = eqGains[i] ?? 0;
            const anchor = ANCHOR_IDX.includes(i);
            const isDrag = dragging === i;
            const isHov  = hovering === i;
            const active = isDrag || isHov;

            const R = anchor
              ? isDrag ? 11 : active ? 10 : 9
              : active ? 4.5 : 3.5;

            const fill = active
              ? anchor ? "#f5c842" : "hsl(185, 95%, 65%)"
              : anchor
                ? gain !== 0 ? "#f5c842" : "rgba(245,200,66,0.75)"
                : "rgba(0,229,255,0.4)";

            return (
              <g key={i}>
                {/* Anchor glow aura */}
                {anchor && active && (
                  <circle cx={x} cy={y} r={24}
                    fill="#f5c842" opacity={0.06}
                    filter="url(#handle-glow)" />
                )}

                {/* Handle circle */}
                <circle
                  cx={x} cy={y} r={R}
                  fill={fill}
                  stroke={anchor ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)"}
                  strokeWidth={anchor ? 2 : 1}
                  style={{
                    cursor: isDrag ? "grabbing" : anchor ? "grab" : "ns-resize",
                    transition: "r 0.1s ease, fill 0.12s ease",
                  }}
                  onPointerDown={e => onDown(e, i)}
                  onPointerEnter={() => setHovering(i)}
                  onPointerLeave={() => { if (dragging !== i) setHovering(null); }}
                />

                {/* Inner white dot on anchors */}
                {anchor && (
                  <circle cx={x} cy={y} r={2.5}
                    fill="rgba(255,255,255,0.95)"
                    style={{ pointerEvents: "none" }} />
                )}

                {/* Gain label on anchors */}
                {anchor && (gain !== 0 || active) && (
                  <text
                    x={x} y={gain >= 0 ? y - 15 : y + 22}
                    textAnchor="middle" fontSize="9"
                    fill="#f5c842" fontWeight="800"
                    fontFamily="var(--font-mono,monospace)">
                    {gain > 0 ? `+${gain}` : gain}
                  </text>
                )}

                {/* LOW / MID / HIGH label */}
                {band.label && (
                  <text
                    x={x} y={h - PAD_B + 16}
                    textAnchor="middle" fontSize="9"
                    fill={active ? "#f5c842" : "rgba(255,255,255,0.4)"}
                    fontWeight="700" letterSpacing="1.5"
                    fontFamily="var(--font-sans,sans-serif)"
                    style={{ transition: "fill 0.15s" }}>
                    {band.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
