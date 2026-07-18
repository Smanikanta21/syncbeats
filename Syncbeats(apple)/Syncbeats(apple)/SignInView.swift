import SwiftUI

// MARK: - Mode

private enum AuthMode: String, CaseIterable {
    case signIn = "Sign In"
    case signUp = "Create Account"
}

/// Root auth screen. Hosts the segmented Sign In / Create Account flows, the
/// Google button, and the post-registration "verify your email" state.
struct SignInView: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.colorScheme) private var scheme

    @State private var mode: AuthMode = .signIn
    @Namespace private var segment

    // Form fields (shared across modes; name/confirm only used for sign up).
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirmPassword = ""

    @State private var error: AuthError?
    @State private var isLoading = false
    @State private var isGoogleLoading = false

    // Post-register success: we sent a verification email.
    @State private var pendingVerificationEmail: String?
    @State private var resendState: ResendState = .idle

    private enum ResendState: Equatable { case idle, sending, sent }

    var body: some View {
        ZStack {
            Theme.Colors.background(for: scheme).ignoresSafeArea()

            Group {
                if let verifyEmail = pendingVerificationEmail {
                    VerifyEmailView(
                        email: verifyEmail,
                        isResending: resendState == .sending,
                        didResend: resendState == .sent,
                        onResend: resendVerification,
                        onBack: backToSignIn
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing).combined(with: .opacity),
                        removal: .move(edge: .leading).combined(with: .opacity)
                    ))
                } else {
                    formStack
                        .transition(.opacity)
                }
            }
            .animation(.spring(response: 0.42, dampingFraction: 0.82), value: pendingVerificationEmail)
        }
        .frame(width: 460, height: 620)
    }

    // MARK: - Main form

    private var formStack: some View {
        VStack(spacing: Theme.Spacing.sectionGap) {
            LogoLockup()
                .padding(.top, 40)

            segmentedControl
                .frame(width: 300)

            VStack(spacing: Theme.Spacing.rowGap) {
                if mode == .signUp {
                    AuthField(
                        icon: "person",
                        placeholder: "Name",
                        text: $name,
                        validity: name.trimmed.isEmpty ? .neutral : .valid
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
                }

                AuthField(
                    icon: "envelope",
                    placeholder: "Email address",
                    text: $email,
                    isEmail: true,
                    validity: emailValidity
                )

                AuthField(
                    icon: "lock",
                    placeholder: "Password",
                    text: $password,
                    isSecure: true,
                    footnote: mode == .signUp ? passwordHint : nil,
                    validity: passwordValidity
                )

                if mode == .signUp {
                    AuthField(
                        icon: "lock.fill",
                        placeholder: "Confirm password",
                        text: $confirmPassword,
                        isSecure: true,
                        validity: confirmValidity
                    )
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
                }

                if let error {
                    AuthErrorBanner(error: error) { action in
                        handleErrorAction(action)
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                primaryButton
                    .padding(.top, 4)

                orDivider

                GoogleButton(isLoading: isGoogleLoading, action: signInWithBrowser)
            }
            .frame(width: 300)
            .animation(.spring(response: 0.4, dampingFraction: 0.8), value: mode)
            .animation(.spring(response: 0.35, dampingFraction: 0.85), value: error)

            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.containerPadding)
    }

    private var segmentedControl: some View {
        HStack(spacing: 0) {
            ForEach(AuthMode.allCases, id: \.self) { item in
                let selected = mode == item
                Text(item.rawValue)
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundColor(selected
                        ? (scheme == .dark ? .black : .white)
                        : Theme.Colors.textMuted(for: scheme))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background {
                        if selected {
                            RoundedRectangle(cornerRadius: Theme.Radius.pillBadge)
                                .fill(Theme.Colors.primaryAccent(for: scheme))
                                .matchedGeometryEffect(id: "segment", in: segment)
                        }
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.78)) {
                            mode = item
                            error = nil
                            confirmPassword = ""
                        }
                    }
            }
        }
        .padding(4)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.pillBadge + 4))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.pillBadge + 4)
                .stroke(Theme.Colors.glassBorder(for: scheme), lineWidth: 1)
        )
    }

    private var primaryButton: some View {
        Button(action: submit) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView().controlSize(.small)
                }
                Text(mode == .signIn ? "Sign In" : "Create Account")
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(MonochromePrimaryButtonStyle())
        .disabled(isLoading || !isFormValid)
        .opacity(isFormValid ? 1 : 0.5)
    }

    private var orDivider: some View {
        HStack(spacing: 12) {
            line
            Text("or").font(.system(size: 11, weight: .medium)).foregroundColor(Theme.Colors.textMuted(for: scheme))
            line
        }
    }

    private var line: some View {
        Rectangle().fill(Theme.Colors.glassBorder(for: scheme)).frame(height: 1)
    }

    private var passwordHint: String {
        password.isEmpty || password.count >= 8 ? "At least 8 characters" : "\(8 - password.count) more character(s) needed"
    }

    // MARK: - Validation

    /// A field turns green only once its own rule is satisfied.
    private var emailIsValid: Bool { email.contains("@") && email.contains(".") }

    private var emailValidity: FieldValidity {
        email.isEmpty ? .neutral : (emailIsValid ? .valid : .neutral)
    }

    /// On sign-in any non-empty password is accepted; on sign-up it must be ≥8.
    private var passwordValidity: FieldValidity {
        if password.isEmpty { return .neutral }
        switch mode {
        case .signIn: return .valid
        case .signUp: return password.count >= 8 ? .valid : .neutral
        }
    }

    /// Green only when the confirmation is non-empty AND matches a valid password.
    private var confirmValidity: FieldValidity {
        guard !confirmPassword.isEmpty else { return .neutral }
        if password.count >= 8 && confirmPassword == password { return .valid }
        return .invalid
    }

    private var isFormValid: Bool {
        switch mode {
        case .signIn:
            return emailIsValid && !password.isEmpty
        case .signUp:
            return emailIsValid
                && !name.trimmed.isEmpty
                && password.count >= 8
                && confirmPassword == password
        }
    }

    // MARK: - Actions

    private func submit() {
        isLoading = true
        error = nil
        Task {
            let result: AuthError?
            switch mode {
            case .signIn:
                result = await authStore.login(email: email, password: password)
            case .signUp:
                result = await authStore.register(name: name, email: email, password: password)
            }
            await MainActor.run {
                isLoading = false
                if let result {
                    error = result
                } else if mode == .signUp {
                    // Registration succeeded → verification email sent.
                    pendingVerificationEmail = email.trimmed
                    resendState = .idle
                }
                // Sign-in success flips AuthStore.state; the App swaps the scene.
            }
        }
    }

    private func signInWithBrowser() {
        isGoogleLoading = true
        error = nil
        Task {
            let result = await authStore.signInWithBrowser()
            await MainActor.run {
                isGoogleLoading = false
                if let result { error = result }
            }
        }
    }

    private func handleErrorAction(_ action: AuthErrorBanner.Action) {
        switch action {
        case .resendVerification:
            pendingVerificationEmail = email.trimmed
            resendState = .idle
        case .useGoogle:
            signInWithBrowser()
        }
    }

    private func resendVerification() {
        guard let email = pendingVerificationEmail else { return }
        resendState = .sending
        Task {
            let ok = await authStore.resendVerification(email: email)
            await MainActor.run { resendState = ok ? .sent : .idle }
        }
    }

    private func backToSignIn() {
        pendingVerificationEmail = nil
        mode = .signIn
        password = ""
        confirmPassword = ""
        error = nil
    }
}

