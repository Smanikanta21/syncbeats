"use client";

/**
 * Hero
 *
 * Leads with a headline and the room code, over the full-bleed WebGL field.
 *
 * The headline animates on its own `wdth` axis rather than off scroll: it is
 * above the fold, so there is no scroll to read yet. Narrow-to-normal on mount
 * is the same "adrift settling into lock" gesture SyncRoom makes.
 *
 * The `sr-only` keyword paragraph that used to sit at the top of this component
 * is gone. It was ~90 words of text visible only to crawlers, closing on "the
 * best AmpMe and BeatSync alternative" — the hidden-text pattern Google's spam
 * policies name outright. Everything it claimed now appears as readable copy in
 * SyncRoom, Capabilities and FAQ, which is where a crawler would rather find it
 * anyway.
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import { RoomCodeEntry } from "./RoomCodeEntry";

const LINE = {
  hidden: { opacity: 0, y: 24, fontStretch: "75%" },
  shown: { opacity: 1, y: 0, fontStretch: "100%" },
};

export function Hero() {
  return (
    <section className="relative z-10 flex min-h-dvh w-full shrink-0 flex-col items-center justify-center px-5 pt-28 pb-20 md:py-24">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-7 flex items-center gap-2.5 text-sm text-foreground/50"
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--accent-color)" }}
          />
          Synchronised playback, in the browser
        </motion.p>

        <h1 className="font-display text-hero font-semibold text-balance">
          <motion.span
            className="block"
            variants={LINE}
            initial="hidden"
            animate="shown"
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          >
            One track.
          </motion.span>
          <motion.span
            className="block"
            variants={LINE}
            initial="hidden"
            animate="shown"
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.28 }}
          >
            Every phone.
          </motion.span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-7 max-w-xl text-lead text-foreground/60 text-pretty"
        >
          Every device in the room becomes a speaker, locked to the same clock and held
          there — under 25&nbsp;ms apart, with nothing to install.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.64 }}
          className="mt-10 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
        >
          <RoomCodeEntry />

          <span className="hidden text-sm text-foreground/35 sm:block">or</span>

          <Link
            href="/hub"
            className="group flex items-center justify-center gap-2 rounded-2xl border border-foreground/10 bg-foreground px-6 py-4 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
          >
            Start a room
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.1 }}
        className="pointer-events-none absolute bottom-7 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2.5"
      >
        <span className="text-xs text-foreground/35">Watch it lock</span>
        <span className="block h-9 w-px bg-linear-to-b from-foreground/30 to-transparent" />
      </motion.div>
    </section>
  );
}
