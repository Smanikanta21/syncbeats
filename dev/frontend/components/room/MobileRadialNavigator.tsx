"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  Activity,
  Users,
  LayoutGrid,
  MessageSquare,
  Compass,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat";

export interface MenuItem {
  id: MobileTab;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  iconName: string;
  color: string;
}

export const MENU_ITEMS: MenuItem[] = [
  {
    id: "spatial",
    label: "Spatial 3D",
    sublabel: "3D Audio Arena",
    icon: Radio,
    iconName: "Radio",
    color: "from-cyan-500 to-blue-500",
  },
  {
    id: "playing",
    label: "Visuals & EQ",
    sublabel: "Visualizer & Equalizer",
    icon: Activity,
    iconName: "Activity",
    color: "from-purple-500 to-indigo-500",
  },
  {
    id: "devices",
    label: "Devices",
    sublabel: "Sync & Volumes",
    icon: Users,
    iconName: "Users",
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "queue",
    label: "Queue",
    sublabel: "Live Playlists",
    icon: LayoutGrid,
    iconName: "LayoutGrid",
    color: "from-amber-500 to-orange-500",
  },
  {
    id: "chat",
    label: "Chat",
    sublabel: "Room Messages",
    icon: MessageSquare,
    iconName: "MessageSquare",
    color: "from-pink-500 to-rose-500",
  },
];

interface MobileRadialNavigatorProps {
  activeTab: MobileTab;
  onSelectTab: (tabId: MobileTab) => void;
  className?: string;
}

