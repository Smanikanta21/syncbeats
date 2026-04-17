// handlers/SocketHandler.ts — command dispatcher

import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { SyncEngine }     from '../sync/SyncEngine';
import { RoomRepository } from '../db/RoomRepository';
import { eventBus, EVENTS } from '../events/EventBus';
    // Listen for play errors and forward to the correct socket
    eventBus.on('ROOM_PLAY_ERROR', ({ requesterId, message }) => {
      // @ts-expect-error: checked at runtime, safe in practice
      const sockets = (this.io!.sockets as any).sockets as Map<string, Socket>;
      const socket = sockets?.get?.(requesterId);
      if (socket) {
        socket.emit('error', { message });
      }
    });
import {
  JoinPayload, LeavePayload, SeekPayload, PingPayload, RoomSnapshot, SetParticipantVolumePayload
} from '../types';

export class SocketHandler {
  constructor(
    private io:          Server,
    private roomManager: RoomManager,
    private syncEngine:  SyncEngine,
    private roomRepo:    RoomRepository,
  ) {
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
  }

  register(socket: Socket): void {
    console.log(`[WS] connected: ${socket.id}`);

    // ── Room management ──────────────────────────────────────────────────

    socket.on('room:join', async ({ roomId, displayName }: JoinPayload) => {
      try {
        const room = this.roomManager.getOrCreate(roomId);

        // Load from DB if fresh
        if (!room.getTrackUrl() && room.getParticipantCount() === 0) {
          const dbRoom = await this.roomRepo.findById(roomId);
          if (dbRoom) {
            room.initializeFromDatabase({
              hostId:        dbRoom.host_id,
              trackUrl:      dbRoom.track_url,
              playbackState: dbRoom.playback_state,
              positionMs:    dbRoom.position_ms,
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
      if (!room.allReady()) {
        socket.emit('room:playBlocked', { reason: 'waiting_for_clients' });
        return;
      }
      try {
        room.play(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:pause', ({ roomId }: { roomId: string }) => {
      try {
        this.roomManager.get(roomId)?.pause(socket.id);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('playback:seek', ({ roomId, position }: SeekPayload) => {
      try {
        this.roomManager.get(roomId)?.seek(socket.id, position);
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

      // If everyone is ready, tell the room
      if (room.allReady()) {
        console.log(`[Room ${roomId}] ALL READY → broadcasting room:allReady`);
        this.io.to(roomId).emit('room:allReady');
      }
    });

    // ── NTP sync ─────────────────────────────────────────────────────────

    socket.on('sync:ping', ({ t0 }: PingPayload) => {
      const { t1, t2 } = this.syncEngine.recordPing(socket.id, t0);
      socket.emit('sync:pong', { t0, t1, t2 });
    });

    // ── Disconnect ───────────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      console.log(`[WS] disconnected: ${socket.id} (${reason})`);
      this.roomManager.handleDisconnect(socket.id);
      this.syncEngine.clearSocket(socket.id);
    });
  }
}
