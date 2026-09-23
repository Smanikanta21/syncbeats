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

import { useEffect, useRef, useState } from "react";
import { Repeat, MoveHorizontal, Zap, RotateCcw, RotateCw } from "lucide-react";
import { SpatialAudioEngine } from "../../audio/SpatialAudioEngine";
import {
  MAX_HOP_MS,
  MAX_PERIOD_MS,
  MIN_HOP_MS,
  MIN_PERIOD_MS,
  MOTION_PRESETS,
  type MotionConfig,
  type MotionMode,
} from "../../lib/spatial/motion";
import {
  MAX_ELEVATION,
  MIN_ELEVATION,
  type SpatialPosition,
} from "../../lib/spatial/geometry";
import type { SpatialDevice } from "../../lib/spatial/layout";
import { PanPads, SurroundScope } from "./spatial/PanPads";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: MotionMode; label: string; icon: typeof Repeat; hint: string }> = [
  { id: "orbit", label: "Orbit", icon: Repeat, hint: "Circles around you" },
  { id: "pingpong", label: "Ping-pong", icon: MoveHorizontal, hint: "Sweeps side to side" },
  { id: "beat", label: "Beat jump", icon: Zap, hint: "Hops to a new speaker on the beat" },
];

/** Quick-place targets, in the model's angle convention. */
const PLACES: Array<{ label: string; title: string; angle: number }> = [
  { label: "L", title: "to your left", angle: -Math.PI / 2 },
  { label: "F", title: "in front of you", angle: 0 },
  { label: "B", title: "behind you", angle: Math.PI },
  { label: "R", title: "to your right", angle: Math.PI / 2 },
];

/** How wide the sound's own path around you can be. */
const ORBIT_MIN = 0.6;
const ORBIT_MAX = 3;