// MARK: - Verify email state

private struct VerifyEmailView: View {
    @Environment(\.colorScheme) private var scheme
    let email: String
    let isResending: Bool
    let didResend: Bool
    let onResend: () -> Void
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: Theme.Spacing.sectionGap) {
            LogoLockup().padding(.top, 40)

            VStack(spacing: 16) {
                Image(systemName: "envelope.badge")
                    .font(.system(size: 44, weight: .light))
                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
                    .symbolRenderingMode(.hierarchical)

                Text("Check your inbox")
                    .font(Theme.Fonts.headline(size: 22))
                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))

                Text("We sent a verification link to")
                    .font(Theme.Fonts.body(size: 13))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))

                Text(email)
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))

                Text("Click the link to activate your account, then come back here to sign in.")
                    .font(Theme.Fonts.body(size: 12))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .padding(.top, 4)
            }
            .frame(width: 320)

            VStack(spacing: Theme.Spacing.rowGap) {
                Button(action: onResend) {
                    HStack(spacing: 8) {
                        if isResending { ProgressView().controlSize(.small) }
                        Text(didResend ? "Email sent ✓" : "Resend email")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(MonochromeSecondaryButtonStyle())
                .disabled(isResending || didResend)

                Button("Back to sign in", action: onBack)
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
            }
            .frame(width: 300)

            Spacer(minLength: 0)
        }
        .padding(Theme.Spacing.containerPadding)
    }
}

// MARK: - Reusable field

/// Per-field validation state that drives the input's border color.
enum FieldValidity {
    case neutral   // untouched / incomplete → theme border
    case valid     // rule satisfied → green
    case invalid   // actively wrong (e.g. passwords don't match) → red
}

private struct AuthField: View {
    @Environment(\.colorScheme) private var scheme
    let icon: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var isEmail: Bool = false
    var footnote: String? = nil
    var validity: FieldValidity = .neutral

    @State private var revealPassword = false
    @FocusState private var focused: Bool

