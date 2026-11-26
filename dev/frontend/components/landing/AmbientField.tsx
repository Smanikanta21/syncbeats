"use client";

/**
 * Landing-page atmosphere: slow, soft blobs on every device tier. The old
 * orbital shader read as a planet graphic and competed with the product story.
 * The room has its own beat-responsive visualizer; the landing needs only a
 * quiet, low-cost sense of movement.
 */

import { useReducedMotion } from "framer-motion";
import { AccentEngine } from "./AccentEngine";

export function AmbientField() {
  const reduced = useReducedMotion();
  return <AccentEngine reduced={!!reduced} />;
}
