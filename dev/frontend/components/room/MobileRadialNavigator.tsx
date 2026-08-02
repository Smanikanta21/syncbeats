"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Radio,
  Activity,
  Users,
  LayoutGrid,
  MessageSquare,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat";

export interface MenuItem {
  id: MobileTab | "leave";
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
    label: "Visuals",
    sublabel: "Visualizer & EQ",
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
  {
    id: "leave",
    label: "Leave",
    sublabel: "Exit Room",
    icon: LogOut,
    iconName: "LogOut",
    color: "from-red-500 to-rose-600",
  },
];

interface MobileRadialNavigatorProps {
  activeTab: MobileTab;
  onSelectTab: (tabId: MobileTab) => void;
  onLeaveRoom?: () => void;
  unreadChatCount?: number;
  className?: string;
}

export function MobileRadialNavigator({
  activeTab,
  onSelectTab,
  onLeaveRoom,
  unreadChatCount = 0,
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

  // Arc angles for 6 items in bottom-right quarter circle:
  // Spanning from 90° (pointing straight up) to 180° (pointing left)
  const getItemArcAngle = useCallback((index: number, total: number) => {
    const startAngle = 92;  // vertical up
    const endAngle = 182;   // horizontal left
    const step = (endAngle - startAngle) / Math.max(total - 1, 1);
    return startAngle + index * step;
  }, []);

  // Select item action
  const handleItemSelect = useCallback((item: MenuItem) => {
    setMenuOpen(false);
    if (item.id === "leave") {
      if (onLeaveRoom) {
        onLeaveRoom();
      } else if (typeof window !== "undefined") {
        window.location.href = "/";
      }
    } else {
      onSelectTab(item.id);
    }
  }, [onLeaveRoom, onSelectTab, setMenuOpen]);

  // High precision magnetic snap evaluation logic
  const processPoint = useCallback(
    (clientX: number, clientY: number) => {
      const center = getCenterCoord();
      const dx = clientX - center.x;
      const dy = clientY - center.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      setThumbPos({ x: clientX, y: clientY });

      // If thumb is within 20px deadzone of button center
      if (distance < 20) {
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

      // Magnetic snap threshold: within 28° angular delta & 25px to 220px radial distance
      if (
        closestIdx !== null &&
        minAngularDiff <= 28 &&
        distance >= 25 &&
        distance <= 220
      ) {
        updateSnappedIndex(closestIdx);

        // Haptic feedback pulse on entering new target item
        if (lastHapticIndexRef.current !== closestIdx) {
          lastHapticIndexRef.current = closestIdx;
          if (typeof window !== "undefined" && navigator.vibrate) {
            try {
              navigator.vibrate(14);
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

    // Toggle menu state immediately on click/press
    const nextState = !isOpenRef.current;
    setMenuOpen(nextState);

    if (nextState) {
      processPoint(e.clientX, e.clientY);
    }
  };

  // Pointer Move on Trigger Button
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

    isDraggingRef.current = false;
    centerCoordRef.current = null;
    snappedIndexRef.current = null;
    setSnappedIndex(null);
    setThumbPos(null);
    lastHapticIndexRef.current = null;

    if (currentSnapped !== null && MENU_ITEMS[currentSnapped]) {
      // Released over a snapped item -> select that tab!
      handleItemSelect(MENU_ITEMS[currentSnapped]);
    } else if (dragDistance > 12) {
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
      {/* ── Floating Trigger Button (Compact w-12 h-12 Ergonomic Thumb Target) ── */}
      <div className={cn("fixed bottom-5 right-5 z-50 md:hidden select-none", className)}>
        <motion.button
          ref={triggerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          whileTap={{ scale: 0.90 }}
          animate={unreadChatCount > 0 && activeTab !== "chat" && !isOpen ? {
            rotate: [0, -14, 14, -10, 10, -5, 5, 0],
            scale: [1, 1.18, 0.94, 1.1, 0.98, 1.04, 1],
            transition: { duration: 0.8, repeat: Infinity, repeatDelay: 1.8 }
          } : { rotate: 0, scale: 1 }}
          className={cn(
            "relative w-12 h-12 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md border transition-all duration-200 touch-none cursor-pointer",
            isOpen
              ? "bg-primary text-primary-foreground border-white/40 ring-4 ring-primary/40 scale-105 shadow-[0_0_25px_rgba(168,85,247,0.6)]"
              : unreadChatCount > 0 && activeTab !== "chat"
              ? "bg-gradient-to-r from-pink-600 to-rose-600 text-white border-pink-400/80 ring-4 ring-pink-500/40 shadow-[0_0_25px_rgba(236,72,153,0.7)]"
              : "bg-background/90 dark:bg-black/90 text-foreground border-foreground/15 hover:bg-background"
          )}
          style={{ touchAction: "none", willChange: "transform, opacity" }}
          aria-label="Mobile Magnetic Radial Menu Navigator"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="open"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <X className={cn('w-5', 'h-5', 'text-white')} />
              </motion.div>
            ) : (
              <motion.div
                key="closed"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.12 }}
                className={cn('flex', 'flex-col', 'items-center', 'justify-center')}
              >
                <ActiveIcon className={cn('w-5', 'h-5', 'text-primary')} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unread Message Count Badge on Mobile Button */}
          {unreadChatCount > 0 && activeTab !== "chat" && !isOpen && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [1, 1.25, 1] }}
              transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 1 }}
              className={cn('absolute', '-top-1.5', '-left-1.5', 'flex', 'h-5', 'min-w-[20px]', 'px-1.5', 'items-center', 'justify-center', 'rounded-full', 'bg-pink-500', 'text-white', 'text-[10px]', 'font-black', 'border-2', 'border-background', 'shadow-lg', 'z-50', 'pointer-events-none')}
            >
              {unreadChatCount}
            </motion.span>
          )}

          {/* Glowing pulse ring indicator */}
          {!isOpen && unreadChatCount === 0 && (
            <span className={cn('absolute', '-top-0.5', '-right-0.5', 'flex', 'h-3', 'w-3')}>
              <span className={cn('animate-ping', 'absolute', 'inline-flex', 'h-full', 'w-full', 'rounded-full', 'bg-primary', 'opacity-75')}></span>
              <span className={cn('relative', 'inline-flex', 'rounded-full', 'h-3', 'w-3', 'bg-primary', 'border-2', 'border-background')}></span>
            </span>
          )}
        </motion.button>
      </div>

      {/* ── Semi-Circle Radial Menu & Backdrop Overlay ── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className={cn('fixed', 'inset-0', 'z-40', 'md:hidden', 'pointer-events-auto', 'bg-black/50', 'backdrop-blur-sm', 'select-none', 'touch-none')}
            style={{ touchAction: "none", willChange: "opacity" }}
            onClick={() => setMenuOpen(false)}
            onPointerDown={() => setMenuOpen(false)}
          >
            {/* Magnetic Connector Line to Active Thumb */}
            {thumbPos && (
              <svg className={cn('absolute', 'inset-0', 'w-full', 'h-full', 'pointer-events-none', 'z-10')}>
                {snappedIndex !== null ? (
                  (() => {
                    const angle = getItemArcAngle(snappedIndex, MENU_ITEMS.length);
                    const rad = (angle * Math.PI) / 180;
                    const radius = 110;
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
                          strokeWidth="3"
                          strokeDasharray="5 3"
                          className="animate-pulse"
                        />
                        <circle
                          cx={thumbPos.x}
                          cy={thumbPos.y}
                          r="14"
                          fill="rgba(168, 85, 247, 0.25)"
                          stroke="var(--primary, #a855f7)"
                          strokeWidth="2"
                        />
                      </>
                    );
                  })()
                ) : (
                  <circle
                    cx={thumbPos.x}
                    cy={thumbPos.y}
                    r="8"
                    fill="rgba(255, 255, 255, 0.2)"
                    stroke="rgba(255, 255, 255, 0.5)"
                    strokeWidth="1.5"
                  />
                )}
              </svg>
            )}

            {/* Arc Items Rendered in Compact 110px Semi-Circle Arc */}
            <div className={cn('absolute', 'inset-0', 'pointer-events-none')}>
              {MENU_ITEMS.map((item, idx) => {
                const angle = getItemArcAngle(idx, MENU_ITEMS.length);
                const rad = (angle * Math.PI) / 180;
                const radius = 110; // compact radial distance from center

                const posX = center.x + radius * Math.cos(rad);
                const posY = center.y - radius * Math.sin(rad);

                const isSnapped = snappedIndex === idx;
                const isActiveTab = activeTab === item.id;
                const Icon = item.icon;
                const isLeave = item.id === "leave";

                return (
                  <motion.div
                    key={item.id}
                    initial={{
                      opacity: 0,
                      scale: 0.2,
                      x: center.x - 20,
                      y: center.y - 20,
                    }}
                    animate={{
                      opacity: 1,
                      scale: isSnapped ? 1.30 : isActiveTab ? 1.10 : 1,
                      x: posX - 20,
                      y: posY - 20,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.2,
                      x: center.x - 20,
                      y: center.y - 20,
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 550,
                      damping: 28,
                      mass: 0.4,
                    }}
                    style={{ willChange: "transform, opacity" }}
                    className={cn(
                      "absolute w-10 h-10 rounded-full flex flex-col items-center justify-center border-none shadow-xl backdrop-blur-md transition-all duration-150 pointer-events-auto cursor-pointer select-none",
                      isLeave
                        ? "bg-red-500/90 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                        : isSnapped
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/50 shadow-[0_0_30px_rgba(168,85,247,0.8)] z-30"
                        : isActiveTab
                        ? "bg-foreground text-background ring-2 ring-primary/40"
                        : "bg-background/90 dark:bg-black/90 text-foreground hover:bg-background"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleItemSelect(item);
                    }}
                  >
                    <Icon className={cn('w-4', 'h-4')} />

                    {/* Unread badge on chat radial menu item */}
                    {item.id === "chat" && unreadChatCount > 0 && (
                      <span className={cn('absolute', '-top-1', '-right-1', 'flex', 'h-4', 'min-w-[16px]', 'px-1', 'items-center', 'justify-center', 'rounded-full', 'bg-pink-500', 'text-white', 'text-[9px]', 'font-black', 'border', 'border-background', 'shadow-md')}>
                        {unreadChatCount}
                      </span>
                    )}

                    {/* Item label under icon */}
                    {/* <span
                      className={cn(
                        "absolute right-8 -top-4 text-[6px] font-extrabold uppercase tracking-wider whitespace-nowrap px-1.5 py-0.5 rounded-full backdrop-blur-md transition-all duration-150 pointer-events-none",
                        isLeave
                          ? "bg-red-600 text-white opacity-100 shadow-md"
                          : isSnapped
                          ? "bg-primary text-white opacity-100 scale-110 shadow-lg"
                          : "bg-background/90 text-foreground/80 opacity-90"
                      )}
                    >
                      {item.label}
                    </span> */}
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
