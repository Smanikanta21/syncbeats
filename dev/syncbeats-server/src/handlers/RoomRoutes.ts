// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response } from 'express';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { requireAuth }    from '../auth/authMiddleware';
import { UserRepository } from '../auth/UserRepository';
import { Server } from 'socket.io';
import ytSearch from 'yt-search';
import axios from 'axios';

const repo = new RoomRepository();
const users = new UserRepository();

export function createRoomRoutes(roomManager: RoomManager, io: Server): Router {
  const router = Router();

  // GET /rooms/:roomId/youtube-search
  router.get('/:roomId/youtube-search', requireAuth, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Missing search query' });
        return;
      }

      const r = await ytSearch(q);
      const videos = r.videos.slice(0, 10);
      
      const results = videos.map((v: any) => ({
        url: v.url,
        type: 'stream',
        title: v.title,
        thumbnail: v.thumbnail,
        uploaderName: v.author.name,
        duration: v.seconds,
        views: v.views,
      }));
      
      res.json(results);
    } catch (err) {
      console.error('[Rooms] search youtube error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // GET /rooms/mine
  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const rooms = await repo.listByUser(req.user!.sub);
      res.json({ rooms });
    } catch (err) {
      console.error('[Rooms] mine error:', err);
      res.status(500).json({ error: 'Failed to fetch your rooms' });
    }
  });

  // GET /rooms/:roomId
  router.get('/:roomId', async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    try {
      const [dbRow, participants, queue] = await Promise.all([
        repo.findById(roomId),
        repo.getParticipants(roomId),
        repo.getQueue(roomId),
      ]);
      const liveRoom = roomManager.get(roomId);
      const snapshot = liveRoom ? liveRoom.snapshot() : null;
      res.json({ db: dbRow, live: snapshot, participants, queue });
    } catch (err) {
      console.error('[Rooms] get error:', err);
      res.status(500).json({ error: 'Failed to get room' });
    }
  });

  // POST /rooms — create room, persist to DB
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    const hostUserId = req.user!.sub;
    const roomId = (req.body as { roomId?: string }).roomId
      ?? Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const dbRoom = await repo.create(roomId, hostUserId);
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

  // PATCH /rooms/:roomId/host — transfer room ownership
  router.patch('/:roomId/host', requireAuth, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    const { newHostEmail } = req.body as { newHostEmail?: string };

    if (!newHostEmail?.trim()) {
      res.status(400).json({ error: 'newHostEmail is required' });
      return;
    }

    try {
      const target = await users.findByEmail(newHostEmail);
      if (!target) {
        res.status(404).json({ error: 'Target user not found' });
        return;
      }

      if (target.id === req.user!.sub) {
        res.status(400).json({ error: 'You are already the host' });
        return;
      }

      const transferred = await repo.transferHost(roomId, req.user!.sub, target.id);
      if (!transferred) {
        res.status(404).json({ error: 'Room not found or you are not the current host' });
        return;
      }

      res.json({ ok: true, roomId, newHostEmail: target.email });
    } catch (err) {
      console.error('[Rooms] host transfer error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // DELETE /rooms/:roomId/queue/:itemId
  router.delete('/:roomId/queue/:itemId', async (req, res) => {
    try {
      const { roomId, itemId } = req.params;
      console.log(`[Rooms] Request to remove queue item. Room: ${roomId}, Item: ${itemId}`);
      const success = await repo.removeQueueItem(roomId, itemId);
      
      if (!success) {
        console.error(`[Rooms] removeQueueItem failed for room ${roomId}, item ${itemId}`);
        res.status(400).json({ error: 'Failed to remove queue item.' });
        return;
      }

      // Re-fetch queue and broadcast to room
      const latestQueue = await repo.getQueue(roomId);
      const room = roomManager.get(roomId);
      if (room) {
        const currentItem = latestQueue.find(i => i.isCurrent);
        room.syncQueue(latestQueue, currentItem?.id ?? null);
        io.to(roomId).emit('room:queueChanged', { queue: latestQueue });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[Rooms] remove queue item error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // PUT /rooms/:roomId/queue/reorder
  router.put('/:roomId/queue/reorder', requireAuth, async (req, res) => {
    try {
      const roomId = req.params['roomId'] as string;
      const { itemId, newIndex } = req.body as { itemId: string; newIndex: number };

      if (typeof newIndex !== 'number' || !itemId) {
        res.status(400).json({ error: 'Missing itemId or newIndex' });
        return;
      }

      const success = await repo.reorderQueue(roomId, itemId, newIndex);
      if (!success) {
        res.status(404).json({ error: 'Failed to reorder queue. Item may not exist.' });
        return;
      }

      // Re-fetch queue and broadcast to room
      const latestQueue = await repo.getQueue(roomId);
      const room = roomManager.get(roomId);
      if (room) {
        // Use updateQueueOrder — NOT syncQueue — so we don't interrupt
        // the currently playing track (no position reset, no pause).
        room.updateQueueOrder(latestQueue);
        io.to(roomId).emit('room:queueChanged', { queue: latestQueue });
      }

      res.json({ ok: true, queue: latestQueue });
    } catch (err) {
      console.error('[Rooms] reorder queue error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /rooms/:roomId/enqueue-youtube
  router.post('/:roomId/enqueue-youtube', requireAuth, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { youtubeUrl, title: customTitle } = req.body as { youtubeUrl?: string; title?: string };
      const userId = req.user!.sub;

      if (!youtubeUrl) {
        res.status(400).json({ error: 'Missing youtubeUrl' });
        return;
      }

      // Extract video ID
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /^([a-zA-Z0-9_-]{11})$/,
      ];

      let videoId = null;
      for (const pattern of patterns) {
        const match = youtubeUrl.match(pattern);
        if (match) {
          videoId = match[1];
          break;
        }
      }

      if (!videoId) {
        res.status(400).json({ error: 'Invalid YouTube URL' });
        return;
      }

      // Fetch title via oEmbed if not provided
      let title = customTitle || "YouTube Video";
      if (!customTitle) {
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
          const oembedRes = await fetch(oembedUrl);
          if (oembedRes.ok) {
            const data = await oembedRes.json() as { title?: string };
            if (data.title) title = data.title;
          }
        } catch (e) {
          console.warn('[Rooms] Failed to fetch YouTube title via oEmbed', e);
        }
      }

      const { item, activated } = await repo.enqueueTrack(roomId as string, userId, {
        trackUrl: `youtube:${videoId}`,
        title,
        fileName: `youtube_${videoId}.yt`,
        mimeType: 'video/youtube',
        sizeBytes: 0,
      });

      const room = roomManager.getOrCreate(roomId as string);
      room.addToQueue(item);

      console.log(`[Rooms] Enqueued YouTube video ${videoId} in room ${roomId}`);
      res.status(201).json({ trackUrl: `youtube:${videoId}`, title, queued: !activated });
    } catch (err) {
      console.error('[Rooms] enqueue youtube error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /rooms/:roomId/enqueue-magnet
  router.post('/:roomId/enqueue-magnet', requireAuth, async (req: Request, res: Response) => {
    try {
      const roomId = req.params['roomId'] as string;
      const { magnetUri, title } = req.body as { magnetUri?: string; title?: string };
      const userId = req.user!.sub;

      if (!magnetUri) {
        res.status(400).json({ error: 'Missing magnetUri' });
        return;
      }

      const { item, activated } = await repo.enqueueTrack(roomId, userId, {
        trackUrl: magnetUri,
        title: title || 'P2P Track',
        fileName: 'webtorrent.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 0,
      });

      const room = roomManager.getOrCreate(roomId);
      room.addToQueue(item);

      res.status(201).json({ item, queued: !activated });
    } catch (err) {
      console.error('[Rooms] enqueue-magnet error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // GET /rooms/:roomId/yt-proxy?videoId=123
  router.get('/:roomId/yt-proxy', async (req: Request, res: Response) => {
    try {
      const { videoId } = req.query;
      if (!videoId || typeof videoId !== 'string') {
        res.status(400).json({ error: 'Missing videoId' });
        return;
      }

      console.log(`[Proxy] Requesting download URL from RapidAPI for: ${videoId}`);
      const RAPID_API_KEY = process.env.RAPID_API_KEY || '';
      if (!RAPID_API_KEY) {
        throw new Error('RAPID_API_KEY is not configured in the environment');
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiResponse = await axios.request({
        method: 'GET',
        url: 'https://youtube-mp310.p.rapidapi.com/download/mp3',
        params: { url: youtubeUrl },
        headers: {
          'x-rapidapi-key': RAPID_API_KEY,
          'x-rapidapi-host': 'youtube-mp310.p.rapidapi.com'
        },
        timeout: 30000,
      });

      const temporaryMp3Url = apiResponse.data.downloadUrl;
      if (!temporaryMp3Url) {
        throw new Error('RapidAPI failed to return a valid download link.');
      }

      console.log(`[Proxy] RapidAPI success! Proxying stream to client...`);

      // Fetch the actual MP3 stream from RapidAPI's temporary URL
      const streamRes = await fetch(temporaryMp3Url);
      if (!streamRes.ok || !streamRes.body) {
        throw new Error(`Failed to fetch audio stream from RapidAPI temp URL: ${streamRes.statusText}`);
      }

      res.setHeader('Content-Type', streamRes.headers.get('Content-Type') || 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="youtube_${videoId}.mp3"`);
      
      // Pipe the stream directly to the response (NO DISK STORAGE)
      const reader = streamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(value);
      }

    } catch (err) {
      console.error('[Proxy] yt-proxy error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
