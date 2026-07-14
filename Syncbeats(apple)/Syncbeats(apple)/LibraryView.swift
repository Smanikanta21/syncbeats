import SwiftUI

struct LibraryView: View {
    @StateObject private var yt = YouTubeService.shared
    @ObservedObject private var auth = AuthManager.shared
    
    @Binding var showJoinModal: Bool
    
    @State private var showPrivacyModal = false
    @State private var searchQuery = ""
    @State private var hoveredTrackId: String? = nil
    
    @State private var selectedPlaylist: YouTubeService.Playlist? = nil
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Search Bar
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)
                    TextField("Search YouTube...", text: $searchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 20))
                        .foregroundColor(.white)
                        .onSubmit {
                            if !searchQuery.contains("spotify.com/playlist/") {
                                Task {
                                    yt.logSearch(query: searchQuery)
                                    await yt.search(query: searchQuery)
                                }
                            }
                        }
                    
                    if !searchQuery.isEmpty {
                        Button(action: {
                            searchQuery = ""
                            yt.searchResults = []
                        }) {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
                .background(.ultraThinMaterial)
                .cornerRadius(16)
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.primary.opacity(0.1), lineWidth: 1))
                .padding(.horizontal)
                
                Text(searchQuery.isEmpty ? "Your Library" : "Search Results")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal)
                
                if let playlist = selectedPlaylist {
                    PlaylistDetailsView(playlist: playlist, selectedPlaylist: $selectedPlaylist, showJoinModal: $showJoinModal)
                } else if !searchQuery.isEmpty {
                    if searchQuery.contains("spotify.com/playlist/") {
                        SpotifyImportView(playlistUrl: searchQuery, showJoinModal: $showJoinModal, searchQuery: $searchQuery)
                    } else if yt.isLoading {
                        ProgressView()
                            .padding()
                    } else if yt.searchResults.isEmpty {
                        Text("No results found.")
                            .foregroundColor(.gray)
                            .padding()
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 24)], spacing: 32) {
                            ForEach(yt.searchResults) { track in
                                TrackCard(track: track, hoveredTrackId: $hoveredTrackId)
                            }
                        }
                        .padding(.horizontal)
                    }
                } else {
                    if yt.isLoading {
                        ProgressView()
                            .padding()
                    } else {
                        VStack(alignment: .leading, spacing: 32) {
                            if !yt.recentHistory.isEmpty {
                                VStack(alignment: .leading, spacing: 16) {
                                    Text("Listen History")
                                        .font(.title2.bold())
                                        .foregroundColor(.white)
                                        .padding(.horizontal)
                                    
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 20) {
                                            ForEach(yt.recentHistory) { track in
                                                TrackCard(track: track, hoveredTrackId: $hoveredTrackId)
                                            }
                                        }
                                        .padding(.horizontal)
                                        .padding(.bottom, 20)
                                    }
                                }
                            }
                            
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Playlists")
                                    .font(.title2.bold())
                                    .foregroundColor(.white)
                                    .padding(.horizontal)
                                
                                if yt.personalPlaylists.isEmpty {
                                    Text("No playlists found.")
                                        .foregroundColor(.gray)
                                        .padding(.horizontal)
                                } else {
                                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 24)], spacing: 32) {
                                        ForEach(yt.personalPlaylists) { playlist in
                                            PlaylistCard(playlist: playlist, showJoinModal: $showJoinModal, selectedPlaylist: $selectedPlaylist)
                                        }
                                    }
                                    .padding(.horizontal)
                                }
                            }
                        }
                    }
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 100) // Space for floating button
        }
        .onAppear {
            Task {
                await yt.fetchRecentHistory()
                if yt.personalPlaylists.isEmpty {
                    await yt.fetchLibrary()
                }
            }
        }
        .sheet(isPresented: $showPrivacyModal) {
            YouTubePrivacyModal(isPresented: $showPrivacyModal)
        }
    }
}

