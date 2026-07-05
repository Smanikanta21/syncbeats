"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones, User, Smartphone, Monitor, ChevronRight, Laptop, Maximize2, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { DeviceSpatialState, Participant } from "../../lib/types";
import { SpatialAudioEngine, type SpatialPosition } from "../../audio/SpatialAudioEngine";

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
  spatialMode?: 'multiplayer' | '8d-solo';
  onSpatialModeChange?: (mode: 'multiplayer' | '8d-solo') => void;
  actualParticipantCount?: number;
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
  onOrbitSpeedChange,
  roomId,
  spatialMode,
  onSpatialModeChange,
  actualParticipantCount,
}: SpatialPanelProps) {
  const [orbitData, setOrbitData] = useState<{fromId: string, toId: string, frac: number} | null>(null);

  // Subscribe directly to the audio engine to avoid re-rendering the whole page
  useEffect(() => {
    const engine = SpatialAudioEngine.getInstance();
    engine.setOrbitUpdateCallback((fromId: string, toId: string, frac: number) => {
      setOrbitData({ fromId, toId, frac });
    });
    return () => {
      engine.setOrbitUpdateCallback(undefined as any);
    };
  }, []);
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
    if (orbitData.fromId === '8D_MODE') {
      // In 8D mode, frac is actually the direct angle. Radius is fixed at 1.5.
      return Math.max(-1, Math.min(1, Math.sin(orbitData.frac) * 1.5));
    }

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
          <h2 className="text-xs font-black uppercase tracking-widest text-foreground/50">
            Spatial Room
          </h2>
          <p className="text-[10px] lg:text-xs text-foreground/40 mt-0.5">Drag users or devices to position them</p>
        </div>

        {actualParticipantCount === 1 && (
          <div className="flex bg-foreground/5 p-1 rounded-full border border-foreground/10">
            <button 
              onClick={() => onSpatialModeChange?.('multiplayer')}
              className={`px-3 py-1 lg:px-4 lg:py-1.5 text-[10px] lg:text-xs rounded-full font-semibold transition-colors ${spatialMode === 'multiplayer' ? 'bg-blue-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
            >
              Multiplayer
            </button>
            <button 
              onClick={() => onSpatialModeChange?.('8d-solo')}
              className={`px-3 py-1 lg:px-4 lg:py-1.5 text-[10px] lg:text-xs rounded-full font-semibold transition-colors flex items-center gap-1.5 ${spatialMode === '8d-solo' ? 'bg-violet-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
            >
              8D Solo
            </button>
          </div>
        )}
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

          {spatialMode === '8d-solo' && actualParticipantCount === 1 && (() => {
            // Visual orbit radius as a fraction of the container (35% of half-width)
            const VIS_RADIUS = 35; // in percentage units from center
            const angle = orbitData?.fromId === '8D_MODE' ? orbitData.frac : 0;
            const orbX = 50 + VIS_RADIUS * Math.sin(angle);
            const orbY = 50 - VIS_RADIUS * Math.cos(angle);

            // Trail: 8 ghost dots fading behind the orb
            const TRAIL_COUNT = 8;
            const TRAIL_STEP = (Math.PI * 2) / 24;

            return (
              <>
                {/* Orbit ring */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                  <ellipse
                    cx="50%"
                    cy="50%"
                    rx={`${VIS_RADIUS}%`}
                    ry={`${VIS_RADIUS}%`}
                    fill="none"
                    stroke="rgba(139,92,246,0.2)"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                </svg>

                {/* Glowing trail */}
                {Array.from({ length: TRAIL_COUNT }).map((_, i) => {
                  const trailAngle = angle - TRAIL_STEP * (i + 1);
                  const tx = 50 + VIS_RADIUS * Math.sin(trailAngle);
                  const ty = 50 - VIS_RADIUS * Math.cos(trailAngle);
                  const size = 12 - i * 1.2;
                  const opacity = (1 - i / TRAIL_COUNT) * 0.5;
                  return (
                    <div
                      key={`trail-${i}`}
                      className="absolute rounded-full bg-violet-400 pointer-events-none z-10"
                      style={{
                        width: `${size}px`,
                        height: `${size}px`,
                        left: `${tx}%`,
                        top: `${ty}%`,
                        transform: 'translate(-50%, -50%)',
                        opacity,
                        filter: `blur(${i * 0.5}px)`,
                      }}
                    />
                  );
                })}

                {/* Outer pulse ring */}
                <div
                  className="absolute rounded-full border border-violet-400/40 pointer-events-none z-10 animate-ping"
                  style={{
                    width: '56px',
                    height: '56px',
                    left: `${orbX}%`,
                    top: `${orbY}%`,
                    transform: 'translate(-50%, -50%)',
                    animationDuration: '1.5s',
                  }}
                />

                {/* Main orb */}
                <div
                  className="absolute rounded-full font-bold text-[10px] text-white flex items-center justify-center pointer-events-none z-20"
                  style={{
                    width: '44px',
                    height: '44px',
                    left: `${orbX}%`,
                    top: `${orbY}%`,
                    transform: 'translate(-50%, -50%)',
                    background: 'radial-gradient(circle at 35% 35%, #a78bfa, #7c3aed)',
                    boxShadow: '0 0 20px 6px rgba(139,92,246,0.5), 0 0 40px 10px rgba(139,92,246,0.25)',
                    border: '2px solid rgba(255,255,255,0.25)',
                  }}
                >
                  8D
                </div>
              </>
            );
          })()}

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
                      <div className="flex items-center gap-4">
                        <h2 className="text-xs font-black uppercase tracking-widest text-foreground/50">
                          Spatial Room
                        </h2>
                        {actualParticipantCount === 1 && (
                          <div className="flex bg-foreground/5 p-1 rounded-full border border-foreground/10">
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSpatialModeChange?.('multiplayer'); }}
                              className={`px-3 py-1 text-[10px] rounded-full font-semibold transition-colors ${spatialMode === 'multiplayer' ? 'bg-blue-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
                            >
                              Multiplayer
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); onSpatialModeChange?.('8d-solo'); }}
                              className={`px-3 py-1 text-[10px] rounded-full font-semibold transition-colors ${spatialMode === '8d-solo' ? 'bg-violet-500 text-white shadow-md' : 'text-foreground/60 hover:text-foreground'}`}
                            >
                              8D Solo
                            </button>
                          </div>
                        )}
                      </div>
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
          <div className="order-first lg:order-last lg:w-48 shrink-0 bg-foreground/5 rounded-2xl p-3 lg:p-4 flex flex-col gap-3 lg:gap-4">
            <div className="flex flex-row lg:flex-col justify-between items-center lg:items-start gap-2">
              <h3 className="text-sm font-semibold text-foreground/90">Spatial Controller</h3>
              <div className="text-[10px] lg:text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 lg:py-1.5 rounded-lg border border-blue-500/20">
                {orbitSpeed.toFixed(1)}s / device
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <div className="text-[10px] text-foreground/50 font-bold mb-1">ORBIT SPEED</div>
              <input
                type="range"
                min="0.5"
                max="10"
                step="0.5"
                value={orbitSpeed}
                onChange={(e) => onOrbitSpeedChange(parseFloat(e.target.value))}
                className="w-full accent-white"
              />
              <div className="flex justify-between text-[10px] text-foreground/50 mt-1">
                <span>Fast</span>
                <span>Slow</span>
              </div>
            </div>

            {/* Live Pan Meter */}
            <div className="flex-1 flex flex-col justify-center border-t border-foreground/10 pt-3 lg:pt-4">
              <div className="text-[10px] text-foreground/50 font-bold mb-1">LIVE PAN</div>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={panValue}
                readOnly
                className="w-full accent-white pointer-events-none"
              />
              <div className="flex justify-between text-[10px] text-foreground/50 mt-1 font-bold">
                <span>L</span>
                <span>R</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
