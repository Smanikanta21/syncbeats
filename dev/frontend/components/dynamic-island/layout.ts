import type { Bounds } from './geometry';

export const ISLAND_HEADER_HEIGHT = 48;
export const EXTENDED_ACTIVITY_HEIGHT = 72;
export const EXTENDED_PLAYER_HEIGHT = 52;

/** Keep the panel inside the usable viewport, including a keyboard or safe area. */
export function expandedPanelSize(bounds: Bounds, tab: string, bodyHeight: number) {
  const widthLimit = tab === 'search' ? 520 : tab === 'player' ? 400 : 420;
  const heightLimit = tab === 'search' ? 620 : tab === 'player' ? 420 : 480;
  const maxHeight = Math.max(1, Math.min(heightLimit, bounds.height));
  const headerHeight = Math.min(ISLAND_HEADER_HEIGHT, maxHeight);
  const measuredBody = Number.isFinite(bodyHeight) ? Math.max(0, bodyHeight) : 0;
  return {
    width: Math.max(1, Math.min(widthLimit, bounds.width)),
    height: Math.min(maxHeight, headerHeight + measuredBody),
    headerHeight,
  };
}

/** Background work never competes with foreground progress for the same space. */
export function showBackgroundProgress(options: {
  prefetching: boolean;
  expanded: boolean;
  foregroundBusy: boolean;
  searchBusy: boolean;
  gestureActive: boolean;
}) {
  return options.prefetching && !options.expanded && !options.foregroundBusy
    && !options.searchBusy && !options.gestureActive;
}
