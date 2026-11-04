"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Play, 
  Pause, 
  Smartphone, 
  Laptop, 
  Tablet, 
  Radio, 
  Volume2, 
  Sliders,
  Layers
} from "lucide-react";

interface DeviceNode {
  id: string;
  name: string;
  type: "phone" | "laptop" | "tablet" | "headphones";
  icon: typeof Smartphone;
  channel: "Left Channel" | "Center (Lead)" | "Right Channel" | "Ambient Rear";
  offset: string;
  volume: number;
  battery: string;
  position: { x: number; y: number };
}

const DEMO_DEVICES: DeviceNode[] = [
  {
    id: "iphone-15",
    name: "Alex's iPhone",
    type: "phone",
    icon: Smartphone,
    channel: "Left Channel",
    offset: "0.2ms",
    volume: 92,
    battery: "84%",
    position: { x: 18, y: 35 },
  },
  {
    id: "macbook-pro",
    name: "MacBook Pro",
    type: "laptop",
    icon: Laptop,
    channel: "Center (Lead)",
    offset: "0.0ms",
    volume: 100,
    battery: "100%",
    position: { x: 50, y: 72 },
  },
  {
    id: "pixel-8",
    name: "Maya's Pixel",
    type: "phone",
    icon: Smartphone,
    channel: "Right Channel",
    offset: "0.4ms",
    volume: 88,
    battery: "76%",
    position: { x: 82, y: 35 },
  },
  {
    id: "ipad-pro",
    name: "Living Room iPad",
    type: "tablet",
    icon: Tablet,
    channel: "Ambient Rear",
    offset: "0.1ms",
    volume: 85,
    battery: "91%",
    position: { x: 50, y: 15 },
  },
];

