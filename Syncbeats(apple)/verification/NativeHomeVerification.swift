import Foundation

@main
struct NativeHomeVerification {
    @MainActor static func main() async throws {
        var checks = 0
        func check(_ value: @autoclosure () -> Bool, _ message: String) {
            precondition(value(), message); checks += 1; print("PASS: \(message)")
        }
        let base = URL(string: "http://127.0.0.1:5277/syncbeats-native-room-home")!
        func credentials(device: String = "native-home-device", token: String = "native-home-test") -> RoomCredentials {
            RoomCredentials(roomID: "512804", userID: "native-home-user", displayName: "Native Listener", token: token, baseURL: base, deviceID: device)
        }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 10
        let http = URLSession(configuration: config)
        let api = RoomHomeAPI(credentials: credentials(), http: http)
        NativeDiagnostics.started(endpoint: base)
        check(NativeDiagnostics.operation(method: "GET", path: "rooms/private-room/youtube-search") == "GET /rooms/:id/youtube-search", "HTTP diagnostics redact room identifiers")
        let catalog = try await api.musicCatalog()
        check(catalog.artists.first?.id == "anirudh", "Music catalog uses stable artist identities")
        let starter = try await api.musicFeed()
        check(starter.profile.onboardingStatus == "NEW" && !starter.profile.useActivity, "New users start with activity learning off")
        check(starter.sections.first?.picks.first?.query == "Anirudh Ravichander songs", "Suggestions are explicit discovery searches, not fabricated playable tracks")
        var taste = MusicTaste(); taste.onboardingStatus = "COMPLETE"; taste.languages = ["Telugu"]; taste.favoriteArtistIds = ["anirudh"]; taste.customArtists = ["My local band"]; taste.useActivity = true
        try await api.saveTaste(taste)
        let saved = try await api.musicFeed()
        check(saved.profile == taste, "Native interests round-trip through the backend JSON contract")
        try await api.feedback(artistID: "anirudh", kind: "LIKE")
        try await api.resetTaste()
        let reset = try await api.musicFeed()
        check(reset.profile.onboardingStatus == "NEW", "Reset reloads the fresh profile")
        do { _ = try await RoomHomeAPI(credentials: credentials(token: "invalid"), http: http).musicFeed(); check(false, "Unauthorized feed must throw") }
        catch { check(error.localizedDescription.contains("Invalid token"), "Unauthorized personalization is reported as an error") }
        do { _ = try await RoomHomeAPI(credentials: credentials(device: "fault-malformed"), http: http).musicFeed(); check(false, "Malformed feed must throw") }
        catch { check(error is DecodingError, "Malformed recommendation data is rejected") }
        let suggestions = try await api.discovery(.electronic)
        check(suggestions.count == 3 && suggestions[0].title == "A Walk", "Discovery decodes the existing room search response")
        check(suggestions[0].artworkURL?.host == "127.0.0.1", "Local artwork is retained without upstream requests")
        let history = try await api.history()
        check(history.count == 1 && history[0].title == "A Walk", "History deduplicates listens and rejects invalid YouTube identifiers")
        let item = try await api.enqueue(suggestions[0])
        check(item.id == "track-0" && item.title == "A Walk", "Enqueue returns the server track used for playback commands")
        check(YouTubeIdentity.id(in: item.trackUrl) == YouTubeIdentity.id(in: suggestions[0].url), "Discovery and queue use the same source identity")
        let librarySong = NativeLibrarySong(id: "apple-song:fixture", title: "Original Song - Reprise (Live)", artist: "Original Artist",
            artwork: "https://example.invalid/album.jpg", youtubeID: YouTubeIdentity.id(in: suggestions[0].url), source: "APPLE_MUSIC")
        let libraryItem = try await api.enqueue(librarySong.result!)
        check(libraryItem.id == item.id && libraryItem.title == librarySong.title && libraryItem.artist == librarySong.artist && libraryItem.thumbnail == librarySong.artwork,
              "Selecting a library song retains its full metadata when its YouTube audio is already queued")
        try await api.reorder(itemID: "track-1", newIndex: 2)
        let (callData, _) = try await http.data(from: base.appendingPathComponent("__calls"))
        let calls = try JSONSerialization.jsonObject(with: callData) as! [[String: Any]]
        let search = calls.last { ($0["path"] as? String)?.hasSuffix("youtube-search") == true }!
        check((search["query"] as? [String: String])?["q"] == DiscoveryGenre.electronic.query, "Discovery sends the selected genre through q")
        check(search["authorization"] as? String == "Bearer native-home-test" && search["device"] as? String == "native-home-device", "Home requests preserve token and device headers")
        let reorder = calls.last { ($0["path"] as? String)?.hasSuffix("queue/reorder") == true }!
        let body = reorder["body"] as! [String: Any]
        check(reorder["method"] as? String == "PUT" && body["itemId"] as? String == "track-1" && body["newIndex"] as? Int == 2, "Queue reordering sends itemId and a numeric newIndex using PUT")
        do { _ = try await RoomHomeAPI(credentials: credentials(device: "fault-server"), http: http).discovery(.all); check(false, "Server failure must throw") }
        catch { check(error.localizedDescription.contains("temporarily unavailable"), "Discovery errors preserve a useful retry message") }
        do { _ = try await RoomHomeAPI(credentials: credentials(token: "invalid"), http: http).history(); check(false, "Unauthorized request must throw") }
        catch { check(error.localizedDescription.contains("Invalid token"), "Unauthorized history is not displayed as empty success") }
        do { _ = try await RoomHomeAPI(credentials: credentials(device: "fault-malformed"), http: http).discovery(.all); check(false, "Malformed response must throw") }
        catch { check(error is DecodingError, "Malformed discovery data is rejected") }
        do { try await api.reorder(itemID: "gone", newIndex: 1); check(false, "Removed track must throw") }
        catch { check(error.localizedDescription.contains("no longer"), "Concurrent queue removal produces a useful error") }
        do { try await api.reorder(itemID: "track-1", newIndex: -1); check(false, "Negative queue index must throw") }
        catch { check(error.localizedDescription.contains("valid queue"), "Invalid queue positions are rejected before sending") }
        print("\(checks) native home API checks passed")
    }
}
