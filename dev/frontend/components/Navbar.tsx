"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { LogOut, User, X, Menu } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="fixed top-4 sm:top-6 left-4 right-4 md:left-16 md:right-16 lg:left-32 lg:right-32 z-50 flex flex-col items-center pointer-events-none">
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ 
          y: 0, 
          opacity: 1,
          boxShadow: [
            "0px 0px 20px rgba(99, 102, 241, 0.1)", 
            "0px 0px 40px rgba(99, 102, 241, 0.2)", 
            "0px 0px 20px rgba(99, 102, 241, 0.1)"
          ] 
        }}
        transition={{ 
          y: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.8 },
          boxShadow: { duration: 3, repeat: Infinity, ease: "easeInOut" }
        }}
        className={`w-full max-w-5xl glass-panel bg-background/80 backdrop-blur-3xl px-6 md:px-8 py-4 pointer-events-auto shadow-2xl relative transition-all duration-300 ${isOpen ? 'rounded-[2rem]' : 'rounded-full'}`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-2xl font-black tracking-tighter text-foreground">SYNC<span className="text-zinc-500">BEATS</span></Link>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-6">
            <a href="/#how-it-works" className="text-sm font-semibold text-foreground/70 hover:text-foreground transition-colors px-2">Workflow</a>
            <a href="/#features" className="text-sm font-semibold text-foreground/70 hover:text-foreground transition-colors px-2">Features</a>
            
            <div className="h-6 w-px bg-foreground/10 mx-2" />
            
            <ThemeToggle />
            
            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/hub" className="h-10 px-6 flex items-center justify-center rounded-full bg-foreground text-background text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,0,0,0.1)]">
                  Hub
                </Link>
                <button 
                  onClick={logout}
                  className="p-2.5 rounded-full glass-panel hover:bg-red-500/10 text-foreground/70 hover:text-red-500 transition-all active:scale-95"
                  title="Logout"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <Link href="/login" className="h-10 px-6 flex items-center justify-center rounded-full bg-foreground text-background text-sm font-bold hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                Get Started
              </Link>
            )}
          </div>

          {/* Mobile Nav toggle */}
          <div className="md:hidden flex items-center gap-3">
            <ThemeToggle />
            <button 
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-foreground/70 hover:text-foreground transition-colors active:scale-90"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full md:hidden overflow-hidden"
            >
              <div className="flex flex-col gap-4 items-center pt-6 pb-2">
                <a href="/#how-it-works" onClick={() => setIsOpen(false)} className="text-lg font-semibold text-foreground/70 hover:text-foreground transition-colors">Workflow</a>
                <a href="/#features" onClick={() => setIsOpen(false)} className="text-lg font-semibold text-foreground/70 hover:text-foreground transition-colors">Features</a>
                
                <div className="w-full h-px bg-foreground/10" />
                
                {user ? (
                  <div className="w-full flex flex-col gap-3">
                    <Link href="/hub" onClick={() => setIsOpen(false)} className="h-12 w-full flex items-center justify-center rounded-full bg-foreground text-background text-base font-bold active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(0,0,0,0.1)]">
                      Dashboard Hub
                    </Link>
                    <button 
                      onClick={() => { logout(); setIsOpen(false); }}
                      className="h-12 w-full flex items-center justify-center gap-2 rounded-full border border-red-500/20 text-red-500 font-semibold active:scale-[0.98] transition-all"
                    >
                      <LogOut size={18} />
                      Logout
                    </button>
                  </div>
                ) : (
                  <Link href="/login" onClick={() => setIsOpen(false)} className="h-12 w-full flex items-center justify-center rounded-full bg-foreground text-background text-base font-bold active:scale-[0.98] transition-transform shadow-[0_0_20px_rgba(0,0,0,0.1)]">
                    Get Started
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </div>
  );
}
