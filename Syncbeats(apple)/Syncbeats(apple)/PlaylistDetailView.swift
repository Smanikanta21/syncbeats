import SwiftUI

struct PlaylistTrack: Identifiable {
    let id = UUID()
    let trackId: String
    let songId: String?
    var youtubeId: String?
    let index: Int
    let title: String
    let artist: String
    let duration: String
    var isMatched: Bool
    var artworkURL: URL?

    var playable: PlayableTrack? {
        guard let vid = youtubeId, !vid.isEmpty else { return nil }
        return PlayableTrack(id: vid, title: title, artist: artist, artworkURL: artworkURL)
    }
}

struct PlaylistDetailView: View {
    let playlistId: String?
    let playlistTitle: String
    var onPlaylistDeleted: (() -> Void)? = nil
    var onPlaylistUpdated: (() -> Void)? = nil

    @Environment(\.colorScheme) var scheme
    @State private var hoveredTrackID: UUID? = nil
    @State private var tracks: [PlaylistTrack] = []
    @State private var isLoading = false
    @State private var resolvingTrackIDs = Set<String>()
    @State private var engine = PlayerEngine.shared

    // Background auto-resolution progress ("importing" tracks into a playable state).
    // A freshly-imported Spotify playlist has tracks with no YouTube match yet; we
    // resolve them in the background and surface a live progress bar while it runs.
    @State private var isAutoResolving = false
    @State private var autoResolveTask: Task<Void, Never>? = nil

    @State private var coverUrl: String? = nil
    @State private var playlistNameState: String = ""
    
    @State private var showRenameSheet = false
    @State private var showEditCoverSheet = false
    @State private var showDeleteAlert = false
    
    @State private var newPlaylistName = ""
    @State private var newCoverUrl = ""
    @State private var isHoveringCover = false

    struct UpdatePlaylistRequest: Codable {
        let name: String?
        let coverUrl: String?
    }

    struct DeleteResponse: Codable {
        let success: Bool
    }

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

    // MARK: - Server Response Mappings
    struct ServerPlaylistResponse: Codable {
        let playlist: ServerPlaylist
    }
    struct ServerPlaylist: Codable {
        let id: String
        let name: String
        let coverUrl: String?
        let tracks: [ServerPlaylistTrack]
    }
    struct ServerPlaylistTrack: Codable {
        let id: String
        let position: Int
        let song: ServerSongDetail?
        let resolvedYoutubeId: String?   // enriched by server: Song.youtubeId ?? PlaylistTrack.youtubeId
        let resolvedThumbnail: String?   // enriched by server: best available thumbnail
    }
    struct ServerSongDetail: Codable {
        let id: String
        let title: String
        let artist: String
        let duration: Double?
        let albumArt: String?
        let youtubeThumbnail: String?
        let youtubeId: String?
        let resolvedAt: String?

        var artworkURL: URL? {
            if let art = albumArt, let url = URL(string: art) { return url }
            if let thumb = youtubeThumbnail, let url = URL(string: thumb) { return url }
            if let vid = youtubeId, !vid.isEmpty {
                return URL(string: "https://i.ytimg.com/vi/\(vid)/hqdefault.jpg")
            }
            return nil
        }
    }

    // MARK: - Resolution progress

