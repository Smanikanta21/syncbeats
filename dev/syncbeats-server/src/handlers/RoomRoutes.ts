// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response, NextFunction } from 'express';
import { RoomManager }    from '../core/RoomManager';
import { RoomQueue }      from '../core/RoomQueue';
import { RoomRepository, RoomRow } from '../db/RoomRepository';
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
import { fail, sendError, roomCodeError, roomCodeLookupError } from '../utils/errorHandler';

declare global {
  namespace Express {
    interface Request {
      /** Set by loadRoom — the route can assume the room exists and is live. */
      room?: RoomRow;
    }
  }
}


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

/**
 * Every `/:roomId` route must run this **after** its auth middleware. It proves the
 * code is real once, so handlers can stop calling roomManager.getOrCreate() — which
 * used to conjure an in-memory room for any code a client typed, and a later
 * room:join on that ghost then skipped its own DB check and persisted the fake room.
 *
 * It sits in each route rather than in router.param() on purpose: param callbacks
 * run before auth, which would turn these endpoints into an unauthenticated
 * "does this room code exist?" oracle over a 900k-wide keyspace.
 */
async function loadRoom(req: Request, res: Response, next: NextFunction): Promise<void> {
  const roomId = req.params['roomId'] as string;

  const bad = roomCodeLookupError(roomId);
  if (bad) { fail(res, 400, bad); return; }

  try {
    const row = await repo.findById(roomId);
    if (!row) {
      fail(res, 404, `No room found with code ${roomId}. Check the code and try again.`);
      return;
    }
    if (row.ended_at) {
      fail(res, 410, `Room ${roomId} has already ended. Ask the host to start a new one.`);
      return;
    }
    req.room = row;
    next();
  } catch (err) {
    sendError(res, err, "We couldn't look up that room right now. Please try again.");
  }
}

/**
 * Random 6-digit code, retried on collision. The old code generated once and let a
 * duplicate surface as a raw Prisma P2002, which the client saw as a bare 500.
 */
async function generateRoomCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    if (!(await repo.findById(code))) return code;
  }
  throw new Error('room code generation exhausted');
}

/**
 * The live Room for a request that already passed loadRoom, hydrated from the row
 * loadRoom fetched if this is the first time it's been touched since a restart.
 * Without the hydrate, enqueueing into a cold room starts from an empty queue and
 * the debounced save then overwrites the stored one — the queue just disappears.
 */
function liveRoom(roomManager: RoomManager, req: Request) {
  const row = req.room!;
  const room = roomManager.getOrCreate(row.id);
  if (!room.isHydrated) {
    room.initializeFromDatabase({
      hostId:        row.host_id,
      trackUrl:      row.track_url,
      playbackState: row.playback_state,
      positionMs:    row.position_ms,
      createdAt:     row.created_at,
      queue:         row.queue,
    });
  }
  return room;
}

