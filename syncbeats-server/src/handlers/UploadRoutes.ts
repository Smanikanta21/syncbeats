// handlers/UploadRoutes.ts — POST /rooms/:roomId/upload
// Accepts a multipart audio file, saves it to disk, broadcasts room:trackSet to all peers.

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path   from 'path';
import fs     from 'fs';
import { requireAuth }  from '../auth/authMiddleware';
import { RoomManager }  from '../core/RoomManager';
import { eventBus, EVENTS } from '../events/EventBus';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

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

  // POST /rooms/:roomId/upload
  router.post('/:roomId/upload', requireAuth, upload.single('file'), (req: Request, res: Response) => {
    const { roomId } = req.params as { roomId: string };
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Public relative URL the browser can fetch (absolute URLs break cross-device local networking)
    const publicUrl = `/files/${file.filename}`;

    // Strip extension for title
    const title = file.originalname.replace(/\.[^.]+$/, '').replace(/_/g, ' ');

    // Tell the Room's in-memory state about the new track
    const room = roomManager.getOrCreate(roomId);
    room.setTrackFromServer(publicUrl, title);

    // Broadcast to all socket.io clients in the room via EventBus
    eventBus.emit(EVENTS.TRACK_SET, { roomId, trackUrl: publicUrl, title });

    console.log(`[Upload] Room ${roomId}: ${file.originalname} → ${publicUrl}`);
    res.status(201).json({ trackUrl: publicUrl, title });
  });

  return router;
}
