export type DockEdge = 'top' | 'right' | 'bottom' | 'left';
export interface Dock { edge: DockEdge; offset: number; }
export interface Point { x: number; y: number; }
export interface Size { width: number; height: number; }
export interface Bounds extends Point, Size {}
export interface Insets { top: number; right: number; bottom: number; left: number; }

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, finite(value, min)));
export const DEFAULT_DOCK: Dock = { edge: 'top', offset: 0.5 };

export function usableBounds(viewport: Bounds, safe: Insets, margin = 12): Bounds {
  const left = Math.max(0, finite(safe.left)) + margin;
  const top = Math.max(0, finite(safe.top)) + margin;
  return {
    x: finite(viewport.x) + left, y: finite(viewport.y) + top,
    width: Math.max(0, finite(viewport.width) - left - Math.max(0, finite(safe.right)) - margin),
    height: Math.max(0, finite(viewport.height) - top - Math.max(0, finite(safe.bottom)) - margin),
  };
}

export function clampPosition(point: Point, size: Size, bounds: Bounds): Point {
  return {
    x: clamp(point.x, bounds.x, bounds.x + bounds.width - size.width),
    y: clamp(point.y, bounds.y, bounds.y + bounds.height - size.height),
  };
}

export function dockPosition(dock: Dock, size: Size, bounds: Bounds): Point {
  const offset = clamp(dock.offset, 0, 1);
  const xRange = Math.max(0, bounds.width - size.width);
  const yRange = Math.max(0, bounds.height - size.height);
  switch (dock.edge) {
    case 'top': return { x: bounds.x + xRange * offset, y: bounds.y };
    case 'bottom': return { x: bounds.x + xRange * offset, y: bounds.y + yRange };
    case 'left': return { x: bounds.x, y: bounds.y + yRange * offset };
    case 'right': return { x: bounds.x + xRange, y: bounds.y + yRange * offset };
  }
}

/** Rectangle-to-edge distance; corner ties keep the previous edge, then use clockwise order. */
export function nearestDock(point: Point, size: Size, bounds: Bounds, previous: DockEdge = 'top'): Dock {
  const position = clampPosition(point, size, bounds);
  const xRange = Math.max(0, bounds.width - size.width);
  const yRange = Math.max(0, bounds.height - size.height);
  const distances: Record<DockEdge, number> = {
    top: position.y - bounds.y,
    right: bounds.x + xRange - position.x,
    bottom: bounds.y + yRange - position.y,
    left: position.x - bounds.x,
  };
  const edges: DockEdge[] = [previous, 'top', 'right', 'bottom', 'left'];
  const edge = edges.reduce((best, candidate) => distances[candidate] < distances[best] - 0.01 ? candidate : best);
  const horizontal = edge === 'top' || edge === 'bottom';
  const range = horizontal ? xRange : yRange;
  const along = horizontal ? position.x - bounds.x : position.y - bounds.y;
  return { edge, offset: range > 0 ? clamp(along / range, 0, 1) : 0.5 };
}

export function expandedPosition(anchor: Point, collapsed: Size, expanded: Size, bounds: Bounds): Point {
  return clampPosition({
    x: anchor.x + (collapsed.width - expanded.width) / 2,
    y: anchor.y + (collapsed.height - expanded.height) / 2,
  }, expanded, bounds);
}

export function isPositionDrag(start: Point, point: Point): boolean {
  return Math.hypot(point.x - start.x, point.y - start.y) >= 8;
}
