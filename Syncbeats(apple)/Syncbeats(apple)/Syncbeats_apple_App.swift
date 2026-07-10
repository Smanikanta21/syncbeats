import SwiftUI

@main
struct Syncbeats_apple_App: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        Window("Syncbeats", id: "main") {
            ContentView()
                .onOpenURL { url in
                    AuthManager.shared.handleDeepLink(url)
                }
        }
    }
}
