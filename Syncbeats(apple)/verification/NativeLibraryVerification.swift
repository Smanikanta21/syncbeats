import AppKit
import Foundation
import SwiftUI

nonisolated private final class LibraryDiskFixture: NativeLibraryPersisting, @unchecked Sendable {
    private let lock = NSLock()
    private var libraries: [String: NativeImportedLibrary] = [:]
    var failRead = false
    var failWrite = false
    func read(key: String) throws -> NativeImportedLibrary {
        lock.lock(); defer { lock.unlock() }
        if failRead { throw AuthFailure.invalidResponse }
        return libraries[key] ?? .init()
    }
    func write(_ library: NativeImportedLibrary, key: String) throws {
        lock.lock(); defer { lock.unlock() }
        if failWrite { throw AuthFailure.invalidResponse }
        libraries[key] = library
    }
}

@MainActor private final class LibraryServiceFixture: NativeLibraryServing {
    var entries: [NativeLibraryPlaylist] = []
    var delay: Duration = .zero
    var fails = false
    var importCalls: [[NativeLibrarySong]] = []
    var failImportAt: Int? = nil
    var unsupportedImport = false
    var invalidImportAck = false
    var importDelay: Duration = .zero
    func appleImportLimit() async throws -> Int {
        if unsupportedImport { throw AuthFailure.invalidResponse }
        return 100
    }
    func importApplePlaylist(_ playlist: NativeLibraryPlaylist, songs: [NativeLibrarySong]) async throws -> NativeAppleImportBatch {
        importCalls.append(songs)
        if importDelay != .zero { try await Task.sleep(for: importDelay) }
        if failImportAt == importCalls.count { throw AuthFailure.invalidResponse }
        let index = entries.firstIndex { $0.id == "remote:" + playlist.id }
        var item = index.map { entries[$0] } ?? NativeLibraryPlaylist(id: "remote:" + playlist.id, name: playlist.name, source: "APPLE_MUSIC", songs: [])
        let existing = Set(item.songs.map(\.id))
        let added = songs.filter { !existing.contains($0.id) }
        item.songs += added
        if let index { entries[index] = item } else { entries.append(item) }
        return .init(version: 1, playlistId: item.id, name: item.name, sourceId: invalidImportAck ? "wrong" : playlist.id,
                     trackCount: item.songs.count, added: added.count, processed: songs.count)
    }
    var saves = 0
    var paged = false
    func playlists() async throws -> [NativeLibraryPlaylist] {
        let captured = entries
        if delay != .zero { try await Task.sleep(for: delay) }
        if fails { throw AuthFailure.invalidResponse }
        return captured
    }
    func indexPage(cursor: String?) async throws -> NativeLibraryIndexPage {
        let values = try await playlists()
        let offset = Int(cursor ?? "0") ?? 0
        let page = paged ? Array(values.dropFirst(offset).prefix(40)).map { playlist in
            var value = playlist; value.trackCount = value.songs.count; value.preview = value.songs.first; value.songs = []; return value
        } : values
        return .init(playlists: page, nextCursor: paged && values.count > offset + 40 ? String(offset + 40) : nil,
                     savedYoutubeIDs: Set(values.flatMap(\.songs).compactMap(\.youtubeID)))
    }
    func trackPage(_ playlist: NativeLibraryPlaylist, cursor: String?) async throws -> NativeLibraryResultPage<NativeLibrarySong> {
        let values = entries.first { $0.id == playlist.id }?.songs ?? playlist.songs
        let offset = Int(cursor ?? "0") ?? 0
        return .init(items: Array(values.dropFirst(offset).prefix(60)), nextCursor: paged && values.count > offset + 60 ? String(offset + 60) : nil)
    }
    func catalogPage(_ section: NativeLibrarySection, cursor: String?, query: String, filter: NativeLibraryGroupFilter?) async throws -> NativeLibraryCatalogPage {
        let values = NativeLibraryCollection.songs(playlists: entries, imported: []).filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }
        let offset = Int(cursor ?? "0") ?? 0
        let page = paged ? Array(values.dropFirst(offset).prefix(60)) : values
        let groups = section == .albums ? NativeLibraryCollection.albums(values) : NativeLibraryCollection.artists(values)
        return .init(songs: page, groups: paged ? Array(groups.dropFirst(offset).prefix(60)) : groups,
                     nextCursor: paged && values.count > offset + 60 ? String(offset + 60) : nil, total: values.count)
    }
    func save(_ result: RoomSearchResult) async throws { saves += 1 }
    func resolve(_ song: NativeLibrarySong) async throws -> String { "abcdefghijk" }
    func rename(_ playlist: NativeLibraryPlaylist, to name: String) async throws {
        if delay != .zero { try await Task.sleep(for: delay) }
        if fails { throw AuthFailure.invalidResponse }
        if let index = entries.firstIndex(where: { $0.id == playlist.id }) { entries[index].name = name }
    }
    func addSongs(_ songs: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws -> NativeLibraryPlaylist {
        if fails { throw AuthFailure.invalidResponse }
        guard let index = entries.firstIndex(where: { $0.id == playlist.id }) else { throw AuthFailure.invalidResponse }
        entries[index].songs = NativeLibraryCollection.songs(playlists: [entries[index]], imported: songs)
        return entries[index]
    }
    func delete(_ playlist: NativeLibraryPlaylist, songs: NativePlaylistSongDisposition) async throws -> NativeLibraryPlaylist? {
        if fails { throw AuthFailure.invalidResponse }
        entries.removeAll { $0.id == playlist.id }
        if songs == .keep {
            let library = NativeLibraryPlaylist(id: "server:liked", name: "Liked Songs", source: "SYNCBEATS", songs: playlist.songs)
            entries.append(library); return library
        }
        return nil
    }
}

