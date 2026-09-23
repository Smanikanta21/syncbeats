"use client";

/**
 * SpatialControls.tsx
 *
 * The controller beside the stage: how the sound moves, how wide and high it
 * moves, and quick placement for your own devices.
 *
 * The live readouts (pan meter, per-device level bars) are driven by a private
 * rAF loop that writes styles straight onto DOM nodes. They deliberately do not
 * go through React state — at 60fps that would re-render the room.
 */

import { useEffect, useRef } from "react";
import { Repeat, MoveHorizontal, Zap, RotateCcw, RotateCw } from "lucide-react";
import { SpatialAudioEngine } from "../../audio/SpatialAudioEngine";
import {
  MAX_PERIOD_MS,
  MIN_PERIOD_MS,
  type MotionConfig,
  type MotionMode,
} from "../../lib/spatial/motion";
import { MAX_ELEVATION, MIN_ELEVATION } from "../../lib/spatial/geometry";
import type { SpatialDevice } from "../../lib/spatial/layout";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: MotionMode; label: string; icon: typeof Repeat; hint: string }> = [
  { id: "orbit", label: "Orbit", icon: Repeat, hint: "Circles around you" },
  { id: "pingpong", label: "Ping-pong", icon: MoveHorizontal, hint: "Sweeps side to side" },
  { id: "beat", label: "Beat jump", icon: Zap, hint: "Hops on every bass hit" },
];

/** Quick-place targets, in the model's angle convention. */
const PLACES: Array<{ label: string; title: string; angle: number }> = [
  { label: "L", title: "to your left", angle: -Math.PI / 2 },
  { label: "F", title: "in front of you", angle: 0 },
  { label: "B", title: "behind you", angle: Math.PI },
  { label: "R", title: "to your right", angle: Math.PI / 2 },
];

const SPREAD_MIN = 0.6;
const SPREAD_MAX = 3;

interface SpatialControlsProps {
  motion: MotionConfig;
  onMotionChange: (patch: Partial<MotionConfig>) => void;
  /** Devices you're allowed to move — yours */
  myDevices: SpatialDevice[];
  onQuickPlace: (deviceId: string, angle: number) => void;
  onReset: () => void;
  isPlaying: boolean;
}

