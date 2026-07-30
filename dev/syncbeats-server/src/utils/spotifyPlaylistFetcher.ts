/**
 * spotifyPlaylistFetcher.ts
 *
 * Spotify playlist pagination utility.
 * Uses a caller-provided accessToken (no Developer API credentials needed in this module).
 *
 * Exported functions:
 *   fetchEntirePlaylist(playlistId, accessToken) → TrackMetadata[]
 *   getAnonymousAccessToken(playlistId?)          → string  (best-effort anon token)
 *   delay(ms)                                     → Promise<void>
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyAnonymousTokenResponse {
  clientId?:                        string;
  accessToken?:                     string;
  access_token?:                    string;
  accessTokenExpirationTimestampMs?: number;
  isAnonymous?:                     boolean;
}

/** Structured track object returned by fetchEntirePlaylist */
export interface TrackMetadata {
  title:           string;
  artist:          string;
  duration_ms:     number;
  artworkUrl:      string;
  spotifyTrackId?: string;
  album?:          string;
  /** Convenience format string used by the YouTube resolver bridge */
  searchQuery:     string; // "Artist - Title"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Promise-based sleep — used by the rate-limit shields */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Strip null bytes and C0/C1 control chars — safe for Postgres UTF-8 storage */
function clean(s: any): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\x00/g,   '')
    .replace(/\u0000/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// ─── Core paginator ───────────────────────────────────────────────────────────

/**
 * fetchEntirePlaylist
 *
 * Fetches ALL tracks from a Spotify playlist using offset-based pagination.
 * Spotify limits each request to 100 tracks; this function keeps looping until
 * `data.next` is null, collecting every single track.
 *
 * Anti-ban shields (both active inside the while loop):
 *   1. 429 Shield   — reads the Retry-After header, waits exactly that many seconds,
 *                     then retries the SAME offset without advancing.
 *   2. Page Delay   — waits 200 ms after every successful page before fetching the next.
 *
 * @param playlistId  — Spotify playlist ID (bare ID, not full URL)
 * @param accessToken — A valid Spotify Bearer token. Can be:
 *                       • The importing user's own OAuth token  ← preferred (full access)
 *                       • An anonymous web-player token         ← works for public playlists
 *                      The function does NOT fetch its own token; the caller is responsible.
 * @returns           Array of TrackMetadata objects (also includes .searchQuery string)
 */
/**
 * fetchEntirePlaylist
 *
 * Fetches ALL tracks from a Spotify playlist using offset-based pagination.
 * Requests https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&offset=${currentOffset}
 * in a while loop until data.next is null.
 *
 * Anti-ban shields:
 *   1. 429 Shield   — reads Retry-After header and pauses for that exact number of seconds before retrying the same offset.
 *   2. Page Delay   — hardcoded 200ms delay at the end of every successful iteration.
 *
 * @param playlistId  — Spotify playlist ID or full URL
 * @param accessToken — Spotify Bearer access token
 * @returns           Flat array of formatted track queries: ["Artist - Track Name", ...]
 */
export async function fetchEntirePlaylist(
  playlistId: string,
  accessToken: string
): Promise<string[]> {
  const cleanId = playlistId.includes('playlist/')
    ? playlistId.split('playlist/')[1].split('?')[0]
    : playlistId.split('?')[0];

  const trackQueries: string[] = [];
  let currentOffset = 0;

  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=100&offset=${currentOffset}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
      },
    });

    // ── Anti-Ban Shield 1: 429 Rate Limit Retry-After Pause ───────────
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
      console.warn(
        `[SpotifyFetcher] Rate limited (429) at offset ${currentOffset}. Waiting ${retryAfterSec}s before retrying...`
      );
      await delay(retryAfterSec * 1000);
      continue; // Retry same offset without advancing
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Spotify API returned ${response.status} at offset ${currentOffset}: ${errorText.slice(0, 300)}`
      );
    }

    const data: any = await response.json();
    const items: any[] = data.items || [];

    // ── Filter out null & local tracks ─────────────────────────────────
    for (const item of items) {
      const track = item?.track;
      if (!track || !track.name || track.is_local === true) {
        continue;
      }

      const artistNames = Array.isArray(track.artists) && track.artists.length > 0
        ? track.artists.map((a: any) => clean(a?.name || '')).filter(Boolean).join(', ')
        : 'Unknown Artist';

      const trackName = clean(track.name);
      if (trackName) {
        trackQueries.push(`${artistNames} - ${trackName}`);
      }
    }

    // Stop when data.next is null
    if (!data.next) {
      break;
    }

    // Advance offset by 100
    currentOffset += 100;

    // ── Anti-Ban Shield 2: Hardcoded 200ms inter-page delay ───────────
    await delay(200);
  }

  return trackQueries;
}

// ─── Anonymous token (best-effort, may 403 from server IPs) ──────────────────

/**
 * getAnonymousAccessToken
 *
 * Attempts to obtain a temporary anonymous Spotify web-player token.
 *
 * Method 1: Parses the accessToken JSON embedded in the playlist embed page HTML.
 * Method 2: Calls /get_access_token endpoint directly.
 *
 * NOTE: Both methods may return 403 when called from a server IP address.
 * If this fails, the caller should fall back to the spotify-url-info embed scraper.
 */
export async function getAnonymousAccessToken(playlistId?: string): Promise<string> {
  // Method 1: Extract from embed page HTML (avoids Varnish cache blocks)
  if (playlistId) {
    try {
      const cleanId = playlistId.includes('playlist/')
        ? playlistId.split('playlist/')[1].split('?')[0]
        : playlistId.split('?')[0];

      const embedRes = await fetch(
        `https://open.spotify.com/embed/playlist/${cleanId}`,
        {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        }
      );
      if (embedRes.ok) {
        const html  = await embedRes.text();
        const match = html.match(/"accessToken":"([^"]+)"/);
        if (match?.[1]) return match[1];
      }
    } catch {
      // fall through to Method 2
    }
  }

  // Method 2: Direct web-player endpoint
  const url = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';
  const response = await fetch(url, {
    method:  'GET',
    headers: {
      'User-Agent': BROWSER_UA,
      Accept:       'application/json',
      Referer:      'https://open.spotify.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify anonymous token. HTTP Status: ${response.status}`);
  }

  const data = (await response.json()) as SpotifyAnonymousTokenResponse;
  const token = data.accessToken || data.access_token;
  if (!token) throw new Error('Spotify anonymous token response did not contain an accessToken.');
  return token;
}
