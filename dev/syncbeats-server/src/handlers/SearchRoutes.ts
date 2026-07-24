import { Router } from 'express';
import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
import play from 'play-dl';
import prisma from '../db/prisma';
import { matchToYouTubeFallback } from './MusicBridgeRoutes';

export function createSearchRoutes(): Router {
  const router = Router();

  router.get('/songs', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }

      console.log(`[Search] Querying database for: ${query}`);
      const songs = await prisma.song.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { artist: { contains: query, mode: 'insensitive' } }
          ],
          youtubeId: { not: null }
        },
        take: 10
      });

      const results = songs.map(s => ({
        url: `youtube:${s.youtubeId}`,
        type: 'spotify-db',
        title: s.title,
        thumbnail: s.youtubeThumbnail || s.albumArt || '',
        uploaderName: s.artist,
        duration: s.duration || 0,
      }));

      res.json({ results });
    } catch (err) {
      console.error('[Search] Local song search failed:', err);
      res.status(500).json({ error: 'Failed to perform local search' });
    }
  });

  router.get('/recommendations', async (req, res) => {
    try {
      const userId = req.query.userId as string | undefined;
      const sections: any[] = [];

      // 1. Recently Played — this user's own listen history.
      if (userId) {
        const recent = await prisma.listenHistory.findMany({
          where: { userId },
          orderBy: { playedAt: 'desc' },
          take: 20,
        });
        // De-dupe by youtubeId, preserving most-recent order.
        const seen = new Set<string>();
        const tracks = [];
        for (const h of recent) {
          if (seen.has(h.youtubeId)) continue;
          seen.add(h.youtubeId);
          tracks.push({
            youtubeId: h.youtubeId,
            title: h.title,
            artist: h.artist || 'Unknown',
            thumbnail: h.thumbnail || (h.youtubeId ? `https://i.ytimg.com/vi/${h.youtubeId}/hqdefault.jpg` : ''),
            duration: 0,
          });
        }
        if (tracks.length > 0) sections.push({ title: 'Recently Played', tracks });
      }

      // 2. Trending — most-played tracks across all users.
      const grouped = await prisma.listenHistory.groupBy({
        by: ['youtubeId'],
        _count: { youtubeId: true },
        orderBy: { _count: { youtubeId: 'desc' } },
        take: 20,
      });

      let trending: any[] = [];
      if (grouped.length >= 5) {
        for (const g of grouped) {
          const row = await prisma.listenHistory.findFirst({
            where: { youtubeId: g.youtubeId },
            orderBy: { playedAt: 'desc' },
          });
          if (!row) continue;
          trending.push({
            youtubeId: row.youtubeId,
            title: row.title,
            artist: row.artist || 'Unknown',
            thumbnail: row.thumbnail || (row.youtubeId ? `https://i.ytimg.com/vi/${row.youtubeId}/hqdefault.jpg` : ''),
            duration: 0,
          });
        }
      }

      // Fallback when history is too sparse to fill a trending row.
      if (trending.length < 5) {
        try {
          const r = await ytSearch('top hits this week');
          trending = r.videos.slice(0, 20).map(v => ({
            youtubeId: v.videoId,
            title: v.title,
            artist: v.author.name,
            thumbnail: v.thumbnail,
            duration: v.seconds || 0,
          }));
        } catch (e) {
          console.error('[Search] Trending fallback (ytSearch) failed:', e);
        }
      }

      if (trending.length > 0) sections.push({ title: 'Trending', tracks: trending });

      res.json({ sections });
    } catch (err) {
      console.error('[Search] Recommendations failed:', err);
      res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
  });

  router.get('/youtube', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        res.status(400).json({ error: 'Query parameter "q" is required' });
        return;
      }

      console.log(`[Search] Querying YouTube for: ${query}`);
      const r = await ytSearch(query);
      const videos = r.videos.slice(0, 10).map(v => ({
        id: v.videoId,
        title: v.title,
        artist: v.author.name,
        thumbnail: v.thumbnail,
        duration: v.timestamp
      }));

      res.json({ results: videos });
    } catch (err) {
      console.error('[Search] YouTube search failed:', err);
      res.status(500).json({ error: 'Failed to perform search' });
    }
  });

  router.get('/youtube/download', async (req, res) => {
    try {
      const videoId = req.query.videoId as string;
      if (!videoId) {
        res.status(400).json({ error: 'Query parameter "videoId" is required' });
        return;
      }

      const filePath = await downloadAudio(videoId);
      if (!res.headersSent) {
        res.sendFile(filePath);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Truncated YouTube ID')) {
        console.warn(`[Search] Suppressed truncated ID request: ${req.query.videoId}`);
      } else {
        console.error('[Search] stream failed:', err);
      }
      if (!res.headersSent) {
        res.status(400).json({ error: msg });
      }
    }
  });

  // Prefetch endpoint — download the next song in the background so it's cached
  // when the current song ends. Returns immediately with { ok: true, cached: bool }.
  router.post('/youtube/prefetch', async (req, res) => {
    try {
      const { videoId } = req.body;
      if (!videoId) {
        res.status(400).json({ error: 'videoId is required' });
        return;
      }

      const path = require('path');
      const fs = require('fs');
      const tmpDir = path.resolve(process.cwd(), 'tmp');
      const outputFile = path.resolve(tmpDir, `${videoId}.m4a`);

      // Already cached
      if (fs.existsSync(outputFile)) {
        res.json({ ok: true, cached: true });
        return;
      }

      // Respond immediately, download in background
      res.json({ ok: true, cached: false, downloading: true });
      void downloadAudio(videoId).catch((e: Error) => {
        console.warn(`[Prefetch] Background download failed for ${videoId}:`, e.message);
      });
    } catch (err) {
      console.error('[Search] prefetch failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initiate prefetch' });
      }
    }
  });

  return router;
}

