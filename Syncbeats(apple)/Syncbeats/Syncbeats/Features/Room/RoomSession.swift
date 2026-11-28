import Foundation
import Observation
import SocketIO
#if os(iOS)
import UIKit
#endif

/// One server-authoritative room shared by the main window and notch.
/// Local audio and every player view follow the server-authoritative timeline.
@MainActor @Observable
final class RoomSession {
    private(set) var connection: RoomConnectionState = .idle
    private(set) var roomID: String?
    private(set) var queue: [RoomTrack] = []
    private(set) var participants: [RoomParticipant] = []
    private(set) var currentTrackURL: String?
    private(set) var isPlaying = false
    private(set) var pendingPlay = false
    private(set) var localAudioSuspended = false
    private(set) var shuffle = false
    private(set) var repeatMode = "off"
    private(set) var autoplayEnabled = true
    private(set) var supportsAutoplay = false
    private(set) var searchResults: [RoomSearchResult] = []
    private(set) var isSearching = false
    private(set) var addingURLs: Set<String> = []
    var errorMessage: String?
    var searchQuery = ""
    private(set) var recommendations: [RoomSearchResult] = []
    private(set) var musicFeed: MusicFeed?
    private(set) var musicCatalog: MusicCatalog?
    private(set) var isLoadingMusicInterests = false
    private(set) var isSavingMusicInterests = false
    var musicInterestsError: String?
    @ObservationIgnored private var musicInterestsGeneration = UUID()

    private(set) var listeningHistory: [RoomSearchResult] = []
    private(set) var recentRoomTracks: [RoomTrack] = []
    private(set) var isLoadingDiscovery = false
    private(set) var isLoadingHistory = false
    private(set) var isReordering = false
    var discoveryError: String?
    var historyError: String?
    var statusMessage: String?

