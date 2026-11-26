/**
 * Dynamic Album Art Color Extractor for SyncBeats
 * Extracts representative colors from track artwork using HTML5 Canvas.
 */

import { ytId } from './youtube';
import { getRestUrl } from './api';
import { extractPaletteFromPixels } from './albumPalette';

export function getTrackThumbnailUrl(item: { trackUrl?: string; thumbnail?: string; coverUrl?: string } | null | undefined): string | null {
  if (!item) return null;
  if (item.thumbnail) return item.thumbnail;
  if (item.coverUrl) return item.coverUrl;
  
  const url = item.trackUrl;
  if (!url) return null;
  
  const customThumbMatch = url.match(/[?&]thumb=([^&]+)/);
  if (customThumbMatch) return decodeURIComponent(customThumbMatch[1]);

  const id = ytId(url);
  if (id) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }

  return null;
}

const ytTitleCache = new Map<string, string>();
const pendingFetches = new Set<string>();

export function getYoutubeTrackTitle(rawYtId: string): string | null {
  const validId = ytId(rawYtId);
  if (!validId) return null;
  if (ytTitleCache.has(validId)) return ytTitleCache.get(validId)!;

  if (typeof window !== "undefined" && !pendingFetches.has(validId)) {
    pendingFetches.add(validId);
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${validId}&format=json`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.title) {
          const cleanTitle = data.title.replace(/\0/g, '').trim();
          ytTitleCache.set(validId, cleanTitle);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("syncbeats:title-resolved", { detail: { ytId: validId, title: cleanTitle } }));
          }
        }
      })
      .catch(() => {})
      .finally(() => pendingFetches.delete(validId));
  }
  return null;
}

const paletteCache = new Map<string, Promise<[string, string] | null>>();

export function extractTwoColorsFromImage(imageUrl: string): Promise<[string, string] | null> {
  const cached = paletteCache.get(imageUrl);
  if (cached) return cached;
  const result = readImageColors(imageUrl);
  if (imageUrl && typeof window !== 'undefined') {
    if (paletteCache.size >= 24) paletteCache.delete(paletteCache.keys().next().value!);
    paletteCache.set(imageUrl, result);
    // A temporary proxy/CORS failure must not become this cover's cached palette.
    void result.then(colors => {
      if (!colors && paletteCache.get(imageUrl) === result) paletteCache.delete(imageUrl);
    });
  }
  return result;
}

function readImageColors(imageUrl: string): Promise<[string, string] | null> {
  return new Promise(resolve => {
    if (!imageUrl || typeof window === 'undefined') return resolve(null);

    let targetUrl = imageUrl;
    if (/^https?:\/\//.test(imageUrl) && !imageUrl.includes('/search/proxy-image')) {
      targetUrl = `${getRestUrl()}/search/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }

    const tryLoad = (src: string, canTryDirect: boolean) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let finished = false;
      const cleanup = () => {
        finished = true;
        clearTimeout(timeout);
        img.onload = img.onerror = null;
      };
      const fallback = () => {
        if (finished) return;
        cleanup();
        if (canTryDirect) tryLoad(imageUrl, false);
        else resolve(null);
      };
      const timeout = setTimeout(fallback, 4000);
      img.onerror = fallback;
      img.onload = () => {
        if (finished) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 64;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return fallback();
          ctx.drawImage(img, 0, 0, 64, 64);
          const colors = extractPaletteFromPixels(ctx.getImageData(0, 0, 64, 64).data);
          cleanup();
          resolve(colors);
        } catch {
          // A direct image can display while CORS prevents reading its pixels.
          fallback();
        }
      };
      img.src = src;
    };
    tryLoad(targetUrl, targetUrl !== imageUrl);
  });
}
