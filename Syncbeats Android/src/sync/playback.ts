import { expectedPosition, scheduledEpoch } from '../lib/media';
import type { RoomSnapshot } from '../lib/types';

export interface PlayerPort {
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  currentTime: number;
  playing: boolean;
  volume: number;
}

// JS schedules native transport commands, not audio samples. Never claim sample-accurate starts here.
export class PlaybackFollower {
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private signature = '';
  private disposed = false;
  constructor(
    private player: PlayerPort,
    private snapshot: () => RoomSnapshot | null,
    private serverNow: () => number,
    private canPlay: () => boolean,
    private threshold: () => number,
    private failed: (message: string) => void,
    private volume: () => number,
  ) {}
  follow(force = false) {
    if (this.disposed) return;
    const snapshot = this.snapshot();
    if (!snapshot || !this.canPlay()) { this.cancel(); this.player.pause(); return; }
    const signature = `${snapshot.roomInstanceId}:${snapshot.playbackInstanceId}:${snapshot.isPlaying}:${snapshot.startEpoch}:${snapshot.pauseOffset}`;
    if (signature !== this.signature) { this.cancel(); this.signature = signature; force = true; }
    if (this.busy || this.timer) return;
    const epoch = scheduledEpoch(snapshot);
    const wait = epoch === null ? 0 : epoch - this.serverNow();
    if (!snapshot.isPlaying || wait > 0) this.player.pause();
    const target = expectedPosition(snapshot, this.serverNow());
    const drift = Math.abs(this.player.currentTime - target);
    // Expo status updates and the JS/native boundary need a wider floor than the WebAudio renderer.
    if (force || drift * 1000 > Math.max(120, this.threshold()) || (snapshot.isPlaying && !this.player.playing)) {
      void this.seekAndFollow(target, wait);
    }
  }
  private async seekAndFollow(target: number, wait: number) {
    this.busy = true;
    const generation = this.generation;
    try {
      this.player.volume = 0;
      await this.player.seekTo(target);
      if (generation !== this.generation || this.disposed || !this.canPlay()) return;
      const snapshot = this.snapshot();
      if (!snapshot) return;
      const epoch = scheduledEpoch(snapshot);
      const remaining = epoch === null ? 0 : epoch - this.serverNow();
      if (snapshot.isPlaying && (wait > 0 || remaining > 0) && remaining > 0) {
        this.timer = setTimeout(() => { this.timer = undefined; this.follow(true); }, remaining);
      } else if (snapshot.isPlaying) {
        this.player.volume = this.volume(); this.player.play();
      } else { this.player.volume = this.volume(); this.player.pause(); }
    } catch { if (generation === this.generation && !this.disposed) this.failed('This device could not start the audio. Tap retry to load it again.'); }
    finally {
      this.busy = false;
      if (!this.disposed) {
        this.player.volume = this.volume();
        if (generation !== this.generation) this.follow(true);
      }
    }
  }
  private cancel() { ++this.generation; clearTimeout(this.timer); this.timer = undefined; }
  dispose() { this.disposed = true; this.cancel(); this.player.pause(); }
}
