# Public pages and Mac beta release checks

Verified locally on 20 November 2026 against an isolated release tree, excluding unrelated working changes.

## Public pages

Privacy, terms, cookie settings, and `/mac-beta` reuse the current landing navigation, footer, theme palette, typography, and controls. Legal pages have linked section indexes; the mobile layout keeps the reading column and form within the viewport.

The privacy notice describes current accounts, rooms, uploads, history, diagnostics, providers, international processing, and beta requests. Unsupported audit and fixed-retention claims were removed. Terms preserve MIT source-code reuse rights while describing rules for the hosted service. Contact requests use the published contact page.

Optional Google/Ahrefs/Vercel analytics require a saved explicit opt-in on the production hostname. Revoking consent refreshes the page to unload active third-party code. Browser replay is disabled, and Sentry data collection excludes user information, request bodies, cookies, headers, and query parameters.

## Beta signup

`POST /beta/mac` saves requests in `mac_beta_signups`. Required consent is recorded with version `2026-11-20`; requests expire after 180 days. Email normalization and a unique index prevent duplicate records. The API returns a generic confirmation, exposes no directory, rate-limits requests, ignores honeypots, and reports persistence failures without claiming success. No invitation email is sent automatically.

A Prisma migration was generated using `prisma migrate dev --create-only`, then applied to a disposable local PostgreSQL database. It creates only the beta table and indexes.

## Validation

- Isolated frontend tests, typecheck, and Vercel production build passed.
- Isolated backend build, existing tests, and beta validation checks passed.
- Targeted ESLint passed for the new/updated public pages and privacy components.
- Saved Postman collection: seven local requests and thirteen passing assertions; exit 0. Local run events were disabled. The CLI output-export option required login, so the run used terminal reporting.
- Playwright: 74 passing assertions covering four pages at desktop/mobile widths in light/dark themes, section targets, successful and failed signup, required fields, analytics default/grant/revocation, and blocked preference storage. The built frontend was served locally; optional external scripts were stubbed. The form used the real local route and disposable database. Persistence failure used an injected failing store.
- Database checks confirmed duplicate preservation, honeypot/failure exclusion, browser consent and expiry, and removal of an expired synthetic record. A separate route limiter check accepted ten attempts and rejected the eleventh.

Collection: `dev/syncbeats-server/postman/collections/mac-beta.postman_collection.json`. Its pre-request guard only permits localhost URLs. Use a disposable local database when running it.

## Live infrastructure observation

Read-only Docker inspection on 20 November 2026 confirmed production (`sync-beats-server-1`, main image) uses PostgreSQL at `postgres:5432`, database `syncbeats`, in a persistent Docker volume on the VM. Staging (`syncbeats-staging-server-1`, nodejs-dev image) uses Neon in Azure East US 2. Staging stores sync telemetry in its local PostgreSQL container via `TELEMETRY_DATABASE_URL`, while its application data and beta requests use Neon. No database configuration or data was changed during this inspection.

These checks do not establish physical two-device speaker synchronization. Repeat the built-in-speaker playback test after deployment and inspect fresh sync telemetry before making timing guarantees.

## Merge verification (21 November 2026)

An isolated merge with current `main` preserves its JSON-LD graph structure, missing-room/error feedback, and lyric interpolation fixes together with the new nodejs-dev room/sync behavior. The unused public backend Sentry debug route was removed, and beta validation now runs in the default backend test command. All 62 frontend tests, frontend typecheck/build, and backend build/tests passed for the merged tree. Staging pages, `/health`, and beta validation returned the expected HTTP responses after deployment.

## Deployment database guard

A live rollout check found that the former deployment script reused the repository's staging `DATABASE_URL` secret for production. Production's original local PostgreSQL connection was restored after saving a database backup and applying the pending additive migrations. The resolver now defaults `main` to local PostgreSQL and requires a separate `PRODUCTION_DATABASE_URL` secret for an intentional remote production database. `nodejs-dev` retains its configured staging URL. Database-selection regression checks run in CI, including credentials with reserved URL characters.

An aggregate audit found no new accounts, rooms, or beta requests in Neon during the temporary production cutover. Existing Neon/staging data was retained.
