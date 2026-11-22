interface PlaybackSyncLoopOptions {
  correctDrift: () => void;
  isPlaying: () => boolean;
  getIntervalMs: () => number;
}

/** Background audio still needs correction; the browser may throttle these timers. */
export function startPlaybackSyncLoop({ correctDrift, isPlaying, getIntervalMs }: PlaybackSyncLoopOptions): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const tick = () => {
    timer = undefined;
    if (stopped) return;
    const visible = document.visibilityState === 'visible';
    if (visible || isPlaying()) correctDrift();
    timer = setTimeout(tick, Math.max(visible ? 250 : 1000, getIntervalMs()));
  };
  const restart = () => {
    if (timer !== undefined) clearTimeout(timer);
    tick();
  };
  tick();
  document.addEventListener('visibilitychange', restart);
  document.addEventListener('ytBufferEnd', restart);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    document.removeEventListener('visibilitychange', restart);
    document.removeEventListener('ytBufferEnd', restart);
  };
}
