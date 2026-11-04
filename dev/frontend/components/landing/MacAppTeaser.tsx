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
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
      toast.success("You're on the macOS VIP waitlist! We will notify you when early access drops.");
    }, 500);
  };

  return (
    <section id="mac-app" className="relative z-10 w-full px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-5xl">
        {/* Punchy Title */}
        <div className="flex flex-col items-center text-center">
          <p className="micro-label mb-2 font-mono text-xs font-semibold text-foreground/50 tracking-wider">
            NATIVE MACOS COMPANION · COMING SOON
          </p>

          <h2 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            SyncBeats for Mac.
          </h2>

          <p className="mt-3 text-sm text-foreground/55 max-w-md">
            Broadcast sound directly from desktop apps into your room with CoreAudio precision.
          </p>
        </div>

        {/* Feature Grid & Interactive Mac App Window Mockup */}
        <div className="mt-12 grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
          {/* Interactive Mac App Window Mockup */}
          <div className="relative isolate overflow-hidden rounded-[2.5rem] border border-foreground/15 bg-background/80 p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
            {/* Ambient backlight */}
            <div className="pointer-events-none absolute -left-20 -top-20 -z-10 h-64 w-64 rounded-full bg-(--warm-tint)/30 blur-3xl dark:bg-amber-500/10" />
            <div className="pointer-events-none absolute -bottom-20 -right-20 -z-10 h-64 w-64 rounded-full bg-(--cool-tint)/30 blur-3xl dark:bg-sky-500/10" />

            {/* macOS Window Titlebar */}
            <div className="flex items-center justify-between border-b border-foreground/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e] border border-[#dea123]\" />
                <span className="h-3 w-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                <span className="ml-2 font-mono text-[11px] text-foreground/45">SyncBeats Menubar</span>
              </div>
              <span className="font-mono text-[10px] text-foreground/50 uppercase tracking-wider">
                Apple Silicon
              </span>
            </div>

            {/* Simulated Menu Bar Popover Contents */}
            <div className="mt-4 space-y-3">
              {/* Active Broadcast Source */}
              <div className="flex items-center justify-between rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground/10">
                    <Music2 className="h-4 w-4 text-foreground/80" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">System Audio Output</p>
                    <p className="text-[10px] text-foreground/50">Capturing Spotify / Apple Music / Ableton</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-foreground/5 px-2 py-0.5 font-mono text-[10px] font-semibold text-foreground/75 uppercase tracking-wider">
                  Streaming
                </span>
              </div>

              {/* Connected Room Stats */}
              <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Active Soundstage (4 Speakers)</span>
                  <span className="font-mono text-[10px] text-foreground/50">CoreAudio Drift: 0.1ms</span>
                </div>

                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground/70">
                      <Laptop className="h-3.5 w-3.5" /> MacBook Pro (Host)
                    </span>
                    <span className="font-mono text-[10px] text-foreground/40">Center · 100%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-full bg-foreground" />
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-foreground/70">
                      <Radio className="h-3.5 w-3.5" /> iPhone 15 Pro
                    </span>
                    <span className="font-mono text-[10px] text-foreground/40">Left · 92%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full w-[92%] bg-foreground/80" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Key Specs & Early Access Form */}
          <div className="flex flex-col justify-center space-y-5">
            <div className="space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Sliders className="h-4 w-4 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Menu Bar Resident Control</h3>
                  <p className="text-xs text-foreground/55">Adjust volume, pan, and jitter without switching windows.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Music2 className="h-4 w-4 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">System-Wide Audio Capture</h3>
                  <p className="text-xs text-foreground/55">Stream from Spotify, Apple Music, Ableton, or any app.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/5">
                  <Cpu className="h-4 w-4 text-foreground/70" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">CoreAudio Micro-Latency</h3>
                  <p className="text-xs text-foreground/55">Native sub-10ms synchronization on Apple Silicon.</p>
                </div>
              </div>
            </div>

            {/* Waitlist Capture */}
            <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.025] p-5">
              <div className="flex items-center gap-2 mb-1.5">
                <BellRing className="h-4 w-4 text-foreground/70" />
                <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">Get Beta Access</h4>
              </div>
              <p className="text-xs text-foreground/50 mb-3.5">
                Be the first to download the macOS DMG when early access opens.
              </p>

              {isSubmitted ? (
                <div className="flex items-center gap-2 rounded-xl border border-foreground/15 bg-foreground/5 px-4 py-2.5 text-xs font-semibold text-foreground">
                  <Check className="h-4 w-4" /> You're on the list! We'll email you the DMG download.
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter email for early access"
                    className="flex-1 rounded-xl border border-foreground/15 bg-background px-3.5 py-2.5 text-xs text-foreground outline-none focus:border-foreground/40 placeholder:text-foreground/35"
                  />
                  <DynamicAuroraButton
                    type="submit"
                    disabled={isSubmitting}
                    className="h-10 px-4 text-xs font-semibold shrink-0"
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