    private var accentColor: Color {
        Color(red: 0.20, green: 0.78, blue: 0.35) // system-green-ish
    }

    /// Resolved border color: validity wins when set, otherwise focus/theme.
    private var borderColor: Color {
        switch validity {
        case .valid:   return accentColor.opacity(0.9)
        case .invalid: return .red.opacity(0.8)
        case .neutral:
            return focused ? Theme.Colors.primaryAccent(for: scheme).opacity(0.5)
                           : Theme.Colors.glassBorder(for: scheme)
        }
    }

    private var borderWidth: CGFloat {
        validity == .valid || validity == .invalid ? 1.5 : 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundColor(validity == .valid ? accentColor : Theme.Colors.textMuted(for: scheme))
                    .frame(width: 16)
                    .animation(.easeOut(duration: 0.2), value: validity)

                Group {
                    if isSecure && !revealPassword {
                        SecureField(placeholder, text: $text)
                    } else {
                        TextField(placeholder, text: $text)
                    }
                }
                .textFieldStyle(.plain)
                .font(Theme.Fonts.body(size: 14))
                .focused($focused)
                .disableAutocorrection(true)

                if validity == .valid {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 13))
                        .foregroundColor(accentColor)
                        .transition(.scale.combined(with: .opacity))
                }

                if isSecure {
                    Button {
                        revealPassword.toggle()
                    } label: {
                        Image(systemName: revealPassword ? "eye.slash" : "eye")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 11)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: Theme.Radius.pillBadge + 2))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.pillBadge + 2)
                    .stroke(borderColor, lineWidth: borderWidth)
            )
            .shadow(color: validity == .valid ? accentColor.opacity(0.25) : .clear, radius: 6)
            .animation(.easeOut(duration: 0.2), value: validity)
            .animation(.easeOut(duration: 0.15), value: focused)

            if let footnote {
                Text(footnote)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(Theme.Colors.textMuted(for: scheme))
                    .padding(.leading, 4)
            }
        }
    }
}

// MARK: - Error banner (with recovery actions)

private struct AuthErrorBanner: View {
    @Environment(\.colorScheme) private var scheme
    let error: AuthError
    let onAction: (Action) -> Void

    enum Action { case resendVerification, useGoogle }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: iconName)
                    .font(.system(size: 12, weight: .semibold))
                Text(error.displayText)
                    .font(.system(size: 12))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .foregroundColor(tint)

            if let (label, action) = recovery {
                Button(label) { onAction(action) }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryAccent(for: scheme))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: Theme.Radius.pillBadge))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.pillBadge)
                .stroke(tint.opacity(0.25), lineWidth: 1)
        )
    }

    private var iconName: String {
        switch error {
        case .unverifiedEmail: return "envelope.badge"
        case .googleAccount:   return "g.circle"
        case .network:         return "wifi.exclamationmark"
        case .message:         return "exclamationmark.triangle"
        }
    }

    private var tint: Color {
        switch error {
        case .unverifiedEmail, .googleAccount: return .orange
        default: return .red
        }
    }

    private var recovery: (String, Action)? {
        switch error {
        case .unverifiedEmail: return ("Resend verification email", .resendVerification)
        case .googleAccount:   return ("Continue with Google", .useGoogle)
        default: return nil
        }
    }
}

// MARK: - Google button

private struct GoogleButton: View {
    @Environment(\.colorScheme) private var scheme
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Text("G")
                        .font(.system(size: 15, weight: .bold, design: .serif))
                        .foregroundStyle(
                            LinearGradient(colors: [.blue, .red, .yellow, .green],
                                           startPoint: .leading, endPoint: .trailing)
                        )
                }
                Text("Continue with Google")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(MonochromeSecondaryButtonStyle())
        .disabled(isLoading)
    }
}

// MARK: - Logo

private struct LogoLockup: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        VStack(spacing: Theme.Spacing.rowGap) {
            RoundedRectangle(cornerRadius: Theme.Radius.card)
                .fill(LinearGradient(colors: [Color(white: 0.1), Color(white: 0.02)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 64, height: 64)
                .overlay(
                    HStack(spacing: 3) {
                        RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: 3, height: 16)
                        RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: 3, height: 24)
                        RoundedRectangle(cornerRadius: 1).fill(.white).frame(width: 3, height: 12)
                    }
                )

            HStack(spacing: 0) {
                Text("SYNC")
                    .font(.system(size: 24, weight: .black))
                    .foregroundColor(scheme == .dark ? .white : .black)
                    .tracking(-1)
                Text("BEATS")
                    .font(.system(size: 24, weight: .black))
                    .foregroundColor(.gray)
                    .tracking(-1)
            }
        }
    }
}

#Preview {
    SignInView()
        .environment(AuthStore())
}
