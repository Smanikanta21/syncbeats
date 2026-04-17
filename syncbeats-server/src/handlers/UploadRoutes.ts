// handlers/UploadRoutes.ts — POST /rooms/:roomId/upload
// Accepts a multipart audio file, saves it to disk, broadcasts room:trackSet to all peers.

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path   from 'path';
import fs     from 'fs';
import { requireAuth }  from '../auth/authMiddleware';
import { RoomManager }  from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const MAX_USER_STORAGE_BYTES = 100 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB hard cap
  fileFilter: (_req, file, cb) => {
    const allowed = /audio\//;
    if (allowed.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only audio files are allowed'));
  },
});

export function createUploadRoutes(roomManager: RoomManager, baseUrl: string): Router {
  const router = Router();
  const repo = new RoomRepository();

  // POST /rooms/:roomId/upload
  router.post('/:roomId/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
    const { roomId } = req.params as { roomId: string };
    const file = req.file;
    const userId = req.user!.sub;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    try {
      const usedBytes = await repo.getUserStorageUsageBytes(userId);
      if (usedBytes + file.size > MAX_USER_STORAGE_BYTES) {
        fs.unlinkSync(file.path);
        res.status(413).json({ error: 'Storage quota exceeded (100MB per user)' });
        return;
      }

      const publicUrl = `/files/${file.filename}`;
      const title = file.originalname.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

      const { item, activated } = await repo.enqueueTrack(roomId, userId, {
        trackUrl: publicUrl,
        title,
        fileName: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });

      const room = roomManager.getOrCreate(roomId);
      room.addToQueue(item);

      console.log(`[Upload] Room ${roomId}: ${file.originalname} → ${publicUrl} (queued=${!activated})`);
      res.status(201).json({ trackUrl: publicUrl, title, queued: !activated });
    } catch (err) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Room not found') {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
      console.error('[Upload] upload failed:', err);
      res.status(500).json({ error: 'Failed to upload track' });
    }
  });

  return router;
}
