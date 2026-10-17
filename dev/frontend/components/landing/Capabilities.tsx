"use client";

/**
 * Capabilities
 *
 * Replaces the GSAP horizontal pin-rail.
 *
 * The rail pinned the section and dragged eight identical cards sideways under
 * the scrollbar. Three problems, in order of how much they cost: a reader on a
 * trackpad had no way to reach card eight except by scrolling the page eight
 * card-widths with nothing else moving; the whole thing needed a second
 * hand-written code path for mobile; and every card was the same size, so
 * nothing on the page said which of the eight mattered.
 *
 * It is a bento now — cells sized by weight. The one claim worth leading with
 * gets an inverted panel twice the size of anything else; the rest are quiet
 * outlines. No GSAP, no pin, no second mobile path: CSS grid collapses to one
 * column on its own. `Capabilities` was the only GSAP consumer outside
 * SmoothScrolling's Lenis bridge.
 *
 * The per-card `hue-rotate` gradient blobs are gone with it. Eight cards each
 * washing the live accent through a different rotation meant the section never
 * agreed with itself about what colour the page was.
 */

import { Globe, Mic2, Radio, Settings2, Share2, Shield, Smartphone } from "lucide-react";

/** `span` is the desktop footprint; everything is one column on a phone. */
const CAPABILITIES = [
  {
    id: "lyrics",
    title: "Lyrics on the beat",
    body: "Words light up line by line as the song plays and step aside through instrumental breaks, time-matched to whatever is on.",
    icon: Mic2,
    span: "lg:col-span-1 lg:row-span-2",
  },
  {
    id: "spatial",
    title: "Spatial routing",
    body: "Drag a person left or right in the devices panel to move their channel. Five phones become a surround rig.",
    icon: Radio,
    span: "lg:col-span-1",
  },
  {
    id: "p2p",
    title: "Peer-to-peer uploads",
    body: "Your local tracks reach the room over WebRTC instead of waiting on a server round trip.",
    icon: Share2,
    span: "lg:col-span-1",
  },
  {
    id: "island",
    title: "One control surface",
    body: "Playback, network readouts, YouTube search and incoming song requests all live in the floating island — reachable from anywhere in the room.",
    icon: Smartphone,
    span: "md:col-span-2 lg:col-span-2",
  },
  {
    id: "sync",
    title: "Headphone delay, dialled out",
    body: "Bluetooth adds latency the browser never reports. Most hardware is detected automatically; the rest you can nudge by ear.",
    icon: Settings2,
    span: "lg:col-span-1",
  },
  {
    id: "private",
    title: "You pick who gets in",
    body: "Lock the room and join requests wait for your approval.",
    icon: Shield,
    span: "lg:col-span-1",
  },
  {
    id: "native",
    title: "Nothing to install",
    body: "A browser is the whole requirement. iPhone, Android, Mac, Windows and Linux all join the same room, and nobody waits on a store review.",
    icon: Globe,
    span: "md:col-span-2 lg:col-span-4",
  },
];

/**
 * A live preview of the synced-lyrics feature: a past line dimmed, the active
 * line sweeping its word-fill (the gradient the real player uses), and the
 * instrumental dots that mark a stretch with no vocals. Pure CSS, so the
 * reduced-motion block in globals.css calms it without a JS branch here.
 */
function LyricsPreview() {
  return (
    <div className="mt-7 rounded-2xl border border-foreground/10 bg-background/40 px-4 py-3.5">
      <p className="text-sm font-semibold leading-tight text-foreground/25">
        Every phone in the room
      </p>
      <p className="lyric-sweep mt-1.5 text-base font-semibold leading-tight">
        on the very same second
      </p>
      <div className="mt-2 flex h-4 items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="lyric-dot h-1.5 w-1.5 rounded-full bg-foreground/60"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function Capabilities() {
  return (
    <section id="features" className="relative z-10 w-full px-5 py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="max-w-[16ch] font-display text-display font-semibold text-balance">
          What you get past the join screen
        </h2>

        <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          {/* The claim the product lives or dies on, so it is the only inverted
              panel on the page and the only one at this size. */}
          <article className="flex flex-col justify-between rounded-3xl bg-foreground p-8 text-background md:col-span-2 md:p-10 lg:row-span-2">
            <p className="font-display text-[clamp(3.5rem,7vw,5.5rem)] font-semibold leading-none tracking-tight">
              25<span className="ml-2 text-[0.3em] align-super font-sans font-medium">ms</span>
            </p>
            <div className="mt-10">
              <h3 className="font-display text-title font-semibold">The number that matters</h3>
              <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-background/65">
                Clock offset is estimated in timed bursts, gated on round-trip time, and taken as
                the median of the good samples. Drift past the threshold is fixed with a 50 ms
                crossfade seek — inaudible, and playback never changes pitch to catch up.
              </p>
            </div>
          </article>

          {CAPABILITIES.map(({ id, title, body, icon: Icon, span }) => (
            <article
              key={id}
              className={`flex flex-col rounded-3xl border border-foreground/10 bg-foreground/2.5 p-7 transition-colors duration-500 hover:border-foreground/25 md:p-8 ${span}`}
            >
              <Icon className="h-5 w-5 text-foreground/35" strokeWidth={1.5} />
              <h3 className="mt-6 font-display text-title font-semibold">{title}</h3>
              <p className="mt-2.5 max-w-[46ch] text-sm leading-relaxed text-foreground/55">
                {body}
              </p>
              {id === "lyrics" && <LyricsPreview />}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
