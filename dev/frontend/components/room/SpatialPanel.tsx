"use client";

/**
 * SpatialPanel.tsx
 *
 * The two-tab shell around the 3D stage.
 *
 *  - **My Space** — your own devices become the speakers, and *you* are the
 *    centre. Put the Mac on your left and the phone on your right and the sound
 *    genuinely travels between them.
 *  - **Room** — everyone's devices, grouped by person, drawn from *your* seat.
 *    So placement is reciprocal: put someone's phone on your right and on their
 *    screen your Mac shows up on their left, at the same distance.
 *
 * This component owns the bass `beatRef`: React context does not cross the R3F
 * reconciler, so the subscription has to live outside `<Canvas>` and be handed
 * down as a ref.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { Maximize2, X, User, Users } from "lucide-react";

import type { SpatialPosition } from "../../lib/spatial/geometry";
import type { SpatialLayout } from "../../lib/spatial/layout";
import { DEFAULT_MOTION, type MotionConfig } from "../../lib/spatial/motion";
import { SpatialAudioEngine } from "../../audio/SpatialAudioEngine";
import type { SpatialMode } from "../../hooks/useSpatialAudio";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useBeatEngine } from "../../context/BeatContext";
import { cn } from "@/lib/utils";
import { SpatialControls } from "./SpatialControls";

// WebGL needs a DOM; keep the canvas out of the server render.
const SpatialScene3D = dynamic(
  () => import("./spatial/SpatialScene3D").then(m => m.SpatialScene3D),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/25">
          Loading stage…
        </span>
      </div>
    ),
  },
);

export type { SpatialMode };

interface SpatialPanelProps {
  layout: SpatialLayout;
  mode: SpatialMode;
  onModeChange: (mode: SpatialMode) => void;
  /** Mid-drag: audio + socket only */
  onPreviewPosition: (key: string, pos: SpatialPosition) => void;
  /** Pointer-up: commits to state */
  onCommitPosition: (key: string, pos: SpatialPosition) => void;
  /** Discrete edits (quick-place buttons) */
  onUpdatePosition: (key: string, pos: SpatialPosition) => void;
  onReset: () => void;
  isPlaying: boolean;
  /** Whether spatial audio processing is active */
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

const TABS: Array<{ id: SpatialMode; label: string; icon: typeof User; blurb: string }> = [
  {
    id: "solo",
    label: "My Space",
    icon: User,
    blurb: "Your devices are the speakers — you're in the middle",
  },
  {
    id: "room",
    label: "Room",
    icon: Users,
    blurb: "Everyone's devices, placed around you — drag to say where they are",
  },
];

/** How fast the bass pulse falls back to rest, per frame at 60fps. */
const BEAT_DECAY = 0.88;
/** Below this the pulse is invisible, so the decay loop stops. */
const BEAT_REST = 5e-4;

