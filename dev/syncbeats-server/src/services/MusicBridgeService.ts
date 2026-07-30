import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
// @ts-ignore
const fetch = require('isomorphic-unfetch');

import {
  getAnonymousAccessToken,
  fetchEntirePlaylist,
} from '../utils/spotifyPlaylistFetcher';

export interface TrackMetadata {
  title:           string;
  artist:          string;
  duration_ms:     number;
  artworkUrl:      string;
  spotifyTrackId?: string;
  album?:          string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function cleanStr(s: any): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .replace(/\x00/g, '').replace(/\u0000/g, '').replace(/\\u0000/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

const isDateLike = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s.trim());


export class MusicBridgeService {

  /**
   * Extracts ALL tracks from a public Spotify playlist URL.
   *
   * Three-tier strategy — no app-level Developer API credentials used for track data:
   *
   *  Tier 1 — User OAuth Token  (UNLIMITED tracks — best path)
   *    The importing user's own Spotify access token (linked in Profile). Their
   *    own account makes requests against their own data — completely safe.
   *
   *  Tier 2 — Anonymous Web Token  (UNLIMITED tracks — public playlists only)
   *    Spotify's internal web-player token extracted from the embed page HTML.
   *    Works from browser IPs; may 403 from server IPs.
   *
   *  Tier 3 — Embed Scraper  (<=100 tracks — always works, no auth)
   *    Falls back to spotify-url-info scraping the public embed page.
   */
  static async getPlaylistMetadata(
    playlistUrl: string,
    userToken?: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[] }> {
    try {
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (!match) throw new Error('Invalid Spotify playlist URL.');
      const playlistId = match[1];

      // ── Tier 1: User OAuth Token ─────────────────────────────────────────────
      if (userToken) {
        try {
          console.log('[MusicBridge] Tier 1 — paginating with user OAuth token...');
          const result = await MusicBridgeService._paginateWithToken(playlistId, userToken);
          if (result.tracks.length > 0) {
            console.log(`[MusicBridge] Tier 1 success — ${result.tracks.length} tracks fetched.`);
            return result;
          }
        } catch (err: any) {
          console.warn('[MusicBridge] Tier 1 (user token) failed:', err?.message);
        }
      }

      // ── Tier 2: Anonymous Token ──────────────────────────────────────────────
      try {
        console.log('[MusicBridge] Tier 2 — requesting anonymous web token...');
        const anonToken = await getAnonymousAccessToken(playlistId);
        console.log('[MusicBridge] Tier 2 — token obtained, paginating...');
        const result = await MusicBridgeService._paginateWithToken(playlistId, anonToken);
        if (result.tracks.length > 0) {
          console.log(`[MusicBridge] Tier 2 success — ${result.tracks.length} tracks fetched.`);
          return result;
        }
      } catch (err: any) {
        console.warn('[MusicBridge] Tier 2 (anon token) failed:', err?.message);
      }

      // ── Tier 3: Embed Scraper ────────────────────────────────────────────────
      console.log('[MusicBridge] Tier 3 — falling back to embed scraper (<=100 tracks)...');
      return await MusicBridgeService._scrapeEmbed(playlistUrl);

    } catch (error: any) {
      console.error('[MusicBridge] Error fetching Spotify metadata:', error.message);
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

  // ───────────────────────────────────────────────────────────────────────────
  // _paginateWithToken  (Tier 1 + 2 shared implementation)
  //
  // Delegates to fetchEntirePlaylist() from spotifyPlaylistFetcher which runs:
  //   - offset-based while loop (100 tracks/page)
  //   - 429 retry-after shield (reads Retry-After header, waits, retries same offset)
  //   - 200 ms inter-page delay (anti-ban)
  //   - is_local track filtering
  // Fetches playlist name/cover separately before paginating.
  // ───────────────────────────────────────────────────────────────────────────
  private static async _paginateWithToken(
    playlistId: string,
    accessToken: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[] }> {
    let playlistName = 'Imported Spotify Playlist';
    let coverUrl     = '';

    // Fetch playlist-level metadata (name + cover) — cosmetic, non-fatal
    try {
      const metaRes = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images`,
        { headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': BROWSER_UA } }
      );
      if (metaRes.ok) {
        const meta = await metaRes.json();
        if (meta?.name)             playlistName = cleanStr(meta.name) || playlistName;
        if (meta?.images?.[0]?.url) coverUrl     = meta.images[0].url;
      }
    } catch { /* non-fatal */ }

    // fetchEntirePlaylist handles all pagination + anti-ban shields
    const fetched = await fetchEntirePlaylist(playlistId, accessToken);

    const tracks: TrackMetadata[] = fetched.map(query => {
      const parts = query.split(' - ');
      const artist = parts.length > 1 ? parts[0] : 'Unknown Artist';
      const title = parts.length > 1 ? parts.slice(1).join(' - ') : query;
      return {
        title,
        artist,
        duration_ms: 0,
        artworkUrl: coverUrl,
      };
    });

    return { name: playlistName, coverUrl, tracks };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _scrapeEmbed  (Tier 3 — <=100 tracks, no auth)
  //
  // Uses spotify-url-info's getData() which parses the structured JSON that
  // Spotify embeds in the /embed/playlist/{id} page.
  // ───────────────────────────────────────────────────────────────────────────
  private static async _scrapeEmbed(
    playlistUrl: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[] }> {
    console.log('[MusicBridge] Fetching via public embed scraper (getData)...');
    const spotify = require('spotify-url-info')(fetch);
    const pageData = await spotify.getData(playlistUrl);

    const playlistName = cleanStr(pageData?.name || pageData?.title || '') || 'Imported Spotify Playlist';
    const coverUrl     = pageData?.coverArt?.sources?.[0]?.url
                      || pageData?.visualIdentity?.image?.[0]?.url
                      || '';

    const trackList: any[] = pageData?.trackList || [];

    // Fallback: if getData trackList is empty, try getTracks
    let rawItems = trackList;
    if (rawItems.length === 0) {
      console.log('[MusicBridge] trackList empty — trying getTracks fallback...');
      rawItems = await spotify.getTracks(playlistUrl).catch(() => []);
    }

    const tracks: TrackMetadata[] = rawItems
      .map((item: any) => {
        // getData trackList shape: { title, subtitle (artist), uri, duration }
        // getTracks shape:         { name, artist/artists, uri, duration }
        const isTrackListItem = !!item?.subtitle && !item?.name;

        const rawTitle  = isTrackListItem ? item.title  : (item.name  || item.title  || '');
        const rawArtist = isTrackListItem ? item.subtitle : '';

        const title = cleanStr(rawTitle);
        if (!title || isDateLike(title)) return null;

        let artist = cleanStr(rawArtist) || 'Unknown Artist';
        if (!isTrackListItem) {
          if (Array.isArray(item.artists) && item.artists.length > 0) {
            artist = item.artists.map((a: any) => cleanStr(a?.name || '')).filter(Boolean).join(', ');
          } else if (typeof item.artist === 'string') {
            artist = cleanStr(item.artist);
          }
        }

        const rawId = item?.uri
          ? cleanStr(item.uri.replace('spotify:track:', ''))
          : (item?.id ? cleanStr(item.id) : undefined);

        return {
          title,
          artist:          artist || 'Unknown Artist',
          duration_ms:     typeof item.duration === 'number' ? item.duration : 0,
          artworkUrl:      coverUrl,
          spotifyTrackId:  rawId,
          album:           undefined,
        } as TrackMetadata;
      })
      .filter((t: any): t is TrackMetadata => t !== null && t.title.length > 0);

    console.log(`[MusicBridge] Embed scraper: ${tracks.length} tracks (Spotify embed cap: 100).`);
    return { name: playlistName, coverUrl, tracks };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // getAudioStreamUrl  (YouTube resolution — unchanged)
  // ───────────────────────────────────────────────────────────────────────────
  static async getAudioStreamUrl(title: string, artist: string): Promise<string> {
    try {
      const searchStr = `${title} ${artist} audio`;
      console.log(`[MusicBridge] Searching YouTube for: "${searchStr}"`);
      const searchResult = await ytSearch(searchStr);
      const video = searchResult.videos[0];
      if (!video) throw new Error('No YouTube video found for this track.');

      console.log(`[MusicBridge] Found: ${video.title} (${video.url})`);
      const info         = await ytdl.getInfo(video.url);
      const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
      if (audioFormats.length === 0) throw new Error('No audio formats found.');

      const bestAudio = audioFormats.reduce((prev, curr) =>
        (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr
      );
      if (!bestAudio.url) throw new Error('Could not extract direct stream URL.');

      console.log(`[MusicBridge] Stream URL extracted (${bestAudio.audioBitrate}kbps ${bestAudio.mimeType})`);
      return bestAudio.url;
    } catch (error: any) {
      console.error('[MusicBridge] YouTube audio error:', error.message);
      throw new Error(`Could not extract audio stream: ${error.message}`);
    }
  }
}
