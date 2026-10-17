"use client";

/**
 * SyncScrollContext
 *
 * The landing page's one shared variable: `alignment`, 0 (clocks adrift) to 1
 * (locked). The WebGL field in AmbientField reads it; SyncRoom is the only
 * writer. Keeping it in one place is what stops the background from disagreeing
 * with the demo in front of it about whether the room is in sync.
 *
 * Despite the name it is no longer driven by scroll. It used to be — the old
 * LockSequence scrubbed it off 320vh of pinned page — and the hook that did
 * that (`useDriveAlignment`) went with that section. Resting state is 1: the
 * room is locked unless something knocks it out.
 *
 * It is a MotionValue rather than state on purpose: SyncRoom writes it every
 * frame, and routing that through React would re-render the whole landing tree
 * at 60 Hz.
 */

import { createContext, useContext, useEffect } from "react";
import { useMotionValue, useReducedMotion, type MotionValue } from "framer-motion";

const SyncScrollContext = createContext<MotionValue<number> | null>(null);

export function SyncScrollProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const alignment = useMotionValue(1);

  useEffect(() => {
    if (reduced) alignment.set(1);
  }, [reduced, alignment]);

  return <SyncScrollContext.Provider value={alignment}>{children}</SyncScrollContext.Provider>;
}

/**
 * Read the shared alignment. Falls back to a standalone MotionValue pinned at 1
 * so components stay usable outside the landing page (e.g. login) without
 * needing the provider.
 */
export function useAlignment(): MotionValue<number> {
  const ctx = useContext(SyncScrollContext);
  const fallback = useMotionValue(1);
  return ctx ?? fallback;
}
