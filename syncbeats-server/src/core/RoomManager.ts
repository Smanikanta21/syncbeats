// ─── Step 3: RoomManager singleton ────────────────────────────────────────
//
// Owns all Room instances, handles multi-room disconnect routing.

import { Room } from './Room';
import { eventBus, EVENTS } from '../events/EventBus';

export class RoomManager {
  private static instance: RoomManager;
  private rooms: Map<string, Room> = new Map();
  // socketId → Set of roomIds it belongs to
  private socketRooms: Map<string, Set<string>> = new Map();

  private constructor() { }

  static getInstance(): RoomManager {
    if (!RoomManager.instance) RoomManager.instance = new RoomManager();
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
    room.on('stateChanged', (snap) => eventBus.emit(EVENTS.ROOM_STATE_CHANGED, snap));
    room.on('participantJoined', (p) => eventBus.emit(EVENTS.PARTICIPANT_JOINED, { roomId: room.roomId, participant: p }));
    room.on('participantLeft', (id) => eventBus.emit(EVENTS.PARTICIPANT_LEFT, { roomId: room.roomId, socketId: id }));
    room.on('hostChanged', (hostId) => eventBus.emit(EVENTS.HOST_CHANGED, { roomId: room.roomId, hostId }));
    room.on('trackSet', ({ trackUrl, title }) => eventBus.emit(EVENTS.TRACK_SET, { roomId: room.roomId, trackUrl, title }));
    room.on('queueChanged', (queue) => eventBus.emit(EVENTS.QUEUE_CHANGED, { roomId: room.roomId, queue }));
    room.on('schedule', (payload) => eventBus.emit(EVENTS.PLAYBACK_SCHEDULE, { roomId: room.roomId, ...payload }));
    room.on('pause', (payload) => eventBus.emit(EVENTS.PLAYBACK_PAUSE, { roomId: room.roomId, ...payload }));
    room.on('playError', ({ requesterId, message }) => {
      eventBus.emit('ROOM_PLAY_ERROR', { roomId: room.roomId, requesterId, message });
    });
    room.on('empty', () => {
      console.log(`[RoomManager] Room ${room.roomId} is now empty`);
    });
  }
}
