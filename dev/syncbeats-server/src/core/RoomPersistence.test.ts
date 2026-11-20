import assert from 'assert';
import { RoomPersistence, type DurableRoomState } from './RoomPersistence';

const state = (position: number): DurableRoomState => ({ state: 'PAUSED', positionMs: position, trackUrl: 'youtube:aaaaaaaaaaa', queue: { items: [{ title: 'Original' }], currentId: 'a' } });

export async function testPersistence(): Promise<void> {
  const writes: DurableRoomState[] = [];
  const persistence = new RoomPersistence(async (_id, value) => { writes.push(value); }, () => {});
  const original = state(1);
  persistence.schedule('room', original);
  (original.queue as { items: { title: string }[] }).items[0].title = 'Mutated';
  await persistence.flush();
  assert.equal((writes[0].queue as { items: { title: string }[] }).items[0].title, 'Original');

  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>(resolve => { started = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const positions: number[] = [];
  let active = 0;
  const serial = new RoomPersistence(async (_id, value) => {
    active++;
    assert.equal(active, 1, 'writes for one room must never overlap');
    positions.push(value.positionMs);
    if (positions.length === 1) { started(); await gate; }
    active--;
  }, () => {}, 0);
  serial.schedule('room', state(1));
  // Keep the process alive while the deliberately unref'ed persistence timer starts.
  const alive = setTimeout(() => {}, 1000);
  await began;
  serial.schedule('room', state(2));
  serial.schedule('room', state(3));
  release();
  await serial.flush();
  clearTimeout(alive);
  assert.deepEqual(positions, [1, 3], 'coalesce intermediate changes but persist the latest after the older write');

  let attempts = 0;
  const retry = new RoomPersistence(async (_id, value) => {
    attempts++;
    if (attempts === 1) throw new Error('temporary database failure');
    assert.equal(value.positionMs, 42);
  }, () => {});
  retry.schedule('room', state(42));
  await assert.rejects(retry.flush(), /temporary database failure/);
  await retry.flush();
  assert.equal(attempts, 2, 'a failed final write must remain available for retry/flush');
  console.log('Room persistence: atomic snapshots, serialized writes and failed-save recovery checks passed');
}
