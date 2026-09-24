// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response } from 'express';
import { RoomManager }    from '../core/RoomManager';
import { RoomQueue }      from '../core/RoomQueue';
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
import { QueueTrackInput } from '../types';

// Strict YouTube video ID format — 11 alphanumeric/dash/underscore chars only
const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/

/** Playlists are capped so one import can't wedge a room. */
const MAX_PLAYLIST_TRACKS = 500;

/**
 * The client reads the cover art and source playlist straight off trackUrl, so they
 * ride along as a query string. `trackKey()` strips it, so two adds of the same video
 * from different playlists still dedup to one item.
 */
function withMeta(url: string, thumbnail?: string | null, playlistId?: string | null): string {
  const qs = [
    thumbnail  ? `thumb=${encodeURIComponent(thumbnail)}` : '',
    playlistId ? `pid=${encodeURIComponent(playlistId)}`  : '',
  ].filter(Boolean).join('&');
  return qs ? `${url}?${qs}` : url;
}

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
      // Room not in memory yet — rehydrate the queue from the stored document so the
      // client paints the right list before the socket connects.
      const queue = liveRoom
        ? liveRoom.getQueue()
        : RoomQueue.fromJSON(dbRow?.queue ?? null).snapshot();

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

  
  
  
  
  
  
  // ── Queue ────────────────────────────────────────────────────────────────
  //
  // Every mutation goes through Room, which emits queueChanged + stateChanged
  // exactly once and lets SocketHandler broadcast + persist. Routes never emit on
  // `io` themselves — the old double-broadcast is what let clients drift.

  // POST /rooms/:roomId/enqueue-youtube
  router.post('/:roomId/enqueue-youtube', requireAuth, enqueueLimiter, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { youtubeUrl, title: customTitle } = req.body as { youtubeUrl?: string; title?: string };

      if (!youtubeUrl) {
        res.status(400).json({ error: 'Missing youtubeUrl' });
        return;
      }
      if (customTitle && customTitle.length > 255) {
        res.status(400).json({ error: 'Title too long (max 255 chars)' });
        return;
      }

      const videoId =
        youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)?.[1]
        ?? youtubeUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/)?.[1];

      if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
        res.status(400).json({ error: 'Invalid YouTube URL' });
        return;
      }

      let title = customTitle || 'YouTube Video';
      if (!customTitle) {
        try {
          const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (oembed.ok) {
            const data = await oembed.json() as { title?: string };
            // External APIs occasionally return null bytes, which Postgres rejects.
            if (data.title) title = data.title.replace(/\0/g, '').trim() || title;
          }
        } catch (e) {
          console.warn('[Rooms] oEmbed title lookup failed', e);
        }
      }

      // "Artist - Title" is the dominant YouTube music convention; split it if present.
      let artist: string | undefined;
      let cleanTitle = title;
      if (title.includes(' - ')) {
        const parts = title.split(' - ');
        artist = parts[0].trim();
        cleanTitle = parts.slice(1).join(' - ').trim();
      }

      const room = roomManager.getOrCreate(roomId);
      const { added, first } = room.addTracks([{
        trackUrl:  withMeta(`youtube:${videoId}`, `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`),
        title:     cleanTitle,
        artist,
        fileName:  `youtube_${videoId}.yt`,
      }], req.user!.sub);

      // `first` is the existing item when this is a duplicate, so the client's
      // follow-up "play now" jump still lands on the right track.
      res.status(201).json({ item: first, queued: added.length > 0, duplicate: added.length === 0 });
    } catch (err) {
      console.error('[Rooms] enqueue youtube error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /rooms/:roomId/enqueue-magnet
  router.post('/:roomId/enqueue-magnet', requireAuth, enqueueLimiter, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { magnetUri, title, artist } = req.body as { magnetUri?: string; title?: string; artist?: string };
      if (!magnetUri?.startsWith('magnet:')) {
        res.status(400).json({ error: 'Missing or invalid magnetUri' });
        return;
      }

      const room = roomManager.getOrCreate(roomId);
      const { added, first } = room.addTracks([{
        trackUrl: magnetUri,
        title:    title || 'P2P Track',
        artist,
        fileName: 'webtorrent.mp3',
      }], req.user!.sub);

      res.status(201).json({ item: first, queued: added.length > 0, duplicate: added.length === 0 });
    } catch (err) {
      console.error('[Rooms] enqueue-magnet error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // POST /rooms/:roomId/enqueue-playlist
  router.post('/:roomId/enqueue-playlist', requireAuth, enqueueLimiter, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { playlistId, tracks: clientTracks } = req.body as { playlistId?: string; tracks?: any[] };
      if (!playlistId && !Array.isArray(clientTracks)) {
        res.status(400).json({ error: 'Missing playlistId or tracks' });
        return;
      }

      // YouTube playlists arrive already expanded from the client; SyncBeats/Spotify
      // playlists are read from our own tables.
      const isYoutube = Array.isArray(clientTracks) && clientTracks.length > 0;
      let rows: any[];

      if (isYoutube) {
        rows = clientTracks!;
      } else {
        if (!playlistId) {
          res.status(400).json({ error: 'Missing playlistId' });
          return;
        }
        const playlist = await prisma.playlist.findUnique({
          where: { id: playlistId },
          include: { tracks: { orderBy: { position: 'asc' } } },
        });
        if (!playlist || playlist.tracks.length === 0) {
          res.status(404).json({ error: 'Playlist not found or empty' });
          return;
        }
        rows = playlist.tracks;
      }

      const wasCapped = rows.length > MAX_PLAYLIST_TRACKS;
      rows = rows.slice(0, MAX_PLAYLIST_TRACKS);

      const inputs: QueueTrackInput[] = rows.map((t: any) => {
        const ytId = isYoutube ? (t.id || t.youtubeId) : t.youtubeId;
        // No YouTube match yet — queue a placeholder the prefetcher resolves just-in-time.
        const base = ytId ? `youtube:${ytId}` : `spotify-lazy:${t.id}`;
        return {
          trackUrl:  withMeta(base, t.thumbnail, playlistId),
          title:     t.title || 'Unknown Track',
          artist:    t.artist || '',
          thumbnail: t.thumbnail || undefined,
          fileName:  ytId ? `youtube_${ytId}.yt` : 'playlist_track.yt',
        };
      });

      const room = roomManager.getOrCreate(roomId);
      const { added, skipped, first } = room.addTracks(inputs, req.user!.sub);

      // The client jumps to `first` right after this returns, so it has to be playable.
      // Only pay for the lookup when it's still a placeholder (a re-play of an already
      // queued playlist returns the existing, already-resolved item).
      let head = first;
      if (head && head.trackUrl.startsWith('spotify-lazy:')) {
        const row = rows[0];
        try {
          const match = await matchToYouTubeFallback(head.title, head.artist || '');
          if (match?.youtubeId) {
            head = room.resolveQueueItem(head.id, withMeta(`youtube:${match.youtubeId}`, row?.thumbnail, playlistId)) ?? head;
            if (!isYoutube && row?.id) {
              await prisma.playlistTrack.update({
                where: { id: row.id },
                data: { youtubeId: match.youtubeId },
              }).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[Rooms] first-track resolve failed, leaving placeholder:', e);
        }
      }

      console.log(`[Rooms] Playlist ${playlistId ?? '(client)'} → room ${roomId}: +${added.length}, ${skipped} already queued`);
      res.json({
        success: true,
        item: head,
        enqueuedCount: added.length,
        skippedCount: skipped,
        ...(wasCapped ? { warning: `Playlist capped at ${MAX_PLAYLIST_TRACKS} tracks` } : {}),
      });
    } catch (err) {
      console.error('[Rooms] enqueue playlist error:', err);
      res.status(500).json({ error: 'Failed to enqueue playlist' });
    }
  });

  // POST /rooms/:roomId/resolve-lazy — prefetcher turns a spotify-lazy placeholder into a real track
  router.post('/:roomId/resolve-lazy', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { queueItemId, trackId, title, artist } = req.body as {
        queueItemId?: string; trackId?: string; title?: string; artist?: string;
      };
      if (!queueItemId || !title) {
        res.status(400).json({ error: 'queueItemId and title required' });
        return;
      }

      const room = roomManager.get(roomId);
      const item = room?.getQueue().find(q => q.id === queueItemId);
      if (!room || !item) {
        res.status(404).json({ error: 'Queue item not found' });
        return;
      }

      // Already resolved by another device that got here first.
      if (!item.trackUrl.startsWith('spotify-lazy:')) {
        res.json({ success: true, youtubeId: item.trackUrl.split('?')[0].replace('youtube:', '') });
        return;
      }

      const match = await matchToYouTubeFallback(title, artist || '');
      if (!match?.youtubeId) {
        res.status(404).json({ error: 'No YouTube match found' });
        return;
      }

      // Carry the `?thumb=…&pid=…` across — the client renders art from it.
      const qs = item.trackUrl.includes('?') ? `?${item.trackUrl.split('?')[1]}` : '';
      room.resolveQueueItem(queueItemId, `youtube:${match.youtubeId}${qs}`);

      if (trackId) {
        await prisma.playlistTrack.update({
          where: { id: trackId },
          data: { youtubeId: match.youtubeId },
        }).catch(() => {});
      }

      res.json({ success: true, youtubeId: match.youtubeId });
    } catch (err) {
      console.error('[Rooms] resolve-lazy error:', err);
      res.status(500).json({ error: 'Failed to resolve lazy track' });
    }
  });

  // PUT /rooms/:roomId/queue/reorder
  router.put('/:roomId/queue/reorder', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    const { itemId, newIndex } = req.body as { itemId?: string; newIndex?: number };

    if (!itemId || typeof newIndex !== 'number' || !Number.isFinite(newIndex)) {
      res.status(400).json({ error: 'Missing itemId or newIndex' });
      return;
    }

    const room = roomManager.get(roomId);
    if (!room || !room.moveInQueue(itemId, newIndex)) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }
    res.json({ ok: true, queue: room.getQueue() });
  });

  // DELETE /rooms/:roomId/queue/:itemId
  router.delete('/:roomId/queue/:itemId', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    const itemId = req.params['itemId'] as string;

    const room = roomManager.get(roomId);
    if (!room?.removeFromQueue(itemId)) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }
    res.json({ ok: true });
  });

  // DELETE /rooms/:roomId/queue — drop everything after the current track
  router.delete('/:roomId/queue', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const room = roomManager.get(req.params['roomId'] as string);
    room?.clearQueue(true);
    res.json({ ok: true });
  });

  // POST /rooms/:roomId/reset — clear the queue and stop playback
  router.post('/:roomId/reset', requireAuth, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    const room = roomManager.getOrCreate(roomId);
    room.resetRoom();
    io.to(roomId).emit('room:reset', { roomId });
    res.json({ ok: true, message: 'Room has been reset successfully.' });
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