nonisolated private final class LibraryHTTPFixture: URLProtocol, @unchecked Sendable {
    static let lock = NSLock()
    nonisolated(unsafe) static var paths: [String] = []
    nonisolated(unsafe) static var authorized = true
    nonisolated(unsafe) static var active = 0
    nonisolated(unsafe) static var peak = 0
    nonisolated(unsafe) static var saved: [String: String] = [:]
    nonisolated(unsafe) static var mutationBody: [String: Any] = [:]
    nonisolated(unsafe) static var importBody: [String: Any] = [:]
    nonisolated(unsafe) static var importStatus = 200
    nonisolated(unsafe) static var managementVersion = 1
    nonisolated(unsafe) static var deletes = 0
    nonisolated(unsafe) static var readMode = "default"
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "library.fixture.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let path = request.url!.path
        Self.lock.lock()
        Self.paths.append(path)
        Self.authorized = Self.authorized && request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture-token" && request.value(forHTTPHeaderField: "x-device-id") == "fixture-device"
        Self.active += 1; Self.peak = max(Self.peak, Self.active)
        Self.lock.unlock()
        let response: [String: Any]
        var status = 200
        if path.hasSuffix("/apple-music/import") {
            status = Self.importStatus
            if request.httpMethod == "POST" {
                var data = request.httpBody
                if data == nil, let stream = request.httpBodyStream {
                    stream.open(); defer { stream.close() }
                    var bytes = [UInt8](repeating: 0, count: 2048), collected = Data()
                    while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; collected.append(contentsOf: bytes.prefix(count)) }
                    data = collected
                }
                let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
                Self.lock.lock(); Self.importBody = object; Self.lock.unlock()
                let count = (object["tracks"] as? [[String: Any]])?.count ?? 0
                response = ["version": 1, "playlistId": "cloud-fixture", "name": object["name"] ?? "Imported", "sourceId": object["sourceId"] ?? "", "trackCount": count, "added": count, "processed": count]
            } else { response = ["version": 1, "maxTracks": 100] }
        } else if Self.readMode != "default", path.hasPrefix("/api/playlists") {
            let tracks: [[String: Any]] = (0..<130).map { ["id": "legacy-track-\($0)", "title": "Legacy song \($0)", "artist": "Fixture artist", "youtubeId": String(format: "%011d", $0)] }
            let metadata: [[String: Any]] = (0..<45).map { ["id": "legacy-\($0)", "name": "Collection \($0)", "sourceType": "SYNCBEATS", "trackCount": 130] }
            if Self.readMode == "malformed" { response = ["playlists": [["id": "broken"]]] }
            else if path == "/api/playlists", Self.readMode == "modern" { response = ["playlists": Array(metadata.prefix(40)), "nextCursor": "40", "savedYoutubeIDs": tracks.compactMap { $0["youtubeId"] }] }
            else if path == "/api/playlists" { response = ["playlists": metadata] }
            else if path == "/api/playlists/catalog" || path.hasSuffix("/tracks") { status = 404; response = ["error": "Not found"] }
            else { response = ["playlist": ["id": request.url!.lastPathComponent, "name": "Collection", "sourceType": "SYNCBEATS", "tracks": tracks]] }
        } else if path == "/api/playlists" { response = ["playlists": (0..<7).map { ["id": "playlist\($0)"] }] }
        else if path == "/api/bridge/resolve" { response = ["ok": true, "youtubeId": "abcdefghijk"] }
        else if path == "/api/playlists/library/tracks" {
            response = ["ok": true]
            var data = request.httpBody
            if data == nil, let stream = request.httpBodyStream {
                stream.open(); defer { stream.close() }
                var bytes = [UInt8](repeating: 0, count: 2048), collected = Data()
                while stream.hasBytesAvailable { let count = stream.read(&bytes, maxLength: bytes.count); if count <= 0 { break }; collected.append(contentsOf: bytes.prefix(count)) }
                data = collected
            }
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            Self.lock.lock(); Self.saved = object.compactMapValues { $0 as? String }; Self.lock.unlock()
        } else if path.hasSuffix("/management") {
            response = ["version": Self.managementVersion]
        } else if request.httpMethod == "PUT" || request.httpMethod == "DELETE" || path.hasSuffix("/tracks/batch") {
            let data = request.httpBody ?? request.httpBodyStream.flatMap { stream -> Data? in stream.open(); defer { stream.close() }; var bytes = [UInt8](repeating: 0, count: 2048); let count = stream.read(&bytes, maxLength: bytes.count); return count > 0 ? Data(bytes.prefix(count)) : nil }
            Self.lock.lock(); Self.mutationBody = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
            if request.httpMethod == "DELETE" { Self.deletes += 1 }
            Self.lock.unlock()
            response = ["success": true, "library": NSNull(), "playlist": ["id": String(path.split(separator: "/")[2]), "name": "A saved playlist", "sourceType": "SYNCBEATS", "tracks": []]]
        } else {
            response = ["playlist": ["id": request.url!.lastPathComponent, "name": "A saved playlist", "sourceType": "SYNCBEATS", "tracks": [["id": "track", "title": "A song", "artist": "An artist", "youtubeId": "abcdefghijk", "song": ["id": "catalog-song", "album": "An album", "albumArt": "https://fixture.invalid/art.jpg", "duration": 180]]]]]
        }
        let data = try! JSONSerialization.data(withJSONObject: response)
        DispatchQueue.global().asyncAfter(deadline: .now() + 0.025) { [self] in
            Self.lock.lock(); Self.active -= 1; Self.lock.unlock()
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() {}
}

