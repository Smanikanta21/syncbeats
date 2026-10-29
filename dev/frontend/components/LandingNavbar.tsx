"use client";

import { motion, AnimatePresence, useScroll, useMotionValueEvent } from "framer-motion";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import Magnetic from "./Magnetic";
import { DynamicAuroraButton } from "./DynamicAuroraButton";
import { SyncBeatsMark } from "./brand/SyncBeatsLogo";

export function LandingNavbar() {
  const { user } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest > 80 && !isScrolled) setIsScrolled(true);
    else if (latest <= 80 && isScrolled) setIsScrolled(false);
  });

  return (
    <div 
      className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none px-3 sm:px-0"
      style={{
        top: "max(calc(0.75rem + 2px), calc(env(safe-area-inset-top, 0px) + 2px))",
      }}
    >
      <motion.header 
        initial={false}
        animate={{
          width: isScrolled ? "min(calc(100% - 24px), 1024px)" : "100%",
          paddingLeft: isScrolled ? "16px" : "20px",
          paddingRight: isScrolled ? "16px" : "20px",
          paddingTop: "10px",
          paddingBottom: "10px",
          borderRadius: isScrolled ? "9999px" : "0px",
        }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className={`pointer-events-auto flex items-center justify-between transition-all duration-300 ${isScrolled ? 'glass-panel shadow-xl' : 'bg-transparent border-transparent'}`}
      >
      <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="flex items-center">
        <Link href="/" className="font-display text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground group flex items-center gap-2.5">
          <SyncBeatsMark className={`${isScrolled ? "h-[26px] w-[26px]" : "h-8 w-8"} group-hover:scale-110 block transition-all duration-300 rounded-lg overflow-hidden`} />
          <span>SyncBeats</span>
        </Link>
      </motion.div>

      <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="flex items-center gap-2 sm:gap-3 md:gap-4">
        {user ? (
          <Magnetic>
            <DynamicAuroraButton href="/hub" className={`${isScrolled ? 'h-9 px-4 text-[11px] sm:text-xs' : 'h-11 px-6 text-xs md:text-sm'}`}>
              Launch App
            </DynamicAuroraButton>
          </Magnetic>
        ) : (
          <>
          <Link href="/login" className={`hidden sm:flex ${isScrolled ? 'h-9 px-3' : 'h-11 px-4 sm:px-6'} rounded-full items-center justify-center text-data font-semibold text-foreground/70 hover:text-foreground hover:border-(--accent-border) border border-transparent transition-all duration-300`}>
            Login
          </Link>
          <Magnetic>
            <DynamicAuroraButton href="/hub" className={`${isScrolled ? 'h-9 px-4 text-[11px] sm:text-xs' : 'h-11 px-6 text-xs md:text-sm'}`}>
              Open SyncBeats
            </DynamicAuroraButton>
          </Magnetic>
          </>
        )}
        <AnimatePresence>
          {isScrolled && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: "auto" }}
              exit={{ opacity: 0, scale: 0.5, width: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden flex rounded-full items-center"
            >
              <ThemeToggle />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      </motion.header>
    </div>
  );
}