struct PlaylistCard: View {
    let playlist: YouTubeService.Playlist
    @Binding var showJoinModal: Bool
    @Binding var selectedPlaylist: YouTubeService.Playlist?
    
    @State private var isHovered = false
    @State private var isQueuing = false
    @State private var showEditModal = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                Rectangle()
                    .fill(Color.white.opacity(0.05))
                    .aspectRatio(1, contentMode: .fit)
                    .cornerRadius(16)
                
                if let thumb = playlist.thumbnail, let url = URL(string: thumb) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().aspectRatio(contentMode: .fill)
                        }
                    }
                }
                
                // Play overlay on hover
                if isHovered {
                    Color.black.opacity(0.4)
                    Image(systemName: "play.circle.fill")
                        .font(.system(size: 48))
                        .foregroundColor(Color(red: 0.0, green: 1.0, blue: 0.7))
                        .shadow(radius: 10)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: .black.opacity(isHovered ? 0.6 : 0.2), radius: isHovered ? 16 : 8, x: 0, y: isHovered ? 8 : 4)
            .scaleEffect(isHovered ? 1.05 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isHovered)
            .onHover { hovering in
                isHovered = hovering
            }
            
            Text(playlist.title)
                .font(.headline)
                .foregroundColor(.white)
                .lineLimit(1)
            
            if let count = playlist.itemCount {
                Text("\(count) tracks")
                    .font(.subheadline)
                    .foregroundColor(.gray)
            }
        }
        .padding(.bottom, 8)
        .overlay(
            Group {
                if isQueuing {
                    ZStack {
                        Color.black.opacity(0.6)
                            .cornerRadius(16)
                        ProgressView()
                            .tint(.white)
                    }
                }
            }
        )
        .onTapGesture {
            selectedPlaylist = playlist
        }
        .contextMenu {
            Button("Edit Playlist") {
                showEditModal = true
            }
            Button("Delete Playlist", role: .destructive) {
                Task {
                    do {
                        try await YouTubeService.shared.deletePlaylist(id: playlist.id)
                    } catch {
                        print("Failed to delete playlist: \(error)")
                    }
                }
            }
        }
        .sheet(isPresented: $showEditModal) {
            EditPlaylistModal(playlist: playlist, isPresented: $showEditModal)
        }
    }
}

struct YouTubePrivacyModal: View {
    @Binding var isPresented: Bool
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "hand.raised.fill")
                .font(.system(size: 48))
                .foregroundColor(Color(red: 1.0, green: 0.24, blue: 0.44)) // Pink
            
            Text("Privacy First")
                .font(.title.bold())
                .foregroundColor(.primary)
            
            Text("SyncBeats respects your privacy. We DO NOT read, store, or sell your YouTube data. Your playlists and liked videos are fetched directly from Google's servers to your Mac. All playback is handled completely locally within the application.")
                .multilineTextAlignment(.center)
                .foregroundColor(.gray)
            
            HStack(spacing: 16) {
                Button(action: {
                    isPresented = false
                }) {
                    Text("Cancel")
                        .fontWeight(.semibold)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .background(Color.secondary.opacity(0.2))
                .cornerRadius(8)
                
                Button(action: {
                    isPresented = false
                    if let url = URL(string: "\(Config.backendURL)/youtube/auth?redirect=syncbeats%3A%2F%2Fauth") {
                        NSWorkspace.shared.open(url)
                    }
                }) {
                    Text("Agree & Continue")
                        .fontWeight(.semibold)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .background(Color.primary)
                .foregroundColor(Color(NSColor.windowBackgroundColor))
                .cornerRadius(8)
            }
        }
        .padding(32)
        .frame(width: 400)
        .background(.ultraThinMaterial)
        .cornerRadius(24)
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.primary.opacity(0.1), lineWidth: 1))
        .shadow(color: .black.opacity(0.2), radius: 20, y: 10)
    }
}

