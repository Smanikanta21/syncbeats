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
      const fs = require('fs');
      
      const tmpDir = path.resolve(process.cwd(), 'tmp');
      if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir);
      }
      
      const outputFile = path.resolve(tmpDir, `${videoId}.m4a`);
      
      // If already downloaded, just serve it
      if (fs.existsSync(outputFile)) {
        return res.sendFile(outputFile);
      }

      const ytDlpPath = path.resolve(process.cwd(), 'yt-dlp');
      // Use bestaudio[ext=m4a] to force it to download AAC audio natively (which iOS AVPlayer supports)
      const ytDlp = spawn(ytDlpPath, ['-f', 'bestaudio[ext=m4a]', '-o', outputFile, url]);

      ytDlp.on('close', (code: number) => {
        if (code === 0) {
          if (!res.headersSent) {
            res.sendFile(outputFile);
          }
        } else {
          console.error(`[Search] yt-dlp error: exited with code ${code}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download audio' });
          }
        }
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
