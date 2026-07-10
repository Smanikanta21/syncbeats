import SwiftUI

struct LibraryView: View {
    @StateObject private var yt = YouTubeService.shared
    @ObservedObject private var auth = AuthManager.shared
    
    @State private var showPrivacyModal = false
    @State private var searchQuery = ""
    @State private var hoveredTrackId: String? = nil
    
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
                            Task {
                                yt.logSearch(query: searchQuery)
                                await yt.search(query: searchQuery)
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
                
                if auth.ytToken == nil || yt.error != nil {
                    VStack(spacing: 16) {
                        Image(systemName: "lock.shield.fill")
                            .font(.system(size: 48))
                            .foregroundColor(.gray)
                        Text(auth.ytToken == nil ? "Connect YouTube" : "YouTube Session Expired")
                            .font(.title2.bold())
                            .foregroundColor(.white)
                        Text(auth.ytToken == nil ? "Link your YouTube account to view your Liked Videos and Playlists directly in SyncBeats." : "Your YouTube authentication has expired or is invalid. Please re-link your account.")
                            .foregroundColor(.gray)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 40)
                        
                        Button(auth.ytToken == nil ? "Link YouTube Account" : "Re-link YouTube Account") {
                            showPrivacyModal = true
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0.0, green: 1.0, blue: 0.7))
                        .foregroundColor(.black)
                    }
                    .padding(.top, 40)
                } else if yt.isLoading {
                    ProgressView()
                        .padding()
                } else if yt.personalPlaylists.isEmpty {
                    Text("No playlists found or not authenticated.")
                        .foregroundColor(.gray)
                        .padding()
                } else if !searchQuery.isEmpty {
                    if yt.searchResults.isEmpty {
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
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: 24)], spacing: 32) {
                        ForEach(yt.personalPlaylists) { playlist in
                            PlaylistCard(playlist: playlist)
                        }
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top, 24)
            .padding(.bottom, 100) // Space for floating button
        }
        .onAppear {
            Task {
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
    
    @State private var isHovered = false
    
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
