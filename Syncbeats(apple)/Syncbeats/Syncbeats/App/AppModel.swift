import Foundation
import Observation

enum EntryPhase { case launch, introduction, authentication, verification, restoring, restoreFailed, signedIn }
enum AccountMode: String, CaseIterable { case login, signup, forgot, reset }

struct RoomCredentials: Equatable {
    let roomID: String
    let userID: String
    let displayName: String
    let token: String
    let baseURL: URL
    let deviceID: String
}

@MainActor @Observable
final class AppModel {
    var phase: EntryPhase = .launch
    var accountMode: AccountMode = .login
    var introIndex = 0
    var account: Account?
    var roomID: String?
    var errorMessage: String?
    var notice: String?
    var email = ""
    var isWorking = false
    var isLoadingRoom = false
    var appearance: String { didSet { preferences.set(appearance, forKey: "native.appearance") } }
    var notchEnabled: Bool { didSet { preferences.set(notchEnabled, forKey: "native.notchEnabled") } }
    var roomCredentials: RoomCredentials? {
        guard let roomID, let account, let token else { return nil }
        return RoomCredentials(roomID: roomID, userID: account.id, displayName: account.name,
                               token: token, baseURL: api.baseURL, deviceID: api.deviceID)
    }

    private let preferences: UserDefaults
    private let api: AuthAPI
    private let store: any SessionPersisting
    private let google = GoogleSignIn()
    private var token: String?
    private var didStart = false
    private var launchFinished = false
    private var restorationFinished = false
    private var restorationError: Error?

    init(api: AuthAPI? = nil, store: (any SessionPersisting)? = nil, preferences: UserDefaults = .standard) {
        self.preferences = preferences
        let deviceID = preferences.string(forKey: "native.deviceID") ?? UUID().uuidString
        preferences.set(deviceID, forKey: "native.deviceID")
        let api = api ?? AuthAPI(deviceID: deviceID)
        self.api = api
        self.store = store ?? KeychainSessionStore(service: "SyncBeats.Native.Auth." + (api.baseURL.host ?? "production"))
        self.appearance = preferences.string(forKey: "native.appearance") ?? "dark"
        self.notchEnabled = preferences.object(forKey: "native.notchEnabled") as? Bool ?? true
    }

    func start() async {
        guard !didStart else { return }
        didStart = true
        NativeDiagnostics.started(endpoint: api.baseURL)
        await restoreSession()
    }

    func finishLaunch() {
        launchFinished = true
        routeAfterLaunch()
    }

    private func routeAfterLaunch() {
        guard launchFinished else { return }
        if !restorationFinished { phase = .restoring }
        else if restorationError != nil { phase = .restoreFailed }
        else if account != nil { phase = .signedIn }
        else { phase = preferences.bool(forKey: "native.introductionComplete") ? .authentication : .introduction }
    }

    func restoreSession() async {
        restorationFinished = false
        restorationError = nil
        if launchFinished { phase = .restoring }
        do {
            if let saved = try store.read() {
                token = saved
                do { try accept(try await api.me(token: saved)) }
                catch let failure as AuthFailure where failure.invalidatesSession {
                    try store.clear()
                    token = nil
                    account = nil
                }
            }
        } catch {
            NativeDiagnostics.failure("Auth", "Restore session", error: error)
            restorationError = error
            errorMessage = Self.message(for: error)
        }
        restorationFinished = true
        routeAfterLaunch()
        if account != nil { await loadRoom() }
    }

    func enterAccount(_ mode: AccountMode = .login) {
        preferences.set(true, forKey: "native.introductionComplete")
        accountMode = mode
        errorMessage = nil
        notice = nil
        phase = .authentication
    }

    func showIntroduction() { introIndex = 0; errorMessage = nil; phase = .introduction }

    static func normalizedEmail(_ raw: String) throws -> String {
        let email = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard email.count <= 254, email.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil else {
            throw AuthFailure.invalidInput("Enter a valid email address.")
        }
        return email
    }

    func submit(name: String, email rawEmail: String, password: String, otp: String = "") async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        errorMessage = nil
        notice = nil
        defer { isWorking = false }
        do {
            email = try Self.normalizedEmail(rawEmail)
            switch accountMode {
            case .login:
                guard !password.isEmpty, password.count <= 128 else { throw AuthFailure.invalidInput("Enter your password.") }
                try accept(try await api.login(email: email, password: password))
                phase = .signedIn
                await loadRoom()
            case .signup:
                let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty, name.count <= 100 else { throw AuthFailure.invalidInput("Enter your name (up to 100 characters).") }
                try Self.validatePassword(password)
                try await api.register(name: name, email: email, password: password)
                phase = .verification
            case .forgot:
                try await api.forgotPassword(email: email)
                accountMode = .reset
                notice = "Enter the six-digit code from your email and choose a new password."
            case .reset:
                try Self.validatePassword(password)
                guard otp.count == 6, otp.allSatisfy(\.isNumber) else { throw AuthFailure.invalidInput("Enter the six-digit code from your email.") }
                try await api.resetPassword(email: email, otp: otp, password: password)
                accountMode = .login
                notice = "Your password is updated. You can now log in."
            }
            return true
        } catch {
            if case AuthFailure.response(_, let message) = error, message.hasPrefix("UNVERIFIED_EMAIL:") {
                phase = .verification
            } else if case AuthFailure.response(_, let message) = error, message.hasPrefix("GOOGLE_AUTH_SETUP_PASSWORD:") {
                accountMode = .reset
                notice = "Use the code sent to your email to set a password for your Google account."
            } else { errorMessage = Self.message(for: error) }
            return false
        }
    }

    static func validatePassword(_ password: String) throws {
        guard (8...128).contains(password.count) else { throw AuthFailure.invalidInput("Use a password between 8 and 128 characters.") }
    }

    func signInWithGoogle() async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            let credential = try await google.signIn()
            try accept(try await api.google(credential: credential))
            phase = .signedIn
            await loadRoom()
        } catch AuthFailure.cancelled { }
        catch { errorMessage = Self.message(for: error) }
    }

    private func accept(_ response: AuthSession) throws {
        guard !response.token.isEmpty else { throw AuthFailure.invalidResponse }
        try store.save(response.token)
        token = response.token
        account = response.user
        roomID = response.defaultRoomId
    }

    func loadRoom() async {
        guard roomID == nil, let token, !isLoadingRoom else { return }
        isLoadingRoom = true
        defer { isLoadingRoom = false }
        do { roomID = try await api.room(token: token); errorMessage = nil }
        catch { errorMessage = Self.message(for: error) }
    }

    func resendVerification() async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do { try await api.resendVerification(email: email); notice = "A new verification link has been sent." }
        catch { errorMessage = Self.message(for: error) }
    }

    func signOut() {
        do {
            try store.clear()
            token = nil
            account = nil
            roomID = nil
            restorationError = nil
            enterAccount()
        } catch { errorMessage = Self.message(for: error) }
    }

    private static func message(for error: Error) -> String {
        if let urlError = error as? URLError {
            if urlError.code == .timedOut { return "The connection timed out. Please try again." }
            if urlError.code == .cancelled { return "The request was cancelled." }
            return "Couldn't connect to SyncBeats. Check your connection and try again."
        }
        return error.localizedDescription
    }
}
