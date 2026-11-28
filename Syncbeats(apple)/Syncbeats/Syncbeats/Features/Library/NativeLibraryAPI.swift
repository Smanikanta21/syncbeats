import Foundation

protocol NativeLibraryServing {
    func appleImportLimit() async throws -> Int
    func importApplePlaylist(_ playlist: NativeLibraryPlaylist, songs: [NativeLibrarySong]) async throws -> NativeAppleImportBatch
    func playlists() async throws -> [NativeLibraryPlaylist]
    func save(_ result: RoomSearchResult) async throws
    func resolve(_ song: NativeLibrarySong) async throws -> String
    func rename(_ playlist: NativeLibraryPlaylist, to name: String) async throws
    func addSongs(_ songs: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist
    func delete(_ playlist: NativeLibraryPlaylist, songs: NativePlaylistSongDisposition) async throws -> NativeLibraryPlaylist?
    func indexPage(cursor: String?) async throws -> NativeLibraryIndexPage
    func trackPage(_ playlist: NativeLibraryPlaylist, cursor: String?) async throws -> NativeLibraryResultPage<NativeLibrarySong>
    func catalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage
}

extension NativeLibraryServing {
    func appleImportLimit() async throws -> Int { throw AuthFailure.response(409, "Update the SyncBeats server to save Apple Music to your account. Your selection has not been uploaded.") }
    func importApplePlaylist(_ playlist: NativeLibraryPlaylist, songs: [NativeLibrarySong]) async throws -> NativeAppleImportBatch {
        throw AuthFailure.response(409, "This server does not support Apple Music account import.")
    }

    func indexPage(cursor: String?) async throws -> NativeLibraryIndexPage {
        let entries = try await playlists()
        return .init(playlists: entries, nextCursor: nil, savedYoutubeIDs: Set(entries.flatMap(\.songs).compactMap(\.youtubeID)))
    }
    func trackPage(_ playlist: NativeLibraryPlaylist, cursor: String?) async throws -> NativeLibraryResultPage<NativeLibrarySong> { .init(items: playlist.songs, nextCursor: nil) }
    func catalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage {
        let songs = NativeLibraryCollection.songs(playlists: try await playlists(), imported: [])
        return .init(songs: songs, groups: section == .albums ? NativeLibraryCollection.albums(songs) : section == .artists ? NativeLibraryCollection.artists(songs) : [], nextCursor: nil, total: songs.count)
    }
}

struct NativeLibraryAPI: NativeLibraryServing {
    let credentials: RoomCredentials
    var http: URLSession = .shared

