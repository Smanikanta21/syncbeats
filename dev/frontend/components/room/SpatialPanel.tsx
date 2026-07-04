"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, User, Smartphone, Monitor, ChevronRight, Laptop, Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { DeviceSpatialState, Participant } from "../../lib/types";
import type { SpatialPosition } from "../../audio/SpatialAudioEngine";

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
  myUserId?: string;
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
  syncUIState?: (listenerCart: {x: number, y: number, z: number}, offsets: Map<string, {fanX: number, fanY: number}>, myPos?: {angle: number, radius: number, elevation: number}) => void;
  orbitSpeed?: number;
  orbitData?: { fromId: string; toId: string; frac: number } | null;
  onOrbitSpeedChange?: (speed: number) => void;
  roomId: string;
}

// ── Coordinate Conversion ─────────────────────────────────────────────────

const polarToGlobal = (pos: { angle: number; radius: number }) => {
  const scale = 0.15;
  return {
    x: pos.radius * Math.sin(pos.angle) * scale,
    y: -pos.radius * Math.cos(pos.angle) * scale,
  };
};

const globalToPolar = (x: number, y: number) => {
  const scale = 0.15;
  const dx = x / scale;
  const dy = y / scale;
  const angle = Math.atan2(dx, -dy);
  const radius = Math.min(3, Math.sqrt(dx * dx + dy * dy));
  return { angle, radius, elevation: 0 };
};

// ── Ego-Centric Room View ─────────────────────────────────────────────────

