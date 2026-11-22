# Android client verification

Checked on 22 November 2026 in the Android workspace.

- TypeScript check and Expo ESLint: passed.
- Protocol/transport/auth tests: 20 passed.
- Browser flow tests: 4 passed using isolated REST and Socket.IO fixtures.
- Expo Doctor: all 20 checks passed.
- Android Hermes bundle: exported successfully.
- Local development APK: built successfully; APK signature and Android Google return scheme verified.
- Website native sign-in handoff checks: 35 passed with simulated provider responses.

The screenshots are of the actual React Native web rendering at phone sizes, populated by the test fixture. Artist/song names and cover drawings in these screenshots are test content; the running app fetches real content from the backend.

- [Listen, light appearance, 390 × 844](./home-light.png)
- [Expanded player, dark appearance, 390 × 844](./player-dark.png)
- [Room, compact phone, 360 × 640](./room-compact.png)

These checks establish client behavior against the inspected contracts, native compilation, and browser layout/interaction. They do not establish successful live authentication, Google redirects on an installed phone, production media availability, native Android audio output, background playback, or <25ms synchronization. No configured emulator or connected Android device was available. The development APK is in the ignored native build output folder and is excluded from Git.
