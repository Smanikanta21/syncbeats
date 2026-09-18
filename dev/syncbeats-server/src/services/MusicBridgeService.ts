import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
import { fetchEntirePlaylist, SpotifyTrackMetadata } from '../utils/spotifyPlaylistFetcher';
// @ts-ignore
const fetch = require('isomorphic-unfetch');

// ── Spotify app client-credentials token cache (scoped to this service) ──────
let _appToken: string | null = null;
let _appTokenExpiresAt = 0;

async function _getAppSpotifyToken(): Promise<string> {
  if (_appToken && Date.now() < _appTokenExpiresAt) return _appToken;
  const clientId     = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Spotify client credentials not configured');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  });
  if (!res.ok) throw new Error(`Spotify client-creds token failed: ${res.status}`);
  const data: any = await res.json();
  _appToken = data.access_token;
  _appTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return _appToken as string;
}



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
   * Extracts tracks from a public Spotify playlist URL.
   *
   * Priority:
   *   1. Spotify Web API with user OAuth token  → no track cap, works for public + user's private playlists
   *   2. Spotify Web API with app client creds  → no track cap, public playlists only
   *   3. HTML embed scraper (spotify-url-info)  → hard-capped at 100 tracks, no auth needed
   */
  static async getPlaylistMetadata(
    playlistUrl: string,
    userToken?: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[]; capped: boolean }> {
    const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
    if (!match) throw new Error('Invalid Spotify playlist URL.');
    const playlistId = match[1];

    // ── Tier 1: User OAuth token (unlimited) ──
    if (userToken) {
      try {
        console.log('[MusicBridge] Using user Spotify OAuth token — fetching all tracks via API pagination...');
        const result = await MusicBridgeService._fetchViaSpotifyApi(playlistId, userToken);
        return { ...result, capped: false };
      } catch (err: any) {
        console.warn('[MusicBridge] User-token API fetch failed, trying app client-creds:', err.message);
      }
    }

    // ── Tier 2: App Client Credentials (unlimited for public playlists) ──
    try {
      const appToken = await _getAppSpotifyToken();
      console.log('[MusicBridge] Using App Spotify Token — fetching all tracks via API pagination...');
      const result = await MusicBridgeService._fetchViaSpotifyApi(playlistId, appToken);
      return { ...result, capped: false };
    } catch (err: any) {
      console.warn('[MusicBridge] App token fetch failed:', err.message);
    }

    // ── Tier 3: Anonymous embed token → Spotify API (unlimited, no user auth needed) ──
    // Reads the accessToken Spotify embeds in the embed page HTML, then paginates
    try {
      console.log('[MusicBridge] Trying anonymous embed token — fetching all tracks via API pagination...');

      let name = 'Imported Spotify Playlist';
      let coverUrl = '';

      const fetched: SpotifyTrackMetadata[] = await fetchEntirePlaylist(playlistId);
      console.log(`[MusicBridge] Anonymous fetcher: ${fetched.length} tracks (no embed cap)`);

      const tracks: TrackMetadata[] = fetched.map(t => ({
        title:          t.title,
        artist:         t.artist,
        duration_ms:    t.duration_ms,
        artworkUrl:     t.artworkUrl || coverUrl,
        spotifyTrackId: t.spotifyTrackId,
        album:          t.album,
      }));

      return { name, coverUrl, tracks, capped: false };
    } catch (err: any) {
      console.warn('[MusicBridge] Anonymous embed token fetch failed, falling back to embed scraper:', err.message);
    }

    // ── Tier 4: Embed scraper (≤100 tracks, no user auth available) ──
    try {
      console.log('[MusicBridge] Fetching via public embed scraper (capped at 100 — connect Spotify for full import)...');
      const result = await MusicBridgeService._scrapeEmbed(playlistUrl);
      return { ...result, capped: true };
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

  /**
   * Fetches ALL tracks from a Spotify playlist via the Web API, handling pagination.
   * Requires a valid Bearer token (user OAuth or client-credentials).
   */
  private static async _fetchViaSpotifyApi(
    playlistId: string,
    accessToken: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[] }> {
    const baseHeaders = { Authorization: `Bearer ${accessToken}` };

    // Fetch playlist details (name + cover)
    const detailsRes = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images`, {
      headers: baseHeaders,
    });
    if (!detailsRes.ok) throw new Error(`Spotify API ${detailsRes.status}: ${await detailsRes.text()}`);
    const details: any = await detailsRes.json();

    const name     = cleanStr(details.name || '') || 'Imported Spotify Playlist';
    const coverUrl = details.images?.[0]?.url || '';

    // Paginate through all tracks (Spotify max page size = 100)
    const allItems: any[] = [];
    let url: string | null = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(name,artists,album,duration_ms,id,uri))`;

    while (url) {
      const pageRes = await fetch(url, { headers: baseHeaders });
      if (!pageRes.ok) throw new Error(`Spotify tracks API ${pageRes.status}: ${await pageRes.text()}`);
      const page: any = await pageRes.json();
      allItems.push(...(page.items || []));
      url = page.next ?? null;
    }

    console.log(`[MusicBridge] Spotify API: fetched ${allItems.length} raw items across paginated results`);

    const tracks: TrackMetadata[] = allItems
      .map((item: any) => {
        const t = item?.track;
        if (!t || !t.name) return null;

        const title  = cleanStr(t.name);
        if (!title || isDateLike(title)) return null;

        const artist = t.artists?.map((a: any) => cleanStr(a.name)).filter(Boolean).join(', ') || 'Unknown Artist';
        const artwork = t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || coverUrl;
        const spotifyTrackId = t.id ? cleanStr(t.id) : undefined;

        return {
          title,
          artist,
          duration_ms:    typeof t.duration_ms === 'number' ? t.duration_ms : 0,
          artworkUrl:     artwork,
          spotifyTrackId,
          album:          cleanStr(t.album?.name || '') || undefined,
        } as TrackMetadata;
      })
      .filter((t): t is TrackMetadata => t !== null);

    console.log(`[MusicBridge] Spotify API: ${tracks.length} valid tracks (no embed cap applied)`);
    return { name, coverUrl, tracks };
  }


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
