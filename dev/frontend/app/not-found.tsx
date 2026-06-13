"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Disc } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[30%] -left-[10%] w-[70vw] h-[70vw] bg-foreground/5 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[20%] w-[60vw] h-[60vw] bg-foreground/5 blur-[100px] rounded-full" />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-6 py-8 md:px-12 md:py-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-foreground/10 flex items-center justify-center">
            <Disc className="w-5 h-5 text-foreground animate-[spin_4s_linear_infinite]" />
          </div>
          <span className="text-xl font-black tracking-widest text-foreground">
            SYNC<span className="text-foreground/50">BEATS</span>
          </span>
        </div>
        <div className="flex items-center gap-6">
          <ThemeToggle />
        </div>
      </nav>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto flex flex-col items-center"
        >
          <h1 className="text-8xl md:text-9xl font-black tracking-tighter mb-6">
            404
          </h1>
          <p className="text-xl md:text-2xl text-foreground/60 font-medium mb-12">
            The track you're looking for couldn't be found.
          </p>
          <Link href="/" className="h-14 px-8 flex items-center justify-center gap-2 rounded-2xl bg-foreground text-background text-sm font-black tracking-widest uppercase hover:scale-105 active:scale-95 transition-all">
            <ArrowLeft className="w-4 h-4" /> Go Back Home
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
