import AVFoundation
import Foundation
import Observation
import os

nonisolated struct NativeSyncParameters: Sendable {
    let samples: Int
    let gateMS: Double
    let gapMS: Double
    let resyncMS: Double
    let driftMS: Double
    let hardSeekMS: Double
    // Mirrors useAdaptiveSync.ts PARAM_TABLE; no playback-rate pitch correction.
    static func forRTT(_ rtt: Double) -> Self {
        if rtt < 50 { return .init(samples: 8, gateMS: 150, gapMS: 40, resyncMS: 5000, driftMS: 250, hardSeekMS: 15) }
        if rtt < 120 { return .init(samples: 6, gateMS: 250, gapMS: 60, resyncMS: 10000, driftMS: 350, hardSeekMS: 20) }
        if rtt < 300 { return .init(samples: 5, gateMS: 400, gapMS: 60, resyncMS: 15000, driftMS: 600, hardSeekMS: 35) }
        return .init(samples: 4, gateMS: 600, gapMS: 80, resyncMS: 20000, driftMS: 1000, hardSeekMS: 80)
    }
}

nonisolated struct AudioEnergy: Sendable {
    var spectrum = [Double](repeating: 0, count: AudioSpectrumAnalyzer.bandCount)
    var level: Double = 0
    var bass: Double = 0
    var transient: Double = 0
}

/// A bounded, thread-safe handoff from the Core Audio render callback to the UI.
nonisolated final class AudioEnergyMeter: @unchecked Sendable {
    private struct State { var energy = AudioEnergy(); var lowPass: Float = 0; var previousRMS: Float = 0; var reference = 0.03; let analyzer = AudioSpectrumAnalyzer() }
    private let state = OSAllocatedUnfairLock(initialState: State())
    private let published = OSAllocatedUnfairLock(initialState: AudioEnergy())
    func reset() { state.withLockUnchecked { value in
        value.energy = AudioEnergy(); value.lowPass = 0; value.previousRMS = 0; value.reference = 0.03; value.analyzer.reset()
        published.withLock { $0 = AudioEnergy() }
    } }
    func read() -> AudioEnergy { published.withLock { $0 } }
    func consume(_ buffer: AVAudioPCMBuffer) {
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { return }
        let count = Int(buffer.frameLength), channelCount = Int(buffer.format.channelCount)
        let alpha = Float(1 - exp(-2 * Double.pi * 160 / buffer.format.sampleRate))
        state.withLockUnchecked { value in
            value.energy.spectrum = value.analyzer.consume(buffer)
            var sum: Float = 0, lowSum: Float = 0
            for i in 0..<count {
                var sample: Float = 0, square: Float = 0
                for c in 0..<channelCount { sample += channels[c][i]; square += channels[c][i] * channels[c][i] }
                sample /= Float(channelCount)
                value.lowPass += alpha * (sample - value.lowPass)
                sum += square / Float(channelCount); lowSum += value.lowPass * value.lowPass
            }
            let rms = sqrt(sum / Float(count)), bass = sqrt(lowSum / Float(count))
            value.reference = max(0.015, value.reference * 0.985 + Double(rms) * 0.015)
            let onset = max(0, Double(rms - value.previousRMS * 1.15)) / max(0.025, value.reference)
            value.previousRMS += (rms - value.previousRMS) * 0.12
            let level = rms < 0.0003 ? 0 : min(1, pow(Double(rms) / max(0.035, value.reference * 2), 0.65))
            let low = rms < 0.0003 ? 0 : min(1, pow(Double(bass) / max(0.025, value.reference * 1.4), 0.7))
            value.energy.level += (level - value.energy.level) * (level > value.energy.level ? 0.35 : 0.09)
            value.energy.bass += (low - value.energy.bass) * (low > value.energy.bass ? 0.3 : 0.08)
            value.energy.transient = max(value.energy.transient * 0.83, min(1, onset))
            // UI reads never hold the FFT workspace lock. The render callback
            // skips a publication rather than waiting if a reader owns it.
            let energy = value.energy
            published.withLockIfAvailable { $0 = energy }
        }
    }
}

