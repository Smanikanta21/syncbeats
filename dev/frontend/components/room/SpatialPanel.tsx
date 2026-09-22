"use client";

/**
 * SpatialPanel.tsx
 *
 * The two-tab shell around the 3D stage.
 *
 *  - **My Space** — your own devices become the speakers, and *you* are the
 *    centre. Put the Mac on your left and the phone on your right and the sound
 *    genuinely travels between them.
 *  - **Room** — everyone's devices, grouped by person, around the room centre.
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
import type { MotionConfig } from "../../lib/spatial/motion";
import type { SpatialMode } from "../../hooks/useSpatialAudio";
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
  motion: MotionConfig;
  onMotionChange: (patch: Partial<MotionConfig>) => void;
  /** Mid-drag: audio + socket only */
  onPreviewPosition: (key: string, pos: SpatialPosition) => void;
  /** Pointer-up: commits to state */
  onCommitPosition: (key: string, pos: SpatialPosition) => void;
  /** Discrete edits (quick-place buttons) */
  onUpdatePosition: (key: string, pos: SpatialPosition) => void;
  onReset: () => void;
  isPlaying: boolean;
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
    blurb: "Everyone's devices, arranged around the room",
  },
];

/** How fast the bass pulse falls back to rest, per frame at 60fps. */
const BEAT_DECAY = 0.88;

export function SpatialPanel({
  layout,
  mode,
  onModeChange,
  motion,
  onMotionChange,
  onPreviewPosition,
  onCommitPosition,
  onUpdatePosition,
  onReset,
  isPlaying,
}: SpatialPanelProps) {
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // The modal is `lg:hidden` and the inline stage is `hidden` beneath it, so a
  // resize up to desktop while expanded would leave neither visible. Collapse
  // instead — which also guarantees only one WebGL canvas is ever mounted.
  useEffect(() => {
    if (!isMobileModalOpen) return;
    const onResize = () => {
      if (window.innerWidth >= 1024) setIsMobileModalOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [isMobileModalOpen]);

  // ── Bass pulse, ref-only ───────────────────────────────────────────────────
  const { subscribeToBeat } = useBeatEngine();
  const beatRef = useRef(0);

  useEffect(() => {
    const unsubscribe = subscribeToBeat("bass", intensity => {
      // Rising edge only — the decay below handles the fall.
      beatRef.current = Math.max(beatRef.current, Math.min(1, intensity));
    });
    let raf = 0;
    const decay = () => {
      beatRef.current *= BEAT_DECAY;
      raf = requestAnimationFrame(decay);
    };
    raf = requestAnimationFrame(decay);
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
    };
  }, [subscribeToBeat]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const myDevices = useMemo(() => layout.me?.devices ?? [], [layout]);
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

  const scene = (
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
                ? t.id === "solo"
                  ? "bg-violet-500 text-white shadow-md"
                  : "bg-blue-500 text-white shadow-md"
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
            {activeTab.blurb}
          </p>
        </div>
        {tabSwitcher()}
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
            if (window.innerWidth < 1024 && !isMobileModalOpen) setIsMobileModalOpen(true);
          }}
        >
          <div
            className={cn(
              "absolute inset-0 h-full w-full",
              !isMobileModalOpen &&
                "pointer-events-none opacity-70 blur-sm transition-all lg:pointer-events-auto lg:opacity-100 lg:blur-none",
            )}
          >
            {!isMobileModalOpen && scene}
          </div>

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

        <SpatialControls
          motion={motion}
          onMotionChange={onMotionChange}
          myDevices={myDevices}
          onQuickPlace={handleQuickPlace}
          onReset={onReset}
          isPlaying={isPlaying}
        />
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
              <SpatialControls
                motion={motion}
                onMotionChange={onMotionChange}
                myDevices={myDevices}
                onQuickPlace={handleQuickPlace}
                onReset={onReset}
                isPlaying={isPlaying}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
