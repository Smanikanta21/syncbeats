import { Router } from 'express';
import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
import play from 'play-dl';
import prisma from '../db/prisma';
import { matchToYouTubeFallback } from './MusicBridgeRoutes';

const youtubeUrlCache = new Map<string, { url: string; expiresAt: number }>();

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

  // Image CORS proxy for album art color extraction
  router.get('/proxy-image', async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      if (!imageUrl || !imageUrl.startsWith('http')) {
        res.status(400).send('Invalid image URL');
        return;
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        res.status(response.status).send('Failed to fetch image');
        return;
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err) {
      res.status(500).send('Proxy error');
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

      await streamYoutubeAudio(videoId, req, res);
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
      res.json({ ok: true, directStreaming: true });
    } catch (err) {
      console.error('[Search] prefetch error:', err);
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

async function resolveYoutubeAudioDirectUrl(youtubeId: string, ytDlpPath: string): Promise<string | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const { spawn } = require('child_process');
  const path = require('path');
  const fs = require('fs');

  const cookieCandidates = [
    path.resolve(process.cwd(), 'cookies.txt'),
    path.resolve(__dirname, '../../cookies.txt'),
    '/app/cookies.txt'
  ];
  const foundCookiePath = cookieCandidates.find(p => fs.existsSync(p));
  const cookieArgs = foundCookiePath ? ['--cookies', foundCookiePath] : [];

  if (foundCookiePath) {
    console.log(`[Search] Using yt-dlp cookies from: ${foundCookiePath}`);
  }

  const attempt = (extraArgs: string[]): Promise<string | null> => {
    return new Promise((resolve) => {
      const args = [
        '-6',
        '-g',
        '--no-warnings',
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '--extractor-args', 'youtube:player_client=ios,android,tv',
        ...cookieArgs,
        ...extraArgs,
        watchUrl
      ];
      const child = spawn(ytDlpPath, args);
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (d: any) => { stdout += d.toString(); });
      child.stderr.on('data', (d: any) => { stderr += d.toString(); });
      
      child.on('close', (code: number) => {
        if (code === 0 && stdout.trim().startsWith('http')) {
          const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
          resolve(lines[0] || null);
        } else {
          if (stderr.trim()) {
            console.warn(`[Search] yt-dlp attempt failed (${extraArgs.join(' ')}): ${stderr.trim()}`);
          }
          resolve(null);
        }
      });
      child.on('error', (err: any) => {
        console.error(`[Search] yt-dlp spawn error:`, err);
        resolve(null);
      });
    });
  };

  let url = await attempt([]);
  if (url) return url;

  url = await attempt(['--extractor-args', 'youtube:player_client=mweb,web']);
  return url;
}

export async function streamYoutubeAudio(rawInput: string, req: any, res: any): Promise<void> {
  const cleanId = extractYoutubeIdOrSongId(rawInput);
  if (!cleanId || cleanId.length < 5) {
    if (!res.headersSent) res.status(400).json({ error: `Truncated YouTube ID: ${rawInput}` });
    return;
  }

  const path = require('path');
  const fs = require('fs');

  let targetYoutubeId = cleanId;

  try {
    const dbSong = await prisma.song.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { youtubeId: cleanId }
        ]
      }
    });

    if (dbSong?.youtubeId) {
      targetYoutubeId = dbSong.youtubeId;
    } else if (dbSong) {
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
  } catch (dbErr) {
    console.warn('[Search] DB lookup failed, falling back to direct stream:', dbErr);
  }

  const ytDlpPath = (() => {
    const paths = [
      path.resolve(__dirname, '../../yt-dlp'),
      path.resolve(__dirname, '../../bin/yt-dlp'),
      path.resolve(process.cwd(), 'yt-dlp'),
      path.resolve(process.cwd(), 'dev/syncbeats-server/yt-dlp'),
      path.resolve(process.cwd(), 'dev/syncbeats-server/bin/yt-dlp')
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'yt-dlp';
  })();

  let directAudioUrl: string | null = null;
  const cachedUrlEntry = youtubeUrlCache.get(targetYoutubeId);
  if (cachedUrlEntry && Date.now() < cachedUrlEntry.expiresAt) {
    console.log(`[Search] In-memory CDN URL cache HIT for YouTube video: ${targetYoutubeId}`);
    directAudioUrl = cachedUrlEntry.url;
  } else {
    console.log(`[Search] Resolving direct audio stream for YouTube video: ${targetYoutubeId}`);
    directAudioUrl = await resolveYoutubeAudioDirectUrl(targetYoutubeId, ytDlpPath);
    if (directAudioUrl) {
      // Cache URL for 15 minutes to handle dual-fetch (audio element + background stash) instantly
      youtubeUrlCache.set(targetYoutubeId, {
        url: directAudioUrl,
        expiresAt: Date.now() + 15 * 60 * 1000
      });
    }
  }

  if (!directAudioUrl) {
    console.error(`[Search] Failed to resolve audio stream for YouTube video: ${targetYoutubeId}`);
    res.status(404).json({ error: `YouTube track unavailable or restricted: ${targetYoutubeId}` });
    return;
  }

  console.log(`[Search] Streaming audio via fast direct CDN proxy: ${targetYoutubeId}`);

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (req.headers.range) {
      headers['Range'] = req.headers.range as string;
    }

    const audioResp = await fetch(directAudioUrl, { headers });
    if (!audioResp.ok && audioResp.status !== 206) {
      res.status(audioResp.status).json({ error: `GoogleVideo CDN returned HTTP ${audioResp.status}` });
      return;
    }

    res.status(audioResp.status);
    const contentType = audioResp.headers.get('content-type') || 'audio/mp4';
    const contentLength = audioResp.headers.get('content-length');
    const contentRange = audioResp.headers.get('content-range');

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', `inline; filename="${targetYoutubeId}.m4a"`);

    if (audioResp.body) {
      const reader = audioResp.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writableEnded) {
              res.write(Buffer.from(value));
            }
          }
          if (!res.writableEnded) res.end();
        } catch (pumpErr) {
          if (!res.writableEnded) res.end();
        }
      };
      pump();
    } else {
      res.end();
    }
  } catch (streamErr) {
    console.error('[Search] Stream proxy error:', streamErr);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream audio file' });
    }
  }
}