/** Stereo pan of the sound as heard on *this* device. */
function LivePanMeter({ isPlaying }: { isPlaying: boolean }) {
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const dot = dotRef.current;
      if (dot) {
        const pan = SpatialAudioEngine.getInstance().getPanValue();
        dot.style.left = `${((pan + 1) / 2) * 100}%`;
        dot.style.opacity = isPlaying ? "1" : "0.3";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  return (
    <div>
      <div className="text-[10px] font-bold text-foreground/50 mb-1.5">THIS DEVICE</div>
      <div className="relative h-1.5 rounded-full bg-foreground/10">
        <div className="absolute left-1/2 top-[-3px] h-[12px] w-px bg-foreground/20" />
        <div
          ref={dotRef}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.9)] transition-opacity"
          style={{ left: "50%" }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-foreground/40">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  );
}

/** Per-device level bar, so you can see the sound hand off between devices. */
function DeviceLevels({
  devices,
  onPlace,
}: {
  devices: SpatialDevice[];
  onPlace: (deviceId: string, angle: number) => void;
}) {
  const barsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const engine = SpatialAudioEngine.getInstance();
      barsRef.current.forEach((el, deviceId) => {
        el.style.width = `${Math.round(engine.getGain(deviceId) * 100)}%`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (devices.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-bold text-foreground/50">LEVELS</div>
      {devices.map(d => (
        <div key={d.deviceId} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[10px] font-semibold text-foreground/70">{d.label}</span>
            {d.isMe && (
              <span className="shrink-0 text-[8px] font-black uppercase tracking-wider text-violet-400">
                here
              </span>
            )}
          </div>
          <div className="h-1 rounded-full bg-foreground/10">
            <div
              ref={el => {
                if (el) barsRef.current.set(d.deviceId, el);
                else barsRef.current.delete(d.deviceId);
              }}
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
              style={{ width: "15%" }}
            />
          </div>
          <div className="flex gap-1">
            {PLACES.map(p => (
              <button
                key={p.label}
                onClick={() => onPlace(d.deviceId, p.angle)}
                title={`Move ${d.label} ${p.title}`}
                className="flex-1 rounded-md bg-foreground/5 py-0.5 text-[9px] font-bold text-foreground/50 transition-colors hover:bg-foreground/15 hover:text-foreground"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SpatialControls({
  motion,
  onMotionChange,
  myDevices,
  onQuickPlace,
  onReset,
  isPlaying,
}: SpatialControlsProps) {
  const seconds = (motion.periodMs / 1000).toFixed(1);

  return (
    <div
      className={cn(
        "order-first lg:order-last lg:w-52 shrink-0",
        "flex flex-col gap-3 lg:gap-4",
        "rounded-2xl bg-foreground/5 p-3 lg:p-4",
        "max-h-full overflow-y-auto",
      )}
    >
      {/* ── Motion mode ─────────────────────────────────────────────────── */}
      <div>
        <div className="mb-1.5 text-[10px] font-bold text-foreground/50">MOVEMENT</div>
        <div className="flex gap-1 lg:flex-col">
          {MODES.map(m => {
            const Icon = m.icon;
            const active = motion.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onMotionChange({ mode: m.id })}
                title={m.hint}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-1.5 lg:justify-start",
                  "text-[10px] font-bold transition-colors",
                  active
                    ? "bg-violet-500 text-white shadow-md shadow-violet-500/25"
                    : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden lg:inline">{m.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 hidden text-[9px] leading-snug text-foreground/35 lg:block">
          {MODES.find(m => m.id === motion.mode)?.hint}
        </p>
      </div>

      {/* ── Speed (not meaningful for beat jumps) ───────────────────────── */}
      {motion.mode !== "beat" && (
        <div className="border-t border-foreground/10 pt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-bold text-foreground/50">
              {motion.mode === "orbit" ? "LAP TIME" : "SWEEP TIME"}
            </span>
            <span className="font-mono text-[10px] font-bold text-cyan-400">{seconds}s</span>
          </div>
          <input
            type="range"
            min={MIN_PERIOD_MS}
            max={MAX_PERIOD_MS}
            step={250}
            value={motion.periodMs}
            onChange={e => onMotionChange({ periodMs: parseInt(e.target.value, 10) })}
            className="w-full accent-cyan-400"
          />
          <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
            <span>Fast</span>
            <span>Slow</span>
          </div>
        </div>
      )}

      {/* ── Direction (orbit only) ──────────────────────────────────────── */}
      {motion.mode === "orbit" && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold text-foreground/50">DIRECTION</span>
          <button
            onClick={() => onMotionChange({ direction: motion.direction === 1 ? -1 : 1 })}
            className="flex items-center gap-1.5 rounded-lg bg-foreground/5 px-2 py-1 text-[10px] font-bold text-foreground/70 transition-colors hover:bg-foreground/15"
          >
            {motion.direction === 1 ? (
              <RotateCw className="h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {motion.direction === 1 ? "CW" : "CCW"}
          </button>
        </div>
      )}

      {/* ── Spread + height ────────────────────────────────────────────── */}
      <div className="border-t border-foreground/10 pt-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold text-foreground/50">SPREAD</span>
          <span className="font-mono text-[10px] font-bold text-foreground/50">
            {motion.radius.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={SPREAD_MIN}
          max={SPREAD_MAX}
          step={0.05}
          value={motion.radius}
          onChange={e => onMotionChange({ radius: parseFloat(e.target.value) })}
          className="w-full accent-violet-400"
        />
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold text-foreground/50">HEIGHT</span>
          <span className="font-mono text-[10px] font-bold text-foreground/50">
            {motion.elevation.toFixed(0)}°
          </span>
        </div>
        <input
          type="range"
          min={MIN_ELEVATION}
          max={MAX_ELEVATION}
          step={1}
          value={motion.elevation}
          onChange={e => onMotionChange({ elevation: parseFloat(e.target.value) })}
          className="w-full accent-violet-400"
        />
        <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
          <span>Floor</span>
          <span>Ear</span>
          <span>Ceil</span>
        </div>
      </div>

      {/* ── Live readouts ──────────────────────────────────────────────── */}
      <div className="border-t border-foreground/10 pt-3">
        <LivePanMeter isPlaying={isPlaying} />
      </div>

      {myDevices.length > 0 && (
        <div className="border-t border-foreground/10 pt-3">
          <DeviceLevels devices={myDevices} onPlace={onQuickPlace} />
        </div>
      )}

      <button
        onClick={onReset}
        className="mt-auto rounded-xl bg-foreground/5 py-2 text-[10px] font-bold text-foreground/50 transition-colors hover:bg-foreground/15 hover:text-foreground"
      >
        Reset my layout
      </button>
    </div>
  );
}
