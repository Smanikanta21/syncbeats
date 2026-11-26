import Foundation
import Observation
import CryptoKit

nonisolated protocol NativeLibraryPersisting: Sendable {
    func read(key: String) throws -> NativeImportedLibrary
    func write(_ library: NativeImportedLibrary, key: String) throws
}

nonisolated struct NativeLibraryDisk: NativeLibraryPersisting {
    private func url(_ key: String) throws -> URL {
        let root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("SyncBeats/Library", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let name = SHA256.hash(data: Data(key.utf8)).map { String(format: "%02x", $0) }.joined()
        return root.appendingPathComponent(name + ".json")
    }
    func read(key: String) throws -> NativeImportedLibrary {
        let file = try url(key)
        guard FileManager.default.fileExists(atPath: file.path) else { return .init() }
        return try JSONDecoder().decode(NativeImportedLibrary.self, from: Data(contentsOf: file))
    }
    func write(_ library: NativeImportedLibrary, key: String) throws {
        let file = try url(key)
        try JSONEncoder().encode(library).write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
}

@MainActor @Observable final class NativeLibraryStore {
    private(set) var remote: [NativeLibraryPlaylist] = []
    private(set) var imported = NativeImportedLibrary()
    private var acknowledgedSaves: [NativeLibrarySong] = []
    private(set) var loading = false
    private(set) var requiresServerUpdate = false
    private(set) var saving: Set<String> = []
    private(set) var matching: Set<String> = []
    private(set) var queuing = false
    private(set) var editing = false
    private(set) var importProgress: String?
    private(set) var loadingMore = false
    private(set) var lastUpdated: Date?
    private(set) var detailSongs: [NativeLibrarySong]?
    private var remoteSongs: [NativeLibrarySong] = []
    private var remoteAlbums: [NativeLibraryGroup] = []
    private var remoteArtists: [NativeLibraryGroup] = []
    private var remoteSavedIDs: Set<String> = []
    private var indexCursor: String?
    private var catalogCursor: String?
    private var detailCursor: String?
    private var section: NativeLibrarySection = .home
    private var query = ""
    private(set) var detailPlaylist: NativeLibraryPlaylist?
    private(set) var detailGroup: NativeLibraryGroup?
    private var revision = UUID()
    var managementBusy: Bool { editing || loading || loadingMore || writing || !saving.isEmpty }
    var savedYoutubeIDs: Set<String> { remoteSavedIDs.union((requiresServerUpdate ? remoteSongs.compactMap(\.youtubeID) : [])).union((imported.songs + imported.playlists.flatMap(\.songs) + acknowledgedSaves).compactMap(\.youtubeID)) }
    var hasMorePlaylists: Bool { indexCursor != nil }
    var hasMore: Bool { detailPlaylist != nil || detailGroup != nil ? detailCursor != nil : section == .playlists || section == .home ? indexCursor != nil : catalogCursor != nil }
    var error: String?
    var message: String?
    @ObservationIgnored private var credentials: RoomCredentials?
    @ObservationIgnored private var generation = UUID()
    @ObservationIgnored private var diskReadFailed = false
    @ObservationIgnored private var refreshAgain = false
    @ObservationIgnored private var writing = false
    @ObservationIgnored private let disk: any NativeLibraryPersisting
    @ObservationIgnored private let factory: (RoomCredentials) -> any NativeLibraryServing

    init(disk: any NativeLibraryPersisting = NativeLibraryDisk(), factory: @escaping (RoomCredentials) -> any NativeLibraryServing = { NativeLibraryAPI(credentials: $0) }) {
        self.disk = disk; self.factory = factory
    }
    var playlists: [NativeLibraryPlaylist] { remote + imported.playlists }
    var songs: [NativeLibrarySong] { NativeLibraryCollection.songs(playlists: [], imported: remoteSongs + imported.songs + imported.playlists.flatMap(\.songs) + acknowledgedSaves) }
    private var localSongs: [NativeLibrarySong] { NativeLibraryCollection.songs(playlists: imported.playlists, imported: imported.songs + acknowledgedSaves) }
    var albums: [NativeLibraryGroup] { mergedGroups(remoteAlbums, local: NativeLibraryCollection.albums(localSongs)) }
    var artists: [NativeLibraryGroup] { mergedGroups(remoteArtists, local: NativeLibraryCollection.artists(localSongs)) }
    private func mergedGroups(_ remote: [NativeLibraryGroup], local: [NativeLibraryGroup]) -> [NativeLibraryGroup] {
        var groups = Dictionary(local.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        for group in remote {
            if let own = groups[group.id] {
                let songs = NativeLibraryCollection.songs(playlists: [], imported: own.songs + group.songs)
                let count = (group.total ?? group.songs.count) + own.songs.count
                groups[group.id] = .init(id: group.id, name: group.name, subtitle: group.filter?.album == nil ? "\(count) songs" : group.subtitle, songs: songs, filter: group.filter, total: count)
            } else { groups[group.id] = group }
        }
        return groups.values.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }
    private var accountKey: String? { credentials.map { $0.baseURL.absoluteString + "|" + $0.userID } }

    func load(for incoming: RoomCredentials?) async {
        guard incoming != credentials else { return }
        if let incoming, let current = credentials, incoming.userID == current.userID,
           incoming.baseURL == current.baseURL, incoming.token == current.token, incoming.deviceID == current.deviceID {
            credentials = incoming; return
        }
        generation = UUID(); credentials = incoming
        revision = UUID(); requiresServerUpdate = false; remoteSongs = []; remoteAlbums = []; remoteArtists = []; remoteSavedIDs = []; detailSongs = nil; detailPlaylist = nil; detailGroup = nil; lastUpdated = nil; loadingMore = false; indexCursor = nil; catalogCursor = nil; detailCursor = nil
        remote = []; imported = .init(); acknowledgedSaves = []; error = nil; message = nil; loading = false; saving = []; matching = []; queuing = false; editing = false; importProgress = nil; diskReadFailed = false; refreshAgain = false; writing = false
        guard let key = accountKey else { return }
        let active = generation, disk = disk
        do {
            let restored = try await Task.detached(priority: .utility) { try disk.read(key: key) }.value
            guard active == generation else { return }
            imported = restored
        }
        catch {
            guard active == generation else { return }
            diskReadFailed = true; self.error = "Your imported Library couldn't be read. Your files have been preserved."
        }
        await refresh()
    }
    func refresh() async {
        guard let credentials else { return }
        if loading || loadingMore || editing { refreshAgain = true; return }
        let active = generation, requested = revision, currentSection = section, currentQuery = query
        loading = true
        defer {
            if generation == active {
                loading = false
                if refreshAgain { refreshAgain = false; Task { await refresh() } }
            }
        }
        do {
            let api = factory(credentials)
            let index = try await api.indexPage(cursor: nil)
            guard generation == active, revision == requested, !Task.isCancelled else { return }
            let selectedPlaylist = remote.first { $0.id == detailPlaylist?.id }
            remote = index.playlists
            if let selectedPlaylist, !remote.contains(where: { $0.id == selectedPlaylist.id }) { remote.append(selectedPlaylist) }
            indexCursor = index.nextCursor; requiresServerUpdate = index.requiresServerUpdate
            if !index.requiresServerUpdate { remoteSavedIDs = index.savedYoutubeIDs }
            acknowledgedSaves = acknowledgedSaves.filter { !($0.youtubeID.map(remoteSavedIDs.contains) ?? false) }
            if remoteSongs.isEmpty { remoteSongs = index.playlists.flatMap(\.songs) }
            if currentSection != .home && currentSection != .playlists {
                let page = try await api.catalogPage(currentSection, cursor: nil, query: currentQuery, filter: nil)
                guard generation == active, revision == requested, !Task.isCancelled else { return }
                apply(page, section: currentSection, append: false)
            }
            if let playlist = detailPlaylist, playlist.serverID != nil {
                if let updated = remote.first(where: { $0.id == playlist.id }) { detailPlaylist = updated }
                let page = try await api.trackPage(playlist, cursor: nil)
                guard generation == active, revision == requested else { return }
                detailSongs = page.items; detailCursor = page.nextCursor
                if var metadata = page.playlist {
                    metadata.songs = []; detailPlaylist = metadata
                    if let index = remote.firstIndex(where: { $0.id == metadata.id }) { remote[index] = metadata }
                }
            } else if let group = detailGroup, let filter = group.filter {
                let page = try await api.catalogPage(.songs, cursor: nil, query: currentQuery, filter: filter)
                guard generation == active, revision == requested else { return }
                detailSongs = NativeLibraryCollection.songs(playlists: [], imported: localGroupSongs(group) + page.songs); detailCursor = page.nextCursor
            }
            acknowledgedSaves.removeAll { $0.youtubeID.map { remoteSavedIDs.contains($0) } ?? false }
            lastUpdated = Date()
            if !diskReadFailed { error = nil }
        } catch {
            guard generation == active, revision == requested, !Task.isCancelled else { return }
            if case AuthFailure.response(404, _) = error, let removed = detailPlaylist {
                remote.removeAll { $0.id == removed.id }; detailPlaylist = nil; detailSongs = nil; detailCursor = nil
                self.error = "This playlist was deleted on another device."
            } else { self.error = error.localizedDescription }
        }
    }
    private func apply(_ page: NativeLibraryCatalogPage, section: NativeLibrarySection, append: Bool) {
        catalogCursor = page.nextCursor
        switch section {
        case .songs: remoteSongs = append ? NativeLibraryCollection.songs(playlists: [], imported: remoteSongs + page.songs) : page.songs
        case .albums: remoteAlbums = append ? remoteAlbums + page.groups : page.groups
        case .artists: remoteArtists = append ? remoteArtists + page.groups : page.groups
        default: break
        }
    }
    func open(_ target: NativeLibrarySection, query incomingQuery: String = "") async {
        guard target != section || incomingQuery != query || lastUpdated == nil else { await invalidate(); return }
        section = target; query = incomingQuery; revision = UUID(); detailPlaylist = nil; detailGroup = nil; detailSongs = nil; detailCursor = nil
        await refresh()
    }
    func openDetail(_ playlist: NativeLibraryPlaylist) async {
        detailGroup = nil; detailPlaylist = playlist; detailSongs = playlist.serverID == nil ? playlist.songs : nil; detailCursor = nil; revision = UUID()
        if playlist.serverID != nil { await refresh() }
    }
    func openDetail(_ group: NativeLibraryGroup) async {
        detailPlaylist = nil; detailGroup = group; detailSongs = group.filter == nil ? group.songs : nil; detailCursor = nil; revision = UUID()
        if group.filter != nil { await refresh() }
    }
    func closeDetail() { detailPlaylist = nil; detailGroup = nil; detailSongs = nil; detailCursor = nil; revision = UUID() }
    private func localGroupSongs(_ group: NativeLibraryGroup) -> [NativeLibrarySong] {
        (group.filter?.album != nil ? NativeLibraryCollection.albums(localSongs) : NativeLibraryCollection.artists(localSongs)).first { $0.id == group.id }?.songs ?? []
    }
    func invalidate() async { revision = UUID(); await refresh() }
    func loadMore() async {
        guard let credentials, hasMore, !managementBusy else { return }
        let active = generation, requested = revision
        loadingMore = true
        defer {
            if generation == active { loadingMore = false; if refreshAgain { refreshAgain = false; Task { await refresh() } } }
        }
        do {
            let api = factory(credentials)
            if let playlist = detailPlaylist, let cursor = detailCursor {
                let page = try await api.trackPage(playlist, cursor: cursor)
                guard generation == active, revision == requested else { return }
                // Playlist order and repeated entries remain intact.
                detailSongs = (detailSongs ?? []) + page.items; detailCursor = page.nextCursor
            } else if let group = detailGroup, let filter = group.filter, let cursor = detailCursor {
                let page = try await api.catalogPage(.songs, cursor: cursor, query: query, filter: filter)
                guard generation == active, revision == requested else { return }
                detailSongs = NativeLibraryCollection.songs(playlists: [], imported: (detailSongs ?? []) + page.songs); detailCursor = page.nextCursor
            } else if section == .playlists || section == .home {
                let page = try await api.indexPage(cursor: indexCursor)
                guard generation == active, revision == requested else { return }
                let existing = Set(remote.map(\.id)); remote += page.playlists.filter { !existing.contains($0.id) }; indexCursor = page.nextCursor
            } else {
                let page = try await api.catalogPage(section, cursor: catalogCursor, query: query, filter: nil)
                guard generation == active, revision == requested else { return }
                apply(page, section: section, append: true)
            }
        } catch { if generation == active { self.error = error.localizedDescription } }
    }
    func loadMorePlaylists() async {
        guard let credentials, let cursor = indexCursor, !managementBusy else { return }
        let active = generation, requested = revision
        loadingMore = true
        defer {
            if generation == active {
                loadingMore = false
                if refreshAgain { refreshAgain = false; Task { await refresh() } }
            }
        }
        do {
            let page = try await factory(credentials).indexPage(cursor: cursor)
            guard generation == active, revision == requested else { return }
            let existing = Set(remote.map(\.id)); remote += page.playlists.filter { !existing.contains($0.id) }; indexCursor = page.nextCursor
        } catch { if generation == active, revision == requested { self.error = error.localizedDescription } }
    }
    func save(_ result: RoomSearchResult) async {
        guard !editing, let credentials, let video = YouTubeIdentity.id(in: result.url), !saving.contains(result.url), !savedYoutubeIDs.contains(video) else { return }
        let active = generation
        saving.insert(result.url)
        defer { if generation == active { saving.remove(result.url) } }
        do {
            try await factory(credentials).save(result)
            guard generation == active else { return }
            acknowledgedSaves.append(.init(id: "saved:" + video, title: result.title, artist: result.uploaderName ?? "", album: nil,
                artwork: result.albumArt, thumbnail: result.thumbnail, duration: result.duration, youtubeID: video, source: "SYNCBEATS"))
            message = "Saved to Liked Songs"
            await refresh()
        } catch { if generation == active { self.error = error.localizedDescription } }
    }
    @discardableResult func importSelection(songs: [NativeLibrarySong], playlists: [NativeLibraryPlaylist]) async throws -> Int {
        guard !diskReadFailed else { throw AuthFailure.invalidInput("Your older local import could not be read. It has been preserved.") }
        guard !writing && !editing, let credentials else { throw AuthFailure.invalidInput("Sign in and wait for the current Library update to finish.") }
        let active = generation, key = credentials.baseURL.absoluteString + "|" + credentials.userID, disk = disk
        let api = factory(credentials)
        editing = true; importProgress = "Checking account import…"
        defer { if generation == active { importProgress = nil; finishEdit(active) } }
        let limit = try await api.appleImportLimit()
        guard generation == active, !Task.isCancelled else { throw AuthFailure.cancelled }
        var prepared = imported
        prepared.merge(songs: songs, playlists: playlists)
        let selectedSongIDs = Set(songs.map(\.id)), selectedPlaylistIDs = Set(playlists.map(\.id))
        let selectedPlaylists = prepared.playlists.filter { selectedPlaylistIDs.contains($0.id) }
        let selectedSongs = prepared.songs.filter { selectedSongIDs.contains($0.id) }
        var collections = selectedPlaylists
        if !selectedSongs.isEmpty {
            collections.insert(.init(id: "apple-library:songs", name: "Apple Music songs", description: "Songs imported from Apple Music", artwork: selectedSongs.first?.artwork,
                                     source: "APPLE_MUSIC", songs: selectedSongs), at: 0)
        }
        var added = 0, acknowledged = 0
        guard !collections.isEmpty else { throw AuthFailure.invalidInput("Select songs or playlists to import.") }
        do {
            for (index, collection) in collections.enumerated() {
                var seen: Set<String> = []
                let values = collection.songs.filter { seen.insert($0.id).inserted }
                let batches = max(1, (values.count + limit - 1) / limit)
                for batch in 0..<batches {
                    guard generation == active, !Task.isCancelled else { throw AuthFailure.cancelled }
                    importProgress = "Saving collection \(index + 1) of \(collections.count) · batch \(batch + 1) of \(batches)"
                    let start = batch * limit
                    let result = try await api.importApplePlaylist(collection, songs: Array(values.dropFirst(start).prefix(limit)))
                    guard generation == active, !Task.isCancelled else { throw AuthFailure.cancelled }
                    guard result.version == 1, result.sourceId == collection.id, !result.playlistId.isEmpty,
                          result.processed == min(limit, values.count - start) else { throw AuthFailure.invalidResponse }
                    added += result.added; acknowledged += 1
                }
            }
        } catch {
            if generation == active, acknowledged > 0 { message = "Some batches are saved to your account. Re-import to finish safely without duplicates."; refreshAgain = true }
            throw error
        }
        guard generation == active else { throw AuthFailure.cancelled }
        // Remove only acknowledged legacy local copies. Remaining local imports stay intact.
        var remaining = imported
        remaining.playlists.removeAll { selectedPlaylistIDs.contains($0.id) }
        let syncedIDs = selectedSongIDs.union(selectedPlaylists.flatMap(\.songs).map(\.id))
        let retainedIDs = Set(remaining.playlists.flatMap(\.songs).map(\.id))
        remaining.songs.removeAll { syncedIDs.contains($0.id) && !retainedIDs.contains($0.id) }
        var cleanupFailed = false
        do {
            let snapshot = remaining
            try await Task.detached(priority: .utility) { try disk.write(snapshot, key: key) }.value
            guard generation == active else { throw AuthFailure.cancelled }
            imported = remaining
        } catch {
            guard generation == active else { throw AuthFailure.cancelled }
            cleanupFailed = true
        }
        message = "Saved Apple Music to your account" + (cleanupFailed ? " · older local copies could not be cleared" : "")
        refreshAgain = true
        return added
    }
    func prepareMatch(_ song: NativeLibrarySong) async throws -> NativeLibrarySong {
        guard let credentials, !matching.contains(song.id) else { throw AuthFailure.cancelled }
        let active = generation
        matching.insert(song.id)
        defer { if generation == active { matching.remove(song.id) } }
        let id = try await factory(credentials).resolve(song)
        guard generation == active, !Task.isCancelled else { throw AuthFailure.cancelled }
        var candidate = song; candidate.youtubeID = id
        return candidate
    }

    private func beginEdit(_ playlist: NativeLibraryPlaylist) throws -> (UUID, RoomCredentials) {
        guard let credentials, playlists.contains(where: { $0.id == playlist.id }) else { throw AuthFailure.cancelled }
        guard !managementBusy else { throw AuthFailure.invalidInput("Wait for the current Library update to finish.") }
        editing = true; error = nil; message = nil
        return (generation, credentials)
    }
    private func finishEdit(_ active: UUID) {
        guard active == generation else { return }
        editing = false
        if refreshAgain { refreshAgain = false; Task { await refresh() } }
    }
    private func persistEdit(_ updated: NativeImportedLibrary, generation active: UUID) async throws {
        guard let key = accountKey, active == generation else { throw AuthFailure.cancelled }
        guard !diskReadFailed else { throw AuthFailure.invalidInput("Your saved imports need recovery before editing. Existing files have been preserved.") }
        let disk = disk
        try await Task.detached(priority: .utility) { try disk.write(updated, key: key) }.value
        guard active == generation else { throw AuthFailure.cancelled }
        imported = updated
    }
    func rename(_ playlist: NativeLibraryPlaylist, to proposed: String) async throws {
        let name = proposed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard playlist.canManage, !name.isEmpty, name.utf16.count <= 120, !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else { throw AuthFailure.invalidInput("Use a playlist name between 1 and 120 characters.") }
        if playlist.serverID != nil && playlist.source == "SYNCBEATS" && name == "Liked Songs" { throw AuthFailure.invalidInput("Liked Songs is reserved for your Library collection.") }
        let (active, credentials) = try beginEdit(playlist)
        defer { finishEdit(active) }
        if playlist.serverID != nil {
            try await factory(credentials).rename(playlist, to: name)
            guard active == generation else { throw AuthFailure.cancelled }
            if let index = remote.firstIndex(where: { $0.id == playlist.id }) { remote[index].name = name }
        } else {
            var updated = imported
            guard let index = updated.playlists.firstIndex(where: { $0.id == playlist.id }) else { throw AuthFailure.cancelled }
            updated.playlists[index].name = name
            updated.playlists[index].editedName = name
            try await persistEdit(updated, generation: active)
        }
        message = "Playlist renamed"
        if (playlist.serverID != nil) { await invalidate() }
    }
    func addSongs(_ selected: [NativeLibrarySong], to playlist: NativeLibraryPlaylist) async throws {
        guard let current = playlists.first(where: { $0.id == playlist.id }) else { throw AuthFailure.cancelled }
        let existing = Set(current.songs.map(\.collectionKey))
        let additions = NativeLibraryCollection.songs(playlists: [], imported: selected).filter { !existing.contains($0.collectionKey) }
        guard !additions.isEmpty else { return }
        guard additions.count <= 200 else { throw AuthFailure.invalidInput("Choose up to 200 songs at a time.") }
        let (active, credentials) = try beginEdit(playlist)
        defer { finishEdit(active) }
        if playlist.serverID != nil {
            let acknowledged = try await factory(credentials).addSongs(additions, to: playlist)
            guard active == generation, acknowledged.id == playlist.id else { throw AuthFailure.cancelled }
            if let index = remote.firstIndex(where: { $0.id == playlist.id }) { remote[index] = acknowledged }
        } else {
            var updated = imported
            guard let index = updated.playlists.firstIndex(where: { $0.id == playlist.id }) else { throw AuthFailure.cancelled }
            updated.playlists[index].songs.append(contentsOf: additions)
            updated.playlists[index].addedSongIDs = Array(Set((updated.playlists[index].addedSongIDs ?? []) + additions.map(\.id)))
            try await persistEdit(updated, generation: active)
        }
        message = "Songs added to " + playlist.name
    }
    func delete(_ playlist: NativeLibraryPlaylist, songs disposition: NativePlaylistSongDisposition) async throws {
        guard playlist.canManage else { throw AuthFailure.invalidInput("Liked Songs is your Library collection.") }
        let (active, credentials) = try beginEdit(playlist)
        defer { finishEdit(active) }
        let removed = Set(playlist.songs.map(\.collectionKey))
        if playlist.serverID != nil {
            let retainedLibrary = try await factory(credentials).delete(playlist, songs: disposition)
            guard active == generation else { throw AuthFailure.cancelled }
            remote.removeAll { $0.id == playlist.id }
            if let retainedLibrary {
                if let index = remote.firstIndex(where: { $0.id == retainedLibrary.id }) { remote[index] = retainedLibrary }
                else { remote.append(retainedLibrary) }
            }
            if disposition == .remove { acknowledgedSaves.removeAll { removed.contains($0.collectionKey) } }
        } else {
            var updated = imported
            updated.playlists.removeAll { $0.id == playlist.id }
            if disposition == .remove { updated.songs.removeAll { removed.contains($0.collectionKey) } }
            else {
                let kept = Set(updated.songs.map(\.collectionKey))
                updated.songs.append(contentsOf: playlist.songs.filter { !kept.contains($0.collectionKey) })
            }
            try await persistEdit(updated, generation: active)
        }
        message = disposition == .keep ? "Playlist deleted · songs kept in Library" : "Playlist deleted · songs in other playlists kept"
    }
    func acceptMatch(_ candidate: NativeLibrarySong) async throws {
        guard !editing else { throw AuthFailure.invalidInput("Wait for the current Library update to finish.") }
        guard let key = accountKey, candidate.result != nil else { throw AuthFailure.invalidResponse }
        guard songs.contains(where: { $0.id == candidate.id }) else { throw AuthFailure.cancelled }
        let isLocalImport = imported.songs.contains { $0.id == candidate.id }
            || imported.playlists.contains { $0.songs.contains { $0.id == candidate.id } }
        if candidate.source == "APPLE_MUSIC", isLocalImport {
            guard !writing else { throw AuthFailure.invalidInput("Wait for the current Library update to finish.") }
            let writeGeneration = generation
            writing = true
            defer { if generation == writeGeneration { writing = false } }
            var updated = imported
            updated.songs = updated.songs.map { $0.id == candidate.id ? candidate : $0 }
            updated.playlists = updated.playlists.map { playlist in
                var copy = playlist; copy.songs = copy.songs.map { $0.id == candidate.id ? candidate : $0 }; return copy
            }
            let active = generation, disk = disk, snapshot = updated
            try await Task.detached(priority: .utility) { try disk.write(snapshot, key: key) }.value
            guard active == generation else { throw AuthFailure.cancelled }
            imported = updated
        } else {
            remoteSongs = remoteSongs.map { $0.id == candidate.id ? candidate : $0 }
            detailSongs = detailSongs?.map { $0.id == candidate.id ? candidate : $0 }
            remote = remote.map { playlist in
                var copy = playlist; copy.songs = copy.songs.map { $0.id == candidate.id ? candidate : $0 }; return copy
            }
        }
    }
    func pickerPage(query: String, cursor: String?) async throws -> NativeLibraryResultPage<NativeLibrarySong> {
        guard let credentials else { throw AuthFailure.cancelled }
        let active = generation
        let page = try await factory(credentials).catalogPage(.songs, cursor: cursor, query: query, filter: nil)
        guard generation == active else { throw AuthFailure.cancelled }
        let local = cursor == nil ? (imported.songs + imported.playlists.flatMap(\.songs)).filter { query.isEmpty || ($0.title + " " + $0.artist).localizedCaseInsensitiveContains(query) } : []
        return .init(items: NativeLibraryCollection.songs(playlists: [], imported: local + page.songs), nextCursor: page.nextCursor)
    }
    func queueDetail(in room: RoomSession) async {
        guard !loading, let credentials else { return }
        do {
            let api = factory(credentials)
            let active = generation
            let selected = detailPlaylist?.id
            let group = detailGroup
            var values = detailSongs ?? []
            var cursor = detailCursor
            while let next = cursor {
                guard generation == active, selected == detailPlaylist?.id, group?.id == detailGroup?.id else { return }
                if let id = selected, let playlist = playlists.first(where: { $0.id == id }) {
                    let page = try await api.trackPage(playlist, cursor: next); values += page.items; cursor = page.nextCursor
                } else if let group {
                    let page = try await api.catalogPage(.songs, cursor: next, query: "", filter: group.filter); values += page.songs; cursor = page.nextCursor
                } else { break }
            }
            guard generation == active else { return }
            await queue(values, in: room)
        } catch { self.error = error.localizedDescription }
    }
    func queue(_ songs: [NativeLibrarySong], in room: RoomSession) async {
        guard room.canControl, !queuing, room.roomID == credentials?.roomID else { return }
        let active = generation
        queuing = true
        defer { if generation == active { queuing = false } }
        var added = 0, skipped = 0
        for song in songs {
            guard generation == active, !Task.isCancelled, room.canControl else { return }
            guard let result = song.result else { skipped += 1; continue }
            if room.queuedTrack(for: result) != nil { continue }
            await room.add(result)
            guard room.errorMessage == nil else { error = room.errorMessage; return }
            added += 1
        }
        guard generation == active else { return }
        message = "Added \(added) songs to the room" + (skipped > 0 ? " · \(skipped) need a room version" : "")
    }
}
