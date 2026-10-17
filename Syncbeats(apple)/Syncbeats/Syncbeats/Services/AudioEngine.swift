import Foundation
import AVFoundation
import Combine
import os
import Accelerate

/// The native Mac Audio Engine.
/// This downloads tracks locally to a cache, and uses AVAudioEngine for precise,
/// sample-accurate playback scheduling based on the NTP-synchronized clock.
@MainActor
final class AudioEngine: ObservableObject {
    static let shared = AudioEngine()

    @Published private(set) var isDownloading = false
    @Published private(set) var downloadProgress: Double = 0.0
    @Published private(set) var currentDuration: Double = 0.0

    /// Live post-mix loudness, 0…1, smoothed with a fast-attack/slow-release
    /// envelope. Written from the render-thread tap and read from the UI, so it
    /// lives behind a lock rather than `@Published` — it changes ~40×/s and must
    /// not hop the main actor per audio buffer. The room's ambient bloom reads
    /// this to pulse with the beat.
    nonisolated private let levelLock = OSAllocatedUnfairLock(initialState: 0.0)
    nonisolated var level: Double { levelLock.withLock { $0 } }

    /// Live per-band energy (bass / mid / treble), each 0…1, auto-gained and
    /// smoothed with the same fast-attack/slow-release envelope as `level`. This
    /// is what the web app's spatial visualiser reacts to — one colored light per
    /// band — so the native `AmbientField` reads it the same way. Same
    /// render-thread-writes / UI-reads split as `level`, hence the lock.
    nonisolated private let bandsLock = OSAllocatedUnfairLock(initialState: AudioBands())
    nonisolated var bands: AudioBands { bandsLock.withLock { $0 } }

    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    
    #if os(macOS)
    private var secondaryDecks: [AudioDeviceID: PlaybackDeck] = [:]
    #endif
    
    private var bag = Set<AnyCancellable>()
    private var prepareTask: Task<Void, Never>?
    private var playbackEndedTask: Task<Void, Never>?

    private var currentFile: AVAudioFile?
    private var currentTrackId: String?
    
    /// True when an audio file is loaded and ready to play (used by RoomManager for readiness check).
    var hasAudioFileLoaded: Bool { currentFile != nil }

    private init() {
        #if DEBUG
        Self._selfCheckEnvelope()
        FFTAnalyzer._selfCheck()
        #endif
        setupEngine()
        bindToRoom()
    }

    private func setupEngine() {
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: nil)

