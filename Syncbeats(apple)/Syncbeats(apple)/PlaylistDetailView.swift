import SwiftUI

struct PlaylistTrack: Identifiable {
    let id = UUID()
    let index: Int
    let title: String
    let artist: String
    let duration: String
    let isMatched: Bool
}

struct PlaylistDetailView: View {
    let playlistId: String?
    let playlistTitle: String
    
    @Environment(\.colorScheme) var scheme
    @State private var hoveredTrackID: UUID? = nil
    @State private var isImporting = false
    @State private var importProgress: CGFloat = 0.0
    @State private var tracks: [PlaylistTrack] = []
    
    let mockTracks = [
        PlaylistTrack(index: 1, title: "Starboy", artist: "The Weeknd", duration: "3:50", isMatched: true),
        PlaylistTrack(index: 2, title: "Blinding Lights", artist: "The Weeknd", duration: "3:20", isMatched: true),
        PlaylistTrack(index: 3, title: "Nikes", artist: "Frank Ocean", duration: "5:14", isMatched: true),
        PlaylistTrack(index: 4, title: "Ivy", artist: "Frank Ocean", duration: "4:09", isMatched: true),
        PlaylistTrack(index: 5, title: "Solo", artist: "Frank Ocean", duration: "4:02", isMatched: false),
        PlaylistTrack(index: 6, title: "Self Control", artist: "Frank Ocean", duration: "4:09", isMatched: false)
    ]
    
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
    }
    struct ServerSongDetail: Codable {
        let id: String
        let title: String
        let artist: String
        let duration: Double?
        let resolvedAt: String?
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            
            // Hero Playlist Card
            HStack(spacing: Theme.Spacing.containerPadding) {
                // Large Artwork
                RoundedRectangle(cornerRadius: Theme.Radius.card)
                    .fill(LinearGradient(colors: [Color.gray, Color.black], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 140, height: 140)
                    .overlay(
                        Image(systemName: "music.note.list")
                            .font(.system(size: 40))
                            .foregroundColor(.white)
                    )
                    .glassCard()
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("PLAYLIST")
                        .font(Theme.Fonts.mono(size: 10))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    Text(playlistTitle)
                        .font(Theme.Fonts.headline(size: 28))
                        .foregroundColor(scheme == .dark ? .white : .black)
                    
                    Text("Selected high-performance driving tracks, synced natively.")
                        .font(Theme.Fonts.body())
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    HStack(spacing: Theme.Spacing.rowGap) {
                        Button(action: {}) {
                            HStack {
                                Image(systemName: "play.fill")
                                Text("Play")
                            }
                        }
                        .buttonStyle(MonochromePrimaryButtonStyle())
                        
                        Button(action: {
                            isImporting.toggle()
                            if isImporting {
                                importProgress = 0.0
                                withAnimation(.linear(duration: 3.0)) {
                                    importProgress = 1.0
                                }
                            }
                        }) {
                            HStack {
                                Image(systemName: "arrow.down.doc.fill")
                                Text(isImporting ? "Importing..." : "Sync Spotify")
                            }
                        }
                        .buttonStyle(MonochromeSecondaryButtonStyle())
                    }
                    .padding(.top, 8)
                }
                
                Spacer()
            }
            .padding(.top, Theme.Spacing.containerPadding)
            
            // Spotify Import Loading Indicator / Skeleton State
            if isImporting {
                VStack(alignment: .leading, spacing: Theme.Spacing.base) {
                    Text("MATCHING TRACKS VIA SPOTIFY INTEGRATION...")
                        .font(Theme.Fonts.mono(size: 9))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    
                    GeometryReader { geo in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(scheme == .dark ? Color.white.opacity(0.12) : Color.black.opacity(0.06))
                            .overlay(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Theme.Colors.primaryAccent(for: scheme))
                                    .frame(width: geo.size.width * importProgress)
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
                        HStack(spacing: Theme.Spacing.rowGap) {
                            Text("\(track.index)")
                                .font(Theme.Fonts.mono())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(width: 24, alignment: .leading)
                            
                            // Matched / Unmatched indicator icon
                            Image(systemName: track.isMatched ? "checkmark.circle.fill" : "circle.dotted")
                                .foregroundColor(track.isMatched ? .green : Theme.Colors.textMuted(for: scheme))
                            
                            VStack(alignment: .leading, spacing: 2) {
                                Text(track.title)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(scheme == .dark ? .white : .black)
                                
                                if !track.isMatched {
                                    Text("Unmatched from Spotify library - click to resolve manually")
                                        .font(.system(size: 10))
                                        .foregroundColor(.red)
                                }
                            }
                            
                            Spacer()
                            
                            Text(track.artist)
                                .font(Theme.Fonts.body())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                            
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
                        .onHover { isHovered in
                            if isHovered {
                                hoveredTrackID = track.id
                            } else if hoveredTrackID == track.id {
                                hoveredTrackID = nil
                            }
                        }
                    }
                    
                    // Skeleton import rows if importing
                    if isImporting && importProgress < 0.9 {
                        ForEach(0..<2, id: \.self) { i in
                            HStack(spacing: Theme.Spacing.rowGap) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                                    .frame(width: 24, height: 16)
                                
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                                    .frame(width: 140, height: 16)
                                
                                Spacer()
                                
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(scheme == .dark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                                    .frame(width: 80, height: 16)
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, Theme.Spacing.rowGap)
                            .opacity(0.5)
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .onAppear {
            if tracks.isEmpty {
                tracks = mockTracks
                if let playlistId = playlistId {
                    Task {
                        await loadPlaylistTracks(id: playlistId)
                    }
                }
            }
        }
    }
    
    private func loadPlaylistTracks(id: String) async {
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
                    index: pt.position + 1,
                    title: title,
                    artist: artist,
                    duration: durStr,
                    isMatched: matched
                )
            }
            if !mapped.isEmpty {
                await MainActor.run {
                    self.tracks = mapped
                }
            }
        } catch {
            print("[PlaylistDetailView] Failed to load tracks:", error)
        }
    }
}

#Preview {
    PlaylistDetailView(playlistId: "preview-id", playlistTitle: "Roadtrip Playlist")
        .preferredColorScheme(.dark)
}
