// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const isProd = process.env.NEXT_PUBLIC_ENV === "production" || process.env.NODE_ENV === "production";

Sentry.init({
  dsn: "https://7ab10d30a5fd53329db9256ad4cb436e@o4512129711603712.ingest.de.sentry.io/4512129831927888",

  // ─── Integrations ────────────────────────────────────────────────────────
  // NOTE: replayIntegration() is intentionally DISABLED.
  //
  // How Sentry Replay works: it uses rrweb to record every DOM mutation,
  // every frame of CSS animation, every React state update — and buffers
  // the last 60 seconds in memory at all times.
  //
  // SyncBeats is an extremely DOM-active app (spatial visualizer, beat
  // detector, 50ms sync ticks, network stat animations). rrweb recording
  // this app contributes ~200–400 MB of extra tab RAM on its own.
  //
  // Errors are caught perfectly well via stack traces + breadcrumbs alone.
  // Re-enable only if you need visual replay for a specific debugging sprint,
  // then disable again:
  //   integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
  //   replaysSessionSampleRate: 0,
  //   replaysOnErrorSampleRate: 0.05,
  integrations: [],

  // ─── Trace sampling ──────────────────────────────────────────────────────
  // 100% (value: 1) means EVERY fetch/route/transaction is traced and held
  // in Sentry's in-memory buffer. SyncBeats fires hundreds of fetches per
  // session (NTP pings, telemetry, streaming, Spotify API...).
  // 5% in production is more than enough for performance insights.
  tracesSampleRate: isProd ? 0.05 : 0.5,

  // ─── Replay rates (unused since integrations: [] above) ──────────────────
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // ─── Error filtering ─────────────────────────────────────────────────────
  // Ignore noisy non-actionable errors
  ignoreErrors: [
    // AudioContext lifecycle — expected on iOS/Safari
    "The AudioContext was not allowed to start",
    "NotAllowedError",
    // Network / connectivity — not bugs
    "Failed to fetch",
    "NetworkError",
    "Load failed",
    // WebTorrent / P2P — expected in degraded conditions
    "AbortError",
  ],

  beforeSend(event) {
    // Drop events with no stack trace (usually browser extensions or ad-blockers)
    if (!event.exception?.values?.[0]?.stacktrace?.frames?.length) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
