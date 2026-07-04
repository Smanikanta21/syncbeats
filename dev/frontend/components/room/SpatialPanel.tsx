"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, User, Smartphone, Monitor, ChevronRight } from "lucide-react";
import type { DeviceSpatialState, Participant } from "../../lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserGroup {
  userId: string;
  displayName: string;
  initials: string;
  isMe: boolean;
  devices: {
    deviceId: string;
    deviceName: string;
    isMe: boolean;
    deviceType?: string;
  }[];
}

interface SpatialPanelProps {
  myDeviceId: string;
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  isPlaying: boolean;
  onUpdatePosition: (
    deviceId: string,
    pos: { angle: number; radius: number; elevation: number }
  ) => void;
  orbitSpeed?: number;
  orbitData?: {fromId: string, toId: string, frac: number} | null;
  onOrbitSpeedChange?: (speed: number) => void;
}

// ── Persistence helpers ───────────────────────────────────────────────────

function getStorageKey(roomId: string, myUserId: string) {
  return `syncbeats:spatial:${roomId}:${myUserId}`;
}

function loadPositions(
  roomId: string,
  myUserId: string
): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(getStorageKey(roomId, myUserId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions(
  roomId: string,
  myUserId: string,
  positions: Record<string, { x: number; y: number }>
) {
  try {
    localStorage.setItem(
      getStorageKey(roomId, myUserId),
      JSON.stringify(positions)
    );
  } catch {}
}

// ── Ego-Centric Room View ─────────────────────────────────────────────────

export function SpatialPanel({
  myDeviceId,
  spatialDevices,
  participants,
  isPlaying,
  onUpdatePosition,
  orbitSpeed = 3,
  orbitData,
  onOrbitSpeedChange,
}: SpatialPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract roomId from URL
  const roomId =
    typeof window !== "undefined"
      ? window.location.pathname.split("/").pop() ?? ""
      : "";

  // Determine current user
  const myParticipant = participants.find((p) => p.socketId === myDeviceId);
  const myUserId = myParticipant?.userId ?? myParticipant?.socketId ?? myDeviceId;

  // Local positions: { entityId -> { x, y } } where x,y are 0..1 normalised
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >(() => loadPositions(roomId, myUserId));

  // Persist whenever positions change
  useEffect(() => {
    if (roomId && myUserId) {
      savePositions(roomId, myUserId, positions);
    }
  }, [positions, roomId, myUserId]);

  // ── Build user groups ──────────────────────────────────────────────────

  const userGroups: UserGroup[] = useMemo(() => {
    const map = new Map<string, UserGroup>();

    participants.forEach((p) => {
      const userId = p.userId ?? p.socketId;
      const parts = p.displayName.split("::");
      const baseName = parts[0];
      const fallbackName = parts.length > 1 ? parts[1] : parts[0];
      const friendlyDevName = getFriendlyDeviceName(p.outputDeviceName || "", p.outputDeviceType, fallbackName);
      const isMe = userId === myUserId;

      if (!map.has(userId)) {
        map.set(userId, {
          userId,
          displayName: baseName,
          initials: baseName.slice(0, 2).toUpperCase(),
          isMe,
          devices: [],
        });
      }
      map.get(userId)!.devices.push({
        deviceId: p.socketId,
        deviceName: friendlyDevName,
        isMe: p.socketId === myDeviceId,
        deviceType: p.outputDeviceType,
      });
    });

    return Array.from(map.values());
  }, [participants, myDeviceId, myUserId]);

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

  function getDeviceIcon(name: string, type?: string) {
    const n = name.toLowerCase();
    if (type === "mobile" || n.includes("iphone") || n.includes("android") || n.includes("ipad")) return Smartphone;
    if (type === "speakers" || n.includes("mac") || n.includes("windows") || n.includes("pc")) return Monitor;
    return Headphones;
  }

  // ── Default positions for users not yet placed ─────────────────────────

  const getPos = useCallback(
    (entityId: string, fallbackIndex: number, total: number) => {
      if (positions[entityId]) return positions[entityId];
      // Spread around a circle at 35% radius from center
      const angle = (fallbackIndex / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
      return {
        x: 0.5 + 0.35 * Math.cos(angle),
        y: 0.5 + 0.35 * Math.sin(angle),
      };
    },
    [positions]
  );

  const getDevicePos = useCallback((deviceId: string) => {
    if (positions[deviceId]) return positions[deviceId];
    
    // Find which user owns this device
    for (let i = 0; i < userGroups.length; i++) {
      const g = userGroups[i];
      const dIdx = g.devices.findIndex(d => d.deviceId === deviceId);
      if (dIdx !== -1) {
        const userPos = g.isMe ? { x: 0.5, y: 0.5 } : getPos(g.userId, i, userGroups.length);
        const fallbackAngle = (dIdx / Math.max(g.devices.length, 1)) * Math.PI * 2;
        const fanRadius = 0.12;
        return {
          x: userPos.x + fanRadius * Math.cos(fallbackAngle),
          y: userPos.y + fanRadius * Math.sin(fallbackAngle),
        };
      }
    }
    // fallback if not found
    return { x: 0.5, y: 0.5 };
  }, [positions, userGroups, getPos]);

  // ── Drag handlers ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (entityId: string, isUser: boolean, isMe: boolean, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      if (isUser && isMe) return; // Cannot drag the center user
      draggingRef.current = entityId;
      // Reset auto-close timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setExpandedUserId(null), 5000);
      }
    },
    []
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0.05, Math.min(0.95, (clientX - rect.left) / rect.width));
      const y = Math.max(0.05, Math.min(0.95, (clientY - rect.top) / rect.height));

      let constrainedX = x;
      let constrainedY = y;

      // Constrain device dragging relative to owner
      const ownerGroup = userGroups.find(g => g.devices.some(d => d.deviceId === draggingRef.current));
      if (ownerGroup && ownerGroup.userId !== draggingRef.current) {
        // It's a device
        const ownerPos = ownerGroup.isMe 
          ? { x: 0.5, y: 0.5 } 
          : getPos(ownerGroup.userId, userGroups.indexOf(ownerGroup), userGroups.length);
        
        const dx = x - ownerPos.x;
        const dy = y - ownerPos.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const MAX_DIST = 0.20; // Max distance from user
        if (dist > MAX_DIST) {
          constrainedX = ownerPos.x + (dx / dist) * MAX_DIST;
          constrainedY = ownerPos.y + (dy / dist) * MAX_DIST;
        }
      }

      setPositions((prev) => ({
        ...prev,
        [draggingRef.current!]: { x: constrainedX, y: constrainedY },
      }));

      // Convert to polar for spatial engine (relative to center)
      const dx = constrainedX - 0.5;
      const dy = constrainedY - 0.5;
      const angle = Math.atan2(dx, -dy);
      const radius = Math.min(3, Math.sqrt(dx * dx + dy * dy) * 6);
      onUpdatePosition(draggingRef.current!, { angle, radius, elevation: 0 });
    },
    [onUpdatePosition, userGroups, getPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => handleMove(e.clientX, e.clientY),
    [handleMove]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    [handleMove]
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // ── Group expand/collapse ──────────────────────────────────────────────

  const handleGroupClick = useCallback(
    (userId: string, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setExpandedUserId((prev) => (prev === userId ? null : userId));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setExpandedUserId(null), 5000);
    },
    []
  );

  const handleContainerClick = useCallback(() => {
    setExpandedUserId(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 relative">
            <div
              className="absolute inset-0 rounded-full border border-foreground/20 animate-ping"
              style={{ animationDuration: "2s" }}
            />
            <div className="w-4 h-4 rounded-full bg-foreground/20 border border-foreground/20" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">
            Spatial Audio
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black tracking-widest bg-foreground/20 text-foreground dark:text-foreground border border-foreground/20">
            BETA
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-foreground/25 text-center mb-3 shrink-0 px-4">
        {isPlaying
          ? "Audio traveling through devices"
          : "Drag users to arrange your room layout"}
      </p>

      {/* Room Grid */}
      <div className="flex-1 min-h-0 relative">
        <div className="w-full h-full p-2 flex items-center justify-center">
          <div
            ref={containerRef}
            className="relative w-full h-full rounded-2xl overflow-hidden select-none touch-none bg-foreground/[0.02]"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleMouseUp}
            onClick={handleContainerClick}
          >
            {/* Grid lines */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <pattern
                  id="room-grid-ego"
                  width="60"
                  height="60"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 60 0 L 0 0 0 60"
                    fill="none"
                    stroke="currentColor"
                    className="text-foreground/[0.04]"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#room-grid-ego)" />
              <line
                x1="50%"
                y1="0"
                x2="50%"
                y2="100%"
                stroke="currentColor"
                className="text-foreground/[0.06]"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="50%"
                x2="100%"
                y2="50%"
                stroke="currentColor"
                className="text-foreground/[0.06]"
                strokeWidth="1"
              />
            </svg>

            {/* Room boundary */}
            <div className="absolute inset-4 border border-dashed border-foreground/10 rounded-2xl pointer-events-none" />

            {/* Render Users and Devices */}
            <AnimatePresence>
              {userGroups.map((user, idx) => {
                const isExpanded = expandedUserId === user.userId;
                const userPos = user.isMe ? { x: 0.5, y: 0.5 } : getPos(user.userId, idx, userGroups.length);

                return (
                  <div key={`group-${user.userId}`}>
                    {/* SVG Light Strings for connected devices */}
                    {isExpanded && (
                      <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
                        {user.devices.map((device, dIdx) => {
                          const fallbackAngle = (dIdx / Math.max(user.devices.length, 1)) * Math.PI * 2;
                          const fanRadius = 0.12;
                          const pos = positions[device.deviceId]
                            ? positions[device.deviceId]
                            : {
                                x: userPos.x + fanRadius * Math.cos(fallbackAngle),
                                y: userPos.y + fanRadius * Math.sin(fallbackAngle),
                              };
                          return (
                            <motion.line
                              key={`line-${device.deviceId}`}
                              x1={`${userPos.x * 100}%`}
                              y1={`${userPos.y * 100}%`}
                              initial={{ x2: `${userPos.x * 100}%`, y2: `${userPos.y * 100}%` }}
                              animate={{ x2: `${pos.x * 100}%`, y2: `${pos.y * 100}%` }}
                              transition={{ type: "spring", stiffness: 400, damping: 25, delay: dIdx * 0.05 }}
                              stroke="rgba(255,255,255,0.15)"
                              strokeWidth="2"
                              strokeDasharray="4 4"
                            />
                          );
                        })}
                      </svg>
                    )}

                    {/* Devices */}
                    {isExpanded && user.devices.map((device, dIdx) => {
                      const fallbackAngle = (dIdx / Math.max(user.devices.length, 1)) * Math.PI * 2;
                      const fanRadius = 0.12;
                      const pos = positions[device.deviceId]
                        ? positions[device.deviceId]
                        : {
                            x: userPos.x + fanRadius * Math.cos(fallbackAngle),
                            y: userPos.y + fanRadius * Math.sin(fallbackAngle),
                          };

                      const Icon = getDeviceIcon(device.deviceName, device.deviceType);

                      return (
                        <motion.div
                          key={device.deviceId}
                          className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-lg flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shadow-[0_0_15px_rgba(255,255,255,0.1)] z-30 select-none bg-background/80 border-2 border-foreground/15 text-foreground backdrop-blur-sm"
                          style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1, left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25, delay: dIdx * 0.05 }}
                          onMouseDown={(e) => handleMouseDown(device.deviceId, false, false, e)}
                          onTouchStart={(e) => handleMouseDown(device.deviceId, false, false, e)}
                        >
                          <Icon className="w-3.5 h-3.5 text-foreground/60" />
                          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[7px] text-foreground/40 font-bold whitespace-nowrap">
                            {device.deviceName.slice(0, 8)}
                          </div>
                        </motion.div>
                      );
                    })}

                    {/* User Token (PFP) */}
                    <motion.div
                      className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full flex items-center justify-center shadow-lg z-30 select-none font-black text-sm bg-background/80 border-2 backdrop-blur-sm transition-colors ${
                        user.isMe ? "border-blue-500/50 cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.3)]" : "border-foreground/10 cursor-pointer hover:border-foreground/25"
                      }`}
                      style={{ left: `${userPos.x * 100}%`, top: `${userPos.y * 100}%` }}
                      animate={{ left: `${userPos.x * 100}%`, top: `${userPos.y * 100}%` }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      onMouseDown={(e) => handleMouseDown(user.userId, true, user.isMe, e)}
                      onTouchStart={(e) => handleMouseDown(user.userId, true, user.isMe, e)}
                      onClick={(e) => handleGroupClick(user.userId, e)}
                    >
                      <User className={`w-4 h-4 ${user.isMe ? "text-blue-400" : "text-foreground/50"}`} />
                      {/* Online indicator */}
                      {!user.isMe && (
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-background shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
                      )}
                      {/* Device count badge */}
                      {user.devices.length > 1 && (
                        <div className={`absolute -bottom-1 -right-1 text-background text-[8px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-sm ${user.isMe ? "bg-blue-400" : "bg-foreground"}`}>
                          {user.devices.length}
                        </div>
                      )}
                      {/* Name label */}
                      <div className={`absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-bold whitespace-nowrap ${user.isMe ? "text-blue-400/80" : "text-foreground/30"}`}>
                        {user.isMe ? "YOU" : user.displayName.slice(0, 10)}
                      </div>
                      {/* Expand hint */}
                      <div className="absolute -right-5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className={`w-3 h-3 ${user.isMe ? "text-blue-400/50" : "text-foreground/20"}`} />
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </AnimatePresence>

            {/* Orbit Visualizer */}
            {isPlaying && orbitData && (
              <div
                className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full pointer-events-none z-50 flex items-center justify-center"
                style={{
                  left: `${(() => {
                    const fromPos = getDevicePos(orbitData.fromId);
                    const toPos = getDevicePos(orbitData.toId);
                    const frac = orbitData.frac;
                    const easedFrac = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
                    return (fromPos.x + (toPos.x - fromPos.x) * easedFrac) * 100;
                  })()}%`,
                  top: `${(() => {
                    const fromPos = getDevicePos(orbitData.fromId);
                    const toPos = getDevicePos(orbitData.toId);
                    const frac = orbitData.frac;
                    const easedFrac = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
                    return (fromPos.y + (toPos.y - fromPos.y) * easedFrac) * 100;
                  })()}%`,
                }}
              >
                <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75" />
                <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]" />
              </div>
            )}

            {/* Axis labels */}
            <div className="absolute bottom-2 left-3 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">
              L
            </div>
            <div className="absolute bottom-2 right-3 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">
              R
            </div>
            <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">
              FRONT
            </div>
          </div>
        </div>
      </div>

      {/* Speed slider */}
      {onOrbitSpeedChange && (
        <div className="shrink-0 px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground/30">
              Orbit Speed
            </span>
            <span className="text-[10px] font-bold text-foreground/40">
              {orbitSpeed.toFixed(1)}s / device
            </span>
          </div>
          <input
            type="range"
            min="0.5"
            max="8"
            step="0.5"
            value={orbitSpeed}
            onChange={(e) => onOrbitSpeedChange(parseFloat(e.target.value))}
            className="w-full h-1 rounded-full appearance-none cursor-pointer bg-foreground/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/60 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:hover:bg-foreground/80 [&::-webkit-slider-thumb]:transition-colors"
          />
        </div>
      )}
    </div>
  );
}
