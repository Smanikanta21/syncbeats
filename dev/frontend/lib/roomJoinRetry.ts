/** Retry a room join until a snapshot or a terminal/pending reply arrives. */
export function roomJoinRetry(sendJoin: () => void, delayMs = 6000, maxAttempts = 3) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const send = () => {
    if (stopped) return;
    attempts++;
    sendJoin();
    if (!stopped && attempts < maxAttempts) timer = setTimeout(send, delayMs);
  };
  send();
  return stop;
}

export function roomJoinTimedOut(status: string, authLoading: boolean): boolean {
  return !authLoading && status === 'connecting';
}