/** Seconds, but readable: "18s" up close, "1m 15s" once it gets slow. */
function formatPeriod(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Which preset the current config still matches, if any. */
function activePresetId(motion: MotionConfig): string | null {
  const match = MOTION_PRESETS.find(p =>
    (Object.keys(p.config) as Array<keyof MotionConfig>).every(
      k => motion[k] === p.config[k],
    ),
  );
  return match?.id ?? null;
}

interface SpatialControlsProps {
  motion: MotionConfig;
  onMotionChange: (patch: Partial<MotionConfig>) => void;
  /** Devices you're allowed to move — yours */
  myDevices: SpatialDevice[];
  /** Every speaker in the current field — what the scope and the pads draw */
  fieldDevices: SpatialDevice[];
  onQuickPlace: (deviceId: string, angle: number) => void;
  /** Mid-drag position updates from the pads */
  onPreviewPosition: (key: string, local: SpatialPosition) => void;
  onCommitPosition: (key: string, local: SpatialPosition) => void;
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

/**
 * Per-device level bar, so you can see the sound hand off between devices.
 * Doubles as the picker for {@link PanPads} — tap a row to place that device.
 */
function DeviceLevels({
  devices,
  selectedId,
  onSelect,
  onPlace,
}: {
  devices: SpatialDevice[];
  selectedId: string | null;
  onSelect: (deviceId: string) => void;
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
        <div
          key={d.deviceId}
          onClick={() => onSelect(d.deviceId)}
          className={cn(
            "flex cursor-pointer flex-col gap-1 rounded-lg px-1.5 py-1 transition-colors",
            d.deviceId === selectedId
              ? "bg-sky-500/10 ring-1 ring-sky-400/40"
              : "hover:bg-foreground/5",
          )}
        >
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
                onClick={e => {
                  e.stopPropagation();
                  onPlace(d.deviceId, p.angle);
                }}
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
  fieldDevices,
  onQuickPlace,
  onPreviewPosition,
  onCommitPosition,
  onReset,
  isPlaying,
}: SpatialControlsProps) {
  // Falls back to your first device, so the pads are usable without a tap.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    myDevices.find(d => d.deviceId === selectedId) ?? myDevices[0] ?? null;

  const presetId = activePresetId(motion);

  return (
    <div
      className={cn(
        "order-first lg:order-last lg:w-52 shrink-0",
        "flex flex-col gap-3 lg:gap-4",
        "rounded-2xl bg-foreground/5 p-3 lg:p-4",
        "max-h-full overflow-y-auto",
      )}
    >
      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-1.5 text-[10px] font-bold text-foreground/50">PRESET</div>
        <div className="grid grid-cols-4 gap-1 lg:grid-cols-2">
          {MOTION_PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => onMotionChange(p.config)}
              title={p.hint}
              className={cn(
                "rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors",
                p.id === presetId
                  ? "bg-cyan-500 text-white shadow-md shadow-cyan-500/25"
                  : "bg-foreground/5 text-foreground/60 hover:bg-foreground/15 hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 hidden text-[9px] leading-snug text-foreground/35 lg:block">
          {MOTION_PRESETS.find(p => p.id === presetId)?.hint ?? "Custom settings."}
        </p>
      </div>

      {/* ── Motion mode ─────────────────────────────────────────────────── */}
      <div className="border-t border-foreground/10 pt-3">
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

      {/* ── Pace ───────────────────────────────────────────────────────── */}
      {motion.mode === "beat" ? (
        <div className="border-t border-foreground/10 pt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-bold text-foreground/50">STAY FOR</span>
            <span className="font-mono text-[10px] font-bold text-cyan-400">
              {(motion.hopMs / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            type="range"
            min={MIN_HOP_MS}
            max={MAX_HOP_MS}
            step={100}
            value={motion.hopMs}
            onChange={e => onMotionChange({ hopMs: parseInt(e.target.value, 10) })}
            className="w-full accent-cyan-400"
          />
          <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
            <span>Every beat</span>
            <span>Every bar</span>
          </div>
          <p className="mt-1.5 hidden text-[9px] leading-snug text-foreground/35 lg:block">
            The shortest the sound will sit on one speaker. Beats that land
            sooner are skipped.
          </p>
        </div>
      ) : (
        <div className="border-t border-foreground/10 pt-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-bold text-foreground/50">
              {motion.mode === "orbit" ? "LAP TIME" : "SWEEP TIME"}
            </span>
            <span className="font-mono text-[10px] font-bold text-cyan-400">
              {formatPeriod(motion.periodMs)}
            </span>
          </div>
          <input
            type="range"
            min={MIN_PERIOD_MS}
            max={MAX_PERIOD_MS}
            step={500}
            value={motion.periodMs}
            onChange={e => onMotionChange({ periodMs: parseInt(e.target.value, 10) })}
            className="w-full accent-cyan-400"
          />
          <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
            <span>Dizzy</span>
            <span>Barely there</span>
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

      {/* ── How the sound moves through the field ───────────────────────── */}
      <div className="border-t border-foreground/10 pt-3">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold text-foreground/50">ORBIT SIZE</span>
          <span className="font-mono text-[10px] font-bold text-foreground/50">
            {motion.radius.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={ORBIT_MIN}
          max={ORBIT_MAX}
          step={0.05}
          value={motion.radius}
          onChange={e => onMotionChange({ radius: parseFloat(e.target.value) })}
          className="w-full accent-violet-400"
        />
        <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
          <span>Close</span>
          <span>Wide</span>
        </div>
      </div>

      {/* Divergence: how much spills outside the speakers the sound is between */}
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold text-foreground/50">SPREAD</span>
          <span className="font-mono text-[10px] font-bold text-foreground/50">
            {Math.round(motion.spread * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={motion.spread}
          onChange={e => onMotionChange({ spread: parseFloat(e.target.value) })}
          className="w-full accent-violet-400"
        />
        <div className="mt-0.5 flex justify-between text-[9px] font-bold text-foreground/40">
          <span>Point</span>
          <span>Room</span>
        </div>
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
        <SurroundScope field={fieldDevices} isPlaying={isPlaying} />
      </div>

      <div className="border-t border-foreground/10 pt-3">
        <LivePanMeter isPlaying={isPlaying} />
      </div>

      {myDevices.length > 0 && (
        <>
          <div className="border-t border-foreground/10 pt-3">
            <DeviceLevels
              devices={myDevices}
              selectedId={selected?.deviceId ?? null}
              onSelect={setSelectedId}
              onPlace={onQuickPlace}
            />
          </div>

          <div className="border-t border-foreground/10 pt-3">
            <PanPads
              field={fieldDevices}
              selected={selected}
              onPreview={onPreviewPosition}
              onCommit={onCommitPosition}
            />
          </div>
        </>
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
