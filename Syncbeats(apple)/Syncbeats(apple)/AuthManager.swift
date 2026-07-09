import Foundation
import Security
import Combine

class AuthManager: ObservableObject {
    static let shared = AuthManager()
    
    @Published var isAuthenticated: Bool = false
    @Published var appToken: String? = nil
    @Published var ytToken: String? = nil
    
    var userId: String? {
        return extractClaim(key: "sub")
    }
    
    var userName: String? {
        return extractClaim(key: "name")
    }
    
    private func extractClaim(key: String) -> String? {
        guard let token = appToken else { return nil }
        let segments = token.components(separatedBy: ".")
        guard segments.count > 1 else { return nil }
        
        var base64String = segments[1]
        let requiredLength = Int(4 * ceil(Double(base64String.count) / 4.0))
        let paddingLength = requiredLength - base64String.count
        if paddingLength > 0 {
            let padding = String(repeating: "=", count: paddingLength)
            base64String += padding
        }
        
        base64String = base64String.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        
        guard let data = Data(base64Encoded: base64String),
              let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
              let value = json[key] as? String else {
            return nil
        }
        return value
    }
    
    private let appTokenKey = "com.syncbeats.appToken"
    private let ytTokenKey = "com.syncbeats.ytToken"
    
    private init() {
        // On initialization, check if we already have tokens saved
        if let savedAppToken = loadToken(forKey: appTokenKey) {
            self.appToken = savedAppToken
            self.isAuthenticated = true
        }
        if let savedYtToken = loadToken(forKey: ytTokenKey) {
            self.ytToken = savedYtToken
        }
    }
    
    // MARK: - Deep Link Handling
    
    func handleDeepLink(_ url: URL) {
        guard url.scheme == "syncbeats", url.host == "auth" else { return }
        
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        
        // 1. Check for standard query items (SyncBeats Auth token)
        if let queryItems = components.queryItems,
           let tokenItem = queryItems.first(where: { $0.name == "token" }),
           let token = tokenItem.value {
            print("Successfully received appToken from deep link!")
            saveToken(token, forKey: appTokenKey)
            
            DispatchQueue.main.async {
                self.appToken = token
                self.isAuthenticated = true
            }
        }
        
        // 2. Check for YouTube OAuth token in the URL Hash Fragment (e.g. #access_token=XYZ)
        if let fragment = components.fragment {
            let params = fragment.components(separatedBy: "&")
            for param in params {
                let parts = param.components(separatedBy: "=")
                if parts.count == 2, parts[0] == "access_token" {
                    let ytVal = parts[1]
                    print("Successfully received YouTube access_token from deep link fragment!")
                    saveToken(ytVal, forKey: ytTokenKey)
                    
                    DispatchQueue.main.async {
                        self.ytToken = ytVal
                    }
                }
            }
        }
    }
    
    // MARK: - Keychain Operations
    
    func saveToken(_ token: String, forKey key: String) {
        guard let data = token.data(using: .utf8) else { return }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        
        // Delete any existing token first
        SecItemDelete(query as CFDictionary)
        
        // Add new token
        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            print("Failed to save token to Keychain: \(status)")
        }
    }
    
    func loadToken(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        
        if status == errSecSuccess, let data = dataTypeRef as? Data {
            return String(data: data, encoding: .utf8)
        }
        return nil
    }
    
    func logout() {
        let appQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: appTokenKey
        ]
        SecItemDelete(appQuery as CFDictionary)
        
        let ytQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: ytTokenKey
        ]
        SecItemDelete(ytQuery as CFDictionary)
        
        DispatchQueue.main.async {
            self.appToken = nil
            self.ytToken = nil
            self.isAuthenticated = false
        }
    }
}
