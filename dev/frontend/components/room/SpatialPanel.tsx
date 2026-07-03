"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Layers, Grid3X3, Headphones } from "lucide-react";
import { OrbitUI } from "../OrbitUI";
import type { DeviceSpatialState, Participant } from "../../lib/types";

// ── Room Placement Grid ────────────────────────────────────────────────────

interface GridDevice {
  deviceId: string;
  x: number;
  y: number;
  initials: string;
  name: string;
  isMe: boolean;
  userId: string;
}

interface PlacementGridProps {
  devices: GridDevice[];
  onMove: (deviceId: string, x: number, y: number) => void;
  isPlaying: boolean;
}

function RoomPlacementGrid({ devices, onMove, isPlaying }: PlacementGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleGroupClick = useCallback((userId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setExpandedUserId(userId);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setExpandedUserId(null);
    }, 5000);
  }, []);

  const handleContainerClick = useCallback(() => {
    setExpandedUserId(null);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleMouseDown = useCallback((deviceId: string) => {
    draggingRef.current = deviceId;
    // reset timeout when interacting
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setExpandedUserId(null), 5000);
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    onMove(draggingRef.current, x, y);
  }, [onMove]);

  const handleMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
    onMove(draggingRef.current, x, y);
  }, [onMove]);

  const groupedUsers = useMemo(() => {
    const map = new Map<string, GridDevice[]>();
    for (const d of devices) {
      const list = map.get(d.userId) || [];
      list.push(d);
      map.set(d.userId, list);
    }
    return Array.from(map.entries()).map(([userId, list]) => {
      const avgX = list.reduce((s, d) => s + d.x, 0) / list.length;
      const avgY = list.reduce((s, d) => s + d.y, 0) / list.length;
      const isMe = list.some(d => d.isMe);
      return { userId, devices: list, x: avgX, y: avgY, initials: list[0].initials, isMe };
    });
  }, [devices]);

  return (
    <div className="w-full h-full p-4 flex items-center justify-center pointer-events-none">
      <div
        ref={containerRef}
        className="relative w-full h-full rounded-2xl overflow-hidden select-none touch-none pointer-events-auto bg-foreground/[0.02]"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
        onClick={handleContainerClick}
      >
      {/* Grid lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="room-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" className="text-foreground/[0.04]" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#room-grid)" />
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="currentColor" className="text-foreground/[0.06]" strokeWidth="1" />
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="currentColor" className="text-foreground/[0.06]" strokeWidth="1" />
      </svg>

      {/* Room boundary */}
      <div className="absolute inset-4 border border-dashed border-foreground/10 rounded-2xl pointer-events-none" />

      {/* Listener center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute w-10 h-10 rounded-full bg-foreground/[0.05] border border-foreground/15" />
          <div className="absolute w-20 h-20 rounded-full border border-foreground/[0.04] animate-ping" style={{ animationDuration: "3s" }} />
          <Headphones className="w-4 h-4 text-foreground/50 relative z-10" />
        </div>
        <div className="text-[9px] text-center text-foreground/20 font-black tracking-widest mt-1">LISTENER</div>
      </div>

      {/* Device tokens */}
      {groupedUsers.map(group => {
        if (expandedUserId === group.userId) {
          return group.devices.map(device => (
            <motion.div
              key={device.deviceId}
              className={`absolute w-10 h-10 -ml-5 -mt-5 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg z-20 select-none font-black text-xs ${
                device.isMe
                  ? "bg-blue-500/90 ring-4 ring-blue-500/30 text-white"
                  : "bg-background/80 border-2 border-foreground/10 text-foreground"
              }`}
              style={{ left: `${device.x * 100}%`, top: `${device.y * 100}%` }}
              animate={{ left: `${device.x * 100}%`, top: `${device.y * 100}%` }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(device.deviceId); }}
              onTouchStart={(e) => { e.stopPropagation(); handleMouseDown(device.deviceId); }}
            >
              {device.initials}
              {device.isMe && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500/90 text-white text-[7px] font-black px-1 py-0.5 rounded-full whitespace-nowrap shadow-md">
                  YOU
                </div>
              )}
            </motion.div>
          ));
        }

        return (
          <motion.div
            key={`group-${group.userId}`}
            className={`absolute w-12 h-12 -ml-6 -mt-6 rounded-full flex items-center justify-center cursor-pointer shadow-lg z-10 select-none font-black text-sm ${
              group.isMe
                ? "bg-blue-500/80 ring-2 ring-blue-500/30 text-white"
                : "bg-background/60 border border-foreground/10 text-foreground"
            }`}
            style={{ left: `${group.x * 100}%`, top: `${group.y * 100}%` }}
            animate={{ left: `${group.x * 100}%`, top: `${group.y * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            onMouseDown={(e) => handleGroupClick(group.userId, e)}
            onTouchStart={(e) => handleGroupClick(group.userId, e)}
          >
            {group.initials}
            {group.devices.length > 1 && (
              <div className="absolute -bottom-1 -right-1 bg-foreground text-background text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
                {group.devices.length}
              </div>
            )}
          </motion.div>
        );
      })}

      {/* Axis labels */}
      <div className="absolute bottom-2 left-3 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">L</div>
      <div className="absolute bottom-2 right-3 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">R</div>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-foreground/15 font-black tracking-widest uppercase pointer-events-none">FRONT</div>
      </div>
    </div>
  );
}

// ── SpatialPanel ───────────────────────────────────────────────────────────

type SpatialMode = "orbit" | "placement";

interface SpatialPanelProps {
  myDeviceId: string;
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  isPlaying: boolean;
  onUpdatePosition: (deviceId: string, pos: { angle: number; radius: number; elevation: number }) => void;
}

export function SpatialPanel({
  myDeviceId, spatialDevices, participants, isPlaying, onUpdatePosition,
}: SpatialPanelProps) {
  const [mode, setMode] = useState<SpatialMode>("orbit");
  const [placementMap, setPlacementMap] = useState<Record<string, { x: number; y: number }>>({});

  const gridDevices: GridDevice[] = spatialDevices.map(d => {
    const p = participants.find(pp => pp.socketId === d.deviceId);
    const userId = p?.userId ?? p?.socketId ?? d.deviceId;
    const name = p?.displayName?.split("::")[1] ?? p?.displayName ?? d.deviceId;
    const initials = name.slice(0, 2).toUpperCase();
    const pos = placementMap[d.deviceId] ?? { x: 0.3 + Math.random() * 0.4, y: 0.3 + Math.random() * 0.4 };
    return { deviceId: d.deviceId, userId, x: pos.x, y: pos.y, initials, name, isMe: d.deviceId === myDeviceId };
  });

  const handleGridMove = useCallback((deviceId: string, x: number, y: number) => {
    setPlacementMap(prev => ({ ...prev, [deviceId]: { x, y } }));
    const dx = x - 0.5;
    const dy = y - 0.5;
    const angle = Math.atan2(dx, -dy);
    const radius = Math.min(3, Math.sqrt(dx * dx + dy * dy) * 6);
    onUpdatePosition(deviceId, { angle, radius, elevation: 0 });
  }, [onUpdatePosition]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 relative">
            <div className="absolute inset-0 rounded-full border border-foreground/20 animate-ping" style={{ animationDuration: "2s" }} />
            <div className="w-4 h-4 rounded-full bg-foreground/20 border border-foreground/20" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-foreground/50">Spatial Audio</span>
          <span className="px-1.5 py-0.5 rounded-md text-[8px] font-black tracking-widest bg-foreground/20 text-foreground dark:text-foreground border border-foreground/20">
            BETA
          </span>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center p-0.5 rounded-xl bg-foreground/[0.04] border border-foreground/[0.08]">
          <button
            onClick={() => setMode("orbit")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200 ${
              mode === "orbit"
                ? "bg-foreground/10 text-foreground shadow-sm"
                : "text-foreground/35 hover:text-foreground/60"
            }`}
          >
            <Layers className="w-3 h-3" />
            Orbit
          </button>
          <button
            onClick={() => setMode("placement")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all duration-200 ${
              mode === "placement"
                ? "bg-foreground/10 text-foreground shadow-sm"
                : "text-foreground/35 hover:text-foreground/60"
            }`}
          >
            <Grid3X3 className="w-3 h-3" />
            Room
          </button>
        </div>
      </div>

      {/* Mode description */}
      <p className="text-[11px] text-foreground/25 text-center mb-3 shrink-0 px-4">
        {mode === "orbit"
          ? isPlaying ? "Devices orbiting in sync" : "Arrange your 3D stage"
          : "Drag devices to place them in the room"}
      </p>

      {/* Visualization */}
      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {mode === "orbit" ? (
            <motion.div key="orbit" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="absolute inset-0">
              <OrbitUI
                myDeviceId={myDeviceId}
                spatialDevices={spatialDevices}
                participants={participants}
                onUpdatePosition={onUpdatePosition}
                isPlaying={isPlaying}
              />
            </motion.div>
          ) : (
            <motion.div key="placement" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="absolute inset-0">
              <RoomPlacementGrid
                devices={gridDevices}
                onMove={handleGridMove}
                isPlaying={isPlaying}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
