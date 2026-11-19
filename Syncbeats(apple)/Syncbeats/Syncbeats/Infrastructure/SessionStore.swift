import Foundation
import Security

protocol SessionPersisting {
    func read() throws -> String?
    func save(_ token: String) throws
    func clear() throws
}

struct KeychainSessionStore: SessionPersisting {
    let service: String
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: "session"]
    }
    private func check(_ status: OSStatus) throws {
        guard status == errSecSuccess else {
            throw AuthFailure.invalidInput("Couldn't access your saved sign-in. Please unlock your keychain and try again.")
        }
    }
    func read() throws -> String? {
        var attributes = query
        attributes[kSecReturnData as String] = true
        attributes[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(attributes as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        try check(status)
        guard let data = item as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            throw AuthFailure.invalidResponse
        }
        return token
    }
    func save(_ token: String) throws {
        let attributes = [kSecValueData as String: Data(token.utf8)]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = Data(token.utf8)
            insert[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            try check(SecItemAdd(insert as CFDictionary, nil))
        } else { try check(status) }
    }
    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecItemNotFound { try check(status) }
    }
}
