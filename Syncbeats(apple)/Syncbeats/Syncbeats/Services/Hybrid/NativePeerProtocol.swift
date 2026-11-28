import Foundation
import CryptoKit
import Network
import Security

nonisolated struct NativeHybridCredential: Codable, Equatable, Sendable {
    let roomId: String
    let key: String
    let tag: String
    let expiresAt: Double
    var valid: Bool {
        Data(base64Encoded: key)?.count == 32 && tag.count == 24 && expiresAt > Date().timeIntervalSince1970 * 1000
    }
}

nonisolated struct NativePeerMessage: Codable, Sendable {
    var kind: String
    var socketID: String
    var tag: String
    var trackKey: String? = nil
    var bytes: Int? = nil
    var digest: String? = nil
    var serverTime: Double? = nil
    var uncertainty: Double? = nil
    var keys: [String]? = nil
    var handlingMS: Double? = nil
    var playback: NativePlaybackAlignment? = nil
}

nonisolated enum NativePeerFailure: Error { case unavailable, malformed, timedOut, integrity }

nonisolated enum NativePeerProtocol {
    static let maxFileBytes = 60_000_000
    static let blockBytes = 64 * 1024
    static let maxHeaderBytes = 8 * 1024

    static func parameters(_ credential: NativeHybridCredential) -> NWParameters {
        let tls = NWProtocolTLS.Options()
        let secret = Data(base64Encoded: credential.key) ?? Data()
        let identity = Data(credential.tag.utf8)
        secret.withUnsafeBytes { bytes in
            identity.withUnsafeBytes { name in
                sec_protocol_options_add_pre_shared_key(tls.securityProtocolOptions,
                    DispatchData(bytes: bytes) as __DispatchData, DispatchData(bytes: name) as __DispatchData)
            }
        }
        sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        sec_protocol_options_set_max_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
        sec_protocol_options_append_tls_ciphersuite(tls.securityProtocolOptions, tls_ciphersuite_t(rawValue: 0x00A8)!)
        let parameters = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
        parameters.includePeerToPeer = true
        return parameters
    }

    static func digest(_ file: URL) throws -> String {
        let reader = try FileHandle(forReadingFrom: file)
        defer { try? reader.close() }
        var hash = SHA256()
        while let block = try reader.read(upToCount: blockBytes), !block.isEmpty {
            try Task.checkCancellation()
            hash.update(data: block)
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    static func bluetoothID(tag: String, socketID: String) -> UUID {
        let bytes = Array(SHA256.hash(data: Data((tag + socketID).utf8)).prefix(16))
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}

/// Frames and file blocks are bounded. Each operation has an idle deadline.
nonisolated final class NativePeerChannel: @unchecked Sendable {
    let connection: NWConnection
    private let queue = DispatchQueue(label: "in.syncbeats.peer.channel", qos: .utility)
    init(_ connection: NWConnection) { self.connection = connection }
    func close() { connection.cancel() }

    private func deadline<T: Sendable>(_ seconds: Double = 4, _ operation: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withTaskCancellationHandler {
            try await withThrowingTaskGroup(of: T.self) { group in
                group.addTask { try await operation() }
                group.addTask {
                    try await Task.sleep(for: .seconds(seconds))
                    self.close()
                    throw NativePeerFailure.timedOut
                }
                defer { group.cancelAll() }
                return try await group.next()!
            }
        } onCancel: { self.close() }
    }
    func start() async throws {
        try await deadline {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                self.connection.stateUpdateHandler = { state in
                    switch state {
                    case .ready:
                        self.connection.stateUpdateHandler = nil
                        continuation.resume()
                    case .failed(let error), .waiting(let error):
                        self.connection.stateUpdateHandler = nil
                        self.close(); continuation.resume(throwing: error)
                    case .cancelled:
                        self.connection.stateUpdateHandler = nil
                        continuation.resume(throwing: CancellationError())
                    default: break
                    }
                }
                self.connection.start(queue: self.queue)
            }
        }
    }
    func send(_ data: Data) async throws {
        try Task.checkCancellation()
        try await deadline {
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                self.connection.send(content: data, completion: .contentProcessed { error in
                    if let error { continuation.resume(throwing: error) }
                    else { continuation.resume() }
                })
            }
        }
    }
    func receive(_ count: Int) async throws -> Data {
        try Task.checkCancellation()
        guard count > 0, count <= NativePeerProtocol.blockBytes else { throw NativePeerFailure.malformed }
        return try await deadline {
            try await withCheckedThrowingContinuation { continuation in
                self.connection.receive(minimumIncompleteLength: count, maximumLength: count) { data, _, _, error in
                    if let error { continuation.resume(throwing: error) }
                    else if let data, data.count == count { continuation.resume(returning: data) }
                    else { continuation.resume(throwing: NativePeerFailure.malformed) }
                }
            }
        }
    }
    func sendMessage(_ message: NativePeerMessage) async throws {
        let data = try JSONEncoder().encode(message)
        guard data.count <= NativePeerProtocol.maxHeaderBytes else { throw NativePeerFailure.malformed }
        var length = UInt32(data.count).bigEndian
        try await send(withUnsafeBytes(of: &length) { Data($0) } + data)
    }
    func receiveMessage() async throws -> NativePeerMessage {
        let header = try await receive(4)
        let count = header.reduce(0) { ($0 << 8) | Int($1) }
        guard count > 0, count <= NativePeerProtocol.maxHeaderBytes else { throw NativePeerFailure.malformed }
        let body = try await receive(count)
        return try JSONDecoder().decode(NativePeerMessage.self, from: body)
    }
    @concurrent func receiveFile(bytes: Int, digest: String) async throws -> NativeAudioFile {
        guard bytes > 0, bytes <= NativePeerProtocol.maxFileBytes, digest.count == 64 else { throw NativePeerFailure.malformed }
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("syncbeats-peer-\(UUID().uuidString).m4a")
        FileManager.default.createFile(atPath: temporary.path, contents: nil)
        defer { try? FileManager.default.removeItem(at: temporary) }
        let writer = try FileHandle(forWritingTo: temporary)
        defer { try? writer.close() }
        var remaining = bytes
        var hash = SHA256()
        let started = ProcessInfo.processInfo.systemUptime
        while remaining > 0 {
            guard ProcessInfo.processInfo.systemUptime - started < 45 else { throw NativePeerFailure.timedOut }
            let block = try await receive(min(remaining, NativePeerProtocol.blockBytes))
            try writer.write(contentsOf: block); hash.update(data: block)
            remaining -= block.count
        }
        let actual = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard actual == digest else { throw NativePeerFailure.integrity }
        try Task.checkCancellation()
        return try NativeAudioFile(download: temporary)
    }
    @concurrent func sendFile(_ file: NativeAudioFile) async throws {
        let reader = try FileHandle(forReadingFrom: file.url)
        defer { try? reader.close() }
        let started = ProcessInfo.processInfo.systemUptime
        while let block = try reader.read(upToCount: NativePeerProtocol.blockBytes), !block.isEmpty {
            guard ProcessInfo.processInfo.systemUptime - started < 45 else { throw NativePeerFailure.timedOut }
            try await send(block)
        }
    }
}
