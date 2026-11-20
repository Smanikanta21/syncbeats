import SwiftUI

@main
struct SyncbeatsApp: App {
    init() {
        #if DEBUG
        SyncClock.selfCheck()
        #endif
        
        // Boot the audio engine so it starts listening to RoomManager
        _ = AudioEngine.shared
        #if os(macOS)
        _ = DeviceManager.shared
        #endif
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
            #if os(macOS)
                .frame(minWidth: 940, minHeight: 620)
            #endif
        }
        #if os(macOS)
        .windowToolbarStyle(.unified(showsTitle: false))
        .commands {
            CommandMenu("Playback") {
                Button("Play / Pause") { RoomManager.shared.togglePlayPause() }
                    .keyboardShortcut("p", modifiers: [.command])
                Button("Next Track") { RoomManager.shared.next() }
                    .keyboardShortcut(.rightArrow, modifiers: [.command])
                Button("Previous Track") { RoomManager.shared.previous() }
                    .keyboardShortcut(.leftArrow, modifiers: [.command])
                Divider()
                Button("Sign Out") { AuthManager.shared.logout() }
            }
        }
        #endif
    }
}
