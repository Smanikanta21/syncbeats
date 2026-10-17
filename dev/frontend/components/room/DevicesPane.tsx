"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wifi, Volume2, Loader2, CheckCircle2, Activity, Plus, UserPlus, ChevronDown
} from "lucide-react";
import type { Participant } from "../../lib/types";
import { devicesApi, type Device, getDeviceId } from "../../lib/api";
import { getSocket } from "../../lib/socket";
import { cn } from "../../lib/utils";
import { getDeviceIcon, getFriendlyDeviceName, parseParticipantNames } from "../../lib/deviceNaming";
import { HoverExpandPill } from "../HoverExpandPill";

interface DevicesPaneProps {
  participants: Participant[];
  mySocketId: string | null;
  hostId: string | null;
  myUserId?: string;
  isHost: boolean;
  isPlaying?: boolean;
  deviceSyncProgress: Record<string, number>;
  onVolumeChange?: (socketId: string, volume: number) => void;
}

/**
 * Latency readout colour. This is a genuine state signal — good / marginal /
 * bad round-trip — so it reads the semantic tokens rather than the brand inks.
 *
 * Previously returned raw Tailwind v3 hexes (#22c55e, #eab308, #ef4444), which
 * the token sweep could not reach because they are string literals behind a
 * function. That left them a palette behind the card they sit in, whose border,
 * fill and status dot are all ok/warn/bad now — two greens disagreeing side by
 * side. The steps are the dark end of each scale because this renders as 12px
 * text on a background that is paper in the light theme: warn-500 is L81.7%
 * (~1.3:1) and even warn-700 only reaches ~3.1:1, so amber needs 800 to clear
 * 4.5:1. The sim's own dark theme keeps these readable too — they sit near 5:1
 * against the depth ground.
 */
function latencyColor(ms: number): string {
  if (ms < 50) return "var(--color-ok-700)";
  if (ms < 120) return "var(--color-warn-800)";
  return "var(--color-bad-700)";
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

function OfflineDeviceCard({ device, customDeviceName, onRename }: { device: Device, customDeviceName?: string, onRename: (id: string, name: string) => Promise<void> }) {
  const DevIcon = getDeviceIcon(device.name, device.user_agent ?? undefined);
  const lastSeenStr = formatLastSeen(device.last_seen_at);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(device.name);
  const [saving, setSaving] = useState(false);

  const displayName = customDeviceName || device.name;

  const handleSave = async () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === device.name) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(device.id, trimmed);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 0.65, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="group rounded-xl border border-foreground/5 bg-foreground/2 px-3 py-2.5 flex items-center justify-between gap-3 transition-opacity duration-200"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-foreground/5 text-foreground/40">
          <DevIcon className="w-4 h-4" />
          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-foreground/20 rounded-full border border-background" />
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5 mr-2">
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="w-full bg-background text-xs font-bold text-foreground rounded-md px-2 py-1 border border-foreground/20 outline-none"
                disabled={saving}
              />
              <button onClick={handleSave} disabled={saving} className="text-[10px] font-bold bg-ok-500/20 text-ok-700 dark:text-ok-400 px-2 py-1 rounded-md">
                {saving ? '...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground/60 truncate">{displayName}</span>
              <button onClick={() => setIsEditing(true)} className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[10px] font-bold text-foreground/40 hover:text-foreground transition-opacity">Edit</button>
            </div>
          )}
          {!isEditing && <span className="text-[10px] font-semibold text-foreground/35 block mt-0.5">{lastSeenStr}</span>}
        </div>
      </div>

      {!isEditing && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-foreground/5 border border-foreground/10 shrink-0">
          <span className="text-[9px] font-black uppercase tracking-wider text-foreground/40">Offline</span>
        </div>
      )}
    </motion.div>
  );
}

