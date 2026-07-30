import { runYoutubeFetcherTest } from './youtubeFetcher.test';
import { runSyncCheckerTest } from './syncChecker.test';
import { runSpotifyCheckerTest } from './spotifyChecker.test';

async function runAllTests(): Promise<void> {
  console.log('\n==================================================');
  console.log('  SyncBeats Backend Automated Test Suite');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  const suite = [
    { name: 'YouTube Video/Audio Fetcher', fn: runYoutubeFetcherTest },
    { name: 'Sync Engine & Room State',     fn: runSyncCheckerTest },
    { name: 'Spotify API Paginator',       fn: runSpotifyCheckerTest }
  ];

  for (const test of suite) {
    try {
      console.log(`[TEST SUITE] Running: ${test.name}`);
      await test.fn();
      passed++;
      console.log(`[SUCCESS] ${test.name}\n`);
    } catch (err: any) {
      failed++;
      console.error(`[FAILED] ${test.name}:`, err.message || err, '\n');
    }
  }

  console.log('==================================================');
  console.log(`  Summary: ${passed} passed, ${failed} failed`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests();
