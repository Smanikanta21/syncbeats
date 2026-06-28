import Foundation

class SessionManager {
    static let shared = SessionManager()
    
    private let tokenKey = "auth_token"
    private let userKey = "current_user"
    private let deviceIdKey = "device_id"
    
    var token: String? {
        get { UserDefaults.standard.string(forKey: tokenKey) }
        set { UserDefaults.standard.set(newValue, forKey: tokenKey) }
    }
    
    var user: User? {
        get {
            if let data = UserDefaults.standard.data(forKey: userKey),
               let decoded = try? JSONDecoder().decode(User.self, from: data) {
                return decoded
            }
            
            // Fallback: extract from JWT
            guard let token = self.token else { return nil }
            let parts = token.split(separator: ".")
            guard parts.count == 3 else { return nil }
            
            var base64Url = String(parts[1])
            base64Url = base64Url.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
            while base64Url.count % 4 != 0 {
                base64Url.append("=")
            }
            
            guard let payloadData = Data(base64Encoded: base64Url),
                  let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                  let id = json["sub"] as? String,
                  let name = json["name"] as? String,
                  let email = json["email"] as? String else {
                return nil
            }
            
            let user = User(id: id, name: name, email: email)
            self.user = user // Cache it
            return user
        }
        set {
            if let data = try? JSONEncoder().encode(newValue) {
                UserDefaults.standard.set(data, forKey: userKey)
            } else {
                UserDefaults.standard.removeObject(forKey: userKey)
            }
        }
    }
    
    var deviceId: String {
        get {
            #if targetEnvironment(macCatalyst)
            let prefix = "MAC-"
            #elseif os(macOS)
            let prefix = "MAC-"
            #elseif os(iOS)
            let prefix = "IOS-"
            #else
            let prefix = "APP-"
            #endif
            
            if let id = UserDefaults.standard.string(forKey: deviceIdKey) {
                if id.hasPrefix("APP-") {
                    // Migrate from APP- to specific OS prefix
                    let newId = id.replacingOccurrences(of: "APP-", with: prefix)
                    UserDefaults.standard.set(newId, forKey: deviceIdKey)
                    return newId
                } else if !id.hasPrefix(prefix) {
                    // It's a raw UUID (which contains hyphens) but has no known prefix.
                    let newId = "\(prefix)\(id)"
                    UserDefaults.standard.set(newId, forKey: deviceIdKey)
                    return newId
                }
                return id
            }
            let newId = "\(prefix)\(UUID().uuidString)"
            UserDefaults.standard.set(newId, forKey: deviceIdKey)
            return newId
        }
    }
    
    func clearSession() {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        UserDefaults.standard.removeObject(forKey: userKey)
    }
}
