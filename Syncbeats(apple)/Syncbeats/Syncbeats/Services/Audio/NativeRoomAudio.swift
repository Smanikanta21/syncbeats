import AVFoundation
import Foundation
import Observation
import os
#if os(macOS)
import CoreAudio
#endif

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
    private var outputVolume: Float = 1
    private var outputChannels: [NativeOutputChannels] = []
    private var outputVolumes: [String: Double] = [:]
    private var speakerMixer: NativeSpeakerMixer?
    #if os(macOS)
    private var macOutputs: MacAudioOutputs?
    private var macSpeakers: [NativeMacSpeaker] = []
    private var failedMacSpeakers: Set<String> = []
    private var reportMacOutputs: (@Sendable ([LocalAudioOutput], Bool, Bool, String?) -> Void)?
    #endif
    #if os(iOS)
    private var sessionActive = false
    private var dualRouteEnabled = false
    private var reportMobileFallback: (@Sendable () -> Void)?
    #endif
    private struct PositionSnapshot { let generation: UUID; let scheduleID: UUID; let position: Double; let uptime: Double }
    private let snapshot = OSAllocatedUnfairLock<PositionSnapshot?>(initialState: nil)
    private var positionTimer: DispatchSourceTimer?
    let meter: AudioEnergyMeter

    init(meter: AudioEnergyMeter) { self.meter = meter }

    func reset(generation: UUID) {
        queue.async { [self] in
            self.generation = generation; scheduleID = UUID()
            stopPositionSampling()
            player.stop(); engine.stop(); file = nil; meter.reset()
            #if os(macOS)
            macSpeakers.forEach { $0.reset() }
            failedMacSpeakers.removeAll()
            #endif
            #if os(iOS)
            sessionActive = false
            #endif
            snapshot.withLock { $0 = nil }
        }
    }

    func load(asset: NativeAudioFile, generation: UUID) async throws -> Double {
        try await withCheckedThrowingContinuation { continuation in
            queue.async { [self] in
                guard self.generation == generation else { continuation.resume(throwing: CancellationError()); return }
                do {
                    let decoded = try AVAudioFile(forReading: asset.url)
                    installGraph(for: decoded)
                    #if os(macOS)
                    try macSpeakers.forEach { try $0.load(asset.url) }
                    #endif
                    file = decoded
                    // iOS takes the audio session only when playback is scheduled,
                    // so browsing a paused room does not interrupt another app.
                    continuation.resume(returning: Double(decoded.length) / decoded.processingFormat.sampleRate)
                } catch { continuation.resume(throwing: error) }
            }
        }
    }

    func follow(position: Double, deadline: Double, generation: UUID, scheduleID: UUID, fadeIn: Bool,
                completion: @escaping @Sendable (String?) -> Void,
                ended: @escaping @Sendable () -> Void) {
        queue.async { [self] in
            guard self.generation == generation, let file else { return }
            self.scheduleID = scheduleID
            snapshot.withLock { $0 = nil }
            player.stop(); player.volume = fadeIn ? 0 : 1; meter.reset()
            #if os(macOS)
            macSpeakers.forEach { $0.stopPlayer() }
            #endif
            do { try startOutput() }
            catch { completion(error.localizedDescription); return }
            self.scheduleID = scheduleID // A route fallback can replace the graph while starting.
            setPlayerGain(fadeIn ? 0 : 1)
            #if os(macOS)
            let speakers = startMacSpeakers()
            let primaryLatency = speakers.isEmpty ? 0 : engine.outputNode.presentationLatency
            let portOffsets = speakers.map { primaryLatency - $0.latency }
            let lead = speakers.isEmpty ? 0 : max(0, -(portOffsets.min() ?? 0)) + 0.015
            #else
            let lead = 0.0
            #endif
            let rate = file.processingFormat.sampleRate
            // Background delivery can lag. Position belongs to the requested
            // deadline, so advance it by any time spent waiting for this worker.
            let now = ProcessInfo.processInfo.systemUptime
            let delay = max(lead, deadline - now)
            let adjustedPosition = position + max(0, now + delay - deadline)
            let frame = min(max(0, AVAudioFramePosition(adjustedPosition * rate)), max(0, file.length - 1))
            let count = AVAudioFrameCount(min(Int64(UInt32.max), file.length - frame))
            segmentStart = Double(frame) / rate
            player.scheduleSegment(file, startingFrame: frame, frameCount: count, at: nil, completionCallbackType: .dataPlayedBack) { [weak self] _ in
                guard let self else { return }
                self.queue.async {
                    guard self.generation == generation, self.scheduleID == scheduleID else { return }
                    self.stopPositionSampling(); self.engine.pause(); self.meter.reset(); ended()
                    #if os(macOS)
                    self.macSpeakers.forEach { $0.pause() }
                    #endif
                }
            }
            let hostNow = mach_absolute_time()
            let host = hostNow + AVAudioTime.hostTime(forSeconds: delay)
            #if os(macOS)
            for (speaker, offset) in zip(speakers, portOffsets) {
                let speakerTime = hostNow + AVAudioTime.hostTime(forSeconds: max(0.015, delay + offset))
                speaker.schedule(frame: frame, count: count, hostTime: speakerTime)
            }
            #endif
            player.play(at: AVAudioTime(hostTime: host)); startPositionSampling(); completion(nil)
            if fadeIn {
                for step in 1...6 {
                    queue.asyncAfter(deadline: .now() + delay + Double(step) * 0.008) { [self] in
                        guard self.generation == generation, self.scheduleID == scheduleID else { return }
                        setPlayerGain(Float(step) / 6)
                    }
                }
            }
        }
    }

    private func samplePosition() {
        guard player.isPlaying, let time = player.lastRenderTime,
              let rendered = player.playerTime(forNodeTime: time), rendered.sampleTime >= 0 else { return }
        // sampleTime describes lastRenderTime, not the moment this timer fires.
        // Dating it as "now" creates false drift on coalesced background timers.
        let hostNow = mach_absolute_time()
        guard time.isHostTimeValid else { return }
        // Core Audio can provide the upcoming render quantum's host time.
        let age = hostNow >= time.hostTime
            ? AVAudioTime.seconds(forHostTime: hostNow - time.hostTime)
            : -AVAudioTime.seconds(forHostTime: time.hostTime - hostNow)
        let value = PositionSnapshot(generation: generation, scheduleID: scheduleID,
            position: segmentStart + Double(rendered.sampleTime) / rendered.sampleRate,
            uptime: ProcessInfo.processInfo.systemUptime - age)
        snapshot.withLock { $0 = value }
    }
    private func startPositionSampling() {
        guard positionTimer == nil else { return }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(40))
        timer.setEventHandler { [weak self] in self?.samplePosition() }
        positionTimer = timer; timer.resume()
    }
    private func stopPositionSampling() {
        positionTimer?.cancel(); positionTimer = nil
    }
    private func installGraph(for file: AVAudioFile) {
        if player.engine == nil { engine.attach(player) }
        if equalizerNode.engine == nil { engine.attach(equalizerNode) }
        engine.disconnectNodeOutput(player)
        engine.disconnectNodeOutput(equalizerNode)
        engine.connect(player, to: equalizerNode, format: file.processingFormat)
        engine.connect(equalizerNode, to: engine.mainMixerNode, format: file.processingFormat)
        applyOutputVolumes()
        applyEqualizer()
        installMeterTap()
        engine.prepare()
    }

    private func installMeterTap() {
        guard !tapInstalled else { return }
        let meter = self.meter
        engine.mainMixerNode.installTap(onBus: 0, bufferSize: 2048, format: nil) { buffer, _ in meter.consume(buffer) }
        tapInstalled = true
    }

    private func removeMeterTap() {
        guard tapInstalled else { return }
        engine.mainMixerNode.removeTap(onBus: 0)
        tapInstalled = false
    }

    private func replaceEngine(with next: AVAudioEngine) {
        scheduleID = UUID()
        stopPositionSampling()
        player.stop()
        engine.stop()
        removeMeterTap()
        engine = next
        speakerMixer = nil
        player = AVAudioPlayerNode()
        equalizerNode = AVAudioUnitEQ(numberOfBands: NativeEqualizer.frequencies.count)
        meter.reset()
        snapshot.withLock { $0 = nil }
        if let file { installGraph(for: file) }
    }

    #if os(macOS)
    func watchOutputs(_ report: @escaping @Sendable ([LocalAudioOutput], Bool, Bool, String?) -> Void) {
        queue.async { [self] in
            reportMacOutputs = report
            macOutputs = MacAudioOutputs(queue: queue) { [weak self] in self?.refreshMacOutputs() }
            refreshMacOutputs()
        }
    }

    func selectMacOutputs(toggling id: String?) {
        queue.async { [self] in
            guard let macOutputs else { return }
            var selection = macOutputs.selection
            if let id {
                let devices = macOutputs.devices()
                guard devices.contains(where: { $0.uid == id && $0.canSelect }) else { return }
                if selection.isEmpty {
                    selection = macOutputs.outputs(devices).filter { $0.canSelect && $0.output.selected }.map(\.id)
                }
                if selection.contains(id) { selection.removeAll { $0 == id } }
                else { selection.append(id) }
            } else {
                selection = []
            }
            refreshMacOutputs(selection)
        }
    }

    private func refreshMacOutputs(_ selection: [String]? = nil) {
        guard let macOutputs else { return }
        let devices = macOutputs.devices()
        let prior = macOutputs.boundDevice
        var rebuilt = false
        func bind(_ members: [MacAudioOutputs.Device], _ fallback: NativeOutputChannels?) throws {
            let next = AVAudioEngine()
            if let primary = members.first { try NativeMacSpeaker.engine(next, select: primary.id) }
            let additional = try members.dropFirst().map { device in
                let speaker = try NativeMacSpeaker(device: device)
                if let file { try speaker.load(file.url) }
                return speaker
            }
            macSpeakers.forEach { $0.reset() }
            macSpeakers = additional
            failedMacSpeakers.removeAll()
            let channels = members.isEmpty ? fallback : members.first?.volumeChannels
            outputChannels = channels.map { [$0] } ?? []
            replaceEngine(with: next)
            rebuilt = true
        }
        var message: String?
        do {
            try macOutputs.select(selection ?? macOutputs.selection, from: devices) { members, fallback in
                // An untouched engine is already following the system output.
                if prior != nil || !members.isEmpty { try bind(members, fallback) }
                else { outputChannels = fallback.map { [$0] } ?? []; applyOutputVolumes() }
            }
        } catch {
            message = "SyncBeats couldn’t use that audio output."
            if !Set(macOutputs.boundMembers).isSubset(of: Set(devices.map(\.id))) {
                try? macOutputs.select([], from: devices, bind: bind)
            }
        }
        reportMacOutputs?(macOutputs.outputs(devices), macOutputs.selection.isEmpty, rebuilt, message)
    }

    private func startMacSpeakers() -> [NativeMacSpeaker] {
        let hadFailures = !failedMacSpeakers.isEmpty
        let active = macSpeakers.filter { speaker in
            guard !failedMacSpeakers.contains(speaker.device.uid) else { return false }
            do {
                try speaker.start()
                return true
            } catch {
                failedMacSpeakers.insert(speaker.device.uid)
                Task { @MainActor in NativeDiagnostics.failure("Audio", "Start additional Mac output", error: error) }
                return false
            }
        }
        if !hadFailures, let failed = macSpeakers.first(where: { failedMacSpeakers.contains($0.device.uid) }),
           let macOutputs {
            reportMacOutputs?(macOutputs.outputs(macOutputs.devices()), false, false,
                              "Couldn’t start \(failed.device.name). Reconnect it and try again.")
        }
        return active
    }

    func stopWatchingOutputs() {
        queue.async { [self] in
            guard let macOutputs else { return }
            outputChannels = []
            macSpeakers.forEach { $0.reset() }
            macSpeakers = []
            failedMacSpeakers.removeAll()
            if !macOutputs.selection.isEmpty { replaceEngine(with: AVAudioEngine()) }
            else { applyOutputVolumes() }
            self.macOutputs = nil
            reportMacOutputs = nil
        }
    }
    #endif

    #if os(iOS)
    func setDualRoute(_ enabled: Bool, onFallback: @escaping @Sendable () -> Void) {
        queue.async { [self] in
            dualRouteEnabled = enabled
            reportMobileFallback = onFallback
            sessionActive = false
            replaceEngine(with: AVAudioEngine())
        }
    }
    #endif

    private func startOutput() throws {
        try activateOutput()
        guard !engine.isRunning else { return }
        do {
            try startEngine()
        } catch {
            #if os(macOS)
            guard let macOutputs, !macOutputs.selection.isEmpty else { throw error }
            let devices = macOutputs.devices()
            try macOutputs.select([], from: devices) { _, fallback in
                outputChannels = fallback.map { [$0] } ?? []
                macSpeakers.forEach { $0.reset() }
                macSpeakers = []
                failedMacSpeakers.removeAll()
                replaceEngine(with: AVAudioEngine())
            }
            reportMacOutputs?(macOutputs.outputs(devices), true, false,
                              "SyncBeats switched to the system output after the selected outputs failed to start.")
            try startEngine()
            #else
            throw error
            #endif
        }
    }

    private func startEngine() throws {
        if outputChannels.count > 1 && speakerMixer == nil {
            engine.stop()
            removeMeterTap()
            speakerMixer = try NativeSpeakerMixer(engine: engine, outputs: outputChannels)
            installMeterTap()
        }
        try engine.start()
        try speakerMixer?.configure()
        applyOutputVolumes()
    }

    private func applyOutputVolumes() {
        let gain = outputChannels.count == 1 ? Float((outputVolumes[outputChannels[0].id] ?? 100) / 100) : 1
        engine.mainMixerNode.outputVolume = outputVolume * gain
        speakerMixer?.setVolumes(outputVolumes)
        #if os(macOS)
        for speaker in macSpeakers {
            speaker.volume(outputVolume * Float((outputVolumes[speaker.device.uid] ?? 100) / 100))
        }
        #endif
    }

    func setOutputVolumes(_ volumes: [String: Double], for id: String) {
        queue.async { [self] in
            outputVolumes = volumes
            #if os(macOS)
            if let macOutputs, macOutputs.selection.isEmpty, outputChannels.isEmpty {
                // Use an app-managed aggregate when adjusting a member of an OS multi-output device.
                let active = macOutputs.outputs(macOutputs.devices()).filter { $0.canSelect && $0.output.selected }
                if active.count > 1, active.contains(where: { $0.id == id }) {
                    refreshMacOutputs(active.map(\.id))
                }
            }
            #endif
            applyOutputVolumes()
        }
    }

    private func activateOutput() throws {
        #if os(iOS)
        guard !sessionActive else { return }
        let session = AVAudioSession.sharedInstance()
        if #available(iOS 26.2, *), dualRouteEnabled {
            do {
                try session.setCategory(.multiRoute, mode: .dualRoute, options: [.allowBluetoothHFP])
                try session.setActive(true)
                let channels = MobileAudioOutputs.channels()
                guard channels.count > 1 else { throw AudioOutputFailure.unavailable }
                if speakerMixer != nil && outputChannels != channels { replaceEngine(with: AVAudioEngine()) }
                outputChannels = channels
                try startEngine()
                sessionActive = true
                return
            } catch {
                dualRouteEnabled = false
                reportMobileFallback?()
                replaceEngine(with: AVAudioEngine())
            }
        }
        try session.setCategory(.playback, mode: .default, policy: .longFormAudio)
        try session.setActive(true)
        outputChannels = MobileAudioOutputs.channels()
        sessionActive = true
        #endif
    }
    func rebuildOutput() {
        queue.async { [self] in
            let next = AVAudioEngine()
            #if os(macOS)
            if let macOutputs, !macOutputs.selection.isEmpty, let id = macOutputs.boundDevice {
                try? next.outputNode.auAudioUnit.setDeviceID(id)
            }
            #endif
            replaceEngine(with: next)
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
    func position(generation: UUID, scheduleID: UUID, maxSampleAge: TimeInterval = .infinity) -> Double? {
        let now = ProcessInfo.processInfo.systemUptime
        guard let value = snapshot.withLock({ $0 }), value.generation == generation, value.scheduleID == scheduleID,
              now - value.uptime <= maxSampleAge else { return nil }
        return max(0, value.position + now - value.uptime)
    }
    func volume(_ value: Double) {
        queue.async { [self] in
            outputVolume = Float(min(100, max(0, value)) / 100)
            applyOutputVolumes()
        }
    }
    func fade(_ value: Float, generation: UUID) { queue.async { [self] in if self.generation == generation { setPlayerGain(value) } } }
    private func setPlayerGain(_ value: Float) {
        player.volume = value
        #if os(macOS)
        macSpeakers.forEach { $0.fade(value) }
        #endif
    }
    func equalizer(_ settings: NativeEqualizer) {
        queue.async { [self] in equalizerSettings = settings; applyEqualizer() }
    }
    private func applyEqualizer() {
        equalizerSettings.apply(to: equalizerNode)
        #if os(macOS)
        macSpeakers.forEach { equalizerSettings.apply(to: $0.equalizer) }
        #endif
    }
    func pause(generation: UUID) {
        queue.async { [self] in
            guard self.generation == generation else { return }
            stopPositionSampling()
            scheduleID = UUID(); player.stop(); engine.pause(); player.volume = 1; meter.reset()
            #if os(macOS)
            macSpeakers.forEach { $0.pause() }
            failedMacSpeakers.removeAll()
            #endif
            snapshot.withLock { $0 = nil }
        }
    }
}

@MainActor @Observable
final class NativeRoomAudio {
    private(set) var outputs: [LocalAudioOutput] = []
    private(set) var outputError: String?
    private(set) var usesSystemOutput = true
    private(set) var dualRouteEnabled = false
    @ObservationIgnored var onOutputsChanged: (@MainActor (Bool) -> Void)?
    @ObservationIgnored private var outputMonitorID = UUID()
    @ObservationIgnored private var outputIDs: [String: String] = [:]
    private var outputVolumes: [String: Double] = [:]
    #if os(iOS)
    @ObservationIgnored private var routeObserver: NSObjectProtocol?
    @ObservationIgnored private var dualRouteRequestID = UUID()
    #endif

    func startMonitoringOutputs() {
        let monitorID = outputMonitorID
        #if os(macOS)
        renderer.watchOutputs { [weak self] outputs, usesSystemOutput, rebuilt, message in
            Task { @MainActor [weak self] in
                guard let self, self.outputMonitorID == monitorID else { return }
                if let message { self.outputError = message }
                self.usesSystemOutput = usesSystemOutput
                self.updateOutputs(outputs, reschedule: rebuilt)
            }
        }
        #elseif os(iOS)
        updateOutputs(MobileAudioOutputs.current())
        routeObserver = NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification,
                                                               object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self, self.outputMonitorID == monitorID else { return }
                self.updateOutputs(MobileAudioOutputs.current())
            }
        }
        #endif
    }

    func stopMonitoringOutputs() {
        outputMonitorID = UUID()
        onOutputsChanged = nil
        outputs = []
        outputError = nil
        usesSystemOutput = true
        #if os(macOS)
        renderer.stopWatchingOutputs()
        #elseif os(iOS)
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
        routeObserver = nil
        if dualRouteEnabled { selectDualRoute(false) }
        #endif
    }

    private func updateOutputs(_ outputs: [LocalAudioOutput], reschedule: Bool = false) {
        let updated = outputs.map { item in
            guard item.canSetVolume else { return item }
            if outputIDs[item.id] == nil { outputIDs[item.id] = UUID().uuidString }
            var output = item.output
            output.id = outputIDs[item.id]
            output.volume = outputVolumes[item.id] ?? 100
            return LocalAudioOutput(id: item.id, output: output, canSelect: item.canSelect, canSetVolume: item.canSetVolume)
        }
        guard self.outputs != updated || reschedule else { return }
        self.outputs = updated
        onOutputsChanged?(reschedule)
    }

    func setOutputVolume(_ value: Double, outputID: String) {
        guard value.isFinite, let index = outputs.firstIndex(where: { $0.output.id == outputID && $0.canSetVolume }) else { return }
        let volume = min(100, max(0, value.rounded()))
        let item = outputs[index]
        guard item.output.volume != volume else { return }
        outputVolumes[item.id] = volume
        renderer.setOutputVolumes(outputVolumes, for: item.id)
        updateOutputs(outputs)
    }

    #if os(macOS)
    func chooseOutput(_ id: String?) {
        outputError = nil
        renderer.selectMacOutputs(toggling: id)
    }
    #elseif os(iOS)
    func selectDualRoute(_ enabled: Bool) {
        guard dualRouteEnabled != enabled else { return }
        let requestID = UUID()
        dualRouteRequestID = requestID
        outputError = nil
        dualRouteEnabled = enabled
        renderer.setDualRoute(enabled) { [weak self] in
            Task { @MainActor [weak self] in
                guard let self, self.dualRouteRequestID == requestID, self.dualRouteEnabled else { return }
                self.dualRouteEnabled = false
                self.outputError = "Dual output is unavailable for this audio route."
                self.updateOutputs(MobileAudioOutputs.current())
            }
        }
        onOutputsChanged?(true)
    }
    #endif

    private(set) var equalizer: NativeEqualizer
    private(set) var loadedKey: String?
    private(set) var failedKey: String?
    private(set) var duration: Double?
    private(set) var loading = false
    private(set) var error: String?
    private(set) var rendering = false
    private(set) var completed = false
    @ObservationIgnored private(set) var correctionCount = 0
    @ObservationIgnored private(set) var lastCorrectionMS = 0.0
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
    @ObservationIgnored private let downloads = NativeAudioPrefetch()
    func configureHybrid(_ relay: NativeHybridRelay) { relay.configureCache(downloads) }
    @ObservationIgnored private var prefetchKey: String?
    @ObservationIgnored private var prefetchTask: Task<Void, Never>?
    func prefetch(track: RoomTrack?, baseURL: URL) {
        guard let track else { prefetchKey = nil; return }
        let key = baseURL.absoluteString + YouTubeIdentity.key(for: track.trackUrl)
        guard key != prefetchKey else { return }
        prefetchKey = key
        prefetchTask?.cancel()
        prefetchTask = Task {
            guard !Task.isCancelled else { return }
            guard let request = try? NativeAudioPrefetch.request(track: track, baseURL: baseURL) else { return }
            _ = try? await downloads.file(for: request, using: http, speculative: true, trackKey: YouTubeIdentity.key(for: track.trackUrl))
        }
    }
    func clearPrefetch() { prefetchTask?.cancel(); prefetchTask = nil; prefetchKey = nil; Task { await downloads.clear() } }
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
            #if os(iOS)
            let backgroundWork = NativeBackgroundAudioWork { [weak self] in
                guard let self, self.generation == loadGeneration else { return }
                self.reset()
                self.error = "Open SyncBeats to finish preparing audio."
            }
            defer { backgroundWork.end() }
            #endif
            do {
                let request = try NativeAudioPrefetch.request(track: track, baseURL: baseURL)
                let asset = try await downloads.file(for: request, using: http, trackKey: key)
                try Task.checkCancellation()
                let decodedDuration = try await renderer.load(asset: asset, generation: loadGeneration)
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

    func follow(playing: Bool, position: Double, delay: Double, hardSeekMS: Double = 15, force: Bool = false, fadeIn: Bool = false) {
        guard playing, loadedKey != nil else { pause(); return }
        // A drift tick must not restart an exhausted segment while the server advances.
        guard !completed || force else { return }
        if !force, rendering {
            // A scheduled graph can take time to start publishing render timestamps.
            guard delay < 0.02, let current = renderedPosition() else { return }
            if abs(current - position) * 1000 > hardSeekMS {
                if correctionTask == nil { lastCorrectionMS = (current - position) * 1000 }
                correct(to: position, delay: delay)
            }
            return
        }
        correctionTask?.cancel(); correctionTask = nil
        let id = UUID(), currentGeneration = generation
        scheduleID = id; rendering = true; completed = false
        NativeDiagnostics.info("Playback", "Scheduling audio at \(String(format: "%.2f", position))s; delay \(Int(delay * 1000))ms")
        renderer.follow(position: position, deadline: ProcessInfo.processInfo.systemUptime + max(0, delay),
                        generation: currentGeneration, scheduleID: id, fadeIn: fadeIn,
                        completion: { [weak self] message in
            Task { @MainActor [weak self] in
                guard let self, self.generation == currentGeneration, self.scheduleID == id else { return }
                if let message {
                    NativeDiagnostics.info("Playback", "Audio scheduling failed")
                    self.error = message; self.rendering = false; self.onFailure?(message)
                }
            }
        }, ended: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self, self.generation == currentGeneration, self.scheduleID == id, self.rendering else { return }
                self.rendering = false; self.completed = true
                NativeDiagnostics.info("Playback", "Audio segment completed; awaiting room transition")
                self.onEnded?()
            }
        })
    }

    func renderedPosition(maxSampleAge: TimeInterval = .infinity) -> Double? {
        guard rendering else { return nil }
        guard let position = renderer.position(generation: generation, scheduleID: scheduleID, maxSampleAge: maxSampleAge) else { return nil }
        return min(duration ?? .greatestFiniteMagnitude, position)
    }

    func correct(to position: Double, delay: Double) {
        guard rendering, correctionTask == nil else { return }
        correctionCount += 1
        let deadline = ProcessInfo.processInfo.systemUptime + max(0, delay)
        correctionTask = Task { [weak self] in
            guard let self else { return }
            for step in (0...5).reversed() {
                renderer.fade(Float(step) / 5, generation: generation)
                try? await Task.sleep(for: .milliseconds(8))
                if Task.isCancelled { return }
            }
            let now = ProcessInfo.processInfo.systemUptime
            correctionTask = nil
            follow(playing: true, position: position + max(0, now - deadline),
                   delay: max(0, deadline - now), force: true, fadeIn: true)
        }
    }
    func setVolume(_ value: Double) { renderer.volume(value) }
    func pause() {
        guard rendering || correctionTask != nil else { return }
        correctionTask?.cancel(); correctionTask = nil; scheduleID = UUID()
        rendering = false; renderer.pause(generation: generation)
        meter.reset()
    }
    func reset() {
        loadTask?.cancel(); loadTask = nil; correctionTask?.cancel(); correctionTask = nil
        generation = UUID(); scheduleID = UUID(); rendering = false; completed = false
        correctionCount = 0; lastCorrectionMS = 0
        renderer.reset(generation: generation)
        loadedKey = nil; failedKey = nil; preparedKey = nil; duration = nil; loading = false; error = nil
    }
}

enum AudioFailure: LocalizedError {
    case unsupported, download, tooLarge
    var errorDescription: String? {
        switch self {
        case .unsupported: "This source doesn't support native playback yet."
        case .download: "The server did not return a playable audio file."
        case .tooLarge: "This audio file exceeds the download limit."
        }
    }
}
