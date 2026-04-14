// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response } from 'express';
import { RoomManager }     from '../core/RoomManager';
import { RoomRepository }  from '../db/RoomRepository';
import { requireAuth }     from '../auth/authMiddleware';

const repo = new RoomRepository();

export function createRoomRoutes(roomManager: RoomManager): Router {
  const router = Router();

  // GET /rooms — list active rooms from DB
  router.get('/', requireAuth, async (_req: Request, res: Response) => {
    try {
      const rooms = await repo.listActive();
      res.json({ rooms });
    } catch (err) {
      console.error('[Rooms] list error:', err);
      res.status(500).json({ error: 'Failed to list rooms' });
    }
  });

  // GET /rooms/mine — rooms created by the authed user
  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const rooms = await repo.listByUser(req.user!.sub);
      res.json({ rooms });
    } catch (err) {
      console.error('[Rooms] mine error:', err);
      res.status(500).json({ error: 'Failed to fetch your rooms' });
    }
  });

  // GET /rooms/:roomId — snapshot (in-memory) + DB row
  router.get('/:roomId', async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    try {
      const [dbRow, participants] = await Promise.all([
        repo.findById(roomId),
        repo.getParticipants(roomId),
      ]);
      const liveRoom = roomManager.get(roomId);
      const snapshot = liveRoom ? liveRoom.snapshot() : null;
      res.json({ db: dbRow, live: snapshot, participants });
    } catch (err) {
      console.error('[Rooms] get error:', err);
      res.status(500).json({ error: 'Failed to get room' });
    }
  });

  // POST /rooms — create room, persist to DB, and register in RoomManager
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    const hostUserId = req.user!.sub;
    // Allow client to supply a custom code, else generate one
    const roomId = (req.body as { roomId?: string }).roomId
      ?? Math.floor(100000 + Math.random() * 900000).toString();

    try {
      // 1. Persist to DB (FK → users.id)
      const dbRoom = await repo.create(roomId, hostUserId);

      // 2. Register in in-memory RoomManager
      roomManager.getOrCreate(roomId);

      console.log(`[Rooms] Created room ${roomId} by user ${hostUserId}`);
      res.status(201).json({ roomId: dbRoom.id, createdAt: dbRoom.created_at });
    } catch (err) {
      console.error('[Rooms] create error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // DELETE /rooms/:roomId — mark ended
  router.delete('/:roomId', requireAuth, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    try {
      await repo.markEnded(roomId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Rooms] delete error:', err);
      res.status(500).json({ error: 'Failed to end room' });
    }
  });

  return router;
}
