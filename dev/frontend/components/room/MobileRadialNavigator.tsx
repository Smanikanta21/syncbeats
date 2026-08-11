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
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";

export type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat";

export interface MenuItem {
  id: MobileTab | "leave" | "join";
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
    id: "join",
    label: "Join Room",
    sublabel: "Enter 6-Digit Code",
    icon: UserPlus,
    iconName: "UserPlus",
    color: "from-emerald-400 to-teal-400",
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
  onOpenJoinModal?: () => void;
  unreadChatCount?: number;
  className?: string;
}

export function MobileRadialNavigator({
  activeTab,
  onSelectTab,
  onLeaveRoom,
  onOpenJoinModal,
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

  // Arc angles for items in bottom-right quarter circle:
  // Spanning from 92° (pointing straight up) to 182° (pointing left)
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
    } else if (item.id === "join") {
      if (onOpenJoinModal) {
        onOpenJoinModal();
      }
    } else {
      onSelectTab(item.id as MobileTab);
    }
  }, [onLeaveRoom, onOpenJoinModal, onSelectTab, setMenuOpen]);

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
    isDraggingRef.current = true;
    pointerIdRef.current = e.pointerId;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    centerCoordRef.current = getCenterCoord();

    if (!isOpen) {
      setMenuOpen(true);
      if (typeof window !== "undefined" && navigator.vibrate) {
        try {
          navigator.vibrate(20);
        } catch {}
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingRef.current) return;
    processPoint(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
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
      // Released over a snapped item -> select that item/action!
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
      {/* ── Floating Trigger Button ── */}
      <div className={cn("fixed bottom-5 right-5 z-50 md:hidden select-none", className)}>
        <motion.button
          ref={triggerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={() => {
            if (!isDraggingRef.current) {
              setMenuOpen(!isOpen);
            }
          }}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "relative w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-200 cursor-pointer touch-none border-none outline-none",
            isOpen
              ? "bg-foreground text-background ring-4 ring-foreground/20 scale-105"
              : "bg-black/90 text-white border border-white/20 hover:scale-105 shadow-[0_0_25px_rgba(0,0,0,0.6)]"
          )}
          aria-label="Mobile Navigation Menu"
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <X className="w-6 h-6 text-background" />
              </motion.div>
            ) : (
              <motion.div
                key="icon"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="relative"
              >
                <ActiveIcon className="w-6 h-6 text-white" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-pink-500 rounded-full border-2 border-black" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Semi-Circle Radial Gesture Menu Overlay ── */}
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

            {/* Arc Items Rendered in Compact Semi-Circle Arc */}
            <div className={cn('absolute', 'inset-0', 'pointer-events-none')}>
              {MENU_ITEMS.map((item, idx) => {
                const angle = getItemArcAngle(idx, MENU_ITEMS.length);
                const rad = (angle * Math.PI) / 180;
                const radius = 115; // compact radial distance from center

                const posX = center.x + radius * Math.cos(rad);
                const posY = center.y - radius * Math.sin(rad);

                const isSnapped = snappedIndex === idx;
                const isActiveTab = activeTab === item.id;
                const isLeave = item.id === "leave";
                const isJoin = item.id === "join";
                const Icon = item.icon;

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
                      scale: isSnapped ? 1.25 : 1,
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
                        : isJoin
                        ? "bg-emerald-500/90 text-white shadow-[0_0_20px_rgba(16,185,129,0.6)]"
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
