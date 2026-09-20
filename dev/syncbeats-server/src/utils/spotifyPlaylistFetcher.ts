/**
 * Spotify Public Playlist Scraper Utility
 *
 * Extracts full playlist track metadata from Spotify's public web player API
 * using an anonymous access token embedded in the Spotify embed page HTML.
 * No API keys or user login required for public playlists.
 *
 * Anti-ban shields:
 *   1. 429 Shield  — reads Retry-After header, waits, retries same page (max 5 retries)
 *   2. Page Delay  — 300ms between successful page fetches
 */

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface SpotifyTrackMetadata {
  title:           string;
  artist:          string;
  duration_ms:     number;
  artworkUrl:      string;
  spotifyTrackId?: string;
  album?:          string;
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function clean(s: any): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\x00/g, '').replace(/\u0000/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Fetches an official Spotify access token using the Client Credentials Flow.
 * Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.
 */
export async function getOfficialSpotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in .env');
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Failed to get official Spotify token. Status: ${response.status}. ${errorBody}`);
  }

  const data: any = await response.json();
  if (data.access_token) {
    return data.access_token;
  }

  throw new Error('Spotify token response did not contain access_token');
}

/**
 * Fetches ALL tracks from a public Spotify playlist by paginating the API.
 * Uses an anonymous token (no user auth, no API keys needed).
 *
 * Returns rich TrackMetadata objects (title, artist, duration_ms, artwork, etc.)
 */
export async function fetchEntirePlaylist(
  playlistId: string,
): Promise<SpotifyTrackMetadata[]> {
  const cleanId = playlistId.includes('playlist/')
    ? playlistId.split('playlist/')[1].split('?')[0]
    : playlistId.split('?')[0];

  const accessToken = await getOfficialSpotifyToken();

  const tracks: SpotifyTrackMetadata[] = [];
  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=100`;
  let retries = 0;
  const MAX_RETRIES = 8;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': DEFAULT_UA,
        Accept: 'application/json',
      },
    });

    // ── Anti-ban Shield 1: 429 rate limit ────────────────────────────────────
    if (response.status === 429) {
      if (retries >= MAX_RETRIES) {
        throw new Error(`[SpotifyFetcher] Too many 429s (${retries} retries). Giving up.`);
      }
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (retries + 1) * 2000;
      console.warn(`[SpotifyFetcher] 429 rate-limited. Waiting ${waitMs}ms (retry ${retries + 1}/${MAX_RETRIES})...`);
      await delay(waitMs);
      retries++;
      continue; // retry same page
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Spotify API ${response.status} at ${nextUrl}: ${body.slice(0, 300)}`);
    }

    retries = 0; // reset on success
    const data: any = await response.json();
    const items: any[] = data.items || [];

    for (const item of items) {
      const t = item?.track;
      if (!t || !t.name || t.is_local === true) continue;

      const title = clean(t.name);
      if (!title) continue;

      const artist = Array.isArray(t.artists) && t.artists.length > 0
        ? t.artists.map((a: any) => clean(a?.name || '')).filter(Boolean).join(', ')
        : 'Unknown Artist';

      tracks.push({
        title,
        artist,
        duration_ms:    typeof t.duration_ms === 'number' ? t.duration_ms : 0,
        artworkUrl:     clean(t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || ''),
        spotifyTrackId: t.id ? clean(t.id) : undefined,
        album:          t.album?.name ? clean(t.album.name) : undefined,
      });
    }

    console.log(`[SpotifyFetcher] Fetched ${items.length} items → total so far: ${tracks.length}`);

    nextUrl = data.next ?? null;

    // ── Anti-ban Shield 2: inter-page delay ──────────────────────────────────
    if (nextUrl) await delay(300);
  }

  return tracks;
}
