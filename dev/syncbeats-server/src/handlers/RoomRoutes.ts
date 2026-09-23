// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response } from 'express';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { requireAuth, optionalAuth }    from '../auth/authMiddleware';
import { UserRepository } from '../auth/UserRepository';
import prisma             from '../db/prisma';
import { matchToYouTubeFallback } from './MusicBridgeRoutes';
import { Server } from 'socket.io';
import ytSearch from 'yt-search';
import { streamYoutubeAudio } from './SearchRoutes';
import { searchLimiter, enqueueLimiter, ytProxyLimiter } from '../middleware/rateLimiter';
import { AuditLogger } from '../services/AuditLogger';

// Strict YouTube video ID format — 11 alphanumeric/dash/underscore chars only
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

const repo = new RoomRepository();
const users = new UserRepository();
const exhaustedRapidKeys = new Set<string>();

export function createRoomRoutes(roomManager: RoomManager, io: Server): Router {
  const router = Router();

  // GET /rooms/:roomId/youtube-search — auth required, rate limited
  router.get('/:roomId/youtube-search', requireAuth, searchLimiter, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Missing search query' });
        return;
      }
      if (q.length > 200) {
        res.status(400).json({ error: 'Search query too long (max 200 chars)' });
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

  // GET /rooms/youtube/details?videoId=ID — auth required
  router.get('/youtube/details', requireAuth, async (req: Request, res: Response) => {
    try {
      const { videoId } = req.query;
      if (!videoId || typeof videoId !== 'string') {
        res.status(400).json({ error: 'Missing videoId' });
        return;
      }
      const cleanId = videoId.replace(/^(?:youtube:)?/, '');
      if (!YOUTUBE_ID_RE.test(cleanId)) {
        res.status(400).json({ error: 'Invalid video ID format' });
        return;
      }
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}&format=json`;
      const response = await fetch(oembedUrl);
      if (!response.ok) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }
      const data: any = await response.json();
      res.json({
        title: data.title,
        artist: data.author_name || 'YouTube',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /rooms/youtube-suggest — auth required, rate limited
  router.get('/youtube/suggest', requireAuth, searchLimiter, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Missing search query' });
        return;
      }
      if (q.length > 200) {
        res.status(400).json({ error: 'Query too long' });
        return;
      }
      const response = await fetch(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`);
      const data = await response.json() as any;
      res.json(data[1] || []);
    } catch (err) {
      console.error('[Rooms] suggest youtube error:', err);
      res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
  });

  // GET /rooms/mine
  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const { rooms, invitedRooms } = await repo.listByUser(req.user!.sub);
      res.json({ rooms, invitedRooms });
    } catch (err) {
      console.error('[Rooms] mine error:', err);
      res.status(500).json({ error: 'Failed to fetch your rooms' });
    }
  });

  // GET /rooms/:roomId — auth required (room data is private)
  router.get('/:roomId', requireAuth, async (req: Request, res: Response) => {
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
      console.error(`[Rooms] GET /${roomId} error:`, err);
      res.status(500).json({ error: 'Failed to fetch room' });
    }
  });

  // POST /rooms/:roomId/invite
  router.post('/:roomId/invite', requireAuth, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    const { targetUserId, targetEmail } = req.body;
    try {
      const inviterId = req.user!.sub;
      const inviter = await users.findById(inviterId);
      
      let finalInviteeId: string | null = null;
      let finalEmail: string | null = null;

      if (targetUserId) {
        const invitee = await users.findById(targetUserId);
        if (invitee) {
          finalInviteeId = invitee.id;
          finalEmail = invitee.email;
        }
      } else if (targetEmail) {
        finalEmail = targetEmail;
        const existingUsers = await users.searchUsers(targetEmail, inviterId);
        if (existingUsers.length > 0 && existingUsers[0].email === targetEmail) {
          finalInviteeId = existingUsers[0].id;
        }
      }

      if (!finalEmail) {
        return res.status(400).json({ error: 'Invalid invite target' });
      }

      const invite = await repo.createInvite(roomId, inviterId, finalInviteeId, finalEmail);

      const frontendUrl = process.env.FRONTEND_URL || 'https://syncbeats.in';
      const inviteLink = finalInviteeId 
        ? `${frontendUrl}/room/${roomId}` 
        : `${frontendUrl}/login?mode=register&returnTo=/room/${roomId}`;

      const { AuthService } = await import('../auth/AuthService');
      const { buildRoomInviteHtml } = await import('../auth/EmailTemplates');
      const authService = new AuthService();
      const inviterName = inviter?.name || 'A friend';
      
      const htmlEmail = buildRoomInviteHtml(inviterName, roomId, inviteLink);
      const textEmail = `You're invited! ${inviterName} has invited you to join SyncBeats Room #${roomId}. Join here: ${inviteLink}`;

      await authService.sendEmail(
        finalEmail,
        `🎵 ${inviterName} invited you to SyncBeats Room #${roomId}`,
        htmlEmail,
        textEmail
      );

      res.json({ success: true, inviteId: invite.id });
    } catch (err) {
      console.error(`[Rooms] POST /${roomId}/invite error:`, err);
      res.status(500).json({ error: 'Failed to send invite' });
    }
  });

  // POST /rooms/default — fetch existing active room hosted by this user or create a persistent default room
  router.post('/default', requireAuth, async (req: Request, res: Response) => {
    const hostUserId = req.user!.sub;
    try {
      // Check for an existing active room hosted by this user
      let existingRoom = await repo.findActiveByHost(hostUserId);
      if (existingRoom) {
        roomManager.getOrCreate(existingRoom.id);
        console.log(`[Rooms] Reusing existing default room ${existingRoom.id} for user ${hostUserId}`);
        void AuditLogger.info('ROOM_DEFAULT', `Room #${existingRoom.id} active for user ${req.user?.email || hostUserId}`, req.ip);
        res.json({ roomId: existingRoom.id, createdAt: existingRoom.created_at, isNew: false });
        return;
      }

      // If no active room exists, create a new persistent room
      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      const dbRoom = await repo.create(roomId, hostUserId);
      roomManager.getOrCreate(roomId);
      console.log(`[Rooms] Created default room ${roomId} for user ${hostUserId}`);
      void AuditLogger.info('ROOM_CREATE', `Created new room #${roomId} for user ${req.user?.email || hostUserId}`, req.ip);
      res.status(201).json({ roomId: dbRoom.id, createdAt: dbRoom.created_at, isNew: true });
    } catch (err) {
      console.error('[Rooms] default room error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      void AuditLogger.error('ROOM_CREATE_ERROR', `Failed to create room: ${msg}`, req.ip);
      res.status(500).json({ error: msg });
    }
  });

  // POST /rooms — create room, persist to DB
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    const hostUserId = req.user!.sub;
    const roomId = (req.body as { roomId?: string })?.roomId
      ?? Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const dbRoom = await repo.create(roomId, hostUserId);
      roomManager.getOrCreate(roomId);
      console.log(`[Rooms] Created room ${roomId} by user ${hostUserId}`);
      void AuditLogger.info('ROOM_CREATE', `Created room #${roomId} by user ${req.user?.email || hostUserId}`, req.ip);
      res.status(201).json({ roomId: dbRoom.id, createdAt: dbRoom.created_at });
    } catch (err) {
      console.error('[Rooms] create error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      void AuditLogger.error('ROOM_CREATE_ERROR', `Failed to create room: ${msg}`, req.ip);
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

  
  
  
  
  
  
  // GET /rooms/:roomId/yt-proxy — CRITICAL: optionalAuth (supports ?token= query or guest streaming) + rate limited + videoId validation
  router.get('/:roomId/yt-proxy', optionalAuth, ytProxyLimiter, async (req: Request, res: Response) => {
    try {
      const { videoId } = req.query;
      if (!videoId || typeof videoId !== 'string') {
        res.status(400).json({ error: 'Missing videoId' });
        return;
      }

      // Strict format check — prevents path traversal and shell injection
      const cleanId = videoId.replace(/^(?:youtube:)?/, '');
      if (!YOUTUBE_ID_RE.test(cleanId)) {
        res.status(400).json({ error: 'Invalid video ID format' });
        return;
      }

      console.log(`[Proxy] Live memory streaming audio for YouTube video: ${cleanId}`);
      await streamYoutubeAudio(cleanId, req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Truncated YouTube ID')) {
        console.warn(`[Proxy] Suppressed truncated ID request: ${req.query['videoId']}`);
      } else {
        console.error('[Proxy] yt-proxy error:', err);
      }
      if (!res.headersSent) {
        res.status(400).json({ error: msg });
      }
    }
  });

  return router;
}
