// db/RoomRepository.ts — pg-based SQL for rooms & room_participants

import { getPool } from './pool';
import { PlaybackState } from '../core/PlaybackState';

export interface RoomRow {
  id:             string;
  host_id:        string;
  track_url:      string | null;
  playback_state: string;
  position_ms:    number;
  created_at:     Date;
  ended_at:       Date | null;
}

export interface ParticipantRow {
  room_id:      string;
  user_id:      string;
  socket_id:    string;
  display_name: string;
  joined_at:    Date;
  left_at:      Date | null;
}

export class RoomRepository {
  // ── Room CRUD ─────────────────────────────────────────────────────────

  async create(roomId: string, hostUserId: string): Promise<RoomRow> {
    const { rows } = await getPool().query<RoomRow>(
      `INSERT INTO rooms (id, host_id)
       VALUES ($1, $2)
       RETURNING id, host_id, track_url, playback_state, position_ms::int, created_at, ended_at`,
      [roomId, hostUserId]
    );
    return rows[0];
  }

  async findById(roomId: string): Promise<RoomRow | null> {
    const { rows } = await getPool().query<RoomRow>(
      'SELECT id, host_id, track_url, playback_state, position_ms::int, created_at, ended_at FROM rooms WHERE id = $1',
      [roomId]
    );
    return rows[0] ?? null;
  }

  async listActive(): Promise<RoomRow[]> {
    const { rows } = await getPool().query<RoomRow>(
      'SELECT id, host_id, track_url, playback_state, position_ms::int, created_at, ended_at FROM rooms WHERE ended_at IS NULL ORDER BY created_at DESC'
    );
    return rows;
  }

  async listByUser(userId: string): Promise<RoomRow[]> {
    const { rows } = await getPool().query<RoomRow>(
      'SELECT id, host_id, track_url, playback_state, position_ms::int, created_at, ended_at FROM rooms WHERE host_id = $1 ORDER BY created_at DESC LIMIT 20',
      [userId]
    );
    return rows;
  }

  async updateState(
    roomId: string,
    state: PlaybackState,
    positionMs: number,
    trackUrl?: string | null
  ): Promise<void> {
    await getPool().query(
      `UPDATE rooms
       SET playback_state = $2, position_ms = $3, track_url = COALESCE($4, track_url)
       WHERE id = $1`,
      [roomId, state, positionMs, trackUrl ?? null]
    );
  }

  async markEnded(roomId: string): Promise<void> {
    await getPool().query(
      'UPDATE rooms SET ended_at = NOW() WHERE id = $1',
      [roomId]
    );
  }

  // ── Participants ──────────────────────────────────────────────────────

  async upsertParticipant(
    roomId: string,
    userId: string,
    socketId: string,
    displayName: string
  ): Promise<void> {
    await getPool().query(
      `INSERT INTO room_participants (room_id, user_id, socket_id, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET socket_id = $3, display_name = $4, left_at = NULL, joined_at = NOW()`,
      [roomId, userId, socketId, displayName]
    );
  }

  async markParticipantLeft(roomId: string, userId: string): Promise<void> {
    await getPool().query(
      'UPDATE room_participants SET left_at = NOW() WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
  }

  async getParticipants(roomId: string): Promise<ParticipantRow[]> {
    const { rows } = await getPool().query<ParticipantRow>(
      `SELECT room_id, user_id, socket_id, display_name, joined_at, left_at
       FROM room_participants WHERE room_id = $1 AND left_at IS NULL ORDER BY joined_at`,
      [roomId]
    );
    return rows;
  }
}