        do {
            try engine.start()
            installLevelTap()
        } catch {
            print("Failed to start AVAudioEngine: \(error.localizedDescription)")
        }
    }

    // MARK: - Level metering (drives the ambient field)

    /// Meter the post-mix output so the room's ambient field can pulse with the
    /// beat: broadband RMS for the overall `level`, plus a small FFT splitting the
    /// signal into bass/mid/treble so each colored light reacts to its own band —
    /// mirroring the web visualiser.
    private func installLevelTap() {
        let lock = levelLock
        let bandsLock = self.bandsLock
        let analyzer = FFTAnalyzer()
        engine.mainMixerNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { buffer, _ in
            guard let data = buffer.floatChannelData else { return }
            let channels = Int(buffer.format.channelCount)
            let frames = Int(buffer.frameLength)
            guard frames > 0, channels > 0 else { return }

            var sumSquares: Float = 0
            for c in 0..<channels {
                let samples = data[c]
                for i in 0..<frames { sumSquares += samples[i] * samples[i] }
            }
            let rms = (sumSquares / Float(frames * channels)).squareRoot()

            // ponytail: fixed gain 6 maps typical music RMS into 0…1 — the one knob
            // to turn if the pulse is too weak or clips flat. Perceived loudness
            // varies by track and output device, so this stays tunable, not derived.
            let target = min(1.0, Double(rms) * 6.0)
            lock.withLock { $0 = AudioEngine.follow($0, toward: target) }

            if let b = analyzer.analyze(buffer) {
                bandsLock.withLock { st in
                    st.bass = AudioEngine.follow(st.bass, toward: b.bass)
                    st.mid = AudioEngine.follow(st.mid, toward: b.mid)
                    st.treble = AudioEngine.follow(st.treble, toward: b.treble)
                }
            }
        }
    }

    /// Peak-follower: jumps straight up to a louder buffer, eases down from a
    /// quieter one. Fast attack pins the pulse to the beat; slow release stops
    /// it flickering between buffers.
    nonisolated static func follow(_ level: Double, toward target: Double) -> Double {
        target > level ? target : level * 0.9 + target * 0.1
    }

    #if DEBUG
    nonisolated static func _selfCheckEnvelope() {
        assert(follow(0, toward: 1) == 1, "attack should be instant")
        let released = follow(1, toward: 0)
        assert(released > 0.5 && released < 1, "release should be gradual")
        assert(follow(released, toward: 0) < released, "release should keep decaying")
    }
    #endif

    private func bindToRoom() {
        let room = RoomManager.shared
        
        // Listen for track changes to download and prepare audio
        room.$currentTrack
            .removeDuplicates()
            .sink { [weak self] track in
                guard let self = self else { return }
                
                if let track = track {
                    if self.currentTrackId != track.id {
                        self.currentTrackId = track.id
                        self.downloadAndPrepare(track: track)
                    } else if self.currentFile != nil {
                        // We already have this track prepared, but the server might have reset our readiness (e.g. on reconnect/join).
                        RoomManager.shared.emitClientReady(trackUrl: track.trackUrl)
                    }
                } else {
                    self.stopPlayback()
                }
            }
            .store(in: &bag)

        // The notch island shows one download bar for the track it's waiting on, so
        // mirror just that track's entry out of the cache's per-track table. Songs
        // the user is pre-downloading from the queue don't hijack the island.
        Publishers.CombineLatest(room.$currentTrack, TrackCache.shared.$states)
            .sink { [weak self] track, states in
                guard let self else { return }
                let state = track.flatMap { states[TrackCache.identityKey($0.trackUrl)] }
                if case .some(.downloading(let progress)) = state {
                    self.isDownloading = true
                    self.downloadProgress = progress
                } else {
                    self.isDownloading = false
                }
            }
            .store(in: &bag)

        // Listen for play/pause state changes
        Publishers.CombineLatest3(
            room.$isPlaying.removeDuplicates(),
            room.$startEpoch.removeDuplicates(),
            room.$pauseOffset.removeDuplicates()
        )
        .sink { [weak self] isPlaying, startEpoch, pauseOffset in
            self?.syncPlaybackState(isPlaying: isPlaying, startEpoch: startEpoch, pauseOffset: pauseOffset)
        }
        .store(in: &bag)
            
        // Listen for hardware topology changes (e.g., connecting a Bluetooth speaker)
        // AVAudioEngine halts itself when the OS audio route changes.
        NotificationCenter.default.publisher(for: .AVAudioEngineConfigurationChange, object: engine)
            .sink { [weak self] _ in
                guard let self = self else { return }
                print("AudioEngine: Configuration changed (route change), restarting engine...")
                if !self.engine.isRunning {
                    do {
                        try self.engine.start()
                        let room = RoomManager.shared
                        self.syncPlaybackState(isPlaying: room.isPlaying, startEpoch: room.startEpoch, pauseOffset: room.pauseOffset)
                    } catch {
                        print("AudioEngine: Failed to restart engine after route change: \(error)")
                    }
                }
            }
            .store(in: &bag)
            
        #if os(macOS)
        // Listen for user enabling/disabling secondary speakers
        DeviceManager.shared.$activeSecondaryDevices
            .removeDuplicates()
            .sink { [weak self] activeDevices in
                guard let self = self else { return }
                
                // Remove decks that are no longer active
                for id in self.secondaryDecks.keys where activeDevices[id] == nil {
                    self.secondaryDecks[id]?.stop()
                    self.secondaryDecks[id] = nil
                }
                
                // Add new decks for newly active IDs, or update existing ones
                for (id, latency) in activeDevices {
                    if let existingDeck = self.secondaryDecks[id] {
                        if abs(existingDeck.latencyOffsetMs - latency) > 1.0 { // 1ms threshold
                            existingDeck.latencyOffsetMs = latency
                            // Resync this specific deck if we're currently playing
                            if RoomManager.shared.isPlaying, let file = self.currentFile {
                                existingDeck.syncPlaybackState(file: file, isPlaying: true, startEpoch: RoomManager.shared.startEpoch, pauseOffset: RoomManager.shared.pauseOffset)
                            }
                        }
                    } else {
                        self.secondaryDecks[id] = PlaybackDeck(deviceId: id, latencyOffsetMs: latency)
                    }
                }
                
                // Pin main engine appropriately
                if let outputUnit = self.engine.outputNode.audioUnit {
                    var targetId: AudioDeviceID = DeviceManager.shared.getDefaultOutputDeviceID()
                    if !activeDevices.isEmpty, let builtInId = DeviceManager.shared.getBuiltInSpeakerID() {
                        targetId = builtInId
                    }
                    
                    if targetId != 0 {
                        let wasRunning = self.engine.isRunning
                        if wasRunning { self.engine.stop() }
                        
                        AudioUnitSetProperty(
                            outputUnit,
                            kAudioOutputUnitProperty_CurrentDevice,
                            kAudioUnitScope_Global,
                            0,
                            &targetId,
                            UInt32(MemoryLayout<AudioDeviceID>.size)
                        )
                        
                        if wasRunning {
                            do {
                                try self.engine.start()
                            } catch {
                                print("Failed to restart main engine after device switch: \(error.localizedDescription)")
                            }
                        }
                    }
                }
                
                // If we are currently playing, sync newly created decks immediately
                let room = RoomManager.shared
                if room.isPlaying, let file = self.currentFile {
                    for (id, deck) in self.secondaryDecks {
                        // Only sync if it was just created (latency matches exactly and it might not be playing yet)
                        // Actually, to be safe, just ensure all are playing if they aren't
                        if !deck.playerNode.isPlaying {
                            deck.syncPlaybackState(file: file, isPlaying: true, startEpoch: room.startEpoch, pauseOffset: room.pauseOffset)
                        }
                    }
                }
            }
            .store(in: &bag)
        #endif
    }
    
    #if os(macOS)
    public func setSecondaryVolume(_ volume: Float, for deviceId: AudioDeviceID) {
        secondaryDecks[deviceId]?.playerNode.volume = volume
    }
    
    public func getSecondaryVolume(for deviceId: AudioDeviceID) -> Float {
        return secondaryDecks[deviceId]?.playerNode.volume ?? 1.0
    }
    
    public var mainVolume: Float {
        get { playerNode.volume }
        set { playerNode.volume = newValue }
    }
    #endif

    // MARK: - Download & Cache

    /// Hand off to `TrackCache` — it owns the cache directory, dedupes concurrent
    /// fetches and reports progress. A track the user already downloaded (or that
    /// "Download All" grabbed ahead of time) is loaded straight off disk.
    private func downloadAndPrepare(track: QueueItem) {
        prepareTask?.cancel()
        playerNode.stop()
        currentFile = nil

        if let local = TrackCache.shared.localFile(for: track) {
            prepareAudioFile(at: local, track: track)
            return
        }

        prepareTask = Task { [weak self] in
            let started = Date()
            let url = await TrackCache.shared.download(track)
            guard !Task.isCancelled, let self, let url else { return }
            self.prepareAudioFile(at: url, track: track)
            print("AudioEngine: ready in \(String(format: "%.2f", Date().timeIntervalSince(started)))s")
        }
    }

    private func prepareAudioFile(at url: URL, track: QueueItem) {
        do {
            let file = try AVAudioFile(forReading: url)
            self.currentFile = file
            self.currentDuration = Double(file.length) / file.processingFormat.sampleRate

            let room = RoomManager.shared

            // Tell the server we are ready so it can schedule playback immediately
            room.emitClientReady(trackUrl: track.trackUrl)

            // Re-sync immediately if we should be playing
            syncPlaybackState(isPlaying: room.isPlaying, startEpoch: room.startEpoch, pauseOffset: room.pauseOffset)
        } catch {
            print("Failed to read audio file: \(error.localizedDescription)")
            // Purge the corrupted file so it redownloads next time.
            TrackCache.shared.invalidate(track.trackUrl)
        }
    }

    // MARK: - Playback Synchronization

    private func syncPlaybackState(isPlaying: Bool, startEpoch: Double?, pauseOffset: Double) {
        guard let file = currentFile else { return }
        
        playbackEndedTask?.cancel()
        
        if playerNode.isPlaying { playerNode.stop() }
        #if os(macOS)
        secondaryDecks.values.forEach { $0.stop() }
        #endif
        
        if isPlaying, let epoch = startEpoch {
            // Hardware interruptions (like sleep or plugging in headphones) stop the engine.
            if !engine.isRunning {
                do {
                    try engine.start()
                } catch {
                    print("AudioEngine: Could not start engine for playback: \(error)")
                    return
                }
            }
            
            // Calculate NTP-synchronized precise playback position
            let now = SyncClock.nowMs()
            let expectedPositionMs = (now - epoch) + pauseOffset
            let expectedPositionSec = max(0, expectedPositionMs / 1000.0)
            
            let sampleRate = file.processingFormat.sampleRate
            let startFrame = AVAudioFramePosition(expectedPositionSec * sampleRate)
            
            guard startFrame < file.length else { return }
            let frameCount = AVAudioFrameCount(file.length - startFrame)
            
            guard frameCount > 0 else { return }
            
            playerNode.stop() // Safely clear schedule immediately before scheduling
            
            playerNode.scheduleSegment(
                file,
                startingFrame: startFrame,
                frameCount: frameCount,
                at: nil,
                completionHandler: nil
            )
            
            if engine.isRunning {
                playerNode.play()
                
                playbackEndedTask?.cancel()
                let timeRemaining = Double(frameCount) / sampleRate
                let expectedTrackUrl = RoomManager.shared.currentTrack?.trackUrl
                
                playbackEndedTask = Task {
                    // Sleep until the exact moment it ends
                    try? await Task.sleep(nanoseconds: UInt64(timeRemaining * 1_000_000_000))
                    
                    guard !Task.isCancelled else { return }
                    
                    let room = RoomManager.shared
                    if room.isPlaying, let currentTrack = room.currentTrack, currentTrack.trackUrl == expectedTrackUrl {
                        print("AudioEngine: Reached end of file naturally, emitting playback:ended")
                        room.emitPlaybackEnded(trackUrl: currentTrack.trackUrl)
                    }
                }
            } else {
                print("Main AudioEngine: Skipping play() because engine failed to start.")
            }
            
            #if os(macOS)
            for deck in secondaryDecks.values {
                deck.syncPlaybackState(file: file, isPlaying: true, startEpoch: startEpoch, pauseOffset: pauseOffset)
            }
            #endif
        }
    }
    
    private func stopPlayback() {
        prepareTask?.cancel()
        playerNode.stop()
        #if os(macOS)
        secondaryDecks.values.forEach { $0.stop() }
        #endif
        isDownloading = false
        currentFile = nil
        currentTrackId = nil
    }
}

