/**
 * Spotify Public Playlist Scraper Utility
 * 
 * Extracts full playlist track metadata directly from Spotify's public web player API
 * using an Anonymous Web Token. Avoids official Developer API keys to remain compliant.
 */

// Simple Promise-based delay helper
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface SpotifyAnonymousTokenResponse {
  clientId?: string;
  accessToken?: string;
  access_token?: string;
  accessTokenExpirationTimestampMs?: number;
  isAnonymous?: boolean;
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * 1. Anonymous Token Generation
 * Fetches a temporary anonymous access token directly from Spotify's public embed page or web player endpoint.
 */
export async function getAnonymousAccessToken(playlistId?: string): Promise<string> {
  // Method 1: Extract accessToken from public Spotify embed page HTML (bypasses Varnish cache block)
  if (playlistId) {
    try {
      const cleanId = playlistId.includes('playlist/')
        ? playlistId.split('playlist/')[1].split('?')[0]
        : playlistId.split('?')[0];

      const embedRes = await fetch(`https://open.spotify.com/embed/playlist/${cleanId}`, {
        headers: {
          'User-Agent': DEFAULT_USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (embedRes.ok) {
        const html = await embedRes.text();
        const match = html.match(/"accessToken":"([^"]+)"/);
        if (match && match[1]) {
          return match[1];
        }
      }
    } catch {
      // fallback to endpoint
    }
  }

  // Method 2: Direct web player endpoint call
  const url = 'https://open.spotify.com/get_access_token?reason=transport&productType=web_player';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      'Accept': 'application/json',
      'Referer': 'https://open.spotify.com/',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify anonymous token. HTTP Status: ${response.status}`);
  }

  const data = (await response.json()) as SpotifyAnonymousTokenResponse;
  const token = data.accessToken || data.access_token;

  if (!token) {
    throw new Error('Spotify anonymous token response did not contain an accessToken.');
  }

  return token;
}

/**
 * 2. Infinite Pagination Loop & 3. Anti-Ban Shields
 * Extracts all tracks from a public Spotify playlist by ID.
 * 
 * - Handles 100-track pagination using a while loop.
 * - 429 Shield: Respects Retry-After header and retries automatically without throwing.
 * - Anti-Ban Delay: 200ms hardcoded delay per page request.
 * - Filters out null/deleted tracks and formats output as ["Artist - Track Name"].
 * 
 * @param playlistId - Spotify playlist ID or full open.spotify.com playlist URL
 * @returns Array of formatted track strings: ["Artist - Track Name", ...]
 */
export async function fetchEntirePlaylist(playlistId: string): Promise<string[]> {
  // Clean playlist ID if full URL is passed
  const cleanId = playlistId.includes('playlist/')
    ? playlistId.split('playlist/')[1].split('?')[0]
    : playlistId.split('?')[0];

  const accessToken = await getAnonymousAccessToken(cleanId);
  const formattedTracks: string[] = [];

  let nextUrl: string | null = `https://api.spotify.com/v1/playlists/${cleanId}/tracks?limit=100`;

  while (nextUrl) {
    const response: Response = await fetch(nextUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/json',
      },
    });

    // ── Anti-Ban Shield 1: The 429 Shield (Rate Limit Handling) ──
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 5;
      console.warn(
        `[SpotifyFetcher] Rate limited (429). Retrying after ${retryAfterSeconds}s...`
      );

      // Pause loop execution for Retry-After duration before trying again
      await delay(retryAfterSeconds * 1000);
      continue; // Retry next iteration with same nextUrl
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `Failed to fetch playlist tracks (${response.status} ${response.statusText}): ${errorText}`
      );
    }

    const data: any = await response.json();

    // ── Extract & format tracks ──
    const items = data.items || [];
    for (const item of items) {
      // Filter out null, deleted, or unavailable tracks
      const track = item?.track;
      if (!track || !track.name) continue;

      const artistName = Array.isArray(track.artists)
        ? track.artists.map((a: any) => a?.name).filter(Boolean).join(', ')
        : 'Unknown Artist';

      const formattedTrack = `${artistName || 'Unknown Artist'} - ${track.name}`;
      formattedTracks.push(formattedTrack);
    }

    // Advance to next page URL (becomes null when last page reached)
    nextUrl = data.next || null;

    // ── Anti-Ban Shield 2: Pagination Delay ──
    // 200ms delay between consecutive page requests
    if (nextUrl) {
      await delay(200);
    }
  }

  return formattedTracks;
}