function ParticipantRow({
  p,
  isMe,
  isHost,
  isMySelf,
  isPlaying,
  syncProgress,
  onVolumeChange,
  customDeviceName,
  dbId,
  onRename,
}: {
  p: Participant;
  isMe: boolean;
  isHost: boolean;
  isMySelf: boolean;
  isPlaying?: boolean;
  syncProgress: number;
  onVolumeChange?: (socketId: string, vol: number) => void;
  customDeviceName?: string;
  dbId?: string;
  onRename?: (id: string, name: string) => Promise<void>;
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

  const { deviceName: parsedDeviceName } = parseParticipantNames(p);
  const deviceName = customDeviceName || parsedDeviceName;
  const DevIcon = getDeviceIcon(deviceName, p.outputDeviceType ?? undefined);
  const lat = Math.round(p.latency ?? 0);
  const canAdjustVol = isMySelf || isHost;

  // Auto-expand card if a latency spike occurs (>150ms)
  const prevLatRef = useRef(lat);
  useEffect(() => {
    if (lat > 150 && prevLatRef.current <= 150) {
      setExpanded(true);
    }
    prevLatRef.current = lat;
  }, [lat]);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(deviceName);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const trimmed = editName.trim();
    if (!trimmed || trimmed === deviceName) {
      setIsEditing(false);
      return;
    }
    if (!dbId || !onRename) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onRename(dbId, trimmed);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const isBufferingActive = isPlaying && !p.isReady && !p.isBlocked;
  const isSyncingActive = syncProgress > 0 && syncProgress < 100;

  let statusText = "Connected & Ready";
  if (p.isBlocked) {
    statusText = "Blocked (Audio Unlock Required)";
  } else if (isSyncingActive) {
    statusText = `Syncing… ${syncProgress}%`;
  } else if (isBufferingActive) {
    statusText = "Syncing / Buffering…";
  } else if (p.isReady && isPlaying) {
    statusText = "Synced & Playing";
  } else if (p.isReady) {
    statusText = "Synced & Ready";
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        "group rounded-xl border transition-all duration-300 overflow-hidden",
        isBufferingActive
          ? "border-bad-500/40 bg-bad-500/10 animate-[pulse_2s_infinite] shadow-[0_0_15px_color-mix(in_srgb,var(--color-bad-500)_20%,transparent)]"
          : isSyncingActive
            ? "border-warn-500/30 bg-warn-500/[0.07] shadow-[0_0_15px_color-mix(in_srgb,var(--color-warn-500)_15%,transparent)]"
            : isMe
              ? "border-ok-500/30 bg-ok-500/[0.07] shadow-[0_0_15px_color-mix(in_srgb,var(--color-ok-500)_12%,transparent)]"
              : "border-foreground/[0.07] bg-foreground/3 hover:bg-foreground/5"
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Main row — a div, not a <button>: it contains the Edit button and the
          rename input, and <button> may not have interactive descendants. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
        onClick={() => {
           if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
           setExpanded(v => !v);
        }}
        onKeyDown={e => {
          // Only the row itself — never Space/Enter typed into the rename input.
          if (e.target !== e.currentTarget) return;
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
          setExpanded(v => !v);
        }}
      >
        {/* Device Icon */}
        <div className={cn(
          "relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all",
          isBufferingActive
            ? "bg-bad-500/20 text-bad-700 dark:text-bad-400 border border-bad-500/30 shadow-[0_0_10px_color-mix(in_srgb,var(--color-bad-500)_30%,transparent)] animate-pulse"
            : isSyncingActive
              ? "bg-warn-500/20 text-warn-800 dark:text-warn-400 border border-warn-500/30 shadow-[0_0_10px_color-mix(in_srgb,var(--color-warn-500)_20%,transparent)]"
              : "bg-ok-500/20 text-ok-700 dark:text-ok-400 border border-ok-500/30 shadow-[0_0_10px_color-mix(in_srgb,var(--color-ok-500)_20%,transparent)]"
        )}>
          <DevIcon className="w-4 h-4" />
          {/* Status indicator dot */}
          <div className={cn(
            "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
            isBufferingActive
              ? "bg-bad-400 shadow-[0_0_4px_var(--color-bad-400)] animate-ping"
              : isSyncingActive
                ? "bg-warn-400 shadow-[0_0_4px_var(--color-warn-400)] animate-pulse"
                : "bg-ok-400 shadow-[0_0_4px_var(--color-ok-400)]"
          )} />
        </div>

        {/* Info - Device Name ONLY as primary title */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5 mr-2" onClick={e => e.stopPropagation()}>
              <input
                autoFocus
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => e.key === 'Enter' && handleSave(e)}
                className="w-full bg-background text-xs font-bold text-foreground rounded-md px-2 py-1 border border-foreground/20 outline-none"
                disabled={saving}
              />
              <button onClick={handleSave} disabled={saving} className="text-[10px] font-bold bg-ok-500/20 text-ok-700 dark:text-ok-400 px-2 py-1 rounded-md">
                {saving ? '...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-foreground/90 truncate">{deviceName}</span>
              {isMe && dbId && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-[10px] font-bold text-foreground/40 hover:text-foreground transition-opacity"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          {isSyncingActive && (
            <div className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 text-warn-700 animate-spin" />
              <span className="text-[10px] font-black text-warn-700">{syncProgress}%</span>
            </div>
          )}

          <ChevronDown
            className={`w-3.5 h-3.5 text-foreground/30 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </div>

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
                    style={{
                      ['--pct' as string]: `${localVol}%`,
                      ['--thumb' as string]: '0.75rem',
                    }}
                    className="sb-range flex-1 h-1.5 rounded-full outline-none cursor-pointer"
                  />
                  <span className="text-[10px] font-black text-foreground/40 w-7 text-right">{localVol}%</span>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-foreground/4 px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Latency</div>
                  <div className="text-xs font-black" style={{ color: latencyColor(lat) }}>{lat}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/4 px-2.5 py-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Jitter</div>
                  <div className="text-xs font-black text-foreground/70">{Math.round(p.jitter ?? 0)}ms</div>
                </div>
                <div className="rounded-xl bg-foreground/4 px-2.5 py-1.5 col-span-2">
                  <div className="text-[9px] uppercase tracking-widest text-foreground/30 font-bold mb-0.5">Status</div>
                  <div className="text-[11px] font-semibold text-foreground/70">
                    {statusText}
                  </div>
                </div>
              </div>

              {/* Compare & Calibrate Sync Button (for secondary / other devices) */}
              {!isMySelf && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    document.dispatchEvent(new CustomEvent("island:expand-sync"));
                  }}
                  className="w-full mt-2 py-1.5 px-3 rounded-xl bg-ok-500/10 hover:bg-ok-500/20 text-ok-700 dark:text-ok-400 border border-ok-500/25 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 shadow-xs"
                >
                  <Activity className="w-3.5 h-3.5 text-ok-700 dark:text-ok-400" />
                  <span>Compare & Calibrate Sync</span>
                </button>
              )}
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
  participants, mySocketId, hostId, myUserId, isHost, isPlaying = false,
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

  const handleRenameDevice = async (id: string, name: string) => {
    try {
      const { device } = await devicesApi.rename(id, name);
      setAccountDevices(prev => prev.map(d => d.id === device.id ? device : d));
      // If we are renaming an active device, we need to let the socket room know.
      // We can do this by checking if the renamed device corresponds to any active participant.
      // But actually, room:updateDevice uses our socket connection. So we only emit if it's OUR current device.
      if (device.device_key === getDeviceId()) {
         getSocket().emit('room:updateDevice', { deviceName: name });
      }
    } catch (e) {
      console.error("Failed to rename device", e);
    }
  };

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
      let myKey = myUserId ? `user_${myUserId}` : Array.from(map.keys()).find(k => map.get(k)?.isMe);
      
      // If we used myUserId but that group doesn't exist (e.g. legacy client or missing userId in snapshot),
      // fallback to finding the group where isMe is true.
      if (myKey && !map.has(myKey)) {
        const fallbackKey = Array.from(map.keys()).find(k => map.get(k)?.isMe);
        if (fallbackKey) myKey = fallbackKey;
      }

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

      const activeDeviceIds = new Set(
        myGroup.activeParticipants
          .map(p => p.deviceId)
          .filter(Boolean)
      );

      accountDevices.forEach(d => {
        // Precise matching by deviceId if available, fallback to name matching for legacy clients
        let isInRoom = false;
        
        if (d.device_key && activeDeviceIds.size > 0) {
          isInRoom = activeDeviceIds.has(d.device_key);
        } else {
          const dNameLower = (d.name || "").toLowerCase().trim();
          const activeDevNames = new Set(
            myGroup?.activeParticipants.map(p => parseParticipantNames(p).deviceName.toLowerCase().trim())
          );
          isInRoom = activeDevNames.has(dNameLower) ||
            myGroup?.activeParticipants.some(p => p.outputDeviceName?.toLowerCase().trim() === dNameLower) || false;
        }

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
      <div className="flex flex-col gap-2 px-1 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-foreground/60" />
            <span className="micro-label">
              Account Devices
            </span>
          </div>
          <HoverExpandPill
            icon={UserPlus}
            label="Invite"
            onClick={() => document.dispatchEvent(new CustomEvent("island:expand-invite"))}
            active
            activeColor="bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-xs"
            title="Invite Friends"
          />
        </div>
        
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold animate-pulse text-ok-700 dark:text-ok-400">
          {/* <span className="w-1.5 h-1.5 rounded-full bg-ok-400" /> */}
          <span>{participants.length} online</span>
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

            const baseNames = new Map<string, number>();
            group.activeParticipants.forEach(p => {
              const name = parseParticipantNames(p).deviceName;
              baseNames.set(name, (baseNames.get(name) || 0) + 1);
            });
            group.offlineDevices.forEach(d => {
              const name = d.name || "Unknown Device";
              baseNames.set(name, (baseNames.get(name) || 0) + 1);
            });

            const activeCounters = new Map<string, number>();
            const activeCustomNames = group.activeParticipants.map(p => {
              const name = parseParticipantNames(p).deviceName;
              if ((baseNames.get(name) || 0) > 1) {
                const c = (activeCounters.get(name) || 0) + 1;
                activeCounters.set(name, c);
                return `${name} ${c}`;
              }
              return name;
            });

            const offlineCustomNames = group.offlineDevices.map(d => {
              const name = d.name || "Unknown Device";
              if ((baseNames.get(name) || 0) > 1) {
                const c = (activeCounters.get(name) || 0) + 1;
                activeCounters.set(name, c);
                return `${name} ${c}`;
              }
              return name;
            });

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
                      /* Role, not a caution — so the live accent rather than
                         `warn`. It was amber only because a Host badge looks
                         like a crown, which is not what warn means. */
                      <span
                        className="border border-(--accent-border) text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-md shrink-0 whitespace-nowrap"
                        style={{ background: "var(--accent-glow)", color: "var(--accent-color)" }}
                      >
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
                  {group.activeParticipants.map((p, idx) => {
                    const isMe = p.socketId === mySocketId;
                    const isThisHost = (p.userId && p.userId === hostId) || p.socketId === hostId;
                    const progress = deviceSyncProgress[p.socketId] ?? 0;
                    const dbId = accountDevices.find(d => d.device_key === p.deviceId)?.id;
                    return (
                      <ParticipantRow
                        key={p.socketId}
                        p={p}
                        isMe={isMe}
                        isHost={isThisHost}
                        isMySelf={isMe}
                        isPlaying={isPlaying}
                        syncProgress={progress}
                        onVolumeChange={onVolumeChange}
                        customDeviceName={activeCustomNames[idx]}
                        dbId={dbId}
                        onRename={handleRenameDevice}
                      />
                    );
                  })}

                  {/* Offline account devices */}
                  {group.offlineDevices.map((d, idx) => (
                    <OfflineDeviceCard key={d.id} device={d} customDeviceName={offlineCustomNames[idx]} onRename={handleRenameDevice} />
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

