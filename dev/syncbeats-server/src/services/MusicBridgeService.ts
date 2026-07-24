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
      
      console.log(`[MusicBridge] Fetching Spotify metadata via public scraping...`);
      
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

        return {
          title: t.name,
          artist: artistName,
          duration_ms: t.duration || 0,
          artworkUrl: preview.image || '',
          spotifyTrackId: t.uri ? t.uri.replace('spotify:track:', '') : undefined,
          album: undefined, // spotify-url-info doesn't easily expose album name in getTracks
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
