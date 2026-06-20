// handlers/SocketHandler.ts — command dispatcher

import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { RoomRepository } from '../db/RoomRepository';
import { eventBus, EVENTS } from '../events/EventBus';
import {
  JoinPayload, LeavePayload, SeekPayload, PingPayload, RoomSnapshot, SetParticipantVolumePayload, TrackQueueItem
} from '../types';

export class SocketHandler {
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
    });

    eventBus.on(EVENTS.PARTICIPANT_LEFT, ({ roomId, socketId }: { roomId: string; socketId: string }) => {
      this.io.to(roomId).emit('room:participantLeft', socketId);
    });

    eventBus.on(EVENTS.HOST_CHANGED, ({ roomId, hostId }: { roomId: string; hostId: string }) => {
      this.io.to(roomId).emit('room:hostChanged', hostId);
    });

    // When a file is uploaded → broadcast track URL to every client in room
    eventBus.on(EVENTS.TRACK_SET, ({ roomId, trackUrl, title }: { roomId: string; trackUrl: string; title: string }) => {
      console.log(`[Socket] Broadcasting room:trackSet to ${roomId}`);
      this.io.to(roomId).emit('room:trackSet', { trackUrl, title });
    });

    eventBus.on(EVENTS.QUEUE_CHANGED, ({ roomId, queue }: { roomId: string; queue: TrackQueueItem[] }) => {
      this.io.to(roomId).emit('room:queueChanged', { queue });
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

    socket.on('room:join', async ({ roomId, displayName, userId, isReady = false }: JoinPayload) => {
      try {
        if (userId) socket.data.userId = userId;
        const room = this.roomManager.getOrCreate(roomId);

        // Disconnect from previous room if any to prevent ghosts
        this.roomManager.handleDisconnect(socket.id);

        // Load from DB if fresh
        if (!room.getTrackUrl() && room.getParticipantCount() === 0) {
          const [dbRoom, queue] = await Promise.all([
            this.roomRepo.findById(roomId),
            this.roomRepo.getQueue(roomId),
          ]);
          if (dbRoom) {
            room.initializeFromDatabase({
              hostId:        dbRoom.host_id,
              trackUrl:      dbRoom.track_url,
              playbackState: dbRoom.playback_state,
              positionMs:    dbRoom.position_ms,
              queue,
            });
          }
        }

        // --- Private Mode Gate ---
        const snapshot = room.snapshot();
        const isHost = snapshot.hostId === socket.data.userId;
        const roomHasActiveHost = snapshot.hostId !== null && room.getParticipantCount() > 0;

        if (room.getIsPrivate() && roomHasActiveHost && !isHost && !room.hasParticipant(socket.id)) {
          socket.emit('room:joinPendingApproval', { roomId });
          const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === snapshot.hostId);
          hostSockets.forEach(p => {
            this.io.to(p.socketId).emit('room:hostJoinRequest', { socketId: socket.id, displayName });
          });
          return;
        }
        // -------------------------

        if (room.hasParticipant(socket.id)) {
          socket.join(roomId);
          this.roomManager.trackSocket(socket.id, roomId);
          socket.emit('room:snapshot', room.snapshot());
          return;
        }

        socket.join(roomId);
        this.roomManager.trackSocket(socket.id, roomId);
        room.addParticipant({ socketId: socket.id, displayName, userId: socket.data.userId, joinedAt: Date.now(), isReady, volume: 100 });
        socket.emit('room:snapshot', room.snapshot());
        console.log(`[Room ${roomId}] ${displayName} (${socket.id}) joined`);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('room:leave', ({ roomId }: LeavePayload) => {
      const room = this.roomManager.get(roomId);
      if (room) {
        // Explicit leave should stop active playback for the room.
        room.pause(socket.id);
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
      room.addParticipant({ socketId: targetSocketId, displayName, userId: targetSocket.data.userId, joinedAt: Date.now(), isReady: false, volume: 100 });
      targetSocket.emit('room:joinApproved');
      targetSocket.emit('room:snapshot', room.snapshot());
      console.log(`[Room ${roomId}] Host approved ${displayName} (${targetSocketId})`);
    });

    socket.on('room:denyJoin', ({ roomId, targetSocketId }: { roomId: string, targetSocketId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room || room.snapshot().hostId !== socket.data.userId) return;

      this.io.to(targetSocketId).emit('room:joinDenied');
      console.log(`[Room ${roomId}] Host denied ${targetSocketId}`);
    });

    socket.on('room:notifyHost', ({ roomId, displayName }: { roomId: string, displayName: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      const hostId = room.snapshot().hostId;
      if (hostId) {
        const hostSockets = room.snapshot().participants.filter((p: any) => p.userId === hostId);
        hostSockets.forEach(p => {
          this.io.to(p.socketId).emit('room:hostJoinRequest', { socketId: socket.id, displayName, isNudge: true });
        });
      }
    });

    // ── Playback — any participant can control ────────────────────────────

    socket.on('playback:play', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:pause', ({ roomId, positionMs }: { roomId: string; positionMs?: number }) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.pause(socket.id, positionMs);
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

    socket.on('playback:ended', async ({ roomId, trackUrl }: { roomId: string; trackUrl: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      // Allow any client to notify that the track ended.
      // The expectedCurrentTrackUrl ensures we only advance once per track end.
      if (room.getTrackUrl() !== trackUrl) return;

      try {
        const next = await this.roomRepo.advanceQueue(roomId, trackUrl);
        if (next === undefined) return;
        const latestQueue = await this.roomRepo.getQueue(roomId);
        room.syncQueue(latestQueue, next?.id ?? null);
        // Automatically play the next track if it exists
        if (next) room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:next', async ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        const next = await this.roomRepo.advanceQueue(roomId);
        const latestQueue = await this.roomRepo.getQueue(roomId);
        room.syncQueue(latestQueue, next?.id ?? null);
        if (next) room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:prev', async ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        const prev = await this.roomRepo.prevQueue(roomId);
        const latestQueue = await this.roomRepo.getQueue(roomId);
        room.syncQueue(latestQueue, prev?.id ?? null);
        if (prev) room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:jumpTo', async ({ roomId, trackId }: { roomId: string, trackId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      try {
        const target = await this.roomRepo.jumpToQueueItem(roomId, trackId);
        const latestQueue = await this.roomRepo.getQueue(roomId);
        room.syncQueue(latestQueue, target?.id ?? null);
        if (target) room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
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

    socket.on('track:request_file', ({ roomId, trackUrl }: { roomId: string; trackUrl: string }) => {
      // Broadcast to everyone else in the room (excludes the sender) to find who has this file
      socket.to(roomId).emit('track:request_file', { requesterSocketId: socket.id, roomId, trackUrl });
    });

    socket.on('track:send_chunk', ({ roomId, targetSocketId, trackUrl, chunkIndex, totalChunks, data }: any, callback?: () => void) => {
      // Fallback for older seeder tabs that haven't refreshed and still send targetSocketId instead of roomId
      if (roomId) {
        socket.to(roomId).emit('track:receive_chunk', { trackUrl, chunkIndex, totalChunks, data });
      } else if (targetSocketId) {
        this.io.to(targetSocketId).emit('track:receive_chunk', { trackUrl, chunkIndex, totalChunks, data });
      }
      if (typeof callback === 'function') callback();
    });

    // ── Upload Progress ──────────────────────────────────────────────────

    socket.on('room:upload_progress', ({ roomId, title, progress }: { roomId: string, title: string, progress: number }) => {
      socket.to(roomId).emit('room:upload_progress', { title, progress });
    });

    // ── NTP sync ─────────────────────────────────────────────────────────

    socket.on('sync:ping', ({ t0, seq }: PingPayload) => {
      const now = Date.now();
      socket.emit('sync:pong', { t0, t1: now, t2: now, seq });
    });

    // ── Spatial Audio Sync ───────────────────────────────────────────────

    socket.on('spatial:update', ({ roomId, deviceId, position }: { roomId: string; deviceId: string; position: any }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      room.setSpatialPosition(deviceId, position);
      
      // Broadcast to everyone else in the room (excludes the sender)
      socket.to(roomId).emit('spatial:update', { deviceId, position });
    });

    // ── Disconnect ───────────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`[WS] disconnected: ${socket.id} (${reason})`);
      this.roomManager.handleDisconnect(socket.id);
    });
  }
}
