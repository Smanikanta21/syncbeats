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
                            Label("Songs", systemImage: "music.note.list")
                        }
                        
                        NavigationLink(value: HubSelection.liked) {
                            Label("Liked", systemImage: "heart.fill")
                        }
                    }
                    
                    if !playlists.isEmpty {
                        Section(header: Text("PLAYLISTS").font(Theme.Fonts.mono(size: 9)).foregroundColor(Theme.Colors.textMuted(for: scheme))) {
                            ForEach(playlists) { playlist in
                                NavigationLink(value: HubSelection.playlist(id: playlist.id, name: playlist.title)) {
                                    Label(playlist.title, systemImage: "music.note")
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
                .padding(.bottom, 82) // Leave room for NowPlayingBar
                
                // Floating NowPlayingBar
                NowPlayingBar()
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

#Preview {
    HubSplitView()
        .environment(AuthStore())
        .preferredColorScheme(.dark)
}
