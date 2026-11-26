# Native room home simulation context — 2026-11-19

This local environment stands in for the checked-in room search/enqueue/reorder and history HTTP contracts at api.syncbeats.in, plus controlled music metadata responses. It unblocks the native home API and artwork resolver harnesses without creating rooms or changing production. See native-room-home.context.yaml for claims and evidence.

Run from the verification directory:

```sh
postman simulation run postman/simulations/native-room-home.sim.yaml \
  --port 5277 --no-history --output ndjson > /tmp/syncbeats-native-home-simulation.ndjson
python3 run-native-home-checks.py --live
```

The fake identity and token are defined in NativeHomeVerification.swift and the mock. The route base is http://127.0.0.1:5277/syncbeats-native-room-home. The harness sends real URLSession requests through the application's injected base URLs. One-port routing is used because the native client does not expose a forward-proxy setting. Mocks do not hot-reload: restart after editing default.js. Stop with `pkill -INT -f 'simulation run postman/simulations/native-room-home.sim.yaml'`.

2026-11-19: 13 home checks and 21 artwork checks passed. Request traffic included discovery, history, enqueue, numeric PUT reorder, invalid-token 401, discovery 503/malformed data, concurrently removed track 404, album metadata, and video identity recovery. Covers were downloaded through /art; malformed/503/no-match artwork responses kept placeholders. Private room headers were absent from metadata requests. The separate --live checks reached Apple's public catalog/CDN and decoded the original After Hours cover at 600 pixels. This does not establish live YouTube oEmbed availability or catalog coverage for every song.

The CLI owner-mock search was skipped because the initial CLI check was signed out. The mock is local and based on source-inspected contracts; no upstream write calls occur. Socket.IO, databases, local audio, MusicKit, and cloud/LAN transitions are not modeled. Unmodeled calls return 501. Provider identity routes are synthetic fixtures; their client behavior is tested, while provider-wide promises remain unknown. The three embedded artwork fixtures are original public music covers, not proof of personalization.
