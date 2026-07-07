import SwiftUI
import Combine

// Simple Router to manage application state
class AppState: ObservableObject {
    enum Screen {
        case intro
        case auth
        case main
    }
    
    @Published var currentScreen: Screen
    
    init() {
        if NetworkManager.shared.authToken != nil {
            self.currentScreen = .main
        } else {
            self.currentScreen = .intro
        }
    }
}

@main
struct Syncbeats_AppleApp: App {
    // Shared state managers
    @StateObject private var appState = AppState()
    @StateObject private var socketManager = SocketManager()
    @StateObject private var multipeerManager = MultipeerManager()
    @StateObject private var audioEngine = AudioEngine()
    @StateObject private var youtubeManager = YoutubeManager()

    var body: some Scene {
        WindowGroup {
            ZStack {
                // Ensure the background is clear so our custom SwiftUI background shows through
                Color.clear
                
                // Router Logic
                switch appState.currentScreen {
                case .intro:
                    IntroView()
                case .auth:
                    AuthView()
                case .main:
                    ContentView()
                }
            }
            .onAppear {
                NetworkManager.shared.verifySession { isValid in
                    if !isValid {
                        withAnimation {
                            appState.currentScreen = .intro
                        }
                    }
                }
            }
            .environmentObject(appState)
            .environmentObject(socketManager)
            .environmentObject(multipeerManager)
            .environmentObject(audioEngine)
            .environmentObject(youtubeManager)
            .frame(minWidth: 800, minHeight: 600)
            // Make the SwiftUI background reach the very edges of the window
            .edgesIgnoringSafeArea(.top) 
        }
        // macOS Borderless Glass Window Style
        .windowStyle(HiddenTitleBarWindowStyle())
        .commands {
            // Remove standard window commands if desired, though leaving them is fine
        }
    }
}