export function SpatialPanel({
  myDeviceId,
  myUserId,
  spatialDevices,
  participants,
  isPlaying,
  onUpdatePosition,
  syncUIState,
  orbitSpeed = 3,
  orbitData,
  onOrbitSpeedChange,
  roomId,
}: SpatialPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const draggingRef = useRef<{ id: string; isUser: boolean } | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const dragStartRef = useRef<{ screenX: number; screenY: number; globalPos: Map<string, {x: number, y: number}> } | null>(null);

  // Determine current user
  const myParticipant = participants.find((p) => p.socketId === myDeviceId);
  const resolvedMyUserId = myUserId ?? myParticipant?.userId ?? myParticipant?.socketId ?? myDeviceId;

  // ── Build user groups ──────────────────────────────────────────────────

  const userGroups: UserGroup[] = useMemo(() => {
    const map = new Map<string, UserGroup>();

    participants.forEach((p) => {
      const nameParts = (p.displayName || "Unknown User").split("::");
      const actualDisplayName = nameParts[0] || "Unknown User";
      const fallbackName = nameParts.length > 1 ? nameParts[1] : undefined;
      const friendlyDevName = getFriendlyDeviceName(p.outputDeviceName || "", p.outputDeviceType, fallbackName);
      
      const userId = p.userId ?? p.socketId;
      const isMe = userId === resolvedMyUserId;

      if (!map.has(userId)) {
        map.set(userId, {
          userId,
          displayName: actualDisplayName,
          initials: actualDisplayName.substring(0, 2).toUpperCase(),
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
  }, [participants, myDeviceId, resolvedMyUserId]);

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

  // Local visual offsets for devices (stored in localStorage)
  const [deviceOffsets, setDeviceOffsets] = useState<Record<string, { fanX: number; fanY: number }>>(() => {
    try {
      const stored = localStorage.getItem(`syncbeats_device_offsets_${roomId}_${resolvedMyUserId}`);
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {};
  });

  useEffect(() => {
    if (roomId && resolvedMyUserId) {
      localStorage.setItem(`syncbeats_device_offsets_${roomId}_${resolvedMyUserId}`, JSON.stringify(deviceOffsets));
    }
  }, [deviceOffsets, roomId, resolvedMyUserId]);

  // ── Position Helpers ─────────────────────────────────────────────────────

  const getDeviceGlobal = useCallback((deviceId: string) => {
    const dev = spatialDevices.find(d => d.deviceId === deviceId);
    if (!dev) return { x: 0, y: 0 };
    return polarToGlobal(dev.position);
  }, [spatialDevices]);

  const getMyGlobal = useCallback(() => {
    const myGroup = userGroups.find(g => g.isMe);
    if (!myGroup || myGroup.devices.length === 0) return { x: 0, y: 0 };

    let sumX = 0, sumY = 0;
    myGroup.devices.forEach(d => {
      const devGlobal = getDeviceGlobal(d.deviceId);
      sumX += devGlobal.x;
      sumY += devGlobal.y;
    });
    return {
      x: sumX / myGroup.devices.length,
      y: sumY / myGroup.devices.length
    };
  }, [userGroups, getDeviceGlobal]);

  const getDeviceScreenPos = useCallback((deviceId: string) => {
    const myGlobal = getMyGlobal();
    const devGlobal = getDeviceGlobal(deviceId);
    let fanX = 0, fanY = 0;
    
    const customOffset = deviceOffsets[deviceId];
    if (customOffset) {
      fanX = customOffset.fanX;
      fanY = customOffset.fanY;
    } else {
      const group = userGroups.find(g => g.devices.some(d => d.deviceId === deviceId));
      if (group) {
        if (group.devices.length === 1) {
          fanX = 0;
          fanY = -0.12;
        } else {
          const idx = group.devices.findIndex(d => d.deviceId === deviceId);
          const angle = (idx / group.devices.length) * Math.PI * 2 - Math.PI / 2;
          fanX = 0.08 * Math.cos(angle);
          fanY = 0.12 * Math.sin(angle);
        }
      }
    }
    return { x: 0.5 + (devGlobal.x - myGlobal.x) + fanX, y: 0.5 + (devGlobal.y - myGlobal.y) + fanY };
  }, [getDeviceGlobal, getMyGlobal, userGroups, deviceOffsets]);

  const getUserScreenPos = useCallback((userId: string) => {
    const group = userGroups.find(g => g.userId === userId);
    if (!group || group.devices.length === 0) return { x: 0.5, y: 0.5 };
    if (group.isMe) return { x: 0.5, y: 0.5 }; // I am always center!

    const myGlobal = getMyGlobal();

    let sumX = 0, sumY = 0;
    group.devices.forEach(d => {
      const devGlobal = getDeviceGlobal(d.deviceId);
      sumX += devGlobal.x;
      sumY += devGlobal.y;
    });
    
    const avgGlobalX = sumX / group.devices.length;
    const avgGlobalY = sumY / group.devices.length;

    return {
      x: 0.5 + (avgGlobalX - myGlobal.x),
      y: 0.5 + (avgGlobalY - myGlobal.y),
    };
  }, [userGroups, getDeviceGlobal, getMyGlobal]);

  // ── Sync UI offsets to Audio Engine ──────────────────────────────────────

  useEffect(() => {
    if (!syncUIState) return;

    const myGlobal = getMyGlobal();
    const myPolar = globalToPolar(myGlobal.x, myGlobal.y);
    const sr = myPolar.radius * 15;
    const myListenerCart = {
      x: sr * Math.sin(myPolar.angle),
      y: 0,
      z: -sr * Math.cos(myPolar.angle)
    };

    const offsets = new Map<string, { fanX: number, fanY: number }>();
    userGroups.forEach(group => {
      group.devices.forEach((d, idx) => {
        const customOffset = deviceOffsets[d.deviceId];
        if (customOffset) {
          offsets.set(d.deviceId, customOffset);
        } else {
          if (group.devices.length === 1) offsets.set(d.deviceId, { fanX: 0, fanY: -0.07 });
          else {
            const angle = (idx / group.devices.length) * Math.PI * 2 - Math.PI / 2;
            offsets.set(d.deviceId, { fanX: 0.04 * Math.cos(angle), fanY: 0.04 * Math.sin(angle) - 0.04 });
          }
        }
      });
    });

    syncUIState(myListenerCart, offsets, myPolar);
  }, [userGroups, getMyGlobal, syncUIState, deviceOffsets]);


  // ── Drag handlers ──────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (id: string, isUser: boolean, e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      draggingRef.current = { id, isUser };

      let screenX = 0.5, screenY = 0.5;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        
        screenX = (clientX - rect.left) / rect.width;
        screenY = (clientY - rect.top) / rect.height;
      }

      const globalPos = new Map<string, {x: number, y: number}>();
      spatialDevices.forEach(d => {
        globalPos.set(d.deviceId, polarToGlobal(d.position));
      });
      dragStartRef.current = { screenX, screenY, globalPos };
    },
    [spatialDevices]
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!draggingRef.current || !containerRef.current || !dragStartRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      
      const currentScreenX = (clientX - rect.left) / rect.width;
      const currentScreenY = (clientY - rect.top) / rect.height;

      const dx = currentScreenX - dragStartRef.current.screenX;
      const dy = currentScreenY - dragStartRef.current.screenY;

      const { id, isUser } = draggingRef.current;
      const startGlobal = dragStartRef.current.globalPos;

      if (isUser) {
        const group = userGroups.find(g => g.userId === id);
        if (!group) return;
        
        let sumX = 0, sumY = 0;
        group.devices.forEach(d => {
          const pos = startGlobal.get(d.deviceId) ?? getDeviceGlobal(d.deviceId);
          sumX += pos.x;
          sumY += pos.y;
        });
        const startGlobalCenter = { x: sumX / group.devices.length, y: sumY / group.devices.length };
        let intendedCenter = { x: startGlobalCenter.x + dx, y: startGlobalCenter.y + dy };
        
        const aspect = containerRef.current ? containerRef.current.getBoundingClientRect().width / containerRef.current.getBoundingClientRect().height : 1;
        const MIN_DIST = 0.08; // 8% minimum spatial distance between users
        
        userGroups.filter(g => g.userId !== id && g.devices.length > 0).forEach(other => {
          let ox = 0, oy = 0;
          other.devices.forEach(d => {
            const pos = getDeviceGlobal(d.deviceId);
            ox += pos.x;
            oy += pos.y;
          });
          const otherCenter = { x: ox / other.devices.length, y: oy / other.devices.length };
          
          const cx = intendedCenter.x - otherCenter.x;
          const cy = (intendedCenter.y - otherCenter.y) / aspect;
          const dist = Math.sqrt(cx*cx + cy*cy);
          
          if (dist < MIN_DIST) {
            // Apply a soft push force if they get too close
            const push = dist === 0 ? MIN_DIST : (MIN_DIST - dist) / dist;
            const pushX = dist === 0 ? MIN_DIST : cx * push;
            const pushY = dist === 0 ? 0 : cy * push;
            intendedCenter.x += pushX;
            intendedCenter.y += pushY * aspect;
          }
        });
        
        const finalDx = intendedCenter.x - startGlobalCenter.x;
        const finalDy = intendedCenter.y - startGlobalCenter.y;

        group.devices.forEach(d => {
          const devStart = startGlobal.get(d.deviceId) ?? getDeviceGlobal(d.deviceId);
          onUpdatePosition(d.deviceId, globalToPolar(devStart.x + finalDx, devStart.y + finalDy));
        });
      } else {
        const deviceGroup = userGroups.find(g => g.devices.some(d => d.deviceId === id));
        if (deviceGroup) {
          const ownerPosScreen = deviceGroup.isMe ? {x: 0.5, y: 0.5} : getUserScreenPos(deviceGroup.userId);
          const sdx = currentScreenX - ownerPosScreen.x;
          const sdy = currentScreenY - ownerPosScreen.y;
          
          let fanX = sdx;
          let fanY = sdy;
          
          const aspect = rect.width / rect.height;
          // Normalize to width-space for distance calculation so the constraint is a perfect circle
          const sdyNorm = sdy / aspect;
          const dist = Math.sqrt(sdx*sdx + sdyNorm*sdyNorm);
          
          const MAX_DIST = 0.15; // 15% of width
          if (dist > MAX_DIST) {
            fanX = (sdx / dist) * MAX_DIST;
            fanY = ((sdyNorm / dist) * MAX_DIST) * aspect;
          }

          setDeviceOffsets(prev => ({ ...prev, [id]: { fanX, fanY } }));
        }
      }
    },
    [userGroups, getUserScreenPos, getDeviceGlobal, onUpdatePosition]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => handleMove(e.clientX, e.clientY),
    [handleMove]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => handleMove(e.touches[0].clientX, e.touches[0].clientY),
    [handleMove]
  );

  useEffect(() => {
    const handleMouseUp = () => {
      draggingRef.current = null;
      dragStartRef.current = null;
    };
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, []);

  const myGlobal = getMyGlobal();
  const bgOffsetX = myGlobal.x * 100 * (1 / 0.15);
  const bgOffsetY = myGlobal.y * 100 * (1 / 0.15);

  // Compute live stereo pan value from current orbit position (-1 left .. +1 right)
  const panValue = useMemo(() => {
    if (!orbitData) return 0;
    const { fromId, toId, frac } = orbitData;
    const fromDev = spatialDevices.find(d => d.deviceId === fromId);
    const toDev = spatialDevices.find(d => d.deviceId === toId);
    if (!fromDev || !toDev) return 0;
    // Ease frac
    const ef = frac < 0.5 ? 2 * frac * frac : 1 - Math.pow(-2 * frac + 2, 2) / 2;
    // Pan is driven by sin(angle) — right = positive
    const panA = Math.sin(fromDev.position.angle) * fromDev.position.radius;
    const panB = Math.sin(toDev.position.angle) * toDev.position.radius;
    return Math.max(-1, Math.min(1, panA + (panB - panA) * ef));
  }, [orbitData, spatialDevices]);

  return (
    <div className="flex-1 w-full flex flex-col min-h-0 min-w-0">
      <div className="flex items-center justify-between mb-2 lg:mb-4 shrink-0">
        <div>
          <h2 className="text-lg lg:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
            Spatial Room
          </h2>
          <p className="text-[10px] lg:text-sm text-foreground/50">Drag users or devices to position them</p>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col-reverse lg:flex-row gap-4 min-h-0">
          {/* Map Content abstracted for reuse */}
          {(() => {
            const content = (
              <>
                <div
            className="absolute inset-0 opacity-[0.15]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.2) 1px, transparent 1px)",
              backgroundSize: "10% 10%",
              backgroundPosition: `${50 - bgOffsetX}% ${50 - bgOffsetY}%`,
            }}
          />

          <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs><pattern id="room-grid-ego" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" className="text-foreground/[0.04]" strokeWidth="1"/></pattern></defs>
            <rect width="100%" height="100%" fill="url(#room-grid-ego)" />
            <line x1="50%" y1="0" x2="50%" y2="100%" stroke="currentColor" className="text-foreground/[0.06]" strokeWidth="1"/>
            <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" className="text-foreground/[0.06]" strokeWidth="1"/>
          </svg>

          {/* Axis Labels */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-[0.2em] text-foreground/20 uppercase pointer-events-none select-none">
            Front
          </div>
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-[0.2em] text-foreground/20 uppercase pointer-events-none select-none">
            Back
          </div>
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-[9px] font-black tracking-[0.2em] text-foreground/20 uppercase pointer-events-none select-none -rotate-90">
            Left
          </div>
          <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-black tracking-[0.2em] text-foreground/20 uppercase pointer-events-none select-none rotate-90">
            Right
          </div>

          <div className="absolute inset-4 border border-foreground/10 rounded-xl pointer-events-none" />

          <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
            {userGroups.map(user => {
              if (expandedUserId !== user.userId) return null;
              const userPos = getUserScreenPos(user.userId);
              return user.devices.map(dev => {
                const devPos = getDeviceScreenPos(dev.deviceId);
                return (
                  <line
                    key={`line-${dev.deviceId}`}
                    x1={`${userPos.x * 100}%`}
                    y1={`${userPos.y * 100}%`}
                    x2={`${devPos.x * 100}%`}
                    y2={`${devPos.y * 100}%`}
                    stroke="rgba(59, 130, 246, 0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    className="animate-[dash_1s_linear_infinite]"
                  />
                );
              });
            })}
          </svg>

          <div className="absolute inset-0">
            <AnimatePresence>
              {userGroups.map((user) => {
                const userPos = getUserScreenPos(user.userId);
                return (
                  <div key={user.userId}>
                    <motion.div
                      layoutId={`user-${user.userId}`}
                      className="absolute w-12 h-12 -ml-6 -mt-6 cursor-grab active:cursor-grabbing z-30 select-none touch-none"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{
                        opacity: 1,
                        scale: 1,
                        left: `${userPos.x * 100}%`,
                        top: `${userPos.y * 100}%`,
                      }}
                      onMouseDown={(e) => handleMouseDown(user.userId, true, e)}
                      onTouchStart={(e) => handleMouseDown(user.userId, true, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedUserId((prev) => (prev === user.userId ? null : user.userId));
                      }}
                    >
                      <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20 flex items-center justify-center border-2 border-white/10">
                        <span className="text-sm font-bold text-white">{user.initials}</span>
                      </div>
                    </motion.div>
                    {/* Devices for this user */}
                    <AnimatePresence>
                      {expandedUserId === user.userId && user.devices.map((device) => {
                        const devPos = getDeviceScreenPos(device.deviceId);
                        const Icon = getDeviceIcon(device.deviceName, device.deviceType);
                        return (
                          <motion.div
                            key={device.deviceId}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            className="absolute w-8 h-8 -ml-4 -mt-4 cursor-grab active:cursor-grabbing z-40 flex flex-col items-center justify-center bg-background/80 border border-foreground/15 rounded-lg shadow-lg backdrop-blur-sm group select-none touch-none"
                            style={{
                              left: `${devPos.x * 100}%`,
                              top: `${devPos.y * 100}%`,
                            }}
                            onMouseDown={(e) => handleMouseDown(device.deviceId, false, e)}
                            onTouchStart={(e) => handleMouseDown(device.deviceId, false, e)}
                          >
                            <Icon className="w-4 h-4 text-foreground/70" />
                            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-foreground/60 font-bold whitespace-nowrap bg-background/80 border border-foreground/10 px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none">
                              {device.deviceName.length > 15 ? device.deviceName.slice(0,15) + '...' : device.deviceName}
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Live Pan Meter */}
          {orbitData && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-40 flex flex-col items-center gap-1 pointer-events-none select-none">
              <div className="text-[8px] font-black tracking-[0.2em] text-white/20 uppercase">
                PAN
              </div>
              <div className="relative w-full h-1 bg-white/10 rounded-full overflow-visible">
                {/* Left label */}
                <span className="absolute -left-4 -top-0.5 text-[7px] text-white/20 font-bold">L</span>
                {/* Right label */}
                <span className="absolute -right-4 -top-0.5 text-[7px] text-white/20 font-bold">R</span>
                {/* Center tick */}
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-px h-full bg-white/20" />
                {/* Color fill from center */}
                <div
                  className="absolute top-0 h-full rounded-full transition-all duration-100"
                  style={{
                    left: panValue < 0 ? `${(0.5 + panValue / 2) * 100}%` : '50%',
                    width: `${Math.abs(panValue) / 2 * 100}%`,
                    background: panValue < 0
                      ? 'linear-gradient(to left, rgba(96,165,250,0.8), rgba(59,130,246,0.4))'
                      : 'linear-gradient(to right, rgba(167,139,250,0.8), rgba(139,92,246,0.4))',
                  }}
                />
                {/* Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full shadow-lg transition-all duration-100"
                  style={{
                    left: `calc(${((panValue + 1) / 2) * 100}% - 5px)`,
                    background: panValue < -0.05
                      ? 'rgba(96,165,250,1)'
                      : panValue > 0.05
                      ? 'rgba(167,139,250,1)'
                      : 'rgba(255,255,255,0.9)',
                    boxShadow: panValue < -0.05
                      ? '0 0 6px rgba(96,165,250,0.8)'
                      : panValue > 0.05
                      ? '0 0 6px rgba(167,139,250,0.8)'
                      : '0 0 4px rgba(255,255,255,0.4)',
                  }}
                />
              </div>
            </div>
          )}
              </>
            );

            return (
              <>
                {/* INLINE VIEW (Blurred on mobile if not expanded) */}
                <div
                  className={`flex-1 w-full relative overflow-hidden bg-black/5 dark:bg-[#0A0F1C] touch-none rounded-3xl border border-foreground/5 ${!isMobileModalOpen ? "cursor-pointer lg:cursor-auto" : "hidden lg:block"}`}
                  ref={!isMobileModalOpen ? containerRef : undefined}
                  onMouseMove={!isMobileModalOpen ? handleMouseMove : undefined}
                  onTouchMove={!isMobileModalOpen ? handleTouchMove : undefined}
                  onClick={() => {
                    if (window.innerWidth < 1024 && !isMobileModalOpen) {
                      setIsMobileModalOpen(true);
                    }
                  }}
                >
                  <div className={!isMobileModalOpen ? "absolute inset-0 lg:opacity-100 opacity-60 lg:blur-none blur-[3px] pointer-events-none lg:pointer-events-auto transition-all w-full h-full" : "absolute inset-0 w-full h-full"}>
                    {content}
                  </div>
                  
                  {!isMobileModalOpen && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center lg:hidden pointer-events-none bg-background/10">
                      <div className="bg-foreground text-background px-5 py-2.5 rounded-full font-black text-xs shadow-2xl flex items-center gap-2 tracking-wide">
                        <Maximize2 className="w-4 h-4" />
                        <span>TAP TO EXPAND</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* MODAL VIEW (Mobile only) */}
                {mounted && isMobileModalOpen && createPortal(
                  <div className="fixed inset-0 z-[100] flex flex-col p-4 bg-background/90 backdrop-blur-3xl animate-in fade-in duration-200 lg:hidden">
                    <div className="flex items-center justify-between mb-4 pt-12">
                      <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-violet-400">
                        Spatial Room
                      </h2>
                      <button 
                        className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center text-foreground hover:bg-foreground/20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMobileModalOpen(false);
                        }}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div 
                      className="flex-1 w-full relative overflow-hidden bg-black/10 dark:bg-[#0A0F1C]/50 touch-none rounded-3xl border border-foreground/10 shadow-2xl"
                      ref={containerRef}
                      onMouseMove={handleMouseMove}
                      onTouchMove={handleTouchMove}
                    >
                      {content}
                    </div>
                  </div>,
                  document.body
                )}
              </>
            );
          })()}


        {/* Right side orbit controls (Responsive) */}
        {onOrbitSpeedChange && (
          <div className="order-first lg:order-last lg:w-48 shrink-0 bg-foreground/5 rounded-2xl p-3 lg:p-4 flex flex-col gap-2 lg:gap-4">
            <div className="flex flex-row lg:flex-col justify-between items-center lg:items-start gap-2">
              <h3 className="text-sm font-semibold text-foreground/90">Orbit Speed</h3>
              <div className="text-[10px] lg:text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 lg:py-1.5 rounded-lg border border-blue-500/20">
                {orbitSpeed.toFixed(1)}s / device
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={orbitSpeed}
                onChange={(e) => onOrbitSpeedChange(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] text-foreground/50 mt-1 lg:mt-2">
                <span>Fast</span>
                <span>Slow</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
