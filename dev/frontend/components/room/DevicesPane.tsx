"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, Volume2, Loader2, CheckCircle2, Activity,
  ChevronDown, Headphones, Monitor, Smartphone, Laptop
} from "lucide-react";
import type { Participant } from "../../lib/types";
import { devicesApi, type Device } from "../../lib/api";

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
  
  if (n.includes("iphone") || n.includes("android") || n.includes("ipad") || n.includes("phone")) return Smartphone;
  if (n.includes("mac") || n.includes("windows") || n.includes("linux") || n.includes("laptop")) return Laptop;
  
  switch (type) {
    case "mobile":     return Smartphone;
    case "speakers":   return Monitor;
    case "headphones": return Headphones;
    default:           return Laptop;
  }
}

function getFriendlyDeviceName(name: string, type?: string, fallback?: string) {
  const n = (name || "").toLowerCase();
  const f = (fallback || "").toLowerCase();
  
  if (n.includes("iphone") || f.includes("iphone")) return "iPhone";
  if (n.includes("ipad") || f.includes("ipad")) return "iPad";
  if (n.includes("mac") || f.includes("mac") || f.includes("macos")) return "Mac";
  if (n.includes("windows") || f.includes("windows") || f.includes("win")) return "Windows PC";
  if (n.includes("android") || f.includes("android")) return "Android";
  if (n.includes("linux") || f.includes("linux")) return "Linux";
  
  if (type === "mobile") return "Mobile Device";
  if (type === "speakers") return "Desktop";
  return "Connected Device";
}

function parseParticipantNames(p: Participant) {
  const nameParts = (p.displayName || "").split("::");
  const userName = nameParts[0]?.trim() || p.displayName || "Guest";
  const rawDeviceFromDisplayName = nameParts.length > 1 ? nameParts[1]?.trim() : undefined;

  let deviceName = p.outputDeviceName?.trim();
  if (!deviceName && rawDeviceFromDisplayName) {
    deviceName = rawDeviceFromDisplayName;
  }
  if (!deviceName) {
    deviceName = getFriendlyDeviceName("", p.outputDeviceType, rawDeviceFromDisplayName);
  }

  return {
    userName,
    deviceName,
  };
}

function formatLastSeen(dateStr?: string | null): string {
  if (!dateStr) return "Offline";
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  if (isNaN(diffMs)) return "Offline";
  if (diffMs < 60_000) return "Active just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days}d ago`;
}

