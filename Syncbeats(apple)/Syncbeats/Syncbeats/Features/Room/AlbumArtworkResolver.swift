import Foundation

/// Artwork identity is independent of queue IDs, so every player mode shares the same cover.
nonisolated struct AlbumArtworkRequest: Hashable, Sendable {
    let sourceID: String?
    let title: String
    let artist: String
    let suppliedURL: URL?

    init(title: String, artist: String?, suppliedURL: URL?, sourceID: String? = nil) {
        var song = Self.cleanTitle(title)
        var performer = Self.cleanArtist(artist ?? "")
        // Video titles often contain better metadata than the uploader/channel name.
        if let range = song.range(of: #"\s+[-–—]\s+"#, options: .regularExpression) {
            let prefix = String(song[..<range.lowerBound])
            let suffix = String(song[range.upperBound...])
            if !prefix.isEmpty, !suffix.isEmpty,
               suffix.range(of: #"(?i)^(?:.*\b)?(remix|remaster(?:ed)?|radio edit|album version|live|acoustic|instrumental|sped up|slowed|karaoke|cover)(?:\b.*)?$"#, options: .regularExpression) == nil {
                performer = Self.cleanArtist(prefix)
                song = Self.cleanTitle(suffix)
            }
        }
        self.sourceID = sourceID
        self.title = song
        self.artist = performer
        self.suppliedURL = Self.coverURL(suppliedURL)
    }

    static func coverURL(_ url: URL?) -> URL? {
        guard let url, ["https", "http"].contains(url.scheme), let host = url.host?.lowercased() else { return nil }
        // A video frame is not an album cover. Preserve real supplied music artwork.
        let videoHosts = ["ytimg.com", "youtube.com", "youtu.be", "googlevideo.com", "ggpht.com"]
        guard !videoHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) else { return nil }
        if host.hasSuffix("mzstatic.com") {
            return URL(string: url.absoluteString.replacingOccurrences(of: #"/[0-9]+x[0-9]+bb\.(jpg|png)"#, with: "/600x600bb.jpg", options: .regularExpression))
        }
        return url
    }

    static func normalized(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .replacingOccurrences(of: #"[^\p{L}\p{N}]"#, with: "", options: .regularExpression)
    }

    static func cleanArtist(_ value: String) -> String {
        let cleaned = value.replacingOccurrences(of: #"(?i)\s*[-–—]?\s*(VEVO|Topic|Official(?:\s+Music)?(?:\s+Channel)?)$"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return ["youtube", "unknownartist", "unknown"].contains(normalized(cleaned)) ? "" : cleaned
    }

    static func cleanTitle(_ value: String) -> String {
        // Only discard presentation labels; live/remix/cover variants retain their identity.
        let labels = #"(?i)[\(\[]\s*(?:(?:official\s+)?(?:music\s+)?video|(?:official\s+)?audio|(?:official\s+)?lyric(?:s|\s+video)?|visuali[sz]er|HD|HQ|4K|full\s+song|(?:[0-9]{4}\s+)?remaster(?:ed)?(?:\s+[0-9]{4})?)(?:\s*[,|/]\s*(?:HD|HQ|4K))*\s*[\)\]]"#
        return value.replacingOccurrences(of: labels, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"(?i)[\(\[]\s*(feat\.?|ft\.?|featuring)\s+[^\)\]]+[\)\]]"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"(?i)\s*[-|]\s*(official\s+(music\s+)?(video|audio)|lyrics|lyric\s+video)\s*$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

nonisolated struct AlbumArtworkSearchResponse: Decodable, Sendable {
    nonisolated struct Song: Decodable, Sendable {
        let trackName: String?
        let artistName: String?
        let collectionName: String?
        let artworkUrl100: String?
    }
    let results: [Song]

    private static func matchesArtist(_ performer: String, requested: String) -> Bool {
        if AlbumArtworkRequest.normalized(performer) == requested { return true }
        return performer.components(separatedBy: " & ").contains { AlbumArtworkRequest.normalized($0) == requested }
    }

    func bestCover(for request: AlbumArtworkRequest) -> URL? {
        let title = AlbumArtworkRequest.normalized(request.title)
        let artist = AlbumArtworkRequest.normalized(request.artist)
        guard !title.isEmpty, !artist.isEmpty else { return nil }
        return results.compactMap { song -> (URL, Int)? in
            guard let name = song.trackName, let performer = song.artistName,
                  AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanTitle(name)) == title,
                  Self.matchesArtist(performer, requested: artist),
                  let rawURL = song.artworkUrl100.flatMap(URL.init(string:)),
                  let cover = AlbumArtworkRequest.coverURL(rawURL) else { return nil }
            let album = (song.collectionName ?? "").lowercased()
            let score = album.contains(" - single") || album.contains("greatest hits") || album.contains("compilation") ? 0 : 1
            return (cover, score)
        }.sorted { $0.1 > $1.1 }.first?.0
    }
}

actor AlbumArtworkResolver {
    static let shared = AlbumArtworkResolver()
    private struct CachedCover { let url: URL?; let expires: Date }
    private let session: URLSession
    private let endpoint: URL
    private let videoMetadataEndpoint: URL
    private var sources: [String: AlbumArtworkRequest] = [:]
    private var identityLookups: [String: Task<AlbumArtworkRequest?, Never>] = [:]
    private var unavailableIdentities: [String: Date] = [:]
    private var covers: [AlbumArtworkRequest: CachedCover] = [:]
    private var lookups: [AlbumArtworkRequest: Task<URL?, Never>] = [:]
    private var images: [URL: Data] = [:]
    private var downloads: [URL: Task<Data?, Never>] = [:]

    init(session: URLSession = .shared, endpoint: URL = URL(string: "https://itunes.apple.com/search")!,
         videoMetadataEndpoint: URL = URL(string: "https://www.youtube.com/oembed")!) {
        self.session = session
        self.endpoint = endpoint
        self.videoMetadataEndpoint = videoMetadataEndpoint
    }

    func coverURL(for incoming: AlbumArtworkRequest) async -> URL? {
        var request = incoming
        if let source = request.sourceID {
            if let known = sources[source] {
                // Queue metadata can lose the artist after enqueueing; keep the discovered identity.
                request = known
            } else if request.suppliedURL != nil || (!request.title.isEmpty && !request.artist.isEmpty) {
                if sources.count > 500 { sources.removeAll() }
                sources[source] = request
            }
        }
        if let supplied = request.suppliedURL { return supplied }
        if request.artist.isEmpty, let source = request.sourceID,
           let enriched = await videoIdentity(source: source) {
            request = enriched
            sources[source] = enriched
        }
        guard !request.title.isEmpty, !request.artist.isEmpty else { return nil }
        if let cached = covers[request], cached.expires > Date() { return cached.url }
        if let lookup = lookups[request] { return await lookup.value }
        let session = session, endpoint = endpoint
        let lookup = Task<URL?, Never> {
            var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "term", value: request.artist + " " + request.title),
                                     URLQueryItem(name: "entity", value: "song"), URLQueryItem(name: "media", value: "music"),
                                     URLQueryItem(name: "limit", value: "25"), URLQueryItem(name: "country", value: "US")]
            guard let url = components.url else { return nil }
            var query = URLRequest(url: url); query.timeoutInterval = 12
            guard let (data, response) = try? await session.data(for: query),
                  let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let result = try? JSONDecoder().decode(AlbumArtworkSearchResponse.self, from: data) else { return nil }
            return result.bestCover(for: request)
        }
        lookups[request] = lookup
        let cover = await lookup.value
        lookups[request] = nil
        if covers.count > 500 { covers.removeAll() }
        covers[request] = CachedCover(url: cover, expires: Date().addingTimeInterval(cover == nil ? 60 : 86400))
        return cover
    }

    /// Existing queue items may have only a video ID. Recover identity, never its thumbnail.
    private func videoIdentity(source: String) async -> AlbumArtworkRequest? {
        guard source.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else { return nil }
        if let until = unavailableIdentities[source], until > Date() { return nil }
        if let lookup = identityLookups[source] { return await lookup.value }
        let session = session, endpoint = videoMetadataEndpoint
        let lookup = Task<AlbumArtworkRequest?, Never> {
            var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "url", value: "https://www.youtube.com/watch?v=" + source),
                                     URLQueryItem(name: "format", value: "json")]
            guard let url = components.url else { return nil }
            var query = URLRequest(url: url); query.timeoutInterval = 10
            guard let (data, response) = try? await session.data(for: query),
                  let http = response as? HTTPURLResponse, http.statusCode == 200,
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let title = object["title"] as? String, let artist = object["author_name"] as? String else { return nil }
            return AlbumArtworkRequest(title: title, artist: artist, suppliedURL: nil, sourceID: source)
        }
        identityLookups[source] = lookup
        let request = await lookup.value
        identityLookups[source] = nil
        if request == nil {
            if unavailableIdentities.count > 500 { unavailableIdentities.removeAll() }
            unavailableIdentities[source] = Date().addingTimeInterval(60)
        }
        return request
    }

    func imageData(for request: AlbumArtworkRequest) async -> Data? {
        guard let url = await coverURL(for: request) else { return nil }
        if let data = images[url] { return data }
        if let download = downloads[url] { return await download.value }
        let session = session
        let download = Task<Data?, Never> {
            var query = URLRequest(url: url); query.timeoutInterval = 15
            guard let (data, response) = try? await session.data(for: query),
                  let http = response as? HTTPURLResponse, http.statusCode == 200,
                  http.mimeType?.hasPrefix("image/") == true, !data.isEmpty, data.count < 10_000_000 else { return nil }
            return data
        }
        downloads[url] = download
        let data = await download.value
        downloads[url] = nil
        // Bound resident artwork memory; URLSession still provides its HTTP cache.
        if images.values.reduce(0, { $0 + $1.count }) > 32_000_000 { images.removeAll() }
        if let data { images[url] = data }
        return data
    }
}
