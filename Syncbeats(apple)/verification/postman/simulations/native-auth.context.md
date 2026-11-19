# Simulation context — Native auth verification

Generated 2026-11-15 from mocks: `postman/mocks/native-auth`.
This file is how the next session starts without redoing the setup. Fill in each
@todo as you work, and update it when something you relied on turns out wrong.

## Purpose

Stands in for the `api.syncbeats.in` authentication/default-room HTTP routes to
verify the rebuilt native entry flow without external accounts or email.
The production Swift client/model runs against the stand-in; the client is
not itself simulated. Endpoints and fictional fixtures are in
`postman/mocks/native-auth/default.js`.

## Execution

```sh
# start the simulation first
postman simulation run postman/simulations/native-auth.sim.yaml \
  --port 5169 --no-history --output ndjson > /tmp/native-auth-simulation.log 2>&1 &

zsh run-native-auth.sh

curl http://127.0.0.1:5169/auth-service/__calls

# what actually got called
rg '^{' /tmp/native-auth-simulation.log \
  | jq -r 'select(.event=="request") | [.routeKey, .method, .path, .statusCode] | @tsv' \
  | sort | uniq -c

# stop
pkill -INT -f "simulation run .*native-auth.sim.yaml"
```

One-port routing was chosen because the Swift client has no forward-proxy
setting. The harness injects the route-prefixed base URL; no production host
is reachable through this simulation. No Postman login or root workspace
initialization is needed. CLI 1.80.0 generated this Markdown context instead
of the YAML format described in the installed skill guide.

## Assumptions

- **Source-derived auth contract — supported within checked-in source.**
  Claim: login/Google issue a user/token session; signup requires verification;
  password reset takes an emailed six-digit OTP; default-room POST is idempotent.
  Reason: the current server handlers/services define these responses; live
  production parity and delivery are not established by this fixture.
  Verification: source inspection and the real Swift client/model run on
  2026-11-15, fingerprint native-entry-001.
  Source (paths from repo root):
  `dev/syncbeats-server/src/handlers/AuthRoutes.ts`,
  `dev/syncbeats-server/src/auth/AuthService.ts`,
  `dev/syncbeats-server/src/handlers/RoomRoutes.ts`;
  `Syncbeats(apple)/verification/NativeAuthVerification.swift`.
  Updated: 2026-11-15.

- **Recovery and write behavior — supported in scenarios run.**
  Claim: the client retains saved credentials on restoration 503, clears them
  on 401, and does not automatically retry a timed-out login.
  Reason: model state, stored token, and observed HTTP request counts agreed.
  Verification: 30 harness checks passed; seven login attempts produced seven
  requests. The delayed success was logged after timeout and did not sign the
  model in. This does not establish whether a live timed-out write completed.
  Source: `../../NativeAuthVerification.swift`, app `AppModel.swift`/`AuthAPI.swift`,
  `/tmp/syncbeats-native-auth-verification.log`,
  `/tmp/syncbeats-native-simulation.ndjson` on the verification machine.
  Updated: 2026-11-15.

- **Live Google return and email delivery — unknown.**
  Claim: the production provider accepts the current OAuth client/redirect,
  returns through the signed app association, and emails reach users.
  Reason: the fixture only models backend token exchange and account responses.
  Verification: local state/nonce/origin checks passed. Live return was not run;
  the new website association route needs deployment and matching provisioning.
  Source: app `GoogleSignIn.swift`, `Syncbeats.entitlements`, frontend
  `app/.well-known/apple-app-site-association/route.ts`.
  Updated: 2026-11-15.

- **Mock provenance and state behavior.** The CLI was signed out, so the owning
  team's mock search was skipped. This fixture came from local server source.
  `pm.state.get/set` are asynchronous in CLI 1.80.0; the initial fixture omitted
  `await`, returned 500, and was corrected before the successful harness run.

- **Under `--proxy`, a request to a hostname no mock declares reaches the real host.**
  A passing run may have hit production. Check what got called for destinations
  you didn't expect and treat them as unmocked. On a one-port run nothing is
  forwarded: a call the mock doesn't model answers 501, or 404 from a generated one.

- **Mocks do not hot-reload.**
  Restart the simulation after editing a handler. Restarting the service is not enough.

- **Only HTTP dependencies are simulated.**
  Databases, caches and queues must run as real local instances.

- **Port 5169 must be free, and only one simulation runs at a time.**
  Startup fails, or the service reaches the wrong proxy.

## Observations

<!-- begin:observations -->
- 2026-11-16: native-room-notch-001 — reused the existing local simulation after adding
  room credentials and notch preferences to the production AppModel. All 30 native
  authentication checks passed again. `/tmp/syncbeats-room-auth-simulation.ndjson`
  confirmed the expected auth/default-room requests and HTTP statuses; seven login
  attempts still produced seven requests. `/tmp/syncbeats-room-auth-verification.log`
  records client outcomes. This supports the existing recovery/write-behavior claim
  for these scenarios; it does not exercise the new Socket.IO transport, YouTube
  provider, email delivery, or Google browser return.
- 2026-11-15: native-entry-001 — 30 checks passed; auth-service received all
  intended requests. Log confirms 200/201, credential 401, registration 409,
  invalid-reset 400, HTML 503, and delayed-login response. No unknown member,
  unmodeled 501, or provider calls appeared. Real Keychain roundtrip/cleanup
  passed separately; credentials in the fixture are fictional.
<!-- end:observations -->

## Fingerprints

- id: native-entry-001; date: 2026-11-15;
  commit: `4dc9a09cb9b97a10719449ed6aaacb7b52c250c9`;
  working tree: dirty, includes the uncommitted native rebuild and unrelated
  existing web/artwork changes; CLI: Postman 1.80.0; Swift 6.4.2, Xcode 27.2.
