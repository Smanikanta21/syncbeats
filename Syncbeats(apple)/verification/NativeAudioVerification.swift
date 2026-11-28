import AppKit
import AVFoundation
import Foundation

@main struct NativeAudioVerification {
    @MainActor static func main() async throws {
        var checks = 0
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            guard value() else { print("FAIL: \(message)"); exit(1) }
            checks += 1; print("PASS: \(message)")
        }
        let spectrumFormat = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
        let tone = AVAudioPCMBuffer(pcmFormat: spectrumFormat, frameCapacity: 1024)!
        tone.frameLength = 1024
        for channel in 0..<2 {
            for frame in 0..<1024 { tone.floatChannelData![channel][frame] = Float(0.2 * sin(2 * Double.pi * 3_000 * Double(frame) / 48_000)) }
        }
        let analyzer = AudioSpectrumAnalyzer()
        var spectrum: [Double] = []
        for _ in 0..<8 { spectrum = analyzer.consume(tone) }
        let peak = spectrum.indices.max(by: { spectrum[$0] < spectrum[$1] })!
        check((15...17).contains(peak) && spectrum[peak] > 0.7, "Live FFT identifies a 3 kHz tone in its frequency band")
        let compact = SpectrumMotion.compactBands(spectrum)
        check(compact.count == 5 && compact.max()! > 0 && compact.min()! < compact.max()!, "Compact bars respond to measured FFT audio with distinct levels")
        check(SpectrumMotion.compactBands(Array(repeating: 0, count: 32)) == Array(repeating: 0, count: 5), "Compact bars stay silent without audio")
        check(SpectrumMotion.compactBands([.nan, .infinity, -1, 2, 0.4]) == [0, 0, 0, 1, 0.4], "Compact bars sanitize invalid levels")
        analyzer.reset()
        for channel in 0..<2 { for frame in 0..<1024 { tone.floatChannelData![channel][frame] = 0 } }
        check(analyzer.consume(tone).allSatisfy { $0 == 0 }, "Silence produces a flat spectrum without fabricated motion")
        let spectrumMeter = AudioEnergyMeter()
        spectrumMeter.consume(tone); spectrumMeter.reset()
        check(spectrumMeter.read().spectrum.allSatisfy { $0 == 0 }, "Pause clears all live spectrum bands")
        let lateTone = AVAudioPCMBuffer(pcmFormat: spectrumFormat, frameCapacity: 2048)!
        lateTone.frameLength = 2048
        for channel in 0..<2 {
            for frame in 0..<2048 {
                lateTone.floatChannelData![channel][frame] = frame < 1024 ? 0 : Float(0.2 * sin(2 * Double.pi * 3_000 * Double(frame) / 48_000))
            }
        }
        analyzer.reset()
        let lateSpectrum = analyzer.consume(lateTone)
        check((lateSpectrum[15...17].max() ?? 0) > 0.3, "FFT captures transients in the second half of the audio tap")
        var smooth = SpectrumMotion()
        let fullSpectrum = [Double](repeating: 1, count: AudioSpectrumAnalyzer.bandCount)
        smooth.update(target: fullSpectrum, time: 0, playing: true)
        smooth.update(target: fullSpectrum, time: 1.0 / 60, playing: true)
        let attack = smooth.bands[0]
        check(attack > 0 && attack < 0.5, "Display spectrum interpolates attacks rather than jumping between tap samples")
        smooth.update(target: [Double](repeating: 0, count: 24), time: 2.0 / 60, playing: true)
        check(smooth.bands[0] > 0 && smooth.bands[0] < attack, "Display spectrum decays smoothly between frames")
        smooth.update(target: fullSpectrum, time: 3.0 / 60, playing: false)
        check(smooth.bands.allSatisfy { $0 == 0 }, "Pausing immediately clears display spectrum")
        if CommandLine.arguments.contains("--spectrum-only") {
            print("\(checks) native spectrum checks passed")
            return
        }
        let safe = NativeEqualizer(enabled: true, gains: [.nan, 30, -30])
        check(safe.gains == [0, 12, -12, 0, 0], "Equalizer repairs invalid persisted gains and clamps boosts")
        check(safe.preamp == -12 && NativeEqualizer().preamp == 0, "Equalizer reserves boost headroom and defaults to bypass")
        let flatBass = try equalizerRMS(frequency: 60, settings: NativeEqualizer())
        let warm = NativeEqualizer(enabled: true, gains: NativeEqualizer.Preset.warm.gains)
        let warmBass = try equalizerRMS(frequency: 60, settings: warm)
        let flatTreble = try equalizerRMS(frequency: 4_000, settings: NativeEqualizer())
        let warmTreble = try equalizerRMS(frequency: 4_000, settings: warm)
        check(warmBass / flatBass > warmTreble / flatTreble * 1.3, "Rendered Warm equalizer raises bass relative to treble")
        let bypassBass = try equalizerRMS(frequency: 60, settings: NativeEqualizer(enabled: false, gains: warm.gains))
        check(abs(bypassBass - flatBass) < flatBass * 0.01, "Bypassing equalizer restores unprocessed audio")
        let base = URL(string: ProcessInfo.processInfo.environment["SYNCBEATS_AUDIO_TEST_URL"] ?? "http://127.0.0.1:4189/syncbeats-native-audio")!
        let audio = NativeRoomAudio()
        var loaded = 0, failed = 0, ended = 0
        audio.onLoaded = { _, _ in loaded += 1 }; audio.onFailure = { _ in failed += 1 }; audio.onEnded = { ended += 1 }
        func track(_ id: String) -> RoomTrack {
            RoomTrack(id: id, trackUrl: "youtube:\(id)", title: "Synthetic tone", artist: "Fixture", thumbnail: nil, durationSec: nil, isCurrent: true, queueIndex: 0)
        }
        func waitForLoad() async {
            for _ in 0..<100 {
                if !audio.loading { return }
                try? await Task.sleep(for: .milliseconds(50))
            }
        }
        check(PlaybackCommand.toggle(playing: false, pending: true) == "playback:pause", "Pending playback is cancelled by Pause")
        check(PlaybackCommand.toggle(playing: false, pending: false) == "playback:play", "Paused playback requests Play")
        check(YouTubeIdentity.key(for: "youtube:aaaaaaaaaaa?thumb=old") == YouTubeIdentity.key(for: "youtube:aaaaaaaaaaa?thumb=new"), "Artwork query changes preserve loaded audio identity")
        let prefetch = NativeAudioPrefetch()
        let prefetchRequest = try NativeAudioPrefetch.request(track: track("aaaaaaaaaaa"), baseURL: base)
        let firstDownload = Task { try await prefetch.file(for: prefetchRequest, using: .shared, speculative: true) }
        let reusedDownload = Task { try await prefetch.file(for: prefetchRequest, using: .shared) }
        let firstFile = try await firstDownload.value, reusedFile = try await reusedDownload.value
        let cachedFile = try await prefetch.file(for: prefetchRequest, using: .shared)
        check(firstFile.byteCount > 0 && firstFile === reusedFile && cachedFile === firstFile,
              "Next-track prefetch shares one disk file with playback without retaining audio Data")
        await prefetch.clear()
        check(FileManager.default.fileExists(atPath: firstFile.url.path), "Clearing the cache preserves a download held by an active reader")
        audio.prepare(track: track("aaaaaaaaaaa"), baseURL: base); await waitForLoad()
        check(loaded == 1 && failed == 0, "URLSession downloads and decodes audio")
        check(abs((audio.duration ?? 0) - 3) < 0.001, "Duration comes from decoded sample count")
        audio.prepare(track: track("aaaaaaaaaaa"), baseURL: base)
        check(loaded == 1 && !audio.loading, "Same-track refresh reuses loaded audio")
        let scheduledStart = ProcessInfo.processInfo.systemUptime + 0.25
        audio.follow(playing: true, position: 0, delay: 0.25)
        check(audio.rendering, "Playback is scheduled on the audio node")
        try await Task.sleep(for: .milliseconds(100))
        check((audio.renderedPosition() ?? -1) < 0.01, "Position stays zero before the scheduled start")
        try await Task.sleep(for: .milliseconds(450))
        let first = audio.renderedPosition() ?? -1
        check(first > 0.1 && first < 0.7, "Audio samples advance after scheduled start")
        check(audio.meter.read().level > 0 && audio.meter.read().bass > 0, "Ambient energy measures rendered audio")
        let steadyCorrections = audio.correctionCount
        for _ in 0..<6 {
            try await Task.sleep(for: .milliseconds(80))
            audio.follow(playing: true, position: ProcessInfo.processInfo.systemUptime - scheduledStart,
                         delay: 0, hardSeekMS: 15)
        }
        check(audio.correctionCount - steadyCorrections <= 1,
              "Steady sample playback does not repeatedly seek against a monotonic timeline")
        let correctionStarted = ProcessInfo.processInfo.systemUptime
        audio.correct(to: 0.4, delay: 0)
        try await Task.sleep(for: .milliseconds(12))
        // Simulate delayed actor delivery during a background fade.
        usleep(120_000)
        try await Task.sleep(for: .milliseconds(140))
        let delayedExpected = 0.4 + ProcessInfo.processInfo.systemUptime - correctionStarted
        check(abs((audio.renderedPosition() ?? -10) - delayedExpected) < 0.055,
              "Delayed correction follows elapsed time instead of assuming a 48 ms fade")
        for _ in 0..<20 {
            if audio.meter.read().level > 0 { break }
            try await Task.sleep(for: .milliseconds(25))
        }
        check(audio.meter.read().level > 0,
              "Corrected output fades back into audible samples")
        audio.follow(playing: false, position: first, delay: 0)
        check(!audio.rendering && audio.meter.read().level == 0, "Pause stops rendering and clears ambient energy")
        audio.follow(playing: true, position: 1.2, delay: 0)
        try await Task.sleep(for: .milliseconds(180))
        check((audio.renderedPosition() ?? 0) > 1.25, "Resume schedules the authoritative offset")
        audio.follow(playing: true, position: 2.1, delay: 0, force: true)
        // Wait for the asynchronous renderer's position publication under build load.
        for _ in 0..<28 {
            if (audio.renderedPosition() ?? 0) > 2.15 { break }
            try await Task.sleep(for: .milliseconds(25))
        }
        check((audio.renderedPosition() ?? 0) > 2.15, "Seek corrects the sample position")
        audio.pause(); try await Task.sleep(for: .milliseconds(100))
        check(ended == 0, "Cancelled schedules do not emit ended")
        var completionEvents = 0
        audio.onEnded = { completionEvents += 1 }
        audio.follow(playing: true, position: 2.85, delay: 0, force: true)
        for _ in 0..<30 { if completionEvents > 0 { break }; try await Task.sleep(for: .milliseconds(50)) }
        check(completionEvents == 1 && audio.completed && !audio.rendering, "Track completion waits for the room instead of restarting locally")
        for _ in 0..<4 { audio.follow(playing: true, position: 3, delay: 0) }
        try await Task.sleep(for: .milliseconds(100))
        check(completionEvents == 1 && !audio.rendering, "Drift ticks cannot repeatedly finish an exhausted track")
        audio.follow(playing: true, position: 0.5, delay: 0, force: true)
        try await Task.sleep(for: .milliseconds(150))
        check(audio.rendering && !audio.completed && (audio.renderedPosition() ?? 0) > 0.5, "A new room instance replays a completed file from a seek position")
        audio.prepare(track: track("bbbbbbbbbbb"), baseURL: base); await waitForLoad()
        check(failed == 1 && audio.loadedKey == nil && audio.error != nil, "503 download fails without declaring readiness")
        audio.prepare(track: track("ccccccccccc"), baseURL: base); await waitForLoad()
        check(failed == 2 && audio.loadedKey == nil, "Malformed audio cannot become ready")
        audio.prepare(track: track("aaaaaaaaaaa"), baseURL: base); await waitForLoad()
        check(loaded == 2, "Playback recovers after failed source")
        audio.reset(); check(!audio.rendering && audio.loadedKey == nil && !audio.loading, "Disconnect clears native playback")
        var redPixels = [UInt8](repeating: 0, count: 16*16*4)
        for i in stride(from: 0, to: redPixels.count, by: 4) { redPixels[i] = 220; redPixels[i+1] = 30; redPixels[i+2] = 20; redPixels[i+3] = 255 }
        let image = redPixels.withUnsafeMutableBytes { bytes -> CGImage in
            let context = CGContext(data: bytes.baseAddress, width: 16, height: 16, bitsPerComponent: 8, bytesPerRow: 64,
                                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
            return context.makeImage()!
        }
        let palette = CoverPalette.extract(image)
        check(palette.first!.red > palette.first!.green * 2, "Ambient palette inherits cover hue")
        check(palette.first!.red < 220.0/255, "Cover saturation is softened")
        check(NativeSyncParameters.forRTT(20).hardSeekMS == 15 && NativeSyncParameters.forRTT(200).hardSeekMS == 35, "Native correction uses adaptive network thresholds")
        let stereoFormat = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        let stereo = AVAudioPCMBuffer(pcmFormat: stereoFormat, frameCapacity: 2048)!
        stereo.frameLength = 2048
        let signal = AudioEnergyMeter()
        for channel in 0..<2 { for sample in 0..<2048 { stereo.floatChannelData![channel][sample] = 0 } }
        signal.consume(stereo)
        check(signal.read().level == 0 && signal.read().bass == 0, "Silence creates no false ambient beat")
        for sample in 0..<2048 { stereo.floatChannelData![1][sample] = Float(sin(Double(sample) * 2 * .pi * 100 / 44100)) * 0.025 }
        signal.consume(stereo)
        check(signal.read().level > 0.08 && signal.read().bass > 0.03, "Quiet right-channel audio drives the ambient effect")
        for sample in 0..<2048 { stereo.floatChannelData![0][sample] = -stereo.floatChannelData![1][sample] }
        signal.reset(); signal.consume(stereo)
        check(signal.read().level > 0.08, "Opposite-phase stereo audio retains ambient loudness")
        let size = CGSize(width: 960, height: 720)
        let still = AmbientGeometry.blob(index: 0, size: size, time: 0, energy: AudioEnergy()).boundingRect
        let flowing = AmbientGeometry.blob(index: 0, size: size, time: 5, energy: AudioEnergy()).boundingRect
        var beat = AudioEnergy(); beat.bass = 0.8; beat.level = 0.6
        let responding = AmbientGeometry.blob(index: 0, size: size, time: 0, energy: beat).boundingRect
        check(abs(still.midX - flowing.midX) > 100, "Ambient shapes flow across the player")
        check(responding.width > still.width && responding.height > still.height, "Bass and music softly expand the flowing shapes")
        if let roomURL = ProcessInfo.processInfo.environment["SYNCBEATS_PLAYBACK_TEST_URL"].flatMap(URL.init(string:)) {
            func readyParticipant() async throws -> Bool {
                // Let the ready snapshot and any response to it settle before checking.
                try await Task.sleep(for: .milliseconds(200))
                let (data, _) = try await URLSession.shared.data(from: roomURL.appendingPathComponent("rooms/123456"))
                let snapshot = try JSONDecoder().decode(RoomSnapshot.self, from: data)
                return snapshot.participants.contains { $0.displayName == "Fixture Mac" && $0.isReady && $0.isBlocked != true }
            }
            let session = RoomSession()
            session.connect(RoomCredentials(roomID: "123456", userID: "fixture", displayName: "Fixture Mac", token: "fixture", baseURL: roomURL, deviceID: "fixture-device"))
            for _ in 0..<100 { if session.canControl && session.audio.loadedKey != nil { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.canControl && session.audio.loadedKey != nil, "Room session downloads local audio after Socket.IO join")
            check(session.duration == 3, "Room player exposes measured file duration")
            let loadedReady = try await readyParticipant()
            check(loadedReady, "Loaded Mac stays ready and unblocked after snapshots settle")
            session.togglePlayback()
            for _ in 0..<40 { if session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.isPlaying && session.audio.rendering, "Authoritative Play snapshot starts local audio")
            try await Task.sleep(for: .milliseconds(350))
            check(session.position() > 0.2, "Room duration timeline advances during local playback")
            let own = session.ownSocketID ?? ""
            let telemetry = session.deviceTelemetry(for: own)
            check(!own.isEmpty && telemetry.path == "Cloud" && telemetry.network?.jitterMS != nil,
                  "Live Socket.IO pongs supply rolling cloud metrics for this device")
            check(telemetry.playbackError.map { abs($0) < 100 } == true,
                  "A fresh renderer and room clock produce a playback alignment estimate")
            let peer = "fixture-peer"
            func peerReport(_ mode: String) async throws {
                var request = URLRequest(url: roomURL.appendingPathComponent("__peer-telemetry/\(mode)"))
                request.httpMethod = "POST"
                let (_, response) = try await URLSession.shared.data(for: request)
                check((response as? HTTPURLResponse)?.statusCode == 204, "Peer telemetry fixture accepted \(mode)")
            }
            try await peerReport("legacy")
            for _ in 0..<20 {
                if session.deviceTelemetry(for: peer).latency != nil { break }
                try await Task.sleep(for: .milliseconds(25))
            }
            let legacy = session.deviceTelemetry(for: peer)
            check(legacy.latency == 12 && legacy.jitter == 2 && legacy.network == nil && legacy.playbackError == nil,
                  "An older server's remote report fills the reported fields without fabricating RTT or sync")
            try await peerReport("measured")
            for _ in 0..<20 {
                if session.deviceTelemetry(for: peer).network != nil { break }
                try await Task.sleep(for: .milliseconds(25))
            }
            let measured = session.deviceTelemetry(for: peer)
            check(measured.network?.rttMS == 40 && measured.latency == 20 &&
                  measured.jitter == 5 && measured.playbackError == -7,
                  "A measured report fills all four metrics for the remote peer")
            try await peerReport("legacy")
            try await Task.sleep(for: .milliseconds(75))
            check(session.deviceTelemetry(for: peer).network?.rttMS == 40,
                  "A basic report does not replace a fresh measured report")
            session.togglePlayback()
            for _ in 0..<40 { if !session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(!session.isPlaying && !session.audio.rendering, "Authoritative Pause stops this Mac")
            check(session.deviceTelemetry(for: own).playbackError == nil, "Paused playback clears the alignment estimate")
            check(session.deviceTelemetry(for: peer).playbackError == nil, "Paused playback clears the remote estimate")
            try await peerReport("leave")
            for _ in 0..<20 {
                if session.deviceTelemetry(for: peer).latency == nil { break }
                try await Task.sleep(for: .milliseconds(25))
            }
            check(session.deviceTelemetry(for: peer).latency == nil, "Leaving the room clears the remote report")
            let pausedReady = try await readyParticipant()
            check(pausedReady, "Pause snapshots keep the loaded Mac unblocked")
            session.seek(to: 1.4)
            for _ in 0..<40 { if abs(session.position() - 1.4) < 0.01 { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(abs(session.position() - 1.4) < 0.01, "Paused seek updates the shared timeline")
            session.togglePlayback()
            for _ in 0..<40 { if session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.isPlaying && session.audio.rendering, "Resume starts local audio from shared offset")
            session.reconnect()
            for _ in 0..<80 { if session.canControl && session.audio.loadedKey != nil { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.canControl && session.audio.loadedKey != nil, "Reconnect restores local audio readiness")
            check(session.audio.error == nil, "Reconnect leaves native audio healthy")
            let reconnectedReady = try await readyParticipant()
            check(reconnectedReady, "Reconnect restores server readiness without reblocking the Mac")
            let (callData, _) = try await URLSession.shared.data(from: roomURL.appendingPathComponent("__calls"))
            let calls = try JSONSerialization.jsonObject(with: callData) as! [[String: Any]]
            let ready = calls.filter { $0["event"] as? String == "room:clientReady" }
            check(ready.count >= 2 && ready.allSatisfy { ($0["data"] as? [String: Any])?["isReady"] as? Bool == true }, "Ready messages carry the server-required flag after reconnect")
            check(calls.contains { $0["event"] as? String == "sync:ping" }, "Native room measures server clock offset")
            session.pause()
            for _ in 0..<40 { if !session.isPlaying { break }; try await Task.sleep(for: .milliseconds(50)) }
            session.seek(to: 0)
            for _ in 0..<40 { if session.position() < 0.01 { break }; try await Task.sleep(for: .milliseconds(50)) }
            session.play()
            for _ in 0..<40 { if session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            let interruptedAt = session.position()
            session.suspendLocalAudio()
            try await Task.sleep(for: .milliseconds(450))
            check(session.localAudioSuspended && session.isPlaying && !session.audio.rendering,
                  "Local interruption stops output without pausing the shared room")
            check(session.position() > interruptedAt + 0.3 && session.audio.loadedKey == nil,
                  "Drift loop cannot restart suspended output while room time continues")
            session.play()
            for _ in 0..<60 { if session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(!session.localAudioSuspended && session.isPlaying && session.audio.rendering,
                  "Explicit Play resumes local output without toggling a playing room")
            try await Task.sleep(for: .milliseconds(100))
            check(abs((session.audio.renderedPosition() ?? -10) - session.position()) < 0.2,
                  "Resumed output follows current server position instead of the interrupted offset")
            session.recoverAudioOutput()
            for _ in 0..<60 { if session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.audio.rendering && session.audio.error == nil,
                  "Rebuilding invalidated audio objects restores room playback")
            session.suspendLocalAudio()
            session.pause()
            for _ in 0..<40 { if !session.isPlaying { break }; try await Task.sleep(for: .milliseconds(50)) }
            session.resumeLocalAudio()
            for _ in 0..<60 { if session.audio.loadedKey != nil { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(!session.localAudioSuspended && !session.isPlaying && !session.audio.rendering,
                  "Recovery respects a room paused during interruption")
            let librarySongs = [
                NativeLibrarySong(id: "library-a", title: "First fixture", artist: "Fixture", album: nil, artwork: nil, thumbnail: nil, duration: 3, youtubeID: "aaaaaaaaaaa", source: "SYNCBEATS"),
                NativeLibrarySong(id: "library-d", title: "Second fixture", artist: "Fixture", album: nil, artwork: nil, thumbnail: nil, duration: 3, youtubeID: nil, source: "APPLE_MUSIC")
            ]
            var resolvedSongs = 0
            var selectedStartedBeforeNextResolved = false
            await session.playLibrary(librarySongs[0], in: librarySongs, resolve: { song in
                for _ in 0..<30 {
                    if session.isPlaying && session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:aaaaaaaaaaa" {
                        selectedStartedBeforeNextResolved = true; break
                    }
                    try await Task.sleep(for: .milliseconds(50))
                }
                resolvedSongs += 1
                var candidate = song; candidate.youtubeID = "ddddddddddd"; return candidate
            })
            check(selectedStartedBeforeNextResolved,
                  "Selected song starts rendering before a following Apple song finishes resolving")
            for _ in 0..<40 { if session.isPlaying && session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(resolvedSongs == 1 && session.errorMessage == nil && session.queue.count == 2 && session.isPlaying,
                  "Library playback prepares the following songs and starts the selected track")
            for _ in 0..<120 { if session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd" && session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd" && session.audio.rendering,
                  "Library sequence advances automatically to the following song")
            var preparingOldNext = false
            let contextResults = [librarySongs[0].result!,
                RoomSearchResult(url: "https://www.youtube.com/watch?v=fffffffffff", title: "Clicked from Home", thumbnail: nil, uploaderName: "Fixture", duration: 3),
                RoomSearchResult(url: "https://www.youtube.com/watch?v=ddddddddddd", title: "Following from Home", thumbnail: nil, uploaderName: "Fixture", duration: 3),
                RoomSearchResult(url: "https://www.youtube.com/watch?v=eeeeeeeeeee", title: "Last from Home", thumbnail: nil, uploaderName: "Fixture", duration: 3)]
            await session.play(contextResults[1], in: contextResults)
            for _ in 0..<60 { if session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:fffffffffff" { break }; try await Task.sleep(for: .milliseconds(25)) }
            let selectedIndex = session.queue.firstIndex { YouTubeIdentity.key(for: $0.trackUrl) == "youtube:fffffffffff" }
            check(selectedIndex != nil && session.queue.dropFirst(selectedIndex! + 1).map { YouTubeIdentity.key(for: $0.trackUrl) } == ["youtube:ddddddddddd", "youtube:eeeeeeeeeee"],
                  "A Home click queues the following visible songs in order, without replaying earlier rows")
            if let first = session.upcoming.first, let last = session.upcoming.last,
               let target = session.queue.firstIndex(where: { $0.id == first.id }) {
                await session.reorder(last, to: target)
                for _ in 0..<40 { if session.upcoming.first?.id == last.id { break }; try await Task.sleep(for: .milliseconds(25)) }
                check(session.upcoming.first?.id == last.id && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:fffffffffff",
                      "Reordering broadcasts the new Up Next order without changing Now Playing")
                await session.reorder(last, to: session.queue.count - 1)
                for _ in 0..<40 { if session.upcoming.first?.id == first.id { break }; try await Task.sleep(for: .milliseconds(25)) }
                check(session.upcoming.first?.id == first.id && session.upcoming.last?.id == last.id,
                      "A song can move back to the end of the shared queue")
            } else { check(false, "The contextual queue has enough songs to reorder") }
            check(session.supportsAutoplay && session.autoplayEnabled, "Autoplay defaults on and is supplied by the room snapshot")
            session.toggleAutoplay()
            for _ in 0..<40 { if !session.autoplayEnabled { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.seek(to: 2.7)
            for _ in 0..<60 { if !session.isPlaying { break }; try await Task.sleep(for: .milliseconds(25)) }
            check(!session.isPlaying && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:fffffffffff" && !session.upcoming.isEmpty,
                  "Autoplay off stops at the end and retains Now Playing and Up Next")
            session.next()
            for _ in 0..<60 { if session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd" { break }; try await Task.sleep(for: .milliseconds(25)) }
            check(session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd",
                  "Manual Next still plays while Autoplay is off")
            session.toggleAutoplay()
            for _ in 0..<40 { if session.autoplayEnabled { break }; try await Task.sleep(for: .milliseconds(25)) }
            let delayedSelection = Task {
                await session.playLibrary(librarySongs[0], in: librarySongs, resolve: { song in
                    try await Task.sleep(for: .seconds(2))
                    var resolved = song; resolved.youtubeID = "ddddddddddd"; return resolved
                })
            }
            for _ in 0..<60 { if session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:aaaaaaaaaaa" { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.seek(to: 2.7)
            await delayedSelection.value
            for _ in 0..<80 { if session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd" { break }; try await Task.sleep(for: .milliseconds(25)) }
            check(session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd",
                  "A short song continues when its next source finishes resolving after completion")
            let pausedPreparation = Task {
                await session.playLibrary(librarySongs[0], in: librarySongs, resolve: { song in
                    try await Task.sleep(for: .seconds(2))
                    var resolved = song; resolved.youtubeID = "ddddddddddd"; return resolved
                })
            }
            for _ in 0..<60 { if session.audio.rendering && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:aaaaaaaaaaa" { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.seek(to: 2.7)
            for _ in 0..<60 { if !session.isPlaying { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.pause()
            await pausedPreparation.value
            try await Task.sleep(for: .milliseconds(300))
            check(!session.isPlaying && session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:aaaaaaaaaaa",
                  "Pause cancels delayed continuation while allowing the following queue to prepare")
            check(QueueInsertion.destination(source: 2, target: 4, below: true, current: 0, count: 5) == 4,
                  "Dragging down accounts for removal before the insertion point")
            check(QueueInsertion.destination(source: 4, target: 1, below: false, current: 0, count: 5) == 1,
                  "Dragging up can place a song first in Up Next")
            check(QueueInsertion.destination(source: 0, target: 2, below: false, current: 0, count: 5) == nil,
                  "Now Playing cannot be reordered by a drop")
            check(QueueInsertion.destination(source: 2, target: 0, below: false, current: 0, count: 5) == nil,
                  "A drop cannot move an upcoming song into played history")
            let staleNext = NativeLibrarySong(id: "stale-next", title: "Cancelled next", artist: "Fixture", album: nil,
                artwork: nil, thumbnail: nil, duration: 3, youtubeID: nil, source: "APPLE_MUSIC")
            let oldSelection = Task {
                await session.playLibrary(librarySongs[0], in: [librarySongs[0], staleNext], resolve: { song in
                    preparingOldNext = true
                    try await Task.sleep(for: .milliseconds(800))
                    var matched = song; matched.youtubeID = "ggggggggggg"; return matched
                })
            }
            for _ in 0..<40 { if preparingOldNext { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(preparingOldNext && !session.preparingLibraryPlayback,
                  "Preparing following songs does not block another song selection")
            var replacement = librarySongs[1]; replacement.youtubeID = "ddddddddddd"
            await session.playLibrary(replacement, in: [replacement])
            await oldSelection.value
            for _ in 0..<40 { if session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd" && session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.currentTrackURL.map(YouTubeIdentity.key(for:)) == "youtube:ddddddddddd"
                  && !session.queue.contains(where: { YouTubeIdentity.key(for: $0.trackUrl) == "youtube:ggggggggggg" }),
                  "A new selection cancels the old sequence before its delayed song reaches the queue")
            session.cycleRepeat()
            for _ in 0..<40 { if session.repeatMode == "all" { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.cycleRepeat()
            for _ in 0..<40 { if session.repeatMode == "track" { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.seek(to: 2.7)
            try await Task.sleep(for: .milliseconds(900))
            check(session.repeatMode == "track" && session.isPlaying && session.audio.rendering && session.position() < 2,
                  "Repeat-one starts a fresh same-track audio schedule")
            session.cycleRepeat()
            for _ in 0..<40 { if session.repeatMode == "off" { break }; try await Task.sleep(for: .milliseconds(25)) }
            session.toggleShuffle()
            for _ in 0..<40 { if session.shuffle { break }; try await Task.sleep(for: .milliseconds(25)) }
            check(session.shuffle, "Shuffle updates through the authoritative room snapshot")
            session.seek(to: 2.8)
            for _ in 0..<80 { if !session.isPlaying { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(!session.isPlaying && session.currentTrack != nil && session.duration == 3,
                  "Finished queue keeps the last track and slider available")
            session.seek(to: 1)
            for _ in 0..<50 { if session.isPlaying && session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.isPlaying && session.audio.rendering && session.position() >= 1 && session.position() < 2,
                  "Seeking a completed song resumes from the slider position")
            _ = try await URLSession.shared.data(from: roomURL.appendingPathComponent("__legacy"))
            session.seek(to: 2.8)
            for _ in 0..<80 { if !session.serverHasCurrentTrack { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(!session.serverHasCurrentTrack && session.currentTrack != nil && session.duration == 3,
                  "Legacy server completion retains a replayable local selection")
            session.seek(to: 0.7)
            for _ in 0..<50 { if session.isPlaying && session.audio.rendering { break }; try await Task.sleep(for: .milliseconds(50)) }
            check(session.isPlaying && session.audio.rendering && session.position() >= 0.7 && session.position() < 2,
                  "Slider replay restores a cleared track on the current production protocol")
            session.disconnect()
            check(!session.localAudioSuspended, "Leaving a room clears interruption state")
            check(!session.audio.rendering && session.audio.loadedKey == nil, "Leaving room stops local rendering")
        }
        print("\(checks) native audio checks passed")
    }
    @MainActor static func equalizerRMS(frequency: Double, settings: NativeEqualizer) throws -> Double {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let eq = AVAudioUnitEQ(numberOfBands: NativeEqualizer.frequencies.count)
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
        engine.attach(player); engine.attach(eq)
        engine.connect(player, to: eq, format: format)
        engine.connect(eq, to: engine.mainMixerNode, format: format)
        settings.apply(to: eq)
        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 1024)
        let source = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_000)!
        source.frameLength = 48_000
        for channel in 0..<2 {
            for frame in 0..<48_000 {
                source.floatChannelData![channel][frame] = Float(0.1 * sin(2 * Double.pi * frequency * Double(frame) / 48_000))
            }
        }
        player.scheduleBuffer(source)
        try engine.start(); player.play()
        defer { player.stop(); engine.stop() }
        let output = AVAudioPCMBuffer(pcmFormat: engine.manualRenderingFormat, frameCapacity: 1024)!
        var sum = 0.0, count = 0
        for block in 0..<40 {
            let status = try engine.renderOffline(1024, to: output)
            guard status == .success else { continue }
            if block > 5 {
                for frame in 0..<Int(output.frameLength) {
                    let value = Double(output.floatChannelData![0][frame])
                    sum += value * value; count += 1
                }
            }
        }
        precondition(count > 0, "Offline equalizer produced samples")
        return sqrt(sum / Double(count))
    }

}
