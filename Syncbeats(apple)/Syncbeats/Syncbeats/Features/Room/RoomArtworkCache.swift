import Foundation
import ImageIO

nonisolated struct RoomDecodedArtwork: @unchecked Sendable {
    let image: CGImage
    var bytes: Int { image.bytesPerRow * image.height }
}

/// Share bounded, screen-resolution images between the dock, queue and player.
actor RoomArtworkCache {
    static let shared = RoomArtworkCache()
    private struct Key: Hashable { let request: AlbumArtworkRequest; let pixels: Int }
    private struct Entry { let artwork: RoomDecodedArtwork; var used: UInt64 }
    private var entries: [Key: Entry] = [:]
    private var pending: [Key: Task<RoomDecodedArtwork?, Never>] = [:]
    private var clock: UInt64 = 0
    private var bytes = 0
    private let byteLimit = 24 * 1024 * 1024

    nonisolated static func pixelSize(for points: Double, scale: Double) -> Int {
        let requested = max(1, points * scale)
        return [128, 256, 512, 1024, 1536].first { Double($0) >= requested } ?? 1536
    }

    func image(for request: AlbumArtworkRequest, pixels: Int) async -> RoomDecodedArtwork? {
        let key = Key(request: request, pixels: pixels)
        clock &+= 1
        if var entry = entries[key] {
            entry.used = clock; entries[key] = entry
            return entry.artwork
        }
        if let task = pending[key] { return await task.value }
        let task = Task { () -> RoomDecodedArtwork? in
            guard let data = await AlbumArtworkResolver.shared.imageData(for: request) else { return nil }
            return await Task.detached(priority: .utility) {
                Self.decode(data, pixels: pixels)
            }.value
        }
        pending[key] = task
        let result = await task.value
        pending[key] = nil
        if let result, result.bytes <= byteLimit {
            while bytes + result.bytes > byteLimit || entries.count >= 64 {
                guard let oldest = entries.min(by: { $0.value.used < $1.value.used })?.key,
                      let removed = entries.removeValue(forKey: oldest) else { break }
                bytes -= removed.artwork.bytes
            }
            clock &+= 1
            entries[key] = Entry(artwork: result, used: clock)
            bytes += result.bytes
        }
        return result
    }

    nonisolated static func decode(_ data: Data, pixels: Int) -> RoomDecodedArtwork? {
        guard let source = CGImageSourceCreateWithData(data as CFData, [
            kCGImageSourceShouldCache: false
        ] as CFDictionary), let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, pixels),
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary) else { return nil }
        return RoomDecodedArtwork(image: image)
    }
}