export function SpatialPanel({
  layout,
  mode,
  onModeChange,
  onPreviewPosition,
  onCommitPosition,
  onUpdatePosition,
  onReset,
  isPlaying,
  enabled = true,
  onEnabledChange,
}: SpatialPanelProps) {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** Matches this component's own `lg:` split between inline stage and modal. */
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");

  /**
   * Motion lives here rather than in `useSpatialAudio` so that dragging SPEED or
   * SPREAD re-renders this panel and nothing else. Up in the room page every
   * pointer-move re-rendered the dashboard, the lyrics and the WebGL tree — which
   * is what made the sliders feel like they were fighting back.
   */
  const [motion, setMotionState] = useState<MotionConfig>({ ...DEFAULT_MOTION });
  const onMotionChange = useCallback(
    (patch: Partial<MotionConfig>) => setMotionState(prev => ({ ...prev, ...patch })),
    [],
  );
  useEffect(() => {
    SpatialAudioEngine.getInstance().setMotion(motion);
  }, [motion]);

  // The modal is `lg:hidden` and the inline stage is `hidden` beneath it, so a
  // resize up to desktop while expanded would leave neither visible. Collapse
  // instead — which also guarantees only one WebGL canvas is ever mounted.
  useEffect(() => {
    if (isMobileModalOpen && isLargeScreen) setIsMobileModalOpen(false);
  }, [isMobileModalOpen, isLargeScreen]);

  // ── Bass pulse, ref-only ───────────────────────────────────────────────────
  const { subscribeToBeat } = useBeatEngine();
  const beatRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const decay = () => {
      beatRef.current *= BEAT_DECAY;
      // Below audibility the loop is burning a frame to multiply a tiny number
      // by 0.88 forever. Stop; the next beat restarts it.
      if (beatRef.current < BEAT_REST) {
        beatRef.current = 0;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(decay);
    };

    const unsubscribe = subscribeToBeat("bass", intensity => {
      // Rising edge only — the decay above handles the fall.
      beatRef.current = Math.max(beatRef.current, Math.min(1, intensity));
      if (raf === 0) raf = requestAnimationFrame(decay);
    });

    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [subscribeToBeat]);

  // ── Derived ────────────────────────────────────────────────────────────────

  /** The speakers actually making up the field — mirrors `applyField` in the hook. */
  const fieldDevices = useMemo(
    () => (mode === "solo" ? (layout.me?.devices ?? []) : layout.devices),
    [mode, layout],
  );
  const otherUserCount = useMemo(
    () => layout.users.filter(u => !u.isMe).length,
    [layout.users],
  );
  const activeTab = TABS.find(t => t.id === mode) ?? TABS[0];

  /** Swing a device to a cardinal bearing, keeping its distance and height. */
  const handleQuickPlace = useCallback(
    (deviceId: string, angle: number) => {
      const device = layout.devices.find(d => d.deviceId === deviceId);
      if (!device) return;
      onUpdatePosition(deviceId, { ...device.local, angle });
    },
    [layout.devices, onUpdatePosition],
  );

  const controls = (
    <SpatialControls
      motion={motion}
      onMotionChange={onMotionChange}
      fieldDevices={fieldDevices}
      fieldOrigin={layout.fieldOrigin}
      onQuickPlace={handleQuickPlace}
      onPreviewPosition={onPreviewPosition}
      onCommitPosition={onCommitPosition}
      onReset={onReset}
      isPlaying={isPlaying}
    />
  );

  /**
   * Mounted only when something can actually see it: off-screen the R3F tree
   * still renders, and the mobile teaser used to keep a second canvas alive
   * behind a blur purely to look busy.
   *
   * Memoised so that a SPREAD or HEIGHT drag — which changes `motion` but not
   * `motion.mode` — never hands R3F a new element to reconcile.
   */
  const sceneVisible = enabled && (isLargeScreen || isMobileModalOpen);
  const scene = useMemo(
    () =>
      sceneVisible ? (
        <SpatialScene3D
          layout={layout}
          mode={mode}
          motionMode={motion.mode}
          isPlaying={isPlaying}
          onPreviewPosition={onPreviewPosition}
          onCommitPosition={onCommitPosition}
          beatRef={beatRef}
          className="absolute inset-0 h-full w-full"
        />
      ) : null,
    [sceneVisible, layout, mode, motion.mode, isPlaying, onPreviewPosition, onCommitPosition],
  );

  const tabSwitcher = (compact = false) => (
    <div className="flex rounded-full border border-foreground/10 bg-foreground/5 p-1">
      {TABS.map(t => {
        const Icon = t.icon;
        const active = mode === t.id;
        return (
          <button
            key={t.id}
            onClick={e => {
              e.stopPropagation();
              onModeChange(t.id);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full font-semibold transition-colors",
              compact ? "px-3 py-1 text-[10px]" : "px-3 py-1 text-[10px] lg:px-4 lg:py-1.5 lg:text-xs",
              active
                ? "bg-foreground text-background shadow-md"
                : "text-foreground/60 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {t.label}
            {t.id === "room" && otherUserCount > 0 && (
              <span
                className={cn(
                  "rounded-full px-1 text-[8px] font-black",
                  active ? "bg-white/25" : "bg-foreground/10",
                )}
              >
                {otherUserCount + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col min-h-0">
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3 lg:mb-4">
        <div className="min-w-0">
          <h2 className="text-xs font-black uppercase tracking-widest text-foreground/50">
            Spatial Audio
          </h2>
          <p className="mt-0.5 truncate text-[10px] text-foreground/40 lg:text-xs">
            {enabled ? activeTab.blurb : "Spatial processing is off"}
          </p>
        </div>

        {/* Controls row: toggle + tab switcher */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Spatial toggle */}
          <button
            onClick={() => onEnabledChange?.(!enabled)}
            title={enabled ? "Turn off spatial audio" : "Turn on spatial audio"}
            className={cn(
              "relative flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-300",
              enabled
                ? "border-foreground bg-foreground"
                : "border-foreground/15 bg-foreground/10",
            )}
          >
            <span
              className={cn(
                "absolute h-4 w-4 rounded-full shadow-sm transition-all duration-300",
                enabled ? "left-[26px] bg-background" : "left-1 bg-white",
              )}
            />
          </button>

          {/* Solo / Room tabs — hidden when spatial is off */}
          {enabled && tabSwitcher()}
        </div>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col-reverse gap-4 lg:flex-row">
        {/* INLINE STAGE — tap-to-expand on mobile */}
        <div
          className={cn(
            "relative w-full flex-1 touch-none overflow-hidden rounded-3xl",
            "border border-foreground/5 bg-black/5 dark:bg-[#07090F]",
            isMobileModalOpen ? "hidden lg:block" : "cursor-pointer lg:cursor-auto",
          )}
          onClick={() => {
            if (!isLargeScreen && !isMobileModalOpen) setIsMobileModalOpen(true);
          }}
        >
          <div className="absolute inset-0 h-full w-full">
            {isMobileModalOpen ? null : isLargeScreen ? (
              scene
            ) : (
              /* Mobile: a still card behind TAP TO EXPAND. This used to be the
                 live stage at opacity-70 and blur-sm — a whole second WebGL
                 context rendering every frame to be smeared out. */
              <div className="h-full w-full bg-[radial-gradient(circle_at_50%_45%,rgba(139,92,246,0.28),transparent_62%),radial-gradient(circle_at_50%_100%,rgba(56,189,248,0.2),transparent_55%)]" />
            )}
          </div>

          {/* Disabled overlay */}
          {!enabled && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl bg-background/60 backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/8 border border-foreground/10">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5 text-foreground/40">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[11px] font-semibold text-foreground/40">Spatial audio off</p>
              <button
                onClick={(e) => { e.stopPropagation(); onEnabledChange?.(true); }}
                className="mt-1 rounded-full bg-foreground px-4 py-1.5 text-[11px] font-bold text-background shadow-md hover:bg-foreground/90 transition-colors"
              >
                Turn on
              </button>
            </div>
          )}

          {!isMobileModalOpen && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/10 lg:hidden">
              <div className="flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-xs font-black tracking-wide text-background shadow-2xl">
                <Maximize2 className="h-4 w-4" />
                <span>TAP TO EXPAND</span>
              </div>
            </div>
          )}

          {mode === "room" && otherUserCount === 0 && (
            <div className="pointer-events-none absolute left-1/2 top-4 hidden -translate-x-1/2 rounded-full bg-background/70 px-3 py-1 text-[9px] font-bold uppercase tracking-widest text-foreground/40 backdrop-blur lg:block">
              You're the only one here
            </div>
          )}

          <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 select-none text-[9px] font-bold uppercase tracking-widest text-foreground/20 lg:block">
            Drag a speaker to move it · Drag empty space to orbit · Scroll to zoom
          </div>
        </div>

        {/* The modal below renders its own copy. Leaving this one mounted under
            a full-screen portal meant two sets of live-readout rAF loops. */}
        {!isMobileModalOpen && controls}
      </div>

      {/* FULL-SCREEN STAGE — mobile */}
      {mounted &&
        isMobileModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-100 flex flex-col bg-background/92 p-4 backdrop-blur-3xl duration-200 animate-in fade-in lg:hidden">
            <div className="mb-4 flex items-center justify-between gap-3 pt-12">
              {tabSwitcher(true)}
              <button
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/20"
                onClick={e => {
                  e.stopPropagation();
                  setIsMobileModalOpen(false);
                }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative w-full flex-1 touch-none overflow-hidden rounded-3xl border border-foreground/10 bg-black/10 shadow-2xl dark:bg-[#07090F]">
              {scene}
            </div>

            <div className="mt-3 max-h-[42vh] shrink-0 overflow-y-auto">
              {controls}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
