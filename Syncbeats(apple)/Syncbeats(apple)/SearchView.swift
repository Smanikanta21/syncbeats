import SwiftUI

// MARK: - Models

struct SearchSong: Identifiable, Codable, Equatable {
    var id: String { youtubeId }
    let youtubeId: String
    let title: String
    let artist: String
    let thumbnail: String
    let duration: Int

    var artworkURL: URL? {
        if !thumbnail.isEmpty, let u = URL(string: thumbnail) { return u }
        if !youtubeId.isEmpty { return URL(string: "https://i.ytimg.com/vi/\(youtubeId)/hqdefault.jpg") }
        return nil
    }

    var playable: PlayableTrack {
        PlayableTrack(id: youtubeId, title: title, artist: artist, artworkURL: artworkURL)
    }

    static func == (lhs: SearchSong, rhs: SearchSong) -> Bool { lhs.youtubeId == rhs.youtubeId }
}

struct RecSection: Identifiable, Codable {
    var id: String { title }
    let title: String
    let tracks: [SearchSong]
}

struct SearchView: View {
    @Environment(AuthStore.self) var authStore
    @Environment(\.colorScheme) var scheme
    @State private var engine = PlayerEngine.shared

    // Called after a Spotify playlist is successfully imported, so the sidebar can refresh.
    var onPlaylistImported: (() -> Void)? = nil

    // Search state
    @State private var query = ""
    @State private var querySuggestions: [String] = []
    @State private var songResults: [SearchSong] = []
    @State private var recommendations: [RecSection] = []
    @State private var selectedSong: SearchSong? = nil
    @State private var isSearching = false
    @State private var showSuggestions = false
    @FocusState private var inputFocused: Bool

    // Debounce tasks (cancel-and-restart on each keystroke)
    @State private var suggestTask: Task<Void, Never>? = nil
    @State private var searchTask: Task<Void, Never>? = nil
    @State private var didLoadRecs = false

    // Add-to-playlist picker
    @State private var userPlaylists: [PlaylistPickerItem] = []
    @State private var showPlaylistPicker = false
    @State private var pickerSong: SearchSong? = nil
    @State private var toast: String? = nil

    // Spotify import (preserved from the old inline .search case)
    @State private var isImporting = false
    private var isSpotifyPlaylistURL: Bool {
        query.lowercased().contains("spotify.com/playlist/") || query.lowercased().contains("spotify:playlist:")
    }

    // MARK: - Response shapes (suggest endpoint returns a bare [String])
    private struct SearchResponse: Codable { let results: [RawYouTube] }
    private struct RawYouTube: Codable {
        let id: String
        let title: String
        let artist: String
        let thumbnail: String
        let duration: String?
    }
    private struct RecommendationsResponse: Codable { let sections: [RecSection] }
    private struct PlaylistsResponse: Codable { let playlists: [PlaylistPickerItem] }
    struct PlaylistPickerItem: Identifiable, Codable { let id: String; let name: String; let trackCount: Int }
    private struct AddTrackRequest: Codable {
        let youtubeId: String; let title: String; let artist: String; let thumbnail: String; let duration: Int
    }
    private struct AddTrackResponse: Codable { let ok: Bool }
    private struct ImportPlaylistRequest: Codable { let playlistUrl: String }
    private struct ImportPlaylistResponse: Codable { let ok: Bool; let playlistId: String; let totalTracks: Int }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
            searchInput
                .padding(.top, Theme.Spacing.containerPadding)
                .padding(.horizontal, Theme.Spacing.containerPadding)

            // Feed area — recommendations (empty query) or song results (typed query).
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
                    if let song = selectedSong {
                        selectedSongCard(song)
                    }

