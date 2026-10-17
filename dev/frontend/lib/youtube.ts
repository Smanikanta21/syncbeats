// lib/youtube.ts — Canonical YouTube ID extraction helper

const YT_ID_REGEX = /(?:youtube:|ws-p2p:yt:|youtube_|[?&]videoId=|\/vi\/|youtu\.be\/|\/(?:embed|v)\/|.*[?&]v=|^)([a-zA-Z0-9_-]{11})(?=[^a-zA-Z0-9_-]|$)/;

/**
 * Extracts an 11-character YouTube video ID from any format:
 * - Raw ID: "dQw4w9WgXcQ"
 * - Prefix scheme: "youtube:dQw4w9WgXcQ" or "ws-p2p:yt:dQw4w9WgXcQ"
 * - Standard URLs: "https://youtu.be/...", "https://www.youtube.com/watch?v=..."
 * - Embed / videoId param / filenames: "youtube_dQw4w9WgXcQ.yt", "?videoId=dQw4w9WgXcQ"
 */
export function ytId(input?: string | null): string | null {
  if (!input) return null;
  const str = input.trim();
  if (str.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const match = str.match(YT_ID_REGEX);
  return match ? match[1] : null;
}
