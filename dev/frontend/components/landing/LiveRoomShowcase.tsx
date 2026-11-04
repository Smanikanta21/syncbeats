"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
  Play, 
  Pause, 
  Smartphone, 
  Laptop, 
  Tablet, 
  Radio, 
  Volume2, 
  VolumeX,
  Plus,
  Sliders,
  Layers,
  RotateCcw,
  ArrowRight
} from "lucide-react";
import { RoomCodeEntry } from "./RoomCodeEntry";

export interface DemoDevice {
  id: string;
  name: string;
  type: "phone" | "laptop" | "tablet";
  icon: typeof Smartphone;
  channel: string;
  volume: number;
  isMuted: boolean;
  x: number; // percentage (0-100)
  y: number; // percentage (0-100)
}

const INITIAL_DEVICES: DemoDevice[] = [
  {
    id: "alex-phone",
    name: "Alex's iPhone",
    type: "phone",
    icon: Smartphone,
    channel: "Left Channel",
    volume: 92,
    isMuted: false,
    x: 22,
    y: 38,
  },
  {
    id: "macbook",
    name: "MacBook Pro",
    type: "laptop",
    icon: Laptop,
    channel: "Center (Lead)",
    volume: 100,
    isMuted: false,
    x: 50,
    y: 74,
  },
  {
    id: "maya-phone",
    name: "Maya's Pixel",
    type: "phone",
    icon: Smartphone,
    channel: "Right Channel",
    volume: 88,
    isMuted: false,
    x: 78,
    y: 38,
  },
  {
    id: "ipad",
    name: "Living Room iPad",
    type: "tablet",
    icon: Tablet,
    channel: "Ambient Rear",
    volume: 85,
    isMuted: false,
    x: 50,
    y: 18,
  },
];

