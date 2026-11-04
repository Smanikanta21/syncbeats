"use client";

import { motion } from "framer-motion";
import { QrCode, Music, Clock } from "lucide-react";

const STEPS = [
  {
    step: "01",
    icon: QrCode,
    title: "Create or Join a Room",
    subtitle: "Zero installation required",
    description:
      "Open SyncBeats in Safari, Chrome, Edge, or Firefox. Tap 'Start a Room' to generate a 6-digit room code or QR code. Guests join in seconds without downloading an app or setting up an account.",
    callout: "Instant QR & Link Share",
  },
  {
    step: "02",
    icon: Music,
    title: "Add Your Favorite Music",
    subtitle: "YouTube, Spotify playlists, or local files",
    description:
      "Search and queue millions of songs via YouTube directly inside your room, import entire public Spotify playlists, or drag-and-drop your own local MP3 and lossless audio tracks.",
    callout: "Multi-Source Shared Queue",
  },
  {
    step: "03",
    icon: Clock,
    title: "Experience Microsecond Sync",
    subtitle: "Under 25ms hardware alignment",
    description:
      "When you press play, SyncBeats measures the round-trip network time and browser audio buffer of every connected device. All speakers strike the beat simultaneously with continuous drift recovery.",
    callout: "Adaptive NTP Engine",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative z-10 w-full px-5 py-24 sm:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <p className="micro-label mb-3">Simple by design</p>
          <h2 className="max-w-[16ch] font-display text-display font-semibold text-balance">
            Up and playing in three simple steps.
          </h2>
          <p className="mt-5 max-w-[48ch] text-lead text-foreground/60 text-pretty">
            No Bluetooth pairing nightmares, no app store downloads, and no proprietary speaker ecosystems.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {STEPS.map((s, index) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: index * 0.12 }}
                className="relative flex flex-col justify-between rounded-3xl border border-foreground/10 bg-foreground/[0.025] p-7 sm:p-8"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tracking-widest text-foreground/40">
                      STEP {s.step}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-foreground/10 bg-background/80">
                      <Icon className="h-5 w-5 text-foreground/70" />
                    </div>
                  </div>

                  <h3 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-1 text-xs font-medium text-foreground/75">
                    {s.subtitle}
                  </p>

                  <p className="mt-4 text-sm leading-relaxed text-foreground/60">
                    {s.description}
                  </p>
                </div>

                <div className="mt-6 border-t border-foreground/10 pt-4">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-foreground/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/40" />
                    {s.callout}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