// MARK: - Audio Visualizer Types

public struct AudioBands: Equatable {
    public var bass: Double = 0
    public var mid: Double = 0
    public var treble: Double = 0
    public init() {}
    public init(bass: Double, mid: Double, treble: Double) {
        self.bass = bass
        self.mid = mid
        self.treble = treble
    }
}

/// Computes a Fast Fourier Transform over a PCM buffer to extract bass, mid, and treble energy.
final class FFTAnalyzer {
    private let fftSetup: vDSP_DFT_Setup?
    private let log2n = vDSP_Length(10) // 1024 frames = 512 bins
    private let n: Int
    private let halfN: Int

    init() {
        self.n = 1 << log2n
        self.halfN = n / 2
        self.fftSetup = vDSP_DFT_zop_CreateSetup(nil, vDSP_Length(n), vDSP_DFT_Direction.FORWARD)
    }

    deinit {
        if let setup = fftSetup {
            vDSP_DFT_DestroySetup(setup)
        }
    }

    func analyze(_ buffer: AVAudioPCMBuffer) -> AudioBands? {
        guard let setup = fftSetup, let channelData = buffer.floatChannelData else { return nil }
        let frames = Int(buffer.frameLength)
        guard frames >= n else { return nil }

        // Prepare vDSP arrays
        var realIn = [Float](repeating: 0, count: n)
        var imagIn = [Float](repeating: 0, count: n)
        var realOut = [Float](repeating: 0, count: n)
        var imagOut = [Float](repeating: 0, count: n)

        let ptr = channelData[0]
        for i in 0..<n {
            realIn[i] = ptr[i]
        }

        // Apply Hann window to smooth boundaries
        var window = [Float](repeating: 0, count: n)
        vDSP_hann_window(&window, vDSP_Length(n), Int32(vDSP_HALF_WINDOW))
        vDSP_vmul(realIn, 1, window, 1, &realIn, 1, vDSP_Length(n))

        // Execute DFT
        vDSP_DFT_Execute(setup, realIn, imagIn, &realOut, &imagOut)

        // Calculate Magnitudes
        var magnitudes = [Float](repeating: 0, count: halfN)
        var complexOut = DSPSplitComplex(realp: &realOut, imagp: &imagOut)
        vDSP_zvabs(&complexOut, 1, &magnitudes, 1, vDSP_Length(halfN))

        // Normalize
        var normalized = [Float](repeating: 0, count: halfN)
        var scale: Float = 2.0 / Float(n)
        vDSP_vsmul(magnitudes, 1, &scale, &normalized, 1, vDSP_Length(halfN))

        // Bin mapping for 44.1kHz (43Hz per bin)
        // Bass: ~43 - 250Hz (Bins 1-6)
        // Mid: ~250 - 4000Hz (Bins 7-93)
        // Treble: ~4000 - 20000Hz (Bins 94-511)
        
        let bassSlice = normalized[1...6]
        let midSlice = normalized[7...93]
        let trebleSlice = normalized[94..<halfN]

        // Compute averages and apply basic visualizer gain/scaling
        let bass = Double(bassSlice.reduce(0, +) / Float(bassSlice.count)) * 15.0
        let mid = Double(midSlice.reduce(0, +) / Float(midSlice.count)) * 25.0
        let treble = Double(trebleSlice.reduce(0, +) / Float(trebleSlice.count)) * 35.0

        return AudioBands(
            bass: min(1.0, bass),
            mid: min(1.0, mid),
            treble: min(1.0, treble)
        )
    }

