import SwiftUI

struct PlaylistItem: Identifiable, Hashable {
    let id: String
    let title: String
    let itemCount: Int
    let thumbnail: String
}

enum HubSelection: Hashable {
    case search
    case songs
    case playlists
    case liked
    case devices
    case settings
    case playlist(id: String, name: String)
}

struct HubSplitView: View {
    @Environment(AuthStore.self) var authStore
    @Environment(\.colorScheme) var scheme
    @State private var selection: HubSelection? = .songs
    @State private var playlists: [PlaylistItem] = []
    @State private var showQueue = false

    // MARK: - Server Response structs
    struct ServerPlaylistResponse: Codable {
        let playlists: [ServerPlaylistItem]
    }
    struct ServerPlaylistItem: Codable {
        let id: String
        let title: String
        let itemCount: Int
        let thumbnail: String
    }
    
    var body: some View {
        NavigationSplitView {
            
            // Sidebar
            VStack(alignment: .leading, spacing: Theme.Spacing.sectionGap) {
                
                // Brand Header with official logo lockup
                HStack(spacing: 8) {
                    // Logo Icon representation
                    RoundedRectangle(cornerRadius: 6)
                        .fill(LinearGradient(colors: [Color(white: 0.1), Color(white: 0.02)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 24, height: 24)
                        .overlay(
                            ZStack {
                                Circle().stroke(Color.white.opacity(0.8), lineWidth: 1.5).frame(width: 14)
                                HStack(spacing: 1.5) {
                                    RoundedRectangle(cornerRadius: 0.5).fill(Color.white).frame(width: 1.5, height: 8)
                                    RoundedRectangle(cornerRadius: 0.5).fill(Color.white).frame(width: 1.5, height: 12)
                                    RoundedRectangle(cornerRadius: 0.5).fill(Color.white).frame(width: 1.5, height: 6)
                                }
                            }
                        )
                    
                    // Wordmark
                    HStack(spacing: 0) {
                        Text("SYNC")
                            .font(.system(size: 13, weight: .black))
                            .foregroundColor(scheme == .dark ? .white : .black)
                            .tracking(-0.5)
                        Text("BEATS")
                            .font(.system(size: 13, weight: .black))
                            .foregroundColor(Color.gray)
                            .tracking(-0.5)
                    }
                }
                .padding(.leading, 12)
                .padding(.top, Theme.Spacing.containerPadding)
                
                // Navigation Links List
                List(selection: $selection) {
                    Section(header: Text("LIBRARY").font(Theme.Fonts.mono(size: 9)).foregroundColor(Theme.Colors.textMuted(for: scheme))) {
                        NavigationLink(value: HubSelection.search) {
                            Label("Search", systemImage: "magnifyingglass")
                        }
                        
                        NavigationLink(value: HubSelection.songs) {
                            Label("Songs", systemImage: "music.note")
                        }
                        
                        NavigationLink(value: HubSelection.liked) {
                            Label("Liked", systemImage: "heart.fill")
                        }
                    }
                    
                    if !playlists.isEmpty {
                        Section(header: Text("PLAYLISTS").font(Theme.Fonts.mono(size: 9)).foregroundColor(Theme.Colors.textMuted(for: scheme))) {
                            ForEach(playlists) { playlist in
                                NavigationLink(value: HubSelection.playlist(id: playlist.id, name: playlist.title)) {
                                    Label(playlist.title, systemImage: "music.note.list")
                                }
                            }
                        }
                    }
                    
                    Section(header: Text("SESSION").font(Theme.Fonts.mono(size: 9)).foregroundColor(Theme.Colors.textMuted(for: scheme))) {
                        NavigationLink(value: HubSelection.devices) {
                            Label("Devices", systemImage: "macmini")
                        }
                        
                        NavigationLink(value: HubSelection.settings) {
                            Label("Settings", systemImage: "gearshape.fill")
                        }
                    }
                }
                .listStyle(.sidebar)
            }
            .frame(minWidth: 180)
            
        } detail: {
            
            // Detail Area
            ZStack(alignment: .bottom) {
                // Background
                Theme.Colors.background(for: scheme)
                    .ignoresSafeArea()
                
                HStack(spacing: 0) {
                    // Content Views
                    Group {
                        switch selection {
                        case .search:
                            SearchView(onPlaylistImported: {
                                Task { await loadPlaylists() }
                            })
                        case .songs:
                            SongsView()
                        case .playlists:
                            if let first = playlists.first {
                                PlaylistDetailView(
                                    playlistId: first.id,
                                    playlistTitle: first.title,
                                    onPlaylistDeleted: {
                                        Task { await loadPlaylists() }
                                        selection = .songs
                                    },
                                    onPlaylistUpdated: {
                                        Task { await loadPlaylists() }
                                    }
                                )
                            } else {
                                PlaylistDetailView(playlistId: nil, playlistTitle: "Playlists")
                            }
                        case .liked:
                            SongsView()
                        case .playlist(let id, let name):
                            PlaylistDetailView(
                                playlistId: id,
                                playlistTitle: name,
                                onPlaylistDeleted: {
                                    Task { await loadPlaylists() }
                                    selection = .songs
                                },
                                onPlaylistUpdated: {
                                    Task { await loadPlaylists() }
                                }
                            )
                        case .devices:
                            DevicesView()
                        case .settings:
                            SettingsView()
                        case .none:
                            SongsView()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    
                    if showQueue {
                        QueueSidePanel(showQueue: $showQueue)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
                .padding(.bottom, 82) // Leave room for NowPlayingBar
                
                // Floating NowPlayingBar
                NowPlayingBar(showQueue: $showQueue)
                    .padding(.horizontal, Theme.Spacing.containerPadding)
                    .padding(.bottom, Theme.Spacing.rowGap)
            }
            .frame(minWidth: 600, minHeight: 450)
        }
        .frame(minWidth: 850, minHeight: 600)
        .onAppear {
            Task {
                await loadPlaylists()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: PlayerEngine.didStartPlayingNotification)) { _ in
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                showQueue = true
            }
        }
    }
    
    private func loadPlaylists() async {
        guard case let .signedIn(user) = authStore.state else { return }
        
        do {
            let response: ServerPlaylistResponse = try await APIClient.shared.get(path: "/youtube/library?userId=\(user.id)")
            let mapped = response.playlists.map { p in
                PlaylistItem(id: p.id, title: p.title, itemCount: p.itemCount, thumbnail: p.thumbnail)
            }
            await MainActor.run {
                self.playlists = mapped
            }
        } catch {
            print("[HubSplitView] Failed to load library playlists:", error)
        }
    }
}

// MARK: - Queue Side Panel UI
struct QueueSidePanel: View {
    @Environment(\.colorScheme) var scheme
    @Binding var showQueue: Bool
    @State private var engine = PlayerEngine.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Queue")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(scheme == .dark ? .white : .black)
                
                Spacer()
                
                Button(action: {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        showQueue = false
                    }
                }) {
                    Image(systemName: "sidebar.right")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.Colors.textMuted(for: scheme))
                }
                .buttonStyle(.plain)
                .help("Hide Queue")
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 12)
            
            Divider()
                .background(Theme.Colors.glassBorder(for: scheme))
            
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Now Playing Section
                    if let current = engine.current {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Now Playing")
                                .font(Theme.Fonts.mono(size: 9))
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                            
                            QueueRow(track: current, isPlaying: true, onRemove: {
                                removeTrack(current)
                            })
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 12)
                    }
                    
                    // Next Up Section
                    let nextTracks = Array(engine.queue.dropFirst(engine.index + 1))
                    if !nextTracks.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Next Up")
                                .font(Theme.Fonts.mono(size: 9))
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                            
                            ForEach(nextTracks.indices, id: \.self) { idx in
                                QueueRow(track: nextTracks[idx], isPlaying: false, onRemove: {
                                    removeTrack(nextTracks[idx])
                                })
                            }
                        }
                        .padding(.horizontal, 16)
                    } else {
                        VStack {
                            Spacer()
                            Text("End of Queue")
                                .font(Theme.Fonts.body(size: 11))
                                .foregroundColor(Theme.Colors.textMuted(for: scheme))
                                .frame(maxWidth: .infinity, alignment: .center)
                            Spacer()
                        }
                        .frame(height: 100)
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .frame(width: 260)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .fill(Theme.Colors.glassBorder(for: scheme))
                .frame(width: 1),
            alignment: .leading
        )
    }

    private func removeTrack(_ track: PlayableTrack) {
        let targetId = track.queueItemId ?? track.id
        if RoomSocket.shared.roomId != nil {
            RoomSocket.shared.removeFromQueue(itemId: targetId)
        } else {
            PlayerEngine.shared.removeFromLocalQueue(trackId: track.id)
        }
    }
}

