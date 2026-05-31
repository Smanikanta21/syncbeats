import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { requireAuth } from '../auth/authMiddleware';
import { RoomManager } from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { uploadToS3 } from '../utils/s3';
import { promisify } from 'util';
import { Readable } from 'stream';

const execFileAsync = promisify(execFile);
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const YTDLP_BIN = path.resolve(process.cwd(), 'bin', 'yt-dlp');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

// ── Residential Worker Config ───────────────────────────────────────────
const YT_WORKER_URL = process.env.YT_WORKER_URL || '';       // e.g. https://yt-worker.syncbeats.app
const YT_WORKER_SECRET = process.env.YT_WORKER_SECRET || ''; // Shared secret for worker auth

export function createYoutubeDownloadRoutes(roomManager: RoomManager): Router {
  const router = Router();
  const repo = new RoomRepository();

  if (YT_WORKER_URL) {
    console.log(`[YT Download] Residential worker enabled: ${YT_WORKER_URL}`);
  } else {
    console.log(`[YT Download] No YT_WORKER_URL set — using local yt-dlp fallback`);
  }

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
      // Basic quota check
      const usedBytes = await repo.getUserStorageUsageBytes(userId);
      if (usedBytes >= MAX_USER_STORAGE_BYTES) {
        res.status(413).json({ error: 'Storage quota exceeded (100MB per user)' });
        return;
      }

      // ─── Strategy 1: Proxy through Residential Worker (Cloudflare Tunnel) ───
      if (YT_WORKER_URL) {
        try {
          await proxyThroughWorker(res, videoId, title);
          return;
        } catch (workerErr) {
          console.warn(`[YT Download] Worker proxy failed, falling back to local yt-dlp:`, workerErr);
          // Fall through to local yt-dlp below
        }
      }

      // ─── Strategy 2: Local yt-dlp fallback (with optional cookies) ──────────
      await downloadLocally(res, videoId, title);

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

// ─── Proxy download through the residential worker via Cloudflare Tunnel ────
async function proxyThroughWorker(res: Response, videoId: string, title: string): Promise<void> {
  console.log(`[YT Download] Proxying to residential worker: ${YT_WORKER_URL}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (YT_WORKER_SECRET) {
    headers['Authorization'] = `Bearer ${YT_WORKER_SECRET}`;
  }

  const workerRes = await fetch(`${YT_WORKER_URL}/download`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ videoId, title }),
    signal: AbortSignal.timeout(120_000), // 2 min timeout
  });

  if (!workerRes.ok) {
    const body = await workerRes.text().catch(() => '');
    throw new Error(`Worker responded ${workerRes.status}: ${body.slice(0, 200)}`);
  }

  console.log(`[YT Download] Worker streaming response — piping to client`);

  // Forward headers from worker response
  const contentType = workerRes.headers.get('content-type');
  const contentLength = workerRes.headers.get('content-length');
  const contentDisposition = workerRes.headers.get('content-disposition');

  if (contentType) res.setHeader('Content-Type', contentType);
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

  // Pipe the ReadableStream from fetch() into the Express response
  if (workerRes.body) {
    const readable = Readable.fromWeb(workerRes.body as any);
    readable.pipe(res);
    await new Promise<void>((resolve, reject) => {
      readable.on('end', resolve);
      readable.on('error', reject);
    });
    console.log(`[YT Download] Worker stream completed successfully`);
  } else {
    throw new Error('Worker response has no body');
  }
}

// ─── Local yt-dlp fallback (runs on this server's IP) ───────────────────────
async function downloadLocally(res: Response, videoId: string, title: string): Promise<void> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const filenameBase = `${Date.now()}_yt_${safeTitle}`;
  const tempPathTemplate = path.join(UPLOADS_DIR, `${filenameBase}.%(ext)s`);
  const downloadedFile = `${filenameBase}.mp3`;
  const filePath = path.join(UPLOADS_DIR, downloadedFile);

  console.log(`[YT Download] Local fallback — downloading ${videoId}`);

  const ytDlpArgs = [
    '-f', 'bestaudio',
    '-x',
    '--audio-format', 'mp3',
    '--no-playlist',
    '--no-progress',
    '-o', tempPathTemplate,
  ];

  const cookiesPath = path.resolve(process.cwd(), 'cookies.txt');
  if (fs.existsSync(cookiesPath)) {
    ytDlpArgs.push('--cookies', cookiesPath);
    console.log(`[YT Download] Using cookies.txt found at: ${cookiesPath}`);
  }

  ytDlpArgs.push(videoUrl);

  await execFileAsync(YTDLP_BIN, ytDlpArgs);

  if (!fs.existsSync(filePath)) {
    throw new Error('Downloaded file not found in uploads directory');
  }

  console.log(`[YT Download] Sending file ${downloadedFile} back to client transiently.`);

  // Send the file directly in the response and delete it from the server's disk instantly
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
}
