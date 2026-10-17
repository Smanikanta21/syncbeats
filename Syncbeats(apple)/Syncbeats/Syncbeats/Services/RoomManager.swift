import Foundation
import Combine
import SocketIO
import MusicKit

// Socket.IO hands back JSON numbers as NSNumber; `as? Double` on an integer
// payload is not reliable across bridges, so funnel every numeric read here.
@inline(__always)
func sbNum(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    if let n = value as? NSNumber { return n.doubleValue }
    return nil
}

enum ConnectionState: Equatable {
    case idle
    case connecting
    case connected
    case disconnected

    var label: String {
        switch self {
        case .idle:         return "Offline"
        case .connecting:   return "Connecting"
        case .connected:    return "Connected"
        case .disconnected: return "Reconnecting"
        }
    }
}

struct Participant: Identifiable, Equatable {
    let id: String
    let name: String
    let isReady: Bool
    let volume: Int
    let userId: String?
    let deviceLabel: String?
    let latencyMs: Double?

    init?(dict: [String: Any]) {
        guard let socketId = dict["socketId"] as? String else { return nil }
        self.id = socketId
        self.name = (dict["displayName"] as? String) ?? "Listener"
        self.isReady = (dict["isReady"] as? Bool) ?? false
        self.volume = Int(sbNum(dict["volume"]) ?? 100)
        self.userId = dict["userId"] as? String
        self.deviceLabel = dict["outputDeviceName"] as? String
        self.latencyMs = sbNum(dict["latency"])
    }
}

struct QueueItem: Identifiable, Equatable {
    let id: String
    let title: String
    let artist: String
    let thumbnail: String?
    let trackUrl: String
    let durationSec: Double?
    let isCurrent: Bool

    init?(dict: [String: Any]) {
        guard let id = dict["id"] as? String, let title = dict["title"] as? String else { return nil }
        self.id = id
        self.title = title
        self.artist = (dict["artist"] as? String) ?? "Unknown Artist"
        self.thumbnail = dict["thumbnail"] as? String
        self.trackUrl = (dict["trackUrl"] as? String) ?? ""
        self.durationSec = sbNum(dict["durationSec"])
        self.isCurrent = (dict["isCurrent"] as? Bool) ?? false
    }

    var artworkURL: URL? {
        if let thumbnail, !thumbnail.isEmpty {
            if thumbnail.hasPrefix("http") { return URL(string: thumbnail) }
            return URL(string: Endpoint.baseURL.absoluteString + thumbnail)
        }
        // Fallback: Extract from trackUrl (e.g. youtube:xyz?thumb=...)
        if let url = URL(string: trackUrl.replacingOccurrences(of: "youtube:", with: "youtube://")),
           let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let thumb = components.queryItems?.first(where: { $0.name == "thumb" })?.value {
            return URL(string: thumb)
        }
        return nil
    }
}

enum RepeatMode: String {
    case off, all, track

    var next: RepeatMode {
        switch self {
        case .off: return .all
        case .all: return .track
        case .track: return .off
        }
    }

    var symbol: String { self == .track ? "repeat.1" : "repeat" }
}

/// One room per user (see CLAUDE.md pitfall #8), so one manager. The main window
/// and the notch island both read this instance.
@MainActor
final class RoomManager: ObservableObject {
    static let shared = RoomManager()

    @Published private(set) var roomId: String = ""
    @Published private(set) var connection: ConnectionState = .idle
    @Published private(set) var participants: [Participant] = []
    @Published private(set) var queue: [QueueItem] = []
    @Published private(set) var currentTrack: QueueItem?
    @Published private(set) var isPlaying = false
    @Published private(set) var shuffle = false
    @Published private(set) var repeatMode: RepeatMode = .off
    @Published private(set) var isPrivate = false
    @Published var lastError: String?
    @Published var isEnqueueing = false
    @Published var isSearchingArtwork = false
    @Published var currentAnimatedArtworkURL: URL?

