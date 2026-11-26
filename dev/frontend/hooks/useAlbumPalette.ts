"use client";

import { useEffect, useState } from 'react';
import { extractTwoColorsFromImage } from '../lib/colorExtractor';

export function useAlbumPalette(coverUrl: string | null | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ url: string; colors: [string, string] } | null>(null);
  useEffect(() => {
    if (!enabled || !coverUrl) return;
    let active = true;
    extractTwoColorsFromImage(coverUrl).then(colors => {
      if (active) setResult(colors ? { url: coverUrl, colors } : null);
    }).catch(() => {});
    return () => { active = false; };
  }, [coverUrl, enabled]);
  // Keep the last valid palette while the next cover loads, avoiding a flash of
  // custom fallback colors during a track change. Failed loads clear it above.
  return enabled && coverUrl && result ? result.colors : null;
}
