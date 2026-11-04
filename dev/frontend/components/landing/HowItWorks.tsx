"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  QrCode, 
  Music, 
  Activity, 
  Copy, 
  Check, 
  Search, 
  Sparkles,
  Zap
} from "lucide-react";

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState<"connect" | "queue" | "sync">("connect");
  const [copied, setCopied] = useState(false);
  const [activeSource, setActiveSource] = useState<"youtube" | "spotify" | "local">("youtube");
  const [pingPulse, setPingPulse] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    navigator.clipboard?.writeText("https://syncbeats.in/r/842109");
    setTimeout(() => setCopied(false), 1800);
  };

  const triggerPing = () => {
    setPingPulse(true);
    setTimeout(() => setPingPulse(false), 900);
  };

  return (
    <section id="how-it-works" className="relative z-10 w-full px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Punchy Section Title */}
        <div className="flex flex-col items-center text-center">
          <p className="micro-label mb-2">Simple by design</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Up and playing in seconds.
          </h2>
          <p className="mt-3 text-sm text-foreground/55 max-w-md">
            Test the workflow below. Zero setup, zero app downloads.
          </p>
        </div>

        {/* Interactive Step Switcher Bar */}
        <div className="mt-12 overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-foreground/[0.02] shadow-[var(--glass-shadow)] backdrop-blur-2xl">
          <div className="grid grid-cols-3 border-b border-foreground/10 text-center">
            {[
              { id: "connect", num: "01", label: "Create or Join" },
              { id: "queue", num: "02", label: "Add Music" },
              { id: "sync", num: "03", label: "Test the Sync" },
            ].map((s) => {
              const isActive = activeStep === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveStep(s.id as "connect" | "queue" | "sync")}
                  className={`group relative flex cursor-pointer flex-col items-center py-4 px-2 sm:py-5 transition-colors ${
                    isActive ? "bg-foreground/[0.04]" : "hover:bg-foreground/[0.015]"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="stepTabLine"
                      className="absolute left-0 right-0 top-0 h-0.5 bg-foreground"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="font-mono text-[10px] sm:text-xs font-bold tracking-widest text-foreground/40">
                    STEP {s.num}
                  </span>
                  <span className={`mt-0.5 text-xs sm:text-sm font-semibold tracking-tight ${isActive ? "text-foreground" : "text-foreground/60"}`}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Interactive Playground View */}
          <div className="p-6 sm:p-10 min-h-[300px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {activeStep === "connect" && (
                <motion.div
                  key="connect"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="flex w-full max-w-md flex-col items-center text-center"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5 mb-3">
                    <QrCode className="h-5 w-5 text-foreground/75" />
                  </div>

                  <p className="font-mono text-xs text-foreground/45 uppercase tracking-wider">6-Digit Room Code</p>

                  <div className="my-4 flex items-center justify-center gap-2 font-mono text-2xl font-bold tracking-wider sm:gap-3 sm:text-3xl">
                    {["8", "4", "2", "1", "0", "9"].map((digit, i) => (
                      <div
                        key={i}
                        className="flex h-11 w-9 sm:h-13 sm:w-11 items-center justify-center rounded-xl border border-foreground/15 bg-background shadow-xs text-foreground"
                      >
                        {digit}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-foreground/55">
                    Guests open <strong>syncbeats.in</strong> in Safari or Chrome. No accounts needed.
                  </p>

                  <button
                    type="button"
                    onClick={handleCopy}
                    className="mt-5 flex items-center gap-2 rounded-xl border border-foreground/15 bg-foreground/5 px-4 py-2 text-xs font-semibold text-foreground transition-all hover:bg-foreground/10 active:scale-95"
                  >
                    {copied ? <Check className="h-4 w-4 text-foreground" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? "Link Copied!" : "Copy Quick Join Link"}</span>
                  </button>
                </motion.div>
              )}

              {activeStep === "queue" && (
                <motion.div
                  key="queue"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="flex w-full max-w-md flex-col"
                >
                  <div className="flex items-center justify-between border-b border-foreground/10 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Music className="h-4 w-4 text-foreground/70" />
                      <span className="text-xs font-semibold text-foreground">Select Music Source</span>
                    </div>
                    <span className="font-mono text-[10px] text-foreground/40">Shared Queue</span>
                  </div>

                  {/* 3 Source Tabs */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-foreground/10 bg-background/60 p-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setActiveSource("youtube")}
                      className={`rounded-lg py-1.5 font-medium transition-colors ${
                        activeSource === "youtube"
                          ? "bg-foreground text-background shadow-xs"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                    >
                      YouTube
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSource("spotify")}
                      className={`rounded-lg py-1.5 font-medium transition-colors ${
                        activeSource === "spotify"
                          ? "bg-foreground text-background shadow-xs"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                    >
                      Spotify
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSource("local")}
                      className={`rounded-lg py-1.5 font-medium transition-colors ${
                        activeSource === "local"
                          ? "bg-foreground text-background shadow-xs"
                          : "text-foreground/60 hover:text-foreground"
                      }`}
                    >
                      Local Files
                    </button>
                  </div>

                  {/* Preview Container */}
                  <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 text-center">
                    {activeSource === "youtube" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-xs text-foreground/75">
                          <Search className="h-3.5 w-3.5 text-foreground/40" />
                          <span>Daft Punk — One More Time</span>
                        </div>
                        <p className="text-[11px] text-foreground/50">Streams directly in room at high bitrate</p>
                      </div>
                    )}

                    {activeSource === "spotify" && (
                      <div className="space-y-2">
                        <div className="rounded-lg border border-foreground/10 bg-background px-3 py-2 text-xs text-foreground/80 font-mono truncate">
                          spotify.com/playlist/late-night-vibes
                        </div>
                        <p className="text-[11px] text-foreground/50">Imports entire playlist in 1 click</p>
                      </div>
                    )}

                    {activeSource === "local" && (
                      <div className="py-4">
                        <Sparkles className="mx-auto h-5 w-5 text-foreground/40 mb-1" />
                        <p className="text-xs font-semibold text-foreground">Drop MP3, WAV or FLAC</p>
                        <p className="text-[10px] text-foreground/50 mt-0.5">Streamed peer-to-peer over WebRTC</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeStep === "sync" && (
                <motion.div
                  key="sync"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.25 }}
                  className="flex w-full max-w-md flex-col items-center text-center"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5 mb-3">
                    <Activity className="h-5 w-5 text-foreground/75" />
                  </div>

                  <p className="font-mono text-xs text-foreground/50 uppercase tracking-wider">Sub-25ms Precision</p>

                  {/* Visual Sync Pulse Simulator */}
                  <div className="relative my-4 flex h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-foreground/10 bg-background/60">
                    {/* Simulated Pulse Waves */}
                    {pingPulse && (
                      <motion.div
                        initial={{ scale: 0.2, opacity: 0.8 }}
                        animate={{ scale: 2.2, opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute h-24 w-24 rounded-full border-2 border-foreground"
                      />
                    )}

                    <div className="grid grid-cols-4 gap-3 z-10 w-full px-4">
                      {["Phone 1", "MacBook", "Pixel", "iPad"].map((name, idx) => (
                        <div
                          key={name}
                          className={`flex flex-col items-center justify-center rounded-lg border py-2 transition-all duration-300 ${
                            pingPulse
                              ? "border-foreground bg-foreground text-background scale-105"
                              : "border-foreground/10 bg-foreground/5 text-foreground"
                          }`}
                          style={{ transitionDelay: `${idx * 40}ms` }}
                        >
                          <span className="text-[10px] font-semibold">{name}</span>
                          <span className="font-mono text-[9px] opacity-60">±0.2ms</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={triggerPing}
                    className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-xs font-semibold text-background transition-transform hover:scale-105 active:scale-95 shadow-md"
                  >
                    <Zap className="h-3.5 w-3.5 fill-current" />
                    <span>Fire Sync Ping</span>
                  </button>
                  <p className="mt-2 text-[10px] text-foreground/40">Continuously corrects hardware buffer drift</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
