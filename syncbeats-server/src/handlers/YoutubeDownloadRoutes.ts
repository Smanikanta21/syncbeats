import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { requireAuth } from '../auth/authMiddleware';
import { RoomManager } from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { uploadToS3 } from '../utils/s3';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const YTDLP_BIN = path.resolve(process.cwd(), 'bin', 'yt-dlp');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

export function createYoutubeDownloadRoutes(roomManager: RoomManager): Router {
  const router = Router();
  const repo = new RoomRepository();

  router.post('/:roomId/yt-download', requireAuth, async (req: Request, res: Response) => {
    const roomId = req.params.roomId as string;
    const { videoId, title } = req.body as { videoId?: string; title?: string };
    const userId = req.user!.sub;

    if (!videoId?.trim() || !title?.trim()) {
      res.status(400).json({ error: 'videoId and title are required' });
      return;
    }

    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      res.status(400).json({ error: 'Invalid YouTube videoId' });
      return;
    }

    try {
      // Basic quota check (this is an estimate since we don't know the exact file size yet)
      const usedBytes = await repo.getUserStorageUsageBytes(userId);
      if (usedBytes >= MAX_USER_STORAGE_BYTES) {
        res.status(413).json({ error: 'Storage quota exceeded (100MB per user)' });
        return;
      }

      // Download audio using yt-dlp (force MP3 so local /files streaming uses the correct content-type)
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      const filenameBase = `${Date.now()}_yt_${safeTitle}`;
      const tempPathTemplate = path.join(UPLOADS_DIR, `${filenameBase}.%(ext)s`);
      const downloadedFile = `${filenameBase}.mp3`;
      const filePath = path.join(UPLOADS_DIR, downloadedFile);

      console.log(`[YT Download] Starting download for ${videoId} to ${tempPathTemplate}`);

      await execFileAsync(YTDLP_BIN, [
        '-f', 'bestaudio',
        '-x',
        '--audio-format', 'mp3',
        '--no-playlist',
        '--no-progress',
        '--extractor-args', 'youtube:player_client=ios',
        '-o', tempPathTemplate,
        videoUrl,
      ]);

      if (!fs.existsSync(filePath)) {
        throw new Error('Downloaded file not found in uploads directory');
      }

      console.log(`[YT Download] Sending file ${downloadedFile} back to client transiently.`);

      // Send the file directly in the response and delete it from the server's disk instantly!
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('[YT Download] Error sending file:', err);
        }
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[YT Download] Temp file successfully unlinked: ${filePath}`);
          }
        } catch (unlinkErr) {
          console.error('[YT Download] Error deleting temp file:', unlinkErr);
        }
      });

    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Room not found') {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
      console.error('[YT Download] failed:', err);
      res.status(500).json({ error: 'Failed to download YouTube track' });
    }
  });

  return router;
}
