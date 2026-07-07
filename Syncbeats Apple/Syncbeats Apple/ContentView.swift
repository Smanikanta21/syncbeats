import SwiftUI

enum SidebarItem: Hashable {
    case listenNow
    case browse
    case allPlaylists
    case songs
    case albums
}

struct ContentView: View {
    @EnvironmentObject var socketManager: SocketManager
    @EnvironmentObject var multipeerManager: MultipeerManager
    @EnvironmentObject var audioEngine: AudioEngine
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var youtubeManager: YoutubeManager
    
    @State private var selectedItem: SidebarItem? = .listenNow

    var body: some View {
        NavigationSplitView {
            List(selection: $selectedItem) {
                Section("Library") {
                    Label("Listen Now", systemImage: "play.circle")
                        .tag(SidebarItem.listenNow)
                    Label("Browse", systemImage: "square.grid.2x2")
                        .tag(SidebarItem.browse)
                }
                
                Section("Playlists") {
                    Label("All Playlists", systemImage: "music.note.list")
                        .tag(SidebarItem.allPlaylists)
                }
                
                Section("Your Music") {
                    Label("Songs", systemImage: "music.note")
                        .tag(SidebarItem.songs)
                    Label("Albums", systemImage: "square.stack")
                        .tag(SidebarItem.albums)
                }
            }
            .listStyle(SidebarListStyle())
            .frame(minWidth: 200)
            
            // Bottom Profile / Settings button could go here
            VStack {
                Spacer()
                Divider()
                HStack {
                    Image(systemName: "person.crop.circle.fill")
                        .resizable()
                        .frame(width: 30, height: 30)
                        .foregroundColor(.gray)
                    Text(NetworkManager.shared.userName ?? "User")
                        .font(.headline)
                    Spacer()
                    Button(action: {
                        NetworkManager.shared.logout()
                        appState.currentScreen = .intro
                    }) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                    .buttonStyle(.plain)
                    .help("Logout")
                }
                .padding()
            }
            
        } detail: {
            switch selectedItem {
            case .listenNow:
                RoomView()
            case .browse:
                if youtubeManager.isAuthenticated {
                    List {
                        ForEach(youtubeManager.playlists) { playlist in
                            HStack {
                                AsyncImage(url: URL(string: playlist.thumbnail ?? "")) { image in
                                    image.resizable().aspectRatio(contentMode: .fill)
                                } placeholder: {
                                    Color.gray
                                }
                                .frame(width: 40, height: 40)
                                .cornerRadius(4)
                                
                                VStack(alignment: .leading) {
                                    Text(playlist.title)
                                        .font(.headline)
                                    if let count = playlist.itemCount {
                                        Text("\(count) tracks")
                                            .font(.subheadline)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .navigationTitle("Your YouTube Library")
                    .toolbar {
                        ToolbarItem(placement: .primaryAction) {
                            Button("Sign Out") {
                                youtubeManager.signOut()
                            }
                        }
                    }
                } else {
                    VStack(spacing: 20) {
                        Image(systemName: "play.rectangle.fill")
                            .font(.system(size: 60))
                            .foregroundColor(.red)
                        Text("Connect YouTube Music")
                            .font(.title)
                            .fontWeight(.bold)
                        Text("Sync your personal playlists and liked songs directly from YouTube.")
                            .foregroundColor(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                        
                        Button(action: {
                            youtubeManager.signIn()
                        }) {
                            Text("Sign in with Google")
                                .fontWeight(.bold)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(Color.red)
                                .foregroundColor(.white)
                                .cornerRadius(8)
                        }
                        .buttonStyle(PlainButtonStyle())
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            case .allPlaylists:
                Text("Playlists (Coming Soon)")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
            case .songs:
                Text("Songs (Coming Soon)")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
            case .albums:
                Text("Albums (Coming Soon)")
                    .font(.largeTitle)
                    .foregroundColor(.secondary)
            case nil:
                Text("Select an item from the sidebar")
                    .foregroundColor(.secondary)
            }
        }
        .navigationSplitViewStyle(.balanced)
        // This removes the blank space at the very top of the window
        .toolbar(.hidden, for: .windowToolbar)
        .onAppear {
            socketManager.connect()
            multipeerManager.start()
        }
        .onDisappear {
            socketManager.disconnect()
            multipeerManager.stop()
        }
    }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(SocketManager())
            .environmentObject(MultipeerManager())
            .environmentObject(AudioEngine())
            .environmentObject(AppState())
    }
}
