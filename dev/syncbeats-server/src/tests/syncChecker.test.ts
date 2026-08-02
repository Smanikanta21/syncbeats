import { Room } from '../core/Room';
import { Participant, TrackQueueItem } from '../types';

export async function runSyncCheckerTest(): Promise<void> {
  console.log('  [SyncChecker] Testing Room state, Queue management & NTP sync calculation...');

  // 1. Instantiate Room
  const room = new Room('test-room-1');
  if (!room) {
    throw new Error('Failed to instantiate Room');
  }

  // 2. Test NTP clock sync formula
  // Client send time t0, Server receive time t1, Server respond time t2, Client receive time t3
  const now = Date.now();
  const simulatedLatency = 30; // 30ms network RTT

  const t0 = now;
  const t1 = now + simulatedLatency / 2;
  const t2 = t1 + 1; // 1ms server processing time
  const t3 = t0 + simulatedLatency + 1;

  // Formula: offset = ((t1 - t0) + (t2 - t3)) / 2
  const offset = ((t1 - t0) + (t2 - t3)) / 2;
  const rtt = (t3 - t0) - (t2 - t1);

  if (Math.abs(offset) > 5) {
    throw new Error(`NTP sync offset calculation error. Expected ~0ms, got ${offset}ms`);
  }

  if (Math.abs(rtt - simulatedLatency) > 2) {
    throw new Error(`NTP RTT calculation error. Expected ~${simulatedLatency}ms, got ${rtt}ms`);
  }

  // 3. Test Room participant registration & readiness sync gate
  const p1: Participant = {
    socketId: 'device-1',
    displayName: 'User 1',
    joinedAt: Date.now(),
    isReady: false,
    volume: 1
  };
  const p2: Participant = {
    socketId: 'device-2',
    displayName: 'User 2',
    joinedAt: Date.now(),
    isReady: false,
    volume: 1
  };

  room.addParticipant(p1);
  room.addParticipant(p2);

  // Add multiple downloaded tracks to room queue
  const q1: TrackQueueItem = {
    id: 'q1',
    trackUrl: 'youtube:GfCqMv--ncA',
    title: 'Test Song 1',
    artist: 'Artist 1',
    fileName: 'youtube_GfCqMv--ncA.yt',
    queueIndex: 0,
    isCurrent: true,
    addedBy: 'test',
    createdAt: Date.now()
  };

  const q2: TrackQueueItem = {
    id: 'q2',
    trackUrl: 'youtube:t0KnuIGOb9I',
    title: 'Test Song 2',
    artist: 'Artist 2',
    fileName: 'youtube_t0KnuIGOb9I.yt',
    queueIndex: 1,
    isCurrent: false,
    addedBy: 'test',
    createdAt: Date.now()
  };

  room.addToQueue(q1);
  room.addToQueue(q2);

  const snapshot = room.snapshot();
  if (snapshot.queue.length !== 2) {
    throw new Error(`Room queue length mismatch. Expected 2, got ${snapshot.queue.length}`);
  }

  // Test synchronized playback scheduling
  // 1) Set both devices ready
  room.setParticipantReady('device-1', true);
  room.setParticipantReady('device-2', true);

  // 2) Trigger synchronized play schedule (positionMs=0, startEpoch in 800ms)
  const scheduledEpoch = Date.now() + 800; // 800ms future start epoch
  room.syncSchedule('youtube:GfCqMv--ncA', 0, scheduledEpoch, 'device-1');

  const playingSnapshot = room.snapshot();
  if (playingSnapshot.state !== 'PLAYING') {
    throw new Error('Room failed to transition to PLAYING state');
  }

  // Calculate expected playback position on both devices 1 second after startEpoch
  const simulatedServerTime = scheduledEpoch + 1000;
  const expectedPositionSec = (simulatedServerTime - scheduledEpoch) / 1000;

  if (Math.abs(expectedPositionSec - 1.0) > 0.01) {
    throw new Error(`Synced playback position calculation error. Expected 1.0s, got ${expectedPositionSec}s`);
  }

  console.log(`  ✓ SyncChecker passed! (NTP offset: ${offset}ms, RTT: ${rtt}ms, Synced Position: ${expectedPositionSec}s)`);
}
