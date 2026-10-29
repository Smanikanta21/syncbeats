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
 * gets a panel twice the size of anything else; the rest stay transparent
 * until hovered. No GSAP, no pin, no second mobile path: CSS grid collapses to one
 * column on its own. On touch layouts, one card fills as it enters the center
 * of the viewport; pointer devices keep the magnetic fill. `Capabilities` was
 * the only GSAP consumer outside SmoothScrolling's Lenis bridge.
 *
 * The per-card `hue-rotate` gradient blobs are gone with it. Eight cards each
 * washing the live accent through a different rotation meant the section never
 * agreed with itself about what colour the page was.
 */

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
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
      <p className="magnetic-fill-secondary text-sm font-semibold leading-tight text-foreground/35 transition-colors duration-300">
        Every phone in the room
      </p>
      <p className="lyric-sweep mt-1.5 text-base font-semibold leading-tight">
        on the very same second
      </p>
      <div className="mt-2 flex h-4 items-center gap-2" aria-hidden="true">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className="lyric-dot h-1.5 w-1.5 rounded-full bg-foreground/60 transition-colors duration-300"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export function Capabilities() {
  const reducedMotion = useReducedMotion();
  const deckRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const fillTimers = useRef(new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>());
  const activeIndexRef = useRef(-1);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [scrollDirection, setScrollDirection] = useState<"forward" | "backward">("forward");

  useEffect(() => {
    const deck = deckRef.current;
    const grid = cardsRef.current;
    if (!deck || !grid) return;

    const mobileLayout = window.matchMedia("(max-width: 767px)");
    const cards = Array.from(grid.querySelectorAll<HTMLElement>(".magnetic-fill-card"));
    let previousScrollY = window.scrollY;
    const activateCard = (index: number) => {
      const boundedIndex = Math.max(0, Math.min(cards.length - 1, index));
      if (activeIndexRef.current === boundedIndex) return;
      activeIndexRef.current = boundedIndex;
      setActiveIndex(boundedIndex);
      cards.forEach((card, cardIndex) => {
        if (cardIndex === boundedIndex) card.dataset.scrollActive = "true";
        else delete card.dataset.scrollActive;
      });
    };

    const syncActiveCard = (scrollDelta = 0) => {
      if (!mobileLayout.matches) {
        activeIndexRef.current = -1;
        setActiveIndex(-1);
        cards.forEach(card => delete card.dataset.scrollActive);
        return;
      }

      const rail = deck.getBoundingClientRect();
      // Computed style resolves the CSS `max()` sticky offset to pixels, unlike
      // the stage's current rect which moves with the page before it sticks.
      const stickyTop = parseFloat(getComputedStyle(grid).top) || 0;
      const deckIsPassing = rail.top <= stickyTop && rail.bottom >= stickyTop + grid.offsetHeight;
      if (!deckIsPassing) {
        activeIndexRef.current = -1;
        setActiveIndex(-1);
        cards.forEach(card => delete card.dataset.scrollActive);
        return;
      }

      if (scrollDelta > 0) setScrollDirection("forward");
      else if (scrollDelta < 0) setScrollDirection("backward");

      // Tie the active card to the rail's actual travel, rather than trying to
      // infer discrete gestures from scroll events. Lenis can emit a continuous
      // stream of tiny deltas; progress keeps the deck moving during that stream
      // and makes reversing direction restore the card under the same position.
      const travel = Math.max(1, deck.offsetHeight - grid.offsetHeight);
      const progress = Math.max(0, Math.min(0.999999, (stickyTop - rail.top) / travel));
      activateCard(Math.floor(progress * cards.length));
    };

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - previousScrollY;
        previousScrollY = currentScrollY;
        syncActiveCard(scrollDelta);
      });
    };
    const onMediaLayoutChange = () => {
      previousScrollY = window.scrollY;
      syncActiveCard();
    };

    syncActiveCard();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    mobileLayout.addEventListener("change", onMediaLayoutChange);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      mobileLayout.removeEventListener("change", onMediaLayoutChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function setFillOrigin(event: React.PointerEvent<HTMLElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;

    const card = event.currentTarget;
    const pendingFade = fillTimers.current.get(card);
    if (pendingFade) clearTimeout(pendingFade);
    card.dataset.lit = "true";
    card.style.setProperty("--fill-duration", "420ms");
    const bounds = card.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const radius = Math.ceil(Math.max(
      Math.hypot(localX, localY),
      Math.hypot(bounds.width - localX, localY),
      Math.hypot(localX, bounds.height - localY),
      Math.hypot(bounds.width - localX, bounds.height - localY),
    ) + 12);
    card.style.setProperty("--fill-x", `${localX}px`);
    card.style.setProperty("--fill-y", `${localY}px`);
    card.style.setProperty("--fill-radius", `${radius}px`);
    moveMagnetically(event);
  }

  function moveMagnetically(event: React.PointerEvent<HTMLElement>) {
    if (reducedMotion || event.pointerType !== "mouse") return;

    const card = event.currentTarget;
    const bounds = card.getBoundingClientRect();
    const localX = event.clientX - bounds.left;
    const localY = event.clientY - bounds.top;
    const x = Math.max(-5, Math.min(5, (localX - bounds.width / 2) * 0.025));
    const y = Math.max(-5, Math.min(5, (localY - bounds.height / 2) * 0.025));
    card.style.setProperty("--magnet-x", `${x}px`);
    card.style.setProperty("--magnet-y", `${y}px`);
  }

  function releaseMagnetically(event: React.PointerEvent<HTMLElement>) {
    const card = event.currentTarget;
    card.style.setProperty("--magnet-x", "0px");
    card.style.setProperty("--magnet-y", "0px");
    if (event.pointerType !== "mouse") return;

    const pendingFade = fillTimers.current.get(card);
    if (pendingFade) clearTimeout(pendingFade);
    const timer = setTimeout(() => {
      card.style.setProperty("--fill-duration", "1000ms");
      delete card.dataset.lit;
      fillTimers.current.delete(card);
    }, 500);
    fillTimers.current.set(card, timer);
  }

  const magneticStyle = {
    transform: "translate3d(var(--magnet-x, 0px), var(--magnet-y, 0px), 0)",
  };

  function cardStyle(index: number): React.CSSProperties {
    if (activeIndex < 0) return magneticStyle;
    const distance = index - activeIndex;
    if (distance === 0) {
      return {
        transform: "translate3d(var(--magnet-x, 0px), var(--magnet-y, 0px), 0)",
        opacity: 1,
        zIndex: 30,
      };
    }

    const isSwipedAway = scrollDirection === "forward" ? distance < 0 : distance > 0;
    if (isSwipedAway) {
      const swipeX = scrollDirection === "forward" ? "-118%" : "118%";
      const tilt = scrollDirection === "forward" ? "-8deg" : "8deg";
      return {
        transform: `translate3d(var(--magnet-x, 0px), var(--magnet-y, 0px), 0) translateX(${swipeX}) rotate(${tilt}) scale(0.94)`,
        opacity: 0,
        zIndex: 40,
        pointerEvents: "none",
      };
    }

    const depth = Math.abs(distance);
    const offsetY = Math.min(depth, 2) * 22;
    return {
      transform: `translate3d(var(--magnet-x, 0px), var(--magnet-y, 0px), 0) translateY(${offsetY}px) scale(${distance > 0 ? 1 + Math.min(depth, 2) * 0.025 : 1 - Math.min(depth, 2) * 0.025})`,
      opacity: depth > 2 ? 0 : 1,
      zIndex: depth === 0 ? 20 : 10 - depth,
    };
  }

  return (
    <section id="features" className="relative z-10 w-full px-5 py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="max-w-[16ch] font-display text-display font-semibold text-balance">
          What you get past the join screen
        </h2>

        <div ref={deckRef} className="capability-deck-rail mt-12">
        <div ref={cardsRef} className="capability-card-stack grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-4">
          <article
            onPointerEnter={setFillOrigin}
            onPointerMove={moveMagnetically}
            onPointerLeave={releaseMagnetically}
            style={cardStyle(0)}
            className="magnetic-fill-card relative isolate flex flex-col justify-between rounded-3xl border border-foreground/10 bg-transparent p-8 text-foreground transition-[color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:col-span-2 md:p-10 lg:row-span-2"
          >
            <p className="font-display text-[clamp(3.5rem,7vw,5.5rem)] font-semibold leading-none tracking-tight transition-colors duration-300">
              25<span className="ml-2 text-[0.3em] align-super font-sans font-medium">ms</span>
            </p>
            <div className="mt-10">
              <h3 className="font-display text-title font-semibold">The number that matters</h3>
              <p className="magnetic-fill-secondary mt-3 max-w-[40ch] text-sm leading-relaxed text-foreground/65 transition-colors duration-300">
                Clock offset is estimated in timed bursts, gated on round-trip time, and taken as
                the median of the good samples. Drift past the threshold is fixed with a 50 ms
                crossfade seek — inaudible, and playback never changes pitch to catch up.
              </p>
            </div>
          </article>

          {CAPABILITIES.map(({ id, title, body, icon: Icon, span }, index) => (
            <article
              key={id}
              onPointerEnter={setFillOrigin}
              onPointerMove={moveMagnetically}
              onPointerLeave={releaseMagnetically}
              style={cardStyle(index + 1)}
              className={`magnetic-fill-card relative isolate flex flex-col rounded-3xl border border-foreground/10 bg-transparent p-7 text-foreground transition-[color,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:p-8 ${span}`}
            >
              <Icon className="magnetic-fill-icon h-5 w-5 text-foreground/45 transition-colors duration-300" strokeWidth={1.5} />
              <h3 className="mt-6 font-display text-title font-semibold">{title}</h3>
              <p className="magnetic-fill-secondary mt-2.5 max-w-[46ch] text-sm leading-relaxed text-foreground/60 transition-colors duration-300">
                {body}
              </p>
              {id === "lyrics" && <LyricsPreview />}
            </article>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}