export function createRoomRoutes(roomManager: RoomManager, io: Server): Router {
  const router = Router();

  // GET /rooms/:roomId/youtube-search — auth required, rate limited
  router.get('/:roomId/youtube-search', requireAuth, searchLimiter, loadRoom, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        fail(res, 400, 'Enter something to search for.');
        return;
      }
      if (q.length > 200) {
        fail(res, 400, 'That search is too long — keep it under 200 characters.');
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
      sendError(res, err, "YouTube search isn't responding right now. Please try again in a moment.", 502);
    }
  });

  // GET /rooms/youtube/details?videoId=ID — auth required
  router.get('/youtube/details', requireAuth, async (req: Request, res: Response) => {
    try {
      const { videoId } = req.query;
      if (!videoId || typeof videoId !== 'string') {
        fail(res, 400, 'Missing the YouTube video ID.');
        return;
      }
      const cleanId = videoId.replace(/^(?:youtube:)?/, '');
      if (!YOUTUBE_ID_RE.test(cleanId)) {
        fail(res, 400, "That doesn't look like a YouTube video ID.");
        return;
      }
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(cleanId)}&format=json`;
      const response = await fetch(oembedUrl);
      if (!response.ok) {
        fail(res, 404, 'That video is unavailable — it may be private or deleted.');
        return;
      }
      const data: any = await response.json();
      res.json({
        title: data.title,
        artist: data.author_name || 'YouTube',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      });
    } catch (err) {
      sendError(res, err, "We couldn't load details for that video. Please try again.", 502);
    }
  });

  // GET /rooms/youtube-suggest — auth required, rate limited
  router.get('/youtube/suggest', requireAuth, searchLimiter, async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        fail(res, 400, 'Enter something to search for.');
        return;
      }
      if (q.length > 200) {
        fail(res, 400, 'That search is too long — keep it under 200 characters.');
        return;
      }
      const response = await fetch(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`);
      const data = await response.json() as any;
      res.json(data[1] || []);
    } catch (err) {
      sendError(res, err, "Search suggestions aren't available right now.", 502);
    }
  });

  // GET /rooms/mine
  router.get('/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const { rooms, invitedRooms } = await repo.listByUser(req.user!.sub);
      res.json({ rooms, invitedRooms });
    } catch (err) {
      sendError(res, err, "We couldn't load your rooms. Please refresh and try again.");
    }
  });

  // GET /rooms/:roomId — auth required (room data is private)
  router.get('/:roomId', requireAuth, loadRoom, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    try {
      const dbRow = req.room!;
      const participants = await repo.getParticipants(roomId);
      const liveRoom = roomManager.get(roomId);
      const snapshot = liveRoom ? liveRoom.snapshot() : null;
      // Room not in memory yet — rehydrate the queue from the stored document so the
      // client paints the right list before the socket connects.
      const queue = liveRoom
        ? liveRoom.getQueue()
        : RoomQueue.fromJSON(dbRow.queue ?? null).snapshot();

      res.json({ db: dbRow, live: snapshot, participants, queue });
    } catch (err) {
      sendError(res, err, "We couldn't load that room. Please try again.");
    }
  });

  // POST /rooms/:roomId/invite
  router.post('/:roomId/invite', requireAuth, loadRoom, async (req: Request, res: Response) => {
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
        return fail(res, 400, "We need an email address or a user to send this invite to.");
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
      sendError(res, err, "We couldn't send that invite. Please check the email address and try again.");
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

      // No active room — create one. Handle race condition: if two devices hit this
      // simultaneously both see "no room" and both try to create. We retry the lookup
      // on any error so the second device returns the room the first one just created.
      let dbRoom;
      try {
        const roomId = await generateRoomCode();
        dbRoom = await repo.create(roomId, hostUserId);
        roomManager.getOrCreate(roomId);
        console.log(`[Rooms] Created default room ${roomId} for user ${hostUserId}`);
        void AuditLogger.info('ROOM_CREATE', `Created new room #${roomId} for user ${req.user?.email || hostUserId}`, req.ip);
        res.status(201).json({ roomId: dbRoom.id, createdAt: dbRoom.created_at, isNew: true });
      } catch (createErr) {
        // Concurrent device may have just created a room — retry the lookup
        const retryRoom = await repo.findActiveByHost(hostUserId);
        if (retryRoom) {
          roomManager.getOrCreate(retryRoom.id);
          console.log(`[Rooms] Race condition resolved — returning room ${retryRoom.id} for user ${hostUserId}`);
          res.json({ roomId: retryRoom.id, createdAt: retryRoom.created_at, isNew: false });
        } else {
          throw createErr; // genuine error, propagate
        }
      }
    } catch (err) {
      void AuditLogger.error('ROOM_CREATE_ERROR', `Failed to create room: ${(err as Error)?.message}`, req.ip);
      sendError(res, err, "We couldn't open a room for you just now. Please try again in a moment.");
    }
  });

  // POST /rooms — create room, persist to DB
  router.post('/', requireAuth, async (req: Request, res: Response) => {
    const hostUserId = req.user!.sub;

    try {
      // Strictly enforce one room per user
      let existingRoom = await repo.findActiveByHost(hostUserId);
      if (existingRoom) {
        fail(res, 409, 'You already have an active room. End your current room before creating a new one.');
        return;
      }

      // A client-chosen code has to look like one of ours, and has to be free —
      // this used to go into repo.create() unvalidated, so any string became a
      // room id and a collision surfaced as a bare 500.
      const requested = (req.body as { roomId?: string })?.roomId;
      let roomId: string;
      if (requested !== undefined && requested !== null && requested !== '') {
        const bad = roomCodeError(requested);
        if (bad) { fail(res, 400, bad); return; }
        if (await repo.findById(requested)) {
          fail(res, 409, `Room code ${requested} is already in use. Try a different code.`);
          return;
        }
        roomId = requested;
      } else {
        roomId = await generateRoomCode();
      }

      const dbRoom = await repo.create(roomId, hostUserId);
      roomManager.getOrCreate(roomId);
      console.log(`[Rooms] Created room ${roomId} by user ${hostUserId}`);
      void AuditLogger.info('ROOM_CREATE', `Created room #${roomId} by user ${req.user?.email || hostUserId}`, req.ip);
      res.status(201).json({ roomId: dbRoom.id, createdAt: dbRoom.created_at });
    } catch (err) {
      void AuditLogger.error('ROOM_CREATE_ERROR', `Failed to create room: ${(err as Error)?.message}`, req.ip);
      // Lost the race between the free-code check and the insert.
      if ((err as any)?.code === 'P2002') {
        fail(res, 409, 'That room code was just taken. Please try again.');
        return;
      }
      sendError(res, err, "We couldn't create your room. Please try again in a moment.");
    }
  });

  // DELETE /rooms/:roomId — mark ended (host only)
  router.delete('/:roomId', requireAuth, loadRoom, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    try {
      if (req.room!.host_id !== req.user!.sub) {
        fail(res, 403, 'Only the room host can end this room.');
        return;
      }
      await repo.markEnded(roomId);
      res.json({ ok: true });
    } catch (err) {
      sendError(res, err, "We couldn't end that room. Please try again.");
    }
  });



  // PATCH /rooms/:roomId/host — transfer room ownership
  router.patch('/:roomId/host', requireAuth, loadRoom, async (req: Request, res: Response) => {
    const roomId = req.params['roomId'] as string;
    const { newHostEmail } = req.body as { newHostEmail?: string };

    if (!newHostEmail?.trim()) {
      fail(res, 400, "Enter the email address of the person you'd like to make host.");
      return;
    }

    try {
      const target = await users.findByEmail(newHostEmail);
      if (!target) {
        fail(res, 404, `No SyncBeats account uses ${newHostEmail}. They need to sign up first.`);
        return;
      }

      if (target.id === req.user!.sub) {
        fail(res, 400, 'You are already the host of this room.');
        return;
      }

      const transferred = await repo.transferHost(roomId, req.user!.sub, target.id);
      if (!transferred) {
        fail(res, 403, 'Only the current host can hand this room over to someone else.');
        return;
      }

      res.json({ ok: true, roomId, newHostEmail: target.email });
    } catch (err) {
      sendError(res, err, "We couldn't transfer the host role. Please try again.");
    }
  });

  
  
  
  
  
  
  // ── Queue ────────────────────────────────────────────────────────────────
  //
  // Every mutation goes through Room, which emits queueChanged + stateChanged
  // exactly once and lets SocketHandler broadcast + persist. Routes never emit on
  // `io` themselves — the old double-broadcast is what let clients drift.

  // POST /rooms/:roomId/enqueue-youtube
  router.post('/:roomId/enqueue-youtube', requireAuth, enqueueLimiter, loadRoom, async (req: Request, res: Response): Promise<void> => {
    try {
      const { youtubeUrl, title: customTitle } = req.body as { youtubeUrl?: string; title?: string };

      if (!youtubeUrl) {
        fail(res, 400, 'Paste a YouTube link to add a song.');
        return;
      }
      if (customTitle && customTitle.length > 255) {
        fail(res, 400, 'That title is too long — keep it under 255 characters.');
        return;
      }

      const videoId =
        youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)?.[1]
        ?? youtubeUrl.match(/^(?:youtube:)?([a-zA-Z0-9_-]{11})$/)?.[1];

      if (!videoId || !YOUTUBE_ID_RE.test(videoId)) {
        fail(res, 400, "That doesn't look like a YouTube link. Copy the full URL from YouTube and try again.");
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

      const room = liveRoom(roomManager, req);
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
      sendError(res, err, "We couldn't add that song to the queue. Please try again.");
    }
  });

  // POST /rooms/:roomId/enqueue-magnet
  router.post('/:roomId/enqueue-magnet', requireAuth, enqueueLimiter, loadRoom, async (req: Request, res: Response): Promise<void> => {
    try {
      const { magnetUri, title, artist } = req.body as { magnetUri?: string; title?: string; artist?: string };
      if (!magnetUri?.startsWith('magnet:')) {
        fail(res, 400, 'That is not a valid magnet link — it should start with "magnet:".');
        return;
      }

      const room = liveRoom(roomManager, req);
      const { added, first } = room.addTracks([{
        trackUrl: magnetUri,
        title:    title || 'P2P Track',
        artist,
        fileName: 'webtorrent.mp3',
      }], req.user!.sub);

      res.status(201).json({ item: first, queued: added.length > 0, duplicate: added.length === 0 });
    } catch (err) {
      sendError(res, err, "We couldn't add that magnet link to the queue. Please try again.");
    }
  });

  // POST /rooms/:roomId/enqueue-playlist
  router.post('/:roomId/enqueue-playlist', requireAuth, enqueueLimiter, loadRoom, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { playlistId, tracks: clientTracks } = req.body as { playlistId?: string; tracks?: any[] };
      if (!playlistId && !Array.isArray(clientTracks)) {
        fail(res, 400, 'Choose a playlist to add.');
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
          fail(res, 400, 'Choose a playlist to add.');
          return;
        }
        const playlist = await prisma.playlist.findUnique({
          where: { id: playlistId },
          include: { tracks: { orderBy: { position: 'asc' } } },
        });
        if (!playlist || playlist.tracks.length === 0) {
          fail(res, 404, "That playlist is empty or no longer exists.");
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

      const room = liveRoom(roomManager, req);
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
      sendError(res, err, "We couldn't add that playlist to the queue. Please try again.");
    }
  });

  // POST /rooms/:roomId/resolve-lazy — prefetcher turns a spotify-lazy placeholder into a real track
  router.post('/:roomId/resolve-lazy', requireAuth, loadRoom, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    try {
      const { queueItemId, trackId, title, artist } = req.body as {
        queueItemId?: string; trackId?: string; title?: string; artist?: string;
      };
      if (!queueItemId || !title) {
        fail(res, 400, 'We need the queue item and its title to find a playable version.');
        return;
      }

      const room = roomManager.get(roomId);
      const item = room?.getQueue().find(q => q.id === queueItemId);
      if (!room || !item) {
        fail(res, 404, 'That track is no longer in the queue.');
        return;
      }

      // Already resolved by another device that got here first.
      if (!item.trackUrl.startsWith('spotify-lazy:')) {
        res.json({ success: true, youtubeId: item.trackUrl.split('?')[0].replace('youtube:', '') });
        return;
      }

      const match = await matchToYouTubeFallback(title, artist || '');
      if (!match?.youtubeId) {
        fail(res, 404, `We couldn't find a playable version of "${title}". Try adding it from YouTube instead.`);
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
      sendError(res, err, "We couldn't find a playable version of that track. Please try another.");
    }
  });

  // PUT /rooms/:roomId/queue/reorder
  router.put('/:roomId/queue/reorder', requireAuth, loadRoom, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    const { itemId, newIndex } = req.body as { itemId?: string; newIndex?: number };

    if (!itemId || typeof newIndex !== 'number' || !Number.isFinite(newIndex)) {
      fail(res, 400, "We couldn't work out where to move that track.");
      return;
    }

    const room = roomManager.get(roomId);
    if (!room || !room.moveInQueue(itemId, newIndex)) {
      fail(res, 404, 'That track is no longer in the queue — someone may have removed it.');
      return;
    }
    res.json({ ok: true, queue: room.getQueue() });
  });

  // DELETE /rooms/:roomId/queue/:itemId
  router.delete('/:roomId/queue/:itemId', requireAuth, loadRoom, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    const itemId = req.params['itemId'] as string;

    const room = roomManager.get(roomId);
    if (!room?.removeFromQueue(itemId)) {
      fail(res, 404, 'That track is no longer in the queue — someone may have removed it.');
      return;
    }
    res.json({ ok: true });
  });

  // DELETE /rooms/:roomId/queue — drop everything after the current track
  router.delete('/:roomId/queue', requireAuth, loadRoom, async (req: Request, res: Response): Promise<void> => {
    liveRoom(roomManager, req).clearQueue(true);
    res.json({ ok: true });
  });

  // POST /rooms/:roomId/reset — clear the queue and stop playback
  router.post('/:roomId/reset', requireAuth, loadRoom, async (req: Request, res: Response): Promise<void> => {
    const roomId = req.params['roomId'] as string;
    liveRoom(roomManager, req).resetRoom();
    io.to(roomId).emit('room:reset', { roomId });
    res.json({ ok: true, message: 'Room has been reset successfully.' });
  });

  // GET /rooms/:roomId/yt-proxy — CRITICAL: optionalAuth (supports ?token= query or guest streaming) + rate limited + videoId validation
  router.get('/:roomId/yt-proxy', optionalAuth, ytProxyLimiter, loadRoom, async (req: Request, res: Response) => {
    try {
      const { videoId } = req.query;
      if (!videoId || typeof videoId !== 'string') {
        fail(res, 400, 'Missing the YouTube video ID.');
        return;
      }

      // Strict format check — prevents path traversal and shell injection
      const cleanId = videoId.replace(/^(?:youtube:)?/, '');
      if (!YOUTUBE_ID_RE.test(cleanId)) {
        fail(res, 400, "That doesn't look like a YouTube video ID.");
        return;
      }

      console.log(`[Proxy] Live memory streaming audio for YouTube video: ${cleanId}`);
      await streamYoutubeAudio(cleanId, req, res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Truncated YouTube ID')) {
        console.warn(`[Proxy] Suppressed truncated ID request: ${req.query['videoId']}`);
        if (!res.headersSent) fail(res, 400, "That YouTube link looks incomplete. Try adding the song again.");
        return;
      }
      sendError(res, err, "We couldn't stream that song. It may be age-restricted or unavailable — try another.", 502);
    }
  });

  return router;
}