    func appleImportLimit() async throws -> Int {
        struct Capability: Decodable { let version: Int; let maxTracks: Int }
        do {
            let capability: Capability = try decode(await request("api/playlists/apple-music/import"))
            guard capability.version == 1, (1...100).contains(capability.maxTracks) else { throw AuthFailure.invalidResponse }
            return capability.maxTracks
        } catch AuthFailure.response(404, _) {
            throw AuthFailure.response(409, "Update the SyncBeats server to save Apple Music to your account. Your selection has not been uploaded.")
        }
    }
    func importApplePlaylist(_ playlist: NativeLibraryPlaylist, songs: [NativeLibrarySong]) async throws -> NativeAppleImportBatch {
        let tracks: [[String: Any]] = songs.map { song in
            var item: [String: Any] = ["sourceId": song.id, "title": song.title, "artist": song.artist]
            if let album = song.album { item["album"] = album }
            if let artwork = NativeLibraryArtwork.remoteURL(in: [song.artwork, song.thumbnail]) { item["albumArt"] = artwork }
            if let duration = song.duration { item["duration"] = duration }
            if let video = song.youtubeID { item["youtubeId"] = video }
            return item
        }
        var body: [String: Any] = ["sourceId": playlist.id, "name": playlist.name, "tracks": tracks]
        if let artwork = NativeLibraryArtwork.remoteURL(in: [playlist.artwork]) { body["coverUrl"] = artwork }
        if let description = playlist.description { body["description"] = description }
        let response: NativeAppleImportBatch = try decode(await request("api/playlists/apple-music/import", method: "POST", body: body))
        guard response.version == 1 else { throw AuthFailure.invalidResponse }
        return response
    }
    func indexPage(cursor: String?) async throws -> NativeLibraryIndexPage {
        struct Entry: Decodable {
            let id: String; let name: String; let description: String?; let coverUrl: String?
            let sourceType: String; let trackCount: Int?; let preview: NativeLibraryTrackPayload?
        }
        struct Page: Decodable { let playlists: [Entry]; let nextCursor: String?; let savedYoutubeIDs: [String]? }
        let data = try await request("api/playlists", query: [.init(name: "limit", value: "40"), .init(name: "cursor", value: cursor ?? "0")])
        let page: Page = try decode(data)
        let legacy = page.savedYoutubeIDs == nil
        let offset = legacy ? (Int(cursor ?? "0") ?? 0) : 0
        let entries = legacy ? Array(page.playlists.dropFirst(offset).prefix(40)) : page.playlists
        let next = legacy ? (page.playlists.count > offset + 40 ? String(offset + 40) : nil) : page.nextCursor
        return .init(playlists: entries.map { .init(id: "server:" + $0.id, name: $0.name, description: $0.description, artwork: $0.coverUrl, source: $0.sourceType, songs: [], trackCount: $0.trackCount, preview: $0.preview?.item(source: $0.sourceType)) },
                     nextCursor: next, savedYoutubeIDs: Set(page.savedYoutubeIDs ?? []), requiresServerUpdate: legacy)
    }
    func trackPage(_ playlist: NativeLibraryPlaylist, cursor: String?) async throws -> NativeLibraryResultPage<NativeLibrarySong> {
        struct Page: Decodable { let playlist: NativeLibraryPlaylistPayload; let nextCursor: String? }
        do {
            let data = try await request(path(playlist) + "/tracks", query: [.init(name: "limit", value: "60"), .init(name: "cursor", value: cursor ?? "0")])
            let page: Page = try decode(data)
            return .init(items: page.playlist.item.songs, nextCursor: page.nextCursor, playlist: page.playlist.item)
        } catch AuthFailure.response(404, _) {
            // Older servers expose full playlist details, but have no track-page route.
            let item = try await legacyPlaylist(playlist)
            let offset = Int(cursor ?? "0") ?? 0
            return .init(items: Array(item.songs.dropFirst(offset).prefix(60)),
                         nextCursor: item.songs.count > offset + 60 ? String(offset + 60) : nil, playlist: item)
        }
    }
    func catalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage {
        struct Group: Decodable { let artist: String; let album: String?; let count: Int; let preview: NativeLibrarySong }
        struct Page: Decodable { let songs: [NativeLibrarySong]?; let groups: [Group]?; let nextCursor: String?; let total: Int }
        var parameters = [URLQueryItem(name: "view", value: filter == nil ? section.rawValue.lowercased() : "songs"), .init(name: "limit", value: "60"), .init(name: "cursor", value: cursor ?? "0"), .init(name: "q", value: query)]
        if let filter { parameters.append(.init(name: "artist", value: filter.artist)); if let album = filter.album { parameters.append(.init(name: "album", value: album)) } }
        let data: Data
        do { data = try await request("api/playlists/catalog", query: parameters) }
        catch AuthFailure.response(404, _) { return try await legacyCatalogPage(section, cursor: cursor, query: query, filter: filter) }
        let page: Page = try decode(data)
        let groups: [NativeLibraryGroup] = (page.groups ?? []).map { group in
            let key = group.album.map { AlbumArtworkRequest.normalized($0) + ":" + AlbumArtworkRequest.normalized(group.artist) } ?? AlbumArtworkRequest.normalized(AlbumArtworkRequest.cleanArtist(group.artist))
            return .init(id: key, name: group.album ?? AlbumArtworkRequest.cleanArtist(group.artist), subtitle: group.album != nil ? group.artist : "\(group.count) songs", songs: [group.preview], filter: .init(album: group.album, artist: group.artist), total: group.count)
        }
        return .init(songs: page.songs ?? [], groups: groups, nextCursor: page.nextCursor, total: page.total)
    }

