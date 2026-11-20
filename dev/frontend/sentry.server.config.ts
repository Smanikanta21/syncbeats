// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://7ab10d30a5fd53329db9256ad4cb436e@o4512129711603712.ingest.de.sentry.io/4512129831927888",

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
    databaseQueryData: false,
    cookies: false,
    httpHeaders: false,
    urlQueryParams: false,
  },
});
