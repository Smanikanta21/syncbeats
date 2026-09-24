"use client";

/**
 * PanPads.tsx
 *
 * Precise placement and a live picture of the surround field, modelled on
 * Fairlight's 3D panner:
 *
 *  - {@link PanPads} — Top / Front / Side orthographic views of one speaker.
 *    Dragging in a pad edits exactly the two axes that view shows, which is the
 *    only way to set a device's *height*: the 3D stage drag is floor-only and
 *    the HEIGHT slider moves the sound, not the speakers.
 *  - {@link SurroundScope} — the polar scope. A blob whose radius in each
 *    direction is how much sound is actually coming from there right now.
 *
 * Both are ref-driven: the pad handle is moved by writing its style during the
 * drag, and the scope redraws itself in a private rAF loop. Neither goes
 * through React state at pointer-move or frame rate.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SpatialAudioEngine } from "../../../audio/SpatialAudioEngine";
import {
  MAX_RADIUS,
  angleDelta,
  clamp,
  polarToCartesian,
  type SpatialPosition,
  type Vec3,
} from "../../../lib/spatial/geometry";
import {
  PLANES,
  padPercent as pct,
  toPosition,
  type Plane,
} from "../../../lib/spatial/panPlanes";
import type { SpatialDevice } from "../../../lib/spatial/layout";
import { cn } from "@/lib/utils";

interface PanPadsProps {
  /** Every speaker in the field — drawn as reference dots */
  field: SpatialDevice[];
  /** The one being edited, or null when there is nothing to place */
  selected: SpatialDevice | null;
  onPreview: (key: string, local: SpatialPosition) => void;
  onCommit: (key: string, local: SpatialPosition) => void;
}

