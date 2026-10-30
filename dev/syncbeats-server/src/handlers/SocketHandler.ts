import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { RoomPersistence } from '../core/RoomPersistence';

import { UserRepository } from '../auth/UserRepository';
import {
  JoinPayload, LeavePayload, SeekPayload, PingPayload, RoomSnapshot, SetParticipantVolumePayload, ChatMessage, RepeatMode
} from '../types';
import { roomCodeLookupError, logErrorToFile } from '../utils/errorHandler';

function emitSafeError(socket: Socket, err: unknown, source: string, payload?: unknown): void {
  // Always logged — a non-internal error is still a failure worth a trail.
  const explanation = logErrorToFile(err, { source, body: payload });
  socket.emit('error', { message: explanation.userFacingMessage });
}

export class SocketHandler {
  private userRepo: UserRepository = new UserRepository();
  private readonly persistence: RoomPersistence;

  constructor(
    private io:          Server,
    private roomManager: RoomManager,
    private roomRepo:    RoomRepository,
  ) {
    this.persistence = new RoomPersistence(
      (roomId, state) => this.roomRepo.savePlaybackState(roomId, state),
      (roomId, error) => logErrorToFile(error, { source: 'Room persistence: ' + roomId }),
    );
    // Forward room state changes → socket.io rooms
    this.roomManager.on('room:stateChanged', (snap: RoomSnapshot) => {
      this.io.to(snap.roomId).emit('room:stateChanged', snap);

      const room = this.roomManager.get(snap.roomId);
      if (room?.isHydrated) {
        this.persistence.schedule(snap.roomId, {
          state: snap.state, positionMs: snap.position, trackUrl: snap.trackUrl,
          queue: room.getQueueState(),
        });
      }
    });

    this.roomManager.on('room:participantJoined', ({ roomId, participant }: { roomId: string; participant: unknown }) => {
      this.io.to(roomId).emit('room:participantJoined', participant);

      const p = participant as any;
      if (p.userId) {
        this.roomRepo.recordParticipantJoin(roomId, p.userId, p.socketId, p.displayName).catch(err => {
          logErrorToFile(err, { source: `DB Sync: recordParticipantJoin ${p.userId} in room ${roomId}` });
          console.error(`[DB Sync] Failed to record join for ${p.userId} in ${roomId}:`, err);
        });
      }
    });

    this.roomManager.on('room:participantLeft', ({ roomId, socketId }: { roomId: string; socketId: string }) => {
      this.io.to(roomId).emit('room:participantLeft', socketId);

      this.roomRepo.recordParticipantLeave(roomId, socketId).catch(err => {
        console.error(`[DB Sync] Failed to record leave for socket ${socketId} in ${roomId}:`, err);
      });

      const room = this.roomManager.get(roomId);
      if (room?.isHydrated) {
        const snap = room.snapshot();
        this.persistence.schedule(roomId, {
          state: snap.state, positionMs: snap.position, trackUrl: snap.trackUrl,
          queue: room.getQueueState(),
        });
        void this.persistence.flush(roomId).catch(err => {
          console.error(`[DB Sync] Immediate flush on participant leave failed for ${roomId}:`, err);
        });
      }
    });

    this.roomManager.on('room:hostChanged', ({ roomId, hostId }: { roomId: string; hostId: string }) => {
      this.io.to(roomId).emit('room:hostChanged', hostId);
    });

    // When a file is uploaded → broadcast track URL to every client in room
    this.roomManager.on('room:trackSet', ({ roomId, trackUrl, title }: { roomId: string; trackUrl: string; title: string }) => {
      console.log(`[Socket] Broadcasting room:trackSet to ${roomId}`);
      this.io.to(roomId).emit('room:trackSet', { roomId, roomInstanceId: this.roomManager.get(roomId)?.snapshot().roomInstanceId, trackUrl, title });

      const room = this.roomManager.get(roomId);
      if (room?.isHydrated) {
        const snap = room.snapshot();
        this.persistence.schedule(roomId, {
          state: snap.state, positionMs: snap.position, trackUrl: snap.trackUrl,
          queue: room.getQueueState(),
        });
        void this.persistence.flush(roomId).catch(err => {
          console.error(`[DB Sync] Immediate flush on trackSet failed for ${roomId}:`, err);
        });
      }
    });

    this.roomManager.on('room:queueChanged', ({ roomId, queue }: { roomId: string; queue: any[] }) => {
      const snap = this.roomManager.get(roomId)?.snapshot();
      this.io.to(roomId).emit('room:queueChanged', {
        roomId, roomInstanceId: snap?.roomInstanceId, queue, queueVersion: snap?.queueVersion,
        nextTrack: snap?.nextTrack, shuffle: snap?.shuffle, repeatMode: snap?.repeatMode,
      });

      const room = this.roomManager.get(roomId);
      if (room?.isHydrated && snap) {
        this.persistence.schedule(roomId, {
          state: snap.state, positionMs: snap.position, trackUrl: snap.trackUrl,
          queue: room.getQueueState(),
        });
      }
    });

    this.roomManager.on('playback:schedule', (payload: any) => {
      this.io.to(payload.roomId).emit('playback:schedule', payload);
    });

    this.roomManager.on('playback:pause', (payload: any) => {
      this.io.to(payload.roomId).emit('playback:pause', payload);
    });
  }