export function extractYoutubeIdOrSongId(input: string): string {
  if (!input) return '';
  let raw = decodeURIComponent(input).trim();
  
  // 1. If it contains a youtube watch URL
  if (raw.includes('youtube.com/watch')) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      const v = u.searchParams.get('v');
      if (v) {
        const m = v.match(/^([a-zA-Z0-9_-]{11})/);
        return m ? m[1] : v;
      }
    } catch (e) {}
  } else if (raw.includes('youtu.be/')) {
    const parts = raw.split('youtu.be/');
    if (parts[1]) {
      const idPart = parts[1].split('/')[0].split('?')[0];
      const m = idPart.match(/^([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
      return idPart;
    }
  }

  // 2. Strip prefixes
  const prefixes = ['youtube:', 'spotify-lazy:', 'ws-p2p:yt:', 'ws-p2p:'];
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) {
      raw = raw.slice(prefix.length);
      break;
    }
  }

  // 3. Check if it matches a 11-character YouTube ID optionally followed by _TIMESTAMP
  const ytIdMatch = raw.match(/^([a-zA-Z0-9_-]{11})(?:_\d+)?$/);
  if (ytIdMatch && ytIdMatch[1]) {
    return ytIdMatch[1];
  }

  // Fallback: strip timestamp if present
  let cleaned = raw.split('?')[0].split('&')[0];
  const timestampMatch = cleaned.match(/^(.+)(?:_\d{9,})$/);
  if (timestampMatch && timestampMatch[1]) {
    cleaned = timestampMatch[1];
  }

  return cleaned.trim();
}

// In-flight download lock: prevents multiple yt-dlp spawns for the same videoId
const inFlightDownloads = new Map<string, Promise<string>>();

