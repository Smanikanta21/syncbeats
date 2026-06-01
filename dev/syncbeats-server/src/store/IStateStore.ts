// ─── Step 6: IStateStore interface + InMemoryStore ────────────────────────

import { RoomSnapshot } from '../types';

export interface IStateStore {
  saveSnapshot(roomId: string, snapshot: RoomSnapshot): Promise<void>;
  getSnapshot(roomId: string): Promise<RoomSnapshot | null>;
  deleteRoom(roomId: string): Promise<void>;
}

export class InMemoryStore implements IStateStore {
  private store: Map<string, RoomSnapshot> = new Map();

  async saveSnapshot(roomId: string, snapshot: RoomSnapshot): Promise<void> {
    this.store.set(roomId, snapshot);
  }

  async getSnapshot(roomId: string): Promise<RoomSnapshot | null> {
    return this.store.get(roomId) ?? null;
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.store.delete(roomId);
  }
}

// Phase 2 stub — swap with this when adding Redis
export class RedisStore implements IStateStore {
  async saveSnapshot(_roomId: string, _snapshot: RoomSnapshot): Promise<void> {
    throw new Error('RedisStore not implemented yet. Install ioredis and configure REDIS_URL.');
  }
  async getSnapshot(_roomId: string): Promise<RoomSnapshot | null> {
    throw new Error('RedisStore not implemented yet.');
  }
  async deleteRoom(_roomId: string): Promise<void> {
    throw new Error('RedisStore not implemented yet.');
  }
}
