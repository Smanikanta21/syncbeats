import Foundation
import Combine
import AuthenticationServices

#if os(macOS)
import AppKit
#else
import UIKit
#endif

class ASWebAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = ASWebAuthPresentationContextProvider()
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if os(macOS)
        return NSApplication.shared.windows.first ?? ASPresentationAnchor()
        #else
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
        #endif
    }
}

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
    
    func authenticateWithWeb() async {
        // We open the web app to do the heavy OAuth lifting, and let it pass the JWT back.
        guard let url = URL(string: "https://syncbeats.in/login?returnTo=syncbeats://auth") else { return }
        
        await perform {
            let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "syncbeats") { callbackURL, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                        return
                    }
                    if let callbackURL = callbackURL {
                        continuation.resume(returning: callbackURL)
                    } else {
                        continuation.resume(throwing: APIError.unknown)
                    }
                }
                session.presentationContextProvider = ASWebAuthPresentationContextProvider.shared
                session.prefersEphemeralWebBrowserSession = false
                session.start()
            }
            
            guard let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false),
                  let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
                throw APIError.unknown
            }
            
            UserDefaults.standard.set(token, forKey: self.tokenKey)
            
            let user: User = try await APIClient.shared.request(path: "/auth/me", requiresAuth: true)
            self.currentUser = user
            self.isAuthenticated = true
            self.authError = nil
        }
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
    
    func checkEmail(email: String) async -> Bool? {
        struct CheckEmailResponse: Decodable { let exists: Bool }
        do {
            let body = try JSONEncoder().encode(["email": email])
            let res: CheckEmailResponse = try await APIClient.shared.request(path: "/auth/check-email", method: "POST", body: body)
            return res.exists
        } catch {
            return nil
        }
    }
}
