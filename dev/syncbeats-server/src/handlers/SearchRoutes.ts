import { Router } from 'express';
import ytSearch from 'yt-search';
import prisma from '../db/prisma';
import { YT_ID_PATTERN } from '../utils/youtube';
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
        const m = v.match(new RegExp(`^(${YT_ID_PATTERN})`));
        return m ? m[1] : v;
      }
    } catch (e) {}
  } else if (raw.includes('youtu.be/')) {
    const parts = raw.split('youtu.be/');
    if (parts[1]) {
      const idPart = parts[1].split('/')[0].split('?')[0];
      const m = idPart.match(new RegExp(`^(${YT_ID_PATTERN})`));
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
  const ytIdMatch = raw.match(new RegExp(`^(${YT_ID_PATTERN})(?:_\\d+)?$`));
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

export function findYtDlpPath(): string {
  const path = require('path');
  const fs = require('fs');
  const paths = [
    '/opt/homebrew/bin/yt-dlp',
    path.resolve(process.cwd(), 'node_modules/youtube-dl-exec/bin/yt-dlp'),
    path.resolve(__dirname, '../../yt-dlp'),
    path.resolve(__dirname, '../../bin/yt-dlp'),
    path.resolve(process.cwd(), 'bin/yt-dlp'),
    path.resolve(process.cwd(), 'yt-dlp'),
    path.resolve(process.cwd(), 'dev/syncbeats-server/yt-dlp'),
    'yt-dlp'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return 'yt-dlp';
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
        // m4a/AAC, not Opus: AVAudioEngine (Swift app) and Safari can't decode Opus-in-webm.
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
        const lines = stdout.split('\n').map(l => l.trim()).filter(l => /^https?:\/\//.test(l));
        if (code === 0 && lines.length > 0) {
          resolve(lines[0]);
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

export async function streamYoutubeAudio(rawInput: string, _req: any, res: any): Promise<void> {
  const cleanId = extractYoutubeIdOrSongId(rawInput);
  if (!cleanId || cleanId.length < 5) {
    if (!res.headersSent) res.status(400).json({ error: `Truncated YouTube ID: ${rawInput}` });
    return;
  }

  const path = require('path');
  const fs   = require('fs');
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

  const ytDlpPath = findYtDlpPath();

  // ── Server-disk cache: tmp/<videoId>.m4a ─────────────────────────────────
  // Matches main branch: downloads AAC m4a audio natively via yt-dlp
  const tmpDir = path.resolve(process.cwd(), 'tmp');
  const outputFile = path.resolve(tmpDir, `${targetYoutubeId}.m4a`);

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  // ── Cache HIT — serve instantly ──────────────────────────────────────────
  if (fs.existsSync(outputFile)) {
    try {
      const stats = fs.statSync(outputFile);
      if (stats.size > 100 * 1024) {
        console.log(`[Search] Server-disk cache HIT for ${targetYoutubeId} — serving instantly (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return sendCachedAudio(res, outputFile);
      } else {
        console.warn(`[Search] Removing corrupted cached file for ${targetYoutubeId} (${stats.size} bytes)`);
        fs.unlinkSync(outputFile);
      }
    } catch {}
  }

  // ── In-flight deduplication ───────────────────────────────────────────────
  let inflight = inflightStreams.get(targetYoutubeId);
  if (inflight) {
    console.log(`[Search] Piggybacking on inflight download for ${targetYoutubeId}`);
    const success = await inflight;
    if (success && fs.existsSync(outputFile)) {
      return sendCachedAudio(res, outputFile);
    } else {
      return res.status(502).json({ error: 'YouTube track unavailable or restricted', videoId: targetYoutubeId });
    }
  }

  // ── Cache MISS — download via yt-dlp natively with RapidAPI fallback ──────
  console.log(`[Search] Downloading audio for: https://www.youtube.com/watch?v=${targetYoutubeId}`);

  const downloadPromise = (async (): Promise<boolean> => {
    const { spawn } = require('child_process');
    const partFile = `${outputFile}.part`;
    const rapidPartFile = `${outputFile}_rapid.tmp`;

    let childProcess: any = null;
    const abortController = new AbortController();

    const ytDlpPromise = new Promise<boolean>((resolve) => {
      const ytDlpArgs = [
        '--no-warnings',
        '--socket-timeout', '6',
        '--retries', '1',
        '-f', 'bestaudio[ext=m4a]/bestaudio/best',
        '--concurrent-fragments', '4',
        '-o', partFile,
        `https://www.youtube.com/watch?v=${targetYoutubeId}`
      ];
      const child = spawn(ytDlpPath, ytDlpArgs);
      childProcess = child;

      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
        resolve(false);
      }, 10000);

      child.on('close', (code: number) => {
        clearTimeout(timer);
        if (code === 0 && fs.existsSync(partFile)) {
          try {
            const stats = fs.statSync(partFile);
            if (stats.size > 100 * 1024) {
              if (!fs.existsSync(outputFile)) {
                fs.renameSync(partFile, outputFile);
                console.log(`[Search] Successfully downloaded ${targetYoutubeId} via yt-dlp (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
              }
              return resolve(true);
            }
          } catch {}
        }
        try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
        resolve(false);
      });
      child.on('error', (err: any) => {
        clearTimeout(timer);
        console.warn(`[Search] yt-dlp spawn error:`, err?.message || err);
        try { if (fs.existsSync(partFile)) fs.unlinkSync(partFile); } catch {}
        resolve(false);
      });
    });

    const rapidPromise = (async (): Promise<boolean> => {
      if (fs.existsSync(outputFile)) return true;
      const ok = await fetchViaRapidAPI(targetYoutubeId, rapidPartFile, abortController.signal);
      if (ok && fs.existsSync(rapidPartFile)) {
        if (!fs.existsSync(outputFile)) {
          try {
            const stats = fs.statSync(rapidPartFile);
            if (stats.size > 100 * 1024) {
              fs.renameSync(rapidPartFile, outputFile);
              console.log(`[Search] Successfully downloaded ${targetYoutubeId} via RapidAPI (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
              return true;
            }
          } catch {}
        }
      }
      try { if (fs.existsSync(rapidPartFile)) fs.unlinkSync(rapidPartFile); } catch {}
      return false;
    })();

    await new Promise<boolean>((resolve) => {
      let resolved = false;
      let finished = 0;
      const onDone = (ok: boolean) => {
        finished++;
        if (ok && !resolved) {
          resolved = true;
          if (childProcess) {
            try { childProcess.kill('SIGKILL'); } catch {}
          }
          abortController.abort();
          return resolve(true);
        }
        if (finished >= 2 && !resolved) {
          resolved = true;
          return resolve(false);
        }
      };
      ytDlpPromise.then(onDone);
      rapidPromise.then(onDone);
    });

    return fs.existsSync(outputFile);
  })();

  inflightStreams.set(targetYoutubeId, downloadPromise);
  let success = false;
  try {
    success = await downloadPromise;
  } finally {
    inflightStreams.delete(targetYoutubeId);
  }

  if (success && fs.existsSync(outputFile)) {
    return sendCachedAudio(res, outputFile);
  } else {
    if (!res.headersSent) {
      return res.status(502).json({ error: 'YouTube track unavailable or restricted', videoId: targetYoutubeId });
    }
  }
}

function sendCachedAudio(res: any, filePath: string) {
  const fs = require('fs');
  try {
    const buf = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const isMp3 = (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) || (buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0);
    if (isMp3) {
      res.type('audio/mpeg');
    } else {
      res.type('audio/mp4');
    }
  } catch {}
  res.setHeader('Accept-Ranges', 'bytes');
  return res.sendFile(filePath);
}

const inflightStreams = new Map<string, Promise<boolean>>();

const exhaustedRapidKeys = new Set<string>();

async function fetchViaRapidAPI(videoId: string, outputFile: string, signal?: AbortSignal): Promise<boolean> {
  const fs = require('fs');
  const downloadLink = await getRapidApiUrl(videoId, signal);
  if (!downloadLink || signal?.aborted) return false;
  try {
    const audioRes = await fetch(downloadLink, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': 'https://youtube-mp36.p.rapidapi.com/'
      }
    });
    if (!audioRes.ok) {
      console.warn(`[Proxy] RapidAPI audio download returned status ${audioRes.status}`);
      return false;
    }
    const arrayBuf = await audioRes.arrayBuffer();
    if (signal?.aborted) return false;
    if (arrayBuf.byteLength > 100 * 1024) {
      fs.writeFileSync(outputFile, Buffer.from(arrayBuf));
      return true;
    } else {
      console.warn(`[Proxy] RapidAPI returned too small buffer: ${arrayBuf.byteLength} bytes`);
    }
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      console.warn(`[Proxy] RapidAPI audio download error:`, err?.message || err);
    }
  }
  return false;
}

async function getRapidApiUrl(videoId: string, signal?: AbortSignal): Promise<string | null> {
  const keysStr = process.env.RAPID_API_KEYS || process.env.RAPID_API_KEY;
  if (!keysStr) return null;

  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
  let activeKeys = keys.filter(k => !exhaustedRapidKeys.has(k));
  if (activeKeys.length === 0) {
    exhaustedRapidKeys.clear();
    activeKeys = keys;
  }

  const shuffledKeys = [...activeKeys].sort(() => 0.5 - Math.random());

  for (const key of shuffledKeys) {
    if (signal?.aborted) return null;
    try {
      for (let poll = 0; poll < 3; poll++) {
        if (signal?.aborted) return null;
        const apiRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, {
          method: 'GET',
          signal,
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
          console.log(`[Proxy] RapidAPI link resolved using key ${key.slice(0, 5)}...`);
          return data.link;
        } else if (data.status === 'processing') {
          await new Promise(r => setTimeout(r, 1200));
        } else {
          break;
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn(`[Proxy] RapidAPI key evaluation error:`, err?.message || err);
      }
    }
  }
  return null;
}