export function LiveRoomShowcase({ className = "" }: { className?: string }) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [devices, setDevices] = useState<DemoDevice[]>(INITIAL_DEVICES);
  const [selectedId, setSelectedId] = useState<string>("alex-phone");
  const [spatialMode, setSpatialMode] = useState<"surround" | "stereo">("surround");
  const [currentTime, setCurrentTime] = useState(74);
  const containerRef = useRef<HTMLDivElement>(null);

  // Playback timer (runs only when playing)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => (prev >= 230 ? 0 : prev + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const selectedDevice = devices.find((d) => d.id === selectedId) || devices[0];

  const updateDeviceVolume = (id: string, vol: number) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, volume: vol, isMuted: vol === 0 } : d))
    );
  };

  const toggleMute = (id: string) => {
    setDevices((prev) =>
      prev.map((d) => (d.id === id ? { ...d, isMuted: !d.isMuted } : d))
    );
  };

  const addDevice = () => {
    if (devices.length >= 6) return;
    const count = devices.length + 1;
    const newDev: DemoDevice = {
      id: `phone-${Date.now()}`,
      name: `Guest Phone ${count}`,
      type: "phone",
      icon: Smartphone,
      channel: count % 2 === 0 ? "Right Fill" : "Left Fill",
      volume: 85,
      isMuted: false,
      x: count % 2 === 0 ? 82 : 18,
      y: 65,
    };
    setDevices((prev) => [...prev, newDev]);
    setSelectedId(newDev.id);
  };

  const [stageVersion, setStageVersion] = useState(0);

  const resetStage = () => {
    setDevices(INITIAL_DEVICES);
    setSelectedId("alex-phone");
    setStageVersion((v) => v + 1);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div
      className={`relative isolate overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-foreground/[0.025] p-5 shadow-[var(--glass-shadow)] backdrop-blur-2xl sm:p-7 ${className}`}
    >
      {/* Background ambient warmth */}
      <div className="pointer-events-none absolute -right-20 -top-20 -z-10 h-72 w-72 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/10" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 -z-10 h-80 w-80 rounded-full bg-(--cool-tint)/25 blur-3xl dark:bg-cyan-500/10" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-foreground/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
            <Radio className="h-4 w-4 text-foreground/75" />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-xs font-bold tracking-wider text-foreground">ROOM #842109</span>
            <span className="text-foreground/20">•</span>
            <span className="font-mono text-[11px] font-semibold tracking-wider text-foreground/60 uppercase">
              {devices.length} Speakers in Sync
            </span>
          </div>
        </div>

        {/* Controls: Spatial Toggle & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-foreground/10 bg-background/60 p-1 text-xs">
            <button
              type="button"
              onClick={() => setSpatialMode("surround")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                spatialMode === "surround"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Spatial 3D
            </button>
            <button
              type="button"
              onClick={() => setSpatialMode("stereo")}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                spatialMode === "stereo"
                  ? "bg-foreground text-background shadow-xs"
                  : "text-foreground/60 hover:text-foreground"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" /> All Sync
            </button>
          </div>

          <button
            type="button"
            onClick={addDevice}
            disabled={devices.length >= 6}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-foreground/10 bg-foreground/5 px-2.5 text-xs font-medium text-foreground transition-all hover:bg-foreground/10 disabled:opacity-40"
            title="Add speaker"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add Speaker</span>
          </button>

          <button
            type="button"
            onClick={resetStage}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5 text-foreground/60 transition-colors hover:text-foreground"
            title="Reset positions"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive 2D Soundstage Field */}
      <div 
        ref={containerRef}
        className="relative my-5 h-72 w-full overflow-hidden rounded-2xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.03] to-foreground/[0.01] sm:h-80 select-none"
      >
        {/* Subtle grid lines */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at center, currentColor 1px, transparent 1px)`,
            backgroundSize: "28px 28px",
          }}
        />

        {/* Central audio pulse rings (lightweight CSS animation) */}
        {isPlaying && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="h-32 w-32 rounded-full border border-foreground/20 animate-ping opacity-25" style={{ animationDuration: "2.4s" }} />
          </div>
        )}

        {/* Hint banner */}
        <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] text-foreground/45 uppercase tracking-wider">
          Drag speakers to position in space · Click to mix
        </div>

        {/* Interactive draggable device nodes (Hardware-accelerated Framer Motion drag) */}
        {devices.map((device, idx) => {
          const isSelected = selectedId === device.id;
          const DeviceIcon = device.icon;

          return (
            <motion.div
              key={`${device.id}-${stageVersion}`}
              drag
              dragConstraints={containerRef}
              dragElastic={0.06}
              dragMomentum={false}
              whileDrag={{ scale: 1.15, zIndex: 60 }}
              whileHover={{ scale: 1.05 }}
              onPointerDown={() => setSelectedId(device.id)}
              style={{
                left: `${device.x}%`,
                top: `${device.y}%`,
              }}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing flex-col items-center gap-1.5 focus:outline-none touch-none select-none"
            >
              {/* Speaker wave halo */}
              <div className="relative">
                {isPlaying && !device.isMuted && (
                  <span
                    className="absolute -inset-1 rounded-2xl bg-foreground/10 blur-xs pointer-events-none animate-pulse"
                    style={{ animationDelay: `${idx * 200}ms` }}
                  />
                )}
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-200 sm:h-13 sm:w-13 ${
                    isSelected
                      ? "border-foreground bg-foreground text-background shadow-lg scale-110"
                      : device.isMuted
                      ? "border-foreground/10 bg-background/50 text-foreground/30"
                      : "border-foreground/15 bg-background/90 text-foreground hover:border-foreground/40 hover:scale-105"
                  }`}
                >
                  <DeviceIcon className="h-5 w-5" strokeWidth={1.8} />
                </div>
              </div>

              {/* Device label chip */}
              <div className="flex flex-col items-center pointer-events-none">
                <span className="whitespace-nowrap rounded-lg border border-foreground/10 bg-background/95 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-xs">
                  {device.name}
                </span>
                <span className="mt-0.5 font-mono text-[9px] text-foreground/50">
                  {device.isMuted ? "MUTED" : spatialMode === "surround" ? device.channel : `${device.volume}%`}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Mini Controller & Mixer for Selected Device */}
      <div className="rounded-2xl border border-foreground/10 bg-background/70 p-3.5 shadow-sm backdrop-blur-xl sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Track info & Vinyl */}
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-gradient-to-br from-amber-500/20 via-rose-500/20 to-violet-500/20">
              <motion.div
                animate={isPlaying ? { rotate: 360 } : { rotate: 0 }}
                transition={isPlaying ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0 }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-foreground/20 bg-background/80"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/60" />
              </motion.div>
            </div>

            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold tracking-tight text-foreground">
                Starboy (feat. Daft Punk)
              </h4>
              <p className="truncate text-xs text-foreground/50">The Weeknd · 48kHz Web Audio</p>
            </div>
          </div>

          {/* Device Mixer Controls */}
          {selectedDevice && (
            <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-3 py-1.5 text-xs">
              <span className="font-medium text-foreground/80 hidden sm:inline">{selectedDevice.name}:</span>
              
              <button
                type="button"
                onClick={() => toggleMute(selectedDevice.id)}
                className="text-foreground/60 hover:text-foreground transition-colors cursor-pointer"
                title={selectedDevice.isMuted ? "Unmute" : "Mute"}
              >
                {selectedDevice.isMuted ? (
                  <VolumeX className="h-4 w-4 text-bad-500" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>

              <input
                type="range"
                min="0"
                max="100"
                value={selectedDevice.isMuted ? 0 : selectedDevice.volume}
                onChange={(e) => updateDeviceVolume(selectedDevice.id, Number(e.target.value))}
                className="h-1.5 w-20 sm:w-24 cursor-pointer accent-foreground bg-foreground/20 rounded-full"
              />
              <span className="font-mono text-[10px] w-7 text-right text-foreground/60">
                {selectedDevice.isMuted ? "0%" : `${selectedDevice.volume}%`}
              </span>
            </div>
          )}

          {/* Equalizer animation & Play button */}
          <div className="flex items-center gap-3">
            <div className="hidden h-5 items-end gap-0.5 md:flex" aria-hidden="true">
              {[12, 20, 10, 24, 16, 12, 22, 14].map((h, i) => (
                <span
                  key={i}
                  className="w-1 rounded-full bg-foreground/70 transition-all duration-300"
                  style={{
                    height: isPlaying ? `${h}px` : "4px",
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground text-background shadow-md transition-transform hover:scale-105 active:scale-95"
              aria-label={isPlaying ? "Pause" : "Play"}
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

      {/* Direct Room Launcher Bar: Join via Code or Convert to Live Room */}
      <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-foreground/10 pt-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <RoomCodeEntry className="w-full sm:w-auto" />
        </div>

        <Link
          href="/hub"
          className="group flex h-13 w-full sm:w-auto items-center justify-center gap-2.5 rounded-2xl bg-foreground px-6 text-sm font-semibold text-background shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground shrink-0"
        >
          <span>Convert to Live Room</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>
    </div>
  );
}
