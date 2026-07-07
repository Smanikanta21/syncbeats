import SwiftUI

struct AuthView: View {
    @EnvironmentObject var appState: AppState
    @State private var isLogin = true
    
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage = ""
    @State private var isLoading = false
    
    var body: some View {
        ZStack {
            // Keep the same animated background as Intro
            LinearGradient(
                colors: [Color(red: 0.1, green: 0, blue: 0.2), Theme.background, Color(red: 0, green: 0.1, blue: 0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()
            
            VStack {
                // Back button
                HStack {
                    Button(action: {
                        withAnimation(.spring()) {
                            appState.currentScreen = .intro
                        }
                    }) {
                        Image(systemName: "chevron.left")
                            .font(.title2)
                            .foregroundColor(Theme.foreground)
                            .padding()
                    }
                    .buttonStyle(PlainButtonStyle())
                    Spacer()
                }
                
                Spacer()
                
                // Auth Form (Glass Panel)
                VStack(spacing: 24) {
                    Text(isLogin ? "Welcome Back" : "Create Account")
                        .font(.largeTitle)
                        .fontWeight(.bold)
                        .foregroundColor(Theme.foreground)
                    
                    VStack(spacing: 16) {
                        TextField("Email", text: $email)
                            .textFieldStyle(.plain)
                            .modifier(GlassInputModifier())
                        
                        SecureField("Password", text: $password)
                            .textFieldStyle(.plain)
                            .modifier(GlassInputModifier())
                        
                        if !isLogin {
                            SecureField("Confirm Password", text: $confirmPassword)
                                .textFieldStyle(.plain)
                                .modifier(GlassInputModifier())
                                .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    
                    if !errorMessage.isEmpty {
                        Text(errorMessage)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                    
                    Button(action: {
                        isLoading = true
                        errorMessage = ""
                        
                        if isLogin {
                            NetworkManager.shared.login(email: email, password: password) { success, error in
                                isLoading = false
                                if success {
                                    withAnimation(.spring()) { appState.currentScreen = .main }
                                } else {
                                    errorMessage = error ?? "Failed to log in"
                                }
                            }
                        } else {
                            if password != confirmPassword {
                                errorMessage = "Passwords do not match"
                                isLoading = false
                                return
                            }
                            NetworkManager.shared.signup(email: email, password: password) { success, error in
                                isLoading = false
                                if success {
                                    withAnimation(.spring()) { appState.currentScreen = .main }
                                } else {
                                    errorMessage = error ?? "Failed to sign up"
                                }
                            }
                        }
                    }) {
                        if isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle())
                        } else {
                            Text(isLogin ? "Log In" : "Sign Up")
                                .font(.headline)
                                .foregroundColor(.black)
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Theme.foreground)
                                .cornerRadius(8)
                        }
                    }
                    .buttonStyle(PlainButtonStyle())
                    .padding(.top, 8)
                    
                    Button(action: {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            isLogin.toggle()
                            email = ""
                            password = ""
                            confirmPassword = ""
                        }
                    }) {
                        Text(isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in")
                            .font(.subheadline)
                            .foregroundColor(Theme.foreground.opacity(0.8))
                    }
                    .buttonStyle(PlainButtonStyle())
                }
                .padding(40)
                .glassPanel() // Using our custom modifier!
                .frame(maxWidth: 400)
                
                Spacer()
            }
        }
    }
}

struct GlassInputModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(Color.white.opacity(0.05))
            .cornerRadius(8)
            .foregroundColor(Theme.foreground)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
            )
    }
}

struct AuthView_Previews: PreviewProvider {
    static var previews: some View {
        AuthView()
            .environmentObject(AppState())
            .frame(width: 800, height: 600)
    }
}
