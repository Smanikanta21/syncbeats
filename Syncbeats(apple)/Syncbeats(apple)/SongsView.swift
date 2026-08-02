
import SwiftUI

struct HeaderFrameModifier: ViewModifier {
    let width: CGFloat?
    let minWidth: CGFloat?
    let maxWidth: CGFloat?
    let alignment: Alignment

    func body(content: Content) -> some View {
        if let width {
            content.frame(width: width, alignment: alignment)
        } else {
            content.frame(minWidth: minWidth, maxWidth: maxWidth, alignment: alignment)
        }
    }
}

enum SongsSortColumn {
    case number
    case title
    case artist
    case album
    case source
    case duration
}

enum SongsSortOrder {
    case ascending
    case descending
}

struct SongItem: Identifiable {
    let id = UUID()
    let trackId: String          // PlaylistTrack.id — used for resolve calls
    let songId: String?          // Song.id — used for resolve calls
    let trackNumber: Int
    let title: String
    let artist: String
    let album: String
    let playlistSource: String
    let duration: String
    let durationRaw: Double
    let artworkURL: URL?
    let artworkColor: Color
    var youtubeId: String?
    var artworkURLResolved: URL? {
        guard let vid = youtubeId, !vid.isEmpty else { return artworkURL }
        return PlayerEngine.shared.findLocalArtwork(for: vid) ?? artworkURL
    }

    /// Only songs with a resolved youtubeId can stream.
    var playable: PlayableTrack? {
        guard let vid = youtubeId, !vid.isEmpty else { return nil }
        let resolvedArt = PlayerEngine.shared.findLocalArtwork(for: vid) ?? artworkURL
        return PlayableTrack(id: vid, title: title, artist: artist, artworkURL: resolvedArt)
    }
}

struct SongsView: View {
    @Environment(AuthStore.self) var authStore
    @Environment(\.colorScheme) var scheme
    @State private var engine = PlayerEngine.shared
    @State private var hoveredRowID: UUID? = nil
    @State private var songs: [SongItem] = []
    @State private var isLoading = false
    @State private var isResolving = false   // true while background resolve is running
    @State private var resolvedCount = 0     // how many resolved so far (for progress display)
    @State private var didLoad = false
    @State private var sortColumn: SongsSortColumn = .title
    @State private var sortOrder: SongsSortOrder = .ascending

    private var sortedSongs: [SongItem] {
        songs.sorted { a, b in
            let isAsc = sortOrder == .ascending
            switch sortColumn {
            case .number:
                return isAsc ? a.trackNumber < b.trackNumber : a.trackNumber > b.trackNumber
            case .title:
                let res = a.title.localizedCaseInsensitiveCompare(b.title)
                return isAsc ? res == .orderedAscending : res == .orderedDescending
            case .artist:
                let res = a.artist.localizedCaseInsensitiveCompare(b.artist)
                return isAsc ? res == .orderedAscending : res == .orderedDescending
            case .album:
                let res = a.album.localizedCaseInsensitiveCompare(b.album)
                return isAsc ? res == .orderedAscending : res == .orderedDescending
            case .source:
                let res = a.playlistSource.localizedCaseInsensitiveCompare(b.playlistSource)
                return isAsc ? res == .orderedAscending : res == .orderedDescending
            case .duration:
                return isAsc ? a.durationRaw < b.durationRaw : a.durationRaw > b.durationRaw
            }
        }
    }

    private func toggleSort(_ col: SongsSortColumn) {
        if sortColumn == col {
            sortOrder = (sortOrder == .ascending) ? .descending : .ascending
        } else {
            sortColumn = col
            sortOrder = .ascending
        }
    }

