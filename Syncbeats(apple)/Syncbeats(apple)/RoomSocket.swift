import Foundation
import SocketIO
import Observation

/// Real-time room sync client for the macOS app.
///
/// This is the Swift counterpart of the web client's `hooks/useRoom.ts`. It owns
/// the Socket.IO connection and speaks the exact protocol the Express/Socket.IO
/// server expects (see `dev/syncbeats-server/src/handlers/SocketHandler.ts`):
///
///   • Connection + `room:join` (server takes `userId` directly in the payload —
///     there is no handshake-auth middleware).
///   • NTP clock sync: `sync:ping { t0, seq }` → `sync:pong { t0, t1, t2, seq }`.
///     offset = t1 - (t0 + t3) / 2, RTT-gated, IQR-filtered, median of a burst.
///   • Playback commands round-trip through the server (`playback:play/pause/seek/
///     next/prev`) and come back as `room:snapshot` / `room:stateChanged` /
///     `playback:schedule` / `playback:pause`. We never apply playback optimistically.
///
/// The server derives playback position from `{ startEpoch, pauseOffset, isPlaying }`.
/// A client computes `expected = (serverNow - startEpoch) / 1000`, where
/// `serverNow = Date.now() + clockOffset`. `PlayerEngine` consumes the schedule
/// events this service publishes and drift-corrects against that timeline.
@MainActor
@Observable
final class RoomSocket {
    static let shared = RoomSocket()

    // MARK: - Published state (views read these directly)
    private(set) var roomId: String?
    private(set) var isConnected = false
    private(set) var joinStatus: JoinStatus = .idle
    private(set) var participants: [Participant] = []
    private(set) var hostId: String?
    private(set) var currentSocketId: String?
    /// Estimated offset to add to local `Date` to get server time, in ms.
    private(set) var clockOffset: Double = 0
    private(set) var hasClockSync = false
    /// Last measured round-trip time in ms — drives the latency chip in the UI.
    private(set) var latencyMs: Int = 0

    enum JoinStatus: Equatable { case idle, connecting, joined, pending, denied }

    /// Set once (right after auth) so joins can identify the user to the server.
    var currentUser: (id: String, displayName: String)?

    // MARK: - NTP / drift parameters
    // Mirrors the web client's defaults. The web app tunes these per-device via
    // useAdaptiveSync; here we use a single sensible tier to keep the port focused.
    private let ntpSampleCount = 12
    private let ntpRttGateMs: Double = 400
    private let ntpPingGapMs: UInt64 = 60          // ms between pings within a burst
    private let ntpResyncIntervalMs: UInt64 = 5000 // ms between bursts

    // MARK: - Socket internals
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    private var seq = 0
    private var syncInFlight = false
    private var resyncTask: Task<Void, Never>?

    /// Pending NTP pong continuations keyed by seq.
    private var pongWaiters: [Int: CheckedContinuation<(t1: Double, t3: Double), Never>] = [:]

    private init() {}

    // MARK: - Lifecycle

    /// Connect to the server and join `roomId`. Safe to call repeatedly; a second
    /// call while already in a room leaves the old room first.
    func joinRoom(_ id: String) {
        if roomId != nil { leaveRoom() }
        roomId = id
        joinStatus = .connecting

        let base = APIClient.shared.baseURL
        guard let url = URL(string: base) else {
            print("[RoomSocket] invalid base URL: \(base)")
            return
        }

        // Match the web client: websocket-only transport, non-auto-connect.
        let mgr = SocketManager(socketURL: url, config: [
            .forceWebsockets(true),
            .reconnects(true),
            .log(false),
            .compress
        ])
        self.manager = mgr
        let sock = mgr.defaultSocket
        self.socket = sock

        registerHandlers(on: sock)
        sock.connect()
    }

    func leaveRoom() {
        guard let id = roomId else { return }
        socket?.emit("room:leave", ["roomId": id])
        resyncTask?.cancel()
        resyncTask = nil
        socket?.disconnect()
        socket = nil
        manager = nil
        roomId = nil
        joinStatus = .idle
        isConnected = false
        participants = []
        hostId = nil
        currentSocketId = nil
        hasClockSync = false
        clockOffset = 0
        // Flush any waiters so we don't leak continuations.
        for (_, waiter) in pongWaiters { waiter.resume(returning: (t1: 0, t3: 0)) }
        pongWaiters.removeAll()
    }

    /// True while we are in a live room — PlayerEngine uses this to decide whether
    /// to route transport through the server or play locally.
    var isInRoom: Bool { roomId != nil && joinStatus == .joined }

