// db/RoomRepository.ts — Prisma-based implementation

import prisma from './prisma';
import { Participant, TrackQueueItem } from '../types';

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

interface NewQueueTrackInput {
  trackUrl: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

interface EnqueueTrackResult {
  item: TrackQueueItem;
  activated: boolean;
}

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

  async listActive(): Promise<RoomRow[]> {
    const rooms = await prisma.room.findMany({
      where: { endedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    return rooms.map(r => this.mapRoom(r));
  }

  async listByUser(userId: string): Promise<RoomRow[]> {
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
    return rooms.map(r => ({
      ...this.mapRoom(r),
      participant_count: r._count.roomParticipants
    }));
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

    await prisma.room.update({
      where: { id: roomId },
      data
    });
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
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rooms.map(r => this.mapRoom(r));
  }

  async removeRoom(roomId: string): Promise<void> {
    await prisma.room.delete({ where: { id: roomId } });
  }

  async recordParticipantJoin(roomId: string, userId: string, socketId: string, displayName: string): Promise<void> {
    // Ensure the room exists in the DB first (since some rooms like personal_room are created on the fly)
    await prisma.room.upsert({
      where: { id: roomId },
      create: {
        id: roomId,
        hostId: userId,
      },
      update: {}
    });

    await prisma.roomParticipant.upsert({
      where: {
        roomId_userId: { roomId, userId }
      },
      create: {
        roomId,
        userId,
        socketId,
        displayName,
        joinedAt: new Date(),
      },
      update: {
        socketId,
        displayName,
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
    await prisma.roomParticipant.updateMany({
      where: { roomId, socketId },
      data: { leftAt: new Date() }
    });
  }

  async getQueue(roomId: string): Promise<TrackQueueItem[]> {
    const items = await prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: { queueIndex: 'asc' },
      include: { uploader: { select: { name: true } } }
    });
    return items.map((item) => this.mapQueueItem(item));
  }

  async getRoomFileNames(roomId: string): Promise<string[]> {
    const items = await prisma.roomQueueItem.findMany({
      where: { roomId },
      select: { fileName: true },
    });
    return Array.from(new Set(items.map((item) => item.fileName)));
  }

  async getUserStorageUsageBytes(userId: string): Promise<number> {
    const result = await prisma.roomQueueItem.aggregate({
      where: { uploaderUserId: userId },
      _sum: { sizeBytes: true },
    });
    return Number(result._sum.sizeBytes ?? 0n);
  }

  async enqueueTrack(roomId: string, uploaderUserId: string, input: NewQueueTrackInput): Promise<EnqueueTrackResult> {
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.findUnique({ where: { id: roomId }, select: { id: true } });
      if (!room) {
        throw new Error('Room not found');
      }

      const [current, last] = await Promise.all([
        tx.roomQueueItem.findFirst({
          where: { roomId, isCurrent: true },
          orderBy: { queueIndex: 'asc' },
        }),
        tx.roomQueueItem.findFirst({
          where: { roomId },
          orderBy: { queueIndex: 'desc' },
          select: { queueIndex: true },
        }),
      ]);

      const queueIndex = (last?.queueIndex ?? -1) + 1;
      const activated = !current;

      const created = await tx.roomQueueItem.create({
        data: {
          roomId,
          uploaderUserId,
          trackUrl: input.trackUrl,
          title: input.title,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: BigInt(input.sizeBytes),
          queueIndex,
          isCurrent: activated,
        },
        include: { uploader: { select: { name: true } } }
      });

      if (activated) {
        await tx.room.update({
          where: { id: roomId },
          data: {
            trackUrl: input.trackUrl,
            playbackState: 'PAUSED',
            positionMs: 0n,
          },
        });
      }

      return {
        item: this.mapQueueItem(created),
        activated,
      };
    });
  }

  async advanceQueue(roomId: string, expectedCurrentTrackUrl?: string): Promise<TrackQueueItem | null | undefined> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.roomQueueItem.findFirst({
        where: { roomId, isCurrent: true },
        orderBy: { queueIndex: 'asc' },
      });

      if (expectedCurrentTrackUrl !== undefined && current && current.trackUrl !== expectedCurrentTrackUrl) {
        return undefined;
      }

      if (!current) {
        await tx.room.update({
          where: { id: roomId },
          data: {
            trackUrl: null,
            playbackState: 'IDLE',
            positionMs: 0n,
          },
        });
        return expectedCurrentTrackUrl !== undefined ? undefined : null;
      }

      const next = await tx.roomQueueItem.findFirst({
        where: { roomId, queueIndex: { gt: current.queueIndex } },
        orderBy: { queueIndex: 'asc' },
        include: { uploader: { select: { name: true } } }
      });

      if (!next) {
        await tx.roomQueueItem.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
        await tx.room.update({
          where: { id: roomId },
          data: {
            trackUrl: null,
            playbackState: 'IDLE',
            positionMs: 0n,
          },
        });
        return null;
      }

      await Promise.all([
        tx.roomQueueItem.update({
          where: { id: current.id },
          data: { isCurrent: false },
        }),
        tx.roomQueueItem.update({
          where: { id: next.id },
          data: { isCurrent: true },
        }),
        tx.room.update({
          where: { id: roomId },
          data: {
            trackUrl: next.trackUrl,
            playbackState: 'PAUSED',
            positionMs: 0n,
          },
        }),
      ]);

      return this.mapQueueItem({ ...next, isCurrent: true });
    });
  }

  async prevQueue(roomId: string): Promise<TrackQueueItem | null | undefined> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.roomQueueItem.findFirst({
        where: { roomId, isCurrent: true },
      });

      if (!current) return undefined;

      const prev = await tx.roomQueueItem.findFirst({
        where: { roomId, queueIndex: { lt: current.queueIndex } },
        orderBy: { queueIndex: 'desc' },
        include: { uploader: { select: { name: true } } }
      });

      if (!prev) return undefined;

      await Promise.all([
        tx.roomQueueItem.update({
          where: { id: current.id },
          data: { isCurrent: false },
        }),
        tx.roomQueueItem.update({
          where: { id: prev.id },
          data: { isCurrent: true },
        }),
        tx.room.update({
          where: { id: roomId },
          data: {
            trackUrl: prev.trackUrl,
            playbackState: 'PAUSED',
            positionMs: 0n,
          },
        }),
      ]);

      return this.mapQueueItem({ ...prev, isCurrent: true });
    });
  }

  async jumpToQueueItem(roomId: string, itemId: string): Promise<TrackQueueItem | null> {
    return prisma.$transaction(async (tx) => {
      const target = await tx.roomQueueItem.findUnique({
        where: { id: itemId },
        include: { uploader: { select: { name: true } } }
      });

      if (!target || target.roomId !== roomId) return null;

      const current = await tx.roomQueueItem.findFirst({
        where: { roomId, isCurrent: true },
      });

      if (current && current.id !== target.id) {
        await tx.roomQueueItem.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      }

      await tx.roomQueueItem.update({
        where: { id: target.id },
        data: { isCurrent: true },
      });

      await tx.room.update({
        where: { id: roomId },
        data: {
          trackUrl: target.trackUrl,
          playbackState: 'PAUSED',
          positionMs: 0n,
        },
      });

      return this.mapQueueItem({ ...target, isCurrent: true });
    });
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

  async removeQueueItem(roomId: string, itemId: string): Promise<boolean> {
    const item = await prisma.roomQueueItem.findUnique({ where: { id: itemId } });
    if (!item) return true; // Already deleted
    if (item.roomId !== roomId) return false;

    if (item.isCurrent) {
      // Advance to the next track before deleting this one so we don't break playback sequence
      await this.advanceQueue(roomId, item.trackUrl);
    }

    await prisma.roomQueueItem.delete({ where: { id: itemId } });
    return true;
  }

  async reorderQueue(roomId: string, itemId: string, newIndex: number): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const queueItems = await tx.roomQueueItem.findMany({
        where: { roomId },
        orderBy: { queueIndex: 'asc' },
      });
      
      const oldIndexArray = queueItems.findIndex(i => i.id === itemId);
      if (oldIndexArray === -1) return false;
      
      // Reorder in memory
      const [movingItem] = queueItems.splice(oldIndexArray, 1);
      
      // Prevent out of bounds
      const safeNewIndex = Math.max(0, Math.min(newIndex, queueItems.length));
      queueItems.splice(safeNewIndex, 0, movingItem);
      
      // Persist the new sequence indices
      // First, map to temporary negative values to avoid @@unique([roomId, queueIndex]) constraint violations
      for (let i = 0; i < queueItems.length; i++) {
        await tx.roomQueueItem.update({
          where: { id: queueItems[i].id },
          data: { queueIndex: -(i + 1) }
        });
      }

      // Then map to the final correct indices
      for (let i = 0; i < queueItems.length; i++) {
        await tx.roomQueueItem.update({
          where: { id: queueItems[i].id },
          data: { queueIndex: i }
        });
      }
      
      return true;
    });
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
    };
  }

  private mapQueueItem(item: {
    id: string;
    trackUrl: string;
    title: string;
    fileName: string;
    queueIndex: number;
    isCurrent: boolean;
    uploaderUserId: string;
    createdAt: Date;
    uploader?: { name: string };
  }): TrackQueueItem {
    return {
      id: item.id,
      trackUrl: item.trackUrl,
      title: item.title,
      fileName: item.fileName,
      queueIndex: item.queueIndex,
      isCurrent: item.isCurrent,
      addedBy: item.uploaderUserId,
      addedByName: item.uploader?.name,
      createdAt: item.createdAt.getTime(),
    };
  }
}
