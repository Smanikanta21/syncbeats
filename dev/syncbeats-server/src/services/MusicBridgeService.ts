import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
// @ts-ignore
const fetch = require('isomorphic-unfetch');

export interface TrackMetadata {
  title: string;
  artist: string;
  duration_ms: number;
  artworkUrl: string;
  spotifyTrackId?: string;
  album?: string;
}

// ── In-memory token cache so we don't re-request on every pagination page ──
let _cachedSpotifyToken: string | null = null;
let _cachedSpotifyTokenExpiry = 0;

async function getSpotifyApiToken(): Promise<string | null> {
  // Return cached token if still valid (with 60s buffer)
  if (_cachedSpotifyToken && Date.now() < _cachedSpotifyTokenExpiry - 60_000) {
    return _cachedSpotifyToken;
  }

  // Use Spotify Client Credentials Flow — FREE, no Spotify Premium required.
  // This grants read-only access to public playlists and tracks.
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (clientId && clientSecret) {
    try {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data.access_token) {
          console.log('[MusicBridge] Got Spotify Client Credentials token (expires in', data.expires_in, 's)');
          _cachedSpotifyToken = data.access_token;
          _cachedSpotifyTokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
          return _cachedSpotifyToken;
        }
      } else {
        const err: any = await res.json().catch(() => ({}));
        console.warn('[MusicBridge] Spotify Client Credentials failed:', err?.error_description || res.status);
      }
    } catch (e: any) {
      console.warn('[MusicBridge] Spotify Client Credentials error:', e?.message || e);
    }
  }

  return null;
}

import { getAnonymousAccessToken } from '../utils/spotifyPlaylistFetcher';