    let clock = SyncClock()

    @Published private(set) var startEpoch: Double?
    @Published private(set) var pauseOffset: Double = 0

    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var resyncTimer: Timer?
    private var bag = Set<AnyCancellable>()

    private init() {
        // Nested ObservableObject: republish so views bound to RoomManager
        // redraw when the clock estimate moves.
        clock.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &bag)
    }

    // MARK: - Derived playback state

    /// Position in seconds, derived from the room timeline in *server* time.
    var positionSec: Double {
        guard isPlaying, let startEpoch else { return pauseOffset }
        return max(0, (clock.serverNow - startEpoch) / 1000)
    }
    var durationSec: Double {
        if let duration = currentTrack?.durationSec, duration > 0 { return duration }
        return AudioEngine.shared.currentDuration
    }
    var progress: Double {
        guard durationSec > 0 else { return 0 }
        return min(1, positionSec / durationSec)
    }

    var upNext: [QueueItem] {
        guard let currentTrack, let idx = queue.firstIndex(where: { $0.id == currentTrack.id }) else { return queue }
        return Array(queue.dropFirst(idx + 1))
    }

    var readyCount: Int { participants.filter(\.isReady).count }

    // MARK: - Connection

    func connect(roomId: String) {
        guard self.roomId != roomId || connection == .idle || connection == .disconnected else { return }
        disconnect()

        self.roomId = roomId
        connection = .connecting

        let manager = SocketManager(socketURL: Endpoint.baseURL, config: [
            .compress,
            .forceWebsockets(true),
            .reconnects(true),
            .reconnectWait(1),
            .log(false),
        ])
        let socket = manager.defaultSocket
        self.manager = manager
        self.socket = socket

        socket.on(clientEvent: .connect) { [weak self] _, _ in
            Task { @MainActor in self?.onConnected() }
        }

        socket.on(clientEvent: .disconnect) { [weak self] _, _ in
            Task { @MainActor in
                self?.connection = .disconnected
                self?.stopResyncLoop()
            }
        }

        socket.on(clientEvent: .error) { [weak self] data, _ in
            Task { @MainActor in self?.lastError = "Connection error: \(data.first ?? "unknown")" }
        }

        // room:snapshot fires on join/reconnect — always re-declare ready so the
        // server's isReady flag is correct even after a socket reconnect.
        socket.on("room:snapshot") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            Task { @MainActor in
                self?.apply(snapshot: dict)
                // Re-assert readiness immediately if we already have the file loaded.
                if let track = self?.currentTrack, AudioEngine.shared.hasAudioFileLoaded {
                    print("RoomManager: Re-asserting clientReady after room:snapshot (reconnect/join)")
                    self?.emitClientReady(trackUrl: track.trackUrl)
                }
            }
        }

        // room:stateChanged is high-frequency — just apply the state, no readiness re-emit.
        socket.on("room:stateChanged") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any] else { return }
            Task { @MainActor in self?.apply(snapshot: dict) }
        }

        socket.on("room:queueChanged") { [weak self] data, _ in
            guard let dict = data.first as? [String: Any],
                  let raw = dict["queue"] as? [[String: Any]] else { return }
            Task { @MainActor in self?.apply(queue: raw) }
        }

        socket.on("room:queueSynced") { [weak self] data, _ in
            if let raw = data.first as? [[String: Any]] {
                Task { @MainActor in self?.apply(queue: raw) }
            } else if let dict = data.first as? [String: Any],
                      let raw = dict["queue"] as? [[String: Any]] {
                Task { @MainActor in self?.apply(queue: raw) }
            }
        }

        socket.on("sync:pong") { [weak self] data, _ in
            // Stamp t3 before any actor hop, or the hop lands in the RTT.
            let t3 = SyncClock.nowMs()
            guard let dict = data.first as? [String: Any],
                  let t1 = sbNum(dict["t1"]),
                  let seq = sbNum(dict["seq"]).map({ Int($0) }) else { return }
            Task { @MainActor in self?.clock.accept(seq: seq, t1: t1, t3: t3) }
        }

        socket.on("room:notFound") { [weak self] data, _ in
            let message = (data.first as? [String: Any])?["message"] as? String
            Task { @MainActor in self?.lastError = message ?? "That room no longer exists." }
        }

        socket.on("error") { [weak self] data, _ in
            let message = (data.first as? [String: Any])?["message"] as? String
            Task { @MainActor in self?.lastError = message }
        }

        socket.connect()
    }

    func disconnect() {
        stopResyncLoop()
        socket?.removeAllHandlers()
        socket?.disconnect()
        socket = nil
        manager = nil
        clock.reset()
        connection = .idle
        participants = []
        queue = []
        currentTrack = nil
        isPlaying = false
        startEpoch = nil
        pauseOffset = 0
    }

    private func onConnected() {
        connection = .connected
        lastError = nil

        // isReady: false — the Mac has an audio engine and needs to buffer
        // before playing, so it holds the readiness gate.
        socket?.emit("room:join", [
            "roomId": roomId,
            "displayName": AuthManager.shared.currentUser?.name ?? Endpoint.deviceName,
            "userId": AuthManager.shared.currentUser?.id ?? "",
            "deviceId": Endpoint.deviceId,
            "isReady": false,
        ] as [String: Any])

        socket?.emit("room:updateDevice", [
            "roomId": roomId,
            "deviceName": Endpoint.deviceName,
            "deviceType": "native-mac",
        ] as [String: Any])

        burstPing(count: 7, spacingMs: 120)
        startResyncLoop()
    }

    func emitClientReady(trackUrl: String) {
        emit("room:clientReady", ["trackUrl": trackUrl, "isReady": true])
    }

    func emitPlaybackEnded(trackUrl: String) {
        guard !roomId.isEmpty else { return }
        emit("playback:ended", ["roomId": roomId, "trackUrl": trackUrl])
    }

    // MARK: - Clock sync

    private func ping() {
        guard socket?.status == .connected else { return }
        let (t0, seq) = clock.nextPing()
        socket?.emit("sync:ping", ["t0": t0, "seq": seq] as [String: Any])
    }

    private func burstPing(count: Int, spacingMs: Int) {
        for i in 0..<count {
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(i * spacingMs)) { [weak self] in
                Task { @MainActor in self?.ping() }
            }
        }
    }

    private func startResyncLoop() {
        stopResyncLoop()
        resyncTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.burstPing(count: 3, spacingMs: 120) }
        }
    }

    private func stopResyncLoop() {
        resyncTimer?.invalidate()
        resyncTimer = nil
    }

    // MARK: - Inbound state

    private func apply(snapshot: [String: Any]) {
        if let raw = snapshot["participants"] as? [[String: Any]] {
            participants = raw.compactMap(Participant.init(dict:))
        }
        if let raw = snapshot["queue"] as? [[String: Any]] {
            apply(queue: raw)
        }
        let newIsPlaying = (snapshot["isPlaying"] as? Bool) ?? false
        let newStartEpoch = sbNum(snapshot["startEpoch"])
        let newPauseOffset = sbNum(snapshot["pauseOffset"]) ?? 0
        
        if (newIsPlaying != isPlaying || newStartEpoch != startEpoch || newPauseOffset != pauseOffset), let lastTime = lastPlaybackCommandTime {
            let latencyMs = Date().timeIntervalSince(lastTime) * 1000
            print("RoomManager: Playback command roundtrip latency: \(String(format: "%.0f", latencyMs))ms")
            lastPlaybackCommandTime = nil
        }
        
        isPlaying = newIsPlaying
        startEpoch = newStartEpoch
        pauseOffset = newPauseOffset
        
        shuffle = (snapshot["shuffle"] as? Bool) ?? false
        isPrivate = (snapshot["isPrivate"] as? Bool) ?? false
        if let raw = snapshot["repeatMode"] as? String, let mode = RepeatMode(rawValue: raw) {
            repeatMode = mode
        }
    }

    private func apply(queue raw: [[String: Any]]) {
        queue = raw.compactMap(QueueItem.init(dict:))
        let newTrack = queue.first(where: \.isCurrent) ?? queue.first
        
        if currentTrack?.id != newTrack?.id {
            currentTrack = newTrack
            if let t = newTrack {
                Task { await fetchAnimatedArtwork(for: t) }
            } else {
                currentAnimatedArtworkURL = nil
            }
        }
    }
    
    private func fetchAnimatedArtwork(for track: QueueItem) async {
        isSearchingArtwork = true
        defer { isSearchingArtwork = false }
        
        // 1. Search MusicKit for the track
        let term = "\(track.title) \(track.artist)"
        do {
            guard MusicAuthorization.currentStatus == .authorized else { return }
            var request = MusicCatalogSearchRequest(term: term, types: [Song.self])
            request.limit = 1
            let response = try await request.response()
            guard let song = response.songs.first, let albumUrl = song.url else { return }
            
            // 2. Scrape Apple Music webpage
            let (data, _) = try await URLSession.shared.data(from: albumUrl)
            guard let html = String(data: data, encoding: .utf8) else { return }
            
            if let range = html.range(of: "<amp-ambient-video") {
                let substring = html[range.upperBound...]
                if let srcRange = substring.range(of: "src=\"") {
                    let urlStart = srcRange.upperBound
                    let remaining = substring[urlStart...]
                    if let endQuote = remaining.range(of: "\"") {
                        let videoUrlStr = String(remaining[..<endQuote.lowerBound])
                        if let vUrl = URL(string: videoUrlStr) {
                            await MainActor.run {
                                self.currentAnimatedArtworkURL = vUrl
                            }
                        }
                    }
                }
            }
        } catch {
            print("Artwork fetch failed: \(error)")
        }
    }

    private var lastPlaybackCommandTime: Date?
    
    // MARK: - Playback commands
    //
    // Nothing is applied optimistically — every command round-trips through the
    // server and comes back as room:stateChanged, same as the web client.

    private func emit(_ event: String, _ payload: [String: Any] = [:]) {
        guard socket?.status == .connected else {
            lastError = "Not connected to the room."
            return
        }
        var body = payload
        body["roomId"] = roomId
        
        if event.starts(with: "playback:") {
            lastPlaybackCommandTime = Date()
        }
        
        socket?.emit(event, body)
    }

    func togglePlayPause() { isPlaying ? pause() : play() }
    func play()  { emit("playback:play") }
    func pause() { emit("playback:pause", ["positionMs": positionSec * 1000]) }
    func next()  { emit("playback:next") }
    func previous() { emit("playback:prev") }

    /// The server's `playback:seek` takes **milliseconds** despite the field name.
    func seek(toSeconds seconds: Double) { emit("playback:seek", ["position": seconds * 1000]) }

    func jump(to item: QueueItem) { emit("playback:jumpTo", ["trackId": item.id]) }
    func remove(_ item: QueueItem) { emit("room:removeFromQueue", ["itemId": item.id]) }

    func reorder(itemId: String, newIndex: Int) async {
        guard let currentIdx = queue.firstIndex(where: { $0.id == itemId }) else { return }
        var updated = queue
        let item = updated.remove(at: currentIdx)
        let targetIdx = max(0, min(newIndex, updated.count))
        updated.insert(item, at: targetIdx)
        self.queue = updated

        struct ReorderResponse: Decodable { let ok: Bool? }
        do {
            let _: ReorderResponse = try await APIClient.shared.request(
                path: "/rooms/\(roomId)/queue/reorder",
                method: "PUT",
                json: ["itemId": itemId, "newIndex": targetIdx],
                requiresAuth: true
            )
        } catch {
            print("RoomManager: Reorder request failed: \(error)")
        }
    }

    func moveAfter(itemId: String, targetId: String) async {
        guard itemId != targetId,
              let targetIdx = queue.firstIndex(where: { $0.id == targetId }) else { return }
        await reorder(itemId: itemId, newIndex: targetIdx + 1)
    }
    func toggleShuffle() { emit("room:toggleShuffle", ["shuffle": !shuffle]) }
    func cycleRepeat() { emit("room:toggleRepeat", ["repeatMode": repeatMode.next.rawValue]) }
    func togglePrivate() { emit("room:togglePrivate", ["isPrivate": !isPrivate]) }
    func setVolume(_ volume: Int, for participant: Participant) {
        emit("room:setParticipantVolume", ["targetSocketId": participant.id, "volume": volume])
    }

    // MARK: - Apple Music → queue

    /// The queue entry for this song, if it's already in there.
    ///
    /// ponytail: matched on title alone, case- and whitespace-insensitive. The
    /// enqueue call only forwards the title (the artist on the queue item comes back
    /// from YouTube metadata and rarely matches Apple's), so artist can't be part of
    /// the key. Two different songs sharing a title collide — add artist here if that
    /// ever bites.
    func queued(title: String) -> QueueItem? {
        let needle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return queue.first { $0.title.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(needle) == .orderedSame }
    }

    func isQueued(title: String) -> Bool { queued(title: title) != nil }

    /// Apple Music tracks can't be uploaded, so MusicBridge maps them to a YouTube
    /// equivalent and the normal enqueue route takes it from there.
    func enqueueFromAppleMusic(title: String, artist: String, playNow: Bool = false) async {
        struct Resolved: Decodable { let youtubeId: String }
        struct DecodedItem: Decodable { let id: String }
        struct Ack: Decodable { let item: DecodedItem? }

        // Already queued → jump to it instead of stacking a second copy. This is also
        // what stops a double-click (play-now) from adding the song twice: the
        // single-tap handler fires first and the second tap lands here.
        if let existing = queued(title: title) {
            if playNow { jump(to: existing) }
            return
        }

        isEnqueueing = true
        defer { isEnqueueing = false }

        do {
            let resolved: Resolved = try await APIClient.shared.request(
                path: "/api/bridge/resolve",
                method: "POST",
                json: ["title": title, "artist": artist],
                requiresAuth: true
            )
            let ack: Ack = try await APIClient.shared.request(
                path: "/rooms/\(roomId)/enqueue-youtube",
                method: "POST",
                json: [
                    "youtubeUrl": "https://www.youtube.com/watch?v=\(resolved.youtubeId)",
                    "title": title,
                ],
                requiresAuth: true
            )
            if playNow, let trackId = ack.item?.id {
                self.emit("playback:jumpTo", ["trackId": trackId])
            }
        } catch {
            lastError = "Couldn't add “\(title)”: \(error.localizedDescription)"
        }
    }

    /// Enqueues a track from a raw search query or YouTube link
    func enqueueSearch(query: String) async {
        if query.contains("youtube.com") || query.contains("youtu.be") {
            struct DecodedItem: Decodable { let id: String }
            struct Ack: Decodable { let item: DecodedItem? }
            
            isEnqueueing = true
            defer { isEnqueueing = false }
            do {
                let ack: Ack = try await APIClient.shared.request(
                    path: "/rooms/\(roomId)/enqueue-youtube",
                    method: "POST",
                    json: ["youtubeUrl": query],
                    requiresAuth: true
                )
                if let trackId = ack.item?.id { self.emit("playback:jumpTo", ["trackId": trackId]) }
            } catch {
                lastError = "Couldn't add link: \(error.localizedDescription)"
            }
        } else {
            await enqueueFromAppleMusic(title: query, artist: "", playNow: true)
        }
    }
}