    private var matchedCount: Int { tracks.filter { $0.isMatched }.count }
    private var totalCount: Int { tracks.count }
    private var resolveProgress: CGFloat {
        guard totalCount > 0 else { return 0 }
        return CGFloat(matchedCount) / CGFloat(totalCount)
    }
    /// True while there are still tracks left to resolve.
    private var hasUnmatched: Bool { tracks.contains { !$0.isMatched } }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            
            // Hero Playlist Card
            HStack(spacing: Theme.Spacing.containerPadding) {
                // Large Artwork
                ZStack {
                    if let coverUrl = coverUrl, let url = URL(string: coverUrl) {
                        AsyncImage(url: url) { phase in
                            switch phase {
                            case .success(let image):
                                image.resizable()
                                    .aspectRatio(contentMode: .fill)
                            case .empty:
                                defaultCoverPlaceholder.opacity(0.6)
                            case .failure:
                                defaultCoverPlaceholder
                            @unknown default:
                                defaultCoverPlaceholder
                            }
                        }
                    } else {
                        defaultCoverPlaceholder
                    }
                    
                    if isHoveringCover && playlistId != nil {
                        Color.black.opacity(0.4)
                        Button(action: {
                            newCoverUrl = coverUrl ?? ""
                            showEditCoverSheet = true
                        }) {
                            Image(systemName: "pencil.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.white)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(width: 140, height: 140)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.card))
                .glassCard()
                .onHover { hovering in
                    isHoveringCover = hovering
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("PLAYLIST")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    Text(playlistNameState.isEmpty ? playlistTitle : playlistNameState)
                        .font(Theme.Fonts.headline(size: 28))
                        .foregroundColor(scheme == .dark ? .white : .black)
                    
                    Text(tracks.isEmpty ? "No tracks yet." : "\(tracks.count) song\(tracks.count == 1 ? "" : "s") · synced natively across your devices.")
                        .font(Theme.Fonts.body())
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    HStack(spacing: Theme.Spacing.rowGap) {
                        Button(action: {
                            let playableTracks = tracks.compactMap { $0.playable }
                            guard !playableTracks.isEmpty else { return }
                            engine.play(queue: playableTracks, startAt: 0)
                        }) {
                            HStack {
                                Image(systemName: "play.fill")
                                Text("Play")
                            }
                        }
                        .buttonStyle(MonochromePrimaryButtonStyle())
                        .disabled(tracks.allSatisfy { $0.playable == nil })
                        
                        if hasUnmatched || isAutoResolving {
                            Button(action: {
                                if isAutoResolving {
                                    autoResolveTask?.cancel()
                                } else {
                                    startAutoResolve()
                                }
                            }) {
                                HStack {
                                    Image(systemName: isAutoResolving ? "stop.fill" : "arrow.down.doc.fill")
                                    Text(isAutoResolving ? "Matching…" : "Match tracks")
                                }
                            }
                            .buttonStyle(MonochromeSecondaryButtonStyle())
                        }
                        
                        if playlistId != nil {
                            Button(action: {
                                newPlaylistName = playlistNameState.isEmpty ? playlistTitle : playlistNameState
                                showRenameSheet = true
                            }) {
                                HStack {
                                    Image(systemName: "pencil")
                                    Text("Rename")
                                }
                            }
                            .buttonStyle(MonochromeSecondaryButtonStyle())
                            
                            Button(action: {
                                showDeleteAlert = true
                            }) {
                                HStack {
                                    Image(systemName: "trash")
                                    Text("Delete")
                                }
                            }
                            .buttonStyle(MonochromeSecondaryButtonStyle())
                        }
                    }
                    .padding(.top, 8)
                }
                
                Spacer()
            }
            .padding(.top, Theme.Spacing.containerPadding)
            
            // Track resolution ("importing") progress — visible while any track is
            // still being matched to a playable YouTube source.
            if isAutoResolving || (hasUnmatched && totalCount > 0) {
                VStack(alignment: .leading, spacing: Theme.Spacing.base) {
                    HStack {
                        Text(isAutoResolving ? "MATCHING TRACKS TO YOUTUBE…" : "SOME TRACKS ARE NOT YET MATCHED")
                            .font(Theme.Fonts.mono(size: 9))
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                        Spacer()
                        Text("\(matchedCount) / \(totalCount)")
                            .font(Theme.Fonts.mono(size: 9))
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    }

                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(scheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.06))
                            .overlay(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Theme.Colors.primaryAccent(for: scheme))
                                    .frame(width: geo.size.width * resolveProgress)
                                    .animation(.easeInOut(duration: 0.25), value: resolveProgress)
                            }
                    }
                    .frame(height: 4)
                }
                .padding(.horizontal, Theme.Spacing.rowGap)
            }
            
            // Playlist Track Table
            ScrollView(.vertical, showsIndicators: true) {
                LazyVStack(spacing: Theme.Spacing.base) {
                    ForEach(tracks) { track in
                        let isCurrentSong = engine.current?.id != nil && engine.current?.id == track.youtubeId
                        
                        HStack(spacing: Theme.Spacing.rowGap) {
                            // Track Number / Speaker icon
                            if isCurrentSong {
                                Image(systemName: "speaker.wave.3.fill")
                                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                                    .frame(width: 24, alignment: .leading)
                            } else {
                                Text("\(track.index)")
                                    .font(Theme.Fonts.mono())
                                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                    .frame(width: 24, alignment: .leading)
                            }

                            // Album art
                            trackArtwork(track)

                            // Matched / Unmatched indicator icon
                            if resolvingTrackIDs.contains(track.trackId) {
                                SpinningIcon()
                            } else {
                                Image(systemName: track.isMatched ? "checkmark.circle.fill" : "circle.dotted")
                                    .foregroundColor(track.isMatched ? .green : Theme.Colors.textMuted(for: scheme))
                            }
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(track.title)
                                    .font(.system(size: 13, weight: isCurrentSong ? .bold : .semibold))
                                    .foregroundColor(isCurrentSong ? Theme.Colors.primaryAccent(for: scheme) : (scheme == .dark ? .white : .black))
                                
                                if !track.isMatched {
                                    Text(resolvingTrackIDs.contains(track.trackId) ? "Resolving track..." : "Unmatched from Spotify library - click to resolve manually")
                                        .font(.system(size: 10))
                                        .foregroundColor(resolvingTrackIDs.contains(track.trackId) ? .blue : .red)
                                        .contentShape(Rectangle())
                                        .onTapGesture {
                                            if !resolvingTrackIDs.contains(track.trackId) {
                                                Task {
                                                    await resolveTrackManually(track)
                                                }
                                            }
                                        }
                                }
                            }
                            
                            Spacer()
                            
                            Text(track.artist)
                                .font(Theme.Fonts.body())
                                .foregroundColor(isCurrentSong ? Theme.Colors.primaryAccent(for: scheme).opacity(0.8) : Theme.Colors.textMuted(for: scheme))
                            
                            Text(track.duration)
                                .font(Theme.Fonts.mono())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(width: 50, alignment: .trailing)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, Theme.Spacing.rowGap)
                        .background(
                            RoundedRectangle(cornerRadius: Theme.Radius.card)
                                .fill(hoveredTrackID == track.id ? (scheme == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.04)) : Color.clear)
                        )
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) {
                            if track.isMatched {
                                let playableTracks = tracks.compactMap { $0.playable }
                                if let playable = track.playable,
                                   let idx = playableTracks.firstIndex(of: playable) {
                                    engine.play(queue: playableTracks, startAt: idx)
                                }
                            } else {
                                print("[PlaylistDetailView] Unresolved track double-clicked — resolving now...")
                                Task {
                                    // Show placeholder loading state in engine so Island expands
                                    engine.setPlaceholderLoading(title: track.title, artist: track.artist, artworkURL: track.artworkURL)
                                    
                                    await resolveTrackManually(track)
                                    
                                    // Find it again in tracks (after reload done by resolveTrackManually)
                                    if let indexInTracks = self.tracks.firstIndex(where: { $0.trackId == track.trackId }) {
                                        let updatedTrack = self.tracks[indexInTracks]
                                        let updatedPlayableTracks = self.tracks.compactMap { $0.playable }
                                        if let resolvedPlayable = updatedTrack.playable,
                                           let newIdx = updatedPlayableTracks.firstIndex(of: resolvedPlayable) {
                                            engine.play(queue: updatedPlayableTracks, startAt: newIdx)
                                        } else {
                                            print("[PlaylistDetailView] Track resolved but could not be played")
                                            engine.clearPlaceholderLoading()
                                        }
                                    } else {
                                        engine.clearPlaceholderLoading()
                                    }
                                }
                            }
                        }
                        .onHover { isHovered in
                            if isHovered {
                                hoveredTrackID = track.id
                            } else if hoveredTrackID == track.id {
                                hoveredTrackID = nil
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .task(id: playlistId) {
            guard let playlistId else { return }
            await loadPlaylistTracks(id: playlistId)
            // Kick off background matching for any tracks that aren't playable yet.
            startAutoResolve()
        }
        .onDisappear {
            autoResolveTask?.cancel()
        }
        .sheet(isPresented: $showRenameSheet) {
            VStack(spacing: Theme.Spacing.rowGap) {
                Text("Rename Playlist")
                    .font(.headline)
                TextField("Playlist Name", text: $newPlaylistName)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 250)
                
                HStack {
                    Button("Cancel") {
                        showRenameSheet = false
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())
                    
                    Button("Save") {
                        Task {
                            await renamePlaylist()
                        }
                    }
                    .buttonStyle(MonochromePrimaryButtonStyle())
                    .disabled(newPlaylistName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(Theme.Spacing.containerPadding)
            .frame(width: 300)
        }
        .sheet(isPresented: $showEditCoverSheet) {
            VStack(spacing: Theme.Spacing.rowGap) {
                Text("Edit Playlist Cover URL")
                    .font(.headline)
                TextField("Cover Image URL", text: $newCoverUrl)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 250)
                
                HStack {
                    Button("Cancel") {
                        showEditCoverSheet = false
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())
                    
                    Button("Save") {
                        Task {
                            await updateCoverUrl()
                        }
                    }
                    .buttonStyle(MonochromePrimaryButtonStyle())
                }
            }
            .padding(Theme.Spacing.containerPadding)
            .frame(width: 300)
        }
        .alert("Delete Playlist", isPresented: $showDeleteAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                Task {
                    await deletePlaylist()
                }
            }
        } message: {
            Text("Are you sure you want to delete this playlist? This action cannot be undone.")
        }
    }

    // MARK: - Track artwork

    @ViewBuilder
    private func trackArtwork(_ track: PlaylistTrack) -> some View {
        let placeholder = RoundedRectangle(cornerRadius: 4)
            .fill(scheme == .dark ? Color.white.opacity(0.10) : Color.black.opacity(0.06))
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: 11))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
            )

