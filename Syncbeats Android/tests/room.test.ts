import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RoomConnection } from '../src/sync/roomConnection';
import { snapshot, Socket } from './fixtures';

function setup() {
  const socket = new Socket(), errors: string[] = [];
  const room = new RoomConnection(socket, '123456', { id: 'user-1', name: 'Listener', email: 'test@example.com' }, 'device-1', {
    snapshot: () => {}, state: () => {}, error: message => errors.push(message), stats: () => {},
  });
  return { socket, room, errors };
}
test('play commands leave local state unchanged until authoritative snapshots arrive', () => {
  const { socket, room } = setup(); socket.receive('room:snapshot', snapshot());
  assert.equal(room.command('playback:play'), true); assert.equal(room.snapshot?.isPlaying, false);
  assert.deepEqual(socket.sent.at(-1), { event: 'playback:play', payload: { roomId: '123456' } });
  socket.receive('room:stateChanged', snapshot({ isPlaying: true, startEpoch: Date.now(), state: 'PLAYING', timestamp: Date.now() + 1 }));
  assert.equal(room.snapshot?.isPlaying, true); room.dispose();
});
test('only the loaded current track declares readiness, and snapshots redeclare it after reconnect', () => {
  const { socket, room } = setup(); socket.receive('room:snapshot', snapshot()); room.markLoaded('youtube:zzzzzzzzzzz');
  assert.equal(socket.sent.filter(item => item.event === 'room:clientReady').length, 0);
  room.markLoaded('youtube:abcdefghijk'); room.markLoaded('youtube:abcdefghijk');
  assert.equal(socket.sent.filter(item => item.event === 'room:clientReady').length, 1);
  socket.connected = false; socket.receive('disconnect'); socket.id = 'phone-2'; socket.connected = true; socket.receive('connect');
  socket.receive('room:snapshot', snapshot());
  assert.equal(socket.sent.filter(item => item.event === 'room:clientReady').length, 2);
  assert.equal(socket.sent.find(item => item.event === 'room:join')?.payload.userId, 'user-1'); room.dispose();
});
test('offline commands are rejected instead of buffered for a later room', () => {
  const { socket, room, errors } = setup(); socket.receive('room:snapshot', snapshot()); socket.connected = false; socket.receive('disconnect');
  assert.equal(room.command('playback:seek', { position: 30000 }), false);
  assert.equal(socket.sent.filter(item => item.event === 'playback:seek').length, 0); assert.match(errors[0], /reconnects/); room.dispose();
});
test('wrong-room and older snapshots cannot replace current playback', () => {
  const { socket, room } = setup(); socket.receive('room:snapshot', snapshot({ timestamp: 100 }));
  socket.receive('room:stateChanged', snapshot({ timestamp: 99, trackUrl: null }));
  socket.receive('room:stateChanged', snapshot({ roomId: '654321', timestamp: 101, trackUrl: null }));
  assert.equal(room.snapshot?.trackUrl, 'youtube:abcdefghijk');
  socket.receive('room:stateChanged', snapshot({ timestamp: 101, trackUrl: null })); assert.equal(room.snapshot?.trackUrl, null); room.dispose();
});
test('failed audio clears readiness and disposal removes all socket listeners', () => {
  const { socket, room } = setup(); socket.receive('room:snapshot', snapshot()); room.markLoaded('youtube:abcdefghijk'); room.blocked();
  assert.equal(socket.sent.filter(item => item.event === 'room:clientReady').at(-1)?.payload.isReady, false);
  room.dispose(); assert.equal([...socket.handlers.values()].reduce((sum, set) => sum + set.size, 0), 0);
});
