import SwiftUI

struct User: Codable, Equatable {
    let id: String
    let name: String
    let email: String
}

struct LoginResponse: Codable {
    let token: String
    let user: User
}

/// Shape returned by `GET /auth/me` and the other `AuthResult` endpoints:
/// `{ user, token, device, needsDeviceRename }`. We only need `user` here.
struct MeResponse: Codable {
    let user: User
    let token: String?
}

enum AuthState: Equatable {
    case loading
    case signedOut
    case signedIn(User)
}

/// A typed, user-presentable outcome for an auth attempt.
/// The server encodes special situations as prefixed error strings
/// (e.g. `UNVERIFIED_EMAIL:` / `GOOGLE_AUTH_SETUP_PASSWORD:`); we decode
/// them here so the UI can react instead of dumping a raw JSON blob.
enum AuthError: Equatable {
    case message(String)          // generic, show as-is
    case unverifiedEmail(String)  // server re-sent a verification link
    case googleAccount(String)    // email belongs to a Google account
    case network                  // could not reach the server

    var displayText: String {
        switch self {
        case .message(let m):        return m
        case .unverifiedEmail(let m): return m
        case .googleAccount(let m):   return m
        case .network:               return "Couldn’t reach SyncBeats. Check your connection and try again."
        }
    }
}

@Observable
class AuthStore {
    var state: AuthState = .loading
    private let tokenKeychainKey = "dev.syncbeats.auth-token"

    init() {
        Task { await checkAuthStatus() }
    }

    // MARK: - Sign In (email + password)

    func login(email: String, password: String) async -> AuthError? {
        struct Body: Encodable { let email: String; let password: String }
        do {
            let response: LoginResponse = try await APIClient.shared.post(
                path: "/auth/login",
                body: Body(email: email.trimmed, password: password)
            )
            await finishSignIn(response)
            return nil
        } catch {
            return classify(error)
        }
    }

    // MARK: - Create Account
    //
    // NOTE: `/auth/register` does NOT return a token — it sends a verification
    // email. The caller should show a "check your inbox" state on success and
    // NOT expect the user to be signed in yet.

    func register(name: String, email: String, password: String) async -> AuthError? {
        struct Body: Encodable { let name: String; let email: String; let password: String }
        struct Ack: Decodable { let ok: Bool }
        do {
            let _: Ack = try await APIClient.shared.post(
                path: "/auth/register",
                body: Body(name: name.trimmed, email: email.trimmed, password: password)
            )
            return nil // success → verification email sent
        } catch {
            return classify(error)
        }
    }

    // MARK: - Sign in via website (Google, and any other web auth)
    //
    // Google rejects native custom-scheme OAuth for a Web client id, so instead
    // of talking to Google directly we tunnel through the SyncBeats website's
    // existing login. The site logs the user in (Google or otherwise) and
    // deep-links back to `syncbeats://auth?token=<jwt>`. We then fetch the user
    // via /auth/me. See WebAuthConnectService.

    func signInWithBrowser() async -> AuthError? {
        do {
            let token = try await WebAuthConnectService.shared.requestToken()
            try await completeTokenSignIn(token)
            return nil
        } catch let e as WebAuthError {
            if case .cancelled = e { return nil }
            return .message(e.displayText)
        } catch {
            return classify(error)
        }
    }

    /// Persist a JWT obtained out-of-band (browser handoff) and hydrate the user.
    private func completeTokenSignIn(_ token: String) async throws {
        saveToken(token)
        APIClient.shared.setAuthToken(token)
        let response: MeResponse = try await APIClient.shared.get(path: "/auth/me")
        await MainActor.run { self.state = .signedIn(response.user) }
    }

    // MARK: - Resend verification

    func resendVerification(email: String) async -> Bool {
        struct Body: Encodable { let email: String }
        do {
            try await APIClient.shared.postNoResponse(
                path: "/auth/verification/resend",
                body: Body(email: email.trimmed)
            )
            return true
        } catch {
            return false
        }
    }

    // MARK: - Session lifecycle

    func logout() {
        deleteToken()
        APIClient.shared.setAuthToken(nil)
        state = .signedOut
    }

    private func finishSignIn(_ response: LoginResponse) async {
        saveToken(response.token)
        APIClient.shared.setAuthToken(response.token)
        await MainActor.run { self.state = .signedIn(response.user) }
    }

    private func checkAuthStatus() async {
        guard let savedToken = loadToken() else {
            await MainActor.run { self.state = .signedOut }
            return
        }
        APIClient.shared.setAuthToken(savedToken)
        do {
            // /auth/me returns { user, token, device, needsDeviceRename } —
            // NOT a bare User. Decode the wrapper and pull out `user`.
            let response: MeResponse = try await APIClient.shared.get(path: "/auth/me")
            await MainActor.run { self.state = .signedIn(response.user) }
        } catch {
            print("[AuthStore] Token verification failed, signing out:", error)
            logout()
        }
    }

    // MARK: - Error decoding

    /// Turn an `APIError` into a typed, presentable `AuthError`.
    /// The HTTP body is `{ "error": "<message>" }`; some messages carry a
    /// machine prefix the server uses to signal a specific recovery path.
    private func classify(_ error: Error) -> AuthError {
        guard case let APIError.httpError(_, body) = error else {
            return .network
        }
        let message = Self.extractServerMessage(body)

        if let stripped = Self.strip("UNVERIFIED_EMAIL:", from: message) {
            return .unverifiedEmail(stripped)
        }
        if let stripped = Self.strip("GOOGLE_AUTH_SETUP_PASSWORD:", from: message) {
            return .googleAccount(stripped)
        }
        return .message(message)
    }

    /// Extract the human `error` field from a `{ "error": "..." }` JSON body,
    /// falling back to the raw string if it isn't JSON.
    private static func extractServerMessage(_ body: String) -> String {
        if let data = body.data(using: .utf8),
           let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let msg = obj["error"] as? String {
            return msg
        }
        return body
    }

    private static func strip(_ prefix: String, from message: String) -> String? {
        guard message.hasPrefix(prefix) else { return nil }
        return String(message.dropFirst(prefix.count)).trimmed
    }

    // MARK: - Keychain

    private func saveToken(_ token: String) {
        Keychain.set(token, account: tokenKeychainKey)
    }

    private func loadToken() -> String? {
        Keychain.get(account: tokenKeychainKey)
    }

    private func deleteToken() {
        Keychain.delete(account: tokenKeychainKey)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
