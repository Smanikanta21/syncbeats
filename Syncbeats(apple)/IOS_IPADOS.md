# iPhone and iPad development

Branch: `ios-ipados-dev`, based on the macOS/account-library merge in `main` (`f55edda2`). The mobile source has also been copied into the original `macos-dev` checkout so its Xcode project includes the same background audio configuration. The dedicated mobile checkout is:

```sh
open '/Users/abhinay/syncbeats-ios-ipados/Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj'
```

## What is implemented

- Shared sign-in, Google browser authentication, account Library, playlist editing, Apple Music metadata import, settings and profile. Imports use the account database and account update stream; they do not upload Apple Music audio files.
- iPhone navigation with compact Library tabs, a pinned mini-player and full-screen player. Devices open in a sheet at every width; room codes copy through the iOS clipboard. Home supports pull-to-refresh and interactive keyboard dismissal.
- iPad uses the artwork/detail arrangement when space permits and compact controls in narrower Split View/Stage Manager windows. Short windows expose Lyrics, Queue and Devices through a detail menu. Window resizing uses the actual view size, not a fixed device category.
- Album-colour ambience, measured-audio spectrum and equalizer, lyrics and the shared queue reuse the native player.
- Native downloaded-file playback using the existing server epoch, clock-offset measurement, readiness gate and drift correction. Participants identify as iPhone, iPad or Mac.
- Playback audio session, background audio declaration, lock-screen/Control Center metadata with artwork, and remote play/pause/next/previous/seek. Commands round-trip through the room server.
- A bounded iOS background task covers audio download/decode gaps. Expiration cancels preparation with an instruction to reopen the app. Returning to the foreground reconnects the room or refreshes clock sync and follows its current timeline. Idle paused apps can still be suspended by iOS.
- Call interruptions suspend local output so the drift loop cannot restart it. System-approved recovery follows the current room timeline. Disconnected headphones require an explicit Play to resume. Media-service resets rebuild the audio graph.
- System output picker for AirPlay. Wireless output latency is not compensated or verified; use built-in or wired output when evaluating close room sync.

## Running with a free Apple account

1. Select the Syncbeats target in Xcode and your Personal Team under Signing & Capabilities. Keep automatic signing enabled; Associated Domains is not required for Google sign-in.
2. Connect an iPhone/iPad, enable Developer Mode on it, and select it as the run destination. The current minimum is iOS/iPadOS 18.6. Xcode may need to register that device and create its development profile.
3. Build and run. Allow Media & Apple Music access when importing. Google sign-in uses the `syncbeats` callback scheme and the deployed web/backend handoff.

Free Personal Team signing is for your own development devices, typically with short-lived provisioning. TestFlight/App Store distribution requires Apple Developer Program membership. Apple Music access and Google sign-in still need a real-device check with an actual account; unsigned builds do not verify those permissions.

The shared application session owns one room and one local audio output across iPad windows. It is not an independent room per window. This implementation uses the existing cloud room service; a new offline LAN edge server is not included in this mobile change.

## Build verification

From the repository root:

```sh
xcodebuild -project 'Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj' \
  -scheme Syncbeats -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/syncbeats-ios-dev CODE_SIGNING_ALLOWED=NO build

xcodebuild -project 'Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj' \
  -scheme Syncbeats -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/syncbeats-mobile-device CODE_SIGNING_ALLOWED=NO build
```

Simulator and unsigned device builds verify compilation/linking for both device families. The installed Xcode SDK is 27.2; simulator runtime downloads currently fail on this Mac. Signed Debug builds have now also passed and been installed/launched on an iPhone 14 Plus (iOS 27.2) and iPad A16 (iPadOS 27.2.1), using the Personal Team. The original checkout received a signed macOS Debug regression build.

On 2026-11-21, all three builds passed. Native verification passed 62 audio checks, 92 room/layout checks (including nine mobile window sizes), 92 library checks and 40 account/artwork checks. Both built mobile Info.plists include iPhone/iPad device families, background audio, Google callback, Bonjour service declaration and the expected deployment/orientation settings.

The latest physical-device builds restore the account and room, connect to the production service and prepare downloaded audio. Both last observed room states were paused with audio loaded and no error; leaving-app and locked-screen playback have not yet been verified. Debug builds publish a playback diagnostic every second, including actual rendered position, so background checks can distinguish audio progress from extrapolated room time. Continuous audio, track transitions, and audible output while locked still require a playing-device test.

The native Google browser flow now normalizes `www.syncbeats.in` to the registered `https://syncbeats.in` root redirect, matching website login. This frontend fix is deployed on `main`. Google Cloud Console must register that exact root URL on the existing Web application OAuth client; `syncbeats://google/callback` is only the app callback, not Google's redirect URI. A real Google account sign-in remains to be verified.

Local native audio checks exercise real URLSession, Socket.IO and AVAudioEngine against the existing synthetic-audio simulation and the backend Room state object. They cover interruption suspension, resumed timeline alignment, graph reconstruction and room-pause recovery on the Mac host. They do not simulate an actual phone call, iOS audio routing, Google credentials, MusicKit access or multi-device hardware latency.

Before a mobile release, run on iPhone and iPad: sign in, import a library, edit a playlist on the web and observe updates, play with a second room device, lock/unlock the screen, use Control Center controls, receive/end a call, disconnect headphones, and resize/rotate iPad windows while opening lyrics/queue/devices. Check artwork, controls and text with larger accessibility text sizes.
