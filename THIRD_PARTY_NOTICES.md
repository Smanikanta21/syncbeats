# Third-party notices and media

The [MIT license](LICENSE) applies to original SyncBeats code and documentation. Dependencies, third-party assets, service names, and trademarks retain their respective licenses and owners' rights. Preserve their notices when redistributing them.

## Dependencies

The package manifests and lockfiles under `dev/` identify the JavaScript dependencies and versions. Consult each dependency's distributed license before redistributing a bundled application. A root MIT license does not replace dependency license terms. Native packages and platform SDKs have their own terms; review them when distributing native clients.

## Repository assets

- `dev/frontend/public/audio/demo-*.mp3` are original synthesized loops, with no sampled music, as documented in [landing interactions](dev/frontend/docs/landing-interactions.md). Their generator is `dev/frontend/tooling/generate-demo-audio.py`. These original assets are included under MIT.
- SyncBeats artwork is included under MIT to the extent it is original project work. The license does not grant trademark rights or permission to impersonate the hosted service.
- The Google sign-in logo in the native client's asset catalog belongs to Google and is subject to Google's brand guidelines. It is not relicensed by this repository.

## User and provider content

Music uploaded by users, provider audio, album artwork, lyrics, and external-service metadata are not licensed by this repository. Use and redistribute them only with the relevant rights and permissions. Integrations with YouTube, Spotify, Apple Music, and other providers remain subject to their terms and availability.

This document is not a completed dependency or native-asset license audit. Record any additional third-party notices found during review before publishing a distribution.
