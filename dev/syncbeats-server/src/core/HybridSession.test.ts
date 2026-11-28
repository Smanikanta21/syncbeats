import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Server, Socket } from 'socket.io';
import { HybridSessions } from './HybridSession';
import { HybridRelay } from '../handlers/HybridRelay';
import { RoomManager } from './RoomManager';

export function testHybridSessions(): void {
  const sessions = new HybridSessions();
  const first = sessions.get('one', 1000);
  assert.equal(Buffer.from(first.key, 'base64').length, 32);
  assert.equal(first.tag.length, 24);
  assert.equal(sessions.get('one', 2000).key, first.key);
  assert.notEqual(sessions.get('two', 2000).key, first.key);
  assert.notEqual(sessions.get('one', first.expiresAt - 30_000).key, first.key, 'renew before expiry');
  sessions.revoke('one');
  assert.notEqual(sessions.get('one', 2000).key, first.key);

  const rooms = RoomManager.getInstance();
  const room = rooms.getOrCreate('hybrid-verification');
  for (const id of ['member-a', 'member-b']) room.addParticipant({ socketId: id, displayName: id, isReady: false, volume: 100, joinedAt: Date.now() });
  const delivered: { target: string; event: string; payload: any }[] = [];
  const io = { to: (target: string) => ({ emit: (event: string, payload: any) => delivered.push({ target, event, payload }) }) } as unknown as Server;
  const relay = new HybridRelay(io, rooms);
  const outsider = Object.assign(new EventEmitter(), { id: 'outsider' });
  relay.register(outsider as unknown as Socket);
  outsider.emit('hybrid:join', { roomId: room.roomId });
  outsider.emit('hybrid:join', null);
  assert.equal(delivered.length, 0, 'non-members and malformed payloads never receive LAN keys');
  const member = Object.assign(new EventEmitter(), { id: 'member-a' });
  relay.register(member as unknown as Socket);
  member.emit('hybrid:join', { roomId: room.roomId });
  assert.deepEqual(delivered.map(item => item.target), ['member-a', 'member-b']);
  const originalKey = delivered[0].payload.key;
  member.emit('hybrid:join', { roomId: room.roomId });
  assert.equal(delivered.length, 2, 'credential requests are rate-limited');
  room.removeParticipant('member-b');
  assert.equal(delivered[delivered.length - 1]?.target, 'member-a', 'removed member is excluded from rotation');
  assert.notEqual(delivered[delivered.length - 1]?.payload.key, originalKey);
  rooms.remove(room.roomId);
  console.log('Hybrid credentials: membership, room isolation, renewal, revocation and rate-limit checks passed');
}
