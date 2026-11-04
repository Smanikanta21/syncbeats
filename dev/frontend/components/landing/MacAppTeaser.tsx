"use client";

import { useState } from "react";
import { 
  Laptop, 
  Cpu, 
  Sliders, 
  BellRing, 
  Check, 
  Radio, 
  Music2
} from "lucide-react";
import { toast } from "sonner";
import { DynamicAuroraButton } from "../DynamicAuroraButton";

export function MacAppTeaser() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleWaitlistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    // Simulating save / waitlist capture
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      toast.success("You're on the macOS VIP waitlist! We will notify you the moment the beta drops.");
    }, 600);
  };

  return (
    <section id="mac-app" className="relative z-10 w-full px-5 py-24 sm:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        {/* Top badge & header */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground/5 px-4 py-1.5 text-xs font-semibold tracking-wide text-foreground">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="opacity-75">Coming Soon</span> · Native macOS Companion
          </div>

          <h2 className="max-w-[18ch] font-display text-display font-semibold text-balance">
            SyncBeats for Mac. Native desktop power.
          </h2>

          <p className="mt-5 max-w-[54ch] text-lead text-foreground/60 text-pretty">
            Designed specifically for Apple Silicon and macOS. Broadcast sound from any desktop app, control your listening rooms from the menu bar, and enjoy sub-15ms hardware audio synchronization.
          </p>
        </div>

        {/* Feature Grid & Interactive Mac App Window Mockup */}
        <div className="mt-14 grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          {/* Left: Interactive Mac App Window Mockup */}
          <div className="relative isolate overflow-hidden rounded-[2.5rem] border border-foreground/15 bg-background/80 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
            {/* Ambient backlight */}
            <div className="pointer-events-none absolute -left-20 -top-20 -z-10 h-64 w-64 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/10" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 -z-10 h-64 w-64 rounded-full bg-(--cool-tint)/30 blur-3xl dark:bg-sky-500/10" />

            {/* macOS Window Titlebar */}
            <div className="flex items-center justify-between border-b border-foreground/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                <span className="h-3 w-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                <span className="ml-2 font-mono text-xs text-foreground/40 font-medium">SyncBeats Menubar — v1.0 Preview</span>
              </div>
              <span className="rounded-md bg-foreground/5 px-2 py-0.5 font-mono text-[10px] text-foreground/60 font-semibold">
                Apple Silicon M-Series Native
              </span>
            </div>

            {/* Simulated Menu Bar Popover Contents */}
            <div className="mt-5 space-y-4">
              {/* Active Broadcast Source */}
              <div className="flex items-center justify-between rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/10">
                    <Music2 className="h-5 w-5 text-foreground/80" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">System Audio Broadcast</p>
                    <p className="text-[11px] text-foreground/50">Capturing macOS output: Spotify / Ableton / Browser</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Streaming
                </span>
              </div>

              {/* Connected Room Stats */}
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Connected Speakers (5 Devices)</span>
                  <span className="font-mono text-foreground/50">CoreAudio Drift: 0.1ms</span>
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground/70">
                      <Laptop className="h-3.5 w-3.5" /> MacBook Pro (Master)
                    </span>
                    <span className="font-mono text-[11px] text-foreground/40">Center · 100%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-full bg-foreground" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground/70">
                      <Radio className="h-3.5 w-3.5" /> iPhone 15 Pro (Alex)
                    </span>
                    <span className="font-mono text-[11px] text-foreground/40">Left Ch · 92%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-[92%] bg-foreground/80" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground/70">
                      <Radio className="h-3.5 w-3.5" /> Living Room iPad
                    </span>
                    <span className="font-mono text-[11px] text-foreground/40">Right Ch · 88%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-[88%] bg-foreground/80" />
                  </div>
                </div>
              </div>

              {/* Menu Bar Quick Controls */}
              <div className="flex items-center justify-between rounded-xl bg-foreground/5 px-4 py-3 text-xs">
                <span className="text-foreground/60">Global Room Mute / Spatial Panning</span>
                <span className="font-mono text-[11px] font-semibold text-foreground">⌥ + ⌘ + S</span>
              </div>
            </div>
          </div>

          {/* Right: Key Value Props & Early Access Form */}
          <div className="flex flex-col justify-center space-y-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3.5">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Sliders className="h-4.5 w-4.5 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Menu Bar Resident Control</h3>
                  <p className="mt-0.5 text-sm text-foreground/60 leading-relaxed">
                    Adjust device volumes, toggle spatial placement, and monitor network jitter with one click from your macOS menu bar without switching windows.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Music2 className="h-4.5 w-4.5 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">System-Wide Audio Capture</h3>
                  <p className="mt-0.5 text-sm text-foreground/60 leading-relaxed">
                    Broadcast audio straight from Spotify desktop, Apple Music, Ableton Live, Logic Pro, Traktor DJ, or any browser tab directly to every connected phone.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Cpu className="h-4.5 w-4.5 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">CoreAudio Micro-Latency Engine</h3>
                  <p className="mt-0.5 text-sm text-foreground/60 leading-relaxed">
                    Taps directly into macOS CoreAudio to bypass browser thread contention. Under 10ms hardware sync with virtually zero CPU overhead.
                  </p>
                </div>
              </div>
            </div>

            {/* Waitlist Capture Box */}
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5">
              <div className="flex items-center gap-2 mb-2">
                <BellRing className="h-4 w-4 text-foreground/70" />
                <h4 className="text-sm font-semibold text-foreground">Get Early Access to the macOS Beta</h4>
              </div>
              <p className="text-xs text-foreground/55 mb-4">
                Be the first to download the native DMG when early access opens. No spam, ever.
              </p>

              {isSubmitted ? (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" /> You're on the list! We'll email you the macOS release candidate.
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="flex flex-col gap-2.5 sm:flex-row">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="flex-1 rounded-xl border border-foreground/15 bg-background px-4 py-3 text-xs text-foreground outline-none focus:border-foreground/40 placeholder:text-foreground/35"
                  />
                  <DynamicAuroraButton
                    type="submit"
                    disabled={isSubmitting}
                    className="h-11 px-5 text-xs font-semibold shrink-0"
                  >
                    {isSubmitting ? "Adding..." : "Notify Me"}
                  </DynamicAuroraButton>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
