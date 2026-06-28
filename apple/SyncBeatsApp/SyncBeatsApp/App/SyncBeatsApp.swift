import SwiftUI

@main
struct SyncBeatsApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            Group {
                if appState.isAuthenticated {
                    MainScreen()
                        .statusBarHidden(true)
                } else {
                    AuthScreen()
                }
            }
            .environmentObject(appState)
        }
    }
}
