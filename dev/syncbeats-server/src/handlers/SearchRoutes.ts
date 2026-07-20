import { Router } from 'express';
import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';
import prisma from '../db/prisma';

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

  // In-flight download lock: prevents multiple yt-dlp spawns for the same videoId
  const inFlightDownloads = new Map<string, Promise<string>>();

  function downloadAudio(videoId: string): Promise<string> {
    // If already downloading this videoId, return the existing promise
    if (inFlightDownloads.has(videoId)) {
      console.log(`[Search] Download already in-flight for ${videoId}, waiting...`);
      return inFlightDownloads.get(videoId)!;
    }

    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    const tmpDir = path.resolve(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { mode: 0o700 });
    } else {
      try { fs.chmodSync(tmpDir, 0o700); } catch (e) {}
    }

    const outputFile = path.resolve(tmpDir, `${videoId}.m4a`);

    // Already cached on disk
    if (fs.existsSync(outputFile)) {
      try { fs.chmodSync(outputFile, 0o600); } catch (e) {}
      return Promise.resolve(outputFile);
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`[Search] Downloading audio via yt-dlp for: ${url}`);

    const promise = new Promise<string>((resolve, reject) => {
      const ytDlpPath = path.resolve(process.cwd(), 'yt-dlp');
      const ytDlp = spawn(ytDlpPath, ['-f', 'bestaudio[ext=m4a]', '-o', outputFile, url]);

      ytDlp.on('close', (code: number) => {
        inFlightDownloads.delete(videoId);
        if (code === 0 && fs.existsSync(outputFile)) {
          try {
            fs.chmodSync(outputFile, 0o600);
            console.log(`[Search] Secured file permissions (0600) for: ${outputFile}`);
          } catch (err) {
            console.warn('[Search] Failed to set secure permissions:', err);
          }
          resolve(outputFile);
        } else {
          console.error(`[Search] yt-dlp error: exited with code ${code}`);
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });

      ytDlp.on('error', (err: Error) => {
        inFlightDownloads.delete(videoId);
        reject(err);
      });
    });

    inFlightDownloads.set(videoId, promise);
    return promise;
  }

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
      console.error('[Search] stream failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download audio' });
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