    private func decode<Value: Decodable>(_ data: Data) throws -> Value {
        do { return try JSONDecoder().decode(Value.self, from: data) }
        catch {
            NativeDiagnostics.failure("Library", "Decode server response", error: error)
            throw AuthFailure.response(502, "The SyncBeats server returned incomplete Library data. Update the server, then refresh your Library.")
        }
    }
    private func legacyPlaylist(_ playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist {
        struct Detail: Decodable { let playlist: NativeLibraryPlaylistPayload }
        let page: Detail = try decode(await request(path(playlist)))
        var item = page.playlist.item; item.trackCount = item.songs.count
        return item
    }
    private func legacyCatalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage {
        struct Index: Decodable { let playlists: [NativeLibraryPlaylistPayload] }
        let index: Index = try decode(await request("api/playlists"))
        let offset = Int(cursor ?? "0") ?? 0
        // Without server paging, hydrate one saved playlist at a time as its scroll sentinel appears.
        let candidates = Array(index.playlists.dropFirst(offset).prefix(1))
        var playlists: [NativeLibraryPlaylist] = []
        for entry in candidates { playlists.append(try await legacyPlaylist(entry.item)) }
        let values = NativeLibraryCollection.songs(playlists: playlists, imported: []).filter { song in
            let matchesQuery = query.isEmpty || (song.title + " " + song.artist + " " + (song.album ?? "")).localizedCaseInsensitiveContains(query)
            let matchesArtist = filter == nil || song.artist.trimmingCharacters(in: .whitespacesAndNewlines).caseInsensitiveCompare(filter!.artist.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
            let matchesAlbum = filter?.album == nil || song.album?.caseInsensitiveCompare(filter!.album!) == .orderedSame
            return matchesQuery && matchesArtist && matchesAlbum
        }
        let groups = section == .albums ? NativeLibraryCollection.albums(values) : NativeLibraryCollection.artists(values)
        return .init(songs: values, groups: groups, nextCursor: index.playlists.count > offset + 1 ? String(offset + 1) : nil, total: values.count)
    }
    private func path(_ playlist: NativeLibraryPlaylist) throws -> String {
        guard let id = playlist.serverID, id.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else { throw AuthFailure.invalidInput("This playlist isn't stored on the server.") }
        return "api/playlists/" + id
    }
    func rename(_ playlist: NativeLibraryPlaylist, to name: String) async throws {
        _ = try await request(path(playlist), method: "PUT", body: ["name": name])
    }
    func addSongs(_ songs: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist {
        struct Added: Decodable { let playlist: NativeLibraryPlaylistPayload }
        let tracks: [[String: Any]] = songs.map { song in
            var track: [String: Any] = ["title": song.title, "artist": song.artist, "youtubeId": song.youtubeID ?? "", "thumbnail": song.thumbnail ?? "", "album": song.album ?? "", "albumArt": song.artwork ?? ""]
            if let duration = song.duration { track["duration"] = duration }
            return track
        }
        return try JSONDecoder().decode(Added.self, from: await request(path(playlist) + "/tracks/batch", method: "POST", body: ["tracks": tracks])).playlist.item
    }
    func delete(_ playlist: NativeLibraryPlaylist, songs: NativePlaylistSongDisposition) async throws -> NativeLibraryPlaylist? {
        struct Capability: Decodable { let version: Int }
        let capability = try JSONDecoder().decode(Capability.self, from: await request(path(playlist) + "/management"))
        guard capability.version == 1 else { throw AuthFailure.invalidInput("Update the SyncBeats server before deleting playlists from Library.") }
        struct Deleted: Decodable { let success: Bool; let library: NativeLibraryPlaylistPayload? }
        let response = try JSONDecoder().decode(Deleted.self, from: await request(path(playlist), method: "DELETE", body: ["songDisposition": songs.rawValue]))
        guard response.success else { throw AuthFailure.invalidResponse }
        return response.library?.item
    }

    func playlists() async throws -> [NativeLibraryPlaylist] {
        nonisolated struct List: Decodable { nonisolated struct Entry: Decodable { let id: String }; let playlists: [Entry] }
        nonisolated struct Detail: Decodable { let playlist: NativeLibraryPlaylistPayload }
        let list = try JSONDecoder().decode(List.self, from: await request("api/playlists"))
        let ids = Array(Set(list.playlists.map(\.id)))
        let results = try await withThrowingTaskGroup(of: NativeLibraryPlaylist.self) { group in
            var iterator = ids.makeIterator(), fetched: [String: NativeLibraryPlaylist] = [:]
            func fetch(_ id: String) {
                group.addTask {
                    guard id.range(of: #"^[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil else { throw AuthFailure.invalidResponse }
                    return try JSONDecoder().decode(Detail.self, from: await request("api/playlists/" + id)).playlist.item
                }
            }
            for _ in 0..<min(4, ids.count) { if let id = iterator.next() { fetch(id) } }
            while let playlist = try await group.next() {
                fetched[playlist.id] = playlist
                if let id = iterator.next() { fetch(id) }
            }
            return list.playlists.compactMap { fetched["server:" + $0.id] }
        }
        return results
    }
    func save(_ result: RoomSearchResult) async throws {
        guard let id = YouTubeIdentity.id(in: result.url) else { throw AuthFailure.invalidInput("This song cannot be saved yet.") }
        var body: [String: Any] = ["youtubeId": id, "title": result.title]
        if let artist = result.uploaderName { body["artist"] = artist }
        if let art = result.albumArt ?? result.thumbnail { body["thumbnail"] = art }
        if let duration = result.duration { body["duration"] = duration }
        _ = try await request("api/playlists/library/tracks", method: "POST", body: body)
    }
    func resolve(_ song: NativeLibrarySong) async throws -> String {
        struct Match: Decodable { let youtubeId: String? }
        var body: [String: Any] = ["title": song.title, "artist": song.artist]
        if let id = song.sourceSongID { body["songId"] = id }
        let data = try await request("api/bridge/resolve", method: "POST", body: body)
        let match = try JSONDecoder().decode(Match.self, from: data)
        guard let id = match.youtubeId, id.range(of: #"^[A-Za-z0-9_-]{11}$"#, options: .regularExpression) != nil else {
            throw AuthFailure.invalidInput("No room version was found for this song. Try searching in Home.")
        }
        return id
    }
    private func request(_ path: String, method: String = "GET", body: [String: Any]? = nil, query parameters: [URLQueryItem] = []) async throws -> Data {
        var components = URLComponents(url: credentials.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !parameters.isEmpty { components.queryItems = parameters }
        var query = URLRequest(url: components.url!, timeoutInterval: 25)
        query.httpMethod = method
        query.setValue("Bearer " + credentials.token, forHTTPHeaderField: "Authorization")
        query.setValue(credentials.deviceID, forHTTPHeaderField: "x-device-id")
        query.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { query.httpBody = try JSONSerialization.data(withJSONObject: body); query.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await NativeDiagnostics.data(for: query, using: http, operation: NativeDiagnostics.operation(method: method, path: path))
        guard let response = response as? HTTPURLResponse else { throw AuthFailure.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw AuthFailure.response(response.statusCode, error ?? "Your Library couldn't be loaded. Please try again.")
        }
        return data
    }
}
