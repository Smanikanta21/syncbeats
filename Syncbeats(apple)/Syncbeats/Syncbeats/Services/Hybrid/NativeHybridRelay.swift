import Foundation
import Network
import Observation

struct NativeNearbyPeer: Identifiable {
    let id: String
    let endpoint: NWEndpoint
    var alternatives: [NWEndpoint] = []
    var network = NativeNetworkSamples()
    var playback: NativePlaybackAlignment?
    var successes = 0
    var failures = 0
    var cachedKeys: Set<String> = []
    var retryAfter: Date = .distantPast
    func metrics(at uptime: TimeInterval) -> NativeNetworkMetrics? {
        network.metrics(at: uptime, maxAge: 24)
    }

    var rtt: Double { metrics(at: ProcessInfo.processInfo.systemUptime)?.rttMS ?? .infinity }
    var usable: Bool {
        guard successes >= 2, failures < 2, retryAfter < Date(),
              let metrics = metrics(at: ProcessInfo.processInfo.systemUptime),
              let jitter = metrics.jitterMS else { return false }
        return metrics.rttMS < 100 && jitter < 40
    }
}

/// LAN carries cached audio and clock probes; queue/control remain cloud-authoritative.
@MainActor @Observable
final class NativeHybridRelay {
    private(set) var peers: [NativeNearbyPeer] = []
    private(set) var localNetworkUnavailable = false
    private(set) var lastLocalError: String?
    private(set) var lastAudioSource = "Cloud"
    let proximity = NativeBluetoothProximity()
    @ObservationIgnored private var credential: NativeHybridCredential?
    @ObservationIgnored private var ownID = ""
    @ObservationIgnored private var members: Set<String> = []
    private(set) var clockPeerID: String?
    var isClockLeader: Bool { clockPeerID == ownID }
    @ObservationIgnored private var permittedKeys: Set<String> = []
    @ObservationIgnored private var listener: NWListener?
    @ObservationIgnored private var browser: NWBrowser?
    @ObservationIgnored private var probeTask: Task<Void, Never>?
    @ObservationIgnored private var renewalTask: Task<Void, Never>?
    @ObservationIgnored private var channels: [UUID: NativePeerChannel] = [:]
    @ObservationIgnored private var senders: Set<UUID> = []
    @ObservationIgnored private var networkGeneration = UUID()
    @ObservationIgnored private var probing = false
    @ObservationIgnored private var cache: NativeAudioPrefetch?
    @ObservationIgnored private var foreground = true
    @ObservationIgnored private let localAddresses: @Sendable () -> [String]
    @ObservationIgnored var renewCredential: (() -> Void)?
    /// Only a fresh direct-cloud estimate can be relayed; never chain LAN clocks.
    @ObservationIgnored var clockEstimate: (() -> (time: Double, uncertainty: Double)?)?
    @ObservationIgnored var onClockSample: ((Double, Double, Double) -> Void)?
    @ObservationIgnored var playbackEstimate: (() -> NativePlaybackAlignment?)?

    init(localAddresses: @escaping @Sendable () -> [String] = { NativePeerAddress.localIPv4() }) {
        self.localAddresses = localAddresses
    }

    var connectionLabel: String {
        if peers.contains(where: \.usable) { return "Local connection ready" }
        if members.count > 1, credential?.valid != true { return "Cloud · local sync awaiting server authorization" }
        return localNetworkUnavailable ? "Cloud · local network unavailable" : "Cloud connection"
    }
    func updateMembers(_ participants: [RoomParticipant], ownID: String, tracks: [RoomTrack]) {
        self.ownID = ownID
        members = Set(participants.map(\.id))
        clockPeerID = participants.filter(Self.isMacClockCandidate).map(\.id).sorted().first
        permittedKeys = Set(tracks.map { YouTubeIdentity.key(for: $0.trackUrl) })
        peers.removeAll { !members.contains($0.id) }
        updateBluetooth()
    }

