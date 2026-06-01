// handlers/UploadRoutes.ts — POST /rooms/:roomId/upload
// Accepts JSON track metadata and enqueues it directly in the room, bypassing physical file storage.

import { Router, Request, Response } from 'express';
import { requireAuth }  from '../auth/authMiddleware';
import { RoomManager }  from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';

export function createUploadRoutes(roomManager: RoomManager, _baseUrl: string): Router {
  const router = Router();
  const repo = new RoomRepository();

  // POST /rooms/:roomId/upload
  router.post('/:roomId/upload', requireAuth, async (req: Request, res: Response) => {
    const { roomId } = req.params as { roomId: string };
    const { title, trackUrl, sizeBytes, mimeType } = req.body as {
      title?: string;
      trackUrl?: string;
      sizeBytes?: number;
      mimeType?: string;
    };
    const userId = req.user!.sub;

    if (!title || !trackUrl) {
      res.status(400).json({ error: 'title and trackUrl are required' });
      return;
    }

    try {
      const { item, activated } = await repo.enqueueTrack(roomId, userId, {
        trackUrl,
        title,
        fileName: trackUrl.split(':').pop() || 'local_track',
        mimeType: mimeType || 'audio/mpeg',
        sizeBytes: sizeBytes || 0,
      });

      const room = roomManager.getOrCreate(roomId);
      room.addToQueue(item);

      console.log(`[Metadata Enqueue] Room ${roomId}: ${title} → ${trackUrl} (queued=${!activated})`);
      res.status(201).json({ trackUrl, title, queued: !activated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'Room not found') {
        res.status(404).json({ error: 'Room not found' });
        return;
      }
      console.error('[Metadata Enqueue] failed:', err);
      res.status(500).json({ error: 'Failed to enqueue track metadata' });
    }
  });

  return router;
}
