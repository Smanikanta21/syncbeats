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
    } catch (err) {
      res.status(500).json({ error: 'Failed to initiate prefetch' });
    }
  });

  router.get('/youtube/download', (req, res) => {
    const videoId = req.query.videoId as string;
    if (!videoId) {
      res.status(400).json({ error: 'Query parameter "videoId" is required' });
      return;
    }
    streamYoutubeAudio(videoId, req, res);
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

export async function resolveYoutubeAudioDirectUrl(youtubeId: string, ytDlpPath: string): Promise<string | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const { spawn } = require('child_process');

  const attempt = (useIpv6: boolean, extraArgs: string[]): Promise<string | null> => {
    return new Promise((resolve) => {
      const args = [
        ...(useIpv6 ? ['-6'] : []),
        '--extractor-args', 'youtube:player_client=mweb,ios,android',
        '--js-runtimes', 'node',
        '-g',
        '--no-warnings',
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
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
            console.warn(`[Search] yt-dlp attempt failed (IPv6:${useIpv6} ${extraArgs.join(' ')}): ${stderr.trim().slice(0, 150)}`);
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

  // Tier 1: IPv4 — CDN URL is IPv4-bound, matches Node.js proxy fetch (no IPv4/IPv6 403 mismatch)
  let url = await attempt(false, []);
  if (url) return url;

  // Tier 2: IPv6 fallback — useful on bot-checked IPs where IPv6 has better luck
  url = await attempt(true, []);
  if (url) return url;

  // Tier 3: play-dl fallback engine
  try {
    const play = require('play-dl');
    const stream = await play.stream(watchUrl, { quality: 2 });
    if (stream && stream.url) {
      console.log(`[Search] Fallback play-dl resolved URL for ${youtubeId}`);
      return stream.url;
    }
  } catch (playErr) {
    // ignore
  }

  // Tier 4: @distube/ytdl-core fallback engine
  try {
    const ytdl = require('@distube/ytdl-core');
    const info = await ytdl.getInfo(youtubeId);
    const format = ytdl.chooseFormat(info.formats, { filter: 'audioonly' });
    if (format?.url) {
      console.log(`[Search] Fallback ytdl-core resolved URL for ${youtubeId}`);
      return format.url;
    }
  } catch (ytdlErr) {
    // ignore
  }

  return null;
}

export async function streamYoutubeAudio(rawInput: string, req: any, res: any): Promise<void> {
  const cleanId = extractYoutubeIdOrSongId(rawInput);
  if (!cleanId || cleanId.length < 5) {
    if (!res.headersSent) res.status(400).json({ error: `Truncated YouTube ID: ${rawInput}` });
    return;
  }

  const path = require('path');
  const fs   = require('fs');
  const { spawn } = require('child_process');

  let targetYoutubeId = cleanId;

  // ── DB lookup: resolve Song ID → YouTube ID ────────────────────────────────
  try {
    const dbSong = await prisma.song.findFirst({
      where: { OR: [{ id: cleanId }, { youtubeId: cleanId }] }
    });
    if (dbSong?.youtubeId) {
      targetYoutubeId = dbSong.youtubeId;
    } else if (dbSong) {
      console.log(`[Search] Song in DB lacks youtubeId, resolving: ${dbSong.title} - ${dbSong.artist}`);
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
      'yt-dlp'
    ];
    for (const p of paths) {
      if (fs.existsSync && fs.existsSync(p)) return p;
    }
    return 'yt-dlp';
  })();

  // ── Server-disk cache: tmp/<videoId>.m4a ─────────────────────────────────
  // Matches main branch: downloads AAC m4a audio natively via yt-dlp
  const tmpDir = path.resolve(process.cwd(), 'tmp');
  const outputFile = path.resolve(tmpDir, `${targetYoutubeId}.m4a`);

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // ── Cache HIT — serve instantly ───────────────────────────────────────────
  if (fs.existsSync(outputFile)) {
    console.log(`[Search] Server-disk cache HIT for ${targetYoutubeId} — serving instantly`);
    return res.sendFile(outputFile);
  }

  // ── Cache MISS — download via parallel multi-source check (yt-dlp + RapidAPI) ──────
  const watchUrl = `https://www.youtube.com/watch?v=${targetYoutubeId}`;
  console.log(`[Search] Parallel fetching audio for: ${watchUrl}`);

  let isHandled = false;
  const sendSuccess = (sourceName: string) => {
    if (isHandled) return;
    isHandled = true;
    console.log(`[Search] Fastest source won: ${sourceName} for ${targetYoutubeId}`);
    if (!res.headersSent) res.sendFile(outputFile);
  };

  // Promise 1: yt-dlp execution
  const ytDlpPromise = new Promise<boolean>((resolve) => {
    const ytDlpArgs = ['-f', 'bestaudio[ext=m4a]', '-o', outputFile, watchUrl];
    const ytDlp = spawn(ytDlpPath, ytDlpArgs);
    ytDlp.on('close', (code: number) => {
      if (code === 0 && fs.existsSync(outputFile)) {
        sendSuccess('yt-dlp');
        resolve(true);
      } else {
        resolve(false);
      }
    });
    ytDlp.on('error', () => resolve(false));
  });

  // Promise 2: RapidAPI execution (runs concurrently in parallel)
  const rapidPromise = (async () => {
    // Slight 250ms offset to prioritize local yt-dlp if it's already cached or instantaneous
    await new Promise(r => setTimeout(r, 250));
    if (isHandled) return false;
    const rapidOutputFile = path.resolve(tmpDir, `${targetYoutubeId}_rapid.m4a`);
    const success = await fetchViaRapidAPI(targetYoutubeId, rapidOutputFile);
    if (success && fs.existsSync(rapidOutputFile) && !isHandled) {
      try {
        fs.renameSync(rapidOutputFile, outputFile);
      } catch (e) {
        // If rename fails because outputFile was created by yt-dlp, keep existing
      }
      sendSuccess('RapidAPI');
      return true;
    }
    return false;
  })();

  const results = await Promise.allSettled([ytDlpPromise, rapidPromise]);
  if (!isHandled) {
    isHandled = true;
    if (fs.existsSync(outputFile)) {
      res.sendFile(outputFile);
    } else {
      res.status(502).json({ error: 'YouTube track unavailable or restricted', videoId: targetYoutubeId });
    }
  }
}

const exhaustedRapidKeys = new Set<string>();

async function fetchViaRapidAPI(videoId: string, outputFile: string): Promise<boolean> {
  const fs = require('fs');
  const keysStr = process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY;
  if (!keysStr) return false;

  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
  let activeKeys = keys.filter(k => !exhaustedRapidKeys.has(k));
  if (activeKeys.length === 0) {
    exhaustedRapidKeys.clear();
    activeKeys = keys;
  }

  const shuffledKeys = [...activeKeys].sort(() => 0.5 - Math.random());

  for (const key of shuffledKeys) {
    try {
      let downloadLink = '';
      for (let poll = 0; poll < 5; poll++) {
        const apiRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': key,
            'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
          }
        });

        if (apiRes.status === 429 || apiRes.status === 403) {
          exhaustedRapidKeys.add(key);
          break;
        }

        if (!apiRes.ok) break;

        const data = (await apiRes.json()) as { link?: string; status?: string };
        if (data.link) {
          downloadLink = data.link;
          break;
        } else if (data.status === 'processing') {
          console.log(`[Proxy] RapidAPI processing ${videoId}... retry ${poll + 1}/5`);
          await new Promise(r => setTimeout(r, 1200));
        } else {
          break;
        }
      }

      if (downloadLink) {
        console.log(`[Proxy] RapidAPI link resolved using key ${key.slice(0, 5)}...`);
        const audioRes = await fetch(downloadLink);
        if (audioRes.ok) {
          const arrayBuf = await audioRes.arrayBuffer();
          fs.writeFileSync(outputFile, Buffer.from(arrayBuf));
          return true;
        }
      }
    } catch (err) {
      console.warn(`[Proxy] RapidAPI key evaluation error:`, err);
    }
  }
  return false;
}