/// Core Audio graph operations stay on one serial worker. The UI never waits on
/// AVAudioEngine's internal threads (including stop/reset and render-time queries).
nonisolated private final class NativeAudioRenderer: @unchecked Sendable {
    // Engine start/stop wait on Core Audio's Default-QoS control threads. Match
    // that priority here; this asynchronous worker never blocks the UI or render tap.
    private let queue = DispatchQueue(label: "in.syncbeats.audio-renderer", qos: .default)
    private lazy var engine = AVAudioEngine()
    private lazy var player = AVAudioPlayerNode()
    private lazy var equalizerNode = AVAudioUnitEQ(numberOfBands: NativeEqualizer.frequencies.count)
    private var equalizerSettings = NativeEqualizer()
    private var file: AVAudioFile?
    private var generation = UUID()
    private var scheduleID = UUID()
    private var segmentStart = 0.0
    private var tapInstalled = false
    #if os(iOS)
    private var sessionActive = false
    #endif
    private struct PositionSnapshot { let generation: UUID; let scheduleID: UUID; let position: Double; let uptime: Double }
    private let snapshot = OSAllocatedUnfairLock<PositionSnapshot?>(initialState: nil)
    private var positionTimer: DispatchSourceTimer?
    let meter: AudioEnergyMeter

    init(meter: AudioEnergyMeter) { self.meter = meter }

    func reset(generation: UUID) {
        queue.async { [self] in
            self.generation = generation; scheduleID = UUID()
            player.stop(); engine.stop(); file = nil; meter.reset()
            #if os(iOS)
            sessionActive = false
            #endif
            snapshot.withLock { $0 = nil }
        }
    }

    func load(data: Data, generation: UUID) async throws -> Double {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                guard self.generation == generation else { continuation.resume(throwing: CancellationError()); return }
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("syncbeats-audio-\(UUID().uuidString).m4a")
                defer { try? FileManager.default.removeItem(at: url) }
                do {
                    try data.write(to: url, options: .atomic)
                    let decoded = try AVAudioFile(forReading: url)
                    if player.engine == nil { engine.attach(player) }
                    if equalizerNode.engine == nil { engine.attach(equalizerNode) }
                    engine.disconnectNodeOutput(player)
                    engine.disconnectNodeOutput(equalizerNode)
                    engine.connect(player, to: equalizerNode, format: decoded.processingFormat)
                    engine.connect(equalizerNode, to: engine.mainMixerNode, format: decoded.processingFormat)
                    applyEqualizer()
                    file = decoded
                    if !tapInstalled {
                        let meter = self.meter
                        engine.mainMixerNode.installTap(onBus: 0, bufferSize: 2048, format: nil) { buffer, _ in meter.consume(buffer) }
                        tapInstalled = true
                    }
                    engine.prepare()
                    #if !os(iOS)
                    try engine.start()
                    #endif
                    // iOS takes the audio session only when playback is scheduled,
                    // so browsing a paused room does not interrupt another app.
                    if positionTimer == nil {
                        let timer = DispatchSource.makeTimerSource(queue: queue)
                        timer.schedule(deadline: .now(), repeating: .milliseconds(40))
                        timer.setEventHandler { [weak self] in self?.samplePosition() }
                        positionTimer = timer; timer.resume()
                    }
                    continuation.resume(returning: Double(decoded.length) / decoded.processingFormat.sampleRate)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    func follow(position: Double, deadline: Double, generation: UUID, scheduleID: UUID,
                completion: @escaping @Sendable (String?) -> Void,
                ended: @escaping @Sendable () -> Void) {
        queue.async { [self] in
            guard self.generation == generation, let file else { return }
            self.scheduleID = scheduleID
            snapshot.withLock { $0 = nil }
            player.stop(); player.volume = 1; meter.reset()
            do { try activateOutput(); if !engine.isRunning { try engine.start() } }
            catch { completion(error.localizedDescription); return }
            let rate = file.processingFormat.sampleRate
            let frame = min(max(0, AVAudioFramePosition(position * rate)), max(0, file.length - 1))
            let count = AVAudioFrameCount(min(Int64(UInt32.max), file.length - frame))
            segmentStart = Double(frame) / rate
            player.scheduleSegment(file, startingFrame: frame, frameCount: count, at: nil, completionCallbackType: .dataPlayedBack) { _ in ended() }
            let delay = max(0, deadline - ProcessInfo.processInfo.systemUptime)
            let host = mach_absolute_time() + AVAudioTime.hostTime(forSeconds: delay)
            player.play(at: AVAudioTime(hostTime: host)); completion(nil)
        }
    }

    private func samplePosition() {
        guard player.isPlaying, let time = player.lastRenderTime,
              let rendered = player.playerTime(forNodeTime: time), rendered.sampleTime >= 0 else { return }
        let value = PositionSnapshot(generation: generation, scheduleID: scheduleID,
            position: segmentStart + Double(rendered.sampleTime) / rendered.sampleRate,
            uptime: ProcessInfo.processInfo.systemUptime)
        snapshot.withLock { $0 = value }
    }
    private func activateOutput() throws {
        #if os(iOS)
        guard !sessionActive else { return }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try session.setActive(true)
        sessionActive = true
        #endif
    }
    func rebuildOutput() {
        queue.async { [self] in
            player.stop(); engine.stop()
            if tapInstalled { engine.mainMixerNode.removeTap(onBus: 0) }
            engine = AVAudioEngine(); player = AVAudioPlayerNode()
            equalizerNode = AVAudioUnitEQ(numberOfBands: NativeEqualizer.frequencies.count)
            tapInstalled = false
            #if os(iOS)
            sessionActive = false
            #endif
        }
    }
    func releaseOutput() {
        #if os(iOS)
        queue.async { [self] in
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            sessionActive = false
        }
        #endif
    }
    func position(generation: UUID, scheduleID: UUID) -> Double? {
        guard let value = snapshot.withLock({ $0 }), value.generation == generation, value.scheduleID == scheduleID else { return nil }
        return value.position + max(0, ProcessInfo.processInfo.systemUptime - value.uptime)
    }
    func volume(_ value: Double) { queue.async { [self] in engine.mainMixerNode.outputVolume = Float(min(100, max(0, value)) / 100) } }
    func fade(_ value: Float, generation: UUID) { queue.async { [self] in if self.generation == generation { player.volume = value } } }
    func equalizer(_ settings: NativeEqualizer) {
        queue.async { [self] in equalizerSettings = settings; applyEqualizer() }
    }
    private func applyEqualizer() {
        equalizerSettings.apply(to: equalizerNode)
    }
    func pause(generation: UUID) {
        queue.async { [self] in
            guard self.generation == generation else { return }
            scheduleID = UUID(); player.stop(); player.volume = 1; meter.reset()
            snapshot.withLock { $0 = nil }
        }
    }
}

@MainActor @Observable
final class NativeRoomAudio {
    private(set) var equalizer: NativeEqualizer
    private(set) var loadedKey: String?
    private(set) var failedKey: String?
    private(set) var duration: Double?
    private(set) var loading = false
    private(set) var error: String?
    private(set) var rendering = false
    func rebuildOutput() { reset(); renderer.rebuildOutput() }
    func releaseOutput() { renderer.releaseOutput() }
    let meter = AudioEnergyMeter()
    @ObservationIgnored private lazy var renderer = NativeAudioRenderer(meter: meter)
    @ObservationIgnored private var loadTask: Task<Void, Never>?
    @ObservationIgnored private var correctionTask: Task<Void, Never>?
    @ObservationIgnored private var preparedKey: String?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var scheduleID = UUID()
    @ObservationIgnored private let http: URLSession
    var onLoaded: ((String, Double) -> Void)?
    var onFailure: ((String) -> Void)?
    var onEnded: (() -> Void)?

    init(http: URLSession = .shared) {
        self.http = http
        let gains = (UserDefaults.standard.array(forKey: "nativeEqualizerGains") as? [NSNumber])?.map(\.floatValue) ?? []
        equalizer = NativeEqualizer(enabled: UserDefaults.standard.bool(forKey: "nativeEqualizerEnabled"), gains: gains)
        renderer.equalizer(equalizer)
    }
    func setEqualizerEnabled(_ enabled: Bool) { equalizer.enabled = enabled; updateEqualizer() }
    func setEqualizerGain(_ value: Double, band: Int) {
        guard equalizer.gains.indices.contains(band), value.isFinite else { return }
        equalizer.gains[band] = Float(min(12, max(-12, value)))
        updateEqualizer()
    }
    func applyEqualizerPreset(_ preset: NativeEqualizer.Preset) {
        equalizer = NativeEqualizer(enabled: true, gains: preset.gains); updateEqualizer()
    }
    func resetEqualizer() { equalizer.gains = NativeEqualizer.Preset.flat.gains; updateEqualizer() }
    private func updateEqualizer() {
        UserDefaults.standard.set(equalizer.enabled, forKey: "nativeEqualizerEnabled")
        UserDefaults.standard.set(equalizer.gains, forKey: "nativeEqualizerGains")
        renderer.equalizer(equalizer)
    }

    func prepare(track: RoomTrack, baseURL: URL) {
        let key = YouTubeIdentity.key(for: track.trackUrl)
        guard key != loadedKey, key != preparedKey, key != failedKey else { return }
        reset(); preparedKey = key; loading = true
        NativeDiagnostics.info("Audio", "Preparing track")
        let loadGeneration = generation
        loadTask = Task { [weak self] in
            guard let self else { return }
            do {
                let source: URL
                if let video = YouTubeIdentity.id(in: track.trackUrl) {
                    var components = URLComponents(url: baseURL.appendingPathComponent("search/youtube/download"), resolvingAgainstBaseURL: false)!
                    components.queryItems = [URLQueryItem(name: "videoId", value: video)]
                    source = components.url!
                } else if let url = URL(string: track.trackUrl), ["http", "https"].contains(url.scheme?.lowercased() ?? "") { source = url }
                else { throw AudioFailure.unsupported }
                var request = URLRequest(url: source); request.timeoutInterval = 120
                let (data, response) = try await NativeDiagnostics.data(for: request, using: http, operation: "Audio download")
                try Task.checkCancellation()
                guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode), !data.isEmpty else { throw AudioFailure.download }
                guard data.count < 150_000_000 else { throw AudioFailure.tooLarge }
                let decodedDuration = try await renderer.load(data: data, generation: loadGeneration)
                guard generation == loadGeneration, !Task.isCancelled else { return }
                loadedKey = key; preparedKey = nil; duration = decodedDuration
                loading = false; error = nil; onLoaded?(key, decodedDuration)
                NativeDiagnostics.info("Audio", "Track decoded; ready for playback")
            } catch is CancellationError { }
            catch {
                guard self.generation == loadGeneration, !Task.isCancelled else { return }
                loading = false; failedKey = key; preparedKey = nil
                NativeDiagnostics.failure("Audio", "Prepare track", error: error)
                self.error = "Your \(NativeDevice.name) couldn't load the audio. \(error.localizedDescription)"
                onFailure?(self.error!)
            }
        }
    }

    func follow(playing: Bool, position: Double, delay: Double, hardSeekMS: Double = 15, force: Bool = false) {
        guard playing, loadedKey != nil else { pause(); return }
        if !force, rendering, delay < 0.02, let current = renderedPosition() {
            if abs(current - position) * 1000 > hardSeekMS { correct(to: position, delay: delay) }
            return
        }
        correctionTask?.cancel(); correctionTask = nil
        let id = UUID(), currentGeneration = generation
        scheduleID = id; rendering = true
        renderer.follow(position: position, deadline: ProcessInfo.processInfo.systemUptime + max(0, delay),
                        generation: currentGeneration, scheduleID: id,
                        completion: { [weak self] message in
            Task { @MainActor [weak self] in
                guard let self, self.generation == currentGeneration, self.scheduleID == id else { return }
                if let message { self.error = message; self.rendering = false; self.onFailure?(message) }
            }
        }, ended: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self, self.generation == currentGeneration, self.scheduleID == id, self.rendering else { return }
                self.rendering = false; self.onEnded?()
            }
        })
    }

    func renderedPosition() -> Double? {
        guard rendering else { return nil }
        guard let position = renderer.position(generation: generation, scheduleID: scheduleID) else { return nil }
        return min(duration ?? .greatestFiniteMagnitude, position)
    }

    func correct(to position: Double, delay: Double) {
        guard rendering, correctionTask == nil else { return }
        correctionTask = Task { [weak self] in
            guard let self else { return }
            for step in (0...5).reversed() {
                renderer.fade(Float(step) / 5, generation: generation)
                try? await Task.sleep(for: .milliseconds(8))
                if Task.isCancelled { return }
            }
            correctionTask = nil; follow(playing: true, position: position + 0.048, delay: delay, force: true)
        }
    }
    func setVolume(_ value: Double) { renderer.volume(value) }
    func pause() {
        correctionTask?.cancel(); correctionTask = nil; scheduleID = UUID()
        rendering = false; renderer.pause(generation: generation)
        meter.reset()
    }
    func reset() {
        loadTask?.cancel(); loadTask = nil; correctionTask?.cancel(); correctionTask = nil
        generation = UUID(); scheduleID = UUID(); rendering = false
        renderer.reset(generation: generation)
        loadedKey = nil; failedKey = nil; preparedKey = nil; duration = nil; loading = false; error = nil
    }
}

private enum AudioFailure: LocalizedError {
    case unsupported, download, tooLarge
    var errorDescription: String? {
        switch self {
        case .unsupported: "This source doesn't support native playback yet."
        case .download: "The server did not return a playable audio file."
        case .tooLarge: "This audio file exceeds the download limit."
        }
    }
}
