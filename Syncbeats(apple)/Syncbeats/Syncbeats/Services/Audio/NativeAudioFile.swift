import Foundation

/// Shared ownership keeps an evicted download alive until its last reader finishes.
nonisolated final class NativeAudioFile: Sendable {
    let url: URL
    let byteCount: Int
    init(download: URL) throws {
        byteCount = try download.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard byteCount > 0 else { throw AudioFailure.download }
        guard byteCount < 150_000_000 else { throw AudioFailure.tooLarge }
        url = FileManager.default.temporaryDirectory.appendingPathComponent("syncbeats-audio-\(UUID().uuidString).m4a")
        try FileManager.default.moveItem(at: download, to: url)
    }
    deinit { try? FileManager.default.removeItem(at: url) }
}