    #if DEBUG
    static func _selfCheck() {
        // Assertions for analyzer correctness could be placed here
    }
    #endif
}

#if os(macOS)
/// An individual audio output pipeline for a specific hardware device (e.g. Marshall Bluetooth).
/// SyncBeats can spawn multiple decks to route audio to many speakers simultaneously.
@MainActor
final class PlaybackDeck {
    let engine = AVAudioEngine()
    let playerNode = AVAudioPlayerNode()
    let deviceId: AudioDeviceID
    var latencyOffsetMs: Double = 0
    
    init(deviceId: AudioDeviceID, latencyOffsetMs: Double) {
        self.deviceId = deviceId
        self.latencyOffsetMs = latencyOffsetMs
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: nil)
        
        var id = deviceId
        if let outputUnit = engine.outputNode.audioUnit {
            AudioUnitSetProperty(
                outputUnit,
                kAudioOutputUnitProperty_CurrentDevice,
                kAudioUnitScope_Global,
                0,
                &id,
                UInt32(MemoryLayout<AudioDeviceID>.size)
            )
        }
        
        do {
            try engine.start()
        } catch {
            print("PlaybackDeck [\(deviceId)]: Failed to start engine - \(error)")
        }
    }
    
    func syncPlaybackState(file: AVAudioFile, isPlaying: Bool, startEpoch: Double?, pauseOffset: Double) {
        if playerNode.isPlaying { playerNode.stop() }
        
        if isPlaying, let epoch = startEpoch {
            if !engine.isRunning {
                try? engine.start()
            }
            
            let now = SyncClock.nowMs()
            // Add the deck's specific latency offset to schedule it further ahead,
            // so by the time the Bluetooth speaker processes it, it perfectly aligns!
            let expectedPositionMs = (now - epoch) + pauseOffset + latencyOffsetMs
            let expectedPositionSec = max(0, expectedPositionMs / 1000.0)
            
            let sampleRate = file.processingFormat.sampleRate
            let startFrame = AVAudioFramePosition(expectedPositionSec * sampleRate)
            
            guard startFrame < file.length else { return }
            let frameCount = AVAudioFrameCount(file.length - startFrame)
            
            guard frameCount > 0 else { return }
            
            // Stop again right before scheduling just to be safe if it wasn't caught
            playerNode.stop()
            
            playerNode.scheduleSegment(
                file,
                startingFrame: startFrame,
                frameCount: frameCount,
                at: nil,
                completionHandler: nil
            )
            
            if engine.isRunning {
                playerNode.play()
            } else {
                print("PlaybackDeck [\(deviceId)]: Skipping play() because engine failed to start.")
            }
        }
    }
    
    func stop() {
        playerNode.stop()
    }
}
#endif