                    if isSpotifyPlaylistURL {
                        spotifyImportCard
                    } else if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                        songResultsSection
                    } else {
                        recommendationsSection
                    }
                }
                .padding(.horizontal, Theme.Spacing.containerPadding)
                .padding(.bottom, Theme.Spacing.sectionGap)
            }
        }
        // Typeahead dropdown floats over the feed so the feed never reflows.
        .overlay(alignment: .top) {
            if showSuggestions && !querySuggestions.isEmpty && !isSpotifyPlaylistURL {
                suggestionDropdown
                    .padding(.horizontal, Theme.Spacing.containerPadding)
                    .padding(.top, 74)
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(scheme == .dark ? .black : .white)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Capsule().fill(Theme.Colors.primaryAccent(for: scheme)))
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .task {
            if !didLoadRecs { didLoadRecs = true; await loadRecommendations() }
        }
        .onChange(of: query) { _, newValue in onQueryChanged(newValue) }
        .popover(isPresented: $showPlaylistPicker) { playlistPicker }
    }

    // MARK: - Search input

    private var searchInput: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
            TextField("Search songs or paste a Spotify playlist link…", text: $query)
                .textFieldStyle(.plain)
                .font(Theme.Fonts.body(size: 14))
                .focused($inputFocused)
                .onSubmit { runSongSearch(immediate: true) }

            if isSearching {
                ProgressView().controlSize(.small)
            } else if !query.isEmpty {
                Button(action: clearSearch) {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .glassCard()
    }

    // MARK: - Suggestion dropdown

    private var suggestionDropdown: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(querySuggestions.prefix(6).enumerated()), id: \.offset) { _, s in
                Button(action: {
                    query = s
                    showSuggestions = false
                    runSongSearch(immediate: true)
                }) {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        Text(s)
                            .font(.system(size: 13))
                            .foregroundColor(scheme == .dark ? .white : .black)
                            .lineLimit(1)
                        Spacer()
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, 8).padding(.horizontal, 12)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 4)
        .glassCard()
        .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
    }

    // MARK: - Selected song detail card

    @ViewBuilder
    private func selectedSongCard(_ song: SearchSong) -> some View {
        HStack(alignment: .top, spacing: Theme.Spacing.rowGap) {
            artwork(url: song.artworkURL, size: 72)

            VStack(alignment: .leading, spacing: 6) {
                Text(song.title)
                    .font(Theme.Fonts.headline(size: 18))
                    .foregroundColor(scheme == .dark ? .white : .black)
                    .lineLimit(2)
                Text(song.artist)
                    .font(Theme.Fonts.body(size: 13))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .lineLimit(1)

                HStack(spacing: Theme.Spacing.rowGap) {
                    Button(action: { engine.play(song.playable) }) {
                        HStack { Image(systemName: "play.fill"); Text("Play") }
                    }
                    .buttonStyle(MonochromePrimaryButtonStyle())

                    Button(action: { Task { await addToLibrary(song) } }) {
                        HStack { Image(systemName: "heart"); Text("Add to Library") }
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())

                    Button(action: { openPlaylistPicker(for: song) }) {
                        HStack { Image(systemName: "text.badge.plus"); Text("Add to Playlist") }
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())
                }
                .padding(.top, 4)
            }
            Spacer()

            Button(action: { withAnimation { selectedSong = nil } }) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
            }
            .buttonStyle(.plain)
        }
        .padding(Theme.Spacing.rowGap)
        .glassCard()
    }

    // MARK: - Song results

    private var songResultsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.base) {
            if songResults.isEmpty && !isSearching {
                Text("Press Return to search, or keep typing.")
                    .font(Theme.Fonts.body(size: 13))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.top, 40)
            } else {
                ForEach(songResults) { song in songRow(song) }
            }
        }
    }

    // MARK: - Recommendations

    private var recommendationsSection: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            if recommendations.isEmpty {
                VStack(spacing: Theme.Spacing.rowGap) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 36, weight: .light))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    Text("Start typing to search")
                        .font(Theme.Fonts.headline(size: 16))
                        .foregroundColor(scheme == .dark ? .white : .black)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 60)
            } else {
                ForEach(recommendations) { section in
                    VStack(alignment: .leading, spacing: Theme.Spacing.rowGap) {
                        Text(section.title)
                            .font(Theme.Fonts.headline(size: 20))
                            .foregroundColor(scheme == .dark ? .white : .black)
                        VStack(spacing: Theme.Spacing.base) {
                            ForEach(section.tracks) { song in songRow(song) }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Shared song row

    @ViewBuilder
    private func songRow(_ song: SearchSong) -> some View {
        Button(action: { withAnimation { selectedSong = song } }) {
            HStack(spacing: Theme.Spacing.rowGap) {
                artwork(url: song.artworkURL, size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(song.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(scheme == .dark ? .white : .black)
                        .lineLimit(1)
                    Text(song.artist)
                        .font(Theme.Fonts.body(size: 11))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        .lineLimit(1)
                }
                Spacer()
                Button(action: { engine.play(song.playable) }) {
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                }
                .buttonStyle(.plain)
            }
            .padding(.vertical, 6).padding(.horizontal, Theme.Spacing.rowGap)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func artwork(url: URL?, size: CGFloat) -> some View {
        let placeholder = RoundedRectangle(cornerRadius: 4)
            .fill(Color.gray.opacity(0.3))
            .overlay(Image(systemName: "music.note").font(.caption).foregroundColor(.white))

        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image): image.resizable().aspectRatio(contentMode: .fill)
                    case .empty: placeholder.opacity(0.6)
                    default: placeholder
                    }
                }
            } else { placeholder }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Spotify import card

    private var spotifyImportCard: some View {
        VStack(spacing: Theme.Spacing.rowGap) {
            Image(systemName: "arrow.down.doc.fill")
                .font(.system(size: 40, weight: .light))
                .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
            Text("Spotify Playlist Detected")
                .font(Theme.Fonts.headline(size: 18))
                .foregroundColor(scheme == .dark ? .white : .black)
            Text("Import this playlist and sync its tracks to your SyncBeats library.")
                .font(Theme.Fonts.body(size: 13))
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                .multilineTextAlignment(.center)
            if isImporting {
                ProgressView().controlSize(.small)
            } else {
                Button(action: { Task { await importSpotifyPlaylist() } }) {
                    HStack { Image(systemName: "plus.circle.fill"); Text("Import Playlist") }
                }
                .buttonStyle(MonochromePrimaryButtonStyle())
            }
        }
        .padding(Theme.Spacing.containerPadding)
        .glassCard()
        .frame(maxWidth: 400)
        .frame(maxWidth: .infinity)
        .padding(.top, 40)
    }

    // MARK: - Playlist picker

    private var playlistPicker: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Add to Playlist")
                .font(Theme.Fonts.headline(size: 14))
                .padding(.horizontal, 14).padding(.vertical, 10)
            Divider()
            if userPlaylists.isEmpty {
                Text("No playlists yet.")
                    .font(Theme.Fonts.body(size: 12))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .padding(14)
            } else {
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(userPlaylists) { p in
                            Button(action: { Task { await addToPlaylist(p) } }) {
                                HStack {
                                    Image(systemName: "music.note.list")
                                    Text(p.name).lineLimit(1)
                                    Spacer()
                                    Text("\(p.trackCount)")
                                        .font(Theme.Fonts.mono(size: 10))
                                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                }
                                .contentShape(Rectangle())
                                .padding(.horizontal, 14).padding(.vertical, 8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 240)
            }
        }
        .frame(width: 260)
    }

    // MARK: - Query change → debounced hybrid typeahead

    private func onQueryChanged(_ value: String) {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        suggestTask?.cancel()
        searchTask?.cancel()

        if trimmed.isEmpty || isSpotifyPlaylistURL {
            querySuggestions = []
            songResults = []
            showSuggestions = false
            return
        }

        showSuggestions = true

        // Fast query-string suggestions (~150ms).
        suggestTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            if Task.isCancelled { return }
            await loadSuggestions(trimmed)
        }
        // Song results (~350ms), fill in underneath.
        runSongSearch(immediate: false)
    }

    private func runSongSearch(immediate: Bool) {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !isSpotifyPlaylistURL else { return }
        searchTask?.cancel()
        searchTask = Task {
            if !immediate {
                try? await Task.sleep(nanoseconds: 350_000_000)
                if Task.isCancelled { return }
            }
            await MainActor.run { isSearching = true }
            await loadSongResults(trimmed)
            await MainActor.run { isSearching = false; if immediate { showSuggestions = false } }
        }
    }

    // MARK: - Networking

    private func loadSuggestions(_ q: String) async {
        guard let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }
        do {
            let sugs: [String] = try await APIClient.shared.get(path: "/rooms/youtube/suggest?q=\(enc)")
            if Task.isCancelled { return }
            await MainActor.run { querySuggestions = sugs }
        } catch { }
    }

    private func loadSongResults(_ q: String) async {
        guard let enc = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return }
        do {
            let resp: SearchResponse = try await APIClient.shared.get(path: "/search/youtube?q=\(enc)")
            if Task.isCancelled { return }
            let mapped = resp.results.map { r in
                SearchSong(youtubeId: r.id, title: r.title, artist: r.artist,
                           thumbnail: r.thumbnail, duration: parseDuration(r.duration))
            }
            await MainActor.run { songResults = mapped }
        } catch {
            await MainActor.run { songResults = [] }
        }
    }

    private func loadRecommendations() async {
        guard case let .signedIn(user) = authStore.state else { return }
        do {
            let resp: RecommendationsResponse = try await APIClient.shared.get(path: "/search/recommendations?userId=\(user.id)")
            await MainActor.run { recommendations = resp.sections }
        } catch {
            print("[SearchView] Failed to load recommendations:", error)
        }
    }

    private func addToLibrary(_ song: SearchSong) async {
        do {
            let body = AddTrackRequest(youtubeId: song.youtubeId, title: song.title,
                                       artist: song.artist, thumbnail: song.thumbnail, duration: song.duration)
            let _: AddTrackResponse = try await APIClient.shared.post(path: "/api/playlists/library/tracks", body: body)
            await showToast("Added to Library")
        } catch { await showToast("Failed to add") }
    }

    private func openPlaylistPicker(for song: SearchSong) {
        pickerSong = song
        showPlaylistPicker = true
        Task {
            do {
                let resp: PlaylistsResponse = try await APIClient.shared.get(path: "/api/playlists")
                await MainActor.run { userPlaylists = resp.playlists }
            } catch { }
        }
    }

    private func addToPlaylist(_ playlist: PlaylistPickerItem) async {
        guard let song = pickerSong else { return }
        await MainActor.run { showPlaylistPicker = false }
        do {
            let body = AddTrackRequest(youtubeId: song.youtubeId, title: song.title,
                                       artist: song.artist, thumbnail: song.thumbnail, duration: song.duration)
            let _: AddTrackResponse = try await APIClient.shared.post(path: "/api/playlists/\(playlist.id)/tracks", body: body)
            await showToast("Added to \(playlist.name)")
        } catch { await showToast("Failed to add") }
    }

    private func importSpotifyPlaylist() async {
        await MainActor.run { isImporting = true }
        defer { Task { @MainActor in isImporting = false } }
        do {
            let body = ImportPlaylistRequest(playlistUrl: query)
            let resp: ImportPlaylistResponse = try await APIClient.shared.post(path: "/api/bridge/import", body: body)
            if resp.ok { await MainActor.run { query = ""; onPlaylistImported?() }; await showToast("Playlist imported") }
        } catch let APIError.httpError(_, message) {
            print("[SearchView] Failed to import Spotify playlist:", message)
            // Server returns { "error": "..." } — surface its message (e.g. private playlist).
            if let data = message.data(using: .utf8),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let serverError = obj["error"] as? String {
                await showToast(serverError)
            } else {
                await showToast("Import failed")
            }
        } catch {
            print("[SearchView] Failed to import Spotify playlist:", error)
            await showToast("Import failed")
        }
    }

    // MARK: - Helpers

    private func clearSearch() {
        query = ""
        songResults = []
        querySuggestions = []
        showSuggestions = false
        selectedSong = nil
    }

    @MainActor
    private func showToast(_ message: String) async {
        withAnimation { toast = message }
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        withAnimation { toast = nil }
    }

    /// yt-search returns duration as "m:ss" (or "h:mm:ss"); convert to seconds.
    private func parseDuration(_ s: String?) -> Int {
        guard let s else { return 0 }
        let parts = s.split(separator: ":").compactMap { Int($0) }
        return parts.reduce(0) { $0 * 60 + $1 }
    }
}

#Preview {
    SearchView()
        .environment(AuthStore())
        .preferredColorScheme(.dark)
}
