"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { DEFAULT_DOCK, clampPosition, dockPosition, expandedPosition, isPositionDrag, nearestDock, usableBounds,
  type Bounds, type Dock, type Point, type Size } from './geometry';

export function useIslandViewport() {
  const [viewport, setViewport] = useState({
    layoutWidth: 0,
    bounds: { x: 12, y: 28, width: 616, height: 872 } satisfies Bounds,
  });
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)';
    document.body.appendChild(probe);
    const update = () => {
      const visual = window.visualViewport;
      const padding = getComputedStyle(probe);
      const standalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      const safeTop = parseFloat(padding.paddingTop) || 0;
      setViewport({ layoutWidth: window.innerWidth, bounds: usableBounds({
        x: visual?.offsetLeft ?? 0, y: visual?.offsetTop ?? 0,
        width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight,
      }, {
        // iOS home-screen apps with a translucent status bar can report a zero
        // CSS safe inset. Keep the room controls below the clock/status icons.
        top: Math.max(safeTop, standalone ? 56 : 0) + 2, right: parseFloat(padding.paddingRight) || 0,
        bottom: parseFloat(padding.paddingBottom) || 0, left: parseFloat(padding.paddingLeft) || 0,
      }) });
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      probe.remove();
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);
  return viewport;
}

/** Measure the animated border box, so a shrinking right-docked Island stays in view. */
export function useIslandSize(ref: RefObject<HTMLElement | null>, visible: boolean) {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !visible) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      const box = entry.borderBoxSize?.[0];
      const width = box?.inlineSize ?? entry.contentRect.width;
      const height = box?.blockSize ?? entry.contentRect.height;
      setSize(previous => previous?.width === width && previous.height === height ? previous : { width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, visible]);
  return size;
}

/** Position belongs to this wrapper, independently of the Island's shape/scale animations. */
export function useIslandDock(enabled: boolean, expanded: boolean, size: Size, bounds: Bounds) {
  const [dock, setDock] = useState<Dock>(DEFAULT_DOCK);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const collapsedSize = useRef(size);
  const gesture = useRef<{ id: number; start: Point; anchor: Point; moved: boolean; target: HTMLElement } | null>(null);
  const suppressUntil = useRef(0);
  useEffect(() => { if (!expanded) collapsedSize.current = size; }, [expanded, size.width, size.height]);

  const anchor = dockPosition(dock, expanded ? collapsedSize.current : size, bounds);
  const position = dragPoint ? clampPosition(dragPoint, size, bounds)
    : expanded ? expandedPosition(anchor, collapsedSize.current, size, bounds) : anchor;

  const cancel = () => {
    const active = gesture.current;
    if (active?.target.hasPointerCapture(active.id)) active.target.releasePointerCapture(active.id);
    if (active?.moved) suppressUntil.current = Date.now() + 600;
    gesture.current = null;
    setDragPoint(null);
  };

  useEffect(() => { if (!enabled) cancel(); }, [enabled]);

  return {
    dock, position, dragging: dragPoint !== null,
    setDock: (next: Dock) => { cancel(); setDock(next); },
    suppressClick: () => Date.now() < suppressUntil.current,
    start: (event: PointerEvent<HTMLElement>) => {
      if (!enabled || !event.isPrimary || event.button !== 0) return false;
      gesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, anchor: position, moved: false, target: event.currentTarget };
      return true;
    },
    move: (event: PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.id) return false;
      const point = { x: event.clientX, y: event.clientY };
      if (!active.moved && !isPositionDrag(active.start, point)) return false;
      active.moved = true;
      if (!active.target.hasPointerCapture(active.id)) active.target.setPointerCapture(active.id);
      setDragPoint(clampPosition({ x: active.anchor.x + point.x - active.start.x, y: active.anchor.y + point.y - active.start.y }, size, bounds));
      return true;
    },
    end: (event: PointerEvent<HTMLElement>) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.id) return false;
      if (active.moved) {
        const point = { x: active.anchor.x + event.clientX - active.start.x, y: active.anchor.y + event.clientY - active.start.y };
        setDock(nearestDock(point, size, bounds, dock.edge));
      }
      cancel();
      return active.moved;
    },
    cancel,
  };
}