    // MARK: - Transport (round-trips through the server)

    func play() {
        guard let id = roomId else { return }
        socket?.emit("playback:play", ["roomId": id])
    }

    func pause(positionMs: Int) {
        guard let id = roomId else { return }
        socket?.emit("playback:pause", ["roomId": id, "positionMs": positionMs])
    }

    func seek(positionMs: Int) {
        guard let id = roomId else { return }
        socket?.emit("playback:seek", ["roomId": id, "position": positionMs])
    }

    func nextTrack() {
        guard let id = roomId else { return }
        socket?.emit("playback:next", ["roomId": id])
    }

    func prevTrack() {
        guard let id = roomId else { return }
        socket?.emit("playback:prev", ["roomId": id])
    }

    func setReady(_ ready: Bool) {
        guard let id = roomId else { return }
        socket?.emit("room:clientReady", ["roomId": id, "isReady": ready])
    }

    /// Current server time estimate in ms (local Date + measured offset).
    func serverNowMs() -> Double { Date().timeIntervalSince1970 * 1000 + clockOffset }

    // MARK: - Socket event wiring

    private func registerHandlers(on sock: SocketIOClient) {
        sock.on(clientEvent: .connect) { [weak self] _, _ in
            guard let self else { return }
            Task { @MainActor in
                self.isConnected = true
                self.currentSocketId = self.socket?.sid
                self.joinStatus = .connecting
                self.emitJoin()
                await self.runNtpBurst()
                self.startResyncLoop()
            }
        }

        sock.on(clientEvent: .disconnect) { [weak self] _, _ in
            Task { @MainActor in self?.isConnected = false }
        }

        sock.on("room:snapshot") { [weak self] data, _ in
            Task { @MainActor in
                self?.joinStatus = .joined
                self?.applySnapshot(data.first)
            }
        }

        sock.on("room:stateChanged") { [weak self] data, _ in
            Task { @MainActor in self?.applySnapshot(data.first) }
        }

        sock.on("room:participantJoined") { [weak self] data, _ in
            Task { @MainActor in
                guard let dict = data.first as? [String: Any],
                      let p = Participant(dict) else { return }
                if self?.participants.contains(where: { $0.socketId == p.socketId }) == false {
                    self?.participants.append(p)
                }
            }
        }

        sock.on("room:participantLeft") { [weak self] data, _ in
            Task { @MainActor in
                guard let sid = data.first as? String else { return }
                self?.participants.removeAll { $0.socketId == sid }
            }
        }

        sock.on("room:hostChanged") { [weak self] data, _ in
            Task { @MainActor in self?.hostId = data.first as? String }
        }

        // Playback timeline events — handed to PlayerEngine to schedule/pause audio.
        sock.on("playback:schedule") { [weak self] data, _ in
            Task { @MainActor in
                guard let self, let dict = data.first as? [String: Any] else { return }
                let startEpoch = (dict["startEpoch"] as? NSNumber)?.doubleValue ?? 0
                let fromPosition = (dict["fromPosition"] as? NSNumber)?.doubleValue ?? 0
                let trackUrl = dict["trackUrl"] as? String
                PlayerEngine.shared.applyRoomSchedule(
                    startEpochMs: startEpoch,
                    fromPositionSec: fromPosition,
                    trackUrl: trackUrl,
                    clockOffsetMs: self.clockOffset
                )
            }
        }

        sock.on("playback:pause") { [weak self] data, _ in
            Task { @MainActor in
                guard let dict = data.first as? [String: Any] else { return }
                let pauseOffset = (dict["pauseOffset"] as? NSNumber)?.doubleValue ?? 0
                PlayerEngine.shared.applyRoomPause(pauseOffsetSec: pauseOffset)
            }
        }

        sock.on("room:joinPendingApproval") { [weak self] _, _ in
            Task { @MainActor in self?.joinStatus = .pending }
        }
        sock.on("room:joinApproved") { [weak self] _, _ in
            Task { @MainActor in self?.joinStatus = .joined }
        }
        sock.on("room:joinDenied") { [weak self] _, _ in
            Task { @MainActor in self?.joinStatus = .denied }
        }

        // NTP pong — resolve the matching waiter created in pingOnce().
        sock.on("sync:pong") { [weak self] data, _ in
            Task { @MainActor in
                guard let self, let dict = data.first as? [String: Any],
                      let s = (dict["seq"] as? NSNumber)?.intValue,
                      let t1 = (dict["t1"] as? NSNumber)?.doubleValue,
                      let waiter = self.pongWaiters.removeValue(forKey: s) else { return }
                waiter.resume(returning: (t1: t1, t3: Date().timeIntervalSince1970 * 1000))
            }
        }

        sock.on("error") { data, _ in
            if let dict = data.first as? [String: Any], let msg = dict["message"] as? String {
                print("[RoomSocket] server error: \(msg)")
            }
        }
    }

