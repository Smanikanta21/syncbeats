/**
 * layout.ts
 *
 * Groups participants into users + devices and decides where anything sits that
 * nobody has placed by hand yet.
 *
 * Defaults are derived from stable string hashes rather than array order, so
 * every client in the room computes the same fallback placement and nothing
 * jumps around as people join or leave. A user with two devices gets them put
 * on their left and right automatically — which is the setup that makes the
 * surround effect obvious the moment you press play.
 */

import type { Participant } from '../types';
import { getFriendlyDeviceName, initialsFor, parseParticipantNames } from '../deviceNaming';
import {
  absolutePolar,
  relativePolar,
  stringHash,
  type SpatialPosition,
} from './geometry';

export const SEAT_PREFIX = 'seat:';
export const seatKey = (userId: string) => `${SEAT_PREFIX}${userId}`;
export const isSeatKey = (key: string) => key.startsWith(SEAT_PREFIX);
export const userIdFromSeatKey = (key: string) => key.slice(SEAT_PREFIX.length);

/** How far from the room centre other people sit. */
const SEAT_RADIUS = 2.4;
/** How far a device sits from its owner's seat. */
const DEVICE_RADIUS = 1.0;

/**
 * Left, right, front, back, then the diagonals. Two devices therefore land
 * either side of you — the classic stereo placement.
 */
const DEVICE_SLOT_ANGLES = [
  -Math.PI / 2,
  Math.PI / 2,
  0,
  Math.PI,
  -(3 * Math.PI) / 4,
  (3 * Math.PI) / 4,
  -Math.PI / 4,
  Math.PI / 4,
];

export interface SpatialDevice {
  /** Socket id — the wire key for this device's position */
  deviceId: string;
  userId: string;
  label: string;
  deviceType?: string;
  isMe: boolean;
  isOwnedByMe: boolean;
  /** Absolute room coordinates — what goes over the wire */
  position: SpatialPosition;
  /** Same point re-expressed around {@link SpatialLayout.origin} — what gets drawn */
  local: SpatialPosition;
  /** True when this is a derived default rather than a placement someone made */
  isDefault: boolean;
}

export interface SpatialUser {
  userId: string;
  displayName: string;
  initials: string;
  isMe: boolean;
  seat: SpatialPosition;
  /** Seat relative to the listening origin — in My Space yours is the centre */
  seatLocal: SpatialPosition;
  seatIsDefault: boolean;
  devices: SpatialDevice[];
}

export interface SpatialLayout {
  users: SpatialUser[];
  devices: SpatialDevice[];
  me: SpatialUser | null;
  /** Origin of the surround field for the given mode, in absolute coordinates */
  origin: SpatialPosition;
}

export const ROOM_CENTRE: SpatialPosition = { angle: 0, radius: 0, elevation: 0 };

/** Deterministic seat placement, identical on every client. */
export function defaultSeatPosition(userId: string, userCount: number): SpatialPosition {
  if (userCount <= 1) return { ...ROOM_CENTRE };
  const angle = (stringHash(userId) / 0x100000000) * Math.PI * 2;
  return { angle, radius: SEAT_RADIUS, elevation: 0 };
}

/** Deterministic device placement around its owner's seat. */
export function defaultDevicePosition(
  seat: SpatialPosition,
  index: number,
  deviceCount: number,
): SpatialPosition {
  // A lone device belongs in front of you, not off to one side.
  const localAngle =
    deviceCount <= 1 ? 0 : DEVICE_SLOT_ANGLES[index % DEVICE_SLOT_ANGLES.length];
  return absolutePolar({ angle: localAngle, radius: DEVICE_RADIUS, elevation: 0 }, seat);
}

/**
 * Build the full picture from the participant list plus whatever positions the
 * server knows about.
 *
 * @param positions Server-known positions, keyed by socket id or `seat:<userId>`
 * @param mode      'solo' centres the field on your own seat; 'room' on the room
 */
export function buildSpatialLayout(
  participants: Participant[],
  positions: Record<string, SpatialPosition>,
  myUserId: string,
  mySocketId: string,
  mode: 'solo' | 'room' = 'room',
): SpatialLayout {
  const byUser = new Map<string, Participant[]>();

  participants.forEach(p => {
    const userId = p.userId ?? p.socketId;
    if (!byUser.has(userId)) byUser.set(userId, []);
    byUser.get(userId)!.push(p);
  });

  const resolvedMyUserId =
    participants.find(p => p.socketId === mySocketId)?.userId ?? myUserId ?? mySocketId;

  const userCount = byUser.size;

  // Sorted so device slot assignment is stable across clients and reconnects.
  const sortedUserIds = Array.from(byUser.keys()).sort();

  // Seats resolve first: the listening origin depends on mine, and every
  // device's drawn position depends on that origin.
  const seats = new Map<string, { seat: SpatialPosition; isDefault: boolean }>();
  sortedUserIds.forEach(userId => {
    const stored = positions[seatKey(userId)];
    seats.set(userId, {
      seat: stored ?? defaultSeatPosition(userId, userCount),
      isDefault: !stored,
    });
  });

  const mySeat = seats.get(resolvedMyUserId)?.seat;
  const origin = mode === 'solo' ? (mySeat ?? ROOM_CENTRE) : ROOM_CENTRE;

  const users: SpatialUser[] = [];
  const devices: SpatialDevice[] = [];

  sortedUserIds.forEach(userId => {
    const members = byUser.get(userId)!.slice().sort((a, b) => a.socketId.localeCompare(b.socketId));
    const isMe = userId === resolvedMyUserId;
    const { seat, isDefault: seatIsDefault } = seats.get(userId)!;

    const userDevices: SpatialDevice[] = members.map((p, index) => {
      const stored = positions[p.socketId];
      const position = stored ?? defaultDevicePosition(seat, index, members.length);
      const { deviceName } = parseParticipantNames(p, true);
      return {
        deviceId: p.socketId,
        userId,
        label: deviceName || getFriendlyDeviceName('', p.outputDeviceType, undefined, true),
        deviceType: p.outputDeviceType,
        isMe: p.socketId === mySocketId,
        isOwnedByMe: isMe,
        position,
        local: relativePolar(position, origin),
        isDefault: !stored,
      };
    });

    const displayName = (members[0]?.displayName || 'Guest').split('::')[0].trim() || 'Guest';

    users.push({
      userId,
      displayName,
      initials: initialsFor(displayName),
      isMe,
      seat,
      seatLocal: relativePolar(seat, origin),
      seatIsDefault,
      devices: userDevices,
    });
    devices.push(...userDevices);
  });

  const me = users.find(u => u.isMe) ?? null;

  return { users, devices, me, origin };
}
