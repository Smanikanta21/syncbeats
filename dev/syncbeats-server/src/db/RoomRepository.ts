// db/RoomRepository.ts — Prisma-based implementation

import prisma, { sanitizeNullBytes } from './prisma';
import { Prisma } from '@prisma/client';
import { Participant, TrackQueueItem } from '../types';
import { sanitizeString } from '../auth/UserRepository';

export interface RoomRow {
  id: string;
  host_id: string;
  track_url: string | null;
  playback_state: string;
  position_ms: number;
  created_at: Date;
  ended_at: Date | null;
  shuffle: boolean;
  repeat_mode: string;
  participant_count?: number;
}

interface NewQueueTrackInput {
  trackUrl: string;
  title: string;
  artist?: string;
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

  async getQueue(roomId: string): Promise<TrackQueueItem[]> {
    const items = await prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: { queueIndex: 'asc' },
      include: { uploader: { select: { name: true } } }
    });

    // Auto-purge any corrupted legacy items (e.g. truncated YouTube IDs < 11 chars)
    const validItems: typeof items = [];
    const corruptedIds: string[] = [];

    for (const item of items) {
      if (item.trackUrl) {
        const m = item.trackUrl.match(/^(?:ws-p2p:yt:|youtube:)([^?&]+)/);
        if (m && m[1].length < 11) {
          console.warn(`[RoomRepository] Auto-purging corrupted legacy queue item ${item.id} with truncated trackUrl: ${item.trackUrl}`);
          corruptedIds.push(item.id);
          continue;
        }
      }
      validItems.push(item);
    }

    if (corruptedIds.length > 0) {
      void prisma.roomQueueItem.deleteMany({
        where: { id: { in: corruptedIds } }
      }).catch(err => console.warn('[RoomRepository] Failed to delete corrupted queue items:', err));
    }

    const mapped = validItems.map((item) => this.mapQueueItem(item));

    // Enrich with thumbnails from the Song catalog (only for queue items missing thumbnails)
    const missingThumbnails = mapped.filter((item) => !item.thumbnail);
    if (missingThumbnails.length > 0) {
      try {
        const titles = Array.from(
          new Set(
            missingThumbnails
              .map((m) => sanitizeNullBytes(m.title)?.replace(/\0/g, ''))
              .filter((t): t is string => Boolean(t) && !t.includes('\0'))
          )
        ).slice(0, 50); // Limit bind parameters to max 50 to prevent Postgres protocol violations

        if (titles.length > 0) {
          const songs = await prisma.song.findMany({
            where: { title: { in: titles } },
            select: { title: true, artist: true, albumArt: true, youtubeThumbnail: true }
          });
          const songMap = new Map<string, { albumArt?: string | null; youtubeThumbnail?: string | null }>();
          for (const s of songs) {
            const key = `${s.title.toLowerCase()}::${(s.artist || '').toLowerCase()}`;
            songMap.set(key, s);
            if (!songMap.has(s.title.toLowerCase())) {
              songMap.set(s.title.toLowerCase(), s);
            }
          }
          for (const item of mapped) {
            if (item.thumbnail) continue;
            const exactKey = `${item.title.toLowerCase()}::${(item.artist || '').toLowerCase()}`;
            const match = songMap.get(exactKey) || songMap.get(item.title.toLowerCase());
            if (match) {
              item.thumbnail = match.albumArt || match.youtubeThumbnail || undefined;
            }
          }
        }
      } catch (err) {
        console.warn('[RoomRepository] Song thumbnail enrichment warning:', err);
      }
    }

    return mapped;
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
    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
    if (!room) {
      throw new Error('Room not found');
    }

    const [current, last] = await Promise.all([
      prisma.roomQueueItem.findFirst({
        where: { roomId, isCurrent: true },
        orderBy: { queueIndex: 'asc' },
      }),
      prisma.roomQueueItem.findFirst({
        where: { roomId },
        orderBy: { queueIndex: 'desc' },
        select: { queueIndex: true },
      }),
    ]);

    const queueIndex = (last?.queueIndex ?? -1) + 1;
    const activated = !current;
    const cleanTrackUrl = sanitizeString(input.trackUrl);
    const cleanTitle = sanitizeString(input.title);
    const cleanArtist = input.artist ? sanitizeString(input.artist) : undefined;
    const cleanFileName = sanitizeString(input.fileName);
    const cleanMimeType = sanitizeString(input.mimeType);

    const created = await prisma.roomQueueItem.create({
      data: {
        roomId,
        uploaderUserId,
        trackUrl: cleanTrackUrl,
        title: cleanTitle,
        artist: cleanArtist,
        fileName: cleanFileName,
        mimeType: cleanMimeType,
        sizeBytes: BigInt(input.sizeBytes),
        queueIndex,
        isCurrent: activated,
      },
      include: { uploader: { select: { name: true } } }
    });

    if (activated) {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          trackUrl: cleanTrackUrl,
          playbackState: 'PAUSED',
          positionMs: 0n,
        },
      });
    }

    // Enrich with thumbnail from Song catalog
    const mapped = this.mapQueueItem(created);
    try {
      const song = await prisma.song.findFirst({
        where: { title: input.title, ...(input.artist ? { artist: input.artist } : {}) },
        select: { albumArt: true, youtubeThumbnail: true }
      });
      if (song) {
        mapped.thumbnail = song.albumArt || song.youtubeThumbnail || undefined;
      }
    } catch (e) {
      // Non-critical thumbnail lookup exception handling
    }

    return {
      item: mapped,
      activated,
    };
  }

  async updatePlaybackSettings(roomId: string, settings: { shuffle?: boolean, repeatMode?: "off" | "track" | "all" }): Promise<void> {
    const data: any = {};
    if (settings.shuffle !== undefined) data.shuffle = settings.shuffle;
    if (settings.repeatMode !== undefined) data.repeatMode = settings.repeatMode;
    if (Object.keys(data).length > 0) {
      await prisma.room.update({
        where: { id: roomId },
        data
      });
    }

    if (settings.shuffle !== undefined) {
      const tracks = await prisma.roomQueueItem.findMany({
        where: { roomId },
        orderBy: settings.shuffle ? { queueIndex: 'asc' } : { createdAt: 'asc' }
      });
      
      if (tracks.length > 0) {
         let sortedTracks = [...tracks];
         if (settings.shuffle) {
           // Fisher-Yates shuffle
           for (let i = sortedTracks.length - 1; i > 0; i--) {
             const j = Math.floor(Math.random() * (i + 1));
             [sortedTracks[i], sortedTracks[j]] = [sortedTracks[j], sortedTracks[i]];
           }
           
           // Keep current track at the beginning
           const currentIndex = sortedTracks.findIndex(t => t.isCurrent);
           if (currentIndex > -1) {
             const current = sortedTracks.splice(currentIndex, 1)[0];
             sortedTracks.unshift(current);
           }
         } else {
           sortedTracks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
         }
         
         // 2-Pass update to prevent unique constraint (room_id, queue_index) collisions
         await Promise.all(
           sortedTracks.map((track, i) => 
             prisma.roomQueueItem.update({
               where: { id: track.id },
               data: { queueIndex: -(i + 1) }
             })
           )
         );
         await Promise.all(
           sortedTracks.map((track, i) => 
             prisma.roomQueueItem.update({
               where: { id: track.id },
               data: { queueIndex: i }
             })
           )
         );
      }
    }
  }

  async clearEntireQueue(roomId: string): Promise<void> {
    await prisma.roomQueueItem.deleteMany({
      where: { roomId }
    });
    await prisma.room.update({
      where: { id: roomId },
      data: {
        trackUrl: null,
        playbackState: 'IDLE',
        positionMs: 0,
      }
    }).catch(() => {});
  }

  async advanceQueue(roomId: string, expectedCurrentTrackUrl?: string): Promise<TrackQueueItem | null | undefined> {
    const current = await prisma.roomQueueItem.findFirst({
      where: { roomId, isCurrent: true },
      orderBy: { queueIndex: 'asc' },
    });

    if (expectedCurrentTrackUrl !== undefined && current && current.trackUrl !== expectedCurrentTrackUrl) {
      return undefined;
    }

    if (!current) {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          trackUrl: null,
          playbackState: 'IDLE',
          positionMs: 0n,
        },
      });
      return expectedCurrentTrackUrl !== undefined ? undefined : null;
    }

    const room = await prisma.room.findUnique({ where: { id: roomId }, select: { shuffle: true, repeatMode: true } });
    const shuffle = room?.shuffle ?? false;
    const repeatMode = room?.repeatMode ?? "off";

    if (repeatMode === "track") {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          playbackState: 'PLAYING',
          positionMs: 0n,
        },
      });
      return this.mapQueueItem({ ...current, isCurrent: true, uploader: undefined as any }); 
    }

    let next: any = null;

    if (shuffle) {
      const allItems = await prisma.roomQueueItem.findMany({
        where: { roomId, id: { not: current.id } },
        include: { uploader: { select: { name: true } } }
      });
      if (allItems.length > 0) {
        next = allItems[Math.floor(Math.random() * allItems.length)];
      }
    } else {
      next = await prisma.roomQueueItem.findFirst({
        where: { roomId, queueIndex: { gt: current.queueIndex } },
        orderBy: { queueIndex: 'asc' },
        include: { uploader: { select: { name: true } } }
      });
    }

    if (!next && repeatMode === "all") {
      next = await prisma.roomQueueItem.findFirst({
        where: { roomId },
        orderBy: { queueIndex: 'asc' },
        include: { uploader: { select: { name: true } } }
      });
    }

    if (!next) {
      await prisma.roomQueueItem.updateMany({
        where: { id: current.id },
        data: { isCurrent: false },
      });
      await prisma.room.update({
        where: { id: roomId },
        data: {
          trackUrl: null,
          playbackState: 'IDLE',
          positionMs: 0n,
        },
      });
      return null;
    }

    if (current.id === next.id) {
      await prisma.room.update({
        where: { id: roomId },
        data: {
          trackUrl: sanitizeNullBytes(next.trackUrl),
          playbackState: 'PAUSED',
          positionMs: 0n,
        },
      });
    } else {
      await prisma.roomQueueItem.updateMany({
        where: { id: current.id },
        data: { isCurrent: false },
      });
      await prisma.roomQueueItem.updateMany({
        where: { id: next.id },
        data: { isCurrent: true },
      });
      await prisma.room.update({
        where: { id: roomId },
        data: {
          trackUrl: sanitizeNullBytes(next.trackUrl),
          playbackState: 'PAUSED',
          positionMs: 0n,
        },
      });
    }

    return this.mapQueueItem({ ...next, isCurrent: true });
  }

  async prevQueue(roomId: string): Promise<TrackQueueItem | null | undefined> {
    const current = await prisma.roomQueueItem.findFirst({
      where: { roomId, isCurrent: true },
    });

    if (!current) return undefined;

    const prev = await prisma.roomQueueItem.findFirst({
      where: { roomId, queueIndex: { lt: current.queueIndex } },
      orderBy: { queueIndex: 'desc' },
      include: { uploader: { select: { name: true } } }
    });

    if (!prev) return undefined;

    await prisma.roomQueueItem.updateMany({
      where: { id: current.id },
      data: { isCurrent: false },
    });
    await prisma.roomQueueItem.updateMany({
      where: { id: prev.id },
      data: { isCurrent: true },
    });
    await prisma.room.update({
      where: { id: roomId },
      data: {
        trackUrl: sanitizeNullBytes(prev.trackUrl),
        playbackState: 'PAUSED',
        positionMs: 0n,
      },
    });

    return this.mapQueueItem({ ...prev, isCurrent: true });
  }

  async jumpToQueueItem(roomId: string, itemId: string): Promise<TrackQueueItem | null> {
    return prisma.$transaction(async (tx) => {
      const targetItem = await tx.roomQueueItem.findFirst({
        where: { roomId, id: itemId },
        include: { uploader: { select: { name: true } } }
      });

      if (!targetItem) return null;

      // 1. Unset current status on any previously playing queue item
      await tx.roomQueueItem.updateMany({
        where: { roomId, isCurrent: true },
        data: { isCurrent: false },
      });

      // 2. Set target item as current
      const updatedTarget = await tx.roomQueueItem.update({
        where: { id: itemId },
        data: { isCurrent: true },
        include: { uploader: { select: { name: true } } }
      });

      // 3. Update room state to new track
      await tx.room.update({
        where: { id: roomId },
        data: {
          trackUrl: sanitizeNullBytes(targetItem.trackUrl),
          playbackState: 'PAUSED',
          positionMs: 0n,
        },
      });

      return this.mapQueueItem(updatedTarget);
    }, {
      timeout: 30000
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
    try {
      const item = await prisma.roomQueueItem.findFirst({
        where: {
          roomId,
          OR: [
            { id: itemId },
            { trackUrl: itemId }
          ]
        }
      });
      if (item && item.isCurrent) {
        await this.advanceQueue(roomId, item.trackUrl);
      }
      await prisma.roomQueueItem.deleteMany({
        where: {
          roomId,
          OR: [
            { id: itemId },
            { trackUrl: itemId }
          ]
        }
      });
      return true;
    } catch (err) {
      console.error('[RoomRepository] removeQueueItem error:', err);
      return true;
    }
  }

  async clearUpcomingQueue(roomId: string): Promise<boolean> {
    const queueItems = await prisma.roomQueueItem.findMany({
      where: { roomId },
      orderBy: { queueIndex: 'asc' },
    });
    
    const currentIndex = queueItems.findIndex(i => i.isCurrent);
    if (currentIndex === -1) {
       await prisma.roomQueueItem.deleteMany({ where: { roomId } });
       return true;
    }
    // Delete from currentIndex to the end (current + upcoming)
    const itemsToDelete = queueItems.slice(currentIndex).map(i => i.id);
    if (itemsToDelete.length > 0) {
      await prisma.roomQueueItem.deleteMany({
        where: { id: { in: itemsToDelete } }
      });
    }

    await prisma.room.update({
      where: { id: roomId },
      data: {
        trackUrl: null,
        playbackState: 'IDLE',
        positionMs: 0n,
      }
    });

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
      
      // 1. Shift all items to unique temporary negative indices to prevent unique constraint (room_id, queue_index) collision
      await Promise.all(
        queueItems.map((item, i) =>
          tx.roomQueueItem.update({
            where: { id: item.id },
            data: { queueIndex: -(i + 1) }
          })
        )
      );

      // 2. Set final target indices
      await Promise.all(
        queueItems.map((item, i) =>
          tx.roomQueueItem.update({
            where: { id: item.id },
            data: { queueIndex: i }
          })
        )
      );
      
      return true;
    }, {
      timeout: 15000
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
      shuffle: r.shuffle ?? false,
      repeat_mode: r.repeatMode ?? "off",
    };
  }

  private mapQueueItem(item: {
    id: string;
    trackUrl: string;
    title: string;
    artist?: string | null;
    fileName: string;
    queueIndex: number;
    isCurrent: boolean;
    uploaderUserId: string;
    createdAt: Date;
    sizeBytes?: bigint;
    uploader?: { name: string };
  }): TrackQueueItem {
    return {
      id: item.id,
      trackUrl: sanitizeNullBytes(item.trackUrl) || item.trackUrl,
      title: sanitizeNullBytes(item.title) || item.title,
      artist: item.artist ? (sanitizeNullBytes(item.artist) || undefined) : undefined,
      fileName: sanitizeNullBytes(item.fileName) || item.fileName,
      queueIndex: item.queueIndex,
      isCurrent: item.isCurrent,
      addedBy: item.uploaderUserId,
      addedByName: item.uploader?.name ? (sanitizeNullBytes(item.uploader.name) || item.uploader.name) : undefined,
      createdAt: item.createdAt.getTime(),
      sizeBytes: item.sizeBytes ? Number(item.sizeBytes) : undefined,
    };
  }
}
