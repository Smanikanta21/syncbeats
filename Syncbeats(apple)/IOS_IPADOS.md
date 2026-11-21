# iPhone and iPad development

Branch: `ios-ipados-dev`, based on the macOS/account-library merge in `main` (`f55edda2`). Open the Xcode project from this checkout, rather than the older `macos-dev` checkout:

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

Simulator and unsigned device builds verify compilation/linking for both device families, not installation, playback or UI on those devices. The installed Xcode SDK is 27.2; iOS runtime downloads currently fail on this Mac, so simulator launch and physical-device tests are outstanding. The macOS target also receives a signed Debug regression build.

On 2026-11-21, all three builds passed. Native verification passed 62 audio checks, 92 room/layout checks (including nine mobile window sizes), 92 library checks and 40 account/artwork checks. Both built mobile Info.plists include iPhone/iPad device families, background audio, Google callback, Bonjour service declaration and the expected deployment/orientation settings.

Local native audio checks exercise real URLSession, Socket.IO and AVAudioEngine against the existing synthetic-audio simulation and the backend Room state object. They cover interruption suspension, resumed timeline alignment, graph reconstruction and room-pause recovery on the Mac host. They do not simulate an actual phone call, iOS audio routing, Google credentials, MusicKit access or multi-device hardware latency.

Before a mobile release, run on iPhone and iPad: sign in, import a library, edit a playlist on the web and observe updates, play with a second room device, lock/unlock the screen, use Control Center controls, receive/end a call, disconnect headphones, and resize/rotate iPad windows while opening lyrics/queue/devices. Check artwork, controls and text with larger accessibility text sizes.
