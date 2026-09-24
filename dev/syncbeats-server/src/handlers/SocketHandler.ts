import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { eventBus, EVENTS } from '../events/EventBus';
import { UserRepository } from '../auth/UserRepository';
import {
  JoinPayload, LeavePayload, SeekPayload, PingPayload, RoomSnapshot, SetParticipantVolumePayload, ChatMessage, SpatialPosition, RepeatMode
} from '../types';

/**
 * Bounds mirror `lib/spatial/geometry.ts` on the client. Enforced here as well
 * because this position is re-broadcast to every other device and fed straight
 * into their Web Audio AudioParams — a NaN from one client would otherwise
 * throw inside everyone else's audio graph.
 */
const MIN_RADIUS = 0.4;
const MAX_RADIUS = 4;
const MAX_ELEVATION = 45;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function sanitiseSpatialPosition(raw: unknown): SpatialPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const { angle, radius, elevation } = raw as Record<string, unknown>;
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null;
  if (typeof radius !== 'number' || !Number.isFinite(radius)) return null;
  if (elevation !== undefined && (typeof elevation !== 'number' || !Number.isFinite(elevation))) return null;

  // Normalise the angle into (-π, π] so a client sending accumulated radians
  // can't grow without bound.
  const TWO_PI = Math.PI * 2;
  let a = angle % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a <= -Math.PI) a += TWO_PI;

  return {
    angle: a,
    radius: clamp(radius, MIN_RADIUS, MAX_RADIUS),
    elevation: clamp(elevation ?? 0, -MAX_ELEVATION, MAX_ELEVATION),
  };
}

export class SocketHandler {
  private userRepo: UserRepository = new UserRepository();
  /** Coalesces the write-behind queue save; a burst of reorders costs one UPDATE. */


  constructor(
    private io:          Server,
    private roomManager: RoomManager,
    private roomRepo:    RoomRepository,
  ) {
    // Listen for play errors and forward to the requesting socket.
    eventBus.on('ROOM_PLAY_ERROR', ({ requesterId, message }) => {
      const socket = this.io.sockets.sockets.get(requesterId);
      if (socket) socket.emit('error', { message });
    });

    // Forward room state changes → socket.io rooms
    eventBus.on(EVENTS.ROOM_STATE_CHANGED, (snap: RoomSnapshot) => {
      this.io.to(snap.roomId).emit('room:stateChanged', snap);
      
      // Persist state to DB to recover after reloads or server restarts
      this.roomRepo.updateState(snap.roomId, snap.state, snap.position, snap.trackUrl).catch(err => {
        console.error(`[DB Sync] Failed to save state for room ${snap.roomId}:`, err);
      });
    });

    eventBus.on(EVENTS.PARTICIPANT_JOINED, ({ roomId, participant }: { roomId: string; participant: unknown }) => {
      this.io.to(roomId).emit('room:participantJoined', participant);
      
      const p = participant as any;
      if (p.userId) {
        this.roomRepo.recordParticipantJoin(roomId, p.userId, p.socketId, p.displayName).catch(err => {
          console.error(`[DB Sync] Failed to record join for ${p.userId} in ${roomId}:`, err);
        });
      }
    });

    eventBus.on(EVENTS.PARTICIPANT_LEFT, ({ roomId, socketId }: { roomId: string; socketId: string }) => {
      this.io.to(roomId).emit('room:participantLeft', socketId);

      this.roomRepo.recordParticipantLeave(roomId, socketId).catch(err => {
        console.error(`[DB Sync] Failed to record leave for socket ${socketId} in ${roomId}:`, err);
      });
    });

    eventBus.on(EVENTS.HOST_CHANGED, ({ roomId, hostId }: { roomId: string; hostId: string }) => {
      this.io.to(roomId).emit('room:hostChanged', hostId);
    });

    // When a file is uploaded → broadcast track URL to every client in room
    eventBus.on(EVENTS.TRACK_SET, ({ roomId, trackUrl, title }: { roomId: string; trackUrl: string; title: string }) => {
      console.log(`[Socket] Broadcasting room:trackSet to ${roomId}`);
      this.io.to(roomId).emit('room:trackSet', { trackUrl, title });
    });


    eventBus.on(EVENTS.PLAYBACK_SCHEDULE, (payload: any) => {
      this.io.to(payload.roomId).emit('playback:schedule', payload);
    });

    eventBus.on(EVENTS.PLAYBACK_PAUSE, (payload: any) => {
      this.io.to(payload.roomId).emit('playback:pause', payload);
    });
  }