    @ViewBuilder
    private func headerCell(label: String, column: SongsSortColumn, width: CGFloat? = nil, minWidth: CGFloat? = nil, maxWidth: CGFloat? = nil, alignment: Alignment = .leading) -> some View {
        Button(action: {
            toggleSort(column)
        }) {
            HStack(spacing: 4) {
                if column == .duration {
                    Image(systemName: "clock")
                } else {
                    Text(label)
                }

                if sortColumn == column {
                    Image(systemName: sortOrder == .ascending ? "chevron.up" : "chevron.down")
                        .font(.system(size: 8, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                }
            }
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(sortColumn == column ? (scheme == .dark ? .white : .black) : Theme.Colors.textMuted(for: scheme))
            .modifier(HeaderFrameModifier(width: width, minWidth: minWidth, maxWidth: maxWidth, alignment: alignment))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Server response shapes

    /// GET /youtube/library?userId= → { playlists: [...] }
    struct LibraryResponse: Codable {
        let playlists: [LibraryPlaylist]
    }
    struct LibraryPlaylist: Codable {
        let id: String
        let title: String
    }

    /// GET /api/playlists/:id → { playlist: { ..., tracks: [...] } }
    struct PlaylistResponse: Codable {
        let playlist: PlaylistDetail
    }
    struct PlaylistDetail: Codable {
        let id: String
        let name: String
        let tracks: [PlaylistTrackRow]
    }
    struct PlaylistTrackRow: Codable {
        let id: String               // PlaylistTrack.id — for resolve calls
        let position: Int
        let song: SongDetail?
        let resolvedYoutubeId: String?   // enriched by server: Song.youtubeId ?? PlaylistTrack.youtubeId
        let resolvedThumbnail: String?   // enriched by server: best available thumbnail
    }
    struct SongDetail: Codable {
        let id: String?        // Song catalog ID — for resolve calls
        let title: String
        let artist: String
        let album: String?
        let duration: Double?
        let albumArt: String?
        let youtubeThumbnail: String?
        let youtubeId: String?

        /// Artwork resolution order:
        /// 1. High-res Spotify cover (`albumArt`)
        /// 2. Stored YouTube thumbnail (`youtubeThumbnail`)
        /// 3. Derived straight from the YouTube video id — no lookup needed.
        var artworkURL: URL? {
            if let art = albumArt, let url = URL(string: art) { return url }
            if let thumb = youtubeThumbnail, let url = URL(string: thumb) { return url }
            if let vid = youtubeId, !vid.isEmpty {
                return URL(string: "https://i.ytimg.com/vi/\(vid)/hqdefault.jpg")
            }
            return nil
        }
    }

    // Stable palette so repeated titles get a consistent swatch.
    private let palette: [Color] = [.red, .blue, .purple, .green, .orange, .pink, .teal, .indigo]

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            // Header Info & Controls
            HStack(alignment: .firstTextBaseline) {
                Text("Songs")
                    .font(Theme.Fonts.headline(size: 32))
                    .foregroundColor(scheme == .dark ? .white : .black)
                    
                Button(action: {
                    Task {
                        await loadSongsFromPlaylists()
                    }
                }) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        .rotationEffect(.degrees(isLoading ? 360 : 0))
                        .animation(isLoading ? Animation.linear(duration: 1).repeatForever(autoreverses: false) : .default, value: isLoading)
                }
                .buttonStyle(.plain)
                .padding(.leading, 8)

                Spacer()

                HStack(spacing: Theme.Spacing.rowGap) {
                    Button(action: {
                        let playableTracks = sortedSongs.compactMap { $0.playable }
                        guard !playableTracks.isEmpty else { return }
                        engine.play(queue: playableTracks, startAt: 0)
                    }) {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Play All")
                        }
                    }
                    .buttonStyle(MonochromePrimaryButtonStyle())
                    .disabled(songs.isEmpty)

                    Button(action: {
                        let playableTracks = sortedSongs.compactMap { $0.playable }.shuffled()
                        guard !playableTracks.isEmpty else { return }
                        engine.play(queue: playableTracks, startAt: 0)
                    }) {
                        HStack {
                            Image(systemName: "shuffle")
                            Text("Shuffle")
                        }
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())
                    .disabled(songs.isEmpty)
                }
            }
            .padding(.top, Theme.Spacing.containerPadding)

            // Resolving status badge — visible only while background YouTube matching runs
            if isResolving {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.mini)
                        .scaleEffect(0.8)
                    Text("Matching \(resolvedCount) of \(songs.count) songs to YouTube…")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(scheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.05))
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
                .animation(.easeInOut(duration: 0.3), value: isResolving)
            }

            // Tabular Header Row (Clickable for Sorting)
            HStack(spacing: 0) {
                headerCell(label: "#", column: .number, width: 36, alignment: .leading)
                headerCell(label: "Title", column: .title, minWidth: 200, maxWidth: .infinity, alignment: .leading)
                headerCell(label: "Artist", column: .artist, minWidth: 150, maxWidth: .infinity, alignment: .leading)
                headerCell(label: "Album", column: .album, minWidth: 150, maxWidth: .infinity, alignment: .leading)
                headerCell(label: "Source", column: .source, width: 120, alignment: .leading)
                headerCell(label: "Duration", column: .duration, width: 50, alignment: .trailing)
            }
            .padding(.horizontal, Theme.Spacing.rowGap)

            Divider()
                .background(Theme.Colors.glassBorder(for: scheme))

