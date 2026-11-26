# Native audio simulation evidence

Sources: NativeRoomAudio, RoomSession readiness/playback commands, and `/search/youtube/download`.

Ran locally on port 4189 with Postman simulation. The member generated a three-second PCM WAV, a 503, and malformed audio. Native URLSession and AVAudioFile exercised these responses; duration, rendering, pause/resume, seek, energy, failure without readiness, and recovery passed.

The separate native-playback-room.cjs fixture used production Room state with Socket.IO on port 4190 and forwarded audio downloads to this simulation. Together, 33 checks passed, including join, readiness flags, Play/Pause, seek/resume, clock probes, and reconnect. Evidence covers local protocol behavior with synthetic audio. YouTube extraction, persistent/authenticated rooms, hardware latency, and multi-device audible synchronization were not simulated.