export function LiveRoomShowcase({ className = "" }: { className?: string }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<string>("macbook-pro");
  const [currentTime, setCurrentTime] = useState(74); // 1:14
  const [spatialMode, setSpatialMode] = useState<"surround" | "stereo">("surround");

  // Subtle playback progress ticker
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => (prev >= 210 ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const activeDevice = DEMO_DEVICES.find((d) => d.id === selectedDevice) || DEMO_DEVICES[1];

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-foreground/[0.025] p-5 shadow-[var(--glass-shadow)] backdrop-blur-2xl sm:p-7 ${className}`}
    >
      {/* Background radial temperature glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 -z-10 h-72 w-72 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/10" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-80 w-80 rounded-full bg-(--cool-tint)/25 blur-3xl dark:bg-cyan-500/10" />

      {/* Header bar: Room ID & Active Sync badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
            <Radio className="h-4 w-4 text-foreground/70" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold tracking-wider text-foreground">ROOM #842109</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live Sync Locked
              </span>
            </div>
            <p className="text-[11px] text-foreground/50">4 speakers connected · Server clock sync ±0.4ms</p>
          </div>
        </div>

        {/* Spatial toggle */}
        <div className="flex items-center gap-1.5 rounded-full border border-foreground/10 bg-background/60 p-1 text-[11px]">
          <button
            type="button"
            onClick={() => setSpatialMode("surround")}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors ${
              spatialMode === "surround"
                ? "bg-foreground text-background shadow-xs"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Layers className="h-3 w-3" /> Spatial 3D
          </button>
          <button
            type="button"
            onClick={() => setSpatialMode("stereo")}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors ${
              spatialMode === "stereo"
                ? "bg-foreground text-background shadow-xs"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            <Sliders className="h-3 w-3" /> All Sync
          </button>
        </div>
      </div>

      {/* Interactive Soundstage Field */}
      <div className="relative my-6 h-64 w-full overflow-hidden rounded-2xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.03] to-foreground/[0.01] sm:h-72">
        {/* Soundstage grid lines */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at center, currentColor 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />

        {/* Central pulse rings (audio waves emanating outward) */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {isPlaying && (
            <>
              <motion.div
                animate={{ scale: [1, 2.2], opacity: [0.35, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                className="h-32 w-32 rounded-full border border-foreground/20"
              />
              <motion.div
                animate={{ scale: [1, 3.2], opacity: [0.25, 0] }}
                transition={{ duration: 2.4, delay: 0.8, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border border-foreground/15"
              />
            </>
          )}
        </div>

        {/* Audio paths connecting nodes */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-foreground/20"
        >
          <path d="M 50% 72% Q 30% 55% 18% 35%" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
          <path d="M 50% 72% Q 70% 55% 82% 35%" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
          <path d="M 50% 72% Q 50% 45% 50% 15%" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 3" />
        </svg>

        {/* Device nodes rendered in space */}
        {DEMO_DEVICES.map((device) => {
          const isSelected = selectedDevice === device.id;
          const DeviceIcon = device.icon;

          return (
            <button
              key={device.id}
              type="button"
              onClick={() => setSelectedDevice(device.id)}
              style={{ left: `${device.position.x}%`, top: `${device.position.y}%` }}
              className={`group absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 focus:outline-none`}
            >
              {/* Pulsing halo when playing */}
              <div className="relative">
                {isPlaying && (
                  <motion.span
                    animate={{ scale: [1, 1.35, 1], opacity: [0.5, 0.9, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, delay: Math.random() }}
                    className="absolute -inset-1 rounded-2xl bg-foreground/10 blur-xs"
                  />
                )}
                <div
                  className={`relative flex h-11 w-11 items-center justify-center rounded-2xl border transition-all duration-300 sm:h-12 sm:w-12 ${
                    isSelected
                      ? "border-foreground bg-foreground text-background shadow-lg scale-110"
                      : "border-foreground/15 bg-background/85 text-foreground hover:border-foreground/40 hover:scale-105"
                  }`}
                >
                  <DeviceIcon className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>

              {/* Label & latency chip */}
              <div className="flex flex-col items-center">
                <span className="whitespace-nowrap rounded-md bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-xs backdrop-blur-md">
                  {device.name}
                </span>
                <span className="mt-0.5 text-[9px] font-mono text-foreground/45">
                  {spatialMode === "surround" ? device.channel : `Δ ${device.offset}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating mini Dynamic Island player preview */}
      <div className="rounded-2xl border border-foreground/10 bg-background/70 p-3.5 shadow-sm backdrop-blur-xl sm:p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {/* Spinning mini vinyl / art */}
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/20 via-rose-500/20 to-violet-500/20 border border-foreground/10">
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={isPlaying ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground/20 bg-background/80"
              >
                <div className="h-2 w-2 rounded-full bg-foreground/60" />
              </motion.div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">
                  Starboy (feat. Daft Punk)
                </h4>
                <span className="hidden shrink-0 rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/60 sm:inline-block">
                  Lossless Sync
                </span>
              </div>
              <p className="truncate text-xs text-foreground/50">The Weeknd · YouTube Audio Master</p>
            </div>
          </div>

          {/* Equalizer animation & Play button */}
          <div className="flex items-center gap-3">
            <div className="hidden h-5 items-end gap-0.5 sm:flex" aria-hidden="true">
              {[14, 22, 10, 26, 18, 12, 24, 16].map((h, i) => (
                <motion.span
                  key={i}
                  animate={isPlaying ? { height: [6, h, 8, h * 0.8, 6] } : { height: 6 }}
                  transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
                  className="w-1 rounded-full bg-foreground/70"
                  style={{ height: h }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform hover:scale-105 active:scale-95"
              aria-label={isPlaying ? "Pause preview" : "Play preview"}
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-foreground/45">
          <span>{formatTime(currentTime)}</span>
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full bg-foreground transition-all duration-300"
              style={{ width: `${(currentTime / 230) * 100}%` }}
            />
          </div>
          <span>3:50</span>
        </div>
      </div>

      {/* Selected device details ribbon */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
        <div className="flex items-center gap-2">
          <Volume2 className="h-3.5 w-3.5 text-foreground/50" />
          <span>
            Selected speaker: <strong className="text-foreground">{activeDevice.name}</strong> ({activeDevice.channel})
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span>Hardware latency: <strong>{activeDevice.offset}</strong></span>
          <span>Vol: <strong>{activeDevice.volume}%</strong></span>
        </div>
      </div>
    </div>
  );
}