struct QueueRow: View {
    @Environment(\.colorScheme) var scheme
    let track: PlayableTrack
    let isPlaying: Bool
    var onRemove: (() -> Void)? = nil
    @State private var isHovered = false
    
    var body: some View {
        HStack(spacing: 10) {
            // Artwork
            ZStack {
                if let url = track.artworkURL {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image.resizable().aspectRatio(contentMode: .fill)
                        default:
                            placeholder
                        }
                    }
                } else {
                    placeholder
                }
            }
            .frame(width: 32, height: 32)
            .cornerRadius(4)
            .clipped()
            
            // Details
            VStack(alignment: .leading, spacing: 2) {
                Text(track.title)
                    .font(.system(size: 12, weight: isPlaying ? .semibold : .regular))
                    .foregroundColor(isPlaying ? (scheme == .dark ? .white : .black) : .primary)
                    .lineLimit(1)
                
                Text(track.artist)
                    .font(.system(size: 10))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .lineLimit(1)
            }
            
            Spacer()

            if let onRemove = onRemove {
                Button(action: onRemove) {
                    Image(systemName: "minus.circle.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(isHovered ? .red : Theme.Colors.textMuted(for: scheme))
                }
                .buttonStyle(.plain)
                .help("Remove from Queue")
                .onHover { hovering in
                    isHovered = hovering
                }
            }
        }
        .padding(.vertical, 2)
    }
    
    private var placeholder: some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(scheme == .dark ? Color.white.opacity(0.1) : Color.black.opacity(0.06))
            .overlay(
                Image(systemName: "music.note")
                    .font(.system(size: 10))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
            )
    }
}

#Preview {
    HubSplitView()
        .environment(AuthStore())
        .preferredColorScheme(.dark)
}
