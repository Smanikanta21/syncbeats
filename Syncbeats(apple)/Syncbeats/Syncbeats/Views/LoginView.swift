import SwiftUI

private enum AuthMode: String, CaseIterable, Identifiable {
    case login = "Sign In"
    case register = "Create Account"
    case reset = "Reset Password"
    case verifyOtp = "Set Password"

    var id: String { rawValue }

    var subtitle: String {
        switch self {
        case .login:    return "Listen together, in perfect sync."
        case .register: return "One account, every device."
        case .reset:    return "We'll email you a reset link."
        case .verifyOtp: return "Check your email for the OTP."
        }
    }
}

struct LoginView: View {
    @StateObject private var auth = AuthManager.shared

    @State private var mode: AuthMode = .login
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var otp = ""
    @State private var notice: String?
    @FocusState private var focused: Field?

    private enum Field { case name, email, password, confirm, otp }

    var body: some View {
        VStack(spacing: 22) {
            VStack(spacing: 6) {
                Image(systemName: "waveform")
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(.tint)
                Text("SyncBeats").font(.largeTitle.weight(.semibold))
                Text(mode.subtitle).font(.callout).foregroundStyle(.secondary)
            }

            Picker("", selection: $mode) {
                Text("Sign In").tag(AuthMode.login)
                Text("Sign Up").tag(AuthMode.register)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .opacity(mode == .reset || mode == .verifyOtp ? 0 : 1)
            .disabled(mode == .reset || mode == .verifyOtp)

            VStack(spacing: 12) {
                if mode == .register {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                        .focused($focused, equals: .name)
                }

                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .focused($focused, equals: .email)
                    #if !os(macOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    #endif

                if mode == .verifyOtp {
                    TextField("OTP", text: $otp)
                        .textContentType(.oneTimeCode)
                        .focused($focused, equals: .otp)
                }

                if mode != .reset {
                    SecureField(mode == .verifyOtp ? "New password" : "Password", text: $password)
                        .textContentType(mode == .register || mode == .verifyOtp ? .newPassword : .password)
                        .focused($focused, equals: .password)

                    if mode == .register || mode == .verifyOtp {
                        SecureField("Confirm password", text: $confirmPassword)
                            .textContentType(.newPassword)
                            .focused($focused, equals: .confirm)
                    }
                }
            }
            .textFieldStyle(.roundedBorder)
            .controlSize(.large)
            .onSubmit(submit)

            if let message = auth.authError {
                Label(message, systemImage: "exclamationmark.circle.fill")
                    .foregroundStyle(.red)
                    .font(.callout)
            }
            if let notice {
                Label(notice, systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .font(.callout)
            }

            Button(action: submit) {
                if auth.isLoading {
                    ProgressView().controlSize(.small)
                        .frame(maxWidth: .infinity)
                } else {
                    Text(mode.rawValue).frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .keyboardShortcut(.defaultAction)
            .disabled(auth.isLoading || !isValid)

            Button(mode == .reset || mode == .verifyOtp ? "Back to sign in" : "Forgot your password?") {
                switchTo(mode == .reset || mode == .verifyOtp ? .login : .reset)
            }
            .buttonStyle(.link)
            .font(.callout)
        }
        .padding(34)
        .frame(width: 380)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(colors: [.accentColor.opacity(0.22), .clear], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .animation(.snappy, value: mode)
        .onAppear { focused = .email }
    }

    private var isValid: Bool {
        switch mode {
        case .login:    return email.contains("@") && !password.isEmpty
        case .reset:    return email.contains("@")
        case .register: return !name.isEmpty && email.contains("@")
            && password.count >= 8 && password == confirmPassword
        case .verifyOtp: return email.contains("@") && otp.count >= 6
            && password.count >= 8 && password == confirmPassword
        }
    }

    private func switchTo(_ next: AuthMode) {
        mode = next
        auth.authError = nil
        notice = nil
    }

    private func submit() {
        guard isValid, !auth.isLoading else { return }
        notice = nil

        Task {
            switch mode {
            case .login:
                await auth.login(email: email, password: password)
                if let err = auth.authError, err.contains("GOOGLE_AUTH_SETUP_PASSWORD") {
                    switchTo(.verifyOtp)
                    notice = "An OTP was sent to your email to set a local password."
                }
            case .register:
                if await auth.register(name: name, email: email, password: password) {
                    notice = "Account created. Check your email, then sign in."
                    password = ""
                    confirmPassword = ""
                    mode = .login
                }
            case .reset:
                if await auth.forgotPassword(email: email) {
                    notice = "Reset link sent to \(email)."
                }
            case .verifyOtp:
                if await auth.resetPassword(email: email, otp: otp, password: password) {
                    notice = "Password set successfully. You can now sign in."
                    password = ""
                    confirmPassword = ""
                    otp = ""
                    mode = .login
                }
            }
        }
    }
}
