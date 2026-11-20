import Foundation
import Combine
import CryptoKit

/// Persistent on-disk cache for track audio, shared by the `AudioEngine` (the track
/// it is about to play) and the queue UI (per-row download, "Download All").
///
/// Downloads survive a relaunch: files live in Application Support, not the temp
/// directory the OS purges whenever it feels like it. A song downloaded once is
/// local forever, so rejoining a room mid-playlist costs nothing.
@MainActor
final class TrackCache: ObservableObject {
    static let shared = TrackCache()

    enum State: Equatable {
        case missing
        /// 0…1. Sits at exactly 0 while the server is still pulling the track from
        /// source — there are no bytes to count yet, so the UI spins instead.
        case downloading(Double)
        case downloaded

        var isDownloading: Bool {
            if case .downloading = self { return true } else { return false }
        }
    }

    /// In-flight and just-finished downloads, keyed by `identityKey(trackUrl)` and
    /// never by `QueueItem.id` — the queue id is fresh every time a song is re-added,
    /// the audio behind it is the same file. Files already on disk at launch are not
    /// in here; `state(for:)` falls through to the disk scan.
    @Published private(set) var states: [String: State] = [:]

    /// Hash-stem → file, from one scan of the cache directory at launch.
    private var onDisk: [String: URL] = [:]
    private var inFlight: [String: Task<URL?, Never>] = [:]

    private let dir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var dir = base.appendingPathComponent("Syncbeats/tracks", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        // Audio is always re-downloadable — keep it out of Time Machine and iCloud.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? dir.setResourceValues(values)
        return dir
    }()

    private init() {
        let found = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        for url in found where !url.lastPathComponent.hasPrefix(".") {
            onDisk[url.deletingPathExtension().lastPathComponent] = url
        }
        #if DEBUG
        Self._selfCheck()
        #endif
    }

    // MARK: - Identity

    /// Identity of the *audio*, not of the queue entry. A YouTube track carries
    /// throwaway query params (`youtube:abc?thumb=…`), so it is keyed on the bare
    /// video id — otherwise the same song re-added with a different thumbnail would
    /// download a second copy.
    static func identityKey(_ trackUrl: String) -> String {
        guard trackUrl.hasPrefix("youtube:") else { return trackUrl }
        let raw = String(trackUrl.dropFirst("youtube:".count))
        return "youtube:" + (raw.components(separatedBy: "?").first ?? raw)
    }

    /// Hashed so the filename stays a fixed 64 chars — raw track URLs carry
    /// percent-encoded thumbnail URLs and blow past the 255-byte filename limit.
    private static func filename(_ identity: String) -> String {
        SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Lookup

    func state(for item: QueueItem) -> State {
        let id = Self.identityKey(item.trackUrl)
        if let state = states[id] { return state }
        return onDisk[Self.filename(id)] != nil ? .downloaded : .missing
    }

    /// Local file if this track is already cached. Synchronous, so the AudioEngine
    /// can skip the download path outright on a hit.
    func localFile(for item: QueueItem) -> URL? {
        guard !item.trackUrl.isEmpty else { return nil }
        return onDisk[Self.filename(Self.identityKey(item.trackUrl))]
    }

    /// Queued songs that aren't local yet, in queue order.
    func pending(in items: [QueueItem]) -> [QueueItem] {
        items.filter { !$0.trackUrl.isEmpty && state(for: $0) != .downloaded }
    }

    /// How many downloads are running right now — drives the header count.
    var activeCount: Int {
        states.values.filter(\.isDownloading).count
    }

    /// Drop a file that turned out to be unplayable so the next play re-fetches it.
    func invalidate(_ trackUrl: String) {
        let id = Self.identityKey(trackUrl)
        if let url = onDisk.removeValue(forKey: Self.filename(id)) {
            try? FileManager.default.removeItem(at: url)
        }
        states[id] = .missing
    }

    // MARK: - Download

    /// Download one track, or join the download already in flight for it. Returns the
    /// local file, or nil if the fetch failed.
    @discardableResult
    func download(_ item: QueueItem) async -> URL? {
        let id = Self.identityKey(item.trackUrl)
        if let local = localFile(for: item) { return local }
        if let existing = inFlight[id] { return await existing.value }
        guard let remote = remoteURL(for: item.trackUrl) else { return nil }

        var request = URLRequest(url: remote)
        // The server shells out to yt-dlp on a cache miss, so the first byte can be
        // the better part of a minute away.
        request.timeoutInterval = 180
        if let token = Endpoint.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        states[id] = .downloading(0)
        let task = Task<URL?, Never> { [weak self] in
            let delegate = ProgressDelegate { fraction in
                Task { @MainActor in
                    // Don't let a late callback overwrite .downloaded or .missing.
                    guard self?.states[id]?.isDownloading == true else { return }
                    self?.states[id] = .downloading(fraction)
                }
            }
            do {
                let (temp, response) = try await URLSession.shared.download(for: request, delegate: delegate)
                if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                    throw URLError(.badServerResponse)
                }
                return try self?.store(temp, identity: id)
            } catch {
                print("TrackCache: download failed for \(item.title) — \(error.localizedDescription)")
                self?.states[id] = .missing
                return nil
            }
        }
        inFlight[id] = task
        let result = await task.value
        inFlight[id] = nil
        return result
    }

