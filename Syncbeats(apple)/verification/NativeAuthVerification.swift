import Foundation

@MainActor
private final class MemoryStore: SessionPersisting {
    var token: String?
    var failSave = false
    init(_ token: String? = nil) { self.token = token }
    func read() throws -> String? { token }
    func save(_ token: String) throws {
        if failSave { throw AuthFailure.invalidInput("Keychain unavailable") }
        self.token = token
    }
    func clear() throws { token = nil }
}

/// Runs production API/model code over real local HTTP, with fictional account data.
@main
struct NativeAuthVerification {
    @MainActor static func main() async throws {
        let base = URL(string: "http://127.0.0.1:5169/auth-service")!
        let api = AuthAPI(baseURL: base, deviceID: "native-verification-device")
        let (initialData, _) = try await URLSession.shared.data(from: base.appendingPathComponent("__calls"))
        let initialCount = (try JSONSerialization.jsonObject(with: initialData) as! [[String: Any]]).count
        let suite = "SyncBeats.Verification." + UUID().uuidString
        let preferences = UserDefaults(suiteName: suite)!
        defer { preferences.removePersistentDomain(forName: suite) }
        var checks = 0
        func check(_ condition: Bool, _ label: String) throws {
            guard condition else { throw AuthFailure.invalidInput("FAILED: " + label) }
            checks += 1
            print("PASS: " + label)
        }
        func model(_ store: MemoryStore? = nil, api override: AuthAPI? = nil) -> AppModel {
            AppModel(api: override ?? api, store: store ?? MemoryStore(), preferences: preferences)
        }
        func login(_ model: AppModel, email: String) async -> Bool {
            model.enterAccount(.login)
            return await model.submit(name: "", email: email, password: "fictional-password")
        }

        let store = MemoryStore()
        let entry = model(store)
        await entry.start()
        entry.finishLaunch()
        try check(entry.phase == .introduction, "first launch enters introduction")
        entry.enterAccount()
        let nextLaunch = model()
        await nextLaunch.start()
        nextLaunch.finishLaunch()
        try check(nextLaunch.phase == .authentication && nextLaunch.account == nil,
                  "finishing introduction does not imply authentication")

        let success = await login(entry, email: " Listener@Example.Test ")
        try check(success && entry.phase == .signedIn && entry.account?.email == "listener@example.test"
                  && store.token == "native-valid" && entry.roomID == "512804", "login persists session and room")
        entry.signOut()
        try check(store.token == nil && entry.account == nil && entry.phase == .authentication, "sign-out clears session")

        let signupStore = MemoryStore()
        let signup = model(signupStore)
        signup.enterAccount(.signup)
        let registered = await signup.submit(name: "Native Listener", email: "new@example.test", password: "fictional-password")
        try check(registered && signup.phase == .verification && signupStore.token == nil, "signup requires email verification")
        await signup.resendVerification()
        try check(signup.notice != nil && signup.errorMessage == nil, "resend verification")

        let invalid = model()
        _ = await login(invalid, email: "wrong@example.test")
        try check(invalid.account == nil && invalid.errorMessage == "Invalid password", "invalid credentials remain signed out")
        _ = await login(invalid, email: "unverified@example.test")
        try check(invalid.phase == .verification && invalid.account == nil, "unverified login routes to verification")
        _ = await login(invalid, email: "setup@example.test")
        try check(invalid.accountMode == .reset && invalid.notice != nil, "Google account password setup uses OTP reset")
        invalid.enterAccount(.signup)
        _ = await invalid.submit(name: "Native Listener", email: "conflict@example.test", password: "fictional-password")
        try check(invalid.errorMessage == "Email already registered", "registration conflict is visible")
        _ = await login(invalid, email: "server-error@example.test")
        try check(invalid.errorMessage?.contains("temporarily unavailable") == true, "HTML server failure has a friendly message")

        invalid.enterAccount(.forgot)
        _ = await invalid.submit(name: "", email: "listener@example.test", password: "")
        try check(invalid.accountMode == .reset, "forgot password opens emailed code form")
        _ = await invalid.submit(name: "", email: "listener@example.test", password: "new-fictional-password", otp: "000000")
        try check(invalid.accountMode == .reset && invalid.errorMessage == "Invalid or expired OTP", "wrong reset code is rejected")
        _ = await invalid.submit(name: "", email: "listener@example.test", password: "new-fictional-password", otp: "123456")
        try check(invalid.accountMode == .login && invalid.notice?.contains("updated") == true, "valid reset returns to login")

        let restoredStore = MemoryStore("native-valid")
        let restored = model(restoredStore)
        await restored.start()
        restored.finishLaunch()
        try check(restored.phase == .signedIn && restored.roomID == "512804", "saved session restores and fetches permanent room")
        let outageStore = MemoryStore("server-down")
        let outage = model(outageStore)
        await outage.start()
        outage.finishLaunch()
        try check(outage.phase == .restoreFailed && outageStore.token == "server-down", "server outage preserves saved token")
        let expiredStore = MemoryStore("expired")
        let expired = model(expiredStore)
        await expired.start()
        expired.finishLaunch()
        try check(expired.phase == .authentication && expiredStore.token == nil, "definitively expired token is cleared")
        let failStore = MemoryStore()
        failStore.failSave = true
        let failModel = model(failStore)
        _ = await login(failModel, email: "listener@example.test")
        try check(failModel.phase != .signedIn && failModel.account == nil && failModel.errorMessage != nil,
                  "failed credential persistence does not report signed in")

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 0.5
        config.timeoutIntervalForResource = 1
        let timed = model(api: AuthAPI(baseURL: base, deviceID: "native-verification-device", session: URLSession(configuration: config)))
        let began = Date()
        _ = await login(timed, email: "timeout@example.test")
        try check(timed.account == nil && timed.errorMessage?.contains("timed out") == true && Date().timeIntervalSince(began) < 2,
                  "HTTP timeout returns without signing in")
        let googleResponse = try await api.google(credential: "fixture-google-token")
        try check(googleResponse.user.email == "google@example.test", "Google token exchanges using backend contract")

        let state = try GoogleSignIn.randomToken(), nonce = try GoogleSignIn.randomToken(), verifier = try GoogleSignIn.randomToken()
        let challenge = GoogleSignIn.challenge(for: verifier)
        let query = URLComponents(url: GoogleSignIn.authorizationURL(state: state, nonce: nonce, challenge: challenge), resolvingAgainstBaseURL: false)!.queryItems!
        try check(query.first { $0.name == "state" }?.value == state && query.first { $0.name == "code_challenge" }?.value == challenge, "Google browser request binds state and private PKCE verifier")
        let code = String(repeating: "a", count: 43)
        let callback = URL(string: "syncbeats://google/callback?state=\(state)&code=\(code)")!
        try check(try GoogleSignIn.code(from: callback, state: state) == code, "valid custom callback returns only an exchange code")
        for url in [URL(string: "syncbeats://google/callback?state=wrong&code=\(code)")!, URL(string: "https://other.example/?state=\(state)&code=\(code)")!, URL(string: "syncbeats://google/callback?state=\(state)&state=\(state)&code=\(code)")!] {
            var rejected = false
            do { _ = try GoogleSignIn.code(from: url, state: state) } catch { rejected = true }
            try check(rejected, "invalid Google callback rejected")
        }
        let keychain = KeychainSessionStore(service: suite)
        defer { try? keychain.clear() }
        try keychain.save("fictional-keychain-token")
        try check(try keychain.read() == "fictional-keychain-token", "native Keychain roundtrip")
        try keychain.clear()
        try check(try keychain.read() == nil, "native Keychain cleanup")

        // Inspect the stand-in's observation of real URLSession requests.
        let (data, _) = try await URLSession.shared.data(from: base.appendingPathComponent("__calls"))
        let calls = Array((try JSONSerialization.jsonObject(with: data) as! [[String: Any]]).dropFirst(initialCount))
        try check(calls.allSatisfy { $0["hasDeviceID"] as? Bool == true }, "device identity is sent on every API request")
        try check(calls.filter { $0["path"] as? String == "/auth/me" }.allSatisfy { $0["hasBearer"] as? Bool == true }, "session restoration uses bearer authentication")
        try check(calls.filter { $0["path"] as? String == "/auth/login" }.count == 7, "seven login attempts produce seven requests with no automatic retries")
        print("\(checks) checks passed against the local stand-in; live providers were not exercised.")
    }
}
