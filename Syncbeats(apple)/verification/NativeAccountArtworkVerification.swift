import AppKit
import Foundation
import SwiftUI
import ImageIO

nonisolated private final class ArtworkHTTPState: @unchecked Sendable {
    private let lock = NSLock()
    private var counts: [String: Int] = [:]
    var profileDelay = false
    var profileFails = false
    var postedName: String?
    var image = Data()
    func count(_ key: String) -> Int { lock.lock(); defer { lock.unlock() }; return counts[key] ?? 0 }
    func response(_ request: URLRequest) -> (Int, String, Data, Bool) {
        lock.lock(); defer { lock.unlock() }
        let path = request.url!.path
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let entity = items.first { $0.name == "entity" }?.value ?? ""
        let term = items.first { $0.name == "term" }?.value ?? ""
        let country = items.first { $0.name == "country" }?.value ?? ""
        let key = path == "/search" ? "\(entity):\(term)" : "\(request.httpMethod ?? "GET"):\(path)"
        counts[key, default: 0] += 1
        var status = 200
        var object: [String: Any] = [:]
        var delay = false
        if path == "/auth/me", request.httpMethod == "PATCH" {
            var body = request.httpBody
            if body == nil, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var collected = Data(), bytes = [UInt8](repeating: 0, count: 1024)
                while stream.hasBytesAvailable { let n = stream.read(&bytes, maxLength: bytes.count); if n <= 0 { break }; collected.append(contentsOf: bytes.prefix(n)) }
                body = collected
            }
            postedName = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["name"] as? String
            delay = profileDelay
            if profileFails { status = 500; object = ["error": "Temporary failure"] }
            else { object = ["user": ["id": "account-fixture", "name": postedName ?? "Wrong body", "email": "fixture@example.invalid", "email_verified_at": "2026-11-20"]] }
        } else if path == "/auth/me" {
            object = ["user": ["id": "account-fixture", "name": "Fixture Listener", "email": "fixture@example.invalid", "email_verified_at": "2026-11-20"], "token": "fixture-token", "defaultRoomId": "123456"]
        } else if path == "/search", entity == "album" {
            object = ["results": term == "No Catalog Match" ? [] : [
                ["artistName": "Other Artist", "collectionName": "Wrong album", "artworkUrl100": "https://fixture.invalid/wrong"],
                ["artistName": term, "collectionName": "An album", "artworkUrl100": "https://fixture.invalid/image"]]]
        } else if path == "/search" {
            object = ["results": term.contains("Regional") && country == "US" ? [] : [["trackName": term.contains("Regional") ? "Regional Song" : "The Song", "artistName": "Fixture Artist", "collectionName": "Album", "artworkUrl100": "https://fixture.invalid/image"]]]
        } else if path == "/image" { return (200, "image/png", image, false) }
        else { status = 404; object = ["error": "Not found"] }
        return (status, "application/json", (try? JSONSerialization.data(withJSONObject: object)) ?? Data(), delay)
    }
}

nonisolated private final class ArtworkHTTPProtocol: URLProtocol, @unchecked Sendable {
    static let state = ArtworkHTTPState()
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "fixture.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let reply = Self.state.response(request)
        let deliver: @Sendable () -> Void = { [self] in
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.0, httpVersion: nil, headerFields: ["Content-Type": reply.1])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: reply.2)
            client?.urlProtocolDidFinishLoading(self)
        }
        if reply.3 { DispatchQueue.global().asyncAfter(deadline: .now() + 0.2, execute: deliver) } else { deliver() }
    }
    override func stopLoading() {}
}

@MainActor private final class AccountFixtureStore: SessionPersisting {
    var token: String? = "fixture-token"
    func read() throws -> String? { token }
    func save(_ token: String) throws { self.token = token }
    func clear() throws { token = nil }
}