@main struct NativeLibraryVerification {
    @MainActor static func main() async throws {
        setbuf(stdout, nil)
        var count = 0
        func check(_ condition: Bool, _ message: String) { precondition(condition, message); count += 1; print("PASS: " + message) }
        func credentials(_ user: String) -> RoomCredentials { .init(roomID: "123456", userID: user, displayName: "Fixture", token: "fixture-token", baseURL: URL(string: "https://library.fixture.invalid")!, deviceID: "fixture-device") }
        let first = NativeLibrarySong(id: "catalog:a", title: "First song", artist: "First artist", album: "Album A", artwork: nil, thumbnail: nil, duration: 180, youtubeID: "abcdefghijk", source: "SYNCBEATS")
        let second = NativeLibrarySong(id: "catalog:b", title: "Second song", artist: "Other artist", album: "Album B", artwork: nil, thumbnail: nil, duration: 210, youtubeID: "lmnopqrstuv", source: "SYNCBEATS")
        let unknown = NativeLibrarySong(id: "catalog:c", title: "Third song", artist: "Unknown", album: nil, artwork: nil, thumbnail: nil, duration: nil, youtubeID: nil, source: "SYNCBEATS")
        let playlist = NativeLibraryPlaylist(id: "server:first", name: "Saved playlist", description: nil, artwork: nil, source: "SYNCBEATS", songs: [first, second, first, unknown])
        let duplicated = NativeLibraryPlaylist(id: "server:second", name: "Another playlist", description: nil, artwork: nil, source: "SYNCBEATS", songs: [first])
        let unique = NativeLibraryCollection.songs(playlists: [playlist, duplicated], imported: [])
        check(unique.count == 3, "Songs deduplicate the same video across saved playlists")
        check(playlist.songs.map(\.id) == [first.id, second.id, first.id, unknown.id], "Playlist order and intentional repeated tracks remain intact")
        check(NativeLibraryCollection.albums(unique).count == 2, "Albums use real album metadata and exclude unknown albums")
        check(NativeLibraryCollection.artists(unique).count == 2, "Artists derive from saved songs and exclude Unknown credits")
        check(unknown.result == nil && first.result?.url == "https://www.youtube.com/watch?v=abcdefghijk", "Unresolved songs cannot enter the playback path")
        let apple = NativeLibrarySong(id: "apple-song:one", title: "An imported recording", artist: "Artist", album: "Apple album", artwork: nil, thumbnail: nil, duration: 120, youtubeID: nil, source: "APPLE_MUSIC")
        var imported = NativeImportedLibrary()
        imported.merge(songs: [apple], playlists: [])
        imported.merge(songs: [apple], playlists: [])
        check(imported.songs.count == 1, "Reimporting a source song is duplicate-safe")
        var matched = apple; matched.youtubeID = "abcdefghijk"
        imported.songs = [matched]; imported.merge(songs: [apple], playlists: [])
        check(imported.songs[0].youtubeID == "abcdefghijk", "Reimport preserves a reviewed room version")
        let pagingService = LibraryServiceFixture(); pagingService.paged = true
        let pageSongs = (0..<130).map { index in NativeLibrarySong(id: "page-\(index)", title: "Page \(index)", artist: "Artist", album: "Album", artwork: nil, thumbnail: nil, duration: 180, youtubeID: String(format: "%011d", index), source: "SYNCBEATS") }
        pagingService.entries = (0..<45).map { index in NativeLibraryPlaylist(id: "server:page-\(index)", name: "Playlist \(index)", description: nil, artwork: nil, source: "SYNCBEATS", songs: pageSongs) }
        let pagedStore = NativeLibraryStore(disk: LibraryDiskFixture(), factory: { _ in pagingService })
        await pagedStore.load(for: credentials("paging"))
        check(pagedStore.playlists.count == 40 && pagedStore.songs.isEmpty, "Initial Library loads metadata without song arrays")
        check(pagedStore.playlists.first?.displayedCount == 130 && pagedStore.savedYoutubeIDs.count == 130, "Metadata preserves full counts and saved identities beyond loaded pages")
        await pagedStore.open(.songs)
        check(pagedStore.songs.count == 60 && pagedStore.hasMore, "Songs view fetches only the first song page")
        await pagedStore.loadMore()
        check(pagedStore.songs.count == 120, "Song pagination appends the next page without duplicates")
        await pagedStore.open(.playlists); await pagedStore.loadMore()
        check(pagedStore.playlists.count == 45, "Playlist pagination reaches later collections")
        let latePlaylist = pagedStore.playlists.last!
        await pagedStore.openDetail(latePlaylist)
        check(pagedStore.playlists.contains { $0.id == latePlaylist.id } && pagedStore.detailSongs?.count == 60, "A later-page playlist stays selected during detail revalidation")
        await pagedStore.loadMore()
        check(pagedStore.detailSongs?.count == 120 && pagedStore.detailSongs?[60].id == pageSongs[60].id, "Playlist track pagination retains exact order")
        await pagedStore.invalidate()
        check(pagedStore.detailSongs?.count == 60 && pagedStore.detailPlaylist?.id == latePlaylist.id, "Live invalidation refreshes detail while retaining the selected playlist")
        pagedStore.closeDetail()
        await pagedStore.open(.songs, query: "Page 129")
        check(pagedStore.songs.count == 1 && pagedStore.songs.first?.id == "page-129", "Library search finds songs beyond previously loaded pages")
        pagingService.entries[0].songs[129].title = "Updated remotely"
        await pagedStore.open(.songs, query: "Updated remotely")
        check(pagedStore.songs.first?.title == "Updated remotely", "Revalidation displays authoritative remote changes")
        pagingService.delay = .milliseconds(40)
        let stalePage = Task { await pagedStore.open(.songs, query: "Page 0") }
        try await Task.sleep(for: .milliseconds(5))
        await pagedStore.open(.songs, query: "Updated remotely")
        await stalePage.value; try await Task.sleep(for: .milliseconds(80))
        check(pagedStore.songs.first?.title == "Updated remotely", "A stale in-flight page cannot replace a newer view query")
        await pagedStore.load(for: nil)
        check(pagedStore.songs.isEmpty && pagedStore.savedYoutubeIDs.isEmpty, "Sign-out clears paginated account data")
        let disk = LibraryDiskFixture(), service = LibraryServiceFixture()
        service.entries = [playlist, duplicated]
        let store = NativeLibraryStore(disk: disk, factory: { _ in service })
        await store.load(for: credentials("one"))
        check(store.playlists.count == 2 && store.songs.count == 3, "Library loads account playlists rather than the room queue")
        func seedLocal(_ target: NativeLibraryStore, disk: LibraryDiskFixture, songs: [NativeLibrarySong], playlists: [NativeLibraryPlaylist], owner: String = "one") async throws {
            let key = credentials(owner).baseURL.absoluteString + "|" + owner
            var saved = try disk.read(key: key); saved.merge(songs: songs, playlists: playlists)
            try disk.write(saved, key: key)
            await target.load(for: nil); await target.load(for: credentials(owner))
        }
        try await seedLocal(store, disk: disk, songs: [apple], playlists: [])
        check(store.songs.count == 4, "Legacy local Apple Music metadata remains available")
        try await seedLocal(store, disk: disk, songs: [apple], playlists: [])
        check(store.imported.songs.count == 1, "Legacy local imports contain no duplicate songs")
        let proposal = try await store.prepareMatch(apple)
        check(proposal.result != nil && store.imported.songs[0].result == nil, "Finding a room version does not accept it or change playback")
        try await store.acceptMatch(proposal)
        check(store.imported.songs[0].result != nil, "Explicit acceptance persists the reviewed room version")
        let restored = NativeLibraryStore(disk: disk, factory: { _ in service })
        await restored.load(for: credentials("one"))
        check(restored.imported.songs[0].youtubeID == "abcdefghijk", "Imports and reviewed room versions survive store recreation")
        await restored.load(for: credentials("two"))
        check(restored.imported.songs.isEmpty, "A different account cannot see another account's local imports")
        service.fails = true; await store.refresh()
        check(store.remote.count == 2 && store.error != nil, "A failed refresh preserves the last complete collection and reports an error")
        service.fails = false
        disk.failWrite = true
        do { try await store.acceptMatch(proposal); preconditionFailure("Failed persistence accepted") } catch {}
        check(store.imported.songs.count == 1, "Failed local metadata writes preserve the previous collection")
        disk.failWrite = false
        let brokenDisk = LibraryDiskFixture(); brokenDisk.failRead = true
        let recovery = NativeLibraryStore(disk: brokenDisk, factory: { _ in service })
        await recovery.load(for: credentials("one"))
        do { _ = try await recovery.importSelection(songs: [apple], playlists: []); preconditionFailure("Unreadable imports overwritten") } catch {}
        check(recovery.error != nil && recovery.imported.songs.isEmpty, "Unreadable imported files are preserved and cannot be overwritten by an import")
        service.delay = .milliseconds(80)
        let changing = NativeLibraryStore(disk: disk, factory: { _ in service })
        let old = Task { await changing.load(for: credentials("one")) }
        try await Task.sleep(for: .milliseconds(20)); await changing.load(for: nil); await old.value
        check(changing.songs.isEmpty && !changing.loading, "A late account response cannot restore a signed-out library")
        service.delay = .zero
        let savedResult = RoomSearchResult(url: "https://youtu.be/ZZZZZZZZZZZ", title: "A newly saved song", thumbnail: nil, uploaderName: "New artist", duration: nil)
        await store.save(savedResult)
        check(store.songs.contains { $0.youtubeID == "ZZZZZZZZZZZ" }, "A server-acknowledged save is visible even before playlist hydration catches up")
        await store.save(savedResult)
        check(service.saves == 1, "Saving the same acknowledged song again does not send a duplicate write")
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [LibraryHTTPFixture.self]
        let api = NativeLibraryAPI(credentials: credentials("one"), http: URLSession(configuration: config))
        LibraryHTTPFixture.readMode = "legacy"
        let legacyIndex = try await api.indexPage(cursor: nil)
        check(legacyIndex.requiresServerUpdate && legacyIndex.playlists.count == 40 && legacyIndex.playlists[0].displayedCount == 130,
              "An older metadata-only server is detected without a missing-data decoding error")
        let legacyNext = try await api.indexPage(cursor: legacyIndex.nextCursor)
        check(legacyNext.playlists.count == 5 && legacyNext.playlists[0].id == "server:legacy-40", "Legacy metadata pages advance even when the server ignores limit/cursor")
        let legacyTracks = try await api.trackPage(legacyIndex.playlists[0], cursor: nil)
        let legacyTracksNext = try await api.trackPage(legacyIndex.playlists[0], cursor: legacyTracks.nextCursor)
        check(legacyTracks.items.count == 60 && legacyTracksNext.items[0].id == "catalog:legacy-track-60", "Older servers use the full-detail endpoint while preserving ordered UI pages")
        let pathsBeforeCatalog = LibraryHTTPFixture.paths.count
        let legacyCatalog = try await api.catalogPage(.songs, cursor: nil, query: "", filter: nil)
        check(legacyCatalog.songs.count == 130 && legacyCatalog.nextCursor == "1", "A missing catalog route loads one legacy saved collection at a time")
        check(LibraryHTTPFixture.paths.count - pathsBeforeCatalog == 3, "Legacy catalog fallback avoids eagerly hydrating every playlist")
        let legacyStore = NativeLibraryStore(disk: LibraryDiskFixture(), factory: { _ in api })
        await legacyStore.load(for: credentials("one")); await legacyStore.open(.songs)
        check(legacyStore.requiresServerUpdate && legacyStore.error == nil && legacyStore.songs.count == 130,
              "Legacy Library remains usable with an actionable server-update notice")
        LibraryHTTPFixture.readMode = "modern"
        let modernIndex = try await api.indexPage(cursor: nil)
        check(!modernIndex.requiresServerUpdate && modernIndex.savedYoutubeIDs.count == 130, "The modern server retains complete saved identities and native paging")
        LibraryHTTPFixture.readMode = "malformed"
        do { _ = try await api.indexPage(cursor: nil); check(false, "Malformed server data should be reported") }
        catch AuthFailure.response(502, let message) { check(message.contains("incomplete Library data"), "Malformed server responses show a useful message instead of a generic missing-data error") }
        LibraryHTTPFixture.readMode = "default"
        let apiPlaylists = try await api.playlists()
        check(apiPlaylists.count == 7 && apiPlaylists[0].songs[0].album == "An album", "Native API reads the playlist list and enriched detail contracts")
        check(LibraryHTTPFixture.peak <= 4, "Playlist hydration limits simultaneous detail requests to four")
        check(LibraryHTTPFixture.authorized, "Library requests use authenticated identity and device headers")
        check(!LibraryHTTPFixture.paths.contains("/spotify/my-playlists"), "Read-only loading avoids the legacy endpoint that deletes empty playlists")
        try await api.save(first.result!)
        check(LibraryHTTPFixture.saved["youtubeId"] == "abcdefghijk" && LibraryHTTPFixture.saved["title"] == "First song", "Saving uses the existing Liked Songs endpoint and canonical video identity")
        let matchedID = try await api.resolve(apple)
        check(matchedID == "abcdefghijk", "Apple Music room matching uses the existing bridge contract")
        try await api.rename(apiPlaylists[0], to: "Renamed")
        check(LibraryHTTPFixture.mutationBody["name"] as? String == "Renamed", "Native renaming uses the authenticated playlist update contract")
        _ = try await api.addSongs([apple], to: apiPlaylists[0])
        let batchTracks = LibraryHTTPFixture.mutationBody["tracks"] as? [[String: Any]]
        check(batchTracks?.count == 1 && batchTracks?[0]["title"] as? String == apple.title && batchTracks?[0]["youtubeId"] as? String == "", "Song selection sends metadata atomically without silently resolving Apple Music")
        _ = try await api.delete(apiPlaylists[0], songs: .keep)
        check(LibraryHTTPFixture.mutationBody["songDisposition"] as? String == "keep", "Native deletion sends the user's keep-songs choice explicitly")
        LibraryHTTPFixture.managementVersion = 0
        let deletions = LibraryHTTPFixture.deletes
        do { _ = try await api.delete(apiPlaylists[0], songs: .remove); check(false, "Unsupported servers cannot receive a destructive Library request") }
        catch { check(LibraryHTTPFixture.deletes == deletions, "Unsupported servers cannot receive a destructive Library request") }
        LibraryHTTPFixture.managementVersion = 1
        let room = RoomSession(), palette = NativePalette(light: false)
        let railLibrary = NativeLibraryStore(disk: LibraryDiskFixture(), factory: { _ in pagingService })
        await railLibrary.load(for: credentials("navigation-preview")); await railLibrary.open(.playlists)
        for (width, height, name) in [(1160.0, 720.0, "desktop"), (530.0, 440.0, "compact")] {
            let view = NativeCollectionWorkspace(section: .constant(.playlists), library: railLibrary, room: room, palette: palette, onOpenPlayer: {}, onSave: { _ in })
                .frame(width: width, height: height)
            let host = NSHostingView(rootView: view)
            host.frame = NSRect(x: 0, y: 0, width: width, height: height)
            host.layoutSubtreeIfNeeded()
            check(host.fittingSize.width <= width + 1 && host.fittingSize.height <= height + 1, "Compact collection navigation fits the \(name) window")
            if let bitmap = host.bitmapImageRepForCachingDisplay(in: host.bounds) {
                host.cacheDisplay(in: host.bounds, to: bitmap)
                if let png = bitmap.representation(using: .png, properties: [:]) {
                    try png.write(to: URL(fileURLWithPath: "/tmp/syncbeats-library-rail-\(name).png"))
                }
            }
        }

        for section in NativeLibrarySection.allCases where section != .home {
            for size in [CGSize(width: 1000, height: 600), CGSize(width: 520, height: 260)] {
                let view = NativeLibraryPage(section: .constant(section), library: store, room: room, palette: palette)
                let host = NSHostingView(rootView: view.frame(width: size.width, height: size.height))
                host.frame = NSRect(origin: .zero, size: size); host.layoutSubtreeIfNeeded()
                check(host.fittingSize.width <= size.width + 1, "\(section.rawValue) page fits a \(Int(size.width))-point host")
            }
        }
        let importHost = NSHostingView(rootView: NativeAppleImportView(library: store, palette: palette, onClose: {}).frame(width: 488, height: 300))
        importHost.frame = NSRect(x: 0, y: 0, width: 488, height: 300); importHost.layoutSubtreeIfNeeded()
        check(importHost.fittingSize.width <= 489, "Apple Music selection entry fits a compact window without requesting permission automatically")
        // Cloud import acknowledgements, retry recovery and local migration.
        let cloudDisk = LibraryDiskFixture(), cloudService = LibraryServiceFixture()
        let cloud = NativeLibraryStore(disk: cloudDisk, factory: { _ in cloudService })
        let remaining = NativeLibraryPlaylist(id: "apple:remaining", name: "Keep local", source: "APPLE_MUSIC", songs: [first])
        try await seedLocal(cloud, disk: cloudDisk, songs: [apple], playlists: [remaining])
        let cloudAdded = try await cloud.importSelection(songs: [apple], playlists: [])
        check(cloudAdded == 1 && cloudService.entries.first?.songs.first?.id == apple.id, "Selected metadata is acknowledged in the account collection")
        check(!cloud.imported.songs.contains { $0.id == apple.id } && cloud.imported.playlists.map(\.id) == [remaining.id], "Cloud acknowledgement removes only selected local copies")
        let cloudAgain = try await cloud.importSelection(songs: [apple], playlists: [])
        check(cloudAgain == 0 && cloudService.entries.first?.songs.count == 1, "Repeated cloud import adds no duplicate song")
        await cloud.refresh()
        let cloudProposal = try await cloud.prepareMatch(apple)
        cloudDisk.failWrite = true
        try await cloud.acceptMatch(cloudProposal)
        check(cloud.songs.first { $0.id == apple.id }?.youtubeID == cloudProposal.youtubeID, "Cloud song matching updates the account view without requiring a local cache write")
        cloudDisk.failWrite = false
        var largeSongs: [NativeLibrarySong] = []
        for index in 0..<205 { largeSongs.append(.init(id: "apple:bulk:\(index)", title: "Bulk \(index)", artist: apple.artist, source: "APPLE_MUSIC")) }
        let large = NativeLibraryPlaylist(id: "apple:bulk", name: "Large playlist", source: "APPLE_MUSIC", songs: largeSongs)
        try await seedLocal(cloud, disk: cloudDisk, songs: [], playlists: [large])
        cloudService.importCalls = []; cloudService.failImportAt = 2
        do { _ = try await cloud.importSelection(songs: [], playlists: [large]); check(false, "Partial failure is reported") } catch {}
        check(cloudService.importCalls.map(\.count) == [100, 100] && cloudService.entries.first { $0.id == "remote:apple:bulk" }?.songs.count == 100, "Only acknowledged batches survive a partial import")
        check(cloud.imported.playlists.contains { $0.id == large.id } && cloud.message?.contains("Some batches") == true, "Partial imports preserve local data and give a retry message")
        cloudService.failImportAt = nil; cloudService.importCalls = []
        let recovered = try await cloud.importSelection(songs: [], playlists: [large])
        check(recovered == 105 && cloudService.importCalls.map(\.count) == [100, 100, 5], "Retry imports only remaining tracks using bounded batches")
        check(cloudService.entries.first { $0.id == "remote:apple:bulk" }?.songs.count == 205 && !cloud.imported.playlists.contains { $0.id == large.id }, "Complete cloud save cleans up its legacy playlist")
        var reviewed = NativeLibraryPlaylist(id: "apple:reviewed", name: "My edited playlist", source: "APPLE_MUSIC", songs: [apple, first]); reviewed.editedName = reviewed.name; reviewed.addedSongIDs = [first.id]
        reviewed.songs[0].youtubeID = "ABCDEFGHIJK"
        try await seedLocal(cloud, disk: cloudDisk, songs: [], playlists: [reviewed])
        var fresh = reviewed; fresh.name = "Original Apple title"; fresh.songs = [apple]; fresh.editedName = nil; fresh.addedSongIDs = nil
        _ = try await cloud.importSelection(songs: [], playlists: [fresh])
        let migrated = cloudService.entries.first { $0.id == "remote:apple:reviewed" }
        check(migrated?.name == "My edited playlist" && migrated?.songs.count == 2 && migrated?.songs[0].youtubeID == "ABCDEFGHIJK", "Legacy edited names, manual additions and reviewed playback matches migrate")
        try await seedLocal(cloud, disk: cloudDisk, songs: [apple], playlists: [])
        cloudService.invalidImportAck = true
        do { _ = try await cloud.importSelection(songs: [apple], playlists: []); check(false, "Invalid acknowledgement is rejected") } catch {}
        check(cloud.imported.songs.contains { $0.id == apple.id }, "Malformed acknowledgements cannot discard local copies")
        cloudService.invalidImportAck = false; cloudService.unsupportedImport = true
        let callsBefore = cloudService.importCalls.count
        do { _ = try await cloud.importSelection(songs: [apple], playlists: []); check(false, "Old server import is rejected") } catch {}
        check(cloudService.importCalls.count == callsBefore && cloud.imported.songs.contains { $0.id == apple.id }, "Unsupported servers cause no import or local data loss")
        cloudService.unsupportedImport = false; cloudService.importDelay = .milliseconds(80)
        let pendingImport = Task { try await cloud.importSelection(songs: [apple], playlists: []) }
        try await Task.sleep(for: .milliseconds(15))
        check(cloud.imported.songs.contains { $0.id == apple.id } && cloud.importProgress != nil, "Local data remains while awaiting the server")
        await cloud.load(for: credentials("two")); _ = try? await pendingImport.value
        check(cloud.imported.songs.isEmpty && cloud.message == nil && cloud.importProgress == nil, "A late import response cannot alter a different account")
        let capability = try await api.appleImportLimit()
        check(capability == 100, "Native API reads authenticated import capabilities")
        let cloudResponse = try await api.importApplePlaylist(reviewed, songs: reviewed.songs)
        let sentTracks = LibraryHTTPFixture.importBody["tracks"] as? [[String: Any]]
        check(cloudResponse.processed == 2 && LibraryHTTPFixture.importBody["sourceId"] as? String == reviewed.id && sentTracks?.first?["sourceId"] as? String == apple.id && sentTracks?.first?["youtubeId"] as? String == "ABCDEFGHIJK", "Native API sends stable IDs and reviewed metadata, without audio")
        LibraryHTTPFixture.importStatus = 404
        do { _ = try await api.appleImportLimit(); check(false, "Old HTTP server receives a useful import error") }
        catch { check(error.localizedDescription.contains("server"), "Old HTTP server receives a useful import error") }
        LibraryHTTPFixture.importStatus = 200
        let editDisk = LibraryDiskFixture(), editService = LibraryServiceFixture()
        editService.entries = []
        let edits = NativeLibraryStore(disk: editDisk, factory: { _ in editService })
        await edits.load(for: credentials("edit"))
        let local = NativeLibraryPlaylist(id: "apple:editable", name: "Original", source: "APPLE_MUSIC", songs: [apple])
        try await seedLocal(edits, disk: editDisk, songs: [first, second], playlists: [local], owner: "edit")
        try await edits.rename(local, to: "  My evenings  ")
        check(edits.playlists[0].name == "My evenings", "Imported playlists can be renamed with whitespace trimmed")
        do { try await edits.rename(local, to: "   "); check(false, "Empty playlist names are rejected") }
        catch { check(edits.playlists[0].name == "My evenings", "Empty playlist names are rejected without changing the collection") }
        try await edits.addSongs([first, first, second], to: local)
        try await edits.addSongs([first], to: local)
        check(edits.playlists[0].songs.map(\.id) == [apple.id, first.id, second.id], "Adding songs preserves order and rejects duplicates, including stale picker snapshots")
        try await seedLocal(edits, disk: editDisk, songs: [], playlists: [local], owner: "edit")
        check(edits.playlists[0].name == "My evenings" && edits.playlists[0].songs.count == 3, "Reimport preserves renamed playlists and manually added songs")
        let editRestored = NativeLibraryStore(disk: editDisk, factory: { _ in editService })
        await editRestored.load(for: credentials("edit"))
        check(editRestored.playlists[0].name == "My evenings" && editRestored.playlists[0].songs.count == 3, "Playlist edits survive store recreation")
        try await edits.delete(edits.playlists[0], songs: .keep)
        check(edits.playlists.isEmpty && edits.songs.count == 3, "Deleting only an imported playlist retains its songs in Library")
        let shared = NativeLibraryPlaylist(id: "apple:shared", name: "Keep shared", source: "APPLE_MUSIC", songs: [first])
        try await seedLocal(edits, disk: editDisk, songs: [], playlists: [local, shared], owner: "edit")
        try await edits.delete(local, songs: .remove)
        check(!edits.songs.contains { $0.id == apple.id } && edits.songs.contains { $0.id == first.id }, "Deleting an imported playlist with its songs preserves songs in other playlists")
        editDisk.failWrite = true
        do { try await edits.rename(shared, to: "Lost write"); check(false, "Failed playlist writes preserve the original name") }
        catch { check(edits.playlists[0].name == "Keep shared", "Failed playlist writes preserve the original name") }
        editDisk.failWrite = false
        let remote = NativeLibraryPlaylist(id: "server:editable", name: "Remote", source: "SYNCBEATS", songs: [first])
        editService.entries = [remote]; await edits.refresh()
        editService.fails = true
        do { try await edits.delete(remote, songs: .remove); check(false, "Rejected deletion preserves the playlist") }
        catch { check(edits.playlists.contains { $0.id == remote.id }, "Rejected deletion preserves the playlist") }
        editService.fails = false; editService.delay = .milliseconds(100)
        let renaming = Task { try await edits.rename(remote, to: "Delayed") }
        try await Task.sleep(for: .milliseconds(15))
        check(edits.playlists.first { $0.id == remote.id }?.name == "Remote", "Server playlists remain unchanged until rename acknowledgement")
        await edits.load(for: nil)
        _ = try? await renaming.value
        check(edits.playlists.isEmpty && !edits.editing, "Late playlist mutation responses cannot revive a signed-out account")
        for action in [NativePlaylistSheet.rename(local), .addSongs(local), .delete(local), .choose(first)] {
            let host = NSHostingView(rootView: NativePlaylistManagementView(action: action, library: editRestored, palette: palette, onClose: {}).frame(width: 340, height: 360))
            host.frame = NSRect(x: 0, y: 0, width: 340, height: 360); host.layoutSubtreeIfNeeded()
            check(host.fittingSize.width <= 341, "Playlist \(action.id) dialog fits a compact window")
        }
        print("\(count) native library checks passed")
    }
}