  flushPersistence(): Promise<void> { return this.persistence.flush(); }

  register(socket: Socket): void {
    console.log(`[WS] connected: ${socket.id}`);

    // Refreshing a foreground tab must not leave/rejoin and pause a single-device room.
    socket.on('room:resync', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (room?.isHydrated && room.hasParticipant(socket.id)) socket.emit('room:snapshot', room.snapshot());
    });

    // ── Room management ──────────────────────────────────────────────────

    socket.on('room:join', async ({ roomId, displayName, userId, deviceId, isReady = false }: JoinPayload) => {
      try {
        // The room code is checked against the DB on EVERY join, before getOrCreate.
        // The old code only checked when the in-memory room looked untouched, so a
        // REST call that had already conjured a ghost room for a made-up code let the
        // join straight through — and recordParticipantJoin then upserted the fake
        // room into the database for real.
        const badCode = roomCodeLookupError(roomId);
        if (badCode) {
          socket.emit('room:notFound', { roomId, message: badCode });
          return;
        }

        const dbRoom = await this.roomRepo.findById(roomId);
        if (!dbRoom || dbRoom.ended_at) {
          this.roomManager.remove(roomId);
          socket.emit('room:notFound', {
            roomId,
            message: dbRoom
              ? `Room ${roomId} has ended. Ask the host to start a new one.`
              : `No room found with code ${roomId}. Check the code and try again.`,
          });
          console.warn(`[Room ${roomId}] Join rejected — ${dbRoom ? 'room has ended' : 'not found in DB'}`);
          return;
        }

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

        // Fresh instance (server restart, or first touch since eviction) — fill it
        // from the row we just read.
        if (!room.isHydrated) {
          room.initializeFromDatabase({
            hostId:        dbRoom.host_id,
            trackUrl:      dbRoom.track_url,
            playbackState: dbRoom.playback_state,
            positionMs:    dbRoom.position_ms,
            createdAt:     dbRoom.created_at,
            queue:         dbRoom.queue,
          });
        }

        // --- Private Mode Gate ---
        const snapshot = room.snapshot();
        const isHost = snapshot.hostId === socket.data.userId;
        const roomHasActiveHost = snapshot.hostId !== null && room.getParticipantCount() > 0;

        // If joining an existing room, kick any ghost sockets with the same userId AND same deviceId
        // This ensures if a user joins from two DIFFERENT devices (e.g. iPhone and Mac), they aren't kicked.
        if (room && typeof userId === 'string' && userId.trim() !== '' && typeof deviceId === 'string' && deviceId.trim() !== '') {
          const cleanUserId = userId.trim();
          const cleanDeviceId = deviceId.trim();
          const existingGhosts = room.snapshot().participants.filter(
            (p: any) => p.userId === cleanUserId && p.deviceId === cleanDeviceId && p.socketId !== socket.id
          );
          for (const ghost of existingGhosts) {
            console.log(`[Room ${roomId}] Kicking ghost socket ${ghost.socketId} for user ${cleanUserId} on device ${cleanDeviceId}`);
            this.io.to(ghost.socketId).emit('room:kicked', { reason: 'Joined from another tab on this device' });
            const ghostSocket = this.io.sockets.sockets.get(ghost.socketId);
            if (ghostSocket) {
              ghostSocket.data.kicked = true;
              ghostSocket.disconnect(true);
            }
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
        console.error(`[Room ${roomId}] join failed:`, err);
        socket.emit('error', { message: "We couldn't get you into that room. Please try again." });
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
        emitSafeError(socket, err, 'playback:schedule', { roomId, trackUrl });
      }
    });

    socket.on('playback:play', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        room.play(socket.id);
      } catch (err) {
        emitSafeError(socket, err, 'playback:play', { roomId });
      }
    });

