"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { motion, useMotionValue } from "framer-motion";
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
  isPlaying?: boolean;
}

// One full revolution every 18 s (matches audio engine: 20 deg/s)
const ROTATION_SPEED_RAD_PER_MS = (2 * Math.PI) / 18000;
const MAX_RADIUS = 3;

// ── DeviceNode ────────────────────────────────────────────────────────────────
// Each device has its own MotionValues so the RAF loop can call .set() directly
// without going through React state — this avoids the Framer Motion drag-state
// conflict where a manually dragged element gets stuck after release.

interface DeviceNodeProps {
  deviceId: string;
  initials: string;
  devName: string;
  isMe: boolean;
  initialX: number;
  initialY: number;
  rotationOffsetRef: React.MutableRefObject<number>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  maxUiDragRef: React.MutableRefObject<number>;
  spatialDevicesRef: React.MutableRefObject<DeviceSpatialState[]>;
  onUpdatePosition: (deviceId: string, pos: SpatialPosition) => void;
  // Registers setter callbacks so the parent RAF loop can drive positions
  onRegister: (deviceId: string, setX: (v: number) => void, setY: (v: number) => void) => void;
  onUnregister: (deviceId: string) => void;
}

function DeviceNode({
  deviceId, initials, devName, isMe,
  initialX, initialY,
  rotationOffsetRef, containerRef, maxUiDragRef, spatialDevicesRef,
  onUpdatePosition, onRegister, onUnregister,
}: DeviceNodeProps) {
  const x = useMotionValue(initialX);
  const y = useMotionValue(initialY);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    // Register imperative setters with the parent RAF loop
    onRegister(deviceId, (v) => x.set(v), (v) => y.set(v));
    return () => onUnregister(deviceId);
  }, [deviceId, x, y, onRegister, onUnregister]);

  const handleDragEnd = useCallback((_e: any, info: any) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dx = info.point.x - cx;
    const dy = info.point.y - cy;

    // Subtract rotation offset so we store the "base" angle
    let angle = Math.atan2(dx, -dy) - rotationOffsetRef.current;
    if (angle < 0) angle += 2 * Math.PI;

    const distPx = Math.sqrt(dx * dx + dy * dy);
    const radius = Math.min((distPx / maxUiDragRef.current) * MAX_RADIUS, MAX_RADIUS);

    const currentDevice = spatialDevicesRef.current.find(d => d.deviceId === deviceId);

    // Immediately snap the MotionValues to the correct rotated position
    // so the element doesn't stay stuck at the raw drag drop point
    const a = angle + rotationOffsetRef.current;
    const vis = (Math.min(radius, MAX_RADIUS) / MAX_RADIUS) * maxUiDragRef.current;
    x.set(vis * Math.sin(a));
    y.set(-vis * Math.cos(a));

    onUpdatePosition(deviceId, {
      angle,
      radius,
      elevation: currentDevice?.position.elevation ?? 0,
    });
  }, [deviceId, containerRef, rotationOffsetRef, maxUiDragRef, spatialDevicesRef, x, y, onUpdatePosition]);

  return (
    <motion.div
      className={`absolute top-1/2 left-1/2 w-10 h-10 -ml-5 -mt-5 rounded-full bg-linear-to-tr from-zinc-800 to-zinc-700 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing shadow-lg z-20 ${
        isMe ? "ring-2 ring-blue-500" : "border border-foreground/20"
      }`}
      style={{ x, y }}
      drag
      dragMomentum={false}
      onDragEnd={handleDragEnd}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onTapStart={() => setIsHovered(prev => !prev)}
      title={isMe ? "Current Device" : devName}
    >
      <span className="text-[10px] font-black text-foreground/80 tracking-widest">{initials}</span>

      {/* Badge */}
      {isMe ? (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[7px] font-black px-1 py-0.5 rounded-full tracking-widest uppercase leading-none">
          YOU
        </div>
      ) : (
        <div className="absolute -top-1 w-1.5 h-1.5 bg-green-400 rounded-full" />
      )}

      {/* Floating name tooltip */}
      {isHovered && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-background/90 border border-foreground/10 backdrop-blur-sm text-foreground/80 text-[10px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap shadow-lg pointer-events-none z-30"
        >
          {isMe ? `${devName} (you)` : devName}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── OrbitUI ───────────────────────────────────────────────────────────────────

export function OrbitUI({
  myDeviceId,
  spatialDevices,
  participants,
  onUpdatePosition,
  isPlaying = false,
}: OrbitUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [maxUiDrag, setMaxUiDrag] = useState(125);
  const maxUiDragRef = useRef(125);

  const spatialDevicesRef = useRef(spatialDevices);
  useEffect(() => { spatialDevicesRef.current = spatialDevices; }, [spatialDevices]);

  const rotationOffsetRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Registry of imperative setters: deviceId → { setX, setY }
  // The RAF loop calls these directly, bypassing React state
  type Setters = { setX: (v: number) => void; setY: (v: number) => void };
  const settersRef = useRef<Map<string, Setters>>(new Map());

  const handleRegister = useCallback((deviceId: string, setX: (v: number) => void, setY: (v: number) => void) => {
    settersRef.current.set(deviceId, { setX, setY });
  }, []);

  const handleUnregister = useCallback((deviceId: string) => {
    settersRef.current.delete(deviceId);
  }, []);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const minDim = Math.min(entry.contentRect.width, entry.contentRect.height);
        const val = minDim > 0 ? minDim / 2 - 28 : 125;
        setMaxUiDrag(val);
        maxUiDragRef.current = val;
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute x/y from polar + rotation offset
  const computeXY = useCallback((angle: number, radius: number, offset: number) => {
    const a = angle + offset;
    const vis = (Math.min(radius, MAX_RADIUS) / MAX_RADIUS) * maxUiDragRef.current;
    return { x: vis * Math.sin(a), y: -vis * Math.cos(a) };
  }, []);

  // RAF loop — calls .set() on MotionValues directly (no React re-renders per frame)
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastTimeRef.current = null;
      // Freeze positions at current offset
      spatialDevicesRef.current.forEach(d => {
        const { x, y } = computeXY(d.position.angle, d.position.radius, rotationOffsetRef.current);
        settersRef.current.get(d.deviceId)?.setX(x);
        settersRef.current.get(d.deviceId)?.setY(y);
      });
      return;
    }

    const animate = (time: number) => {
      if (lastTimeRef.current !== null) {
        const dt = time - lastTimeRef.current;
        rotationOffsetRef.current += ROTATION_SPEED_RAD_PER_MS * dt;
        if (rotationOffsetRef.current >= 2 * Math.PI) rotationOffsetRef.current -= 2 * Math.PI;
      }
      lastTimeRef.current = time;

      spatialDevicesRef.current.forEach(d => {
        const { x, y } = computeXY(d.position.angle, d.position.radius, rotationOffsetRef.current);
        settersRef.current.get(d.deviceId)?.setX(x);
        settersRef.current.get(d.deviceId)?.setY(y);
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [isPlaying, computeXY]);

  // Update positions when paused and devices change (drag updates)
  useEffect(() => {
    if (isPlaying) return;
    spatialDevices.forEach(d => {
      const { x, y } = computeXY(d.position.angle, d.position.radius, rotationOffsetRef.current);
      settersRef.current.get(d.deviceId)?.setX(x);
      settersRef.current.get(d.deviceId)?.setY(y);
    });
  }, [spatialDevices, isPlaying, computeXY]);

  // Split into my-orbit devices vs other listeners
  const myParticipant = participants.find(p => p.socketId === myDeviceId);
  const myBaseName = myParticipant ? myParticipant.displayName.split("::")[0] : "";

  type OrbitDevice = { deviceId: string; initials: string; devName: string; isMe: boolean; initialX: number; initialY: number };
  const myOrbitDevices: OrbitDevice[] = [];
  const otherListenersMap = new Map<string, { baseName: string; deviceCount: number }>();

  spatialDevices.forEach(d => {
    const p = participants.find(p => p.socketId === d.deviceId);
    if (!p) return;

    const parts = p.displayName.split("::");
    const baseName = parts[0];
    const devName = parts.length > 1 ? parts[1] : parts[0];
    const initials = devName.slice(0, 2).toUpperCase();

    if (baseName === myBaseName) {
      const { x, y } = computeXY(d.position.angle, d.position.radius, rotationOffsetRef.current);
      myOrbitDevices.push({ deviceId: d.deviceId, initials, devName, isMe: d.deviceId === myDeviceId, initialX: x, initialY: y });
    } else {
      if (otherListenersMap.has(baseName)) {
        otherListenersMap.get(baseName)!.deviceCount += 1;
      } else {
        otherListenersMap.set(baseName, { baseName, deviceCount: 1 });
      }
    }
  });

  const otherListeners = Array.from(otherListenersMap.values());

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4">
      <div className="text-center mb-4 space-y-1 shrink-0">
        <h3 className="text-sm font-bold uppercase tracking-widest text-foreground/50">My Speaker Setup</h3>
        <p className="text-xs text-foreground/40 font-medium">
          {isPlaying ? "Devices are orbiting — drag to reposition." : "Drag your devices to position them in 3D space."}
        </p>
      </div>

      {/* Orbit ring — STATIC */}
      <div
        ref={containerRef}
        className="relative w-full max-w-87.5 aspect-square rounded-full border-2 border-dashed border-foreground/10 bg-foreground/2 shadow-inner overflow-visible touch-none mb-4"
      >
        {/* Crosshairs */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
          <div className="w-full h-px bg-foreground" />
          <div className="absolute h-full w-px bg-foreground" />
          <div className="absolute w-1/2 h-1/2 rounded-full border border-foreground" />
        </div>

        {/* Listener at center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.3)] z-10 pointer-events-none">
          <Headphones className="w-5 h-5" />
        </div>

        {/* Device nodes */}
        {myOrbitDevices.map(d => (
          <DeviceNode
            key={d.deviceId}
            deviceId={d.deviceId}
            initials={d.initials}
            devName={d.devName}
            isMe={d.isMe}
            initialX={d.initialX}
            initialY={d.initialY}
            rotationOffsetRef={rotationOffsetRef}
            containerRef={containerRef}
            maxUiDragRef={maxUiDragRef}
            spatialDevicesRef={spatialDevicesRef}
            onUpdatePosition={onUpdatePosition}
            onRegister={handleRegister}
            onUnregister={handleUnregister}
          />
        ))}
      </div>

      {otherListeners.length > 0 && (
        <div className="mt-2 flex flex-col items-center w-full max-w-87.5">
          <h4 className="text-[10px] uppercase font-bold text-foreground/40 tracking-wider mb-2">Other Listeners</h4>
          <div className="flex flex-wrap gap-2 justify-center">
            {otherListeners.map(listener => (
              <div
                key={listener.baseName}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/5 border border-foreground/10 text-xs font-medium text-foreground/70"
              >
                <div className="w-2 h-2 rounded-full bg-green-500/80" />
                {listener.baseName}{listener.deviceCount > 1 ? ` (${listener.deviceCount})` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
