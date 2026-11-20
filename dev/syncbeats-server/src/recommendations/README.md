# SyncBeats recommendations, rules-v1

The website and Mac home share a server-side music-interest profile and a deterministic ranking engine. No provider login, private feed, provider history, external API call or downloaded training dataset is required to generate this feed.

## First session

After signup or login, the web and native clients check the shared account profile before mounting the dashboard. A NEW profile opens a skippable three-step modal (languages, artists, listening); COMPLETE and SKIPPED profiles proceed directly. “Edit interests” reopens the same modal. Its header/footer stay visible while choices scroll; failed saves retain the draft, and a failed initial load offers retry or a session-only dashboard bypass. Genres and activity learning are optional. Activity learning defaults off; explicit likes still express the user's preferences. Saving selected artists restores any previously dismissed selected artists.

The starter catalog contains 68 factual artist identities, 14 languages and 15 broad genre groupings, without provider IDs, album art or audio. Users can select every listed choice; language selection does not hide artists. Up to 50 unlisted artist names can be added, with an 80-character bound per name. Suggestions are **artist discovery searches**. Clicking one opens the existing music search; it never enqueues or starts a fabricated track. Search results and playback still follow the existing source integrations. This engine does not authorize those sources or change their playback implementation.

## Ranking and privacy

Explicit favorite +30; latest like +20; matching language +12; related genre +5. Consented personal searches/opens/queue additions and sufficiently long personal plays contribute capped, exponentially decaying weights (30-day half-life). Artist choices supply language affinities when no language is selected. Discovery caps repeated language/genre groups and avoids duplicates from the familiar rail. Latest dislike excludes an artist until restored; explicit feedback is queried separately so it survives more than 1,000 later activity events.

Room-context activity contributes no implicit personal preference. A `PLAY` event under 30 seconds contributes nothing. Existing room history is displayed separately and is never treated as a private provider history or imported into the engine. Production clients currently send explicit feedback, discovery opens and searches; the PLAY/QUEUE event contract supports future attributed telemetry, but clients do not yet measure personal listening duration for this model.

All routes bind ownership to the authenticated JWT subject. Caller-supplied user IDs are ignored. Profile/feed/history responses are private and uncached. Input lists are bounded and validated; event IDs are idempotent per user. Opting out deletes implicit recommendation events, and a profile-row lock serializes consent changes against event writes. Search logging also honors activity opt-in. Reset clears recommendation profile/events; it does not delete the separate existing room listen history. Account deletion cascades both recommendation tables.

## API

- `GET /recommendations/catalog`: selectable languages, genres and stable artist IDs.
- `GET /recommendations/profile`: profile or a fresh `NEW` profile.
- `PUT /recommendations/profile`: full validated profile; `onboardingStatus`, `languages`, `genres`, `favoriteArtistIds`, `customArtists`, `useActivity`.
- `GET /recommendations/feed`: `{modelVersion, profile, sections:[{id,title,picks:[{id,name,languages,genres,query,reason,score}]}]}`.
- `POST /recommendations/events`: `{eventId,artistId,kind,context?,secondsListened?}`. Supported kinds: LIKE, DISLIKE, OPEN, QUEUE, PLAY; context PERSONAL/ROOM.
- `DELETE /recommendations/profile`: reset interests and feedback.

The deprecated `/search/recommendations` endpoint now uses authenticated ownership and this same discovery contract. It no longer returns provider-derived track rails. Any external clients using its older `sections[].tracks` shape must migrate to `/recommendations/feed`.

## Schema rollout and verification

Migration: `prisma/migrations/20261119100000_recommendation_interests/migration.sql`. Deploy the migration before enabling the new clients. The remote database has not been modified during development.

```sh
npm run prisma:generate
npm run typecheck
npm run test:recommendations
# Only an isolated local database with this exact name is accepted:
TEST_DATABASE_URL=postgresql://recommendations_test@127.0.0.1:55441/syncbeats_recommendations_test npm run test:recommendation-api
```

The SQL migration and API persistence checks are tested locally with PostgreSQL; browser interaction checks and native contract checks use controlled HTTP responses. A build or simulation does not establish production account, source rights, live room audio or provider approval.

## Later model

Keep the feed contract while replacing `buildFeed` with a versioned ranker. Current recommendation events contain stable first-party artist IDs, action, attribution, duration and model version. Before training, add consented exposure/position logging, deletion-aware dataset export, held-out temporal evaluation and a controlled comparison against rules-v1. Choose the next stage based on event quality, coverage and repeat-user feedback, rather than user count alone. Do not ingest Spotify/provider content into models where its terms prohibit it. Expand the editorial catalog or ingest appropriately licensed open metadata with recorded provenance before attempting song-level candidate ranking.
