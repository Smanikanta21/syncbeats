"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * CustomCursor — mounted once in the root layout, so it covers every route.
 *
 * A dot that tracks the pointer exactly plus a ring that springs along behind
 * it. Only activates on fine-pointer, hover-capable devices that have not
 * asked for reduced motion.
 *
 * Uses the CSS `--foreground` variable so the cursor is always visible
 * regardless of the current theme — no mix-blend-mode tricks needed.
 * (mix-blend-difference was previously broken because each z-indexed fixed
 * element forms its own stacking context, making the blend invisible.)
 */

const RING = 32;
const DOT  = 7;

const INTERACTIVE = "a, button, [role='button'], [data-cursor='hover'], label, select";

/**
 * Elements where the native cursor provides extra meaning (caret, resize, etc).
 * Over these we fade our dot out and let the browser cursor show through.
 *
 * `[class*=...]` is a substring match, so any class anywhere up the tree that
 * merely *contains* "cursor-" opts that whole subtree out — closest() walks to
 * <html>. Keep the takeover class (`native-pointer-off`) clear of that string.
 */
const NATIVE =
  "input, textarea, [contenteditable='true'], [class*='cursor-']:not([class*='cursor-pointer'])";

/** Class put on <html> to hide the native pointer. Must not match NATIVE. */
const TAKEOVER = "native-pointer-off";

export function CustomCursor() {
  const [enabled,  setEnabled]  = useState(false);
  const [hovering, setHovering] = useState(false);
  const [pressed,  setPressed]  = useState(false);
  const [visible,  setVisible]  = useState(false);

  // Track whether the cursor has moved at all — don't flash before first move
  const hasMoved = useRef(false);

  const x    = useMotionValue(-200);
  const y    = useMotionValue(-200);
  const ringX = useSpring(x, { stiffness: 380, damping: 32, mass: 0.6 });
  const ringY = useSpring(y, { stiffness: 380, damping: 32, mass: 0.6 });

  useEffect(() => {
    // Only replace the native cursor on devices with a real pointer AND
    // hover capability. Touch-primary devices report pointer:fine but no hover.
    const fine    = window.matchMedia("(pointer: fine) and (hover: hover)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    setEnabled(true);
    document.documentElement.classList.add(TAKEOVER);

    // The one failure this has already hit, and which neither tsc nor eslint
    // can see: if TAKEOVER itself matches NATIVE, every closest() below walks
    // up to <html>, finds it, and hides the cursor on every move — forever.
    if (process.env.NODE_ENV !== "production" && document.documentElement.matches(NATIVE)) {
      console.error(
        `[CustomCursor] "${TAKEOVER}" matches the NATIVE opt-out selector, so the ` +
        `cursor will never show. Rename it — NATIVE matches "cursor-" as a substring.`
      );
    }

    const move = (e: PointerEvent) => {
      // Only accept mouse events — ignore touch/pen pointer moves
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      const target = e.target as Element | null;
      const overNative = Boolean(target?.closest?.(NATIVE));
      if (!hasMoved.current) {
        hasMoved.current = true;
        setVisible(!overNative);
      } else {
        setVisible(!overNative);
      }
      setHovering(Boolean(target?.closest?.(INTERACTIVE)));
    };
    const hide = () => setVisible(false);
    const down = () => setPressed(true);
    const up   = () => setPressed(false);

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointerup",   up,   { passive: true });
    document.addEventListener("pointerleave", hide);

    return () => {
      document.documentElement.classList.remove(TAKEOVER);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup",   up);
      document.removeEventListener("pointerleave", hide);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      {/* Trailing ring */}
      <motion.span
        aria-hidden="true"
        style={{
          x: ringX,
          y: ringY,
          width:      RING,
          height:     RING,
          marginLeft: -RING / 2,
          marginTop:  -RING / 2,
          borderColor: "var(--foreground)",
        }}
        animate={{
          scale:   pressed ? 0.72 : hovering ? 1.6 : 1,
          opacity: visible ? (hovering ? 0.85 : 0.45) : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        className="pointer-events-none fixed top-0 left-0 z-[99999] rounded-full border-2"
      />
      {/* Sharp center dot */}
      <motion.span
        aria-hidden="true"
        style={{
          x,
          y,
          width:      DOT,
          height:     DOT,
          marginLeft: -DOT / 2,
          marginTop:  -DOT / 2,
          backgroundColor: "var(--foreground)",
        }}
        animate={{
          scale:   hovering ? 0 : pressed ? 0.5 : 1,
          opacity: visible ? 1 : 0,
        }}
        transition={{ type: "spring", stiffness: 700, damping: 32 }}
        className="pointer-events-none fixed top-0 left-0 z-[99999] rounded-full"
      />
    </>
  );
}
