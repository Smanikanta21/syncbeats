import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
// @ts-ignore
const fetch = require('isomorphic-unfetch');



export interface TrackMetadata {
  title: string;
  artist: string;
  duration_ms: number;
  artworkUrl: string;
}

export class MusicBridgeService {
  /**
   * Extracts playlist tracks from a public Spotify URL without needing an API key.
   * This uses scraping behind the scenes, parsing the Spotify embed page.
   *
   * 
   * @param playlistUrl A public Spotify playlist URL (e.g. https://open.spotify.com/playlist/...)
   * @returns Object with playlist name, cover, and tracks
   */
  static async getPlaylistMetadata(playlistUrl: string): Promise<{ name: string, coverUrl: string, tracks: TrackMetadata[] }> {
    try {
      // Validate the URL format
      const match = playlistUrl.match(/playlist\/([a-zA-Z0-9]+)/);
      if (!match) {
        throw new Error('Invalid Spotify playlist URL.');
      }
      
      const playlistId = match[1];
      console.log(`[MusicBridge] Fetching Spotify metadata for playlist ID ${playlistId}...`);
      
      // Fetch the embed player HTML which still contains the raw JSON state
      const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Failed to fetch Spotify embed page: ${res.status}`);
      }
      
      const html = await res.text();
      const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
      
      if (!nextDataMatch) {
        throw new Error('Could not find track data in Spotify embed page.');
      }
      
      const nextData = JSON.parse(nextDataMatch[1]);
      const entity = nextData?.props?.pageProps?.state?.data?.entity;
      
      if (!entity || !entity.trackList) {
        throw new Error('Invalid Spotify data structure.');
      }
      
      // The embed payload structures it slightly differently
      const tracks = entity.trackList.map((t: any) => ({
        title: t.title,
        artist: t.subtitle,
        duration_ms: t.duration || 0,
        artworkUrl: entity.visualIdentity?.image?.[0]?.url || ''
      }));

      return {
        name: entity.name || 'Imported Spotify Playlist',
        coverUrl: entity.visualIdentity?.image?.[0]?.url || tracks[0]?.artworkUrl || '',
        tracks
      };
    } catch (error: any) {
      console.error('[MusicBridge] Error fetching Spotify metadata:', error.message);
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
