"use client";

import { useState, useEffect, useRef } from "react";
import { motion, PanInfo, useAnimation, useMotionValue, animate } from "framer-motion";
import { Disc3, LayoutGrid, Music2, Radio, MessageSquare, Menu } from "lucide-react";
import { cn } from "../../lib/utils";
import Magnetic from "../Magnetic";

type MobileTab = "spatial" | "playing" | "devices" | "queue" | "chat";

interface FloatingMobileMenuProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
}

const TABS = [
  { id: "playing", icon: Disc3, label: "Player" },
  { id: "queue", icon: LayoutGrid, label: "Queue" },
  { id: "spatial", icon: Music2, label: "Spatial" },
  { id: "devices", icon: Radio, label: "Devices" },
  { id: "chat", icon: MessageSquare, label: "Chat" },
];

export function FloatingMobileMenu({ activeTab, onChangeTab }: FloatingMobileMenuProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const controls = useAnimation();
  
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const isDragging = useRef(false);
  const lastEdgeX = useRef(typeof window !== "undefined" ? window.innerWidth / 2 - 40 : 150);
  const lastEdgeY = useRef(0);

  const getEdgeForTab = (tabId: MobileTab) => {
    if (typeof window === "undefined") return lastEdgeX.current;
    const index = TABS.findIndex(t => t.id === tabId);
    if (index < 2) return -(window.innerWidth / 2 - 40);
    if (index > 2) return window.innerWidth / 2 - 40;
    return lastEdgeX.current;
  };

  const collapseToEdge = () => {
    setIsExpanded(false);
  };

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isExpanded) {
      timerRef.current = setTimeout(() => {
        lastEdgeX.current = getEdgeForTab(activeTab);
        collapseToEdge();
      }, 3500); // 3.5 seconds inactivity auto-collapse
    }
  };

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isExpanded, activeTab]);

  useEffect(() => {
    if (isExpanded) {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
    } else {
      animate(x, lastEdgeX.current, { type: "spring", stiffness: 400, damping: 30 });
      animate(y, lastEdgeY.current, { type: "spring", stiffness: 400, damping: 30 });
    }
  }, [isExpanded]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    setTimeout(() => { isDragging.current = false; }, 50);
    resetTimer();
    if (isExpanded) {
      if (info.offset.x < -50 || info.velocity.x < -300) {
        lastEdgeX.current = -(window.innerWidth / 2 - 40);
        collapseToEdge();
      } else if (info.offset.x > 50 || info.velocity.x > 300) {
        lastEdgeX.current = window.innerWidth / 2 - 40;
        collapseToEdge();
      } else {
        // Bounce back to center if not swiped far enough
        animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    } else {
      // If it was just a tap (barely moved), let handleIconClick handle the animation
      if (Math.abs(info.offset.x) < 10 && Math.abs(info.offset.y) < 10) {
        return;
      }
      
      // When closed and actually dragged, snap to the nearest edge if dragged to the middle
      if (info.point.x < window.innerWidth / 2) {
        lastEdgeX.current = -(window.innerWidth / 2 - 40);
      } else {
        lastEdgeX.current = window.innerWidth / 2 - 40;
      }
      lastEdgeY.current = y.get();
      animate(x, lastEdgeX.current, { type: "spring", stiffness: 400, damping: 30 });
      animate(y, lastEdgeY.current, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  const pointerDownPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: any) => {
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    resetTimer();
  };

  const handleIconClick = (e: any) => {
    e.stopPropagation();
    const dx = e.clientX - pointerDownPos.current.x;
    const dy = e.clientY - pointerDownPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) return; // ignore if dragged
    
    if (!isExpanded) {
      setIsExpanded(true);
    }
    resetTimer();
  };

  const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon || Menu;

  return (
    <>
      {/* Invisible container defining the safe area constraints for dragging */}
      <div 
        className="fixed inset-0 pointer-events-none z-[990]" 
        ref={constraintsRef} 
      />
      
      <motion.div
        drag={isExpanded ? "x" : true}
        dragConstraints={constraintsRef}
        dragElastic={0.05}
        dragMomentum={true}
        onDragStart={() => { isDragging.current = true; }}
        onDragEnd={handleDragEnd}
        onPointerDownCapture={handlePointerDown}
        animate={isExpanded ? "expanded" : "collapsed"}
        initial="expanded"
        variants={{
          expanded: {
            width: "320px",
            height: "64px",
            borderRadius: "32px",
            opacity: 1,
            backgroundColor: "rgba(var(--background-rgb), 0.85)",
          },
          collapsed: {
            width: "56px",
            height: "56px",
            borderRadius: "28px",
            opacity: 0.6,
            backgroundColor: "rgba(var(--background-rgb), 0.5)",
          }
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(
          "fixed z-[999] backdrop-blur-xl border border-foreground/10 shadow-2xl flex items-center justify-center overflow-hidden touch-none",
          isExpanded ? "px-2" : "px-0"
        )}
        style={{
          x, 
          y,
          bottom: "40px",
          left: 0,
          right: 0,
          margin: "0 auto" // Centered perfectly regardless of width
        }}
      >
        {isExpanded ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex justify-around items-center w-full h-full"
          >
            {TABS.map(tab => (
              <Magnetic key={tab.id}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onChangeTab(tab.id as MobileTab);
                    lastEdgeX.current = getEdgeForTab(tab.id as MobileTab);
                    collapseToEdge();
                  }}
                  className={cn(
                    'relative p-3 rounded-full flex flex-col items-center justify-center transition-all duration-300',
                    activeTab === tab.id ? 'text-emerald-400' : 'text-foreground/50 hover:text-foreground'
                  )}
                >
                  <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "scale-110" : "scale-100")} />
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="mobile-tab-indicator-floating"
                      className="absolute -bottom-1 w-1 h-1 rounded-full bg-emerald-400"
                    />
                  )}
                </button>
              </Magnetic>
            ))}
          </motion.div>
        ) : (
          <motion.button 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full h-full flex items-center justify-center text-foreground"
            onClick={handleIconClick}
          >
            <ActiveIcon className="w-6 h-6" />
          </motion.button>
        )}
      </motion.div>
    </>
  );
}
