import Foundation
import Security

/// Thin, typed wrapper around the macOS Keychain for the app's small secrets
/// (auth token, device id). Centralizes two attributes that the old ad-hoc
/// queries omitted:
///
///  - `kSecAttrService`: namespaces our items so accounts can't collide with
///    other generic-password items on the system.
///  - `kSecAttrAccessible = AfterFirstUnlock`: the item is readable after the
///    first unlock following a boot (so background/relaunch reads work) but is
///    NOT included in unencrypted iTunes/Finder backups and never leaves the
///    device.
///
/// We deliberately do NOT store passwords here — only the revocable JWT and the
/// device identifier. The token is what keeps the user signed in; the password
/// is discarded after login.
enum Keychain {
    /// Service namespace shared by all SyncBeats Keychain items.
    private static let service = "app.syncbeats.macos"

    @discardableResult
    static func set(_ value: String, account: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }

        // Delete any existing item for this (service, account) first so we
        // always write a clean value with the current accessibility class.
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)

        var attributes = base
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        return SecItemAdd(attributes as CFDictionary, nil) == errSecSuccess
    }

    static func get(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var ref: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &ref) == errSecSuccess,
              let data = ref as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    @discardableResult
    static func delete(account: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
