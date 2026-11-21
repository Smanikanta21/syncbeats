import Foundation

/// Discovery retains the source artwork for videos that do not represent one album.
/// This identity and its fallback are separate from the player artwork resolver.
nonisolated struct DiscoverySongArtworkRequest: Hashable, Sendable {
    let album: AlbumArtworkRequest
    let videoTitle: String
    let channel: String?
    let thumbnail: URL?

    init(title: String, artist: String?, album: AlbumArtworkRequest, thumbnail: String?) {
        self.album = album; videoTitle = title; channel = artist
        let supplied = thumbnail.flatMap(URL.init(string:))
        self.thumbnail = supplied.flatMap { ["http", "https"].contains($0.scheme) ? $0 : nil }
            ?? album.sourceID.flatMap { URL(string: "https://i.ytimg.com/vi/\($0)/hqdefault.jpg") }
    }

    var isCollection: Bool {
        videoTitle.range(of: #"(?i)\b(jukebox|playlist|compilation|mixset|mix|live session)\b"#, options: .regularExpression) != nil
    }

    private static func recordingTitle(_ value: String) -> String {
        AlbumArtworkRequest.cleanTitle(value)
            .replacingOccurrences(of: #"(?i)[\(\[]\s*(?:full|official|lyrical)?\s*(?:music\s+)?(?:video(?:\s+song)?|audio|song|lyrics?)\s*[\)\]]"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"(?i)\s*(?:[-–—]\s*)?(?:full|official|lyrical)?\s*(?:music\s+)?(?:video(?:\s+song)?|audio|lyrical song)\s*$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"(?i)\s*[\(\[]from\s+[\"“].*?[\"”][\)\]]"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var titleCandidates: [String] {
        let head = videoTitle.components(separatedBy: "|").first ?? videoTitle
        var candidates = [Self.recordingTitle(head), Self.recordingTitle(album.title)]
        candidates += head.components(separatedBy: ":").map(Self.recordingTitle)
        if let range = head.range(of: #"\s+[-–—]\s+"#, options: .regularExpression) {
            candidates += [Self.recordingTitle(String(head[..<range.lowerBound])), Self.recordingTitle(String(head[range.upperBound...]))]
        }
        var seen: Set<String> = []
        return candidates.filter { !$0.isEmpty && seen.insert(AlbumArtworkRequest.normalized($0)).inserted }
    }

    var searchTerm: String {
        let head = Self.recordingTitle(videoTitle.components(separatedBy: "|").first ?? videoTitle)
        return head.replacingOccurrences(of: #"\s+[-–—]\s+|:"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    func matchedCover(in response: AlbumArtworkSearchResponse) -> URL? {
        guard !isCollection else { return nil }
        let titles = Set(titleCandidates.map(AlbumArtworkRequest.normalized))
        let evidence = ([channel ?? "", album.artist] + videoTitle.components(separatedBy: "|"))
            .flatMap { $0.components(separatedBy: ",").flatMap { $0.components(separatedBy: " & ") } }
            .map { AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanArtist($0)) }
            .filter { !$0.isEmpty }
        return response.results.compactMap { song -> (URL, Int)? in
            guard let title = song.trackName, titles.contains(AlbumArtworkRequest.normalized(Self.recordingTitle(title))),
                  let artist = song.artistName,
                  artist.components(separatedBy: ",").flatMap({ $0.components(separatedBy: " & ") })
                    .contains(where: { evidence.contains(AlbumArtworkRequest.normalized($0)) }),
                  let cover = AlbumArtworkRequest.firstCover(in: [song.artworkUrl100]) else { return nil }
            let collection = (song.collectionName ?? "").lowercased()
            return (cover, collection.contains("tribute") || collection.contains("compilation") || collection.contains("greatest hits") ? 0 : 1)
        }.sorted { $0.1 > $1.1 }.first?.0
    }
}

extension RoomTrack {
    var discoveryArtworkRequest: DiscoverySongArtworkRequest {
        let embedded = URLComponents(string: trackUrl)?.queryItems?.first { $0.name == "thumb" }?.value
        return .init(title: title, artist: artist, album: artworkRequest, thumbnail: thumbnail ?? embedded)
    }
}

extension RoomSearchResult {
    var discoveryArtworkRequest: DiscoverySongArtworkRequest {
        .init(title: title, artist: uploaderName, album: artworkRequest, thumbnail: thumbnail)
    }
}

actor DiscoverySongArtworkResolver {
    static let shared = DiscoverySongArtworkResolver()
    private struct Cached { let url: URL?; let expires: Date }
    private var cache: [DiscoverySongArtworkRequest: Cached] = [:]
    private var pending: [DiscoverySongArtworkRequest: Task<URL?, Never>] = [:]
    private let session: URLSession
    private let endpoint: URL

    init(session: URLSession = .shared, endpoint: URL = URL(string: "https://itunes.apple.com/search")!) {
        self.session = session; self.endpoint = endpoint
    }

    func retryMissing() { cache = cache.filter { $0.value.url != nil } }

    func imageData(for request: DiscoverySongArtworkRequest, images: AlbumArtworkResolver = .shared) async -> Data? {
        let primary = await coverURL(for: request)
        if let primary, let data = await images.imageData(at: primary), DiscoveryArtworkDecoder.decode(data) != nil { return data }
        // Expired or local-only artwork must not prevent an independent catalog match.
        let fallback = DiscoverySongArtworkRequest(title: request.videoTitle, artist: request.channel,
            album: .init(title: request.album.title, artist: request.album.artist, suppliedURL: nil, sourceID: request.album.sourceID),
            thumbnail: request.thumbnail?.absoluteString)
        if let replacement = await coverURL(for: fallback), replacement != primary,
           let data = await images.imageData(at: replacement), DiscoveryArtworkDecoder.decode(data) != nil { return data }
        // The card already retains its source preview if no catalog cover is available.
        return nil
    }

    func coverURL(for request: DiscoverySongArtworkRequest) async -> URL? {
        if let supplied = request.album.suppliedURL { return supplied }
        guard !request.isCollection, !request.searchTerm.isEmpty else { return nil }
        if let cached = cache[request], cached.expires > Date() { return cached.url }
        if let lookup = pending[request] { return await lookup.value }
        let session = session, endpoint = endpoint
        let lookup = Task<URL?, Never> {
            for country in ["US", "IN"] {
                var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
                components.queryItems = [.init(name: "term", value: request.searchTerm), .init(name: "entity", value: "song"),
                                         .init(name: "media", value: "music"), .init(name: "limit", value: "50"), .init(name: "country", value: country)]
                guard let url = components.url else { continue }
                var query = URLRequest(url: url); query.timeoutInterval = 8
                guard let (data, response) = try? await NativeDiagnostics.data(for: query, using: session, operation: "Artwork catalog"),
                      (response as? HTTPURLResponse)?.statusCode == 200,
                      let results = try? JSONDecoder().decode(AlbumArtworkSearchResponse.self, from: data) else { continue }
                if let cover = request.matchedCover(in: results) { return cover }
            }
            return nil
        }
        pending[request] = lookup
        let url = await lookup.value
        pending[request] = nil
        if cache.count >= 500 { cache.removeAll() }
        cache[request] = Cached(url: url, expires: Date().addingTimeInterval(url == nil ? 60 : 86400))
        return url
    }
}