  register(socket: Socket): void {
    console.log(`[WS] connected: ${socket.id}`);

    // ── Room management ──────────────────────────────────────────────────

    socket.on('room:join', async ({ roomId, displayName, userId, deviceId, isReady = false }: JoinPayload) => {
      try {
        // Protect against JWT tokens being passed as userId accidentally
        if (userId && userId.includes('.') && userId.length > 50) {
          console.warn(`[Socket] Received JWT token instead of userId from ${socket.id}. Ignoring.`);
          userId = undefined;
        }

        if (userId) {
          socket.data.userId = userId;
          socket.join(`user:${userId}`);
        }
        if (deviceId) {
          socket.data.deviceId = deviceId;
        }
        const room = this.roomManager.getOrCreate(roomId);

        // Allow multiple devices per user. Duplicate socket joins will simply overwrite in the Map.

        // Disconnect from previous room if any to prevent ghosts
        this.roomManager.handleDisconnect(socket.id);

        // Load from DB if fresh or if queue in memory is empty
        if (!room.getTrackUrl() && room.getParticipantCount() === 0) {
          const dbRoom = await this.roomRepo.findById(roomId);
          if (dbRoom) {
            room.initializeFromDatabase({
              hostId:        dbRoom.host_id,
              trackUrl:      dbRoom.track_url,
              playbackState: dbRoom.playback_state,
              positionMs:    dbRoom.position_ms,
              createdAt:     dbRoom.created_at,
              queue:         dbRoom.queue,
            });
          }
        }

        // --- Private Mode Gate ---
        const snapshot = room.snapshot();
        const isHost = snapshot.hostId === socket.data.userId;
        const roomHasActiveHost = snapshot.hostId !== null && room.getParticipantCount() > 0;

        // If joining an existing room, kick any ghost sockets with the same userId AND same deviceId
        // This ensures if a user joins from two DIFFERENT devices (e.g. iPhone and Mac), they aren't kicked.
        if (room && userId) {
          const existingGhosts = room.snapshot().participants.filter(
            (p: any) => p.userId === userId && p.deviceId === deviceId && p.socketId !== socket.id
          );
          for (const ghost of existingGhosts) {
            console.log(`[Room ${roomId}] Kicking ghost socket ${ghost.socketId} for user ${userId} on device ${deviceId}`);
            this.io.to(ghost.socketId).emit('room:kicked', { reason: 'Joined from another tab on this device' });
            this.io.sockets.sockets.get(ghost.socketId)?.disconnect();
            room.removeParticipant(ghost.socketId);
          }
        }

        if (room.getIsPrivate() && roomHasActiveHost && !isHost && !room.hasParticipant(socket.id)) {
          const hasJoinedBefore = await this.roomRepo.hasParticipantPreviouslyJoined(roomId, socket.data.userId);
          if (!hasJoinedBefore) {
            socket.emit('room:joinPendingApproval', { roomId });
            const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === snapshot.hostId);
            hostSockets.forEach(p => {
              this.io.to(p.socketId).emit('room:hostJoinRequest', { socketId: socket.id, userId: socket.data.userId, displayName });
            });
            return;
          }
        }
        // -------------------------

        if (room.hasParticipant(socket.id)) {
          socket.join(roomId);
          this.roomManager.trackSocket(socket.id, roomId);
          socket.emit('room:snapshot', room.snapshot());
          socket.emit('room:chat_history', { roomId, messages: room.getChatHistory() });
          return;
        }

        socket.join(roomId);
        this.roomManager.trackSocket(socket.id, roomId);
        room.addParticipant({ socketId: socket.id, displayName, userId: socket.data.userId, deviceId: socket.data.deviceId, joinedAt: Date.now(), isReady, volume: 100 });
        socket.emit('room:snapshot', room.snapshot());
        socket.emit('room:chat_history', { roomId, messages: room.getChatHistory() });
        console.log(`[Room ${roomId}] ${displayName} (${socket.id}) joined`);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('room:leave', ({ roomId }: LeavePayload) => {
      const room = this.roomManager.get(roomId);
      if (room) {
        // We should NOT pause the room just because one person leaves.
        room.removeParticipant(socket.id);
      }
      socket.leave(roomId);
    });

    socket.on('room:togglePrivate', ({ roomId, isPrivate }: { roomId: string, isPrivate: boolean }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      if (room.snapshot().hostId !== socket.data.userId) {
        socket.emit('error', { message: 'Only host can toggle private mode' });
        return;
      }
      room.setIsPrivate(isPrivate);
    });


    socket.on('room:approveJoin', ({ roomId, targetSocketId, displayName }: { roomId: string, targetSocketId: string, displayName: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room || room.snapshot().hostId !== socket.data.userId) return;
      
      const targetSocket = this.io.sockets.sockets.get(targetSocketId);
      if (!targetSocket) return;

      targetSocket.join(roomId);
      this.roomManager.trackSocket(targetSocketId, roomId);
      room.addParticipant({ socketId: targetSocketId, displayName, userId: targetSocket.data.userId, deviceId: targetSocket.data.deviceId, joinedAt: Date.now(), isReady: false, volume: 100 });
      targetSocket.emit('room:joinApproved');
      targetSocket.emit('room:snapshot', room.snapshot());
      console.log(`[Room ${roomId}] Host approved ${displayName} (${targetSocketId})`);

      // Clear the notification from all host devices
      const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === room.snapshot().hostId);
      hostSockets.forEach(p => {
        this.io.to(p.socketId).emit('room:joinRequestResolved', { targetSocketId });
      });
    });

    socket.on('room:denyJoin', ({ roomId, targetSocketId }: { roomId: string, targetSocketId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room || room.snapshot().hostId !== socket.data.userId) return;

      this.io.to(targetSocketId).emit('room:joinDenied');
      console.log(`[Room ${roomId}] Host denied ${targetSocketId}`);

      // Clear the notification from all host devices
      const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === room.snapshot().hostId);
      hostSockets.forEach(p => {
        this.io.to(p.socketId).emit('room:joinRequestResolved', { targetSocketId });
      });
    });

    socket.on('room:notifyHost', ({ roomId, displayName }: { roomId: string, displayName: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      const hostId = room.snapshot().hostId;
      if (hostId) {
        const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === hostId);
        hostSockets.forEach(p => {
          this.io.to(p.socketId).emit('room:hostJoinRequest', { socketId: socket.id, userId: socket.data.userId, displayName, isNudge: true });
        });
      }
    });

    socket.on('room:updateDevice', ({ roomId, deviceName, deviceType }: { roomId: string, deviceName?: string, deviceType?: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      room.updateParticipantDevice(socket.id, deviceName, deviceType);
    });

    socket.on('device:register', ({ deviceKey }: { deviceKey: string }) => {
      socket.join(deviceKey);
      console.log(`[WS] socket ${socket.id} registered for deviceKey: ${deviceKey}`);
    });

    socket.on('device:ping', ({ targetDeviceKey, message }: { targetDeviceKey: string, message?: string }) => {
      this.io.to(targetDeviceKey).emit('device:ping', { message: message || "Ping!", fromDeviceKey: socket.data.deviceKey || socket.id });
    });

    // ── Playback — any participant can control ────────────────────────────

    socket.on('playback:schedule', ({ roomId, trackUrl, positionMs, startTime, senderId, title, artist, thumbnail }: { roomId: string, trackUrl: string, positionMs: number, startTime: number, senderId?: string, title?: string, artist?: string, thumbnail?: string }) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.syncSchedule(trackUrl, positionMs, startTime, senderId, title, artist, thumbnail);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:play', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:pause', ({ roomId, positionMs, senderId }: { roomId: string; positionMs?: number, senderId?: string }) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        const pos = positionMs !== undefined ? positionMs : room.computeCurrentPosition();
        room.syncPause(pos, senderId);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:seek', ({ roomId, position }: SeekPayload) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.seek(socket.id, position);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── Queue ────────────────────────────────────────────────────────────
    //
    // next/prev are deliberately not debounced — hammering next should skip
    // several tracks. Only `playback:ended` needs a guard, and that lives in
    // RoomQueue.shouldAdvance() where the current track is known.

    socket.on('playback:next', ({ roomId }: { roomId: string }) => {
      this.roomManager.get(roomId)?.nextTrack(true);
    });

    socket.on('playback:prev', ({ roomId }: { roomId: string }) => {
      this.roomManager.get(roomId)?.prevTrack(true);
    });

    socket.on('playback:jumpTo', ({ roomId, trackId }: { roomId: string; trackId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room || !trackId) return;
      if (!room.setCurrentItem(trackId, true)) {
        socket.emit('error', { message: 'That track is no longer in the queue' });
      }
    });

    // Every device fires this at the end of a track; Room advances at most once.
    socket.on('playback:ended', ({ roomId, trackUrl }: { roomId: string; trackUrl: string }) => {
      this.roomManager.get(roomId)?.handleTrackEnded(trackUrl);
    });

    socket.on('room:removeFromQueue', ({ roomId, itemId }: { roomId: string; itemId: string }) => {
      this.roomManager.get(roomId)?.removeFromQueue(itemId);
    });

    socket.on('room:toggleShuffle', ({ roomId, shuffle }: { roomId: string; shuffle: boolean }) => {
      this.roomManager.get(roomId)?.setShuffle(!!shuffle);
    });

    socket.on('room:toggleRepeat', ({ roomId, repeatMode }: { roomId: string; repeatMode: RepeatMode }) => {
      if (!['off', 'all', 'track'].includes(repeatMode)) return;
      this.roomManager.get(roomId)?.setRepeatMode(repeatMode);
    });


    socket.on('room:reset', async ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (room) {
        room.resetRoom();
        this.io.to(roomId).emit('room:reset', { roomId });
      }
    });

    // ── Global Account Sync ──────────────────────────────────────────────────

    socket.on('sync:forceAll', async () => {
      const userId = socket.data.userId;
      if (!userId) return;

      // Find all sockets connected with this userId
      const sockets = await this.io.fetchSockets();
      const userSockets = sockets.filter(s => s.data.userId === userId);

      userSockets.forEach(s => {
        // Emit to every socket (including the sender, to ensure it turns on too)
        s.emit('sync:forceEnable');
      });
      console.log(`[WS] Force Syncing all ${userSockets.length} devices for user ${userId}`);
    });



    socket.on('room:setParticipantVolume', ({ roomId, targetSocketId, volume }: SetParticipantVolumePayload) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.setParticipantVolume(targetSocketId?.trim() || socket.id, volume);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── Client ready / buffering state ───────────────────────────────────

    socket.on('room:clientReady', ({ roomId, isReady = true }: { roomId: string, isReady?: boolean }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;

      room.setParticipantReady(socket.id, isReady);
      console.log(`[Room ${roomId}] ${socket.id} is ready: ${isReady}`);
    });

    socket.on('playback:blocked', ({ roomId, blocked }: { roomId: string; blocked: boolean }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;

      room.setParticipantBlocked(socket.id, blocked);
      console.log(`[Room ${roomId}] ${socket.id} is blocked: ${blocked}`);
    });

    // ── Peer-to-Peer file sharing relays via WebSockets ──────────────────────

    // Step 1 handshake: requester asks room "who has videoId X?"
    socket.on('track:check_cache', ({ roomId, videoId }: { roomId: string; videoId: string }) => {
      socket.to(roomId).emit('track:check_cache', { requesterSocketId: socket.id, videoId });
    });

    // Step 2 handshake: a peer who has it replies directly back to requester
    socket.on('track:cache_available', ({ targetSocketId, videoId }: { targetSocketId: string; videoId: string }) => {
      this.io.to(targetSocketId).emit('track:cache_available', { videoId, seederSocketId: socket.id });
    });

    // Step 3: requester asks the specific seeder (or broadcasts) for chunks
    socket.on('track:request_file', ({ roomId, trackUrl }: { roomId: string; trackUrl: string }) => {
      // Broadcast to everyone else in the room (excludes the sender) to find who has this file
      socket.to(roomId).emit('track:request_file', { requesterSocketId: socket.id, roomId, trackUrl });
    });

    // Step 4: seeder sends chunks — always direct-to-target for minimum latency
    // targetSocketId is always provided by the optimized seeder. roomId fallback kept for old clients.
    socket.on('track:send_chunk', ({ roomId, targetSocketId, trackUrl, chunkIndex, totalChunks, data }: any, callback?: () => void) => {
      if (targetSocketId) {
        // Fast path: direct unicast to requester only. No room broadcast.
        this.io.to(targetSocketId).emit('track:receive_chunk', { trackUrl, chunkIndex, totalChunks, data });
      } else if (roomId) {
        // Legacy fallback: older clients that don't send targetSocketId
        socket.to(roomId).emit('track:receive_chunk', { trackUrl, chunkIndex, totalChunks, data });
      }
      if (typeof callback === 'function') callback();
    });

    socket.on('track:request_missing_chunk', ({ roomId, trackUrl, chunkIndex }: { roomId: string, trackUrl: string, chunkIndex: number }) => {
      // Find the host or the person who has the track
      const room = this.roomManager.get(roomId);
      if (!room || !room.snapshot().hostId) return;

      const hostParticipant = room.snapshot().participants.find(p => p.userId === room.snapshot().hostId);
      if (hostParticipant) {
        // Ask the host to resend this specific chunk
        this.io.to(hostParticipant.socketId).emit('track:request_chunk_resend', { trackUrl, chunkIndex, targetSocketId: socket.id });
      }
    });

    socket.on('track:resend_chunk', ({ targetSocketId, trackUrl, chunkIndex, totalChunks, data }: any) => {
      // Host sends the chunk back, we route it directly to the requesting peer
      this.io.to(targetSocketId).emit('track:receive_chunk', { trackUrl, chunkIndex, totalChunks, data });
    });

    // ── Upload Progress ──────────────────────────────────────────────────

    socket.on('room:upload_progress', ({ roomId, title, progress }: { roomId: string, title: string, progress: number }) => {
      socket.to(roomId).emit('room:upload_progress', { title, progress });
    });

    socket.on('room:sync_progress', ({ roomId, progress }: { roomId: string, progress: number }) => {
      // Forward to other participants
      socket.to(roomId).emit('room:deviceSyncProgress', { socketId: socket.id, progress });
    });

    // Chat & Reactions
    socket.on('room:chat', async ({ roomId, message }: { roomId: string, message: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      const text = message?.trim();
      if (!text) return;

      const p = room.snapshot().participants.find(p => p.socketId === socket.id);
      const userId = socket.data.userId || p?.userId;
      let userDisplayName = p ? p.displayName : 'Guest';

      if (userId) {
        try {
          const user = await this.userRepo.findById(userId);
          if (user && user.name) {
            userDisplayName = user.name;
          }
        } catch (e) {}
      }

      const chatMsg: ChatMessage = {
        id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
        roomId,
        socketId: socket.id,
        userId: userId || undefined,
        displayName: userDisplayName,
        message: text,
        timestamp: Date.now()
      };

      room.addChatMessage(chatMsg);

      this.io.to(roomId).emit('room:chat', chatMsg);
    });

    socket.on('room:get_chat_history', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      socket.emit('room:chat_history', { roomId, messages: room.getChatHistory() });
    });

    socket.on('room:reaction', ({ roomId, emoji }: { roomId: string, emoji: string }) => {
      const room = this.roomManager.get(roomId);
      const p = room?.snapshot().participants.find(p => p.socketId === socket.id);
      
      socket.to(roomId).emit('room:reaction', { 
        socketId: socket.id,
        userId: p?.userId,
        displayName: p?.displayName || 'Guest',
        emoji 
      });
    });

    // ── NTP sync ─────────────────────────────────────────────────────────

    socket.on('sync:ping', ({ t0, seq }: PingPayload) => {
      const now = Date.now();
      socket.emit('sync:pong', { t0, t1: now, t2: now, seq });
    });

    socket.on('sync:stats', ({ roomId, latency, jitter }: { roomId: string, latency: number, jitter: number }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      room.updateParticipantStats(socket.id, latency, jitter);
      // Broadcast this lightweight payload to other users in the room
      socket.to(roomId).emit('room:participantStats', { socketId: socket.id, latency, jitter });
    });

    // ── Spatial Audio Sync ───────────────────────────────────────────────

    socket.on('spatial:update', (payload: { roomId?: unknown; deviceId?: unknown; position?: unknown }) => {
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : null;
      if (!roomId) return;
      const room = this.roomManager.get(roomId);
      if (!room) return;

      // Keys are either a socket id or the synthetic `seat:<userId>`. Bound the
      // length — this map is keyed by client-supplied strings and lives for the
      // life of the room.
      const deviceId = typeof payload?.deviceId === 'string' ? payload.deviceId.trim() : '';
      if (!deviceId || deviceId.length > 128) return;

      const position = sanitiseSpatialPosition(payload?.position);
      if (!position) return;

      room.setSpatialPosition(deviceId, position);

      // Broadcast to everyone else in the room (excludes the sender)
      socket.to(roomId).emit('spatial:update', { deviceId, position });
    });

    // ── Equalizer State Multi-Device Sync ─────────────────────────────────

    socket.on('room:eqUpdate', ({ roomId, gains }: { roomId: string; gains: number[] }) => {
      if (!roomId || !Array.isArray(gains)) return;
      // Broadcast EQ gains to all other devices in the room
      socket.to(roomId).emit('room:eqUpdate', { gains });
    });

    // ── Disconnect ───────────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`[WS] disconnected: ${socket.id} (${reason})`);
      this.roomManager.handleDisconnect(socket.id);
    });
  }
}
