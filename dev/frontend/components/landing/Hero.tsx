"use client";

import Link from "next/link";
import { ArrowRight, Headphones } from "lucide-react";
import { motion } from "framer-motion";
import { RoomCodeEntry } from "./RoomCodeEntry";
import { ListeningScene } from "../brand/ListeningScene";

export function Hero() {
  return (
    <section className="relative z-10 flex min-h-[min(900px,100svh)] w-full items-center px-5 pb-16 pt-24 sm:px-8 sm:pb-20 lg:px-12 lg:pt-28">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] lg:gap-14 xl:gap-20">
        <div className="relative z-10">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mb-5 flex items-center gap-2.5 text-sm font-medium text-foreground/55">
            <Headphones className="h-4 w-4" />Shared listening, in sync
          </motion.p>

          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="max-w-[11ch] font-display text-hero font-semibold text-balance">
            One track. Every speaker.
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.12 }} className="mt-6 max-w-[44ch] text-lead text-foreground/60 text-pretty">
            Turn the phones around you into one shared sound system. Open a room, invite your people, and press play.
          </motion.p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <RoomCodeEntry className="w-full sm:w-auto" />
            <span className="hidden text-sm text-foreground/35 sm:block">or</span>
            <Link href="/hub" className="group flex h-14 items-center justify-center gap-2 rounded-2xl bg-foreground px-5 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
              Start a room<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <p className="mt-5 text-sm text-foreground/45">Free to use · Nothing to install · Works in your browser</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }} className="w-full">
          <ListeningScene />
        </motion.div>
      </div>
    </section>
  );
}