// MARK: - Spotify Import View
struct SpotifyImportView: View {
    let playlistUrl: String
    @Binding var showJoinModal: Bool
    @Binding var searchQuery: String
    
    @StateObject private var spotify = SpotifyService.shared
    @StateObject private var socket = SocketService.shared
    @StateObject private var yt = YouTubeService.shared
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "music.note.list")
                .font(.system(size: 48))
                .foregroundColor(Color(red: 0.11, green: 0.84, blue: 0.37)) // Spotify Green
            
            Text("Spotify Playlist Detected")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            Text("You can import this playlist to your SyncBeats library or queue all its tracks to your active room.")
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)
            
            if spotify.isImporting {
                ProgressView("Importing and Queueing...")
                    .padding()
            } else {
                Button(action: {
                    if let roomId = socket.currentRoom?.roomId {
                        Task {
                            await spotify.importAndEnqueuePlaylist(url: playlistUrl, roomId: roomId)
                            searchQuery = ""
                        }
                    } else {
                        Task {
                            do {
                                spotify.isImporting = true
                                _ = try await spotify.importPlaylist(url: playlistUrl)
                                await yt.fetchLibrary()
                                spotify.isImporting = false
                                searchQuery = "" // Clear search to render the library view
                            } catch {
                                print("Failed to import playlist: \(error)")
                                spotify.isImporting = false
                            }
                        }
                    }
                }) {
                    Text(socket.currentRoom == nil ? "Import to Library" : "Import & Queue Playlist")
                        .fontWeight(.bold)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.11, green: 0.84, blue: 0.37))
                .foregroundColor(.black)
            }
            
            if let error = spotify.importError {
                Text(error)
                    .foregroundColor(.red)
                    .padding()
            }
        }
        .padding(.top, 40)
    }
}


struct PlaylistDetailsView: View {
    let playlist: YouTubeService.Playlist
    @Binding var selectedPlaylist: YouTubeService.Playlist?
    @Binding var showJoinModal: Bool
    
    @StateObject private var yt = YouTubeService.shared
    @StateObject private var socket = SocketService.shared
    
    @State private var hoveredTrackId: String? = nil
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header
                HStack(alignment: .top, spacing: 24) {
                    Button(action: {
                        selectedPlaylist = nil
                    }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                            .padding()
                            .background(Color.white.opacity(0.1))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    
                    if let thumb = playlist.thumbnail, let url = URL(string: thumb) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image {
                                image.resizable().aspectRatio(contentMode: .fill)
                            } else {
                                Color.white.opacity(0.1)
                            }
                        }
                        .frame(width: 200, height: 200)
                        .cornerRadius(16)
                        .shadow(radius: 10)
                    }
                    
                    VStack(alignment: .leading, spacing: 12) {
                        Text(playlist.title)
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        
                        if let count = playlist.itemCount {
                            Text("\(count) tracks")
                                .font(.title3)
                                .foregroundColor(.gray)
                        }
                        
                        Spacer()
                        
                        Button(action: {
                            if let roomId = socket.currentRoom?.roomId {
                                Task {
                                    do {
                                        _ = try await SpotifyService.shared.enqueuePlaylist(roomId: roomId, playlistId: playlist.id)
                                    } catch {
                                        print("Failed to queue playlist: \(error)")
                                    }
                                }
                            } else {
                                showJoinModal = true
                            }
                        }) {
                            Text(socket.currentRoom == nil ? "Join Room to Queue" : "Queue Playlist")
                                .fontWeight(.bold)
                                .padding(.horizontal, 24)
                                .padding(.vertical, 12)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0.0, green: 1.0, blue: 0.7))
                        .foregroundColor(.black)
                    }
                    
                    Spacer()
                }
                .padding(.horizontal)
                
                if yt.isLoading {
                    ProgressView()
                        .padding()
                } else if yt.currentPlaylistTracks.isEmpty {
                    Text("No tracks found.")
                        .foregroundColor(.gray)
                        .padding()
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 24)], spacing: 32) {
                        ForEach(yt.currentPlaylistTracks) { track in
                            TrackCard(track: track, hoveredTrackId: $hoveredTrackId)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 100)
        }
        .onAppear {
            Task {
                await yt.fetchPlaylistItems(playlistId: playlist.id)
            }
        }
    }
}


