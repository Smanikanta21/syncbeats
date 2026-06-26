import { Router } from 'express';
import ytSearch from 'yt-search';
import ytdl from '@distube/ytdl-core';

export function createSearchRoutes(): Router {
  const router = Router();

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

  router.get('/youtube/download', (req, res) => {
    try {
      const videoId = req.query.videoId as string;
      if (!videoId) {
        res.status(400).json({ error: 'Query parameter "videoId" is required' });
        return;
      }

      const url = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[Search] Downloading audio via yt-dlp for: ${url}`);

      const { spawn } = require('child_process');
      const path = require('path');
      
      const ytDlpPath = path.resolve(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');
      const ytDlp = spawn(ytDlpPath, ['-f', 'bestaudio', '-o', '-', url]);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Transfer-Encoding', 'chunked');

      ytDlp.stdout.pipe(res);

      ytDlp.stderr.on('data', (data: any) => {
        // yt-dlp logs progress to stderr, we can ignore or log it
        // console.log(`[yt-dlp]: ${data.toString()}`);
      });

      ytDlp.on('close', (code: number) => {
        if (code !== 0) {
          console.error(`[Search] yt-dlp stream error: exited with code ${code}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download audio' });
          } else {
            res.end();
          }
        }
      });

      req.on('close', () => {
        ytDlp.kill();
      });

    } catch (err) {
      console.error('[Search] stream failed:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to initiate download stream' });
      } else {
        res.end();
      }
    }
  });

  return router;
}
