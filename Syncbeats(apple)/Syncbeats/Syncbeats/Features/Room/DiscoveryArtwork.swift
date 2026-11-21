import SwiftUI
import ImageIO

/// Artist cards use an album from the matching artist, rather than an unrelated portrait.
nonisolated struct ArtistArtworkResponse: Decodable, Sendable {
    nonisolated struct Album: Decodable, Sendable {
        let artistName: String?
        let collectionName: String?
        let artworkUrl100: String?
    }
    let results: [Album]

    func coverURL(for name: String, album: String? = nil) -> URL? {
        let identity = AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanArtist(name))
        guard !identity.isEmpty else { return nil }
        let credits = name.components(separatedBy: ",").flatMap { $0.components(separatedBy: " & ") }
            .map { AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanArtist($0)) }.filter { $0.count >= 3 }
        let albumIdentity = album.map(AlbumArtworkRequest.normalized)
        return results.compactMap { candidate -> (URL, Int)? in
            guard let artist = candidate.artistName else { return nil }
            let match = AlbumArtworkRequest.normalized(artist)
            guard match == identity || credits.contains(match),
                  albumIdentity == nil || candidate.collectionName.map(AlbumArtworkRequest.normalized) == albumIdentity,
                  let cover = AlbumArtworkRequest.firstCover(in: [candidate.artworkUrl100]) else { return nil }
            return (cover, match == identity ? 1 : 0)
        }.sorted { $0.1 > $1.1 }.first?.0
    }
}

actor ArtistArtworkResolver {
    static let shared = ArtistArtworkResolver()
    private struct Cached { let url: URL?; let expires: Date }
    private var cache: [String: Cached] = [:]
    private var pending: [String: Task<URL?, Never>] = [:]
    private let session: URLSession
    private let endpoint: URL

    init(session: URLSession = .shared, endpoint: URL = URL(string: "https://itunes.apple.com/search")!) {
        self.session = session; self.endpoint = endpoint
    }

    func retryMissing() { cache = cache.filter { $0.value.url != nil } }

    func imageData(for artist: String, album: String? = nil, preview: DiscoverySongArtworkRequest?,
                   images: AlbumArtworkResolver = .shared) async -> Data? {
        // The group's own cover is both faster and more reliable than a second catalog lookup.
        if let supplied = preview?.album.suppliedURL, let data = await images.imageData(at: supplied),
           DiscoveryArtworkDecoder.decode(data) != nil { return data }
        if let cover = await coverURL(for: artist, album: album), let data = await images.imageData(at: cover),
           DiscoveryArtworkDecoder.decode(data) != nil { return data }
        if let preview {
            if let data = await DiscoverySongArtworkResolver.shared.imageData(for: preview, images: images) { return data }
            if let thumbnail = preview.thumbnail, let data = await images.imageData(at: thumbnail),
               DiscoveryArtworkDecoder.decode(data) != nil { return data }
        }
        return nil
    }

    func coverURL(for artist: String, album: String? = nil) async -> URL? {
        let name = AlbumArtworkRequest.cleanArtist(artist)
        let identity = AlbumArtworkRequest.normalized(name)
        guard !identity.isEmpty else { return nil }
        let key = identity + (album.map { "|" + AlbumArtworkRequest.normalized($0) } ?? "")
        if let cached = cache[key], cached.expires > Date() { return cached.url }
        if let task = pending[key] { return await task.value }
        let session = session, endpoint = endpoint
        let task = Task<URL?, Never> {
            for country in ["US", "IN"] {
                var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
                components.queryItems = [.init(name: "term", value: album.map { name + " " + $0 } ?? name), .init(name: "entity", value: "album"),
                                         .init(name: "media", value: "music"),
                                         .init(name: "limit", value: "25"), .init(name: "country", value: country)]
                if album == nil { components.queryItems?.append(.init(name: "attribute", value: "artistTerm")) }
                guard let url = components.url else { continue }
                var request = URLRequest(url: url); request.timeoutInterval = 10
                guard let (data, response) = try? await NativeDiagnostics.data(for: request, using: session, operation: "Artwork catalog"),
                      (response as? HTTPURLResponse)?.statusCode == 200,
                      let albums = try? JSONDecoder().decode(ArtistArtworkResponse.self, from: data) else { continue }
                if let url = albums.coverURL(for: name, album: album) { return url }
            }
            return nil
        }
        pending[key] = task
        let url = await task.value
        pending[key] = nil
        if cache.count >= 300 { cache.removeAll() }
        cache[key] = Cached(url: url, expires: Date().addingTimeInterval(url == nil ? 60 : 86400))
        return url
    }
}

private struct ArtworkRefreshKey: EnvironmentKey { static let defaultValue = UUID() }
extension EnvironmentValues {
    var artworkRefreshID: UUID {
        get { self[ArtworkRefreshKey.self] }
        set { self[ArtworkRefreshKey.self] = newValue }
    }
}