    socket.on('playback:pause', ({ roomId, positionMs, senderId }: { roomId: string; positionMs?: number, senderId?: string }) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        const pos = positionMs !== undefined ? positionMs : room.computeCurrentPosition();
        room.syncPause(pos, senderId);
      } catch (err) {
        emitSafeError(socket, err, 'playback:pause', { roomId });
      }
    });

    socket.on('playback:seek', ({ roomId, position }: SeekPayload) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.seek(socket.id, position);
      } catch (err) {
        emitSafeError(socket, err, 'playback:seek', { roomId, position });
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
    socket.on('playback:ended', ({ roomId, trackUrl, playbackInstanceId }: { roomId: string; trackUrl: string; playbackInstanceId?: string }) => {
      const room = this.roomManager.get(roomId);
      if (room?.hasParticipant(socket.id) && typeof trackUrl === 'string') {
        room.handleTrackEnded(trackUrl, playbackInstanceId);
      }
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
        emitSafeError(socket, err, 'room:setParticipantVolume', { roomId, targetSocketId });
      }
    });

    // ── Client ready / buffering state ───────────────────────────────────

    socket.on('room:clientReady', ({ roomId, isReady = true, trackUrl }: { roomId: string, isReady?: boolean, trackUrl?: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;

      room.setParticipantReady(socket.id, !!isReady, trackUrl);
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

    socket.on('room:upload_progress', ({ roomId, title, progress, trackUrl, operationId, status, indeterminate, error }: {
      roomId: string; title: string; progress: number; trackUrl?: string; operationId?: string; status?: string; indeterminate?: boolean; error?: string;
    }) => {
      const room = this.roomManager.get(roomId);
      if (!room?.hasParticipant(socket.id) || !Number.isFinite(progress)) return;
      socket.to(roomId).emit('room:upload_progress', {
        roomId, socketId: socket.id, title, trackUrl, operationId, status, indeterminate, error,
        progress: Math.max(0, Math.min(100, progress)),
      });
    });

    socket.on('room:sync_progress', ({ roomId, progress, trackUrl }: { roomId: string; progress: number; trackUrl?: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room?.hasParticipant(socket.id) || !Number.isFinite(progress)) return;
      socket.to(roomId).emit('room:deviceSyncProgress', {
        roomId, socketId: socket.id, trackUrl: trackUrl ?? room.getTrackUrl(),
        progress: Math.max(0, Math.min(100, progress)),
      });
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

    // Spatial audio is parked as a beta. Keep the event name reserved so stale
    // clients cannot mutate and broadcast room layouts while the feature is off.
    socket.on('spatial:update', () => {});

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
