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
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
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
      const [dbRow, participants, queue] = await Promise.all([
        repo.findById(roomId),
        repo.getParticipants(roomId),
        repo.getQueue(roomId),
      ]);
      const liveRoom = roomManager.get(roomId);
      const snapshot = liveRoom ? liveRoom.snapshot() : null;

      res.json({ db: dbRow, live: snapshot, participants, queue });
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

  // POST /rooms/:roomId/enqueue-playlist
  router.post('/:roomId/enqueue-playlist', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const roomId = req.params.roomId as string;
      const { playlistId } = req.body;
      const userId = req.user!.sub;

      if (!playlistId) {
        res.status(400).json({ error: 'Missing playlistId' });
        return;
      }

      // Fetch the playlist and its tracks
      const playlist = await prisma.playlist.findUnique({
        where: { id: playlistId },
        include: { tracks: { orderBy: { position: 'asc' } } }
      });

      if (!playlist || playlist.tracks.length === 0) {
        res.status(404).json({ error: 'Playlist not found or empty' });
        return;
      }

      // Cap at 500 tracks to prevent server overload
      const MAX_TRACKS = 500;
      const tracks = playlist.tracks.slice(0, MAX_TRACKS);
      const wasCapped = playlist.tracks.length > MAX_TRACKS;

      const room = roomManager.getOrCreate(roomId);

      // ── Step 1: Check if room already has items (for isCurrent logic) ──
      const [existingCurrent, lastItem] = await Promise.all([
        prisma.roomQueueItem.findFirst({
          where: { roomId, isCurrent: true },
          select: { id: true }
        }),
        prisma.roomQueueItem.findFirst({
          where: { roomId },
          orderBy: { queueIndex: 'desc' },
          select: { queueIndex: true }
        })
      ]);

      const isFirstTrack = !existingCurrent;
      let nextQueueIndex = (lastItem?.queueIndex ?? -1) + 1;

      // ── Step 2: Resolve first track synchronously if queue is empty ──
      // This ensures playback can start immediately
      let firstTrackUrl = '';
      const firstTrack = tracks[0];
      const firstThumb = firstTrack.thumbnail ? `thumb=${encodeURIComponent(firstTrack.thumbnail)}` : '';
      const firstPidParam = `pid=${playlistId}`;
      const firstQs = `?${[firstThumb, firstPidParam].filter(Boolean).join('&')}`;

      if (isFirstTrack && !firstTrack.youtubeId) {
        console.log(`[Rooms] Resolving first lazy track synchronously: ${firstTrack.title}`);
        try {
          const ytResult = await matchToYouTubeFallback(firstTrack.title, firstTrack.artist || '');
          if (ytResult?.youtubeId) {
            firstTrackUrl = `youtube:${ytResult.youtubeId}${firstQs}`;
            await prisma.playlistTrack.update({
              where: { id: firstTrack.id },
              data: { youtubeId: ytResult.youtubeId }
            }).catch(() => {});
          } else {
            firstTrackUrl = `spotify-lazy:${firstTrack.id}${firstQs}`;
          }
        } catch {
          firstTrackUrl = `spotify-lazy:${firstTrack.id}${firstQs}`;
        }
      } else if (firstTrack.youtubeId) {
        firstTrackUrl = `youtube:${firstTrack.youtubeId}${firstQs}`;
      } else {
        firstTrackUrl = `spotify-lazy:${firstTrack.id}${firstQs}`;
      }

      // ── Step 3: Build all queue item data in memory ──
      const allItemData: any[] = [];

      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        let trackUrl: string;

        if (i === 0) {
          trackUrl = firstTrackUrl;
        } else {
          const thumbParam = track.thumbnail ? `thumb=${encodeURIComponent(track.thumbnail)}` : '';
          const pidParam = `pid=${playlistId}`;
          const qs = `?${[thumbParam, pidParam].filter(Boolean).join('&')}`;
          trackUrl = track.youtubeId ? `youtube:${track.youtubeId}${qs}` : `spotify-lazy:${track.id}${qs}`;
        }

        allItemData.push({
          roomId,
          uploaderUserId: userId,
          trackUrl,
          title: track.title || 'Unknown Track',
          artist: track.artist || null,
          fileName: 'playlist_track.yt',
          mimeType: 'video/youtube',
          sizeBytes: BigInt(0),
          queueIndex: nextQueueIndex + i,
          isCurrent: isFirstTrack && i === 0,
        });
      }

      // ── Step 4: Bulk insert in chunks of 200 ──
      // (createMany doesn't return IDs, so we fetch them after)
      const CHUNK_SIZE = 200;
      for (let i = 0; i < allItemData.length; i += CHUNK_SIZE) {
        const chunk = allItemData.slice(i, i + CHUNK_SIZE);
        // Workaround for Prisma createMany bug that causes Postgres syntax errors/binary corruption
        await prisma.$transaction(
          chunk.map((item: any) => prisma.roomQueueItem.create({ data: item }))
        );
      }

      // ── Step 5: Activate first track in room table if this is the first item ──
      if (isFirstTrack) {
        await prisma.room.update({
          where: { id: roomId },
          data: { trackUrl: firstTrackUrl, playbackState: 'PAUSED', positionMs: 0n }
        }).catch(() => {});
      }

      // ── Step 6: Fetch the final queue from DB and sync room state once ──
      const latestQueue = await repo.getQueue(roomId);
      room.syncQueue(latestQueue, latestQueue.find(q => q.isCurrent)?.id ?? null);

      // Emit single queueChanged event to all clients
      io.to(roomId).emit('room:queueChanged', { queue: latestQueue });

      console.log(`[Rooms] Enqueued ${tracks.length} tracks from playlist ${playlistId} in room ${roomId} (bulk insert)`);
      res.json({ 
        success: true, 
        enqueuedCount: tracks.length,
        ...(wasCapped ? { warning: `Playlist capped at ${MAX_TRACKS} tracks` } : {})
      });
    } catch (err) {
      console.error('[Rooms] enqueue playlist error:', err);
      res.status(500).json({ error: 'Failed to enqueue playlist' });
    }
  });

  // POST /rooms/:roomId/resolve-lazy
  // Used by the frontend prefetcher to resolve a lazy Spotify track into a YouTube track just-in-time
  router.post('/:roomId/resolve-lazy', requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const roomId = req.params.roomId as string;
      const { queueItemId, trackId, title, artist } = req.body;
      
      if (!queueItemId || !title) {
        res.status(400).json({ error: 'queueItemId and title required' });
        return;
      }

      console.log(`[Rooms] Resolving lazy track: ${title} - ${artist}`);
      
      // Make a call to our bridge resolve endpoint logic (we can just hit localhost or duplicate the RapidAPI fallback call here)
      // Since it's better to keep logic central, we'll fetch our own internal bridge endpoint
      const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';
      const resolveRes = await fetch(`${BACKEND_URL}/api/bridge/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.authorization || ''
        },
        body: JSON.stringify({ trackId, title, artist })
      });

      if (!resolveRes.ok) {
        res.status(404).json({ error: 'Failed to resolve lazy track' });
        return;
      }

      const data = await resolveRes.json() as { youtubeId?: string };
      const youtubeId = data.youtubeId;

      if (youtubeId) {
        const room = roomManager.getOrCreate(roomId);
        // Find the item in the queue and update its trackUrl
        const qItem = room.getQueue().find(q => q.id === queueItemId);
        if (qItem) {
          qItem.trackUrl = `youtube:${youtubeId}`;
          room.emit('queueChanged', room.getQueue());
        }
        res.json({ success: true, youtubeId });
      } else {
        res.status(404).json({ error: 'No youtube id returned' });
      }
    } catch (err) {
      console.error('[Rooms] resolve-lazy error:', err);
      res.status(500).json({ error: 'Failed to resolve lazy track' });
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

  // DELETE /rooms/:roomId/queue (Clear upcoming)
  router.delete('/:roomId/queue', requireAuth, async (req, res) => {
    try {
      const roomId = req.params['roomId'] as string;
      await repo.clearUpcomingQueue(roomId);
      
      const latestQueue = await repo.getQueue(roomId);
      const room = roomManager.getOrCreate(roomId);
      room.syncQueue(latestQueue, null);
      io.to(roomId).emit('room:queueChanged', { queue: latestQueue });
      io.to(roomId).emit('room:stateChanged', { state: room.snapshot() });

      res.json({ ok: true });
    } catch (err) {
      console.error('[Rooms] clear queue error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /rooms/:roomId/reset (Reset room completely — clear all queue & reset playback)
  router.post('/:roomId/reset', requireAuth, async (req: Request, res: Response) => {
    try {
      const roomId = req.params['roomId'] as string;
      await repo.clearEntireQueue(roomId);
      
      const room = roomManager.getOrCreate(roomId);
      room.resetRoom();
      io.to(roomId).emit('room:queueChanged', { queue: [] });
      io.to(roomId).emit('room:stateChanged', { state: room.snapshot() });
      io.to(roomId).emit('room:reset', { roomId });

      res.json({ ok: true, message: 'Room has been reset successfully.' });
    } catch (err) {
      console.error('[Rooms] reset room error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // DELETE /rooms/:roomId/queue/:itemId
  router.delete('/:roomId/queue/:itemId', requireAuth, async (req, res) => {
    try {
      const roomId = req.params['roomId'] as string;
      const itemId = req.params['itemId'] as string;
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

  // POST /rooms/:roomId/enqueue-youtube — rate limited
  router.post('/:roomId/enqueue-youtube', requireAuth, enqueueLimiter, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const { youtubeUrl, title: customTitle } = req.body as { youtubeUrl?: string; title?: string };
      const userId = req.user!.sub;

      if (!youtubeUrl) {
        res.status(400).json({ error: 'Missing youtubeUrl' });
        return;
      }
      if (customTitle && customTitle.length > 255) {
        res.status(400).json({ error: 'Title too long (max 255 chars)' });
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
            // Sanitize: external APIs can return strings with null bytes (0x00)
            if (data.title) title = data.title.replace(/\0/g, '').trim() || title;
          }
        } catch (e) {
          console.warn('[Rooms] Failed to fetch YouTube title via oEmbed', e);
        }
      }

      // Try to extract artist from title if it looks like "Artist - Title"
      let parsedArtist;
      let parsedTitle = title;
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        parsedArtist = parts[0].trim();
        parsedTitle = parts.slice(1).join(' - ').trim();
      }

      const { item, activated } = await repo.enqueueTrack(roomId as string, userId, {
        trackUrl: `youtube:${videoId}`,
        title: parsedTitle,
        artist: parsedArtist,
        fileName: `youtube_${videoId}.yt`,
        mimeType: 'video/youtube',
        sizeBytes: 0,
      });

      const room = roomManager.getOrCreate(roomId as string);
      room.addToQueue(item);

      const latestQueue = await repo.getQueue(roomId as string);
      io.to(roomId as string).emit('room:queueChanged', { queue: latestQueue });
      io.to(roomId as string).emit('room:stateChanged', { state: room.snapshot() });

      console.log(`[Rooms] Enqueued YouTube video ${videoId} in room ${roomId}`);
      res.status(201).json({ trackUrl: `youtube:${videoId}`, title, queued: !activated });
    } catch (err) {
      console.error('[Rooms] enqueue youtube error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // POST /rooms/:roomId/enqueue-magnet — rate limited
  router.post('/:roomId/enqueue-magnet', requireAuth, enqueueLimiter, async (req: Request, res: Response) => {
    try {
      const roomId = req.params['roomId'] as string;
      const { magnetUri, title, artist } = req.body as { magnetUri?: string; title?: string; artist?: string };
      const userId = req.user!.sub;

      if (!magnetUri) {
        res.status(400).json({ error: 'Missing magnetUri' });
        return;
      }

      const { item, activated } = await repo.enqueueTrack(roomId, userId, {
        trackUrl: magnetUri,
        title: title || 'P2P Track',
        artist: artist,
        fileName: 'webtorrent.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 0,
      });

      const room = roomManager.getOrCreate(roomId);
      room.addToQueue(item);

      const latestQueue = await repo.getQueue(roomId);
      io.to(roomId).emit('room:queueChanged', { queue: latestQueue });
      io.to(roomId).emit('room:stateChanged', { state: room.snapshot() });

      res.status(201).json({ item, queued: !activated });
    } catch (err) {
      console.error('[Rooms] enqueue-magnet error:', err);
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
