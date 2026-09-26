/**
 * layout.ts
 *
 * Groups participants into users + devices and decides where anything sits that
 * nobody has placed by hand yet. Placement itself lives in `seats.ts`.
 *
 * Defaults are derived from stable string hashes rather than array order, so
 * every client in the room computes the same fallback placement and nothing
 * jumps around as people join or leave. A user with two devices gets them put
 * on their left and right automatically — which is the setup that makes the
 * surround effect obvious the moment you press play.
 *
 * Everything is drawn from **your** seat outward, so two people in one room see
 * each other reciprocally: put someone on your right and you land on their left.
 * That is just `relativePolar` being odd in the difference vector — no extra
 * bookkeeping. See {@link SpatialLayout.fieldOrigin} for the frame that must
 * *not* be per-device.
 */

import type { Participant } from '../types';
import { getFriendlyDeviceName, initialsFor, parseParticipantNames } from '../deviceNaming';
import { relativePolar, type SpatialPosition } from './geometry';
import { ROOM_CENTRE, defaultDevicePosition, resolveSeats } from './seats';

export {
  ROOM_CENTRE,
  SEAT_PREFIX,
  defaultDevicePosition,
  defaultSeatPosition,
  isSeatKey,
  seatKey,
  userIdFromSeatKey,
} from './seats';

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
  /** Seat relative to the view origin — yours is always the centre */
  seatLocal: SpatialPosition;
  seatIsDefault: boolean;
  devices: SpatialDevice[];
}

export interface SpatialLayout {
  users: SpatialUser[];
  devices: SpatialDevice[];
  me: SpatialUser | null;
  /** Where this device views the room from — your seat. Per-device by design. */
  origin: SpatialPosition;
  /**
   * Frame the VBAP pan is computed in. Must be identical on every client:
   * `setField` derives `ringAngles` from it and `ringAngles` decides where the
   * travelling source is, so two clients with different field origins would
   * sweep the sound across the room differently.
   */
  fieldOrigin: SpatialPosition;
}

/**
 * Build the full picture from the participant list plus whatever positions the
 * server knows about.
 *
 * @param positions Server-known positions, keyed by socket id or `seat:<userId>`
 * @param mode      'solo' also narrows the pan field to your own devices
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

  // Sorted so seat and device slot assignment is stable across clients and reconnects.
  const sortedUserIds = Array.from(byUser.keys()).sort();

  // Seats resolve first: the listening origin depends on mine, and every
  // device's drawn position depends on that origin.
  const seats = resolveSeats(sortedUserIds, positions);

  const mySeat = seats.get(resolvedMyUserId)?.seat;

  // Both modes draw from where *you* are. The old god's-eye Room view made
  // "left" mean left-of-the-room, so dragging someone's phone left said nothing
  // about where it sat relative to your Mac — and disagreed with what you heard,
  // since the HRTF was already computed from this device's own position.
  const origin = mySeat ?? ROOM_CENTRE;

  // ...but the pan has to stay in a frame everyone agrees on. See SpatialLayout.
  const fieldOrigin = mode === 'solo' ? origin : ROOM_CENTRE;

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

  return { users, devices, me, origin, fieldOrigin };
}
