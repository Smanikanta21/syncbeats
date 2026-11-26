"use client";

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAmbientMode } from '../hooks/useAmbientMode';

/** Share the device preference with every background, including page glows. */
export function AppAtmosphereBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode } = useAmbientMode();
  useEffect(() => {
    document.documentElement.dataset.ambientMode = mode;
  }, [mode]);
  return mode === 'off' || pathname?.includes('/room/') ? null : children;
}
