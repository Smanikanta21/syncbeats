import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reactive `matchMedia`, for the cases where a Tailwind `hidden md:block` is not
 * enough — a `display:none` subtree is still mounted, and a WebGL canvas in one
 * keeps rendering.
 *
 * SSR snapshot is `false`: there is no way to know the viewport on the server,
 * and guessing means a hydration mismatch every time the guess is wrong.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
