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
    @ObservationIgnored private var credentials: RoomCredentials?
    @ObservationIgnored private var receivedAt = Date()
    private var playbackEpoch: Double?
    private var playbackOffset: Double = 0
    private var playbackInstanceID: String?
    private var serverOffset: Double = 0
    private var measuredDurations: [String: Double] = [:]
    let audio = NativeRoomAudio()
    @ObservationIgnored private var clockTask: Task<Void, Never>?
    @ObservationIgnored private var driftTask: Task<Void, Never>?
    @ObservationIgnored private var syncProbes: [Int: (wall: Double, uptime: Double)] = [:]
    @ObservationIgnored private var syncSamples: [(offset: Double, rtt: Double)] = []
    @ObservationIgnored private var syncSequence = 0
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
        for event in ["room:snapshot", "room:stateChanged"] {
            socket.on(event) { [weak self] data, _ in
                guard let self, let object = data.first else { return }
                do {
                    let snapshot = try JSONDecoder().decode(RoomSnapshot.self, from: JSONSerialization.data(withJSONObject: object))
                    guard snapshot.roomId == self.roomID else { return }
                    self.apply(snapshot)
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
        clockTask?.cancel(); clockTask = nil
        driftTask?.cancel(); driftTask = nil
        syncProbes = [:]; syncSamples = []; serverOffset = 0; playbackEpoch = nil
        audio.reset()
        localAudioSuspended = false
        audio.releaseOutput()
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
        currentTrackURL = snapshot.trackUrl
        isPlaying = snapshot.isPlaying ?? (snapshot.state.lowercased() == "playing")
        pendingPlay = snapshot.pendingPlay ?? false
        playbackEpoch = snapshot.timeline?.startEpoch ?? snapshot.startEpoch ?? snapshot.scheduledStartEpoch
        playbackOffset = snapshot.timeline?.pauseOffset ?? snapshot.pauseOffset ?? 0
        playbackInstanceID = snapshot.playbackInstanceId
        positionAtReceipt = snapshot.position.isFinite ? max(0, snapshot.position / 1000) : 0
        receivedAt = Date()
        shuffle = snapshot.shuffle
        repeatMode = snapshot.repeatMode
        connection = .connected
        synchronizeAudio()
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
        guard credentials != nil else { return }
        if canControl {
            startClockSync()
            synchronizeAudio()
        } else if socket?.status == .disconnected || socket?.status == .notConnected {
            socket?.connect()
        }
    }

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
        #if os(iOS)
        diagnostic["applicationState"] = UIApplication.shared.applicationState.rawValue
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

    private func followAudio() {
        guard canControl, !localAudioSuspended else { audio.pause(); return }
        if let local = participants.first(where: { $0.id == socket?.sid }) { audio.setVolume(local.volume ?? 100) }
        audio.follow(playing: isPlaying && !pendingPlay, position: position(), delay: secondsUntilStart,
                     hardSeekMS: syncParameters.hardSeekMS)
    }

    private func startClockSync() {
        clockTask?.cancel(); driftTask?.cancel()
        clockTask = Task { [weak self] in
            while !Task.isCancelled {
                self?.syncSamples = []
                let parameters = self?.syncParameters ?? .forRTT(0)
                for _ in 0..<parameters.samples {
                    guard !Task.isCancelled, let self, self.socket?.status == .connected else { return }
                    self.syncSequence += 1
                    let seq = self.syncSequence, wall = Date().timeIntervalSince1970 * 1000
                    self.syncProbes[seq] = (wall, ProcessInfo.processInfo.systemUptime)
                    self.socket?.emit("sync:ping", ["t0": wall, "seq": seq])
                    try? await Task.sleep(for: .milliseconds(parameters.gapMS))
                }
                try? await Task.sleep(for: .milliseconds(parameters.resyncMS))
            }
        }
        driftTask = Task { [weak self] in
            while !Task.isCancelled {
                let delay = self?.syncParameters.driftMS ?? 600
                try? await Task.sleep(for: .milliseconds(delay))
                guard !Task.isCancelled else { return }
                self?.followAudio()
                self?.recordPlaybackState()
            }
        }
    }

    private func receiveClock(_ pong: [String: Any]) {
        guard let seq = pong["seq"] as? Int, let probe = syncProbes.removeValue(forKey: seq),
              let t1 = pong["t1"] as? Double, let t2 = pong["t2"] as? Double else { return }
        let elapsed = (ProcessInfo.processInfo.systemUptime - probe.uptime) * 1000
        let rtt = max(0, elapsed - (t2 - t1))
        syncProbes = syncProbes.filter { ProcessInfo.processInfo.systemUptime - $0.value.uptime < 5 }
        guard rtt <= syncParameters.gateMS else { syncParameters = .forRTT(rtt); return }
        let offset = ((t1 - probe.wall) + (t2 - (probe.wall + elapsed))) / 2
        syncSamples.append((offset, rtt))
        let sorted = syncSamples.sorted { $0.offset < $1.offset }
        let median = sorted[sorted.count / 2].offset
        serverOffset = syncSamples.count == 1 && serverOffset == 0 ? median : serverOffset * 0.7 + median * 0.3
        syncParameters = .forRTT(syncSamples.map(\.rtt).reduce(0, +) / Double(syncSamples.count))
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
        resumeLocalAudio()
        if !isPlaying && !pendingPlay { emit("playback:play") }
    }
    func pause() { if isPlaying || pendingPlay { emit("playback:pause") } }
    func togglePlayback() {
        guard currentTrack != nil else { return }
        if localAudioSuspended { play(); return }
        emit(PlaybackCommand.toggle(playing: isPlaying, pending: pendingPlay))
    }
    func next() { emit("playback:next") }
    func previous() { emit("playback:prev") }
    func jump(to track: RoomTrack) { emit("playback:jumpTo", ["trackId": track.id]) }
    func remove(_ track: RoomTrack) { emit("room:removeFromQueue", ["itemId": track.id]) }
    func toggleShuffle() { emit("room:toggleShuffle", ["shuffle": !shuffle]) }
    func cycleRepeat() { emit("room:toggleRepeat", ["repeatMode": repeatMode == "off" ? "all" : repeatMode == "all" ? "track" : "off"]) }
    func setParticipantVolume(_ value: Double, socketID: String) {
        guard value.isFinite else { return }
        emit("room:setParticipantVolume", ["targetSocketId": socketID, "volume": min(max(value.rounded(), 0), 100)])
    }
    func seek(to seconds: Double) {
        guard seconds.isFinite, let duration else { return }
        emit("playback:seek", ["position": min(max(0, seconds), duration) * 1000])
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

    func play(_ result: RoomSearchResult) async {
        if let track = queuedTrack(for: result) { jump(to: track); return }
        await enqueue(result, startPlayback: true)
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
