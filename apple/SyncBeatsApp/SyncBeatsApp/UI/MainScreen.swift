import SwiftUI

struct MainScreen: View {
    @StateObject private var socketManager = SocketManager.shared
    @StateObject private var audioPlayer = AudioPlayerManager.shared

    var body: some View {
        ZStack {
            // Main content
            TabView {

                
                NavigationView {
                    LibraryScreen()
                }
                .tabItem { Label("Library", systemImage: "music.note.list") }
                
                ProfileScreen()
                    .tabItem { Label("Profile", systemImage: "person.circle") }
            }
            
            // Dynamic Island overlay
            if DeviceHelper.hasDynamicIsland {
                DynamicIslandView()
            }
            
            // Mini Player for non-Dynamic Island devices
            if !DeviceHelper.hasDynamicIsland {
                VStack {
                    Spacer()
                    MiniPlayerView()
                        .padding(.bottom, 49) // Approximate tab bar height to sit exactly above it
                }
            }
        }
        .onAppear { socketManager.connect() }
        .alert(isPresented: .constant(socketManager.incomingPing != nil)) {
            Alert(
                title: Text("Ping Received"),
                message: Text(socketManager.incomingPing ?? ""),
                dismissButton: .default(Text("OK")) { socketManager.incomingPing = nil }
            )
        }
    }


}

#Preview {
    MainScreen()
        .environmentObject(AppState())
}
