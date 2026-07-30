import { fetchEntirePlaylist } from '../utils/spotifyPlaylistFetcher';

export async function runSpotifyCheckerTest(): Promise<void> {
  console.log('  [SpotifyChecker] Testing Spotify API pagination & anti-ban shield logic...');

  // Mock global fetch to test 100-track pagination, 429 Retry-After, and null/local track filtering
  const originalFetch = global.fetch;

  let requestCount = 0;
  let retryTriggered = false;

  try {
    global.fetch = (async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestCount++;
      const urlStr = url.toString();

      // Page 1: Simulate 429 rate limit on first attempt
      if (urlStr.includes('offset=0') && !retryTriggered) {
        retryTriggered = true;
        return new Response(JSON.stringify({ error: { status: 429, message: 'Rate limit' } }), {
          status: 429,
          headers: { 'Retry-After': '1' } // 1 second retry-after
        });
      }

      // Page 1 success: 100 tracks (includes 1 null, 1 local track)
      if (urlStr.includes('offset=0')) {
        const items = Array.from({ length: 100 }, (_, i) => {
          if (i === 0) return { track: null }; // Should be filtered out
          if (i === 1) return { track: { name: 'Local Song', is_local: true } }; // Should be filtered out
          return {
            track: {
              name: `Track ${i}`,
              artists: [{ name: `Artist ${i}` }],
              is_local: false
            }
          };
        });

        return new Response(JSON.stringify({
          items,
          next: 'https://api.spotify.com/v1/playlists/test/tracks?limit=100&offset=100'
        }), { status: 200 });
      }

      // Page 2: 50 tracks, next: null
      if (urlStr.includes('offset=100')) {
        const items = Array.from({ length: 50 }, (_, i) => ({
          track: {
            name: `Page2 Track ${i}`,
            artists: [{ name: `Artist ${i}` }],
            is_local: false
          }
        }));

        return new Response(JSON.stringify({
          items,
          next: null
        }), { status: 200 });
      }

      return new Response(JSON.stringify({ items: [], next: null }), { status: 200 });
    }) as any;

    const startTime = Date.now();
    const tracks = await fetchEntirePlaylist('37i9dQZF1DXcBWIGoYBM5M', 'mock_token');
    const duration = Date.now() - startTime;

    // Assertions:
    // Total tracks should be 98 (Page 1: 98 valid + 1 null + 1 local) + 50 (Page 2) = 148 tracks
    if (tracks.length !== 148) {
      throw new Error(`Spotify pagination count error. Expected 148 tracks, got ${tracks.length}`);
    }

    if (!retryTriggered) {
      throw new Error('Spotify 429 Retry-After shield did not trigger correctly');
    }

    // Should include 200ms delay for page transition + 1s 429 delay >= 1000ms total
    if (duration < 1000) {
      throw new Error(`Spotify inter-page delay too fast (${duration}ms). Expected anti-ban shield delay.`);
    }

    console.log(`  ✓ SpotifyChecker passed! (Fetched ${tracks.length} tracks across pages with 429 retry shield in ${duration}ms)`);
  } finally {
    global.fetch = originalFetch;
  }
}