    static func isMacClockCandidate(_ participant: RoomParticipant) -> Bool {
        let type = participant.outputDeviceType?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if ["mobile", "phone", "tablet", "iphone", "ipad", "android"].contains(type ?? "") { return false }
        if type == "mac" || type == "macos" { return true }
        let output = participant.outputDeviceName?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if output == "mac" || output == "macos" || output.hasPrefix("macbook") || output == "imac"
            || ["mac mini", "mac studio", "mac pro"].contains(output) { return true }
        return participant.displayName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased().hasSuffix(" · mac")
    }
    func configureCache(_ cache: NativeAudioPrefetch) {
        self.cache = cache
        Task { [weak self] in
            await cache.setPeerDownload { [weak self] key in try await self?.file(for: key) }
        }
    }
    func accept(_ credential: NativeHybridCredential) {
        guard credential.valid, members.contains(ownID) else { return }
        guard credential != self.credential else { return }
        stopNetwork()
        self.credential = credential
        renewalTask?.cancel()
        renewalTask = Task { [weak self] in
            let delay = max(1, credential.expiresAt / 1000 - Date().timeIntervalSince1970 - 30)
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.stopNetwork()
            self?.renewCredential?()
        }
        if foreground { startNetwork() }
    }
    func setForeground(_ foreground: Bool) {
        guard self.foreground != foreground else { return }
        self.foreground = foreground
        if foreground { startNetwork(); renewCredential?() }
        else { stopNetwork() }
    }
    func stop() {
        credential = nil; members = []; ownID = ""; permittedKeys = []
        stopNetwork(); renewalTask?.cancel(); renewalTask = nil
        lastAudioSource = "Cloud"; localNetworkUnavailable = false
    }
    private func updateBluetooth() {
        proximity.configure(tag: foreground && credential?.valid == true ? credential?.tag : nil,
                            ownID: ownID, memberIDs: members)
    }
    private func startNetwork() {
        guard foreground, let credential, credential.valid, listener == nil, members.contains(ownID) else { return }
        localNetworkUnavailable = false
        let queue = DispatchQueue(label: "in.syncbeats.peer.discovery", qos: .utility)
        let generation = networkGeneration
        let advertisingID = ownID
        let addresses = localAddresses()
        do {
            let listener = try NWListener(using: NativePeerProtocol.parameters(credential))
            listener.service = NWListener.Service(name: credential.tag + "." + ownID, type: "_syncbeats._tcp")
            listener.newConnectionHandler = { [weak self] connection in
                Task { @MainActor [weak self] in
                    guard self?.networkGeneration == generation else { connection.cancel(); return }
                    self?.serve(connection)
                }
            }
            listener.stateUpdateHandler = { [weak self, weak listener] state in
                if case .failed = state {
                    Task { @MainActor [weak self] in
                        guard self?.networkGeneration == generation else { return }
                        self?.localNetworkUnavailable = true
                    }
                }
                if case .ready = state, let listener, let port = listener.port, port.rawValue > 0 {
                    listener.service = NWListener.Service(name: credential.tag + "." + advertisingID, type: "_syncbeats._tcp",
                        txtRecord: NWTXTRecord(["v": "1", "port": String(port.rawValue), "ipv4": addresses.joined(separator: ",")]))
                }
            }
            self.listener = listener; listener.start(queue: queue)
            let options = NWParameters(); options.includePeerToPeer = true
            let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_syncbeats._tcp", domain: nil), using: options)
            browser.browseResultsChangedHandler = { [weak self] results, _ in
                Task { @MainActor [weak self] in
                    guard self?.networkGeneration == generation else { return }
                    self?.discovered(results)
                }
            }
            browser.stateUpdateHandler = { [weak self] state in
                switch state {
                case .waiting, .failed:
                    Task { @MainActor [weak self] in
                        guard self?.networkGeneration == generation else { return }
                        self?.localNetworkUnavailable = true
                    }
                default: break
                }
            }
            self.browser = browser; browser.start(queue: queue)
            updateBluetooth()
            probeTask = Task { [weak self] in
                while !Task.isCancelled {
                    await self?.probePeers()
                    try? await Task.sleep(for: .seconds(8))
                }
            }
        } catch { localNetworkUnavailable = true }
    }
    private func stopNetwork() {
        networkGeneration = UUID()
        probing = false
        listener?.cancel(); listener = nil; browser?.cancel(); browser = nil
        probeTask?.cancel(); probeTask = nil
        channels.values.forEach { $0.close() }; channels = [:]; senders = []; peers = []
        proximity.configure(tag: nil, ownID: ownID, memberIDs: members)
    }
    private func discovered(_ results: Set<NWBrowser.Result>) {
        guard let credential else { return }
        var found: [NativeNearbyPeer] = []
        for result in results {
            guard case .service(let name, _, _, _) = result.endpoint,
                  name.hasPrefix(credential.tag + ".") else { continue }
            let id = String(name.dropFirst(credential.tag.count + 1))
            guard id != ownID, members.contains(id) else { continue }
            let direct = NativePeerAddress.endpoints(result.metadata)
            let endpoint = direct.first ?? result.endpoint
            let previous = peers.first { $0.id == id && $0.endpoint == endpoint }
            found.append(previous ?? NativeNearbyPeer(id: id, endpoint: endpoint, alternatives: Array(direct.dropFirst()) + [result.endpoint]))
            if found.count == 8 { break }
        }
        peers = found
        if !found.isEmpty { localNetworkUnavailable = false }
        if found.contains(where: { $0.successes == 0 && $0.failures == 0 }) {
            let generation = networkGeneration
            Task { [weak self] in
                await self?.probePeers()
                try? await Task.sleep(for: .milliseconds(150))
                guard self?.networkGeneration == generation else { return }
                await self?.probePeers()
            }
        }
    }
    private func open(_ peer: NativeNearbyPeer) async throws -> (UUID, NativePeerChannel) {
        guard foreground, let credential, credential.valid, channels.count < 8 else { throw NativePeerFailure.unavailable }
        var lastError: Error = NativePeerFailure.unavailable
        for endpoint in ([peer.endpoint] + peer.alternatives).prefix(3) {
            try Task.checkCancellation()
            let channel = NativePeerChannel(NWConnection(to: endpoint, using: NativePeerProtocol.parameters(credential)))
            let id = UUID(); channels[id] = channel
            do { try await channel.start(); return (id, channel) }
            catch { channels[id] = nil; channel.close(); lastError = error }
        }
        throw lastError
    }
    private func failure(_ id: String) {
        guard let index = peers.firstIndex(where: { $0.id == id }) else { return }
        peers[index].failures += 1; peers[index].successes = 0
        if peers[index].failures >= 2 { peers[index].retryAfter = Date().addingTimeInterval(30) }
    }
    private func probePeers() async {
        guard let credential, !probing else { return }
        let generation = networkGeneration
        probing = true
        defer { if generation == networkGeneration { probing = false } }
        for peer in peers where peer.retryAfter < Date() {
            guard !Task.isCancelled, generation == networkGeneration, self.credential == credential else { return }
            do {
                let (id, channel) = try await open(peer)
                defer { channel.close(); channels[id] = nil }
                let sent = NativeClockStamp.now()
                try await channel.sendMessage(NativePeerMessage(kind: "probe", socketID: ownID, tag: credential.tag))
                let reply = try await channel.receiveMessage()
                let received = NativeClockStamp.now()
                let elapsed = (received.uptime - sent.uptime) * 1000
                let handling = reply.handlingMS ?? 0
                guard !Task.isCancelled, generation == networkGeneration, self.credential == credential,
                      let index = peers.firstIndex(where: { $0.id == peer.id && $0.endpoint == peer.endpoint }) else { continue }
                guard reply.socketID == peer.id, reply.tag == credential.tag, reply.kind == "probe",
                      (0...elapsed).contains(handling), elapsed <= 5_000 else { throw NativePeerFailure.malformed }
                let rtt = elapsed - handling
                peers[index].network.record(rtt, at: received.uptime)
                peers[index].playback = reply.playback.flatMap { $0.valid ? $0 : nil }
                peers[index].successes += 1; peers[index].failures = 0
                peers[index].cachedKeys = Set((reply.keys ?? []).filter { permittedKeys.contains($0) }.prefix(2))
                if peer.id == clockPeerID, peers[index].usable, sent.isFresh(at: received, maxAge: 5),
                   let time = reply.serverTime, time.isFinite,
                   let uncertainty = reply.uncertainty, uncertainty.isFinite, uncertainty >= 0 {
                    onClockSample?(time - (sent.wallMS + elapsed - rtt / 2), rtt, uncertainty + rtt / 2)
                }
            } catch {
                if !Task.isCancelled, generation == networkGeneration {
                    lastLocalError = String(describing: error)
                    failure(peer.id)
                }
            }
        }
    }
    func file(for key: String) async throws -> NativeAudioFile? {
        // Let the join credential and Bonjour arrive before spending WAN bytes.
        if foreground && members.count > 1 {
            let limit = ProcessInfo.processInfo.systemUptime + 1.2
            while !peers.contains(where: \.usable), ProcessInfo.processInfo.systemUptime < limit {
                try Task.checkCancellation()
                guard foreground, permittedKeys.contains(key) else { return nil }
                try await Task.sleep(for: .milliseconds(60))
            }
        }
        guard foreground, let credential, credential.valid, permittedKeys.contains(key) else { return nil }
        let candidates = peers.filter(\.usable).sorted {
            if $0.cachedKeys.contains(key) != $1.cachedKeys.contains(key) { return $0.cachedKeys.contains(key) }
            if ($0.id == clockPeerID) != ($1.id == clockPeerID) { return $0.id == clockPeerID }
            return $0.rtt < $1.rtt
        }.prefix(2)
        for peer in candidates {
            try Task.checkCancellation()
            do {
                let (id, channel) = try await open(peer)
                defer { channel.close(); channels[id] = nil }
                try await channel.sendMessage(NativePeerMessage(kind: "file", socketID: ownID, tag: credential.tag, trackKey: key))
                let reply = try await channel.receiveMessage()
                guard self.credential == credential, reply.socketID == peer.id, reply.tag == credential.tag,
                      reply.trackKey == key else { throw NativePeerFailure.malformed }
                if reply.kind == "missing" { continue }
                guard reply.kind == "file", let bytes = reply.bytes, let digest = reply.digest else { throw NativePeerFailure.malformed }
                let file = try await channel.receiveFile(bytes: bytes, digest: digest)
                try Task.checkCancellation()
                guard self.credential == credential else { throw CancellationError() }
                lastAudioSource = "Local"; return file
            } catch {
                try Task.checkCancellation()
                failure(peer.id)
            }
        }
        lastAudioSource = "Cloud"
        return nil
    }
    private func authorize(_ message: NativePeerMessage, credential: NativeHybridCredential) -> Bool {
        foreground && self.credential == credential && credential.valid && message.tag == credential.tag &&
        message.socketID != ownID && members.contains(message.socketID)
    }
    private func asset(_ key: String, channelID: UUID) async -> NativeAudioFile? {
        guard permittedKeys.contains(key), senders.count < 2, let file = await cache?.cachedFile(for: key),
              channels[channelID] != nil, senders.count < 2 else { return nil }
        senders.insert(channelID)
        return file
    }
    private func cachedKeys() async -> [String] {
        Array((await cache?.availableKeys() ?? []).filter { permittedKeys.contains($0) }.prefix(2))
    }
    private func probeReply(to request: NativePeerMessage, credential: NativeHybridCredential,
                            received: TimeInterval) async -> NativePeerMessage? {
        let keys = await cachedKeys()
        guard authorize(request, credential: credential) else { return nil }
        let playback = playbackEstimate?()
        let clock = clockEstimate?()
        return NativePeerMessage(kind: "probe", socketID: ownID, tag: credential.tag, serverTime: clock?.time,
            uncertainty: clock?.uncertainty, keys: keys, handlingMS: (ProcessInfo.processInfo.systemUptime - received) * 1000,
            playback: playback)
    }
    private func serve(_ connection: NWConnection) {
        guard foreground, let credential, credential.valid, channels.count < 8 else { connection.cancel(); return }
        let channel = NativePeerChannel(connection)
        let id = UUID(); channels[id] = channel
        let serverID = ownID
        Task.detached(priority: .utility) { [weak self] in
            defer { channel.close(); Task { @MainActor [weak self] in self?.channels[id] = nil; self?.senders.remove(id) } }
            do {
                try await channel.start()
                let request = try await channel.receiveMessage()
                let received = ProcessInfo.processInfo.systemUptime
                guard await self?.authorize(request, credential: credential) == true else { return }
                if request.kind == "probe" {
                    guard let reply = await self?.probeReply(to: request, credential: credential, received: received) else { return }
                    try await channel.sendMessage(reply)
                } else if request.kind == "file", let key = request.trackKey {
                    guard let file = await self?.asset(key, channelID: id), file.byteCount <= NativePeerProtocol.maxFileBytes else {
                        try await channel.sendMessage(NativePeerMessage(kind: "missing", socketID: serverID, tag: credential.tag, trackKey: key))
                        return
                    }
                    let digest = try NativePeerProtocol.digest(file.url)
                    try await channel.sendMessage(NativePeerMessage(kind: "file", socketID: serverID, tag: credential.tag,
                        trackKey: key, bytes: file.byteCount, digest: digest))
                    try await channel.sendFile(file)
                }
            } catch { /* Permission loss and peers leaving use the cloud fallback. */ }
        }
    }
}
