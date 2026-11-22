# SyncBeats Android

React Native + Expo SDK 58 Android client for the **existing SyncBeats backend**. No backend, database, or Apple source changes are required. The production default is `https://api.syncbeats.in`, matching the Swift app.

The interface carries over the Apple client's cream/forest palette, warm accents, album-focused discovery, shared queue, persistent mini-player, and expanded player. Layouts adapt to a phone, with Listen, Library, Queue, and Room navigation. Both light and dark appearances are supported.

## Run on a phone

```sh
cd "Syncbeats Android"
npm ci
npm start
```

Scan the QR code with the current Expo Go Android app. Email/password sign-in uses your existing SyncBeats account. Google sign-in requires an installed SyncBeats build: Expo Go cannot register the app's return link. New accounts receive the existing verification email; finish verification and password recovery through the website.

The launch scripts clear Metro's transformation cache. After installing or changing dependencies, stop the existing Metro process and start it again: a running process can retain an old Worklets Babel plugin even when the installed packages match. SDK 58 uses Worklets `0.13.0`; do not upgrade only its Babel plugin. A Worklets startup crash can also produce misleading Router warnings about missing default exports.

For an already configured Android emulator, use `npm run android`. `npm run web` opens the same React Native UI in a browser for development.

To use a local backend, copy `.env.example` to `.env` and set `EXPO_PUBLIC_SERVER_URL`. An Android emulator reaches the development computer at `http://10.0.2.2:4000`; a physical phone needs its LAN address. Restart Metro after changing the URL. Existing proxy bases such as `https://syncbeats.in/api` also use the corresponding `/api/socket.io` path. Never put secrets in an `EXPO_PUBLIC_*` variable.

## Included behavior

- Secure session persistence on Android, stable device identity, and server session validation on launch.
- Keyboard-aware scrolling keeps focused fields above the Android/iOS keyboard on sign-in, registration, search, library, and room-code entry; the bottom player/navigation hides while typing.
- Automatic entry into the user's permanent room using `POST /rooms/default`; join a six-digit room, wait for private-room approval, return home, and share the room code/link.
- Existing authenticated recommendation feed, genre discovery, YouTube search/link queueing, and listening history. Older search responses cannot replace newer ones.
- Account library, search, cursor pagination, and MusicBridge matching for saved songs without a YouTube ID. Songs imported by the Apple app are available through this shared account library.
- Server-authoritative play/pause, seek, next/previous, jump-to-song, shuffle, repeat, removal, reordering, and per-device volume. Commands do not update room state optimistically and are rejected while disconnected.
- Native foreground audio via Expo Audio, download-first loading, NTP offset estimation, adaptive resampling, scheduled starts, and hard-seek correction. Readiness is declared only for the loaded current source and redeclared after socket snapshots/reconnects. Failed audio reports blocked/not-ready and can be retried.
- Google sign-in in an **installed development or APK build**, using the same website PKCE handoff and `/auth/native/google/exchange` endpoint as the Apple client. The request includes `client=android`; the website binds that client to the pending attempt and OAuth `state`, then returns through `syncbeats-android://google/callback`. Apple requests keep `syncbeats://google/callback`. Callback scheme/state/code/expiry checks are enforced. The Google button is omitted in Expo Go and the browser preview; Expo Go shows the installed-build requirement. Deploy the matching `dev/frontend` native handoff and return-page changes before testing this Android flow against `syncbeats.in`. The return page provides an explicit **Open SyncBeats** link when automatic navigation is blocked.

## Build an installable Android app

The EAS profiles are prepared; sign in to your own Expo account to create an APK:

```sh
npx eas-cli@latest build --platform android --profile preview
```

`preview` produces an installable APK. `development` builds an Expo development client (start Metro with `npm run dev`). `production` produces a store bundle. Production signing, EAS project registration, store submission, and publication have not been performed.

With Android Studio/JDK and an Android device or emulator configured, `npm run android:build` builds and installs a local development client. On later launches, run `npm run dev` and scan its QR code using the installed SyncBeats development client. Rebuild after changes to native dependencies or URL schemes.

The local development APK was built successfully on 2026-11-22 at `android/app/build/outputs/apk/debug/app-debug.apk`. It uses development signing and requires Metro (`npm run dev`). The packaged Android manifest includes `syncbeats-android` for Google return links. No device was connected, so installation and Google browser return have not been verified on a phone. App lint/typecheck, 20 protocol/auth tests, Android Hermes export, web typecheck, and 35 native web handoff checks passed; provider responses in the handoff checks are simulated.

`npm run export:android` validates and produces the Android JavaScript/Hermes bundle; **it does not produce an APK**.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:ui
npx expo-doctor
npm run export:android
npm run export:web
```

Protocol tests cover readiness/reconnects, stale-room rejection, offline command rejection, pause/resume scheduling, late seek cancellation, NTP math, REST contracts, and Google callback validation. Browser flow tests use an isolated in-test backend fixture matching the inspected REST/Socket.IO contracts. They test sign-in/error handling, shared queue/reordering, account-library resolution, authoritative playback, stale-search protection, and private-room approval.

See [verification](./verification/README.md) for the current check results and screenshots. No test writes to the production service or needs a real user's credentials.

## Current limits

This is a runnable first Android client, not measured feature parity with every Apple capability. Playback is foreground-only: Android suspension/lock-screen transport needs a native playback service and scheduler before it can safely drive the shared timeline. LAN relay/discovery, direct device music import, equalizer, chat, and Spotify lazy/P2P source resolution are not implemented. Unsupported sources show an error instead of pretending to play.

The adaptive network table mirrors `dev/frontend/hooks/useAdaptiveSync.ts`. Expo commands are scheduled through JavaScript and native player position reads; the renderer uses a **120ms minimum correction threshold** to avoid repeated seeks from that boundary. It keeps playback rate at 1.0. This is not a sample scheduler, and **the <25ms target has not been verified**. Lower-level native scheduling, output latency measurement, and fade-based correction remain necessary for that target.

Live credentials, actual YouTube availability, real Android output, and two-device acoustic synchronization have not been tested in this workspace. Test with a phone and a web/Apple participant: first playback, pause/resume, seek, next/previous, late joins, connection loss/recovery, private-room approval, unsupported audio, and app suspension/return. Watch readiness, snapshots and timeline events in server logs. Never publish tokens or personal data.

## Source layout

`src/app/` contains Expo Router screens. `src/theme/` owns the Apple-derived palette and `src/components/` the shared phone controls. `src/lib/` contains REST contracts, media URL/identity helpers, and storage; `src/session/`, `src/room/`, and `src/audio/` own client lifecycles. `src/sync/` keeps the clock, socket protocol, and playback follower separate for testing. Native projects are generated by Expo config/plugins; do not hand-edit generated `android/` or `ios/` directories.
