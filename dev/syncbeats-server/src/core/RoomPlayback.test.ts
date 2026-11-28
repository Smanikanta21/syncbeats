import { trackDuration } from '../utils/trackDuration';
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
  assert.equal(trackDuration(218.25), 218.25);
  for (const value of [undefined, null, '218', NaN, Infinity, -1, 0, 86401]) assert.equal(trackDuration(value), undefined);

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
  assert.equal(room.snapshot().state, PlaybackState.PAUSED);
  assert.equal(room.snapshot().trackUrl, last.trackUrl, 'completion keeps the selected song available for replay');
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
  const metadataRoom = roomWithTracks();
  ready(metadataRoom); metadataRoom.play('a');
  const beforeMetadata = metadataRoom.snapshot();
  const currentMetadata = metadataRoom.getCurrentItem()!;
  let metadataEvents = 0, metadataSchedules = 0;
  metadataRoom.on('queueChanged', () => metadataEvents++);
  metadataRoom.on('schedule', () => metadataSchedules++);
  const enrichment = metadataRoom.addTracks([{
    trackUrl: currentMetadata.trackUrl, title: 'Original Song - Reprise (Live)', artist: 'Original Artist',
    thumbnail: 'https://example.invalid/album.jpg', metadataSource: 'library',
  }], 'b');
  assert.equal(enrichment.added.length, 0, 'library selection enriches the existing audio without duplication');
  assert.equal(enrichment.first?.id, currentMetadata.id);
  assert.equal(enrichment.first?.title, 'Original Song - Reprise (Live)');
  assert.equal(enrichment.first?.artist, 'Original Artist');
  assert.equal(metadataEvents, 1, 'metadata corrections broadcast to all room clients');
  assert.equal(metadataSchedules, 0, 'metadata corrections do not reschedule audio');
  assert.equal(metadataRoom.snapshot().startEpoch, beforeMetadata.startEpoch);
  assert.equal(metadataRoom.snapshot().playbackInstanceId, beforeMetadata.playbackInstanceId);
  metadataRoom.addTracks([{ trackUrl: currentMetadata.trackUrl, title: 'YouTube replacement' }], 'a');
  assert.equal(currentMetadata.title, 'Original Song - Reprise (Live)', 'ordinary duplicate searches cannot downgrade library metadata');
  const metadataCopy = RoomQueue.fromJSON(structuredClone(metadataRoom.getQueueState()));
  assert.equal(metadataCopy.current()?.title, currentMetadata.title, 'canonical title survives queue persistence');
  assert.equal(metadataCopy.current()?.thumbnail, currentMetadata.thumbnail);
  const exhausted = new Room('123457');
  exhausted.initializeFromDatabase({ hostId: 'host', trackUrl: null, playbackState: 'IDLE', positionMs: 0 });
  exhausted.addParticipant({ socketId: 'a', displayName: 'a', joinedAt: Date.now(), isReady: false, volume: 100 });
  exhausted.addTracks([{ trackUrl: 'https://youtu.be/finished001', title: 'Finished', durationSec: 8 }], 'a');
  exhausted.setCurrentItem(exhausted.getQueue()[0].id, false);
  exhausted.setParticipantReady('a', true); exhausted.play('a');
  const finishedID = exhausted.snapshot().playbackInstanceId!;
  exhausted.handleTrackEnded(exhausted.snapshot().trackUrl!, finishedID);
  assert.equal(exhausted.snapshot().isPlaying, false);
  assert.equal(exhausted.snapshot().trackUrl, 'https://youtu.be/finished001', 'finished selection remains seekable');
  assert.equal(exhausted.snapshot().position, 8000);
  exhausted.seek('a', 3500); exhausted.play('a');
  assert.equal(exhausted.snapshot().isPlaying, true, 'finished song resumes from a slider seek');
  assert.equal(exhausted.snapshot().pauseOffset, 3.5);
  assert.notEqual(exhausted.snapshot().playbackInstanceId, finishedID);
  const slow = roomWithTracks();
  ready(slow);
  slow.setSyncQuality('stranger', 2000, 500);
  let before = Date.now(); slow.play('a');
  assert.ok((slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before >= 150 && (slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before < 160, 'unknown devices cannot inflate scheduling lead');
  slow.pause('a'); slow.setSyncQuality('b', 220, 15);
  before = Date.now(); slow.play('a');
  assert.ok((slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before >= 275 && (slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before < 285, 'high RTT receives a shared future start');
  before = Date.now(); slow.seek('a', 4000);
  assert.ok(slow.snapshot().startEpoch! + 4000 - before >= 275, 'seek uses the same adaptive lead');
  slow.setSyncQuality('b', Infinity, 0); slow.setSyncQuality('b', -1, 0);
  slow.pause('a'); slow.setSyncQuality('b', 10_000, 10_000);
  before = Date.now(); slow.play('a');
  assert.ok((slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before <= 1510 && (slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before >= 1500, 'lead is bounded even with extreme input');
  slow.pause('a'); slow.removeParticipant('b');
  before = Date.now(); slow.play('a');
  assert.ok((slow.snapshot().startEpoch! + (slow.snapshot().pauseOffset ?? 0) * 1000) - before < 160, 'departed devices no longer add delay');
  console.log('Room playback: recovery, readiness, completion, repeat, shuffle, replay, metadata and adaptive scheduling checks passed');
}
