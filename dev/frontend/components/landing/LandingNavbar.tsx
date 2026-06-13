"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Disc, LayoutDashboard } from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";
import { useAuth } from "../../context/AuthContext";

export function LandingNavbar() {
  const { user, loading } = useAuth();

  return (
    <header className="relative z-10 w-full">
      <nav className="flex items-center justify-between px-6 py-8 md:px-12 md:py-10 max-w-7xl mx-auto w-full">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center border border-foreground/10">
            <Disc className="w-5 h-5 text-foreground animate-[spin_4s_linear_infinite]" />
          </div>
          <span className="text-xl font-black tracking-widest text-foreground">
            SYNC<span className="text-foreground/50">BEATS</span>
          </span>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6"
        >
          <ThemeToggle />
          
          {!loading && user ? (
            <Link href="/hub" className="h-10 px-6 flex items-center justify-center gap-2 rounded-xl bg-foreground text-background text-sm font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_5px_20px_rgba(0,0,0,0.15)]">
              <LayoutDashboard className="w-4 h-4" /> Hub
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm font-bold tracking-widest uppercase hover:opacity-70 transition-opacity">
                Login
              </Link>
              <Link href="/login" className="h-10 px-6 hidden sm:flex items-center justify-center rounded-xl bg-foreground text-background text-sm font-bold tracking-widest uppercase hover:scale-105 active:scale-95 transition-all shadow-[0_5px_20px_rgba(0,0,0,0.15)]">
                Get Started
              </Link>
            </>
          )}
        </motion.div>
      </nav>
    </header>
  );
}