    @ObservationIgnored private var manager: SocketManager?
    @ObservationIgnored private var socket: SocketIOClient?
    @ObservationIgnored private var audioPlaybackInstanceID: String?
    @ObservationIgnored private var audioPlaybackEpoch: Double?
    @ObservationIgnored private var finishedTrack: RoomTrack?
    private(set) var serverHasCurrentTrack = false
    private(set) var preparingLibraryPlayback = false
    @ObservationIgnored private var librarySequenceGeneration = UUID()
    @ObservationIgnored private var preparingSequence = false
    @ObservationIgnored private var waitingForSequenceTrackID: String?
    @ObservationIgnored private var credentials: RoomCredentials?
    @ObservationIgnored private var deviceIdentityAnnounced = false
    @ObservationIgnored private var receivedAt = Date()
    private var playbackEpoch: Double?
    private var playbackOffset: Double = 0
    private var playbackInstanceID: String?
    private var serverOffset: Double = 0
    private var measuredDurations: [String: Double] = [:]
    let audio = NativeRoomAudio()
    let hybrid = NativeHybridRelay()
    @ObservationIgnored private var cloudOffset = 0.0
    @ObservationIgnored private var cloudUncertainty = 0.0
    @ObservationIgnored private var lastCloudClock: NativeClockStamp?
    @ObservationIgnored private var lastLocalClock: NativeClockStamp?
    @ObservationIgnored private var lastQualityReport: TimeInterval = -.infinity
    @ObservationIgnored private var reportedPlaybackEpoch: Double?
    private var cloudNetwork = NativeNetworkSamples()
    private var participantTelemetry: [String: (value: ParticipantTelemetryReport, uptime: TimeInterval)] = [:]
    @ObservationIgnored private var clockTask: Task<Void, Never>?
    @ObservationIgnored private var driftTask: Task<Void, Never>?
    @ObservationIgnored private var syncProbes: [Int: NativeClockStamp] = [:]
    @ObservationIgnored private var syncSamples: [(offset: Double, rtt: Double)] = []
    @ObservationIgnored private var syncSequence = 0
    @ObservationIgnored private var lastPongSequence = 0
    @ObservationIgnored private var syncParameters = NativeSyncParameters.forRTT(0)
    @ObservationIgnored private var positionAtReceipt: Double = 0
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var searchGeneration = UUID()
    @ObservationIgnored private var discoveryGeneration = UUID()
    @ObservationIgnored private var discoveryCache: [DiscoveryGenre: [RoomSearchResult]] = [:]
    @ObservationIgnored private let http: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        return URLSession(configuration: configuration)
    }()

    var currentTrack: RoomTrack? { queue.first(where: { $0.isCurrent == true }) ?? queue.first(where: { currentTrackURL.map(YouTubeIdentity.key(for:)) == YouTubeIdentity.key(for: $0.trackUrl) }) }
    var upcoming: [RoomTrack] {
        guard let current = currentTrack, let index = queue.firstIndex(where: { $0.id == current.id }) else { return queue }
        return Array(queue.dropFirst(index + 1))
    }
    var duration: Double? {
        if let url = currentTrackURL, let measured = measuredDurations[YouTubeIdentity.key(for: url)] { return measured }
        return currentTrack?.durationSec.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
    }
    func duration(for track: RoomTrack) -> Double? {
        measuredDurations[YouTubeIdentity.key(for: track.trackUrl)] ?? track.playableDuration
    }
    var canControl: Bool { connection == .connected }
    var ownSocketID: String? { socket?.sid }

    /// Display and audio share the same server epoch and measured clock offset.
    func position(at date: Date = Date()) -> Double {
        let value: Double
        if isPlaying && !pendingPlay, let playbackEpoch {
            value = max(playbackOffset, (date.timeIntervalSince1970 * 1000 + serverOffset - playbackEpoch) / 1000)
        } else {
            let elapsed = isPlaying && !pendingPlay ? max(0, date.timeIntervalSince(receivedAt)) : 0
            value = max(0, positionAtReceipt + elapsed)
        }
        if let duration { return min(value, duration) }
        return value
    }

    func connect(_ credentials: RoomCredentials) {
        if self.credentials == credentials, connection != .failed, connection != .idle { return }
        disconnect()
        self.credentials = credentials
        audio.configureHybrid(hybrid)
        audio.onOutputsChanged = { [weak self] reschedule in
            guard let self else { return }
            if self.deviceIdentityAnnounced { self.announceAudioOutputs() }
            if reschedule { self.followAudio(force: true) }
        }
        audio.startMonitoringOutputs()
        hybrid.renewCredential = { [weak self] in self?.emit("hybrid:join") }
        hybrid.clockEstimate = { [weak self] in
            #if os(macOS)
            let now = NativeClockStamp.now()
            guard let self, self.hybrid.isClockLeader, self.canControl,
                  self.lastCloudClock?.isFresh(at: now, maxAge: 30) == true else { return nil }
            return (now.wallMS + self.cloudOffset, self.cloudUncertainty)
            #else
            return nil
            #endif
        }
        hybrid.onClockSample = { [weak self] offset, rtt, uncertainty in
            let now = NativeClockStamp.now()
            guard let self, offset.isFinite, rtt < 100, uncertainty < max(200, self.cloudUncertainty * 2),
                  self.lastCloudClock?.isFresh(at: now, maxAge: 30) == true else { return }
            self.lastLocalClock = now
            self.serverOffset = offset
        }
        hybrid.playbackEstimate = { [weak self] in self?.playbackAlignment(at: .now()) }
        roomID = credentials.roomID
        connection = .connecting
        NativeDiagnostics.info("Socket", "Connecting")
        let manager = SocketManager(socketURL: credentials.baseURL, config: [
            .log(false), .forceWebsockets(true), .reconnects(true), .reconnectAttempts(-1),
            .reconnectWait(2), .handleQueue(.main),
            .extraHeaders(["Authorization": "Bearer \(credentials.token)", "x-device-id": credentials.deviceID])
        ])
        self.manager = manager
        let socket = manager.defaultSocket
        self.socket = socket
        socket.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            self.connection = .connecting
            self.deviceIdentityAnnounced = false
            self.errorMessage = nil
            NativeDiagnostics.info("Socket", "Connected; joining room")
            self.socket?.emit("room:join", ["roomId": credentials.roomID,
                "displayName": credentials.displayName + " · " + NativeDevice.name, "userId": credentials.userID,
                "deviceId": credentials.deviceID, "isReady": false] as [String: Any])
            self.startClockSync()
        }
        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            guard let self, self.credentials != nil, self.connection != .failed else { return }
            self.connection = .reconnecting
            NativeDiagnostics.info("Socket", "Disconnected; reconnecting")
            self.audio.pause()
            self.hybrid.stop()
            self.resetTelemetry()
            self.clockTask?.cancel(); self.driftTask?.cancel()
        }
        socket.on(clientEvent: .reconnectAttempt) { [weak self] _, _ in
            guard self?.connection != .failed else { return }
            self?.connection = .reconnecting
        }
        socket.on(clientEvent: .error) { [weak self] _, _ in
            guard let self, self.connection != .failed else { return }
            self.connection = .reconnecting
            self.errorMessage = "Couldn't connect to the room. Check that your server is running."
            NativeDiagnostics.info("Socket", "Connection error; retrying")
        }
        socket.on("sync:pong") { [weak self] data, _ in
            guard let self, let pong = data.first as? [String: Any] else { return }
            self.receiveClock(pong)
        }
        socket.on("room:participantStats") { [weak self] data, _ in
            guard let message = data.first as? [String: Any] else { return }
            self?.receiveTelemetry(message)
        }
        socket.on("room:audioOutputVolume") { [weak self] data, _ in
            guard let self, let change = data.first as? [String: Any],
                  change["roomId"] as? String == self.roomID,
                  let outputID = change["outputId"] as? String, let volume = change["volume"] as? Double else { return }
            self.audio.setOutputVolume(volume, outputID: outputID)
        }
        socket.on("hybrid:session") { [weak self] data, _ in
            guard let self, let object = data.first,
                  let bytes = try? JSONSerialization.data(withJSONObject: object),
                  let credential = try? JSONDecoder().decode(NativeHybridCredential.self, from: bytes),
                  credential.roomId == self.roomID else { return }
            self.hybrid.accept(credential)
        }
        for event in ["room:snapshot", "room:stateChanged"] {
            socket.on(event) { [weak self] data, _ in
                guard let self, let object = data.first else { return }
                do {
                    let snapshot = try JSONDecoder().decode(RoomSnapshot.self, from: JSONSerialization.data(withJSONObject: object))
                    guard snapshot.roomId == self.roomID else { return }
                    self.apply(snapshot)
                    if !self.deviceIdentityAnnounced,
                       snapshot.participants.contains(where: { $0.socketId == self.ownSocketID }) {
                        self.deviceIdentityAnnounced = true
                        self.announceAudioOutputs()
                        self.emit("hybrid:join")
                    }
                    // Exclude this Mac only while its current file is unavailable.
                    // Ready snapshots must not put a loaded player back into blocked state.
                    if self.currentTrackURL != nil,
                       self.audio.loadedKey != self.currentTrackURL.map(YouTubeIdentity.key(for:)),
                       let own = snapshot.participants.first(where: { $0.socketId == self.socket?.sid }), own.isBlocked != true {
                        self.socket?.emit("playback:blocked", ["roomId": snapshot.roomId, "blocked": true] as [String: Any])
                    }
                } catch {
                    NativeDiagnostics.failure("Socket", "Decode room update", error: error)
                    self.errorMessage = "Couldn't read the room update. Reconnect to try again."
                }
            }
        }
        // Queue mutations can arrive independently of playback snapshots.
        socket.on("playback:pause") { [weak self] data, _ in
            guard let payload = data.first as? [String: Any], payload["senderId"] as? String != "system" else { return }
            self?.waitingForSequenceTrackID = nil
        }
        socket.on("room:queueChanged") { [weak self] _, _ in self?.resync() }
        socket.on("room:trackSet") { [weak self] _, _ in self?.resync() }
        socket.on("room:participantJoined") { [weak self] _, _ in self?.resync() }
        socket.on("room:participantLeft") { [weak self] _, _ in self?.resync() }
        socket.on("room:joinPendingApproval") { [weak self] _, _ in self?.connection = .awaitingApproval }
        for event in ["room:notFound", "room:joinDenied", "room:kicked"] {
            socket.on(event) { [weak self] data, _ in
                guard let self else { return }
                let payload = data.first as? [String: Any]
                self.errorMessage = payload?["message"] as? String ?? payload?["reason"] as? String ?? "You couldn't join this room. Try reconnecting."
                self.connection = .failed
                self.socket?.disconnect()
            }
        }
        socket.on("error") { [weak self] data, _ in
            self?.errorMessage = (data.first as? [String: Any])?["message"] as? String ?? "That action couldn't be completed."
        }
        socket.connect()
    }

    func disconnect() {
        hybrid.stop()
        resetTelemetry()
        audioPlaybackInstanceID = nil; audioPlaybackEpoch = nil; finishedTrack = nil; serverHasCurrentTrack = false
        preparingLibraryPlayback = false
        clockTask?.cancel(); clockTask = nil
        driftTask?.cancel(); driftTask = nil
        syncProbes = [:]; syncSamples = []; serverOffset = 0; playbackEpoch = nil
        audio.reset()
        audio.stopMonitoringOutputs()
        localAudioSuspended = false
        audio.releaseOutput()
        audio.clearPrefetch()
        generation = UUID()
        discoveryGeneration = UUID()
        discoveryCache = [:]
        musicInterestsGeneration = UUID()
        musicFeed = nil; musicCatalog = nil; musicInterestsError = nil
        isLoadingMusicInterests = false; isSavingMusicInterests = false
        recommendations = []
        listeningHistory = []
        recentRoomTracks = []
        discoveryError = nil
        historyError = nil
        statusMessage = nil
        isLoadingDiscovery = false
        isLoadingHistory = false
        isReordering = false
        searchGeneration = UUID()
        if let roomID, socket?.status == .connected { socket?.emit("room:leave", ["roomId": roomID]) }
        socket?.removeAllHandlers()
        manager?.disconnect()
        socket = nil
        manager = nil
        credentials = nil
        roomID = nil
        connection = .idle
        queue = []
        participants = []
        currentTrackURL = nil
        isPlaying = false
        pendingPlay = false
        positionAtReceipt = 0
        shuffle = false
        repeatMode = "off"
        autoplayEnabled = true
        supportsAutoplay = false
        preparingSequence = false
        waitingForSequenceTrackID = nil
        searchResults = []
        searchQuery = ""
        isSearching = false
        addingURLs = []
        errorMessage = nil
    }

    func reconnect() {
        guard let credentials else { return }
        disconnect()
        connect(credentials)
    }

    func apply(_ snapshot: RoomSnapshot) {
        if let previous = currentTrack, previous.trackUrl != snapshot.trackUrl, isPlaying {
            recentRoomTracks = [previous] + recentRoomTracks.filter { $0.id != previous.id }
            recentRoomTracks = Array(recentRoomTracks.prefix(6))
        }
        roomID = snapshot.roomId
        queue = snapshot.queue
        participants = snapshot.participants
        let memberIDs = Set(participants.map(\.id))
        participantTelemetry = participantTelemetry.filter { memberIDs.contains($0.key) }
        hybrid.updateMembers(snapshot.participants, ownID: ownSocketID ?? "", tracks: snapshot.queue)
        serverHasCurrentTrack = snapshot.trackUrl != nil
        let finishedSelection = snapshot.trackUrl == nil ? finishedTrack.flatMap { finished in snapshot.queue.first { $0.id == finished.id } } : nil
        currentTrackURL = snapshot.trackUrl ?? finishedSelection?.trackUrl
        isPlaying = snapshot.isPlaying ?? (snapshot.state.lowercased() == "playing")
        pendingPlay = snapshot.pendingPlay ?? false
        playbackEpoch = snapshot.timeline?.startEpoch ?? snapshot.startEpoch ?? snapshot.scheduledStartEpoch
        playbackOffset = snapshot.timeline?.pauseOffset ?? snapshot.pauseOffset ?? 0
        playbackInstanceID = snapshot.playbackInstanceId
        positionAtReceipt = snapshot.position.isFinite ? max(0, snapshot.position / 1000) : 0
        if let finishedSelection {
            positionAtReceipt = duration(for: finishedSelection) ?? positionAtReceipt
            playbackOffset = positionAtReceipt
        }
        receivedAt = Date()
        shuffle = snapshot.shuffle
        repeatMode = snapshot.repeatMode
        autoplayEnabled = snapshot.autoplay ?? true
        supportsAutoplay = snapshot.autoplay != nil
        connection = .connected
        synchronizeAudio()
        if let credentials { audio.prefetch(track: upcoming.first, baseURL: credentials.baseURL) }
        recordPlaybackState()
    }

    private func emit(_ event: String, _ fields: [String: Any] = [:]) {
        guard canControl, let roomID, socket?.status == .connected else { return }
        socket?.emit(event, fields.merging(["roomId": roomID]) { _, new in new })
    }
    private func resync() {
        guard let roomID, socket?.status == .connected else { return }
        socket?.emit("room:resync", ["roomId": roomID])
    }

    var secondsUntilStart: Double {
        guard isPlaying, let playbackEpoch else { return 0 }
        return max(0, (playbackEpoch + playbackOffset * 1000 - Date().timeIntervalSince1970 * 1000 - serverOffset) / 1000)
    }

    func retryAudio() { audio.reset(); synchronizeAudio() }
    func recoverAudioOutput() { audio.rebuildOutput(); synchronizeAudio() }
    func returnToForeground() {
        hybrid.setForeground(true)
        guard credentials != nil else { return }
        if canControl {
            startClockSync()
            synchronizeAudio()
        } else if socket?.status == .disconnected || socket?.status == .notConnected {
            socket?.connect()
        }
    }
    func enterBackground() { hybrid.setForeground(false) }

    func recordPlaybackState() {
        #if DEBUG
        let energy = audio.meter.read()
        let state: [String: Any] = [
            "connected": canControl, "queueCount": queue.count,
            "hasCurrentTrack": currentTrack != nil, "hasCurrentURL": currentTrackURL != nil,
            "duration": duration ?? -1, "playing": isPlaying, "pending": pendingPlay,
            "audioLoading": audio.loading, "audioLoaded": audio.loadedKey != nil,
            "audioError": audio.error ?? "", "rendering": audio.rendering,
            "ambientLevel": energy.level, "ambientBass": energy.bass, "ambientBeat": energy.transient,
            "position": position(), "updatedAt": Date().timeIntervalSince1970
        ]
        var diagnostic = state
        diagnostic["renderedPosition"] = audio.renderedPosition() ?? -1
        diagnostic["correctionCount"] = audio.correctionCount
        diagnostic["lastCorrectionMS"] = audio.lastCorrectionMS
        diagnostic["clockOffsetMS"] = serverOffset
        diagnostic["localPeerCount"] = hybrid.peers.count
        diagnostic["audioSource"] = hybrid.lastAudioSource
        #if os(iOS)
        diagnostic["applicationState"] = UIApplication.shared.applicationState.rawValue
        diagnostic["idleTimerDisabled"] = UIApplication.shared.isIdleTimerDisabled
        #endif
        if let data = try? JSONSerialization.data(withJSONObject: diagnostic, options: [.sortedKeys]) {
            try? data.write(to: FileManager.default.temporaryDirectory.appendingPathComponent("syncbeats-native-playback-state.json"), options: .atomic)
        }
        #endif
    }

    private func synchronizeAudio() {
        guard !localAudioSuspended else { audio.pause(); return }
        guard let credentials, let track = currentTrack else { audio.reset(); return }
        audio.onLoaded = { [weak self] key, duration in
            guard let self, self.currentTrackURL.map(YouTubeIdentity.key(for:)) == key else { return }
            self.measuredDurations[key] = duration
            self.recordPlaybackState()
            self.emit("room:clientReady", ["isReady": true, "trackUrl": self.currentTrackURL ?? ""])
            self.followAudio()
        }
        audio.onFailure = { [weak self] message in
            self?.errorMessage = message
            self?.recordPlaybackState()
            self?.emit("playback:blocked", ["blocked": true])
        }
        audio.onEnded = { [weak self] in
            guard let self, self.isPlaying else { return }
            self.finishedTrack = self.currentTrack
            if self.preparingSequence && self.autoplayEnabled && self.repeatMode != "track",
               let current = self.currentTrack,
               let index = self.queue.firstIndex(where: { $0.id == current.id }),
               index == self.queue.count - 1 {
                self.waitingForSequenceTrackID = current.id
            }
            NativeDiagnostics.info("Playback", "Sending track completion to room")
            self.emit("playback:ended", ["trackUrl": self.currentTrackURL ?? "", "playbackInstanceId": self.playbackInstanceID ?? ""])
        }
        if audio.failedKey == YouTubeIdentity.key(for: track.trackUrl) { return }
        audio.prepare(track: track, baseURL: credentials.baseURL)
        if audio.loadedKey == YouTubeIdentity.key(for: track.trackUrl) {
            // Reconnect resets server readiness flags even when our file is still loaded.
            if let local = participants.first(where: { $0.id == socket?.sid }), !local.isReady {
                emit("room:clientReady", ["isReady": true, "trackUrl": currentTrackURL ?? ""])
            } else if let local = participants.first(where: { $0.id == socket?.sid }), local.isBlocked == true {
                emit("playback:blocked", ["blocked": false])
            }
            followAudio()
        }
    }

    private func announceAudioOutputs() {
        guard let roomID, socket?.status == .connected else { return }
        socket?.emit("room:updateDevice", ["roomId": roomID, "deviceName": NativeDevice.name, "deviceType": NativeDevice.type,
                                          "audioOutputs": audio.outputs.filter { $0.output.type != .builtIn }.map { $0.output.announcement }] as [String: Any])
    }

    private func followAudio(force: Bool = false) {
        guard canControl, !localAudioSuspended else { audio.pause(); return }
        if let local = participants.first(where: { $0.id == socket?.sid }) { audio.setVolume(local.volume ?? 100) }
        let playing = isPlaying && !pendingPlay
        let newInstance = playing && (playbackInstanceID != audioPlaybackInstanceID || playbackEpoch != audioPlaybackEpoch)
        if playing { audioPlaybackInstanceID = playbackInstanceID; audioPlaybackEpoch = playbackEpoch }
        audio.follow(playing: playing, position: position(), delay: secondsUntilStart,
                     hardSeekMS: syncParameters.hardSeekMS, force: force || newInstance)
    }

    private func startClockSync() {
        clockTask?.cancel(); driftTask?.cancel()
        syncProbes.removeAll()
        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.syncSamples = []
                let parameters = self?.syncParameters ?? .forRTT(0)
                for _ in 0..<parameters.samples {
                    guard !Task.isCancelled, let self, self.socket?.status == .connected else { return }
                    self.syncSequence += 1
                    let seq = self.syncSequence, sent = NativeClockStamp.now()
                    self.syncProbes = self.syncProbes.filter { sent.uptime - $0.value.uptime < 5 }
                    self.syncProbes[seq] = sent
                    self.socket?.emit("sync:ping", ["t0": sent.wallMS, "seq": seq])
                    try? await Task.sleep(for: .milliseconds(parameters.gapMS))
                }
                try? await Task.sleep(for: .milliseconds(parameters.resyncMS))
            }
        }
        driftTask = Task { [weak self] in
            while !Task.isCancelled {
                let delay = self?.syncParameters.driftMS ?? 600
                try? await Task.sleep(for: .milliseconds(delay))
                guard !Task.isCancelled, let self else { return }
                let now = NativeClockStamp.now()
                if self.lastLocalClock?.isFresh(at: now, maxAge: 18) != true { self.serverOffset = self.cloudOffset }
                self.followAudio()
                self.reportTelemetry(at: now)
                self.recordPlaybackState()
            }
        }
    }

    private func receiveClock(_ pong: [String: Any]) {
        let now = NativeClockStamp.now()
        guard let seq = pong["seq"] as? Int, let probe = syncProbes.removeValue(forKey: seq), seq > lastPongSequence,
              pong["t0"] as? Double == probe.wallMS, now.uptime - probe.uptime < 5,
              let t1 = pong["t1"] as? Double, let t2 = pong["t2"] as? Double, t1.isFinite, t2.isFinite else { return }
        let elapsed = (now.uptime - probe.uptime) * 1000
        let handling = t2 - t1
        guard (0...elapsed).contains(handling) else { return }
        lastPongSequence = seq
        let rtt = elapsed - handling
        cloudNetwork.record(rtt, at: now.uptime)
        guard probe.isFresh(at: now, maxAge: 5) else { return }
        guard rtt <= syncParameters.gateMS else {
            syncParameters = .forRTT(cloudNetwork.metrics(at: now.uptime, maxAge: 30)?.rttMS ?? rtt)
            return
        }
        let hadClock = lastCloudClock?.isFresh(at: now, maxAge: 30) == true
        if !hadClock { syncSamples.removeAll() }
        let offset = ((t1 - probe.wallMS) + (t2 - (probe.wallMS + elapsed))) / 2
        syncSamples.append((offset, rtt))
        let byDelay = syncSamples.sorted { $0.rtt < $1.rtt }
        let candidates = byDelay.prefix((byDelay.count + 1) / 2)
        let median = NativeNetworkSamples.median(candidates.map(\.offset)) ?? offset
        cloudOffset = hadClock ? cloudOffset * 0.7 + median * 0.3 : median
        cloudUncertainty = candidates.last.map { $0.rtt / 2 } ?? rtt / 2
        lastCloudClock = now
        if lastLocalClock?.isFresh(at: now, maxAge: 18) != true { serverOffset = cloudOffset }
        syncParameters = .forRTT(cloudNetwork.metrics(at: now.uptime, maxAge: 30)?.rttMS ?? rtt)
    }

    private func resetTelemetry() {
        cloudNetwork = NativeNetworkSamples()
        participantTelemetry.removeAll()
        syncProbes.removeAll()
        syncSamples.removeAll()
        syncParameters = .forRTT(0)
        cloudOffset = 0
        cloudUncertainty = 0
        serverOffset = 0
        lastCloudClock = nil
        lastLocalClock = nil
        lastQualityReport = -.infinity
        reportedPlaybackEpoch = nil
    }

    private func playbackAlignment(at now: NativeClockStamp) -> NativePlaybackAlignment? {
        let localClockIsFresh = lastLocalClock?.isFresh(at: now, maxAge: 18) == true
        guard canControl, isPlaying, !pendingPlay, !localAudioSuspended, let epoch = playbackEpoch,
              localClockIsFresh || lastCloudClock?.isFresh(at: now, maxAge: 30) == true,
              let rendered = audio.renderedPosition(maxSampleAge: 0.25) else { return nil }
        let offset = localClockIsFresh ? serverOffset : cloudOffset
        let expected = (now.wallMS + offset - epoch) / 1000
        guard expected >= playbackOffset + 0.25,
              duration.map({ expected < $0 }) ?? true else { return nil }
        let alignment = NativePlaybackAlignment(epoch: epoch, errorMS: (rendered - expected) * 1000)
        return alignment.valid ? alignment : nil
    }

    private func reportTelemetry(at now: NativeClockStamp) {
        let timeSinceReport = now.uptime - lastQualityReport
        guard canControl, timeSinceReport >= 2,
              let metrics = cloudNetwork.metrics(at: now.uptime, maxAge: 24),
              let jitter = metrics.jitterMS else { return }
        let playback = playbackAlignment(at: now)
        guard timeSinceReport >= 8 || playback?.epoch != reportedPlaybackEpoch else { return }
        lastQualityReport = now.uptime
        reportedPlaybackEpoch = playback?.epoch
        var telemetry: [String: Any] = ["network": ["rttMS": metrics.rttMS, "jitterMS": jitter]]
        if let playback {
            telemetry["playback"] = ["epoch": playback.epoch, "errorMS": playback.errorMS]
        }
        // Keep the existing one-way estimates for the web UI and server scheduling.
        emit("sync:stats", ["latency": metrics.rttMS / 2, "jitter": jitter / 2, "nativeTelemetry": telemetry])
    }

    private func receiveTelemetry(_ message: [String: Any]) {
        guard canControl, let id = message["socketId"] as? String, id != ownSocketID,
              participants.contains(where: { $0.id == id }) else { return }
        let now = ProcessInfo.processInfo.systemUptime
        if let payload = message["nativeTelemetry"] as? [String: Any],
           let data = try? JSONSerialization.data(withJSONObject: payload),
           let value = try? JSONDecoder().decode(NativeParticipantTelemetry.self, from: data),
           value.network.valid, value.playback?.valid ?? true {
            participantTelemetry[id] = (.measured(value), now)
            return
        }
        if let previous = participantTelemetry[id], case .measured = previous.value, now - previous.uptime <= 20 { return }
        // Older servers forward only these two fields. The producers don't agree on RTT units.
        if let data = try? JSONSerialization.data(withJSONObject: message),
           let value = try? JSONDecoder().decode(LegacyParticipantTelemetry.self, from: data), value.valid {
            participantTelemetry[id] = (.legacy(value), now)
        }
    }

    func deviceTelemetry(for id: String) -> RoomDeviceTelemetry {
        guard canControl else { return RoomDeviceTelemetry() }
        let now = NativeClockStamp.now()
        if id == ownSocketID {
            let network = cloudNetwork.metrics(at: now.uptime, maxAge: 30)
            return RoomDeviceTelemetry(path: network == nil ? nil : "Cloud", network: network,
                                       playbackError: playbackAlignment(at: now)?.errorMS)
        }
        let peer = hybrid.peers.first(where: { $0.id == id })
        let lan = peer?.metrics(at: now.uptime)
        let report = participantTelemetry[id].flatMap { now.uptime - $0.uptime <= 20 ? $0 : nil }
        var telemetry = RoomDeviceTelemetry(path: lan == nil ? nil : "LAN", network: lan)
        var cloudPlayback: NativePlaybackAlignment?
        var cloudUptime = -Double.infinity
        switch report?.value {
        case .measured(let value):
            if lan == nil {
                telemetry.path = "Cloud"
                telemetry.network = value.network
            }
            cloudPlayback = value.playback
            cloudUptime = report?.uptime ?? cloudUptime
        case .legacy(let value) where lan == nil:
            telemetry.path = "Cloud · basic report"
            telemetry.legacyNetwork = value
        default: break
        }
        if isPlaying, !pendingPlay, let epoch = playbackEpoch {
            let probeUptime = peer?.network.lastUptime ?? -.infinity
            let playback = now.uptime - probeUptime <= 14 && probeUptime >= cloudUptime ? peer?.playback : cloudPlayback
            if playback?.epoch == epoch { telemetry.playbackError = playback?.errorMS }
        }
        return telemetry
    }

    /// Calls and route loss suspend only this output. Room state stays authoritative.
    func suspendLocalAudio() { localAudioSuspended = true; audio.reset() }
    func resumeLocalAudio() {
        guard localAudioSuspended else { return }
        localAudioSuspended = false
        retryAudio() // Rebuild the route, then follow the current server position.
    }
    func play() {
        guard canControl, currentTrack != nil else { return }
        if !serverHasCurrentTrack, let track = currentTrack { jump(to: track); return }
        resumeLocalAudio()
        if !isPlaying && !pendingPlay { emit("playback:play") }
    }
    func pause() {
        waitingForSequenceTrackID = nil
        if isPlaying || pendingPlay { emit("playback:pause") }
    }
    func togglePlayback() {
        guard currentTrack != nil else { return }
        if !serverHasCurrentTrack, let track = currentTrack { jump(to: track); return }
        if localAudioSuspended { play(); return }
        NativeDiagnostics.info("Playback", isPlaying || pendingPlay ? "Request pause" : "Request play")
        emit(PlaybackCommand.toggle(playing: isPlaying, pending: pendingPlay))
    }
    func next() { waitingForSequenceTrackID = nil; emit("playback:next") }
    func previous() { waitingForSequenceTrackID = nil; emit("playback:prev") }
    func jump(to track: RoomTrack) {
        librarySequenceGeneration = UUID()
        preparingSequence = false
        waitingForSequenceTrackID = nil
        requestJump(to: track)
    }
    private func requestJump(to track: RoomTrack) {
        if !serverHasCurrentTrack { finishedTrack = nil }
        NativeDiagnostics.info("Playback", "Request track selection")
        emit("playback:jumpTo", ["trackId": track.id])
    }
    func remove(_ track: RoomTrack) { emit("room:removeFromQueue", ["itemId": track.id]) }
    func toggleShuffle() {
        NativeDiagnostics.info("Playback", "Request shuffle \(!shuffle)")
        emit("room:toggleShuffle", ["shuffle": !shuffle])
    }
    func cycleRepeat() {
        let next = repeatMode == "off" ? "all" : repeatMode == "all" ? "track" : "off"
        NativeDiagnostics.info("Playback", "Request repeat \(next)")
        emit("room:toggleRepeat", ["repeatMode": next])
    }
    func toggleAutoplay() {
        guard canControl, supportsAutoplay else { return }
        emit("room:toggleAutoplay", ["autoplay": !autoplayEnabled])
    }
    func setParticipantVolume(_ value: Double, socketID: String) {
        guard value.isFinite else { return }
        emit("room:setParticipantVolume", ["targetSocketId": socketID, "volume": min(max(value.rounded(), 0), 100)])
    }
    func setSpeakerVolume(_ value: Double, outputID: String, socketID: String) {
        if socketID == ownSocketID {
            audio.setOutputVolume(value, outputID: outputID)
        } else {
            emit("room:setAudioOutputVolume", ["targetSocketId": socketID, "outputId": outputID, "volume": value])
        }
    }
    func seek(to seconds: Double) {
        guard seconds.isFinite, let duration else { return }
        NativeDiagnostics.info("Playback", "Request seek at \(String(format: "%.2f", seconds))s")
        let replay = !isPlaying && (audio.completed || position() >= duration - 0.1)
        if !serverHasCurrentTrack, let track = currentTrack { jump(to: track) }
        emit("playback:seek", ["position": min(max(0, seconds), duration) * 1000])
        if replay && serverHasCurrentTrack { emit("playback:play") }
    }

    var visibleQueue: [RoomTrack] { currentTrack.map { [$0] + upcoming } ?? queue }

    func queuedTrack(for result: RoomSearchResult) -> RoomTrack? {
        let identity = YouTubeIdentity.id(in: result.url)
        return queue.first { $0.trackUrl == result.url || (identity != nil && YouTubeIdentity.id(in: $0.trackUrl) == identity) }
    }

    func loadMusicInterests() async {
        guard let credentials else { return }
        let active = generation
        let requestID = UUID(); musicInterestsGeneration = requestID
        isLoadingMusicInterests = true; musicInterestsError = nil
        defer { if musicInterestsGeneration == requestID { isLoadingMusicInterests = false } }
        do {
            let api = RoomHomeAPI(credentials: credentials, http: http)
            async let catalog = api.musicCatalog()
            async let feed = api.musicFeed()
            let result = try await (catalog, feed)
            guard generation == active, musicInterestsGeneration == requestID, !Task.isCancelled else { return }
            musicCatalog = result.0; musicFeed = result.1
            NativeDiagnostics.info("Recommendations", "Catalog and feed loaded")
        } catch {
            NativeDiagnostics.failure("Recommendations", "Load interests", error: error)
            if generation == active, musicInterestsGeneration == requestID, !Task.isCancelled { musicInterestsError = error.localizedDescription }
        }
    }
    func saveMusicInterests(_ taste: MusicTaste) async {
        await changeMusicInterests { api in try await api.saveTaste(taste) }
    }
    func resetMusicInterests() async { await changeMusicInterests { api in try await api.resetTaste() } }
    func musicFeedback(_ artistID: String, kind: String) async {
        await changeMusicInterests { api in try await api.feedback(artistID: artistID, kind: kind) }
    }
    func recordMusicOpen(_ artistID: String) async {
        guard let credentials else { return }
        try? await RoomHomeAPI(credentials: credentials, http: http).feedback(artistID: artistID, kind: "OPEN")
    }
    private func changeMusicInterests(_ action: (RoomHomeAPI) async throws -> Void) async {
        guard let credentials, !isSavingMusicInterests else { return }
        let active = generation
        isSavingMusicInterests = true; musicInterestsError = nil
        defer { if generation == active { isSavingMusicInterests = false } }
        do {
            try await action(RoomHomeAPI(credentials: credentials, http: http))
            guard generation == active, !Task.isCancelled else { return }
            await loadMusicInterests()
        } catch { if generation == active, !Task.isCancelled { musicInterestsError = error.localizedDescription } }
    }

    func loadDiscovery(_ genre: DiscoveryGenre, refresh: Bool = false) async {
        let requestID = UUID()
        discoveryGeneration = requestID
        discoveryError = nil
        guard let credentials else { return }
        if !refresh, let cached = discoveryCache[genre] { recommendations = cached; isLoadingDiscovery = false; return }
        let active = generation
        recommendations = []
        isLoadingDiscovery = true
        defer { if discoveryGeneration == requestID { isLoadingDiscovery = false } }
        do {
            let results = try await RoomHomeAPI(credentials: credentials, http: http).discovery(genre)
            guard generation == active, discoveryGeneration == requestID, !Task.isCancelled else { return }
            discoveryCache[genre] = results
            recommendations = results
        } catch {
            if generation == active, discoveryGeneration == requestID, !Task.isCancelled { discoveryError = error.localizedDescription }
        }
    }

    func loadListeningHistory() async {
        guard let credentials else { return }
        let active = generation
        isLoadingHistory = true
        historyError = nil
        defer { if generation == active { isLoadingHistory = false } }
        do {
            let results = try await RoomHomeAPI(credentials: credentials, http: http).history()
            guard generation == active, !Task.isCancelled else { return }
            listeningHistory = results
        } catch { if generation == active, !Task.isCancelled { historyError = error.localizedDescription } }
    }

    func reorder(_ track: RoomTrack, to index: Int) async {
        let firstUpcoming = currentTrack.flatMap { current in queue.firstIndex(where: { $0.id == current.id }) }.map { $0 + 1 } ?? 0
        guard canControl, !isReordering, let credentials,
              let original = queue.firstIndex(where: { $0.id == track.id }),
              original >= firstUpcoming, index >= firstUpcoming, index < queue.count, original != index else { return }
        let active = generation
        isReordering = true
        defer { if generation == active { isReordering = false } }
        do {
            try await RoomHomeAPI(credentials: credentials, http: http).reorder(itemID: track.id, newIndex: index)
            guard generation == active, !Task.isCancelled else { return }
            statusMessage = "Moved \(track.title) in the queue"
            resync()
        } catch { if generation == active, !Task.isCancelled { errorMessage = error.localizedDescription } }
    }

    func move(_ track: RoomTrack, by delta: Int) async {
        guard let index = queue.firstIndex(where: { $0.id == track.id }) else { return }
        await reorder(track, to: index + delta)
    }

    /// Prepare the visible library sequence before starting, so a short song can advance.
    func playLibrary(_ song: NativeLibrarySong, in songs: [NativeLibrarySong],
                     resolve: ((NativeLibrarySong) async throws -> NativeLibrarySong)? = nil) async {
        guard let selected = song.result else { return }
        let following = songs.firstIndex(where: { $0.id == song.id })
            .map { Array(songs.dropFirst($0 + 1)) } ?? []
        await playSequence(selected, following: following) { next in
            if let result = next.result { return result }
            return try await resolve?(next).result
        }
    }

    func play(_ result: RoomSearchResult, in context: [RoomSearchResult] = []) async {
        let following = context.firstIndex(where: { $0.id == result.id })
            .map { Array(context.dropFirst($0 + 1)) } ?? []
        await playSequence(result, following: following) { $0 }
    }

    private func playSequence<Song>(_ selected: RoomSearchResult, following: [Song],
                                    resolve: (Song) async throws -> RoomSearchResult?) async {
        guard !preparingLibraryPlayback, let credentials, canControl else { return }
        let active = generation, sequence = UUID()
        librarySequenceGeneration = sequence
        preparingLibraryPlayback = true
        preparingSequence = !following.isEmpty
        waitingForSequenceTrackID = nil
        errorMessage = nil
        statusMessage = "Preparing playback…"
        func isCurrent() -> Bool { generation == active && librarySequenceGeneration == sequence && canControl && !Task.isCancelled }
        defer {
            if generation == active && librarySequenceGeneration == sequence {
                preparingLibraryPlayback = false
                preparingSequence = false
                waitingForSequenceTrackID = nil
            }
        }
        do {
            let api = RoomHomeAPI(credentials: credentials, http: http)
            let selectedTrack = try await api.enqueue(selected)
            guard isCurrent() else { return }
            let initialQueue = try await api.queue()
            guard isCurrent() else { return }
            guard let initialIndex = initialQueue.firstIndex(where: { $0.id == selectedTrack.id }) else { throw AuthFailure.invalidResponse }
            if initialIndex != initialQueue.count - 1 {
                try await api.reorder(itemID: selectedTrack.id, newIndex: initialQueue.count - 1)
            }
            guard isCurrent() else { return }
            requestJump(to: selectedTrack)
            preparingLibraryPlayback = false
            statusMessage = "Playing your selection"
            var queuedIDs: Set<String> = [selectedTrack.id]
            var skipped = 0
            for next in following {
                guard isCurrent() else { return }
                do {
                    guard let result = try await resolve(next) else { skipped += 1; continue }
                    guard isCurrent() else { return }
                    let item = try await api.enqueue(result)
                    guard isCurrent() else { return }
                    if queuedIDs.contains(item.id) { continue }
                    let currentQueue = try await api.queue()
                    guard isCurrent() else { return }
                    guard let itemIndex = currentQueue.firstIndex(where: { $0.id == item.id }) else { throw AuthFailure.invalidResponse }
                    // Append unresolved future songs after the prepared queue,
                    // preserving any order the listener changed while loading.
                    let targetIndex = currentQueue.count - 1
                    if itemIndex != targetIndex { try await api.reorder(itemID: item.id, newIndex: targetIndex) }
                    guard isCurrent() else { return }
                    // A short song can finish while the next source is resolving.
                    // Resume only this still-current sequence, never a paused or replaced one.
                    if waitingForSequenceTrackID != nil && autoplayEnabled {
                        waitingForSequenceTrackID = nil
                        requestJump(to: item)
                    }
                    queuedIDs.insert(item.id)
                    statusMessage = "Playing your selection · \(queuedIDs.count) songs queued"
                } catch {
                    guard isCurrent() else { return }
                    skipped += 1
                    NativeDiagnostics.failure("Playback", "Prepare following song", error: error)
                }
            }
            guard isCurrent() else { return }
            if skipped > 0 { statusMessage = "\(queuedIDs.count) songs queued · \(skipped) unavailable" }
            NativeDiagnostics.info("Playback", "Prepared playback sequence: \(queuedIDs.count) songs")
        } catch {
            guard isCurrent() else { return }
            errorMessage = error.localizedDescription
            NativeDiagnostics.failure("Playback", "Start selected song", error: error)
            resync()
        }
    }

    func search() async {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestID = UUID()
        searchGeneration = requestID
        searchResults = []
        guard !query.isEmpty, let credentials else { isSearching = false; return }
        guard query.count <= 200 else { isSearching = false; errorMessage = "Keep your search under 200 characters."; return }
        isSearching = true
        errorMessage = nil
        defer { if searchGeneration == requestID { isSearching = false } }
        do {
            var url = URLComponents(url: credentials.baseURL.appendingPathComponent("rooms/\(credentials.roomID)/youtube-search"), resolvingAgainstBaseURL: false)!
            url.queryItems = [URLQueryItem(name: "q", value: query)]
            let data = try await request(url: url.url!, credentials: credentials)
            guard searchGeneration == requestID, !Task.isCancelled else { return }
            searchResults = try JSONDecoder().decode([RoomSearchResult].self, from: data)
            Task { try? await RoomHomeAPI(credentials: credentials, http: http).logSearch(query) }
        } catch { if searchGeneration == requestID { errorMessage = error.localizedDescription } }
    }

    func add(_ result: RoomSearchResult) async {
        await enqueue(result, startPlayback: false)
    }

    private func enqueue(_ result: RoomSearchResult, startPlayback: Bool) async {
        guard canControl, let credentials, !addingURLs.contains(result.url) else { return }
        let active = generation
        addingURLs.insert(result.url)
        errorMessage = nil
        defer { if generation == active { addingURLs.remove(result.url) } }
        do {
            let item = try await RoomHomeAPI(credentials: credentials, http: http).enqueue(result)
            guard generation == active else { return }
            statusMessage = "Added \(result.title) to the room"
            if startPlayback { jump(to: item) }
            resync()
        } catch { if generation == active { errorMessage = error.localizedDescription } }
    }

    private func request(url: URL, credentials: RoomCredentials, body: [String: Any]? = nil) async throws -> Data {
        var request = URLRequest(url: url)
        request.setValue("Bearer \(credentials.token)", forHTTPHeaderField: "Authorization")
        request.setValue(credentials.deviceID, forHTTPHeaderField: "x-device-id")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await NativeDiagnostics.data(for: request, using: http,
            operation: NativeDiagnostics.operation(method: request.httpMethod ?? "GET", path: url.path))
        guard let response = response as? HTTPURLResponse else { throw AuthFailure.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw AuthFailure.response(response.statusCode, message ?? "The request couldn't be completed. Please try again.")
        }
        return data
    }
}