export function MobileRadialNavigator({
  activeTab,
  onSelectTab,
  className,
}: MobileRadialNavigatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [snappedIndex, setSnappedIndex] = useState<number | null>(null);
  const [thumbPos, setThumbPos] = useState<{ x: number; y: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const isOpenRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastHapticIndexRef = useRef<number | null>(null);
  const centerCoordRef = useRef<{ x: number; y: number } | null>(null);
  const snappedIndexRef = useRef<number | null>(null);

  // Dispatch custom event to temporarily override Dynamic Island while holding
  const notifyDynamicIsland = useCallback((openState: boolean, index: number | null) => {
    if (typeof window === "undefined") return;
    const snappedItem = openState && index !== null && MENU_ITEMS[index]
      ? {
          id: MENU_ITEMS[index].id,
          label: MENU_ITEMS[index].label,
          sublabel: MENU_ITEMS[index].sublabel,
          iconName: MENU_ITEMS[index].iconName,
        }
      : null;

    window.dispatchEvent(
      new CustomEvent("radial-navigator:snap", {
        detail: {
          isOpen: openState,
          snappedItem,
        },
      })
    );
  }, []);

  const setMenuOpen = useCallback((open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
    notifyDynamicIsland(open, open ? snappedIndexRef.current : null);
  }, [notifyDynamicIsland]);

  const updateSnappedIndex = useCallback((idx: number | null) => {
    if (snappedIndexRef.current !== idx) {
      snappedIndexRef.current = idx;
      setSnappedIndex(idx);
      if (isOpenRef.current) {
        notifyDynamicIsland(true, idx);
      }
    }
  }, [notifyDynamicIsland]);

  // Center of trigger button in viewport coordinates
  const getCenterCoord = useCallback(() => {
    if (centerCoordRef.current) return centerCoordRef.current;
    if (!triggerRef.current) return { x: window.innerWidth - 45, y: window.innerHeight - 45 };
    const rect = triggerRef.current.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }, []);

  // Arc angles for 5 items in bottom-right semi-circle:
  // Spanning from 95° (pointing straight up) to 185° (pointing left)
  const getItemArcAngle = useCallback((index: number, total: number) => {
    const startAngle = 95;  // vertical up
    const endAngle = 185;   // horizontal left
    const step = (endAngle - startAngle) / Math.max(total - 1, 1);
    return startAngle + index * step;
  }, []);

  // High precision magnetic snap evaluation logic
  const processPoint = useCallback(
    (clientX: number, clientY: number) => {
      const center = getCenterCoord();
      const dx = clientX - center.x;
      const dy = clientY - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      setThumbPos({ x: clientX, y: clientY });

      // If thumb is within 25px deadzone of button center
      if (distance < 25) {
        updateSnappedIndex(null);
        return;
      }

      // Compute standard polar angle (90° is straight UP)
      let angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
      if (angle < 0) angle += 360;

      const numItems = MENU_ITEMS.length;

      let closestIdx: number | null = null;
      let minAngularDiff = 999;

      MENU_ITEMS.forEach((_, idx) => {
        const itemAngle = getItemArcAngle(idx, numItems);
        let diff = Math.abs(angle - itemAngle);
        if (diff > 180) diff = 360 - diff;

        if (diff < minAngularDiff) {
          minAngularDiff = diff;
          closestIdx = idx;
        }
      });

      // Magnetic snap threshold: within 32° angular delta & 30px to 240px radial distance
      if (
        closestIdx !== null &&
        minAngularDiff <= 32 &&
        distance >= 30 &&
        distance <= 240
      ) {
        updateSnappedIndex(closestIdx);

        // Haptic feedback pulse on entering new target item
        if (lastHapticIndexRef.current !== closestIdx) {
          lastHapticIndexRef.current = closestIdx;
          if (typeof window !== "undefined" && navigator.vibrate) {
            try {
              navigator.vibrate(18);
            } catch {}
          }
        }
      } else {
        updateSnappedIndex(null);
        lastHapticIndexRef.current = null;
      }
    },
    [getCenterCoord, getItemArcAngle, updateSnappedIndex]
  );

  // Global window listener fallback to guarantee touch tracking across frame boundaries
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPointerMove = (e: PointerEvent | TouchEvent) => {
      let clientX = 0;
      let clientY = 0;

      if ("touches" in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ("clientX" in e) {
        clientX = (e as PointerEvent).clientX;
        clientY = (e as PointerEvent).clientY;
      } else {
        return;
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      processPoint(clientX, clientY);
    };

    const preventScroll = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("touchmove", handleWindowPointerMove, { passive: false });
    window.addEventListener("wheel", preventScroll, { passive: false });

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("touchmove", handleWindowPointerMove);
      window.removeEventListener("wheel", preventScroll);
    };
  }, [isOpen, processPoint]);

  // Pointer Down on Trigger Button
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    pointerIdRef.current = e.pointerId;

    try {
      target.setPointerCapture(e.pointerId);
    } catch {}

    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      centerCoordRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    isDraggingRef.current = true;

    setMenuOpen(true);
    processPoint(e.clientX, e.clientY);
  };

  // Pointer Move on Trigger Button (captured via setPointerCapture)
  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current && !isOpenRef.current) return;
    e.preventDefault();
    processPoint(e.clientX, e.clientY);
  };

  // Pointer Up / Release on Trigger Button
  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    
    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {}
      pointerIdRef.current = null;
    }

    const startPos = dragStartPosRef.current;
    const dragDistance = startPos
      ? Math.sqrt(
          Math.pow(e.clientX - startPos.x, 2) + Math.pow(e.clientY - startPos.y, 2)
        )
      : 0;

    const currentSnapped = snappedIndexRef.current;

    // Reset state & notifying Dynamic Island to close overlay IMMEDIATELY
    isDraggingRef.current = false;
    centerCoordRef.current = null;
    snappedIndexRef.current = null;
    setSnappedIndex(null);
    setThumbPos(null);
    lastHapticIndexRef.current = null;

    if (currentSnapped !== null && MENU_ITEMS[currentSnapped]) {
      // Released over a snapped item -> select that tab!
      onSelectTab(MENU_ITEMS[currentSnapped].id);
      setMenuOpen(false);
    } else if (dragDistance < 12) {
      // Tap gesture without dragging -> toggle menu open/close
      const nextOpen = !isOpenRef.current;
      setMenuOpen(nextOpen);
    } else {
      // Dragged into space outside any item -> close menu
      setMenuOpen(false);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {}
      pointerIdRef.current = null;
    }
    isDraggingRef.current = false;
    centerCoordRef.current = null;
    snappedIndexRef.current = null;
    setSnappedIndex(null);
    setThumbPos(null);
    setMenuOpen(false);
  };

  const activeMenuItem = MENU_ITEMS.find((m) => m.id === activeTab) || MENU_ITEMS[0];
  const ActiveIcon = activeMenuItem.icon;

  const center = getCenterCoord();

  return (
    <>
      {/* ── Floating Trigger Button (Bottom-Right Ergonomic Thumb Target) ── */}
      <div className={cn("fixed bottom-6 right-6 z-50 md:hidden select-none", className)}>
        <motion.button
          ref={triggerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "relative w-15 h-15 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md border transition-all duration-200 touch-none cursor-pointer",
            isOpen
              ? "bg-primary text-primary-foreground border-white/40 ring-4 ring-primary/40 scale-110 shadow-[0_0_30px_rgba(168,85,247,0.6)]"
              : "bg-background/90 dark:bg-black/90 text-foreground border-foreground/15 hover:bg-background"
          )}
          style={{ touchAction: "none", willChange: "transform, opacity" }}
          aria-label="Mobile Magnetic Radial Menu Navigator"
        >
          <AnimatePresence>
            {isOpen ? (
              <motion.div
                key="open"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="w-7 h-7 text-white" />
              </motion.div>
            ) : (
              <motion.div
                key="closed"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col items-center justify-center"
              >
                <ActiveIcon className="w-7 h-7 text-primary" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Glowing pulse ring indicator */}
          {!isOpen && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-primary border-2 border-background"></span>
            </span>
          )}
        </motion.button>
      </div>

      {/* ── Semi-Circle Radial Menu & Magnetic Overlay ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 z-40 md:hidden pointer-events-auto bg-black/50 backdrop-blur-sm select-none touch-none"
            style={{ touchAction: "none", willChange: "opacity" }}
            onPointerDown={() => setMenuOpen(false)}
          >
            {/* Magnetic Connector Line to Active Thumb */}
            {thumbPos && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {snappedIndex !== null ? (
                  (() => {
                    const angle = getItemArcAngle(snappedIndex, MENU_ITEMS.length);
                    const rad = (angle * Math.PI) / 180;
                    const radius = 130;
                    const targetX = center.x + radius * Math.cos(rad);
                    const targetY = center.y - radius * Math.sin(rad);

                    return (
                      <>
                        <line
                          x1={thumbPos.x}
                          y1={thumbPos.y}
                          x2={targetX}
                          y2={targetY}
                          stroke="var(--primary, #a855f7)"
                          strokeWidth="3.5"
                          strokeDasharray="6 4"
                          className="animate-pulse"
                        />
                        <circle
                          cx={thumbPos.x}
                          cy={thumbPos.y}
                          r="16"
                          fill="rgba(168, 85, 247, 0.25)"
                          stroke="var(--primary, #a855f7)"
                          strokeWidth="2.5"
                        />
                      </>
                    );
                  })()
                ) : (
                  <circle
                    cx={thumbPos.x}
                    cy={thumbPos.y}
                    r="10"
                    fill="rgba(255, 255, 255, 0.2)"
                    stroke="rgba(255, 255, 255, 0.5)"
                    strokeWidth="1.5"
                  />
                )}
              </svg>
            )}

            {/* Arc Items Rendered in Semi-Circle Layout */}
            <div className="absolute inset-0 pointer-events-none">
              {MENU_ITEMS.map((item, idx) => {
                const angle = getItemArcAngle(idx, MENU_ITEMS.length);
                const rad = (angle * Math.PI) / 180;
                const radius = 130; // radial distance from center

                const posX = center.x + radius * Math.cos(rad);
                const posY = center.y - radius * Math.sin(rad);

                const isSnapped = snappedIndex === idx;
                const isActiveTab = activeTab === item.id;
                const Icon = item.icon;

                // Ultra snappy collapse stagger on exit
                const exitDelay = (MENU_ITEMS.length - 1 - idx) * 0.01;

                return (
                  <motion.div
                    key={item.id}
                    initial={{
                      opacity: 0,
                      scale: 0.2,
                      x: center.x - 28,
                      y: center.y - 28,
                    }}
                    animate={{
                      opacity: 1,
                      scale: isSnapped ? 1.38 : isActiveTab ? 1.15 : 1,
                      x: posX - 28,
                      y: posY - 28,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.1,
                      x: center.x - 28,
                      y: center.y - 28,
                      transition: {
                        type: "spring",
                        stiffness: 500,
                        damping: 32,
                        mass: 0.5,
                        delay: exitDelay,
                      },
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 480,
                      damping: 28,
                      mass: 0.6,
                      delay: idx * 0.015,
                    }}
                    style={{ willChange: "transform, opacity" }}
                    className={cn(
                      "absolute w-14 h-14 rounded-full flex flex-col items-center justify-center border-none shadow-2xl backdrop-blur-md transition-all duration-150 pointer-events-auto cursor-pointer select-none",
                      isSnapped
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/50 shadow-[0_0_35px_rgba(168,85,247,0.8)] z-30"
                        : isActiveTab
                        ? "bg-foreground text-background ring-2 ring-primary/40"
                        : "bg-background/90 dark:bg-black/90 text-foreground hover:bg-background"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTab(item.id);
                      setMenuOpen(false);
                    }}
                  >
                    <Icon className="w-6 h-6" />

                    {/* Item label under icon */}
                    <span
                      className={cn(
                        "absolute -bottom-6 text-[9px] font-black uppercase tracking-wider whitespace-nowrap px-2 py-0.5 rounded-full backdrop-blur-md transition-all duration-150 pointer-events-none",
                        isSnapped
                          ? "bg-primary text-white opacity-100 scale-110 shadow-lg"
                          : "bg-background/90 text-foreground/80 opacity-90"
                      )}
                    >
                      {item.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