    /// Download everything in the queue that isn't local yet, three at a time — the
    /// server shells out to yt-dlp per cache miss, so firing twenty at once just
    /// queues them behind each other and times the later ones out.
    func downloadAll(_ items: [QueueItem]) {
        let todo = pending(in: items)
        guard !todo.isEmpty else { return }
        Task {
            await withTaskGroup(of: Void.self) { group in
                for (index, item) in todo.enumerated() {
                    if index >= 3 { _ = await group.next() }
                    group.addTask { _ = await self.download(item) }
                }
            }
        }
    }

    private func store(_ temp: URL, identity: String) throws -> URL {
        let stem = Self.filename(identity)
        let final = dir.appendingPathComponent("\(stem).\(Self.ext(forHeaderOf: temp))")
        if FileManager.default.fileExists(atPath: final.path) {
            try FileManager.default.removeItem(at: final)
        }
        try FileManager.default.moveItem(at: temp, to: final)
        onDisk[stem] = final
        states[identity] = .downloaded
        return final
    }

    /// `AVAudioFile` goes by file extension and the proxy doesn't name the container,
    /// so sniff it: MP4/M4A carries the `ftyp` atom at byte 4.
    static func ext(forHeader head: Data) -> String {
        guard head.count >= 8 else { return "mp3" }
        return Array(head)[4...7].elementsEqual([0x66, 0x74, 0x79, 0x70]) ? "m4a" : "mp3"
    }

    private static func ext(forHeaderOf url: URL) -> String {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return "mp3" }
        defer { try? handle.close() }
        return ext(forHeader: (try? handle.read(upToCount: 12)) ?? Data())
    }

    private func remoteURL(for trackUrl: String) -> URL? {
        guard !trackUrl.isEmpty else { return nil }
        let base = Endpoint.baseURL.absoluteString
        if trackUrl.hasPrefix("youtube:") {
            let raw = String(trackUrl.dropFirst("youtube:".count))
            let videoId = raw.components(separatedBy: "?").first ?? raw
            // yt-resolve, not yt-proxy: the server 302s us to the CDN and we pull the
            // bytes straight from there. No RapidAPI quota, no server round-trip.
            return URL(string: "\(base)/rooms/\(RoomManager.shared.roomId)/yt-resolve?videoId=\(videoId)")
        }
        if trackUrl.hasPrefix("http") { return URL(string: trackUrl) }
        return URL(string: base + (trackUrl.hasPrefix("/") ? "" : "/") + trackUrl)
    }

    #if DEBUG
    static func _selfCheck() {
        assert(identityKey("youtube:abc123?thumb=x") == identityKey("youtube:abc123?thumb=y"),
               "same video, different thumb params must share one cache entry")
        assert(identityKey("youtube:abc123") != identityKey("youtube:xyz789"))
        assert(identityKey("/files/a.mp3") == "/files/a.mp3", "uploads are keyed verbatim")
        assert(filename("youtube:abc").count == 64, "filename must be a fixed-length hash")
        assert(ext(forHeader: Data([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41])) == "m4a")
        assert(ext(forHeader: Data([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0])) == "mp3")
        assert(ext(forHeader: Data([0x49, 0x44])) == "mp3", "a short read must not crash")
    }
    #endif
}

/// `URLSession.download(for:delegate:)` is the only async download API that reports
/// progress. The async call owns completion, so the protocol's required
/// `didFinishDownloadingTo` is deliberately a no-op here.
private final class ProgressDelegate: NSObject, URLSessionDownloadDelegate {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(_ session: URLSession,
                    downloadTask: URLSessionDownloadTask,
                    didWriteData bytesWritten: Int64,
                    totalBytesWritten written: Int64,
                    totalBytesExpectedToWrite expected: Int64) {
        guard expected > 0 else { return }
        onProgress(min(1, Double(written) / Double(expected)))
    }

    func urlSession(_ session: URLSession,
                    downloadTask: URLSessionDownloadTask,
                    didFinishDownloadingTo location: URL) {}
}
