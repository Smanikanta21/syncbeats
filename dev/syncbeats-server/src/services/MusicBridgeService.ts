import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
// @ts-ignore
const fetch = require('isomorphic-unfetch');



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
   * Extracts tracks from a public Spotify playlist URL using the HTML embed page.
   */
  static async getPlaylistMetadata(
    playlistUrl: string,
    userToken?: string,
  ): Promise<{ name: string; coverUrl: string; tracks: TrackMetadata[] }> {
    try {
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (!match) throw new Error('Invalid Spotify playlist URL.');
      
      console.log('[MusicBridge] Fetching via public embed scraper...');
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