export async function downloadAudio(rawInput: string): Promise<string> {
  const cleanId = extractYoutubeIdOrSongId(rawInput);
  if (!cleanId) throw new Error('Invalid input for audio download');

  if (cleanId.length < 11) {
    throw new Error(`Truncated YouTube ID '${cleanId}' from an earlier session. Please remove this song from the queue and re-add it.`);
  }

  // Return in-flight download promise if active
  if (inFlightDownloads.has(cleanId)) {
    console.log(`[Search] Download already in-flight for ${cleanId}, waiting...`);
    return inFlightDownloads.get(cleanId)!;
  }

  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');

  const promise = new Promise<string>(async (resolve, reject) => {
    let targetYoutubeId = cleanId;
    try {
      const tmpDir = path.resolve(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
      }

      const cachedOutputFile = path.resolve(tmpDir, `${cleanId}.m4a`);
      if (fs.existsSync(cachedOutputFile)) {
        try { fs.chmodSync(cachedOutputFile, 0o600); } catch (e) {}
        console.log(`[Search] Locally downloaded file found: ${cachedOutputFile}`);
        resolve(cachedOutputFile);
        return;
      }

      try {
        const dbSong = await prisma.song.findFirst({
          where: {
            OR: [
              { id: cleanId },
              { youtubeId: cleanId }
            ]
          }
        });

        if (dbSong) {
          if (dbSong.youtubeId) {
            targetYoutubeId = dbSong.youtubeId;
          } else {
            console.log(`[Search] Song in DB lacks youtubeId, resolving from DB metadata: ${dbSong.title} - ${dbSong.artist}`);
            const yt = await matchToYouTubeFallback(dbSong.title, dbSong.artist || '');
            if (yt?.youtubeId) {
              targetYoutubeId = yt.youtubeId;
              await prisma.song.update({
                where: { id: dbSong.id },
                data: { youtubeId: yt.youtubeId, youtubeThumbnail: yt.thumbnail }
              }).catch(err => console.warn('[Search] DB update failed:', err));
            }
          }

          // Re-check if resolved targetYoutubeId file is already downloaded
          const ytOutputFile = path.resolve(tmpDir, `${targetYoutubeId}.m4a`);
          if (fs.existsSync(ytOutputFile)) {
            try { fs.chmodSync(ytOutputFile, 0o600); } catch (e) {}
            console.log(`[Search] Locally downloaded file found for DB song YouTube ID: ${ytOutputFile}`);
            resolve(ytOutputFile);
            return;
          }
        }
      } catch (dbErr) {
        console.warn('[Search] DB lookup failed, falling back to direct download:', dbErr);
      }

      const finalOutputFile = path.resolve(tmpDir, `${targetYoutubeId}.m4a`);
      const url = `https://www.youtube.com/watch?v=${targetYoutubeId}`;
      console.log(`[Search] Downloading audio via yt-dlp from YouTube: ${url}`);

      const ytDlpPath = (() => {
        const paths = [
          path.resolve(__dirname, '../../yt-dlp'),
          path.resolve(__dirname, '../../bin/yt-dlp'),
          path.resolve(process.cwd(), 'yt-dlp'),
          path.resolve(process.cwd(), 'dev/syncbeats-server/yt-dlp'),
          path.resolve(process.cwd(), 'dev/syncbeats-server/bin/yt-dlp')
        ];
        for (const p of paths) {
          if (fs.existsSync(p)) {
            console.log(`[Search] Found yt-dlp binary at: ${p}`);
            return p;
          }
        }
        console.warn('[Search] yt-dlp binary not found in standard paths, falling back to system PATH');
        return 'yt-dlp';
      })();

      const ytDlpArgs = [
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '--extractor-args', 'youtube:player_client=android,web,tv',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        '--referer', 'https://www.youtube.com/',
        '--no-playlist',
        '-o', finalOutputFile,
        url
      ];

      console.log(`[Search] Spawning yt-dlp with args:`, ytDlpArgs);
      const ytDlp = spawn(ytDlpPath, ytDlpArgs);

      ytDlp.stdout.on('data', (data: any) => {
        console.log(`[Search-ytdlp-stdout]: ${data.toString().trim()}`);
      });

      ytDlp.stderr.on('data', (data: any) => {
        console.error(`[Search-ytdlp-stderr]: ${data.toString().trim()}`);
      });

      ytDlp.on('close', (code: number) => {
        inFlightDownloads.delete(cleanId);
        if (targetYoutubeId !== cleanId) inFlightDownloads.delete(targetYoutubeId);

        // Find file (finalOutputFile or any extension with targetYoutubeId)
        let downloadedFile = fs.existsSync(finalOutputFile) ? finalOutputFile : null;
        if (!downloadedFile) {
          try {
            const files = fs.readdirSync(tmpDir);
            const found = files.find((f: string) => f.startsWith(targetYoutubeId));
            if (found) downloadedFile = path.join(tmpDir, found);
          } catch (e) {}
        }

        if (code === 0 && downloadedFile && fs.existsSync(downloadedFile)) {
          try {
            fs.chmodSync(downloadedFile, 0o600);
            console.log(`[Search] Secured file permissions (0600) for: ${downloadedFile}`);
          } catch (err) {
            console.warn('[Search] Failed to set secure permissions:', err);
          }
          resolve(downloadedFile);
        } else {
          console.warn(`[Search] yt-dlp exited with code ${code}. Trying play-dl fallback stream...`);
          play.stream(url).then((streamRes: any) => {
            const outStream = fs.createWriteStream(finalOutputFile);
            streamRes.stream.pipe(outStream);
            outStream.on('finish', () => {
              try { fs.chmodSync(finalOutputFile, 0o600); } catch (e) {}
              console.log(`[Search] play-dl fallback download succeeded for: ${finalOutputFile}`);
              resolve(finalOutputFile);
            });
            outStream.on('error', (err: any) => {
              console.error(`[Search] play-dl stream pipe failed:`, err);
              reject(new Error(`yt-dlp exited with code ${code} & play-dl failed`));
            });
          }).catch((playErr: any) => {
            console.error(`[Search] play-dl fallback failed:`, playErr);
            reject(new Error(`yt-dlp exited with code ${code}`));
          });
        }
      });

      ytDlp.on('error', (err: any) => {
        inFlightDownloads.delete(cleanId);
        if (targetYoutubeId !== cleanId) inFlightDownloads.delete(targetYoutubeId);
        console.error('[Search] yt-dlp spawn error:', err);
        reject(err);
      });

    } catch (err) {
      inFlightDownloads.delete(cleanId);
      reject(err);
    }
  });

  inFlightDownloads.set(cleanId, promise);
  return promise;
}
