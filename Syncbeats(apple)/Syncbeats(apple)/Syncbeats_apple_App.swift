import SwiftUI

@main
struct Syncbeats_apple_App: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var authStore = AuthStore()
    
    var body: some Scene {
        Window("Syncbeats", id: "main") {
            Group {
                switch authStore.state {
                case .loading:
                    ZStack {
                        Color.black.ignoresSafeArea()
                        ProgressView()
                            .controlSize(.large)
                    }
                    .frame(minWidth: 400, minHeight: 300)
                case .signedOut:
                    SignInView()
                        .environment(authStore)
                case .signedIn:
                    ContentView()
                        .environment(authStore)
                }
            }
        }
    }
}
