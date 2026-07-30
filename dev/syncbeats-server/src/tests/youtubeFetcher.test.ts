import path from 'path';
import fs from 'fs';
import { Room } from '../core/Room';
import { Participant, TrackQueueItem } from '../types';
import { resolveYoutubeAudioDirectUrl } from '../handlers/SearchRoutes';

export async function runYoutubeFetcherTest(): Promise<void> {
  console.log('  [YoutubeFetcher] Testing yt-dlp resolution, audio stream fetcher & Room integration...');

  // 1. Locate yt-dlp path
  const ytDlpPath = (() => {
    if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
    const paths = [
      path.resolve(__dirname, '../../yt-dlp'),
      path.resolve(__dirname, '../../bin/yt-dlp'),
      path.resolve(process.cwd(), 'yt-dlp'),
      path.resolve(process.cwd(), 'dev/syncbeats-server/yt-dlp'),
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return 'yt-dlp';
  })();

  console.log(`  [YoutubeFetcher] Using yt-dlp binary at: ${ytDlpPath}`);

  // Test YouTube video IDs
  const testTrackIds = ['GfCqMv--ncA', 't0KnuIGOb9I'];
  const resolvedTracks: { id: string; url: string }[] = [];

  for (const trackId of testTrackIds) {
    const result = await resolveYoutubeAudioDirectUrl(trackId, ytDlpPath);

    if (result && result.startsWith('http')) {
      console.log(`  ✓ Resolved track ${trackId} -> Direct URL (length: ${result.length} chars)`);
      resolvedTracks.push({ id: trackId, url: result });
    } else {
      if (process.env.CI) {
        console.warn(`  ! Note: Direct audio stream for ${trackId} skipped in CI environment due to YouTube cloud IP restriction without cookies.`);
      } else {
        throw new Error(`YouTube Audio Fetcher FAILED to resolve audio stream for track ${trackId}. Bot block or network failure.`);
      }
    }
  }

  // 2. Integration check: Add resolved tracks into Room queue and verify sync state
  const testRoom = new Room('yt-test-room');
  const p1: Participant = { socketId: 'client-1', displayName: 'Device A', joinedAt: Date.now(), isReady: false, volume: 1 };
  const p2: Participant = { socketId: 'client-2', displayName: 'Device B', joinedAt: Date.now(), isReady: false, volume: 1 };

  testRoom.addParticipant(p1);
  testRoom.addParticipant(p2);

  const tracksToSync = resolvedTracks.length > 0 ? resolvedTracks : [{ id: 'GfCqMv--ncA', url: 'https://example.com/mock.m4a' }];

  for (let i = 0; i < tracksToSync.length; i++) {
    const track = tracksToSync[i];
    const queueItem: TrackQueueItem = {
      id: `yt_${track.id}`,
      trackUrl: `youtube:${track.id}`,
      title: `YouTube Track ${track.id}`,
      artist: 'YouTube Artist',
      fileName: `youtube_${track.id}.yt`,
      queueIndex: i,
      isCurrent: i === 0,
      addedBy: 'client-1',
      createdAt: Date.now()
    };
    testRoom.addToQueue(queueItem);
  }

  testRoom.setParticipantReady('client-1', true);
  testRoom.setParticipantReady('client-2', true);

  const startEpoch = Date.now() + 800;
  testRoom.syncSchedule(`youtube:${tracksToSync[0].id}`, 0, startEpoch, 'client-1');

  const snapshot = testRoom.snapshot();
  if (snapshot.state !== 'PLAYING' || snapshot.trackUrl !== `youtube:${tracksToSync[0].id}`) {
    throw new Error('Room failed to queue & sync resolved YouTube track playback');
  }

  console.log(`  ✓ YouTube Room Sync integration verified for ${tracksToSync.length} song(s)`);
}
