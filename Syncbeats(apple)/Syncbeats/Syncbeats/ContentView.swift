import SwiftUI

struct ContentView: View {
    @StateObject private var auth = AuthManager.shared
    @State private var roomId: String?
    @State private var roomError: String?
    @State private var isResolving = false

    var body: some View {
        Group {
            if auth.isRestoring {
                splash("Signing you in…")
            } else if !auth.isAuthenticated {
                LoginView()
            } else if let roomId {
                RoomView(roomId: roomId)
            } else if isResolving {
                splash("Opening your space…")
            } else {
                ContentUnavailableView {
                    Label("Couldn't open your room", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(roomError ?? "The server didn't return a room.")
                } actions: {
                    Button("Try Again") { Task { await resolveRoom() } }
                        .buttonStyle(.borderedProminent)
                    Button("Sign Out") { auth.logout() }
                }
            }
        }
        .task { await auth.restoreSession() }
        .onChange(of: auth.isAuthenticated) { _, signedIn in
            if signedIn {
                Task { await resolveRoom() }
            } else {
                roomId = nil
            }
        }
        .onChange(of: roomId) { _, newValue in
            #if os(macOS)
            if newValue != nil { NotchController.shared.attach() } else { NotchController.shared.detach() }
            #endif
        }
    }

    private func splash(_ message: String) -> some View {
        VStack(spacing: 14) {
            ProgressView()
            Text(message).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func resolveRoom() async {
        guard let userId = auth.currentUser?.id else {
            roomError = "Signed in, but the server didn't identify the account."
            return
        }
        isResolving = true
        roomError = nil
        defer { isResolving = false }

        do {
            roomId = try await RoomService.shared.resolveOwnRoom(hostUserId: userId)
        } catch {
            roomError = error.localizedDescription
        }
    }
}
