/**
 * seats.ts
 *
 * Where people and their devices go when nobody has placed them by hand.
 *
 * Split out of `layout.ts` (which re-exports it) purely so the collision walk
 * below is runnable outside a browser — `layout.ts` pulls in device naming,
 * which pulls in lucide-react. See `geometry.check.ts`.
 */

import { absolutePolar, normalizeAngle, stringHash, type SpatialPosition } from './geometry';

export const ROOM_CENTRE: SpatialPosition = { angle: 0, radius: 0, elevation: 0 };

export const SEAT_PREFIX = 'seat:';
export const seatKey = (userId: string) => `${SEAT_PREFIX}${userId}`;
export const isSeatKey = (key: string) => key.startsWith(SEAT_PREFIX);
export const userIdFromSeatKey = (key: string) => key.slice(SEAT_PREFIX.length);

/** How far from the room centre other people sit. */
export const SEAT_RADIUS = 2.4;

/** How far a device sits from its owner's seat. */
export const DEVICE_RADIUS = 1.0;

/**
 * Seats land on a ring of fixed bearings rather than a free hash angle.
 *
 * `hash(userId) / 2^32 · 2π` is uniformly distributed, which sounds fair and in
 * practice means two of three users routinely land a couple of degrees apart —
 * seat discs, avatars and both their device clouds drawn on top of each other.
 * Snapping to slots and skipping taken ones puts a guaranteed 45° between
 * everyone, which is the whole fix; the ring radius is left alone so a full room
 * still fits the default camera frame.
 *
 * ponytail: 8 slots is also the crowd ceiling — a 9th user reuses a slot and
 * overlaps again. Raise the count and shrink the device cloud if rooms get big.
 */
export const SEAT_SLOTS = 8;

/** Angular gap between neighbouring slots — the minimum separation guaranteed. */
export const SEAT_ARC = (Math.PI * 2) / SEAT_SLOTS;

export const slotAngle = (slot: number) => slot * SEAT_ARC;

/** Which slot a hand-placed seat sits closest to, so defaults can avoid it. */
export const nearestSlot = (angle: number) =>
  Math.round(normalizeAngle(angle) / SEAT_ARC) % SEAT_SLOTS;

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

/**
 * Deterministic seat placement, identical on every client.
 *
 * `taken` is the set of slots already occupied — by hand-placed seats or by
 * earlier defaults. The claimed slot is added to it, so callers just walk the
 * user list in a stable order.
 */
export function defaultSeatPosition(
  userId: string,
  userCount: number,
  taken: Set<number> = new Set(),
): SpatialPosition {
  if (userCount <= 1) return { ...ROOM_CENTRE };

  const from = stringHash(userId) % SEAT_SLOTS;
  let slot = from;
  for (let i = 0; i < SEAT_SLOTS; i++) {
    const candidate = (from + i) % SEAT_SLOTS;
    if (!taken.has(candidate)) {
      slot = candidate;
      break;
    }
  }

  taken.add(slot);
  return { angle: slotAngle(slot), radius: SEAT_RADIUS, elevation: 0 };
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
 * Resolve every user's seat: stored placements first, then defaults into the
 * slots that are left.
 *
 * Two passes, because a stored seat outranks a computed one. In one pass a
 * default could claim the slot of a hand-placed seat that simply hadn't been
 * visited yet, and land right on top of it.
 *
 * @param sortedUserIds Stable order — otherwise clients disagree on who got which slot
 */
export function resolveSeats(
  sortedUserIds: string[],
  positions: Record<string, SpatialPosition>,
): Map<string, { seat: SpatialPosition; isDefault: boolean }> {
  const seats = new Map<string, { seat: SpatialPosition; isDefault: boolean }>();
  const taken = new Set<number>();

  sortedUserIds.forEach(userId => {
    const stored = positions[seatKey(userId)];
    if (!stored) return;
    seats.set(userId, { seat: stored, isDefault: false });
    taken.add(nearestSlot(stored.angle));
  });

  sortedUserIds.forEach(userId => {
    if (seats.has(userId)) return;
    seats.set(userId, {
      seat: defaultSeatPosition(userId, sortedUserIds.length, taken),
      isDefault: true,
    });
  });

  return seats;
}
