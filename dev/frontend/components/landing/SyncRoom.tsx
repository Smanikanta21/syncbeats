"use client";

/**
 * SyncRoom
 *
 * Replaces LockSequence.
 *
 * LockSequence pinned 320vh of page to scrub one number from 180 ms down to 25.
 * The reader paid three screens of scroll for a counter, could not get the
 * payoff without scrolling, and could not see it twice without scrolling back.
 * This section is the same idea driven by a real clock instead: five lanes, one
 * reference line, a playhead per device. Locked, the playheads stack into a
 * vertical column on the line. Press the button and one device is thrown
 * ~175 ms out — you watch the column break and then watch the engine pull it
 * back, in about two seconds, as many times as you like.
 *
 * The lanes are written straight to DOM refs from one rAF loop. Routing five
 * positions per frame through React state would re-render the landing tree at
 * 60 Hz for an animation React cannot help with.
 *
 * This section is also the page's only writer of the shared `alignment` value,
 * so the WebGL field behind resolves and smears with the demo rather than with
 * the scrollbar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Headphones, Laptop, Smartphone, Speaker, Tablet } from "lucide-react";

import { useAlignment } from "../../context/SyncScrollContext";

const DEVICES = [
  { name: "Ravi's iPhone", Icon: Smartphone },
  { name: "Living-room laptop", Icon: Laptop },
  { name: "Bluetooth speaker", Icon: Speaker },
  { name: "AirPods Pro", Icon: Headphones },
  { name: "iPad on the table", Icon: Tablet },
];

/** One bar at 100 BPM. The playheads cross the lane in exactly this. */
const BAR_MS = 2400;
/** How far out the knock throws one device — roughly a bad Bluetooth stack. */
const KNOCK_MS = 175;
/** Time constant of the recovery. Visually settled by ~3x this. */
const SETTLE_MS = 620;
/** Residual wander when locked, so the row reads as live rather than frozen. */
const IDLE_MS = 3;

