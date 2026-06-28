import SwiftUI

struct PlaylistDetailView: View {
    @ObservedObject var libraryManager = LibraryManager.shared
    @StateObject private var audioPlayer = AudioPlayerManager.shared
    
    let playlist: Playlist
    
    var body: some View {
        let tracks = libraryManager.getTracksForPlaylist(playlist)
        
        List {
            if tracks.isEmpty {
                Text("No songs in this playlist.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(tracks) { track in
                    Button(action: {
                        audioPlayer.play(url: URL(string: track.url)!, track: track)
                    }) {
                        HStack {
                            AsyncImage(url: URL(string: track.thumbnailURL)) { phase in
                                if let image = phase.image { image.resizable() } else { Color.gray }
                            }
                            .frame(width: 50, height: 50)
                            .cornerRadius(8)
                            
                            VStack(alignment: .leading) {
                                Text(track.title).font(.headline)
                                Text(track.artist).font(.subheadline).foregroundColor(.secondary)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                    .contextMenu {
                        Button(role: .destructive) {
                            libraryManager.removeTrackFromPlaylist(trackId: track.id, playlistId: playlist.id)
                        } label: {
                            Label("Remove from Playlist", systemImage: "trash")
                        }
                    }
                }
            }
        }
        .navigationTitle(playlist.name)
    }
}

#Preview {
    PlaylistDetailView(playlist: Playlist(id: "1", name: "My Playlist", trackIds: []))
}

