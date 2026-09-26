"use client";

/**
 * world.ts
 *
 * Conversions between the spatial model's polar coordinates and three.js world
 * space, plus the per-user colour derivation. Shared by every mesh in the scene
 * so a device, its riser line and its label all agree on where it is.
 */

import * as THREE from "three";
import { polarToCartesian, type SpatialPosition } from "../../../lib/spatial/geometry";

/** Re-exported so every mesh here keeps importing its colour from one place. */
export { userHue } from "../../../lib/spatial/geometry";

/** One polar radius unit = this many three.js units. */
export const WORLD_SCALE = 1.4;

/**
 * Polar → world. Elevation becomes real height, so a device you raise visibly
 * lifts off the floor instead of silently only affecting the audio.
 *
 * Pass `target` to write into an existing vector — the render loop does, to
 * avoid allocating per frame per device.
 */
export function polarToWorld(
  pos: SpatialPosition,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const c = polarToCartesian(pos, WORLD_SCALE);
  return target.set(c.x, c.y, c.z);
}

/** Invisible floor plane (y = 0) that pointer drags are projected onto. */
export const FLOOR_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
