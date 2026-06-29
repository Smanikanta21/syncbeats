import Foundation
import Combine
import SwiftUI

class AppState: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User? = nil
    
    init() {
        checkAuthStatus()
    }
    
    func checkAuthStatus() {
        if SessionManager.shared.token != nil {
            self.currentUser = SessionManager.shared.user
            self.isAuthenticated = true
        } else {
            self.isAuthenticated = false
        }
    }
    
    func login(user: User?, token: String) {
        SessionManager.shared.token = token
        SessionManager.shared.user = user
        self.currentUser = user
        self.isAuthenticated = true
        SocketManager.shared.registerDevice()
    }
    
    func logout() {
        SessionManager.shared.clearSession()
        self.currentUser = nil
        self.isAuthenticated = false
        SocketManager.shared.disconnect()
    }
}
