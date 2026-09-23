// db/RoomRepository.ts — Prisma-based implementation

import prisma, { sanitizeNullBytes } from './prisma';
import { Prisma } from '@prisma/client';
import { Participant } from '../types';
import { sanitizeString } from '../auth/UserRepository';

export interface RoomRow {
  id: string;
  host_id: string;
  track_url: string | null;
  playback_state: string;
  position_ms: number;
  created_at: Date;
  ended_at: Date | null;
  participant_count?: number;
}

/**
 * Stable per-track dedup key within a room. Used by the @@unique([roomId, trackKey])
 * constraint on RoomQueueItem.
 *
 * MUST stay byte-identical to the SQL CASE expression in the migration
 * `<ts>_add_room_queue_track_key/migration.sql` (backfill step), and MUST be computed
 * from the SAME string that gets stored in track_url (i.e. the post-sanitizeString value),
 * otherwise old backfilled rows and new inserts would key differently.
 *
 * magnet: URIs embed their own `?`/`&`, so a naive query-strip would collapse every
 * magnet to `magnet:` — key them on the btih hash instead. All other forms
 * (youtube:ID, spotify-lazy:ID, bare upload filenames) strip the volatile query string
 * (`?thumb=…&pid=…`) to a stable, distinct key.
 */
export class RoomRepository {
  async create(roomId: string, hostId: string): Promise<RoomRow> {
    const room = await prisma.room.create({
      data: {
        id: roomId,
        hostId,
        playbackState: 'IDLE',
      }
    });
    return this.mapRoom(room);
  }

  async findById(roomId: string): Promise<RoomRow | null> {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    return room ? this.mapRoom(room) : null;
  }

  async findActiveByHost(hostId: string): Promise<RoomRow | null> {
    const room = await prisma.room.findFirst({
      where: { hostId, endedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return room ? this.mapRoom(room) : null;
  }

  async listActive(): Promise<RoomRow[]> {
    const rooms = await prisma.room.findMany({
      where: { endedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    return rooms.map(r => this.mapRoom(r));
  }

  async listByUser(userId: string): Promise<{ rooms: RoomRow[], invitedRooms: any[] }> {
    const rooms = await prisma.room.findMany({
      where: { 
        OR: [
          { hostId: userId },
          { roomParticipants: { some: { userId } } }
        ],
        endedAt: null 
      },
      include: {
        _count: {
          select: { roomParticipants: { where: { leftAt: null } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    const mappedRooms = rooms.map(r => ({
      ...this.mapRoom(r),
      participant_count: r._count.roomParticipants
    }));

    const invited = await prisma.roomInvite.findMany({
      where: { inviteeId: userId, status: 'PENDING' },
      include: { 
        room: { include: { _count: { select: { roomParticipants: { where: { leftAt: null } } } } } },
        inviter: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const invitedRooms = invited.map(inv => ({
      inviteId: inv.id,
      inviterName: inv.inviter.name,
      ...this.mapRoom(inv.room as any),
      participant_count: inv.room._count.roomParticipants
    }));

    return { rooms: mappedRooms, invitedRooms };
  }

  async createInvite(roomId: string, inviterId: string, inviteeId: string | null, inviteeEmail: string | null) {
    if (inviteeId) {
      const existing = await prisma.roomInvite.findFirst({ where: { roomId, inviteeId } });
      if (existing) return existing;
    }
    return prisma.roomInvite.create({
      data: {
        roomId,
        inviterId,
        inviteeId,
        inviteeEmail
      }
    });
  }

  async updateState(
    roomId: string,
    state: string,
    positionMs: number,
    trackUrl?: string | null
  ): Promise<void> {
    const data: { playbackState: string; positionMs: bigint; trackUrl?: string | null } = {
      playbackState: state,
      positionMs: BigInt(Math.round(positionMs)),
    };
    if (trackUrl !== undefined) data.trackUrl = trackUrl;

    try {
      await prisma.room.update({
        where: { id: roomId },
        data
      });
    } catch (err: any) {
      if (err?.code === 'P2024') {
        console.warn(`[RoomRepository] updateState pool timeout for room ${roomId}, skipping tick`);
      } else {
        throw err;
      }
    }
  }

  async markEnded(roomId: string): Promise<void> {
    await prisma.room.update({
      where: { id: roomId },
      data: { endedAt: new Date() }
    });
  }

  async listOlderThan(cutoff: Date): Promise<RoomRow[]> {
    const rooms = await prisma.room.findMany({
      where: {
        endedAt: null,
        // Use lastAccessedAt so that rooms reset their expiry timer on each visit
        lastAccessedAt: { lt: cutoff },
      },
      orderBy: { lastAccessedAt: 'asc' },
    });
    return rooms.map(r => this.mapRoom(r));
  }

  async removeRoom(roomId: string): Promise<void> {
    await prisma.room.delete({ where: { id: roomId } });
  }

  async recordParticipantJoin(roomId: string, userId: string, socketId: string, displayName: string): Promise<void> {
    const cleanDisplayName = sanitizeString(displayName);
    // Ensure the room exists in the DB first (since some rooms like personal_room are created on the fly)
    await prisma.room.upsert({
      where: { id: roomId },
      create: {
        id: roomId,
        hostId: userId,
        lastAccessedAt: new Date(),
      },
      update: { lastAccessedAt: new Date() } // Reset expiry timer on each visit
    });

    await prisma.roomParticipant.upsert({
      where: {
        roomId_userId: { roomId, userId }
      },
      create: {
        roomId,
        userId,
        socketId,
        displayName: cleanDisplayName,
        joinedAt: new Date(),
      },
      update: {
        socketId,
        displayName: cleanDisplayName,
        leftAt: null,
      }
    });
  }

  async hasParticipantPreviouslyJoined(roomId: string, userId: string): Promise<boolean> {
    const participant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: { roomId, userId }
      }
    });
    return !!participant;
  }

  async recordParticipantLeave(roomId: string, socketId: string): Promise<void> {
    try {
      await prisma.roomParticipant.updateMany({
        where: { roomId, socketId },
        data: { leftAt: new Date() }
      });
    } catch (e: any) {
      console.warn(`[RoomRepo] Failed to record leave for socket ${socketId}:`, e?.message || e);
    }
  }

  async transferHost(roomId: string, currentHostId: string, newHostId: string): Promise<boolean> {
    const result = await prisma.room.updateMany({
      where: {
        id: roomId,
        hostId: currentHostId,
      },
      data: {
        hostId: newHostId,
      },
    });

    return result.count > 0;
  }

  async getParticipants(roomId: string): Promise<Participant[]> {
    const participants = await prisma.roomParticipant.findMany({
      where: { roomId, leftAt: null }
    });
    return participants.map(p => ({
      socketId: p.socketId,
      displayName: p.displayName,
      joinedAt: p.joinedAt.getTime(),
      isReady: false, // Default to false when loaded from DB
      volume: 100,
    }));
  }

  private mapRoom(r: any): RoomRow {
    return {
      id: r.id,
      host_id: r.hostId,
      track_url: r.trackUrl,
      playback_state: r.playbackState,
      position_ms: Number(r.positionMs),
      created_at: r.createdAt,
      ended_at: r.endedAt,
      participant_count: r.participant_count,
    };
  }
}
