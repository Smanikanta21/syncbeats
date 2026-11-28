import Foundation

/// Share downloads between next-track preparation and actual playback.
actor NativeAudioPrefetch {
    private struct Download {
        let id: UUID
        let task: Task<NativeAudioFile, Error>
        var consumers: Set<UUID>
    }
    private var pending: [URL: Download] = [:]
    private var cached: [URL: NativeAudioFile] = [:]
    private var order: [URL] = []
    private var generation = UUID()
    private var trackURLs: [String: URL] = [:]
    private var peerDownload: (@Sendable (String) async throws -> NativeAudioFile?)?

    func setPeerDownload(_ download: @escaping @Sendable (String) async throws -> NativeAudioFile?) { peerDownload = download }
    func cachedFile(for key: String) -> NativeAudioFile? { trackURLs[key].flatMap { cached[$0] } }
    func availableKeys() -> [String] { trackURLs.filter { cached[$0.value] != nil }.map(\.key) }

    @MainActor static func request(track: RoomTrack, baseURL: URL) throws -> URLRequest {
        let source: URL
        if let video = YouTubeIdentity.id(in: track.trackUrl) {
            var components = URLComponents(url: baseURL.appendingPathComponent("search/youtube/download"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "videoId", value: video)]
            source = components.url!
        } else if let url = URL(string: track.trackUrl), ["http", "https"].contains(url.scheme) { source = url }
        else { throw AudioFailure.unsupported }
        var request = URLRequest(url: source)
        request.timeoutInterval = 180
        return request
    }

    func file(for request: URLRequest, using http: URLSession, speculative: Bool = false, trackKey: String? = nil) async throws -> NativeAudioFile {
        try Task.checkCancellation()
        guard let url = request.url else { throw AudioFailure.unsupported }
        if let trackKey { trackURLs[trackKey] = url }
        if let file = cached[url] { return file }
        let active = generation
        let consumer = UUID()
        let download: Download
        if var existing = pending[url] {
            existing.consumers.insert(consumer); pending[url] = existing; download = existing
        }
        else {
            if speculative && pending.count >= 2 { throw CancellationError() }
            let peerDownload = self.peerDownload
            let task = Task {
                if let trackKey, let file = try await peerDownload?(trackKey) { return file }
                try Task.checkCancellation()
                let (temporary, response) = try await NativeDiagnostics.download(for: request, using: http,
                    operation: speculative ? "Next-track prefetch" : "Audio download")
                defer { try? FileManager.default.removeItem(at: temporary) }
                try Task.checkCancellation()
                guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else { throw AudioFailure.download }
                return try NativeAudioFile(download: temporary)
            }
            download = Download(id: UUID(), task: task, consumers: [consumer])
            pending[url] = download
        }
        defer { release(url: url, downloadID: download.id, consumer: consumer) }
        return try await withTaskCancellationHandler {
            let file = try await download.task.value
            try Task.checkCancellation()
            guard generation == active else { throw CancellationError() }
            if file.byteCount <= 60_000_000 {
                cached[url] = file
                order.removeAll { $0 == url }; order.append(url)
                while order.count > 2 || cached.values.reduce(0, { $0 + $1.byteCount }) > 80_000_000 {
                    cached[order.removeFirst()] = nil
                }
                trackURLs = trackURLs.filter { cached[$0.value] != nil || pending[$0.value] != nil }
            }
            return file
        } onCancel: {
            Task { await self.release(url: url, downloadID: download.id, consumer: consumer) }
        }
    }

    private func release(url: URL, downloadID: UUID, consumer: UUID) {
        guard var download = pending[url], download.id == downloadID else { return }
        download.consumers.remove(consumer)
        if download.consumers.isEmpty {
            download.task.cancel(); pending[url] = nil
            trackURLs = trackURLs.filter { cached[$0.value] != nil || pending[$0.value] != nil }
        }
        else { pending[url] = download }
    }

    func clear() {
        generation = UUID()
        pending.values.forEach { $0.task.cancel() }
        pending = [:]; cached = [:]; order = []; trackURLs = [:]
    }
}
