import Foundation
import Network

private actor HybridCounter {
    var count = 0
    func increment() { count += 1 }
}

@main struct NativeHybridVerification {
    nonisolated static let credential = NativeHybridCredential(roomId: "verification", key: Data(repeating: 7, count: 32).base64EncodedString(), tag: "123456789012345678901234", expiresAt: Date().timeIntervalSince1970 * 1000 + 600_000)

    nonisolated static func withPeer<T: Sendable>(clientCredential: NativeHybridCredential = credential,
        serve: @escaping @Sendable (NativePeerChannel) async throws -> Void,
        receive: @escaping @Sendable (NativePeerChannel) async throws -> T) async throws -> T {
        let listener = try NWListener(using: NativePeerProtocol.parameters(credential), on: .any)
        listener.newConnectionHandler = { connection in
            let channel = NativePeerChannel(connection)
            Task.detached {
                defer { channel.close() }
                do { try await channel.start(); try await serve(channel) } catch { }
            }
        }
        defer { listener.cancel() }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready: listener.stateUpdateHandler = nil; continuation.resume()
                case .failed(let error): listener.stateUpdateHandler = nil; continuation.resume(throwing: error)
                default: break
                }
            }
            listener.start(queue: DispatchQueue(label: "hybrid.test.listener"))
        }
        guard let port = listener.port else { throw NativePeerFailure.unavailable }
        let channel = NativePeerChannel(NWConnection(host: "127.0.0.1", port: port, using: NativePeerProtocol.parameters(clientCredential)))
        defer { channel.close() }
        try await channel.start()
        return try await receive(channel)
    }
    nonisolated static func transfer(_ file: NativeAudioFile, corrupt: Bool = false) async throws -> NativeAudioFile {
        try await withPeer { channel in
            let request = try await channel.receiveMessage()
            let digest = corrupt ? String(repeating: "0", count: 64) : try NativePeerProtocol.digest(file.url)
            try await channel.sendMessage(NativePeerMessage(kind: "file", socketID: "seed", tag: credential.tag,
                trackKey: request.trackKey, bytes: file.byteCount, digest: digest))
            try await channel.sendFile(file)
        } receive: { channel in
            try await channel.sendMessage(NativePeerMessage(kind: "file", socketID: "receive", tag: credential.tag, trackKey: "youtube:aaaaaaaaaaa"))
            let reply = try await channel.receiveMessage()
            return try await channel.receiveFile(bytes: reply.bytes!, digest: reply.digest!)
        }
    }
    @MainActor static func main() async throws {
        var checks = 0
        func check(_ valid: Bool, _ message: String) {
            guard valid else { print("FAIL: \(message)"); exit(1) }
            checks += 1; print("PASS: \(message)")
        }
        var network = NativeNetworkSamples()
        network.record(8, at: 1)
        check(network.metrics(at: 1, maxAge: 24)?.jitterMS == nil, "One probe supplies RTT without inventing jitter")
        for (time, rtt) in [10.0, 300, 9, 8, 9, 10, 8].enumerated() {
            network.record(rtt, at: Double(time + 2))
        }
        network.record(.nan, at: 9)
        network.record(5, at: 0)
        let filtered = network.metrics(at: 8, maxAge: 24)
        check(filtered?.rttMS == 9 && filtered?.jitterMS == 2,
              "Rolling RTT and jitter resist a spike and discard invalid or reordered samples")
        check(network.metrics(at: 33, maxAge: 24) == nil, "Expired probes stop supplying network metrics")
        network.record(26, at: 54)
        check(network.metrics(at: 54, maxAge: 24)?.jitterMS == nil, "Probe history expires after a long outage")
        let clock = NativeClockStamp(wallMS: 1_000, uptime: 1)
        check(clock.isFresh(at: NativeClockStamp(wallMS: 2_000, uptime: 2), maxAge: 5) &&
              !clock.isFresh(at: NativeClockStamp(wallMS: 2_100, uptime: 2), maxAge: 5),
              "A wall clock jump disqualifies clock samples without invalidating monotonic RTT")
        func participant(_ name: String, output: String?, type: String?) -> RoomParticipant {
            RoomParticipant(socketId: name, displayName: name, isReady: false, isBlocked: nil,
                            userId: nil, outputDeviceName: output, outputDeviceType: type)
        }
        check(!NativeHybridRelay.isMacClockCandidate(participant("Mac's iPhone", output: "iPhone", type: "mobile")), "A phone with Mac in its name cannot become the clock source")
        check(!NativeHybridRelay.isMacClockCandidate(participant("Mac user", output: "Windows laptop", type: "laptop")), "A generic laptop or user name does not identify macOS")
        check(NativeHybridRelay.isMacClockCandidate(participant("Listener", output: "Mac", type: "laptop")), "Native Mac output metadata identifies a clock source")
        check(NativeHybridRelay.isMacClockCandidate(participant("Listener · Mac", output: nil, type: nil)), "Legacy native Mac identity remains compatible")
        check(!NativeHybridRelay.isMacClockCandidate(participant("Listener · Mac", output: "iPad", type: "tablet")), "Explicit mobile metadata overrides a stale Mac suffix")
        check(credential.valid, "Room credential has a 32-byte secret and future expiry")
        check(!NativeHybridCredential(roomId: "x", key: "invalid", tag: credential.tag, expiresAt: credential.expiresAt).valid, "Malformed credentials are rejected")
        check(!NativeHybridCredential(roomId: "x", key: credential.key, tag: credential.tag, expiresAt: 0).valid, "Expired credentials are rejected")
        check(NativePeerProtocol.bluetoothID(tag: credential.tag, socketID: "a") != NativePeerProtocol.bluetoothID(tag: credential.tag, socketID: "b"), "Bluetooth discovery IDs distinguish room peers")
        check(NativePeerProtocol.bluetoothID(tag: credential.tag, socketID: "a") != NativePeerProtocol.bluetoothID(tag: "different", socketID: "a"), "Bluetooth discovery IDs change with session rotation")
        check(YouTubeIdentity.key(for: "ws-p2p:yt:aaaaaaaaaaa") == "youtube:aaaaaaaaaaa", "Web cache URLs share the native YouTube identity")
        check(YouTubeIdentity.key(for: "ws-p2p:yt:aaaaaaaaaaa_1700000000000") == "youtube:aaaaaaaaaaa", "Legacy timestamp cache URLs retain their identity")
        check(NativePeerAddress.isLocalIPv4("10.1.2.3") && NativePeerAddress.isLocalIPv4("172.16.2.3") && NativePeerAddress.isLocalIPv4("192.168.2.3"), "Numeric address discovery accepts private LAN addresses")
        check(!NativePeerAddress.isLocalIPv4("8.8.8.8") && !NativePeerAddress.isLocalIPv4("example.com"), "Numeric address discovery rejects public addresses and hostnames")

        let base = URL(string: "http://127.0.0.1:4189/syncbeats-native-audio/")!
        let request = URLRequest(url: base.appendingPathComponent("tone.wav"))
        print("Downloading HTTP fixture")
        let source = try await NativeAudioPrefetch().file(for: request, using: .shared)
        print("Starting local TLS transfer")
        var received: NativeAudioFile? = try await transfer(source)
        let receivedURL = received!.url
        check(received!.byteCount == source.byteCount, "TLS peer transport streams a complete audio file")
        check(try NativePeerProtocol.digest(received!.url) == NativePeerProtocol.digest(source.url), "Transferred bytes match the source SHA-256")
        received = nil
        check(!FileManager.default.fileExists(atPath: receivedURL.path), "Peer temporary file is released after its last reader")
        do { _ = try await transfer(source, corrupt: true); check(false, "Corrupt file must fail") }
        catch { check(true, "Corrupt SHA-256 is rejected before playback") }

        let wrong = NativeHybridCredential(roomId: credential.roomId, key: Data(repeating: 9, count: 32).base64EncodedString(), tag: credential.tag, expiresAt: credential.expiresAt)
        do { _ = try await withPeer(clientCredential: wrong, serve: { _ in }, receive: { _ in true }); check(false, "Wrong PSK must fail") }
        catch { check(true, "Different room secrets cannot establish the TLS link") }
        do {
            _ = try await withPeer(serve: { channel in
                var length = UInt32(NativePeerProtocol.maxHeaderBytes + 1).bigEndian
                try await channel.send(withUnsafeBytes(of: &length) { Data($0) })
            }, receive: { channel in try await channel.receiveMessage() })
            check(false, "Oversized header must fail")
        } catch { check(true, "Oversized frame is rejected without allocating its body") }
        do {
            _ = try await withPeer(serve: { _ in }, receive: { channel in
                try await channel.receiveFile(bytes: NativePeerProtocol.maxFileBytes + 1, digest: String(repeating: "0", count: 64))
            })
            check(false, "Oversized audio must fail")
        } catch { check(true, "Oversized audio is rejected before disk transfer") }
        do {
            _ = try await withPeer(serve: { channel in try await channel.send(Data(repeating: 0, count: 8)) }, receive: { channel in try await channel.receive(16) })
            check(false, "Truncated block must fail")
        } catch { check(true, "Truncated file block fails cleanly") }
        let cancelStart = Date()
        do {
            _ = try await withPeer(serve: { _ in try await Task.sleep(for: .seconds(6)) }, receive: { channel in
                let pending = Task { try await channel.receiveMessage() }
                try await Task.sleep(for: .milliseconds(80)); pending.cancel()
                return try await pending.value
            })
            check(false, "Cancelled receive must fail")
        } catch { check(Date().timeIntervalSince(cancelStart) < 2, "Cancelling a stale track closes its peer request promptly") }
        let idleStart = Date()
        do {
            _ = try await withPeer(serve: { _ in try await Task.sleep(for: .seconds(6)) }, receive: { channel in try await channel.receiveMessage() })
            check(false, "Idle peer must time out")
        } catch { check(Date().timeIntervalSince(idleStart) < 5.5, "Unresponsive peer has a bounded idle timeout") }

        let local = NativeAudioPrefetch()
        let counter = HybridCounter()
        await local.setPeerDownload { _ in await counter.increment(); return try await transfer(source) }
        async let first = local.file(for: request, using: .shared, trackKey: "youtube:aaaaaaaaaaa")
        async let second = local.file(for: request, using: .shared, trackKey: "youtube:aaaaaaaaaaa")
        let (one, two) = try await (first, second)
        check(one === two, "Prefetch and playback share one peer file")
        check(await counter.count == 1, "Concurrent consumers start one selected-peer transfer")
        check(await local.cachedFile(for: "youtube:aaaaaaaaaaa") === one, "Completed local audio is available for peer seeding")
        let fallback = NativeAudioPrefetch()
        await fallback.setPeerDownload { _ in nil }
        let cloud = try await fallback.file(for: request, using: .shared, trackKey: "youtube:aaaaaaaaaaa")
        check(cloud.byteCount == source.byteCount, "Missing local cache falls back to the HTTP download")
        await local.clear()
        check(await local.cachedFile(for: "youtube:aaaaaaaaaaa") == nil, "Leaving a room clears advertised cached files")
        check(FileManager.default.fileExists(atPath: one.url.path), "Cache eviction preserves an active audio reader")

        // Exercise the production Bonjour service, TLS membership check and clock handover.
        let mac = RoomParticipant(socketId: "verification-mac", displayName: "Verification Mac", isReady: true,
            isBlocked: false, userId: "verification", outputDeviceName: "Mac", outputDeviceType: "desktop", volume: 100)
        let phone = RoomParticipant(socketId: "verification-phone", displayName: "Verification iPhone", isReady: true,
            isBlocked: false, userId: "verification", outputDeviceName: "iPhone", outputDeviceType: "mobile", volume: 100)
        let track = RoomTrack(id: "verification-track", trackUrl: "youtube:aaaaaaaaaaa", title: "Synthetic tone",
            artist: nil, thumbnail: nil, durationSec: 3, isCurrent: true, queueIndex: 0)
        // The command-line test cannot grant macOS local-network privacy access.
        // Bind the real service exchange to loopback; physical LAN remains a device check.
        let seeder = NativeHybridRelay(localAddresses: { ["127.0.0.1"] })
        let receiver = NativeHybridRelay(localAddresses: { ["127.0.0.1"] })
        defer { seeder.stop(); receiver.stop() }
        let seedCache = NativeAudioPrefetch(), receiveCache = NativeAudioPrefetch()
        _ = try await seedCache.file(for: request, using: .shared, trackKey: "youtube:aaaaaaaaaaa")
        seeder.configureCache(seedCache); receiver.configureCache(receiveCache)
        seeder.playbackEstimate = { NativePlaybackAlignment(epoch: 1000, errorMS: -7) }
        seeder.updateMembers([mac, phone], ownID: mac.id, tracks: [track])
        receiver.updateMembers([mac, phone], ownID: phone.id, tracks: [track])
        check(receiver.connectionLabel == "Cloud · local sync awaiting server authorization", "A room with another member shows missing relay authorization")
        var localOffset: Double?
        seeder.clockEstimate = { (Date().timeIntervalSince1970 * 1000 + 100, 5) }
        receiver.onClockSample = { offset, _, _ in localOffset = offset }
        seeder.accept(credential); receiver.accept(credential)
        for _ in 0..<150 {
            if receiver.peers.contains(where: \.usable) { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        print("Bonjour diagnostic: unavailable=\(receiver.localNetworkUnavailable), error=\(receiver.lastLocalError ?? "none"), peers=\(receiver.peers.map { "\($0.id):\($0.successes)/\($0.failures) RTT=\($0.rtt)" })")
        check(receiver.peers.contains(where: \.usable), "Production Bonjour discovers and qualifies an authorized loopback peer")
        let lan = receiver.peers.first?.metrics(at: ProcessInfo.processInfo.systemUptime)
        check(lan.map { $0.rttMS < 100 && $0.jitterMS != nil } == true,
              "Authenticated Bonjour exchanges produce per-peer RTT and jitter")
        check(receiver.peers.first?.playback?.errorMS == -7,
              "LAN probes carry the peer's signed playback timeline estimate")
        check(receiver.peers.first?.cachedKeys.contains("youtube:aaaaaaaaaaa") == true, "Peer cache inventory identifies a single seeder before transferring audio")
        check(localOffset.map { abs($0 - 100) < 20 } == true, "Phone receives the selected Mac's fresh server-clock estimate")
        let relayed = try await receiveCache.file(for: request, using: .shared, trackKey: "youtube:aaaaaaaaaaa")
        check(relayed.byteCount == source.byteCount && receiver.lastAudioSource == "Local", "Production cache lookup downloads through the local relay")
        if let endpoint = receiver.peers.first?.endpoint {
            let stranger = NativePeerChannel(NWConnection(to: endpoint, using: NativePeerProtocol.parameters(credential)))
            defer { stranger.close() }
            do {
                try await stranger.start()
                try await stranger.sendMessage(NativePeerMessage(kind: "file", socketID: "not-a-member", tag: credential.tag, trackKey: "youtube:aaaaaaaaaaa"))
                _ = try await stranger.receiveMessage()
                check(false, "Non-member must not receive a cached file")
            } catch { check(true, "Local service rejects a socket absent from the room roster") }
        }
        receiver.setForeground(false)
        check(receiver.peers.isEmpty, "Backgrounding a phone stops its local discovery")
        check(try await receiver.file(for: "youtube:aaaaaaaaaaa") == nil, "Backgrounding keeps the existing HTTP fallback available")
        check(FileManager.default.fileExists(atPath: relayed.url.path), "Local discovery shutdown preserves prepared audio")

        let nearby = receiver.proximity
        let originalHints = nearby.enabled
        defer { nearby.enabled = originalHints }
        nearby.enabled = true
        check(nearby.availability == "Waiting for server authorization for local discovery", "Stopping discovery preserves the joined peer roster")
        receiver.stop()
        check(nearby.availability == "No other device has joined this room", "Leaving the room clears the nearby roster")
        nearby.enabled = false
        check(nearby.availability == "Bluetooth hints are off", "Disabled Bluetooth hints retain their own status")
        check(nearby.hint(for: "b") == nil, "No proximity reading invents a distance or nearby label")
        print("\(checks) hybrid checks passed")
    }
}