@main
struct NativeAccountArtworkVerification {
    @MainActor static func main() async throws {
        setbuf(stdout, nil)
        var checks = 0
        func check(_ condition: Bool, _ description: String) { precondition(condition, description); checks += 1; print("PASS: " + description) }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArtworkHTTPProtocol.self]
        let session = URLSession(configuration: configuration)
        let endpoint = URL(string: "https://fixture.invalid/search")!
        let actual = URL(string: "https://fixture.invalid/image")!
        let candidates: [String?] = ["", "https://i.ytimg.com/vi/abcdefghijk/default.jpg", actual.absoluteString]
        check(AlbumArtworkRequest.firstCover(in: candidates) == actual, "Empty and video fields do not hide a later album cover")
        let track = try JSONDecoder().decode(RoomTrack.self, from: Data(#"{"id":"one","trackUrl":"https://youtu.be/abcdefghijk?thumb=https%3A%2F%2Ffixture.invalid%2Fimage","title":"The Song","artist":"Fixture Artist","albumArt":"","thumbnail":"https://i.ytimg.com/default.jpg"}"#.utf8))
        check(track.artworkRequest.suppliedURL == actual, "Queue metadata retains a valid embedded album cover")
        let albums = try JSONDecoder().decode(ArtistArtworkResponse.self, from: Data(#"{"results":[{"artistName":"Björk Tribute","artworkUrl100":"https://fixture.invalid/wrong"},{"artistName":"Björk","artworkUrl100":"https://fixture.invalid/image"}]}"#.utf8))
        check(albums.coverURL(for: "Bjork") == actual, "Artist artwork matches identity and ignores tribute artists")
        check(albums.coverURL(for: "Unrelated") == nil, "Unrelated album artwork is never assigned to an artist")
        let albumMatch = ArtistArtworkResponse(results: [.init(artistName: "Fixture Artist", collectionName: "The Album", artworkUrl100: actual.absoluteString)])
        check(albumMatch.coverURL(for: "Fixture Artist, Second Artist", album: "The Album") == actual,
              "Album matching accepts a credited collaborator without requiring the full multi-artist label")
        check(albumMatch.coverURL(for: "Fixture Artist", album: "Another Album") == nil,
              "An unrelated album from the same artist is not used as the album cover")
        let artists = ArtistArtworkResolver(session: session, endpoint: endpoint)
        async let first = artists.coverURL(for: "Fixture Artist")
        async let second = artists.coverURL(for: "Fixture Artist")
        let artistURLs = await (first, second)
        check(artistURLs.0 == actual && artistURLs.1 == actual, "Artist cards resolve real matching album artwork")
        check(ArtworkHTTPProtocol.state.count("album:Fixture Artist") == 1, "Artist artwork requests are coalesced")
        _ = await artists.coverURL(for: "Fixture Artist")
        check(ArtworkHTTPProtocol.state.count("album:Fixture Artist") == 1, "Resolved artist artwork is cached")
        let missing = await artists.coverURL(for: "No Catalog Match")
        _ = await artists.coverURL(for: "No Catalog Match")
        check(missing == nil && ArtworkHTTPProtocol.state.count("album:No Catalog Match") == 2, "Missing artist artwork retries storefronts once and caches the failure")
        let resolver = AlbumArtworkResolver(session: session, endpoint: endpoint)
        let regional = AlbumArtworkRequest(title: "Regional Song", artist: "Fixture Artist", suppliedURL: nil)
        let regionalCover = await resolver.coverURL(for: regional)
        check(regionalCover == actual && ArtworkHTTPProtocol.state.count("song:Fixture Artist Regional Song") == 2, "Songs resolve artwork from a second storefront when needed")
        let partial = AlbumArtworkRequest(title: "The Song", artist: nil, suppliedURL: URL(string: "https://fixture.invalid/broken"), sourceID: "abcdefghijk")
        _ = await resolver.coverURL(for: partial)
        let complete = AlbumArtworkRequest(title: "The Song", artist: "Fixture Artist", suppliedURL: nil, sourceID: "abcdefghijk")
        let completeURL = await resolver.coverURL(for: complete)
        check(completeURL == actual, "Fresh artist metadata replaces a cached partial identity")
        let context = CGContext(data: nil, width: 32, height: 32, bitsPerComponent: 8, bytesPerRow: 128, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.setFillColor(CGColor(red: 0.8, green: 0.2, blue: 0.1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: 32, height: 32))
        let imageData = NSMutableData()
        let destination = CGImageDestinationCreateWithData(imageData, "public.png" as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, context.makeImage()!, nil); check(CGImageDestinationFinalize(destination), "Artwork fixture encodes as a real image")
        ArtworkHTTPProtocol.state.image = imageData as Data
        let stale = URL(string: "https://fixture.invalid/expired-cover.jpg")!
        let recovery = DiscoverySongArtworkResolver(session: session, endpoint: endpoint)
        let images = AlbumArtworkResolver(session: session, endpoint: endpoint)
        let staleRequest = DiscoverySongArtworkRequest(title: "The Song", artist: "Fixture Artist",
            album: .init(title: "The Song", artist: "Fixture Artist", suppliedURL: stale), thumbnail: nil)
        let recoveredImage = await recovery.imageData(for: staleRequest, images: images)
        check(recoveredImage == imageData as Data, "Expired discovery covers recover through a fresh matching catalog lookup")
        let noCover = NativeLibrarySong(id: "missing", title: "A song", artist: "Fixture Artist", source: "APPLE_MUSIC")
        let withCover = NativeLibrarySong(id: "available", title: "Z song", artist: "Fixture Artist", artwork: actual.absoluteString, source: "APPLE_MUSIC")
        let group = NativeLibraryGroup(id: "group", name: "Album", subtitle: "Fixture Artist", songs: [noCover, withCover])
        check(group.artworkSong?.id == withCover.id, "Album and artist groups use an available cover even when the first song has none")

        let fallback = await resolver.imageData(for: AlbumArtworkRequest(title: "The Song", artist: "Fixture Artist", suppliedURL: URL(string: "https://fixture.invalid/broken")))
        check(fallback == imageData as Data, "Failed supplied artwork falls back to matched metadata")
        let sparse = await resolver.imageData(for: AlbumArtworkRequest(title: "The Song", artist: nil, suppliedURL: URL(string: "https://fixture.invalid/broken"), sourceID: "abcdefghijk"))
        check(sparse == imageData as Data, "A sparse snapshot retains the discovered artist when artwork fails")
        let decoded = DiscoveryArtworkDecoder.decode(imageData as Data)
        check(decoded?.image.width == 32, "Discovery artwork decodes a bounded thumbnail")
        check((decoded?.tint.red ?? 0) > (decoded?.tint.green ?? 1) * 1.5 && (decoded?.tint.red ?? 0) > (decoded?.tint.blue ?? 1) * 1.5, "Artwork glow tint comes from the cover pixels")
        check(DiscoveryArtworkDecoder.decode(Data("bad image".utf8)) == nil, "Invalid artwork uses an honest fallback")
        func discovery(_ title: String, _ artist: String? = "T-Series", thumbnail: String? = nil) -> DiscoverySongArtworkRequest {
            .init(title: title, artist: artist, album: .init(title: title, artist: artist, suppliedURL: nil, sourceID: "abcdefghijk"), thumbnail: thumbnail)
        }
        let bollywood = try JSONDecoder().decode(AlbumArtworkSearchResponse.self, from: Data(#"{"results":[{"trackName":"Tere Bina","artistName":"Unrelated Singer","artworkUrl100":"https://fixture.invalid/wrong"},{"trackName":"Tere Bina","artistName":"A.R. Rahman, Chinmayi Sripada, Murtuza Khan & Qadir Khan","artworkUrl100":"https://fixture.invalid/image"},{"trackName":"Kun Faya Kun","artistName":"A.R. Rahman, Javed Ali & Mohit Chauhan","artworkUrl100":"https://fixture.invalid/image"},{"trackName":"Nee Singam Dhan (From \"Pathu Thala\")","artistName":"A.R. Rahman & Sid Sriram","artworkUrl100":"https://fixture.invalid/image"}]}"#.utf8))
        let tereBina = discovery("A.R. Rahman - Tere Bina | Lyrical Song | Aishwarya Rai | Abhishek Bachchan | Guru | Gulzar", "Sony Music India")
        check(tereBina.matchedCover(in: bollywood) == actual, "Live Tere Bina title matches its collaborative artist instead of the uploader")
        check(discovery("Tere Bina - Full Video | A. R. Rahman | Aishwarya Rai | Abhishek Bachchan | Guru").matchedCover(in: bollywood) == actual, "Full Video labels and cast lists do not hide a recording identity")
        let kunFayaKun = discovery("ROCKSTAR: Kun Faya Kun (Full Video Song) | Ranbir Kapoor | A.R. Rahman, Javed Ali, Mohit Chauhan")
        check(kunFayaKun.matchedCover(in: bollywood) == actual && kunFayaKun.searchTerm == "ROCKSTAR Kun Faya Kun", "Soundtrack prefixes and Full Video Song labels resolve the live Kun Faya Kun result")
        check(discovery("Pathu Thala - Nee Singam Dhan Video | Silambarasan TR | A. R Rahman | Gautham Karthik", "Sony Music South").matchedCover(in: bollywood) == actual, "Soundtrack title decorations match a From soundtrack recording")
        check(discovery("Tere Bina", "Other Singer").matchedCover(in: bollywood) == nil, "An exact title without matching artist evidence cannot select unrelated cover artwork")
        check(discovery("Tere Bina (Remix) | A. R. Rahman").matchedCover(in: bollywood) == nil, "Remix identity never borrows the original recording cover")
        let collection = discovery("AR Rahman Hits - Audio Jukebox | AR Rahman Songs | Taal | Fiza", thumbnail: "https://fixture.invalid/image")
        check(collection.isCollection && collection.matchedCover(in: bollywood) == nil && collection.thumbnail == actual, "Jukeboxes retain their actual source artwork rather than assigning one album")
        check(discovery("Unmatched recording").thumbnail?.absoluteString == "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", "Sparse video results have a source thumbnail fallback")
        let searchMetadata = try JSONDecoder().decode(RoomSearchResult.self, from: Data(#"{"url":"https://youtu.be/abcdefghijk","title":"The Song","uploaderName":"Fixture Artist","albumArt":"","thumbnail":"https://fixture.invalid/image"}"#.utf8))
        check(searchMetadata.artworkRequest.suppliedURL == actual, "An empty album field does not hide valid search-result artwork")
        let discoveryBeforeCount = ArtworkHTTPProtocol.state.count("song:The Song")
        let discoveryResolver = DiscoverySongArtworkResolver(session: session, endpoint: endpoint)
        async let discoveryFirst = discoveryResolver.coverURL(for: discovery("The Song", "Fixture Artist"))
        async let discoverySecond = discoveryResolver.coverURL(for: discovery("The Song", "Fixture Artist"))
        let discoveryURLs = await (discoveryFirst, discoverySecond)
        check(discoveryURLs.0 == actual && discoveryURLs.1 == actual && ArtworkHTTPProtocol.state.count("song:The Song") == discoveryBeforeCount + 1, "Discovery requests coalesce and return matched artwork")
        let skippedCollection = await discoveryResolver.coverURL(for: collection)
        check(skippedCollection == nil && ArtworkHTTPProtocol.state.count("song:" + collection.searchTerm) == 0, "Jukebox artwork avoids fruitless album-provider requests")
        let suite = "SyncBeats.AccountArtworkVerification.\(UUID().uuidString)"
        let preferences = UserDefaults(suiteName: suite)!
        defer { preferences.removePersistentDomain(forName: suite) }
        let api = AuthAPI(baseURL: URL(string: "https://fixture.invalid")!, deviceID: "fixture-device", session: session)
        let model = AppModel(api: api, store: AccountFixtureStore(), preferences: preferences)
        await model.restoreSession()
        check(model.account?.name == "Fixture Listener", "Profile uses the authenticated account")
        model.roomID = nil
        check(model.libraryCredentials != nil && model.roomCredentials == nil, "Library access does not depend on a room finishing its setup")
        try await model.updateProfileName("  Room Listener  ")
        check(model.account?.name == "Room Listener" && ArtworkHTTPProtocol.state.postedName == "Room Listener", "Display name saves through authenticated PATCH with trimmed input")
        let writes = ArtworkHTTPProtocol.state.count("PATCH:/auth/me")
        do { try await model.updateProfileName("   "); preconditionFailure("Blank name accepted") } catch {}
        check(ArtworkHTTPProtocol.state.count("PATCH:/auth/me") == writes, "Blank names are rejected before a network write")
        ArtworkHTTPProtocol.state.profileFails = true
        do { try await model.updateProfileName("Failure"); preconditionFailure("Failure accepted") } catch {}
        check(model.account?.name == "Room Listener", "Failed profile writes preserve the saved name")
        ArtworkHTTPProtocol.state.profileFails = false
        model.appearance = "light"; model.notchEnabled = false
        let reloaded = AppModel(api: api, store: AccountFixtureStore(), preferences: preferences)
        check(reloaded.appearance == "light" && !reloaded.notchEnabled, "Appearance and island preferences survive app restart")
        let room = RoomSession()
        let palette = NativePalette(light: false)
        for (name, view) in [("profile", AnyView(AccountProfileView(model: model, room: room, palette: palette))), ("settings", AnyView(AccountSettingsView(model: model, room: room, palette: palette)))] {
            for size in [CGSize(width: 960, height: 560), CGSize(width: 520, height: 260), CGSize(width: 360, height: 240)] {
                let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height))
                host.frame = NSRect(origin: .zero, size: size); host.layoutSubtreeIfNeeded()
                check(host.fittingSize.width <= size.width + 1, "\(name.capitalized) page fits a \(Int(size.width))-point host")
            }
        }
        ArtworkHTTPProtocol.state.profileDelay = true
        let pending = Task { try await model.updateProfileName("Stale update") }
        try await Task.sleep(for: .milliseconds(40)); model.accountPage = .profile; model.signOut()
        do { try await pending.value; preconditionFailure("Stale update accepted") } catch {}
        check(model.account == nil && model.accountPage == nil, "A late profile response cannot restore a signed-out account")
        print("\(checks) native account/artwork checks passed")
    }
}
