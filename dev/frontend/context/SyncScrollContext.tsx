"use client";

/**
 * SyncScrollContext
 *
 * The landing page's shared alignment value. AmbientField reads it so the
 * background starts in its resolved state rather than implying fake live drift.
 *
 * Despite the name it is no longer driven by scroll. It used to be — the old
 * LockSequence scrubbed it off 320vh of pinned page — and the hook that did
 * that (`useDriveAlignment`) went with that section. The landing page now keeps
 * a single resolved value for the background field.
 */

import { createContext, useContext } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";

const SyncScrollContext = createContext<MotionValue<number> | null>(null);

export function SyncScrollProvider({ children }: { children: React.ReactNode }) {
  const alignment = useMotionValue(1);

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