function OfflineDeviceCard({ device }: { device: Device }) {
  const DevIcon = getDeviceIcon(device.name, device.user_agent ?? undefined);
  const lastSeenStr = formatLastSeen(device.last_seen_at);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 0.65, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-xl border border-foreground/[0.05] bg-foreground/[0.02] px-3 py-2.5 flex items-center justify-between gap-3 transition-opacity duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-foreground/5 text-foreground/40">
          <DevIcon className="w-4 h-4" />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-foreground/20 rounded-full border border-background" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground/60 truncate">{device.name}</span>
          </div>
          <span className="text-[10px] font-semibold text-foreground/35 block mt-0.5">{lastSeenStr}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-foreground/5 border border-foreground/10 shrink-0">
        <span className="text-[9px] font-black uppercase tracking-wider text-foreground/40">Offline</span>
      </div>
    </motion.div>
  );
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
    }, 500);
  };

  const { deviceName } = parseParticipantNames(p);
  const DevIcon = getDeviceIcon(deviceName, p.outputDeviceType ?? undefined);
  const lat = Math.round(p.latency ?? 0);
  const canAdjustVol = isMySelf || isHost;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={`rounded-xl border transition-colors duration-200 overflow-hidden ${
        isMe
          ? "border-foreground/[0.15] bg-foreground/[0.06]"
          : "border-foreground/[0.07] bg-foreground/[0.03] hover:bg-foreground/[0.05]"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main row */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        onClick={() => {
           if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
           setExpanded(v => !v);
        }}
      >
        {/* Device Icon */}
        <div className={`relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isMe ? "bg-foreground/15 text-foreground shadow-xs" : "bg-foreground/10 text-foreground/70"
        }`}>
          <DevIcon className="w-4 h-4" />
          {/* Online status indicator */}
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full border border-background shadow-[0_0_4px_#4ade80]" />
        </div>

        {/* Info - Device Name ONLY as primary title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-foreground/90 truncate">{deviceName}</span>
            {isMe && <span className="text-[8px] font-black tracking-widest text-emerald-500 dark:text-emerald-400 uppercase">Active</span>}
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
            <div className="px-3 pb-3 space-y-2.5">
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
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Latency</div>
                  <div className="text-xs font-black" style={{ color: latencyColor(lat) }}>{lat}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Jitter</div>
                  <div className="text-xs font-black text-foreground/70">{Math.round(p.jitter ?? 0)}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/[0.04] px-2.5 py-1.5 col-span-2">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Status</div>
                  <div className="text-[11px] font-semibold text-foreground/70">
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

interface UserGroup {
  key: string;
  userName: string;
  isHost: boolean;
  isMe: boolean;
  activeParticipants: Participant[];
  offlineDevices: Device[];
}

export function DevicesPane({
  participants, mySocketId, hostId, myUserId, isHost,
  deviceSyncProgress, onVolumeChange,
}: DevicesPaneProps) {
  const [accountDevices, setAccountDevices] = useState<Device[]>([]);

  useEffect(() => {
    devicesApi.mine()
      .then(({ devices }) => {
        setAccountDevices(devices.filter(d => !d.device_key.startsWith('NATIVE-')));
      })
      .catch(() => {});
  }, []);

  const userGroups = useMemo(() => {
    const map = new Map<string, UserGroup>();

    // 1. Group active room participants
    participants.forEach(p => {
      const { userName } = parseParticipantNames(p);
      const key = p.userId ? `user_${p.userId}` : `name_${userName.toLowerCase()}`;

      let group = map.get(key);
      if (!group) {
        group = {
          key,
          userName,
          isHost: false,
          isMe: false,
          activeParticipants: [],
          offlineDevices: [],
        };
        map.set(key, group);
      }

      if ((p.userId && p.userId === hostId) || p.socketId === hostId) {
        group.isHost = true;
      }
      if ((p.userId && p.userId === myUserId) || p.socketId === mySocketId) {
        group.isMe = true;
      }

      group.activeParticipants.push(p);
    });

    // 2. Reconcile account devices with my user group
    if (accountDevices.length > 0) {
      const myKey = myUserId ? `user_${myUserId}` : Array.from(map.keys()).find(k => map.get(k)?.isMe);
      const myUserName = myKey ? map.get(myKey)?.userName ?? "Your Devices" : "Your Account Devices";
      const targetKey = myKey || "my_account_devices";

      let myGroup = map.get(targetKey);
      if (!myGroup) {
        myGroup = {
          key: targetKey,
          userName: myUserName,
          isHost: isHost,
          isMe: true,
          activeParticipants: [],
          offlineDevices: [],
        };
        map.set(targetKey, myGroup);
      }

      const activeDevNames = new Set(
        myGroup.activeParticipants.map(p => parseParticipantNames(p).deviceName.toLowerCase().trim())
      );

      accountDevices.forEach(d => {
        const dNameLower = (d.name || "").toLowerCase().trim();
        const isInRoom = activeDevNames.has(dNameLower) ||
          myGroup?.activeParticipants.some(p => p.outputDeviceName?.toLowerCase().trim() === dNameLower);

        if (!isInRoom) {
          myGroup?.offlineDevices.push(d);
        }
      });
    }

    return Array.from(map.values());
  }, [participants, accountDevices, hostId, myUserId, mySocketId, isHost]);

  const totalDeviceCount = useMemo(() => {
    return userGroups.reduce((acc, g) => acc + g.activeParticipants.length + g.offlineDevices.length, 0);
  }, [userGroups]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-foreground/60" />
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">
            Account Devices
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">
            {participants.length} online
          </span>
        </div>
      </div>

      {/* Scrollable list segregated by User */}
      <div
        className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(128,128,128,0.15) transparent" }}
      >
        <AnimatePresence>
          {userGroups.map(group => {
            const initials = group.userName.slice(0, 2).toUpperCase();
            const groupTotal = group.activeParticipants.length + group.offlineDevices.length;

            return (
              <div key={group.key} className="space-y-1.5">
                {/* User Header */}
                <div className="flex items-center justify-between px-1 text-xs gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 ${
                      group.isMe ? "bg-foreground/20 text-foreground" : "bg-foreground/10 text-foreground/70"
                    }`}>
                      {initials}
                    </div>
                    <span className="font-bold text-foreground/90 truncate whitespace-nowrap">{group.userName}</span>
                    {group.isHost && (
                      <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md shrink-0 whitespace-nowrap">
                        Host
                      </span>
                    )}
                    {group.isMe && (
                      <span className="text-[9px] font-black tracking-widest text-foreground/40 uppercase shrink-0 whitespace-nowrap">
                        (You)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-foreground/40 shrink-0 whitespace-nowrap ml-1">
                    {groupTotal} {groupTotal === 1 ? "device" : "devices"}
                  </span>
                </div>

                {/* Devices belonging to this User */}
                <div className="space-y-1.5 pl-2 border-l border-foreground/10">
                  {/* Active devices in room */}
                  {group.activeParticipants.map(p => {
                    const isMe = p.socketId === mySocketId;
                    const isThisHost = (p.userId && p.userId === hostId) || p.socketId === hostId;
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

                  {/* Offline account devices */}
                  {group.offlineDevices.map(d => (
                    <OfflineDeviceCard key={d.id} device={d} />
                  ))}
                </div>
              </div>
            );
          })}
        </AnimatePresence>

        {totalDeviceCount === 0 && (
          <div className="text-center text-foreground/20 text-xs py-8">
            No devices found
          </div>
        )}
      </div>
    </div>
  );
}

