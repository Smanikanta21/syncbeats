"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  PartyPopper, 
  Globe2, 
  Headphones, 
  Compass, 
  Smartphone, 
  Laptop, 
  Tablet,
  ArrowRight
} from "lucide-react";
import Link from "next/link";

export interface PresetSpeaker {
  name: string;
  type: "phone" | "laptop" | "tablet" | "headphones";
  x: number;
  y: number;
}

export interface PresetScenario {
  id: string;
  name: string;
  tagline: string;
  icon: typeof PartyPopper;
  speakers: PresetSpeaker[];
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: "party",
    name: "House Party",
    tagline: "Combine everyone's phones into one loud, distributed sound system.",
    icon: PartyPopper,
    speakers: [
      { name: "Kitchen iPhone", type: "phone", x: 18, y: 25 },
      { name: "Living Room Pixel", type: "phone", x: 82, y: 25 },
      { name: "Balcony Galaxy", type: "phone", x: 22, y: 75 },
      { name: "Counter Phone", type: "phone", x: 78, y: 75 },
      { name: "Host MacBook", type: "laptop", x: 50, y: 50 },
    ],
  },
  {
    id: "desk",
    name: "Desk Surround",
    tagline: "Turn your laptop, phone, and tablet into an immersive 3D desktop stage.",
    icon: Compass,
    speakers: [
      { name: "Left: iPhone", type: "phone", x: 20, y: 50 },
      { name: "Center: MacBook", type: "laptop", x: 50, y: 50 },
      { name: "Right: iPad", type: "tablet", x: 80, y: 50 },
    ],
  },
  {
    id: "silent-disco",
    name: "Silent Disco",
    tagline: "Multiple listeners on headphones, locked to the exact beat with zero bleed.",
    icon: Headphones,
    speakers: [
      { name: "Dancer 1", type: "headphones", x: 25, y: 35 },
      { name: "Dancer 2", type: "headphones", x: 75, y: 35 },
      { name: "Dancer 3", type: "headphones", x: 50, y: 75 },
    ],
  },
  {
    id: "distance",
    name: "Long Distance",
    tagline: "Stream lossless audio together across the globe in microsecond lockstep.",
    icon: Globe2,
    speakers: [
      { name: "You (London)", type: "laptop", x: 30, y: 50 },
      { name: "Friend (Tokyo)", type: "phone", x: 70, y: 50 },
    ],
  },
];

/**
 * Preserved RoomPresetStage component (from Image #1).
 * Features the interactive scene selector and smooth morphing 2D soundstage.
 */
export function RoomPresetStage({ className = "" }: { className?: string }) {
  const [activeScenarioId, setActiveScenarioId] = useState("party");
  const activeScenario = PRESET_SCENARIOS.find((s) => s.id === activeScenarioId) || PRESET_SCENARIOS[0];

  return (
    <div className={`w-full ${className}`}>
      {/* Punchy Title */}
      <div className="flex flex-col items-center text-center">
        <p className="micro-label mb-2">Flexible architecture</p>
        <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          One room. Any setup.
        </h2>
        <p className="mt-3 text-sm text-foreground/55 max-w-md">
          Click a preset below to see how devices arrange in space.
        </p>
      </div>

      {/* Preset Selector Buttons */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {PRESET_SCENARIOS.map((sc) => {
          const Icon = sc.icon;
          const isActive = activeScenarioId === sc.id;
          return (
            <button
              key={sc.id}
              type="button"
              onClick={() => setActiveScenarioId(sc.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all cursor-pointer ${
                isActive
                  ? "bg-foreground text-background shadow-md scale-105"
                  : "border border-foreground/10 bg-foreground/[0.03] text-foreground/70 hover:bg-foreground/[0.07] hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{sc.name}</span>
            </button>
          );
        })}
      </div>

      {/* Dynamic Interactive Stage for Scenario */}
      <div className="mt-8 overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-foreground/[0.02] p-6 sm:p-10 shadow-[var(--glass-shadow)] backdrop-blur-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-foreground/10 pb-4 mb-6">
          <div>
            <h3 className="text-base font-semibold text-foreground">{activeScenario.name}</h3>
            <p className="text-xs text-foreground/55 mt-0.5">{activeScenario.tagline}</p>
          </div>
          <Link
            href="/hub"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/80 hover:text-foreground transition-colors self-start sm:self-auto"
          >
            <span>Try this setup</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Simulated 2D Floor Plan with Smooth Morphing */}
        <div className="relative h-64 sm:h-72 w-full overflow-hidden rounded-2xl border border-foreground/10 bg-background/50">
          {/* Floor grid */}
          <div 
            className="pointer-events-none absolute inset-0 opacity-15"
            style={{
              backgroundImage: `radial-gradient(circle at center, currentColor 1px, transparent 1px)`,
              backgroundSize: "24px 24px",
            }}
          />

          {/* Sound pulse waves */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.div
              animate={{ scale: [1, 2.5], opacity: [0.25, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
              className="h-28 w-28 rounded-full border border-foreground/20"
            />
          </div>

          {/* Morphing Speaker Nodes */}
          <AnimatePresence mode="popLayout">
            {activeScenario.speakers.map((sp) => {
              const Icon =
                sp.type === "laptop"
                  ? Laptop
                  : sp.type === "tablet"
                  ? Tablet
                  : sp.type === "headphones"
                  ? Headphones
                  : Smartphone;

              return (
                <motion.div
                  key={`${activeScenario.id}-${sp.name}`}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1, left: `${sp.x}%`, top: `${sp.y}%` }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-foreground/15 bg-background shadow-md">
                    <Icon className="h-4 w-4 text-foreground/80" strokeWidth={1.8} />
                  </div>
                  <span className="whitespace-nowrap rounded-md border border-foreground/10 bg-background/90 px-2 py-0.5 text-[9px] font-semibold text-foreground/80 shadow-xs">
                    {sp.name}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