export class MusicBridgeService {
  /**
   * Extracts playlist tracks from a public Spotify URL.
   *
   * Token priority:
   *  1. userToken  — the importing user's own Spotify OAuth token (playlist-read-private scope).
   *                  Works for ALL public and private playlists, FREE, no Premium needed.
   *  2. Anonymous Web Token — Spotify Web Player anonymous token. Works for ALL public playlists.
   *  3. Client Credentials token — app-level token, fallback for Spotify-owned playlists.
   *  4. Embed scraper fallback — no auth, capped at 100 tracks.
   */
  static async getPlaylistMetadata(playlistUrl: string, userToken?: string): Promise<{ name: string, coverUrl: string, tracks: TrackMetadata[] }> {
    try {
      // Validate the URL format
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (!match) {
        throw new Error('Invalid Spotify playlist URL.');
      }
      const spotifyPlaylistId = match[1];

      // ── Method A: Official Spotify Web API with unlimited pagination + retry backoff ──
      // Prefer user's OAuth token; fall back to Web Player anonymous token, then client credentials
      const token = userToken 
        || await getAnonymousAccessToken(spotifyPlaylistId).catch(err => {
            console.warn('[MusicBridge] Failed to get Spotify anonymous web token:', err?.message || err);
            return null;
          })
        || await getSpotifyApiToken();

      if (token) {
        try {
          console.log(`[MusicBridge] Fetching playlist ${spotifyPlaylistId} via Spotify API${userToken ? ' (user token)' : ' (web player anonymous token)'}...`);

          // Helper: fetch with up to `maxAttempts` retries on 5xx errors
          const fetchWithRetry = async (url: string, maxAttempts = 5): Promise<any> => {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
              if (res.ok) return await res.json();
              if (res.status === 403) {
                // Could be Premium required for app owner — log and bail out to embed fallback
                const body = await res.text().catch(() => '');
                console.warn(`[MusicBridge] Spotify 403 (${body.slice(0, 120)}). Falling back to embed scraper.`);
                return null;
              }
              if (res.status === 429) {
                // Rate limited — honour Retry-After header
                const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
                console.warn(`[MusicBridge] Rate limited (429). Waiting ${retryAfter}s before retry...`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
              }
              if (res.status >= 500 && attempt < maxAttempts) {
                const delay = Math.min(2 ** attempt * 500, 10_000); // 1s, 2s, 4s, 8s, max 10s
                console.warn(`[MusicBridge] Spotify ${res.status} on attempt ${attempt}/${maxAttempts}. Retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
                continue;
              }
              // Non-retriable error or exhausted retries
              console.warn(`[MusicBridge] Spotify returned ${res.status} for ${url}`);
              return null;
            }
            return null;
          };

          // Fetch playlist metadata — try with market=IN first (helps with large Indian playlists),
          // then fallback to no market param
          let metaData: any = null;
          for (const market of ['IN', 'US', '']) {
            const marketParam = market ? `?fields=name,images&market=${market}` : '?fields=name,images';
            metaData = await fetchWithRetry(`https://api.spotify.com/v1/playlists/${spotifyPlaylistId}${marketParam}`);
            if (metaData?.name) break;
          }

          if (metaData?.name) {
            const name = metaData.name || 'Imported Spotify Playlist';
            const coverUrl = metaData.images?.[0]?.url || '';
            const allTracks: TrackMetadata[] = [];

            // Try each market until tracks endpoint responds
            let firstPageData: any = null;
            let workingMarket = '';
            for (const market of ['IN', 'US', '']) {
              const marketParam = market ? `&market=${market}` : '';
              firstPageData = await fetchWithRetry(
                `https://api.spotify.com/v1/playlists/${spotifyPlaylistId}/tracks?limit=100&offset=0${marketParam}`
              );
              if (firstPageData?.items) { workingMarket = market; break; }
            }

            if (firstPageData?.items) {
              // Process first page
              const processPage = (pageData: any) => {
                for (const item of (pageData.items || [])) {
                  const t = item?.track;
                  if (!t || !t.name) continue;
                  const artistName = t.artists?.map((a: any) => a.name).join(', ') || 'Unknown Artist';
                  const trackArt = t.album?.images?.[0]?.url || coverUrl || '';
                  allTracks.push({
                    title: t.name,
                    artist: artistName,
                    duration_ms: t.duration_ms || 0,
                    artworkUrl: trackArt,
                    spotifyTrackId: t.id || undefined,
                    album: t.album?.name || undefined,
                  });
                }
              };

              processPage(firstPageData);

              // Paginate remaining pages
              let nextUrl: string | null = firstPageData.next || null;
              while (nextUrl) {
                // Append market param if the working URL doesn't already have it
                if (workingMarket && !nextUrl.includes('market=')) {
                  nextUrl += `&market=${workingMarket}`;
                }
                const pageData = await fetchWithRetry(nextUrl);
                if (!pageData?.items) break;
                processPage(pageData);
                nextUrl = pageData.next || null;
              }
            }

            if (allTracks.length > 0) {
              console.log(`[MusicBridge] Successfully fetched ALL ${allTracks.length} tracks via Spotify API pagination!`);
              return { name, coverUrl, tracks: allTracks };
            }
          }
        } catch (apiErr: any) {
          console.warn('[MusicBridge] Spotify API pagination failed, falling back to embed scraper:', apiErr?.message || apiErr);
        }
      }

      // ── Method B: Fallback Embed Scraper
      console.log(`[MusicBridge] Fetching Spotify metadata via public embed scraper...`);
      
      const spotify = require('spotify-url-info')(fetch);
      
      const preview = await spotify.getPreview(playlistUrl);
      const tracksData = await spotify.getTracks(playlistUrl);
      
      const tracks: TrackMetadata[] = tracksData.map((t: any) => {
        let artistName = 'Unknown Artist';
        if (t.artists && Array.isArray(t.artists) && t.artists.length > 0) {
          artistName = t.artists.map((a: any) => a.name).join(', ');
        } else if (t.artist && typeof t.artist === 'string') {
          artistName = t.artist;
        } else if (t.artists && typeof t.artists === 'string') {
          artistName = t.artists;
        }

        const trackArt = t.coverUrl || t.cover || t.image || t.images?.[0]?.url || t.album?.images?.[0]?.url || preview.image || '';

        return {
          title: t.name,
          artist: artistName,
          duration_ms: t.duration || 0,
          artworkUrl: trackArt,
          spotifyTrackId: t.uri ? t.uri.replace('spotify:track:', '') : undefined,
          album: t.album?.name || undefined,
        };
      });

      return {
        name: preview.title || 'Imported Spotify Playlist',
        coverUrl: preview.image || '',
        tracks
      };
    } catch (error: any) {
      console.error('[MusicBridge] Error fetching Spotify metadata:', error.message);
      // Spotify serves an embed page with no track data for private, deleted,
      // or region-blocked playlists — the parser then fails with this message.
      if (error.message?.includes("Couldn't find any data in embed page")) {
        const err: any = new Error(
          'This playlist appears to be private or unavailable. Ask the owner to make it public, then try again.'
        );
        err.code = 'PLAYLIST_PRIVATE';
        throw err;
      }
      throw new Error(`Could not extract Spotify playlist: ${error.message}`);
    }
  }

  /**
   * Searches YouTube for the track and extracts the best available audio stream URL.
   * Returns a direct playable URL (m4a/webm) without needing Google API keys.
   *
   * @param title Track title
   * @param artist Track artist
   * @returns Playable audio stream URL
   */
  static async getAudioStreamUrl(title: string, artist: string): Promise<string> {
    try {
      const searchStr = `${title} ${artist} audio`;
      console.log(`[MusicBridge] Searching YouTube for: "${searchStr}"`);
      
      // 1. Search YouTube for the video
      const searchResult = await ytSearch(searchStr);
      const video = searchResult.videos[0];
      
      if (!video) {
        throw new Error('No YouTube video found for this track.');
      }
      
      console.log(`[MusicBridge] Found YouTube match: ${video.title} (${video.url})`);
      
      // 2. Extract the direct stream URL from the YouTube video
      console.log(`[MusicBridge] Fetching stream info...`);
      const info = await ytdl.getInfo(video.url);
      
      // Filter for audio-only formats
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      
      if (audioFormats.length === 0) {
        throw new Error('No audio formats found for this video.');
      }
      
      // Get the highest bitrate audio format
      const bestAudio = audioFormats.reduce((prev, curr) => {
        const prevBitrate = prev.audioBitrate || 0;
        const currBitrate = curr.audioBitrate || 0;
        return prevBitrate > currBitrate ? prev : curr;
      });
      
      if (!bestAudio.url) {
        throw new Error('Could not extract direct stream URL.');
      }
      
      console.log(`[MusicBridge] Extracted stream URL (Bitrate: ${bestAudio.audioBitrate}kbps, Mime: ${bestAudio.mimeType})`);
      return bestAudio.url;
    } catch (error: any) {
      console.error('[MusicBridge] Error extracting YouTube audio:', error.message);
      throw new Error(`Could not extract audio stream: ${error.message}`);
    }
  }
}
