"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, Volume2, Crown, Loader2, CheckCircle2, Activity,
  ChevronDown, Headphones, Monitor, Smartphone, Laptop
} from "lucide-react";
import type { Participant } from "../../lib/types";

interface DevicesPaneProps {
  participants: Participant[];
  mySocketId: string | null;
  hostId: string | null;
  myUserId?: string;
  isHost: boolean;
  deviceSyncProgress: Record<string, number>;
  onVolumeChange?: (socketId: string, volume: number) => void;
}

function latencyColor(ms: number): string {
  if (ms < 50) return "#22c55e";
  if (ms < 120) return "#eab308";
  return "#ef4444";
}

function getDeviceIcon(name: string, type?: string) {
  const n = (name || "").toLowerCase();
  
  // Explicit OS match
  if (n.includes("iphone") || n.includes("android") || n.includes("ipad")) return Smartphone;
  if (n.includes("mac") || n.includes("windows") || n.includes("linux")) return Laptop;
  
  // Type fallback
  switch (type) {
    case "mobile":     return Smartphone;
    case "speakers":   return Monitor;
    case "headphones": return Headphones;
    default:           return Headphones;
  }
}

function getFriendlyDeviceName(name: string, type?: string, fallback?: string) {
  const n = (name || "").toLowerCase();
  const f = (fallback || "").toLowerCase();
  
  if (n.includes("iphone") || f.includes("iphone")) return "iPhone";
  if (n.includes("ipad") || f.includes("ipad")) return "iPad";
  if (n.includes("mac") || f.includes("mac") || f.includes("macos")) return "Mac";
  if (n.includes("windows") || f.includes("windows") || f.includes("win")) return "Windows";
  if (n.includes("android") || f.includes("android")) return "Android";
  if (n.includes("linux") || f.includes("linux")) return "Linux";
  
  if (type === "mobile") return "Mobile";
  if (type === "speakers") return "Desktop";
  return "Device";
}

function DeviceCard({
  p, isMe, isHost, isMySelf, syncProgress, onVolumeChange,
}: {
  p: Participant;
  isMe: boolean;
  isHost: boolean;
  isMySelf: boolean;
  syncProgress: number;
  onVolumeChange?: (socketId: string, vol: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [localVol, setLocalVol] = useState(p.volume ?? 100);

  useEffect(() => {
    setLocalVol(p.volume ?? 100);
  }, [p.volume]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setExpanded(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setExpanded(false);
    }, 500); // 500ms delay before closing
  };

  const nameParts = p.displayName.split("::");
  const displayName = nameParts[0] ?? p.displayName;
  const fallbackName = nameParts.length > 1 ? nameParts[1] : undefined;
  const deviceLabel = getFriendlyDeviceName(p.outputDeviceName || "", p.outputDeviceType, fallbackName);
  
  const DevIcon = getDeviceIcon(deviceLabel, p.outputDeviceType ?? undefined);
  
  const initials = displayName.slice(0, 2).toUpperCase();
  const lat = Math.round(p.latency ?? 0);

  const canAdjustVol = isMySelf || isHost;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`rounded-2xl border transition-colors duration-200 overflow-hidden ${
        isMe
          ? "border-foreground/[0.15] bg-foreground/[0.06]"
          : "border-foreground/[0.07] bg-foreground/[0.03] hover:bg-foreground/[0.05]"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main row */}
      <button
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
        onClick={() => {
           if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
           setExpanded(v => !v);
        }}
      >
        {/* Avatar */}
        <div className={`relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-black text-sm ${
          isMe ? "bg-linear-to-tr from-zinc-200 to-zinc-100 dark:from-zinc-800 dark:to-zinc-700 shadow-inner" : "bg-foreground/10 text-foreground/80"
        }`}>
          {initials}
          {isHost && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-md">
              <Crown className="w-2.5 h-2.5 text-amber-900" />
            </div>
          )}
          {/* online dot */}
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-background shadow-[0_0_6px_#4ade80]" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-foreground/90 truncate">{displayName}</span>
            {isMe && <span className="text-[9px] font-black tracking-widest text-foreground/60 uppercase">You</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <DevIcon className="w-3 h-3 text-foreground/30 shrink-0" />
            <span className="text-[11px] text-foreground/40 truncate">{deviceLabel}</span>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          {p.isReady ? (
            syncProgress > 0 && syncProgress < 100 ? (
              <div className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                <span className="text-[10px] font-black text-amber-500">{syncProgress}%</span>
              </div>
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            )
          ) : (
            <Loader2 className="w-3.5 h-3.5 text-foreground/30 animate-spin" />
          )}

          {lat > 0 && (
            <div
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-black"
              style={{ color: latencyColor(lat), backgroundColor: latencyColor(lat) + "22" }}
            >
              <Wifi className="w-2.5 h-2.5" />
              {lat}
            </div>
          )}

          <ChevronDown
            className={`w-3.5 h-3.5 text-foreground/30 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded controls */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3.5 pb-3.5 space-y-3">
              {/* Volume slider */}
              {canAdjustVol && (
                <div className="flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
                  <input
                    type="range"
                    min={0} max={100} step={1}
                    value={localVol}
                    onClick={e => e.stopPropagation()}
                    onChange={e => {
                      const v = Number(e.target.value);
                      setLocalVol(v);
                      onVolumeChange?.(p.socketId, v);
                    }}
                    className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-white"
                    style={{
                      background: `linear-gradient(to right, rgba(255,255,255,0.8) ${localVol}%, rgba(255,255,255,0.2) ${localVol}%)`,
                    }}
                  />
                  <span className="text-[10px] font-black text-foreground/40 w-7 text-right">{localVol}%</span>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Latency</div>
                  <div className="text-sm font-black" style={{ color: latencyColor(lat) }}>{lat}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-2">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Jitter</div>
                  <div className="text-sm font-black text-foreground/70">{Math.round(p.jitter ?? 0)}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-2 col-span-2">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Status</div>
                  <div className="text-xs font-semibold text-foreground/70">
                    {p.isBlocked ? "Blocked" : p.isReady ? "Synced & Playing" : "Buffering…"}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function DevicesPane({
  participants, mySocketId, hostId, myUserId, isHost,
  deviceSyncProgress, onVolumeChange,
}: DevicesPaneProps) {
  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-foreground/60" />
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">
            Devices
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{participants.length} online</span>
        </div>
      </div>

      {/* Scrollable list */}
      <div
        className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
      >
        <AnimatePresence>
          {participants.map(p => {
            const isMe = p.socketId === mySocketId;
            const isThisHost = p.userId ? p.userId === hostId : p.socketId === hostId;
            const progress = deviceSyncProgress[p.socketId] ?? 0;
            return (
              <DeviceCard
                key={p.socketId}
                p={p}
                isMe={isMe}
                isHost={isThisHost}
                isMySelf={isMe}
                syncProgress={progress}
                onVolumeChange={onVolumeChange}
              />
            );
          })}
        </AnimatePresence>

        {participants.length === 0 && (
          <div className="text-center text-foreground/20 text-xs py-8">
            No participants yet
          </div>
        )}
      </div>
    </div>
  );
}
