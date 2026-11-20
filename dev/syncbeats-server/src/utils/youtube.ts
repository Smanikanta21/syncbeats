// Canonical YouTube video-ID extraction, shared by the room and search paths.
//
// Mirrors the frontend's lib/youtube.ts so the two sides can never disagree on
// what counts as the same video.

/** A bare 11-char video ID. */
export const YT_ID_PATTERN = '[a-zA-Z0-9_-]{11}';

export const YT_ID_RE = new RegExp(`^${YT_ID_PATTERN}$`);

const ANY_FORMAT = new RegExp(
  `(?:youtube:|ws-p2p:yt:|youtube_|[?&]videoId=|/vi/|youtu\\.be/|/(?:embed|v)/|.*[?&]v=|^)(${YT_ID_PATTERN})(?=[^a-zA-Z0-9_-]|$)`,
);

/**
 * Extracts a video ID from a raw ID, a `youtube:`/`ws-p2p:yt:` scheme, a
 * `?v=`/`?videoId=` URL, an embed path, or a `youtube_<id>.yt` filename.
 */
export function ytId(input?: string | null): string | null {
  if (!input) return null;
  const str = input.trim();
  if (YT_ID_RE.test(str)) return str;
  const stamped = str.match(/^ws-p2p:yt:([a-zA-Z0-9_-]{11})_\d{10,13}(?=[?&#]|$)/);
  if (stamped) return stamped[1];
  const match = str.match(ANY_FORMAT);
  return match ? match[1] : null;
}