        ZStack {
            Group {
                if let url = track.artworkURL {
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
            
            if hoveredTrackID == track.id && track.isMatched {
                Color.black.opacity(0.4)
                Image(systemName: "play.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.white)
            }
        }
        .frame(width: 32, height: 32)
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }

    private func loadPlaylistTracks(id: String) async {
        await MainActor.run { isLoading = true }
        defer { Task { @MainActor in isLoading = false } }
        do {
            let response: ServerPlaylistResponse = try await APIClient.shared.get(path: "/api/playlists/\(id)")
            let mapped = response.playlist.tracks.map { pt in
                let title = pt.song?.title ?? "Unknown Track"
                let artist = pt.song?.artist ?? "Unknown Artist"
                let dur = pt.song?.duration ?? 0
                let mins = Int(dur) / 60
                let secs = Int(dur) % 60
                let durStr = String(format: "%d:%02d", mins, secs)
                let matched = pt.song?.resolvedAt != nil

                return PlaylistTrack(
                    trackId: pt.id,
                    songId: pt.song?.id,
                    youtubeId: pt.resolvedYoutubeId ?? pt.song?.youtubeId,
                    index: pt.position + 1,
                    title: title,
                    artist: artist,
                    duration: durStr,
                    isMatched: matched,
                    artworkURL: pt.song?.artworkURL ?? (pt.resolvedThumbnail.flatMap { URL(string: $0) })
                )
            }
            await MainActor.run {
                self.tracks = mapped
                let playable = mapped.filter { $0.youtubeId != nil }
                print("[PlaylistDetailView] Loaded \(mapped.count) tracks, \(playable.count) already have youtubeId")
                self.playlistNameState = response.playlist.name
                self.coverUrl = response.playlist.coverUrl
            }
        } catch {
            print("[PlaylistDetailView] Failed to load tracks:", error)
        }
    }

    private var defaultCoverPlaceholder: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.card)
            .fill(LinearGradient(colors: [Color.gray, Color.black], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(
                Image(systemName: "music.note.list")
                    .font(.system(size: 40))
                    .foregroundColor(.white)
            )
    }

    private func renamePlaylist() async {
        guard let playlistId = playlistId else { return }
        showRenameSheet = false
        do {
            let body = UpdatePlaylistRequest(name: newPlaylistName, coverUrl: nil)
            let response: ServerPlaylistResponse = try await APIClient.shared.put(
                path: "/api/playlists/\(playlistId)",
                body: body
            )
            await MainActor.run {
                self.playlistNameState = response.playlist.name
                onPlaylistUpdated?()
            }
        } catch {
            print("[PlaylistDetailView] Failed to rename playlist:", error)
        }
    }

    private func updateCoverUrl() async {
        guard let playlistId = playlistId else { return }
        showEditCoverSheet = false
        do {
            let val = newCoverUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            let body = UpdatePlaylistRequest(name: nil, coverUrl: val.isEmpty ? nil : val)
            let response: ServerPlaylistResponse = try await APIClient.shared.put(
                path: "/api/playlists/\(playlistId)",
                body: body
            )
            await MainActor.run {
                self.coverUrl = response.playlist.coverUrl
                onPlaylistUpdated?()
            }
        } catch {
            print("[PlaylistDetailView] Failed to update cover URL:", error)
        }
    }

    private func deletePlaylist() async {
        guard let playlistId = playlistId else { return }
        do {
            let _: DeleteResponse = try await APIClient.shared.delete(
                path: "/api/playlists/\(playlistId)"
            )
            await MainActor.run {
                onPlaylistDeleted?()
            }
        } catch {
            print("[PlaylistDetailView] Failed to delete playlist:", error)
        }
    }

    // MARK: - Background auto-resolution

    /// Resolves every unmatched track to a playable YouTube source, one at a time,
    /// updating each row in place so the progress bar advances live. Throttled to
    /// avoid hammering the resolve endpoint. Idempotent — a no-op if already running
    /// or if nothing needs resolving.
    private func startAutoResolve() {
        guard !isAutoResolving else { return }
        guard hasUnmatched else { return }

        isAutoResolving = true
        autoResolveTask = Task {
            defer { Task { @MainActor in isAutoResolving = false } }

            // Snapshot the trackIds that still need resolving.
            let pending = tracks.filter { !$0.isMatched }.map { $0.trackId }

            for trackId in pending {
                if Task.isCancelled { break }
                // Look the track up fresh each iteration — it may have changed.
                guard let track = tracks.first(where: { $0.trackId == trackId }),
                      !track.isMatched else { continue }

                await resolveOne(track)

                // Gentle throttle between resolve calls.
                try? await Task.sleep(nanoseconds: 300_000_000)
            }
        }
    }

    /// Resolves a single track and patches it into `tracks` in place (preserving row
    /// identity so hover/scroll state survives). Used by the auto-resolve loop.
    private func resolveOne(_ track: PlaylistTrack) async {
        await MainActor.run { _ = resolvingTrackIDs.insert(track.trackId) }
        defer { Task { @MainActor in _ = resolvingTrackIDs.remove(track.trackId) } }

        do {
            let body = ResolveRequest(
                trackId: track.trackId,
                songId: track.songId,
                title: track.title,
                artist: track.artist
            )
            let response: ResolveResponse = try await APIClient.shared.post(
                path: "/api/bridge/resolve",
                body: body
            )
            if response.ok, let ytId = response.youtubeId, !ytId.isEmpty {
                await MainActor.run {
                    if let idx = tracks.firstIndex(where: { $0.trackId == track.trackId }) {
                        tracks[idx].youtubeId = ytId
                        tracks[idx].isMatched = true
                        if let thumb = response.thumbnail, let url = URL(string: thumb),
                           tracks[idx].artworkURL == nil {
                            tracks[idx].artworkURL = url
                        }
                    }
                }
            }
        } catch {
            print("[PlaylistDetailView] Auto-resolve failed for \(track.title):", error)
        }
    }

    private func resolveTrackManually(_ track: PlaylistTrack) async {
        await MainActor.run {
            _ = resolvingTrackIDs.insert(track.trackId)
        }
        defer {
            Task { @MainActor in
                _ = resolvingTrackIDs.remove(track.trackId)
            }
        }
        
        do {
            let body = ResolveRequest(
                trackId: track.trackId,
                songId: track.songId,
                title: track.title,
                artist: track.artist
            )
            let response: ResolveResponse = try await APIClient.shared.post(
                path: "/api/bridge/resolve",
                body: body
            )
            if response.ok {
                // Reload playlist tracks so the updated matching checkmark state pulls from server
                if let playlistId = playlistId {
                    await loadPlaylistTracks(id: playlistId)
                }
            }
        } catch {
            print("[PlaylistDetailView] Failed to resolve track manually:", error)
        }
    }
}

struct SpinningIcon: View {
    @State private var isAnimating = false
    
    var body: some View {
        Image(systemName: "arrow.triangle.2.circlepath")
            .font(.system(size: 11))
            .foregroundColor(.blue)
            .rotationEffect(Angle(degrees: isAnimating ? 360 : 0))
            .onAppear {
                withAnimation(.linear(duration: 1.0).repeatForever(autoreverses: false)) {
                    isAnimating = true
                }
            }
    }
}

#Preview {
    PlaylistDetailView(playlistId: nil, playlistTitle: "My Playlist")
        .preferredColorScheme(.dark)
}
