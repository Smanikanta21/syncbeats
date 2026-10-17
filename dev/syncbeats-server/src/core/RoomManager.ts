// ─── RoomManager singleton ────────────────────────────────────────
//
// Owns all Room instances, handles multi-room disconnect routing.

import { EventEmitter } from 'events';
import { Room } from './Room';

export class RoomManager extends EventEmitter {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  // socketId → Set of roomIds it belongs to
  private socketRooms: Map<string, Set<string>> = new Map();

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  getOrCreate(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      const room = new Room(roomId);
      this.wireRoomEvents(room);
      this.rooms.set(roomId, room);
      console.log(`[RoomManager] Created room ${roomId}`);
    }
    return this.rooms.get(roomId)!;
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  list(): string[] {
    return Array.from(this.rooms.keys());
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  remove(roomId: string): void {
    this.rooms.delete(roomId);
  }

  trackSocket(socketId: string, roomId: string): void {
    if (!this.socketRooms.has(socketId)) this.socketRooms.set(socketId, new Set());
    this.socketRooms.get(socketId)!.add(roomId);
  }

  handleDisconnect(socketId: string): void {
    const rooms = this.socketRooms.get(socketId) ?? new Set();
    for (const roomId of rooms) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.removeParticipant(socketId);
      }
    }
    this.socketRooms.delete(socketId);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private wireRoomEvents(room: Room): void {
    room.on('stateChanged', (snap) => this.emit('room:stateChanged', snap));
    room.on('participantJoined', (p) => this.emit('room:participantJoined', { roomId: room.roomId, participant: p }));
    room.on('participantLeft', (id) => this.emit('room:participantLeft', { roomId: room.roomId, socketId: id }));
    room.on('hostChanged', (hostId) => this.emit('room:hostChanged', { roomId: room.roomId, hostId }));
    room.on('trackSet', ({ trackUrl, title }) => this.emit('room:trackSet', { roomId: room.roomId, trackUrl, title }));
    room.on('queueChanged', (queue) => this.emit('room:queueChanged', { roomId: room.roomId, queue }));
    room.on('schedule', (payload) => this.emit('playback:schedule', { roomId: room.roomId, ...payload }));
    room.on('pause', (payload) => this.emit('playback:pause', { roomId: room.roomId, ...payload }));
    room.on('empty', () => {
      console.log(`[RoomManager] Room ${room.roomId} is now empty`);
    });
  }
}
