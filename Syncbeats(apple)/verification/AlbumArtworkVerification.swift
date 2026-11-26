import AppKit
import Foundation

@main
struct AlbumArtworkVerification {
    static func main() async throws {
        var checks = 0
        func check(_ value: Bool, _ message: String) {
            precondition(value, message); checks += 1; print("PASS: " + message)
        }
        let base = URL(string: "http://127.0.0.1:5277/syncbeats-native-room-home")!
        let resolver = AlbumArtworkResolver(endpoint: base.appendingPathComponent("cover-search"), videoMetadataEndpoint: base.appendingPathComponent("video-identity"))
        let video = URL(string: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg")!
        let request = AlbumArtworkRequest(title: "The Weeknd - Blinding Lights (Official Video)", artist: "TheWeekndVEVO", suppliedURL: video, sourceID: "abcdefghijk")
        check(request.title == "Blinding Lights" && request.artist == "The Weeknd" && request.suppliedURL == nil, "Video labels are cleaned and YouTube frames rejected")
        let version = AlbumArtworkRequest(title: "Blinding Lights - Radio Edit", artist: "The Weeknd", suppliedURL: nil)
        check(version.artist == "The Weeknd" && version.title.contains("Radio Edit"), "Version names are not mistaken for performer names")
        let apple = URL(string: "https://is1-ssl.mzstatic.com/image/thumb/Music/cover/100x100bb.jpg")!
        check(AlbumArtworkRequest.coverURL(apple)?.absoluteString.hasSuffix("600x600bb.jpg") == true, "Apple artwork requests full-size square covers")
        let stored = try JSONDecoder().decode(RoomTrack.self, from: Data(#"{"id":"one","trackUrl":"youtube:abcdefghijk","title":"Blinding Lights","thumbnail":"https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg","albumArt":"https://i.scdn.co/image/original-album"}"#.utf8))
        check(stored.artworkRequest.suppliedURL?.host == "i.scdn.co", "Original backend album art takes precedence over video thumbnails")
        let cover = await resolver.coverURL(for: request)
        check(cover?.path.hasSuffix("/art/1") == true, "Album metadata wins over unrelated artists, live recordings, and single artwork")
        let queueRequest = AlbumArtworkRequest(title: "Blinding Lights", artist: "YouTube", suppliedURL: video, sourceID: "abcdefghijk")
        check(await resolver.coverURL(for: queueRequest) == cover, "Discovered covers survive missing artist metadata after enqueue")
        let data = await withTaskGroup(of: Data?.self) { group in
            for _ in 0..<8 { group.addTask { await resolver.imageData(for: request) } }
            var all: [Data?] = []; for await value in group { all.append(value) }; return all
        }
        check(data.count == 8 && data.allSatisfy { $0.flatMap(NSImage.init(data:)) != nil }, "Concurrent player modes receive decodable cover images")
        let (callsData, _) = try await URLSession.shared.data(from: base.appendingPathComponent("__calls"))
        let calls = try JSONSerialization.jsonObject(with: callsData) as! [[String: Any]]
        let lookups = calls.filter { $0["path"] as? String == "/cover-search" }
        check(lookups.count == 1, "Cover metadata is fetched once and shared across cards and players")
        check(lookups.first?["authorization"] == nil, "Private room credentials are never sent to music artwork providers")
        let query = lookups.first?["query"] as? [String: String]
        check(query?["term"] == "The Weeknd Blinding Lights" && query?["entity"] == "song", "Lookup requests encode artist and title through the public song contract")
        for (artist, title) in [("Different Artist", "Blinding Lights"), ("The Weeknd", "Blinding Lights (Remix)"), ("Missing Artist", "Missing Song"), ("Unavailable Artist", "Song"), ("Malformed Artist", "Song")] {
            let value = await resolver.coverURL(for: AlbumArtworkRequest(title: title, artist: artist, suppliedURL: nil))
            check(value == nil, "No incorrect cover on mismatch or failure: " + artist + " / " + title)
        }
        check(await resolver.coverURL(for: AlbumArtworkRequest(title: "Blinding Lights", artist: nil, suppliedURL: video)) == nil, "Unknown artists retain the placeholder rather than receiving arbitrary artwork")
        let recovered = await resolver.coverURL(for: AlbumArtworkRequest(title: "Blinding Lights", artist: nil, suppliedURL: video, sourceID: "lmnopqrstuv"))
        check(recovered == cover, "Existing queue items recover artist identity before fetching album artwork")
        check(AlbumArtworkRequest.cleanTitle("Open Eye Signal (Remaster 2023)") == "Open Eye Signal", "Remaster metadata retains the original album identity")
        check(AlbumArtworkRequest.cleanTitle("Feather (feat. Cise Starr & Akin)") == "Feather", "Featured-artist credits do not prevent an album match")
        if CommandLine.arguments.contains("--live") {
            let live = AlbumArtworkResolver()
            let value = await live.coverURL(for: request)
            check(value?.host?.hasSuffix("mzstatic.com") == true, "Live Apple metadata resolves an official album cover")
            let image = await live.imageData(for: request)
            check(image.flatMap(NSImage.init(data:))?.size.width == 600, "Live original artwork downloads and decodes at 600 pixels")
            print("Live cover: " + (value?.absoluteString ?? "missing"))
        }
        print("\(checks) album artwork checks passed")
    }
}
