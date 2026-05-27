// handlers/SocketHandler.ts — command dispatcher

import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { SyncEngine }     from '../sync/SyncEngine';
import { RoomRepository } from '../db/RoomRepository';
import { eventBus, EVENTS } from '../events/EventBus';
import {
  JoinPayload, LeavePayload, SeekPayload, PingPayload, RoomSnapshot, SetParticipantVolumePayload, TrackQueueItem
} from '../types';

export class SocketHandler {
  constructor(
    private io:          Server,
    private roomManager: RoomManager,
    private syncEngine:  SyncEngine,
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

    socket.on('room:join', async ({ roomId, displayName }: JoinPayload) => {
      try {
        const room = this.roomManager.getOrCreate(roomId);

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

        if (room.hasParticipant(socket.id)) {
          socket.join(roomId);
          this.roomManager.trackSocket(socket.id, roomId);
          socket.emit('room:snapshot', room.snapshot());
          return;
        }

        socket.join(roomId);
        this.roomManager.trackSocket(socket.id, roomId);
        room.addParticipant({ socketId: socket.id, displayName, joinedAt: Date.now(), isReady: false, volume: 100 });
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

    // ── Playback — any participant can control ────────────────────────────

    socket.on('playback:play', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;
      
      // Broadcast unlock hint to ALL devices before scheduling playback
      // This allows locked mobile devices to show "Tap to Sync" UI
      this.io.to(roomId).emit('playback:unlock-hint', { roomId, trackUrl: room.getTrackUrl() });
      
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

    socket.on('room:setParticipantVolume', ({ roomId, targetSocketId, volume }: SetParticipantVolumePayload) => {
      try {
        const room = this.roomManager.get(roomId);
        if (!room) return;
        room.setParticipantVolume(targetSocketId?.trim() || socket.id, volume);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── Client ready — sent when audio is buffered (canplaythrough) ───────

    socket.on('room:clientReady', ({ roomId }: { roomId: string }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;

      room.setParticipantReady(socket.id, true);
      console.log(`[Room ${roomId}] ${socket.id} is ready`);
    });

    socket.on('playback:blocked', ({ roomId, blocked }: { roomId: string; blocked: boolean }) => {
      const room = this.roomManager.get(roomId);
      if (!room) return;

      room.setParticipantBlocked(socket.id, blocked);
      console.log(`[Room ${roomId}] ${socket.id} is blocked: ${blocked}`);
    });

    // ── NTP sync ─────────────────────────────────────────────────────────

    socket.on('sync:ping', ({ t0, seq }: PingPayload) => {
      const { t1, t2 } = this.syncEngine.recordPing(socket.id, t0);
      socket.emit('sync:pong', { t0, t1, t2, seq });
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
      this.syncEngine.clearSocket(socket.id);
    });
  }
}
