// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://7ab10d30a5fd53329db9256ad4cb436e@o4512129711603712.ingest.de.sentry.io/4512129831927888",

  // 5% in production — was 100% (tracesSampleRate: 1) which traced every
  // single server request and held them in memory before flushing.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.5,

  ignoreErrors: [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
  ],
});

