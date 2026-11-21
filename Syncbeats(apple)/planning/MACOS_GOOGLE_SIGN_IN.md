# Google sign-in with a Personal Team

The native app no longer requires Associated Domains or a paid Apple Developer Program membership for Google sign-in. Both Debug and Release register `syncbeats://google/callback` using `NativeInfo.plist`. Keep automatic signing and your existing Personal Team, then use Xcode's Run action. No Google client secret is embedded in the Mac app.

The Mac generates independent 256-bit state, nonce and PKCE verifier values. It opens the website's `/auth/native` page with the public verifier challenge. That page uses the existing Google web client and registered website redirect. The return handler checks the saved attempt and removes the Google token fragment before submitting it to the backend. Ordinary website Google sign-in retains its existing handler.

The backend verifies Google's token signature, audience, expiry, verified email and request nonce. It stores only a hashed random code, verified account ID, public PKCE challenge and a 90-second expiry. The browser receives no SyncBeats bearer token. The Mac checks the callback state and exchanges the code with its private verifier. A database delete consumes the code exactly once across server instances. Only the exchange registers the Mac device and returns the existing account/session/room contract.

## Deploy before real account testing

1. Deploy migration `20261121010000_native_google_handoff` with the backend's normal `prisma migrate deploy` step. It creates `native_auth_codes`; existing users and library data are retained.
2. Deploy the updated backend (`/auth/native/google` and `/auth/native/google/exchange`) and frontend (`/auth/native` plus its root OAuth return handler).
3. Keep the current Google web client ID and its existing `https://syncbeats.in` redirect. The website uses `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; the backend verifies against `GOOGLE_CLIENT_ID`. No additional Google redirect URI or Apple website association is needed.
4. Rebuild and run Syncbeats in Xcode, then click Continue with Google. Close an older running build first. If the server lacks the new endpoint, the app displays an update message.

The live endpoint was still returning 404 when checked during implementation. No deployment or real Google account login was performed. The migration was applied only to an isolated local test database using the generated migration SQL; that test database has no baseline Prisma migration history, so migrate deploy correctly refused it without a reset.

## Verification

- Personal Team macOS Debug and Release builds passed; Release signing passed with no Associated Domains entitlement, and the built app registers the custom URL scheme.
- 20 isolated API/database checks passed: account/session continuity, native device registration, nonce verification contract, invalid inputs, expiry, PKCE mismatch, one-time consumption and concurrent replay rejection. Google identity verification was simulated.
- 19 web-flow checks passed: existing Google redirect, session binding, malformed/expired callbacks, credential removal, fixed callback destination, cancellation and backend failures. Browser navigation was simulated.
- 16 native checks passed: RFC 7636 PKCE vector, callback validation, private verifier isolation, exchange request/session parsing, and old-server feedback.
- Backend build, frontend TypeScript checks, frontend production build, and lint of the new route/helper passed. The existing AuthContext file retains pre-existing lint errors.

Run the focused checks with `zsh 'Syncbeats(apple)/verification/run-native-google-checks.sh'`, `node scripts/check-native-google.cjs` from the frontend directory, and `TEST_DATABASE_URL=<isolated local database> ./node_modules/.bin/ts-node src/auth/NativeGoogleSignIn.tests.ts` from the backend directory.
