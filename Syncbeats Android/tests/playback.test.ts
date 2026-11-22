import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackFollower, type PlayerPort } from '../src/sync/playback';
import { snapshot } from './fixtures';
class Player implements PlayerPort {
  currentTime = 0; playing = false; volume = 1; starts = 0;
  play() { this.playing = true; ++this.starts; } pause() { this.playing = false; }
  async seekTo(position: number) { this.currentTime = position; }
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
test('a resumed song stays paused until startEpoch + pauseOffset', async () => {
  const player = new Player(), epoch = Date.now() + 80;
  const state = snapshot({ isPlaying: true, pauseOffset: 20, startEpoch: epoch - 20_000 });
  const follower = new PlaybackFollower(player, () => state, Date.now, () => true, () => 25, message => assert.fail(message), () => 1);
  follower.follow(); await sleep(30); assert.equal(player.starts, 0);
  await sleep(100); assert.equal(player.starts, 1); assert.ok(player.currentTime >= 20); follower.dispose();
});
test('a pause arriving before the scheduled start cancels the pending play', async () => {
  const player = new Player(); let state = snapshot({ isPlaying: true, startEpoch: Date.now() + 70 });
  const follower = new PlaybackFollower(player, () => state, Date.now, () => true, () => 25, message => assert.fail(message), () => .5);
  follower.follow(); await sleep(15); state = snapshot({ pauseOffset: 12 }); follower.follow();
  await sleep(90); assert.equal(player.starts, 0); assert.equal(player.currentTime, 12); assert.equal(player.volume, .5); follower.dispose();
});
test('disconnect prevents delayed audio starts', async () => {
  const player = new Player(); let connected = true; const state = snapshot({ isPlaying: true, startEpoch: Date.now() + 60 });
  const follower = new PlaybackFollower(player, () => state, Date.now, () => connected, () => 25, message => assert.fail(message), () => 1);
  follower.follow(); await sleep(10); connected = false; follower.follow(); await sleep(90); assert.equal(player.starts, 0); follower.dispose();
});
test('a late seek completion cannot play an obsolete schedule', async () => {
  const player = new Player(); let state = snapshot({ isPlaying: true, startEpoch: Date.now() - 1000 });
  let release: (() => void) | undefined;
  player.seekTo = async position => { await new Promise<void>(resolve => { release = resolve; }); player.currentTime = position; };
  const follower = new PlaybackFollower(player, () => state, Date.now, () => true, () => 25, message => assert.fail(message), () => 1);
  follower.follow(); state = snapshot({ pauseOffset: 9 }); follower.follow();
  player.seekTo = async position => { player.currentTime = position; }; release?.(); await sleep(10);
  assert.equal(player.starts, 0); assert.equal(player.currentTime, 9); follower.dispose();
});