    private func emitJoin() {
        guard let id = roomId else { return }
        var payload: [String: Any] = ["roomId": id, "isReady": true, "deviceId": DeviceIdentity.shared.id]
        if let user = currentUser {
            payload["displayName"] = user.displayName
            payload["userId"] = user.id
        } else {
            payload["displayName"] = "Mac"
        }
        socket?.emit("room:join", payload)
    }

    private func applySnapshot(_ raw: Any?) {
        guard let dict = raw as? [String: Any] else { return }
        hostId = dict["hostId"] as? String
        if let arr = dict["participants"] as? [[String: Any]] {
            participants = arr.compactMap { Participant($0) }
        }
        PlayerEngine.shared.applyRoomSnapshot(dict, clockOffsetMs: clockOffset)
    }

    // MARK: - NTP clock sync

    /// One ping/pong round. Returns t0/t1/t3 (t3 defaults to t0 on timeout so the
    /// sample is naturally rejected by the RTT gate).
    private func pingOnce(seq: Int) async -> (t0: Double, t1: Double, t3: Double) {
        let t0 = Date().timeIntervalSince1970 * 1000
        let result: (t1: Double, t3: Double) = await withCheckedContinuation { cont in
            pongWaiters[seq] = cont
            socket?.emit("sync:ping", ["t0": t0, "seq": seq])
            // 1s timeout: if no pong, resume with a value that fails the RTT gate.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if let waiter = pongWaiters.removeValue(forKey: seq) {
                    waiter.resume(returning: (t1: t0, t3: Date().timeIntervalSince1970 * 1000))
                }
            }
        }
        return (t0: t0, t1: result.t1, t3: result.t3)
    }

    /// A burst of pings; updates `clockOffset` from the IQR-filtered median offset.
    private func runNtpBurst() async {
        if syncInFlight { return }
        syncInFlight = true
        defer { syncInFlight = false }

        var offsets: [Double] = []
        var rtts: [Double] = []

        for _ in 0..<ntpSampleCount {
            seq += 1
            let s = seq
            let (t0, t1, t3) = await pingOnce(seq: s)
            let rtt = t3 - t0
            rtts.append(rtt)
            if rtt <= ntpRttGateMs {
                offsets.append(t1 - (t0 + t3) / 2)
            }
            try? await Task.sleep(nanoseconds: ntpPingGapMs * 1_000_000)
        }

        if !offsets.isEmpty {
            let sorted = offsets.sorted()
            let q1 = sorted[Int(Double(sorted.count) * 0.25)]
            let q3 = sorted[Int(Double(sorted.count) * 0.75)]
            let filtered = sorted.filter { $0 >= q1 && $0 <= q3 }
            let median = filtered.isEmpty
                ? sorted[sorted.count / 2]
                : filtered[filtered.count / 2]
            clockOffset = median
            hasClockSync = true
        }

        if !rtts.isEmpty {
            latencyMs = Int(rtts.reduce(0, +) / Double(rtts.count))
        }
    }

    /// Self-scheduling resync loop — a fresh burst every `ntpResyncIntervalMs`.
    private func startResyncLoop() {
        resyncTask?.cancel()
        resyncTask = Task { @MainActor [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: self.ntpResyncIntervalMs * 1_000_000)
                if Task.isCancelled { break }
                await self.runNtpBurst()
            }
        }
    }
}

// MARK: - Participant model (mirrors server Participant snapshot)

struct Participant: Identifiable, Equatable {
    let socketId: String
    let displayName: String
    let userId: String?
    let isReady: Bool
    let volume: Double
    let isBlocked: Bool

    var id: String { socketId }

    init?(_ dict: [String: Any]) {
        guard let socketId = dict["socketId"] as? String else { return nil }
        self.socketId = socketId
        self.displayName = (dict["displayName"] as? String) ?? "Guest"
        self.userId = dict["userId"] as? String
        self.isReady = (dict["isReady"] as? Bool) ?? false
        self.volume = (dict["volume"] as? NSNumber)?.doubleValue ?? 100
        self.isBlocked = (dict["isBlocked"] as? Bool) ?? false
    }
}
