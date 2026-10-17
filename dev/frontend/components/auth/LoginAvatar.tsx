"use client";

import { motion, useReducedMotion, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * LoginAvatar — a small headphone character that watches the cursor, and gives
 * a thumbs up once you're in.
 *
 * Replaces PhaseField on the login screen. The eyes are the whole point, so
 * they are driven off MotionValues rather than state: a mousemove handler that
 * called setState would re-render this component (and every framer child under
 * it) on every frame of every pointer move, which is exactly the thing that
 * makes a cursor-follower feel heavy.
 *
 * Colour comes from the live `--accent-*` properties, so the avatar drifts
 * through the palette in step with the background — see lib/accent.ts.
 */

/** How far a pupil may travel from centre, in SVG units. Eye r=9, pupil r=4. */
const GAZE = 3.4;

const MOUTH_NEUTRAL = "M 66 102 Q 80 103 94 102";
const MOUTH_SMILE = "M 64 98 Q 80 115 96 98";

const spring = { stiffness: 260, damping: 24, mass: 0.6 };

export function LoginAvatar({ happy = false }: { happy?: boolean }) {
  const reduced = useReducedMotion();
  const hostRef = useRef<HTMLDivElement>(null);

  const px = useSpring(0, spring);
  const py = useSpring(0, spring);
  const [blink, setBlink] = useState(false);

  // Gaze. Measured against the avatar's own centre so it looks at the pointer
  // rather than at a fixed point on the viewport.
  useEffect(() => {
    if (reduced) return;

    const onMove = (e: MouseEvent) => {
      const box = hostRef.current?.getBoundingClientRect();
      if (!box) return;
      const dx = (e.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
      const dy = (e.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
      px.set(Math.max(-1, Math.min(1, dx)) * GAZE);
      py.set(Math.max(-1, Math.min(1, dy)) * GAZE * 0.8);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced, px, py]);

  // Blink. One timer, and only while the eyes are open anyway.
  useEffect(() => {
    if (reduced || happy) return;
    let close: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setBlink(true);
      close = setTimeout(() => setBlink(false), 130);
    }, 4200);
    return () => {
      clearInterval(id);
      clearTimeout(close);
    };
  }, [reduced, happy]);

  return (
    <div ref={hostRef} aria-hidden="true" className="w-28 shrink-0 sm:w-32">
      <motion.svg
        viewBox="0 0 160 160"
        fill="none"
        className="h-auto w-full overflow-visible"
        animate={happy && !reduced ? { y: [0, -11, 0, -5, 0] } : { y: 0 }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Headband + cups: the character is a pair of headphones, which is the
            one object every listener in the room already shares. */}
        <path
          d="M 27 70 Q 80 14 133 70"
          stroke="var(--accent-color)"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <rect x="18" y="64" width="15" height="32" rx="7.5" fill="var(--accent-color)" />
        <rect x="127" y="64" width="15" height="32" rx="7.5" fill="var(--accent-color)" />

        <rect
          x="36"
          y="36"
          width="88"
          height="92"
          rx="27"
          fill="var(--glass-bg)"
          stroke="var(--accent-border)"
          strokeWidth="2.5"
        />

        {/* Eyes. Open eyes and happy arcs are both mounted and crossfaded —
            swapping the elements out would restart the pupil springs. */}
        <motion.g initial={{ opacity: 1 }} animate={{ opacity: happy ? 0 : 1 }} transition={{ duration: 0.22 }}>
          <motion.g
            animate={{ scaleY: blink ? 0.12 : 1 }}
            transition={{ duration: 0.09 }}
            style={{ originY: "76px" }}
          >
            <circle cx="64" cy="76" r="9.5" fill="var(--background)" />
            <circle cx="96" cy="76" r="9.5" fill="var(--background)" />
            <motion.g style={{ x: px, y: py }}>
              <circle cx="64" cy="76" r="4.2" fill="var(--foreground)" />
              <circle cx="96" cy="76" r="4.2" fill="var(--foreground)" />
            </motion.g>
          </motion.g>
        </motion.g>

        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: happy ? 1 : 0 }}
          transition={{ duration: 0.22 }}
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeLinecap="round"
        >
          <path d="M 56 79 Q 64 68 72 79" />
          <path d="M 88 79 Q 96 68 104 79" />
        </motion.g>

        <motion.path
          animate={{ d: happy ? MOUTH_SMILE : MOUTH_NEUTRAL }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Thumbs up, on the way in only. */}
        <motion.g
          initial={false}
          animate={
            happy
              ? { opacity: 1, y: 0, rotate: 0, scale: 1 }
              : { opacity: 0, y: 18, rotate: -30, scale: 0.7 }
          }
          transition={{ type: "spring", stiffness: 380, damping: 18, delay: happy ? 0.16 : 0 }}
          style={{ originX: "128px", originY: "122px" }}
          fill="var(--accent-color)"
        >
          <rect x="118" y="108" width="23" height="21" rx="6.5" />
          <rect x="121" y="94" width="9" height="18" rx="4.5" />
        </motion.g>
      </motion.svg>
    </div>
  );
}
