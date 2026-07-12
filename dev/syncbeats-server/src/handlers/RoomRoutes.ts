// handlers/RoomRoutes.ts — /rooms REST endpoints (auth-protected)

import { Router, Request, Response } from 'express';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { requireAuth }    from '../auth/authMiddleware';
import { UserRepository } from '../auth/UserRepository';
import prisma             from '../db/prisma';
import { matchToYouTubeFallback } from './MusicBridgeRoutes';
import { Server } from 'socket.io';
import ytSearch from 'yt-search';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const repo = new RoomRepository();
const users = new UserRepository();

export function createRoomRoutes(roomManager: RoomManager, io: Server): Router {
  const router = Router();

  // GET /rooms/:roomId/youtube-search
  router.get('/:roomId/youtube-search', async (req: Request, res: Response) => {
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

  // GET /rooms/youtube-suggest
  router.get('/youtube/suggest', async (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      if (!q || typeof q !== 'string') {
        res.status(400).json({ error: 'Missing search query' });
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

      const frontendUrl = process.env.FRONTEND_URL || 'https://syncbeats.app';
      const inviteLink = finalInviteeId 
        ? `${frontendUrl}/room/${roomId}` 
        : `${frontendUrl}/login?mode=register&returnTo=/room/${roomId}`;

      const { AuthService } = await import('../auth/AuthService');
      const authService = new AuthService();
      await authService.sendEmail(
        finalEmail,
        `${inviter?.name || 'A friend'} invited you to a SyncBeats room!`,
        `<div style="font-family: sans-serif; color: #111;">
          <h2>You're invited!</h2>
          <p><strong>${inviter?.name || 'A friend'}</strong> has invited you to join their listening room on SyncBeats.</p>
          <p><a href="${inviteLink}" style="display: inline-block; padding: 10px 20px; background-color: #000; color: #fff; text-decoration: none; border-radius: 5px;">Join Room</a></p>
          <p>Or copy and paste this link into your browser: <br/>${inviteLink}</p>
        </div>`,
        `You're invited! ${inviter?.name || 'A friend'} has invited you to join their listening room on SyncBeats. Join here: ${inviteLink}`
      );

      res.json({ success: true, inviteId: invite.id });
    } catch (err) {
      console.error(`[Rooms] POST /${roomId}/invite error:`, err);
      res.status(500).json({ error: 'Failed to send invite' });
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

      const room = roomManager.getOrCreate(roomId);
      let enqueuedCount = 0;
      const currentQueueLen = room.getQueue().length;

      for (let i = 0; i < playlist.tracks.length; i++) {
        const track = playlist.tracks[i];
        let trackUrl = '';
        const thumbParam = track.thumbnail ? `thumb=${encodeURIComponent(track.thumbnail)}` : '';
        const pidParam = `pid=${playlistId}`;
        const queryParams = [thumbParam, pidParam].filter(Boolean).join('&');
        const qs = `?${queryParams}`;

        // If it's a lazy loaded track without youtubeId, use our special scheme
        if (!track.youtubeId) {
          // Resolve the very first track synchronously so playback can start instantly
          if (i === 0 && currentQueueLen === 0) {
            console.log(`[Rooms] Resolving first lazy track synchronously: ${track.title}`);
            try {
              const ytResult = await matchToYouTubeFallback(track.title, track.artist || '');
              if (ytResult && ytResult.youtubeId) {
                trackUrl = `youtube:${ytResult.youtubeId}${qs}`;
                await prisma.playlistTrack.update({
                  where: { id: track.id },
                  data: { youtubeId: ytResult.youtubeId }
                });
              } else {
                trackUrl = `spotify-lazy:${track.id}${qs}`;
              }
            } catch (e) {
              console.warn(`[Rooms] Sync resolve failed for first track:`, e);
              trackUrl = `spotify-lazy:${track.id}${qs}`;
            }
          } else {
            trackUrl = `spotify-lazy:${track.id}${qs}`;
          }
        } else {
          trackUrl = `youtube:${track.youtubeId}${qs}`;
        }

        const { item, activated } = await repo.enqueueTrack(roomId, userId, {
          trackUrl,
          title: track.title,
          fileName: `playlist_track.yt`,
          mimeType: 'video/youtube', // We treat them all as youtube eventually
          sizeBytes: 0,
        });

        room.addToQueue(item);
        enqueuedCount++;

        // Small delay to prevent database locks on massive playlists
        if (enqueuedCount % 10 === 0) {
          await new Promise(r => setTimeout(r, 50));
        }
      }

      console.log(`[Rooms] Enqueued ${enqueuedCount} tracks from playlist ${playlistId} in room ${roomId}`);
      res.json({ success: true, enqueuedCount });
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

      console.log(`[Proxy] Fetching YouTube audio via RapidAPI for video: ${videoId}`);
      
      const rapidApiKey = process.env.RAPID_API_KEY;
      if (!rapidApiKey) {
        throw new Error('RAPID_API_KEY is missing from environment variables');
      }

      const options = {
        method: 'GET',
        headers: {
          'x-rapidapi-key': rapidApiKey,
          'x-rapidapi-host': 'youtube-mp36.p.rapidapi.com'
        }
      };

      // 1. Ask RapidAPI for the direct MP3 link
      const apiRes = await fetch(`https://youtube-mp36.p.rapidapi.com/dl?id=${videoId}`, options);
      if (!apiRes.ok) {
        const errText = await apiRes.text();
        throw new Error(`RapidAPI returned ${apiRes.status}: ${errText}`);
      }
      
      const data = (await apiRes.json()) as { link?: string };
      if (!data.link) {
        throw new Error('RapidAPI did not return a valid download link. Response: ' + JSON.stringify(data));
      }

      console.log(`[Proxy] RapidAPI returned direct link. Piping audio...`);

      // 2. Fetch the actual MP3 stream
      const audioRes = await fetch(data.link);
      if (!audioRes.ok || !audioRes.body) {
        throw new Error(`Failed to fetch MP3 stream from RapidAPI link. Status: ${audioRes.status}`);
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', `attachment; filename="youtube_${videoId}.mp3"`);

      if (audioRes.headers.has('content-length')) {
        res.setHeader('Content-Length', audioRes.headers.get('content-length')!);
      }

      const { Readable } = require('stream');
      const readable = Readable.fromWeb(audioRes.body as any);
      
      // 3. Pipe the Web Stream to the Express Response
      readable.pipe(res);

    } catch (err) {
      console.error('[Proxy] yt-proxy error:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) {
        res.status(500).json({ error: msg });
      }
    }
  });

  return router;
}