export function SyncRoom() {
  const alignment = useAlignment();
  const reduced = useReducedMotion();

  const laneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const readoutRef = useRef<HTMLSpanElement>(null);

  // Written from event handlers and read from the rAF loop, so they are refs:
  // changing them must not restart the loop.
  const knockAt = useRef(-Infinity);
  const knockLane = useRef(0);
  const [recovering, setRecovering] = useState(false);

  const knock = useCallback(() => {
    knockLane.current = Math.floor(Math.random() * DEVICES.length);
    knockAt.current = performance.now();
    setRecovering(true);
  }, []);

  useEffect(() => {
    if (!recovering) return;
    const t = setTimeout(() => setRecovering(false), SETTLE_MS * 3);
    return () => clearTimeout(t);
  }, [recovering]);

  useEffect(() => {
    // Reduced motion gets the end state: every playhead parked on the line, the
    // readout at its locked value, the field behind fully resolved.
    if (reduced) {
      alignment.set(1);
      laneRefs.current.forEach(el => {
        if (el) el.style.transform = "translate3d(50%, 0, 0)";
      });
      if (readoutRef.current) readoutRef.current.textContent = "3";
      return;
    }

    let raf = 0;
    let lastReadout = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);

      const since = t - knockAt.current;
      // Exponential pull-back, the same shape the real drift correction makes.
      const thrown = since < SETTLE_MS * 4 ? Math.exp(-since / SETTLE_MS) : 0;

      let worst = 0;
      for (let i = 0; i < DEVICES.length; i++) {
        // Deterministic per-lane wander — co-prime-ish periods so the five
        // never line up into one visible shared wobble.
        const idle = Math.sin(t / (870 + i * 190)) * IDLE_MS;
        const drift = idle + (i === knockLane.current ? KNOCK_MS * thrown : 0);
        if (Math.abs(drift) > worst) worst = Math.abs(drift);

        const pos = ((((t + drift) % BAR_MS) + BAR_MS) % BAR_MS) / BAR_MS;
        const lane = laneRefs.current[i];
        // The carrier is the full width of the track, so a percentage translate
        // of its own box is a percentage of the track — transform only, no
        // per-frame layout from writing `left`.
        if (lane) lane.style.transform = `translate3d(${(pos * 100).toFixed(3)}%,0,0)`;

        const row = rowRefs.current[i];
        if (row) row.dataset.adrift = Math.abs(drift) > 12 ? "true" : "false";
      }

      alignment.set(1 - Math.min(1, worst / KNOCK_MS));

      // The eye cannot read a number refreshed at 60 Hz anyway.
      if (t - lastReadout > 90) {
        lastReadout = t;
        if (readoutRef.current) readoutRef.current.textContent = Math.round(worst).toString();
      }
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [reduced, alignment]);

  return (
    <section className="relative z-10 w-full px-5 py-24 md:py-32">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
        <div>
          <h2 className="font-display text-display font-semibold text-balance">
            Everyone hears the same second
          </h2>
          <p className="mt-6 max-w-[42ch] text-lead text-foreground/60 text-pretty">
            Every device works out how far its clock sits from the server, the way NTP does, and
            keeps checking. When one slips — a Bluetooth speaker, a phone that dropped to 3G — it
            is pulled back inside a couple of seconds.
          </p>

          <button
            type="button"
            onClick={knock}
            className="mt-9 inline-flex items-center gap-3 rounded-full border border-foreground/15 px-6 py-3.5 text-sm font-semibold transition-colors hover:border-(--accent-border) hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-(--accent-color)"
          >
            <span
              className="h-1.5 w-1.5 rounded-full transition-colors"
              style={{ background: recovering ? "var(--accent-color)" : "currentColor" }}
            />
            {recovering ? "Pulling it back" : "Knock a device out of sync"}
          </button>
          <p aria-live="polite" className="sr-only">
            {recovering ? "A device drifted. The engine is correcting it." : "All devices locked."}
          </p>
        </div>

        {/* ---- The room ---- */}
        <div className="glass-panel rounded-[1.75rem] border border-foreground/10 p-5 sm:p-7">
          <div className="mb-6 flex items-end justify-between gap-4">
            <p className="text-sm text-foreground/50">5 devices in the room</p>
            <p className="flex items-baseline gap-1.5">
              <span className="text-sm text-foreground/50">worst drift</span>
              <span
                ref={readoutRef}
                className="font-mono text-2xl font-semibold tabular-nums text-(--accent-color)"
              >
                3
              </span>
              <span className="text-sm text-foreground/40">ms</span>
            </p>
          </div>

          <div className="relative">
            {/* The reference instant. A device sitting on it is on time; the
                whole demo is whether the five dots form a column here. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
              style={{ background: "var(--accent-gradient)", opacity: 0.55 }}
            />

            <ul className="space-y-1">
              {DEVICES.map(({ name, Icon }, i) => (
                <li
                  key={name}
                  ref={el => {
                    rowRefs.current[i] = el;
                  }}
                  data-adrift="false"
                  className="group grid grid-cols-[1.1rem_minmax(0,1fr)] items-center gap-3 py-2.5 sm:grid-cols-[1.1rem_9.5rem_minmax(0,1fr)]"
                >
                  <Icon className="h-4 w-4 text-foreground/35 transition-colors group-data-[adrift=true]:text-(--accent-color)" />
                  <span className="hidden truncate text-sm text-foreground/55 sm:block">
                    {name}
                  </span>

                  <div className="relative h-5">
                    <span
                      aria-hidden
                      className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-foreground/10"
                    />
                    <div
                      ref={el => {
                        laneRefs.current[i] = el;
                      }}
                      className="absolute inset-y-0 left-0 w-full will-change-transform"
                    >
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground transition-[box-shadow,background-color] duration-300 group-data-[adrift=true]:bg-(--accent-color) group-data-[adrift=true]:shadow-[0_0_14px_var(--accent-glow)]"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ---- The three steps. A real sequence, so it is numbered. ---- */}
      <ol className="mx-auto mt-24 grid w-full max-w-6xl gap-px overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/10 md:mt-32 md:grid-cols-3">
        {[
          {
            n: "1",
            t: "Open a room",
            d: "One tap. Upload tracks or pull them from YouTube. No account needed to listen.",
          },
          {
            n: "2",
            t: "Share the code",
            d: "Six characters, or a QR code. Anything with a browser can join — phone, laptop, tablet.",
          },
          {
            n: "3",
            t: "Press play",
            d: "Every device starts on the same scheduled instant and holds there for the whole song.",
          },
        ].map(s => (
          <li key={s.n} className="bg-background/80 p-7 backdrop-blur-sm md:p-9">
            <span className="font-mono text-sm text-foreground/30">{s.n}</span>
            <h3 className="mt-5 font-display text-title font-semibold">{s.t}</h3>
            <p className="mt-2.5 max-w-[34ch] text-sm leading-relaxed text-foreground/55">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