struct EditPlaylistModal: View {
    let playlist: YouTubeService.Playlist
    @Binding var isPresented: Bool
    
    @StateObject private var yt = YouTubeService.shared
    
    @State private var name: String = ""
    @State private var coverUrl: String = ""
    
    @State private var isLoading = false
    @State private var isFetchingTracks = true
    
    var body: some View {
        VStack(spacing: 24) {
            Text("Edit Playlist")
                .font(.title2.bold())
                .foregroundColor(.white)
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Playlist Name")
                    .foregroundColor(.gray)
                TextField("Name", text: $name)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            
            VStack(alignment: .leading, spacing: 8) {
                Text("Cover Image URL")
                    .foregroundColor(.gray)
                TextField("URL", text: $coverUrl)
                    .textFieldStyle(RoundedBorderTextFieldStyle())
            }
            
            if isFetchingTracks {
                ProgressView("Loading tracks...")
                    .padding()
            } else {
                List {
                    ForEach(yt.currentPlaylistTracks) { track in
                        HStack {
                            if let thumb = track.thumbnail, let url = URL(string: thumb) {
                                AsyncImage(url: url) { phase in
                                    if let image = phase.image {
                                        image.resizable().aspectRatio(contentMode: .fill)
                                    } else {
                                        Color.gray
                                    }
                                }
                                .frame(width: 40, height: 40)
                                .cornerRadius(4)
                            }
                            
                            VStack(alignment: .leading) {
                                Text(track.title).foregroundColor(.white).lineLimit(1)
                                Text(track.artist).foregroundColor(.gray).font(.caption).lineLimit(1)
                            }
                            Spacer()
                            
                            Button(action: {
                                Task {
                                    do {
                                        try await yt.deletePlaylistTrack(playlistId: playlist.id, trackId: track.id)
                                    } catch {
                                        print("Failed to delete track: \(error)")
                                    }
                                }
                            }) {
                                Image(systemName: "minus.circle.fill")
                                    .foregroundColor(.red)
                                    .font(.title2)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Color.clear)
                    }
                }
                .listStyle(.plain)
                .frame(maxHeight: 250)
            }
            
            HStack(spacing: 16) {
                Button(action: {
                    Task {
                        do {
                            isLoading = true
                            try await yt.deletePlaylist(id: playlist.id)
                            isLoading = false
                            isPresented = false
                        } catch {
                            print("Failed to delete playlist: \(error)")
                            isLoading = false
                        }
                    }
                }) {
                    Text("Delete Playlist")
                        .foregroundColor(.red)
                }
                .buttonStyle(.plain)
                
                Spacer()
                
                Button("Cancel") {
                    isPresented = false
                }
                .buttonStyle(.plain)
                
                Button(action: {
                    Task {
                        isLoading = true
                        do {
                            try await yt.updatePlaylist(id: playlist.id, name: name, coverUrl: coverUrl)
                            isPresented = false
                        } catch {
                            print("Error updating playlist: \(error)")
                        }
                        isLoading = false
                    }
                }) {
                    if isLoading {
                        ProgressView().tint(.black)
                    } else {
                        Text("Save Changes")
                            .fontWeight(.bold)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.0, green: 1.0, blue: 0.7))
                .foregroundColor(.black)
            }
        }
        .padding()
        .frame(width: 500)
        .background(Color(red: 0.1, green: 0.1, blue: 0.12))
        .onAppear {
            name = playlist.title
            coverUrl = playlist.thumbnail ?? ""
            Task {
                isFetchingTracks = true
                await yt.fetchPlaylistItems(playlistId: playlist.id)
                isFetchingTracks = false
            }
        }
    }
}
