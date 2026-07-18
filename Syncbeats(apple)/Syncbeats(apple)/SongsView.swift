import SwiftUI

struct SongItem: Identifiable {
    let id = UUID()
    let trackNumber: Int
    let title: String
    let artist: String
    let album: String
    let playlistSource: String
    let duration: String
    let artworkColor: Color
}

struct SongsView: View {
    @Environment(\.colorScheme) var scheme
    @State private var hoveredRowID: UUID? = nil
    @State private var songs: [SongItem] = []
    
    let mockSongs = [
        SongItem(trackNumber: 1, title: "Blinding Lights", artist: "The Weeknd", album: "After Hours", playlistSource: "Roadtrip", duration: "3:20", artworkColor: .red),
        SongItem(trackNumber: 2, title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", playlistSource: "Chill", duration: "4:03", artworkColor: .blue),
        SongItem(trackNumber: 3, title: "Starboy", artist: "The Weeknd", album: "Starboy", playlistSource: "Roadtrip", duration: "3:50", artworkColor: .purple),
        SongItem(trackNumber: 4, title: "Nikes", artist: "Frank Ocean", album: "Blonde", playlistSource: "Chill", duration: "5:14", artworkColor: .green),
        SongItem(trackNumber: 5, title: "Ivy", artist: "Frank Ocean", album: "Blonde", playlistSource: "Liked", duration: "4:09", artworkColor: .yellow),
        SongItem(trackNumber: 6, title: "Intro", artist: "The xx", album: "xx", playlistSource: "Chill", duration: "2:08", artworkColor: .gray)
    ]
    
    struct SearchResultItem: Codable {
        let title: String
        let uploaderName: String
        let duration: Double
        let thumbnail: String
    }
    
    struct SearchResponse: Codable {
        let results: [SearchResultItem]
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
            // Header Info & Controls
            HStack(alignment: .firstTextBaseline) {
                Text("Songs")
                    .font(Theme.Fonts.headline(size: 32))
                    .foregroundColor(scheme == .dark ? .white : .black)
                
                Spacer()
                
                HStack(spacing: Theme.Spacing.rowGap) {
                    Button(action: {}) {
                        HStack {
                            Image(systemName: "play.fill")
                            Text("Play All")
                        }
                    }
                    .buttonStyle(MonochromePrimaryButtonStyle())
                    
                    Button(action: {}) {
                        HStack {
                            Image(systemName: "shuffle")
                            Text("Shuffle")
                        }
                    }
                    .buttonStyle(MonochromeSecondaryButtonStyle())
                }
            }
            .padding(.top, Theme.Spacing.containerPadding)
            
            // Tabular Header Row
            HStack(spacing: 0) {
                Text("#")
                    .frame(width: 30, alignment: .leading)
                Text("Title")
                    .frame(minWidth: 200, maxWidth: .infinity, alignment: .leading)
                Text("Artist")
                    .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
                Text("Album")
                    .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
                Text("Source")
                    .frame(width: 120, alignment: .leading)
                Image(systemName: "clock")
                    .frame(width: 50, alignment: .trailing)
            }
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(Theme.Colors.textMuted(for: scheme))
            .padding(.horizontal, Theme.Spacing.rowGap)
            
            Divider()
                .background(Theme.Colors.glassBorder(for: scheme))
            
            // Songs List
            ScrollView(.vertical, showsIndicators: true) {
                LazyVStack(spacing: Theme.Spacing.base) {
                    ForEach(songs) { song in
                        HStack(spacing: 0) {
                            // Track Number
                            Text("\(song.trackNumber)")
                                .font(Theme.Fonts.mono())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(width: 30, alignment: .leading)
                            
                            // Title + Artwork
                            HStack(spacing: Theme.Spacing.rowGap) {
                                RoundedRectangle(cornerRadius: 4)
                                    .fill(song.artworkColor.opacity(0.8))
                                    .frame(width: 32, height: 32)
                                    .overlay(
                                        Image(systemName: "music.note")
                                            .font(.caption)
                                            .foregroundColor(.white)
                                    )
                                
                                Text(song.title)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(scheme == .dark ? .white : .black)
                            }
                            .frame(minWidth: 200, maxWidth: .infinity, alignment: .leading)
                            
                            // Artist
                            Text(song.artist)
                                .font(Theme.Fonts.body())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
                            
                            // Album
                            Text(song.album)
                                .font(Theme.Fonts.body())
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(minWidth: 150, maxWidth: .infinity, alignment: .leading)
                            
                            // Source Badge
                            HStack {
                                Text(song.playlistSource)
                                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                                    .foregroundColor(scheme == .dark ? .white : .black)
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
                        .onHover { isHovered in
                            if isHovered {
                                hoveredRowID = song.id
                            } else if hoveredRowID == song.id {
                                hoveredRowID = nil
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.containerPadding)
        .onAppear {
            if songs.isEmpty {
                songs = mockSongs
                Task {
                    await loadSongs()
                }
            }
        }
    }
    
    private func loadSongs() async {
        do {
            // Call local search route for tracks
            let response: SearchResponse = try await APIClient.shared.get(path: "/search/songs?q=all")
            let mapped = response.results.enumerated().map { (index, item) in
                let mins = Int(item.duration) / 60
                let secs = Int(item.duration) % 60
                let durStr = String(format: "%d:%02d", mins, secs)
                
                return SongItem(
                    trackNumber: index + 1,
                    title: item.title,
                    artist: item.uploaderName,
                    album: "Catalog",
                    playlistSource: "Library",
                    duration: durStr,
                    artworkColor: .gray
                )
            }
            if !mapped.isEmpty {
                await MainActor.run {
                    self.songs = mapped
                }
            }
        } catch {
            print("[SongsView] Network fetch failed, using beautiful defaults:", error)
        }
    }
}

#Preview {
    SongsView()
        .preferredColorScheme(.dark)
}
