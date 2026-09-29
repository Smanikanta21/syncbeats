import Foundation
import Combine

@MainActor
final class AuthManager: ObservableObject {
    static let shared = AuthManager()

    @Published private(set) var currentUser: User?
    @Published private(set) var isAuthenticated = false
    @Published private(set) var isRestoring = true
    @Published var isLoading = false
    @Published var authError: String?

    private let tokenKey = "sb_token"

    private init() {}

    /// A stored token proves nothing — it may be expired or from another server.
    /// Validate against /auth/me, which also gives us the user id that room:join
    /// and own-room resolution both need.
    func restoreSession() async {
        defer { isRestoring = false }
        guard UserDefaults.standard.string(forKey: tokenKey) != nil else {
            isAuthenticated = false
            return
        }

        do {
            let response: AuthResponse = try await APIClient.shared.request(path: "/auth/me", requiresAuth: true)
            apply(response)
        } catch let error as APIError where error.isUnauthorized {
            logout()
        } catch {
            // Server unreachable: keep the token, stay signed out for now rather
            // than dropping the user into a room that can't load.
            isAuthenticated = false
            authError = error.localizedDescription
        }
    }

    func login(email: String, password: String) async {
        await perform {
            let response: AuthResponse = try await APIClient.shared.request(
                path: "/auth/login",
                json: ["email": email, "password": password]
            )
            self.apply(response)
        }
    }

    func register(name: String, email: String, password: String) async -> Bool {
        await perform {
            let _: EmptyResponse = try await APIClient.shared.request(
                path: "/auth/register",
                json: ["name": name, "email": email, "password": password]
            )
        }
    }

    func forgotPassword(email: String) async -> Bool {
        await perform {
            let _: EmptyResponse = try await APIClient.shared.request(
                path: "/auth/password/forgot",
                json: ["email": email]
            )
        }
    }

    func resetPassword(email: String, otp: String, password: String) async -> Bool {
        await perform {
            let _: EmptyResponse = try await APIClient.shared.request(
                path: "/auth/password/reset",
                json: ["email": email, "otp": otp, "password": password]
            )
        }
    }

    func logout() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        currentUser = nil
        isAuthenticated = false
        RoomManager.shared.disconnect()
        #if os(macOS)
        NotchController.shared.detach()
        #endif
    }

    private func apply(_ response: AuthResponse) {
        UserDefaults.standard.set(response.token, forKey: tokenKey)
        currentUser = response.user
        isAuthenticated = true
        authError = nil
    }

    @discardableResult
    private func perform(_ work: @MainActor () async throws -> Void) async -> Bool {
        isLoading = true
        authError = nil
        defer { isLoading = false }
        do {
            try await work()
            return true
        } catch {
            authError = error.localizedDescription
            return false
        }
    }
}
