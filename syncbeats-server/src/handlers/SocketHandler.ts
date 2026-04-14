// ─── Step 7: SocketHandler — command dispatcher ───────────────────────────

import { Server, Socket } from 'socket.io';
import { RoomManager }    from '../core/RoomManager';
import { SyncEngine }     from '../sync/SyncEngine';
import { RoomRepository } from '../db/RoomRepository';
import { eventBus, EVENTS } from '../events/EventBus';
import {
  JoinPayload, LeavePayload, SeekPayload, TrackPayload, PingPayload, RoomSnapshot
} from '../types';

export class SocketHandler {
  constructor(
    private io:          Server,
    private roomManager: RoomManager,
    private syncEngine:  SyncEngine,
    private roomRepo:    RoomRepository,
  ) {
    // Forward all room events → socket.io rooms (runs once per server start)
    eventBus.on(EVENTS.ROOM_STATE_CHANGED, (snap: RoomSnapshot) => {
      this.io.to(snap.roomId).emit('room:stateChanged', snap);
    });

    eventBus.on(EVENTS.PARTICIPANT_JOINED, ({ roomId, participant }) => {
      this.io.to(roomId).emit('room:participantJoined', participant);
    });

    eventBus.on(EVENTS.PARTICIPANT_LEFT, ({ roomId, socketId }) => {
      this.io.to(roomId).emit('room:participantLeft', socketId);
    });

    eventBus.on(EVENTS.HOST_CHANGED, ({ roomId, hostId }) => {
      this.io.to(roomId).emit('room:hostChanged', hostId);
    });
  }

  register(socket: Socket): void {
    console.log(`[WS] connected: ${socket.id}`);

    // ── Room management ──────────────────────────────────────────────────

    socket.on('room:join', async ({ roomId, displayName }: JoinPayload) => {
      try {
        const room = this.roomManager.getOrCreate(roomId);
        
        console.log(`[Room ${roomId}] Before join - Track URL:`, room.getTrackUrl());
        
        // Load room data from database if not already initialized
        if (!room.getTrackUrl() && room.getParticipantCount() === 0) {
          console.log(`[Room ${roomId}] Loading from DB (no track set, no participants)...`);
          const dbRoom = await this.roomRepo.findById(roomId);
          if (dbRoom) {
            console.log(`[Room ${roomId}] Loaded from DB:`, {
              trackUrl: dbRoom.track_url,
              hostId: dbRoom.host_id,
              playbackState: dbRoom.playback_state,
            });
            room.initializeFromDatabase({
              hostId: dbRoom.host_id,
              trackUrl: dbRoom.track_url,
              playbackState: dbRoom.playback_state,
              positionMs: dbRoom.position_ms,
            });
          }
        } else {
          console.log(`[Room ${roomId}] Skipping DB load - Track already set or has participants`);
        }

        if (room.hasParticipant(socket.id)) {
          socket.join(roomId);
          this.roomManager.trackSocket(socket.id, roomId);
          socket.emit('room:snapshot', room.snapshot());
          return;
        }
        
        socket.join(roomId);
        this.roomManager.trackSocket(socket.id, roomId);
        room.addParticipant({ socketId: socket.id, displayName, joinedAt: Date.now(), isReady: false });
        // Send full state to the late-joiner immediately
        const snapshot = room.snapshot();
        console.log(`[Room ${roomId}] Sending snapshot to ${displayName}:`, {
          trackUrl: snapshot.trackUrl,
          state: snapshot.state,
          position: snapshot.position,
        });
        socket.emit('room:snapshot', snapshot);
        console.log(`[Room ${roomId}] ${displayName} (${socket.id}) joined`);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('room:leave', ({ roomId }: LeavePayload) => {
      const room = this.roomManager.get(roomId);
      if (room) room.removeParticipant(socket.id);
      socket.leave(roomId);
    });

    // ── Playback commands (host-guarded inside Room) ──────────────────────

    socket.on('playback:play', ({ roomId }: { roomId: string }) => {
      try {
        this.roomManager.get(roomId)?.play(socket.id);
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

    socket.on('playback:setTrack', ({ roomId, trackUrl }: TrackPayload) => {
      try {
        this.roomManager.get(roomId)?.setTrack(socket.id, trackUrl);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── Readiness & Buffering ───────────────────────────────────────────

    socket.on('room:ready', ({ roomId, isReady }: { roomId: string, isReady: boolean }) => {
      try {
        const room = this.roomManager.get(roomId);
        if (room) room.setParticipantReady(socket.id, isReady);
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    // ── NTP sync handshake ───────────────────────────────────────────────

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