export function PanPads({ field, selected, onPreview, onCommit }: PanPadsProps) {
  const [viewId, setViewId] = useState<Plane["id"]>("top");
  const plane = PLANES.find(p => p.id === viewId) ?? PLANES[0];

  const handleRef = useRef<HTMLDivElement>(null);
  const vecRef = useRef<Vec3>({ x: 0, y: 0, z: 0 });
  /** Last committed bearing, held while the vector passes through the origin. */
  const angleRef = useRef(0);
  const draggingRef = useRef<number | null>(null);

  const paint = useCallback(() => {
    const el = handleRef.current;
    if (!el) return;
    const [u, w] = plane.toPad(vecRef.current);
    el.style.left = pct(u);
    el.style.top = pct(w);
  }, [plane]);

  // Re-seed from the committed position — but never mid-drag, or a re-render
  // triggered by anything else in the room would yank the handle backwards.
  useEffect(() => {
    if (draggingRef.current !== null) return;
    vecRef.current = selected ? polarToCartesian(selected.local) : { x: 0, y: 0, z: 0 };
    angleRef.current = selected?.local.angle ?? 0;
    paint();
  }, [selected, paint]);

  const apply = (pad: HTMLDivElement, clientX: number, clientY: number): SpatialPosition => {
    const r = pad.getBoundingClientRect();
    const u = clamp(((clientX - r.left) / r.width) * 2 - 1, -1, 1);
    const w = clamp(((clientY - r.top) / r.height) * 2 - 1, -1, 1);

    const position = toPosition(plane.fromPad(u, w, vecRef.current), angleRef.current);
    angleRef.current = position.angle;
    // Re-seed from the *clamped* position so the handle shows what was actually
    // emitted. Keeping the raw pad vector let the two drift apart at the pad's
    // limits, and the handle then lied about where the speaker had ended up.
    vecRef.current = polarToCartesian(position);
    paint();
    return position;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = e.pointerId;
    onPreview(selected.deviceId, apply(e.currentTarget, e.clientX, e.clientY));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== e.pointerId || !selected) return;
    onPreview(selected.deviceId, apply(e.currentTarget, e.clientX, e.clientY));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (draggingRef.current !== e.pointerId || !selected) return;
    draggingRef.current = null;
    onCommit(selected.deviceId, apply(e.currentTarget, e.clientX, e.clientY));
  };

  const [leftEdge, rightEdge, topEdge, bottomEdge] = plane.edges;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-bold text-foreground/50">PLACE</span>
        <span className="truncate font-mono text-[9px] font-bold text-sky-400">
          {selected ? selected.label : "—"}
        </span>
      </div>

      <div className="mb-1.5 flex gap-1">
        {PLANES.map(p => (
          <button
            key={p.id}
            onClick={() => setViewId(p.id)}
            className={cn(
              "flex-1 rounded-md py-0.5 text-[9px] font-bold transition-colors",
              p.id === viewId
                ? "bg-sky-500 text-white"
                : "bg-foreground/5 text-foreground/50 hover:bg-foreground/15",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn(
          "relative aspect-square w-full touch-none overflow-hidden rounded-lg",
          "border border-foreground/10 bg-foreground/5",
          selected ? "cursor-crosshair" : "pointer-events-none opacity-40",
        )}
      >
        {/* Graticule */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-foreground/10" />
        <div className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-foreground/10" />
        <div className="pointer-events-none absolute inset-[22%] rounded-full border border-foreground/10" />

        {/* Edge captions */}
        <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-foreground/25">
          {leftEdge}
        </span>
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[7px] font-bold text-foreground/25">
          {rightEdge}
        </span>
        <span className="pointer-events-none absolute left-1/2 top-0.5 -translate-x-1/2 text-[7px] font-bold text-foreground/25">
          {topEdge}
        </span>
        <span className="pointer-events-none absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] font-bold text-foreground/25">
          {bottomEdge}
        </span>

        {/* The other speakers, for reference */}
        {field.map(d => {
          if (d.deviceId === selected?.deviceId) return null;
          const [u, w] = plane.toPad(polarToCartesian(d.local));
          return (
            <div
              key={d.deviceId}
              title={d.label}
              className="pointer-events-none absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/70"
              style={{ left: pct(u), top: pct(w) }}
            />
          );
        })}

        {/* The handle */}
        <div
          ref={handleRef}
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-[3px] bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.9)]"
          style={{ left: "50%", top: "50%" }}
        />
      </div>

      <p className="mt-1 text-[9px] leading-snug text-foreground/35">
        {selected
          ? `Drag to move ${selected.label}. Use Front or Side to raise it.`
          : "No speaker selected."}
      </p>
    </div>
  );
}

// ── Surround scope ──────────────────────────────────────────────────────────

/** Angular samples around the scope outline. */
const SCOPE_SEGMENTS = 72;
/** How far a speaker's level bleeds into neighbouring bearings, in radians. */
const SCOPE_KERNEL = Math.PI / 2;

/**
 * Where the sound is, as energy rather than as a dot: at every bearing the blob
 * reaches out by a kernel-weighted blend of the surrounding speakers' live
 * levels. With one device it is a lobe pointing at it; with a Mac left and a
 * phone right it stretches between them as the source crosses over.
 */
export function SurroundScope({
  field,
  isPlaying,
}: {
  field: SpatialDevice[];
  isPlaying: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef(field);

  useEffect(() => {
    fieldRef.current = field;
  }, [field]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let raf = 0;
    const draw = () => {
      // Paused freezes the source, so the scope is static — draw one final frame
      // and stop rather than repainting an unchanging blob 60 times a second.
      if (isPlaying) raf = requestAnimationFrame(draw);

      const css = canvas.clientWidth;
      if (css <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.round(css * dpr);
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }

      const c = size / 2;
      const R = size * 0.42;
      ctx.clearRect(0, 0, size, size);
      ctx.lineWidth = Math.max(1, dpr * 0.6);

      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      for (const f of [0.34, 0.67, 1]) {
        ctx.beginPath();
        ctx.arc(c, c, R * f, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(c - R, c);
      ctx.lineTo(c + R, c);
      ctx.moveTo(c, c - R);
      ctx.lineTo(c, c + R);
      ctx.stroke();

      const engine = SpatialAudioEngine.getInstance();
      const speakers = fieldRef.current.map(d => ({
        angle: d.local.angle,
        gain: clamp(engine.getGain(d.deviceId), 0, 1),
      }));

      if (speakers.length > 0) {
        ctx.beginPath();
        for (let i = 0; i <= SCOPE_SEGMENTS; i++) {
          const theta = (i / SCOPE_SEGMENTS) * Math.PI * 2;
          let num = 0;
          let den = 0;
          for (const s of speakers) {
            const d = Math.abs(angleDelta(theta, s.angle));
            if (d >= SCOPE_KERNEL) continue;
            const k = Math.cos((d / SCOPE_KERNEL) * (Math.PI / 2)) ** 2;
            num += k * s.gain;
            den += k;
          }
          const r = R * (0.12 + 0.88 * (den > 1e-6 ? num / den : 0));
          const x = c + r * Math.sin(theta);
          const y = c - r * Math.cos(theta);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const grad = ctx.createRadialGradient(c, c, 0, c, c, R);
        grad.addColorStop(0, "rgba(96,165,250,0.5)");
        grad.addColorStop(1, "rgba(59,130,246,0.12)");
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = "rgba(96,165,250,0.85)";
        ctx.stroke();

        for (const s of speakers) {
          ctx.beginPath();
          ctx.arc(c + R * Math.sin(s.angle), c - R * Math.cos(s.angle), dpr * 2.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(52,211,153,${0.25 + 0.75 * s.gain})`;
          ctx.fill();
        }
      }

      // The source itself, so you can see the blob lag behind it.
      const src = engine.getSourcePosition();
      const sr = R * clamp(src.radius / MAX_RADIUS, 0, 1);
      ctx.beginPath();
      ctx.arc(c + sr * Math.sin(src.angle), c - sr * Math.cos(src.angle), dpr * 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fill();
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold text-foreground/50">FIELD</div>
      <div className="relative mx-auto w-full max-w-[150px]">
        <canvas
          ref={canvasRef}
          className={cn("block aspect-square w-full transition-opacity", !isPlaying && "opacity-40")}
        />
        <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[7px] font-bold text-foreground/30">
          F
        </span>
        <span className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-[7px] font-bold text-foreground/30">
          B
        </span>
        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[7px] font-bold text-foreground/30">
          L
        </span>
        <span className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[7px] font-bold text-foreground/30">
          R
        </span>
      </div>
    </div>
  );
}
