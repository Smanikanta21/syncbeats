"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Headphones, Music2, Radio, Smartphone } from "lucide-react";
import { SyncBeatsLogo } from "../brand/SyncBeatsLogo";

const INTRO_COMPLETE_KEY = "syncbeats:intro-complete";

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const slides = [
  {
    eyebrow: "Listen together",
    title: "One song, around the room.",
    description: "Use the phones you already have to make a shared listening space.",
    icon: Music2,
    visual: "devices",
  },
  {
    eyebrow: "Bring devices in",
    title: "Everyone joins the same room.",
    description: "Enter a room code or scan its QR code on each device you want to use.",
    icon: Smartphone,
    visual: "room",
  },
  {
    eyebrow: "Press play",
    title: "Hear it together.",
    description: "SyncBeats keeps playback aligned as your room listens and changes tracks.",
    icon: Radio,
    visual: "sync",
  },
];

function SlideArtwork({ type }: { type: string }) {
  if (type === "devices") {
    return (
      <div className="relative flex h-full min-h-64 items-center justify-center" aria-hidden="true">
        <div className="absolute h-52 w-52 rounded-full border border-foreground/[0.08]" />
        <div className="absolute h-36 w-36 rounded-full border border-foreground/[0.08]" />
        <div className="relative flex items-end gap-3">
          {["Living room", "Your phone", "Kitchen"].map((label, index) => (
            <div key={label} className={`flex w-[4.4rem] flex-col items-center gap-3 ${index === 1 ? "-translate-y-5" : ""}`}>
              <div className="flex h-28 w-[4.4rem] items-center justify-center rounded-[1.35rem] border border-foreground/10 bg-background/60 shadow-[var(--glass-shadow)] backdrop-blur-xl">
                {index === 1 ? <Headphones className="h-5 w-5" /> : <Music2 className="h-5 w-5 text-foreground/55" />}
              </div>
              <span className="text-xs text-foreground/45">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "room") {
    return (
      <div className="flex h-full min-h-64 items-center justify-center" aria-hidden="true">
        <div className="glass-panel w-full max-w-sm rounded-[1.75rem] p-6">
          <div className="mb-7 flex items-center justify-between">
            <span className="text-sm font-medium">Join a room</span>
            <span className="text-xs text-foreground/45">Code or QR</span>
          </div>
          <div className="flex items-center justify-center gap-4">
            <span className="rounded-xl border border-foreground/10 bg-background/50 px-4 py-3 font-mono text-lg tracking-[0.14em]">AB42CD</span>
            <span className="text-xs text-foreground/40">or</span>
            <div className="grid h-12 w-12 grid-cols-3 gap-0.5 rounded-lg border border-foreground/10 p-1.5">
              {Array.from({ length: 9 }, (_, i) => <span key={i} className={`rounded-[2px] ${[0, 2, 3, 5, 7].includes(i) ? "bg-foreground/65" : "bg-foreground/10"}`} />)}
            </div>
          </div>
          <div className="mt-7 border-t border-foreground/[0.08] pt-4 text-xs text-foreground/45">3 devices in the room</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-64 items-center justify-center" aria-hidden="true">
      <div className="absolute h-48 w-48 rounded-full border border-foreground/[0.08]" />
      <div className="absolute h-32 w-32 rounded-full border border-foreground/[0.08]" />
      <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-foreground/10 bg-background/60 shadow-[var(--glass-shadow)] backdrop-blur-xl">
        <Radio className="h-7 w-7" />
      </div>
      <div className="absolute bottom-8 rounded-full border border-foreground/10 bg-background/60 px-4 py-2 text-sm text-foreground/60 backdrop-blur-xl">Playing in sync</div>
    </div>
  );
}

export function IntroSlides() {
  const router = useRouter();
  const [activeSlide, setActiveSlide] = useState(0);
  const slide = slides[activeSlide];
  const SlideIcon = slide.icon;

  useEffect(() => {
    if (isStandaloneApp()) return;
    if (window.localStorage.getItem(INTRO_COMPLETE_KEY) === "true") {
      router.replace("/hub");
    }
  }, [router]);

  function finishIntro() {
    window.localStorage.setItem(INTRO_COMPLETE_KEY, "true");
    router.replace(isStandaloneApp() ? "/room/default" : "/hub");
  }

  function goNext() {
    if (activeSlide === slides.length - 1) {
      finishIntro();
      return;
    }
    setActiveSlide((current) => current + 1);
  }

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background px-5 pb-[max(2rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-[max(2rem,calc(env(safe-area-inset-top,0px)+1rem))] text-foreground sm:px-8">
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link href="/" className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"><SyncBeatsLogo markClassName="h-8 w-8" wordmarkClassName="text-sm" /></Link>
        <button type="button" onClick={finishIntro} className="rounded-full px-3 py-2 text-sm text-foreground/55 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">Skip</button>
      </header>

      <section className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-8 py-8 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:py-12" aria-live="polite">
        <div className="flex flex-col items-start">
          <div className="mb-5 flex items-center gap-2 text-sm font-medium text-foreground/50">
            <SlideIcon className="h-4 w-4" />
            <span>{slide.eyebrow}</span>
          </div>
          <h1 className="max-w-[12ch] text-4xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-6xl">{slide.title}</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-foreground/60 sm:text-lg">{slide.description}</p>

          <div className="mt-9 flex items-center gap-4">
            <button
              type="button"
              onClick={goNext}
              className="flex h-12 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
            >
              {activeSlide === slides.length - 1 ? "Get started" : "Continue"}
              <ArrowRight className="h-4 w-4" />
            </button>
            {activeSlide > 0 && (
              <button type="button" onClick={() => setActiveSlide((current) => current - 1)} className="flex h-11 items-center gap-2 rounded-full px-3 text-sm text-foreground/50 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
          </div>

          <div className="mt-8 flex items-center gap-2" role="group" aria-label={`Slide ${activeSlide + 1} of ${slides.length}`}>
            {slides.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === activeSlide ? "step" : undefined}
                onClick={() => setActiveSlide(index)}
                className={`h-1.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground ${index === activeSlide ? "w-8 bg-foreground" : "w-1.5 bg-foreground/20 hover:bg-foreground/40"}`}
              />
            ))}
            <span className="ml-2 text-xs tabular text-foreground/45">0{activeSlide + 1} / 0{slides.length}</span>
          </div>
        </div>

        <div className="glass-panel min-h-72 overflow-hidden rounded-[2rem] border border-foreground/[0.08] bg-foreground/[0.015] p-4 sm:min-h-96 sm:p-8">
          <SlideArtwork type={slide.visual} />
        </div>
      </section>

      <footer className="relative mx-auto flex w-full max-w-6xl items-center justify-between border-t border-foreground/[0.08] pt-4 text-xs text-foreground/40">
        <span>A little less setup. A lot more together.</span>
        <SyncBeatsLogo markClassName="h-7 w-7" wordmarkClassName="text-xs" />
      </footer>
    </main>
  );
}
