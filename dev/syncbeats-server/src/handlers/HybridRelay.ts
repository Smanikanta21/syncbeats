import { Server, Socket } from 'socket.io';
import { RoomManager } from '../core/RoomManager';
import { HybridSessions } from '../core/HybridSession';

/** Only room members receive a LAN credential. Rotate it when a member leaves. */
export class HybridRelay {
  private readonly sessions = new HybridSessions();
  constructor(private io: Server, private rooms: RoomManager) {
    rooms.on('room:participantLeft', ({ roomId }: { roomId: string }) => {
      this.sessions.revoke(roomId);
      const members = rooms.get(roomId)?.snapshot().participants ?? [];
      if (!members.length) return;
      const session = this.sessions.get(roomId);
      // Unicast: a kicked socket may still be leaving the Socket.IO room.
      for (const member of members) io.to(member.socketId).emit('hybrid:session', session);
    });
  }
  register(socket: Socket): void {
    let lastRequest = 0;
    socket.on('hybrid:join', (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const roomId = (payload as { roomId?: unknown }).roomId;
      if (typeof roomId !== 'string' || !this.rooms.get(roomId)?.hasParticipant(socket.id)) return;
      if (Date.now() - lastRequest < 1_000) return;
      lastRequest = Date.now();
      // Also refresh other members after expiry so they all use the same PSK.
      const session = this.sessions.get(roomId);
      for (const member of this.rooms.get(roomId)!.snapshot().participants) {
        this.io.to(member.socketId).emit('hybrid:session', session);
      }
    });
  }
}
