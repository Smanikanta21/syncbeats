import Foundation

final class DeviceIdentity {
    static let shared = DeviceIdentity()
    private let keychainKey = "dev.syncbeats.device-id"

    /// Cached after first resolve — `id` is read on every API request (for the
    /// `X-Device-Id` header), so we avoid a Keychain round-trip each time.
    private var cached: String?

    var id: String {
        if let cached { return cached }
        if let existing = Keychain.get(account: keychainKey) {
            cached = existing
            return existing
        }
        let newID = "mac-" + UUID().uuidString.lowercased()
        Keychain.set(newID, account: keychainKey)
        cached = newID
        return newID
    }
}