nonisolated struct DiscoveryArtworkImage: @unchecked Sendable {
    let image: CGImage
    let tint: CoverColor
}

nonisolated enum DiscoveryArtworkDecoder {
    /// Decode a bounded thumbnail and sample its palette away from the UI thread.
    static func decode(_ data: Data) -> DiscoveryArtworkImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 600,
                kCGImageSourceCreateThumbnailWithTransform: true
              ] as CFDictionary) else { return nil }
        return DiscoveryArtworkImage(image: image, tint: CoverPalette.extract(image).first ?? CoverPalette.fallback[0])
    }
}

/// Discovery-only treatment: the existing player artwork and controls stay untouched.
struct DiscoveryArtwork: View {
    enum Source: Hashable {
        case song(DiscoverySongArtworkRequest)
        case artist(String, preview: DiscoverySongArtworkRequest? = nil)
        case album(name: String, artist: String, preview: DiscoverySongArtworkRequest?)
    }
    let source: Source
    let palette: NativePalette
    var radius: CGFloat = 8
    var glow = true
    @AppStorage("native.artworkGlowEnabled") private var glowEnabled = true
    @State private var artwork: DiscoveryArtworkImage?
    @State private var loading = true
    @State private var isVideoArtwork = false
    @Environment(\.artworkRefreshID) private var refreshID
    private struct LoadIdentity: Equatable { let source: Source; let refreshID: UUID }

    var body: some View {
        GeometryReader { geometry in
            let tint = artwork?.tint.color ?? palette.raised
            let halo = min(14, geometry.size.width * 0.08)
            ZStack {
                RoundedRectangle(cornerRadius: radius).fill(palette.raised)
                if let artwork {
                    Image(decorative: artwork.image, scale: 1).resizable().scaledToFill()
                } else {
                    placeholder.font(.system(size: max(12, min(22, geometry.size.width * 0.22)), weight: .medium))
                        .foregroundStyle(palette.quiet)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay { RoundedRectangle(cornerRadius: radius).strokeBorder(artwork == nil ? palette.line : tint.opacity(0.18), lineWidth: 1) }
            .shadow(color: .black.opacity(artwork == nil ? 0 : palette.light ? 0.12 : 0.22), radius: min(8, halo), x: 0, y: 4)
            .shadow(color: tint.opacity(glow && glowEnabled && artwork != nil ? (palette.light ? 0.10 : 0.16) : 0), radius: halo, x: 0, y: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isImage)
        .accessibilityLabel(accessibilityName)
        .help(accessibilityName)
        .task(id: LoadIdentity(source: source, refreshID: refreshID)) {
            artwork = nil; loading = true; isVideoArtwork = false
            let requested = source
            let data: Data?
            switch requested {
            case .song(let request):
                // Show the source image promptly while a more precise album match loads.
                if let thumbnail = request.thumbnail,
                   let thumbnailData = await AlbumArtworkResolver.shared.imageData(at: thumbnail),
                   let preview = await Task.detached(priority: .utility, operation: { DiscoveryArtworkDecoder.decode(thumbnailData) }).value {
                    guard !Task.isCancelled, source == requested else { return }
                    artwork = preview; loading = false; isVideoArtwork = true
                }
                data = await DiscoverySongArtworkResolver.shared.imageData(for: request)
            case .artist(let name, let preview):
                data = await ArtistArtworkResolver.shared.imageData(for: name, preview: preview)
            case .album(let name, let artist, let preview):
                data = await ArtistArtworkResolver.shared.imageData(for: artist, album: name, preview: preview)
            }
            let decoded: DiscoveryArtworkImage?
            if let data { decoded = await Task.detached(priority: .utility) { DiscoveryArtworkDecoder.decode(data) }.value }
            else { decoded = nil }
            guard !Task.isCancelled, source == requested else { return }
            if let decoded { artwork = decoded; isVideoArtwork = false }
            loading = false
            if artwork == nil { NativeDiagnostics.info("Artwork", "Card has no decodable cover after fallbacks") }
        }
    }

    @ViewBuilder private var placeholder: some View {
        if case .artist(let name, _) = source {
            Text(name.split(whereSeparator: { $0.isWhitespace }).prefix(2).compactMap(\.first).map(String.init).joined().uppercased())
        } else { Image(systemName: "music.note") }
    }
    private var accessibilityName: String {
        if loading { return "Loading artwork" }
        guard artwork != nil else { return "Artwork unavailable" }
        switch source {
        case .artist(let name, _): return "Album artwork by \(name)"
        case .song(let request): return "\(isVideoArtwork ? "Video artwork for" : "Album artwork for") \(request.videoTitle)"
        case .album(let name, _, _): return "Album artwork for \(name)"
        }
    }
}
