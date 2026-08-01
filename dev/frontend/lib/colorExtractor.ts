/**
 * Dynamic Album Art Color Extractor for SyncBeats
 * Extracts 2 vibrant primary/secondary colors from any track's cover art (Spotify/YouTube/local) using HTML5 Canvas.
 */

export function getTrackThumbnailUrl(item: { trackUrl?: string; thumbnail?: string; coverUrl?: string } | null | undefined): string | null {
  if (!item) return null;
  if (item.thumbnail) return item.thumbnail;
  if (item.coverUrl) return item.coverUrl;
  
  const url = item.trackUrl;
  if (!url) return null;
  
  const customThumbMatch = url.match(/[?&]thumb=([^&]+)/);
  if (customThumbMatch) return decodeURIComponent(customThumbMatch[1]);

  const ytProtoMatch = url.match(/^(?:ws-p2p:yt:|youtube:)([a-zA-Z0-9_-]{11})/);
  if (ytProtoMatch) {
    return `https://i.ytimg.com/vi/${ytProtoMatch[1]}/hqdefault.jpg`;
  }

  const ytStandardMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytStandardMatch) {
    return `https://i.ytimg.com/vi/${ytStandardMatch[1]}/hqdefault.jpg`;
  }

  return null;
}

const ytTitleCache = new Map<string, string>();
const pendingFetches = new Set<string>();

export function getYoutubeTrackTitle(ytId: string): string | null {
  if (!ytId || !/^[a-zA-Z0-9_-]{11}$/.test(ytId)) return null;
  if (ytTitleCache.has(ytId)) return ytTitleCache.get(ytId)!;

  if (typeof window !== "undefined" && !pendingFetches.has(ytId)) {
    pendingFetches.add(ytId);
    fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytId}&format=json`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.title) {
          const cleanTitle = data.title.replace(/\0/g, '').trim();
          ytTitleCache.set(ytId, cleanTitle);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("syncbeats:title-resolved", { detail: { ytId, title: cleanTitle } }));
          }
        }
      })
      .catch(() => {})
      .finally(() => pendingFetches.delete(ytId));
  }
  return null;
}

export async function extractTwoColorsFromImage(imageUrl: string): Promise<[string, string]> {
  return new Promise((resolve) => {
    if (!imageUrl || typeof window === "undefined") {
      return resolve(["#8b5cf6", "#3b82f6"]);
    }

    // Route remote HTTP/HTTPS images (Spotify i.scdn.co, YouTube i.ytimg.com, etc.)
    // through our server CORS proxy endpoint so canvas is never tainted!
    let targetUrl = imageUrl;
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000';
    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      if (!imageUrl.includes("/api/search/proxy-image")) {
        targetUrl = `${serverUrl}/api/search/proxy-image?url=${encodeURIComponent(imageUrl)}`;
      }
    }

    const tryLoad = (src: string, isProxyAttempt: boolean) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = src;

      const fallback = () => {
        if (!isProxyAttempt && src !== imageUrl) {
          // If proxy load failed, attempt direct load
          tryLoad(imageUrl, true);
        } else {
          resolve(["#8b5cf6", "#3b82f6"]);
        }
      };

      const timeout = setTimeout(fallback, 4000);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return fallback();

          canvas.width = 128;
          canvas.height = 128;
          ctx.drawImage(img, 0, 0, 128, 128);

          const imgData = ctx.getImageData(0, 0, 128, 128).data;
          const colors = processImageData(imgData);
          if (colors) {
            resolve(colors);
          } else {
            fallback();
          }
        } catch {
          fallback();
        }
      };

      img.onerror = fallback;
    };

    tryLoad(targetUrl, targetUrl !== imageUrl);
  });
}

function processImageData(imgData: Uint8ClampedArray): [string, string] | null {
  const colorArray: { r: number; g: number; b: number; s: number; l: number; h: number }[] = [];

  for (let i = 0; i < imgData.length; i += 32) {
    const r = imgData[i];
    const g = imgData[i + 1];
    const b = imgData[i + 2];
    const a = imgData[i + 3];

    if (a < 128) continue; // Skip transparent

    const { h, s, l } = rgbToHsl(r, g, b);

    // Filter out extreme darks, whites, and dull grays
    if (l < 20 || l > 85) continue;
    if (s < 20) continue;

    colorArray.push({ r, g, b, h, s, l });
  }

  if (colorArray.length === 0) {
    return extractRelaxed(imgData);
  }

  colorArray.sort((a, b) => {
    const scoreA = a.s * (1 - Math.abs(a.l - 50) / 50);
    const scoreB = b.s * (1 - Math.abs(b.l - 50) / 50);
    return scoreB - scoreA;
  });

  const primary = colorArray[0];
  const color1 = rgbToHex(primary.r, primary.g, primary.b);

  let color2 = "";
  let bestScore = -1;
  for (const c of colorArray) {
    const dist = Math.abs(c.h - primary.h);
    const hueDiff = Math.min(dist, 360 - dist);
    if (hueDiff < 25) continue;

    const score = c.s * (1 - Math.abs(c.l - 50) / 50) * (hueDiff / 180);
    if (score > bestScore) {
      bestScore = score;
      color2 = rgbToHex(c.r, c.g, c.b);
    }
  }

  if (!color2) {
    const compH = (primary.h + 150) % 360;
    color2 = hslToHex(compH, Math.max(60, primary.s), Math.min(65, Math.max(45, primary.l)));
  }

  return [color1, color2];
}

/** Parse a hex color to { h, s, l } (h: 0–360, s: 0–100, l: 0–100) */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return rgbToHsl(r, g, b);
}

export function colorsToAmbientHues(primaryHex: string, accentHex: string) {
  const { h: h1 } = hexToHsl(primaryHex);
  const { h: h2 } = hexToHsl(accentHex);

  const lerpHue = (t: number) => {
    let diff = h2 - h1;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return (h1 + diff * t + 360) % 360;
  };

  return {
    subHue:      Math.round(lerpHue(0)),
    bassHue:     Math.round(lerpHue(0.1)),
    lowMidHue:   Math.round(lerpHue(0.33)),
    midHue:      Math.round(lerpHue(0.5)),
    upperMidHue: Math.round(lerpHue(0.67)),
    highHue:     Math.round(lerpHue(1)),
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────

function extractRelaxed(imgData: Uint8ClampedArray): [string, string] | null {
  const candidates: { r: number; g: number; b: number; h: number; s: number; l: number }[] = [];
  for (let i = 0; i < imgData.length; i += 64) {
    const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
    if (a < 128) continue;
    const { h, s, l } = rgbToHsl(r, g, b);
    if (s < 10) continue;
    candidates.push({ r, g, b, h, s, l });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.s - a.s);
  const c1 = candidates[0];
  const color1 = rgbToHex(c1.r, c1.g, c1.b);
  const compH = (c1.h + 150) % 360;
  const color2 = hslToHex(compH, Math.max(55, c1.s), Math.min(65, Math.max(40, c1.l)));
  return [color1, color2];
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
