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
  Radio, 
  Sparkles,
  ArrowRight
} from "lucide-react";

interface StepDetail {
  id: "connect" | "queue" | "sync";
  number: "01" | "02" | "03";
  title: string;
  tagline: string;
  summary: string;
  specs: { label: string; value: string }[];
}

const STEPS: StepDetail[] = [
  {
    id: "connect",
    number: "01",
    title: "Instant Handshake",
    tagline: "Zero app downloads. Any browser.",
    summary:
      "Tap 'Start a Free Room' to instantly generate a 6-digit room code or QR code. Guests join in under 3 seconds in Safari, Chrome, Edge, or Firefox. No app stores, no account friction, and no Bluetooth pairing limits.",
    specs: [
      { label: "Platform", value: "iOS, Android, Mac, Windows, Linux" },
      { label: "Connection", value: "Instant WebRTC + WebSocket Handshake" },
      { label: "Setup Time", value: "< 3 seconds with zero accounts" },
    ],
  },
  {
    id: "queue",
    number: "02",
    title: "Unified Audio Bus",
    tagline: "YouTube, Spotify playlists, or local files.",
    summary:
      "Stream any track from YouTube directly inside the room, import public Spotify playlists in one click, or drag-and-drop local lossless FLAC and MP3 files. Anyone granted permission can add to the shared democratic queue.",
    specs: [
      { label: "Catalog", value: "Millions of songs via YouTube Audio" },
      { label: "Importing", value: "1-Click Public Spotify Playlist URL" },
      { label: "Local Files", value: "High-Res FLAC, WAV, AAC, MP3" },
    ],
  },
  {
    id: "sync",
    number: "03",
    title: "Microsecond Clock Lock",
    tagline: "Sub-25ms precision with zero echo.",
    summary:
      "SyncBeats measures round-trip network ping and browser audio buffer delay for every connected device using adaptive NTP bursts. All speakers strike the beat simultaneously, with continuous phase drift correction.",
    specs: [
      { label: "Sync Precision", value: "Sub-25ms (imperceptible to human ear)" },
      { label: "Clock Algorithm", value: "Burst NTP Server Synchronization" },
      { label: "Drift Control", value: "Continuous pitch-neutral phase alignment" },
    ],
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState<"connect" | "queue" | "sync">("connect");
  const [copied, setCopied] = useState(false);
  const [activeSource, setActiveSource] = useState<"youtube" | "spotify" | "local">("youtube");

  const currentStep = STEPS.find((s) => s.id === activeStep) || STEPS[0];

  const handleCopy = () => {
    setCopied(true);
    navigator.clipboard?.writeText("https://syncbeats.in/r/842109");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="how-it-works" className="relative z-10 w-full px-5 py-24 sm:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        {/* Editorial Section Header */}
        <div className="flex flex-col items-center text-center">
          <p className="micro-label mb-3">Architected for pure synchrony</p>
          <h2 className="max-w-[20ch] font-display text-display font-semibold text-balance">
            Three steps from silent to surround sound.
          </h2>
          <p className="mt-5 max-w-[50ch] text-lead text-foreground/60 text-pretty">
            No Bluetooth pairing limits, no app store downloads, and no proprietary speaker lock-in.
          </p>
        </div>

        {/* Connected Interactive Stage Console */}
        <div className="mt-16 overflow-hidden rounded-[2.5rem] border border-foreground/10 bg-foreground/[0.02] shadow-[var(--glass-shadow)] backdrop-blur-2xl">
          {/* Top Step Selector Rail — Sleek horizontal progress bus */}
          <div className="grid grid-cols-1 border-b border-foreground/10 md:grid-cols-3">
            {STEPS.map((step) => {
              const isActive = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step.id)}
                  className={`group relative flex cursor-pointer flex-col p-6 text-left transition-colors sm:p-8 ${
                    isActive
                      ? "bg-foreground/[0.035]"
                      : "hover:bg-foreground/[0.015]"
                  }`}
                >
                  {/* Active highlight top hairline */}
                  {isActive && (
                    <motion.div
                      layoutId="activeStepHairline"
                      className="absolute left-0 right-0 top-0 h-0.5 bg-foreground"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}

                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tracking-widest text-foreground/40">
                      PHASE {step.number}
                    </span>
                    <span className={`text-xs font-semibold ${isActive ? "text-foreground" : "text-foreground/40"}`}>
                      {isActive ? "Active Preview" : "Tap to View"}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-1 text-xs text-foreground/60">
                    {step.tagline}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Master Detail Visual Stage */}
          <div className="grid grid-cols-1 gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:p-12 items-center">
            {/* Left: Explanatory Copy & Architecture Specs */}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-foreground/40 tracking-wider">
                  PHASE {currentStep.number} SPECIFICATION
                </span>
              </div>

              <h4 className="mt-3 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                {currentStep.tagline}
              </h4>

              <p className="mt-4 text-base leading-relaxed text-foreground/70">
                {currentStep.summary}
              </p>

              {/* Technical Spec Matrix */}
              <div className="mt-8 space-y-3 border-t border-foreground/10 pt-6">
                {currentStep.specs.map((sp) => (
                  <div key={sp.label} className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs">
                    <span className="font-medium text-foreground/45">{sp.label}</span>
                    <span className="font-mono font-semibold text-foreground/80">{sp.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Interactive Visual Simulation */}
            <div className="relative rounded-2xl border border-foreground/10 bg-background/70 p-6 shadow-sm backdrop-blur-xl sm:p-8">
              <AnimatePresence mode="wait">
                {activeStep === "connect" && (
                  <motion.div
                    key="connect-view"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5 mb-4">
                      <QrCode className="h-6 w-6 text-foreground/75" />
                    </div>

                    <span className="font-mono text-xs uppercase tracking-widest text-foreground/45">Instant Room PIN</span>
                    
                    {/* 6-digit Code Blocks */}
                    <div className="my-5 flex items-center justify-center gap-2 font-mono text-2xl font-bold tracking-wider sm:gap-3 sm:text-3xl">
                      {["8", "4", "2", "1", "0", "9"].map((digit, idx) => (
                        <div
                          key={idx}
                          className="flex h-12 w-10 sm:h-14 sm:w-12 items-center justify-center rounded-xl border border-foreground/15 bg-background shadow-xs text-foreground"
                        >
                          {digit}
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-foreground/55 max-w-xs">
                      Friends simply open <strong className="text-foreground">syncbeats.in</strong> on any phone and type this code or scan your screen.
                    </p>

                    <button
                      type="button"
                      onClick={handleCopy}
                      className="mt-6 flex items-center gap-2 rounded-xl border border-foreground/15 bg-foreground/5 px-4 py-2.5 text-xs font-semibold text-foreground transition-all hover:bg-foreground/10 active:scale-95"
                    >
                      {copied ? <Check className="h-4 w-4 text-foreground" /> : <Copy className="h-4 w-4" />}
                      <span>{copied ? "Link Copied to Clipboard!" : "Copy Quick Join Link"}</span>
                    </button>
                  </motion.div>
                )}

                {activeStep === "queue" && (
                  <motion.div
                    key="queue-view"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col"
                  >
                    <div className="flex items-center justify-between border-b border-foreground/10 pb-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Music className="h-4 w-4 text-foreground/70" />
                        <span className="text-xs font-semibold text-foreground">Select Music Input</span>
                      </div>
                      <span className="font-mono text-[11px] text-foreground/40">Shared Queue</span>
                    </div>

                    {/* Source Switcher */}
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-foreground/10 bg-background/50 p-1 text-xs">
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
                        Local P2P
                      </button>
                    </div>

                    {/* Source Preview Content */}
                    <div className="mt-5 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4">
                      {activeSource === "youtube" && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 rounded-lg border border-foreground/10 bg-background px-3 py-2 text-xs text-foreground/60">
                            <Search className="h-3.5 w-3.5 text-foreground/40" />
                            <span>Daft Punk — Get Lucky (Official Audio)</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-foreground/50">
                            <span>Status: Ready to Stream</span>
                            <span className="font-mono font-semibold text-foreground/80">Opus 160kbps</span>
                          </div>
                        </div>
                      )}

                      {activeSource === "spotify" && (
                        <div className="space-y-3">
                          <div className="rounded-lg border border-foreground/10 bg-background px-3 py-2 text-xs text-foreground/80 font-mono">
                            https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-foreground/50">
                            <span>Auto-mapped to YouTube audio</span>
                            <span className="font-mono font-semibold text-foreground/80">50 Songs Queued</span>
                          </div>
                        </div>
                      )}

                      {activeSource === "local" && (
                        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-foreground/20 py-6 text-center">
                          <Sparkles className="h-5 w-5 text-foreground/40 mb-1" />
                          <p className="text-xs font-semibold text-foreground">Drop MP3, WAV or FLAC</p>
                          <p className="text-[10px] text-foreground/50 mt-0.5">Streamed over WebRTC peer-to-peer</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeStep === "sync" && (
                  <motion.div
                    key="sync-view"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col"
                  >
                    <div className="flex items-center justify-between border-b border-foreground/10 pb-4 mb-4">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-foreground/70" />
                        <span className="text-xs font-semibold text-foreground">Live Telemetry Phase Meter</span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-foreground/75">
                        Δ 0.3ms AVG
                      </span>
                    </div>

                    {/* Telemetry Devices List */}
                    <div className="space-y-2.5">
                      {[
                        { name: "MacBook Pro", role: "Master Lead Clock", delay: "0.0ms", status: "MASTER" },
                        { name: "Alex's iPhone 15", role: "Compensated Buffer", delay: "+0.2ms", status: "LOCKED" },
                        { name: "Maya's Pixel 8", role: "Compensated Buffer", delay: "+0.4ms", status: "LOCKED" },
                        { name: "Living Room iPad", role: "Compensated Buffer", delay: "+0.1ms", status: "LOCKED" },
                      ].map((dev) => (
                        <div
                          key={dev.name}
                          className="flex items-center justify-between rounded-xl border border-foreground/10 bg-background/50 px-3 py-2 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{dev.name}</p>
                            <p className="text-[10px] text-foreground/45">{dev.role}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-semibold text-foreground/80">{dev.delay}</span>
                            <span className="font-mono text-[10px] font-bold text-foreground/70">
                              {dev.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-lg bg-foreground/5 px-3 py-2 text-[11px] text-foreground/60">
                      <span>NTP Jitter Filter: Active</span>
                      <span className="font-semibold text-foreground">Pitch Neutral Drift Adjustment</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Bottom Fast Action Prompt */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-foreground/10 bg-foreground/[0.015] px-6 py-5">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-foreground/60" />
            <div>
              <p className="text-sm font-semibold text-foreground">Ready to try synchronized playback?</p>
              <p className="text-xs text-foreground/50">Create a test room in your browser in one click.</p>
            </div>
          </div>

          <a
            href="/hub"
            className="flex items-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-xs font-semibold text-background transition-transform hover:-translate-y-0.5"
          >
            Start Room Now
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
