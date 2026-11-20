"use client";

import { useEffect } from 'react';

/** Hold the supported screen lock only while playback is active and visible. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let disposed = false;
    let acquiring = false;
    let lock: WakeLockSentinel | null = null;

    const acquire = async () => {
      if (disposed || acquiring || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      acquiring = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (disposed || document.visibilityState !== 'visible') {
          await next.release();
          return;
        }
        lock = next;
        next.addEventListener('release', () => { if (lock === next) lock = null; });
      } catch {
        // Browsers may deny a lock for battery or permission reasons.
      } finally {
        acquiring = false;
      }
    };
    const release = () => {
      const current = lock;
      lock = null;
      if (current && !current.released) void current.release().catch(() => {});
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') void acquire();
      else release();
    };
    const interact = () => { void acquire(); };

    void acquire();
    document.addEventListener('visibilitychange', visibilityChanged);
    document.addEventListener('touchstart', interact, { passive: true });
    document.addEventListener('click', interact, { passive: true });
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', visibilityChanged);
      document.removeEventListener('touchstart', interact);
      document.removeEventListener('click', interact);
      release();
    };
  }, [active]);
}