            // Songs List
            if songs.isEmpty && !isLoading {
                emptyState
            } else {
                ScrollView(.vertical, showsIndicators: true) {
                    LazyVStack(spacing: Theme.Spacing.base) {
                        ForEach(sortedSongs) { song in
                            songRow(song)
                        }

                        if isLoading {
                            ProgressView()
                                .controlSize(.small)
                                .frame(maxWidth: .infinity)
                                .padding(.top, Theme.Spacing.rowGap)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .task {
            if !didLoad {
                didLoad = true
                await loadSongsFromPlaylists()
            }
        }
    }

    // MARK: - Row

    /// Real album art via AsyncImage, with a colored music-note placeholder
    /// while loading or when a song has no artwork URL.
    @ViewBuilder
    private func artwork(for song: SongItem) -> some View {
        let placeholder = RoundedRectangle(cornerRadius: 4)
            .fill(song.artworkColor.opacity(0.8))
            .overlay(
                Image(systemName: "music.note")
                    .font(.caption)
                    .foregroundColor(.white)
            )

        ZStack {
            Group {
                if let url = song.artworkURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        case .empty:
                            placeholder.opacity(0.6)
                        case .failure:
                            placeholder
                        @unknown default:
                            placeholder
                        }
                    }
                } else {
                    placeholder
                }
            }
            
            if hoveredRowID == song.id {
                Color.black.opacity(0.4)
                Image(systemName: "play.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.white)
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    @ViewBuilder
    private func songRow(_ song: SongItem) -> some View {
        let isCurrentSong = (engine.current?.id != nil && !engine.current!.id.isEmpty && engine.current?.id == song.youtubeId) || 
                            (engine.current != nil && 
                             engine.current!.title.localizedCaseInsensitiveCompare(song.title) == .orderedSame && 
                             engine.current!.artist.localizedCaseInsensitiveCompare(song.artist) == .orderedSame)

        HStack(spacing: 0) {
            // Track Number / Speaker icon
            if isCurrentSong {
                Image(systemName: "speaker.wave.3.fill")
                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                    .frame(width: 36, alignment: .leading)
            } else {
                Text("\(song.trackNumber)")
                    .font(Theme.Fonts.mono())
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .frame(width: 36, alignment: .leading)
            }

            // Title + Artwork
            HStack(spacing: Theme.Spacing.rowGap) {
                artwork(for: song)

                Text(song.title)
                    .font(.system(size: 13, weight: isCurrentSong ? .bold : .semibold))
                    .foregroundColor(isCurrentSong ? Theme.Colors.primaryAccent(for: scheme) : (scheme == .dark ? .white : .black))
                    .lineLimit(1)
            }
            .frame(minWidth: 200, maxWidth: .infinity, alignment: .leading)

            // Artist
            Text(song.artist)
                .font(Theme.Fonts.body())
                .foregroundColor(isCurrentSong ? Theme.Colors.primaryAccent(for: scheme).opacity(0.8) : Theme.Colors.textMuted(for: scheme))
                .lineLimit(1)
                .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)

            // Album
            Text(song.album)
                .font(Theme.Fonts.body())
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                .lineLimit(1)
                .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)

            // Source Badge (which playlist this song came from)
            HStack {
                Text(song.playlistSource)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(scheme == .dark ? .white : .black)
                    .lineLimit(1)
                    .padding(.vertical, 2)
                    .padding(.horizontal, 8)
                    .background(scheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.06))
                    .cornerRadius(Theme.Radius.pillBadge)
            }
            .frame(width: 120, alignment: .leading)

            // Duration
            Text(song.duration)
                .font(Theme.Fonts.mono())
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                .frame(width: 50, alignment: .trailing)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, Theme.Spacing.rowGap)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.card)
                .fill(hoveredRowID == song.id ? (scheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.04)) : Color.clear)
        )
        .scaleEffect(hoveredRowID == song.id ? 1.01 : 1.0)
        .animation(.easeOut(duration: 0.15), value: hoveredRowID)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
            print("[SongsView] Double-tap on '\(song.title)' — youtubeId: \(song.youtubeId ?? "NIL")")
            let playableTracks = sortedSongs.compactMap { $0.playable }
            if let playable = song.playable,
               let idx = playableTracks.firstIndex(of: playable) {
                print("[SongsView] Calling engine.play at index \(idx)")
                engine.play(queue: playableTracks, startAt: idx)
            } else {
                print("[SongsView] Unresolved song double-clicked — resolving now...")
                Task {
                    // Show placeholder loading state in engine so Island expands
                    engine.setPlaceholderLoading(title: song.title, artist: song.artist, artworkURL: song.artworkURL)
                    
                    do {
                        let body = ResolveRequest(
                            trackId: song.trackId,
                            songId: song.songId,
                            title: song.title,
                            artist: song.artist
                        )
                        let response: ResolveResponse = try await APIClient.shared.post(
                            path: "/api/bridge/resolve",
                            body: body
                        )
                        if response.ok, let ytId = response.youtubeId, !ytId.isEmpty {
                            print("[SongsView] Resolved dynamically '\(song.title)' -> \(ytId)")
                            await MainActor.run {
                                if let idx = self.songs.firstIndex(where: { $0.trackId == song.trackId }) {
                                    self.songs[idx].youtubeId = ytId
                                    let updatedPlayableTracks = self.sortedSongs.compactMap { $0.playable }
                                    if let resolvedPlayable = self.songs[idx].playable,
                                       let newIdx = updatedPlayableTracks.firstIndex(of: resolvedPlayable) {
                                        engine.play(queue: updatedPlayableTracks, startAt: newIdx)
                                    }
                                }
                            }
                        } else {
                            print("[SongsView] Resolve response not ok")
                            engine.clearPlaceholderLoading()
                        }
                    } catch {
                        print("[SongsView] Resolve failed: \(error)")
                        engine.clearPlaceholderLoading()
                    }
                }
            }
        }
        .onHover { isHovered in
            if isHovered {
                hoveredRowID = song.id
            } else if hoveredRowID == song.id {
                hoveredRowID = nil
            }
        }
    }

    // MARK: - Empty state

    private var emptyState: some View {
        VStack(spacing: Theme.Spacing.rowGap) {
            Spacer()
            Image(systemName: "music.note.list")
                .font(.system(size: 40, weight: .light))
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
            Text("No songs yet")
                .font(Theme.Fonts.headline(size: 18))
                .foregroundColor(scheme == .dark ? .white : .black)
            Text("Songs from your playlists will appear here.\nImport a playlist or add tracks to get started.")
                .font(Theme.Fonts.body(size: 13))
                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Load: aggregate songs across the user's playlists

    private func loadSongsFromPlaylists() async {
        guard case let .signedIn(user) = authStore.state else { return }

        await MainActor.run { isLoading = true }
        defer { Task { @MainActor in isLoading = false } }

        do {
            // 1. Fetch the user's playlists.
            let library: LibraryResponse = try await APIClient.shared.get(
                path: "/youtube/library?userId=\(user.id)"
            )

            // 2. Fetch each playlist's tracks and flatten into a song list.
            var collected: [SongItem] = []
            var seen = Set<String>()   // de-dupe identical tracks across playlists
            var trackNumber = 1

            for playlist in library.playlists {
                guard let detail = try? await APIClient.shared.get(
                    path: "/api/playlists/\(playlist.id)"
                ) as PlaylistResponse else { continue }

                for row in detail.playlist.tracks.sorted(by: { $0.position < $1.position }) {
                    guard let song = row.song else { continue }
                    
                    // Robust deduplication:
                    // 1. Database Song ID (guarantees exact same database entity)
                    // 2. YouTube ID (guarantees exact same audio track)
                    // 3. Fallback to Title + Artist text match
                    let dedupeKey: String
                    if let sId = song.id, !sId.isEmpty {
                        dedupeKey = "id:\(sId)"
                    } else if let yId = row.resolvedYoutubeId ?? song.youtubeId, !yId.isEmpty {
                        dedupeKey = "yt:\(yId)"
                    } else {
                        dedupeKey = "txt:\(song.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())|\(song.artist.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())"
                    }
                    
                    if seen.contains(dedupeKey) { continue }
                    seen.insert(dedupeKey)

                    collected.append(
                        SongItem(
                            trackId: row.id,
                            songId: song.id,
                            trackNumber: trackNumber,
                            title: song.title,
                            artist: song.artist,
                            album: song.album ?? "",
                            playlistSource: playlist.title,
                            duration: Self.formatDuration(song.duration ?? 0),
                            durationRaw: song.duration ?? 0,
                            artworkURL: song.artworkURL ?? (row.resolvedThumbnail.flatMap { URL(string: $0) }),
                            artworkColor: palette[abs(dedupeKey.hashValue) % palette.count],
                            youtubeId: row.resolvedYoutubeId ?? song.youtubeId
                        )
                    )
                    trackNumber += 1
                }
            }

            let result = collected
            let withId = result.filter { $0.youtubeId != nil && !($0.youtubeId!.isEmpty) }
            print("[SongsView] Loaded \(result.count) songs, \(withId.count) already have youtubeId")
            await MainActor.run {
                self.songs = result
                self.resolvedCount = withId.count
            }
        } catch {
            print("[SongsView] Failed to load songs from playlists:", error)
        }
    }

    // MARK: - YouTube Resolution Shapes

    struct ResolveRequest: Codable {
        let trackId: String
        let songId: String?
        let title: String
        let artist: String
    }
    struct ResolveResponse: Codable {
        let ok: Bool
        let youtubeId: String?
        let thumbnail: String?
    }

    private static func formatDuration(_ seconds: Double) -> String {
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

#Preview {
    SongsView()
        .environment(AuthStore())
        .preferredColorScheme(.dark)
}
