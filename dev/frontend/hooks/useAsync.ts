// hooks/useAsync.ts
// Single-flight async hook — ensures a function can only run ONE instance at a time.
// Prevents duplicate requests when users click fast.
// Usage:
//   const enqueue = useAsync(async (id: string) => api.enqueue(id));
//   <button onClick={() => enqueue.run(id)} disabled={enqueue.isPending}>
//     {enqueue.isPending ? <Spinner /> : "Add to Queue"}
//   </button>

import { useCallback, useRef, useState } from "react";

export interface AsyncState<T> {
  isPending: boolean;
  error: string | null;
  data: T | null;
}

export interface AsyncHandle<T, A extends any[]> {
  run: (...args: A) => Promise<T | undefined>;
  isPending: boolean;
  error: string | null;
  data: T | null;
  reset: () => void;
}

export function useAsync<T, A extends any[] = any[]>(
  fn: (...args: A) => Promise<T>
): AsyncHandle<T, A> {
  // useRef for the in-flight flag so it is NEVER stale — React state updates are async.
  // If we used useState here, a second click in the same render cycle would slip through.
  const inFlight = useRef(false);

  const [state, setState] = useState<AsyncState<T>>({
    isPending: false,
    error: null,
    data: null,
  });

  const run = useCallback(
    async (...args: A): Promise<T | undefined> => {
      // Hard guard — synchronous, never stale
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setState({ isPending: true, error: null, data: null });

      try {
        const result = await fn(...args);
        setState({ isPending: false, error: null, data: result });
        return result;
      } catch (err: any) {
        const msg =
          err?.message || err?.error || "Something went wrong. Please try again.";
        setState({ isPending: false, error: msg, data: null });
        throw err;
      } finally {
        inFlight.current = false;
      }
    },
    // fn is intentionally omitted from deps — callers should memoize if needed.
    // This prevents infinite re-renders from inline arrow functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const reset = useCallback(() => {
    inFlight.current = false;
    setState({ isPending: false, error: null, data: null });
  }, []);

  return { run, isPending: state.isPending, error: state.error, data: state.data, reset };
}
