import assert from 'assert';
import { Room } from './Room';
import { PlaybackState } from './PlaybackState';
import { RoomQueue, trackKey } from './RoomQueue';

function roomWithTracks() {
  const room = new Room('123456');
  room.initializeFromDatabase({ hostId: 'host', trackUrl: null, playbackState: 'IDLE', positionMs: 0 });
  for (const socketId of ['a', 'b']) room.addParticipant({ socketId, displayName: socketId, joinedAt: Date.now(), isReady: false, volume: 100 });
  room.addTracks(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'].map(id => ({ trackUrl: 'youtube:' + id, title: id })), 'a');
  return room;
}
function ready(room: Room) {
  for (const id of ['a', 'b']) room.setParticipantReady(id, true, room.getTrackUrl()!);
}

export function testPlayback(): void {
  const room = roomWithTracks();
  const schedules: { playbackInstanceId: string; startEpoch: number }[] = [];
  room.on('schedule', payload => schedules.push(payload));
  room.play('a');
  assert.equal(room.snapshot().pendingPlay, true);
  room.setParticipantReady('a', true, 'youtube:bbbbbbbbbbb');
  assert.equal(room.snapshot().participants[0].isReady, false, 'stale readiness must not release the gate');
  ready(room);
  assert.equal(schedules.length, 1);
  const first = room.snapshot();
  room.addTracks([{ trackUrl: 'youtube:ddddddddddd', title: 'Fourth' }], 'b');
  room.moveInQueue(room.getQueue()[3].id, 2);
  assert.equal(schedules.length, 1, 'editing upcoming tracks must not reschedule playback');
  assert.equal(room.snapshot().playbackInstanceId, first.playbackInstanceId);

  room.setRepeatMode('track');
  for (let cycle = 0; cycle < 3; cycle++) {
    const before = room.snapshot();
    const count = schedules.length;
    room.handleTrackEnded(before.trackUrl!, before.playbackInstanceId!);
    room.handleTrackEnded(before.trackUrl!, before.playbackInstanceId!);
    assert.equal(schedules.length, count + 1, 'two devices must only restart repeat-one once');
    assert.notEqual(room.snapshot().playbackInstanceId, before.playbackInstanceId);
    assert.equal(room.snapshot().trackUrl, before.trackUrl);
    assert.equal(room.snapshot().pendingPlay, false, 'a cached repeat must not wait ten seconds');
  }
  room.nextTrack();
  assert.equal(room.getTrackUrl(), 'youtube:bbbbbbbbbbb', 'explicit Next bypasses repeat-one');
  ready(room);
  const beforePause = room.snapshot();
  room.pause('a');
  assert.equal(room.handleTrackEnded(beforePause.trackUrl!, beforePause.playbackInstanceId!), null);
  room.play('b');
  const resumed = room.snapshot();
  assert.notEqual(resumed.playbackInstanceId, beforePause.playbackInstanceId);
  assert.equal(room.handleTrackEnded(beforePause.trackUrl!, beforePause.playbackInstanceId!), null);
  room.seek('a', 1234);
  assert.equal(room.snapshot().pauseOffset, 1.234, 'seek offsets remain seconds on snapshots');
  assert.notEqual(room.snapshot().playbackInstanceId, resumed.playbackInstanceId);
  assert.equal(room.handleTrackEnded(resumed.trackUrl!, resumed.playbackInstanceId!), null);

  room.setRepeatMode('off');
  room.setCurrentItem(room.getQueue()[room.getQueue().length - 1].id, true);
  ready(room);
  const last = room.snapshot();
  room.handleTrackEnded(last.trackUrl!, last.playbackInstanceId!);
  assert.equal(room.snapshot().state, PlaybackState.IDLE);
  assert.equal(room.snapshot().trackUrl, null);
  assert.equal(room.getQueue().length, 4, 'completion retains queue/history');
  const restored = new Room('123456');
  restored.initializeFromDatabase({ hostId: 'host', trackUrl: null, playbackState: 'IDLE', positionMs: 0, queue: room.getQueueState() });
  assert.equal(restored.snapshot().trackUrl, null, 'hydrating history must not resurrect exhausted playback');

  const pending = roomWithTracks();
  pending.play('a');
  pending.pause('b');
  ready(pending);
  assert.equal(pending.snapshot().isPlaying, false, 'pause while buffering cancels pending play');

  const empty = new Room('654321');
  let emptySchedules = 0;
  empty.on('schedule', () => emptySchedules++);
  empty.play('a');
  assert.equal(emptySchedules, 0);

  assert.equal(trackKey('https://youtu.be/aaaaaaaaaaa'), trackKey('ws-p2p:yt:aaaaaaaaaaa'));
  const queue = new RoomQueue();
  queue.add(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc'].map(id => ({ trackUrl: 'youtube:' + id })), 'a');
  queue.setRepeat('all');
  queue.setShuffle(true);
  queue.setCurrent(queue.snapshot()[queue.size - 1].id);
  const target = queue.peekNext()!.id;
  assert.equal(queue.peekNext()!.id, target, 'shuffle look-ahead must remain stable');
  const copy = RoomQueue.fromJSON(structuredClone(queue.toJSON()));
  assert.equal(copy.peekNext()!.id, target, 'persist the next shuffled lap with the queue');
  assert.equal(queue.next()!.id, target, 'advance to the published prefetch target');
  console.log('Room playback: recovery, readiness, completion, repeat and shuffle checks passed');
}
