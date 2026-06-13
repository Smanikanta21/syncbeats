"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { DeviceSpatialState } from "../lib/types";
import { Participant } from "../lib/types";
import { Headphones } from "lucide-react";

interface SpatialPosition {
  angle: number;
  radius: number;
  elevation: number;
}

interface OrbitUIProps {
  myDeviceId: string;
  spatialDevices: DeviceSpatialState[];
  participants: Participant[];
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
}

export function OrbitUI({
  myDeviceId,
  spatialDevices,
  participants,
  onUpdatePosition,
}: OrbitUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const minDim = Math.min(entry.contentRect.width, entry.contentRect.height);
        setContainerSize(minDim > 0 ? minDim : 300);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Constants
  const MAX_RADIUS = 2.0; // Max logic radius to allow dragging away
  const uiRadius = containerSize / 2;
  const maxUiDrag = uiRadius - 24; // padding for icons

  const handleDrag = (deviceId: string, e: any, info: any) => {
    // We calculate based on the current logical position plus the drag offset.
    // Framer motion gives us offset in pixels.
    // However, it's easier to just map the node's bounding rect to the container's center.
  };

  const handleDragEnd = (deviceId: string, e: any, info: any) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    // Pointer client coordinates
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);

    if (clientX == null || clientY == null) return;

    const dx = clientX - cx;
    const dy = clientY - cy;

    // Convert to spatial coordinates
    // dx maps to x (right/left), dy maps to -z (up/down on screen is front/back)
    // angle = Math.atan2(dx, -dy)
    let angle = Math.atan2(dx, -dy);
    
    // distance in UI pixels
    const distPx = Math.sqrt(dx * dx + dy * dy);
    // mapped to logical radius
    let radius = (distPx / maxUiDrag) * MAX_RADIUS;
    radius = Math.max(0.1, Math.min(radius, MAX_RADIUS)); // clamp

    const currentDevice = spatialDevices.find(d => d.deviceId === deviceId);
    onUpdatePosition(deviceId, {
      angle,
      radius,
      elevation: currentDevice?.position.elevation ?? 0
    });
  };

  // Build a mapped list for easier rendering
  const mappedDevices = spatialDevices.map(d => {
    const p = participants.find(p => p.socketId === d.deviceId);
    let initials = "?";
    let devName = "Unknown";
    if (p) {
      const parts = p.displayName.split("::");
      devName = parts.length > 1 ? parts[1] : parts[0];
      initials = devName.slice(0, 2).toUpperCase();
    }

    const { angle, radius } = d.position;
    
    // Clamp radius visually
    const visualRadius = Math.min(radius, MAX_RADIUS) / MAX_RADIUS * maxUiDrag;
    const x = visualRadius * Math.sin(angle);
    const y = -visualRadius * Math.cos(angle);

    return {
      deviceId: d.deviceId,
      initials,
      devName,
      x,
      y
    };
  });

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="text-center mb-4 space-y-1 shrink-0">
        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/50">Spatial Audio</h3>
        <p className="text-xs text-foreground/40 font-medium">Drag devices around to position them in 3D space.</p>
      </div>

      <div 
        ref={containerRef} 
        className="relative w-full max-w-[350px] aspect-square rounded-full border-2 border-dashed border-foreground/10 bg-foreground/[0.02] shadow-inner overflow-visible touch-none"
      >
        {/* Center crosshairs */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
          <div className="w-full h-px bg-foreground" />
          <div className="absolute h-full w-px bg-foreground" />
          <div className="absolute w-[50%] h-[50%] rounded-full border border-foreground" />
        </div>

        {/* Local Listener (Center) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] z-10 pointer-events-none">
          <Headphones className="w-5 h-5" />
        </div>

        {/* Remote Devices */}
        {mappedDevices.map(d => (
          <motion.div
            key={d.deviceId}
            className="absolute top-1/2 left-1/2 w-10 h-10 -ml-5 -mt-5 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 border border-foreground/20 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shadow-lg z-20"
            animate={{ x: d.x, y: d.y }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            drag
            dragMomentum={false}
            onDragEnd={(e, info) => handleDragEnd(d.deviceId, e, info)}
            title={d.devName}
          >
            <span className="text-[10px] font-black text-foreground/80 tracking-widest">{d.initials}</span>
            {/* Visual indicator of front */}
            <div className="absolute -top-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
